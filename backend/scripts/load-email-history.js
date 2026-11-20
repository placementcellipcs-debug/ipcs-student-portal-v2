const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { parsePortalDateTime } = require('../utils/portalDateTime');

const SOURCE = 'shared_operations';
const SOURCE_TABS = ['Mail', 'EmailQueue', 'EmailQuotaUsage', 'MailDeliveryAttempts'];
const QUOTA_FIELDS = ['ID', 'SenderKey', 'EmailCategory', 'SenderEmail', 'Provider', 'RecipientCount', 'TrackedRemaining', 'AppsScriptRemaining', 'SentAt'];
const text = value => String(value ?? '').normalize('NFKC').trim();
const normalizedKey = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const sourceRowKey = (tab, row, suffix = '') => `${tab}:${row}${suffix ? `:${suffix}` : ''}`;

function stableId(scope, key) {
    const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function field(fields, ...aliases) {
    const wanted = new Set(aliases.map(normalizedKey));
    for (const [key, value] of Object.entries(fields || {})) {
        if (wanted.has(normalizedKey(key)) && text(value)) return text(value);
    }
    return '';
}

function parseDateTime(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const milliseconds = parsePortalDateTime(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function integer(value, max = 2147483647) {
    const parsed = Number(String(value ?? '').replace(/[, ]/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? Math.round(parsed) : null;
}

function outcome(value) {
    const status = text(value).toLowerCase();
    if (/review|uncertain/.test(status)) return 'review';
    if (/fail|error|reject/.test(status)) return 'failed';
    if (/sent|success|deliver/.test(status)) return 'sent';
    if (/queue|pending|retry/.test(status)) return 'queued';
    if (/cancel|skip/.test(status)) return 'cancelled';
    return status.slice(0, 30) || 'unknown';
}

function jsonData(row) {
    return typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
}

async function readTab(connection, tab) {
    const [rows] = await connection.execute(
        `SELECT sheet_row_number, row_data_json FROM source_sheet_records
          WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
        [SOURCE, tab],
    );
    return rows.map(row => ({ rowNumber: Number(row.sheet_row_number), data: jsonData(row) }));
}

function quotaRowFromCells(cells, rowNumber, layout, suffix = '') {
    const values = cells.slice(layout === 'right' ? 9 : 0, layout === 'right' ? 18 : 9);
    const byName = Object.fromEntries(QUOTA_FIELDS.map((header, index) => [header, values[index] ?? '']));
    const email = text(byName.SenderEmail).slice(0, 254);
    const senderKey = text(byName.SenderKey).slice(0, 40);
    const emailCategory = text(byName.EmailCategory).slice(0, 80);
    if (!senderKey || !emailCategory || !email) return null;
    const sourceRecordKey = sourceRowKey('EmailQuotaUsage', rowNumber, suffix || layout);
    return {
        id: stableId('email-quota', `${SOURCE}:${sourceRecordKey}`), senderKey, emailCategory, senderEmail: email,
        provider: text(byName.Provider).slice(0, 80) || null,
        recipientCount: integer(byName.RecipientCount, 100000) ?? 0,
        trackedRemaining: integer(byName.TrackedRemaining, 100000),
        appsScriptRemaining: integer(byName.AppsScriptRemaining, 100000),
        sentAt: parseDateTime(byName.SentAt),
        sourceRecordKey,
        metadata: JSON.stringify({ sourceBlock: layout, sourceRowNumber: rowNumber, originalId: text(byName.ID).slice(0, 190) || null }),
    };
}

async function buildCandidates(connection) {
    const [mailRows, queueRows, quotaRows, attemptRows] = await Promise.all(SOURCE_TABS.map(tab => readTab(connection, tab)));
    const [manifestRows] = await connection.execute(
        'SELECT headers_json FROM source_sheet_manifest WHERE source_key = ? AND tab_name = ? LIMIT 1',
        [SOURCE, 'EmailQuotaUsage'],
    );
    let quotaHeaders = manifestRows[0]?.headers_json || [];
    if (typeof quotaHeaders === 'string') { try { quotaHeaders = JSON.parse(quotaHeaders); } catch { quotaHeaders = []; } }

    const mail = mailRows.map(row => {
        const fields = row.data?.fields || {};
        const occurredAt = parseDateTime(field(fields, 'TimeStamp', 'Timestamp', 'Date'));
        return {
            id: stableId('mail-log', `${SOURCE}:${sourceRowKey('Mail', row.rowNumber)}`),
            occurredAt,
            recipientName: field(fields, 'Reciver Name', 'Receiver Name', 'Recipient Name').slice(0, 200) || null,
            recipientEmail: field(fields, 'Reciver Mail', 'Receiver Mail', 'Recipient Email', 'Email').slice(0, 254) || null,
            mailType: field(fields, 'Mail Type', 'Type').slice(0, 100) || null,
            subject: field(fields, 'Subject').slice(0, 500) || null,
            status: outcome(field(fields, 'Status')),
            sourceRecordKey: sourceRowKey('Mail', row.rowNumber),
            metadata: JSON.stringify({ sourceRowNumber: row.rowNumber }),
        };
    });

    const queue = queueRows.map(row => {
        const fields = row.data?.fields || {};
        const createdAt = parseDateTime(field(fields, 'CreatedAt', 'Created At'));
        return {
            id: stableId('email-queue-history', `${SOURCE}:${sourceRowKey('EmailQueue', row.rowNumber)}`),
            sourceRecordKey: sourceRowKey('EmailQueue', row.rowNumber),
            sourceQueueId: field(fields, 'ID').slice(0, 190) || null,
            emailCategory: field(fields, 'EmailCategory', 'Category').slice(0, 80) || null,
            status: outcome(field(fields, 'Status')),
            attempts: integer(field(fields, 'Attempts'), 100000) ?? 0,
            nextAttemptAt: parseDateTime(field(fields, 'NextAttemptAt', 'Next Attempt At')),
            provider: field(fields, 'Provider').slice(0, 80) || null,
            createdAt,
            updatedAt: parseDateTime(field(fields, 'UpdatedAt', 'Updated At')),
            metadata: JSON.stringify({ sourceRowNumber: row.rowNumber, logType: field(fields, 'MailType', 'LogName').slice(0, 100) || null }),
        };
    });

    const quota = [];
    let quotaLegacyRows = 0;
    let quotaRightBlockRows = 0;
    let quotaSkippedRows = 0;
    let quotaUnparsedDates = 0;
    for (const row of quotaRows) {
        const cells = row.data?.cells || [];
        const leftBlockPresent = cells.slice(0, 9).some(value => text(value));
        const rightBlockPresent = cells.slice(9, 18).some(value => text(value));
        if (leftBlockPresent && rightBlockPresent) {
            quotaSkippedRows += 1;
            continue;
        }
        if (!leftBlockPresent && !rightBlockPresent) continue;
        const layout = rightBlockPresent ? 'right' : 'left';
        const candidate = quotaRowFromCells(cells, row.rowNumber, layout);
        if (layout === 'right') quotaRightBlockRows += 1;
        else quotaLegacyRows += 1;
        if (!candidate) { quotaSkippedRows += 1; continue; }
        if (!candidate.sentAt) quotaUnparsedDates += 1;
        quota.push(candidate);
    }

    // The first nonempty sheet row was misidentified as a header because the
    // legacy A:I quota block had no header row; its nine values remain in the
    // manifest while the real J:R headers were added beside them.
    const rightHeadersMatch = QUOTA_FIELDS.every((name, index) => normalizedKey(quotaHeaders[9 + index]) === normalizedKey(name));
    const firstLegacyRow = rightHeadersMatch && quotaHeaders.slice(0, 9).some(value => text(value))
        ? quotaRowFromCells(quotaHeaders, 1, 'left', 'recovered-first-row') : null;
    if (firstLegacyRow) {
        if (!firstLegacyRow.sentAt) quotaUnparsedDates += 1;
        quota.unshift(firstLegacyRow);
        quotaLegacyRows += 1;
    }

    const attempts = attemptRows.map(row => {
        const fields = row.data?.fields || {};
        return {
            id: stableId('email-attempt', `${SOURCE}:${sourceRowKey('MailDeliveryAttempts', row.rowNumber)}`),
            attemptedAt: parseDateTime(field(fields, 'AttemptedAt', 'Attempted At')),
            senderKey: field(fields, 'SenderKey', 'Sender Key').slice(0, 40) || null,
            senderEmail: field(fields, 'SenderEmail', 'Sender Email').slice(0, 254) || null,
            emailCategory: field(fields, 'EmailCategory', 'Category').slice(0, 80) || null,
            provider: field(fields, 'Provider').slice(0, 80) || null,
            result: outcome(field(fields, 'Outcome', 'Result')),
            recipientCount: integer(field(fields, 'RecipientCount', 'Recipient Count'), 100000),
            remainingQuota: integer(field(fields, 'AppsScriptRemaining', 'Remaining Quota'), 100000),
            subject: field(fields, 'Subject').slice(0, 500) || null,
            providerMessageId: field(fields, 'MessageID', 'Message ID').slice(0, 255) || null,
            errorMessage: field(fields, 'Error', 'Error Message').slice(0, 4000) || null,
            deliveryId: field(fields, 'DeliveryID', 'Delivery ID').slice(0, 190) || null,
            sourceRecordKey: sourceRowKey('MailDeliveryAttempts', row.rowNumber),
            metadata: JSON.stringify({ sourceRowNumber: row.rowNumber }),
        };
    });

    const countDates = rows => rows.filter(row => row.occurredAt || row.attemptedAt || row.sentAt).length;
    return {
        mail, queue, quota, attempts,
        quotaSummary: {
            legacyFirstNineRows: quotaLegacyRows,
            secondNineRows: quotaRightBlockRows,
            recoveredFirstManifestRow: firstLegacyRow ? 1 : 0,
            rowsWithoutRequiredQuotaFields: quotaSkippedRows,
            rowsWithoutParsedSentAt: quotaUnparsedDates,
        },
        sourceCounts: { mail: mailRows.length, queue: queueRows.length, quota: quotaRows.length, attempts: attemptRows.length },
        parsedDates: {
            mail: countDates(mail),
            queueCreated: queue.filter(row => row.createdAt).length,
            attempts: countDates(attempts),
        },
    };
}

async function insertBatches(connection, sql, values, batchSize = 200) {
    for (let offset = 0; offset < values.length; offset += batchSize) {
        await connection.query(sql, [values.slice(offset, offset + batchSize)]);
    }
}

async function main() {
    const apply = process.argv.includes('--apply');
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('Complete and verify the source-sheet archive before importing mail history.');
        const built = await buildCandidates(connection);
        const report = {
            mode: apply ? 'apply' : 'preview',
            sourceCounts: built.sourceCounts,
            readyToImport: {
                mailLogs: built.mail.length,
                historicalQueueSummaries: built.queue.length,
                quotaUsageRows: built.quota.length,
                deliveryAttempts: built.attempts.length,
            },
            parsedDates: built.parsedDates,
            quotaLayout: built.quotaSummary,
            pendingQueueRowsWillNotBeSentByThisImporter: built.queue.filter(row => row.status === 'queued').length,
        };
        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only; payloads, recipients, sender addresses, subjects, and error text were not printed or imported into the active queue.');
            return;
        }

        await connection.beginTransaction();
        await insertBatches(connection,
            `INSERT INTO mail_logs
                (id, occurred_at, recipient_name, recipient_email, mail_type, subject, status, sender_key,
                 provider, outbox_id, metadata, source_key, source_tab, source_record_key)
             VALUES ? ON DUPLICATE KEY UPDATE occurred_at = VALUES(occurred_at), recipient_name = VALUES(recipient_name),
                recipient_email = VALUES(recipient_email), mail_type = VALUES(mail_type), subject = VALUES(subject),
                status = VALUES(status), metadata = VALUES(metadata)`,
            built.mail.map(row => [row.id, row.occurredAt, row.recipientName, row.recipientEmail, row.mailType,
                row.subject, row.status, null, null, null, row.metadata, SOURCE, 'Mail', row.sourceRecordKey]),
        );
        await insertBatches(connection,
            `INSERT INTO email_delivery_attempts
                (id, outbox_id, attempted_at, sender_key, sender_email, email_category, provider, result,
                 recipient_count, remaining_quota, subject, provider_message_id, error_message, metadata,
                 source_key, source_tab, source_record_key)
             VALUES ? ON DUPLICATE KEY UPDATE attempted_at = VALUES(attempted_at), sender_key = VALUES(sender_key),
                sender_email = VALUES(sender_email), email_category = VALUES(email_category), provider = VALUES(provider),
                result = VALUES(result), recipient_count = VALUES(recipient_count), remaining_quota = VALUES(remaining_quota),
                subject = VALUES(subject), provider_message_id = VALUES(provider_message_id),
                error_message = VALUES(error_message), metadata = VALUES(metadata)`,
            built.attempts.map(row => [row.id, null, row.attemptedAt, row.senderKey, row.senderEmail, row.emailCategory,
                row.provider, row.result, row.recipientCount, row.remainingQuota, row.subject, row.providerMessageId,
                row.errorMessage, JSON.stringify({ sourceDeliveryId: row.deliveryId }), SOURCE, 'MailDeliveryAttempts', row.sourceRecordKey]),
        );
        await insertBatches(connection,
            `INSERT INTO email_quota_usage
                (id, sender_key, email_category, sender_email, provider, recipient_count, tracked_remaining,
                 apps_script_remaining, sent_at, metadata, source_key, source_tab, source_record_key)
             VALUES ? ON DUPLICATE KEY UPDATE sender_key = VALUES(sender_key), email_category = VALUES(email_category),
                sender_email = VALUES(sender_email), provider = VALUES(provider), recipient_count = VALUES(recipient_count),
                tracked_remaining = VALUES(tracked_remaining), apps_script_remaining = VALUES(apps_script_remaining),
                sent_at = VALUES(sent_at), metadata = VALUES(metadata)`,
            built.quota.map(row => [row.id, row.senderKey, row.emailCategory, row.senderEmail, row.provider,
                row.recipientCount, row.trackedRemaining, row.appsScriptRemaining, row.sentAt, row.metadata,
                SOURCE, 'EmailQuotaUsage', row.sourceRecordKey]),
        );
        await insertBatches(connection,
            `INSERT INTO email_queue_history
                (id, source_key, source_tab, source_record_key, source_queue_id, email_category, status,
                 attempts, next_attempt_at, provider, created_at, updated_at, metadata)
             VALUES ? ON DUPLICATE KEY UPDATE source_queue_id = VALUES(source_queue_id),
                email_category = VALUES(email_category), status = VALUES(status), attempts = VALUES(attempts),
                next_attempt_at = VALUES(next_attempt_at), provider = VALUES(provider),
                created_at = VALUES(created_at), updated_at = VALUES(updated_at), metadata = VALUES(metadata)`,
            built.queue.map(row => [row.id, SOURCE, 'EmailQueue', row.sourceRecordKey, row.sourceQueueId,
                row.emailCategory, row.status, row.attempts, row.nextAttemptAt, row.provider, row.createdAt,
                row.updatedAt, row.metadata]),
        );
        await connection.commit();
        const [[counts]] = await connection.execute(
            `SELECT (SELECT COUNT(*) FROM mail_logs WHERE source_key = ?) AS mail_logs,
                    (SELECT COUNT(*) FROM email_delivery_attempts WHERE source_key = ?) AS delivery_attempts,
                    (SELECT COUNT(*) FROM email_quota_usage WHERE source_key = ?) AS quota_usage,
                    (SELECT COUNT(*) FROM email_queue_history WHERE source_key = ?) AS queue_history`,
            [SOURCE, SOURCE, SOURCE, SOURCE],
        );
        console.log(JSON.stringify({
            ...report,
            status: 'completed',
            normalizedTableCounts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
        }, null, 2));
        console.log('Historical email activity is imported; queue payloads remain outside the live sender worker.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Email history import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`Email history import could not start: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
