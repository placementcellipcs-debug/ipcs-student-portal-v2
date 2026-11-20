const mysqlPool = require('../config/mysqlPool');

const SOURCE_KEY = 'shared_learning';
const EXPECTED_TABS = [
    'Aptitude_Questions', 'Aptitude_Results',
    'Talentino_Questions', 'Talentino_Results',
    'Tech_Questions', 'Tech_Results',
];

async function main() {
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [sourceRows] = await connection.execute(
            `SELECT tab_name, imported_record_count FROM source_sheet_manifest
             WHERE source_key = ? AND tab_name IN (${EXPECTED_TABS.map(() => '?').join(',')})`,
            [SOURCE_KEY, ...EXPECTED_TABS],
        );
        const [storedRows] = await connection.execute(
            `SELECT source_tab, COUNT(*) AS total,
                    COUNT(DISTINCT source_row_number) AS distinct_source_rows,
                    SUM(record_type = 'question') AS questions,
                    SUM(record_type = 'result') AS results
             FROM assessment_records WHERE source_key = ? AND source_tab IN (${EXPECTED_TABS.map(() => '?').join(',')})
             GROUP BY source_tab ORDER BY source_tab`,
            [SOURCE_KEY, ...EXPECTED_TABS],
        );
        const [sourceCells] = await connection.execute(
            `SELECT tab_name, sheet_row_number, row_data_json FROM source_sheet_records
             WHERE source_key = ? AND tab_name IN (${EXPECTED_TABS.map(() => '?').join(',')})
             ORDER BY tab_name, sheet_row_number`,
            [SOURCE_KEY, ...EXPECTED_TABS],
        );
        const [mysqlCells] = await connection.execute(
            `SELECT source_tab, source_row_number, source_cells_json FROM assessment_records
             WHERE source_key = ? AND source_tab IN (${EXPECTED_TABS.map(() => '?').join(',')})
             ORDER BY source_tab, source_row_number`,
            [SOURCE_KEY, ...EXPECTED_TABS],
        );
        const expected = new Map(sourceRows.map(row => [row.tab_name, Number(row.imported_record_count)]));
        const actual = new Map(storedRows.map(row => [row.source_tab, row]));
        const normalizedSource = (sourceCells || []).map(row => {
            const source = typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
            return { tab: row.tab_name, row: Number(row.sheet_row_number), cells: source?.cells || [] };
        });
        const normalizedMysql = (mysqlCells || []).map(row => ({
            tab: row.source_tab,
            row: Number(row.source_row_number),
            cells: Array.isArray(row.source_cells_json) ? row.source_cells_json : JSON.parse(row.source_cells_json),
        }));
        const exactSourceValuesMatch = JSON.stringify(normalizedSource) === JSON.stringify(normalizedMysql);
        const rows = EXPECTED_TABS.map(tab => ({
            tab,
            sourceArchiveRows: expected.get(tab) ?? null,
            mysqlRows: Number(actual.get(tab)?.total || 0),
            distinctImportedRows: Number(actual.get(tab)?.distinct_source_rows || 0),
            questions: Number(actual.get(tab)?.questions || 0),
            results: Number(actual.get(tab)?.results || 0),
        }));
        const passed = exactSourceValuesMatch && rows.every(row => row.sourceArchiveRows !== null
            && row.sourceArchiveRows === row.mysqlRows
            && row.mysqlRows === row.distinctImportedRows);
        console.log(JSON.stringify({ passed, exactSourceValuesMatch, tabs: rows }, null, 2));
        console.log('Read-only row-count and exact-cell check; no question text or student details were printed.');
        if (!passed) process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`Assessment check failed: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
