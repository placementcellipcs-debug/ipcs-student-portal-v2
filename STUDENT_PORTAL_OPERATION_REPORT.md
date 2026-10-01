# IPCS Student Portal: How It Works

**Prepared:** 30 September 2026  
**Scope:** This report describes behavior visible in this repository's frontend and backend code. It does not inspect the live Google Sheet, Google account permissions, deployed environment variables, or production logs, so it cannot identify the actual people who currently have Sheet access or confirm live row contents.

## 1. The short system map

The student portal is a React application. It sends requests to an Express/Node.js API. The API reads and writes Google Sheets using the Google Sheets API and a backend service-account credential. Student browsers do not connect to the Sheet directly and do not receive the service-account credential.

```text
Student browser / installed app
  ├─ React pages and browser storage (session token, profile snapshot, preferences)
  └─ HTTPS/HTTP requests with Authorization: Bearer <JWT>
          ↓
Express API (backend)
  ├─ verifies the JWT for protected routes
  ├─ looks up the signed-in student's row and applies feature rules
  ├─ reads a short-lived in-memory cache
  └─ Google Sheets API, authenticated as the backend service account
          ↓
Google spreadsheet(s): student records, jobs, events, attendance, exams, etc.

Some profile files → Apps Script upload endpoint → Google Drive; the returned file URL is saved in the student row.
Career Hub articles → public RSS feeds fetched by the backend, not student records in Sheets.
```

The main connection is in `backend/config/db.js`: it loads `backend/google-credentials.json` and requests Sheets and Drive scopes. The spreadsheet ID is supplied through the backend environment variable `SPREADSHEET_ID`. GamePal can use a separate `GAMEPAL_SPREADSHEET_ID`; if that is not configured, it falls back to the main spreadsheet. The code expects these credentials and IDs to be configured outside the frontend bundle.

`backend/services/dbService.js` is the shared storage layer. It reads named ranges such as `Data!A:AG`, appends rows, updates rows, retries Google quota/rate-limit errors, and keeps read results in an in-memory cache. This is a Google-Sheets-backed app, not a conventional SQL database.

## 2. Student signup and login

### Signup

1. The signup page first requests course choices from `/api/auth/courses` and branch choices from `/api/auth/branches`. Those lists come from `Courses!A:B` and `Branches!B:C`.
2. The student fills in identity, contact, course, branch, education, placement-preference, referral, and password details, uploads a profile photo, and accepts the displayed terms.
3. The browser sends the form to `POST /api/auth/register`.
4. The backend checks `Data!A:AG` for an existing email. If a photo was supplied, it sends it to the configured Apps Script endpoint, which returns a Google Drive URL.
5. The backend hashes the new password with bcrypt and appends a student row to the `Data` sheet. It then returns success and the signup page redirects to login. The signup page does not start the logged-in session from that response.

Signup is a public API route: it has no JWT requirement. The code prevents duplicate email registrations by checking the current sheet data, but it does not consult an administrator or enforce an approval workflow before adding the row.

### Login

1. The browser sends email and password to `POST /api/auth/login`.
2. The backend reads `Data!A:AG`, searches rows from bottom to top, and compares the email without case sensitivity.
3. It accepts either an exact plaintext password match for legacy records or a bcrypt match for hashed records. New registrations and password changes use bcrypt hashes.
4. On a match, the backend issues a JWT that expires in seven days. The token contains the student's email, roll number, and branch. The response also includes a profile object with the student's other profile fields.
5. The browser saves the token as `talentino_student_token` and the profile snapshot as `talentino_student_user` in `localStorage`, then opens the dashboard.

The Axios client attaches the stored token to API calls as `Authorization: Bearer …`. Backend middleware verifies the token signature and expiry, then makes its claims available as `req.user`. Most dashboard endpoints require that middleware. The React dashboard layout also redirects to login when it cannot find a locally stored user email, but that check is a convenience for the screen; API authorization is enforced by the backend.

## 3. What is stored for a student

The `Data` tab is the central student record. The controllers use fixed column positions rather than loading a formal schema for this tab. The following is the field-to-column mapping implied by those reads and writes; keep the existing column order stable:

| Column | Field used by the app |
|---|---|
| A | Registration/created timestamp |
| B–D | Name, phone, email |
| E | Password (bcrypt for new records; older plaintext is still accepted) |
| F–J | Roll number, joining date, course, branch, profile-photo URL |
| K–Q | Home town, qualification, stream, fresher/experience status, LinkedIn, Instagram, placement requirements |
| R–U | Two referral names and phone numbers |
| V | Resume URL |
| W–X | Parent/guardian name and contact |
| Y–Z | Study status and course completion date |
| AA–AB | Age and gender |
| AC | Certificate URL |
| AD | Vacancy-opening access flag; code treats `yes`, `true`, or `1` as enabled |
| AE | Study-material access flag; code treats `yes`, `true`, or `1` as enabled |
| AF | Signup currently writes `Pending` here. I found no code that checks this value before login, so it is not an approval gate in this app version. |
| AG | Technical-exam access flag; code treats `yes`, `true`, or `1` as enabled |

Blank cells are often represented in the frontend as values such as `N/A`, “Not provided,” or “Not set.” The row is not just login data: it also supplies the identity and eligibility data used for profile, job matching, material access, and assessment access.

## 4. What the dashboard loads and displays

After login, `DashboardLayout` posts to `/api/dashboard/data`. The backend derives the student's email from the verified token, finds the matching row in `Data`, then reads several other tabs and builds a tailored response. The frontend uses that response to update the shared dashboard context and refresh the local profile snapshot.

The dashboard response includes:

- **Profile summary:** name, phone, email, roll number, joining date, course, branch, photo, education and placement fields, document URLs, and access flags.
- **Placement summary:** the student's applications, counts of applications/interviews/offers, and vacancy details matched against their course and the `Data` vacancy-access flag.
- **Events and placement drives:** events are filtered to the student's branch or “All”; drive registrations are filtered to the student's email.
- **Attendance summary:** schedule rows are matched to the student's branch; attendance rows are matched to the student's email. The response includes attendance history and whether a session is scheduled today or attendance has been marked today.
- **Placement contact:** a placement officer is selected from the `Contact` tab based on assigned branch. A fallback contact is returned if there is no match.

The home page turns this into the welcome greeting, upcoming-events list, application progress cards, vacancy link, and quick actions. Application Status and Events pages also request dashboard data for their detail views. The Job Openings page uses the vacancy and applied-job arrays, then submits applications to a separate endpoint.

One visual detail: the login page's “Live Hiring Updates” ticker and its large headline hiring totals are hard-coded frontend content, not live values read from a Sheet. GamePal scores shown on the dashboard are separately fetched from GamePal endpoints.

## 5. The main Sheets and what they drive

| Sheet / source | Purpose and student-facing effect |
|---|---|
| `Data` | Student account, profile, documents, and access flags. Most user-specific APIs find the row by the email in the signed-in JWT. |
| `Courses` | Course categories and course names. Used for signup choices and course matching for jobs, study materials, and technical exams. |
| `Branches` | Branch/region list. Columns D and E are used as campus latitude/longitude for attendance checks. |
| `Event` | Events and drives, including date, branch, type, title, description, time, location, poster, and ID. Branch-matched events appear in the portal. |
| `Drive_Registration` | Student responses to a placement drive, including event ID, identity/course/branch, resume, response status, and timestamp. |
| `Talentino_Schedule` | Session schedule by date and branch. Used to determine whether attendance is available for a branch on a day. |
| `Talentino_Attendance` | Traditional Talentino check-ins, with student details, coordinates, rating/feedback, and date. The Talentino page and dashboard summary read it. |
| `Student_Diary` | Diary attendance and syllabus progress. The portal creates the tab with documented headers on first use if it is missing. Students can mark attendance; staff can add syllabus rows. |
| `Leave_Applications` | Leave requests and absence notices. The portal creates this tab with headers on first use. Students see only rows whose email matches their token. |
| `NewsLetter` | Job-opening content and status. The backend filters openings by course, expiry/open status, and the student's vacancy access. |
| `Opening_Applied` | Job applications and placement status. The student sees only their own application rows and status/remarks. |
| `TPO_Log` | A second placement log row is added when a student applies for a vacancy. |
| `Contact` | Placement officer contact and branch assignments, used in Help/Contact TPO. |
| `Study_Materials` | Material ID, target course, topic, title, file type, link, and active status. Access also requires the student's `Data` AE flag. Links are converted to an embeddable viewer URL by the backend. |
| `Aptitude_Questions`, `Aptitude_Results` | Aptitude questions and submitted results. Results feed the student's history and the top-ten aggregate leaderboard. The leaderboard route is public in the current route file. |
| `Talentino_Questions`, `Talentino_Results` | Talentino assessment questions and results, including test progression and answer review. |
| `Tech_Questions`, `Tech_Results` | Course-filtered technical exams/results. Starting or submitting a technical exam also checks the `Data` AG access flag. |
| `GamePal_Stats`, `GamePal_Logs` | Scores, streaks, and game-session history. Uses the separate GamePal spreadsheet if configured. |
| `GamePal_Challenges`, `GamePal_Rooms`, `GamePal_Room_Members` | Friend challenges and group-game rooms; these tabs can be initialized by the backend with headers. |
| `Issues` | Support requests submitted from Help; the app records them as `Pending`. |
| Career Hub RSS | Articles are fetched from public feeds by the backend and cached for 15 minutes. Saved articles are stored in the student's browser, not in Sheets. |
| Browser local storage | Theme, accent, read-notification IDs, drive snoozes/responses, GamePal daily goals, and some local progress. These values are per-browser and are not the main student record. |

## 6. What students can change from the portal

The frontend exposes actions, but the backend is the part that decides which cells to write. For most student actions it ignores any email supplied in the request body and uses the email in the verified JWT.

| Student action | Backend effect in Sheets or other service |
|---|---|
| Edit profile | Updates only home town, qualification, stream, fresher/experience status, LinkedIn, Instagram, placement requirements, parent details, study status/completion date, age, and gender in the student's `Data` row. Name, roll number, branch, email, and course are shown as non-editable core identity fields. |
| Upload photo, resume, certificate | Sends the file to the Apps Script upload service/Drive, then stores its returned URL in `Data` J, V, or AC respectively. Resume/certificate uploads must be PDFs; photos must be images. |
| Change password | Verifies the current password, hashes the new one, and updates `Data` E. |
| Mark Talentino attendance | Checks time, schedule, branch coordinates and distance, then appends to `Talentino_Attendance`. The code limits check-in to 9:30 AM–7:00 PM India time, requires a scheduled branch session, and uses a 1,000 metre geofence. |
| Mark Student Diary attendance | Appends an `ATTENDANCE` row in `Student_Diary` with identity, date, GPS coordinates, and distance. Requires a scheduled session, valid GPS, 9:30 AM–7:00 PM India time, no existing mark that day, and a location within 1,000 metres. |
| Submit leave / absence notice | Appends a row in `Leave_Applications`. A leave request starts as `Pending`; an absence notice starts as `Notified`. It does not itself approve a leave request. |
| Apply for a job | Checks opening, course, deadline, experience status, duplicate application, and resume; appends to `Opening_Applied` and `TPO_Log`. |
| Respond to a placement drive | Checks the drive ID, branch, date, duplicate response, and status, then appends to `Drive_Registration`. A successful registration can also send an email if email credentials are configured. |
| Submit an issue | Appends student identity, issue details, timestamp, and `Pending` status to `Issues`. |
| Complete an assessment | Questions are read from question tabs; the backend grades the session and appends the result to the corresponding results tab. Session state is held in backend memory until submission/expiry. |
| Play GamePal | Appends a game log and updates or adds the student's GamePal stats row. Challenges and room membership/scores also write to their GamePal tabs. |

Students cannot update Student Diary syllabus rows through a portal form. The documented publishing method is for an authorized staff member to add a `SYLLABUS` row with the student's email in column B, topic in J, progress in K, and optional remarks in L. The backend filters these entries to the signed-in student's email and the frontend displays the latest progress plus its history.

## 7. Who can change what

There are three different write paths:

1. **A student using the portal:** can make the specific changes listed above. The normal API paths use the student's JWT identity and write through the backend service account. The frontend does not expose a general-purpose Sheet editor.
2. **A person with direct Google Sheet edit permission:** can edit any cells allowed by that person's Google sharing permissions. The repository documents staff edits for syllabus rows and leave statuses; job status, event, schedule, course, branch, and access-flag cells are also consumed by the code. A staff member's name or exact permission list cannot be inferred from this source code; that must be checked in Google Drive/Sheets sharing settings.
3. **The backend service account:** performs API writes for student actions and reads the configured ranges. Its effective access depends on how the actual spreadsheet is shared with that service account and the deployed credential.

I found no staff/admin UI, admin login role, or role-based permission middleware in this repository. All users with a valid student JWT use the same protected-route middleware. That means “admin” operations described in notes—such as changing leave status or adding syllabus progress—are manual Sheet edits by someone who has Google Sheet access, not actions in a portal admin screen. Feature-specific student checks (such as course/material access) are separate from staff roles.

## 8. What happens after a Sheet or portal change

### Portal writes

Most normal append/update helpers clear the backend's in-memory Sheet cache after a successful write. The browser then usually updates its current React state from the API response and/or reloads the relevant API data. The shared dashboard also refreshes on page visibility and every five minutes.

### Direct staff edits in Google Sheets

There is no Google Sheets push subscription or websocket in this code. A manual cell edit does not push an event to a student's screen. The student sees it after the relevant frontend page requests data and the backend fetches a fresh Sheet result.

Default reads are cached in backend memory for **600 seconds (10 minutes)**. Thus a dashboard refresh every five minutes can still receive the same cached Sheet values. The drive-alert endpoint uses shorter ten-second reads; study-material reads use 60 seconds and course list reads use 300 seconds. Cache duration is per API process, and it is not a shared/distributed cache.

### Cache exception to know about

Profile updates and password changes call Google Sheets directly instead of the cache-clearing helper. The profile route reads `Data!A:AF` before writing, then reads that same cached range to form its response; it can therefore return the pre-update values even though the Google Sheet write succeeded. The dashboard's separate `Data!A:AG` read may also continue showing the prior snapshot until its cache expires. The password route also does not flush the cache, so login or other reads can temporarily use an older cached password/profile snapshot. Document uploads explicitly flush the cache after updating their URL. Direct manual Sheet edits likewise cannot flush the API process's local cache.

## 9. Practical security and reliability facts visible in the code

- The student profile object is saved in browser `localStorage` along with the JWT. Anyone using that browser profile can inspect its stored values; browser storage is not a secure database.
- A JWT lasts seven days. The token is attached to API calls, and invalid/expired tokens receive 403 from the middleware. The frontend does not have a global role-aware access system.
- The login code still supports plaintext password rows for compatibility. New signup and password change flows hash passwords, but legacy Sheet rows should be reviewed and migrated if they contain plaintext.
- The signup flow puts `Pending` in column AF, but the login controller does not read or enforce AF. In this code, that value alone does not prevent sign-in.
- Frontend page visibility is not the ultimate authorization boundary. Protected APIs verify the JWT; some routes have their own checks. The aptitude leaderboard is explicitly mounted without the JWT middleware and returns aggregate top-ten student names, branches, average scores, and times.
- Google API access, Sheet sharing, Drive sharing, Apps Script behavior, deployed secrets, and actual staff permissions are external configuration and cannot be confirmed from this repository.
- The PWA service worker caches the app shell, not authenticated API responses. Live profile, attendance, placement, and student data need a working network/API connection.

## 10. Main code locations

- Google authentication and Sheet service: `backend/config/db.js`, `backend/services/dbService.js`
- Login, signup row construction, course/branch choices: `backend/controllers/authController.js`, `backend/routes/authRoutes.js`
- JWT verification and API mount points: `backend/middleware/authMiddleware.js`, `backend/routes/dashboardRoutes.js`, `backend/server.js`
- Main dashboard data shaping and profile/job/attendance writes: `backend/controllers/dashboardController.js`
- Student Diary and leave workflows: `backend/controllers/studentDiaryController.js`, `backend/controllers/leaveController.js`
- Study materials, exams, and course rules: `backend/controllers/studyMaterialController.js`, `backend/controllers/aptitudeController.js`, `backend/services/courseService.js`
- Frontend login/API token handling: `frontend/src/pages/auth/Login.jsx`, `frontend/src/config/axios.js`
- Dashboard refresh, navigation, notifications, and shared profile state: `frontend/src/components/layout/DashboardLayout.jsx`
- Student screens: `frontend/src/pages/dashboard/` and `frontend/src/pages/gamepal/`
