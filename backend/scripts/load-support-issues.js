const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const SOURCE_KEY = 'shared_operations';
const TAB_NAME = 'Issues';
const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const keyOf = value => normalized(value).replace(/[^a-z0-9]/g, '');

function getField(fields, ...aliases) {
    const wanted = new Set(aliases.map(keyOf));
    for (const [key, value] of Object.entries(fields || {})) {
        if (wanted.has(keyOf(key)) && value !== undefined && value !== null && text(value) !== '') return text(value);
    }
    return '';
}

function parseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
}

function stableId(rowNumber) {
    const bytes = crypto.createHash('sha256').update(`${SOURCE_KEY}:${TAB_NAME}:${rowNumber}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseTimestamp(value) {
    const raw = text(value);
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
        const instant = new Date(raw);
        if (!Number.isNaN(instant.getTime())) return instant.toISOString().slice(0, 19).replace('T', ' ');
        return null;
    }
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (iso) return localIndiaTimeAsUtc(iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]);
    const indian = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!indian) return null;
    const [, day, month, year, hour, minute, second] = indian;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return null;
    return localIndiaTimeAsUtc(year, month, day, hour, minute, second);
}

function localIndiaTimeAsUtc(year, month, day, hour = '00', minute = '00', second = '00') {
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour || 0), Number(minute || 0), Number(second || 0)) - 330 * 60 * 1000);
    return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
    const apply = process.argv.includes('--apply');
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [[run]] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (run?.status !== 'completed') throw new Error('Import and verify the one-time source snapshot before loading support issues.');
        const [[manifest]] = await connection.execute(
            'SELECT imported_record_count FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ?', [SOURCE_KEY, TAB_NAME],
        );
        if (!manifest) throw new Error('The archived Issues tab was not found.');
        const [sourceRows, students, branches, courses] = await Promise.all([
            connection.execute('SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number', [SOURCE_KEY, TAB_NAME]).then(([rows]) => rows),
            connection.execute(`SELECT sp.id, sp.normalized_roll_number, sp.phone, LOWER(COALESCE(NULLIF(u.normalized_email, ''), sp.personal_email, '')) AS normalized_email,
                                      sp.branch_id, sp.course_id, u.full_name, u.phone AS user_phone, b.name AS branch_name, c.name AS course_name
                                FROM student_profiles sp LEFT JOIN users u ON u.id = sp.user_id
                                LEFT JOIN branches b ON b.id = sp.branch_id LEFT JOIN courses c ON c.id = sp.course_id`).then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM branches').then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM courses').then(([rows]) => rows),
        ]);
        if (sourceRows.length !== Number(manifest.imported_record_count)) throw new Error('Archived Issues count does not match its manifest; refusing to load partial data.');

        const byEmail = new Map();
        const byRoll = new Map();
        for (const student of students) {
            if (student.normalized_email) byEmail.set(normalized(student.normalized_email), [...(byEmail.get(normalized(student.normalized_email)) || []), student]);
            const roll = normalized(student.normalized_roll_number).replace(/\s+/g, '');
            if (roll) byRoll.set(roll, [...(byRoll.get(roll) || []), student]);
        }
        const branchByName = new Map(branches.map(item => [normalized(item.normalized_name), item.id]));
        const courseByName = new Map(courses.map(item => [normalized(item.normalized_name), item.id]));
        let linkedStudents = 0;
        let ambiguousIdentities = 0;
        let invalidTimestamps = 0;
        const records = sourceRows.map(row => {
            const source = parseJson(row.row_data_json);
            const fields = source.fields || {};
            const email = normalized(getField(fields, 'Email', 'Mail ID', 'Student Email'));
            const rollNumber = getField(fields, 'Roll No', 'Roll Number', 'IPCS Roll Number');
            const emailMatches = byEmail.get(email) || [];
            const rollMatches = byRoll.get(normalized(rollNumber).replace(/\s+/g, '')) || [];
            let student = null;
            if (emailMatches.length === 1 && rollMatches.length === 1 && emailMatches[0].id === rollMatches[0].id) student = emailMatches[0];
            else if (emailMatches.length === 1 && (!rollNumber || rollMatches.length === 0)) student = emailMatches[0];
            else if (rollMatches.length === 1 && (!email || emailMatches.length === 0)) student = rollMatches[0];
            if (emailMatches.length > 1 || rollMatches.length > 1 || (emailMatches.length === 1 && rollMatches.length === 1 && emailMatches[0].id !== rollMatches[0].id)) ambiguousIdentities += 1;
            if (student) linkedStudents += 1;
            const branchName = getField(fields, 'Branch') || student?.branch_name || '';
            const courseName = getField(fields, 'Course', 'Program') || student?.course_name || '';
            const reportedAtRaw = getField(fields, 'Timestamp', 'Reported At', 'Date');
            const reportedAt = parseTimestamp(reportedAtRaw);
            if (reportedAtRaw && !reportedAt) invalidTimestamps += 1;
            return {
                id: stableId(Number(row.sheet_row_number)), rowNumber: Number(row.sheet_row_number), student,
                email: email || null, name: getField(fields, 'Name', 'Student Name', 'Student') || student?.full_name || 'Student',
                phone: getField(fields, 'Phone', 'Phone No.', 'Contact Number') || student?.phone || student?.user_phone || null,
                rollNumber: rollNumber || student?.roll_number || null,
                branchId: student?.branch_id || branchByName.get(normalized(branchName)) || null,
                courseId: student?.course_id || courseByName.get(normalized(courseName)) || null,
                branchName: branchName || null, courseName: courseName || null,
                location: getField(fields, 'Location', 'Reported From') || null,
                details: getField(fields, 'Issue Details', 'Issue', 'Details', 'Description'),
                status: (getField(fields, 'Status', 'Issue Status') || 'Pending').slice(0, 40),
                remarks: getField(fields, 'Remarks', 'Resolution Notes'), reportedAt, reportedAtRaw,
                metadata: JSON.stringify({ source: `${SOURCE_KEY}:${TAB_NAME}`, sourceRow: Number(row.sheet_row_number), fields }),
            };
        });
        const withoutDetails = records.filter(record => !record.details).length;
        if (withoutDetails) throw new Error(`${withoutDetails} source issue rows have no issue text; review the snapshot before importing.`);
        const report = {
            mode: apply ? 'apply' : 'preview', sourceRows: records.length,
            linkedToStudentProfiles: linkedStudents, unlinkedRows: records.length - linkedStudents,
            ambiguousIdentityRows: ambiguousIdentities, timestampsPreservedRaw: invalidTimestamps,
            duplicatePreservation: 'each source row receives a stable issue ID; duplicate issue text is retained',
        };
        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only. No support issue details or identities were printed; no rows were written.');
            return;
        }

        await connection.beginTransaction();
        for (const record of records) {
            await connection.execute(
                `INSERT INTO support_issues
                    (id, student_id, student_email, student_name, phone, roll_number, branch_id, course_id,
                     branch_name, course_name, location, details, status, remarks, reported_at, reported_at_raw,
                     source, source_record_key, source_row_number, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google_sheet_snapshot', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id), student_email = VALUES(student_email), student_name = VALUES(student_name),
                    phone = VALUES(phone), roll_number = VALUES(roll_number), branch_id = VALUES(branch_id), course_id = VALUES(course_id),
                    branch_name = VALUES(branch_name), course_name = VALUES(course_name), location = VALUES(location), details = VALUES(details),
                    status = VALUES(status), remarks = VALUES(remarks), reported_at = VALUES(reported_at), reported_at_raw = VALUES(reported_at_raw),
                    source_row_number = VALUES(source_row_number), metadata = VALUES(metadata)`,
                [record.id, record.student?.id || null, record.email, record.name, record.phone, record.rollNumber,
                    record.branchId, record.courseId, record.branchName, record.courseName, record.location,
                    record.details, record.status, record.remarks || null, record.reportedAt, record.reportedAtRaw,
                    `${TAB_NAME}:${record.rowNumber}`, record.rowNumber, record.metadata],
            );
        }
        await connection.commit();
        const [[counts]] = await connection.execute(
            "SELECT COUNT(*) AS total, SUM(student_id IS NOT NULL) AS linked FROM support_issues WHERE source = 'google_sheet_snapshot'",
        );
        console.log(JSON.stringify({ ...report, status: 'completed', storedSourceRows: Number(counts.total), linkedSourceRows: Number(counts.linked || 0) }, null, 2));
        console.log('Source Sheets were not changed; original source cells remain archived in MySQL.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Support issue import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Support issue import could not start: ${error.message}`);
    process.exitCode = 1;
});
