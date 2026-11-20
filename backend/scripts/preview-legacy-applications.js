const mysqlPool = require('../config/mysqlPool');
const { parseSourceDateTime } = require('../utils/sourceDateTime');

const text = value => String(value ?? '').normalize('NFKC').trim();

async function main() {
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [sourceRows] = await connection.execute(
      `SELECT id, student_id, vacancy_id, owner_tpo_user_id, status, occurred_at,
              metadata, source_row_number
       FROM placement_tracker_records
       WHERE source_key = 'shared_placement' AND source_tab = 'Opening_Applied'
       ORDER BY source_row_number`,
    );
    const [canonicalRows] = await connection.execute(
      `SELECT student_id, vacancy_id, status, applied_at, source, source_record_key
       FROM job_applications`,
    );

    const counts = new Map();
    const statuses = new Map();
    const sourceLinks = new Set();
    const sourcePairCounts = new Map();
    const sourcePairStatuses = new Map();
    const sourcePairTimestampCounts = new Map();
    const embeddedEventStatuses = new Map();
    const eventTimeFormats = new Map();
    const rowTimeFormats = new Map();
    let embeddedEvents = 0;
    let embeddedEventsWithTime = 0;
    let malformedEmbeddedHistoryRows = 0;
    let embeddedHistoryMatchesRowStatus = 0;
    let embeddedHistoryLastTimestampBeforeRowTimestamp = 0;
    let embeddedHistoryLastTimestampAfterRowTimestamp = 0;
    let embeddedHistoryLastTimestampUnparseable = 0;
    let linked = 0;
    let missingStudent = 0;
    let missingVacancy = 0;
    let missingBoth = 0;
    let missingTimestamp = 0;
    let noOwner = 0;
    let unknownStatus = 0;

    for (const row of sourceRows) {
      if (row.student_id && row.vacancy_id) {
        linked += 1;
        const pair = `${row.student_id}:${row.vacancy_id}`;
        sourceLinks.add(pair);
        sourcePairCounts.set(pair, (sourcePairCounts.get(pair) || 0) + 1);
        const pairStatuses = sourcePairStatuses.get(pair) || new Set();
        pairStatuses.add(text(row.status).toLocaleLowerCase('en-US'));
        sourcePairStatuses.set(pair, pairStatuses);
        const pairTime = sourcePairTimestampCounts.get(pair) || { withTime: 0, withoutTime: 0 };
        pairTime[row.occurred_at ? 'withTime' : 'withoutTime'] += 1;
        sourcePairTimestampCounts.set(pair, pairTime);
      }
      if (!row.student_id && !row.vacancy_id) missingBoth += 1;
      else if (!row.student_id) missingStudent += 1;
      else if (!row.vacancy_id) missingVacancy += 1;
      if (!row.occurred_at) missingTimestamp += 1;
      if (!row.owner_tpo_user_id) noOwner += 1;
      const status = text(row.status) || '(blank)';
      statuses.set(status, (statuses.get(status) || 0) + 1);
      const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      const fields = metadata?.fields || {};
      const rawRowTime = fields.Timestamp || fields.TimeStamp || fields.Date || fields.Time || '';
      if (rawRowTime && !parseSourceDateTime(rawRowTime)) {
        const format = text(rawRowTime).replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'A');
        rowTimeFormats.set(format, (rowTimeFormats.get(format) || 0) + 1);
      }
      for (const [key, value] of Object.entries(fields)) {
        if (!/^(status history|history|application history)$/i.test(key) || !text(value)) continue;
        counts.set('sourceRowsWithEmbeddedHistory', (counts.get('sourceRowsWithEmbeddedHistory') || 0) + 1);
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          const events = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.history) ? parsed.history : [];
          for (const event of events) {
            embeddedEvents += 1;
            const eventTime = event?.changedAt || event?.timestamp || event?.date;
            if (parseSourceDateTime(eventTime)) embeddedEventsWithTime += 1;
            else if (text(eventTime)) {
              const format = text(eventTime).replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'A');
              eventTimeFormats.set(format, (eventTimeFormats.get(format) || 0) + 1);
            }
            const eventStatus = text(event?.status || event?.newStatus) || '(blank)';
            embeddedEventStatuses.set(eventStatus, (embeddedEventStatuses.get(eventStatus) || 0) + 1);
          }
          const lastEvent = events.at(-1);
          if (lastEvent && text(lastEvent.status || lastEvent.newStatus).toLocaleLowerCase('en-US') === text(row.status).toLocaleLowerCase('en-US')) {
            embeddedHistoryMatchesRowStatus += 1;
          }
          const parsedHistory = parseSourceDateTime(lastEvent?.changedAt || lastEvent?.timestamp || lastEvent?.date);
          const historyDate = parsedHistory ? new Date(`${parsedHistory.replace(' ', 'T')}Z`).getTime() : NaN;
          const rowDate = row.occurred_at ? new Date(row.occurred_at).getTime() : NaN;
          if (Number.isFinite(historyDate) && Number.isFinite(rowDate)) {
            if (historyDate < rowDate) embeddedHistoryLastTimestampBeforeRowTimestamp += 1;
            if (historyDate > rowDate) embeddedHistoryLastTimestampAfterRowTimestamp += 1;
          } else if (lastEvent && !Number.isFinite(historyDate)) {
            embeddedHistoryLastTimestampUnparseable += 1;
          }
        } catch {
          malformedEmbeddedHistoryRows += 1;
        }
        break;
      }
      if (!text(row.status)) unknownStatus += 1;
    }

    const canonicalPairCounts = new Map();
    for (const row of canonicalRows) {
      if (!row.student_id || !row.vacancy_id) continue;
      const pair = `${row.student_id}:${row.vacancy_id}`;
      canonicalPairCounts.set(pair, (canonicalPairCounts.get(pair) || 0) + 1);
    }
    const repeatedPairs = [...sourcePairCounts.values()].filter(count => count > 1).length;
    const repeatedRows = [...sourcePairCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
    const alreadyPresent = [...sourceLinks].filter(pair => canonicalPairCounts.has(pair)).length;
    const conflictingRepeatedPairs = [...sourcePairStatuses.entries()]
      .filter(([pair, pairStatuses]) => (sourcePairCounts.get(pair) || 0) > 1 && pairStatuses.size > 1);
    const conflictingRepeatedPairsWithUnknownTime = conflictingRepeatedPairs.filter(([pair]) => sourcePairTimestampCounts.get(pair)?.withoutTime > 0).length;

    const [[historyCounts]] = await connection.execute(
      `SELECT COUNT(*) AS total,
              SUM(occurred_at IS NULL) AS missing_time,
              SUM(JSON_EXTRACT(metadata, '$.sourceRow') IS NOT NULL) AS source_row_marked
       FROM application_status_history`,
    );

    console.log(JSON.stringify({
      previewOnly: true,
      openingAppliedRows: sourceRows.length,
      linkedToStudentAndVacancy: linked,
      rowsMissingStudentLink: missingStudent,
      rowsMissingVacancyLink: missingVacancy,
      rowsMissingBothLinks: missingBoth,
      rowsMissingSourceTimestamp: missingTimestamp,
      sourceRowTimestampFormatPatternsNotParsed: Object.fromEntries([...rowTimeFormats].sort((a, b) => b[1] - a[1]).slice(0, 8)),
      rowsWithoutTpoOwner: noOwner,
      rowsWithBlankStatus: unknownStatus,
      distinctLinkedStudentVacancyPairs: sourceLinks.size,
      repeatedLinkedPairs: repeatedPairs,
      repeatedLinkedSourceRowsBeyondFirst: repeatedRows,
      repeatedLinkedPairsWithDifferentStatuses: conflictingRepeatedPairs.length,
      conflictingPairsWithAtLeastOneMissingTimestamp: conflictingRepeatedPairsWithUnknownTime,
      statusCounts: Object.fromEntries([...statuses].sort((a, b) => a[0].localeCompare(b[0]))),
      rowsWithEmbeddedHistory: counts.get('sourceRowsWithEmbeddedHistory') || 0,
      embeddedHistoryEvents: embeddedEvents,
      embeddedHistoryEventsWithTimestamp: embeddedEventsWithTime,
      embeddedHistoryTimestampFormatPatternsNotParsed: Object.fromEntries([...eventTimeFormats].sort((a, b) => b[1] - a[1]).slice(0, 8)),
      malformedEmbeddedHistoryRows,
      embeddedHistoryRowsWhoseLastStatusMatchesCurrentRowStatus: embeddedHistoryMatchesRowStatus,
      embeddedHistoryLastTimestampBeforeRowTimestamp: embeddedHistoryLastTimestampBeforeRowTimestamp,
      embeddedHistoryLastTimestampAfterRowTimestamp: embeddedHistoryLastTimestampAfterRowTimestamp,
      embeddedHistoryLastTimestampUnparseable: embeddedHistoryLastTimestampUnparseable,
      embeddedHistoryStatusCounts: Object.fromEntries([...embeddedEventStatuses].sort((a, b) => a[0].localeCompare(b[0]))),
      existingCanonicalApplications: canonicalRows.length,
      matchingPairsAlreadyInCanonicalApplications: alreadyPresent,
      existingStatusHistory: {
        total: Number(historyCounts.total || 0),
        missingTimestamp: Number(historyCounts.missing_time || 0),
      },
    }, null, 2));
    console.log('Preview only. No records were changed and no person-level details were printed.');
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Legacy application preview failed: ${error.message}`);
  process.exitCode = 1;
});
