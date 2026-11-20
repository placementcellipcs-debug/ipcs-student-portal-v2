const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysqlPool = require('../config/mysqlPool');

class StudentAuthError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedKey = value => normalized(value).replace(/[^a-z0-9]/g, '');
const normalizedRoll = value => normalized(value).replace(/\s+/g, '');

function parseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
}

function field(fields, ...aliases) {
    const wanted = new Set(aliases.map(normalizedKey));
    for (const [key, value] of Object.entries(fields || {})) {
        if (wanted.has(normalizedKey(key)) && value !== undefined && value !== null && text(value) !== '') return text(value);
    }
    return '';
}

function profileFromRow(row) {
    const metadata = parseJson(row.profile_metadata);
    const fields = metadata.fields || {};
    const fallback = (value, ...aliases) => text(value) || field(fields, ...aliases) || 'N/A';
    return {
        name: text(row.full_name) || 'Student',
        phone: fallback(row.phone || row.profile_phone, 'Phone No.', 'Contact Number', 'Phone Number', 'Mobile Number', 'Phone', 'Mobile'),
        email: text(row.email),
        rollNo: fallback(row.roll_number, 'IPCS Roll Number', 'Roll No', 'Roll Number'),
        joiningDate: fallback('', 'Joining Date', 'Date of Joining'),
        course: fallback(row.course_name, 'Course', 'Program'),
        branch: fallback(row.branch_name, 'Branch', 'Sitting Branch'),
        photo: text(row.profile_photo_url) || field(fields, 'Photo', 'Profile Photo', 'Photo URL'),
        homeTown: fallback('', 'Your Home Town', 'Home Town', 'Hometown', 'Native Place'),
        qualification: fallback('', 'Qualification'),
        stream: fallback('', 'Stream', 'Specialization'),
        fresherStatus: fallback('', 'Status (Fresher / Experienced)', 'Fresher Status', 'Experience Status'),
        linkedin: fallback('', 'LinkedIn Profile Link', 'LinkedIn', 'Linkedin', 'LinkedIn URL'),
        instagram: fallback('', 'Instagram ID', 'Instagram', 'Instagram URL'),
        placementReq: fallback('', 'Any Specific Requirement For Placement', 'Placement Requirement', 'Placement Required'),
        friend1Name: fallback('', 'Name (Friend 1)', 'Friend 1 Name', 'Friend Name 1', 'Referral 1 Name'),
        friend1Phone: fallback('', 'Contact Number', 'Friend 1 Contact', 'Friend 1 Phone', 'Friend Contact 1', 'Referral 1 Contact'),
        friend2Name: fallback('', 'Name (Friend 2)', 'Friend 2 Name', 'Friend Name 2', 'Referral 2 Name'),
        friend2Phone: fallback('', 'Contact Number 2', 'Friend 2 Contact', 'Friend 2 Phone', 'Friend Contact 2', 'Referral 2 Contact'),
        resume: fallback(row.resume_url, 'Resume', 'Resume Link', 'Resume URL', 'CV Link'),
        parentName: fallback('', 'Parent Name', 'Guardian Name'),
        parentContact: fallback('', 'Parent Contact', 'Parent Phone', 'Guardian Contact'),
        studyStatus: fallback('', 'Course Status', 'Study Status', 'Current Status', 'Student Status', 'Status') === 'N/A'
            ? 'Currently Studying' : fallback('', 'Course Status', 'Study Status', 'Current Status', 'Student Status', 'Status'),
        completedDate: fallback('', 'IPCS Course Completed Date', 'Completed Date', 'Course Completion Date'),
        age: fallback('', 'Age'),
        gender: fallback('', 'Gender'),
        certificate: fallback('', 'Certificate', 'Certificate Status'),
        vacancyOpen: field(fields, 'Vacancy Open') || '',
        techExamAccess: fallback('', 'Technial Exam', 'Tech Exam Access', 'Technical Exam Access'),
    };
}

function registrationFields(input, email, photoUrl, now = new Date()) {
    const supplied = (value, fallback = 'N/A') => text(value) || fallback;
    return {
        Timestamp: now.toISOString(),
        Name: supplied(input.name),
        'Phone No.': supplied(input.phone),
        'Mail ID': email,
        'IPCS Roll Number': supplied(input.rollNo),
        'Joining Date': supplied(input.joiningDate),
        Course: supplied(input.course),
        Branch: supplied(input.branch),
        'Profile Photo': text(photoUrl),
        'Your Home Town': supplied(input.homeTown),
        Qualification: supplied(input.qualification),
        Stream: supplied(input.stream),
        'Status (Fresher / Experienced)': supplied(input.fresherStatus),
        'LinkedIn Profile Link': supplied(input.linkedin),
        'Instagram ID': supplied(input.instagram),
        'Any Specific Requirement For Placement': supplied(input.placementReq),
        'Name (Friend 1)': supplied(input.friend1Name),
        'Contact Number': supplied(input.friend1Phone),
        'Name (Friend 2)': supplied(input.friend2Name),
        'Contact Number 2': supplied(input.friend2Phone),
        Resume: 'N/A',
        'Parent Name': supplied(input.parentName),
        'Parent Contact': supplied(input.parentContact),
        'Course Status': 'Currently Studying',
        'IPCS Course Completed Date': 'N/A',
        Age: supplied(input.age),
        Gender: supplied(input.gender),
        Certificate: 'N/A',
        'Vacancy Open': '',
        'Technial Exam': 'Pending',
    };
}

async function loginStudent({ email, password, connection: suppliedConnection = null }) {
    const normalizedEmail = normalized(email);
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        const [rows] = await connection.execute(
            `SELECT u.id AS user_id, u.email, u.full_name, u.phone, u.password_hash, u.session_version,
                    u.status AS user_status, sp.id AS student_id, sp.roll_number, sp.personal_email,
                    sp.phone AS profile_phone, sp.resume_url, sp.profile_photo_url, sp.status AS student_status,
                    sp.metadata AS profile_metadata, c.name AS course_name, b.name AS branch_name
             FROM users u JOIN student_profiles sp ON sp.user_id = u.id
             LEFT JOIN courses c ON c.id = sp.course_id
             LEFT JOIN branches b ON b.id = sp.branch_id
             WHERE u.normalized_email = ? AND u.role = 'student' LIMIT 1`,
            [normalizedEmail],
        );
        const row = rows[0];
        if (!row) throw new StudentAuthError(404, 'ACCOUNT_NOT_FOUND', 'No student account was found for this email. Contact IPCS support if you have already registered.');
        if (normalized(row.user_status) === 'inactive' || normalized(row.student_status) === 'inactive') {
            throw new StudentAuthError(403, 'STUDENT_ACCOUNT_INACTIVE', 'Your student account is inactive. Contact IPCS support.');
        }
        let passwordMatches = false;
        try { passwordMatches = await bcrypt.compare(String(password || ''), String(row.password_hash || '')); } catch { /* invalid legacy hash */ }
        if (!passwordMatches) throw new StudentAuthError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
        await connection.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [row.user_id]);
        const student = profileFromRow(row);
        return { user: student, sessionVersion: String(row.session_version || '0') };
    } finally { if (ownsConnection) connection.release(); }
}

async function changeStudentPassword({ email, currentPassword, newPassword, requestId, connection: suppliedConnection = null }) {
    const normalizedEmail = normalized(email);
    const current = String(currentPassword || '');
    const next = String(newPassword || '');
    if (!normalizedEmail) throw new StudentAuthError(401, 'SESSION_REQUIRED', 'Please sign in again.');
    if (Buffer.byteLength(next, 'utf8') < 8 || Buffer.byteLength(next, 'utf8') > 72) {
        throw new StudentAuthError(400, 'INVALID_PASSWORD', 'Choose a password between 8 and 72 bytes.');
    }

    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const [rows] = await connection.execute(
            `SELECT u.id, u.password_hash
             FROM users u JOIN student_profiles sp ON sp.user_id = u.id
             WHERE u.normalized_email = ? AND u.role = 'student'
               AND u.status = 'active' AND sp.status = 'active'
             LIMIT 2 FOR UPDATE`,
            [normalizedEmail],
        );
        if (!rows.length) throw new StudentAuthError(404, 'ACCOUNT_NOT_FOUND', 'Student account not found.');
        if (rows.length > 1) throw new StudentAuthError(409, 'ACCOUNT_AMBIGUOUS', 'This student account needs staff review before its password can be changed.');
        let matches = false;
        try { matches = await bcrypt.compare(current, String(rows[0].password_hash || '')); } catch { /* Invalid legacy hash. */ }
        if (!matches) throw new StudentAuthError(400, 'CURRENT_PASSWORD_INCORRECT', 'Incorrect current password.');

        const passwordHash = await bcrypt.hash(next, await bcrypt.genSalt(10));
        await connection.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [passwordHash, rows[0].id],
        );
        await connection.execute(
            `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at, request_id, details)
             VALUES (?, ?, 'student_password_changed', 'student', ?, UTC_TIMESTAMP(), ?, JSON_OBJECT('source', 'student_portal'))`,
            [crypto.randomUUID(), rows[0].id, rows[0].id, String(requestId || '').trim() || null],
        );
        if (ownsConnection) await connection.commit();
        return { changed: true };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        throw error;
    } finally { if (ownsConnection) connection.release(); }
}

async function registerStudent({ input, email, photoUrl = '', connection: suppliedConnection = null }) {
    const normalizedEmail = normalized(email);
    const name = text(input.name);
    const roll = text(input.rollNo);
    const password = String(input.password || '');
    if (!name || !roll || !text(input.course) || !text(input.branch)) {
        throw new StudentAuthError(400, 'REGISTRATION_FIELDS_REQUIRED', 'Enter your name, roll number, course, and branch.');
    }
    if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        throw new StudentAuthError(400, 'INVALID_PASSWORD', 'Choose a password between 8 and 72 bytes.');
    }

    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const [existingUsers] = await connection.execute('SELECT id FROM users WHERE normalized_email = ? LIMIT 1 FOR UPDATE', [normalizedEmail]);
        if (existingUsers.length) throw new StudentAuthError(409, 'ACCOUNT_ALREADY_EXISTS', 'An account with this email already exists.');
        const rollKey = normalizedRoll(roll);
        const [existingRolls] = await connection.execute('SELECT id FROM student_profiles WHERE normalized_roll_number = ? LIMIT 1 FOR UPDATE', [rollKey]);
        if (existingRolls.length) throw new StudentAuthError(409, 'ROLL_NUMBER_ALREADY_EXISTS', 'An account with this roll number already exists. Contact IPCS support if this is your roll number.');

        const [courseRows] = await connection.execute('SELECT id FROM courses WHERE normalized_name = ? AND active = 1 LIMIT 1', [normalized(input.course)]);
        const [branchRows] = await connection.execute('SELECT id FROM branches WHERE normalized_name = ? LIMIT 1', [normalized(input.branch)]);
        const userId = crypto.randomUUID();
        const profileId = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        const fields = registrationFields(input, normalizedEmail, photoUrl);
        const metadata = JSON.stringify({ source: 'student_portal_registration', fields });
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, password_hash, session_version, role, full_name, phone,
                                sitting_branch_id, profile_photo_url, status, metadata)
             VALUES (?, ?, ?, ?, '0', 'student', ?, ?, ?, ?, 'active', ?)`,
            [userId, normalizedEmail, normalizedEmail, passwordHash, name, text(input.phone) || null,
                branchRows[0]?.id || null, text(photoUrl) || null, metadata],
        );
        await connection.execute(
            `INSERT INTO student_profiles
              (id, user_id, roll_number, normalized_roll_number, course_id, branch_id, personal_email, phone,
               resume_url, profile_photo_url, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'N/A', ?, 'active', ?)`,
            [profileId, userId, roll, rollKey, courseRows[0]?.id || null, branchRows[0]?.id || null,
                normalizedEmail, text(input.phone) || null, text(photoUrl) || null, metadata],
        );
        if (ownsConnection) await connection.commit();
        return {
            user: {
                name, email: normalizedEmail, rollNo: roll, branch: text(input.branch), course: text(input.course),
                phone: text(input.phone) || 'N/A', photo: text(photoUrl), vacancyOpen: '',
            },
            sessionVersion: '0',
        };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') {
            throw new StudentAuthError(409, 'ACCOUNT_ALREADY_EXISTS', 'An account with this email or roll number already exists.');
        }
        throw error;
    } finally { if (ownsConnection) connection.release(); }
}

async function getCourses() {
    const [rows] = await mysqlPool.query(
        `SELECT name, normalized_name, category FROM courses WHERE active = 1 ORDER BY COALESCE(category, ''), name`,
    );
    const groups = new Map();
    for (const row of rows) {
        const category = text(row.category) || 'General';
        if (normalized(row.name) === normalized(category)) continue;
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(text(row.name));
    }
    return [...groups.entries()].map(([category, courses]) => ({ category, courses }));
}

async function getBranches() {
    const [rows] = await mysqlPool.query('SELECT name, region FROM branches ORDER BY COALESCE(region, \'\'), name');
    const groups = new Map();
    for (const row of rows) {
        const region = text(row.region) || 'Other';
        if (!groups.has(region)) groups.set(region, []);
        groups.get(region).push(text(row.name));
    }
    return [...groups.entries()].map(([region, branches]) => ({ region, branches }));
}

async function createPasswordReset({ email, tokenHash, expiresAt, connection: suppliedConnection = null }) {
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const [users] = await connection.execute(
            `SELECT u.id, u.email, u.full_name FROM users u
             JOIN student_profiles sp ON sp.user_id = u.id
             WHERE u.normalized_email = ? AND u.role = 'student' AND u.status = 'active' AND sp.status <> 'inactive'
             LIMIT 1 FOR UPDATE`, [normalized(email)],
        );
        const user = users[0];
        if (!user) {
            if (ownsConnection) await connection.rollback();
            return null;
        }
        await connection.execute(
            `UPDATE student_password_reset_tokens SET status = 'superseded'
             WHERE user_id = ? AND status = 'pending'`, [user.id],
        );
        await connection.execute(
            `INSERT INTO student_password_reset_tokens (id, user_id, token_hash, expires_at, status)
             VALUES (?, ?, ?, ?, 'pending')`, [crypto.randomUUID(), user.id, tokenHash, expiresAt],
        );
        if (ownsConnection) await connection.commit();
        return { email: user.email, name: user.full_name };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        throw error;
    } finally { if (ownsConnection) connection.release(); }
}

async function failPasswordResetEmail(tokenHash) {
    await mysqlPool.query(
        `UPDATE student_password_reset_tokens SET status = 'failed'
         WHERE token_hash = ? AND status = 'pending'`, [tokenHash],
    );
}

async function completePasswordReset({ tokenHash, passwordHash, connection: suppliedConnection = null }) {
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const [tokens] = await connection.execute(
            `SELECT t.id AS token_id, t.user_id, t.status AS token_status, t.expires_at,
                    u.normalized_email, u.status AS user_status, sp.status AS student_status
             FROM student_password_reset_tokens t
             JOIN users u ON u.id = t.user_id AND u.role = 'student'
             JOIN student_profiles sp ON sp.user_id = u.id
             WHERE t.token_hash = ? LIMIT 1 FOR UPDATE`, [tokenHash],
        );
        const token = tokens[0];
        const expired = !token || !token.expires_at || new Date(token.expires_at).getTime() <= Date.now();
        if (!token || token.token_status !== 'pending' || expired
            || normalized(token.user_status) === 'inactive' || normalized(token.student_status) === 'inactive') {
            if (ownsConnection) await connection.rollback();
            return false;
        }
        const nextSessionVersion = crypto.randomBytes(24).toString('hex');
        await connection.execute(
            `UPDATE users SET password_hash = ?, session_version = ? WHERE id = ?`,
            [passwordHash, nextSessionVersion, token.user_id],
        );
        await connection.execute(
            `UPDATE student_password_reset_tokens SET status = 'used', used_at = UTC_TIMESTAMP(6)
             WHERE user_id = ? AND status = 'pending'`, [token.user_id],
        );
        await connection.execute(
            `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, details)
             VALUES (?, ?, 'student_password_reset', 'student', ?, JSON_OBJECT('source', 'student_portal'))`,
            [crypto.randomUUID(), token.user_id, token.user_id],
        );
        if (ownsConnection) await connection.commit();
        return true;
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        throw error;
    } finally { if (ownsConnection) connection.release(); }
}

module.exports = {
    StudentAuthError,
    changeStudentPassword,
    completePasswordReset,
    createPasswordReset,
    failPasswordResetEmail,
    getBranches,
    getCourses,
    loginStudent,
    profileFromRow,
    registrationFields,
    registerStudent,
};
