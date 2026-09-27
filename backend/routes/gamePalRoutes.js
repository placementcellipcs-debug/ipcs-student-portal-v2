const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory } = require('../controllers/gamePalController');

router.post('/dashboard', authenticateToken, getGamePalDashboard);
router.post('/session', authenticateToken, submitGameSession);
router.get('/leaderboard', authenticateToken, getGamePalLeaderboard);
router.get('/history', authenticateToken, getGamePalHistory);

module.exports = router;
