const DatabaseService = require('./dbService');
const mysqlPool = require('../config/mysqlPool');
const { isMysqlFeatureEnabled } = require('./mysqlFeatureFlags');
const { formatDateTimeIndia } = require('../utils/portalDateTime');

const SESSION_SHEET = 'Auth_Sessions';
const SESSION_HEADERS = ['Email', 'Session Version', 'Updated At'];
let setupPromise = null;

const cleanEmail = (email) => String(email || '').trim().toLowerCase();
const usesMysqlAuth = () => isMysqlFeatureEnabled('MYSQL_STUDENT_AUTH_ENABLED');

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
    if (usesMysqlAuth()) {
        const [rows] = await mysqlPool.query(
            `SELECT u.session_version FROM users u
             JOIN student_profiles sp ON sp.user_id = u.id
             WHERE u.normalized_email = ? AND u.role = 'student'
               AND u.status = 'active' AND sp.status <> 'inactive'
             LIMIT 1`,
            [cleanEmail(email)],
        );
        return rows.length ? String(rows[0].session_version || '0') : '';
    }
    await ensureSessionSheet();
    const rows = await DatabaseService.getSheetData(`${SESSION_SHEET}!A:C`, cacheSeconds);
    return findLatest(rows, email)?.version || '0';
};

const ensureSessionRecord = async (email) => {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) throw new Error('A student email is required for session tracking.');
    if (usesMysqlAuth()) {
        const version = await getSessionVersion(normalizedEmail, 0);
        if (version === '') throw new Error('The active student account is not available in MySQL.');
        return { version };
    }
    await ensureSessionSheet();
    const rows = await DatabaseService.getSheetData(`${SESSION_SHEET}!A:C`, 0);
    const existing = findLatest(rows, normalizedEmail);
    if (existing) return existing;

    await DatabaseService.appendRowRaw(`${SESSION_SHEET}!A:C`, [normalizedEmail, '0', formatDateTimeIndia()]);
    const refreshedRows = await DatabaseService.getSheetData(`${SESSION_SHEET}!A:C`, 0);
    const inserted = findLatest(refreshedRows, normalizedEmail);
    if (!inserted) throw new Error('Could not create the student session record.');
    return inserted;
};

module.exports = { ensureSessionSheet, ensureSessionRecord, getSessionVersion };
