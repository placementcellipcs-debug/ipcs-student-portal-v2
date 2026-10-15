const DatabaseService = require('../services/dbService');
const { normalizeCourse, getCourseAccess, courseMatchesAccess } = require('../services/courseService');
const crypto = require('crypto');

const getStudentMaterialAccess = async (email) => {
    const [userDataRows, courseRows] = await Promise.all([
        DatabaseService.getSheetData('Data!A:AE', 60),
        DatabaseService.getSheetData('Courses!A:B', 300)
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

const getActiveMaterial = (row) => {
    const status = String(row[6] || 'active').trim().toLowerCase();
    if (status.includes('inactive') || status === 'false') return null;
    const course = String(row[1] || '').trim();
    const topic = String(row[2] || 'General').trim();
    const title = String(row[3] || 'Study Material').trim();
    const fileType = String(row[4] || 'PPTX').trim();
    const oneDriveLink = String(row[5] || '').trim();
    if (!course && !oneDriveLink) return null;

    // Material IDs must follow the file/record, not its current sheet row.
    // Row-based IDs can silently point to a different deck after rows are
    // inserted, sorted, or reordered between the list and stream requests.
    const identity = [
        course.toLowerCase(),
        topic.toLowerCase(),
        title.toLowerCase(),
        fileType.toLowerCase(),
        oneDriveLink,
    ].join('\u001f');
    const id = `MAT-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
    return {
        id,
        materialGroupId: row[0] || '',
        course,
        topic,
        title,
        fileType,
        oneDriveLink
    };
};

const getStudyMaterialsList = async (req, res) => {
    try {
        const email = req.user?.email;
        const studentAccess = await getStudentMaterialAccess(email);
        if (!studentAccess.allowed) {
            return res.status(403).json({ success: false, message: "Access Restricted: You do not have permission to view Study Materials." });
        }

        // Staff maintain this sheet directly, so don't hold a per-process copy
        // that can keep showing an old module-to-file mapping after edits.
        const matData = await DatabaseService.getSheetData("Study_Materials!A:G", 0);
        const materials = matData.slice(1)
            .map((row) => getActiveMaterial(row))
            .filter((material) => material && materialMatchesStudent(material.course, studentAccess.courses));

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

        const matData = await DatabaseService.getSheetData("Study_Materials!A:G", 0);
        let selectedMaterial = null;
        for (let i = 1; i < matData.length; i++) {
            const material = getActiveMaterial(matData[i]);
            if (material && String(material.id) === String(materialId)
                && materialMatchesStudent(material.course, studentAccess.courses)) {
                selectedMaterial = material;
                break;
            }
        }
        const oneDriveLink = selectedMaterial?.oneDriveLink || '';
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

        return res.status(200).json({
            success: true,
            materialId: selectedMaterial.id,
            embedUrl,
        });
    } catch (error) {
        console.error("Material Viewer Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to process the document link." });
    }
};

module.exports = { getStudyMaterialsList, streamMaterialPdf };
