const crypto = require('crypto');
const DatabaseService = require('../services/dbService');
const { getCourseAccess, courseMatchesAccess } = require('../services/courseService');

const examSessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const clean = (value) => String(value || '').trim();
const isActive = (value) => !/inactive|^false$/i.test(clean(value || 'active'));
const isEnabled = (value) => /^(yes|true|1)$/i.test(clean(value));

const getStudent = async (email) => {
    const normalizedEmail = clean(email).toLowerCase();
    if (!normalizedEmail) return null;
    const rows = await DatabaseService.getSheetData('Data!A:AG');
    const row = rows.slice(1).reverse().find((item) => clean(item[3]).toLowerCase() === normalizedEmail);
    if (!row) return null;
    return {
        email: clean(row[3]), name: clean(row[1]) || 'Student', rollNo: clean(row[5]) || 'N/A',
        branch: clean(row[8]) || 'N/A', course: clean(row[7]) || 'N/A', techExamAccess: row[32],
    };
};

const pruneSessions = () => {
    const now = Date.now();
    for (const [id, session] of examSessions) if (now - session.createdAt > SESSION_TTL_MS) examSessions.delete(id);
};

const createSession = ({ email, type, testNum, course, levels, maxDurationSeconds }) => {
    pruneSessions();
    const sessionId = crypto.randomBytes(32).toString('hex');
    examSessions.set(sessionId, {
        email: clean(email).toLowerCase(), type, testNum, course: clean(course), levels,
        createdAt: Date.now(), maxDurationSeconds,
    });
    return sessionId;
};

const toPublicQuestion = (question, includeAnswers = false) => {
    const { answer, explanation, ...publicQuestion } = question;
    return includeAnswers ? { ...publicQuestion, answer, explanation } : publicQuestion;
};

const getAptitudeTest = async (req, res) => {
    try {
        const student = await getStudent(req.user?.email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const rows = await DatabaseService.getSheetData('Aptitude_Questions!A:K');
        const levels = { 1: [], 2: [], 3: [] };

        for (let i = 1; i < rows.length; i++) {
            if (!isActive(rows[i][9])) continue;
            const levelStr = clean(rows[i][10] || 'Easy').toLowerCase();
            const level = levelStr === 'medium' || levelStr === '2' ? 2 : levelStr === 'hard' || levelStr === '3' ? 3 : 1;
            levels[level].push({
                id: `${clean(rows[i][0]) || 'Q'}-${level}-${i}`,
                category: rows[i][1] || 'General', question: rows[i][2] || '',
                options: { A: rows[i][3] || '', B: rows[i][4] || '', C: rows[i][5] || '', D: rows[i][6] || '' },
                answer: clean(rows[i][7] || 'A'), explanation: clean(rows[i][8]),
            });
        }

        for (let level = 1; level <= 3; level++) levels[level] = levels[level].sort(() => Math.random() - 0.5);
        const sessionId = createSession({ email: student.email, type: 'aptitude', testNum: 0, levels, maxDurationSeconds: 20 * 60 });
        const publicLevels = Object.fromEntries(Object.entries(levels).map(([level, questions]) => [level, questions.map((question) => toPublicQuestion(question))]));
        return res.status(200).json({ success: true, sessionId, levels: publicLevels, timeLimits: { 1: 10, 2: 15, 3: 20 } });
    } catch (error) {
        console.error('Aptitude start error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to load aptitude engine.' });
    }
};

const saveAptitudeResult = async (req, res) => {
    try {
        const sessionId = clean(req.body.sessionId);
        const session = examSessions.get(sessionId);
        if (!session || session.type !== 'aptitude') return res.status(400).json({ success: false, message: 'This test session has expired. Start a new test.' });
        if (session.email !== clean(req.user?.email).toLowerCase()) return res.status(403).json({ success: false, message: 'This test session belongs to another account.' });

        const student = await getStudent(req.user.email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const finalLevel = Number(req.body.finalLevel);
        const questions = session.levels[finalLevel];
        if (![1, 2, 3].includes(finalLevel) || !questions) return res.status(400).json({ success: false, message: 'Invalid test level.' });
        const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
        const correctCount = questions.reduce((count, question) => count + (clean(answers[question.id]).toUpperCase() === clean(question.answer).toUpperCase() ? 1 : 0), 0);
        const score = correctCount * 2;
        const totalQuestions = questions.length;
        const percentage = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const elapsed = Math.max(0, Math.min(session.maxDurationSeconds, Math.floor((Date.now() - session.createdAt) / 1000)));
        const timeTaken = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

        await DatabaseService.appendRow('Aptitude_Results!A:J', [
            timestamp, student.rollNo, student.name, student.email, student.branch,
            String(score), String(totalQuestions), `${percentage}%`, timeTaken,
            `Reached Level ${finalLevel} (${finalLevel === 1 ? 'Easy' : finalLevel === 2 ? 'Medium' : 'Hard'})`,
        ]);
        examSessions.delete(sessionId);
        return res.status(200).json({ success: true, message: 'Score registered.', score, correctCount, totalQuestions, percentage, timeTaken });
    } catch (error) {
        console.error('Aptitude submit error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to save score.' });
    }
};

const getLeaderboard = async (req, res) => {
    try {
        const rows = await DatabaseService.getSheetData('Aptitude_Results!A:J');
        const studentData = {};
        for (let i = 1; i < rows.length; i++) {
            const email = clean(rows[i][3] || rows[i][2] || `Unknown-${i}`).toLowerCase();
            const score = parseInt(rows[i][5], 10) || 0;
            const timeMatch = clean(rows[i][8] || '0m 0s').match(/(\d+)m\s*(\d+)s/);
            const timeSeconds = timeMatch ? (parseInt(timeMatch[1], 10) * 60) + parseInt(timeMatch[2], 10) : 9999;
            if (!studentData[email]) studentData[email] = { name: rows[i][2] || 'Student', branch: rows[i][4] || 'Unknown', totalScore: 0, totalTimeSeconds: 0, attempts: 0 };
            studentData[email].totalScore += score;
            studentData[email].totalTimeSeconds += timeSeconds;
            studentData[email].attempts += 1;
        }
        const leaderboard = Object.values(studentData).map((student) => ({
            name: student.name, branch: student.branch,
            score: Math.round(student.totalScore / student.attempts),
            levelReached: `${student.attempts} Mode(s) Played`,
            timeSeconds: Math.round(student.totalTimeSeconds / student.attempts),
        })).sort((a, b) => b.score - a.score || a.timeSeconds - b.timeSeconds);
        return res.status(200).json({ success: true, leaderboard: leaderboard.slice(0, 10) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch leaderboard.' });
    }
};

const getTestHistory = async (req, res) => {
    try {
        const email = clean(req.user?.email).toLowerCase();
        const [aptRows, talRows, techRows] = await Promise.all([
            DatabaseService.getSheetData('Aptitude_Results!A:J').catch(() => []),
            DatabaseService.getSheetData('Talentino_Results!A:J').catch(() => []),
            DatabaseService.getSheetData('Tech_Results!A:J').catch(() => []),
        ]);
        const history = [];
        const parseRows = (rows, type) => {
            for (let i = rows.length - 1; i >= 1; i--) {
                if (clean(rows[i][3]).toLowerCase() !== email) continue;
                if (type === 'aptitude') history.push({ date: rows[i][0], score: rows[i][5], percentage: rows[i][7], timeTaken: rows[i][8], levelReached: rows[i][9], type });
                else history.push({ date: rows[i][0], levelReached: rows[i][5], score: rows[i][6], percentage: rows[i][8], timeTaken: rows[i][9], type });
            }
        };
        parseRows(aptRows, 'aptitude');
        parseRows(talRows, 'talentino');
        parseRows(techRows, 'technical');
        return res.status(200).json({ success: true, history });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch test history.' });
    }
};

const getSpecificTest = async (req, res) => {
    try {
        const type = clean(req.body.type).toLowerCase();
        if (!['talentino', 'technical'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid assessment type.' });
        const student = await getStudent(req.user?.email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const parsedTestNum = Number(req.body.testNum) || 1;
        if (type === 'talentino' && ![1, 2, 3].includes(parsedTestNum)) return res.status(400).json({ success: false, message: 'Invalid Talentino test.' });
        if (type === 'technical' && !isEnabled(student.techExamAccess)) return res.status(403).json({ success: false, message: 'Technical exam access has not been enabled for your account.' });

        const [rows, history, courseRows] = await Promise.all([
            DatabaseService.getSheetData(type === 'talentino' ? 'Talentino_Questions!A:K' : 'Tech_Questions!A:K'),
            type === 'talentino' ? DatabaseService.getSheetData('Talentino_Results!A:J') : DatabaseService.getSheetData('Tech_Results!A:J'),
            type === 'technical' ? DatabaseService.getSheetData('Courses!A:B', process.env.SPREADSHEET_ID, 300) : Promise.resolve([]),
        ]);
        const isReview = req.body.isReview === true;
        const hasCompleted = history.slice(1).some((row) => clean(row[3]).toLowerCase() === student.email.toLowerCase()
            && clean(row[5]).toLowerCase() === (type === 'talentino' ? `Test ${parsedTestNum}`.toLowerCase() : student.course.toLowerCase()));
        if (isReview && !hasCompleted) return res.status(403).json({ success: false, message: 'Complete this assessment before opening its answer review.' });

        if (!isReview && type === 'talentino' && parsedTestNum > 1) {
            const previousTest = `Test ${parsedTestNum - 1}`.toLowerCase();
            const previousCompleted = history.slice(1).some((row) => clean(row[3]).toLowerCase() === student.email.toLowerCase() && clean(row[5]).toLowerCase() === previousTest);
            if (!previousCompleted) return res.status(403).json({ success: false, message: `Complete Test ${parsedTestNum - 1} before unlocking this test.` });
        }

        const courseAccess = type === 'technical' ? getCourseAccess(student.course, courseRows) : new Set();
        const questions = [];
        for (let i = 1; i < rows.length; i++) {
            if (!isActive(rows[i][9])) continue;
            const matches = type === 'talentino'
                ? (parseInt(rows[i][1], 10) || 1) === parsedTestNum
                : courseMatchesAccess(rows[i][1], courseAccess);
            if (!matches) continue;
            questions.push({
                id: `${clean(rows[i][0]) || 'Q'}-${parsedTestNum}-${i}`,
                category: type === 'talentino' ? `Test ${parsedTestNum}` : student.course,
                question: rows[i][2] || '',
                options: { A: rows[i][3] || '', B: rows[i][4] || '', C: rows[i][5] || '', D: rows[i][6] || '' },
                answer: clean(rows[i][7] || 'A'), explanation: clean(rows[i][8]),
            });
        }
        if (!questions.length) return res.status(404).json({ success: false, message: 'No questions are configured for this assessment.' });
        const shuffled = questions.sort(() => Math.random() - 0.5);
        const levels = { [parsedTestNum]: shuffled };
        const sessionId = isReview ? undefined : createSession({
            email: student.email, type, testNum: parsedTestNum, course: student.course,
            levels, maxDurationSeconds: (type === 'technical' ? 45 : 20) * 60,
        });
        const publicLevels = { [parsedTestNum]: shuffled.map((question) => toPublicQuestion(question, isReview)) };
        return res.status(200).json({
            success: true, ...(sessionId ? { sessionId } : {}), levels: publicLevels,
            timeLimits: { [parsedTestNum]: type === 'technical' ? 45 : 20 },
        });
    } catch (error) {
        console.error('Specific test start error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to load exam engine.' });
    }
};

const submitSpecificTest = async (req, res) => {
    try {
        const sessionId = clean(req.body.sessionId);
        const session = examSessions.get(sessionId);
        if (!session || !['talentino', 'technical'].includes(session.type)) return res.status(400).json({ success: false, message: 'This test session has expired. Start a new test.' });
        if (session.email !== clean(req.user?.email).toLowerCase()) return res.status(403).json({ success: false, message: 'This test session belongs to another account.' });
        const student = await getStudent(req.user.email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        if (session.type === 'technical' && !isEnabled(student.techExamAccess)) return res.status(403).json({ success: false, message: 'Technical exam access has not been enabled for your account.' });

        const questions = session.levels[session.testNum] || [];
        const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
        const correctCount = questions.reduce((count, question) => count + (clean(answers[question.id]).toUpperCase() === clean(question.answer).toUpperCase() ? 1 : 0), 0);
        const totalQuestions = questions.length;
        const percentage = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const elapsed = Math.max(0, Math.min(session.maxDurationSeconds, Math.floor((Date.now() - session.createdAt) / 1000)));
        const timeTaken = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const specificCol = session.type === 'talentino' ? `Test ${session.testNum}` : student.course;
        const sheetName = session.type === 'talentino' ? 'Talentino_Results!A:J' : 'Tech_Results!A:J';
        await DatabaseService.appendRow(sheetName, [
            timestamp, student.rollNo, student.name, student.email, student.branch, specificCol,
            String(correctCount), String(totalQuestions), `${percentage}%`, timeTaken,
        ]);
        examSessions.delete(sessionId);
        return res.status(200).json({ success: true, message: 'Score registered.', score: correctCount, correctCount, totalQuestions, percentage, timeTaken });
    } catch (error) {
        console.error('Specific test submit error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to save score.' });
    }
};

module.exports = { getAptitudeTest, submitAptitudeTest: saveAptitudeResult, getTestHistory, getLeaderboard, getSpecificTest, submitSpecificTest };
