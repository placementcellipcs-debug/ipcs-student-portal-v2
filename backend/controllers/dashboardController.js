const DatabaseService = require('../services/dbService');
const connectSheet = require('../config/db');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// Helpers
const buildCourseMap = async () => {
    try {
        const rows = await DatabaseService.getSheetData("Courses!A:B");
        let courseMap = {}; let currentMainCourse = "";
        for (let i = 0; i < rows.length; i++) {
            const colA = rows[i][0] ? rows[i][0].toString().trim() : "";
            const colB = rows[i][1] ? rows[i][1].toString().trim() : "";
            if (colA !== "") currentMainCourse = colA.replace(/^\d+\.\s*/, '').trim().toLowerCase();
            if (colB !== "" && currentMainCourse !== "") courseMap[colB.toLowerCase()] = currentMainCourse;
        }
        return courseMap;
    } catch (e) { return {}; }
};

function isSameDay(dateStr, now) {
    if (!dateStr) return false;
    let cleanStr = String(dateStr).replace(/,/g, '').replace(/\s+/g, ' ').trim();
    let parsedDate = new Date(cleanStr);
    if (isNaN(parsedDate.getTime())) {
        let parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) parsedDate = parts[0].length === 4 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(parts[2], parts[0] - 1, parts[1]);
    }
    if (!isNaN(parsedDate.getTime())) return parsedDate.getDate() === now.getDate() && parsedDate.getMonth() === now.getMonth() && parsedDate.getFullYear() === now.getFullYear();
    return false;
}

function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const dateKeyInIndia = (date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const parseDateKey = (value) => {
    const text = String(value || '').replace(/,/g, '').trim();
    if (!text || /^tba$/i.test(text)) return null;
    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const month = first;
        const day = second;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : dateKeyInIndia(date);
};

const getCol = (row, idx, fallback = "") => (row && row[idx] !== undefined && row[idx] !== null) ? row[idx].toString().trim() : fallback;
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeBranch = (value) => normalize(value).replace(/\s+branch(?:\s+campus)?$/i, '').trim();
const branchMatches = (assignedBranches, studentBranch) => {
    const student = normalizeBranch(studentBranch);
    if (!student) return false;
    const branches = String(assignedBranches || '').split(/[,;|]/).map(normalizeBranch).filter(Boolean);
    return branches.some((branch) => ['all', 'all branches', 'all campuses', 'all branch'].includes(branch) || branch === student);
};
const findStudent = async (email) => {
    const normalizedEmail = normalize(email);
    if (!normalizedEmail) return null;
    const rows = await DatabaseService.getSheetData('Data!A:AG');
    const row = rows.slice(1).reverse().find((item) => normalize(item[3]) === normalizedEmail);
    if (!row) return null;
    return {
        name: getCol(row, 1, 'Student'), phone: getCol(row, 2), email: getCol(row, 3),
        rollNo: getCol(row, 5), joiningDate: getCol(row, 6), course: getCol(row, 7),
        branch: getCol(row, 8), photo: getCol(row, 9), qualification: getCol(row, 11), fresherStatus: getCol(row, 13),
        resume: getCol(row, 21), vacancyOpen: getCol(row, 29, 'No'),
    };
};

// 1. DASHBOARD INITIALIZATION
const getDashboardData = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });

        // Fetch all sheets in parallel via our Database Service
        const [courseMap, userDataRows, appData, evData, driveData, schedData, attData, nlData, contactData] = await Promise.all([
            buildCourseMap(),
            DatabaseService.getSheetData("Data!A:AG"),
            DatabaseService.getSheetData("Opening_Applied!A:O"),
            DatabaseService.getSheetData("Event!A:K"),
            DatabaseService.getSheetData("Drive_Registration!A:J"),
            DatabaseService.getSheetData("Talentino_Schedule!A:D"),
            DatabaseService.getSheetData("Talentino_Attendance!A:J"),
            DatabaseService.getSheetData("NewsLetter!A:W"),
            DatabaseService.getSheetData("Contact!A:H")
        ]);

        let userInfo = {};
        for (let i = userDataRows.length - 1; i >= 1; i--) {
            if (normalize(userDataRows[i][3]) === email) {
                userInfo = {
                    name: userDataRows[i][1] || "Student", phone: userDataRows[i][2] || "N/A", email: userDataRows[i][3], rollNo: userDataRows[i][5] || "N/A", 
                    joiningDate: userDataRows[i][6] || "N/A", course: userDataRows[i][7] || "N/A", branch: userDataRows[i][8] || "Bangalore", photo: userDataRows[i][9] || "", 
                    homeTown: userDataRows[i][10] || "N/A", qualification: userDataRows[i][11] || "N/A", stream: userDataRows[i][12] || "N/A", fresherStatus: userDataRows[i][13] || "N/A",
                    linkedin: userDataRows[i][14] || "N/A", instagram: userDataRows[i][15] || "N/A", placementReq: userDataRows[i][16] || "N/A", resume: userDataRows[i][21] || "N/A", 
                    friend1Name: userDataRows[i][17] || "N/A", friend1Phone: userDataRows[i][18] || "N/A", friend2Name: userDataRows[i][19] || "N/A", friend2Phone: userDataRows[i][20] || "N/A",
                    parentName: userDataRows[i][22] || "N/A", parentContact: userDataRows[i][23] || "N/A", studyStatus: userDataRows[i][24] || "Currently Studying",
                    completedDate: userDataRows[i][25] || "N/A", age: userDataRows[i][26] || "N/A", gender: userDataRows[i][27] || "N/A", certificate: userDataRows[i][28] || "N/A",
                    vacancyOpen: userDataRows[i][29] || "No", techExamAccess: userDataRows[i][32] || "No"
                }; 
                break;
            }
        }

        if (!userInfo.email) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const actualBranch = normalize(userInfo.branch);
        const vacancyAccess = /^(yes|true|1)$/i.test(String(userInfo.vacancyOpen || 'No').trim());

        // Process Applied Jobs
        let appliedJobs = [];
        let stats = { applied: 0, interviews: 0, offers: 0, attended: 0, totalConducted: 0, onLeave: 0 };
        for (let i = 1; i < appData.length; i++) {
            if (normalize(appData[i][3]) === email) {
                let status = appData[i][13] || "Applied";
                stats.applied++;
                if (status.toLowerCase().includes("interview")) stats.interviews++;
                if (status.toLowerCase().includes("offer") || status.toLowerCase().includes("hired") || status.toLowerCase().includes("placed")) stats.offers++;
                appliedJobs.push({
                    jobId: appData[i][9] || "N/A", company: appData[i][10] || "Unknown",
                    position: appData[i][11] || "Role details pending", status,
                    date: appData[i][0] || "Recently", remarks: appData[i][14] || "The placement team will share updates here."
                });
            }
        }

        // Process Events
        let events = [];
        for (let i = 1; i < evData.length; i++) {
            const evBranch = evData[i][2] || 'All';
            if (branchMatches(evBranch, actualBranch)) {
                events.push({ date: evData[i][0] || "TBA", branch: evData[i][2] || "All", type: evData[i][3] || "GENERAL", title: evData[i][4] || "Event", description: evData[i][5] || "", time: evData[i][6] || "", location: evData[i][7] || "", posterLink: evData[i][8] || "", id: evData[i][9] || `DRK-${1000 + i}` });
            }
        }

        // Process Drive RSVPs
        let driveRSVPs = [];
        for (let i = 1; i < driveData.length; i++) {
            if (normalize(driveData[i][3]) === email) {
                driveRSVPs.push({ driveId: driveData[i][0] || "", status: driveData[i][8] || "" });
            }
        }

        // Process Attendance and Schedule
        let attendanceHistory = [];
        let hasMarkedToday = false;
        let isScheduledToday = false;
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-GB');
        
        for (let i = 1; i < schedData.length; i++) {
            if (branchMatches(schedData[i][2], actualBranch)) {
                stats.totalConducted++;
                if (isSameDay(schedData[i][0], now)) isScheduledToday = true;
            }
        }
        
        for (let i = 1; i < attData.length; i++) {
            if (normalize(attData[i][1]) === email) {
                stats.attended++;
                let recDate = attData[i][8] || "";
                let numRating = parseInt((attData[i][6] || "0").charAt(0)) || 0;
                attendanceHistory.push({ timestamp: attData[i][0], rating: numRating, dateStr: recDate });
                if (recDate === todayStr || attData[i][0].includes(now.toLocaleDateString())) hasMarkedToday = true;
            }
        }
        attendanceHistory.reverse();
        stats.onLeave = Math.max(0, stats.totalConducted - stats.attended);

        // Process Job Vacancies
        let vacancies = [];
        const cleanStudentSubcourse = (userInfo.course || "").trim().toLowerCase();
        const studentMainCourse = courseMap[cleanStudentSubcourse] || cleanStudentSubcourse;

        for (let i = 1; vacancyAccess && i < nlData.length; i++) {
            let status = (nlData[i][18] || "yes").toLowerCase();
            if (status.includes("no") || status.includes("closed") || status === "false") continue;
            let rowCourse = (nlData[i][4] || "all").toLowerCase();
            let isCourseMatch = false;

            if (rowCourse.includes("all") || rowCourse === "") isCourseMatch = true;
            else if (rowCourse.includes(studentMainCourse) || studentMainCourse.includes(rowCourse)) isCourseMatch = true;
            else if (rowCourse.includes(cleanStudentSubcourse) || cleanStudentSubcourse.includes(rowCourse)) isCourseMatch = true;

            if (!isCourseMatch) continue;
            
            let company = nlData[i][2] || "Placement Partner";
            let position = nlData[i][5] || "Technical Role";
            if (!company && !position) continue;

            vacancies.push({ date: nlData[i][1] || "", company, companyLogo: nlData[i][22] || "", position, state: nlData[i][6] || "OTHER STATES", location: nlData[i][7] || "Multiple Locations", modeOfWork: nlData[i][8] || "On-site", openings: nlData[i][9] || "01-02", qualification: nlData[i][10] || "Degree", description: nlData[i][11] || "", experience: nlData[i][12] || "Fresher", salary: nlData[i][13] || "Market Standard", interviewDate: nlData[i][15] || "Will inform once scheduled", lastDate: nlData[i][16] || "Open", course: nlData[i][4] || "All", newsletterId: nlData[i][19] || nlData[i][20] || `JOB-${1000 + i}` });
        }

        // Process TPO Info
        let tpoInfo = { name: "Placement Officer", email: "placement@ipcsglobal.com", phone: "N/A", sittingBranch: "N/A", assignedBranches: "N/A", profilePhoto: "" };
        for (let k = 1; k < contactData.length; k++) {
            const assignedRegion = contactData[k][4] || "";
            if (branchMatches(assignedRegion, actualBranch)) {
                tpoInfo = { name: contactData[k][0] || "Placement Officer", phone: contactData[k][1] || "N/A", email: contactData[k][2] || "placement@ipcsglobal.com", sittingBranch: contactData[k][3] || "N/A", assignedBranches: assignedRegion, profilePhoto: contactData[k][6] || "" };
                break;
            }
        }

        return res.status(200).json({ success: true, userInfo, stats, appliedJobs, events, attendanceHistory, isScheduledToday, hasMarkedToday, vacancies, vacancyAccess, tpoInfo, driveRSVPs });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server Error fetching dashboard." }); 
    }
};

// Targeted short-poll endpoint for new placement-drive reminders.
const getDriveAlerts = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const student = await findStudent(email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const [eventRows, responseRows] = await Promise.all([
            DatabaseService.getSheetData('Event!A:K', process.env.SPREADSHEET_ID, 10),
            DatabaseService.getSheetData('Drive_Registration!A:J', process.env.SPREADSHEET_ID, 10),
        ]);
        const today = dateKeyInIndia(new Date());
        const drives = [];
        for (let index = 1; index < eventRows.length; index++) {
            const row = eventRows[index];
            const type = getCol(row, 3).toLowerCase();
            const date = parseDateKey(getCol(row, 0));
            if (!type.includes('placement drive') || !date || date < today || !branchMatches(getCol(row, 2, 'All'), student.branch)) continue;
            drives.push({
                date: row[0] || 'TBA', branch: row[2] || 'All', type: row[3] || 'PLACEMENT DRIVE',
                title: row[4] || 'Placement Drive', description: row[5] || '', time: row[6] || '',
                location: row[7] || '', posterLink: row[8] || '', id: row[9] || `DRK-${1000 + index}`,
            });
        }
        const driveRSVPs = responseRows.slice(1)
            .filter((row) => normalize(row[3]) === email)
            .map((row) => ({ driveId: row[0] || '', status: row[8] || '' }));
        return res.status(200).json({ success: true, drives, driveRSVPs });
    } catch (error) {
        console.error('Drive reminder poll failed:', error.message);
        return res.status(503).json({ success: false, message: 'Drive reminders are temporarily unavailable.' });
    }
};

// 2. MARK ATTENDANCE
// 2. MARK ATTENDANCE
const markAttendance = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const student = await findStudent(email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const { rating, feedback, userLat, userLng } = req.body;
        const latitude = Number(userLat);
        const longitude = Number(userLng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ success: false, message: 'GPS required. Please enable Location Services.' });

        const now = new Date();
        const timestamp = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const istDate = new Date(timestamp);
        const dateOnly = `${istDate.getDate().toString().padStart(2, '0')}/${(istDate.getMonth() + 1).toString().padStart(2, '0')}/${istDate.getFullYear()}`;

        // Basic Time Checks (9:30 AM to 7:00 PM)
        const currentTimeMins = istDate.getHours() * 60 + istDate.getMinutes();
        const isTimeValid = (currentTimeMins >= (9 * 60 + 30) && currentTimeMins <= (19 * 60));

        let isScheduledToday = false;
        const schedData = await DatabaseService.getSheetData("Talentino_Schedule!A:D");
        for (let i = 1; i < schedData.length; i++) {
            if (branchMatches(schedData[i][2], student.branch) && isSameDay(schedData[i][0], now)) {
                isScheduledToday = true; break;
            }
        }

        let isWithinGeofence = false, calculatedDistance = 999999;
        const branchesData = await DatabaseService.getSheetData("Branches!B:E");
        let targetCampus = null;
        for (let i = 1; i < branchesData.length; i++) {
            if (normalize(branchesData[i][1]) !== normalize(student.branch)) continue;
            const lat = Number(branchesData[i][2]);
            const lng = Number(branchesData[i][3]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) targetCampus = { lat, lng };
            break;
        }
        if (!targetCampus) return res.status(400).json({ success: false, message: `Coordinates for ${student.branch} are not configured in the database. Please contact Admin.` });
        calculatedDistance = calculateDistanceInMeters(latitude, longitude, targetCampus.lat, targetCampus.lng);
        isWithinGeofence = calculatedDistance <= 1000;

        let alreadyMarked = false;
        const attData = await DatabaseService.getSheetData("Talentino_Attendance!A:J");
        for (let i = 1; i < attData.length; i++) {
            if (normalize(attData[i][1]) === email) {
                if (attData[i][8] === dateOnly || attData[i][0].includes(dateOnly)) { alreadyMarked = true; break; }
            }
        }

        if (alreadyMarked) return res.status(400).json({ success: false, message: `Attendance Already Marked for today (${dateOnly}).` });
        if (!isScheduledToday) return res.status(400).json({ success: false, message: "No active session scheduled today." });
        if (!isTimeValid) return res.status(400).json({ success: false, message: "Attendance allowed only between 9:30 AM and 7:00 PM." });
        if (!isWithinGeofence) return res.status(400).json({ success: false, message: `Must be within 1000m of campus. (You are ${Math.round(calculatedDistance)}m away).` }); 
        const safeRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 0)));
        if (!safeRating) return res.status(400).json({ success: false, message: 'Select a session rating before submitting.' });
        await DatabaseService.appendRow("Talentino_Attendance!A:J", [timestamp, email, student.name, student.branch, student.course, `${latitude},${longitude}`, `${safeRating} / 5 Stars`, String(feedback || '').slice(0, 1000) || "None", dateOnly, "None"]);

        return res.status(200).json({ success: true, message: "Attendance marked successfully!" });
    } catch (error) { 
        console.error("Attendance Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to submit attendance." }); 
    }
};

// 3. APPLY FOR JOB
const applyForJob = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const student = await findStudent(email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        if (!/^(yes|true|1)$/i.test(student.vacancyOpen)) return res.status(403).json({ success: false, message: 'Your access to job openings is currently restricted.' });
        const { jobId } = req.body;
        if (!jobId) return res.status(400).json({ success: false, message: 'Select a valid job opening.' });
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

        const checkData = await DatabaseService.getSheetData("Opening_Applied!A:J");
        for (let i = 1; i < checkData.length; i++) {
            if (normalize(getCol(checkData[i], 3)) === email && getCol(checkData[i], 9, "") === String(jobId)) {
                return res.status(400).json({ success: false, message: "You have already applied for this job opening." });
            }
        }

        const nlData = await DatabaseService.getSheetData("NewsLetter!A:U");
        let opening = null;
        for (let i = 1; i < nlData.length; i++) {
            let currentId = getCol(nlData[i], 19, "") || getCol(nlData[i], 20, "") || `JOB-${1000 + i}`;
            if (currentId.toString().trim() === jobId.toString().trim()) {
                opening = nlData[i];
                break;
            }
        }
        if (!opening) return res.status(404).json({ success: false, message: 'This job opening is no longer available.' });
        const requiresExperience = /experienced|\d\s*\+?\s*years?|\d+\s*to\s*\d+\s*years?/i.test(getCol(opening, 12));
        if (requiresExperience && /fresher|no experience|entry.level/i.test(student.fresherStatus)) {
            return res.status(403).json({ success: false, message: 'This opening requires prior experience. Your profile is marked as a fresher, so applications are disabled.' });
        }
        const openingStatus = normalize(opening[18] || 'yes');
        if (openingStatus.includes('no') || openingStatus.includes('closed') || openingStatus === 'false') return res.status(400).json({ success: false, message: 'This job opening has closed.' });
        const applyBy = parseDateKey(getCol(opening, 16));
        if (applyBy && applyBy < dateKeyInIndia(new Date())) return res.status(400).json({ success: false, message: 'This job opening has expired.' });
        const openingCourse = normalize(getCol(opening, 4, 'All'));
        if (openingCourse && !openingCourse.includes('all') && !openingCourse.split(/[,;|]/).map(normalize).some((course) => course === normalize(student.course))) {
            const courseMap = await buildCourseMap();
            const mainCourse = normalize(courseMap[normalize(student.course)] || student.course);
            const listedCourses = openingCourse.split(/[,;|]/).map(normalize);
            if (!listedCourses.includes(mainCourse)) return res.status(403).json({ success: false, message: 'This opening is not matched to your course.' });
        }
        const position = getCol(opening, 5, 'N/A');
        const companyName = getCol(opening, 2, 'Placement Partner');
        const placementOfficer = getCol(opening, 17, 'TPO Auto-Assigned');
        if (!student.resume || student.resume === 'N/A') return res.status(400).json({ success: false, message: 'Upload your resume before applying.' });

        await DatabaseService.appendRow("Opening_Applied!A:N", [timestamp, student.name, student.phone, student.email, student.rollNo, student.course, student.branch, student.qualification || "N/A", student.resume, jobId, companyName, position, placementOfficer, "Applied"]);
        await DatabaseService.appendRow("TPO_Log!A:V", [ timestamp, student.name, student.phone, student.email, student.rollNo, student.course, student.branch, student.qualification || "N/A", student.resume, jobId, companyName, position, placementOfficer, "Applied", "", "", "", "", "", "", "", "" ]);

        return res.status(200).json({ success: true, message: "Applied successfully!" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Failed to apply for job." }); 
    }
};

// 4. UPDATE PROFILE (Uses ConnectSheet directly for Batch Updates)
const updateProfile = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const { age, gender, studyStatus, completedDate, stream, homeTown, fresherStatus, qualification, linkedin, instagram, placementReq, parentName, parentContact } = req.body;
        
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const rows = await DatabaseService.getSheetData("Data!A:AF");
        let targetRowIndex = -1;
        
        for (let i = rows.length - 1; i >= 1; i--) {
            if (getCol(rows[i], 3, "").toLowerCase() === email.toLowerCase()) { targetRowIndex = i + 1; break; }
        }
        
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });

        await DatabaseService.withRetry(() => 
            googleSheets.spreadsheets.values.batchUpdate({
                auth, spreadsheetId,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: [
                        { range: `Data!K${targetRowIndex}:Q${targetRowIndex}`, values: [[homeTown || "N/A", qualification || "N/A", stream || "N/A", fresherStatus || "N/A", linkedin || "N/A", instagram || "N/A", placementReq || "N/A"]] },
                        { range: `Data!W${targetRowIndex}:X${targetRowIndex}`, values: [[parentName || "N/A", parentContact || "N/A"]] },
                        { range: `Data!Y${targetRowIndex}:Z${targetRowIndex}`, values: [[studyStatus || "Currently Studying", completedDate || "N/A"]] },
                        { range: `Data!AA${targetRowIndex}:AB${targetRowIndex}`, values: [[age || "N/A", gender || "N/A"]] }
                    ]
                }
            })
        );

        // Fetch the newly updated user to return to frontend
        const updatedRows = await DatabaseService.getSheetData("Data!A:AF");
        const updatedRow = updatedRows[targetRowIndex - 1];

        const completeUserObj = {
            name: getCol(updatedRow, 1, "Student"), phone: getCol(updatedRow, 2, "N/A"), email: getCol(updatedRow, 3), rollNo: getCol(updatedRow, 5, "N/A"), course: getCol(updatedRow, 7, "N/A"), branch: getCol(updatedRow, 8, "Bangalore"), photo: getCol(updatedRow, 9, ""), homeTown: getCol(updatedRow, 10, "N/A"), qualification: getCol(updatedRow, 11, "N/A"), stream: getCol(updatedRow, 12, "N/A"), fresherStatus: getCol(updatedRow, 13, "N/A"), linkedin: getCol(updatedRow, 14, "N/A"), instagram: getCol(updatedRow, 15, "N/A"), placementReq: getCol(updatedRow, 16, "N/A"), parentName: getCol(updatedRow, 22, "N/A"), parentContact: getCol(updatedRow, 23, "N/A"), studyStatus: getCol(updatedRow, 24, "Currently Studying"), completedDate: getCol(updatedRow, 25, "N/A"), age: getCol(updatedRow, 26, "N/A"), gender: getCol(updatedRow, 27, "N/A"), vacancyOpen: getCol(updatedRow, 29, "Yes")
        };

        return res.status(200).json({ success: true, message: "Profile updated successfully!", user: completeUserObj });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Failed to update profile." }); 
    }
};

// 5. UPLOAD DOCUMENT
const uploadDocument = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const student = await findStudent(email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const { base64, docType } = req.body;
        const dataUrlMatch = typeof base64 === 'string' && base64.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
        if (!['Photo', 'Resume', 'Certificate'].includes(docType) || !dataUrlMatch) {
            return res.status(400).json({ success: false, message: 'Choose a valid profile document.' });
        }
        const mimeType = dataUrlMatch[1].toLowerCase();
        if ((docType === 'Photo' && !mimeType.startsWith('image/')) || (docType !== 'Photo' && mimeType !== 'application/pdf')) {
            return res.status(400).json({ success: false, message: docType === 'Photo' ? 'Choose a valid image file.' : 'Choose a PDF document.' });
        }
        const rollNo = student.rollNo;
        const base64Clean = dataUrlMatch[2];
        const uploadMimeType = docType === 'Photo' ? mimeType : 'application/pdf';
        
        const response = await axios.post(process.env.APPS_SCRIPT_PHOTO_URL, { 
            action: 'uploadOnly', email: email, rollNo: rollNo, base64: base64Clean, docType: docType,
            filename: `${rollNo}_${docType}`, mimeType: uploadMimeType,
            folderName: docType === 'Photo' ? 'Profile Photo' : (docType === 'Resume' ? 'Resumes' : 'Certificates'),
            folderId: process.env.DRIVE_FOLDER_ID, parentFolderId: process.env.DRIVE_FOLDER_ID
        }, { timeout: 30000 });
        
        const uploadedUrl = String(response.data?.url || '').trim();
        if (!response.data?.success || !uploadedUrl) {
            return res.status(502).json({ success: false, message: response.data?.message || 'The file could not be saved to Drive.' });
        }

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const rows = await DatabaseService.getSheetData('Data!A:D');
        let targetRowIndex = -1;
        for (let i = rows.length - 1; i >= 1; i--) {
            if (normalize(rows[i][3]) === email) {
                targetRowIndex = i + 1;
                break;
            }
        }
        if (targetRowIndex === -1) {
            return res.status(404).json({ success: false, message: 'The uploaded file could not be linked to your student profile.' });
        }

        const versionedUrl = new URL(uploadedUrl);
        versionedUrl.searchParams.set('v', String(Date.now()));
        const columnLetter = docType === 'Photo' ? 'J' : (docType === 'Resume' ? 'V' : 'AC');
        await DatabaseService.withRetry(() => googleSheets.spreadsheets.values.update({
            auth,
            spreadsheetId,
            range: `Data!${columnLetter}${targetRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[versionedUrl.toString()]] },
        }));
        DatabaseService.flushCache();

        return res.status(200).json({ success: true, message: `${docType} uploaded successfully!`, url: versionedUrl.toString() });
    } catch (error) { 
        console.error('Profile document upload failed:', error.response?.data || error.message);
        return res.status(500).json({ success: false, message: 'The upload could not be completed. Please try again.' });
    }
};

// 6. UPDATE PASSWORD
const updatePassword = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const { currentPassword, newPassword } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const rows = await DatabaseService.getSheetData("Data!A:AF");
        let targetRowIndex = -1;
        
        for (let i = rows.length - 1; i >= 1; i--) {
            if ((rows[i][3] || "").toLowerCase() === email.toLowerCase()) {
                const rowPass = rows[i][4] || "";
                let isMatch = false;
                
                if (rowPass === currentPassword) isMatch = true; 
                else { try { isMatch = await bcrypt.compare(currentPassword, rowPass); } catch(e) {} }

                if (!isMatch) return res.status(400).json({ success: false, message: "Incorrect current password." });
                targetRowIndex = i + 1; break;
            }
        }
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });

        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        await DatabaseService.withRetry(() => 
            googleSheets.spreadsheets.values.update({ auth, spreadsheetId, range: `Data!E${targetRowIndex}`, valueInputOption: "USER_ENTERED", resource: { values: [[hashedNewPassword]] } })
        );
        
        return res.status(200).json({ success: true, message: "Password updated successfully!" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Failed to update password." }); 
    }
};

// 7. SUBMIT ISSUE
const submitIssue = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const student = await findStudent(email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const { issueDetails, location } = req.body;
        if (!String(issueDetails || '').trim()) return res.status(400).json({ success: false, message: 'Describe the issue before submitting.' });
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        await DatabaseService.appendRow("Issues!A:K", [ timestamp, student.name, student.phone || "N/A", student.rollNo || "N/A", student.email, student.branch || "N/A", student.course || "N/A", String(location || 'Student Portal').slice(0, 120), String(issueDetails).trim().slice(0, 2000), "Pending", "" ]);
        return res.status(200).json({ success: true, message: "Issue reported successfully!" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Failed to submit issue." }); 
    }
};

// 8. SUBMIT DRIVE RESPONSE
const submitDriveResponse = async (req, res) => {
    try {
        const email = normalize(req.user?.email);
        if (!email) return res.status(401).json({ success: false, message: 'Please sign in again.' });
        const student = await findStudent(email);
        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });
        const { driveId, title, status } = req.body;
        const targetDriveId = driveId || title || "N/A";
        if (!['Registered', 'Not Attending', 'Maybe', 'Not Interested'].includes(status)) return res.status(400).json({ success: false, message: 'Select a valid drive response.' });

        const [rows, eventRows, contacts] = await Promise.all([
            DatabaseService.getSheetData("Drive_Registration!A:D"),
            DatabaseService.getSheetData("Event!A:K", process.env.SPREADSHEET_ID, 60),
            DatabaseService.getSheetData("Contact!A:H"),
        ]);
        const event = eventRows.slice(1).find((row, index) => {
            const id = getCol(row, 9) || `DRK-${1000 + index + 1}`;
            return id === String(targetDriveId) && /placement drive/i.test(getCol(row, 3));
        });
        if (!event) return res.status(404).json({ success: false, message: 'This placement drive is no longer available.' });
        if (!branchMatches(getCol(event, 2, 'All'), student.branch)) return res.status(403).json({ success: false, message: 'This drive is not assigned to your branch.' });
        const eventDate = parseDateKey(getCol(event, 0));
        if (eventDate && eventDate < dateKeyInIndia(new Date())) return res.status(400).json({ success: false, message: 'This placement drive has already passed.' });
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === targetDriveId && normalize(rows[i][3]) === email) {
                return res.status(400).json({ success: false, message: 'You have already submitted a response for this drive.' });
            }
        }

        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        await DatabaseService.appendRow("Drive_Registration!A:J", [ targetDriveId, student.name, student.phone || "N/A", student.email, student.course || "N/A", student.branch || "N/A", student.resume || "N/A", student.qualification || "N/A", status, timestamp ]);

        if (status === 'Registered' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
                const assignedTpo = contacts.slice(1).find((row) => branchMatches(getCol(row, 4), student.branch));
                const ccTpoEmail = getCol(assignedTpo, 2, 'placement@ipcsglobal.com');
                const safeName = String(student.name).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
                const safeTitle = String(getCol(event, 4, title || 'Placement Drive')).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

                const mailOptions = {
                    from: '"IPCS Placement Cell" <placement@ipcsglobal.com>',
                    to: student.email, cc: ccTpoEmail, subject: `Drive Registration Confirmed: ${safeTitle}`,
                    html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 10px; border-top: 5px solid #38bdf8;">
                            <h2>Registration Successful! 🎉</h2>
                            <p>Dear <strong>${safeName}</strong>,</p>
                            <p>You have successfully registered for the placement drive: <strong>${safeTitle}</strong>.</p>
                            <p><strong>Drive ID:</strong> ${targetDriveId}<br><strong>Location:</strong> ${getCol(event, 7, 'IPCS')}</p>
                            <p>Please carry a physical copy of your resume and arrive on time in formal attire.</p>
                        </div></div>`
                };
                await transporter.sendMail(mailOptions);
            } catch (mailErr) {}
        }
        return res.status(200).json({ success: true, message: `Status updated to: ${status}` });
    } catch (error) { 
        return res.status(500).json({ success: false, message: 'Failed to record response.' }); 
    }
};

module.exports = { getDashboardData, getDriveAlerts, markAttendance, applyForJob, updateProfile, uploadDocument, updatePassword, submitIssue, submitDriveResponse };
