# Shared MySQL Database Migration Plan

## Goal

Move the IPCS Student Portal and IPCS TPO Portal to one MySQL database with one consistent record for each student, opening, application, placement, user, and shared workflow. Both backend services will connect to the same database. Google Sheets are a one-time migration source only. After cutover, neither portal will read from nor write to Google Sheets, and there will be no Sheets fallback.

## Current state found in the code

- The Student Portal reads and writes Google Sheets through `backend/services/dbService.js`. It also uses raw column ranges for some important operations, including job applications and drive registrations.
- The TPO Portal reads multiple Google workbooks through `backend/src/config.js`, loads a shared in-memory cache, and updates sheet rows directly. Assets use a separate Google Sheets configuration in `backend/src/assetConfig.js`.
- The Student and TPO backends still read/write the placement workbook in their default mode. Student applications are currently stored in `Opening_Applied`; TPO tracking reads and updates those records.
- Student, placement, learning, operations, GamePal, asset, attendance, audit, and email data are split across multiple workbooks. Some academic attendance data can use a separate branch workbook.
- Both backends now have local MySQL connection support; the Student Portal repository has versioned core schema migrations and import/verification scripts. The production APIs still use Sheets by default, and the staged migration does not make any production changes.

## Local milestone completed (2026-11-11)

- Created the local `ipcs_portal_dev` database and restricted `ipcs_local_app` account. Both local portal backends pass a connection check.
- Applied the normalized core schema and the source-snapshot staging schema.
- Imported and verified 224,465 active sheet rows from 8 workbooks and 102 tabs. The duplicate legacy asset workbook was excluded. Passwords that were plaintext in source rows were hashed before storage.
- Loaded 34 branches, 122 courses, and 519 current vacancies into the normalized tables. The source snapshot remains available for reconciliation.
- Loaded 72 email-valid staff/TPO profiles. One invalid/repeated login ID and two blank password hashes remain flagged for review.
- Loaded all 7,312 historical `Opening_Applied` and `TPO_Log` rows into the tracker archive table without collapsing repeated student/job pairs. 5,907 rows have a safely matched active TPO owner; unresolved ownership remains reviewable.
- Added a feature-gated MySQL student application write and a feature-gated TPO tracker list/update path. New application writes share the canonical `job_applications` table; legacy tracker rows retain their archived source-row identity. TPO ownership is filtered using the authenticated account and resolved database owner, not browser-supplied names.
- Read-only local integration check returned 2,058 tracker records for an admin and 240 for a selected active TPO account; returned record IDs were stable and unique, and the TPO result matched its database owner scope. Both feature flags remain off, so deployed behavior has not changed.
- Added a MySQL-only Student Portal authentication path for sign-in, registration, course/branch catalogs, password reset, and session revocation. It uses bcrypt hashes, transactional one-time reset tokens, and users.session_version; the student snapshot loader carries forward matching Auth_Sessions versions. A local transaction check completed registration, bcrypt sign-in, password reset, audit insertion, and session rotation, then confirmed the test account and token were rolled back. MYSQL_STUDENT_AUTH_ENABLED remains off.
- Student import preview currently finds 2,557 unique-roll profiles (2,553 with valid logins), with 102 rows excluded for missing/repeated roll numbers and 4 valid-roll profiles lacking a login. Of 141 archived session-version rows, 132 match eligible student logins. These are preview counts from the existing snapshot, not proof of current live data.
- Added a MySQL-backed vacancy/application read endpoint for the Student Portal. A read-only local check returned 132 course-eligible openings for one active student; opening IDs were present and unique, and the application validation/duplicate guard passed without writing a row.
- Added local-only MySQL vacancy management for the TPO Portal: list, create, edit, company directory upsert, audit history, and Gifty's approve/reject flow for vacancy deletion. Approved openings are archived with status `deleted`; linked application and tracker history remain intact. Added one-time snapshot loaders for the company directory and deletion-request history. The `MYSQL_VACANCY_MANAGEMENT_ENABLED` flag remains off.
- Added a local-only MySQL path for the TPO placed-student tracker and its deletion approvals. TPO placement rows are owner/branch scoped; deletion requests require Gifty's approval; approval archives the `TPO_Log` and uniquely matched `Opening_Applied` row, preserves audit history, and restores a linked canonical application from `placed` when prior status history exists. A rollback-only local approval check exercises the complete review path without keeping any test rows. `MYSQL_PLACEMENT_TRACKER_ENABLED` remains off until a fresh source snapshot and broader cutover checks are complete.
- Added schema migration `004_vacancy_management.sql` for the company directory, job-code sequence, vacancy edit history, and deletion-request workflow. The TPO UI no longer describes an opening as being saved to the `NewsLetter` sheet.
- Added schema migration 005_student_auth.sql for student session versions and one-time reset tokens.
- The imported local snapshot is stale compared with the live portal: Job 10531 is a Service Engineer / Industrial Automation opening locally, while the attached live screen shows a Digital Marketing Executive opening. Refresh the source snapshot and normalized vacancies once immediately before cutover, then rerun course-matching checks. Do not enable the student MySQL application flag against this stale snapshot.
- This is not a cutover yet: application email notifications, offer/placement side effects, manual interview creation, drive registrations, student profile updates/documents, and many other portal modules still need MySQL-backed implementations before production flags should be enabled. The application and vacancy read paths also need checks against a fresh one-time import; the present local snapshot is known to be stale. Student authentication and placed-student deletion have local MySQL implementations, but both still require final checks against the refreshed snapshot before activation.
- The live Student and TPO APIs still use Sheets today. This is a temporary state only; do not disconnect them until every API route has been migrated and tested against MySQL.

## Latest local verification (2026-11-14)

- The archived source capture completed on 2026-11-12 at 18:29 UTC. Snapshot verification found 8 workbooks, 103 tabs, and 265,489 non-header rows, with all stored tab counts matching the import manifest. This supersedes the earlier row totals above, but it is not a final cutover capture; run one last read-only capture and normalized reload immediately before cutover.
- The archived-data quality scan found 67 `User` rows and 8 `Contact` rows, no repeated staff email addresses, six staff rows with no name, two repeated `User_ID` values, six sitting-branch values and ten assigned-branch values that do not match the branch catalog. These records need reconciliation in MySQL before removing the source archive.
- The rollback-only TPO admin-user verifier passed add, edit, list, authentication, profile-photo, target, deactivation, directory metadata, audit, and multi-course assignment round trips. The test transaction was rolled back; this did not enable the TPO MySQL admin path in production.
- The rollback-only TPO asset verifier passed item edit and audited archive, damage/maintenance, assignment, transfers, disposal approval, inventory, and read views; all simulated changes were rolled back. The verifier now skips the legacy Sheet-cache startup refresh so a MySQL-only check does not call Google Sheets.
- These checks validate local code and the current archived snapshot only. Feature flags remain off, and the production APIs have not been switched. Course-matrix gaps, unresolved job-tracker ownership/link rows, stale vacancy data, and remaining Sheets-backed modules still block final cutover.

## Shared core schema

Use stable numeric or UUID primary keys. Keep human-facing IDs such as roll number and Job ID as unique business keys with normalized lookup columns where needed.

| Table | Purpose |
| --- | --- |
| `students` | One master student profile, including roll number, contact details, course, branch, resume reference, and profile state. |
| `users`, `student_profiles` | Student/TPO/admin sign-in identities and student records. Store password hashes only; never plaintext passwords. TPO profile details, photo URL, position, description, birthday, employee ID, and branch assignments are retained. |
| `branches`, `courses`, `user_branch_assignments`, `user_course_assignments` | Shared branch/course catalog and staff scope. |
| `vacancies` | Job openings, stable Job ID, company, course eligibility, deadlines, and assigned TPO. |
| `job_applications` | One student's application to one vacancy, with a unique `(student_id, vacancy_id)` constraint. |
| `application_status_history` | Append-only status and interview history linked to an application and actor. |
| `placement_outcomes` | Placement/offer/joining details, linked to the student and source application where possible. Supports multiple outcomes per student. |
| `placement_events`, `drive_registrations` | Shared events/drives and student registrations, with a unique drive/student pair. |
| `audit_events` | Security and important data-change audit trail. |
| `email_outbox`, `email_delivery_attempts` | Reliable email queue and delivery history, linked to the related application/event when available. |

The remaining modules should use separate related tables rather than adding more unrelated columns to `students`: academic schedules/attendance/assessments, leaves and diaries, study materials, assets and asset history, clients, issues, inquiries, GamePal, and mail/accounting records.

Files such as resumes, offer letters, profile photos, and asset photos should remain in Drive or another file store during the first migration. Store the stable file ID or URL in MySQL; do not store file bytes in database rows.

## Rules the database should enforce

- Application ownership comes from `vacancies.assigned_tpo_user_id`; it is not inferred from branch or a client-supplied TPO name.
- A student may apply only once to a vacancy. The database unique key is the final duplicate guard, even if two requests arrive together.
- TPO reads and updates must filter by the authenticated staff user and the vacancy's assigned TPO.
- Status history is append-only; changing the current status must not erase prior events.
- Student, vacancy, application, drive, and placement writes that belong together use transactions.
- Email is queued after the business transaction commits. Retried requests must not send duplicate mail.
- Each backend uses parameterized queries. Credentials are provided through deployment environment variables and are never committed to either repository.

## Migration sequence

1. **One-time source capture:** copy the current Sheets data into the MySQL migration archive and record tab/header lists and row counts. Identify duplicate roll numbers, emails, Job IDs, and applications before adding any constraints.
2. **Create MySQL schema:** add versioned SQL migrations and a migration runner. Provision the database with TLS, automated backups, and separate application/migration users.
3. **Import and reconcile:** load students, staff, branches, courses, vacancies, applications, and placement history. Produce a report for duplicates, missing owners, invalid dates, and rows that cannot be linked. Do not silently discard those rows.
4. **Move the shared workflow first:** switch vacancy reads, student applications, and the TPO Job Tracker to MySQL. Verify that both portals see the same application and that only the assigned TPO can read or update it.
5. **Move other modules in phases:** drives/events, placement outcomes, users/authentication, academic modules, assets, inquiries, email logs, and remaining modules. Keep file storage separate.
6. **Compare before cutover:** compare row counts and sampled totals against the captured source snapshot. Run a final import of changes made since the local snapshot, deploy both MySQL-backed APIs, verify critical flows, then remove Sheets runtime configuration and code paths. Do not keep a Sheets fallback or use Sheets after cutover.

## Important rollout constraint

Do not let both Google Sheets and MySQL independently accept production writes for the same workflow. That creates conflicting copies. Sheets are used only to capture existing data. Each workflow switches to MySQL only after its MySQL route is ready; the final cutover ends all Sheets runtime access.

## First implementation milestone

The initial schema, source snapshot importer, normalized reference loaders, student/staff profile loaders, placement history loader, vacancy maintenance workflow, and first application/tracker API slices are in place locally. Continue with read-only integration checks and migrate all side effects and related routes before enabling any feature flag outside local testing.
