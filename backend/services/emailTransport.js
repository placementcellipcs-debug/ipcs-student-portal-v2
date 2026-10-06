const nodemailer = require('nodemailer');

const getEmailCredentials = () => {
    const user = String(process.env.EMAIL_USER || '').trim();
    const pass = String(process.env.EMAIL_PASS || '').replace(/\s/g, '');
    if (!user || !pass) {
        throw new Error('Email is not configured. Set EMAIL_USER and EMAIL_PASS in the hosting environment.');
    }
    return { user, pass };
};

const createEmailTransport = () => {
    const auth = getEmailCredentials();
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || (host ? 587 : 465));
    const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
    const options = {
        auth,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    };

    if (host) Object.assign(options, { host, port, secure });
    else Object.assign(options, { service: 'gmail' });

    return nodemailer.createTransport(options);
};

const getEmailFrom = () => String(process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();

module.exports = { createEmailTransport, getEmailFrom };
