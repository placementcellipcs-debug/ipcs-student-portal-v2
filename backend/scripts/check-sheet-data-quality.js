const mysqlPool = require('../config/mysqlPool');

const asText = value => String(value ?? '').trim();
const normalized = value => asText(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');

function getField(record, ...names) {
    const fields = record?.fields || {};
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
    }
    return '';
}

function parseJson(value) {
    return typeof value === 'string' ? JSON.parse(value) : value;
}

function duplicateOccurrences(values) {
    const counts = new Map();
    for (const value of values.map(normalized).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function missingCount(records, ...names) {
    return records.filter(record => !asText(getField(record, ...names))).length;
}

function duplicatePairOccurrences(records, leftNames, rightNames) {
    const keys = records.map(record => {
        const left = normalized(getField(record, ...leftNames));
        const right = normalized(getField(record, ...rightNames));
        return left && right ? `${left}\u0000${right}` : '';
    });
    return duplicateOccurrences(keys);
}

function isBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ''));
}

function isScryptHash(value) {
    return /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{20,30}\$[A-Za-z0-9_-]{80,100}$/.test(String(value || ''));
}

async function loadRows(pool, sourceKey, tabName) {
    const [rows] = await pool.execute(
        'SELECT row_data_json FROM source_sheet_records WHERE source_key = ? AND tab_name = ? ORDER BY sheet_row_number',
        [sourceKey, tabName],
    );
    return rows.map(row => parseJson(row.row_data_json));
}

async function main() {
    const pool = mysqlPool.getPool();
    try {
        const [latestRows] = await pool.execute(
            `SELECT id, status FROM source_import_runs ORDER BY started_at DESC LIMIT 1`,
        );
        if (latestRows[0]?.status !== 'completed') throw new Error('The latest source import must complete before data-quality checks run.');

        const [students, jobs, applied, tracker, placements, events, driveRegistrations, users, contacts, assets, branches, courseMatrix] = await Promise.all([
            loadRows(pool, 'shared_student_data', 'Data'),
            loadRows(pool, 'shared_placement', 'NewsLetter'),
            loadRows(pool, 'shared_placement', 'Opening_Applied'),
            loadRows(pool, 'shared_placement', 'TPO_Log'),
            loadRows(pool, 'shared_placement', 'Placed_Students'),
            loadRows(pool, 'shared_placement', 'Event'),
            loadRows(pool, 'shared_placement', 'Drive_Registration'),
            loadRows(pool, 'shared_operations', 'User'),
            loadRows(pool, 'shared_operations', 'Contact'),
            loadRows(pool, 'tpo_asset', 'Asset_Register_V3'),
            loadRows(pool, 'shared_operations', 'Branches'),
            loadRows(pool, 'shared_learning', 'Courses'),
        ]);

        const jobIds = new Set(jobs.map(row => normalized(getField(row, 'JOBID', 'Job ID'))).filter(Boolean));
        const eventIds = new Set(events.flatMap(row => ['Event_ID', 'Drive ID'].map(name => normalized(getField(row, name))).filter(Boolean)));
        const knownDriveIds = new Set([...jobIds, ...eventIds]);
        const missingApplicationJob = applied.filter(row => {
            const jobId = normalized(getField(row, 'Job ID'));
            return jobId && !jobIds.has(jobId);
        }).length;
        const missingTrackerJob = tracker.filter(row => {
            const jobId = normalized(getField(row, 'Job ID'));
            return jobId && !jobIds.has(jobId);
        }).length;
        const missingDriveReference = driveRegistrations.filter(row => {
            const driveId = normalized(getField(row, 'Drive ID'));
            return driveId && !knownDriveIds.has(driveId);
        }).length;
        const userEmails = new Set(users.map(row => normalized(getField(row, 'Email'))).filter(Boolean));
        const contactEmails = new Set(contacts.map(row => normalized(getField(row, 'Mail ID'))).filter(Boolean));
        const userContactEmailOverlap = [...userEmails].filter(email => contactEmails.has(email)).length;
        const studentEmails = new Set(students.map(row => normalized(getField(row, 'Mail ID', 'Email'))).filter(Boolean));
        const staffEmails = new Set([...userEmails, ...contactEmails]);
        const courseNamesFromStudentRows = new Set(students.map(row => normalized(getField(row, 'Course'))).filter(Boolean));
        const courseNamesFromMatrix = new Set(courseMatrix.flatMap(row => (row.cells || []).map(normalized)).filter(Boolean));
        const branchNames = branches.map(row => getField(row, 'Branch'));
        const knownBranchNames = new Set(branchNames.map(normalized).filter(Boolean));
        const knownCourseNames = new Set([...courseNamesFromStudentRows, ...courseNamesFromMatrix]);
        const studentBranchNames = students.map(row => normalized(getField(row, 'Branch'))).filter(Boolean);
        const studentRollCounts = new Map();
        for (const row of students) {
            const roll = normalized(getField(row, 'IPCS Roll Number', 'Roll No', 'Roll Number')).replace(/\s+/g, '');
            if (roll) studentRollCounts.set(roll, (studentRollCounts.get(roll) || 0) + 1);
        }
        const staffEmployeeIds = [
            ...users.map(row => getField(row, 'Employee_ID')),
            ...contacts.map(row => getField(row, 'Emp ID')),
        ];
        const userSittingBranches = users.map(row => normalized(getField(row, 'Sitting_Branch'))).filter(Boolean);
        const contactSittingBranches = contacts.map(row => normalized(getField(row, 'Sitting Branch'))).filter(Boolean);
        const assignedBranches = [
            ...contacts.map(row => getField(row, 'Assigned Branches')),
            ...users.map(row => getField(row, 'Assigned_Branches')),
        ].flatMap(value => String(value || '').split(/[,;|]/).map(normalized));
        const invalidSystemEmails = users.filter(row => {
            const email = asText(getField(row, 'Email'));
            return email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        });
        const invalidContactEmails = contacts.filter(row => {
            const email = asText(getField(row, 'Mail ID'));
            return email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        });
        const invalidStudentEmails = students.filter(row => {
            const email = asText(getField(row, 'Mail ID', 'Email'));
            return email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        });

        const report = {
            studentData: {
                rows: students.length,
                missingRollNumber: missingCount(students, 'IPCS Roll Number', 'Roll No', 'Roll Number'),
                repeatedRollNumbers: duplicateOccurrences(students.map(row => getField(row, 'IPCS Roll Number', 'Roll No', 'Roll Number'))),
                missingEmail: missingCount(students, 'Mail ID', 'Email'),
                invalidEmail: invalidStudentEmails.length,
                repeatedEmails: duplicateOccurrences(students.map(row => getField(row, 'Mail ID', 'Email'))),
                emailMatchesExistingStaff: [...studentEmails].filter(email => staffEmails.has(email)).length,
                rowsWithUniqueRollNumber: [...studentRollCounts.values()].filter(count => count === 1).length,
                missingName: missingCount(students, 'Name'),
                branchNamesNotInBranchCatalog: studentBranchNames.filter(name => !knownBranchNames.has(name)).length,
                uniqueCourseNamesNotInCatalog: [...courseNamesFromStudentRows].filter(name => !knownCourseNames.has(name)).length,
            },
            vacancies: {
                rows: jobs.length,
                missingJobId: missingCount(jobs, 'JOBID', 'Job ID'),
                repeatedJobIds: duplicateOccurrences(jobs.map(row => getField(row, 'JOBID', 'Job ID'))),
                missingTitle: missingCount(jobs, 'Position', 'Title'),
                missingCompany: missingCount(jobs, 'Company Name', 'Company'),
            },
            openingApplications: {
                rows: applied.length,
                missingRollNumber: missingCount(applied, 'Roll Number', 'Roll No'),
                missingJobId: missingCount(applied, 'Job ID'),
                repeatedStudentJobPairs: duplicatePairOccurrences(applied, ['Roll Number', 'Roll No'], ['Job ID']),
                unknownNonblankJobIds: missingApplicationJob,
            },
            tpoJobTracker: {
                rows: tracker.length,
                missingRollNumber: missingCount(tracker, 'Roll Number', 'Roll No'),
                missingJobId: missingCount(tracker, 'Job ID'),
                repeatedStudentJobPairs: duplicatePairOccurrences(tracker, ['Roll Number', 'Roll No'], ['Job ID']),
                unknownNonblankJobIds: missingTrackerJob,
            },
            placedStudents: {
                rows: placements.length,
                missingRecordKey: missingCount(placements, 'Record Key'),
                repeatedRecordKeys: duplicateOccurrences(placements.map(row => getField(row, 'Record Key'))),
            },
            eventsAndDrives: {
                events: events.length,
                repeatedEventIds: duplicateOccurrences(events.map(row => getField(row, 'Event_ID'))),
                driveRegistrations: driveRegistrations.length,
                unknownNonblankDriveIds: missingDriveReference,
            },
            staff: {
                users: users.length,
                repeatedUserEmails: duplicateOccurrences(users.map(row => getField(row, 'Email'))),
                contacts: contacts.length,
                repeatedContactEmails: duplicateOccurrences(contacts.map(row => getField(row, 'Mail ID'))),
            },
            activeAssets: {
                rows: assets.length,
                missingAssetId: missingCount(assets, 'Asset_ID'),
                repeatedAssetIds: duplicateOccurrences(assets.map(row => getField(row, 'Asset_ID'))),
            },
            referenceCatalogs: {
                branchRows: branches.length,
                missingBranchNames: missingCount(branches, 'Branch'),
                repeatedNormalizedBranchNames: duplicateOccurrences(branchNames),
                uniqueStudentCourses: courseNamesFromStudentRows.size,
                courseMatrixValues: courseNamesFromMatrix.size,
                studentCoursesMissingFromMatrix: [...courseNamesFromStudentRows].filter(course => !courseNamesFromMatrix.has(course)).length,
            },
            staffMergeReview: {
                userContactEmailOverlap,
                userRowsMissingEmail: missingCount(users, 'Email'),
                contactRowsMissingEmail: missingCount(contacts, 'Mail ID'),
                userRowsMissingName: missingCount(users, 'Name'),
                contactRowsMissingName: missingCount(contacts, 'TPO Name'),
                userRowsMissingRole: missingCount(users, 'Role'),
                repeatedEmployeeIds: duplicateOccurrences(staffEmployeeIds),
                repeatedSystemUserIds: duplicateOccurrences(users.map(row => getField(row, 'User_ID'))),
                invalidSystemEmails: invalidSystemEmails.length,
                invalidSystemEmailsWithEmployeeId: invalidSystemEmails.filter(row => asText(getField(row, 'Employee_ID'))).length,
                invalidSystemEmailsWithUserId: invalidSystemEmails.filter(row => asText(getField(row, 'User_ID'))).length,
                invalidContactEmails: invalidContactEmails.length,
                userSittingBranchNamesNotInBranchList: userSittingBranches.filter(name => !knownBranchNames.has(name)).length,
                contactSittingBranchNamesNotInBranchList: contactSittingBranches.filter(name => !knownBranchNames.has(name)).length,
                assignedBranchNamesNotInBranchList: assignedBranches.filter(name => name && !knownBranchNames.has(name)).length,
            },
            passwordStorage: {
                studentDataNonemptyPasswordsWithoutBcryptHash: students.filter(row => {
                    const password = asText(getField(row, 'Password'));
                    return password && !isBcryptHash(password);
                }).length,
                staffNonemptyPasswordsWithoutScryptHash: [...users, ...contacts].filter(row => {
                    const password = asText(getField(row, 'Password'));
                    return password && !isScryptHash(password);
                }).length,
                staffRowsWithoutPassword: [...users, ...contacts].filter(row => !asText(getField(row, 'Password'))).length,
                studentRowsWithoutPassword: students.filter(row => !asText(getField(row, 'Password'))).length,
            },
        };

        console.log(JSON.stringify(report, null, 2));
        console.log('Counts only; no names, emails, roll numbers, or row contents were printed.');
    } finally {
        await mysqlPool.close();
    }
}

main().catch(error => {
    console.error(`Migration quality check failed: ${error.message}`);
    process.exitCode = 1;
});
