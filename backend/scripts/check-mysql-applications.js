const assert = require('node:assert/strict');
const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const applicationService = require('../services/mysqlApplicationService');

const id = () => crypto.randomUUID();
const text = value => String(value ?? '').trim();

async function main() {
    const host = text(process.env.MYSQL_HOST).toLowerCase();
    const database = text(process.env.MYSQL_DATABASE).toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !['ipcs_portal_dev', 'ipcs_portal'].includes(database)) {
        throw new Error('This rollback-only check is restricted to the configured local IPCS MySQL database.');
    }

    const connection = await mysqlPool.getPool().getConnection();
    const suffix = crypto.randomUUID();
    const studentUserId = id();
    const studentId = id();
    const tpoUserId = id();
    const courseId = id();
    const relatedCourseId = id();
    const incompatibleCourseId = id();
    const vacancyId = id();
    const incompatibleVacancyId = id();
    const expiredVacancyId = id();
    const studentEmail = `mysql-application-check-${suffix}@example.invalid`;
    const tpoEmail = `mysql-application-check-tpo-${suffix}@example.invalid`;
    const courseCategory = `Synthetic Course Family ${suffix}`;
    const courseName = `Synthetic Course ${suffix}`;
    const relatedCourseName = `Synthetic Related Course ${suffix}`;
    const incompatibleCourseName = `Unrelated Course ${suffix}`;
    const jobCode = `CHECK-${suffix}`;
    const incompatibleJobCode = `CHECK-X-${suffix}`;
    const expiredJobCode = `CHECK-E-${suffix}`;
    const resumeUrl = `https://example.invalid/${suffix}/resume.pdf`;
    const studentMetadata = JSON.stringify({
        source: 'rollback_check',
        fields: {
            'Vacancy Open': 'Yes',
            'Status (Fresher / Experienced)': 'Fresher',
        },
    });
    const vacancyMetadata = (course, title) => JSON.stringify({
        source: 'rollback_check',
        fields: {
            Course: course,
            'Company Logo': '',
            'Placement Officer': 'Synthetic Application Check TPO',
            Experience: 'Fresher',
            Position: title,
        },
    });

    try {
        await connection.beginTransaction();
        await connection.execute(
            `INSERT INTO courses (id, name, normalized_name, category, active, metadata)
             VALUES (?, ?, ?, ?, 1, JSON_OBJECT('source', 'rollback_check')),
                    (?, ?, ?, ?, 1, JSON_OBJECT('source', 'rollback_check')),
                    (?, ?, ?, NULL, 1, JSON_OBJECT('source', 'rollback_check'))`,
            [courseId, courseName, courseName.toLowerCase(), courseCategory,
                relatedCourseId, relatedCourseName, relatedCourseName.toLowerCase(), courseCategory,
                incompatibleCourseId, incompatibleCourseName, incompatibleCourseName.toLowerCase()],
        );
        await connection.execute(
            `INSERT INTO users (id, email, normalized_email, role, full_name, status)
             VALUES (?, ?, ?, 'student', 'Synthetic Application Check Student', 'active'),
                    (?, ?, ?, 'tpo', 'Synthetic Application Check TPO', 'active')`,
            [studentUserId, studentEmail, studentEmail, tpoUserId, tpoEmail, tpoEmail],
        );
        await connection.execute(
            `INSERT INTO student_profiles
                (id, user_id, roll_number, normalized_roll_number, course_id, personal_email, resume_url, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
            [studentId, studentUserId, `CHECK-${suffix}`, `check-${suffix}`, courseId, studentEmail, resumeUrl, studentMetadata],
        );
        await connection.execute(
            `INSERT INTO vacancies
                (id, job_code, title, company_name, apply_by, status, assigned_tpo_user_id, source, source_record_key, metadata)
             VALUES (?, ?, 'Synthetic Eligible Role', 'Synthetic Company', NULL, 'open', ?, 'rollback_check', ?, ?),
                    (?, ?, 'Synthetic Ineligible Role', 'Synthetic Company', NULL, 'open', ?, 'rollback_check', ?, ?),
                    (?, ?, 'Synthetic Expired Role', 'Synthetic Company', '2020-01-01', 'open', ?, 'rollback_check', ?, ?)`,
            [vacancyId, jobCode, tpoUserId, jobCode, vacancyMetadata(relatedCourseName, 'Synthetic Eligible Role'),
                incompatibleVacancyId, incompatibleJobCode, tpoUserId, incompatibleJobCode, vacancyMetadata(incompatibleCourseName, 'Synthetic Ineligible Role'),
                expiredVacancyId, expiredJobCode, tpoUserId, expiredJobCode, vacancyMetadata(relatedCourseName, 'Synthetic Expired Role')],
        );

        const visible = await applicationService.getVacancyData({ email: studentEmail, connection });
        assert.equal(visible.vacancyAccess, true);
        assert.ok(visible.vacancies.some(row => row.newsletterId === jobCode), 'related course vacancy should be visible');
        assert.ok(!visible.vacancies.some(row => row.newsletterId === incompatibleJobCode), 'unrelated course vacancy should be hidden');

        const applied = await applicationService.applyForOpening({ email: studentEmail, jobId: jobCode, connection });
        assert.equal(applied.jobCode, jobCode);
        await assert.rejects(
            () => applicationService.applyForOpening({ email: studentEmail, jobId: incompatibleJobCode, connection }),
            error => error instanceof applicationService.ApplicationError && error.code === 'COURSE_MISMATCH',
        );
        await assert.rejects(
            () => applicationService.applyForOpening({ email: studentEmail, jobId: expiredJobCode, connection }),
            error => error instanceof applicationService.ApplicationError && error.code === 'OPENING_EXPIRED',
        );
        const [[savedApplication]] = await connection.execute(
            `SELECT ja.id, ja.owner_tpo_user_id, ja.status,
                    (SELECT COUNT(*) FROM application_status_history h WHERE h.application_id = ja.id) AS history_count
             FROM job_applications ja WHERE ja.student_id = ? AND ja.vacancy_id = ?`,
            [studentId, vacancyId],
        );
        assert.ok(savedApplication, 'application should be stored in the shared application table');
        assert.equal(savedApplication.owner_tpo_user_id, tpoUserId, 'application should be routed to the opening owner for the TPO tracker');
        assert.equal(savedApplication.status, 'Applied');
        assert.equal(Number(savedApplication.history_count), 1);

        await connection.execute('UPDATE job_applications SET status = \'Interview\' WHERE id = ?', [savedApplication.id]);
        await connection.execute(
            `INSERT INTO application_status_history
                (id, application_id, previous_status, new_status, note, actor_user_id, occurred_at, metadata)
             VALUES (?, ?, 'Applied', 'Interview', 'Synthetic interview update.', ?, UTC_TIMESTAMP(), JSON_OBJECT('source', 'rollback_check'))`,
            [id(), savedApplication.id, tpoUserId],
        );
        const afterApply = await applicationService.getVacancyData({ email: studentEmail, connection });
        const visibleApplication = afterApply.appliedJobs.find(row => row.jobId === jobCode);
        assert.ok(visibleApplication, 'application should remain visible in the student tracker');
        assert.equal(visibleApplication.status, 'Interview');
        assert.equal(visibleApplication.remarks, 'Synthetic interview update.');
        await assert.rejects(
            () => applicationService.applyForOpening({ email: studentEmail, jobId: jobCode, connection }),
            error => error instanceof applicationService.ApplicationError && error.code === 'ALREADY_APPLIED',
        );

        await connection.rollback();
        const [[persisted]] = await connection.execute(
            `SELECT
                (SELECT COUNT(*) FROM users WHERE id IN (?, ?)) AS users_count,
                (SELECT COUNT(*) FROM student_profiles WHERE id = ?) AS students_count,
                (SELECT COUNT(*) FROM courses WHERE id IN (?, ?, ?)) AS courses_count,
                (SELECT COUNT(*) FROM vacancies WHERE id IN (?, ?, ?)) AS vacancies_count,
                (SELECT COUNT(*) FROM job_applications WHERE student_id = ?) AS applications_count`,
            [studentUserId, tpoUserId, studentId, courseId, relatedCourseId, incompatibleCourseId,
                vacancyId, incompatibleVacancyId, expiredVacancyId, studentId],
        );
        for (const [key, value] of Object.entries(persisted)) assert.equal(Number(value), 0, `${key} should be rolled back`);
        console.log('Student application MySQL check passed: course-family matching, mismatch/expiry rejection, duplicate prevention, TPO ownership, status/remarks history visibility, and rollback verified; no test rows remain.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student application MySQL check failed: ${error.message}`);
    process.exitCode = 1;
});
