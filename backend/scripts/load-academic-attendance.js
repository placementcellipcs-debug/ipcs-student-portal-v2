const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { parseSourceDateTime } = require('../utils/sourceDateTime');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const compact = value => normalized(value).replace(/[^a-z0-9]/g, '');
const rollKey = value => normalized(value).replace(/\s+/g, '');

function makeId(scope, key) {
  const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fieldsOf(row) {
  const data = typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
  return data?.fields || {};
}

function fieldValue(fields, ...aliases) {
  const wanted = new Set(aliases.map(compact));
  for (const [key, value] of Object.entries(fields || {})) {
    if (wanted.has(compact(key))) return value;
  }
  return '';
}

function safeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).filter(([key]) => !/password|secret|token/i.test(key)));
}

function uniqueMap(rows, keySelector) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!key) continue;
    const items = buckets.get(key) || [];
    items.push(row);
    buckets.set(key, items);
  }
  return new Map([...buckets].filter(([, items]) => items.length === 1).map(([key, items]) => [key, items[0]]));
}

function parsedDate(value) {
  return parseSourceDateTime(value)?.slice(0, 10) || null;
}

function batches(rows, size) {
  const result = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [[run]] = await connection.execute("SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1");
    if (run?.status !== 'completed') throw new Error('Import and verify the source-sheet archive before migrating academic attendance.');
    const [sourceRows] = await connection.execute(
      `SELECT sheet_row_number, row_data_json FROM source_sheet_records
       WHERE source_key = 'shared_learning' AND tab_name = 'Attendance'
       ORDER BY sheet_row_number`,
    );
    const [students, branches, courses] = await Promise.all([
      connection.execute('SELECT id, normalized_roll_number FROM student_profiles').then(([rows]) => rows),
      connection.execute('SELECT id, normalized_name FROM branches').then(([rows]) => rows),
      connection.execute('SELECT id, normalized_name FROM courses').then(([rows]) => rows),
    ]);
    const studentByRoll = uniqueMap(students, row => rollKey(row.normalized_roll_number));
    const branchByName = new Map(branches.map(row => [normalized(row.normalized_name), row.id]));
    const courseByName = new Map(courses.map(row => [normalized(row.normalized_name), row.id]));
    const candidates = sourceRows.map(row => {
      const fields = fieldsOf(row);
      const sourceStudentId = text(fieldValue(fields, 'Student ID', 'Student Id', 'StudentID', 'Roll Number', 'Roll No', 'IPCS Roll Number'));
      const branchName = text(fieldValue(fields, 'Branch', 'Sitting Branch'));
      const mainCourse = text(fieldValue(fields, 'Main Course', 'Course', 'Program'));
      const sourceDate = fieldValue(fields, 'Date', 'Attendance Date');
      const attendanceDate = parsedDate(sourceDate);
      return {
        id: makeId('academic-attendance', `shared_learning:Attendance:${row.sheet_row_number}`),
        sourceKey: 'shared_learning',
        sourceTab: 'Attendance',
        sourceRowNumber: Number(row.sheet_row_number),
        attendanceId: text(fieldValue(fields, 'Attendance ID', 'Attendance Id', 'AttendanceID', 'Record ID')).slice(0, 160) || null,
        sessionId: text(fieldValue(fields, 'Session ID', 'Session Id', 'SessionID')).slice(0, 160) || null,
        trainingId: text(fieldValue(fields, 'Training ID', 'Training Id', 'TrainingID')).slice(0, 160) || null,
        studentProfileId: studentByRoll.get(rollKey(sourceStudentId))?.id || null,
        sourceStudentId: sourceStudentId.slice(0, 160) || null,
        studentName: text(fieldValue(fields, 'Student Name', 'Name')).slice(0, 200) || null,
        courseId: courseByName.get(normalized(mainCourse)) || null,
        mainCourse: mainCourse.slice(0, 200) || null,
        subCourse: text(fieldValue(fields, 'Sub Course', 'Specialization')).slice(0, 200) || null,
        branchId: branchByName.get(normalized(branchName)) || null,
        branchName: branchName.slice(0, 160) || null,
        attendanceDate,
        attendanceStatus: text(fieldValue(fields, 'Attendance Status', 'Status')).slice(0, 80) || null,
        markingMethod: text(fieldValue(fields, 'Marking Method')).slice(0, 120) || null,
        verified: text(fieldValue(fields, 'Verified')).slice(0, 40) || null,
        verifiedBy: text(fieldValue(fields, 'Verified By')).slice(0, 200) || null,
        remarks: text(fieldValue(fields, 'Remarks')) || null,
        metadata: JSON.stringify({ sourceRow: Number(row.sheet_row_number), fields: safeFields(fields) }),
      };
    });
    const report = {
      mode: apply ? 'apply' : 'preview',
      sourceTabRows: sourceRows.length,
      matchedStudentProfiles: candidates.filter(row => row.studentProfileId).length,
      unlinkedStudentIdentitiesRetained: candidates.filter(row => !row.studentProfileId).length,
      linkedBranches: candidates.filter(row => row.branchId).length,
      linkedCourses: candidates.filter(row => row.courseId).length,
      rowsWithValidAttendanceDate: candidates.filter(row => row.attendanceDate).length,
      rowsWithoutValidAttendanceDate: candidates.filter(row => !row.attendanceDate).length,
      distinctSourceRows: new Set(candidates.map(row => row.sourceRowNumber)).size,
    };
    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      console.log('Preview only. No records were written; unmatched student IDs are retained without guessing.');
      return;
    }

    await connection.beginTransaction();
    const columns = [
      'id', 'source_key', 'source_tab', 'source_row_number', 'attendance_id', 'session_id', 'training_id',
      'student_profile_id', 'source_student_id', 'student_name', 'course_id', 'main_course', 'sub_course',
      'branch_id', 'branch_name', 'attendance_date', 'attendance_status', 'marking_method', 'verified',
      'verified_by', 'remarks', 'metadata',
    ];
    for (const batch of batches(candidates, 250)) {
      const rowPlaceholder = `(${columns.map(() => '?').join(',')})`;
      const values = batch.flatMap(row => [
        row.id, row.sourceKey, row.sourceTab, row.sourceRowNumber, row.attendanceId, row.sessionId, row.trainingId,
        row.studentProfileId, row.sourceStudentId, row.studentName, row.courseId, row.mainCourse, row.subCourse,
        row.branchId, row.branchName, row.attendanceDate, row.attendanceStatus, row.markingMethod, row.verified,
        row.verifiedBy, row.remarks, row.metadata,
      ]);
      await connection.query(
        `INSERT INTO academic_attendance_records (${columns.join(',')})
         VALUES ${batch.map(() => rowPlaceholder).join(',')}
         ON DUPLICATE KEY UPDATE
           attendance_id = VALUES(attendance_id), session_id = VALUES(session_id), training_id = VALUES(training_id),
           student_profile_id = VALUES(student_profile_id), source_student_id = VALUES(source_student_id),
           student_name = VALUES(student_name), course_id = VALUES(course_id), main_course = VALUES(main_course),
           sub_course = VALUES(sub_course), branch_id = VALUES(branch_id), branch_name = VALUES(branch_name),
           attendance_date = VALUES(attendance_date), attendance_status = VALUES(attendance_status),
           marking_method = VALUES(marking_method), verified = VALUES(verified), verified_by = VALUES(verified_by),
           remarks = VALUES(remarks), metadata = VALUES(metadata)`,
        values,
      );
    }
    await connection.commit();
    const [[counts]] = await connection.execute(
      `SELECT COUNT(*) AS total, COUNT(student_profile_id) AS linked,
              COUNT(attendance_date) AS dated
       FROM academic_attendance_records WHERE source_key = 'shared_learning' AND source_tab = 'Attendance'`,
    );
    console.log(JSON.stringify({
      ...report,
      status: 'completed',
      tableRowsNow: Number(counts.total || 0),
      linkedRowsNow: Number(counts.linked || 0),
      datedRowsNow: Number(counts.dated || 0),
    }, null, 2));
    console.log('All source attendance rows remain in the archive for reconciliation.');
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Academic attendance import failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Academic attendance import could not start: ${error.message}`);
  process.exitCode = 1;
});
