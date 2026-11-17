const assert = require('node:assert/strict');
const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const supportIssues = require('../services/mysqlSupportIssueService');

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
    const email = `mysql-issue-check-${suffix}@example.invalid`;
    try {
        await connection.beginTransaction();
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, role, full_name, phone, status)
             VALUES (?, ?, ?, 'student', 'Synthetic Issue Check', '9000000000', 'active')`,
            [userId, email, email],
        );
        await connection.execute(
            `INSERT INTO student_profiles (id, user_id, roll_number, normalized_roll_number, personal_email, phone, status)
             VALUES (?, ?, ?, ?, ?, '9000000000', 'active')`,
            [profileId, userId, `TEST-${suffix}`, `test-${suffix}`, email],
        );
        const result = await supportIssues.submitStudentIssue({
            email,
            details: 'Synthetic support issue integration check.',
            location: 'Local MySQL verification',
            requestId: `issue-check-${suffix}`,
        }, connection);
        assert.ok(result.id);
        assert.equal(result.message, 'Issue reported successfully!');
        const [rows] = await connection.execute('SELECT status, details, student_email FROM support_issues WHERE id = ?', [result.id]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].status, 'Pending');
        assert.equal(rows[0].details, 'Synthetic support issue integration check.');
        assert.equal(rows[0].student_email, email);
        const [[auditEvent]] = await connection.execute(
            `SELECT actor_user_id, action, entity_type, entity_id, request_id
             FROM audit_events WHERE entity_id = ? AND action = 'support_issue_created'`,
            [result.id],
        );
        assert.equal(auditEvent?.actor_user_id, userId);
        assert.equal(auditEvent?.entity_type, 'support_issue');
        assert.equal(auditEvent?.entity_id, result.id);
        assert.equal(auditEvent?.request_id, `issue-check-${suffix}`);
        await connection.rollback();

        const [[persistedUser]] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE id = ?', [userId]);
        const [[persistedIssue]] = await connection.execute('SELECT COUNT(*) AS count FROM support_issues WHERE id = ?', [result.id]);
        const [[persistedAudit]] = await connection.execute(
            `SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'support_issue_created'`,
            [result.id],
        );
        assert.equal(Number(persistedUser.count), 0);
        assert.equal(Number(persistedIssue.count), 0);
        assert.equal(Number(persistedAudit.count), 0);
        console.log('Student support issue MySQL check passed: authenticated profile mapping, issue fields, Pending status, transactional audit, and rollback verified; no test rows remain.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student support issue MySQL check failed: ${error.message}`);
    process.exitCode = 1;
});
