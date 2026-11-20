const mysqlPool = require('../config/mysqlPool');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const rollKey = value => normalized(value).replace(/\s+/g, '');
const compact = value => normalized(value).replace(/[^a-z0-9]/g, '');

function fieldsOf(row) {
  const data = typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
  return data?.fields || {};
}

function valueOf(fields, aliases) {
  const wanted = new Set(aliases.map(compact));
  for (const [key, value] of Object.entries(fields || {})) {
    if (wanted.has(compact(key))) return value;
  }
  return '';
}

function summarize(tab, rows, studentRolls, studentEmails) {
  const headers = new Set();
  const statuses = new Map();
  let id = 0; let date = 0; let status = 0; let course = 0; let branch = 0; let matchedStudent = 0;
  let linkedRoll = 0; let hasStudentIdentity = 0; let blankRows = 0;
  for (const row of rows) {
    const fields = fieldsOf(row);
    Object.keys(fields).forEach(key => headers.add(key));
    const recordId = valueOf(fields, ['Attendance ID', 'Attendance Id', 'AttendanceID', 'Record ID']);
    const studentId = valueOf(fields, ['Student ID', 'Student Id', 'StudentID', 'Roll Number', 'Roll No', 'IPCS Roll Number']);
    const email = valueOf(fields, ['Email', 'Mail ID', 'Student Email']);
    const dateValue = valueOf(fields, ['Date', 'Attendance Date', 'Timestamp', 'Submitted At']);
    const statusValue = valueOf(fields, ['Attendance Status', 'Status']);
    const courseValue = valueOf(fields, ['Main Course', 'Course', 'Program']);
    const branchValue = valueOf(fields, ['Branch', 'Sitting Branch']);
    if (text(recordId)) id += 1;
    if (text(studentId) || text(email)) hasStudentIdentity += 1;
    if (text(studentId) && studentRolls.has(rollKey(studentId))) linkedRoll += 1;
    if (text(email) && studentEmails.has(normalized(email))) matchedStudent += 1;
    if (text(dateValue)) date += 1;
    if (text(statusValue)) {
      status += 1;
      const key = text(statusValue) || '(blank)';
      statuses.set(key, (statuses.get(key) || 0) + 1);
    }
    if (text(courseValue)) course += 1;
    if (text(branchValue)) branch += 1;
    if (!Object.values(fields).some(value => text(value))) blankRows += 1;
  }
  return {
    tab,
    rows: rows.length,
    headers: [...headers],
    rowsWithRecordId: id,
    rowsWithStudentIdentity: hasStudentIdentity,
    rowsMatchingStudentRoll: linkedRoll,
    rowsMatchingStudentLoginEmail: matchedStudent,
    rowsWithDateValue: date,
    rowsWithStatus: status,
    rowsWithCourse: course,
    rowsWithBranch: branch,
    blankRows,
    statusCounts: Object.fromEntries([...statuses].sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

async function main() {
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [studentRows] = await connection.execute(
      `SELECT sp.normalized_roll_number, u.normalized_email
       FROM student_profiles sp LEFT JOIN users u ON u.id = sp.user_id`,
    );
    const studentRolls = new Set(studentRows.map(row => rollKey(row.normalized_roll_number)).filter(Boolean));
    const studentEmails = new Set(studentRows.map(row => normalized(row.normalized_email)).filter(Boolean));
    const tabs = [
      ['shared_learning', 'Attendance'],
      ['shared_learning', 'Talentino_Attendance'],
      ['shared_learning', 'Talentino_Daily_Report_Log'],
    ];
    const summaries = [];
    for (const [sourceKey, tabName] of tabs) {
      const [rows] = await connection.execute(
        `SELECT row_data_json FROM source_sheet_records
         WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
        [sourceKey, tabName],
      );
      summaries.push(summarize(`${sourceKey}:${tabName}`, rows, studentRolls, studentEmails));
    }
    console.log(JSON.stringify({ previewOnly: true, tabs: summaries }, null, 2));
    console.log('Read-only archive preview. No cell values, names, emails, or roll numbers were printed.');
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Attendance preview failed: ${error.message}`);
  process.exitCode = 1;
});
