const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { formatDateTimeIndia, formatDateInputIndia } = require('../utils/portalDateTime');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalizeEmail = value => text(value).toLocaleLowerCase('en-US');

class LeaveRequestError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function parseMysqlDate(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getUTCDate().toString().padStart(2, '0')}/${(value.getUTCMonth() + 1).toString().padStart(2, '0')}/${value.getUTCFullYear()}`;
    }
    const raw = String(value).slice(0, 10);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return text(value);
}

function serialize(row) {
    const requestedAt = row.requested_at instanceof Date
        ? formatDateTimeIndia(row.requested_at)
        : (row.requested_at ? formatDateTimeIndia(new Date(`${String(row.requested_at).replace(' ', 'T')}Z`)) : '');
    return {
        timestamp: text(row.requested_at_raw) || requestedAt,
        startDate: text(row.start_date_raw) || parseMysqlDate(row.start_date),
        endDate: text(row.end_date_raw) || parseMysqlDate(row.end_date),
        type: text(row.request_type) || 'Leave Request',
        reason: text(row.reason),
        status: text(row.status) || 'Pending',
    };
}

async function findStudentByEmail(email, connection = null) {
    const normalizedEmail = normalizeEmail(email);
    const executor = connection || mysqlPool.getPool();
    const [rows] = await executor.execute(
        `SELECT sp.id AS student_id, sp.roll_number, sp.branch_id, sp.course_id,
                u.email, u.full_name, b.name AS branch_name, c.name AS course_name
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN branches b ON b.id = sp.branch_id
         LEFT JOIN courses c ON c.id = sp.course_id
         WHERE u.normalized_email = ? AND u.role = 'student'
           AND u.status = 'active' AND sp.status = 'active'
         LIMIT 2`,
        [normalizedEmail],
    );
    if (rows.length > 1) throw new LeaveRequestError(409, 'STUDENT_IDENTITY_AMBIGUOUS', 'Your student profile needs staff review before a request can be submitted.');
    return rows[0] || null;
}

async function listStudentLeaveRequests(email, connection = null) {
    const student = await findStudentByEmail(email, connection);
    if (!student) return null;
    const executor = connection || mysqlPool.getPool();
    const [rows] = await executor.execute(
        `SELECT requested_at, requested_at_raw, start_date, end_date, start_date_raw, end_date_raw,
                request_type, reason, status, source_row_number
         FROM student_leave_requests
         WHERE student_id = ? OR (student_id IS NULL AND LOWER(student_email) = ?)
         ORDER BY COALESCE(requested_at, created_at) DESC, source_row_number DESC, created_at DESC`,
        [student.student_id, normalizeEmail(email)],
    );
    return rows.map(serialize);
}

function validateRequest({ startDate, endDate, type, reason }) {
    const isoDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T12:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!isoDate(startDate) || !isoDate(endDate) || startDate > endDate) {
        throw new LeaveRequestError(400, 'INVALID_LEAVE_DATES', 'Choose a valid date or date range.');
    }
    if (!['Leave Request', 'Absence Notice'].includes(type)) {
        throw new LeaveRequestError(400, 'INVALID_LEAVE_TYPE', 'Choose whether you are requesting leave or reporting an absence.');
    }
    if (reason.length < 10 || reason.length > 1000) {
        throw new LeaveRequestError(400, 'INVALID_LEAVE_REASON', 'Please provide a reason between 10 and 1,000 characters.');
    }
}

async function submitStudentLeaveRequest(email, input, connection = null) {
    const normalizedEmail = normalizeEmail(email);
    const startDate = text(input?.startDate);
    const endDate = text(input?.endDate);
    const type = text(input?.type);
    const reason = text(input?.reason);
    validateRequest({ startDate, endDate, type, reason });

    const student = await findStudentByEmail(normalizedEmail, connection);
    if (!student) throw new LeaveRequestError(404, 'STUDENT_PROFILE_NOT_FOUND', 'Student profile was not found.');

    const id = crypto.randomUUID();
    const status = type === 'Absence Notice' ? 'Notified' : 'Pending';
    const startDateRaw = formatDateInputIndia(startDate);
    const endDateRaw = formatDateInputIndia(endDate);
    const requestedAtRaw = formatDateTimeIndia();
    const executor = connection || mysqlPool.getPool();
    await executor.execute(
        `INSERT INTO student_leave_requests
           (id, student_id, student_email, student_name, roll_number, branch_id, course_id,
            branch_name, course_name, start_date, end_date, start_date_raw, end_date_raw,
            request_type, reason, status, requested_at, requested_at_raw, source, source_record_key,
            metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, 'student_portal', ?, JSON_OBJECT('origin', 'student_portal'))`,
        [id, student.student_id, normalizedEmail, text(student.full_name) || 'Student', text(student.roll_number) || null,
            student.branch_id, student.course_id, student.branch_name, student.course_name,
            startDate, endDate, startDateRaw, endDateRaw, type, reason, status, requestedAtRaw, id],
    );

    return {
        id,
        message: type === 'Absence Notice' ? 'Your absence has been recorded.' : 'Your leave request has been submitted.',
        record: { startDate: startDateRaw, endDate: endDateRaw, type, reason, status, timestamp: requestedAtRaw },
    };
}

module.exports = { LeaveRequestError, findStudentByEmail, listStudentLeaveRequests, parseMysqlDate, serialize, submitStudentLeaveRequest, validateRequest };
