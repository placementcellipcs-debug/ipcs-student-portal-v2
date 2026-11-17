const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysqlPool = require('../config/mysqlPool');
const auth = require('../services/mysqlStudentAuthService');
const authSessions = require('../services/authSessionService');

async function main() {
    const pool = mysqlPool.getPool();
    const connection = await pool.getConnection();
    let transactionOpen = false;
    const suffix = crypto.randomBytes(8).toString('hex');
    const email = 'mysql-auth-check-' + suffix + '@example.invalid';
    const roll = 'IPCS-TEST-' + suffix;
    const tokenHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    try {
        const courses = await auth.getCourses();
        const branches = await auth.getBranches();
        const course = courses.flatMap(group => group.courses)[0];
        const branch = branches.flatMap(group => group.branches)[0];
        if (!course || !branch) throw new Error('The local course or branch catalog is empty.');

        await connection.beginTransaction();
        transactionOpen = true;
        const registered = await auth.registerStudent({
            connection,
            email,
            photoUrl: '',
            input: {
                name: 'MySQL Authentication Check',
                rollNo: roll,
                course,
                branch,
                phone: '0000000000',
                password: 'LocalCheckPassword123!',
            },
        });
        const signedIn = await auth.loginStudent({ connection, email, password: 'LocalCheckPassword123!' });
        const resetAccount = await auth.createPasswordReset({
            connection,
            email,
            tokenHash,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        const replacementHash = await bcrypt.hash('ReplacementPassword456!', 4);
        const resetSucceeded = await auth.completePasswordReset({ connection, tokenHash, passwordHash: replacementHash });
        const [stateRows] = await connection.execute(
            "SELECT u.session_version, u.password_hash, " +
            "(SELECT status FROM student_password_reset_tokens WHERE token_hash = ? LIMIT 1) AS reset_status, " +
            "(SELECT COUNT(*) FROM audit_events WHERE actor_user_id = u.id AND action = 'student_password_reset') AS reset_audits " +
            "FROM users u WHERE u.normalized_email = ? LIMIT 1",
            [tokenHash, email],
        );
        const state = stateRows[0];
        const replacementPasswordWorks = await bcrypt.compare('ReplacementPassword456!', state?.password_hash || '');
        const sessionVersionRotated = Boolean(state?.session_version)
            && String(state.session_version) !== String(signedIn.sessionVersion);
        const workflowPassed = registered.user.email === email
            && signedIn.user.rollNo === roll
            && resetAccount?.email === email
            && resetSucceeded === true
            && state?.reset_status === 'used'
            && Number(state?.reset_audits) === 1
            && replacementPasswordWorks
            && sessionVersionRotated;

        await connection.rollback();
        transactionOpen = false;
        const [persistedUsers] = await pool.execute('SELECT COUNT(*) AS total FROM users WHERE normalized_email = ?', [email]);
        const [persistedTokens] = await pool.execute('SELECT COUNT(*) AS total FROM student_password_reset_tokens WHERE token_hash = ?', [tokenHash]);
        const previousFlag = process.env.MYSQL_STUDENT_AUTH_ENABLED;
        process.env.MYSQL_STUDENT_AUTH_ENABLED = 'true';
        let missingAccountSessionRejected = false;
        try { missingAccountSessionRejected = (await authSessions.getSessionVersion(email, 0)) === ''; }
        finally {
            if (previousFlag === undefined) delete process.env.MYSQL_STUDENT_AUTH_ENABLED;
            else process.env.MYSQL_STUDENT_AUTH_ENABLED = previousFlag;
        }
        const noTestRowsPersisted = Number(persistedUsers[0].total) === 0 && Number(persistedTokens[0].total) === 0;
        const result = {
            status: 'verified_then_rolled_back',
            courseAndBranchCatalogAvailable: true,
            registrationWorks: registered.user.email === email,
            bcryptLoginWorks: signedIn.user.rollNo === roll,
            resetTokenCreated: resetAccount?.email === email,
            oneTimePasswordResetWorks: resetSucceeded === true && state?.reset_status === 'used',
            passwordHashUpdated: replacementPasswordWorks,
            resetInvalidatesPriorSession: sessionVersionRotated,
            resetAuditRecordedInTransaction: Number(state?.reset_audits) === 1,
            noTestRowsPersisted,
            missingAccountSessionRejected,
        };
        result.passed = workflowPassed && noTestRowsPersisted && missingAccountSessionRejected;
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) process.exitCode = 1;
    } catch (error) {
        if (transactionOpen) await connection.rollback().catch(() => {});
        console.error('MySQL student-auth check failed: ' + error.message);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error('MySQL student-auth check could not start: ' + error.message);
    process.exitCode = 1;
});
