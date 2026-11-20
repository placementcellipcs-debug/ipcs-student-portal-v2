const mysqlPool = require('../config/mysqlPool');

const SOURCE = 'student_gamepal';
const TABS = ['GamePal_Logs', 'GamePal_Stats', 'GamePal_Challenges', 'GamePal_Rooms', 'GamePal_Room_Members'];
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
const field = (record, ...aliases) => {
  const entries = Object.entries(record?.fields || {});
  const keys = new Set(aliases.map(name => name.replace(/[^a-z0-9]/gi, '').toLowerCase()));
  const match = entries.find(([name, value]) => keys.has(name.replace(/[^a-z0-9]/gi, '').toLowerCase()) && String(value ?? '').trim());
  return match?.[1] ?? '';
};
const duplicateOccurrences = values => {
  const counts = new Map();
  for (const value of values.map(normalize).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
};

async function main() {
  const pool = mysqlPool.getPool();
  try {
    const [manifests] = await pool.execute(
      'SELECT tab_name, headers_json, imported_record_count FROM source_sheet_manifest WHERE source_key = ? ORDER BY tab_name',
      [SOURCE],
    );
    const [rows] = await pool.execute(
      `SELECT tab_name, row_data_json FROM source_sheet_records
        WHERE source_key = ? AND tab_name IN (${TABS.map(() => '?').join(',')})
        ORDER BY tab_name, sheet_row_number`,
      [SOURCE, ...TABS],
    );
    const byTab = new Map(TABS.map(tab => [tab, []]));
    for (const row of rows) {
      const list = byTab.get(row.tab_name);
      if (list) list.push(typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json);
    }
    const counts = Object.fromEntries(TABS.map(tab => [tab, byTab.get(tab).length]));
    const emailCounts = {};
    for (const tab of ['GamePal_Logs', 'GamePal_Stats']) {
      emailCounts[tab] = byTab.get(tab).filter(row => field(row, 'Email', 'Student Email')).length;
    }
    const members = byTab.get('GamePal_Room_Members');
    const memberKeys = members.map(row => `${normalize(field(row, 'Room Code'))}\u0000${normalize(field(row, 'Student Email'))}`);
    const report = {
      source: SOURCE,
      requiredTabs: TABS.map(tab => {
        const manifest = manifests.find(row => row.tab_name === tab);
        let headers = manifest?.headers_json || [];
        if (typeof headers === 'string') { try { headers = JSON.parse(headers); } catch { headers = []; } }
        return { tab, archivedRows: counts[tab], manifestRows: Number(manifest?.imported_record_count || 0), headers };
      }),
      identityRowsWithEmail: emailCounts,
      dataQuality: {
        duplicateStatsEmails: duplicateOccurrences(byTab.get('GamePal_Stats').map(row => field(row, 'Email'))),
        duplicateChallengeIds: duplicateOccurrences(byTab.get('GamePal_Challenges').map(row => field(row, 'Challenge ID'))),
        duplicateRoomCodes: duplicateOccurrences(byTab.get('GamePal_Rooms').map(row => field(row, 'Room Code'))),
        duplicateRoomMembers: duplicateOccurrences(memberKeys),
        roomsWithoutCreatorEmail: byTab.get('GamePal_Rooms').filter(row => !normalize(field(row, 'Creator Email'))).length,
        sessionsWithoutEmail: byTab.get('GamePal_Logs').filter(row => !normalize(field(row, 'Email'))).length,
      },
      archivedRowsNotUsedByThisFeature: manifests.filter(row => !TABS.includes(row.tab_name)).map(row => row.tab_name),
      writes: 0,
    };
    console.log(JSON.stringify(report, null, 2));
    console.log('Read-only preview; no student identifiers or row contents were printed.');
  } finally {
    await mysqlPool.close();
  }
}

main().catch(async error => {
  console.error(`GamePal preview failed: ${error.message}`);
  await mysqlPool.close().catch(() => {});
  process.exitCode = 1;
});
