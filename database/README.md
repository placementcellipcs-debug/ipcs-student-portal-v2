# Shared MySQL database

This folder is the shared schema contract for both IPCS portals. It targets MySQL 8.0+ and MariaDB-compatible hosting, and stores student, TPO, job application, placement, drive, email, audit, and asset records in one database. Both backend services use the same Hostinger database connection settings.

## Current status

The local `ipcs_portal_dev` schema was dropped at the user's request. On 19 November 2026, both backends connected to Hostinger's MariaDB 11.8 database over TLS. Migrations 001–018 are applied. The approval-request and notification tables added by migration 017 are empty and ready for new TPO edit requests. The latest read-only capture archived 8 workbooks, 103 tabs, and 361,976 rows. The follow-up cell comparison found no text differences in captured rows; 95 newer rows appeared in the live TPO portal audit tab while the sheets were still receiving writes. Run one final capture and reconciliation during the cutover write pause. Source rows, sheet row numbers, headers, and displayed cell values are retained in the archive; earlier versions of changed and removed rows are retained in history. Legacy plaintext passwords are converted to secure hashes, and formulas are represented by their displayed result rather than formula text. Normalized imports cover branches, courses, staff, students and account-creation dates, vacancies, targets, drives, tracker and application history, outcomes, companies, deletion requests, assets, leave, support issues, GamePal, mail history, academic attendance, assessments, and Student Diary. The six assessment tabs now have 1,069 normalized rows with the original cell values retained. Ambiguous links remain unlinked rather than guessed. The live routes still use Sheets for most modules; no production deployment or runtime cutover has occurred. A previously exposed database credential was replaced and is stored only in the local backend environment files.

## Connection settings

Use these environment variables in each backend's local `.env` and deployment settings. Keep credentials private and do not commit a filled-in `.env` file.

```dotenv
MYSQL_HOST=srv1836.hstgr.io
MYSQL_PORT=3306
MYSQL_DATABASE=u382772772_ipcstalenzo_db
MYSQL_USER=u382772772_ipcstalenzoapi
MYSQL_PASSWORD=enter-the-Hostinger-password-locally
MYSQL_SSL=true
```

The database provider must permit connections from both backend services. Use a restricted application account for each service, TLS in production, automated backups, and a separate account for schema migrations. Hostinger's current database returned MariaDB 11.8.9; schema migrations were made compatible with its JSON and collation behavior.

## Migrations

- `migrations/001_core.sql` creates the initial normalized tables.
- `migrations/002_sheet_snapshot_archive.sql` creates a staging archive for the source rows and import runs.
- `migrations/003_placement_tracker.sql` preserves imported opening and TPO tracker history.
- `migrations/004_vacancy_management.sql` adds the company directory, vacancy edit history, job-code sequence, and deletion approvals.
- `migrations/005_student_auth.sql` adds MySQL session versions and one-time password-reset tokens for the Student Portal.
- `migrations/006_student_leave_requests.sql` adds the Student Portal's isolated leave/absence request history and submission records.
- `migrations/007_support_issues.sql` creates the shared support register used by Student issue submissions and TPO issue resolution.
- `migrations/008_application_history_sequence.sql` preserves the exact save order of job application updates, even when multiple changes share the same second.
- `migrations/009_asset_management.sql` adds normalized asset classifications, physical assets and locations, maintenance tickets, assignments, audit history, supporting asset records, and stock transactions.
- `migrations/010_gamepal.sql` adds GamePal sessions, score summaries, group rooms, room members, and friend challenges.
- `migrations/011_mail_history.sql` preserves mail logs, delivery attempts, quota usage, and historical queue summaries without re-activating old email payloads.
- `migrations/012_legacy_application_history.sql` records source-row identities for imported status events and keeps missing historical dates null.
- `migrations/013_academic_attendance.sql` stores source-linked academic attendance while preserving unlinked student identifiers and source details.
- `migrations/014_source_snapshot_history.sql` retains earlier sheet rows and tab manifests when the source archive is refreshed.
- `migrations/015_student_diary.sql` stores Student_Diary attendance and syllabus records with source-row and audit details.
- `migrations/016_assessments.sql` stores Aptitude, Talentino, and Technical question/result rows with their original cell arrays.

The TPO backend has feature-gated MySQL implementations for the placed-student tracker, Gifty's approval of placement deletion requests, vacancy management, and staff sign-in/session checks. These use the shared `users`, `placement_tracker_records`, `tpo_delete_requests`, and `audit_events` tables. The workflows are populated in Hostinger, but their runtime feature flags remain off until the database-backed flows are checked as part of the coordinated cutover.

The Student backend has a feature-gated MySQL implementation for student sign-in, registration, reference catalogs, password resets, and session invalidation. Keep `MYSQL_STUDENT_AUTH_ENABLED` off until the final one-time data capture and reconciliation are complete. Its registration/sign-in/reset check uses a transaction and rolls back the temporary account; do not aim local-only checks at the shared Hostinger database.

Student profile reads, edits, and profile document links can use MySQL behind `MYSQL_STUDENT_PROFILE_ENABLED`. It reads imported profile metadata, writes edits and document URLs to `student_profiles`, synchronizes photo links to `users`, and records audit events transactionally. The document binary upload still uses the configured file-storage service; MySQL stores the returned stable URL. Keep this flag off until the route is verified and the coordinated cutover is ready.

The Student event calendar and placement-drive response flow use `drives` and `drive_registrations` behind `MYSQL_STUDENT_DRIVES_ENABLED`. The current normalized import contains 91 source events and 518 response rows; 386 response rows linked to unique student and drive records, 362 current registrations were imported, and 132 rows remain archived but unlinked or ambiguous. `npm run db:check-student-drives` is a rollback-only synthetic check; do not run it against the shared Hostinger database. Keep the feature flag off until the route is verified and the coordinated cutover is ready.

The Student backend also has a feature-gated MySQL implementation for leave-request history and submission. The legacy request row is retained by source row number, and unmatched or unclear identities remain unlinked instead of being guessed. The TPO academic leave list and approval/rejection path now reads and updates the same `student_leave_requests` table under `MYSQL_STUDENT_LEAVE_ENABLED` in the TPO backend. The staged source snapshot contains `Leave_Applications`, but not the older TPO `08_Leave_Requests` tab; reconcile any historical rows from that tab before enabling this shared flag. `npm run db:check-student-leave` and the TPO `npm run db:check-academic-leave` run synthetic request/review/audit flows in transactions and roll back all test rows.

GamePal history from all five source tabs is normalized in Hostinger: 289 sessions, 71 current score summaries, 11 rooms, 29 room-member rows, and one friend challenge. Repeated room memberships remain separate. The MySQL GamePal service is available behind `MYSQL_GAMEPAL_ENABLED`; it is off by default. `npm run db:check-gamepal` checks the dashboard, history, leaderboard, and friend-challenge SQL reads without writing data or printing student details. Live room/challenge/game submissions are not exercised by that read-only check.

Mail history is in Hostinger: 2,686 logs, 1,263 delivery attempts, 1,799 quota events, and 101 queue summaries. The quota sheet contains two side-by-side layouts; both are mapped. Historical queue rows are not active outbox messages, and their payloads are not copied to `email_outbox`. Sender credentials remain in protected environment settings, not MySQL. Mail reporting and sending still use Sheets until `MYSQL_EMAIL_ENABLED` is deliberately enabled after worker and report checks.

Student issue submissions and TPO issue review now share the `support_issues` table. The one-time loader imports the archived `shared_operations:Issues` rows, retaining source IDs and raw timestamps; student submission uses the signed-in account, while TPO status/remarks edits are branch/course scoped and audited in MySQL. Keep `MYSQL_SUPPORT_ISSUES_ENABLED` off in both backends until the local checks pass and MySQL session checks are enabled with it. Preview/import commands are `npm run db:preview-support-issues` and `npm run db:load-support-issues` from the Student backend.

The 14,956 rows from `shared_learning:Attendance` are imported into `academic_attendance_records`. All source rows have dates and branches, 7,945 link to a course, and 22 student IDs match one unique student roll number. The remaining 14,934 IDs are preserved without assigning them to a student. `npm run db:check-academic-attendance` confirms every archived row appears once, with no duplicate source keys. This is the academic attendance history only; `Talentino_Attendance` and the `Student_Diary` check-in flow are separate features and are not switched to MySQL by this import.

Historical monthly TPO targets are previewed from the staged `shared_placement:TPO_Stats` snapshot with `npm run db:preview-targets` in the Student Portal backend. `npm run db:load-targets` imports them idempotently into `placement_targets`, which is keyed by TPO and month. The current Hostinger import reconciled 13 monthly targets for October and November 2026. This import reads only the MySQL snapshot; it does not change Google Sheets.

Run `npm run db:migrate` from the Student Portal `backend` folder. Migrations create/alter SQL tables and do not write to Google Sheets.

Student job opening reads and applications use the shared `vacancies`, `job_applications`, and `application_status_history` tables behind `MYSQL_JOB_APPLICATIONS_ENABLED` (still off). The refreshed legacy application import contains 2,128 canonical applications and 3,002 stored history rows; 205 rows without a reliable student/opening link remain archived. 1,848 applications have an unambiguous TPO owner; 280 need owner review. The latest tracker import contains 8,509 source rows; 93 rows lack a usable date, 1,357 owner labels need review, and 3,080 rows lack a student or opening link. Keep the Student flag and TPO vacancy/tracker flags off until the remaining modules and historical ownership/link gaps are reviewed and the coordinated cutover is ready.

Asset workbook rows already present in the MySQL source archive can be previewed from the Student backend with `npm run db:preview-assets`. After reviewing missing IDs and duplicate asset codes, import from that MySQL snapshot with `npm run db:load-assets`. This loader makes no Google Sheets calls and imports the active V3 classifications, locations, asset register, inventory, assignments, maintenance, history, activity, documents, custom fields, and QR registry rows. Unmapped branches or asset references remain unlinked and must be reconciled before enabling asset workflows.

Student Study Materials can read the `Study_Materials` and `Courses` tabs from the MySQL source archive behind `MYSQL_STUDY_MATERIALS_ENABLED`. Student eligibility and course access are checked against the MySQL student profile and the archived course catalog; material links remain URLs and their files stay in their existing file storage.

Student Aptitude, Talentino, and Technical exams can read questions and prior results, and append new results, through `assessment_records` behind `MYSQL_ASSESSMENTS_ENABLED`. The TPO Portal's Aptitude/Talentino question editors and result screens use these same records when that switch is enabled; staff changes are audited. The imported question/result rows keep their original cells and sheet row numbers. `npm run db:check-assessments` compares each of the six tab counts with the source archive; the switch remains off in both APIs until coordinated route checks and the final write pause.

The student home dashboard's reference lists (events, drives, schedule, Talentino attendance history, openings, and TPO contact cards) can read from the MySQL source archive behind `MYSQL_STUDENT_DASHBOARD_READS_ENABLED`. Profile, drive, and job application data use their normalized MySQL services when those switches are enabled. The dashboard archive switch remains off until all related staff write paths are moved and the final snapshot is reconciled.

Student Diary uses `student_diary_entries` behind `MYSQL_STUDENT_DIARY_ENABLED`. `npm run db:preview-student-diary` and `npm run db:load-student-diary` read the exact captured `Student_Diary` rows from MySQL. Attendance submissions write to MySQL with the student's access, branch schedule, geofence, duplicate-for-today, and audit checks. The archived tab currently has zero source rows, so there were no historical diary records to normalize.

Migration 017 adds `student_profile_change_requests` and `portal_notifications`. With `MYSQL_STUDENT_DIRECTORY_ENABLED` enabled in the TPO backend, TPOs submit full student edits to MySQL for Gifty's review; approval updates the canonical student profile in the same transaction, rejection leaves it unchanged, and a decision notification is stored for the requesting TPO. This approval workflow no longer writes to the student Sheet. Migration 018 allows ambiguous or incomplete source rows to use the same approval process through a separate MySQL override, without merging them into another student's profile or changing the immutable import archive. The TPO directory read check returned all 2,801 source rows: 2,685 normalized profiles plus 116 source-only records, and no password fields. Placement rows with repeated student roll numbers are left unlinked rather than assigned to one of the source-only records. Keep the TPO flag off until the live staff directory has been reconciled against the source archive and the coordinated cutover is ready.

## Data migration approach

1. Keep the source workbooks available until every module has moved and reconciliation is signed off.
2. Import a snapshot into `source_sheet_manifest` and `source_sheet_records`. The archive preserves tab names, row numbers, headers, and displayed cell values without changing Sheets or triggering queued emails. Legacy plaintext passwords are converted to secure one-way hashes; formulas are stored as their displayed results.
3. Review the repeated student roll numbers and reconcile source and imported counts.
4. Map the staged rows into normalized module tables, then migrate the shared vacancy/application/job-tracker workflow as one unit so the two portals read one source of truth.
5. Use Sheets only for the one-time capture and reconciliation. After final cutover, remove Sheets runtime access and do not keep a Sheets fallback.

Student resumes, staff photos, offer letters, and asset images remain in Drive or the existing file store. Store their stable URLs or file IDs in MySQL, not the binary files.
