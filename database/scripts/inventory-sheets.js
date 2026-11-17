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
    ['TPO Portal', 'ASSET_LEGACY_SPREADSHEET_ID', tpoEnv.ASSET_LEGACY_SPREADSHEET_ID, tpoAuth],
].filter(([, , spreadsheetId]) => String(spreadsheetId || '').trim());

function quoteSheetTitle(title) {
    return `'${String(title).replace(/'/g, "''")}'!1:1`;
}

async function main() {
    const groupedBySpreadsheet = new Map();
    for (const [portal, setting, spreadsheetId, auth] of configuredWorkbooks) {
        const existing = groupedBySpreadsheet.get(spreadsheetId);
        if (existing) {
            existing.sources.push(`${portal}:${setting}`);
        } else {
            groupedBySpreadsheet.set(spreadsheetId, { sources: [`${portal}:${setting}`], auth });
        }
    }

    console.log(JSON.stringify({ workbookCount: groupedBySpreadsheet.size, note: 'Workbook IDs and cell values are intentionally not printed.' }));
    for (const [spreadsheetId, source] of groupedBySpreadsheet) {
        const sheetsApi = google.sheets({ version: 'v4', auth: source.auth });
        try {
            const metadata = await sheetsApi.spreadsheets.get({
                spreadsheetId,
                fields: 'sheets(properties(title,gridProperties(rowCount,columnCount)))',
            });
            const sheets = metadata.data.sheets || [];
            const ranges = sheets.map(sheet => quoteSheetTitle(sheet.properties.title));
            const headerResponse = ranges.length
                ? await sheetsApi.spreadsheets.values.batchGet({
                    spreadsheetId,
                    ranges,
                    majorDimension: 'ROWS',
                    valueRenderOption: 'FORMATTED_VALUE',
                })
                : { data: { valueRanges: [] } };
            const valueRanges = headerResponse.data.valueRanges || [];
            console.log(JSON.stringify({ workbookSources: source.sources, tabCount: sheets.length }));
            sheets.forEach((sheet, index) => {
                const title = sheet.properties.title;
                const header = valueRanges[index]?.values?.[0] || [];
                console.log(JSON.stringify({ source: source.sources.join(', '), tab: title, headers: header }));
            });
        } catch (error) {
            console.log(JSON.stringify({ workbookSources: source.sources, error: error.message }));
        }
    }
}

main().catch(error => {
    console.error(`Sheet inventory failed: ${error.message}`);
    process.exitCode = 1;
});
