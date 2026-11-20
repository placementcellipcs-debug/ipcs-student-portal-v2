const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const SOURCE_KEY = 'shared_learning';
const TABS = {
    Aptitude_Questions: { assessmentType: 'aptitude', recordType: 'question' },
    Aptitude_Results: { assessmentType: 'aptitude', recordType: 'result' },
    Talentino_Questions: { assessmentType: 'talentino', recordType: 'question' },
    Talentino_Results: { assessmentType: 'talentino', recordType: 'result' },
    Tech_Questions: { assessmentType: 'technical', recordType: 'question' },
    Tech_Results: { assessmentType: 'technical', recordType: 'result' },
};

const clean = value => String(value ?? '');
const trim = value => clean(value).trim();
const safeCells = cells => JSON.stringify(cells || []);
const stableId = (tab, row) => {
    const bytes = crypto.createHash('sha256').update(`assessment:${SOURCE_KEY}:${tab}:${row}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

function project(tab, cells) {
    const question = tab.endsWith('_Questions');
    if (question) {
        const aptitude = tab === 'Aptitude_Questions';
        return {
            assessmentGroup: trim(cells[1]), questionId: trim(cells[0]) || null,
            category: trim(cells[1]) || null,
            questionText: clean(cells[2]) || null,
            optionA: clean(cells[3]) || null, optionB: clean(cells[4]) || null,
            optionC: clean(cells[5]) || null, optionD: clean(cells[6]) || null,
            answerText: clean(cells[7]) || null, explanation: clean(cells[8]) || null,
            statusText: trim(cells[9]) || null, levelText: trim(cells[10]) || null,
        };
    }

    const aptitude = tab === 'Aptitude_Results';
    return {
        assessmentGroup: trim(cells[5]) || null,
        occurredAtText: clean(cells[0]) || null,
        studentRollNumber: clean(cells[1]) || null,
        studentName: clean(cells[2]) || null,
        studentEmail: trim(cells[3]).toLowerCase() || null,
        studentBranch: clean(cells[4]) || null,
        scoreText: clean(cells[aptitude ? 5 : 6]) || null,
        totalQuestionsText: clean(cells[aptitude ? 6 : 7]) || null,
        percentageText: clean(cells[aptitude ? 7 : 8]) || null,
        timeTakenText: clean(cells[aptitude ? 8 : 9]) || null,
        levelText: clean(cells[aptitude ? 9 : 5]) || null,
    };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [[run]] = await connection.execute("SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1");
        if (run?.status !== 'completed') throw new Error('Import and verify the source-sheet archive before loading assessments.');

        const [manifests] = await connection.execute(
            `SELECT tab_name, headers_json, header_row_number, imported_record_count
             FROM source_sheet_manifest WHERE source_key = ? AND tab_name IN (${Object.keys(TABS).map(() => '?').join(',')})`,
            [SOURCE_KEY, ...Object.keys(TABS)],
        );
        const manifestByTab = new Map(manifests.map(row => [row.tab_name, row]));
        const records = [];
        for (const [tab, config] of Object.entries(TABS)) {
            const manifest = manifestByTab.get(tab);
            if (!manifest) continue;
            const [rows] = await connection.execute(
                `SELECT sheet_row_number, row_data_json FROM source_sheet_records
                 WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
                [SOURCE_KEY, tab],
            );
            if (rows.length !== Number(manifest.imported_record_count)) {
                throw new Error(`Archived ${tab} rows do not match its source manifest.`);
            }
            for (const row of rows) {
                const stored = typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
                const cells = Array.isArray(stored?.cells) ? stored.cells : [];
                const projected = project(tab, cells);
                records.push({
                    id: stableId(tab, row.sheet_row_number),
                    sourceRecordKey: `${SOURCE_KEY}:${tab}:${row.sheet_row_number}`,
                    sourceRowNumber: Number(row.sheet_row_number),
                    tab, ...config, ...projected, cells: safeCells(cells),
                });
            }
        }
        if (!records.length) throw new Error('No assessment question or result rows were found in the source archive.');

        const summary = Object.values(TABS).map(({ assessmentType, recordType }) => ({
            assessmentType, recordType,
            rows: records.filter(row => row.assessmentType === assessmentType && row.recordType === recordType).length,
        }));
        if (!apply) {
            console.log(JSON.stringify({ mode: 'preview', source: SOURCE_KEY, totalRows: records.length, tabs: summary }, null, 2));
            console.log('Preview only. Original displayed cell values are retained in MySQL; no source tabs are changed.');
            return;
        }

        await connection.beginTransaction();
        await connection.execute(
            `DELETE FROM assessment_records WHERE source_key = ? AND source_tab IN (${Object.keys(TABS).map(() => '?').join(',')})`,
            [SOURCE_KEY, ...Object.keys(TABS)],
        );
        for (const row of records) {
            await connection.execute(
                `INSERT INTO assessment_records
                 (id, source_record_key, source_key, source_tab, source_row_number, assessment_type, record_type,
                  assessment_group, question_id, category, question_text, option_a, option_b, option_c, option_d,
                  answer_text, explanation, status_text, level_text, occurred_at_text, student_roll_number, student_name,
                  student_email, student_branch, score_text, total_questions_text, percentage_text, time_taken_text, source_cells_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                [row.id, row.sourceRecordKey, SOURCE_KEY, row.tab, row.sourceRowNumber, row.assessmentType, row.recordType,
                    row.assessmentGroup || null, row.questionId || null, row.category || null, row.questionText || null,
                    row.optionA || null, row.optionB || null, row.optionC || null, row.optionD || null, row.answerText || null,
                    row.explanation || null, row.statusText || null, row.levelText || null, row.occurredAtText || null,
                    row.studentRollNumber || null, row.studentName || null, row.studentEmail || null, row.studentBranch || null,
                    row.scoreText || null, row.totalQuestionsText || null, row.percentageText || null, row.timeTakenText || null,
                    row.cells],
            );
        }
        await connection.commit();

        const [stored] = await connection.execute(
            `SELECT source_tab, COUNT(*) AS total FROM assessment_records
             WHERE source_key = ? AND source_tab IN (${Object.keys(TABS).map(() => '?').join(',')})
             GROUP BY source_tab ORDER BY source_tab`,
            [SOURCE_KEY, ...Object.keys(TABS)],
        );
        const loadedRows = stored.reduce((sum, row) => sum + Number(row.total || 0), 0);
        if (loadedRows !== records.length) throw new Error('Post-import assessment row count does not match the source archive.');
        console.log(JSON.stringify({ mode: 'apply', source: SOURCE_KEY, totalRows: loadedRows, tabs: stored.map(row => ({ tab: row.source_tab, rows: Number(row.total) })) }, null, 2));
        console.log('All original question and result cells remain available in `source_cells_json`; no assessment values were reformatted.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`Assessment import failed: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
