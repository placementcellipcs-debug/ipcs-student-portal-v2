# Shared MySQL database

This folder is the shared schema contract for both IPCS portals. It targets MySQL 8.0+ and MariaDB-compatible hosting, and stores student, TPO, job application, placement, drive, email, audit, and asset records in one database. Both backend services use the same Hostinger database connection settings.

## Current status

The local `ipcs_portal_dev` schema was dropped at the user's request. On 18 November 2026, both backends connected to Hostinger's MariaDB 11.8 database over TLS. Migrations 001–009 were applied successfully. A read-only capture archived 8 workbooks, 103 tabs, and 352,927 rows; all tab counts matched. Normalized imports have populated branches, courses, staff, student profiles, vacancies, monthly targets, events and drive responses, placement tracker and outcome history, companies, deletion requests, asset records, leave requests, and support issues. The archive preserves every captured row for review. Several source records have ambiguous or missing links and remain unlinked rather than being guessed. The live portal routes still use Google Sheets for most modules; no production deployment or runtime cutover has occurred. The database password was accidentally exposed in a diagnostic output, so the stored password was cleared from both local `.env` files. Rotate it in Hostinger and enter the new value locally before running more database commands.

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

The TPO backend has feature-gated MySQL implementations for the placed-student tracker, Gifty's approval of placement deletion requests, vacancy management, and staff sign-in/session checks. These use the shared `users`, `placement_tracker_records`, `tpo_delete_requests`, and `audit_events` tables. The workflows are populated in Hostinger, but their runtime feature flags remain off until the password is rotated and the updated database-backed flows are checked.

The Student backend has a feature-gated MySQL implementation for student sign-in, registration, reference catalogs, password resets, and session invalidation. Keep `MYSQL_STUDENT_AUTH_ENABLED` off until the final one-time data capture and reconciliation are complete. Its local registration/sign-in/reset check uses a transaction and rolls back the temporary account.

Student profile reads, edits, and profile document links can use MySQL behind `MYSQL_STUDENT_PROFILE_ENABLED`. It reads imported profile metadata, writes edits and document URLs to `student_profiles`, synchronizes photo links to `users`, and records audit events transactionally. The document binary upload still uses the configured file-storage service; MySQL stores the returned stable URL. Keep this flag off until the database password is rotated, the route is verified, and the coordinated cutover is ready.

The Student event calendar and placement-drive response flow use `drives` and `drive_registrations` behind `MYSQL_STUDENT_DRIVES_ENABLED`. The Hostinger snapshot contains 90 source events and 467 response rows; 386 response rows linked to unique student and drive records, 362 current registrations were imported, and 81 rows remain archived but unlinked or ambiguous. `npm run db:check-student-drives` is a rollback-only synthetic check; it has not been run against Hostinger. Keep the feature flag off until the database password is rotated, the route is verified, and the coordinated cutover is ready.

The Student backend also has a feature-gated MySQL implementation for leave-request history and submission. The legacy request row is retained by source row number, and unmatched or unclear identities remain unlinked instead of being guessed. The TPO academic leave list and approval/rejection path now reads and updates the same `student_leave_requests` table under `MYSQL_STUDENT_LEAVE_ENABLED` in the TPO backend. The staged source snapshot contains `Leave_Applications`, but not the older TPO `08_Leave_Requests` tab; reconcile any historical rows from that tab before enabling this shared flag. `npm run db:check-student-leave` and the TPO `npm run db:check-academic-leave` run synthetic request/review/audit flows in transactions and roll back all test rows.

Student issue submissions and TPO issue review now share the `support_issues` table. The one-time loader imports the archived `shared_operations:Issues` rows, retaining source IDs and raw timestamps; student submission uses the signed-in account, while TPO status/remarks edits are branch/course scoped and audited in MySQL. Keep `MYSQL_SUPPORT_ISSUES_ENABLED` off in both backends until the local checks pass and MySQL session checks are enabled with it. Preview/import commands are `npm run db:preview-support-issues` and `npm run db:load-support-issues` from the Student backend.

Historical monthly TPO targets are previewed from the staged `shared_placement:TPO_Stats` snapshot with `npm run db:preview-targets` in the Student Portal backend. `npm run db:load-targets` imports them idempotently into `placement_targets`, which is keyed by TPO and month. The current Hostinger import reconciled 13 monthly targets for October and November 2026. This import reads only the MySQL snapshot; it does not change Google Sheets.

Run `npm run db:migrate` from the Student Portal `backend` folder. Migrations create/alter SQL tables and do not write to Google Sheets.

Student job opening reads and applications can use the shared `vacancies`, `job_applications`, and `application_status_history` tables behind `MYSQL_JOB_APPLICATIONS_ENABLED`. The TPO vacancy and tracker paths use the same records, so a new application is assigned to the opening's TPO owner and appears in both portals. Review reference-data changes with `npm run db:preview-reference-data` before applying them using `npm run db:load-reference-data`; preview historical tracker rows with `npm run db:preview-placement-tracker`. Run `npm run db:check-applications` for a rollback-only local flow covering course-family eligibility, expired/mismatched openings, duplicate prevention, TPO ownership, history, and student status visibility. Keep the Student flag and TPO vacancy/tracker flags off until both systems pass their local checks and historical ownership/link gaps are reviewed. The current tracker preview has unresolved owner labels and unlinked student/opening rows; do not treat the application cutover as reconciled until those records are reviewed.

Asset workbook rows already present in the MySQL source archive can be previewed from the Student backend with `npm run db:preview-assets`. After reviewing missing IDs and duplicate asset codes, import from that MySQL snapshot with `npm run db:load-assets`. This loader makes no Google Sheets calls and imports the active V3 classifications, locations, asset register, inventory, assignments, maintenance, history, activity, documents, custom fields, and QR registry rows. Unmapped branches or asset references remain unlinked and must be reconciled before enabling asset workflows.

## Data migration approach

1. Keep the source workbooks available until every module has moved and reconciliation is signed off.
2. Import a snapshot into `source_sheet_manifest` and `source_sheet_records`. The current Hostinger snapshot preserves tab names, row numbers, headers, and cell values without changing Sheets or triggering queued emails. Legacy plaintext passwords were converted to the portal's existing password-hash format before storage.
3. Review the repeated student roll numbers and reconcile source and imported counts.
4. Map the staged rows into normalized module tables, then migrate the shared vacancy/application/job-tracker workflow as one unit so the two portals read one source of truth.
5. Use Sheets only for the one-time capture and reconciliation. After final cutover, remove Sheets runtime access and do not keep a Sheets fallback.

Student resumes, staff photos, offer letters, and asset images remain in Drive or the existing file store. Store their stable URLs or file IDs in MySQL, not the binary files.
