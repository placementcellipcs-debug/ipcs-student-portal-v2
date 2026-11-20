const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { parseSourceDateTime } = require('../utils/sourceDateTime');

const SOURCE_KEY = 'shared_student_data';
const TAB_NAME = 'Student_Diary';
const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedKey = value => normalized(value).replace(/[^a-z0-9]/g, '');

function parseJson(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function field(headers, cells, ...aliases) {
    const wanted = new Set(aliases.map(normalizedKey));
    const index = headers.findIndex(header => wanted.has(normalizedKey(header)));
    return index < 0 ? '' : cells[index] ?? '';
}

function stableId(sourceRowNumber) {
    const bytes = crypto.createHash('sha256').update(`${SOURCE_KEY}:${TAB_NAME}:${sourceRowNumber}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function numberOrNull(value) {
    if (text(value) === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function uniqueIndex(rows, key) {
    const grouped = new Map();
    for (const row of rows) {
        const value = key(row);
        if (!value) continue;
        const matches = grouped.get(value) || [];
        matches.push(row);
        grouped.set(value, matches);
    }
    return new Map([...grouped].filter(([, matches]) => matches.length === 1).map(([value, [row]]) => [value, row]));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [[run]] = await connection.execute("SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1");
        if (run?.status !== 'completed') throw new Error('Import and verify the source archive before loading the student diary.');

        const [[manifest]] = await connection.execute(
            'SELECT imported_record_count FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ? LIMIT 1',
            [SOURCE_KEY, TAB_NAME],
        );
        if (!manifest) throw new Error(`The archived ${TAB_NAME} tab was not found.`);

        const [sourceRows, profiles, branches, courses] = await Promise.all([
            connection.execute(
                `SELECT sheet_row_number, row_data_json FROM source_sheet_records
                 WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
                [SOURCE_KEY, TAB_NAME],
            ).then(([rows]) => rows),
            connection.execute(
                `SELECT sp.id AS student_profile_id, sp.user_id, sp.normalized_roll_number,
                        LOWER(COALESCE(u.normalized_email, sp.personal_email, '')) AS normalized_email
                 FROM student_profiles sp LEFT JOIN users u ON u.id = sp.user_id`,
            ).then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM branches').then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM courses').then(([rows]) => rows),
        ]);
        if (sourceRows.length !== Number(manifest.imported_record_count)) {
            throw new Error(`Archived ${TAB_NAME} row count does not match its manifest.`);
        }

        const [[manifestRow]] = await connection.execute(
            'SELECT headers_json FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ? LIMIT 1',
            [SOURCE_KEY, TAB_NAME],
        );
        const headers = parseJson(manifestRow.headers_json, []);
        const studentsByEmail = uniqueIndex(profiles, row => normalized(row.normalized_email));
        const branchesByName = new Map(branches.map(row => [normalized(row.normalized_name), row.id]));
        const coursesByName = new Map(courses.map(row => [normalized(row.normalized_name), row.id]));

        let linkedStudents = 0;
        let unlinkedStudents = 0;
        let invalidDates = 0;
        const records = sourceRows.map(source => {
            const sourceData = parseJson(source.row_data_json, {});
            const cells = Array.isArray(sourceData.cells) ? sourceData.cells : [];
            const email = text(field(headers, cells, 'Email'));
            const student = studentsByEmail.get(normalized(email)) || null;
            if (student) linkedStudents += 1;
            else unlinkedStudents += 1;
            const timestamp = text(field(headers, cells, 'Timestamp'));
            const sourceDate = text(field(headers, cells, 'Date'));
            const occurredAt = parseSourceDateTime(timestamp);
            const diaryDate = parseSourceDateTime(sourceDate)?.slice(0, 10) || null;
            if (sourceDate && !diaryDate) invalidDates += 1;
            const branchName = text(field(headers, cells, 'Branch'));
            const courseName = text(field(headers, cells, 'Course'));
            const progress = numberOrNull(field(headers, cells, 'Syllabus Completed (%)'));
            return {
                id: stableId(Number(source.sheet_row_number)),
                sourceRecordKey: `${SOURCE_KEY}:${TAB_NAME}:${source.sheet_row_number}`,
                rowNumber: Number(source.sheet_row_number),
                student,
                email: email || null,
                normalizedEmail: normalized(email) || null,
                name: text(field(headers, cells, 'Name')) || null,
                rollNumber: text(field(headers, cells, 'Roll No')) || null,
                branchId: branchesByName.get(normalized(branchName)) || null,
                branchName: branchName || null,
                courseId: coursesByName.get(normalized(courseName)) || null,
                courseName: courseName || null,
                timestamp: timestamp || null,
                occurredAt,
                sourceDate: sourceDate || null,
                diaryDate,
                recordType: text(field(headers, cells, 'Record Type')) || null,
                status: text(field(headers, cells, 'Status')) || null,
                topic: text(field(headers, cells, 'Topic')) || null,
                progress,
                remarks: text(field(headers, cells, 'Remarks')) || null,
                latitude: numberOrNull(field(headers, cells, 'Latitude')),
                longitude: numberOrNull(field(headers, cells, 'Longitude')),
                distance: numberOrNull(field(headers, cells, 'Distance (m)')),
                cells,
            };
        });

        if (apply && records.length) {
            await connection.beginTransaction();
            for (const row of records) {
                await connection.execute(
                    `INSERT INTO student_diary_entries
                        (id, source_record_key, source_key, source_tab, source_row_number, user_id, student_profile_id,
                         student_email, normalized_student_email, student_name, roll_number, branch_id, branch_name,
                         course_id, course_name, source_timestamp, occurred_at, source_date, diary_date, record_type,
                         status, topic, syllabus_progress, remarks, latitude, longitude, distance_meters, source_cells_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        user_id = VALUES(user_id), student_profile_id = VALUES(student_profile_id),
                        student_email = VALUES(student_email), normalized_student_email = VALUES(normalized_student_email),
                        student_name = VALUES(student_name), roll_number = VALUES(roll_number), branch_id = VALUES(branch_id),
                        branch_name = VALUES(branch_name), course_id = VALUES(course_id), course_name = VALUES(course_name),
                        source_timestamp = VALUES(source_timestamp), occurred_at = VALUES(occurred_at),
                        source_date = VALUES(source_date), diary_date = VALUES(diary_date), record_type = VALUES(record_type),
                        status = VALUES(status), topic = VALUES(topic), syllabus_progress = VALUES(syllabus_progress),
                        remarks = VALUES(remarks), latitude = VALUES(latitude), longitude = VALUES(longitude),
                        distance_meters = VALUES(distance_meters), source_cells_json = VALUES(source_cells_json)`,
                    [row.id, row.sourceRecordKey, SOURCE_KEY, TAB_NAME, row.rowNumber, row.student?.user_id || null,
                        row.student?.student_profile_id || null, row.email, row.normalizedEmail, row.name, row.rollNumber,
                        row.branchId, row.branchName, row.courseId, row.courseName, row.timestamp, row.occurredAt,
                        row.sourceDate, row.diaryDate, row.recordType, row.status, row.topic, row.progress,
                        row.remarks, row.latitude, row.longitude, row.distance, JSON.stringify(row.cells)],
                );
            }
            await connection.commit();
        }

        const [storedRows] = await connection.execute(
            'SELECT COUNT(*) AS total FROM student_diary_entries WHERE source_key = ? AND source_tab = ?',
            [SOURCE_KEY, TAB_NAME],
        );
        console.log(JSON.stringify({
            mode: apply ? 'apply' : 'preview',
            archivedSourceRows: sourceRows.length,
            linkedStudents,
            unlinkedStudents,
            invalidDates,
            normalizedSourceRowsAfter: Number(storedRows[0]?.total || 0),
            status: 'completed',
        }, null, 2));
        console.log('All original diary rows remain unchanged in the source archive; no names, emails, GPS values, or diary text were printed.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student diary import failed: ${error.message}`);
    process.exitCode = 1;
});
