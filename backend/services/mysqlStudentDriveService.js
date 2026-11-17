const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedKey = value => normalized(value).replace(/[^a-z0-9]/g, '');

class StudentDriveError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function parseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
}

function field(fields, ...aliases) {
    const wanted = new Set(aliases.map(normalizedKey));
    for (const [key, value] of Object.entries(fields || {})) {
        if (wanted.has(normalizedKey(key)) && value !== undefined && value !== null) return text(value);
    }
    return '';
}

function dateKey(value) {
    const raw = text(value).replace(/,/g, '');
    if (!raw || /^tba$/i.test(raw)) return null;
    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
        const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
            ? `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
    }
    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (!match) return null;
    const first = Number(match[1]); const second = Number(match[2]);
    const month = first <= 12 && second > 12 ? first : second;
    const day = first <= 12 && second > 12 ? second : first;
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

function timeText(value) {
    const raw = text(value);
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) return '';
    let hour = Number(match[1]);
    const minute = Number(match[2]); const second = Number(match[3] || 0);
    const meridiem = (match[4] || '').toLowerCase();
    if (minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || (meridiem && hour === 0)) return '';
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function eventStart(fields) {
    const date = dateKey(field(fields, 'Date of the Event', 'Date', 'Event Date'));
    if (!date) return null;
    // Preserve the existing calendar rule: an event with no time stays open
    // until the end of its local calendar day.
    const time = timeText(field(fields, 'Time of the Event', 'Time', 'Event Time')) || '23:59:59';
    return `${date} ${time}`;
}

function isPast(fields, now = new Date()) {
    const start = eventStart(fields);
    if (!start) return false;
    const [date, time] = start.split(' ');
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second] = time.split(':').map(Number);
    const instant = Date.UTC(year, month - 1, day, hour, minute, second) - (330 * 60 * 1000);
    return now.getTime() > instant;
}

function branchMatches(value, branch) {
    const target = normalized(branch).replace(/\s+branch(?:\s+campus)?$/i, '');
    if (!target) return false;
    const items = text(value).split(/[,;|\n]+/).map(item => normalized(item).replace(/\s+branch(?:\s+campus)?$/i, '')).filter(Boolean);
    return !items.length || items.some(item => ['all', 'all branches', 'all campuses', 'all branch'].includes(item) || item === target);
}

function courseMatches(value, studentCourses) {
    const courseItems = text(value).split(/[,;|\n]+/).map(normalized).filter(Boolean);
    return courseItems.some(item => ['all', 'all courses', 'all students'].includes(item) || studentCourses.has(item));
}

function eventView(row) {
    const metadata = parseJson(row.metadata);
    const fields = metadata.fields || {};
    return {
        row,
        fields,
        eventId: text(metadata.externalEventId) || row.id,
        date: field(fields, 'Date of the Event', 'Date', 'Event Date') || 'TBA',
        time: field(fields, 'Time of the Event', 'Time', 'Event Time'),
        branch: field(fields, 'Branch') || 'All',
        course: field(fields, 'Course'),
        type: field(fields, 'Event', 'Event Type', 'Type') || 'GENERAL',
        title: field(fields, 'Title', 'Event Title') || 'Event',
        description: field(fields, 'Descripation', 'Description'),
        location: field(fields, 'Event Happening in', 'Location', 'Venue'),
        posterLink: field(fields, 'Poster Link', 'Poster', 'Image Link'),
        status: field(fields, 'Status'),
    };
}

async function loadStudentContext(connection, email) {
    const [rows] = await connection.execute(
        `SELECT u.id AS user_id, u.email, u.full_name, u.phone, u.status AS user_status,
                sp.id AS student_id, sp.roll_number, sp.personal_email, sp.phone AS profile_phone,
                sp.resume_url, sp.profile_photo_url, sp.status AS student_status,
                sp.metadata AS profile_metadata, c.id AS course_id, c.name AS course_name, c.category AS course_category,
                b.id AS branch_id, b.name AS branch_name
         FROM users u JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN courses c ON c.id = sp.course_id
         LEFT JOIN branches b ON b.id = sp.branch_id
         WHERE u.normalized_email = ? AND u.role = 'student' LIMIT 2`,
        [normalized(email)],
    );
    if (!rows.length) throw new StudentDriveError(404, 'STUDENT_NOT_FOUND', 'Student profile was not found.');
    if (rows.length > 1) throw new StudentDriveError(409, 'STUDENT_AMBIGUOUS', 'This student profile needs staff review.');
    const student = rows[0];
    if (normalized(student.user_status) !== 'active' || normalized(student.student_status) !== 'active') {
        throw new StudentDriveError(403, 'STUDENT_INACTIVE', 'This student account is inactive. Contact IPCS support.');
    }
    const fields = parseJson(student.profile_metadata).fields || {};
    const courseSet = new Set([normalized(student.course_name), normalized(student.course_category)].filter(Boolean));
    if (student.course_category) {
        const [courses] = await connection.execute('SELECT normalized_name FROM courses WHERE category = ? AND active = 1', [student.course_category]);
        for (const row of courses) courseSet.add(normalized(row.normalized_name));
    }
    return {
        ...student,
        fields,
        courseSet,
        name: text(student.full_name) || 'Student',
        phone: text(student.profile_phone || student.phone) || 'N/A',
        resume: text(student.resume_url) || 'N/A',
        qualification: field(fields, 'Qualification') || 'N/A',
        vacancyOpen: field(fields, 'Vacancy Open'),
    };
}

async function getDrivesForStudent(connection, student, { upcomingOnly = false, now = new Date() } = {}) {
    const [rows] = await connection.execute(
        `SELECT id, title, company_name, starts_at, ends_at, location, status, metadata
         FROM drives WHERE source IN ('google_sheets_snapshot', 'tpo_portal_mysql') AND source_record_key LIKE 'Event:%'
         ORDER BY starts_at IS NULL, starts_at, created_at DESC`,
    );
    return rows.flatMap(row => {
        const event = eventView(row);
        if (normalized(row.status) === 'closed' || /^(cancelled|canceled|closed|deleted|inactive|disabled)$/i.test(text(event.status))) return [];
        const placementDrive = /placement\s*drive/i.test(event.type);
        if (placementDrive) {
            if (!courseMatches(event.course, student.courseSet)) return [];
        } else if (!branchMatches(event.branch, student.branch_name)) return [];
        if (upcomingOnly && (!placementDrive || !dateKey(event.date) || isPast(event.fields, now))) return [];
        return [{ ...event, dbId: row.id }];
    });
}

async function getStudentDriveData({ email, connection: suppliedConnection = null }) {
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        const student = await loadStudentContext(connection, email);
        const drives = await getDrivesForStudent(connection, student);
        const [registrations] = await connection.execute(
            `SELECT dr.status, d.metadata
             FROM drive_registrations dr JOIN drives d ON d.id = dr.drive_id
             WHERE dr.student_id = ? ORDER BY dr.registered_at DESC`,
            [student.student_id],
        );
        const driveRSVPs = registrations.map(row => ({ driveId: eventView({ id: '', metadata: row.metadata }).eventId, status: text(row.status) }));
        return {
            events: drives.map(event => ({ date: event.date, branch: event.branch, type: event.type,
                title: event.title, description: event.description, time: event.time, location: event.location,
                posterLink: event.posterLink, id: event.eventId })),
            driveRSVPs,
        };
    } finally {
        if (ownsConnection) connection.release();
    }
}

async function getDriveAlerts({ email, connection: suppliedConnection = null, now = new Date() }) {
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        const student = await loadStudentContext(connection, email);
        const drives = await getDrivesForStudent(connection, student, { upcomingOnly: true, now });
        const [registrations] = await connection.execute(
            `SELECT dr.status, d.metadata FROM drive_registrations dr JOIN drives d ON d.id = dr.drive_id
             WHERE dr.student_id = ? ORDER BY dr.registered_at DESC`, [student.student_id],
        );
        return {
            drives: drives.map(event => ({ date: event.date, branch: event.branch, type: event.type,
                title: event.title, description: event.description, time: event.time, location: event.location,
                posterLink: event.posterLink, id: event.eventId })),
            driveRSVPs: registrations.map(row => ({ driveId: eventView({ id: '', metadata: row.metadata }).eventId, status: text(row.status) })),
        };
    } finally {
        if (ownsConnection) connection.release();
    }
}

async function submitDriveResponse({ email, driveId, status, requestId, connection: suppliedConnection = null }) {
    const normalizedStatus = text(status);
    if (!['Registered', 'Not Attending', 'Maybe', 'Not Interested'].includes(normalizedStatus)) {
        throw new StudentDriveError(400, 'INVALID_DRIVE_RESPONSE', 'Select a valid drive response.');
    }
    const requestedId = text(driveId);
    if (!requestedId) throw new StudentDriveError(400, 'DRIVE_ID_REQUIRED', 'Select a placement drive.');
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const student = await loadStudentContext(connection, email);
        const drives = await getDrivesForStudent(connection, student);
        const matches = drives.filter(event => event.eventId === requestedId && /placement\s*drive/i.test(event.type));
        if (!matches.length) throw new StudentDriveError(404, 'DRIVE_NOT_FOUND', 'This placement drive is no longer available.');
        if (matches.length > 1) throw new StudentDriveError(409, 'DRIVE_ID_AMBIGUOUS', 'This drive ID needs staff review before a response can be recorded.');
        const event = matches[0];
        if (!courseMatches(event.course, student.courseSet)) throw new StudentDriveError(403, 'DRIVE_COURSE_MISMATCH', 'This drive is not assigned to your course.');
        if (isPast(event.fields)) throw new StudentDriveError(400, 'DRIVE_PAST', 'This placement drive has already passed.');
        const [existing] = await connection.execute('SELECT id FROM drive_registrations WHERE drive_id = ? AND student_id = ? LIMIT 1 FOR UPDATE', [event.dbId, student.student_id]);
        if (existing.length) throw new StudentDriveError(409, 'DRIVE_RESPONSE_EXISTS', 'You have already submitted a response for this drive.');
        const registrationId = crypto.randomUUID();
        const now = new Date();
        const metadata = JSON.stringify({ source: 'student_portal', requestId: text(requestId) || null,
            externalEventId: requestedId,
            student: { name: student.name, email: student.email, phone: student.phone, rollNumber: student.roll_number,
                course: student.course_name, branch: student.branch_name, resume: student.resume,
                qualification: student.qualification }, sourceFields: event.fields });
        await connection.execute(
            `INSERT INTO drive_registrations (id, drive_id, student_id, status, registered_at, metadata)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
            [registrationId, event.dbId, student.student_id, normalizedStatus, metadata],
        );
        await connection.execute(
            `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at, request_id, details)
             VALUES (?, ?, 'student_drive_response_submitted', 'drive_registration', ?, UTC_TIMESTAMP(), ?, ?)`,
            [crypto.randomUUID(), student.user_id, registrationId, text(requestId) || null, JSON.stringify({ driveId: requestedId, status: normalizedStatus })],
        );
        const [tpos] = await connection.execute(
            `SELECT u.email
             FROM users u
             WHERE u.role = 'tpo' AND u.status = 'active'
               AND (EXISTS (
                    SELECT 1 FROM user_branch_assignments uba
                    JOIN branches assigned_branch ON assigned_branch.id = uba.branch_id
                    WHERE uba.user_id = u.id AND assigned_branch.normalized_name = ?
               ) OR u.sitting_branch_id = ?)
             ORDER BY u.created_at, u.email LIMIT 1`,
            [normalized(student.branch_name), student.branch_id],
        );
        if (ownsConnection) await connection.commit();
        return {
            message: `Status updated to: ${normalizedStatus}`,
            status: normalizedStatus,
            email: student.email,
            studentName: student.name,
            tpoEmail: text(tpos[0]?.email) || 'placement@ipcsglobal.com',
            eventTitle: event.title,
            eventLocation: event.location || 'IPCS',
            eventId: requestedId,
        };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') throw new StudentDriveError(409, 'DRIVE_RESPONSE_EXISTS', 'You have already submitted a response for this drive.');
        throw error;
    } finally {
        if (ownsConnection) connection.release();
    }
}

module.exports = { StudentDriveError, getDriveAlerts, getStudentDriveData, submitDriveResponse };
