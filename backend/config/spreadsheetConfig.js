const WORKBOOK_ENV_BY_SHEET = new Map();
const DEFAULT_WORKBOOK_IDS = {
    STUDENT_DATA_SPREADSHEET_ID: '14WvBO50cY66NLQVQXs1OrR-jcOD6AQSKz9Yya60KG3o',
    PLACEMENT_SPREADSHEET_ID: '1eSMP6u8G11ErXOYS1XTU0qR4RvyCNcFQtP19dHkNz5c',
    LEARNING_SPREADSHEET_ID: '18alS1bVj33kZ8wX7VcQiwrPzLSfOyQWkc8fRooTD7Nk',
    OPERATIONS_SPREADSHEET_ID: '1qLS3e0xJX0IVhNoGFGM8uPtet7mxI6QHzpz-AwfoBnI',
};
const registerSheets = (envName, sheetNames) => {
    for (const sheetName of sheetNames) {
        WORKBOOK_ENV_BY_SHEET.set(normalizeSheetName(sheetName), envName);
    }
};

function normalizeSheetName(sheetName) {
    return String(sheetName || '').trim().replace(/^'+|'+$/g, '').replace(/''/g, "'").toLowerCase().replace(/[^a-z0-9]/g, '');
}

registerSheets('STUDENT_DATA_SPREADSHEET_ID', [
    'Data',
    'Student_Diary',
    'Leave_Applications',
]);

registerSheets('PLACEMENT_SPREADSHEET_ID', [
    'NewsLetter',
    'Event',
    'Drive_Registration',
    'Opening_Applied',
    'Clients',
    'TPO_Log',
    'TPO_Stats',
    'Corporate Training Inquiries',
    'Hiring Inquiries',
]);

registerSheets('LEARNING_SPREADSHEET_ID', [
    'Courses',
    'Study_Materials',
    'Talentino_Schedule',
    'Talentino_Attendance',
    'Aptitude_Questions',
    'Aptitude_Results',
    'Talentino_Questions',
    'Talentino_Results',
    'Tech_Questions',
    'Tech_Results',
    'Training',
    'Batches',
    'Topics',
    'Sessions',
    'Attendance',
    'Progress',
    'Diary',
    'Assignments',
    'Assessments',
    'Certificates',
]);

registerSheets('OPERATIONS_SPREADSHEET_ID', [
    'Contact',
    'User',
    'Branches',
    'Issues',
    'Security_Logs',
    'Auth_Sessions',
    'Password_Reset_Tokens',
    'Mail',
    'EmailQueue',
    'EmailQuotaUsage',
    'Trainer/TL_Log',
]);

const getSpreadsheetId = (sheetOrRange, explicitSpreadsheetId) => {
    const range = String(sheetOrRange || '');
    const sheetName = range.split('!')[0];
    const normalizedName = normalizeSheetName(sheetName);
    let envName = WORKBOOK_ENV_BY_SHEET.get(normalizedName);
    // GamePal and supporting audit worksheets are part of the Learning workbook.
    if (!envName && (normalizedName.startsWith('gamepal') || normalizedName.includes('audit'))) {
        envName = 'LEARNING_SPREADSHEET_ID';
    }
    if (!envName) throw new Error(`No spreadsheet is configured for the ${sheetName || 'requested'} worksheet.`);

    const workbookId = process.env[envName] || DEFAULT_WORKBOOK_IDS[envName];
    if (!workbookId) throw new Error(`${envName} is not configured for the ${sheetName} worksheet.`);
    if (explicitSpreadsheetId && explicitSpreadsheetId !== workbookId) {
        throw new Error(`The ${sheetName} worksheet must use its assigned ${envName} workbook.`);
    }
    return workbookId;
};

const hasSpreadsheetId = (sheetOrRange) => Boolean(getSpreadsheetId(sheetOrRange));

module.exports = { getSpreadsheetId, hasSpreadsheetId };
