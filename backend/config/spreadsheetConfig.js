const WORKBOOK_ENV_BY_SHEET = new Map();
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

    // Never silently fall back to a production workbook. Render, Hostinger,
    // and local development must each explicitly select their storage targets.
    const workbookId = String(process.env[envName] || '').trim();
    if (!workbookId) throw new Error(`${envName} is not configured for the ${sheetName} worksheet.`);
    if (explicitSpreadsheetId && explicitSpreadsheetId !== workbookId) {
        throw new Error(`The ${sheetName} worksheet must use its assigned ${envName} workbook.`);
    }
    return workbookId;
};

const hasSpreadsheetId = (sheetOrRange) => {
    try {
        return Boolean(getSpreadsheetId(sheetOrRange));
    } catch {
        return false;
    }
};

module.exports = { getSpreadsheetId, hasSpreadsheetId };
