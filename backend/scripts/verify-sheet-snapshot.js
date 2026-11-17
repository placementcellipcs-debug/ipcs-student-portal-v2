const mysqlPool = require('../config/mysqlPool');

async function main() {
    const pool = mysqlPool.getPool();
    try {
        const [runs] = await pool.execute(
            `SELECT id, status, started_at, completed_at, workbook_count, tab_count, record_count,
                    password_hash_count, repeated_student_roll_count
             FROM source_import_runs ORDER BY started_at DESC LIMIT 1`,
        );
        const latest = runs[0];
        if (!latest) throw new Error('No sheet import run was found.');

        const [counts] = await pool.execute(
            `SELECT COUNT(*) AS stored_rows,
                    SUM(imported_run_id = ?) AS rows_from_latest_run
             FROM source_sheet_records`,
            [latest.id],
        );
        const [mismatches] = await pool.execute(
            `SELECT manifest.source_key, manifest.tab_name,
                    manifest.imported_record_count AS expected_rows,
                    COUNT(records.id) AS stored_rows
             FROM source_sheet_manifest AS manifest
             LEFT JOIN source_sheet_records AS records
               ON records.source_key = manifest.source_key
              AND records.tab_name = manifest.tab_name
             WHERE manifest.imported_run_id = ?
             GROUP BY manifest.source_key, manifest.tab_name, manifest.imported_record_count
             HAVING expected_rows <> stored_rows`,
            [latest.id],
        );
        const [sourceCounts] = await pool.execute(
            `SELECT source_key, COUNT(*) AS stored_rows
             FROM source_sheet_records
             GROUP BY source_key ORDER BY source_key`,
        );

        console.log(JSON.stringify({
            latestRunStatus: latest.status,
            capturedStartedAtUtc: latest.started_at,
            capturedCompletedAtUtc: latest.completed_at,
            workbooks: latest.workbook_count,
            tabs: latest.tab_count,
            rowsReportedByImporter: latest.record_count,
            rowsCurrentlyStored: Number(counts[0]?.stored_rows || 0),
            rowsFromLatestRun: Number(counts[0]?.rows_from_latest_run || 0),
            repeatedStudentRollNumbers: latest.repeated_student_roll_count,
            legacyPasswordsConverted: latest.password_hash_count,
            tabsWithCountMismatch: mismatches.length,
        }));
        for (const sourceCount of sourceCounts) console.log(JSON.stringify(sourceCount));
        for (const mismatch of mismatches) console.log(JSON.stringify(mismatch));
        if (latest.status !== 'completed' || mismatches.length || Number(counts[0]?.stored_rows || 0) !== Number(latest.record_count || 0)) {
            throw new Error('The imported sheet snapshot did not reconcile cleanly.');
        }
        console.log('Every tab count matches the stored source rows.');
    } finally {
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Sheet snapshot verification failed: ${error.message}`);
    process.exitCode = 1;
});
