const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');
const { formatDateTimeIndia } = require('../utils/portalDateTime');

const text = value => String(value ?? '').normalize('NFKC').trim();
const normalizeEmail = value => text(value).toLocaleLowerCase('en-US');

class SupportIssueError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function submitStudentIssue({ email, details, location = 'Student Portal', requestId }, suppliedConnection = null) {
    const normalizedEmail = normalizeEmail(email);
    const issueDetails = text(details).slice(0, 2000);
    const issueLocation = text(location || 'Student Portal').slice(0, 120);
    if (!normalizedEmail) throw new SupportIssueError(401, 'SESSION_REQUIRED', 'Please sign in again.');
    if (!issueDetails) throw new SupportIssueError(400, 'ISSUE_DETAILS_REQUIRED', 'Describe the issue before submitting.');

    const ownsConnection = !suppliedConnection;
    const connection = suppliedConnection || await mysqlPool.getPool().getConnection();
    try {
      if (ownsConnection) await connection.beginTransaction();
      const [students] = await connection.execute(
        `SELECT u.id AS user_id, u.email, u.full_name, u.phone,
                sp.id AS student_id, sp.roll_number, sp.branch_id, sp.course_id,
                b.name AS branch_name, c.name AS course_name
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN branches b ON b.id = sp.branch_id
         LEFT JOIN courses c ON c.id = sp.course_id
         WHERE u.normalized_email = ? AND u.role = 'student'
           AND u.status = 'active' AND sp.status = 'active'
         LIMIT 2`,
        [normalizedEmail],
      );
      if (!students.length) throw new SupportIssueError(404, 'STUDENT_PROFILE_NOT_FOUND', 'Student profile was not found.');
      if (students.length > 1) throw new SupportIssueError(409, 'STUDENT_IDENTITY_AMBIGUOUS', 'Your student profile needs staff review before an issue can be submitted.');
      const student = students[0];
      const id = crypto.randomUUID();
      const reportedAtRaw = formatDateTimeIndia();
      await connection.execute(
        `INSERT INTO support_issues
           (id, student_id, student_email, student_name, phone, roll_number, branch_id, course_id,
            branch_name, course_name, location, details, status, reported_at, reported_at_raw,
            source, source_record_key, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', UTC_TIMESTAMP(), ?, 'student_portal', ?,
                 JSON_OBJECT('origin', 'student_portal'))`,
        [id, student.student_id, normalizedEmail, text(student.full_name) || 'Student', text(student.phone) || null,
          text(student.roll_number) || null, student.branch_id, student.course_id, student.branch_name,
          student.course_name, issueLocation || null, issueDetails, reportedAtRaw, id],
      );
      await connection.execute(
        `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at, request_id, details)
         VALUES (?, ?, 'support_issue_created', 'support_issue', ?, UTC_TIMESTAMP(), ?, ?)`,
        [crypto.randomUUID(), student.user_id, id, text(requestId) || null, JSON.stringify({ location: issueLocation || null })],
      );
      if (ownsConnection) await connection.commit();
      return { id, message: 'Issue reported successfully!' };
    } catch (error) {
      if (ownsConnection) await connection.rollback().catch(() => {});
      throw error;
    } finally {
      if (ownsConnection) connection.release();
    }
}

module.exports = { SupportIssueError, submitStudentIssue };
