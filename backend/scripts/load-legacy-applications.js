const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { parseSourceDateTime } = require('../utils/sourceDateTime');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalized = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizedField = value => normalized(value).replace(/[^a-z0-9]/g, '');

function makeId(scope, key) {
  const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function fieldValue(fields, ...aliases) {
  const wanted = new Set(aliases.map(normalizedField));
  for (const [key, value] of Object.entries(fields || {})) {
    if (wanted.has(normalizedField(key))) return value;
  }
  return '';
}

function makeEvent({ row, rowFields, index, embedded = null }) {
  const status = text(embedded?.status || embedded?.newStatus || row.status);
  if (!status) return null;
  const occurredAt = parseSourceDateTime(embedded?.changedAt || embedded?.changed_at || embedded?.timestamp || embedded?.date || row.occurred_at);
  const note = text(embedded?.remarks || embedded?.note || embedded?.comments)
    || (embedded ? '' : text(fieldValue(rowFields, 'Remarks', 'Remarks / Notes', 'Notes', 'Note', 'Comments')));
  const actorLabel = text(embedded?.changedBy || embedded?.changed_by);
  const actorId = embedded ? null : row.owner_tpo_user_id || null;
  return {
    sourceRowNumber: Number(row.source_row_number),
    sourceEventIndex: index,
    status,
    occurredAt,
    note: note || null,
    actorLabel: actorLabel || null,
    actorId,
    interviewDate: text(embedded?.interviewDate || fieldValue(rowFields, 'Interview Date')) || null,
    interviewTime: text(embedded?.interviewTime || fieldValue(rowFields, 'Interview Time', 'IntervewTime')) || null,
    interviewVenue: text(embedded?.interviewVenue || fieldValue(rowFields, 'Interview Venue')) || null,
    event: text(embedded?.event) || null,
  };
}

function eventSort(left, right) {
  if (left.occurredAt && right.occurredAt && left.occurredAt !== right.occurredAt) {
    return left.occurredAt.localeCompare(right.occurredAt);
  }
  if (left.occurredAt && !right.occurredAt) return 1;
  if (!left.occurredAt && right.occurredAt) return -1;
  return left.sourceRowNumber - right.sourceRowNumber || left.sourceEventIndex - right.sourceEventIndex;
}

function rowSort(left, right) {
  return String(left.occurred_at || '').localeCompare(String(right.occurred_at || ''))
    || Number(left.source_row_number) - Number(right.source_row_number);
}

function uniqueNameMap(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalized(row.full_name);
    if (!key) continue;
    const values = grouped.get(key) || [];
    values.push(row.id);
    grouped.set(key, values);
  }
  return new Map([...grouped].filter(([, ids]) => ids.length === 1).map(([key, ids]) => [key, ids[0]]));
}

function makeBatches(rows, size) {
  const batches = [];
  for (let index = 0; index < rows.length; index += size) batches.push(rows.slice(index, index + size));
  return batches;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = mysqlPool.getPool();
  const connection = await pool.getConnection();
  try {
    const [[run]] = await connection.execute("SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1");
    if (run?.status !== 'completed') throw new Error('Import and verify the source-sheet snapshot before migrating legacy applications.');

    const [rows] = await connection.execute(
      `SELECT id, source_row_number, student_id, vacancy_id, owner_tpo_user_id,
              status, occurred_at, metadata
       FROM placement_tracker_records
       WHERE source_key = 'shared_placement' AND source_tab = 'Opening_Applied'
       ORDER BY source_row_number`,
    );
    const [studentRows] = await connection.execute(
      `SELECT sp.id, sp.metadata FROM student_profiles sp`,
    );
    const [vacancyRows] = await connection.execute(
      `SELECT id, job_code, title, company_name, assigned_tpo_user_id, metadata FROM vacancies`,
    );
    const [staffRows] = await connection.execute('SELECT id, full_name FROM users');
    const [existingRows] = await connection.execute(
      'SELECT id, student_id, vacancy_id, source FROM job_applications',
    );

    const students = new Map(studentRows.map(row => [row.id, parseJson(row.metadata)]));
    const vacancies = new Map(vacancyRows.map(row => [row.id, row]));
    const actorByName = uniqueNameMap(staffRows);
    const existingByPair = new Map(existingRows.map(row => [`${row.student_id}:${row.vacancy_id}`, row]));
    const groups = new Map();
    let unlinkedRows = 0;
    let rowsWithoutTpoOwner = 0;
    let rowsWithoutSourceTimestamp = 0;
    let malformedEmbeddedHistoryRows = 0;
    let embeddedEventCount = 0;

    for (const row of rows) {
      if (!row.student_id || !row.vacancy_id) { unlinkedRows += 1; continue; }
      if (!row.owner_tpo_user_id) rowsWithoutTpoOwner += 1;
      if (!row.occurred_at) rowsWithoutSourceTimestamp += 1;
      const pairKey = `${row.student_id}:${row.vacancy_id}`;
      const group = groups.get(pairKey) || [];
      group.push(row);
      groups.set(pairKey, group);
    }

    const planned = [];
    let existingNonLegacyCollisions = 0;
    for (const [pairKey, pairRows] of groups) {
      pairRows.sort(rowSort);
      const existing = existingByPair.get(pairKey);
      if (existing && existing.source !== 'legacy_opening_applied') {
        existingNonLegacyCollisions += 1;
        continue;
      }
      const appId = existing?.id || makeId('legacy-job-application', pairKey);
      const sourceEvents = [];
      for (const row of pairRows) {
        const imported = parseJson(row.metadata);
        const rowFields = imported?.fields || {};
        const rawHistory = fieldValue(rowFields, 'Status History', 'Application History', 'History');
        let embedded = [];
        if (text(rawHistory)) {
          const parsed = parseJson(rawHistory);
          embedded = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.history) ? parsed.history : [];
          if (!embedded.length && parsed && Object.keys(parsed).length) malformedEmbeddedHistoryRows += 1;
        }
        embeddedEventCount += embedded.length;
        const embeddedSignatures = new Set(embedded.map((event, index) => {
          const parsedTime = parseSourceDateTime(event?.changedAt || event?.changed_at || event?.timestamp || event?.date);
          const eventStatus = normalized(event?.status || event?.newStatus || '');
          const note = normalized(event?.remarks || event?.note || event?.comments || '');
          return `${eventStatus}|${parsedTime || ''}|${note}`;
        }));
        const currentEvent = makeEvent({ row, rowFields, index: 0 })
          || (!text(row.status) && !embedded.length
            ? makeEvent({ row: { ...row, status: 'Applied' }, rowFields, index: 0 })
            : null);
        const currentSignature = currentEvent
          ? `${normalized(currentEvent.status)}|${currentEvent.occurredAt || ''}|${normalized(currentEvent.note || '')}`
          : '';
        if (currentEvent && !embeddedSignatures.has(currentSignature)) sourceEvents.push(currentEvent);
        for (let index = 0; index < embedded.length; index += 1) {
          const event = makeEvent({ row, rowFields, index: index + 1, embedded: embedded[index] });
          if (!event) continue;
          event.actorId = actorByName.get(normalized(event.actorLabel)) || null;
          sourceEvents.push(event);
        }
      }
      sourceEvents.sort(eventSort);
      const latestRow = pairRows.at(-1);
      const latestRowFields = parseJson(latestRow.metadata)?.fields || {};
      const currentEvent = [...sourceEvents].reverse().find(event => event.occurredAt) || sourceEvents.at(-1);
      const appliedAt = pairRows.map(row => row.occurred_at).filter(Boolean).sort()[0] || null;
      const sourceStatuses = [...new Set(pairRows.map(row => text(row.status)).filter(Boolean))];
      const studentMetadata = students.get(latestRow.student_id) || {};
      const vacancy = vacancies.get(latestRow.vacancy_id) || {};
      const profileFields = studentMetadata.fields || {};
      const openingFields = { ...(parseJson(vacancy.metadata)?.fields || {}), ...latestRowFields };
      const metadata = JSON.stringify({
        source: 'legacy_opening_applied',
        studentSourceFields: profileFields,
        openingSourceFields: openingFields,
        migration: {
          sourceKey: 'shared_placement',
          sourceTab: 'Opening_Applied',
          sourceRows: pairRows.map(row => Number(row.source_row_number)),
          repeatedRowCount: Math.max(0, pairRows.length - 1),
          sourceStatuses: sourceStatuses,
          currentStatusTimestampMissing: !currentEvent?.occurredAt,
        },
      });
      planned.push({
        id: appId,
        pairKey,
        studentId: latestRow.student_id,
        vacancyId: latestRow.vacancy_id,
        ownerId: latestRow.owner_tpo_user_id || null,
        status: text(currentEvent?.status || latestRow.status) || 'Applied',
        appliedAt,
        source: 'legacy_opening_applied',
        sourceRecordKey: pairKey,
        metadata,
        sourceRowCount: pairRows.length,
        events: sourceEvents.map((event, index) => ({
          ...event,
          previousStatus: index ? sourceEvents[index - 1].status : null,
          id: makeId('legacy-application-history', `${pairKey}:${event.sourceRowNumber}:${event.sourceEventIndex}`),
        })),
        statusConflict: sourceStatuses.length > 1,
      });
    }

    const histories = planned.flatMap(application => application.events.map(event => ({
      id: event.id,
      applicationId: application.id,
      previousStatus: event.previousStatus,
      newStatus: event.status,
      note: event.note,
      actorUserId: event.actorId,
      occurredAt: event.occurredAt,
      metadata: JSON.stringify({
        source: 'legacy_opening_applied',
        changedBy: event.actorLabel,
        event: event.event,
        interviewDate: event.interviewDate,
        interviewTime: event.interviewTime,
        interviewVenue: event.interviewVenue,
      }),
      sourceRowNumber: event.sourceRowNumber,
      sourceEventIndex: event.sourceEventIndex,
    })));

    const conflicts = planned.filter(application => application.statusConflict).length;
    const report = {
      mode: apply ? 'apply' : 'preview',
      openingAppliedSourceRows: rows.length,
      linkedSourceRows: rows.length - unlinkedRows,
      unresolvedSourceRowsRetainedInTrackerArchive: unlinkedRows,
      currentApplicationsToNormalize: planned.length,
      repeatedSourceRowsConsolidated: planned.reduce((total, application) => total + Math.max(0, application.sourceRowCount - 1), 0),
      sourcePairsWithDifferentTopLevelStatuses: conflicts,
      statusHistoryEventsToImport: histories.length,
      embeddedHistoryEventsFound: embeddedEventCount,
      malformedEmbeddedHistoryRows,
      sourceRowsWithoutTpoOwner: rowsWithoutTpoOwner,
      sourceRowsWithoutTimestamp: rowsWithoutSourceTimestamp,
      existingCanonicalApplications: existingRows.length,
      existingNonLegacyPairsSkippedToProtectCurrentApplications: existingNonLegacyCollisions,
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      console.log('Preview only. No records were written; unresolved source rows remain in placement_tracker_records.');
      return;
    }

    await connection.beginTransaction();
    for (const batch of makeBatches(planned, 100)) {
      const values = batch.flatMap(row => [row.id, row.studentId, row.vacancyId, row.ownerId, row.status,
        row.appliedAt, row.source, row.sourceRecordKey, row.metadata]);
      await connection.query(
        `INSERT IGNORE INTO job_applications
          (id, student_id, vacancy_id, owner_tpo_user_id, status, applied_at, source, source_record_key, metadata)
         VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`,
        values,
      );
    }
    for (const batch of makeBatches(histories, 250)) {
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const values = batch.flatMap(row => [row.id, row.applicationId, row.previousStatus, row.newStatus, row.note,
        row.actorUserId, row.occurredAt, row.metadata, 'shared_placement', 'Opening_Applied', row.sourceRowNumber, row.sourceEventIndex]);
      await connection.query(
        `INSERT INTO application_status_history
          (id, application_id, previous_status, new_status, note, actor_user_id, occurred_at, metadata,
           source_key, source_tab, source_row_number, source_event_index)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           application_id = VALUES(application_id), previous_status = VALUES(previous_status),
           new_status = VALUES(new_status), note = VALUES(note), actor_user_id = VALUES(actor_user_id),
           occurred_at = VALUES(occurred_at), metadata = VALUES(metadata)`,
        values,
      );
    }
    await connection.commit();

    const [[counts]] = await connection.execute(
      `SELECT COUNT(*) AS total,
              SUM(source = 'legacy_opening_applied') AS migrated,
              (SELECT COUNT(*) FROM application_status_history WHERE source_key = 'shared_placement' AND source_tab = 'Opening_Applied') AS history
       FROM job_applications`,
    );
    console.log(JSON.stringify({
      ...report,
      status: 'completed',
      canonicalApplicationsNow: Number(counts.total || 0),
      legacyApplicationsNow: Number(counts.migrated || 0),
      importedStatusHistoryNow: Number(counts.history || 0),
    }, null, 2));
    console.log('Each linked student/opening pair is now one canonical application; every source row remains in the tracker archive.');
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Legacy application migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => {
  console.error(`Legacy application migration could not start: ${error.message}`);
  process.exitCode = 1;
});
