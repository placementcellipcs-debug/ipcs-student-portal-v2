const test = require('node:test');
const assert = require('node:assert/strict');
const { profileFromRow, registrationFields, StudentAuthError } = require('../services/mysqlStudentAuthService');

test('student sign-in response maps the actual imported Data sheet headers', () => {
    const result = profileFromRow({
        email: 'student@example.invalid',
        full_name: 'Test Student',
        phone: null,
        profile_phone: null,
        roll_number: 'IPCS-1001',
        course_name: 'Digital Marketing',
        branch_name: 'Trivandrum',
        profile_photo_url: '',
        resume_url: 'https://files.example.invalid/resume.pdf',
        profile_metadata: {
            fields: {
                'Phone No.': '9000000000',
                'Your Home Town': 'Kollam',
                'LinkedIn Profile Link': 'https://linkedin.example.invalid/student',
                'Instagram ID': '@student',
                'Any Specific Requirement For Placement': 'Remote roles',
                'Name (Friend 1)': 'Friend One',
                'Contact Number': '9111111111',
                'Name (Friend 2)': 'Friend Two',
                'Contact Number 2': '9222222222',
                'Course Status': 'Currently Studying',
                'IPCS Course Completed Date': 'N/A',
                'Technial Exam': 'Allowed',
            },
        },
    });

    assert.equal(result.phone, '9000000000');
    assert.equal(result.homeTown, 'Kollam');
    assert.equal(result.linkedin, 'https://linkedin.example.invalid/student');
    assert.equal(result.instagram, '@student');
    assert.equal(result.placementReq, 'Remote roles');
    assert.equal(result.friend1Name, 'Friend One');
    assert.equal(result.friend1Phone, '9111111111');
    assert.equal(result.friend2Name, 'Friend Two');
    assert.equal(result.friend2Phone, '9222222222');
    assert.equal(result.studyStatus, 'Currently Studying');
    assert.equal(result.completedDate, 'N/A');
    assert.equal(result.techExamAccess, 'Allowed');
    assert.equal(result.resume, 'https://files.example.invalid/resume.pdf');
});

test('new registrations preserve the legacy student profile keys without saving credentials in profile metadata', () => {
    const fields = registrationFields({
        name: 'Test Student',
        phone: '9000000000',
        rollNo: 'IPCS-1001',
        joiningDate: '2026-01-02',
        course: 'Digital Marketing',
        branch: 'Trivandrum',
        homeTown: 'Kollam',
        linkedin: 'https://linkedin.example.invalid/student',
        instagram: '@student',
        placementReq: 'Remote roles',
        friend1Name: 'Friend One',
        friend1Phone: '9111111111',
        friend2Name: 'Friend Two',
        friend2Phone: '9222222222',
        password: 'this must not be stored',
    }, 'student@example.invalid', 'https://files.example.invalid/photo.jpg', new Date('2026-01-01T00:00:00.000Z'));

    assert.equal(fields['Phone No.'], '9000000000');
    assert.equal(fields['Profile Photo'], 'https://files.example.invalid/photo.jpg');
    assert.equal(fields['Your Home Town'], 'Kollam');
    assert.equal(fields['Name (Friend 1)'], 'Friend One');
    assert.equal(fields['Contact Number 2'], '9222222222');
    assert.equal(fields['Course Status'], 'Currently Studying');
    assert.equal(fields['Technial Exam'], 'Pending');
    assert.equal(fields.Password, undefined);
    assert.equal(fields['Mail ID'], 'student@example.invalid');
});

test('student-auth errors carry stable HTTP status and API code', () => {
    const error = new StudentAuthError(409, 'ACCOUNT_ALREADY_EXISTS', 'Account exists.');
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ACCOUNT_ALREADY_EXISTS');
});
