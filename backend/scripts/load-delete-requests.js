const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const normalized = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const text = value => String(value ?? '').trim();
const getField = (fields, ...names) => {
  const index = new Map(Object.entries(fields || {}).map(([key, value]) => [key.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, ''), value]));
  for (const name of names) {
    const key = name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
    if (index.has(key)) return index.get(key);
  }
  return '';
};
const stableUuid = value => {
  const bytes = crypto.createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
function sqlDate(value) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : text(value);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4] || '00'}:${match[5] || '00'}:${match[6] || '00'}`;
  match = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  let [, day, month, year, hour, minute, second] = match;
  if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${String(hour || '00').padStart(2, '0')}:${minute || '00'}:${second || '00'}`;
}
function statusValue(value) {
  const status = normalized(value);
  if (status === 'approved' || status === 'rejected' || status === 'failed' || status === 'processing') return status;
  return 'pending';
}

async function main() {
  const apply = process.argv.includes('--apply');
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [runs] = await connection.execute("SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1");
    if (runs[0]?.status !== 'completed') throw new Error('Import and verify the one-time source snapshot before loading deletion requests.');
    const [sourceRows, users] = await Promise.all([
      connection.execute(`SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = 'shared_operations' AND tab_name = 'TPO_Delete_Requests' ORDER BY sheet_row_number`).then(([rows]) => rows),
      connection.execute('SELECT id, normalized_email FROM users WHERE normalized_email IS NOT NULL').then(([rows]) => rows),
    ]);
    const usersByEmail = new Map(users.map(user => [normalized(user.normalized_email), user.id]));
    const records = sourceRows.map(row => {
      const record = typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
      const fields = record?.fields || {};
      const requestCode = text(getField(fields, 'Request ID'));
      if (!requestCode) return null;
      const requestedByEmail = text(getField(fields, 'Requested By Email'));
      const reviewedByEmail = text(getField(fields, 'Reviewed By Email'));
      const targetRaw = getField(fields, 'Target Snapshot');
      let targetSnapshot = {};
      try { targetSnapshot = typeof targetRaw === 'string' ? JSON.parse(targetRaw || '{}') : (targetRaw || {}); } catch { targetSnapshot = {}; }
      return {
        rowNumber: Number(row.sheet_row_number), requestCode, status: statusValue(getField(fields, 'Status')),
        recordType: text(getField(fields, 'Record Type')) || 'Unknown', targetId: text(getField(fields, 'Target ID')) || 'unknown',
        summary: text(getField(fields, 'Target Summary')) || 'Request summary unavailable', targetSnapshot,
        reason: text(getField(fields, 'Reason')) || 'No reason recorded', requestedByEmail,
        requestedByName: text(getField(fields, 'Requested By Name')) || 'Unknown', requestedByRole: text(getField(fields, 'Requested By Role')),
        requestedAt: sqlDate(getField(fields, 'Requested At')),
        reviewedByEmail, reviewedByName: text(getField(fields, 'Reviewed By Name')),
        reviewedAt: sqlDate(getField(fields, 'Reviewed At')), decisionNotes: text(getField(fields, 'Decision Notes')),
        executionMessage: text(getField(fields, 'Execution Message')),
        sourceFields: fields,
        requestedById: usersByEmail.get(normalized(requestedByEmail)) || null,
        reviewedById: usersByEmail.get(normalized(reviewedByEmail)) || null,
      };
    }).filter(Boolean);
    const requestCodes = new Set();
    for (const row of records) {
      if (requestCodes.has(row.requestCode)) throw new Error(`Duplicate deletion request ID at imported row ${row.rowNumber}; no rows were written.`);
      requestCodes.add(row.requestCode);
    }
    const report = {
      mode: apply ? 'apply' : 'preview', sourceRows: records.length,
      pending: records.filter(row => row.status === 'pending').length,
      vacancyRequests: records.filter(row => normalized(row.recordType) === 'vacancy').length,
      requestsWithUnmappedActors: records.filter(row => !row.requestedById || (row.reviewedByEmail && !row.reviewedById)).length,
    };
    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      console.log('Preview only. Request IDs, names, email addresses, and target details were not printed.');
      return;
    }
    await connection.beginTransaction();
    for (const row of records) {
      await connection.execute(
        `INSERT INTO tpo_delete_requests
         (id, request_code, status, record_type, target_id, target_summary, target_snapshot, reason,
          requested_by_user_id, requested_by_name, requested_by_email, requested_by_role, requested_at,
          reviewed_by_user_id, reviewed_by_name, reviewed_by_email, reviewed_at, decision_notes, execution_message, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), target_summary = VALUES(target_summary), target_snapshot = VALUES(target_snapshot),
          reason = VALUES(reason), reviewed_by_user_id = VALUES(reviewed_by_user_id), reviewed_by_name = VALUES(reviewed_by_name),
          reviewed_by_email = VALUES(reviewed_by_email), reviewed_at = VALUES(reviewed_at), decision_notes = VALUES(decision_notes),
          execution_message = VALUES(execution_message), metadata = VALUES(metadata)`,
        [stableUuid(`tpo-delete:${row.requestCode}`), row.requestCode, row.status, row.recordType.slice(0, 80), row.targetId.slice(0, 200),
          row.summary.slice(0, 500), JSON.stringify(row.targetSnapshot), row.reason.slice(0, 500), row.requestedById,
          row.requestedByName.slice(0, 160), row.requestedByEmail.slice(0, 254), row.requestedByRole.slice(0, 100) || null,
          row.requestedAt, row.reviewedById, row.reviewedByName.slice(0, 160) || null, row.reviewedByEmail.slice(0, 254) || null,
          row.reviewedAt, row.decisionNotes.slice(0, 1000) || null, row.executionMessage.slice(0, 1000) || null,
          JSON.stringify({ source: 'shared_operations:TPO_Delete_Requests', sourceRow: row.rowNumber, fields: row.sourceFields })],
      );
    }
    await connection.commit();
    const [[counts]] = await connection.execute('SELECT COUNT(*) AS total, SUM(status = \'pending\') AS pending FROM tpo_delete_requests');
    console.log(JSON.stringify({ ...report, status: 'completed', requestsInDatabase: Number(counts.total), pendingInDatabase: Number(counts.pending || 0) }, null, 2));
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Deletion request load failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => { console.error(`Deletion request load could not start: ${error.message}`); process.exitCode = 1; });
