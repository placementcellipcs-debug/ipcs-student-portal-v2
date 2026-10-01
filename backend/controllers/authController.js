const DatabaseService = require('../services/dbService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
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

const requestPasswordReset = async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Enter a valid student email address.' });
        }

        const studentRows = await DatabaseService.getSheetData('Data!B:D', process.env.SPREADSHEET_ID, 0);
        const student = findStudentByEmail(studentRows, email);
        if (!student) return res.status(404).json({ success: false, code: 'ACCOUNT_NOT_FOUND', message: 'Student account not found. Check the email address registered with IPCS Global.' });
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return res.status(503).json({ success: false, message: 'Password reset email is not configured. Please contact your portal administrator.' });
        }

        await Promise.all([ensureResetSheet(), AuthSessionService.ensureSessionRecord(email)]);
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + RESET_TOKEN_TTL_MS);
        await DatabaseService.appendRowRaw(`${RESET_SHEET}!A:E`, [tokenHash, email, expiresAt.toISOString(), 'PENDING', createdAt.toISOString()]);

        const baseUrl = String(process.env.RESET_PASSWORD_BASE_URL || process.env.FRONTEND_URL || 'https://placement.ipcsglobal.info')
            .split(',')[0].trim().replace(/\/+$/, '');
        const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const safeName = escapeHtml(student.name || 'Student');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });

        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: student.email,
                subject: 'Reset your Talenzo student portal password',
                text: `Hello ${student.name || 'Student'},\n\nUse this secure link to reset your Talenzo password. It expires in 5 minutes:\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Reset your Talenzo password</h2><p>Hello ${safeName},</p><p>Use the button below to choose a new password. This one-time link expires in <strong>5 minutes</strong>.</p><p><a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Reset password</a></p><p>If the button does not work, copy this link into your browser:</p><p style="word-break:break-all">${resetLink}</p><p>If you did not request this, you can ignore this email.</p></div>`,
            });
        } catch (mailError) {
            console.error('Password reset email failed:', mailError.message);
            const rows = await DatabaseService.getSheetData(`${RESET_SHEET}!A:E`, process.env.SPREADSHEET_ID, 0);
            const insertedIndex = rows.findIndex((row) => String(row[0] || '') === tokenHash);
            if (insertedIndex > 0) await DatabaseService.updateRow(`${RESET_SHEET}!D${insertedIndex + 1}`, ['FAILED']);
            return res.status(503).json({ success: false, message: 'The reset email could not be sent right now. Please try again later.' });
        }

        return res.status(200).json({ success: true, message: 'A password reset link has been sent to your registered email. It expires in 5 minutes.' });
    } catch (error) {
        console.error('Password reset request failed:', error.message);
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
