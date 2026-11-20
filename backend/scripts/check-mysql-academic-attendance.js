const mysqlPool = require('../config/mysqlPool');

async function main() {
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [[archive]] = await connection.execute(
      `SELECT COUNT(*) AS rows_total FROM source_sheet_records
       WHERE source_key = 'shared_learning' AND tab_name = 'Attendance'`,
    );
    const [[imported]] = await connection.execute(
      `SELECT COUNT(*) AS rows_total, COUNT(DISTINCT source_row_number) AS distinct_source_rows,
              COUNT(student_profile_id) AS linked_students, COUNT(attendance_date) AS dated_rows,
              COUNT(branch_id) AS linked_branches, COUNT(course_id) AS linked_courses
       FROM academic_attendance_records WHERE source_key = 'shared_learning' AND source_tab = 'Attendance'`,
    );
    const [[duplicates]] = await connection.execute(
      `SELECT COUNT(*) AS duplicate_keys FROM (
         SELECT source_key, source_tab, source_row_number
         FROM academic_attendance_records
         WHERE source_key = 'shared_learning' AND source_tab = 'Attendance'
         GROUP BY source_key, source_tab, source_row_number HAVING COUNT(*) > 1
       ) duplicate_rows`,
    );
    const [[statusCounts]] = await connection.execute(
      `SELECT COUNT(DISTINCT attendance_status) AS distinct_statuses,
              SUM(attendance_status IS NULL OR attendance_status = '') AS blank_statuses
       FROM academic_attendance_records WHERE source_key = 'shared_learning' AND source_tab = 'Attendance'`,
    );
    const report = {
      sourceArchiveRows: Number(archive.rows_total || 0),
      importedRows: Number(imported.rows_total || 0),
      distinctSourceRows: Number(imported.distinct_source_rows || 0),
      linkedStudents: Number(imported.linked_students || 0),
      rowsWithDates: Number(imported.dated_rows || 0),
      linkedBranches: Number(imported.linked_branches || 0),
      linkedCourses: Number(imported.linked_courses || 0),
      distinctStatuses: Number(statusCounts.distinct_statuses || 0),
      blankStatuses: Number(statusCounts.blank_statuses || 0),
      duplicateSourceKeys: Number(duplicates.duplicate_keys || 0),
    };
    const passed = report.sourceArchiveRows === report.importedRows
      && report.importedRows === report.distinctSourceRows
      && report.duplicateSourceKeys === 0
      && report.rowsWithDates === report.importedRows;
    console.log(JSON.stringify({ passed, ...report }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Academic attendance check failed: ${error.message}`);
  process.exitCode = 1;
});
