const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const studentBackend = path.join(projectRoot, 'backend');
const tpoBackend = path.resolve(projectRoot, '../IPCS TPO Portal/backend');
const requireFromStudentBackend = moduleName => require(require.resolve(moduleName, { paths: [studentBackend] }));
const { google } = requireFromStudentBackend('googleapis');
const dotenv = requireFromStudentBackend('dotenv');

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

const workbookSources = [
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

function headerKey(header) {
    return String(header || '').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function stableKeyForRow(tabName, headers, row) {
    const normalizedHeaders = headers.map(headerKey);
    const pick = names => {
        const index = names.map(headerKey).map(name => normalizedHeaders.indexOf(name)).find(index => index >= 0);
        return index === undefined ? '' : String(row[index] || '').trim().toLowerCase();
    };

    if (tabName === 'Data') return pick(['IPCS Roll Number', 'Roll No', 'Roll Number']);
    if (tabName === 'NewsLetter') return pick(['JOBID', 'Job ID']);
    if (['Asset_Register_V3', 'Asset_Inventory_V3'].includes(tabName)) return pick(['Asset_ID', 'Item_ID']);
    if (tabName === 'Contact' || tabName === 'User') return pick(['Mail ID', 'Email']);
    return '';
}

async function main() {
    const byId = new Map();
    for (const [portal, setting, spreadsheetId, auth] of workbookSources) {
        const existing = byId.get(spreadsheetId);
        if (existing) existing.sources.push(`${portal}:${setting}`);
        else byId.set(spreadsheetId, { sources: [`${portal}:${setting}`], auth });
    }

    const report = [];
    let totalRows = 0;
    for (const [spreadsheetId, source] of byId) {
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
                valueRenderOption: 'UNFORMATTED_VALUE',
            })
            : { data: { valueRanges: [] } };

        for (const [index, sheet] of sheets.entries()) {
            const values = response.data.valueRanges?.[index]?.values || [];
            const title = sheet.properties.title;
            const nonempty = values.filter(row => row.some(value => String(value ?? '').trim() !== ''));
            const headers = nonempty[0] || [];
            const records = headers.length ? nonempty.slice(1) : nonempty;
            const seen = new Set();
            let duplicateStableKeys = 0;
            for (const row of records) {
                const key = stableKeyForRow(title, headers, row);
                if (!key) continue;
                if (seen.has(key)) duplicateStableKeys += 1;
                else seen.add(key);
            }
            totalRows += records.length;
            report.push({
                source: source.sources.join(', '),
                tab: title,
                rows: records.length,
                duplicateStableKeys,
            });
        }
    }

    console.log(JSON.stringify({ workbookCount: byId.size, tabCount: report.length, dataRows: totalRows }));
    for (const item of report) console.log(JSON.stringify(item));
    console.log('No cell contents or workbook IDs were printed. Asset legacy workbook was intentionally excluded.');
}

main().catch(error => {
    console.error(`Sheet preview failed: ${error.message}`);
    process.exitCode = 1;
});
