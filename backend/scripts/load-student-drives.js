const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const clean = value => String(value ?? '').normalize('NFKC').trim();
const normalizedKey = value => normalize(value).replace(/[^a-z0-9]/g, '');

function deterministicId(scope, value) {
    const bytes = crypto.createHash('sha256').update(`${scope}:${value}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getField(fields, ...aliases) {
    const wanted = new Set(aliases.map(normalizedKey));
    for (const [key, value] of Object.entries(fields || {})) if (wanted.has(normalizedKey(key))) return clean(value);
    return '';
}

function parseDateTime(dateValue, timeValue = '') {
    const raw = clean(dateValue);
    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    let year; let month; let day;
    if (match) [, year, month, day] = match.map(Number);
    else {
        match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (!match) return null;
        const first = Number(match[1]); const second = Number(match[2]);
        month = first <= 12 && second > 12 ? first : second;
        day = first <= 12 && second > 12 ? second : first;
        year = Number(match[3]);
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const time = clean(timeValue).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    let hour = 0; let minute = 0; let second = 0;
    if (time) {
        hour = Number(time[1]); minute = Number(time[2]); second = Number(time[3] || 0);
        const meridiem = (time[4] || '').toLowerCase();
        if (minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || (meridiem && hour === 0)) return null;
        if (meridiem === 'pm' && hour < 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function readRecord(row) {
    return typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json;
}

async function loadSource(connection, source, tab) {
    const [rows] = await connection.execute(
        `SELECT sheet_row_number, row_data_json FROM source_sheet_records
         WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`, [source, tab],
    );
    return rows.map(row => ({ rowNumber: Number(row.sheet_row_number), record: readRecord(row), fields: readRecord(row).fields || {} }));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const host = String(process.env.MYSQL_HOST || '').trim().toLowerCase();
    const database = String(process.env.MYSQL_DATABASE || '').trim().toLowerCase();
    const localTarget = ['127.0.0.1', 'localhost', '::1'].includes(host) && ['ipcs_portal_dev', 'ipcs_portal'].includes(database);
    const hostingerTarget = host === 'srv1836.hstgr.io' && database === 'u382772772_ipcstalenzo_db';
    if (!localTarget && !hostingerTarget) {
        throw new Error('This loader is restricted to the configured IPCS MySQL database.');
    }
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [[run]] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (run?.status !== 'completed') throw new Error('Import and verify the read-only source snapshot before loading events and responses.');
        const [eventRows, responseRows, studentRows] = await Promise.all([
            loadSource(connection, 'shared_placement', 'Event'),
            loadSource(connection, 'shared_placement', 'Drive_Registration'),
            connection.execute(
                `SELECT sp.id, u.normalized_email FROM student_profiles sp JOIN users u ON u.id = sp.user_id
                 WHERE u.role = 'student' AND sp.status = 'active' AND u.normalized_email IS NOT NULL`,
            ).then(([rows]) => rows),
        ]);
        const emailCounts = new Map();
        const studentByEmail = new Map();
        for (const student of studentRows) {
            const key = normalize(student.normalized_email);
            emailCounts.set(key, (emailCounts.get(key) || 0) + 1);
            studentByEmail.set(key, student.id);
        }
        for (const [email, count] of emailCounts) if (count !== 1) studentByEmail.delete(email);

        const events = eventRows.map(({ rowNumber, fields }) => {
            const sourceKey = `Event:${rowNumber}`;
            const rawId = getField(fields, 'Drive ID', 'Event_ID', 'Event ID', 'ID');
            const eventId = rawId || `EVENT-${rowNumber}`;
            const title = getField(fields, 'Title', 'Event Title') || getField(fields, 'Event', 'Event Type') || `Event ${rowNumber}`;
            const statusText = normalize(getField(fields, 'Status'));
            const status = /inactive|cancel|closed|disabled|deleted/.test(statusText) ? 'closed' : 'open';
            const startsAt = parseDateTime(getField(fields, 'Date of the Event', 'Date', 'Event Date'), getField(fields, 'Time of the Event', 'Time', 'Event Time'));
            return {
                id: deterministicId('portal-event', sourceKey),
                sourceKey,
                rowNumber,
                eventId,
                title: title.slice(0, 240),
                companyName: getField(fields, 'Company Name', 'Company') || null,
                startsAt,
                location: getField(fields, 'Event Happening in', 'Location', 'Venue').slice(0, 240) || null,
                status,
                metadata: JSON.stringify({ source: 'shared_placement:Event', sourceRow: rowNumber, externalEventId: eventId, fields }),
            };
        });
        const eventIdCounts = new Map();
        for (const event of events) eventIdCounts.set(normalize(event.eventId), (eventIdCounts.get(normalize(event.eventId)) || 0) + 1);
        const eventByExternalId = new Map(events.filter(event => eventIdCounts.get(normalize(event.eventId)) === 1).map(event => [normalize(event.eventId), event]));

        const responses = responseRows.map(({ rowNumber, fields }) => {
            const email = normalize(getField(fields, 'Mail ID', 'Email'));
            const sourceDriveId = getField(fields, 'Drive ID', 'Drive ID / Event ID');
            const event = eventByExternalId.get(normalize(sourceDriveId));
            return {
                rowNumber,
                email,
                studentId: studentByEmail.get(email) || null,
                event,
                status: getField(fields, 'Status') || 'Registered',
                registeredAt: parseDateTime(getField(fields, 'Registed Date & Time', 'Registered Date & Time', 'Registered At')),
                metadata: JSON.stringify({ source: 'shared_placement:Drive_Registration', sourceRow: rowNumber, fields }),
            };
        });
        const valid = responses.filter(row => row.studentId && row.event);
        const latestByPair = new Map();
        for (const row of valid) latestByPair.set(`${row.event.id}:${row.studentId}`, row);
        const deduplicated = [...latestByPair.values()];
        const report = {
            mode: apply ? 'apply' : 'preview',
            eventRows: eventRows.length,
            eventsWithExternalId: events.filter(row => row.eventId).length,
            duplicateExternalEventIds: [...eventIdCounts.values()].filter(count => count > 1).reduce((sum, count) => sum + count, 0),
            driveResponseRows: responseRows.length,
            responsesLinkedToUniqueStudentAndDrive: valid.length,
            responsesUnlinkedOrAmbiguous: responses.length - valid.length,
            duplicateStudentDriveResponsesReducedToLatestCurrentState: valid.length - deduplicated.length,
        };
        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only. Source snapshot rows and Google Sheets are unchanged; no names, emails, or contact values were printed.');
            return;
        }

        await connection.beginTransaction();
        for (const event of events) {
            await connection.execute(
                `INSERT INTO drives (id, title, company_name, starts_at, location, status, source, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, 'google_sheets_snapshot', ?, ?)
                 ON DUPLICATE KEY UPDATE title = VALUES(title), company_name = VALUES(company_name),
                   starts_at = VALUES(starts_at), location = VALUES(location), status = VALUES(status), metadata = VALUES(metadata)`,
                [event.id, event.title, event.companyName, event.startsAt, event.location, event.status, event.sourceKey, event.metadata],
            );
        }
        for (const response of deduplicated) {
            const id = deterministicId('drive-registration', `${response.event.id}:${response.studentId}`);
            await connection.execute(
                `INSERT INTO drive_registrations (id, drive_id, student_id, status, registered_at, metadata)
                 VALUES (?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP()), ?)
                 ON DUPLICATE KEY UPDATE status = VALUES(status), registered_at = VALUES(registered_at), metadata = VALUES(metadata)`,
                [id, response.event.id, response.studentId, response.status.slice(0, 40), response.registeredAt, response.metadata],
            );
        }
        await connection.commit();
        const [[counts]] = await connection.execute(
            `SELECT (SELECT COUNT(*) FROM drives WHERE source = 'google_sheets_snapshot' AND source_record_key LIKE 'Event:%') AS events,
                    (SELECT COUNT(*) FROM drive_registrations dr JOIN drives d ON d.id = dr.drive_id
                     WHERE d.source = 'google_sheets_snapshot' AND d.source_record_key LIKE 'Event:%') AS responses`,
        );
        console.log(JSON.stringify({ ...report, status: 'completed',
            normalizedEvents: Number(counts.events), normalizedLatestDriveResponses: Number(counts.responses) }, null, 2));
        console.log('All original event and response rows remain in the configured MySQL source snapshot archive.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Student drives load failed: ${error.message}`);
    process.exitCode = 1;
});
