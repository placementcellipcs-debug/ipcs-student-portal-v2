const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

function normalized(value) {
    return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function clean(value) {
    const text = String(value ?? '').trim();
    return /^(?:n\/?a|none|null|unknown|-)$/i.test(text) ? '' : text;
}

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

function parseDate(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    let year;
    let month;
    let day;
    if (match) [, year, month, day] = match;
    else {
        match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        if (!match) return null;
        [, day, month, year] = match;
        if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }
    const parts = [Number(year), Number(month), Number(day)];
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) return null;
    return `${String(parts[0]).padStart(4, '0')}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
}

function parseList(value) {
    const text = String(value ?? '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean);
        } catch { /* Use the comma-separated fallback. */ }
    }
    return text.split(/[,;|]/).map(clean).filter(Boolean);
}

function safeMetadataFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).filter(([name]) => !['password', 'password_hash'].includes(normalized(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))));
}

async function loadRows(connection, sourceKey, tabName) {
    const [rows] = await connection.execute(
        'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
        [sourceKey, tabName],
    );
    return rows.map(row => ({
        rowNumber: Number(row.sheet_row_number),
        data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
    }));
}

function createUserPayload({ portal, tabName, rowNumber, data, branches }) {
    const contactSource = tabName === 'Contact';
    const email = clean(getField(data, contactSource ? 'Mail ID' : 'Email'));
    const name = clean(getField(data, contactSource ? 'TPO Name' : 'Name')) || 'Unnamed User';
    const normalizedEmail = normalized(email);
    const sittingBranchName = clean(getField(data, contactSource ? 'Sitting Branch' : 'Sitting_Branch'));
    const sittingBranchId = branches.get(normalized(sittingBranchName)) || null;
    const assignedBranchNames = parseList(getField(data, contactSource ? 'Assigned Branches' : 'Assigned_Branches'));
    const password = clean(getField(data, 'Password'));
    const safeFields = safeMetadataFields(data.fields);
    const role = clean(getField(data, 'Role')) || (contactSource ? 'tpo' : 'staff');
    const status = normalized(getField(data, 'Status')) || 'active';
    const employeeId = clean(getField(data, contactSource ? 'Emp ID' : 'Employee_ID')) || null;
    const photo = clean(getField(data, contactSource ? 'Profile Photo' : 'Profile_Photo_URL')) || null;
    const phone = clean(getField(data, contactSource ? 'Contact Number' : 'Contact_Number')) || null;
    const linkedin = clean(getField(data, 'Linkedin', 'Linkedin URL', 'LinkedIn')) || null;
    const birthday = parseDate(getField(data, 'BirthDay', 'Birthday'));
    const position = clean(getField(data, 'Position')) || null;
    const description = clean(getField(data, 'Descripation', 'Description')) || null;
    const assignedCourseNames = contactSource ? [] : parseList(getField(data, 'Assigned_Courses'));
    const metadata = JSON.stringify({
        source: `${portal}:${tabName}`,
        sourceRow: rowNumber,
        fields: safeFields,
        rawSittingBranch: sittingBranchName || null,
        rawAssignedBranches: assignedBranchNames,
        rawAssignedCourses: assignedCourseNames,
    });

    return {
        id: makeId('user', normalizedEmail),
        email,
        normalizedEmail,
        passwordHash: password || null,
        role: normalized(role).replace(/\s+/g, '_').slice(0, 40),
        name,
        phone,
        sittingBranchId,
        linkedin,
        birthday,
        position,
        description,
        employeeId,
        photo,
        status: status.includes('inactive') ? 'inactive' : status.slice(0, 30),
        metadata,
        assignedBranchNames,
        assignedCourseNames,
        missingEmail: !normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        missingSittingBranch: Boolean(sittingBranchName && !sittingBranchId),
    };
}

async function main() {
    if (!process.argv.includes('--apply')) throw new Error('Pass --apply to write staff profiles to the configured MySQL database.');
    const pool = mysqlPool.getPool();
    const connection = await pool.getConnection();
    try {
        const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('The source snapshot must be verified before loading staff accounts.');

        const [contactRows, systemUserRows, branchRows, courseRows] = await Promise.all([
            loadRows(connection, 'shared_operations', 'Contact'),
            loadRows(connection, 'shared_operations', 'User'),
            connection.execute('SELECT id, normalized_name FROM branches').then(([rows]) => rows),
            connection.execute('SELECT id, normalized_name FROM courses').then(([rows]) => rows),
        ]);
        const branchIds = new Map(branchRows.map(row => [normalized(row.normalized_name), row.id]));
        const courseIds = new Map(courseRows.map(row => [normalized(row.normalized_name), row.id]));
        const candidates = [
            ...contactRows.map(row => createUserPayload({ portal: 'shared_operations', tabName: 'Contact', ...row, branches: branchIds })),
            ...systemUserRows.map(row => createUserPayload({ portal: 'shared_operations', tabName: 'User', ...row, branches: branchIds })),
        ];

        const validCandidates = candidates.filter(user => !user.missingEmail);
        const emailCounts = new Map();
        for (const user of validCandidates) emailCounts.set(user.normalizedEmail, (emailCounts.get(user.normalizedEmail) || 0) + 1);
        const duplicateEmails = [...emailCounts.values()].filter(count => count > 1).length;
        if (duplicateEmails) throw new Error(`Found ${duplicateEmails} repeated staff email(s); no staff rows were written.`);

        await connection.beginTransaction();
        let branchAssignments = 0;
        let courseAssignments = 0;
        let unresolvedBranches = 0;
        let unresolvedCourses = 0;
        for (const user of validCandidates) {
            await connection.execute(
                `INSERT INTO users
                    (id, email, normalized_email, password_hash, role, full_name, phone, sitting_branch_id,
                     linkedin_url, birthday, position_title, description, employee_id, profile_photo_url, status, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email), password_hash = VALUES(password_hash), role = VALUES(role),
                    full_name = VALUES(full_name), phone = VALUES(phone), sitting_branch_id = VALUES(sitting_branch_id),
                    linkedin_url = VALUES(linkedin_url), birthday = VALUES(birthday), position_title = VALUES(position_title),
                    description = VALUES(description), employee_id = VALUES(employee_id), profile_photo_url = VALUES(profile_photo_url),
                    status = VALUES(status), metadata = VALUES(metadata)`,
                [
                    user.id, user.email, user.normalizedEmail, user.passwordHash, user.role, user.name,
                    user.phone, user.sittingBranchId, user.linkedin, user.birthday, user.position,
                    user.description, user.employeeId, user.photo, user.status, user.metadata,
                ],
            );

            await connection.execute('DELETE FROM user_branch_assignments WHERE user_id = ?', [user.id]);
            for (const branchName of user.assignedBranchNames) {
                const branchId = branchIds.get(normalized(branchName));
                if (!branchId) {
                    unresolvedBranches += 1;
                    continue;
                }
                await connection.execute('INSERT IGNORE INTO user_branch_assignments (user_id, branch_id) VALUES (?, ?)', [user.id, branchId]);
                branchAssignments += 1;
            }

            await connection.execute('DELETE FROM user_course_assignments WHERE user_id = ?', [user.id]);
            for (const courseName of user.assignedCourseNames) {
                const courseId = courseIds.get(normalized(courseName));
                if (!courseId) {
                    unresolvedCourses += 1;
                    continue;
                }
                await connection.execute('INSERT IGNORE INTO user_course_assignments (user_id, course_id) VALUES (?, ?)', [user.id, courseId]);
                courseAssignments += 1;
            }
        }
        await connection.commit();

        const [counts] = await connection.execute(
            `SELECT COUNT(*) AS users,
                    SUM(role = 'tpo') AS tpo_users,
                    SUM(status = 'inactive') AS inactive_users,
                    SUM(password_hash IS NULL OR password_hash = '') AS users_without_password_hash
             FROM users`,
        );
        console.log(JSON.stringify({
            status: 'completed',
            sourceRows: { contactProfiles: contactRows.length, systemUsers: systemUserRows.length },
            loadedAccounts: validCandidates.length,
            missingNamesUsedSafePlaceholder: validCandidates.filter(user => user.name === 'Unnamed User').length,
            sittingBranchesNotMapped: validCandidates.filter(user => user.missingSittingBranch).length,
            unresolvedAssignedBranches: unresolvedBranches,
            unresolvedAssignedCourses: unresolvedCourses,
            createdBranchAssignments: branchAssignments,
            createdCourseAssignments: courseAssignments,
            normalizedTablesNowContain: {
                users: Number(counts[0].users),
                tpoUsers: Number(counts[0].tpo_users || 0),
                inactiveUsers: Number(counts[0].inactive_users || 0),
                accountsWithoutPasswordHash: Number(counts[0].users_without_password_hash || 0),
            },
        }));
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Staff import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Staff import could not start: ${error.message}`);
    process.exitCode = 1;
});
