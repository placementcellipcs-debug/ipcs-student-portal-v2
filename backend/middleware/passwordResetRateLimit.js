const NodeCache = require('node-cache');

const requestCounts = new NodeCache({ stdTTL: 30 * 60, checkperiod: 60, useClones: false });

const consume = (key, limit) => {
    const count = Number(requestCounts.get(key) || 0);
    if (count >= limit) return false;
    requestCounts.set(key, count + 1);
    return true;
};

const forgotPasswordRateLimit = (req, res, next) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    if (!consume(`forgot-ip:${ip}`, 20) || (email && !consume(`forgot-email:${email}`, 5))) {
        return res.status(429).json({ success: false, message: 'Too many password reset requests. Please wait and try again.' });
    }
    next();
};

module.exports = { forgotPasswordRateLimit };
