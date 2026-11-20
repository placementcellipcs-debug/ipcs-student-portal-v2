const mysqlPool = require('../config/mysqlPool');

const SOURCE = 'shared_operations';
const TABS = ['Mail', 'EmailQueue', 'EmailQuotaUsage', 'MailDeliveryAttempts', 'Mail_Usage_History'];
const normalizeKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeValue = value => String(value ?? '').trim().toLowerCase();
const safeColumns = {
    Mail: ['TimeStamp', 'Reciver Name', 'Reciver Mail', 'Mail Type', 'Subject', 'Status'],
    EmailQueue: ['ID', 'Category', 'EmailCategory', 'Status', 'Attempts', 'NextAttemptAt', 'CreatedAt', 'UpdatedAt', 'Provider', 'LogName', 'LogEmail', 'MailType'],
    EmailQuotaUsage: ['ID', 'SenderKey', 'EmailCategory', 'SenderEmail', 'Provider', 'RecipientCount', 'TrackedRemaining', 'AppsScriptRemaining', 'SentAt'],
    MailDeliveryAttempts: ['AttemptID', 'DeliveryID', 'Category', 'EmailCategory', 'SenderKey', 'SenderEmail', 'Provider', 'Outcome', 'RecipientCount', 'AppsScriptRemaining', 'AttemptedAt', 'Subject', 'MessageID'],
    Mail_Usage_History: [],
};
const statusBucket = state => {
    if (/sent|success|deliver/.test(state)) return 'sent';
    if (/fail|error|reject/.test(state)) return 'failed';
    if (/review|uncertain/.test(state)) return 'review';
    if (/queue|pending|retry/.test(state)) return 'queued';
    if (/cancel|skip/.test(state)) return 'cancelled_or_skipped';
    return 'other';
};

async function main() {
    try {
        const [manifest] = await mysqlPool.query(
            `SELECT tab_name, headers_json, imported_record_count FROM source_sheet_manifest
              WHERE source_key = ? AND tab_name IN (${TABS.map(() => '?').join(',')}) ORDER BY tab_name`,
            [SOURCE, ...TABS],
        );
        const [records] = await mysqlPool.query(
            `SELECT tab_name, sheet_row_number, row_data_json FROM source_sheet_records
              WHERE source_key = ? AND tab_name IN (${TABS.map(() => '?').join(',')})
              ORDER BY tab_name, sheet_row_number`,
            [SOURCE, ...TABS],
        );
        const result = TABS.map(tab => {
            const sourceRows = records.filter(row => row.tab_name === tab);
            const manifestRow = manifest.find(row => row.tab_name === tab);
            const headers = safeColumns[tab] || [];
            const statusHeaders = headers.filter(header => /^(status|state|result|outcome|delivery status|mail status)$/i.test(header));
            const senderHeaders = headers.filter(header => /^(senderkey|senderemail|fromaccount|mailaccount)$/i.test(normalizeKey(header)));
            const statuses = {};
            const senders = new Set();
            const populatedColumns = {};
            let leftQuotaBlockRows = 0;
            let rightQuotaBlockRows = 0;
            let quotaRowsWithBothBlocks = 0;
            for (const row of sourceRows) {
                const rowData = typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
                const data = rowData?.fields || {};
                const normalizedData = new Map(Object.entries(data).map(([key, value]) => [normalizeKey(key), value]));
                const cells = rowData?.cells || [];
                if (tab === 'EmailQuotaUsage') {
                    const leftBlock = cells.slice(0, 9).some(value => String(value ?? '').trim());
                    const rightBlock = cells.slice(9, 18).some(value => String(value ?? '').trim());
                    if (leftBlock) leftQuotaBlockRows += 1;
                    if (rightBlock) rightQuotaBlockRows += 1;
                    if (leftBlock && rightBlock) quotaRowsWithBothBlocks += 1;
                }
                for (const header of headers) {
                    if (normalizeValue(normalizedData.get(normalizeKey(header)))) {
                        populatedColumns[header] = (populatedColumns[header] || 0) + 1;
                    }
                }
                for (const header of statusHeaders) {
                    const state = normalizeValue(normalizedData.get(normalizeKey(header)));
                    if (!state) continue;
                    const group = statusBucket(state);
                    statuses[group] = (statuses[group] || 0) + 1;
                }
                for (const header of senderHeaders) {
                    const sender = normalizeValue(normalizedData.get(normalizeKey(header)));
                    if (sender) senders.add(sender);
                }
            }
            const output = {
                tab,
                archivedRows: sourceRows.length,
                manifestRows: Number(manifestRow?.imported_record_count || 0),
                expectedColumns: headers,
                expectedColumnCounts: populatedColumns,
                statusColumns: statusHeaders,
                statusCounts: statuses,
                senderColumns: senderHeaders,
                distinctSenderValues: senders.size,
            };
            if (tab === 'EmailQuotaUsage') {
                const manifestHeaders = typeof manifestRow?.headers_json === 'string'
                    ? (() => { try { return JSON.parse(manifestRow.headers_json); } catch { return []; } })()
                    : manifestRow?.headers_json || [];
                output.layoutCounts = {
                    manifestColumns: manifestHeaders.length,
                    manifestColumnsMatchingExpectedNames: headers.filter(header => manifestHeaders.some(name => normalizeKey(name) === normalizeKey(header))).length,
                    rowsWithValuesInLegacyFirstNineColumns: leftQuotaBlockRows,
                    rowsWithValuesInSecondNineColumns: rightQuotaBlockRows,
                    rowsWithValuesInBothBlocks: quotaRowsWithBothBlocks,
                };
            }
            return output;
        });
        console.log(JSON.stringify({ tables: result, writes: 0 }, null, 2));
        console.log('Read-only summary; no recipient, sender, message, or error text was printed.');
    } finally {
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`Email migration preview failed: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
