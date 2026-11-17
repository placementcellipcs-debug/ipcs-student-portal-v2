const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const asText = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => asText(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedRoll = value => normalized(value).replace(/\s+/g, '');
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const isBcryptHash = value => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ''));
const parseJson = value => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
};
const stableJson = value => {
    if (Array.isArray(value)) return value.map(stableJson);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
};

function getField(record, ...names) {
    const fields = record?.fields || {};
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
    }
    return '';
}

function makeId(scope, key) {
    const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).filter(([name]) => !/password|secret|token/i.test(name)));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const pool = mysqlPool.getPool();
    const connection = await pool.getConnection();
    try {
        const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('Import and verify the source-sheet snapshot before loading students.');

        const [sourceRows, sessionRows, branchRows, courseRows, userRows, normalizedProfileRows] = await Promise.all([
            connection.execute(
                'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
                ['shared_student_data', 'Data'],
            ).then(([rows]) => rows),
            connection.execute(
                'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
                ['shared_operations', 'Auth_Sessions'],
            ).then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM branches').then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM courses').then(([rows]) => rows),
            connection.execute('SELECT id, role, normalized_email FROM users WHERE normalized_email IS NOT NULL').then(([rows]) => rows),
            connection.execute(
                `SELECT sp.id, sp.normalized_roll_number, sp.roll_number, sp.course_id, sp.branch_id,
                        sp.personal_email, sp.phone, sp.resume_url, sp.profile_photo_url, sp.status, sp.metadata,
                        u.email AS user_email, u.full_name AS user_full_name, u.phone AS user_phone, u.status AS user_status
                   FROM student_profiles sp LEFT JOIN users u ON u.id = sp.user_id`,
            ).then(([rows]) => rows),
        ]);

        const rows = sourceRows.map(row => ({
            rowNumber: Number(row.sheet_row_number),
            data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
        }));
        const sessionVersions = new Map();
        for (const source of sessionRows) {
            const data = typeof source.row_data_json === 'string' ? JSON.parse(source.row_data_json) : source.row_data_json;
            const email = normalized(getField(data, 'Email'));
            const version = asText(getField(data, 'Session Version'));
            if (email && version) sessionVersions.set(email, version.slice(0, 64));
        }
        const rollCounts = new Map();
        for (const row of rows) {
            const roll = normalizedRoll(getField(row.data, 'IPCS Roll Number', 'Roll No', 'Roll Number'));
            if (roll) rollCounts.set(roll, (rollCounts.get(roll) || 0) + 1);
        }

        const branches = new Map(branchRows.map(row => [normalized(row.normalized_name), row.id]));
        const courses = new Map(courseRows.map(row => [normalized(row.normalized_name), row.id]));
        const usersByEmail = new Map(userRows.map(row => [normalized(row.normalized_email), row]));
        const candidates = rows.flatMap(({ rowNumber, data }) => {
            const roll = asText(getField(data, 'IPCS Roll Number', 'Roll No', 'Roll Number'));
            const rollKey = normalizedRoll(roll);
            if (!rollKey || rollCounts.get(rollKey) !== 1) return [];

            const email = asText(getField(data, 'Mail ID', 'Email'));
            const emailKey = normalized(email);
            const existingUser = emailKey ? usersByEmail.get(emailKey) : null;
            const name = asText(getField(data, 'Name', 'Student Name'));
            const passwordHash = asText(getField(data, 'Password'));
            const emailCanLogin = isEmail(email) && (!existingUser || normalized(existingUser.role) === 'student');
            const canCreateLogin = Boolean(emailCanLogin && name && isBcryptHash(passwordHash));
            const userId = canCreateLogin ? (existingUser?.id || makeId('student-user', emailKey)) : null;
            const branchName = normalized(getField(data, 'Branch'));
            const courseName = normalized(getField(data, 'Course'));
            const fields = safeFields(data.fields);

            return [{
                rowNumber,
                roll: roll.slice(0, 100),
                rollKey: rollKey.slice(0, 100),
                profileId: makeId('student-profile', rollKey),
                userId,
                email: email || null,
                emailKey: emailKey || null,
                passwordHash: canCreateLogin ? passwordHash : null,
                sessionVersion: sessionVersions.get(emailKey) || '0',
                hasBcryptPassword: isBcryptHash(passwordHash),
                name: name.slice(0, 200),
                phone: asText(getField(data, 'Phone No.', 'Contact Number', 'Phone Number', 'Mobile Number', 'Phone', 'Mobile')).slice(0, 40) || null,
                resume: asText(getField(data, 'Resume', 'Resume Link', 'Resume URL', 'CV Link')).slice(0, 20000) || null,
                photo: asText(getField(data, 'Photo', 'Profile Photo', 'Photo URL')).slice(0, 20000) || null,
                branchId: branches.get(branchName) || null,
                courseId: courses.get(courseName) || null,
                status: normalized(getField(data, 'Status')) === 'inactive' ? 'inactive' : 'active',
                metadata: JSON.stringify({ source: 'shared_student_data:Data', sourceRow: rowNumber, fields }),
                existingUser,
                staffEmailCollision: Boolean(existingUser && !['student'].includes(normalized(existingUser.role))),
            }];
        });

        const emailCounts = new Map();
        for (const candidate of candidates) {
            if (candidate.emailKey && isEmail(candidate.email)) emailCounts.set(candidate.emailKey, (emailCounts.get(candidate.emailKey) || 0) + 1);
        }
        for (const candidate of candidates) {
            if (candidate.userId && emailCounts.get(candidate.emailKey) > 1) {
                candidate.userId = null;
                candidate.passwordHash = null;
            }
        }

        const sourceRollSet = new Set(candidates.map(candidate => candidate.rollKey));
        const normalizedProfilesByRoll = new Map(normalizedProfileRows.map(row => [normalizedRoll(row.normalized_roll_number), row]));
        let existingSourceProfilesWithChanges = 0;
        let existingStudentLoginsWithChanges = 0;
        for (const candidate of candidates) {
            const existing = normalizedProfilesByRoll.get(candidate.rollKey);
            if (!existing) continue;
            const existingMetadata = parseJson(existing.metadata);
            const profileFieldsChanged = existing.roll_number !== candidate.roll
                || (existing.course_id || null) !== (candidate.courseId || null)
                || (existing.branch_id || null) !== (candidate.branchId || null)
                || (normalized(existing.personal_email) || '') !== (normalized(candidate.email) || '')
                || (existing.phone || null) !== (candidate.phone || null)
                || (existing.resume_url || null) !== (candidate.resume || null)
                || (existing.profile_photo_url || null) !== (candidate.photo || null)
                || existing.status !== candidate.status
                || JSON.stringify(stableJson(existingMetadata.fields || {})) !== JSON.stringify(stableJson(parseJson(candidate.metadata).fields || {}));
            if (profileFieldsChanged) existingSourceProfilesWithChanges += 1;
            if (candidate.userId && (
                (normalized(existing.user_email) || '') !== candidate.emailKey
                || existing.user_full_name !== candidate.name
                || (existing.user_phone || null) !== (candidate.phone || null)
                || existing.user_status !== candidate.status
            )) existingStudentLoginsWithChanges += 1;
        }
        const report = {
            mode: apply ? 'apply' : 'preview',
            sourceRows: rows.length,
            eligibleUniqueRollProfiles: candidates.length,
            normalizedProfilesBeforeImport: normalizedProfileRows.length,
            sourceProfilesAlreadyInMysql: candidates.filter(row => normalizedProfilesByRoll.has(row.rollKey)).length,
            newSourceProfiles: candidates.filter(row => !normalizedProfilesByRoll.has(row.rollKey)).length,
            normalizedProfilesNotInCurrentSnapshot: normalizedProfileRows.filter(row => !sourceRollSet.has(normalizedRoll(row.normalized_roll_number))).length,
            existingSourceProfilesWithSourceChanges: existingSourceProfilesWithChanges,
            existingStudentLoginsWithSourceChanges: existingStudentLoginsWithChanges,
            skippedRowsWithMissingOrRepeatedRoll: rows.length - candidates.length,
            eligibleStudentLogins: candidates.filter(row => row.userId).length,
            profilesWithoutLogin: candidates.filter(row => !row.userId).length,
            staffEmailCollisionsLeftUnlinked: candidates.filter(row => row.staffEmailCollision).length,
            sessionVersionRowsAvailable: sessionVersions.size,
            studentLoginsWithPreservedSessionVersion: candidates.filter(row => row.userId && sessionVersions.has(row.emailKey)).length,
            validUniqueRollRowsWithMissingOrInvalidEmail: candidates.filter(row => !isEmail(row.email)).length,
            validUniqueRollRowsWithoutBcryptPassword: candidates.filter(row => !row.hasBcryptPassword).length,
            validUniqueRollRowsWithoutName: candidates.filter(row => !row.name).length,
        };

        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only; no rows were written. No student or staff details were printed.');
            return;
        }

        await connection.beginTransaction();
        let accountsLinked = 0;
        for (const student of candidates) {
            if (student.userId && student.passwordHash) {
                await connection.execute(
                    `INSERT INTO users (id, email, normalized_email, password_hash, session_version, role, full_name, phone,
                                        sitting_branch_id, status, metadata)
                     VALUES (?, ?, ?, ?, ?, 'student', ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       email = VALUES(email), password_hash = VALUES(password_hash), session_version = VALUES(session_version), role = 'student',
                       full_name = VALUES(full_name), phone = VALUES(phone), sitting_branch_id = VALUES(sitting_branch_id),
                       status = VALUES(status), metadata = VALUES(metadata)`,
                    [student.userId, student.email, student.emailKey, student.passwordHash, student.sessionVersion,
                        student.name, student.phone, student.branchId, student.status, student.metadata],
                );
                accountsLinked += 1;
            }

            await connection.execute(
                `INSERT INTO student_profiles
                    (id, user_id, roll_number, normalized_roll_number, course_id, branch_id, personal_email,
                     phone, resume_url, profile_photo_url, status, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    user_id = VALUES(user_id), roll_number = VALUES(roll_number), course_id = VALUES(course_id),
                    branch_id = VALUES(branch_id), personal_email = VALUES(personal_email), phone = VALUES(phone),
                    resume_url = VALUES(resume_url), profile_photo_url = VALUES(profile_photo_url),
                    status = VALUES(status), metadata = VALUES(metadata)`,
                [student.profileId, student.userId, student.roll, student.rollKey, student.courseId, student.branchId,
                    student.email, student.phone, student.resume, student.photo, student.status, student.metadata],
            );
        }
        await connection.commit();

        const [[counts]] = await connection.execute(
            `SELECT COUNT(*) AS profiles, COUNT(user_id) AS linked_profiles,
                    SUM(user_id IS NULL) AS profiles_without_login
             FROM student_profiles`,
        );
        console.log(JSON.stringify({
            ...report,
            status: 'completed',
            importedProfiles: candidates.length,
            studentAccountsCreatedOrUpdated: accountsLinked,
            normalizedStudentTablesNowContain: {
                profiles: Number(counts.profiles),
                linkedProfiles: Number(counts.linked_profiles),
                profilesWithoutLogin: Number(counts.profiles_without_login || 0),
            },
        }, null, 2));
        console.log('All source rows remain preserved in the snapshot archive. No names, emails, roll numbers, or password hashes were printed.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Student import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student import could not start: ${error.message}`);
    process.exitCode = 1;
});
