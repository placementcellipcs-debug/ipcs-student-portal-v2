const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const { getCareerHubFeed } = require('../controllers/careerHubController');

const router = express.Router();
router.get('/', authenticateToken, getCareerHubFeed);

module.exports = router;
