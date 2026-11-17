const assert = require('node:assert/strict');
const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const studentProfiles = require('../services/mysqlStudentProfileService');

async function main() {
    const host = String(process.env.MYSQL_HOST || '').trim().toLowerCase();
    const database = String(process.env.MYSQL_DATABASE || '').trim().toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !['ipcs_portal_dev', 'ipcs_portal'].includes(database)) {
        throw new Error('This rollback-only check is restricted to the configured local IPCS MySQL database.');
    }

    const connection = await mysqlPool.getPool().getConnection();
    const suffix = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const email = `mysql-profile-check-${suffix}@example.invalid`;
    try {
        await connection.beginTransaction();
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, role, full_name, phone, status, profile_photo_url)
             VALUES (?, ?, ?, 'student', 'Synthetic Profile Check', '9000000000', 'active', NULL)`,
            [userId, email, email],
        );
        await connection.execute(
            `INSERT INTO student_profiles (id, user_id, roll_number, normalized_roll_number, personal_email,
                                           phone, status, metadata)
             VALUES (?, ?, ?, ?, ?, '9000000000', 'active', ?)`,
            [profileId, userId, `PROFILE-${suffix}`, `profile-${suffix}`, email,
                JSON.stringify({ source: 'rollback_check', fields: { 'Course Status': 'Currently Studying', Age: '20' } })],
        );

        const before = await studentProfiles.getStudentByEmail(email, connection);
        assert.equal(before?.name, 'Synthetic Profile Check');
        assert.equal(before?.rollNo, `PROFILE-${suffix}`);

        const requestId = `profile-check-${suffix}`;
        const update = await studentProfiles.updateProfile({
            email,
            requestId,
            values: {
                homeTown: 'Kochi', qualification: 'Graduation', stream: 'Digital Marketing',
                fresherStatus: 'Fresher', linkedin: 'https://linkedin.com/in/example', instagram: 'example',
                placementReq: 'Marketing role', parentName: 'Synthetic Parent', parentContact: '9000000001',
                studyStatus: 'Currently Studying', completedDate: 'N/A', age: '20', gender: 'N/A',
            },
        }, connection);
        assert.equal(update.user.homeTown, 'Kochi');
        assert.equal(update.user.qualification, 'Graduation');
        assert.equal(update.user.linkedin, 'https://linkedin.com/in/example');
        assert.equal(update.user.parentName, 'Synthetic Parent');

        const photoUrl = `https://drive.google.com/file/d/${suffix}/photo`;
        const resumeUrl = `https://drive.google.com/file/d/${suffix}/resume`;
        const certificateUrl = `https://drive.google.com/file/d/${suffix}/certificate`;
        await studentProfiles.saveDocument({ email, docType: 'Photo', url: photoUrl, requestId }, connection);
        await studentProfiles.saveDocument({ email, docType: 'Resume', url: resumeUrl, requestId }, connection);
        await studentProfiles.saveDocument({ email, docType: 'Certificate', url: certificateUrl, requestId }, connection);

        const after = await studentProfiles.getStudentByEmail(email, connection);
        assert.equal(after?.photo, photoUrl);
        assert.equal(after?.resume, resumeUrl);
        assert.equal(after?.certificate, certificateUrl);
        const [[photoState]] = await connection.execute(
            `SELECT u.profile_photo_url AS user_photo, sp.profile_photo_url AS student_photo, sp.resume_url,
                    JSON_UNQUOTE(JSON_EXTRACT(sp.metadata, '$.fields.Certificate')) AS certificate_url
             FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = ?`,
            [userId],
        );
        assert.equal(photoState.user_photo, photoUrl);
        assert.equal(photoState.student_photo, photoUrl);
        assert.equal(photoState.resume_url, resumeUrl);
        assert.equal(photoState.certificate_url, certificateUrl);

        const [[auditState]] = await connection.execute(
            `SELECT COUNT(*) AS count FROM audit_events WHERE actor_user_id = ? AND request_id = ?`,
            [userId, requestId],
        );
        assert.equal(Number(auditState.count), 4);
        await connection.rollback();

        const [[persistedUser]] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE id = ?', [userId]);
        const [[persistedProfile]] = await connection.execute('SELECT COUNT(*) AS count FROM student_profiles WHERE id = ?', [profileId]);
        const [[persistedAudit]] = await connection.execute('SELECT COUNT(*) AS count FROM audit_events WHERE actor_user_id = ? AND request_id = ?', [userId, requestId]);
        assert.equal(Number(persistedUser.count), 0);
        assert.equal(Number(persistedProfile.count), 0);
        assert.equal(Number(persistedAudit.count), 0);
        console.log('Student profile MySQL check passed: read, profile update, photo/resume/certificate links, audit events, and rollback verified; no test rows remain.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student profile MySQL check failed: ${error.message}`);
    process.exitCode = 1;
});
