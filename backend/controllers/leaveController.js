const DatabaseService = require('../services/dbService');

const SHEET_NAME = 'Leave_Applications';
const SHEET_RANGE = `${SHEET_NAME}!A:K`;
const HEADERS = ['Timestamp', 'Email', 'Name', 'Roll No', 'Branch', 'Course', 'Start Date', 'End Date', 'Type', 'Reason', 'Status'];
let worksheetSetupPromise;

const ensureLeaveSheet = () => {
    if (!worksheetSetupPromise) {
        worksheetSetupPromise = DatabaseService.ensureWorksheetWithHeaders(SHEET_NAME, HEADERS)
            .catch((error) => {
                worksheetSetupPromise = null;
                throw error;
            });
    }
    return worksheetSetupPromise;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isIsoDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const getStudent = (rows, email) => {
    for (let index = rows.length - 1; index >= 1; index--) {
        const row = rows[index];
        if (normalizeEmail(row?.[3]) === email) {
            return { name: row[1] || 'Student', email: row[3], rollNo: row[5] || '', course: row[7] || '', branch: row[8] || '' };
        }
    }
    return null;
};

const serializeRecord = (row) => ({
    timestamp: row[0] || '',
    startDate: row[6] || '',
    endDate: row[7] || '',
    type: row[8] || 'Leave Request',
    reason: row[9] || '',
    status: row[10] || 'Pending',
});

const getLeaveRecords = async (req, res) => {
    try {
        const email = normalizeEmail(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        await ensureLeaveSheet();
        const rows = await DatabaseService.getSheetData(SHEET_RANGE);
        const records = rows.slice(1)
            .filter((row) => normalizeEmail(row[1]) === email)
            .map(serializeRecord)
            .reverse();
        return res.json({ success: true, records });
    } catch (error) {
        console.error('Leave records read error:', error.message);
        return res.status(503).json({ success: false, message: 'Leave requests are unavailable right now.' });
    }
};

const submitLeaveRequest = async (req, res) => {
    try {
        const email = normalizeEmail(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });

        const startDate = String(req.body?.startDate || '').trim();
        const endDate = String(req.body?.endDate || '').trim();
        const type = String(req.body?.type || '').trim();
        const reason = String(req.body?.reason || '').trim();
        if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
            return res.status(400).json({ success: false, message: 'Choose a valid date or date range.' });
        }
        if (!['Leave Request', 'Absence Notice'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Choose whether you are requesting leave or reporting an absence.' });
        }
        if (reason.length < 10 || reason.length > 1000) {
            return res.status(400).json({ success: false, message: 'Please provide a reason between 10 and 1,000 characters.' });
        }

        await ensureLeaveSheet();
        const [studentRows] = await Promise.all([DatabaseService.getSheetData('Data!A:AG')]);
        const student = getStudent(studentRows, email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });

        const timestamp = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium', hour12: false,
        }).format(new Date());
        const status = type === 'Absence Notice' ? 'Notified' : 'Pending';
        await DatabaseService.appendRow(SHEET_RANGE, [
            timestamp, student.email, student.name, student.rollNo, student.branch, student.course,
            startDate, endDate, type, reason, status,
        ]);
        return res.status(201).json({ success: true, message: type === 'Absence Notice' ? 'Your absence has been recorded.' : 'Your leave request has been submitted.', record: { startDate, endDate, type, reason, status, timestamp } });
    } catch (error) {
        console.error('Leave request submission error:', error.message);
        return res.status(503).json({ success: false, message: 'Could not save your leave request. Please try again.' });
    }
};

module.exports = { getLeaveRecords, submitLeaveRequest };
