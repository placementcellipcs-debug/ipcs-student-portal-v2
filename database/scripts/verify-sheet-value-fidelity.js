const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const studentBackend = path.join(projectRoot, 'backend');
const tpoBackend = path.resolve(projectRoot, '../IPCS TPO Portal/backend');
const requireFromStudentBackend = moduleName => require(require.resolve(moduleName, { paths: [studentBackend] }));
const { google } = requireFromStudentBackend('googleapis');
const dotenv = requireFromStudentBackend('dotenv');
dotenv.config({ path: path.join(studentBackend, '.env') });
const mysqlPool = require(path.join(studentBackend, 'config/mysqlPool'));

const studentEnv = dotenv.parse(fs.readFileSync(path.join(studentBackend, '.env')));
const tpoEnv = dotenv.parse(fs.readFileSync(path.join(tpoBackend, '.env')));
const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const studentAuth = new google.auth.GoogleAuth({
  keyFile: path.join(studentBackend, 'google-credentials.json'),
  scopes,
});
const tpoAuth = new google.auth.JWT({
  email: tpoEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: String(tpoEnv.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes,
});

const workbookSources = [
  ['Student Portal', 'STUDENT_DATA_SPREADSHEET_ID', studentEnv.STUDENT_DATA_SPREADSHEET_ID, studentAuth],
  ['Student Portal', 'PLACEMENT_SPREADSHEET_ID', studentEnv.PLACEMENT_SPREADSHEET_ID, studentAuth],
  ['Student Portal', 'LEARNING_SPREADSHEET_ID', studentEnv.LEARNING_SPREADSHEET_ID, studentAuth],
  ['Student Portal', 'OPERATIONS_SPREADSHEET_ID', studentEnv.OPERATIONS_SPREADSHEET_ID, studentAuth],
  ['Student Portal', 'GAMEPAL_SPREADSHEET_ID', studentEnv.GAMEPAL_SPREADSHEET_ID, studentAuth],
  ['TPO Portal', 'STUDENT_DATA_SPREADSHEET_ID', tpoEnv.STUDENT_DATA_SPREADSHEET_ID, tpoAuth],
  ['TPO Portal', 'PLACEMENT_SPREADSHEET_ID', tpoEnv.PLACEMENT_SPREADSHEET_ID, tpoAuth],
  ['TPO Portal', 'LEARNING_SPREADSHEET_ID', tpoEnv.LEARNING_SPREADSHEET_ID, tpoAuth],
  ['TPO Portal', 'OPERATIONS_SPREADSHEET_ID', tpoEnv.OPERATIONS_SPREADSHEET_ID, tpoAuth],
  ['TPO Portal', 'ACADEMIC_SPREADSHEET_ID', tpoEnv.ACADEMIC_SPREADSHEET_ID || '1mhTuK_3dXLKk1DcUCTA7KFWHiCKirwmYP6l7wMLYPlo', tpoAuth],
  ['TPO Portal', 'PORTAL_AUDIT_SPREADSHEET_ID', tpoEnv.PORTAL_AUDIT_SPREADSHEET_ID || '11FH7p5rYIc0EmKvT6fd0PIIoc2ns8Vj-EjksX1BLZ-w', tpoAuth],
  ['TPO Portal', 'ASSET_SPREADSHEET_ID', tpoEnv.ASSET_SPREADSHEET_ID, tpoAuth],
].filter(([, , spreadsheetId]) => String(spreadsheetId || '').trim());

function sourceKey(sources) {
  const setting = sources[0]?.setting || 'unknown_source';
  const slug = setting.replace(/_SPREADSHEET_ID$/i, '').toLowerCase();
  return sources.length > 1 ? `shared_${slug}` : `${sources[0].portal === 'Student Portal' ? 'student' : 'tpo'}_${slug}`;
}

function isNonemptyRow(row) {
  return (row || []).some(value => String(value ?? '').trim() !== '');
}

function normalizeCells(row) {
  const cells = (row || []).map(value => String(value ?? ''));
  while (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function passwordColumns(headers) {
  return new Set(headers.flatMap((header, index) => {
    const key = String(header || '').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return ['password', 'password_hash'].includes(key) ? [index] : [];
  }));
}

function equalExceptPasswordCells(actual, stored, secretColumns) {
  const left = normalizeCells(actual);
  const right = normalizeCells(stored);
  if (left.length !== right.length) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (secretColumns.has(index)) continue;
      if ((left[index] ?? '') !== (right[index] ?? '')) return false;
    }
    return true;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (secretColumns.has(index)) continue;
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function main() {
  const grouped = new Map();
  for (const [portal, setting, spreadsheetId, auth] of workbookSources) {
    const existing = grouped.get(String(spreadsheetId));
    if (existing) existing.sources.push({ portal, setting });
    else grouped.set(String(spreadsheetId), { sources: [{ portal, setting }], auth });
  }

  const pool = mysqlPool.getPool();
  const [[latestRun]] = await pool.execute(
    "SELECT id, status FROM source_import_runs ORDER BY started_at DESC LIMIT 1",
  );
  if (latestRun?.status !== 'completed') throw new Error('No completed source snapshot is available to compare.');

  const report = {
    sourceWorkbooks: grouped.size,
    tabsCompared: 0,
    liveDataRows: 0,
    matchedRows: 0,
    missingArchivedRows: 0,
    extraArchivedRows: 0,
    rowsWithValueDifferences: 0,
    passwordCellsExcludedFromLiteralComparison: 0,
    whitespaceOnlyRowsSkippedBySnapshot: 0,
    tabsExceedingSnapshotColumnRange: 0,
  };
  const tabReports = [];

  try {
    for (const [spreadsheetId, workbook] of grouped) {
      const sheetsApi = google.sheets({ version: 'v4', auth: workbook.auth });
      const metadata = await sheetsApi.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(title,gridProperties(columnCount)))',
      });
      const sheets = metadata.data.sheets || [];
      const ranges = sheets.map(sheet => `'${String(sheet.properties.title).replace(/'/g, "''")}'!A:ZZ`);
      const response = ranges.length
        ? await sheetsApi.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges,
          majorDimension: 'ROWS',
          valueRenderOption: 'FORMATTED_VALUE',
        })
        : { data: { valueRanges: [] } };
      const key = sourceKey(workbook.sources);

      for (const [index, sheet] of sheets.entries()) {
        const tabName = sheet.properties.title;
        const rows = response.data.valueRanges?.[index]?.values || [];
        const headerIndex = rows.findIndex(isNonemptyRow);
        const headers = headerIndex >= 0 ? (rows[headerIndex] || []).map(value => String(value ?? '')) : [];
        const secretColumns = passwordColumns(headers);
        const sourceRows = new Map();
        let whitespaceOnlyRowsSkipped = 0;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex] || [];
          const hasLiteralContent = row.some(value => String(value ?? '') !== '');
          if (hasLiteralContent && !isNonemptyRow(row)) whitespaceOnlyRowsSkipped += 1;
          if (rowIndex === headerIndex || !isNonemptyRow(row)) continue;
          sourceRows.set(rowIndex + 1, row);
        }

        const [manifestRows] = await pool.execute(
          `SELECT headers_json FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ? LIMIT 1`,
          [key, tabName],
        );
        const [archiveRows] = await pool.execute(
          `SELECT sheet_row_number, row_data_json FROM source_sheet_records
           WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
          [key, tabName],
        );
        const archivedHeaders = manifestRows.length ? parseJson(manifestRows[0].headers_json) : null;
        const archivedByRow = new Map(archiveRows.map(row => [Number(row.sheet_row_number), parseJson(row.row_data_json)?.cells || []]));
        let matched = 0;
        let missing = 0;
        let differing = 0;
        let passwordCells = 0;
        const changedColumns = new Map();

        if (!archivedHeaders || JSON.stringify(archivedHeaders) !== JSON.stringify(headers)) differing += 1;
        for (const [rowNumber, sourceRow] of sourceRows) {
          report.liveDataRows += 1;
          const archived = archivedByRow.get(rowNumber);
          if (!archived) { missing += 1; continue; }
          if (equalExceptPasswordCells(sourceRow, archived, secretColumns)) matched += 1;
          else {
            differing += 1;
            const sourceCells = normalizeCells(sourceRow);
            const archivedCells = normalizeCells(archived);
            const columnCount = Math.max(sourceCells.length, archivedCells.length, headers.length);
            for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
              if (secretColumns.has(columnIndex)) continue;
              if ((sourceCells[columnIndex] ?? '') === (archivedCells[columnIndex] ?? '')) continue;
              const name = headers[columnIndex] || `column_${columnIndex + 1}`;
              changedColumns.set(name, (changedColumns.get(name) || 0) + 1);
            }
          }
          for (const column of secretColumns) {
            if (String(sourceRow[column] ?? '') !== '') passwordCells += 1;
          }
        }
        const extra = [...archivedByRow.keys()].filter(rowNumber => !sourceRows.has(rowNumber)).length;
        report.tabsCompared += 1;
        report.matchedRows += matched;
        report.missingArchivedRows += missing;
        report.extraArchivedRows += extra;
        report.rowsWithValueDifferences += differing;
        report.passwordCellsExcludedFromLiteralComparison += passwordCells;
        report.whitespaceOnlyRowsSkippedBySnapshot += whitespaceOnlyRowsSkipped;
        if (Number(sheet.properties.gridProperties?.columnCount || 0) > 702) report.tabsExceedingSnapshotColumnRange += 1;
        tabReports.push({
          tab: tabName,
          rows: sourceRows.size,
          matchedRows: matched,
          missingRows: missing,
          extraRows: extra,
          rowsWithValueDifferences: differing,
          changedColumns: Object.fromEntries([...changedColumns].sort((left, right) => right[1] - left[1])),
          passwordCellsExcluded: passwordCells,
          whitespaceOnlyRowsSkipped,
          sourceColumnsBeyondCapturedRange: Number(sheet.properties.gridProperties?.columnCount || 0) > 702,
        });
      }
    }
    const passed = report.missingArchivedRows === 0
      && report.extraArchivedRows === 0
      && report.rowsWithValueDifferences === 0
      && report.whitespaceOnlyRowsSkippedBySnapshot === 0
      && report.tabsExceedingSnapshotColumnRange === 0;
    console.log(JSON.stringify({ passed, ...report }, null, 2));
    for (const tab of tabReports) {
      if (tab.missingRows || tab.extraRows || tab.rowsWithValueDifferences || tab.whitespaceOnlyRowsSkipped || tab.sourceColumnsBeyondCapturedRange) {
        console.log(JSON.stringify(tab));
      }
    }
    if (!passed) process.exitCode = 1;
    else console.log('All non-password visible cell values and source row positions match the database snapshot.');
    console.log('Password values were not printed or compared literally. No spreadsheet values were written.');
  } finally {
    await mysqlPool.close();
  }
}

main().catch(error => {
  const message = String(error?.message || 'Unknown verification error').replace(/(?:1[a-zA-Z0-9_-]{20,})/g, '[redacted identifier]');
  console.error(`Value-fidelity verification failed: ${message.slice(0, 1000)}`);
  process.exitCode = 1;
});
