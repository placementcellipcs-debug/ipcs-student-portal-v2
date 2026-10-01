# Move the Student Portal from Google Sheets to Hostinger MySQL

**Prepared:** 30 September 2026  
**Goal:** Keep the existing student features and data while moving storage to Hostinger MySQL, with the placement API and Talenzo API remaining separate web services.

## First: the screenshot and the database password

The screenshot is context showing Hostinger's create-database form; it is not an instruction to reuse the text shown in the form. It also exposes a password. Treat that value as compromised. If it was saved or submitted, change/reset the database user's password in hPanel now. If it was not submitted, do not use that value; generate a different strong password. Do not put any database password in React/Vite variables, source code, Git, chat, or screenshots.

## The architecture to aim for

Keep the two API applications and their public URLs. Point both server-side APIs at the same canonical MySQL database if they need to read/write the same student, attendance, or placement records. MySQL is a private backend connection; the browser continues to call the API domain configured for its frontend.

```text
Placement website/browser ──HTTPS──> Placement API ──┐
                                                    ├── private MySQL connection ──> Hostinger MySQL
Talenzo website/browser ─────HTTPS──> Talenzo API ──┘

Neither browser connects directly to MySQL.
```

This does **not** merge the two APIs. They remain separate apps, deployments, route sets, and domains. It gives them a shared database so both can use the same canonical student records. Keep current API request/response shapes where possible so the student-facing frontend does not need to change its features.

There is a second design option: make one API the owner of shared student data, and have the other API call it over authenticated HTTPS. That provides a clearer data boundary, but requires service-to-service authentication and more code. A shared MySQL database is the simpler first migration if both apps run in the same Hostinger environment and need common data.

## What I found in this workspace

This workspace contains the Talenzo React frontend and its Node/Express API. It does **not** contain the separate placement API's repository or schema, so its existing tables and write behavior must be inventoried before making the shared schema. The Talenzo backend currently uses `googleapis` and has no MySQL driver. Its controllers call a `DatabaseService` that accepts Google Sheets A1 ranges; a few profile/password/document paths also call the Google Sheets SDK directly. Consequently, changing only the database credentials in Hostinger will not migrate the portal—the backend code must be changed too.

Relevant files:

- `backend/config/db.js`: Google service-account connection.
- `backend/services/dbService.js`: Sheet range reads, appends, updates, header creation, and 10-minute memory cache.
- `backend/controllers/authController.js`: login, account registration, course and branch lists.
- `backend/controllers/dashboardController.js`: dashboard data, attendance, jobs, profile, documents, password, support and drive responses.
- `backend/controllers/studentDiaryController.js`, `backend/controllers/leaveController.js`: diary and leave workflows.
- `backend/controllers/aptitudeController.js`, `backend/controllers/studyMaterialController.js`, `backend/controllers/gamePalController.js`: assessments, learning materials and games.
- `frontend/src/config/axios.js`: frontend API base URL is `VITE_API_URL`; it is an API URL, not a database URL.
- `backend/server.js`: API CORS allow-list and Google connection startup check.

The currently used Sheet names include `Data`, `Courses`, `Branches`, `Event`, `Drive_Registration`, `Talentino_Schedule`, `Talentino_Attendance`, `Student_Diary`, `Leave_Applications`, `NewsLetter`, `Opening_Applied`, `TPO_Log`, `Contact`, `Study_Materials`, question/result tabs for Aptitude/Talentino/Tech exams, support `Issues`, and GamePal stats/log/challenge/room tabs. The earlier [Student Portal Operation Report](STUDENT_PORTAL_OPERATION_REPORT.md) describes the current student flows and field mapping in more detail.

## How the two APIs connect

1. **The frontend calls an API URL.** `VITE_API_URL` in each built frontend points to the appropriate API origin. It must not contain MySQL credentials.
2. **Each API server reads its own private environment variables.** Both services may use the same `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` if both have permission to reach the same database.
3. **Each server opens a MySQL connection pool.** The API uses SQL queries on the server; API responses still return JSON for the frontend.
4. **CORS is configured for browser origins.** CORS controls which websites' browsers may call an API. It does not connect APIs to the database and does not authorize server-to-server database access. Allow the actual frontend origins explicitly; do not use `*` with credentials.
5. **Login is a separate concern from database sharing.** A shared `students` table does not automatically make JWTs issued by one API valid at the other API. Decide whether users keep separate API sessions or whether both APIs need a shared single-sign-on arrangement. The Talenzo token is currently stored in browser local storage, which is scoped to that exact origin, so `placement.ipcsglobal.info` and `talenzo.ipcsglobal.info` do not automatically share it.

The Talenzo backend's CORS list currently includes the placement production origin in code. If a browser page served from the Talenzo origin calls this backend, ensure the deployed `FRONTEND_URL` includes the exact Talenzo frontend origin, or update the allow-list. The placement API needs its own corresponding CORS configuration for the frontends that call it.

## Hostinger setup details

Hostinger's current instructions say that MySQL databases are created under the selected website in hPanel, and that the database name and user include an account prefix. Hostinger's Node.js connection guide uses environment variables and says the database host is usually `localhost` for apps on Hostinger. Use the exact host shown in the database details for your account rather than guessing.

First establish whether both Node APIs run under the **same Hostinger hosting account/server** as this database. If they do, test whether both app runtimes can reach the selected website's database using the displayed local host. If either API runs on a different Hostinger account/plan or another provider, configure Hostinger Remote MySQL with the API server's fixed outbound IP and the remote hostname shown in that page. Do not enable “Any Host” as a shortcut.

Hostinger's web/cloud hosting database instructions say each database has one database user. If both APIs access the same database on that plan, they may have to share that database credential. Store it only in the two backend apps' environment-variable settings. If separate database users with narrower permissions are required, check whether the current plan supports that; Hostinger's guidance points to VPS when multiple users per database are needed.

Use server-side variables similar to these in **each API deployment** (put actual values only in Hostinger's environment-variable UI):

```text
DB_HOST=<host shown by Hostinger>
DB_PORT=3306
DB_NAME=<full prefixed database name>
DB_USER=<full prefixed database user>
DB_PASSWORD=<new rotated secret>
```

The API process must be restarted/redeployed after changing environment variables. Set `VITE_API_URL` only in the frontend build configuration, with the corresponding HTTPS API origin.

## Data layout to preserve current behavior

Build one canonical relational schema, not one unstructured text blob. Avoid creating two independent copies of the same student for placement and Talenzo. Start with the shared entities below and add the placement API's existing entities after reviewing its code:

| Current Sheet family | Suggested MySQL table(s) | Important preservation rule |
|---|---|---|
| `Data` | `students` | One canonical student ID; normalized unique email after duplicate review; preserve all profile, access, and document URL fields. |
| `Courses`, `Branches`, `Contact` | `courses`, `branches`, `placement_contacts` | Preserve category/subcourse relationships, branch names, coordinates, and staff assignment data. |
| `Event`, `Drive_Registration` | `events`, `drive_responses` | Keep event IDs stable and responses tied to a student and event. |
| `Talentino_Schedule`, `Talentino_Attendance` | `class_sessions`, `talentino_attendance` | Preserve existing date and session eligibility behavior, ratings, feedback and recorded coordinates. |
| `Student_Diary` | `student_diary_entries` | Preserve `ATTENDANCE` and `SYLLABUS` record types, remarks, progress and GPS fields. |
| `Leave_Applications` | `leave_applications` | Preserve `Pending` and `Notified` statuses; the student sees only their own rows. |
| `NewsLetter`, `Opening_Applied`, `TPO_Log` | `job_openings`, `job_applications`, `placement_audit_log` | Preserve opening IDs, status, officer assignment, remarks, and application history. |
| `Study_Materials` | `study_materials` | Preserve active flag, target course, topic, link, and the student's material-access flag. |
| Aptitude/Talentino/Tech question and result tabs | `assessment_questions`, `assessment_results` | Preserve assessment type, test/course key, question order/content, active state, answer/explanation, score and timing. Do not expose correct answers before review. |
| GamePal tabs | `gamepal_stats`, `gamepal_logs`, `gamepal_challenges`, `gamepal_rooms`, `gamepal_room_members` | Preserve identifiers, scores, streak fields, room codes/status, timestamps, and player membership. |
| `Issues` | `support_issues` | Preserve status and staff response fields. |

Profile photos, resumes, and certificates are currently files in Google Drive referenced by URLs in `Data`; they are not the Sheet cells themselves. Keep those Drive files and URLs working through the initial database cutover. Moving files to another storage provider is a separate migration.

Use `utf8mb4` for text. Preserve source IDs/row numbers during import to make reconciliation possible. Store dates in a deliberate format, but preserve original strings during the first import if the current code expects inconsistent date formats. Review duplicate/missing student emails before adding a uniqueness constraint; do not silently merge different records.

## Step-by-step migration

### Phase A — secure and inventory

1. Rotate the password visible in the screenshot if it was saved/submitted. Confirm the database and user appear in hPanel after creation. Record the full prefixed names and host in a password manager, not in chat.
2. Confirm the Hostinger plan/account that runs each API, whether the APIs are on the same server/account, and the database's assigned website. Confirm the Node app runtime and outbound IP if remote access is needed.
3. Inventory the separate placement API: source repository, runtime/language, current database and schema, endpoints that read/write student or placement records, auth/token behavior, and any scheduled jobs. Its code is not in this workspace, so this step is required before choosing final table names or import rules.
4. Inventory the Sheet tabs, headers, row counts, formulas, IDs, duplicate emails, blank values, and file URLs. Identify which staff workflows currently edit Sheet cells.

### Phase B — back up and design

5. Export every Google Sheets tab before changing production. Keep a full spreadsheet copy plus per-tab CSV/JSON data export, and store the backups somewhere access-controlled. Also take a SQL dump of any existing placement database before merging it. Protect these exports because student data and legacy passwords may be present.
6. Write the mapping from every source Sheet/table to the new SQL schema. For each field, record type, null/default handling, source key, status values, date interpretation, and which API reads/writes it. Resolve duplicate identities explicitly.
7. Preserve legacy passwords safely. Keep existing bcrypt hashes as hashes; hash legacy plaintext values once during import so students can keep using their current passwords. Never bcrypt-hash an already-hashed value.
8. Build the schema and import script for a staging database first. Make the import idempotent (running it twice must not duplicate rows). Preserve IDs and stable references across applications, events, questions, and logs.

### Phase C — change both backends

9. Add a MySQL driver such as `mysql2/promise` to each Node backend and create a shared connection-pool module using the `DB_*` environment variables. Add a startup health check that verifies SQL connectivity and required tables without logging credentials.
10. Replace the Talenzo Sheet adapter with SQL repository methods. Keep the existing HTTP route contracts and business rules while changing storage. In particular, remove Google-specific A1-range queries and the direct Google Sheets calls in profile, document and password handlers. The current Talenzo code has both shared-helper and direct-SDK writes; all paths must move or some features will still depend on Sheets.
11. Make the placement API use the same canonical `students` identity and appropriate placement tables. Do not make both services independently invent or overwrite student records. Decide whether both APIs validate their own sessions or share a deliberately designed SSO mechanism; do not assume a common MySQL database shares JWTs.
12. Replace manual staff Sheet-edit workflows. The current portal has no staff admin UI. To preserve those operations after Sheets become read-only, provide a staff-only interface/API for job status and remarks, leave status, syllabus entries, events/schedules, materials/questions, branch/course data, and student access flags. Use explicit staff roles and audit who changed what. phpMyAdmin edits are possible as an emergency path but are not a good replacement for the operational staff workflow.

### Phase D — import and compare

13. Import a copy of all Sheet tabs and the placement API's existing records into staging. Do not import only the `Data` tab; attendance, leave, application history, events, questions, results, game stats, and staff-managed configuration are also live features.
14. Compare row counts per table, distinct student counts, duplicate emails, important sums/counts, and representative records. Verify each imported student's application/attendance/leave history stays linked to that same student. Compare document URLs and confirm files still open for the intended audience.
15. Exercise the complete feature flows in staging: signup/login, password change, profile/document update, each attendance flow, diary progress, leave submit/status change, vacancy listing/application/status update, event/drive response, study-material access, each assessment and review, support issue, and GamePal rooms/challenges/history. Check results in MySQL and the frontend.
16. Verify API authorization: student A cannot read or write student B's profile, diary, leave, applications or results by changing request-body email/IDs. Verify staff-only endpoints reject student tokens. CORS should allow only the intended frontend origins.

### Phase E — controlled production cutover

17. Schedule a short migration window. Put both applications into a temporary read-only/maintenance state so no new writes land in Sheets or the old placement database during the final copy. A zero-downtime migration needs a deliberate change-capture/dual-write-and-reconciliation design; simple dual writes can succeed in one store and fail in the other.
18. Take final backups and import the final delta. Run row-count and key-record checks again. Update both API deployments with the correct `DB_*` secrets and restart/redeploy them.
19. Run a small set of production smoke actions using controlled test accounts, then inspect MySQL rows and visible frontend results. Check both API health endpoints, runtime logs, and database connection errors.
20. Re-enable writes only after both APIs read/write the intended database. Keep the Google spreadsheet and old placement database backed up and read-only during the agreed rollback period. Do not delete them just because the first login works.
21. After the rollback period and reconciliation sign-off, revoke unused credentials/Sheet service-account access if no feature still needs it. Keep the archive according to the organization's retention policy.

### Rollback rule

Before cutover, the old Sheet and placement DB remain the recovery point. If login, authorization, counts, or any write path fails after deployment, pause writes, restore the previous API release and its prior storage configuration, and reconcile any writes made during the cutover window before reopening the old system. Never point one API back to Sheets while the other continues writing only to MySQL unless a reconciliation plan is active.

## Important behavior changes to account for

- MySQL removes the current 10-minute in-memory Sheet cache. That should make updates fresher, but verify the dashboard's refresh behavior and avoid adding an unintentional second stale cache.
- SQL writes can be transactional. Use transactions for logically paired writes such as adding a job application and placement log so one cannot be saved without the other.
- Use parameterized queries (`?` placeholders), not SQL formed by concatenating user input.
- Keep `Data` access flags and business rules during conversion. In the current code, the vacancy, study-material and technical-exam flags are checked differently; do not collapse them into one permission.
- The `Pending` value written in Data column AF is not checked by the current login controller. Do not accidentally make it block sign-in unless that is an explicit product change.
- Browser local storage continues to hold the Talenzo token/profile unless authentication is redesigned. A shared SQL database alone does not make two subdomains share browser storage or sessions.
- Add staff audit history. Google Sheets currently provides human-visible edit history; a relational database needs an explicit audit table if staff changes must remain attributable.

## Hostinger references

- [Connect a Hostinger MySQL database to a Node.js app](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)
- [Create a MySQL database in Hostinger](https://www.hostinger.com/support/1583542-how-to-create-a-new-mysql-database-in-hostinger/)
- [Set up Remote MySQL access](https://support.hostinger.com/en/articles/1583546-how-to-set-up-remote-mysql-access-in-hostinger)
- [Manage MySQL databases](https://www.hostinger.com/support/1864454-how-to-manage-mysql-databases-in-hostinger/)
