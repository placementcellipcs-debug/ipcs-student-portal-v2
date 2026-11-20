const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const PLACEHOLDERS = new Set(['n/a', 'na', 'none', 'unknown', 'select', 'not available']);

function normalized(value) {
    return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function getField(record, ...names) {
    const fields = record?.fields || {};
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
    }
    return '';
}

function cleanValue(value) {
    const result = String(value ?? '').trim();
    return !result || PLACEHOLDERS.has(result.toLocaleLowerCase('en-US')) ? '' : result;
}

function makeId(scope, key) {
    const bytes = crypto.createHash('sha256').update(`${scope}:${key}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseMysqlDate(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/);
    let year;
    let month;
    let day;
    if (match) {
        [, year, month, day] = match;
    } else {
        match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        if (match) {
            [, day, month, year] = match;
            if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
        } else {
            const parsed = new Date(text);
            if (Number.isNaN(parsed.getTime())) return null;
            year = String(parsed.getUTCFullYear());
            month = String(parsed.getUTCMonth() + 1);
            day = String(parsed.getUTCDate());
        }
    }

    const yyyy = Number(year);
    const mm = Number(month);
    const dd = Number(day);
    const check = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (check.getUTCFullYear() !== yyyy || check.getUTCMonth() !== mm - 1 || check.getUTCDate() !== dd) return null;
    return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function canonicalVacancyStatus(value) {
    const status = normalized(value);
    if (!status) return 'open';
    if (/closed|expired|inactive|filled|cancelled|canceled/.test(status)) return 'closed';
    if (/draft|pending|review/.test(status)) return 'draft';
    if (/open|active|published|approved/.test(status)) return 'open';
    return status.slice(0, 40).replace(/\s+/g, '_');
}

async function loadRows(pool, sourceKey, tabName) {
    const [rows] = await pool.execute(
        'SELECT sheet_row_number, row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
        [sourceKey, tabName],
    );
    return rows.map(row => ({
        rowNumber: Number(row.sheet_row_number),
        data: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json) : row.row_data_json,
    }));
}

async function insertBranches(connection, branchRows) {
    let saved = 0;
    for (const { rowNumber, data } of branchRows) {
        const name = cleanValue(getField(data, 'Branch'));
        if (!name) continue;
        const normalizedName = normalized(name);
        const region = cleanValue(getField(data, 'Region / State', 'Region', 'State')) || null;
        const metadata = JSON.stringify({ source: 'shared_operations:Branches', sourceRow: rowNumber, fields: data.fields });
        await connection.execute(
            `INSERT INTO branches (id, name, normalized_name, region, metadata)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), region = VALUES(region), metadata = VALUES(metadata)`,
            [makeId('branch', normalizedName), name.slice(0, 160), normalizedName.slice(0, 160), region?.slice(0, 120) || null, metadata],
        );
        saved += 1;
    }
    return saved;
}

function collectCourses(studentRows, matrixRows) {
    const courses = new Map();
    const add = (name, source, rowNumber, category = '') => {
        const cleanName = cleanValue(name);
        const key = normalized(cleanName);
        if (!cleanName || !key) return;
        const existing = courses.get(key);
        if (existing) {
            existing.sources.push({ source, rowNumber });
            if (category && !existing.category) existing.category = cleanValue(category);
        } else courses.set(key, { id: makeId('course', key), name: cleanName, key, category: cleanValue(category), sources: [{ source, rowNumber }] });
    };

    // The first course group is stored in the sheet's column header rather
    // than in the first data row. Preserve that group so the first block of
    // courses (currently BMS AND CCTV) receives the same category mapping as
    // all groups that follow it.
    let currentCategory = cleanValue(Object.keys(matrixRows[0]?.data?.fields || {})[0] || '');
    if (currentCategory) add(currentCategory, 'shared_learning:Courses:category', 1);
    for (const { rowNumber, data } of matrixRows) {
        const cells = (data.cells || []).map(cleanValue);
        if (cells[0]) {
            currentCategory = cells[0];
            add(currentCategory, 'shared_learning:Courses:category', rowNumber);
        }
        for (const courseName of cells.slice(1)) {
            if (courseName) add(courseName, 'shared_learning:Courses', rowNumber, currentCategory);
        }
    }
    for (const { rowNumber, data } of studentRows) add(getField(data, 'Course'), 'shared_student_data:Data', rowNumber);

    return courses;
}

async function insertCourses(connection, courses) {
    for (const course of courses.values()) {
        const metadata = JSON.stringify({ sources: course.sources, category: course.category || null });
        await connection.execute(
            `INSERT INTO courses (id, name, normalized_name, category, active, metadata)
             VALUES (?, ?, ?, ?, TRUE, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), active = TRUE, metadata = VALUES(metadata)`,
            [course.id, course.name.slice(0, 200), course.key.slice(0, 200), course.category.slice(0, 160) || null, metadata],
        );
    }
    return courses.size;
}

function parseJson(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function stableJson(value) {
    if (Array.isArray(value)) return value.map(stableJson);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
}

function previewImport({ branches, studentRows, courseMatrix, vacancyRows, tpoRows, currentBranches, currentCourses, currentVacancies }) {
    const branchCandidates = new Map();
    for (const row of branches) {
        const name = cleanValue(getField(row.data, 'Branch'));
        const key = normalized(name);
        if (key) branchCandidates.set(key, { name, region: cleanValue(getField(row.data, 'Region / State', 'Region', 'State')) });
    }
    const courseCandidates = collectCourses(studentRows, courseMatrix);
    const currentBranchMap = new Map(currentBranches.map(row => [normalized(row.normalized_name), row]));
    const currentCourseMap = new Map(currentCourses.map(row => [normalized(row.normalized_name), row]));
    const currentVacancyMap = new Map(currentVacancies.map(row => [normalized(row.job_code), row]));

    const owners = new Map();
    const ownerCounts = new Map();
    for (const tpo of tpoRows) {
        const key = normalized(tpo.full_name);
        if (!key) continue;
        owners.set(key, tpo.id);
        ownerCounts.set(key, (ownerCounts.get(key) || 0) + 1);
    }
    for (const [key, count] of ownerCounts) if (count !== 1) owners.delete(key);

    const uniqueVacancies = new Map();
    let incompleteVacancyRows = 0;
    for (const { data } of vacancyRows) {
        const jobCode = cleanValue(getField(data, 'JOBID', 'Job ID'));
        const title = cleanValue(getField(data, 'Position', 'Title'));
        const companyName = cleanValue(getField(data, 'Company Name', 'Company'));
        if (!jobCode || !title || !companyName) { incompleteVacancyRows += 1; continue; }
        const key = normalized(jobCode);
        const placementOfficer = cleanValue(getField(data, 'Placement Officer', 'TPO', 'Placement TPO'));
        uniqueVacancies.set(key, {
            jobCode,
            title,
            companyName,
            companyWebsite: String(getField(data, 'Company Website') ?? '').trim() || null,
            location: String(getField(data, 'Opening AT ( Location )', 'Location') ?? '').trim().slice(0, 240) || null,
            description: String(getField(data, 'Job Description', 'Description') ?? '').trim() || null,
            qualification: String(getField(data, 'Qualification') ?? '').trim().slice(0, 500) || null,
            employmentType: String(getField(data, 'Work Mode') ?? '').trim().slice(0, 80) || null,
            salary: String(getField(data, 'Salary') ?? '').trim().slice(0, 120) || null,
            applyBy: parseMysqlDate(getField(data, 'Last Date', 'Apply By', 'Application Deadline')),
            status: canonicalVacancyStatus(getField(data, 'Status')),
            sourceOwner: placementOfficer,
            owner: owners.get(normalized(placementOfficer)) || null,
            fields: data.fields || {},
        });
    }

    let changedExistingVacancies = 0;
    let changedMappedVacancyFields = 0;
    let changedRawVacancyMetadata = 0;
    let existingVacanciesWithSourceFields = 0;
    let existingAssignmentsPreserved = 0;
    let existingAssignmentsFilledFromUniqueSource = 0;
    const vacancyDifferencesByField = Object.fromEntries([
        'title', 'companyName', 'companyWebsite', 'location', 'description', 'qualification',
        'employmentType', 'salary', 'applyBy', 'status',
    ].map(field => [field, 0]));
    let existingVacancyKeys = 0;
    let newVacancyKeys = 0;
    let additionalNonSnapshotVacancies = 0;
    for (const [key, vacancy] of uniqueVacancies) {
        const existing = currentVacancyMap.get(key);
        if (!existing) { newVacancyKeys += 1; continue; }
        existingVacancyKeys += 1;
        const existingMetadata = parseJson(existing.metadata);
        const fieldComparisons = {
            title: [existing.title, vacancy.title],
            companyName: [existing.company_name, vacancy.companyName],
            companyWebsite: [existing.company_website || null, vacancy.companyWebsite],
            location: [existing.location || null, vacancy.location],
            description: [existing.description || null, vacancy.description],
            qualification: [existing.qualification || null, vacancy.qualification],
            employmentType: [existing.employment_type || null, vacancy.employmentType],
            salary: [existing.salary_text || null, vacancy.salary],
            applyBy: [existing.apply_by ? (existing.apply_by instanceof Date ? existing.apply_by.toISOString().slice(0, 10) : String(existing.apply_by).slice(0, 10)) : null, vacancy.applyBy],
            status: [existing.status, vacancy.status],
        };
        if (existing.assigned_tpo_user_id && existing.assigned_tpo_user_id !== vacancy.owner) existingAssignmentsPreserved += 1;
        if (!existing.assigned_tpo_user_id && vacancy.owner) existingAssignmentsFilledFromUniqueSource += 1;
        for (const [field, [before, after]] of Object.entries(fieldComparisons)) {
            if (before !== after) vacancyDifferencesByField[field] += 1;
        }
        const mappedFieldsChanged = Object.values(fieldComparisons).some(([before, after]) => before !== after);
        const hasSourceFields = Boolean(existingMetadata.fields && typeof existingMetadata.fields === 'object');
        const rawMetadataChanged = hasSourceFields
            && JSON.stringify(stableJson(existingMetadata.fields)) !== JSON.stringify(stableJson(vacancy.fields));
        if (mappedFieldsChanged) changedMappedVacancyFields += 1;
        if (hasSourceFields) existingVacanciesWithSourceFields += 1;
        if (rawMetadataChanged) changedRawVacancyMetadata += 1;
        if (mappedFieldsChanged || rawMetadataChanged || !hasSourceFields) changedExistingVacancies += 1;
    }
    additionalNonSnapshotVacancies = currentVacancies.filter(row => row.source !== 'google_sheets_snapshot'
        && !uniqueVacancies.has(normalized(row.job_code))).length;

    const branchKeys = new Set(branchCandidates.keys());
    const courseKeys = new Set(courseCandidates.keys());
    return {
        mode: 'preview',
        archivedSourceRows: { branches: branches.length, studentProfiles: studentRows.length, courseMatrix: courseMatrix.length, vacancies: vacancyRows.length },
        candidateReferenceKeys: { branches: branchKeys.size, courses: courseKeys.size, vacancies: uniqueVacancies.size },
        currentNormalizedRows: { branches: currentBranches.length, courses: currentCourses.length, vacancies: currentVacancies.length },
        changes: {
            newBranches: [...branchKeys].filter(key => !currentBranchMap.has(key)).length,
            newCourses: [...courseKeys].filter(key => !currentCourseMap.has(key)).length,
            newVacancies: newVacancyKeys,
            existingVacanciesWithSourceChanges: changedExistingVacancies,
            existingVacanciesWithMappedFieldChanges: changedMappedVacancyFields,
            existingVacanciesWithChangedSourceMetadata: changedRawVacancyMetadata,
            existingVacanciesWithSourceMetadataFields: existingVacanciesWithSourceFields,
            existingPortalTpoAssignmentsPreserved: existingAssignmentsPreserved,
            unassignedVacanciesWithUnambiguousSourceTpo: existingAssignmentsFilledFromUniqueSource,
            sourceFieldDifferenceCounts: vacancyDifferencesByField,
            vacancyRowsWithUnresolvedSourceOwner: [...uniqueVacancies.values()].filter(vacancy => vacancy.sourceOwner && !vacancy.owner).length,
            sourceVacancyKeysAlreadyPresent: existingVacancyKeys,
            extraNonSnapshotVacanciesPreservedByImporter: additionalNonSnapshotVacancies,
            incompleteVacancyRowsSkippedByImporter: incompleteVacancyRows,
            duplicateSourceJobCodeRows: vacancyRows.length - incompleteVacancyRows - uniqueVacancies.size,
        },
        writes: 0,
    };
}

async function insertVacancies(connection, vacancyRows, courseRows, tpoRows) {
    const courseIds = new Map(courseRows.map(course => [course.key, course.id]));
    const ownersByName = new Map();
    const ownerCounts = new Map();
    for (const tpo of tpoRows) {
        const key = normalized(tpo.full_name);
        if (!key) continue;
        ownersByName.set(key, tpo.id);
        ownerCounts.set(key, (ownerCounts.get(key) || 0) + 1);
    }
    for (const [key, count] of ownerCounts) if (count !== 1) ownersByName.delete(key);
    let saved = 0;
    let linkedCourseCount = 0;
    let assignedTpoCount = 0;
    let unresolvedTpoCount = 0;

    for (const { rowNumber, data } of vacancyRows) {
        const jobCode = cleanValue(getField(data, 'JOBID', 'Job ID'));
        const title = cleanValue(getField(data, 'Position', 'Title'));
        const companyName = cleanValue(getField(data, 'Company Name', 'Company'));
        if (!jobCode || !title || !companyName) continue;

        const id = makeId('vacancy', normalized(jobCode));
        const description = String(getField(data, 'Job Description', 'Description') ?? '').trim() || null;
        const qualification = String(getField(data, 'Qualification') ?? '').trim() || null;
        const workMode = String(getField(data, 'Work Mode') ?? '').trim() || null;
        const salary = String(getField(data, 'Salary') ?? '').trim() || null;
        const applyBy = parseMysqlDate(getField(data, 'Last Date', 'Apply By', 'Application Deadline'));
        const status = canonicalVacancyStatus(getField(data, 'Status'));
        const placementOfficer = cleanValue(getField(data, 'Placement Officer', 'TPO', 'Placement TPO'));
        const ownerTpoUserId = ownersByName.get(normalized(placementOfficer)) || null;
        if (ownerTpoUserId) assignedTpoCount += 1;
        else if (placementOfficer) unresolvedTpoCount += 1;
        const metadata = JSON.stringify({
            source: 'shared_placement:NewsLetter',
            sourceRow: rowNumber,
            fields: data.fields,
            courseText: String(getField(data, 'Course') ?? '').trim(),
        });

        await connection.execute(
            `INSERT INTO vacancies
                (id, job_code, title, company_name, company_website, location, description, qualification,
                 employment_type, salary_text, apply_by, status, assigned_tpo_user_id, source, source_record_key, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google_sheets_snapshot', ?, ?)
             ON DUPLICATE KEY UPDATE
                title = VALUES(title), company_name = VALUES(company_name), company_website = VALUES(company_website),
                location = VALUES(location), description = VALUES(description), qualification = VALUES(qualification),
                employment_type = VALUES(employment_type), salary_text = VALUES(salary_text), apply_by = VALUES(apply_by),
                status = VALUES(status), assigned_tpo_user_id = COALESCE(assigned_tpo_user_id, VALUES(assigned_tpo_user_id)),
                source_record_key = VALUES(source_record_key), metadata = VALUES(metadata)`,
            [
                id,
                jobCode.slice(0, 100),
                title.slice(0, 240),
                companyName.slice(0, 240),
                String(getField(data, 'Company Website') ?? '').trim() || null,
                String(getField(data, 'Opening AT ( Location )', 'Location') ?? '').trim().slice(0, 240) || null,
                description,
                qualification?.slice(0, 500) || null,
                workMode?.slice(0, 80) || null,
                salary?.slice(0, 120) || null,
                applyBy,
                status,
                ownerTpoUserId,
                jobCode.slice(0, 200),
                metadata,
            ],
        );

        await connection.execute('DELETE FROM vacancy_courses WHERE vacancy_id = ?', [id]);
        const courseText = String(getField(data, 'Course') ?? '').trim();
        const candidateCourses = courseText.split(/[,;|]/).map(value => normalized(value)).filter(Boolean);
        let linkedThisVacancy = false;
        for (const courseKey of new Set(candidateCourses)) {
            const courseId = courseIds.get(courseKey);
            if (!courseId) continue;
            await connection.execute(
                'INSERT IGNORE INTO vacancy_courses (vacancy_id, course_id) VALUES (?, ?)',
                [id, courseId],
            );
            linkedThisVacancy = true;
        }
        if (linkedThisVacancy) linkedCourseCount += 1;
        saved += 1;
    }
    return { saved, linkedCourseCount, assignedTpoCount, unresolvedTpoCount };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const pool = mysqlPool.getPool();
    const connection = await pool.getConnection();
    try {
        const [runs] = await connection.execute('SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1');
        if (runs[0]?.status !== 'completed') throw new Error('Import the source-sheet snapshot and verify it before normalizing reference data.');

        const [branches, studentRows, courseMatrix, vacancyRows, tpoRows, currentBranches, currentCourses, currentVacancies] = await Promise.all([
            loadRows(connection, 'shared_operations', 'Branches'),
            loadRows(connection, 'shared_student_data', 'Data'),
            loadRows(connection, 'shared_learning', 'Courses'),
            loadRows(connection, 'shared_placement', 'NewsLetter'),
            connection.execute("SELECT id, full_name FROM users WHERE role = 'tpo' AND status <> 'inactive'").then(([rows]) => rows),
            connection.execute('SELECT normalized_name, region, metadata FROM branches').then(([rows]) => rows),
            connection.execute('SELECT normalized_name, name, category FROM courses').then(([rows]) => rows),
            connection.execute('SELECT job_code, title, company_name, company_website, location, description, qualification, employment_type, salary_text, apply_by, status, assigned_tpo_user_id, source, metadata FROM vacancies').then(([rows]) => rows),
        ]);

        if (!apply) {
            console.log(JSON.stringify(previewImport({ branches, studentRows, courseMatrix, vacancyRows, tpoRows, currentBranches, currentCourses, currentVacancies }), null, 2));
            console.log('Preview only; no normalized rows were written and no names, emails, or job details were printed.');
            return;
        }

        await connection.beginTransaction();
        const branchCount = await insertBranches(connection, branches);
        const courseCount = await insertCourses(connection, collectCourses(studentRows, courseMatrix));

        const normalizedCourseRows = [];
        for (const { data } of studentRows) {
            const name = cleanValue(getField(data, 'Course'));
            const key = normalized(name);
            if (name && !normalizedCourseRows.some(course => course.key === key)) {
                normalizedCourseRows.push({ key, id: makeId('course', key) });
            }
        }
        for (const { data } of courseMatrix) {
            for (const nameValue of data.cells || []) {
                const name = cleanValue(nameValue);
                const key = normalized(name);
                if (name && !normalizedCourseRows.some(course => course.key === key)) {
                    normalizedCourseRows.push({ key, id: makeId('course', key) });
                }
            }
        }

        const vacancyCounts = await insertVacancies(connection, vacancyRows, normalizedCourseRows, tpoRows);
        await connection.commit();

        const [tableCounts] = await connection.execute(
            `SELECT
                (SELECT COUNT(*) FROM branches) AS branches,
                (SELECT COUNT(*) FROM courses) AS courses,
                (SELECT COUNT(*) FROM vacancies) AS vacancies,
                (SELECT COUNT(*) FROM vacancy_courses) AS vacancy_course_links`,
        );
        console.log(JSON.stringify({
            status: 'completed',
            sourceRowsMapped: { branches: branchCount, courses: courseCount, vacancies: vacancyCounts.saved },
            vacanciesLinkedToKnownCourses: vacancyCounts.linkedCourseCount,
            vacanciesAssignedToUnambiguousTpos: vacancyCounts.assignedTpoCount,
            vacancyOwnersNeedingReview: vacancyCounts.unresolvedTpoCount,
            normalizedTablesNowContain: {
                branches: Number(tableCounts[0].branches),
                courses: Number(tableCounts[0].courses),
                vacancies: Number(tableCounts[0].vacancies),
                vacancyCourseLinks: Number(tableCounts[0].vacancy_course_links),
            },
        }));
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(`Reference data load failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        connection.release();
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Reference data load could not start: ${error.message}`);
    process.exitCode = 1;
});
