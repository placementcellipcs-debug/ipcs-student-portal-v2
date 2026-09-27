const DatabaseService = require('../services/dbService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

        // Fetch data using our new Database Service
        const rows = await DatabaseService.getSheetData('Data!A:AG');
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
        
        const token = jwt.sign(
            { email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch },
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

        const token = jwt.sign({ email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "Bangalore" }, process.env.JWT_SECRET, { expiresIn: '7d' });
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

module.exports = { loginUser, registerUser, getCourses, getBranches };