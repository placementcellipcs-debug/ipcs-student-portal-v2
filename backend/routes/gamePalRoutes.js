const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory, getFriendChallenges, createFriendChallenge, submitFriendChallengeScore } = require('../controllers/gamePalController');

router.post('/dashboard', authenticateToken, getGamePalDashboard);
router.post('/session', authenticateToken, submitGameSession);
router.get('/leaderboard', authenticateToken, getGamePalLeaderboard);
router.get('/history', authenticateToken, getGamePalHistory);
router.get('/friends', authenticateToken, getFriendChallenges);
router.post('/friends', authenticateToken, createFriendChallenge);
router.post('/friends/:id/score', authenticateToken, submitFriendChallengeScore);

module.exports = router;
