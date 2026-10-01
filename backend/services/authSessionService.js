const DatabaseService = require('./dbService');

const SESSION_SHEET = 'Auth_Sessions';
const SESSION_HEADERS = ['Email', 'Session Version', 'Updated At'];
let setupPromise = null;

const cleanEmail = (email) => String(email || '').trim().toLowerCase();

const ensureSessionSheet = async () => {
    if (!setupPromise) {
        setupPromise = DatabaseService.ensureWorksheetWithHeaders(SESSION_SHEET, SESSION_HEADERS)
            .catch((error) => {
                setupPromise = null;
                throw error;
            });
    }
    return setupPromise;
};

const findLatest = (rows, email) => {
    const wanted = cleanEmail(email);
    for (let index = (rows || []).length - 1; index >= 1; index--) {
        if (cleanEmail(rows[index]?.[0]) === wanted) {
            return { rowIndex: index + 1, version: String(rows[index]?.[1] || '0') };
        }
    }
    return null;
};

const getSessionVersion = async (email, cacheSeconds = 5) => {
    await ensureSessionSheet();
    const rows = await DatabaseService.getSheetData(`${SESSION_SHEET}!A:C`, process.env.SPREADSHEET_ID, cacheSeconds);
    return findLatest(rows, email)?.version || '0';
};

const ensureSessionRecord = async (email) => {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) throw new Error('A student email is required for session tracking.');
    await ensureSessionSheet();
    const rows = await DatabaseService.getSheetData(`${SESSION_SHEET}!A:C`, process.env.SPREADSHEET_ID, 0);
    const existing = findLatest(rows, normalizedEmail);
    if (existing) return existing;

    await DatabaseService.appendRowRaw(`${SESSION_SHEET}!A:C`, [normalizedEmail, '0', new Date().toISOString()]);
    const refreshedRows = await DatabaseService.getSheetData(`${SESSION_SHEET}!A:C`, process.env.SPREADSHEET_ID, 0);
    const inserted = findLatest(refreshedRows, normalizedEmail);
    if (!inserted) throw new Error('Could not create the student session record.');
    return inserted;
};

module.exports = { ensureSessionSheet, ensureSessionRecord, getSessionVersion };
