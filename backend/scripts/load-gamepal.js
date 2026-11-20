const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { parsePortalDateTime } = require('../utils/portalDateTime');

const SOURCE = 'student_gamepal';
const TABS = ['GamePal_Logs', 'GamePal_Stats', 'GamePal_Challenges', 'GamePal_Rooms', 'GamePal_Room_Members'];
const text = value => String(value ?? '').normalize('NFKC').trim();
const normalize = value => text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const normalizeEmail = value => normalize(value);
const sourceKey = (tab, rowNumber) => `${tab}:${rowNumber}`;

function stableId(scope, key) {
    const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizedFieldName(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function field(record, ...aliases) {
    const fields = record?.fields || {};
    const wanted = new Set(aliases.map(normalizedFieldName));
    for (const [key, value] of Object.entries(fields)) {
        if (wanted.has(normalizedFieldName(key)) && text(value)) return text(value);
    }
    return '';
}

function numberOrNull(value, max = 2147483647) {
    if (value === '' || value == null) return null;
    const valueNumber = Number(String(value).replace(/[% ,]/g, ''));
    return Number.isFinite(valueNumber) && valueNumber >= 0 && valueNumber <= max
        ? Math.round(valueNumber) : null;
}

function parseDateTime(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const milliseconds = parsePortalDateTime(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function parseDate(value) {
    const valueText = text(value);
    if (!valueText || /^never$/i.test(valueText)) return null;
    const iso = valueText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dmy = valueText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!iso && !dmy) return null;
    const year = Number(iso ? iso[1] : dmy[3]);
    const month = Number(iso ? iso[2] : dmy[2]);
    const day = Number(iso ? iso[3] : dmy[1]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function jsonMetadata(row) {
    return JSON.stringify({ sourceRowNumber: row.rowNumber, fields: row.data?.fields || {} });
}

async function sourceRows(connection, tab) {
    const [rows] = await connection.execute(
        `SELECT sheet_row_number, row_data_json FROM source_sheet_records
          WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number`,
        [SOURCE, tab],
    );
    return rows.map(row => ({
        rowNumber: Number(row.sheet_row_number),
        data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
    }));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const connection = await mysqlPool.getPool().getConnection();
    try {
        const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('Complete and verify the source-sheet snapshot before importing GamePal.');
        const [logs, stats, challenges, rooms, members] = await Promise.all(TABS.map(tab => sourceRows(connection, tab)));
        const [studentRows] = await connection.execute(
            `SELECT u.id AS user_id, u.normalized_email, u.full_name, sp.id AS student_id,
                    sp.roll_number, b.name AS branch_name
               FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
               LEFT JOIN branches b ON b.id = sp.branch_id
              WHERE u.role = 'student'`,
        );
        const studentsByEmail = new Map(studentRows.filter(row => row.normalized_email)
            .map(row => [normalizeEmail(row.normalized_email), row]));
        const roomCodes = new Set(rooms.map(row => field(row.data, 'Room Code').toUpperCase()).filter(Boolean));

        const sessionRows = logs.map(row => {
            const email = normalizeEmail(field(row.data, 'Email', 'Student Email'));
            const student = studentsByEmail.get(email);
            const accuracy = numberOrNull(field(row.data, 'Accuracy'), 100);
            return {
                id: stableId('gamepal-session', `${SOURCE}:${sourceKey('GamePal_Logs', row.rowNumber)}`),
                studentId: student?.student_id || null,
                email,
                rollNumber: text(field(row.data, 'RollNo', 'Roll Number')).slice(0, 100) || student?.roll_number || null,
                studentName: text(field(row.data, 'Name')).slice(0, 200) || student?.full_name || null,
                gameName: text(field(row.data, 'GameName', 'Game Name')).slice(0, 120) || 'GamePal session',
                category: text(field(row.data, 'Category')).slice(0, 80) || null,
                score: numberOrNull(field(row.data, 'Score')) ?? 0,
                accuracy: accuracy ?? 0,
                timeSeconds: numberOrNull(field(row.data, 'TimeSeconds', 'Time Seconds')) ?? 0,
                occurredAt: parseDateTime(field(row.data, 'Timestamp', 'TimeStamp')),
                tab: 'GamePal_Logs', rowNumber: row.rowNumber, metadata: jsonMetadata(row),
            };
        }).filter(row => row.email && row.gameName);

        const statRows = stats.map(row => {
            const email = normalizeEmail(field(row.data, 'Email', 'Student Email'));
            const student = studentsByEmail.get(email);
            const scores = {
                memory: numberOrNull(field(row.data, 'Memory')) ?? 0,
                attention: numberOrNull(field(row.data, 'Attention')) ?? 0,
                language: numberOrNull(field(row.data, 'Language')) ?? 0,
                problem: numberOrNull(field(row.data, 'ProblemSolving', 'Problem Solving')) ?? 0,
                math: numberOrNull(field(row.data, 'Math')) ?? 0,
                flexibility: numberOrNull(field(row.data, 'Flexibility')) ?? 0,
                speed: numberOrNull(field(row.data, 'Speed')) ?? 0,
            };
            return {
                id: stableId('gamepal-stats', `${SOURCE}:${sourceKey('GamePal_Stats', row.rowNumber)}`),
                studentId: student?.student_id || null,
                email,
                fullName: text(field(row.data, 'Name')).slice(0, 200) || student?.full_name || null,
                rollNumber: text(field(row.data, 'RollNo', 'Roll Number')).slice(0, 100) || student?.roll_number || null,
                branchName: text(field(row.data, 'Branch')).slice(0, 160) || student?.branch_name || null,
                overallScore: numberOrNull(field(row.data, 'OverallBrainScore', 'Overall Brain Score')) ?? Math.round(Object.values(scores).reduce((sum, score) => sum + score, 0) / 7),
                ...scores,
                currentStreak: numberOrNull(field(row.data, 'CurrentStreak', 'Current Streak')) ?? 0,
                lastPlayedDate: parseDate(field(row.data, 'LastPlayedDate', 'Last Played Date')),
                tab: 'GamePal_Stats', rowNumber: row.rowNumber, metadata: jsonMetadata(row),
            };
        }).filter(row => row.email);

        const roomRows = rooms.map(row => {
            const code = field(row.data, 'Room Code').toUpperCase().slice(0, 12);
            const creatorEmail = normalizeEmail(field(row.data, 'Creator Email'));
            const student = studentsByEmail.get(creatorEmail);
            return {
                code,
                createdAt: parseDateTime(field(row.data, 'Created At')),
                joinDeadline: parseDateTime(field(row.data, 'Join Deadline')),
                startedAt: parseDateTime(field(row.data, 'Started At')),
                finishedAt: parseDateTime(field(row.data, 'Finished At')),
                gameId: text(field(row.data, 'Game ID')).slice(0, 64) || 'unknown',
                gameName: text(field(row.data, 'Game Name')).slice(0, 120) || 'GamePal game',
                creatorEmail,
                creatorStudentId: student?.student_id || null,
                creatorName: text(field(row.data, 'Creator Name')).slice(0, 200) || student?.full_name || null,
                status: text(field(row.data, 'Status')).slice(0, 40) || 'Waiting',
                maxPlayers: numberOrNull(field(row.data, 'Max Players'), 65535) ?? 0,
                rowNumber: row.rowNumber,
                metadata: jsonMetadata(row),
            };
        }).filter(row => row.code && row.creatorEmail);

        const memberRows = members.map(row => {
            const roomCode = field(row.data, 'Room Code').toUpperCase();
            const email = normalizeEmail(field(row.data, 'Student Email', 'Email'));
            const student = studentsByEmail.get(email);
            return {
                id: stableId('gamepal-room-member', `${SOURCE}:${sourceKey('GamePal_Room_Members', row.rowNumber)}`),
                roomCode,
                email,
                studentId: student?.student_id || null,
                name: text(field(row.data, 'Student Name', 'Name')).slice(0, 200) || student?.full_name || null,
                joinedAt: parseDateTime(field(row.data, 'Joined At')),
                score: numberOrNull(field(row.data, 'Score'), 100000),
                accuracy: numberOrNull(field(row.data, 'Accuracy'), 100),
                rowNumber: row.rowNumber,
                metadata: jsonMetadata(row),
            };
        }).filter(row => row.roomCode && row.email && roomCodes.has(row.roomCode));

        const challengeRows = challenges.map(row => {
            const challengeCode = field(row.data, 'Challenge ID').slice(0, 120);
            const creatorEmail = normalizeEmail(field(row.data, 'Creator Email'));
            const opponentEmail = normalizeEmail(field(row.data, 'Opponent Email'));
            const creator = studentsByEmail.get(creatorEmail);
            const opponent = studentsByEmail.get(opponentEmail);
            return {
                id: stableId('gamepal-challenge', `${SOURCE}:${sourceKey('GamePal_Challenges', row.rowNumber)}`),
                challengeCode,
                createdAt: parseDateTime(field(row.data, 'Created At')),
                updatedAt: parseDateTime(field(row.data, 'Updated At')),
                gameId: text(field(row.data, 'Game ID')).slice(0, 64) || 'unknown',
                gameName: text(field(row.data, 'Game Name')).slice(0, 120) || 'GamePal game',
                creatorEmail, creatorStudentId: creator?.student_id || null,
                creatorName: text(field(row.data, 'Creator Name')).slice(0, 200) || creator?.full_name || null,
                opponentEmail, opponentStudentId: opponent?.student_id || null,
                opponentName: text(field(row.data, 'Opponent Name')).slice(0, 200) || opponent?.full_name || null,
                creatorScore: numberOrNull(field(row.data, 'Creator Score'), 100000),
                creatorAccuracy: numberOrNull(field(row.data, 'Creator Accuracy'), 100),
                opponentScore: numberOrNull(field(row.data, 'Opponent Score'), 100000),
                opponentAccuracy: numberOrNull(field(row.data, 'Opponent Accuracy'), 100),
                status: text(field(row.data, 'Status')).slice(0, 60) || 'Waiting for friend',
                rowNumber: row.rowNumber,
                metadata: jsonMetadata(row),
            };
        }).filter(row => row.challengeCode && row.creatorEmail && row.opponentEmail);

        const report = {
            mode: apply ? 'apply' : 'preview',
            sourceCounts: {
                logs: logs.length, stats: stats.length, rooms: rooms.length, roomMembers: members.length, challenges: challenges.length,
            },
            rowsReady: {
                sessions: sessionRows.length, stats: statRows.length, rooms: roomRows.length,
                roomMembers: memberRows.length, challenges: challengeRows.length,
            },
            linkedStudentRows: {
                sessions: sessionRows.filter(row => row.studentId).length,
                stats: statRows.filter(row => row.studentId).length,
                rooms: roomRows.filter(row => row.creatorStudentId).length,
                roomMembers: memberRows.filter(row => row.studentId).length,
                challengeParticipants: challengeRows.filter(row => row.creatorStudentId && row.opponentStudentId).length,
            },
            sourceRowsRetainedOnlyInArchive: {
                sessions: logs.length - sessionRows.length,
                stats: stats.length - statRows.length,
                rooms: rooms.length - roomRows.length,
                roomMembers: members.length - memberRows.length,
                challenges: challenges.length - challengeRows.length,
            },
            repeatedRoomMemberRowsPreserved: members.length,
        };

        if (!apply) {
            console.log(JSON.stringify(report, null, 2));
            console.log('Preview only; no GamePal rows were written. Source rows that cannot be safely linked remain in the archive.');
            return;
        }

        await connection.beginTransaction();
        for (const row of statRows) {
            await connection.execute(
                `INSERT INTO gamepal_student_stats
                    (id, student_id, email, full_name, roll_number, branch_name, overall_brain_score,
                     memory_score, attention_score, language_score, problem_solving_score, math_score,
                     flexibility_score, speed_score, current_streak, last_played_date,
                     source_key, source_tab, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE student_id = IF(source_key = VALUES(source_key), VALUES(student_id), student_id),
                    full_name = IF(source_key = VALUES(source_key), VALUES(full_name), full_name),
                    roll_number = IF(source_key = VALUES(source_key), VALUES(roll_number), roll_number),
                    branch_name = IF(source_key = VALUES(source_key), VALUES(branch_name), branch_name),
                    overall_brain_score = IF(source_key = VALUES(source_key), VALUES(overall_brain_score), overall_brain_score),
                    memory_score = IF(source_key = VALUES(source_key), VALUES(memory_score), memory_score),
                    attention_score = IF(source_key = VALUES(source_key), VALUES(attention_score), attention_score),
                    language_score = IF(source_key = VALUES(source_key), VALUES(language_score), language_score),
                    problem_solving_score = IF(source_key = VALUES(source_key), VALUES(problem_solving_score), problem_solving_score),
                    math_score = IF(source_key = VALUES(source_key), VALUES(math_score), math_score),
                    flexibility_score = IF(source_key = VALUES(source_key), VALUES(flexibility_score), flexibility_score),
                    speed_score = IF(source_key = VALUES(source_key), VALUES(speed_score), speed_score),
                    current_streak = IF(source_key = VALUES(source_key), VALUES(current_streak), current_streak),
                    last_played_date = IF(source_key = VALUES(source_key), VALUES(last_played_date), last_played_date),
                    source_tab = IF(source_key = VALUES(source_key), VALUES(source_tab), source_tab),
                    source_record_key = IF(source_key = VALUES(source_key), VALUES(source_record_key), source_record_key),
                    metadata = IF(source_key = VALUES(source_key), VALUES(metadata), metadata)`,
                [row.id, row.studentId, row.email, row.fullName, row.rollNumber, row.branchName, row.overallScore,
                    row.memory, row.attention, row.language, row.problem, row.math, row.flexibility, row.speed,
                    row.currentStreak, row.lastPlayedDate, SOURCE, row.tab, String(row.rowNumber), row.metadata],
            );
        }
        for (const row of sessionRows) {
            await connection.execute(
                `INSERT INTO gamepal_sessions
                    (id, student_id, email, roll_number, student_name, game_name, category, score, accuracy,
                     time_seconds, occurred_at, source_key, source_tab, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), email = VALUES(email),
                    roll_number = VALUES(roll_number), student_name = VALUES(student_name),
                    game_name = VALUES(game_name), category = VALUES(category), score = VALUES(score),
                    accuracy = VALUES(accuracy), time_seconds = VALUES(time_seconds),
                    occurred_at = VALUES(occurred_at), metadata = VALUES(metadata)`,
                [row.id, row.studentId, row.email, row.rollNumber, row.studentName, row.gameName, row.category,
                    row.score, row.accuracy, row.timeSeconds, row.occurredAt, SOURCE, row.tab,
                    String(row.rowNumber), row.metadata],
            );
        }
        for (const row of roomRows) {
            await connection.execute(
                `INSERT INTO gamepal_rooms
                    (room_code, created_at, join_deadline, started_at, finished_at, game_id, game_name,
                     creator_email, creator_student_id, creator_name, status, max_players,
                     source_key, source_tab, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE created_at = IF(source_key = VALUES(source_key), VALUES(created_at), created_at),
                    join_deadline = IF(source_key = VALUES(source_key), VALUES(join_deadline), join_deadline),
                    started_at = IF(source_key = VALUES(source_key), VALUES(started_at), started_at),
                    finished_at = IF(source_key = VALUES(source_key), VALUES(finished_at), finished_at),
                    game_id = IF(source_key = VALUES(source_key), VALUES(game_id), game_id),
                    game_name = IF(source_key = VALUES(source_key), VALUES(game_name), game_name),
                    creator_email = IF(source_key = VALUES(source_key), VALUES(creator_email), creator_email),
                    creator_student_id = IF(source_key = VALUES(source_key), VALUES(creator_student_id), creator_student_id),
                    creator_name = IF(source_key = VALUES(source_key), VALUES(creator_name), creator_name),
                    status = IF(source_key = VALUES(source_key), VALUES(status), status),
                    max_players = IF(source_key = VALUES(source_key), VALUES(max_players), max_players),
                    metadata = IF(source_key = VALUES(source_key), VALUES(metadata), metadata)`,
                [row.code, row.createdAt, row.joinDeadline, row.startedAt, row.finishedAt, row.gameId, row.gameName,
                    row.creatorEmail, row.creatorStudentId, row.creatorName, row.status, row.maxPlayers,
                    SOURCE, 'GamePal_Rooms', String(row.rowNumber), row.metadata],
            );
        }
        for (const row of memberRows) {
            await connection.execute(
                `INSERT INTO gamepal_room_members
                    (id, room_code, email, student_id, student_name, joined_at, score, accuracy,
                     source_key, source_tab, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE room_code = VALUES(room_code), email = VALUES(email),
                    student_id = VALUES(student_id), student_name = VALUES(student_name), joined_at = VALUES(joined_at),
                    score = VALUES(score), accuracy = VALUES(accuracy), metadata = VALUES(metadata)`,
                [row.id, row.roomCode, row.email, row.studentId, row.name, row.joinedAt, row.score, row.accuracy,
                    SOURCE, 'GamePal_Room_Members', String(row.rowNumber), row.metadata],
            );
        }
        for (const row of challengeRows) {
            await connection.execute(
                `INSERT INTO gamepal_challenges
                    (id, challenge_code, created_at, updated_at, game_id, game_name, creator_email,
                     creator_student_id, creator_name, opponent_email, opponent_student_id, opponent_name,
                     creator_score, creator_accuracy, opponent_score, opponent_accuracy, status,
                     source_key, source_tab, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE created_at = IF(source_key = VALUES(source_key), VALUES(created_at), created_at),
                    updated_at = IF(source_key = VALUES(source_key), VALUES(updated_at), updated_at),
                    game_id = IF(source_key = VALUES(source_key), VALUES(game_id), game_id),
                    game_name = IF(source_key = VALUES(source_key), VALUES(game_name), game_name),
                    creator_email = IF(source_key = VALUES(source_key), VALUES(creator_email), creator_email),
                    creator_student_id = IF(source_key = VALUES(source_key), VALUES(creator_student_id), creator_student_id),
                    creator_name = IF(source_key = VALUES(source_key), VALUES(creator_name), creator_name),
                    opponent_email = IF(source_key = VALUES(source_key), VALUES(opponent_email), opponent_email),
                    opponent_student_id = IF(source_key = VALUES(source_key), VALUES(opponent_student_id), opponent_student_id),
                    opponent_name = IF(source_key = VALUES(source_key), VALUES(opponent_name), opponent_name),
                    creator_score = IF(source_key = VALUES(source_key), VALUES(creator_score), creator_score),
                    creator_accuracy = IF(source_key = VALUES(source_key), VALUES(creator_accuracy), creator_accuracy),
                    opponent_score = IF(source_key = VALUES(source_key), VALUES(opponent_score), opponent_score),
                    opponent_accuracy = IF(source_key = VALUES(source_key), VALUES(opponent_accuracy), opponent_accuracy),
                    status = IF(source_key = VALUES(source_key), VALUES(status), status),
                    metadata = IF(source_key = VALUES(source_key), VALUES(metadata), metadata)`,
                [row.id, row.challengeCode, row.createdAt, row.updatedAt, row.gameId, row.gameName,
                    row.creatorEmail, row.creatorStudentId, row.creatorName, row.opponentEmail, row.opponentStudentId,
                    row.opponentName, row.creatorScore, row.creatorAccuracy, row.opponentScore, row.opponentAccuracy,
                    row.status, SOURCE, 'GamePal_Challenges', String(row.rowNumber), row.metadata],
            );
        }
        await connection.commit();
        const [[counts]] = await connection.execute(
            `SELECT (SELECT COUNT(*) FROM gamepal_sessions WHERE source_key = ?) AS sessions_count,
                    (SELECT COUNT(*) FROM gamepal_student_stats WHERE source_key = ?) AS stats_count,
                    (SELECT COUNT(*) FROM gamepal_rooms WHERE source_key = ?) AS rooms_count,
                    (SELECT COUNT(*) FROM gamepal_room_members WHERE source_key = ?) AS room_members_count,
                    (SELECT COUNT(*) FROM gamepal_challenges WHERE source_key = ?) AS challenges_count`,
            [SOURCE, SOURCE, SOURCE, SOURCE, SOURCE],
        );
        console.log(JSON.stringify({
            ...report,
            status: 'completed',
            normalizedTableCounts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
        }, null, 2));
        console.log('Historical GamePal data is imported; duplicates and source rows remain preserved for reconciliation.');
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`GamePal import failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`GamePal import could not start: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
