const assert = require('node:assert/strict');
const mysqlPool = require('../config/mysqlPool');
const applicationService = require('../services/mysqlApplicationService');

const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');

async function main() {
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [examples] = await connection.execute(
      `SELECT u.email, v.job_code
       FROM job_applications ja
       JOIN student_profiles sp ON sp.id = ja.student_id
       JOIN users u ON u.id = sp.user_id
       JOIN vacancies v ON v.id = ja.vacancy_id
       WHERE ja.source = 'legacy_opening_applied'
         AND LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(sp.metadata, '$.fields."Vacancy Open"')), ''))) IN ('yes', 'true', '1')
       ORDER BY ja.applied_at, ja.id LIMIT 1`,
    );
    assert.ok(examples[0]?.email && examples[0]?.job_code,
      'at least one linked student with job-opening access should be available for the read-only service check');

    const data = await applicationService.getVacancyData({ email: examples[0].email, connection });
    assert.equal(data.vacancyAccess, true, 'the sample student should have job-opening access');
    const visibleCopies = data.appliedJobs.filter(row => normalized(row.jobId) === normalized(examples[0].job_code));
    assert.equal(visibleCopies.length, 1, 'a consolidated legacy application should appear once in the student tracker');

    console.log(JSON.stringify({
      status: 'passed',
      sampleApplicationVisibleOnce: true,
      studentServiceAppliedJobRows: data.appliedJobs.length,
      writesPerformed: 0,
      personLevelDetailsPrinted: false,
    }, null, 2));
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Legacy student application check failed: ${error.message}`);
  process.exitCode = 1;
});
