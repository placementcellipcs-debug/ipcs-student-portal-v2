const DatabaseService = require('../services/dbService');

const CATEGORIES = ["Memory", "Attention", "Language", "Problem Solving", "Math", "Flexibility", "Speed"];

const getGamePalDashboard = async (req, res) => {
    try {
        const email = req.user?.email || req.body.email;
        const gamePalDbId = process.env.GAMEPAL_SPREADSHEET_ID;
        
        const statsRows = await DatabaseService.getSheetData("GamePal_Stats!A:N", gamePalDbId);
        
        let userStats = null;
        for (let i = 1; i < statsRows.length; i++) {
            if ((statsRows[i][0] || "").toLowerCase() === email.toLowerCase()) {
                userStats = {
                    email: statsRows[i][0],
                    name: statsRows[i][1],
                    rollNo: statsRows[i][2],
                    branch: statsRows[i][3],
                    overallScore: parseInt(statsRows[i][4]) || 500,
                    categories: {
                        Memory: parseInt(statsRows[i][5]) || 500,
                        Attention: parseInt(statsRows[i][6]) || 500,
                        Language: parseInt(statsRows[i][7]) || 500,
                        ProblemSolving: parseInt(statsRows[i][8]) || 500,
                        Math: parseInt(statsRows[i][9]) || 500,
                        Flexibility: parseInt(statsRows[i][10]) || 500,
                        Speed: parseInt(statsRows[i][11]) || 500,
                    },
                    currentStreak: parseInt(statsRows[i][12]) || 0,
                    lastPlayedDate: statsRows[i][13] || "Never"
                };
                break;
            }
        }

        if (!userStats) {
            userStats = {
                email, overallScore: 500,
                categories: { Memory: 500, Attention: 500, Language: 500, ProblemSolving: 500, Math: 500, Flexibility: 500, Speed: 500 },
                currentStreak: 0, lastPlayedDate: "Never"
            };
        }

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
        const gamePalDbId = process.env.GAMEPAL_SPREADSHEET_ID;
        
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
        let newScores = [500, 500, 500, 500, 500, 500, 500];
        let streak = 1;

        if (currentRecord) {
            CATEGORIES.forEach((cat, idx) => { newScores[idx] = parseInt(currentRecord[catIndexMap[cat]]) || 500; });
            const targetIdx = CATEGORIES.indexOf(category);
            
            if (targetIdx !== -1) {
                // Point calculation logic based on score
                const pointGain = Math.round((score / 100) * 15);
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
        const gamePalDbId = process.env.GAMEPAL_SPREADSHEET_ID;
        const rows = await DatabaseService.getSheetData("GamePal_Stats!A:N", gamePalDbId);
        let players = [];

        for (let i = 1; i < rows.length; i++) {
            players.push({
                name: rows[i][1] || "Student",
                branch: rows[i][3] || "Campus",
                overallScore: parseInt(rows[i][4]) || 500,
                streak: parseInt(rows[i][12]) || 0
            });
        }

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
        const gamePalDbId = process.env.GAMEPAL_SPREADSHEET_ID;
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

module.exports = { getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory };
