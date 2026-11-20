const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { requiresPriorExperience } = require('../utils/jobEligibility');
const { normalizeCourse } = require('./courseService');

class ApplicationError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalizeEmail = value => text(value).toLocaleLowerCase('en-US');
const normalizeId = value => text(value).toLocaleLowerCase('en-US');

function parseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
}

function fieldValue(record, ...names) {
    const fields = record?.fields || {};
    const wanted = new Set(names.map(name => name.toLocaleLowerCase('en-US')));
    for (const [key, value] of Object.entries(fields)) {
        if (wanted.has(key.toLocaleLowerCase('en-US'))) return value;
    }
    return '';
}

function safeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).filter(([key]) => !/password|secret|token/i.test(key)));
}

function dateKeyInIndia(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function courseTokens(value) {
    return String(value || '').split(/[,;|\n]+/).map(normalizeCourse).filter(Boolean);
}

function displayDate(value) {
    if (!value) return '';
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value);
}

async function getVacancyData({ email, connection: suppliedConnection = null }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new ApplicationError(401, 'SIGN_IN_REQUIRED', 'Please sign in again.');
    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        const [studentRows] = await connection.execute(
            `SELECT sp.id AS student_id, sp.roll_number, sp.resume_url, sp.status AS student_status,
                    sp.course_id, sp.metadata AS profile_metadata, c.name AS course_name,
                    c.category AS course_category
             FROM users u JOIN student_profiles sp ON sp.user_id = u.id
             LEFT JOIN courses c ON c.id = sp.course_id
             WHERE u.normalized_email = ? AND u.role = 'student' LIMIT 1`,
            [normalizedEmail],
        );
        const student = studentRows[0];
        if (!student) throw new ApplicationError(404, 'STUDENT_NOT_FOUND', 'Student profile was not found.');
        if (normalizeId(student.student_status) === 'inactive') {
            throw new ApplicationError(403, 'STUDENT_ACCOUNT_INACTIVE', 'Your student account is inactive. Contact your Placement Officer.');
        }
        const profileFields = parseJson(student.profile_metadata).fields || {};
        const vacancyAccess = /^(yes|true|1)(?:\b|$)/i.test(text(fieldValue({ fields: profileFields }, 'Vacancy Open')));
        if (!vacancyAccess) return { vacancies: [], appliedJobs: [], vacancyAccess: false };

        const courseAccess = new Set([
            normalizeCourse(student.course_name),
            normalizeCourse(student.course_category),
        ].filter(Boolean));
        if (student.course_category) {
            const [relatedCourses] = await connection.execute(
                'SELECT normalized_name FROM courses WHERE category = ? AND active = 1',
                [student.course_category],
            );
            for (const course of relatedCourses) courseAccess.add(normalizeCourse(course.normalized_name));
        }

        const [vacancyRows] = await connection.execute(
            `SELECT id, job_code, title, company_name, company_website, location, description,
                    qualification, employment_type, salary_text, apply_by, status, metadata
             FROM vacancies WHERE LOWER(TRIM(status)) = 'open' ORDER BY apply_by IS NULL, apply_by, created_at DESC`,
        );
        const vacancies = vacancyRows.flatMap(row => {
            const fields = parseJson(row.metadata).fields || {};
            const course = text(fieldValue({ fields }, 'Course', 'Program')) || 'All';
            const targets = courseTokens(course);
            const matches = targets.some(target => ['all', 'all courses', 'all students'].includes(target) || courseAccess.has(target));
            const company = text(row.company_name || fieldValue({ fields }, 'Company Name', 'Company'));
            const position = text(row.title || fieldValue({ fields }, 'Position', 'Role', 'Title'));
            if (!matches || !company || !position) return [];
            return [{
                date: text(fieldValue({ fields }, 'Date', 'Posted Date')),
                company,
                companyLogo: text(fieldValue({ fields }, 'Company Logo', 'Logo')),
                position,
                state: text(fieldValue({ fields }, 'State', 'State / Region')) || 'OTHER STATES',
                location: text(row.location || fieldValue({ fields }, 'Opening AT ( Location )', 'Location')) || 'Multiple Locations',
                modeOfWork: text(row.employment_type || fieldValue({ fields }, 'Mode of Work', 'Work Mode')) || 'On-site',
                openings: text(fieldValue({ fields }, 'Openings', 'No. of Openings', 'Vacancies')) || '01-02',
                qualification: text(row.qualification || fieldValue({ fields }, 'Qualification')) || 'Degree',
                description: text(row.description || fieldValue({ fields }, 'Description', 'Job Description')),
                experience: text(fieldValue({ fields }, 'Experience', 'Years of Experience')) || 'Fresher',
                salary: text(row.salary_text || fieldValue({ fields }, 'Salary', 'Package')) || 'Market Standard',
                interviewDate: text(fieldValue({ fields }, 'Interview Date')) || 'Will inform once scheduled',
                lastDate: displayDate(row.apply_by) || 'Open',
                course,
                newsletterId: row.job_code,
            }];
        });

        const [applicationRows] = await connection.execute(
            `SELECT v.job_code AS jobId, v.company_name AS company, v.title AS position,
                    ja.status, ja.applied_at AS occurred_at,
                    (SELECT h.note FROM application_status_history h
                     WHERE h.application_id = ja.id ORDER BY h.occurred_at DESC, h.history_sequence DESC LIMIT 1) AS remarks,
                    ja.metadata
             FROM job_applications ja JOIN vacancies v ON v.id = ja.vacancy_id
             WHERE ja.student_id = ?
             UNION ALL
             SELECT tr.job_code AS jobId, tr.company_name AS company, tr.position_title AS position,
                    tr.status, tr.occurred_at, NULL AS remarks, tr.metadata
             FROM placement_tracker_records tr
             WHERE tr.student_id = ? AND tr.source_tab = 'Opening_Applied'
               AND LOWER(COALESCE(tr.status, '')) <> 'deleted'
               AND NOT EXISTS (
                 SELECT 1 FROM job_applications legacy
                 WHERE legacy.source = 'legacy_opening_applied'
                   AND legacy.student_id = tr.student_id AND legacy.vacancy_id = tr.vacancy_id
               )
             ORDER BY occurred_at DESC`,
            [student.student_id, student.student_id],
        );
        const appliedJobs = applicationRows.map(row => ({
            jobId: text(row.jobId) || 'N/A',
            company: text(row.company) || 'Unknown',
            position: text(row.position) || 'Role details pending',
            status: text(row.status) || 'Applied',
            date: text(row.occurred_at) || 'Recently',
            remarks: text(row.remarks)
                || text(fieldValue({ fields: parseJson(row.metadata).fields || {} }, 'Remarks', 'Remarks / Notes', 'Note'))
                || 'The placement team will share updates here.',
        }));
        return { vacancies, appliedJobs, vacancyAccess: true };
    } finally {
        if (ownsConnection) connection.release();
    }
}

async function applyForOpening({ email, jobId, connection: suppliedConnection = null }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedJobId = normalizeId(jobId);
    if (!normalizedEmail) throw new ApplicationError(401, 'SIGN_IN_REQUIRED', 'Please sign in again.');
    if (!normalizedJobId) throw new ApplicationError(400, 'INVALID_OPENING', 'Select a valid job opening.');

    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
        if (ownsConnection) await connection.beginTransaction();
        const [studentRows] = await connection.execute(
            `SELECT u.id AS user_id, u.full_name, u.normalized_email, sp.id AS student_id,
                    sp.roll_number, sp.personal_email, sp.phone, sp.resume_url, sp.status AS student_status,
                    sp.course_id, c.name AS course_name, c.category AS course_category, b.name AS branch_name,
                    sp.metadata AS profile_metadata
             FROM users u
             JOIN student_profiles sp ON sp.user_id = u.id
             LEFT JOIN courses c ON c.id = sp.course_id
             LEFT JOIN branches b ON b.id = sp.branch_id
             WHERE u.normalized_email = ? AND u.role = 'student'
             LIMIT 1 FOR UPDATE`,
            [normalizedEmail],
        );
        const student = studentRows[0];
        if (!student) throw new ApplicationError(404, 'STUDENT_NOT_FOUND', 'Student profile was not found.');
        if (normalizeId(student.student_status) === 'inactive') {
            throw new ApplicationError(403, 'STUDENT_ACCOUNT_INACTIVE', 'Your student account is inactive. Contact your Placement Officer.');
        }

        const profileMetadata = parseJson(student.profile_metadata);
        const profileFields = profileMetadata.fields || {};
        const vacancyAccess = text(fieldValue({ fields: profileFields }, 'Vacancy Open'));
        if (!/^(yes|true|1)(?:\b|$)/i.test(vacancyAccess)) {
            throw new ApplicationError(403, 'VACANCY_ACCESS_RESTRICTED', 'Your access to job openings is currently restricted.');
        }
        const resume = text(student.resume_url);
        if (!resume || /^n\/?a$/i.test(resume)) {
            throw new ApplicationError(400, 'RESUME_REQUIRED', 'Upload your resume before applying.');
        }

        const [vacancyRows] = await connection.execute(
            `SELECT id, job_code, title, company_name, qualification, apply_by, status,
                    assigned_tpo_user_id, metadata
             FROM vacancies WHERE LOWER(TRIM(job_code)) = ? LIMIT 1 FOR UPDATE`,
            [normalizedJobId],
        );
        const vacancy = vacancyRows[0];
        if (!vacancy) throw new ApplicationError(404, 'OPENING_NOT_FOUND', 'This job opening is no longer available.');
        if (normalizeId(vacancy.status) !== 'open') {
            throw new ApplicationError(400, 'OPENING_CLOSED', 'This job opening has closed.');
        }
        const applyBy = vacancy.apply_by instanceof Date
            ? vacancy.apply_by.toISOString().slice(0, 10)
            : text(vacancy.apply_by).slice(0, 10);
        if (applyBy && /^\d{4}-\d{2}-\d{2}$/.test(applyBy) && applyBy < dateKeyInIndia()) {
            throw new ApplicationError(400, 'OPENING_EXPIRED', 'This job opening has expired.');
        }

        const vacancyMetadata = parseJson(vacancy.metadata);
        const openingFields = vacancyMetadata.fields || {};
        const experience = text(fieldValue({ fields: openingFields }, 'Experience', 'Years of Experience'));
        const fresherStatus = text(fieldValue({ fields: profileFields }, 'Status (Fresher / Experienced)', 'Fresher Status'));
        if (requiresPriorExperience(experience) && /fresher|no experience|entry.level/i.test(fresherStatus)) {
            throw new ApplicationError(403, 'EXPERIENCE_REQUIRED', 'This opening requires prior experience. Your profile is marked as a fresher, so applications are disabled.');
        }

        const openingCourseText = text(fieldValue({ fields: openingFields }, 'Course', 'Program')) || 'All';
        const studentCourse = normalizeCourse(student.course_name);
        const access = new Set([studentCourse, normalizeCourse(student.course_category)].filter(Boolean));
        if (student.course_category) {
            const [relatedCourses] = await connection.execute(
                'SELECT normalized_name FROM courses WHERE category = ?',
                [student.course_category],
            );
            for (const relatedCourse of relatedCourses) access.add(normalizeCourse(relatedCourse.normalized_name));
        }
        const targets = courseTokens(openingCourseText);
        const isAllCourses = targets.some(token => ['all', 'all courses', 'all students'].includes(token));
        if (!isAllCourses && !targets.some(token => access.has(token))) {
            throw new ApplicationError(403, 'COURSE_MISMATCH', 'This opening is not matched to your course.');
        }

        const [previousApplications] = await connection.execute(
            `SELECT id FROM job_applications WHERE student_id = ? AND vacancy_id = ?
             UNION ALL
             SELECT id FROM placement_tracker_records
             WHERE source_tab = 'Opening_Applied' AND student_id = ? AND vacancy_id = ? LIMIT 1`,
            [student.student_id, vacancy.id, student.student_id, vacancy.id],
        );
        if (previousApplications.length) {
            throw new ApplicationError(409, 'ALREADY_APPLIED', 'You have already applied for this job opening.');
        }

        const applicationId = crypto.randomUUID();
        const sourceKey = `student:${student.student_id}:vacancy:${vacancy.id}`;
        const applicationMetadata = JSON.stringify({
            applicant: {
                name: student.full_name,
                email: student.personal_email || student.normalized_email,
                phone: student.phone,
                rollNumber: student.roll_number,
                course: student.course_name,
                branch: student.branch_name,
                qualification: text(fieldValue({ fields: profileFields }, 'Qualification')),
                resume,
            },
            opening: {
                jobCode: vacancy.job_code,
                companyName: vacancy.company_name,
                title: vacancy.title,
                placementOfficer: text(fieldValue({ fields: openingFields }, 'Placement Officer', 'TPO')),
            },
            studentSourceFields: safeFields(profileFields),
            openingSourceFields: safeFields(openingFields),
        });

        await connection.execute(
            `INSERT INTO job_applications
                (id, student_id, vacancy_id, owner_tpo_user_id, status, applied_at, source, source_record_key, metadata)
             VALUES (?, ?, ?, ?, 'Applied', UTC_TIMESTAMP(), 'mysql_student_portal', ?, ?)`,
            [applicationId, student.student_id, vacancy.id, vacancy.assigned_tpo_user_id, sourceKey, applicationMetadata],
        );
        await connection.execute(
            `INSERT INTO application_status_history
                (id, application_id, previous_status, new_status, note, actor_user_id, occurred_at, metadata)
             VALUES (?, ?, NULL, 'Applied', 'Student submitted a job application.', ?, UTC_TIMESTAMP(), ?)`,
            [crypto.randomUUID(), applicationId, student.user_id, JSON.stringify({ source: 'student_portal' })],
        );
        if (ownsConnection) await connection.commit();
        return { applicationId, jobCode: vacancy.job_code };
    } catch (error) {
        if (ownsConnection) await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') {
            throw new ApplicationError(409, 'ALREADY_APPLIED', 'You have already applied for this job opening.');
        }
        throw error;
    } finally {
        if (ownsConnection) connection.release();
    }
}

module.exports = { ApplicationError, applyForOpening, getVacancyData };
