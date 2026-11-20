const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const TYPE_TABS = {
    aptitude: { questions: 'Aptitude_Questions', results: 'Aptitude_Results' },
    talantino: { questions: 'Talentino_Questions', results: 'Talentino_Results' },
    technical: { questions: 'Tech_Questions', results: 'Tech_Results' },
};

function parseCells(value) {
    if (Array.isArray(value)) return value;
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

async function getQuestionRows(type) {
    const tab = TYPE_TABS[type]?.questions;
    if (!tab) return [];
    const [rows] = await mysqlPool.query(
        `SELECT source_cells_json FROM assessment_records
         WHERE record_type = 'question' AND assessment_type = ? AND source_tab = ?
         ORDER BY source_row_number, created_at, id`,
        [type, tab],
    );
    return [[], ...rows.map(row => parseCells(row.source_cells_json))];
}

async function getResultRows(type) {
    const tab = TYPE_TABS[type]?.results;
    if (!tab) return [];
    const [rows] = await mysqlPool.query(
        `SELECT source_cells_json FROM assessment_records
         WHERE record_type = 'result' AND assessment_type = ? AND source_tab = ?
         ORDER BY source_row_number IS NULL, source_row_number, created_at, id`,
        [type, tab],
    );
    return [[], ...rows.map(row => parseCells(row.source_cells_json))];
}

async function getResultRowsForAllTypes() {
    const types = Object.keys(TYPE_TABS);
    return Promise.all(types.map(type => getResultRows(type)));
}

async function appendResult(type, cells) {
    const tab = TYPE_TABS[type]?.results;
    if (!tab || !Array.isArray(cells)) throw new Error('Invalid assessment result.');
    const row = cells.map(value => String(value ?? ''));
    const aptitude = type === 'aptitude';
    const field = aptitude
        ? { group: row[9], score: row[5], total: row[6], percentage: row[7], time: row[8] }
        : { group: row[5], score: row[6], total: row[7], percentage: row[8], time: row[9] };
    const id = crypto.randomUUID();
    const values = [id, `runtime:${id}`, 'mysql_runtime', tab, null, type, 'result',
        field.group || null, null, null, null, null, null, null, null, null, null, null, null,
        row[0] || null, row[1] || null, row[2] || null, String(row[3] || '').trim().toLowerCase() || null,
        row[4] || null, field.score || null, field.total || null, field.percentage || null, field.time || null,
        JSON.stringify(row)];
    await mysqlPool.query(
        `INSERT INTO assessment_records
         (id, source_record_key, source_key, source_tab, source_row_number, assessment_type, record_type,
          assessment_group, question_id, category, question_text, option_a, option_b, option_c, option_d,
          answer_text, explanation, status_text, level_text, occurred_at_text, student_roll_number, student_name,
          student_email, student_branch, score_text, total_questions_text, percentage_text, time_taken_text, source_cells_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
    );
    return { id };
}

module.exports = { getQuestionRows, getResultRows, getResultRowsForAllTypes, appendResult };
