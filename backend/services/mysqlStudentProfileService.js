const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { profileFromRow } = require('./mysqlStudentAuthService');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalizeEmail = value => text(value).toLocaleLowerCase('en-US');

class StudentProfileError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function parseMetadata(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
}

async function selectProfile(connection, email, forUpdate = false) {
    const [rows] = await connection.execute(
        `SELECT u.id AS user_id, u.email, u.full_name, u.phone, u.status AS user_status,
                sp.id AS student_id, sp.roll_number, sp.personal_email, sp.phone AS profile_phone,
                sp.resume_url, sp.profile_photo_url, sp.status AS student_status,
                sp.metadata AS profile_metadata, c.name AS course_name, b.name AS branch_name
         FROM users u JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN courses c ON c.id = sp.course_id
         LEFT JOIN branches b ON b.id = sp.branch_id
         WHERE u.normalized_email = ? AND u.role = 'student'
         LIMIT 2${forUpdate ? ' FOR UPDATE' : ''}`,
        [normalizeEmail(email)],
    );
    if (!rows.length) throw new StudentProfileError(404, 'STUDENT_PROFILE_NOT_FOUND', 'Student profile was not found.');
    if (rows.length > 1) throw new StudentProfileError(409, 'STUDENT_PROFILE_AMBIGUOUS', 'This student profile needs staff review before it can be updated.');
    const row = rows[0];
    if (String(row.user_status).toLowerCase() !== 'active' || String(row.student_status).toLowerCase() !== 'active') {
        throw new StudentProfileError(403, 'STUDENT_PROFILE_INACTIVE', 'This student account is inactive. Contact IPCS support.');
    }
    return row;
}

async function getStudentByEmail(email, suppliedConnection = null) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    const query = `SELECT u.id AS user_id, u.email, u.full_name, u.phone, u.status AS user_status,
                   sp.id AS student_id, sp.roll_number, sp.personal_email, sp.phone AS profile_phone,
                   sp.resume_url, sp.profile_photo_url, sp.status AS student_status,
                   sp.metadata AS profile_metadata, c.name AS course_name, b.name AS branch_name
            FROM users u JOIN student_profiles sp ON sp.user_id = u.id
            LEFT JOIN courses c ON c.id = sp.course_id
            LEFT JOIN branches b ON b.id = sp.branch_id
            WHERE u.normalized_email = ? AND u.role = 'student' LIMIT 2`;
    const [rows] = suppliedConnection
        ? await suppliedConnection.execute(query, [normalizedEmail])
        : await mysqlPool.query(
            query,
            [normalizedEmail],
        );
    if (!rows.length) return null;
    if (rows.length > 1) throw new StudentProfileError(409, 'STUDENT_PROFILE_AMBIGUOUS', 'This student profile needs staff review.');
    const row = rows[0];
    if (String(row.user_status).toLowerCase() !== 'active' || String(row.student_status).toLowerCase() !== 'active') return null;
    return profileFromRow(row);
}

async function writeAudit(connection, row, action, requestId, details) {
    await connection.execute(
        `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at, request_id, details)
         VALUES (?, ?, ?, 'student_profile', ?, UTC_TIMESTAMP(), ?, ?)`,
        [crypto.randomUUID(), row.user_id, action, row.student_id, text(requestId) || null, JSON.stringify(details)],
    );
}

async function updateProfile({ email, values, requestId }, suppliedConnection = null) {
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const row = await selectProfile(connection, email, true);
        const metadata = parseMetadata(row.profile_metadata);
        const fields = { ...(metadata.fields || {}) };
        const nextFields = {
            'Your Home Town': values.homeTown,
            Qualification: values.qualification,
            Stream: values.stream,
            'Status (Fresher / Experienced)': values.fresherStatus,
            'LinkedIn Profile Link': values.linkedin,
            'Instagram ID': values.instagram,
            'Any Specific Requirement For Placement': values.placementReq,
            'Parent Name': values.parentName,
            'Parent Contact': values.parentContact,
            'Course Status': values.studyStatus,
            'IPCS Course Completed Date': values.completedDate,
            Age: values.age,
            Gender: values.gender,
        };
        for (const [key, value] of Object.entries(nextFields)) fields[key] = text(value) || 'N/A';
        const nextMetadata = JSON.stringify({ ...metadata, fields });
        await connection.execute(
            'UPDATE student_profiles SET metadata = ? WHERE id = ?',
            [nextMetadata, row.student_id],
        );
        await writeAudit(connection, row, 'student_profile_updated', requestId, { fields: Object.keys(nextFields) });
        if (ownsConnection) await connection.commit();
        const user = { ...profileFromRow({ ...row, profile_metadata: nextMetadata }) };
        return { user };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        throw error;
    } finally {
        if (ownsConnection) connection.release();
    }
}

async function saveDocument({ email, docType, url, requestId }, suppliedConnection = null) {
    const normalizedType = text(docType);
    const documentUrl = text(url);
    if (!['Photo', 'Resume', 'Certificate'].includes(normalizedType)) {
        throw new StudentProfileError(400, 'INVALID_DOCUMENT_TYPE', 'Choose a valid profile document.');
    }
    let parsedUrl;
    try { parsedUrl = new URL(documentUrl); } catch { throw new StudentProfileError(400, 'INVALID_DOCUMENT_URL', 'The uploaded file link is invalid.'); }
    if (parsedUrl.protocol !== 'https:') throw new StudentProfileError(400, 'INVALID_DOCUMENT_URL', 'The uploaded file link must use HTTPS.');

    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const row = await selectProfile(connection, email, true);
        const metadata = parseMetadata(row.profile_metadata);
        const fields = { ...(metadata.fields || {}) };
        const fieldName = normalizedType === 'Photo' ? 'Profile Photo' : normalizedType;
        fields[fieldName] = documentUrl;
        const nextMetadata = JSON.stringify({ ...metadata, fields });
        if (normalizedType === 'Photo') {
            await connection.execute(
                'UPDATE student_profiles SET profile_photo_url = ?, metadata = ? WHERE id = ?',
                [documentUrl, nextMetadata, row.student_id],
            );
            await connection.execute('UPDATE users SET profile_photo_url = ? WHERE id = ?', [documentUrl, row.user_id]);
        } else if (normalizedType === 'Resume') {
            await connection.execute(
                'UPDATE student_profiles SET resume_url = ?, metadata = ? WHERE id = ?',
                [documentUrl, nextMetadata, row.student_id],
            );
        } else {
            await connection.execute('UPDATE student_profiles SET metadata = ? WHERE id = ?', [nextMetadata, row.student_id]);
        }
        await writeAudit(connection, row, `student_${normalizedType.toLowerCase()}_updated`, requestId, { documentType: normalizedType });
        if (ownsConnection) await connection.commit();
        return { url: documentUrl };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        throw error;
    } finally {
        if (ownsConnection) connection.release();
    }
}

module.exports = { StudentProfileError, getStudentByEmail, saveDocument, updateProfile };
