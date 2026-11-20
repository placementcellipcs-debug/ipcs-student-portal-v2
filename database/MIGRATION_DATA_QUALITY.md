# Hostinger snapshot: data-quality findings

Checked against Hostinger's MariaDB snapshot on 18 November 2026. The scan printed aggregate counts only; it did not print student, staff, or company row values.

## Archive verification

- The latest complete capture contains 8 workbooks, 103 tabs, and 361,976 non-header rows. Every tab count matches that import run.
- The live-value comparison found zero differing cell values in rows captured, but 95 new rows had already been added to `Portal_Audit_Log` while the old portal was still active. A final frozen capture is required before cutover.
- 1,451 legacy plaintext password values were converted to one-way password hashes for secure authentication. Password values are intentionally excluded from literal comparison; no password values are printed.
- The TPO portal audit workbook contributes 315,031 rows to this capture only; these rows were not loaded into student or placement tables.
- Academic attendance: all 14,956 rows from `shared_learning:Attendance` were imported once. All have valid dates and branch names; 7,945 link to a course and 22 to an unambiguous student roll. The other student IDs remain unlinked. The distinct `Talentino_Attendance` and `Student_Diary` check-in flows have not been merged into this table.
- Sheets were not changed. No production route or Render service was switched to MySQL.

## Normalized records loaded

- Reference data: 34 branches, 123 courses, and 553 vacancies. All vacancy IDs, titles, and company names were present; 479 vacancy/course links resolved.
- Staff: 75 accounts (67 system-user rows and 8 TPO contacts). Two accounts have no source password hash and need password resets before an authentication cutover.
- Students: 2,685 unique-roll profiles and 2,681 linked student login accounts. A further 116 source rows have missing or repeated roll numbers; the TPO directory now reads them as separate source-only records, and approved changes are stored as overrides rather than attached to another student's profile.
- Student account creation dates: all 2,685 unique-roll profiles have a valid source `Timestamp`; dates were imported into both the student profile and linked login records.
- Student Diary: the archived `Student_Diary` tab currently has zero data rows. Migration 015 creates the MySQL write/read table; no historical rows were available to load.
- Assessments: 1,069 rows across six Aptitude, Talentino, and Technical question/result tabs. Counts match the source archive for all six tabs, and the imported original cell arrays are retained in MySQL.
- Targets: 13 monthly TPO targets for October and November 2026.
- Events and drives: 91 events and 362 current response records. 132 of the 518 source response rows were ambiguous or unlinked and remain in the archive.
- Job tracker: all 8,509 source rows are retained; 93 TPO_Log rows have no usable date. 5,920 link to a unique student, 5,562 to a current opening, and 7,100 to an unambiguous active TPO. 1,357 owner labels need review; 3,080 rows lack either a student or opening link. Repeated student/job rows remain separate.
- Legacy applications: 2,205 of 2,410 Opening_Applied rows link to both a unique student and current opening. These map to 2,128 canonical applications; 77 repeated source rows are consolidated, and 3,002 history rows are stored. The 205 unlinked rows remain archived. 1,848 applications have an unambiguous TPO owner; 280 need owner review.
- Placement outcomes: 2,348 current keyed rows are retained, plus one superseded historical row. 401 link to a unique student and 1,667 to an unambiguous TPO. 629 owner labels need review; 8 placement dates were not recognized and 550 package values were not parsed.
- Companies: 2,155 unique companies from 2,211 source rows.
- Delete approvals: 20 requests, including 3 pending requests.
- Assets: 592 classification rows, 25 registered assets, 21 history rows, 27 activity rows, and 16 QR-label rows. Duplicate source taxonomy codes are present; review classification links before cutover.
- Leave and support: 1 leave request and 8 support issues; all linked to a unique student.
- GamePal: 289 session logs, 71 score summaries, 11 rooms, 29 room-member rows, and 1 friend challenge were imported. Repeated room-member rows were preserved.
- Mail activity: 2,686 logs, 1,263 delivery attempts, 1,799 quota usage events, and 101 historical queue summaries were imported. The queue summaries were not added to the live sending outbox and their message payloads were excluded.

## Source rows requiring review

| Area | Finding | Migration behavior |
| --- | --- | --- |
| Student profiles | 13 rows lack a roll number; 66 duplicate roll-number occurrences; 4 missing emails and 1 invalid email | Only unique-roll rows were normalized. Rows without stable identity remain in the archive. |
| Opening applications | 2,410 rows; 26 lack roll number; 22 lack job ID; 73 repeated linked student/job pairs (77 extra linked rows); 138 nonblank job IDs are absent from the current opening catalog | The 2,128 linkable pairs have one canonical current application; all original rows remain archived, and missing or old IDs are not guessed. |
| TPO tracker | 6,018 rows; 2,051 lack roll number; 2,613 lack job ID; 931 repeated student/job pairs; 174 unknown nonblank job IDs | A TPO link is set only for an unambiguous active staff match. |
| Events and registrations | 90 events and 467 registrations; 69 registration IDs do not match a known event/opening | Unmatched rows remain archived. |
| Staff directory | 67 system users and 8 contacts; no repeated email addresses; 2 rows have no source password | Missing-password accounts need resets before sign-in is moved. |
| Placement outcomes | 2,349 distinct source record keys; 629 owner labels need review | Rows remain separate; no repeated placement is discarded. |
| Asset taxonomy | Duplicate category codes exist in subcategory and type tabs | Asset records loaded, but any ambiguous taxonomy references need review. |

## Why the portals are not switched yet

This is a partial normalized migration, not a Sheets-free cutover. Dashboards, training, the separate Talentino and student diary attendance flows, learning content, live student application routes, mail sending/reports, and scheduled jobs still have Sheets runtime paths because their MySQL feature flags are off. The source archive currently preserves all captured displayed text, but the sheets continue to receive writes; pause writes for the final capture, then re-import and compare before switching the live portals. A prior database credential was replaced before remote work resumed; the replacement is stored only in the two local backend `.env` files. No live portal has been switched to MySQL.
