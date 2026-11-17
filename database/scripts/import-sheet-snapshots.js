const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const studentBackend = path.join(projectRoot, 'backend');
const tpoBackend = path.resolve(projectRoot, '../IPCS TPO Portal/backend');
const requireFromStudentBackend = moduleName => require(require.resolve(moduleName, { paths: [studentBackend] }));
const { google } = requireFromStudentBackend('googleapis');
const bcrypt = requireFromStudentBackend('bcryptjs');
const dotenv = requireFromStudentBackend('dotenv');
dotenv.config({ path: path.join(studentBackend, '.env') });
const mysqlPool = require(path.join(studentBackend, 'config/mysqlPool'));
const { hashPassword: hashTpoPassword, isPasswordHash: isScryptPasswordHash } = require(path.join(tpoBackend, 'src/passwords'));

const studentEnv = dotenv.parse(fs.readFileSync(path.join(studentBackend, '.env')));
const tpoEnv = dotenv.parse(fs.readFileSync(path.join(tpoBackend, '.env')));
const readOnlyScope = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const studentAuth = new google.auth.GoogleAuth({
    keyFile: path.join(studentBackend, 'google-credentials.json'),
    scopes: readOnlyScope,
});
const tpoAuth = new google.auth.JWT({
    email: tpoEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: String(tpoEnv.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: readOnlyScope,
});

const configuredWorkbooks = [
    ['Student Portal', 'STUDENT_DATA_SPREADSHEET_ID', studentEnv.STUDENT_DATA_SPREADSHEET_ID, studentAuth],
    ['Student Portal', 'PLACEMENT_SPREADSHEET_ID', studentEnv.PLACEMENT_SPREADSHEET_ID, studentAuth],
    ['Student Portal', 'LEARNING_SPREADSHEET_ID', studentEnv.LEARNING_SPREADSHEET_ID, studentAuth],
    ['Student Portal', 'OPERATIONS_SPREADSHEET_ID', studentEnv.OPERATIONS_SPREADSHEET_ID, studentAuth],
    ['Student Portal', 'GAMEPAL_SPREADSHEET_ID', studentEnv.GAMEPAL_SPREADSHEET_ID, studentAuth],
    ['TPO Portal', 'STUDENT_DATA_SPREADSHEET_ID', tpoEnv.STUDENT_DATA_SPREADSHEET_ID, tpoAuth],
    ['TPO Portal', 'PLACEMENT_SPREADSHEET_ID', tpoEnv.PLACEMENT_SPREADSHEET_ID, tpoAuth],
    ['TPO Portal', 'LEARNING_SPREADSHEET_ID', tpoEnv.LEARNING_SPREADSHEET_ID, tpoAuth],
    ['TPO Portal', 'OPERATIONS_SPREADSHEET_ID', tpoEnv.OPERATIONS_SPREADSHEET_ID, tpoAuth],
    ['TPO Portal', 'ACADEMIC_SPREADSHEET_ID', tpoEnv.ACADEMIC_SPREADSHEET_ID || '1mhTuK_3dXLKk1DcUCTA7KFWHiCKirwmYP6l7wMLYPlo', tpoAuth],
    ['TPO Portal', 'PORTAL_AUDIT_SPREADSHEET_ID', tpoEnv.PORTAL_AUDIT_SPREADSHEET_ID || '11FH7p5rYIc0EmKvT6fd0PIIoc2ns8Vj-EjksX1BLZ-w', tpoAuth],
    ['TPO Portal', 'ASSET_SPREADSHEET_ID', tpoEnv.ASSET_SPREADSHEET_ID, tpoAuth],
].filter(([, , spreadsheetId]) => String(spreadsheetId || '').trim());

const batchSize = 250;
const spreadsheetIds = configuredWorkbooks.map(([, , id]) => String(id));

function settingKey(setting) {
    return setting.replace(/_SPREADSHEET_ID$/i, '').toLowerCase();
}

function getSourceKey(sources) {
    const settings = [...new Set(sources.map(source => source.setting))];
    const slug = settingKey(settings[0] || 'unknown_source');
    return sources.length > 1 ? `shared_${slug}` : `${sources[0].portal === 'Student Portal' ? 'student' : 'tpo'}_${slug}`;
}

function isNonemptyRow(row) {
    return (row || []).some(value => String(value ?? '').trim() !== '');
}

function normalizeHeader(header) {
    return String(header || '').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function makeFields(headers, cells) {
    const fields = {};
    for (let index = 0; index < headers.length; index += 1) {
        const rawName = String(headers[index] || '').trim();
        if (!rawName) continue;
        const baseName = rawName;
        let name = baseName;
        let suffix = 2;
        while (Object.prototype.hasOwnProperty.call(fields, name)) name = `${baseName}#${suffix++}`;
        fields[name] = cells[index] ?? '';
    }
    return fields;
}

function isBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ''));
}

async function protectPasswordFields(headers, cells, sourceKey, tabName) {
    let hashed = 0;
    let unsupported = 0;
    const nextCells = [...cells];
    for (let index = 0; index < headers.length; index += 1) {
        if (!['password', 'password_hash'].includes(normalizeHeader(headers[index]))) continue;
        const password = String(nextCells[index] ?? '');
        if (!password) continue;

        if (tabName === 'Data' && sourceKey.includes('student_data')) {
            if (!isBcryptHash(password)) {
                nextCells[index] = await bcrypt.hash(password, 10);
                hashed += 1;
            }
        } else if (['Contact', 'User'].includes(tabName)) {
            if (isBcryptHash(password)) {
                unsupported += 1;
            } else if (!isScryptPasswordHash(password)) {
                nextCells[index] = await hashTpoPassword(password, { allowShortLegacy: true });
                hashed += 1;
            }
        } else if (!isBcryptHash(password) && !isScryptPasswordHash(password)) {
            nextCells[index] = await bcrypt.hash(password, 10);
            hashed += 1;
        }
    }
    return { cells: nextCells, hashed, unsupported };
}

function makeFingerprint(headers, cells) {
    const safeCells = cells.map((value, index) => {
        if (['password', 'password_hash'].includes(normalizeHeader(headers[index]))) {
            return value ? '[password-hash-present]' : '';
        }
        return value;
    });
    return crypto.createHash('sha256').update(JSON.stringify({ headers, cells: safeCells })).digest('hex');
}

function getStableStudentRoll(headers, fields) {
    const normalizedHeaders = headers.map(normalizeHeader);
    const candidates = ['ipcs_roll_number', 'roll_no', 'roll_number'];
    const index = candidates.map(candidate => normalizedHeaders.indexOf(candidate)).find(candidateIndex => candidateIndex >= 0);
    const value = index === undefined ? '' : String(fields[headers[index]] || '').trim();
    return value ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function redactError(error) {
    let message = String(error?.message || 'Unknown migration error');
    for (const id of spreadsheetIds) if (id) message = message.split(id).join('[redacted workbook id]');
    return message.slice(0, 4000);
}

async function insertRecords(pool, records) {
    for (let offset = 0; offset < records.length; offset += batchSize) {
        const batch = records.slice(offset, offset + batchSize);
        await pool.query(
            `INSERT INTO source_sheet_records
                (source_key, tab_name, sheet_row_number, row_data_json, row_fingerprint, imported_run_id)
             VALUES ?
             ON DUPLICATE KEY UPDATE
                row_data_json = VALUES(row_data_json),
                row_fingerprint = VALUES(row_fingerprint),
                imported_run_id = VALUES(imported_run_id),
                imported_at = CURRENT_TIMESTAMP`,
            [batch],
        );
    }
}

async function main() {
    if (!process.argv.includes('--apply')) {
        throw new Error('This import writes to the configured MySQL database. Run it with --apply after reviewing the migration plan.');
    }

    const pool = mysqlPool.getPool();
    const runId = crypto.randomUUID();
    let recordCount = 0;
    let tabCount = 0;
    let passwordHashCount = 0;
    let unsupportedPasswordHashCount = 0;
    let repeatedRollCount = 0;
    const rollNumbers = new Set();
    let workbookCount = 0;

    await pool.execute('INSERT INTO source_import_runs (id, status) VALUES (?, ?)', [runId, 'running']);
    try {
        const grouped = new Map();
        for (const [portal, setting, spreadsheetId, auth] of configuredWorkbooks) {
            const entry = grouped.get(String(spreadsheetId));
            if (entry) entry.sources.push({ portal, setting });
            else grouped.set(String(spreadsheetId), { sources: [{ portal, setting }], auth });
        }
        workbookCount = grouped.size;

        for (const [spreadsheetId, source] of grouped) {
            const sourceKey = getSourceKey(source.sources);
            const sheetsApi = google.sheets({ version: 'v4', auth: source.auth });
            const metadata = await sheetsApi.spreadsheets.get({
                spreadsheetId,
                fields: 'sheets(properties(title))',
            });
            const sheets = metadata.data.sheets || [];
            const ranges = sheets.map(sheet => `'${String(sheet.properties.title).replace(/'/g, "''")}'!A:ZZ`);
            const response = ranges.length
                ? await sheetsApi.spreadsheets.values.batchGet({
                    spreadsheetId,
                    ranges,
                    majorDimension: 'ROWS',
                    valueRenderOption: 'FORMATTED_VALUE',
                })
                : { data: { valueRanges: [] } };

            for (const [sheetIndex, sheet] of sheets.entries()) {
                const tabName = sheet.properties.title;
                const rows = response.data.valueRanges?.[sheetIndex]?.values || [];
                const headerRowIndex = rows.findIndex(isNonemptyRow);
                const headers = headerRowIndex >= 0 ? (rows[headerRowIndex] || []).map(value => String(value ?? '')) : [];
                const headerRowNumber = headerRowIndex >= 0 ? headerRowIndex + 1 : null;
                const manifest = [sourceKey, tabName, JSON.stringify(source.sources), JSON.stringify(headers), headerRowNumber, 0, runId];
                await pool.query(
                    `INSERT INTO source_sheet_manifest
                        (source_key, tab_name, workbook_sources, headers_json, header_row_number, imported_record_count, imported_run_id)
                     VALUES (?, ?, ?, ?, ?, 0, ?)
                     ON DUPLICATE KEY UPDATE
                        workbook_sources = VALUES(workbook_sources),
                        headers_json = VALUES(headers_json),
                        header_row_number = VALUES(header_row_number),
                        imported_record_count = 0,
                        imported_run_id = VALUES(imported_run_id),
                        imported_at = CURRENT_TIMESTAMP`,
                    manifest.slice(0, 5).concat(runId),
                );

                const pending = [];
                for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
                    if (rowIndex === headerRowIndex || !isNonemptyRow(rows[rowIndex])) continue;
                    const sheetRowNumber = rowIndex + 1;
                    const originalCells = [...rows[rowIndex]];
                    const passwordResult = await protectPasswordFields(headers, originalCells, sourceKey, tabName);
                    passwordHashCount += passwordResult.hashed;
                    unsupportedPasswordHashCount += passwordResult.unsupported;
                    const cells = passwordResult.cells;
                    const fields = makeFields(headers, cells);
                    if (tabName === 'Data') {
                        const rollNumber = getStableStudentRoll(headers, fields);
                        if (rollNumber) {
                            if (rollNumbers.has(rollNumber)) repeatedRollCount += 1;
                            else rollNumbers.add(rollNumber);
                        }
                    }
                    const rowData = { fields, cells };
                    const fingerprint = makeFingerprint(headers, cells);
                    pending.push([sourceKey, tabName, sheetRowNumber, JSON.stringify(rowData), fingerprint, runId]);
                    if (pending.length >= batchSize) {
                        await insertRecords(pool, pending);
                        recordCount += pending.length;
                        pending.length = 0;
                    }
                }
                if (pending.length) {
                    await insertRecords(pool, pending);
                    recordCount += pending.length;
                }
                await pool.execute(
                    'UPDATE source_sheet_manifest SET imported_record_count = ? WHERE source_key = ? AND tab_name = ?',
                    [rows.filter((row, index) => index !== headerRowIndex && isNonemptyRow(row)).length, sourceKey, tabName],
                );
                await pool.execute(
                    'DELETE FROM source_sheet_records WHERE source_key = ? AND tab_name = ? AND imported_run_id <> ?',
                    [sourceKey, tabName, runId],
                );
                tabCount += 1;
            }
            console.log(`Imported snapshot rows from ${sourceKey}.`);
        }

        await pool.execute(
            `UPDATE source_import_runs SET completed_at = CURRENT_TIMESTAMP, status = 'completed',
                workbook_count = ?, tab_count = ?, record_count = ?, password_hash_count = ?, repeated_student_roll_count = ?,
                warning_message = ?
             WHERE id = ?`,
            [workbookCount, tabCount, recordCount, passwordHashCount, repeatedRollCount,
                unsupportedPasswordHashCount ? `${unsupportedPasswordHashCount} TPO password values use bcrypt, which TPO's current sign-in does not verify; values were preserved and not rewritten.` : null, runId],
        );
        console.log(JSON.stringify({ status: 'completed', workbooks: workbookCount, tabs: tabCount, records: recordCount, legacyPasswordsConverted: passwordHashCount, unsupportedPasswordHashesPreserved: unsupportedPasswordHashCount, repeatedStudentRollNumbers: repeatedRollCount }));
        console.log('Google Sheet values were read only. The configured MySQL database now contains an auditable source snapshot; this step does not switch portal runtime routes.');
    } catch (error) {
        const safeMessage = redactError(error);
        await pool.execute(
            `UPDATE source_import_runs SET completed_at = CURRENT_TIMESTAMP, status = 'failed',
                workbook_count = ?, tab_count = ?, record_count = ?, password_hash_count = ?,
                repeated_student_roll_count = ?, error_message = ? WHERE id = ?`,
            [workbookCount, tabCount, recordCount, passwordHashCount, repeatedRollCount, safeMessage, runId],
        ).catch(() => {});
        console.error(`Sheet import failed after ${recordCount} rows: ${safeMessage}`);
        process.exitCode = 1;
    } finally {
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Sheet import could not start: ${redactError(error)}`);
    process.exitCode = 1;
});
