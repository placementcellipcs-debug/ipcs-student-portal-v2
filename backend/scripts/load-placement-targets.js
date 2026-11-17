const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalize = value => text(value).toLocaleLowerCase('en-US')
  .replace(/^(mrs|miss|mr|ms|dr|prof)\.?\s+/i, '')
  .replace(/\s+/g, ' ')
  .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
const headerKey = value => normalize(value).replace(/[^a-z0-9]/g, '');

function getField(fields, ...aliases) {
  const wanted = new Set(aliases.map(headerKey));
  for (const [key, value] of Object.entries(fields || {})) {
    if (wanted.has(headerKey(key)) && value !== undefined && value !== null && text(value) !== '') return value;
  }
  return '';
}

function parseDateParts(value) {
  const raw = text(value);
  if (!raw) return null;
  const monthName = raw.match(/^([a-z]{3,})\s+(\d{4})$/i);
  if (monthName) {
    const month = new Date(`${monthName[1]} 1, ${monthName[2]}`).getMonth() + 1;
    if (month >= 1 && month <= 12) return { year: Number(monthName[2]), month };
  }
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (match) {
    let year = Number(match[3]);
    if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
    return { year, month: Number(match[2]) };
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.valueOf())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
    }).format(date).split('-');
    return { year: Number(parts[0]), month: Number(parts[1]) };
  }
  return null;
}

function monthFor(fields) {
  const explicitMonth = text(getField(fields, 'Report Month', 'ReportMonth', 'Month'));
  const match = explicitMonth.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  const parsedMonth = parseDateParts(explicitMonth);
  if (parsedMonth && parsedMonth.month >= 1 && parsedMonth.month <= 12) return parsedMonth;
  const date = parseDateParts(getField(fields, 'Timestamp', 'Date', 'Time'));
  return date && date.month >= 1 && date.month <= 12 ? date : null;
}

function targetRowsFromSnapshot(rows, staffByName) {
  const latestTargets = new Map();
  let rowsWithoutTarget = 0;
  let rowsWithoutMonth = 0;
  let unmatchedRows = 0;
  let ambiguousRows = 0;
  for (const row of rows) {
    const fields = row.data?.fields || {};
    const name = text(getField(fields, 'USER', 'TPO Name', 'Placement Officer'));
    const targetText = text(getField(fields, 'Monthly Target', 'Target'));
    if (!name || targetText === '') { rowsWithoutTarget += 1; continue; }
    if (!/^\d+$/.test(targetText) || !Number.isSafeInteger(Number(targetText)) || Number(targetText) > 4294967295) {
      throw new Error(`TPO_Stats contains an invalid monthly target in source row ${row.rowNumber}.`);
    }
    const month = monthFor(fields);
    if (!month) { rowsWithoutMonth += 1; continue; }
    const identity = normalize(name);
    const matches = staffByName.get(identity) || [];
    if (!matches.length) { unmatchedRows += 1; continue; }
    if (matches.length !== 1) { ambiguousRows += 1; continue; }
    const key = `${matches[0].id}:${month.year}-${String(month.month).padStart(2, '0')}`;
    latestTargets.set(key, {
      userId: matches[0].id,
      year: month.year,
      month: month.month,
      count: Number(targetText),
      sourceRow: row.rowNumber,
    });
  }
  if (ambiguousRows) throw new Error(`${ambiguousRows} target row(s) match multiple TPOs by name. Resolve duplicate TPO names before importing.`);
  return {
    targets: [...latestTargets.values()],
    rowsWithoutTarget,
    rowsWithoutMonth,
    unmatchedRows,
  };
}

async function readRows(connection) {
  const [rows] = await connection.execute(
    `SELECT sheet_row_number, row_data_json FROM source_sheet_records
      WHERE source_key = 'shared_placement' AND tab_name = 'TPO_Stats'
      ORDER BY sheet_row_number`,
  );
  return rows.map(row => ({
    rowNumber: Number(row.sheet_row_number),
    data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
  }));
}

async function readStaff(connection) {
  const [rows] = await connection.execute(
    `SELECT id, full_name, metadata FROM users
      WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')) = 'shared_operations:Contact'`,
  );
  const byName = new Map();
  for (const row of rows) {
    const fields = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}').fields : row.metadata?.fields;
    const name = normalize(getField(fields, 'TPO Name', 'Name') || row.full_name);
    if (!name) continue;
    const matches = byName.get(name) || [];
    matches.push(row);
    byName.set(name, matches);
  }
  return byName;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = mysqlPool.getPool();
  const connection = await pool.getConnection();
  try {
    const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
    if (runs[0]?.status !== 'completed') throw new Error('Import and verify the source-sheet snapshot first.');
    const [manifest] = await connection.execute(
      `SELECT imported_record_count FROM source_sheet_manifest
        WHERE source_key = 'shared_placement' AND tab_name = 'TPO_Stats' LIMIT 1`,
    );
    if (!manifest.length) throw new Error('The imported snapshot does not contain shared_placement:TPO_Stats.');
    const [sourceRows, staffByName] = await Promise.all([readRows(connection), readStaff(connection)]);
    if (sourceRows.length !== Number(manifest[0].imported_record_count)) {
      throw new Error('The staged TPO_Stats row count does not match its imported manifest.');
    }
    const imported = targetRowsFromSnapshot(sourceRows, staffByName);
    const [existingRows] = await connection.execute('SELECT COUNT(*) AS count FROM placement_targets');
    if (apply) {
      await connection.beginTransaction();
      try {
        for (const target of imported.targets) {
          await connection.execute(
            `INSERT INTO placement_targets (id, tpo_user_id, target_year, target_month, target_count, assigned_by_user_id)
             VALUES (?, ?, ?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE target_count = VALUES(target_count)`,
            [crypto.randomUUID(), target.userId, target.year, target.month, target.count],
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      }
    }
    const monthCounts = new Map();
    for (const target of imported.targets) {
      const month = `${target.year}-${String(target.month).padStart(2, '0')}`;
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    }
    let verifiedTargets = 0;
    if (apply) {
      for (const target of imported.targets) {
        const [savedRows] = await connection.execute(
          `SELECT target_count FROM placement_targets
            WHERE tpo_user_id = ? AND target_year = ? AND target_month = ? LIMIT 1`,
          [target.userId, target.year, target.month],
        );
        if (!savedRows[0] || Number(savedRows[0].target_count) !== target.count) {
          throw new Error(`Target row ${target.sourceRow} did not reconcile after import.`);
        }
        verifiedTargets += 1;
      }
    }
    console.log(JSON.stringify({
      mode: apply ? 'applied' : 'preview',
      snapshotRows: sourceRows.length,
      tpoProfilesAvailable: [...staffByName.values()].reduce((sum, matches) => sum + matches.length, 0),
      proposedMonthlyTargets: imported.targets.length,
      months: Object.fromEntries([...monthCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
      sourceRowsWithoutTarget: imported.rowsWithoutTarget,
      sourceRowsWithoutMonth: imported.rowsWithoutMonth,
      unmatchedSourceRows: imported.unmatchedRows,
      placementTargetsBefore: Number(existingRows[0].count),
      reconciledImportedTargets: verifiedTargets,
      updatesUseTpoAndMonthAsTheUniqueKey: true,
      changedDatabase: apply,
    }, null, 2));
    if (!apply) console.log('Preview only. Rerun with --apply only after reviewing the import summary.');
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Placement target import ${process.argv.includes('--apply') ? 'failed' : 'preview failed'}: ${error.message}`);
  process.exitCode = 1;
});
