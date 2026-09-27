const DatabaseService = require('../services/dbService');

const GEOFENCE_RADIUS_METERS = 1000;
const SHEET_RANGE = 'Student_Diary!A:O';
const SHEET_HEADERS = [
    'Timestamp', 'Email', 'Name', 'Roll No', 'Branch', 'Course', 'Date', 'Record Type',
    'Status', 'Topic', 'Syllabus Completed (%)', 'Remarks', 'Latitude', 'Longitude', 'Distance (m)',
];
let worksheetSetupPromise;

const ensureDiaryWorksheet = () => {
    if (!worksheetSetupPromise) {
        worksheetSetupPromise = DatabaseService.ensureWorksheetWithHeaders('Student_Diary', SHEET_HEADERS)
            .catch((error) => {
                worksheetSetupPromise = null;
                throw error;
            });
    }
    return worksheetSetupPromise;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getTodayInIndia = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${value.year}-${value.month}-${value.day}`;
};

const getTimestampInIndia = (date = new Date()) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium', hour12: false
}).format(date);

const hasSessionToday = (scheduleRows, branch, today) => scheduleRows.slice(1).some((row) => (
    String(row[2] || '').split(/[,;|]/).map((value) => value.trim().toLowerCase()).includes(String(branch || '').trim().toLowerCase())
    && dateCandidates(row[0]).includes(today)
));

const isAttendanceTime = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const minutes = Number(values.hour) * 60 + Number(values.minute);
    return minutes >= 570 && minutes <= 1140;
};

const dateCandidates = (value) => {
    const text = String(value || '').trim();
    if (!text) return [];
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return [`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`];
    const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (!slash) return [];
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = slash[3];
    const values = [];
    if (first <= 12) values.push(`${year}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`);
    if (second <= 12) values.push(`${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`);
    return [...new Set(values)];
};

const distanceInMeters = (lat1, lng1, lat2, lng2) => {
    const radians = (degrees) => degrees * (Math.PI / 180);
    const dLat = radians(lat2 - lat1);
    const dLng = radians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const findStudent = (rows, email) => {
    for (let index = rows.length - 1; index >= 1; index--) {
        if (normalizeEmail(rows[index]?.[3]) === email) {
            const row = rows[index];
            return {
                name: row[1] || 'Student',
                phone: row[2] || '',
                email: row[3],
                rollNo: row[5] || '',
                joiningDate: row[6] || '',
                course: row[7] || '',
                branch: row[8] || '',
                photo: row[9] || '',
            };
        }
    }
    return null;
};

const rowsForStudent = (rows, email) => rows.slice(1).filter((row) => normalizeEmail(row[1]) === email);

const buildDiary = (rows, student, email) => {
    const entries = rowsForStudent(rows, email);
    const attendanceRecords = entries
        .filter((row) => String(row[7] || '').trim().toUpperCase() === 'ATTENDANCE')
        .map((row) => ({
            timestamp: row[0] || '',
            date: row[6] || '',
            status: row[8] || 'Present',
            remarks: row[11] || '',
            distanceMeters: row[14] || '',
        }))
        .reverse();
    const syllabusEntries = entries
        .filter((row) => String(row[7] || '').trim().toUpperCase() === 'SYLLABUS')
        .map((row) => ({
            timestamp: row[0] || '',
            date: row[6] || '',
            topic: row[9] || '',
            progress: Math.min(100, Math.max(0, Number(row[10]) || 0)),
            remarks: row[11] || '',
        }));
    const latestProgress = syllabusEntries[syllabusEntries.length - 1] || null;
    const today = getTodayInIndia();
    const hasMarkedToday = attendanceRecords.some((record) => dateCandidates(record.date).includes(today));

    return {
        student,
        today,
        attendanceRecords,
        hasMarkedToday,
        syllabus: {
            progress: latestProgress?.progress || 0,
            topic: latestProgress?.topic || '',
            remarks: latestProgress?.remarks || '',
            updatedAt: latestProgress?.date || latestProgress?.timestamp || '',
            entries: syllabusEntries.reverse(),
        },
    };
};

const getStudentDiary = async (req, res) => {
    try {
        const email = normalizeEmail(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });

        await ensureDiaryWorksheet();
        const [studentRows, diaryRows] = await Promise.all([
            DatabaseService.getSheetData('Data!A:AF'),
            DatabaseService.getSheetData(SHEET_RANGE),
        ]);
        const student = findStudent(studentRows, email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });

        return res.json({ success: true, ...buildDiary(diaryRows, student, email) });
    } catch (error) {
        console.error('Student diary read error:', error.message);
        return res.status(503).json({
            success: false,
            message: 'Student diary is unavailable. Confirm that the Student_Diary sheet exists with the documented columns.',
        });
    }
};

const markStudentAttendance = async (req, res) => {
    try {
        const email = normalizeEmail(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });

        const lat = Number(req.body?.latitude);
        const lng = Number(req.body?.longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
            return res.status(400).json({ success: false, message: 'Capture a valid GPS location before marking attendance.' });
        }

        await ensureDiaryWorksheet();
        const [studentRows, branchRows, diaryRows, scheduleRows] = await Promise.all([
            DatabaseService.getSheetData('Data!A:AF'),
            DatabaseService.getSheetData('Branches!B:E'),
            DatabaseService.getSheetData(SHEET_RANGE),
            DatabaseService.getSheetData('Talentino_Schedule!A:D'),
        ]);
        const student = findStudent(studentRows, email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        if (!student.branch) return res.status(400).json({ success: false, message: 'Your branch is not set on your profile. Contact student support.' });

        const branch = branchRows.slice(1).find((row) => String(row[1] || '').trim().toLowerCase() === student.branch.trim().toLowerCase());
        const campusLat = Number(branch?.[2]);
        const campusLng = Number(branch?.[3]);
        if (!Number.isFinite(campusLat) || !Number.isFinite(campusLng)) {
            return res.status(400).json({ success: false, message: `GPS coordinates for ${student.branch} are not configured in the Branches sheet.` });
        }

        const today = getTodayInIndia();
        if (!hasSessionToday(scheduleRows, student.branch, today)) {
            return res.status(400).json({ success: false, message: 'No class session is scheduled for your branch today.' });
        }
        if (!isAttendanceTime()) {
            return res.status(400).json({ success: false, message: 'Attendance is available between 9:30 AM and 7:00 PM India time.' });
        }
        const existingAttendance = rowsForStudent(diaryRows, email).find((row) => (
            String(row[7] || '').trim().toUpperCase() === 'ATTENDANCE'
            && dateCandidates(row[6]).includes(today)
        ));
        if (existingAttendance) return res.status(409).json({ success: false, message: 'Your class attendance is already marked for today.' });

        const distance = distanceInMeters(lat, lng, campusLat, campusLng);
        if (distance > GEOFENCE_RADIUS_METERS) {
            return res.status(400).json({ success: false, message: `You must be within ${GEOFENCE_RADIUS_METERS} metres of your branch. Your current distance is ${Math.round(distance)} metres.` });
        }

        const timestamp = getTimestampInIndia();
        const date = today;
        await DatabaseService.appendRow(SHEET_RANGE, [
            timestamp, email, student.name, student.rollNo, student.branch, student.course,
            date, 'ATTENDANCE', 'Present', '', '', '', lat, lng, Math.round(distance),
        ]);

        return res.status(201).json({
            success: true,
            message: 'Class attendance marked successfully.',
            attendance: { date, status: 'Present', distanceMeters: Math.round(distance), timestamp },
        });
    } catch (error) {
        console.error('Student attendance write error:', error.message);
        return res.status(503).json({
            success: false,
            message: 'Could not save attendance. Confirm that the Student_Diary sheet exists with the documented columns.',
        });
    }
};

module.exports = { getStudentDiary, markStudentAttendance };
