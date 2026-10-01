const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const studentDiaryController = require('../controllers/studentDiaryController');
const leaveController = require('../controllers/leaveController');
const authenticateToken = require('../middleware/authMiddleware');

// Dashboard endpoints (Protected by JWT Token)
router.post('/data', authenticateToken, dashboardController.getDashboardData);
router.get('/drive-alerts', authenticateToken, dashboardController.getDriveAlerts);
router.get('/app-downloads', authenticateToken, dashboardController.getAppDownloads);
router.post('/app-downloads/:type/download-link', authenticateToken, dashboardController.createAppDownloadLink);
router.get('/app-downloads/file', dashboardController.streamAppDownload);
router.post('/attendance', authenticateToken, dashboardController.markAttendance);
router.get('/student-diary', authenticateToken, studentDiaryController.getStudentDiary);
router.post('/student-diary/attendance', authenticateToken, studentDiaryController.markStudentAttendance);
router.get('/leave', authenticateToken, leaveController.getLeaveRecords);
router.post('/leave', authenticateToken, leaveController.submitLeaveRequest);
router.post('/apply', authenticateToken, dashboardController.applyForJob);

// Event Registration Endpoint
router.post('/drive-response', authenticateToken, dashboardController.submitDriveResponse);

// Profile & Settings endpoints
router.post('/profile/update', authenticateToken, dashboardController.updateProfile);
router.post('/profile/document', authenticateToken, dashboardController.uploadDocument);
router.post('/profile/password', authenticateToken, dashboardController.updatePassword);

// Support
router.post('/support/issue', authenticateToken, dashboardController.submitIssue);

// NOTE: We will add Study Materials and Aptitude endpoints here in the next step!
// router.post('/study-materials', authenticateToken, getStudyMaterialsList);
// router.post('/aptitude/start', authenticateToken, getAptitudeTest);

// --- ADD THESE TWO LINES ---
const { getStudyMaterialsList, streamMaterialPdf } = require('../controllers/studyMaterialController');
const { getAptitudeTest, submitAptitudeTest, getTestHistory, getLeaderboard, getSpecificTest, submitSpecificTest } = require('../controllers/aptitudeController');

// ... (keep the dashboardController routes from before) ...

// --- ADD THESE ROUTES AT THE BOTTOM ---
// Study Materials
router.post('/study-materials', authenticateToken, getStudyMaterialsList);
router.post('/study-materials/stream', authenticateToken, streamMaterialPdf);

// Aptitude Assessment Endpoints
router.post('/aptitude/start', authenticateToken, getAptitudeTest);
router.post('/aptitude/submit', authenticateToken, submitAptitudeTest);
router.post('/aptitude/history', authenticateToken, getTestHistory);
router.get('/aptitude/leaderboard', getLeaderboard); // NO auth needed for global leaderboard

// Talentino & Technical Exam Endpoints
router.post('/exam/start', authenticateToken, getSpecificTest);
router.post('/exam/submit', authenticateToken, submitSpecificTest);

module.exports = router;
