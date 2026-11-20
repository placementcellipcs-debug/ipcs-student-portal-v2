const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { parseSourceDateTime } = require('../utils/sourceDateTime');

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

async function loadRows(connection, tabName) {
    const [rows] = await connection.execute(
        'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
        ['shared_placement', tabName],
    );
    return rows.map(row => ({
        rowNumber: Number(row.sheet_row_number),
        data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
    }));
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

async function main() {
    const apply = process.argv.includes('--apply');
    const pool = mysqlPool.getPool();
    const connection = await pool.getConnection();
    try {
        const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('Import and verify the source-sheet snapshot first.');
        const [openingRows, trackerRows, studentRows, vacancyRows, userRows] = await Promise.all([
            loadRows(connection, 'Opening_Applied'),
            loadRows(connection, 'TPO_Log'),
            connection.execute('SELECT id, normalized_roll_number FROM student_profiles').then(([rows]) => rows),
            connection.execute('SELECT id, job_code, assigned_tpo_user_id FROM vacancies').then(([rows]) => rows),
            connection.execute("SELECT id, full_name, email FROM users WHERE role = 'tpo' AND status <> 'inactive'").then(([rows]) => rows),
        ]);

        const students = new Map(studentRows.map(row => [normalizedRoll(row.normalized_roll_number), row.id]));
        const vacancies = new Map(vacancyRows.map(row => [normalized(row.job_code), row.id]));
        const vacancyOwners = new Map(vacancyRows.map(row => [normalized(row.job_code), row.assigned_tpo_user_id || null]));
        const tposByName = uniqueMap(userRows, row => normalized(row.full_name));
        const tposByEmail = uniqueMap(userRows, row => normalized(row.email));
        const candidates = [
            ...openingRows.map(row => ({ ...row, tabName: 'Opening_Applied' })),
            ...trackerRows.map(row => ({ ...row, tabName: 'TPO_Log' })),
        ].map(({ rowNumber, data, tabName }) => {
            const sourceRecordKey = `${tabName}:${rowNumber}`;
            const rollNumber = asText(getField(data, 'Roll Number', 'Roll No'));
            const jobCode = asText(getField(data, 'Job ID', 'JOBID'));
            const ownerText = asText(getField(data, 'Placement Officer', 'Assigned TPO', 'TPO Name', 'TPO'));
            const explicitlyResolvedOwner = tposByEmail.get(normalized(ownerText)) || tposByName.get(normalized(ownerText));
            // Legacy Opening_Applied rows may omit the owner. They can inherit
            // the current owner only from one uniquely identified job code.
            // A nonblank but unrecognized source owner is kept unresolved.
            const owner = ownerText ? explicitlyResolvedOwner : { id: vacancyOwners.get(normalized(jobCode)) || null };
            const timestamp = getField(data, 'TimeStamp', 'Timestamp');
            const metadata = JSON.stringify({ sourceRow: rowNumber, fields: safeFields(data.fields) });
            return {
                id: makeId('placement-tracker', `shared_placement:${sourceRecordKey}`),
                sourceKey: 'shared_placement',
                sourceTab: tabName,
                sourceRow: rowNumber,
                studentId: students.get(normalizedRoll(rollNumber)) || null,
                vacancyId: vacancies.get(normalized(jobCode)) || null,
                ownerId: owner?.id || null,
                ownerUnmatched: Boolean(ownerText && !explicitlyResolvedOwner),
                rollNumber: rollNumber.slice(0, 100) || null,
                studentName: asText(getField(data, 'Student Name', 'Name')).slice(0, 200) || null,
                jobCode: jobCode.slice(0, 100) || null,
                companyName: asText(getField(data, 'Company Name', 'Company')).slice(0, 240) || null,
                positionTitle: asText(getField(data, 'Position', 'Title')).slice(0, 240) || null,
                status: asText(getField(data, 'Status')).slice(0, 80) || null,
                occurredAt: parseSourceDateTime(timestamp),
                metadata,
                sourceRecordKey,
            };
        });

        const pairCounts = new Map();
        for (const row of candidates) {
            const pair = row.rollNumber && row.jobCode ? `${normalized(row.rollNumber)}\u0000${normalized(row.jobCode)}` : '';
            if (pair) pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
        }
        const sourceTabs = [...new Set(candidates.map(row => row.sourceTab))];
        const bySourceTab = Object.fromEntries(sourceTabs.map(tabName => {
            const rows = candidates.filter(row => row.sourceTab === tabName);
            return [tabName, {
                rows: rows.length,
                linkedToUniqueStudentProfiles: rows.filter(row => row.studentId).length,
                linkedToCurrentOpenings: rows.filter(row => row.vacancyId).length,
                linkedToUnambiguousActiveTpos: rows.filter(row => row.ownerId).length,
                rowsWithValidTimestamp: rows.filter(row => row.occurredAt).length,
                rowsWithoutValidTimestamp: rows.filter(row => !row.occurredAt).length,
                ownerNamesNeedingReview: rows.filter(row => row.ownerUnmatched).length,
                rowsWithoutStudentOrOpeningLink: rows.filter(row => !row.studentId || !row.vacancyId).length,
            }];
        }));
        const report = {
            mode: apply ? 'apply' : 'preview',
            openingAppliedRows: openingRows.length,
            tpoTrackerRows: trackerRows.length,
            totalRows: candidates.length,
            linkedToUniqueStudentProfiles: candidates.filter(row => row.studentId).length,
            linkedToCurrentOpenings: candidates.filter(row => row.vacancyId).length,
            linkedToUnambiguousActiveTpos: candidates.filter(row => row.ownerId).length,
            rowsWithValidTimestamp: candidates.filter(row => row.occurredAt).length,
            rowsWithoutValidTimestamp: candidates.filter(row => !row.occurredAt).length,
            ownerNamesNeedingReview: candidates.filter(row => row.ownerUnmatched).length,
            rowsKeptWithoutStudentOrOpeningLink: candidates.filter(row => !row.studentId || !row.vacancyId).length,
            repeatedStudentAndJobPairsRetained: [...pairCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
            bySourceTab,
        };

        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only; no rows were written. No student, staff, or company details were printed.');
            return;
        }

        await connection.beginTransaction();
        for (const row of candidates) {
            await connection.execute(
                `INSERT INTO placement_tracker_records
                    (id, source_key, source_tab, source_row_number, student_id, vacancy_id, owner_tpo_user_id,
                     roll_number, student_name, job_code, company_name, position_title, status, occurred_at, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id), vacancy_id = VALUES(vacancy_id),
                    owner_tpo_user_id = VALUES(owner_tpo_user_id), roll_number = VALUES(roll_number),
                    student_name = VALUES(student_name), job_code = VALUES(job_code), company_name = VALUES(company_name),
                    position_title = VALUES(position_title), status = VALUES(status), occurred_at = VALUES(occurred_at),
                    metadata = VALUES(metadata)`,
                [row.id, row.sourceKey, row.sourceTab, row.sourceRow, row.studentId, row.vacancyId, row.ownerId,
                    row.rollNumber, row.studentName, row.jobCode, row.companyName, row.positionTitle,
                    row.status, row.occurredAt, row.metadata],
            );
        }
        await connection.commit();
        const [[counts]] = await connection.execute(
            `SELECT COUNT(*) AS rows_total, SUM(source_tab = 'Opening_Applied') AS opening_rows,
                    SUM(source_tab = 'TPO_Log') AS tracker_rows, SUM(owner_tpo_user_id IS NOT NULL) AS owned_rows
             FROM placement_tracker_records`,
        );
        console.log(JSON.stringify({
            ...report,
            status: 'completed',
            normalizedTableNowContains: {
                totalRows: Number(counts.rows_total),
                openingAppliedRows: Number(counts.opening_rows || 0),
                tpoTrackerRows: Number(counts.tracker_rows || 0),
                assignedToUnambiguousTpos: Number(counts.owned_rows || 0),
            },
        }, null, 2));
        console.log('All source tracker rows remain archived. Repeated student/job pairs are retained as separate records.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Placement tracker import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Placement tracker import could not start: ${error.message}`);
    process.exitCode = 1;
});
