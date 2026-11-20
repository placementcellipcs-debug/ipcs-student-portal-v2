const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { getArchivedTabRows } = require('./mysqlLearningSourceService');
const { parseSourceDateTime } = require('../utils/sourceDateTime');

const SHEET_HEADERS = [
    'Timestamp', 'Email', 'Name', 'Roll No', 'Branch', 'Course', 'Date', 'Record Type',
    'Status', 'Topic', 'Syllabus Completed (%)', 'Remarks', 'Latitude', 'Longitude', 'Distance (m)',
];
const normalizeEmail = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');

function parseJson(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function metadataField(metadata, fieldName) {
    const fields = metadata?.fields || {};
    const wanted = String(fieldName).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, value] of Object.entries(fields)) {
        if (String(key).toLowerCase().replace(/[^a-z0-9]/g, '') === wanted && value !== undefined && value !== null) return value;
    }
    return '';
}

async function getStudent(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const [rows] = await mysqlPool.query(
        `SELECT u.id AS user_id, u.email, u.full_name, u.phone, u.status AS user_status,
                sp.id AS student_profile_id, sp.roll_number, sp.personal_email, sp.phone AS profile_phone,
                sp.profile_photo_url, sp.status AS student_status, sp.metadata AS profile_metadata,
                c.name AS course_name, b.name AS branch_name
         FROM users u JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN courses c ON c.id = sp.course_id
         LEFT JOIN branches b ON b.id = sp.branch_id
         WHERE u.normalized_email = ? AND u.role = 'student' LIMIT 2`,
        [normalized],
    );
    if (rows.length !== 1) return null;
    const row = rows[0];
    if (String(row.user_status || '').toLowerCase() !== 'active'
        || String(row.student_status || '').toLowerCase() !== 'active') return null;
    const metadata = parseJson(row.profile_metadata, {});
    return {
        userId: row.user_id,
        studentProfileId: row.student_profile_id,
        email: row.email,
        name: row.full_name || 'Student',
        phone: row.phone || row.profile_phone || '',
        rollNo: row.roll_number || metadataField(metadata, 'IPCS Roll Number') || '',
        joiningDate: metadataField(metadata, 'Joining Date'),
        course: row.course_name || metadataField(metadata, 'Course') || '',
        branch: row.branch_name || metadataField(metadata, 'Branch') || '',
        photo: row.profile_photo_url || metadataField(metadata, 'Profile Photo') || '',
    };
}

async function getStudentDiaryRows(email) {
    const normalized = normalizeEmail(email);
    const [rows] = await mysqlPool.query(
        `SELECT source_cells_json
         FROM student_diary_entries
         WHERE normalized_student_email = ?
         ORDER BY source_row_number IS NULL, source_row_number, created_at, id`,
        [normalized],
    );
    return [SHEET_HEADERS, ...rows.map(row => {
        const cells = parseJson(row.source_cells_json, []);
        return Array.isArray(cells) ? cells : [];
    })];
}

class DiaryAttendanceAlreadyMarked extends Error {
    constructor() {
        super('Your class attendance is already marked for today.');
        this.code = 'DIARY_ATTENDANCE_ALREADY_MARKED';
    }
}

async function markAttendance({ student, email, timestamp, dateText, dateIso, latitude, longitude, distance }) {
    const connection = await mysqlPool.getPool().getConnection();
    try {
        await connection.beginTransaction();
        const [profiles] = await connection.execute(
            'SELECT id FROM student_profiles WHERE id = ? FOR UPDATE',
            [student.studentProfileId],
        );
        if (!profiles.length) throw new Error('Student profile was not found.');
        const [existing] = await connection.execute(
            `SELECT id FROM student_diary_entries
             WHERE student_profile_id = ? AND diary_date = ? AND UPPER(record_type) = 'ATTENDANCE'
             LIMIT 1`,
            [student.studentProfileId, dateIso],
        );
        if (existing.length) throw new DiaryAttendanceAlreadyMarked();

        const cells = [timestamp, email, student.name, student.rollNo, student.branch, student.course,
            dateText, 'ATTENDANCE', 'Present', '', '', '', latitude, longitude, distance];
        const id = crypto.randomUUID();
        const sourceRecordKey = `runtime:${id}`;
        await connection.execute(
            `INSERT INTO student_diary_entries
                (id, source_record_key, source_key, source_tab, user_id, student_profile_id,
                 student_email, normalized_student_email, student_name, roll_number, branch_name, course_name,
                 source_timestamp, occurred_at, source_date, diary_date, record_type, status, latitude,
                 longitude, distance_meters, source_cells_json)
             VALUES (?, ?, 'mysql_runtime', 'Student_Diary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     'ATTENDANCE', 'Present', ?, ?, ?, ?)` ,
            [id, sourceRecordKey, student.userId, student.studentProfileId, student.email,
                normalizeEmail(student.email), student.name, student.rollNo, student.branch, student.course,
                timestamp, parseSourceDateTime(timestamp), dateText, dateIso, latitude, longitude, distance,
                JSON.stringify(cells)],
        );
        await connection.execute(
            `INSERT INTO audit_events
                (id, actor_user_id, action, entity_type, entity_id, occurred_at, details)
             VALUES (?, ?, 'student_diary_attendance_marked', 'student_diary_entry', ?, UTC_TIMESTAMP(), ?)` ,
            [crypto.randomUUID(), student.userId, id, JSON.stringify({ date: dateIso })],
        );
        await connection.commit();
        return { timestamp, date: dateText, status: 'Present', distanceMeters: distance };
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    DiaryAttendanceAlreadyMarked,
    getStudent,
    getStudentDiaryRows,
    getArchivedTabRows,
    markAttendance,
};
