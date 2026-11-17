const assert = require('node:assert/strict');
const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const leaveService = require('../services/mysqlStudentLeaveService');

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
    const email = `mysql-leave-check-${suffix}@example.invalid`;
    try {
        await connection.beginTransaction();
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, role, full_name, status)
             VALUES (?, ?, ?, 'student', 'Synthetic Leave Check', 'active')`,
            [userId, email, email],
        );
        await connection.execute(
            `INSERT INTO student_profiles (id, user_id, roll_number, normalized_roll_number, personal_email, status)
             VALUES (?, ?, ?, ?, ?, 'active')`,
            [profileId, userId, `TEST-${suffix}`, `test-${suffix}`, email],
        );
        const created = await leaveService.submitStudentLeaveRequest(email, {
            startDate: '2026-11-16', endDate: '2026-11-17', type: 'Leave Request',
            reason: 'Synthetic integration check only.',
        }, connection);
        assert.equal(created.record.status, 'Pending');
        assert.equal(created.record.startDate, '16/11/2026');
        const listed = await leaveService.listStudentLeaveRequests(email, connection);
        assert.equal(listed.length, 1);
        assert.equal(listed[0].reason, 'Synthetic integration check only.');

        const absence = await leaveService.submitStudentLeaveRequest(email, {
            startDate: '2026-11-18', endDate: '2026-11-18', type: 'Absence Notice',
            reason: 'Synthetic absence notice check.',
        }, connection);
        assert.equal(absence.record.status, 'Notified');
        await assert.rejects(
            () => leaveService.submitStudentLeaveRequest(email, {
                startDate: '2026-11-19', endDate: '2026-11-18', type: 'Leave Request', reason: 'Invalid date order check.',
            }, connection),
            error => error.code === 'INVALID_LEAVE_DATES',
        );
        await connection.rollback();

        const [[persisted]] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE id = ?', [userId]);
        const [[persistedRequests]] = await connection.execute('SELECT COUNT(*) AS count FROM student_leave_requests WHERE student_email = ?', [email]);
        assert.equal(Number(persisted.count), 0);
        assert.equal(Number(persistedRequests.count), 0);
        console.log('Student leave MySQL check passed: listing, request/absence statuses, validation, and rollback verified; no test rows remain.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student leave MySQL check failed: ${error.message}`);
    process.exitCode = 1;
});
