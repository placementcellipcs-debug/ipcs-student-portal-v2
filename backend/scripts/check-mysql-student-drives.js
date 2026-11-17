const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysqlPool = require('../config/mysqlPool');
const studentDrives = require('../services/mysqlStudentDriveService');

async function main() {
    const host = String(process.env.MYSQL_HOST || '').trim().toLowerCase();
    const database = String(process.env.MYSQL_DATABASE || '').trim().toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !['ipcs_portal_dev', 'ipcs_portal'].includes(database)) {
        throw new Error('This rollback-only check is restricted to the configured local IPCS MySQL database.');
    }
    const connection = await mysqlPool.getPool().getConnection();
    const suffix = crypto.randomUUID();
    const branchId = crypto.randomUUID();
    const courseId = crypto.randomUUID();
    const studentUserId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    const tpoUserId = crypto.randomUUID();
    const driveId = crypto.randomUUID();
    const tpoDriveId = crypto.randomUUID();
    const externalDriveId = `CHECK-${suffix}`;
    const tpoEventId = `TPO-CHECK-${suffix}`;
    const email = `mysql-drive-check-${suffix}@example.invalid`;
    const tpoEmail = `mysql-drive-tpo-${suffix}@example.invalid`;
    const requestId = `drive-check-${suffix}`;
    try {
        await connection.beginTransaction();
        await connection.execute(
            'INSERT INTO branches (id, name, normalized_name, region) VALUES (?, ?, ?, ?)',
            [branchId, `Drive Check ${suffix}`, normalizeName(`Drive Check ${suffix}`), 'Local Test'],
        );
        await connection.execute(
            'INSERT INTO courses (id, name, normalized_name, category, active) VALUES (?, ?, ?, ?, TRUE)',
            [courseId, `Course Check ${suffix}`, normalizeName(`Course Check ${suffix}`), 'Local Test'],
        );
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, role, full_name, status, sitting_branch_id)
             VALUES (?, ?, ?, 'student', 'Synthetic Drive Student', 'active', ?)`,
            [studentUserId, email, email, branchId],
        );
        await connection.execute(
            `INSERT INTO student_profiles (id, user_id, roll_number, normalized_roll_number, course_id, branch_id,
                                           personal_email, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
            [studentId, studentUserId, `DRIVE-${suffix}`, `drive-${suffix}`, courseId, branchId, email,
                JSON.stringify({ fields: { 'Vacancy Open': 'Yes', Qualification: 'Graduation' } })],
        );
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, role, full_name, status, sitting_branch_id)
             VALUES (?, ?, ?, 'tpo', 'Synthetic Drive TPO', 'active', ?)`,
            [tpoUserId, tpoEmail, tpoEmail, branchId],
        );
        await connection.execute('INSERT INTO user_branch_assignments (user_id, branch_id) VALUES (?, ?)', [tpoUserId, branchId]);
        const fields = {
            'Drive ID': externalDriveId,
            Event: 'PLACEMENT DRIVE',
            Title: 'Synthetic Drive Check',
            Branch: `Drive Check ${suffix}`,
            Course: `Course Check ${suffix}`,
            'Date of the Event': '30/12/2099',
            'Time of the Event': '10:00 AM',
            'Event Happening in': 'Local MySQL check',
        };
        await connection.execute(
            `INSERT INTO drives (id, title, starts_at, location, status, source, source_record_key, metadata)
             VALUES (?, 'Synthetic Drive Check', '2099-12-30 10:00:00', 'Local MySQL check', 'open',
                     'google_sheets_snapshot', ?, ?)`,
            [driveId, `Event:CHECK-${suffix}`, JSON.stringify({ source: 'rollback_check', externalEventId: externalDriveId, fields })],
        );
        await connection.execute(
            `INSERT INTO drives (id, title, starts_at, location, status, source, source_record_key, metadata)
             VALUES (?, 'Synthetic TPO MySQL Event', '2099-12-30 10:00:00', 'Local MySQL check', 'open',
                     'tpo_portal_mysql', ?, ?)`,
            [tpoDriveId, `Event:${tpoEventId}`, JSON.stringify({ source: 'tpo_portal_mysql', externalEventId: tpoEventId,
                fields: { ...fields, 'Drive ID': tpoEventId, Event_ID: tpoEventId, Title: 'Synthetic TPO MySQL Event' } })],
        );

        const data = await studentDrives.getStudentDriveData({ email, connection });
        assert.ok(data.events.some(event => event.id === externalDriveId && event.title === 'Synthetic Drive Check'));
        assert.ok(data.events.some(event => event.id === tpoEventId && event.title === 'Synthetic TPO MySQL Event'));
        const alerts = await studentDrives.getDriveAlerts({ email, connection, now: new Date('2026-11-12T05:00:00.000Z') });
        assert.ok(alerts.drives.some(event => event.id === tpoEventId));

        const response = await studentDrives.submitDriveResponse({ email, driveId: tpoEventId, status: 'Registered', requestId, connection });
        assert.equal(response.status, 'Registered');
        assert.equal(response.tpoEmail, tpoEmail);
        const refreshed = await studentDrives.getStudentDriveData({ email, connection });
        assert.ok(refreshed.driveRSVPs.some(item => item.driveId === tpoEventId && item.status === 'Registered'));
        await assert.rejects(
            studentDrives.submitDriveResponse({ email, driveId: tpoEventId, status: 'Maybe', requestId, connection }),
            error => error.code === 'DRIVE_RESPONSE_EXISTS',
        );
        const [[audit]] = await connection.execute(
            `SELECT COUNT(*) AS count FROM audit_events WHERE actor_user_id = ? AND request_id = ? AND action = 'student_drive_response_submitted'`,
            [studentUserId, requestId],
        );
        assert.equal(Number(audit.count), 1);
        await connection.rollback();

        const [[remaining]] = await connection.execute(
            `SELECT (SELECT COUNT(*) FROM branches WHERE id = ?) AS branches,
                    (SELECT COUNT(*) FROM courses WHERE id = ?) AS courses,
                    (SELECT COUNT(*) FROM student_profiles WHERE id = ?) AS students,
                    (SELECT COUNT(*) FROM users WHERE id IN (?, ?)) AS users,
                    (SELECT COUNT(*) FROM user_branch_assignments WHERE user_id = ?) AS assignments,
                    (SELECT COUNT(*) FROM drives WHERE id IN (?, ?)) AS drives,
                    (SELECT COUNT(*) FROM drive_registrations WHERE drive_id = ?) AS responses,
                    (SELECT COUNT(*) FROM audit_events WHERE request_id = ?) AS audits`,
            [branchId, courseId, studentId, studentUserId, tpoUserId, tpoUserId, driveId, tpoDriveId, tpoDriveId, requestId],
        );
        for (const count of Object.values(remaining)) assert.equal(Number(count), 0);
        console.log('Student drive MySQL check passed: Sheets snapshot and TPO MySQL event listing, upcoming reminder, branch/course matching, response creation, TPO notification address, duplicate prevention, audit, and rollback verified; no test rows remain.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

function normalizeName(value) {
    return String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

main().catch(error => {
    console.error(`Student drive MySQL check failed: ${error.message}`);
    process.exitCode = 1;
});
