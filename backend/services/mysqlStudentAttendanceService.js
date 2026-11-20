const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const mysqlLearningSourceService = require('./mysqlLearningSourceService');

const normalizeEmail = value => String(value ?? '').trim().toLocaleLowerCase('en-US');

class AttendanceAlreadyMarkedError extends Error {
    constructor() {
        super('Attendance Already Marked for today.');
        this.code = 'TALENTINO_ATTENDANCE_ALREADY_MARKED';
    }
}

async function getAttendanceRows() {
    const archivedRows = await mysqlLearningSourceService.getArchivedTabRows('shared_learning', 'Talentino_Attendance');
    const headers = archivedRows[0] || ['Timestamp', 'Email', 'Name', 'Branch', 'Course', 'Location', 'Rating', 'Feedback', 'Date', 'Notes'];
    const [runtimeRows] = await mysqlPool.query(
        `SELECT timestamp_raw, student_email, student_name, branch_name, course_name, latitude, longitude,
                rating, feedback, attendance_date_raw
         FROM talentino_attendance_records ORDER BY attendance_date, created_at`,
    );
    const rows = runtimeRows.map(row => [
        row.timestamp_raw, row.student_email, row.student_name, row.branch_name, row.course_name,
        `${row.latitude},${row.longitude}`, `${row.rating} / 5 Stars`, row.feedback,
        row.attendance_date_raw, 'None',
    ]);
    return [headers, ...archivedRows.slice(1), ...rows];
}

async function saveAttendance({ email, latitude, longitude, rating, feedback, attendanceDate, attendanceDateRaw,
    timestamp, requestId, connection: suppliedConnection = null }) {
    const normalizedEmail = normalizeEmail(email);
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const [profiles] = await connection.execute(
            `SELECT u.id AS user_id, u.full_name, u.email, sp.id AS student_profile_id,
                    c.name AS course_name, b.name AS branch_name
             FROM users u JOIN student_profiles sp ON sp.user_id = u.id
             LEFT JOIN courses c ON c.id = sp.course_id
             LEFT JOIN branches b ON b.id = sp.branch_id
             WHERE u.normalized_email = ? AND u.role = 'student'
               AND u.status = 'active' AND sp.status = 'active'
             LIMIT 2 FOR UPDATE`,
            [normalizedEmail],
        );
        if (!profiles.length) throw Object.assign(new Error('Student profile was not found.'), { status: 404, code: 'STUDENT_PROFILE_NOT_FOUND' });
        if (profiles.length > 1) throw Object.assign(new Error('This student profile needs staff review.'), { status: 409, code: 'STUDENT_PROFILE_AMBIGUOUS' });
        const student = profiles[0];
        const [existing] = await connection.execute(
            `SELECT id FROM talentino_attendance_records
             WHERE normalized_student_email = ? AND attendance_date = ? LIMIT 1 FOR UPDATE`,
            [normalizedEmail, attendanceDate],
        );
        if (existing.length) throw new AttendanceAlreadyMarkedError();

        const safeFeedback = String(feedback || '').slice(0, 1000) || 'None';
        const cells = [timestamp, student.email, student.full_name, student.branch_name, student.course_name,
            `${latitude},${longitude}`, `${rating} / 5 Stars`, safeFeedback, attendanceDateRaw, 'None'];
        const id = crypto.randomUUID();
        await connection.execute(
            `INSERT INTO talentino_attendance_records
             (id, user_id, student_profile_id, student_email, normalized_student_email, student_name,
              branch_name, course_name, latitude, longitude, rating, feedback, attendance_date,
              attendance_date_raw, timestamp_raw, source_cells_json, request_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, student.user_id, student.student_profile_id, student.email, normalizedEmail,
                student.full_name, student.branch_name || '', student.course_name || '', latitude, longitude,
                rating, safeFeedback, attendanceDate, attendanceDateRaw, timestamp, JSON.stringify(cells),
                String(requestId || '').trim() || null],
        );
        await connection.execute(
            `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at, request_id, details)
             VALUES (?, ?, 'talentino_attendance_marked', 'talentino_attendance', ?, UTC_TIMESTAMP(), ?, ?)` ,
            [crypto.randomUUID(), student.user_id, id, String(requestId || '').trim() || null,
                JSON.stringify({ date: attendanceDate, rating })],
        );
        if (ownsConnection) await connection.commit();
        return { id };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') throw new AttendanceAlreadyMarkedError();
        throw error;
    } finally { if (ownsConnection) connection.release(); }
}

module.exports = { AttendanceAlreadyMarkedError, getAttendanceRows, saveAttendance };
