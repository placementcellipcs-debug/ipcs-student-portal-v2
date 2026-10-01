const jwt = require('jsonwebtoken');
const AuthSessionService = require('../services/authSessionService');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ success: false, message: "Access Denied. No token provided." });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.status(403).json({ success: false, message: "Invalid or expired token. Please log in again." });

        try {
            const email = String(user?.email || '').trim().toLowerCase();
            if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
            const currentVersion = await AuthSessionService.getSessionVersion(email);
            if (String(user.sv ?? '0') !== currentVersion) {
                return res.status(401).json({ success: false, code: 'SESSION_REVOKED', message: 'Your password was reset, so this session has been signed out. Please sign in again.' });
            }

            req.user = user;
            next();
        } catch (error) {
            console.error('Session version check failed:', error.message);
            return res.status(503).json({ success: false, message: 'We could not verify your session right now. Please try again shortly.' });
        }
    });
};

module.exports = authenticateToken;
