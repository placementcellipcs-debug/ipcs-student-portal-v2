const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { getGamePalDashboard, submitGameSession, getGamePalLeaderboard, getGamePalHistory, getFriendChallenges, createFriendChallenge, submitFriendChallengeScore, getGroupRooms, createGroupRoom, joinGroupRoom, startGroupRoom, submitGroupRoomScore } = require('../controllers/gamePalController');

router.post('/dashboard', authenticateToken, getGamePalDashboard);
router.post('/session', authenticateToken, submitGameSession);
router.get('/leaderboard', authenticateToken, getGamePalLeaderboard);
router.get('/history', authenticateToken, getGamePalHistory);
router.get('/friends', authenticateToken, getFriendChallenges);
router.post('/friends', authenticateToken, createFriendChallenge);
router.post('/friends/:id/score', authenticateToken, submitFriendChallengeScore);
router.get('/rooms', authenticateToken, getGroupRooms);
router.post('/rooms', authenticateToken, createGroupRoom);
router.post('/rooms/:code/join', authenticateToken, joinGroupRoom);
router.post('/rooms/:code/start', authenticateToken, startGroupRoom);
router.post('/rooms/:code/score', authenticateToken, submitGroupRoomScore);

module.exports = router;
