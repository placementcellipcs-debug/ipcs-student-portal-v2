const mysqlPool = require('../config/mysqlPool');

async function main() {
    try {
        const [runs] = await mysqlPool.query(
            'SELECT status, workbook_count, tab_count, record_count, started_at, completed_at FROM source_import_runs ORDER BY started_at DESC LIMIT 1',
        );
        if (runs[0]?.status !== 'completed') throw new Error('The source-sheet archive is not complete.');
        const [tabs] = await mysqlPool.query(
            `SELECT source_key, tab_name, imported_record_count
               FROM source_sheet_manifest
              ORDER BY source_key, tab_name`,
        );
        console.log(JSON.stringify({
            latestImport: {
                status: runs[0].status,
                workbooks: Number(runs[0].workbook_count),
                tabs: Number(runs[0].tab_count),
                rows: Number(runs[0].record_count),
            },
            sheets: tabs.map(row => ({
                workbook: row.source_key,
                tab: row.tab_name,
                rows: Number(row.imported_record_count),
            })),
        }, null, 2));
        console.log('Read-only manifest summary; no source cell contents were queried.');
    } finally {
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`Archive summary failed: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
