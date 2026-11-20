const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const asText = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => asText(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedRoll = value => normalized(value).replace(/\s+/g, '');

function getField(record, ...names) {
    const fields = record?.fields || {};
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
    }
    return '';
}

function makeId(scope, key) {
    const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).filter(([name]) => !/password|secret|token/i.test(name)));
}

function parseDate(value) {
    const text = asText(value);
    if (!text) return null;
    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    let year;
    let month;
    let day;
    if (match) [, year, month, day] = match;
    else {
        match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        if (!match) return null;
        [, day, month, year] = match;
        if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }
    const parts = [Number(year), Number(month), Number(day)];
    const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() !== parts[1] - 1 || parsed.getUTCDate() !== parts[2]) return null;
    return `${String(parts[0]).padStart(4, '0')}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
}

function parsePackage(value) {
    const text = asText(value).replace(/,/g, '');
    const match = text.match(/^(\d+(?:\.\d+)?)(?:\s*LPA)?$/i);
    return match ? Number(match[1]) : null;
}

function uniqueMap(rows, keySelector) {
    const grouped = new Map();
    for (const row of rows) {
        const key = keySelector(row);
        if (!key) continue;
        const list = grouped.get(key) || [];
        list.push(row);
        grouped.set(key, list);
    }
    return new Map([...grouped].filter(([, matches]) => matches.length === 1).map(([key, matches]) => [key, matches[0]]));
}

async function loadRows(connection) {
    const [rows] = await connection.execute(
        'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
        ['shared_placement', 'Placed_Students'],
    );
    return rows.map(row => ({
        rowNumber: Number(row.sheet_row_number),
        data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
    }));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const pool = mysqlPool.getPool();
    const connection = await pool.getConnection();
    try {
        const [runs] = await connection.execute('SELECT id, status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('Import and verify the source-sheet snapshot first.');
        const importRunId = runs[0].id;
        const [sourceRows, studentRows, branchRows, courseRows, userRows] = await Promise.all([
            loadRows(connection),
            connection.execute('SELECT id, normalized_roll_number FROM student_profiles').then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM branches').then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM courses').then(([rows]) => rows),
            connection.execute("SELECT id, full_name FROM users WHERE role = 'tpo' AND status <> 'inactive'").then(([rows]) => rows),
        ]);
        const students = uniqueMap(studentRows, row => normalizedRoll(row.normalized_roll_number));
        const branches = new Map(branchRows.map(row => [normalized(row.normalized_name), row.id]));
        const courses = new Map(courseRows.map(row => [normalized(row.normalized_name), row.id]));
        const tpos = uniqueMap(userRows, row => normalized(row.full_name));

        const candidates = sourceRows.map(({ rowNumber, data }) => {
            const key = asText(getField(data, 'Record Key'));
            if (!key) return null;
            const rollNumber = asText(getField(data, 'Roll Number', 'Roll No'));
            const branchName = asText(getField(data, 'Branch'));
            const courseName = asText(getField(data, 'Course'));
            const ownerName = asText(getField(data, 'Placement Officer'));
            const metadata = JSON.stringify({ sourceRow: rowNumber, fields: safeFields(data.fields) });
            return {
                id: makeId('placement-outcome', key),
                key: key.slice(0, 200),
                rowNumber,
                studentId: students.get(normalizedRoll(rollNumber))?.id || null,
                studentName: asText(getField(data, 'Student Name', 'Name')).slice(0, 200) || 'Unknown student',
                rollNumber: rollNumber.slice(0, 100) || null,
                courseId: courses.get(normalized(courseName)) || null,
                branchId: branches.get(normalized(branchName)) || null,
                companyName: asText(getField(data, 'Company Name', 'Company')).slice(0, 240) || 'Unknown company',
                position: asText(getField(data, 'Position', 'Title')).slice(0, 240) || null,
                location: asText(getField(data, 'Placement Location', 'Location')).slice(0, 240) || null,
                packageLpa: parsePackage(getField(data, 'PACKAGE (LPA)', 'Package (LPA)', 'Package')),
                placementDate: parseDate(getField(data, 'DATE PLACED', 'Date Placed')),
                joiningStatus: asText(getField(data, 'Joining Status')).slice(0, 50) || null,
                recordedByUserId: tpos.get(normalized(ownerName))?.id || null,
                ownerUnmatched: Boolean(ownerName && !tpos.has(normalized(ownerName))),
                metadata,
            };
        }).filter(Boolean);
        const currentKeys = new Set(candidates.map(row => row.key));
        const [existingSnapshotRows] = await connection.execute(
            "SELECT source_record_key FROM placement_outcomes WHERE source = 'google_sheets_snapshot'",
        );
        const staleSourceRows = existingSnapshotRows.filter(row => !currentKeys.has(row.source_record_key));

        const report = {
            mode: apply ? 'apply' : 'preview',
            sourceRows: sourceRows.length,
            rowsWithRecordKey: candidates.length,
            linkedToUniqueStudentProfiles: candidates.filter(row => row.studentId).length,
            linkedToBranch: candidates.filter(row => row.branchId).length,
            linkedToCourse: candidates.filter(row => row.courseId).length,
            linkedToUnambiguousActiveTpo: candidates.filter(row => row.recordedByUserId).length,
            ownerLabelsNeedingReview: candidates.filter(row => row.ownerUnmatched).length,
            missingOrUnrecognizedPlacementDate: candidates.filter(row => !row.placementDate).length,
            packageValueNotParsed: candidates.filter(row => row.packageLpa === null).length,
            sourceRowsRemovedSincePreviousCaptureRetainedAsHistory: staleSourceRows.length,
        };

        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only; no rows were written. No student, staff, or company details were printed.');
            return;
        }

        await connection.beginTransaction();
        for (const row of candidates) {
            await connection.execute(
                `INSERT INTO placement_outcomes
                    (id, student_id, student_name, roll_number, course_id, branch_id, company_name, position_title,
                     location, package_lpa, placement_date, joining_status, recorded_by_user_id,
                     source, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google_sheets_snapshot', ?, ?)
                 ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id), student_name = VALUES(student_name), roll_number = VALUES(roll_number),
                    course_id = VALUES(course_id), branch_id = VALUES(branch_id), company_name = VALUES(company_name),
                    position_title = VALUES(position_title), location = VALUES(location), package_lpa = VALUES(package_lpa),
                    placement_date = VALUES(placement_date), joining_status = VALUES(joining_status),
                    recorded_by_user_id = VALUES(recorded_by_user_id), metadata = VALUES(metadata)`,
                [row.id, row.studentId, row.studentName, row.rollNumber, row.courseId, row.branchId, row.companyName,
                    row.position, row.location, row.packageLpa, row.placementDate, row.joiningStatus,
                    row.recordedByUserId, row.key, row.metadata],
            );
        }
        if (candidates.length) {
            const placeholders = candidates.map(() => '?').join(',');
            await connection.execute(
                `UPDATE placement_outcomes
                 SET source = 'superseded_sheet_snapshot',
                     metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.archiveState', 'removed_from_current_sheet', '$.supersededByImportRun', ?)
                 WHERE source = 'google_sheets_snapshot' AND source_record_key NOT IN (${placeholders})`,
                [importRunId, ...[...currentKeys]],
            );
        }
        await connection.commit();
        const [[counts]] = await connection.execute(
            `SELECT SUM(source = 'google_sheets_snapshot') AS total_rows,
                    SUM(source = 'superseded_sheet_snapshot') AS superseded_rows,
                    SUM(source = 'google_sheets_snapshot' AND student_id IS NOT NULL) AS student_links,
                    SUM(source = 'google_sheets_snapshot' AND recorded_by_user_id IS NOT NULL) AS tpo_links
             FROM placement_outcomes`,
        );
        console.log(JSON.stringify({
            ...report,
            status: 'completed',
            normalizedTableNowContains: {
                placementRows: Number(counts.total_rows),
                supersededHistoricalRowsRetained: Number(counts.superseded_rows || 0),
                linkedStudentProfiles: Number(counts.student_links || 0),
                linkedTpoOwners: Number(counts.tpo_links || 0),
            },
        }, null, 2));
        console.log('Every placement row remains in the source snapshot archive; no duplicate outcome was discarded.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Placement outcome import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Placement outcome import could not start: ${error.message}`);
    process.exitCode = 1;
});
