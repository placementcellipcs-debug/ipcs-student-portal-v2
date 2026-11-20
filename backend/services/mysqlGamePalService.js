const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { formatDateIndia, formatDateTimeIndia, parsePortalDateTime } = require('../utils/portalDateTime');

const CATEGORIES = ['Memory', 'Attention', 'Language', 'Problem Solving', 'Math', 'Flexibility', 'Speed'];
const CATEGORY_COLUMNS = {
    Memory: 'memory_score', Attention: 'attention_score', Language: 'language_score',
    'Problem Solving': 'problem_solving_score', Math: 'math_score', Flexibility: 'flexibility_score', Speed: 'speed_score',
};
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_GAME_NAMES = {
    memory: 'Simon Says', attention: 'Color Focus', language: 'Word Scramble', math: 'Quick Calculations',
    logic: 'Pattern Finder', flexibility: 'Rule Switch', speed: 'Quick Spot', pinpoint: 'Pinpoint',
    crossclimb: 'Crossclimb', queens: 'Queens', tango: 'Tango', zip: 'Zip', 'mini-sudoku': 'Mini Sudoku',
    patches: 'Patches', wend: 'Wend', knifeshow: 'Knife Show', snowrider: 'Snow Rider 3D', dino: 'Dino Runner',
    chess: 'Chess', 'word-association': 'Word Association', 'ludo-king': 'Ludo King', 'snakes-ladders': 'Snakes & Ladders',
    '2048': '2048', minesweeper: 'Minesweeper', 'connect-4': 'Connect 4', wordle: 'Wordle', snake: 'Snake',
    'flappy-bird': 'Flappy Bird', 'brick-breaker': 'Brick Breaker', 'whack-mole': 'Whack-a-Mole',
    'cookie-clicker': 'Cookie Clicker', 'guess-number': 'Guess the Number', 'color-flood': 'Color Flood',
    'memory-match': 'Memory Card Match', 'tic-tac-toe': 'Tic-Tac-Toe', 'rock-paper-scissors': 'Rock, Paper, Scissors',
    'dice-battle': 'Dice Roller Battle', 'coin-flip-tycoon': 'Coin Flipper Tycoon', pong: 'Pong', asteroids: 'Asteroids',
    frogger: 'Frogger Crossing', 'space-invaders': 'Space Invaders', 'lunar-lander': 'Lunar Lander',
    'bubble-shooter': 'Bubble Shooter', 'lights-out': 'Lights Out', 'tower-hanoi': 'Tower of Hanoi',
    slitherlink: 'Slitherlink', mastermind: 'Mastermind', 'slide-puzzle': '15-Puzzle', checkers: 'Checkers',
    'geometry-dash': 'Geometry Dash', 'fruit-ninja': 'Fruit Ninja', 'stack-tower': 'Stack Tower',
    'falling-blocks': 'Avoid Falling Blocks', 'helix-jump': 'Helix Jump', 'typing-racer': 'Typing Speed Racer',
    'quick-draw': 'Quick Draw', 'bop-it': 'Bop It', 'piano-tiles': 'Don’t Touch the Red', 'hoop-shot': 'Hoop Shot',
    'hexagon-dodger': 'Infinite Hexagon Dodger', 'word-scramble-scavenger': 'Word Scramble Scavenger',
    'balloon-pop-math': 'Balloon Pop Math', 'tunnel-runner': 'Endless Tunnel Runner',
    'orbit-golf': 'Gravity Orbit Space Golf', 'sound-matcher': 'Sound Matcher', 'maze-tracer': 'Maze Path Tracer',
    'rhythm-tap': 'Rhythm Tap Hero', 'fruit-catcher': 'Dropping Fruit Basket', 'missile-command': 'Cyber Defense Turret',
    'word-search': 'Word Search', tetris: 'Falling Block Puzzle', artillery: 'Artillery Angle Match',
    parking: 'Parallel Parking', pinball: 'Pinball Bouncer', 'duck-hunt': 'Duck Hunt Precision',
    plinko: 'Plinko Peg Drop', 'tower-defense': 'Tower Defense Maze', platformer: 'Platformer Run',
    'boxing-reaction': 'Boxing Punch Reaction', 'daily-crossword': 'Daily Crossword Mini',
    'zombie-survival': 'Top-Down Zombie Survival', 'burger-assembly': 'Burger Assembly Line',
    'air-hockey': 'Air Hockey Micro', 'minecart-runner': 'Mine Cart Rail Balance',
};
const text = value => String(value ?? '').normalize('NFKC').trim();
const emailOf = value => text(value).toLowerCase();
const id = () => crypto.randomUUID();
const liveKey = () => crypto.randomUUID();
const sqlToday = (date = new Date()) => {
    const [day, month, year] = formatDateIndia(date).split('/');
    return `${year}-${month}-${day}`;
};
const sqlYesterday = () => sqlToday(new Date(Date.now() - 24 * 60 * 60 * 1000));
const sqlDateValue = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);

function safeDateTime(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : formatDateTimeIndia(date);
}

function safeDate(value) {
    if (!value) return 'Never';
    const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? 'Never' : formatDateIndia(date);
}

function dbRoom(row) {
    return {
        code: String(row.room_code || '').trim().toUpperCase(),
        createdAt: safeDateTime(row.created_at),
        joinDeadline: safeDateTime(row.join_deadline),
        startedAt: safeDateTime(row.started_at),
        finishedAt: safeDateTime(row.finished_at),
        gameId: row.game_id || '', gameName: row.game_name || 'GamePal game',
        creatorEmail: emailOf(row.creator_email), creatorName: row.creator_name || 'Student',
        status: row.status || 'Waiting', maxPlayers: Number(row.max_players) || 0, participants: [],
    };
}

function dbMember(row) {
    return {
        email: emailOf(row.email), name: row.student_name || 'Student', joinedAt: safeDateTime(row.joined_at),
        score: row.score == null ? null : Number(row.score), accuracy: row.accuracy == null ? null : Number(row.accuracy),
    };
}

function publicRoom(room) {
    return {
        ...room,
        participants: room.participants.map(({ email, name, joinedAt, score, accuracy }) => ({
            email, name, joinedAt, score: score == null ? null : Number(score), accuracy: accuracy == null ? null : Number(accuracy),
        })),
    };
}

async function findStudent(email, connection = mysqlPool.getPool()) {
    const [rows] = await connection.execute(
        `SELECT u.id AS user_id, u.full_name, u.normalized_email, sp.id AS student_id,
                sp.roll_number, b.name AS branch_name
           FROM users u JOIN student_profiles sp ON sp.user_id = u.id
           LEFT JOIN branches b ON b.id = sp.branch_id
          WHERE u.normalized_email = ? AND u.role = 'student' AND u.status = 'active'
          LIMIT 1`,
        [emailOf(email)],
    );
    return rows[0] || null;
}

async function roomMembers(connection, code) {
    const [rows] = await connection.execute(
        'SELECT email, student_name, joined_at, score, accuracy FROM gamepal_room_members WHERE room_code = ? ORDER BY joined_at, created_at',
        [code],
    );
    return rows.map(dbMember);
}

async function writeMember(connection, code, member) {
    await connection.execute(
        `INSERT INTO gamepal_room_members
            (id, room_code, email, student_id, student_name, joined_at, score, accuracy,
             source_key, source_tab, source_record_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'portal', 'live', ?)`,
        [id(), code, member.email, member.studentId || null, member.name || null, member.joinedAt || new Date(),
            member.score ?? null, member.accuracy ?? null, liveKey()],
    );
}

function generateRoomCode(existing) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const code = Array.from(crypto.randomBytes(6), byte => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
        if (!existing.has(code)) return code;
    }
    throw new Error('Could not generate a unique room code.');
}

async function getGroupRooms(req, res) {
    const email = emailOf(req.user?.email);
    if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    try {
        const [rooms] = await mysqlPool.query(
            `SELECT gr.* FROM gamepal_rooms gr
              WHERE EXISTS (SELECT 1 FROM gamepal_room_members gm WHERE gm.room_code = gr.room_code AND gm.email = ?)
              ORDER BY gr.created_at DESC`, [email],
        );
        const result = [];
        for (const stored of rooms) {
            const room = dbRoom(stored);
            room.participants = await roomMembers(mysqlPool.getPool(), room.code);
            const deadline = stored.join_deadline ? new Date(stored.join_deadline).getTime() : NaN;
            if (room.status === 'In progress' && room.participants.length > 1 && room.participants.every(person => person.score != null)) {
                room.status = 'Complete';
                room.finishedAt = formatDateTimeIndia();
                await mysqlPool.query('UPDATE gamepal_rooms SET status = ?, finished_at = UTC_TIMESTAMP() WHERE room_code = ?', [room.status, room.code]);
            } else if (room.status === 'Waiting' && Number.isFinite(deadline) && deadline <= Date.now() && room.participants.length < 2) {
                room.status = 'Expired';
                await mysqlPool.query('UPDATE gamepal_rooms SET status = ? WHERE room_code = ?', [room.status, room.code]);
            }
            result.push(publicRoom(room));
        }
        return res.status(200).json({ success: true, rooms: result });
    } catch (error) {
        console.error('GamePal group rooms load failed:', error.message);
        return res.status(503).json({ success: false, message: 'Group rooms are temporarily unavailable.' });
    }
}

async function createGroupRoom(req, res) {
    const creatorEmail = emailOf(req.user?.email);
    const gameId = text(req.body?.gameId).toLowerCase();
    const gameName = ROOM_GAME_NAMES[gameId];
    if (!creatorEmail) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    if (!gameName) return res.status(400).json({ success: false, message: 'Choose a GamePal game for your room.' });
    try {
        const room = await mysqlPool.withTransaction(async connection => {
            const student = await findStudent(creatorEmail, connection);
            const [existingRows] = await connection.execute('SELECT room_code FROM gamepal_rooms');
            const code = generateRoomCode(new Set(existingRows.map(row => row.room_code)));
            const now = new Date();
            const deadline = new Date(now.getTime() + 5 * 60 * 1000);
            const name = student?.full_name || text(req.user?.name) || 'Student';
            await connection.execute(
                `INSERT INTO gamepal_rooms
                    (room_code, created_at, join_deadline, game_id, game_name, creator_email, creator_student_id,
                     creator_name, status, max_players, source_key, source_tab, source_record_key)
                 VALUES (?, UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, 'Waiting', 0, 'portal', 'live', ?)`,
                [code, deadline, gameId, gameName, creatorEmail, student?.student_id || null, name, liveKey()],
            );
            const member = { email: creatorEmail, studentId: student?.student_id || null, name, joinedAt: now, score: null, accuracy: null };
            await writeMember(connection, code, member);
            return { code, createdAt: formatDateTimeIndia(now), joinDeadline: formatDateTimeIndia(deadline), startedAt: '', finishedAt: '', gameId, gameName, creatorEmail, creatorName: name, status: 'Waiting', maxPlayers: 0, participants: [member] };
        });
        return res.status(201).json({ success: true, room: publicRoom(room) });
    } catch (error) {
        console.error('GamePal group room create failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not create this game room right now.' });
    }
}

async function joinGroupRoom(req, res) {
    const email = emailOf(req.user?.email);
    const code = text(req.params.code).toUpperCase();
    if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Enter the six-character room code.' });
    try {
        const result = await mysqlPool.withTransaction(async connection => {
            const [rows] = await connection.execute('SELECT * FROM gamepal_rooms WHERE room_code = ? FOR UPDATE', [code]);
            if (!rows[0]) return { status: 404, body: { success: false, message: 'No room was found for that code.' } };
            const room = dbRoom(rows[0]);
            room.participants = await roomMembers(connection, code);
            const existing = room.participants.find(member => member.email === email);
            if (existing) {
                if (room.status !== 'Waiting') return { status: 409, body: { success: false, message: 'This room has already started or ended. It is closed to joining.' } };
                return { status: 200, body: { success: true, room: publicRoom(room), alreadyJoined: true } };
            }
            if (room.status !== 'Waiting') return { status: 409, body: { success: false, message: 'This room has already started or ended. It is closed to joining.' } };
            const deadline = rows[0].join_deadline ? new Date(rows[0].join_deadline).getTime() : 0;
            if (deadline <= Date.now()) return { status: 410, body: { success: false, message: 'The joining window has ended for this room.' } };
            const student = await findStudent(email, connection);
            if (!student) return { status: 403, body: { success: false, message: 'Only signed-in IPCS students can join a group room.' } };
            const member = { email, studentId: student.student_id, name: student.full_name || 'Student', joinedAt: new Date(), score: null, accuracy: null };
            await writeMember(connection, code, member);
            room.participants.push(member);
            return { status: 200, body: { success: true, room: publicRoom(room) } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('GamePal group room join failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not join this game room right now.' });
    }
}

async function startGroupRoom(req, res) {
    const email = emailOf(req.user?.email);
    const code = text(req.params.code).toUpperCase();
    try {
        const result = await mysqlPool.withTransaction(async connection => {
            const [rows] = await connection.execute('SELECT * FROM gamepal_rooms WHERE room_code = ? FOR UPDATE', [code]);
            if (!rows[0]) return { status: 404, body: { success: false, message: 'This room could not be found.' } };
            const room = dbRoom(rows[0]);
            room.participants = await roomMembers(connection, code);
            if (room.creatorEmail !== email) return { status: 403, body: { success: false, message: 'Only the room creator can start this game.' } };
            if (room.status !== 'Waiting') return { status: 409, body: { success: false, message: 'This room is no longer waiting to start.' } };
            if (room.participants.length < 2) {
                await connection.execute('UPDATE gamepal_rooms SET status = ? WHERE room_code = ?', ['Expired', code]);
                return { status: 409, body: { success: false, message: 'At least two students must join before the game can start.' } };
            }
            const now = new Date();
            room.status = 'In progress';
            room.startedAt = formatDateTimeIndia(now);
            await connection.execute('UPDATE gamepal_rooms SET status = ?, started_at = UTC_TIMESTAMP() WHERE room_code = ?', [room.status, code]);
            return { status: 200, body: { success: true, room: publicRoom(room) } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('GamePal group room start failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not start the group game right now.' });
    }
}

async function submitGroupRoomScore(req, res) {
    const email = emailOf(req.user?.email);
    const code = text(req.params.code).toUpperCase();
    const score = Number(req.body?.score);
    const accuracy = Number(req.body?.accuracy);
    if (!Number.isFinite(score) || score < 0 || score > 100000 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
        return res.status(400).json({ success: false, message: 'The submitted score is invalid.' });
    }
    try {
        const result = await mysqlPool.withTransaction(async connection => {
            const [rows] = await connection.execute('SELECT * FROM gamepal_rooms WHERE room_code = ? FOR UPDATE', [code]);
            if (!rows[0]) return { status: 404, body: { success: false, message: 'This room could not be found.' } };
            const room = dbRoom(rows[0]);
            if (room.status !== 'In progress') return { status: 409, body: { success: false, message: 'This room is not accepting scores.' } };
            const [memberRows] = await connection.execute(
                'SELECT * FROM gamepal_room_members WHERE room_code = ? ORDER BY joined_at, created_at FOR UPDATE', [code],
            );
            const participant = memberRows.find(member => emailOf(member.email) === email);
            if (!participant) return { status: 403, body: { success: false, message: 'You are not a participant in this room.' } };
            if (participant.score != null) return { status: 409, body: { success: false, message: 'Your score has already been recorded for this room.' } };
            await connection.execute('UPDATE gamepal_room_members SET score = ?, accuracy = ? WHERE id = ?', [Math.round(score), Math.round(accuracy), participant.id]);
            const refreshed = await roomMembers(connection, code);
            room.participants = refreshed;
            const complete = refreshed.length > 1 && refreshed.every(person => person.score != null);
            if (complete) {
                room.status = 'Complete';
                room.finishedAt = formatDateTimeIndia();
                await connection.execute('UPDATE gamepal_rooms SET status = ?, finished_at = UTC_TIMESTAMP() WHERE room_code = ?', [room.status, code]);
            }
            const standings = complete
                ? [...refreshed].sort((left, right) => Number(right.score) - Number(left.score)).map((person, place, list) => ({
                    ...person,
                    place: place > 0 && Number(person.score) === Number(list[place - 1].score) ? list[place - 1].place : place + 1,
                })) : [];
            return { status: 200, body: { success: true, status: room.status, room: publicRoom(room), standings } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('GamePal group room score failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not save the group score.' });
    }
}

async function getFriendChallenges(req, res) {
    const email = emailOf(req.user?.email);
    if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    try {
        const [rows] = await mysqlPool.query(
            'SELECT * FROM gamepal_challenges WHERE creator_email = ? OR opponent_email = ? ORDER BY created_at DESC, challenge_code DESC', [email, email],
        );
        const challenges = rows.map(row => {
            const creatorScore = row.creator_score == null ? null : Number(row.creator_score);
            const opponentScore = row.opponent_score == null ? null : Number(row.opponent_score);
            const winnerEmail = creatorScore == null || opponentScore == null || creatorScore === opponentScore
                ? '' : creatorScore > opponentScore ? row.creator_email : row.opponent_email;
            return {
                id: row.challenge_code, createdAt: safeDateTime(row.created_at), gameId: row.game_id, gameName: row.game_name,
                creatorEmail: row.creator_email, creatorName: row.creator_name || 'Student',
                opponentEmail: row.opponent_email, opponentName: row.opponent_name || 'Student',
                creatorScore, creatorAccuracy: Number(row.creator_accuracy) || 0,
                opponentScore, opponentAccuracy: Number(row.opponent_accuracy) || 0,
                winnerEmail, status: row.status || 'Waiting for friend',
            };
        });
        return res.status(200).json({ success: true, challenges });
    } catch (error) {
        console.error('GamePal friend challenges load failed:', error.message);
        return res.status(503).json({ success: false, message: 'Play with friends is temporarily unavailable.' });
    }
}

async function createFriendChallenge(req, res) {
    const creatorEmail = emailOf(req.user?.email);
    const opponentEmail = emailOf(req.body?.opponentEmail);
    const gameId = text(req.body?.gameId).slice(0, 64);
    const gameName = text(req.body?.gameName).slice(0, 100);
    if (!creatorEmail || !opponentEmail || !gameId || !gameName) return res.status(400).json({ success: false, message: 'Choose a game and enter your friend’s student email.' });
    if (creatorEmail === opponentEmail) return res.status(400).json({ success: false, message: 'Choose a different student account to challenge.' });
    try {
        const creator = await findStudent(creatorEmail);
        const opponent = await findStudent(opponentEmail);
        if (!opponent) return res.status(404).json({ success: false, message: 'No IPCS student account was found for that email.' });
        const now = new Date();
        const challengeCode = `GP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        await mysqlPool.query(
            `INSERT INTO gamepal_challenges
                (id, challenge_code, created_at, updated_at, game_id, game_name, creator_email, creator_student_id,
                 creator_name, opponent_email, opponent_student_id, opponent_name, status,
                 source_key, source_tab, source_record_key)
             VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, 'Waiting for friend', 'portal', 'live', ?)`,
            [id(), challengeCode, gameId, gameName, creatorEmail, creator?.student_id || null,
                creator?.full_name || text(req.user?.name) || 'Student', opponentEmail, opponent.student_id,
                opponent.full_name || 'Student', liveKey()],
        );
        return res.status(201).json({ success: true, challenge: {
            id: challengeCode, createdAt: formatDateTimeIndia(now), gameId, gameName, creatorEmail,
            creatorName: creator?.full_name || text(req.user?.name) || 'Student', opponentEmail,
            opponentName: opponent.full_name || 'Student', creatorScore: null, opponentScore: null, status: 'Waiting for friend',
        } });
    } catch (error) {
        console.error('GamePal friend challenge create failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not create this challenge right now.' });
    }
}

async function submitFriendChallengeScore(req, res) {
    const email = emailOf(req.user?.email);
    const challengeCode = text(req.params.id);
    const score = Number(req.body?.score);
    const accuracy = Number(req.body?.accuracy);
    if (!Number.isFinite(score) || score < 0 || score > 100000 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
        return res.status(400).json({ success: false, message: 'The submitted score is invalid.' });
    }
    try {
        const result = await mysqlPool.withTransaction(async connection => {
            const [rows] = await connection.execute('SELECT * FROM gamepal_challenges WHERE challenge_code = ? FOR UPDATE', [challengeCode]);
            const row = rows[0];
            if (!row) return { status: 404, body: { success: false, message: 'This friend challenge could not be found.' } };
            const isCreator = emailOf(row.creator_email) === email;
            const isOpponent = emailOf(row.opponent_email) === email;
            if (!isCreator && !isOpponent) return { status: 403, body: { success: false, message: 'This challenge is for another student.' } };
            const scoreColumn = isCreator ? 'creator_score' : 'opponent_score';
            const accuracyColumn = isCreator ? 'creator_accuracy' : 'opponent_accuracy';
            if (row[scoreColumn] != null) return { status: 409, body: { success: false, message: 'Your score has already been recorded for this challenge.' } };
            await connection.execute(
                `UPDATE gamepal_challenges SET ${scoreColumn} = ?, ${accuracyColumn} = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
                [Math.round(score), Math.round(accuracy), row.id],
            );
            const creatorScore = isCreator ? Math.round(score) : row.creator_score == null ? null : Number(row.creator_score);
            const opponentScore = isOpponent ? Math.round(score) : row.opponent_score == null ? null : Number(row.opponent_score);
            const status = creatorScore == null || opponentScore == null ? 'Waiting for friend' : 'Complete';
            if (status === 'Complete') await connection.execute('UPDATE gamepal_challenges SET status = ? WHERE id = ?', [status, row.id]);
            const winner = creatorScore == null || opponentScore == null ? null : creatorScore === opponentScore ? 'Tie'
                : creatorScore > opponentScore ? row.creator_name : row.opponent_name;
            const winnerEmail = creatorScore == null || opponentScore == null || creatorScore === opponentScore ? ''
                : creatorScore > opponentScore ? row.creator_email : row.opponent_email;
            return { status: 200, body: { success: true, status, winner, winnerEmail, creatorScore, opponentScore } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('GamePal friend challenge score failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not save the challenge score.' });
    }
}

async function getGamePalDashboard(req, res) {
    const email = emailOf(req.user?.email || req.body?.email);
    if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    try {
        const [[storedStats]] = await mysqlPool.query('SELECT * FROM gamepal_student_stats WHERE email = ? LIMIT 1', [email]);
        const [logs] = await mysqlPool.query(
            'SELECT game_name, category, score, accuracy FROM gamepal_sessions WHERE email = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 60', [email],
        );
        const userStats = storedStats ? {
            email: storedStats.email, name: storedStats.full_name, rollNo: storedStats.roll_number,
            branch: storedStats.branch_name, overallScore: 0,
            categories: {
                Memory: Number(storedStats.memory_score) || 0, Attention: Number(storedStats.attention_score) || 0,
                Language: Number(storedStats.language_score) || 0, ProblemSolving: Number(storedStats.problem_solving_score) || 0,
                Math: Number(storedStats.math_score) || 0, Flexibility: Number(storedStats.flexibility_score) || 0,
                Speed: Number(storedStats.speed_score) || 0,
            },
            currentStreak: Number(storedStats.current_streak) || 0,
            lastPlayedDate: safeDate(storedStats.last_played_date),
        } : {
            email, overallScore: 0, categories: { Memory: 0, Attention: 0, Language: 0, ProblemSolving: 0, Math: 0, Flexibility: 0, Speed: 0 },
            currentStreak: 0, lastPlayedDate: 'Never',
        };
        const games = {};
        for (const row of logs) {
            const name = text(row.game_name) || 'GamePal session';
            const category = text(row.category);
            const score = Math.max(0, Number.parseInt(row.score, 10) || 0);
            const accuracy = Math.max(0, Number.parseInt(row.accuracy, 10) || 0);
            if (!games[name]) games[name] = { name, category, attempts: 0, bestScore: 0, lastScore: 0, averageAccuracy: 0, level: 1, accuracyTotal: 0 };
            const game = games[name];
            game.attempts += 1;
            game.bestScore = Math.max(game.bestScore, score);
            game.lastScore = score;
            game.accuracyTotal += accuracy;
        }
        Object.values(games).forEach(game => {
            game.averageAccuracy = Math.round(game.accuracyTotal / game.attempts);
            const masteryAdjustment = game.averageAccuracy >= 80 ? 1 : game.averageAccuracy < 45 ? -1 : 0;
            game.level = Math.max(1, Math.min(5, 1 + Math.floor(game.attempts / 3) + masteryAdjustment));
            delete game.accuracyTotal;
            const categoryKey = game.category.replace(/\s/g, '');
            if (userStats.categories[categoryKey] !== undefined) userStats.categories[categoryKey] = Math.max(userStats.categories[categoryKey], game.bestScore);
        });
        const completedGames = Object.values(games);
        userStats.games = games;
        userStats.overallScore = completedGames.length
            ? Math.round(completedGames.reduce((sum, game) => sum + game.bestScore, 0) / completedGames.length) : 0;
        const dailyGames = [
            { id: 'color-mix', name: 'Color Mix', category: 'Attention', icon: 'ph-palette' },
            { id: 'memory-matrix', name: 'Memory Board', category: 'Memory', icon: 'ph-grid-four' },
            { id: 'speed-math', name: 'Number Crunch', category: 'Math', icon: 'ph-calculator' },
            { id: 'hexa-puzzle', name: 'Hexa Puzzle', category: 'Problem Solving', icon: 'ph-puzzle-piece' },
            { id: 'rule-switch', name: 'Flex Match', category: 'Flexibility', icon: 'ph-arrows-left-right' },
        ];
        return res.status(200).json({ success: true, stats: userStats, dailyGames });
    } catch (error) {
        console.error('GamePal Dashboard Error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to load GamePal dashboard.' });
    }
}

async function submitGameSession(req, res) {
    const email = emailOf(req.user?.email || req.body?.email);
    const { gameName, category } = req.body || {};
    const score = Number(req.body?.score);
    const accuracy = Number(req.body?.accuracy);
    const timeSeconds = Number(req.body?.timeSeconds);
    if (!email || !text(gameName) || !Number.isFinite(score) || score < 0 || score > 100000
        || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100
        || !Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > 86400) {
        return res.status(400).json({ success: false, message: 'The submitted game result is invalid.' });
    }
    try {
        const result = await mysqlPool.withTransaction(async connection => {
            const student = await findStudent(email, connection);
            const name = student?.full_name || text(req.body?.name) || 'Student';
            const rollNumber = student?.roll_number || text(req.body?.rollNo) || 'N/A';
            const branchName = student?.branch_name || text(req.body?.branch) || 'Bangalore';
            const now = new Date();
            const today = sqlToday(now);
            const yesterday = sqlYesterday();
            const sourceRecordKey = liveKey();
            await connection.execute(
                `INSERT INTO gamepal_sessions
                    (id, student_id, email, roll_number, student_name, game_name, category, score, accuracy,
                     time_seconds, occurred_at, source_key, source_tab, source_record_key)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), 'portal', 'live', ?)`,
                [id(), student?.student_id || null, email, rollNumber, name, text(gameName).slice(0, 120),
                    text(category).slice(0, 80) || null, Math.round(score), Math.round(accuracy), Math.round(timeSeconds), sourceRecordKey],
            );
            const [statsRows] = await connection.execute('SELECT * FROM gamepal_student_stats WHERE email = ? FOR UPDATE', [email]);
            const stats = statsRows[0];
            const newScores = CATEGORIES.map(categoryName => {
                if (!stats) return 0;
                const saved = Number(stats[CATEGORY_COLUMNS[categoryName]]) || 0;
                return saved === 500 ? 0 : saved;
            });
            const categoryIndex = CATEGORIES.indexOf(text(category));
            if (categoryIndex >= 0) newScores[categoryIndex] = Math.min(2000, newScores[categoryIndex] + Math.max(0, Math.round(score)));
            const previousDate = sqlDateValue(stats?.last_played_date);
            const currentStreak = Number(stats?.current_streak) || 0;
            const streak = previousDate === today ? currentStreak : previousDate === yesterday ? currentStreak + 1 : 1;
            const overall = Math.round(newScores.reduce((sum, item) => sum + item, 0) / newScores.length);
            const statId = stats?.id || id();
            await connection.execute(
                `INSERT INTO gamepal_student_stats
                    (id, student_id, email, full_name, roll_number, branch_name, overall_brain_score,
                     memory_score, attention_score, language_score, problem_solving_score, math_score,
                     flexibility_score, speed_score, current_streak, last_played_date,
                     source_key, source_tab, source_record_key, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'portal', 'live', ?, ?)
                 ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), full_name = VALUES(full_name),
                    roll_number = VALUES(roll_number), branch_name = VALUES(branch_name),
                    overall_brain_score = VALUES(overall_brain_score), memory_score = VALUES(memory_score),
                    attention_score = VALUES(attention_score), language_score = VALUES(language_score),
                    problem_solving_score = VALUES(problem_solving_score), math_score = VALUES(math_score),
                    flexibility_score = VALUES(flexibility_score), speed_score = VALUES(speed_score),
                    current_streak = VALUES(current_streak), last_played_date = VALUES(last_played_date),
                    source_key = 'portal', source_tab = 'live', source_record_key = VALUES(source_record_key), metadata = VALUES(metadata)`,
                [statId, student?.student_id || null, email, name, rollNumber, branchName, overall,
                    ...newScores, streak, today, email, JSON.stringify({ source: 'live_game_session' })],
            );
            return { overall, streak };
        });
        return res.status(200).json({ success: true, overallScore: result.overall, streak: result.streak });
    } catch (error) {
        console.error('GamePal Submission Error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to record session.' });
    }
}

async function getGamePalLeaderboard(req, res) {
    try {
        const [logs] = await mysqlPool.query(
            'SELECT email, game_name, score FROM gamepal_sessions ORDER BY occurred_at DESC, created_at DESC LIMIT 60',
        );
        const [stats] = await mysqlPool.query('SELECT email, full_name, branch_name, current_streak FROM gamepal_student_stats');
        const metadata = new Map(stats.map(row => [emailOf(row.email), row]));
        const playerGames = new Map();
        for (const row of logs) {
            const email = emailOf(row.email);
            if (!email) continue;
            const game = text(row.game_name) || 'GamePal session';
            const score = Number.parseInt(row.score, 10) || 0;
            if (!playerGames.has(email)) playerGames.set(email, new Map());
            const scores = playerGames.get(email);
            scores.set(game, Math.max(scores.get(game) || 0, score));
        }
        const players = [...playerGames.entries()].map(([email, scores]) => {
            const row = metadata.get(email) || {};
            const bestScores = [...scores.values()];
            return {
                name: row.full_name || 'Student', branch: row.branch_name || 'Campus',
                overallScore: Math.round(bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length),
                streak: Number.parseInt(row.current_streak, 10) || 0,
            };
        });
        players.sort((a, b) => b.overallScore - a.overallScore);
        return res.status(200).json({ success: true, leaderboard: players.slice(0, 15) });
    } catch (error) {
        console.error('GamePal leaderboard load failed:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to load leaderboard.' });
    }
}

async function getGamePalHistory(req, res) {
    const email = emailOf(req.user?.email);
    if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    try {
        const [rows] = await mysqlPool.query(
            'SELECT occurred_at, game_name, category, score, accuracy, time_seconds FROM gamepal_sessions WHERE email = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 20', [email],
        );
        const sessions = rows.map(row => ({
            date: safeDateTime(row.occurred_at), gameName: row.game_name || 'GamePal session', category: row.category || '',
            score: Number(row.score) || 0, accuracy: `${Number(row.accuracy) || 0}%`, timeSeconds: Number(row.time_seconds) || 0,
        }));
        return res.status(200).json({ success: true, sessions });
    } catch (error) {
        console.error('GamePal History Error:', error.message);
        return res.status(500).json({ success: false, message: 'Could not load recent GamePal sessions.' });
    }
}

module.exports = {
    getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory,
    getFriendChallenges, createFriendChallenge, submitFriendChallengeScore,
    getGroupRooms, createGroupRoom, joinGroupRoom, startGroupRoom, submitGroupRoomScore,
};
