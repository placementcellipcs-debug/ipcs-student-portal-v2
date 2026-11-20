# Beginner guide: use the Hostinger database

## The simple picture

Think of the current Google Sheets as separate filing cabinets. MySQL will become one organized database shared by both portal backends.

```text
Student browser ──> Vercel website ──> Render API ──> MySQL
TPO browser     ────────────────────> Render API ──> same MySQL
```

The website in Vercel should never connect directly to MySQL. The Render API is the guarded middle layer. During local development, the local website and local API can use MySQL on this PC.

## What is ready

- Hostinger's MariaDB 11.8 database is reachable from both backend projects over TLS. A previously exposed credential was replaced, and the replacement is saved only in each backend's local `.env` file. Never paste it into chat or commit it.
- All 15 schema migrations have been applied to Hostinger.
- The latest read-only capture archived 8 workbooks, 103 tabs, and 361,976 rows. The comparison found no changed cell values among those captured rows; 95 new audit entries arrived while the old portal was still writing. A final paused-write capture is needed to get a clean cutover point.
- Initial normalized imports are in place for reference catalogs, staff, students, vacancies, targets, event/drive data, placement history, companies, deletion approvals, assets, leave requests, and support issues.
- The local `ipcs_portal_dev` schema was dropped at your request. Other local schemas were left alone.
- Several rows have duplicate or missing identifiers, so they were preserved in the archive and left unlinked instead of attaching them to the wrong student, TPO, company, or job.
- The live portals still use Google Sheets for most features. Hostinger data is staged and partly normalized, but the portal has not been switched to it. Keep Sheets available until the remaining modules and mail/report jobs are migrated and verified.

## The safe order

1. **Finish the remaining portal features.** Many screens and background jobs still read or write Sheets. Those paths need MySQL versions before Sheets can be retired.
2. **Plan a short write pause.** The old portal keeps adding audit entries; briefly stop edits during the final source capture so every last row is included in one stable snapshot.
3. **Refresh and compare.** Re-run the source import, then compare row positions and visible text. Password columns are secured as hashes, and formulas are stored as their displayed results.
4. **Configure Render.** Put database settings in each backend's protected Render environment and allow Render's server addresses at Hostinger. A PC allowlist does not cover Render.
5. **Switch after verification.** Deploy the MySQL-backed APIs, check sign-in and core Student/TPO workflows, email schedules, and reports. Keep the old sheets unchanged as a recovery copy until the switch is confirmed.

## Email stays separate from database passwords

The TPO mail service currently has four main sender categories—placement, company, interview, and portal—plus a fallback sender. Their SMTP/App Script credentials stay in protected backend environment variables. Moving databases means moving the mail queue, delivery attempts, mail log, and quota history into MySQL; it does not mean storing sender passwords in MySQL or changing which account sends each message. The encrypted queue payload must remain encrypted, and scheduled mail must have only one active worker to avoid duplicates.

## Hostinger and Render connection note

Hostinger's Remote MySQL settings require allowing the connecting server's IP address. Render publishes outbound IP ranges for each service. Before production, we must confirm the Hostinger plan can allow the Render service's current addresses in a restricted way. Do not use an “allow any host” setting as a shortcut. If the two hosting plans cannot make a reliable restricted connection, solve that before production cutover.

Official setup references:

- [Hostinger: Set up remote MySQL access](https://support.hostinger.com/en/articles/1583546-how-to-set-up-remote-mysql-access-in-hostinger)
- [Render: Outbound IP addresses](https://render.com/docs/outbound-ip-addresses)
- [Vercel: Environment variables](https://vercel.com/docs/environment-variables)
