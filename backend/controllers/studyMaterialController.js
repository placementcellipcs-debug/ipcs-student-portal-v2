const DatabaseService = require('../services/dbService');
const { normalizeCourse, getCourseAccess, courseMatchesAccess } = require('../services/courseService');

const getStudentMaterialAccess = async (email) => {
    const [userDataRows, courseRows] = await Promise.all([
        DatabaseService.getSheetData('Data!A:AE', process.env.SPREADSHEET_ID, 60),
        DatabaseService.getSheetData('Courses!A:B', process.env.SPREADSHEET_ID, 300)
    ]);
    const student = userDataRows.slice(1).reverse().find((row) => (
        String(row[3] || '').trim().toLowerCase() === String(email || '').trim().toLowerCase()
    ));
    if (!student) return { allowed: false, courses: new Set() };

    const access = String(student[30] || '').trim().toLowerCase();
    if (!['yes', 'true', '1'].includes(access)) return { allowed: false, courses: new Set() };

    const studentCourse = normalizeCourse(student[7]);
    if (!studentCourse) return { allowed: false, courses: new Set() };

    return { allowed: true, courses: getCourseAccess(studentCourse, courseRows) };
};

const materialMatchesStudent = (materialCourse, courseAccess) => {
    return courseMatchesAccess(materialCourse, courseAccess);
};

const getActiveMaterial = (row, index) => {
    const status = String(row[6] || 'active').trim().toLowerCase();
    if (status.includes('inactive') || status === 'false') return null;
    return {
        id: row[0] || `MAT-${index}`,
        course: row[1] || '',
        topic: row[2] || 'General',
        title: row[3] || 'Study Material',
        fileType: row[4] || 'PPTX',
        oneDriveLink: row[5] || ''
    };
};

const getStudyMaterialsList = async (req, res) => {
    try {
        const email = req.user?.email;
        const studentAccess = await getStudentMaterialAccess(email);
        if (!studentAccess.allowed) {
            return res.status(403).json({ success: false, message: "Access Restricted: You do not have permission to view Study Materials." });
        }

        const matData = await DatabaseService.getSheetData("Study_Materials!A:G", process.env.SPREADSHEET_ID, 60);
        const materials = matData.slice(1)
            .map((row, offset) => ({ row, index: offset + 1 }))
            .filter(({ row }) => materialMatchesStudent(row[1], studentAccess.courses))
            .map(({ row, index }) => getActiveMaterial(row, index))
            .filter(Boolean);

        return res.status(200).json({ success: true, materials });
    } catch (error) {
        console.error("Get Study Materials Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch study materials." });
    }
};

const streamMaterialPdf = async (req, res) => {
    try {
        const email = req.user?.email;
        const { materialId } = req.body;
        const studentAccess = await getStudentMaterialAccess(email);
        if (!studentAccess.allowed) {
            return res.status(403).json({ success: false, message: "Access Restricted: You do not have permission to view Study Materials." });
        }

        const matData = await DatabaseService.getSheetData("Study_Materials!A:G", process.env.SPREADSHEET_ID, 60);
        let oneDriveLink = '';
        for (let i = 1; i < matData.length; i++) {
            const material = getActiveMaterial(matData[i], i);
            if (material && String(material.id) === String(materialId)
                && materialMatchesStudent(material.course, studentAccess.courses)) {
                oneDriveLink = material.oneDriveLink;
                break;
            }
        }
        if (!oneDriveLink || !oneDriveLink.startsWith('http')) {
            return res.status(404).json({ success: false, message: "This material is not available for your course." });
        }

        let embedUrl = oneDriveLink.trim();

        if (embedUrl.includes('drive.google.com') || embedUrl.includes('docs.google.com')) {
            const fileIdMatch = embedUrl.match(/(?:id=|\/d\/)([\w-]+)/);
            if (fileIdMatch && fileIdMatch[1]) {
                embedUrl = embedUrl.includes('presentation')
                    ? `https://docs.google.com/presentation/d/${fileIdMatch[1]}/embed?start=false&loop=false`
                    : `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
            }
        } else if (embedUrl.includes('sharepoint.com') || embedUrl.includes('onedrive.live.com')) {
            if (embedUrl.includes('?')) {
                if (!embedUrl.includes('action=embedview')) embedUrl += '&action=embedview';
            } else {
                embedUrl += '?action=embedview';
            }
        }

        return res.status(200).json({ success: true, embedUrl });
    } catch (error) {
        console.error("Material Viewer Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to process the document link." });
    }
};

module.exports = { getStudyMaterialsList, streamMaterialPdf };
