# Hostinger snapshot: data-quality findings

Checked against Hostinger's MariaDB snapshot on 18 November 2026. The scan printed aggregate counts only; it did not print student, staff, or company row values.

## Archive verification

- 8 active workbooks, 103 tabs, and 352,927 non-header rows were captured using read-only Sheets access.
- All 103 tab counts matched the completed import run.
- 1,452 legacy plaintext passwords were converted to the portal's existing password-hash formats before the source snapshot was stored. No unsupported TPO password hashes were found.
- The TPO portal audit workbook contributes 306,389 rows to the archive only; these rows were not loaded into student or placement tables.
- Sheets were not changed. No production route or Render service was switched to MySQL.

## Normalized records loaded

- Reference data: 34 branches, 123 courses, and 553 vacancies. All vacancy IDs, titles, and company names were present; 479 vacancy/course links resolved.
- Staff: 75 accounts (67 system-user rows and 8 TPO contacts). Two accounts have no source password hash and need password resets before an authentication cutover.
- Students: 2,683 unique-roll profiles and 2,679 linked student login accounts. A further 116 source rows have missing or repeated roll numbers and remain in the archive.
- Targets: 13 monthly TPO targets for October and November 2026.
- Events and drives: 90 events and 362 current response records. 81 source response rows were ambiguous or unlinked and remain in the archive.
- Job tracker: all 8,403 source rows are retained; 5,815 link to a unique student, 5,456 to a current opening, and 6,994 to an unambiguous active TPO. 1,357 owner labels need review; 3,079 rows lack either a student or opening link. Repeated student/job rows are retained.
- Placement outcomes: all 2,349 keyed rows are retained. 402 link to a unique student and 1,668 to an unambiguous TPO. 629 owner labels need review; 8 placement dates were not recognized and 550 package values were not parsed.
- Companies: 2,155 unique companies from 2,211 source rows.
- Delete approvals: 20 requests, including 3 pending requests.
- Assets: 592 classification rows, 25 registered assets, 21 history rows, 27 activity rows, and 16 QR-label rows. Duplicate source taxonomy codes are present; review classification links before cutover.
- Leave and support: 1 leave request and 8 support issues; all linked to a unique student.

## Source rows requiring review

| Area | Finding | Migration behavior |
| --- | --- | --- |
| Student profiles | 13 rows lack a roll number; 66 duplicate roll-number occurrences; 4 missing emails and 1 invalid email | Only unique-roll rows were normalized. Rows without stable identity remain in the archive. |
| Opening applications | 2,385 rows; 26 lack roll number; 22 lack job ID; 88 repeated student/job pairs; 138 nonblank job IDs are absent from the current opening catalog | Repeated history is retained. Missing and old IDs are not guessed. |
| TPO tracker | 6,018 rows; 2,051 lack roll number; 2,613 lack job ID; 931 repeated student/job pairs; 174 unknown nonblank job IDs | A TPO link is set only for an unambiguous active staff match. |
| Events and registrations | 90 events and 467 registrations; 69 registration IDs do not match a known event/opening | Unmatched rows remain archived. |
| Staff directory | 67 system users and 8 contacts; no repeated email addresses; 2 rows have no source password | Missing-password accounts need resets before sign-in is moved. |
| Placement outcomes | 2,349 distinct source record keys; 629 owner labels need review | Rows remain separate; no repeated placement is discarded. |
| Asset taxonomy | Duplicate category codes exist in subcategory and type tabs | Asset records loaded, but any ambiguous taxonomy references need review. |

## Why the portals are not switched yet

This is a fresh remote archive and partial normalized migration, not a Sheets-free cutover. Dashboards, training and attendance, diary, learning content, some job-application history, email reporting/queues, and scheduled jobs still have Sheets runtime paths. The Hostinger password must be rotated because it appeared in a diagnostic output; both local `.env` password entries were cleared. Restore the connection with a replacement secret, finish importing and mapping remaining modules, reconcile counts, then migrate the runtime feature flags and protected Render settings in a controlled cutover.
