# Google Sheets source inventory for the shared database

This is the sheet-tab inventory found in the current backend source. At import time, use the spreadsheet IDs in each machine's active environment (`.env` or hosting settings), not IDs copied from this document. Preserve the original workbook and tab name on each imported record so every row can be reconciled and traced back.

## Student Portal workbooks

| Workbook setting | Tabs used by the backend |
| --- | --- |
| `STUDENT_DATA_SPREADSHEET_ID` | `Data`, `Student_Diary`, `Leave_Applications` |
| `PLACEMENT_SPREADSHEET_ID` | `NewsLetter`, `Event`, `Drive_Registration`, `Opening_Applied`, `Clients`, `TPO_Log`, `Placed_Students`, `TPO_Stats`, `Corporate Training Inquiries`, `Hiring Inquiries` |
| `LEARNING_SPREADSHEET_ID` | `Courses`, `Study_Materials`, `Talentino_Schedule`, `Talentino_Attendance`, `Aptitude_Questions`, `Aptitude_Results`, `Talentino_Questions`, `Talentino_Results`, `Tech_Questions`, `Tech_Results`, `Training`, `Batches`, `Topics`, `Sessions`, `Attendance`, `Progress`, `Diary`, `Assignments`, `Assessments`, `Certificates` |
| `OPERATIONS_SPREADSHEET_ID` | `Contact`, `User`, `Branches`, `Issues`, `Security_Logs`, `Auth_Sessions`, `Password_Reset_Tokens`, `Mail`, `EmailQueue`, `EmailQuotaUsage`, `Mail_Usage_Dashboard`, `Mail_Usage_History`, `MailDeliveryAttempts`, `Trainer/TL_Log`, `Placement_Audit_Log`, `TPO_Delete_Requests` |
| `GAMEPAL_SPREADSHEET_ID` | `GamePal_Rooms`, `GamePal_Room_Members`, `GamePal_Challenges`, `GamePal_Stats`, `GamePal_Logs` |

## TPO Portal workbooks

| Workbook setting | Tabs used by the backend |
| --- | --- |
| `STUDENT_DATA_SPREADSHEET_ID` | `Data`, `Student_Diary`, `Leave_Applications` |
| `PLACEMENT_SPREADSHEET_ID` | `NewsLetter`, `Event`, `Drive_Registration`, `Opening_Applied`, `Clients`, `TPO_Log`, `Placed_Students`, `TPO_Stats`, `Corporate Training Inquiries`, `Hiring Inquiries` |
| `LEARNING_SPREADSHEET_ID` and `ACADEMIC_SPREADSHEET_ID` (legacy academic workbook) | `Talentino_Schedule`, `Talentino_Attendance`, `Talentino_Daily_Report_Log`, `Courses`, `Study_Materials` / `StudyMaterials`, `Tech_Questions`, `Tech_Results`, `Aptitude_Questions`, `Aptitude_Results`, `Talentino_Questions`, `Talentino_Results`, `Training`, `Batches`, `Topics`, `Sessions`, `Attendance`, `Topic_Progress`, `Diary`, `Trainer_Remarks`, `Assignments`, `Assessments`, `Assessment_Results`, `Activities`, `Certificate_Requests`, `Certificates`, `Attendance_Corrections`, `Audit_Log` |
| `OPERATIONS_SPREADSHEET_ID` | `Issues`, `Contact`, `User`, `Branches`, `Mail`, `EmailQueue`, `EmailQuotaUsage`, `MailDeliveryAttempts`, `Mail_Usage_Dashboard`, `Mail_Usage_History`, `Security_Logs`, `Auth_Sessions`, `Password_Reset_Tokens`, `Trainer/TL_Log`, `Placement_Audit_Log`, `TPO_Delete_Requests` |
| `ASSET_SPREADSHEET_ID` | `Asset_Register_V3`, `Asset_Inventory_V3`, `Asset_Category_Master_V3`, `Asset_Subcategory_Master_V3`, `Asset_Type_Master_V3`, `Asset_Migration_Log`, `Asset_Approvals_V3`, `Asset_Notification_Log_V3`, `Asset_QR_Registry_V3`, `Asset_Activity_Log_V3`, `Asset_Assignments_V3`, `Asset_History_V3`, `Asset_Disposals_V3`, `Asset_Custom_Data_V3`, `Asset_Transfers_V3`, `Asset_Transfer_Items_V3`, `Asset_Maintenance_V3`, `Asset_Inventory_Transactions_V3`, `Asset_Vendors_V3`, `Asset_Documents_V3`, `Asset_Locations_V3`, `Asset_Audits_V3`, `Asset_Audit_Items_V3` |
| `DESIGN_SPREADSHEET_ID` | `Design_Tasks`, `Design_Files`, `Design_Categories`, `Design_Social_Media`, `Design_Activity_Log`, `Design_Settings` |

## Migration rules

- The shared placement workbook is imported once. Both portals must ultimately use the same `students`, `vacancies`, `job_applications`, application history, and placement records.
- The Student Portal calls some tabs by range and creates some tabs on demand. The importer must inspect actual workbook tabs and headers instead of assuming every tab exists or that every sheet has the same layout.
- `Study_Materials` and `StudyMaterials` may be alternate/legacy names. Inspect both and deduplicate by stable record identifiers before merging.
- TPO legacy academic and asset workbooks can contain historical or archive tabs. Import only tabs still used by active features, plus any history needed for audit or reconciliation; do not blindly copy every obsolete tab.
- `Mail_Usage_Dashboard` is derived/reporting data. Preserve source history as needed, then rebuild the dashboard from the canonical mail log and quota tables.
- Do not import sender app passwords into MySQL. SMTP and Apps Script credentials remain in protected backend environment settings.

## Hostinger capture and inventory check (2026-11-18)

- The latest Hostinger snapshot contains 8 configured workbooks, 103 tabs, and 361,976 non-header rows. Each tab count reconciles with the completed import run. A read-only comparison found no differing values in captured rows; 95 newer audit rows appeared in the live sheet before comparison completed, so freeze writes for the final capture.
- The student `Data` tab has 66 repeated roll-number occurrences and 13 rows without a roll number; 2,683 unique-roll profiles were normalized. Rows with missing or repeated identifiers remain preserved in the archive instead of being assigned to the wrong person.
- The TPO portal audit workbook contains 315,031 rows in the latest capture. It remains in the source archive only and was not loaded into student or placement tables.
- The configured active V3 asset workbook was captured; the legacy mirrored asset workbook was not configured. Asset normalization loaded the V3 tables used by the portal. Duplicate source classification codes remain visible in the preview and need an asset taxonomy review.
- Student account timestamps from `Data.Timestamp` were parsed for all 2,685 eligible unique-roll profiles and imported into the linked login/profile records.
- The TPO MySQL directory now combines those 2,685 canonical profiles with all 116 source rows that lack a unique roll number. The 116 remain separate source-only rows; Gifty's approved edits are stored as MySQL overrides and do not merge or rewrite the immutable import archive. The 2,801-row directory read was reconciled, and password fields are excluded from its response.
- `Student_Diary` currently has zero archived data rows. The Student Portal now has a MySQL table and a feature-gated read/write path for future diary attendance; the switch remains off until the coordinated cutover.
- All five active GamePal tabs were normalized into MySQL: 289 logs, 71 stats rows, 11 rooms, 29 room members, and one challenge. Repeated room-member rows remain separate.
- The GamePal MySQL service is implemented behind `MYSQL_GAMEPAL_ENABLED`, which remains off until the broader portal cutover. Read-only checks for its dashboard, history, leaderboard, and challenge views passed; write flows have not been tested against live accounts.
- Mail history tables now contain 2,686 mail logs, 1,263 provider attempts, 1,799 quota events, and 101 non-sendable queue summaries. The quota sheet contains two side-by-side layouts; all rows were mapped. Sender passwords and queued message payloads were not imported into normalized mail tables.
- `MYSQL_EMAIL_ENABLED` remains off. Historical queue rows do not enter the active outbox, preventing a snapshot import from resending prior messages. The email accounts' secrets remain in protected backend environment settings.
- The Student Portal's historical `Opening_Applied` rows now normalize into 2,128 canonical applications and 3,002 stored history rows. TPO and student service checks confirm the consolidated application is shown once; 205 ambiguous/unlinked rows remain in the archive. 1,848 applications have a resolved TPO owner; 280 require review. The TPO and Student application feature flags remain off.
- The placement timestamp parser follows the source workbook's DD/MM/YYYY locale. The latest normalized tracker has 8,509 rows: 2,410 `Opening_Applied` and 6,099 `TPO_Log`. Ninety-three TPO_Log rows have no usable date.
- The academic `shared_learning:Attendance` tab has 14,956 rows and is stored in `academic_attendance_records`; all dates and branches resolve, 7,945 course links and 22 student-roll links resolve, and 14,934 student IDs remain safely unlinked. This is separate from the live `Talentino_Attendance` and `Student_Diary` formats.
- The six student assessment tabs are normalized in `assessment_records`: 53 Aptitude questions/326 results, 75 Talentino questions/128 results, and 475 Technical questions/12 results. Every imported row retains its original source cells. Student exams and TPO Aptitude/Talentino question editors/results now share a MySQL runtime path behind `MYSQL_ASSESSMENTS_ENABLED`, which remains off in both backends pending the coordinated cutover.
- Student dashboard reference lists can read `Event`, `Drive_Registration`, `Talentino_Schedule`, `Talentino_Attendance`, `NewsLetter`, and TPO `Contact` from the MySQL source archive behind `MYSQL_STUDENT_DASHBOARD_READS_ENABLED`; this does not replace the pending TPO edit/write migration for those records.
- The source importer uses read-only Google Sheets access and did not modify workbooks. It preserves exact displayed non-password text, including spaces. Legacy plaintext passwords are converted to hashes; formulas are archived as displayed results. Diagnostic output reports aggregate counts and column names, never cell contents.
