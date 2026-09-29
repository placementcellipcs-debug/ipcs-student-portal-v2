const DatabaseService = require('../services/dbService');
const crypto = require('crypto');

const CATEGORIES = ["Memory", "Attention", "Language", "Problem Solving", "Math", "Flexibility", "Speed"];
const FRIEND_HEADERS = ['Challenge ID', 'Created At', 'Updated At', 'Game ID', 'Game Name', 'Creator Email', 'Creator Name', 'Opponent Email', 'Opponent Name', 'Creator Score', 'Creator Accuracy', 'Opponent Score', 'Opponent Accuracy', 'Status'];
const gamePalSpreadsheetId = () => process.env.GAMEPAL_SPREADSHEET_ID || process.env.SPREADSHEET_ID;

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

module.exports = { getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory, getFriendChallenges, createFriendChallenge, submitFriendChallengeScore };
