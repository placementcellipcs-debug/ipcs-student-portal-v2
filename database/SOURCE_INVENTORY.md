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

## Migration rules

- The shared placement workbook is imported once. Both portals must ultimately use the same `students`, `vacancies`, `job_applications`, application history, and placement records.
- The Student Portal calls some tabs by range and creates some tabs on demand. The importer must inspect actual workbook tabs and headers instead of assuming every tab exists or that every sheet has the same layout.
- `Study_Materials` and `StudyMaterials` may be alternate/legacy names. Inspect both and deduplicate by stable record identifiers before merging.
- TPO legacy academic and asset workbooks can contain historical or archive tabs. Import only tabs still used by active features, plus any history needed for audit or reconciliation; do not blindly copy every obsolete tab.
- `Mail_Usage_Dashboard` is derived/reporting data. Preserve source history as needed, then rebuild the dashboard from the canonical mail log and quota tables.
- Do not import sender app passwords into MySQL. SMTP and Apps Script credentials remain in protected backend environment settings.

## Hostinger capture and inventory check (2026-11-18)

- The Hostinger snapshot contains 8 configured active workbooks, 103 tabs, and 352,927 non-header rows. Every archived tab count reconciled with the completed import run.
- The student `Data` tab has 66 repeated roll-number occurrences and 13 rows without a roll number; 2,683 unique-roll profiles were normalized. Rows with missing or repeated identifiers remain preserved in the archive instead of being assigned to the wrong person.
- The TPO portal audit workbook contains 306,389 rows. It remains in the source archive only and was not loaded into student or placement tables.
- The configured active V3 asset workbook was captured; the legacy mirrored asset workbook was not configured. Asset normalization loaded the V3 tables used by the portal. Duplicate source classification codes remain visible in the preview and need an asset taxonomy review.
- The source importer uses read-only Google Sheets access and did not modify workbooks. Diagnostic output reports aggregate counts rather than names, emails, roll numbers, or source cells.
