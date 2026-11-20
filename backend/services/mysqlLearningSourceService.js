const mysqlPool = require('../config/mysqlPool');

const normalizeEmail = value => String(value ?? '').trim().toLocaleLowerCase('en-US');
const normalizeKey = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');

function parseJson(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function getField(fields, wantedNames) {
    const wanted = new Set(wantedNames.map(normalizeKey));
    for (const [name, value] of Object.entries(fields || {})) {
        if (wanted.has(normalizeKey(name)) && value !== undefined && value !== null) return value;
    }
    return '';
}

async function getArchivedTabRows(sourceKey, tabName) {
    const pool = mysqlPool.getPool();
    const [[manifest]] = await pool.execute(
        `SELECT headers_json FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ? LIMIT 1`,
        [sourceKey, tabName],
    );
    if (!manifest) return [];

    const [records] = await pool.execute(
        `SELECT row_data_json FROM source_sheet_records
         WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
        [sourceKey, tabName],
    );
    const headers = parseJson(manifest.headers_json, []);
    return [headers, ...records.map(record => {
        const row = parseJson(record.row_data_json, {});
        return Array.isArray(row.cells) ? row.cells : [];
    })];
}

async function getStudentMaterialAccess(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return { allowed: false, courses: new Set() };

    const pool = mysqlPool.getPool();
    const [rows] = await pool.execute(
        `SELECT u.status AS user_status, sp.status AS student_status,
                sp.metadata AS profile_metadata, c.name AS course_name
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN courses c ON c.id = sp.course_id
         WHERE u.normalized_email = ? AND u.role = 'student'
         LIMIT 2`,
        [normalizedEmail],
    );
    if (rows.length !== 1
        || String(rows[0].user_status || '').toLowerCase() !== 'active'
        || String(rows[0].student_status || '').toLowerCase() !== 'active') {
        return { allowed: false, courses: new Set() };
    }

    const metadata = parseJson(rows[0].profile_metadata, {});
    const fields = metadata.fields || {};
    const access = String(getField(fields, ['Study Material Access']) || '').trim().toLowerCase();
    if (!['yes', 'true', '1'].includes(access)) return { allowed: false, courses: new Set() };

    const course = String(rows[0].course_name || '').trim();
    if (!course) return { allowed: false, courses: new Set() };

    const courseRows = await getArchivedTabRows('shared_learning', 'Courses');
    const { getCourseAccess } = require('./courseService');
    return { allowed: true, courses: getCourseAccess(course, courseRows) };
}

module.exports = { getArchivedTabRows, getStudentMaterialAccess };
