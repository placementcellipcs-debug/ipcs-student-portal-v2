const express = require('express');
const router = express.Router();
const { registerUser, loginUser, requestPasswordReset, resetPassword, getCourses, getBranches } = require('../controllers/authController');
const { forgotPasswordRateLimit } = require('../middleware/passwordResetRateLimit');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPasswordRateLimit, requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/courses', getCourses);
router.get('/branches', getBranches);

module.exports = router;
