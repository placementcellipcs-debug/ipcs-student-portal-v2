const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const SOURCE_KEY = 'shared_student_data';
const TAB_NAME = 'Leave_Applications';
const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedKey = value => normalized(value).replace(/[^a-z0-9]/g, '');

function field(fields, ...aliases) {
    const wanted = new Set(aliases.map(normalizedKey));
    for (const [name, value] of Object.entries(fields || {})) {
        if (wanted.has(normalizedKey(name)) && value !== undefined && value !== null && text(value) !== '') return text(value);
    }
    return '';
}

function parseDate(value) {
    const raw = text(value);
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/);
    const portal = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    let year; let month; let day;
    if (iso) [, year, month, day] = iso;
    else if (portal) [, day, month, year] = portal;
    else return null;
    year = Number(year); month = Number(month); day = Number(day);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function stableId(rowNumber) {
    const bytes = crypto.createHash('sha256').update(`${SOURCE_KEY}:${TAB_NAME}:${rowNumber}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
}

async function main() {
    const apply = process.argv.includes('--apply');
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [[run]] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (run?.status !== 'completed') throw new Error('Import and verify the source snapshot before loading leave requests.');

        const [[manifest]] = await connection.execute(
            'SELECT imported_record_count, headers_json FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ?',
            [SOURCE_KEY, TAB_NAME],
        );
        if (!manifest) throw new Error(`The archived ${TAB_NAME} tab was not found.`);
        const [sourceRows] = await connection.execute(
            'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
            [SOURCE_KEY, TAB_NAME],
        );
        if (sourceRows.length !== Number(manifest.imported_record_count)) {
            throw new Error(`Archived ${TAB_NAME} count does not match its manifest; refusing to load partial data.`);
        }

        const [students] = await connection.execute(
            `SELECT sp.id, sp.normalized_roll_number, LOWER(COALESCE(u.normalized_email, sp.personal_email, '')) AS normalized_email,
                    sp.branch_id, sp.course_id, b.name AS branch_name, c.name AS course_name
             FROM student_profiles sp
             LEFT JOIN users u ON u.id = sp.user_id
             LEFT JOIN branches b ON b.id = sp.branch_id
             LEFT JOIN courses c ON c.id = sp.course_id`,
        );
        const emailProfiles = new Map();
        const rollProfiles = new Map();
        for (const student of students) {
            if (student.normalized_email) emailProfiles.set(student.normalized_email, [...(emailProfiles.get(student.normalized_email) || []), student]);
            const roll = normalized(student.normalized_roll_number).replace(/\s+/g, '');
            if (roll) rollProfiles.set(roll, [...(rollProfiles.get(roll) || []), student]);
        }

        let invalidStartDates = 0;
        let invalidEndDates = 0;
        let missingIdentity = 0;
        let linkedStudents = 0;
        const records = sourceRows.map(source => {
            const row = parseJson(source.row_data_json);
            const fields = row.fields || {};
            const email = normalized(field(fields, 'Email', 'Mail ID', 'Student Email'));
            const rollNumber = field(fields, 'Roll No', 'Roll Number', 'IPCS Roll Number');
            const byEmail = emailProfiles.get(email) || [];
            const byRoll = rollProfiles.get(normalized(rollNumber).replace(/\s+/g, '')) || [];
            let student = null;
            if (byEmail.length === 1 && byRoll.length === 1 && byEmail[0].id === byRoll[0].id) student = byEmail[0];
            else if (byEmail.length === 1 && byRoll.length === 0) student = byEmail[0];
            else if (byRoll.length === 1 && byEmail.length === 0) student = byRoll[0];
            else if (byEmail.length === 1 && !rollNumber) student = byEmail[0];
            else if (byRoll.length === 1 && !email) student = byRoll[0];
            if (student) linkedStudents += 1;
            else if (!email && !rollNumber) missingIdentity += 1;

            const startDateRaw = field(fields, 'Start Date', 'From Date', 'Leave From');
            const endDateRaw = field(fields, 'End Date', 'To Date', 'Leave To');
            const startDate = parseDate(startDateRaw);
            const endDate = parseDate(endDateRaw);
            if (startDateRaw && !startDate) invalidStartDates += 1;
            if (endDateRaw && !endDate) invalidEndDates += 1;
            const requestType = field(fields, 'Type', 'Request Type', 'Leave Type') || 'Leave Request';
            return {
                id: stableId(Number(source.sheet_row_number)),
                rowNumber: Number(source.sheet_row_number),
                studentId: student?.id || null,
                email: email || normalized(field(fields, 'Email', 'Mail ID', 'Student Email')) || 'unknown@invalid.local',
                name: field(fields, 'Name', 'Student Name') || 'Student',
                rollNumber: rollNumber || null,
                branchId: student?.branch_id || null,
                courseId: student?.course_id || null,
                branchName: field(fields, 'Branch') || student?.branch_name || null,
                courseName: field(fields, 'Course', 'Main Course') || student?.course_name || null,
                startDate,
                endDate,
                startDateRaw,
                endDateRaw,
                requestType,
                reason: field(fields, 'Reason', 'Leave Reason', 'Notes'),
                status: field(fields, 'Status', 'Leave Status') || (normalized(requestType) === 'absence notice' ? 'Notified' : 'Pending'),
                requestedAtRaw: field(fields, 'Timestamp', 'Requested At', 'Date Submitted'),
                metadata: JSON.stringify({ source: `${SOURCE_KEY}:${TAB_NAME}`, sourceRow: Number(source.sheet_row_number), originalFields: fields }),
            };
        });

        const report = {
            mode: apply ? 'apply' : 'preview',
            sourceTab: `${SOURCE_KEY}:${TAB_NAME}`,
            sourceRows: sourceRows.length,
            linkedToStudentProfiles: linkedStudents,
            unlinkedRows: records.length - linkedStudents,
            rowsMissingBothEmailAndRoll: missingIdentity,
            invalidStartDatesPreservedAsRaw: invalidStartDates,
            invalidEndDatesPreservedAsRaw: invalidEndDates,
            duplicatePreservation: 'one row per source row; repeated leave submissions are retained',
        };

        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only. No leave rows were written and no student details were printed.');
            return;
        }

        await connection.beginTransaction();
        for (const record of records) {
            await connection.execute(
                `INSERT INTO student_leave_requests
                    (id, student_id, student_email, student_name, roll_number, branch_id, course_id,
                     branch_name, course_name, start_date, end_date, start_date_raw, end_date_raw,
                     request_type, reason, status, requested_at_raw, source, source_record_key,
                     source_row_number, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google_sheet_snapshot', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id), student_email = VALUES(student_email),
                    student_name = VALUES(student_name), roll_number = VALUES(roll_number),
                    branch_id = VALUES(branch_id), course_id = VALUES(course_id),
                    branch_name = VALUES(branch_name), course_name = VALUES(course_name),
                    start_date = VALUES(start_date), end_date = VALUES(end_date),
                    start_date_raw = VALUES(start_date_raw), end_date_raw = VALUES(end_date_raw),
                    request_type = VALUES(request_type), reason = VALUES(reason), status = VALUES(status),
                    requested_at_raw = VALUES(requested_at_raw), source_row_number = VALUES(source_row_number),
                    metadata = VALUES(metadata)`,
                [record.id, record.studentId, record.email, record.name, record.rollNumber, record.branchId, record.courseId,
                    record.branchName, record.courseName, record.startDate, record.endDate, record.startDateRaw, record.endDateRaw,
                    record.requestType, record.reason, record.status, record.requestedAtRaw,
                    `${TAB_NAME}:${record.rowNumber}`, record.rowNumber, record.metadata],
            );
        }
        await connection.commit();

        const [[counts]] = await connection.execute(
            `SELECT COUNT(*) AS records, SUM(student_id IS NOT NULL) AS linked_records
             FROM student_leave_requests WHERE source = 'google_sheet_snapshot'`,
        );
        console.log(JSON.stringify({ ...report, status: 'completed', storedSourceRows: Number(counts.records), linkedSourceRows: Number(counts.linked_records || 0) }, null, 2));
        console.log('The source sheet was not changed. Original date/timestamp strings remain in MySQL for review.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Student leave import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student leave import could not start: ${error.message}`);
    process.exitCode = 1;
});
