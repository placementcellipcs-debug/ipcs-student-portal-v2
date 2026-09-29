const DatabaseService = require('../services/dbService');
const crypto = require('crypto');

const CATEGORIES = ["Memory", "Attention", "Language", "Problem Solving", "Math", "Flexibility", "Speed"];
const FRIEND_HEADERS = ['Challenge ID', 'Created At', 'Updated At', 'Game ID', 'Game Name', 'Creator Email', 'Creator Name', 'Opponent Email', 'Opponent Name', 'Creator Score', 'Creator Accuracy', 'Opponent Score', 'Opponent Accuracy', 'Status'];
const ROOM_HEADERS = ['Room Code', 'Created At', 'Join Deadline', 'Started At', 'Finished At', 'Game ID', 'Game Name', 'Creator Email', 'Creator Name', 'Status', 'Max Players'];
const ROOM_MEMBER_HEADERS = ['Room Code', 'Student Email', 'Student Name', 'Joined At', 'Score', 'Accuracy'];
const ROOM_GAME_NAMES = {
    memory: 'Sequence Studio', attention: 'Color Focus', language: 'Word Scramble', math: 'Quick Calculations',
    logic: 'Pattern Finder', flexibility: 'Rule Switch', speed: 'Quick Spot', pinpoint: 'Pinpoint',
    crossclimb: 'Crossclimb', queens: 'Queens', tango: 'Tango', zip: 'Zip', 'mini-sudoku': 'Mini Sudoku',
    patches: 'Patches', wend: 'Wend', knifeshow: 'Knife Show', snowrider: 'Snow Rider 3D', dino: 'Dino Runner',
    chess: 'Chess', 'word-association': 'Word Association',
};
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const gamePalSpreadsheetId = () => process.env.GAMEPAL_SPREADSHEET_ID || process.env.SPREADSHEET_ID;
const roomSheetSetups = new Map();

const readRoomRows = async (spreadsheetId) => {
    let setup = roomSheetSetups.get(spreadsheetId);
    if (!setup) {
        setup = Promise.all([
            DatabaseService.ensureWorksheetWithHeaders('GamePal_Rooms', ROOM_HEADERS, spreadsheetId),
            DatabaseService.ensureWorksheetWithHeaders('GamePal_Room_Members', ROOM_MEMBER_HEADERS, spreadsheetId),
        ]).catch((error) => { roomSheetSetups.delete(spreadsheetId); throw error; });
        roomSheetSetups.set(spreadsheetId, setup);
    }
    await setup;
    return DatabaseService.getSheetData('GamePal_Rooms!A:K', spreadsheetId, 2);
};

const readRoomMemberRows = async (spreadsheetId) => {
    await readRoomRows(spreadsheetId);
    return DatabaseService.getSheetData('GamePal_Room_Members!A:F', spreadsheetId, 2);
};

const roomMembersForCode = (rows, code) => rows.slice(1)
    .filter((row) => String(row[0] || '').trim().toUpperCase() === code)
    .map((row) => ({
        email: String(row[1] || '').trim().toLowerCase(), name: row[2] || 'Student', joinedAt: row[3] || '',
        score: row[4] === '' || row[4] == null ? null : Number(row[4]),
        accuracy: row[5] === '' || row[5] == null ? null : Number(row[5]),
    }));

const roomMemberRowIndex = (rows, code, email) => rows.findIndex((row, index) => index > 0
    && String(row[0] || '').trim().toUpperCase() === code
    && String(row[1] || '').trim().toLowerCase() === email);

const appendRoomMember = async (room, member, spreadsheetId) => DatabaseService.appendRow('GamePal_Room_Members!A:F', [
    room.code, member.email, member.name, member.joinedAt, member.score ?? '', member.accuracy ?? '',
], spreadsheetId);

const saveRoomMemberScore = async (rowIndex, score, accuracy, spreadsheetId) => DatabaseService.updateRow(
    `GamePal_Room_Members!E${rowIndex + 1}:F${rowIndex + 1}`, [String(Math.round(score)), String(Math.round(accuracy))], spreadsheetId,
);

const updateRoomCompletion = async (room, rowIndex, spreadsheetId) => {
    room.status = 'Complete';
    room.finishedAt = new Date().toISOString();
    await saveRoom(room, rowIndex, spreadsheetId);
    return room;
};

const roomFromRow = (row) => ({
        code: String(row[0] || '').trim().toUpperCase(), createdAt: row[1] || '', joinDeadline: row[2] || '',
        startedAt: row[3] || '', finishedAt: row[4] || '', gameId: row[5] || '', gameName: row[6] || 'GamePal game',
        creatorEmail: String(row[7] || '').trim().toLowerCase(), creatorName: row[8] || 'Student',
        status: row[9] || 'Waiting', maxPlayers: Math.max(2, Number.parseInt(row[10], 10) || 4), participants: [],
    });

const roomToRow = (room) => [
    room.code, room.createdAt, room.joinDeadline, room.startedAt || '', room.finishedAt || '', room.gameId,
    room.gameName, room.creatorEmail, room.creatorName, room.status, String(room.maxPlayers),
];

const findRoom = (rows, code) => {
    const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && String(row[0] || '').trim().toUpperCase() === code);
    return index < 1 ? null : { index, room: roomFromRow(rows[index]) };
};

const saveRoom = async (room, rowIndex, spreadsheetId) => {
    await DatabaseService.updateRow(`GamePal_Rooms!A${rowIndex + 1}:K${rowIndex + 1}`, roomToRow(room), spreadsheetId);
};

const publicRoom = (room) => ({
    ...room,
    participants: room.participants.map(({ email, name, joinedAt, score, accuracy }) => ({
        email, name, joinedAt, score: score == null ? null : Number(score), accuracy: accuracy == null ? null : Number(accuracy),
    })),
});

const generateRoomCode = (existingCodes) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const code = Array.from(crypto.randomBytes(6), (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
        if (!existingCodes.has(code)) return code;
    }
    throw new Error('Could not generate a unique room code.');
};

const getGroupRooms = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const spreadsheetId = gamePalSpreadsheetId();
        const [rows, memberRows] = await Promise.all([readRoomRows(spreadsheetId), readRoomMemberRows(spreadsheetId)]);
        const rooms = [];
        for (let index = 1; index < rows.length; index += 1) {
            const room = roomFromRow(rows[index]);
            room.participants = roomMembersForCode(memberRows, room.code);
            if (!room.code || !room.participants.some((member) => member.email === email)) continue;
            if (room.status === 'In progress' && room.participants.length > 1 && room.participants.every((member) => member.score != null)) {
                await updateRoomCompletion(room, index, spreadsheetId);
            }
            if (room.status === 'Waiting' && Date.parse(room.joinDeadline) <= Date.now() && room.participants.length < 2) {
                room.status = 'Expired';
                await saveRoom(room, index, spreadsheetId);
            }
            rooms.push(publicRoom(room));
        }
        return res.status(200).json({ success: true, rooms: rooms.reverse() });
    } catch (error) {
        console.error('GamePal group rooms load failed:', error.message);
        return res.status(503).json({ success: false, message: 'Group rooms are temporarily unavailable.' });
    }
};

const createGroupRoom = async (req, res) => {
    try {
        const creatorEmail = String(req.user?.email || '').trim().toLowerCase();
        const gameId = String(req.body?.gameId || '').trim().toLowerCase();
        const gameName = ROOM_GAME_NAMES[gameId];
        if (!creatorEmail) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        if (!gameName) return res.status(400).json({ success: false, message: 'Choose a GamePal game for your room.' });
        const requestedSize = Number.parseInt(req.body?.maxPlayers, 10) || 4;
        const maxPlayers = Math.min(8, Math.max(2, requestedSize));
        const spreadsheetId = gamePalSpreadsheetId();
        const rows = await readRoomRows(spreadsheetId);
        const existing = new Set(rows.slice(1).map((row) => String(row[0] || '').trim().toUpperCase()));
        const creatorRows = await DatabaseService.getSheetData('Data!A:AG');
        const profile = creatorRows.slice(1).reverse().find((row) => String(row[3] || '').trim().toLowerCase() === creatorEmail);
        const now = Date.now();
        const room = {
            code: generateRoomCode(existing), createdAt: new Date(now).toISOString(),
            joinDeadline: new Date(now + 5 * 60 * 1000).toISOString(), startedAt: '', finishedAt: '',
            gameId, gameName, creatorEmail, creatorName: profile?.[1] || req.user?.name || 'Student',
            status: 'Waiting', maxPlayers,
            participants: [{ email: creatorEmail, name: profile?.[1] || req.user?.name || 'Student', joinedAt: new Date(now).toISOString(), score: null, accuracy: null }],
        };
        await DatabaseService.appendRow('GamePal_Rooms!A:K', roomToRow(room), spreadsheetId);
        await appendRoomMember(room, room.participants[0], spreadsheetId);
        return res.status(201).json({ success: true, room: publicRoom(room) });
    } catch (error) {
        console.error('GamePal group room create failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not create this game room right now.' });
    }
};

const joinGroupRoom = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        const code = String(req.params.code || '').trim().toUpperCase();
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Enter the six-character room code.' });
        const spreadsheetId = gamePalSpreadsheetId();
        const [rows, memberRows] = await Promise.all([readRoomRows(spreadsheetId), readRoomMemberRows(spreadsheetId)]);
        const found = findRoom(rows, code);
        if (!found) return res.status(404).json({ success: false, message: 'No room was found for that code.' });
        const { room } = found;
        room.participants = roomMembersForCode(memberRows, code);
        const existingMember = room.participants.find((member) => member.email === email);
        if (existingMember) {
            if (room.status !== 'Waiting') return res.status(409).json({ success: false, message: 'This room has already started or ended. It is closed to joining.' });
            return res.status(200).json({ success: true, room: publicRoom(room), alreadyJoined: true });
        }
        if (room.status !== 'Waiting') return res.status(409).json({ success: false, message: 'This room has already started or ended. It is closed to joining.' });
        if (Date.parse(room.joinDeadline) <= Date.now()) return res.status(410).json({ success: false, message: 'The joining window has ended for this room.' });
        if (room.participants.length >= room.maxPlayers) return res.status(409).json({ success: false, message: 'This room is full.' });
        const studentRows = await DatabaseService.getSheetData('Data!A:AG');
        const profile = studentRows.slice(1).reverse().find((row) => String(row[3] || '').trim().toLowerCase() === email);
        if (!profile) return res.status(403).json({ success: false, message: 'Only signed-in IPCS students can join a group room.' });
        const member = { email, name: profile[1] || req.user?.name || 'Student', joinedAt: new Date().toISOString(), score: null, accuracy: null };
        await appendRoomMember(room, member, spreadsheetId);
        room.participants.push(member);
        return res.status(200).json({ success: true, room: publicRoom(room) });
    } catch (error) {
        console.error('GamePal group room join failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not join this game room right now.' });
    }
};

const startGroupRoom = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        const code = String(req.params.code || '').trim().toUpperCase();
        const spreadsheetId = gamePalSpreadsheetId();
        const [rows, memberRows] = await Promise.all([readRoomRows(spreadsheetId), readRoomMemberRows(spreadsheetId)]);
        const found = findRoom(rows, code);
        if (!found) return res.status(404).json({ success: false, message: 'This room could not be found.' });
        const { index, room } = found;
        room.participants = roomMembersForCode(memberRows, code);
        if (room.creatorEmail !== email) return res.status(403).json({ success: false, message: 'Only the room creator can start this game.' });
        if (room.status !== 'Waiting') return res.status(409).json({ success: false, message: 'This room is no longer waiting to start.' });
        const joinWindowEnded = Date.parse(room.joinDeadline) <= Date.now();
        if (room.participants.length < room.maxPlayers && !joinWindowEnded) return res.status(409).json({ success: false, message: `Wait for all ${room.maxPlayers} seats or until the five-minute joining window ends.` });
        if (room.participants.length < 2) {
            room.status = 'Expired';
            await saveRoom(room, index, spreadsheetId);
            return res.status(409).json({ success: false, message: 'At least two students must join before the game can start.' });
        }
        room.status = 'In progress';
        room.startedAt = new Date().toISOString();
        await saveRoom(room, index, spreadsheetId);
        return res.status(200).json({ success: true, room: publicRoom(room) });
    } catch (error) {
        console.error('GamePal group room start failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not start the group game right now.' });
    }
};

const submitGroupRoomScore = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        const code = String(req.params.code || '').trim().toUpperCase();
        const score = Number(req.body?.score);
        const accuracy = Number(req.body?.accuracy);
        if (!Number.isFinite(score) || score < 0 || score > 100000 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return res.status(400).json({ success: false, message: 'The submitted score is invalid.' });
        const spreadsheetId = gamePalSpreadsheetId();
        const [rows, memberRows] = await Promise.all([readRoomRows(spreadsheetId), readRoomMemberRows(spreadsheetId)]);
        const found = findRoom(rows, code);
        if (!found) return res.status(404).json({ success: false, message: 'This room could not be found.' });
        const { index, room } = found;
        if (room.status !== 'In progress') return res.status(409).json({ success: false, message: 'This room is not accepting scores.' });
        room.participants = roomMembersForCode(memberRows, code);
        const memberIndex = roomMemberRowIndex(memberRows, code, email);
        const member = room.participants.find((person) => person.email === email);
        if (!member) return res.status(403).json({ success: false, message: 'You are not a participant in this room.' });
        if (member.score != null) return res.status(409).json({ success: false, message: 'Your score has already been recorded for this room.' });
        await saveRoomMemberScore(memberIndex, score, accuracy, spreadsheetId);
        const refreshedMemberRows = await DatabaseService.getSheetData('GamePal_Room_Members!A:F', spreadsheetId, 1);
        room.participants = roomMembersForCode(refreshedMemberRows, code);
        const complete = room.participants.length > 1 && room.participants.every((person) => person.score != null);
        if (complete) {
            await updateRoomCompletion(room, index, spreadsheetId);
        }
        const standings = complete
            ? [...room.participants].sort((left, right) => Number(right.score) - Number(left.score)).map((person, place, list) => ({ ...person, place: place > 0 && Number(person.score) === Number(list[place - 1].score) ? list[place - 1].place : place + 1 }))
            : [];
        return res.status(200).json({ success: true, status: room.status, room: publicRoom(room), standings });
    } catch (error) {
        console.error('GamePal group room score failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not save the group score.' });
    }
};

const getFriendChallenges = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const spreadsheetId = gamePalSpreadsheetId();
        await DatabaseService.ensureWorksheetWithHeaders('GamePal_Challenges', FRIEND_HEADERS, spreadsheetId);
        const rows = await DatabaseService.getSheetData('GamePal_Challenges!A:N', spreadsheetId, 10);
        const challenges = rows.slice(1).filter((row) => [row[5], row[7]].some((owner) => String(owner || '').trim().toLowerCase() === email)).map((row) => {
            const creatorEmail = String(row[5] || '').trim().toLowerCase();
            const opponentEmail = String(row[7] || '').trim().toLowerCase();
            const creatorScore = row[9] === '' || row[9] == null ? null : Number(row[9]);
            const opponentScore = row[11] === '' || row[11] == null ? null : Number(row[11]);
            const winnerEmail = creatorScore === null || opponentScore === null || creatorScore === opponentScore
                ? ''
                : creatorScore > opponentScore ? creatorEmail : opponentEmail;
            return {
                id: row[0], createdAt: row[1], gameId: row[3], gameName: row[4],
                creatorEmail, creatorName: row[6], opponentEmail, opponentName: row[8],
                creatorScore, creatorAccuracy: Number(row[10]) || 0,
                opponentScore, opponentAccuracy: Number(row[12]) || 0,
                winnerEmail, status: row[13] || 'Waiting for friend',
            };
        }).reverse();
        return res.status(200).json({ success: true, challenges });
    } catch (error) {
        console.error('GamePal friend challenges load failed:', error.message);
        return res.status(503).json({ success: false, message: 'Play with friends is temporarily unavailable.' });
    }
};

const createFriendChallenge = async (req, res) => {
    try {
        const creatorEmail = String(req.user?.email || '').trim().toLowerCase();
        const opponentEmail = String(req.body?.opponentEmail || '').trim().toLowerCase();
        const gameId = String(req.body?.gameId || '').trim().slice(0, 64);
        const gameName = String(req.body?.gameName || '').trim().slice(0, 100);
        if (!creatorEmail || !opponentEmail || !gameId || !gameName) return res.status(400).json({ success: false, message: 'Choose a game and enter your friend’s student email.' });
        if (creatorEmail === opponentEmail) return res.status(400).json({ success: false, message: 'Choose a different student account to challenge.' });
        const students = await DatabaseService.getSheetData('Data!A:AG');
        const creator = students.slice(1).reverse().find((row) => String(row[3] || '').trim().toLowerCase() === creatorEmail);
        const opponent = students.slice(1).reverse().find((row) => String(row[3] || '').trim().toLowerCase() === opponentEmail);
        if (!opponent) return res.status(404).json({ success: false, message: 'No IPCS student account was found for that email.' });
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const id = `GP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        const spreadsheetId = gamePalSpreadsheetId();
        await DatabaseService.ensureWorksheetWithHeaders('GamePal_Challenges', FRIEND_HEADERS, spreadsheetId);
        await DatabaseService.appendRow('GamePal_Challenges!A:N', [
            id, now, now, gameId, gameName, creatorEmail, creator?.[1] || 'Student', opponentEmail, opponent?.[1] || 'Student', '', '', '', '', 'Waiting for friend',
        ], spreadsheetId);
        return res.status(201).json({ success: true, challenge: { id, gameId, gameName, creatorEmail, creatorName: creator?.[1] || 'Student', opponentEmail, opponentName: opponent?.[1] || 'Student', creatorScore: null, opponentScore: null, status: 'Waiting for friend' } });
    } catch (error) {
        console.error('GamePal friend challenge create failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not create this challenge right now.' });
    }
};

const submitFriendChallengeScore = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        const challengeId = String(req.params.id || '').trim();
        const score = Number(req.body?.score);
        const accuracy = Number(req.body?.accuracy);
        if (!Number.isFinite(score) || score < 0 || score > 100000 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
            return res.status(400).json({ success: false, message: 'The submitted score is invalid.' });
        }
        const spreadsheetId = gamePalSpreadsheetId();
        await DatabaseService.ensureWorksheetWithHeaders('GamePal_Challenges', FRIEND_HEADERS, spreadsheetId);
        const rows = await DatabaseService.getSheetData('GamePal_Challenges!A:N', spreadsheetId, 1);
        const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[0] || '') === challengeId);
        if (rowIndex < 1) return res.status(404).json({ success: false, message: 'This friend challenge could not be found.' });
        const row = [...rows[rowIndex]];
        const isCreator = String(row[5] || '').trim().toLowerCase() === email;
        const isOpponent = String(row[7] || '').trim().toLowerCase() === email;
        if (!isCreator && !isOpponent) return res.status(403).json({ success: false, message: 'This challenge is for another student.' });
        const scoreColumn = isCreator ? 9 : 11;
        const accuracyColumn = isCreator ? 10 : 12;
        if (row[scoreColumn] !== '' && row[scoreColumn] != null) return res.status(409).json({ success: false, message: 'Your score has already been recorded for this challenge.' });
        row[scoreColumn] = String(Math.round(score));
        row[accuracyColumn] = String(Math.round(accuracy));
        row[2] = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const creatorScore = row[9] === '' || row[9] == null ? null : Number(row[9]);
        const opponentScore = row[11] === '' || row[11] == null ? null : Number(row[11]);
        row[13] = creatorScore === null || opponentScore === null ? 'Waiting for friend' : 'Complete';
        await DatabaseService.updateRow(`GamePal_Challenges!A${rowIndex + 1}:N${rowIndex + 1}`, FRIEND_HEADERS.map((_, index) => row[index] ?? ''), spreadsheetId);
        const winner = creatorScore === null || opponentScore === null ? null : creatorScore === opponentScore ? 'Tie' : creatorScore > opponentScore ? row[6] : row[8];
        const winnerEmail = creatorScore === null || opponentScore === null || creatorScore === opponentScore
            ? ''
            : creatorScore > opponentScore ? String(row[5] || '').trim().toLowerCase() : String(row[7] || '').trim().toLowerCase();
        return res.status(200).json({ success: true, status: row[13], winner, winnerEmail, creatorScore, opponentScore });
    } catch (error) {
        console.error('GamePal friend challenge score failed:', error.message);
        return res.status(503).json({ success: false, message: 'Could not save the challenge score.' });
    }
};

const getGamePalDashboard = async (req, res) => {
    try {
        const email = req.user?.email || req.body.email;
        const gamePalDbId = gamePalSpreadsheetId();
        
        const [statsRows, logRows] = await Promise.all([
            DatabaseService.getSheetData("GamePal_Stats!A:N", gamePalDbId),
            DatabaseService.getSheetData("GamePal_Logs!A:I", gamePalDbId, 60).catch(() => []),
        ]);
        
        let userStats = null;
        for (let i = 1; i < statsRows.length; i++) {
            if ((statsRows[i][0] || "").toLowerCase() === email.toLowerCase()) {
                userStats = {
                    email: statsRows[i][0],
                    name: statsRows[i][1],
                    rollNo: statsRows[i][2],
                    branch: statsRows[i][3],
                    overallScore: 0,
                    categories: Object.fromEntries(CATEGORIES.map((category) => [category.replace(/\s/g, ''), 0])),
                    currentStreak: parseInt(statsRows[i][12]) || 0,
                    lastPlayedDate: statsRows[i][13] || "Never"
                };
                break;
            }
        }

        if (!userStats) {
            userStats = {
                email, overallScore: 0,
                categories: { Memory: 0, Attention: 0, Language: 0, ProblemSolving: 0, Math: 0, Flexibility: 0, Speed: 0 },
                currentStreak: 0, lastPlayedDate: "Never"
            };
        }

        const games = {};
        for (const row of logRows.slice(1)) {
            if (String(row[3] || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase()) continue;
            const name = String(row[4] || 'GamePal session').trim();
            const category = String(row[5] || '').trim();
            const score = Math.max(0, Number.parseInt(row[6], 10) || 0);
            const accuracy = Number.parseInt(String(row[7] || '0').replace('%', ''), 10) || 0;
            if (!games[name]) games[name] = { name, category, attempts: 0, bestScore: 0, lastScore: 0, averageAccuracy: 0, level: 1, accuracyTotal: 0 };
            const game = games[name];
            game.attempts += 1;
            game.bestScore = Math.max(game.bestScore, score);
            game.lastScore = score;
            game.accuracyTotal += accuracy;
        }
        Object.values(games).forEach((game) => {
            game.averageAccuracy = Math.round(game.accuracyTotal / game.attempts);
            game.level = Math.min(5, 1 + Math.floor(game.attempts / 2));
            delete game.accuracyTotal;
            const categoryKey = game.category.replace(/\s/g, '');
            if (userStats.categories[categoryKey] !== undefined) userStats.categories[categoryKey] = Math.max(userStats.categories[categoryKey], game.bestScore);
        });
        const completedGames = Object.values(games);
        userStats.games = games;
        userStats.overallScore = completedGames.length
            ? Math.round(completedGames.reduce((sum, game) => sum + game.bestScore, 0) / completedGames.length)
            : 0;

        const dailyGames = [
            { id: "color-mix", name: "Color Mix", category: "Attention", icon: "ph-palette" },
            { id: "memory-matrix", name: "Memory Board", category: "Memory", icon: "ph-grid-four" },
            { id: "speed-math", name: "Number Crunch", category: "Math", icon: "ph-calculator" },
            { id: "hexa-puzzle", name: "Hexa Puzzle", category: "Problem Solving", icon: "ph-puzzle-piece" },
            { id: "rule-switch", name: "Flex Match", category: "Flexibility", icon: "ph-arrows-left-right" }
        ];

        return res.status(200).json({ success: true, stats: userStats, dailyGames });
    } catch (error) {
        console.error("GamePal Dashboard Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to load GamePal dashboard." });
    }
};

const submitGameSession = async (req, res) => {
    try {
        const email = req.user?.email || req.body.email;
        const { name, rollNo, branch, gameName, category, score, accuracy, timeSeconds } = req.body;
        const gamePalDbId = gamePalSpreadsheetId();
        
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const todayDate = new Date().toLocaleDateString('en-GB');

        // Log session to GamePal_Logs
        await DatabaseService.appendRow("GamePal_Logs!A:I", [
            timestamp, rollNo || "N/A", name || "Student", email, gameName, category, String(score), `${accuracy}%`, String(timeSeconds)
        ], gamePalDbId);

        // Fetch and calculate updated category stats
        const statsRows = await DatabaseService.getSheetData("GamePal_Stats!A:N", gamePalDbId);
        
        let rowIndex = -1;
        let currentRecord = null;

        for (let i = 1; i < statsRows.length; i++) {
            if ((statsRows[i][0] || "").toLowerCase() === email.toLowerCase()) {
                rowIndex = i + 1;
                currentRecord = statsRows[i];
                break;
            }
        }

        const catIndexMap = { "Memory": 5, "Attention": 6, "Language": 7, "Problem Solving": 8, "Math": 9, "Flexibility": 10, "Speed": 11 };
        let newScores = [0, 0, 0, 0, 0, 0, 0];
        let streak = 1;

        if (currentRecord) {
            CATEGORIES.forEach((cat, idx) => {
                const savedScore = parseInt(currentRecord[catIndexMap[cat]], 10) || 0;
                newScores[idx] = savedScore === 500 ? 0 : savedScore;
            });
            const targetIdx = CATEGORIES.indexOf(category);
            
            if (targetIdx !== -1) {
                // Point calculation logic based on score
                const pointGain = Math.max(0, Number.parseInt(score, 10) || 0);
                newScores[targetIdx] = Math.min(2000, newScores[targetIdx] + pointGain);
            }

            const lastDate = currentRecord[13];
            const currentStreakVal = parseInt(currentRecord[12]) || 0;
            
            if (lastDate === todayDate) {
                streak = currentStreakVal;
            } else {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                streak = (lastDate === yesterday.toLocaleDateString('en-GB')) ? currentStreakVal + 1 : 1;
            }
        }

        const overall = Math.round(newScores.reduce((a, b) => a + b, 0) / newScores.length);
        const updatedRow = [
            email, name || "Student", rollNo || "N/A", branch || "Bangalore",
            String(overall), ...newScores.map(String), String(streak), todayDate
        ];

        if (rowIndex !== -1) {
            await DatabaseService.updateRow(`GamePal_Stats!A${rowIndex}:N${rowIndex}`, updatedRow, gamePalDbId);
        } else {
            await DatabaseService.appendRow("GamePal_Stats!A:N", updatedRow, gamePalDbId);
        }

        return res.status(200).json({ success: true, overallScore: overall, streak });
    } catch (error) {
        console.error("GamePal Submission Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to record session." });
    }
};

const getGamePalLeaderboard = async (req, res) => {
    try {
        const gamePalDbId = gamePalSpreadsheetId();
        const [rows, logRows] = await Promise.all([
            DatabaseService.getSheetData("GamePal_Stats!A:N", gamePalDbId),
            DatabaseService.getSheetData('GamePal_Logs!A:I', gamePalDbId, 60).catch(() => []),
        ]);
        const metadata = new Map(rows.slice(1).map((row) => [String(row[0] || '').trim().toLowerCase(), row]));
        const playerGames = new Map();
        for (const row of logRows.slice(1)) {
            const email = String(row[3] || '').trim().toLowerCase();
            if (!email) continue;
            const game = String(row[4] || 'GamePal session').trim();
            const score = Number.parseInt(row[6], 10) || 0;
            if (!playerGames.has(email)) playerGames.set(email, new Map());
            const scores = playerGames.get(email);
            scores.set(game, Math.max(scores.get(game) || 0, score));
        }
        const players = [...playerGames.entries()].map(([email, scores]) => {
            const row = metadata.get(email) || [];
            const bestScores = [...scores.values()];
            return {
                name: row[1] || 'Student', branch: row[3] || 'Campus',
                overallScore: Math.round(bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length),
                streak: Number.parseInt(row[12], 10) || 0,
            };
        });

        players.sort((a, b) => b.overallScore - a.overallScore);
        return res.status(200).json({ success: true, leaderboard: players.slice(0, 15) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to load leaderboard." });
    }
};

const getGamePalHistory = async (req, res) => {
    try {
        const email = String(req.user?.email || '').trim().toLowerCase();
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const gamePalDbId = gamePalSpreadsheetId();
        const rows = await DatabaseService.getSheetData('GamePal_Logs!A:I', gamePalDbId, 60);
        const sessions = rows.slice(1)
            .filter((row) => String(row[3] || '').trim().toLowerCase() === email)
            .slice(-20)
            .reverse()
            .map((row) => ({
                date: row[0] || '', gameName: row[4] || 'GamePal session', category: row[5] || '',
                score: Number.parseInt(row[6], 10) || 0, accuracy: row[7] || '0%', timeSeconds: Number.parseInt(row[8], 10) || 0,
            }));
        return res.status(200).json({ success: true, sessions });
    } catch (error) {
        console.error('GamePal History Error:', error.message);
        return res.status(500).json({ success: false, message: 'Could not load recent GamePal sessions.' });
    }
};

module.exports = {
    getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory,
    getFriendChallenges, createFriendChallenge, submitFriendChallengeScore,
    getGroupRooms, createGroupRoom, joinGroupRoom, startGroupRoom, submitGroupRoomScore,
};
