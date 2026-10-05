const DatabaseService = require('../services/dbService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const AuthSessionService = require('../services/authSessionService');

const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const RESET_SHEET = 'Password_Reset_Tokens';
const RESET_HEADERS = ['Token Hash', 'Email', 'Expires At', 'Status', 'Created At'];
const activeResetTokens = new Set();
let resetSheetSetupPromise = null;

const ensureResetSheet = async () => {
    if (!resetSheetSetupPromise) {
        resetSheetSetupPromise = DatabaseService.ensureWorksheetWithHeaders(RESET_SHEET, RESET_HEADERS)
            .catch((error) => {
                resetSheetSetupPromise = null;
                throw error;
            });
    }
    return resetSheetSetupPromise;
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const findStudentByEmail = (rows, email) => {
    const wanted = String(email || '').trim().toLowerCase();
    for (let index = (rows || []).length - 1; index >= 1; index--) {
        const row = rows[index] || [];
        if (String(row[2] || '').trim().toLowerCase() === wanted) {
            return { email: String(row[2]).trim(), name: String(row[0] || 'Student').trim(), rowNumber: index + 1 };
        }
    }
    return null;
};

const buildResetEmail = ({ name, resetLink, includeLogo }) => {
    const safeName = escapeHtml(name || 'Student');
    const logo = includeLogo
        ? '<img src="cid:ipcs-global-logo" width="138" alt="IPCS Global" style="display:block;width:138px;max-width:100%;height:auto;border:0;margin:0 auto 22px">'
        : '<div style="font-size:17px;letter-spacing:5px;font-weight:800;color:#f3f7ff;text-align:center;margin:0 0 22px">IPCS <span style="color:#35bdf2">GLOBAL</span></div>';

    return {
        subject: 'Your secure Talenzo password reset link',
        text: `Hello ${name || 'Student'},\n\nWe received a request to reset your IPCS Global student portal password. Use this one-time link within 5 minutes:\n${resetLink}\n\nFor your security, the link works once and resetting your password signs out other active sessions. If you did not request this, ignore this email; your password will not change.`,
        html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"></head><body style="margin:0;padding:32px 12px;background:#07111f;font-family:Arial,Helvetica,sans-serif;color:#f3f7ff">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your one-time IPCS Global password reset link expires in 5 minutes.</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#101b2b;border:1px solid #26384d;border-radius:20px;overflow:hidden">
              <tr><td style="padding:30px 38px 8px;text-align:center">${logo}<div style="display:inline-block;padding:7px 12px;border:1px solid #16445a;border-radius:99px;background:#102638;color:#54cafa;font-size:10px;font-weight:bold;letter-spacing:1.5px">STUDENT PORTAL SECURITY</div></td></tr>
              <tr><td style="padding:18px 38px 0"><div style="height:2px;background:#1e3247;font-size:0;line-height:0"><div style="width:34%;height:2px;background:#28b8ed;font-size:0;line-height:0">&nbsp;</div></div></td></tr>
              <tr><td style="padding:30px 38px 0"><div style="font-size:12px;font-weight:bold;letter-spacing:1.4px;color:#3ac5f4;text-transform:uppercase">Account recovery</div><h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2;color:#f6f9ff">Reset your password</h1><p style="margin:0;color:#b2c0d2;font-size:15px;line-height:1.7">Hello ${safeName}, we received a request to reset the password for your IPCS Global student account.</p></td></tr>
              <tr><td style="padding:24px 38px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b1523;border:1px solid #26384d;border-radius:14px"><tr><td style="padding:18px 20px"><div style="font-size:13px;line-height:1.65;color:#c0ccda">Use this secure, one-time link to choose a new password. It expires in <strong style="color:#f3f7ff">5 minutes</strong>.</div><div style="margin-top:18px"><a href="${resetLink}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#079b73;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Reset my password&nbsp; &#8594;</a></div><div style="margin-top:14px;color:#8293a8;font-size:11px;line-height:1.5">For your protection, this link can only be used once.</div></td></tr></table></td></tr>
              <tr><td style="padding:22px 38px 0"><p style="margin:0 0 8px;color:#8293a8;font-size:12px;line-height:1.6">If the button does not open, copy this link into your browser:</p><p style="margin:0;padding:12px;background:#0b1523;border:1px solid #26384d;border-radius:9px;color:#55c9f5;font-size:11px;line-height:1.6;word-break:break-all"><a href="${resetLink}" style="color:#55c9f5;text-decoration:none">${resetLink}</a></p></td></tr>
              <tr><td style="padding:20px 38px 0"><p style="margin:0;color:#9cabc0;font-size:12px;line-height:1.7"><strong style="color:#d9e2ef">Wasn’t you?</strong> Ignore this email. Your password will stay unchanged. After a successful reset, active sessions on your other devices will be signed out.</p></td></tr>
              <tr><td style="padding:28px 38px 30px"><div style="height:1px;background:#26384d;font-size:0;line-height:0">&nbsp;</div><p style="margin:16px 0 0;color:#74869c;font-size:11px;line-height:1.6;text-align:center">IPCS Global · Talenzo Student Portal<br>This is an automated account security email.</p></td></tr>
            </table>
          </td></tr></table>
        </body></html>`,
    };
};

const sendResetEmailThroughAppsScript = async ({ recipient, name, emailContent, logoBase64 }) => {
    const sharedSecret = String(process.env.APPS_SCRIPT_MAIL_SECRET || '').trim();
    const endpointUrls = [...new Set([
        process.env.APPS_SCRIPT_MAIL_URL,
        process.env.APPS_SCRIPT_MAIL_FALLBACK_URL,
    ].map((url) => String(url || '').trim()).filter(Boolean))];
    if (!sharedSecret || endpointUrls.length === 0) {
        throw new Error('Apps Script mail gateway is not configured.');
    }

    const signedFields = {
        version: 1,
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        to: recipient,
        name: name || 'Student',
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        logoBase64: logoBase64 || '',
    };
    const canonicalPayload = JSON.stringify({
        version: signedFields.version,
        requestId: signedFields.requestId,
        timestamp: signedFields.timestamp,
        to: signedFields.to,
        name: signedFields.name,
        subject: signedFields.subject,
        text: signedFields.text,
        html: signedFields.html,
        logoBase64: signedFields.logoBase64 || '',
    });
    const payload = {
        ...signedFields,
        signature: crypto.createHmac('sha256', sharedSecret).update(canonicalPayload, 'utf8').digest('base64'),
    };

    let lastError = null;
    for (let index = 0; index < endpointUrls.length; index += 1) {
        try {
            const response = await axios.post(endpointUrls[index], payload, {
                timeout: 30000,
                maxRedirects: 5,
                headers: { 'Content-Type': 'application/json' },
            });
            if (response.data?.success === true) return response.data;
            const gatewayError = new Error(response.data?.message || 'Apps Script mail gateway rejected the request.');
            gatewayError.gatewayCode = response.data?.code;
            throw gatewayError;
        } catch (error) {
            lastError = error;
            console.error('Password reset Apps Script endpoint failed:', {
                endpointNumber: index + 1,
                gatewayCode: error.gatewayCode || error.response?.data?.code,
                code: error.code,
                status: error.response?.status,
                message: error.message,
            });
        }
    }
    throw new Error(`All configured Apps Script mail endpoints failed: ${lastError?.message || 'unknown error'}`);
};

const sendResetEmailThroughNodemailer = async ({ recipient, emailContent }) => {
    const user = String(process.env.EMAIL_USER || '').trim();
    const password = String(process.env.EMAIL_PASS || '').replace(/\s/g, '');
    if (!user || !password) throw new Error('Nodemailer SMTP is not configured.');

    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || (host ? 587 : 465));
    const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
    const transportOptions = {
        auth: { user, pass: password },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    };
    if (host) Object.assign(transportOptions, { host, port, secure });
    else Object.assign(transportOptions, { service: 'gmail' });

    const transporter = nodemailer.createTransport(transportOptions);
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || user,
        to: recipient,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        attachments: emailContent.logoPath ? [{
            filename: 'ipcs-global-logo.png',
            path: emailContent.logoPath,
            cid: 'ipcs-global-logo',
        }] : [],
    });
};

const deliverPasswordResetEmail = async ({ recipient, name, emailContent, logoBase64 }) => {
    const errors = [];
    const scriptUrl = String(process.env.APPS_SCRIPT_MAIL_URL || '').trim();
    const scriptFallbackUrl = String(process.env.APPS_SCRIPT_MAIL_FALLBACK_URL || '').trim();
    const scriptSecret = String(process.env.APPS_SCRIPT_MAIL_SECRET || '').trim();
    const hasAppsScriptSettings = Boolean(scriptUrl || scriptFallbackUrl || scriptSecret);
    const hasSmtpSettings = Boolean(String(process.env.EMAIL_USER || '').trim() && String(process.env.EMAIL_PASS || '').trim());

    if (hasAppsScriptSettings) {
        try {
            await sendResetEmailThroughAppsScript({ recipient, name, emailContent, logoBase64 });
            console.info('Password reset email delivered with Google Apps Script.');
            return 'apps-script';
        } catch (error) {
            errors.push(`Apps Script: ${error.message}`);
            console.error('Apps Script reset-email delivery failed; trying Nodemailer fallback:', error.message);
        }
    }

    if (hasSmtpSettings) {
        try {
            await sendResetEmailThroughNodemailer({ recipient, emailContent });
            console.info('Password reset email delivered with Nodemailer SMTP.');
            return 'nodemailer';
        } catch (error) {
            errors.push(`Nodemailer SMTP: ${error.message}`);
            console.error('Nodemailer reset-email delivery failed:', {
                code: error.code,
                command: error.command,
                responseCode: error.responseCode,
                message: error.message,
            });
        }
    }

    if (errors.length === 0) {
        throw new Error('No reset-email provider is fully configured. Set Apps Script settings or EMAIL_USER and EMAIL_PASS for Nodemailer.');
    }
    throw new Error(`All configured password-reset email providers failed. ${errors.join(' | ')}`);
};

const requestPasswordReset = async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Enter a valid student email address.' });
        }

        const studentRows = await DatabaseService.getSheetData('Data!B:D', process.env.SPREADSHEET_ID, 0);
        const student = findStudentByEmail(studentRows, email);
        if (!student) return res.status(404).json({ success: false, code: 'ACCOUNT_NOT_FOUND', message: 'Student account not found. Check the email address registered with IPCS Global.' });
        const hasAppsScriptUrl = Boolean(String(process.env.APPS_SCRIPT_MAIL_URL || '').trim() || String(process.env.APPS_SCRIPT_MAIL_FALLBACK_URL || '').trim());
        const hasAppsScriptSecret = Boolean(String(process.env.APPS_SCRIPT_MAIL_SECRET || '').trim());
        const hasSmtpSettings = Boolean(String(process.env.EMAIL_USER || '').trim() && String(process.env.EMAIL_PASS || '').trim());
        if (!(hasAppsScriptUrl && hasAppsScriptSecret) && !hasSmtpSettings) {
            return res.status(503).json({ success: false, message: 'Password reset email is not configured. Please contact your portal administrator.' });
        }

        // Session tracking is only required when the password actually changes.
        // Avoid its extra Sheets reads/appends during the account lookup request.
        await ensureResetSheet();
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + RESET_TOKEN_TTL_MS);
        const tokenAppendRange = await DatabaseService.appendRowRaw(`${RESET_SHEET}!A:E`, [tokenHash, email, expiresAt.toISOString(), 'PENDING', createdAt.toISOString()]);
        const tokenRowNumber = Number(String(tokenAppendRange).match(/!A(\d+):E\d+$/)?.[1]);

        const baseUrl = String(process.env.RESET_PASSWORD_BASE_URL || process.env.FRONTEND_URL || 'https://ipcstalenzo.com')
            .split(',')[0].trim().replace(/\/+$/, '');
        const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const logoPath = path.resolve(__dirname, '../../frontend/src/assets/ipcs-global-logo.png');
        const includeLogo = fs.existsSync(logoPath);
        const logoBase64 = includeLogo ? fs.readFileSync(logoPath).toString('base64') : '';
        const emailContent = { ...buildResetEmail({ name: student.name, resetLink, includeLogo }), logoPath: includeLogo ? logoPath : '' };

        try {
            await deliverPasswordResetEmail({
                recipient: student.email,
                name: student.name,
                emailContent,
                logoBase64,
            });
        } catch (mailError) {
            console.error('Password reset email failed through all configured providers:', mailError.message);
            try {
                if (Number.isInteger(tokenRowNumber) && tokenRowNumber > 1) {
                    await DatabaseService.updateRow(`${RESET_SHEET}!D${tokenRowNumber}`, ['FAILED']);
                }
            } catch (statusError) {
                console.error('Could not mark failed password reset email:', statusError.message);
            }
            return res.status(503).json({ success: false, message: 'The reset email could not be sent right now. Please try again later.' });
        }

        return res.status(200).json({ success: true, message: 'A password reset link has been sent to your registered email. It expires in 5 minutes.' });
    } catch (error) {
        console.error('Password reset request failed:', { code: error.code, message: error.message });
        return res.status(503).json({ success: false, message: 'We could not start the password reset. Please try again shortly.' });
    }
};

const resetPassword = async (req, res) => {
    const token = String(req.body?.token || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '');
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
    if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
        return res.status(400).json({ success: false, message: 'Choose a password that is at least 8 characters and no more than 72 bytes.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (activeResetTokens.has(tokenHash)) return res.status(409).json({ success: false, message: 'This reset link is already being used. Please wait a moment.' });
    activeResetTokens.add(tokenHash);
    try {
        await ensureResetSheet();
        const resetRows = await DatabaseService.getSheetData(`${RESET_SHEET}!A:E`, process.env.SPREADSHEET_ID, 0);
        let latestRecord = null;
        for (let index = resetRows.length - 1; index >= 1; index--) {
            const row = resetRows[index] || [];
            if (String(row[0] || '') === tokenHash) {
                latestRecord = { row, rowNumber: index + 1 };
                break;
            }
        }
        if (!latestRecord) return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
        const email = String(latestRecord.row[1] || '').trim().toLowerCase();
        let latestForEmailRowNumber = -1;
        for (let index = resetRows.length - 1; index >= 1; index--) {
            if (String(resetRows[index]?.[1] || '').trim().toLowerCase() === email) {
                latestForEmailRowNumber = index + 1;
                break;
            }
        }
        const expiresAt = Date.parse(latestRecord.row[2] || '');
        if (latestForEmailRowNumber !== latestRecord.rowNumber || String(latestRecord.row[3] || '').toUpperCase() !== 'PENDING' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired. Request a new link and try again.' });
        }

        const studentRows = await DatabaseService.getSheetData('Data!B:D', process.env.SPREADSHEET_ID, 0);
        const student = findStudentByEmail(studentRows, email);
        if (!student) return res.status(404).json({ success: false, code: 'ACCOUNT_NOT_FOUND', message: 'Student account not found.' });

        const session = await AuthSessionService.ensureSessionRecord(email);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        const nextSessionVersion = crypto.randomBytes(16).toString('hex');
        const now = new Date().toISOString();
        const tokenStatusUpdates = resetRows.reduce((updates, row, index) => {
            if (index > 0 && String(row?.[1] || '').trim().toLowerCase() === email && String(row?.[3] || '').toUpperCase() === 'PENDING') {
                updates.push({ range: `${RESET_SHEET}!D${index + 1}`, values: [['USED']] });
            }
            return updates;
        }, []);

        await DatabaseService.updateRanges([
            { range: `Data!E${student.rowNumber}`, values: [[hashedPassword]] },
            { range: `Auth_Sessions!B${session.rowIndex}:C${session.rowIndex}`, values: [[nextSessionVersion, now]] },
            ...tokenStatusUpdates,
        ]);
        return res.status(200).json({ success: true, message: 'Password updated. Please sign in again; active sessions on your other devices have been signed out.' });
    } catch (error) {
        console.error('Password reset failed:', error.message);
        return res.status(503).json({ success: false, message: 'We could not reset the password right now. Request a new link or try again shortly.' });
    } finally {
        activeResetTokens.delete(tokenHash);
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

        // Fetch data using our new Database Service
        const rows = await DatabaseService.getSheetData('Data!A:AG', process.env.SPREADSHEET_ID, 0);
        let userObj = null;

        for (let i = rows.length - 1; i > 0; i--) {
            const row = rows[i];
            if (row[3] && row[3].toString().trim().toLowerCase() === email.toString().trim().toLowerCase()) {
                let isMatch = false;
                
                // Check password (supports both plain text for old data and bcrypt for new data)
                if (row[4] === password) {
                    isMatch = true;
                } else { 
                    try { isMatch = await bcrypt.compare(password, row[4]); } catch(e) {} 
                }

                if (isMatch) {
                    userObj = {
                        name: row[1] || "Student", phone: row[2] || "N/A", email: row[3], rollNo: row[5] || "N/A",
                        joiningDate: row[6] || "N/A", course: row[7] || "N/A", branch: row[8] || "Bangalore",
                        photo: row[9] || "", homeTown: row[10] || "N/A", qualification: row[11] || "N/A",
                        stream: row[12] || "N/A", fresherStatus: row[13] || "N/A", linkedin: row[14] || "N/A",
                        instagram: row[15] || "N/A", placementReq: row[16] || "N/A", friend1Name: row[17] || "N/A",
                        friend1Phone: row[18] || "N/A", friend2Name: row[19] || "N/A", friend2Phone: row[20] || "N/A",
                        resume: row[21] || "N/A", parentName: row[22] || "N/A", parentContact: row[23] || "N/A",
                        studyStatus: row[24] || "Currently Studying", completedDate: row[25] || "N/A", age: row[26] || "N/A",
                        gender: row[27] || "N/A", certificate: row[28] || "N/A", vacancyOpen: row[29] || "", techExamAccess: row[32] || "No"
                    };
                    break; 
                }
            }
        }

        if (!userObj) return res.status(404).json({ success: false, message: "Account not found or incorrect password." });
        
        const sessionVersion = await AuthSessionService.getSessionVersion(userObj.email, 0);
        const token = jwt.sign(
            { email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch, sv: sessionVersion },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        return res.status(200).json({ success: true, message: "Login successful!", token, user: userObj });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error during login." }); 
    }
};

const registerUser = async (req, res) => {
    try {
        const formData = req.body;
        if (!formData?.email || !formData?.password) return res.status(400).json({ success: false, message: "Email and password are required." });

        const rows = await DatabaseService.getSheetData("Data!A:AG");
        const headers = rows[0] || [];
        const cleanEmail = formData.email.toString().trim().toLowerCase();

        // Check if user already exists
        for (let i = rows.length - 1; i >= 1; i--) {
            const existingEmail = DatabaseService.getVal(rows[i], headers, ["email", "mail"], 3, "");
            if (existingEmail && existingEmail.toLowerCase() === cleanEmail) {
                return res.status(400).json({ success: false, message: "An account with this email already exists." });
            }
        }

        let photoUrl = "";
        // Isolate Apps Script photo upload
        if (formData.photoBase64) {
             try {
                 const response = await axios.post(process.env.APPS_SCRIPT_PHOTO_URL, {
                     action: "uploadOnly", 
                     base64: formData.photoBase64.replace(/^data:image\/\w+;base64,/, ""), 
                     filename: `${formData.rollNo || 'Profile'}_Profile.jpg`, 
                     folderName: "Profile Photo", 
                     mimeType: "image/jpeg",
                     folderId: process.env.DRIVE_FOLDER_ID,
                     parentFolderId: process.env.DRIVE_FOLDER_ID
                 }, { timeout: 30000 });
                 
                 if (response.data && response.data.success) {
                     photoUrl = response.data.url;
                 }
             } catch(e) {
                 console.error("Photo upload error:", e.message);
             }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(formData.password, salt);

        const newRow = [
            new Date().toLocaleString('en-GB'), String(formData.name || "N/A"), String(formData.phone || "N/A"), String(formData.email || "").trim(),           
            String(hashedPassword), String(formData.rollNo || "N/A"), String(formData.joiningDate || "N/A"), String(formData.course || "N/A"),              
            String(formData.branch || "Bangalore"), String(photoUrl || ""), String(formData.homeTown || "N/A"), String(formData.qualification || "N/A"),       
            String(formData.stream || "N/A"), String(formData.fresherStatus || "N/A"), String(formData.linkedin || "N/A"), String(formData.instagram || "N/A"),           
            String(formData.placementReq || "N/A"), String(formData.friend1Name || "N/A"), String(formData.friend1Phone || "N/A"), String(formData.friend2Name || "N/A"),         
            String(formData.friend2Phone || "N/A"), "N/A", String(formData.parentName || "N/A"), String(formData.parentContact || "N/A"),       
            "Currently Studying", "N/A", String(formData.age || "N/A"), String(formData.gender || "N/A"), "N/A", "", "", "Pending"                                          
        ];

        // Append to Database
        await DatabaseService.appendRow("Data!A:AG", newRow);

        const token = jwt.sign({ email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "Bangalore", sv: '0' }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const userObj = { name: formData.name || "Student", email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "Bangalore", course: formData.course || "N/A", photo: photoUrl || "", vacancyOpen: "" };

        return res.status(200).json({ success: true, message: "Account created!", token, userObj });
    } catch (error) { 
        return res.status(500).json({ success: false, message: error.message || "Server error during registration." }); 
    }
};

const getCourses = async (req, res) => {
    try {
        const rows = await DatabaseService.getSheetData("Courses!A:B");
        let groupedCourses = [];
        let currentCategory = "General";
        
        for (let i = 0; i < rows.length; i++) {
            const colA = rows[i][0] ? rows[i][0].toString().trim() : "";
            const colB = rows[i][1] ? rows[i][1].toString().trim() : "";
            if (colA !== "") {
                currentCategory = colA.replace(/^\d+\.\s*/, '').trim();
                groupedCourses.push({ category: currentCategory, courses: [] });
            } else if (colB !== "" && groupedCourses.length > 0) {
                groupedCourses[groupedCourses.length - 1].courses.push(colB);
            }
        }
        return res.status(200).json({ success: true, groupedCourses });
    } catch (error) { 
        console.error("🔍 ERROR FETCHING COURSES:", error.message); // <--- ADD THIS
        return res.status(500).json({ success: false, message: "Server error fetching courses." }); 
    }
};

const getBranches = async (req, res) => {
    try {
        const rows = await DatabaseService.getSheetData("Branches!B:C");
        let groupedBranches = [];
        
        for (let i = 1; i < rows.length; i++) {
            const region = rows[i][0] ? rows[i][0].toString().trim() : "";
            const branchName = rows[i][1] ? rows[i][1].toString().trim() : "";
            if (region !== "") {
                let regionObj = groupedBranches.find(g => g.region === region);
                if (!regionObj) {
                    regionObj = { region: region, branches: [] };
                    groupedBranches.push(regionObj);
                }
                if (branchName !== "") regionObj.branches.push(branchName);
            }
        }
        return res.status(200).json({ success: true, groupedBranches });
    } catch (error) { 
        console.error("🔍 ERROR FETCHING BRANCHES:", error.message); // <--- ADD THIS
        return res.status(500).json({ success: false, message: "Server error fetching branches." }); 
    }
};

module.exports = { loginUser, registerUser, requestPasswordReset, resetPassword, getCourses, getBranches };
