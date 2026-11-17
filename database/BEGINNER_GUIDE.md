# Beginner guide: use the Hostinger database

## The simple picture

Think of the current Google Sheets as separate filing cabinets. MySQL will become one organized database shared by both portal backends.

```text
Student browser ──> Vercel website ──> Render API ──> MySQL
TPO browser     ────────────────────> Render API ──> same MySQL
```

The website in Vercel should never connect directly to MySQL. The Render API is the guarded middle layer. During local development, the local website and local API can use MySQL on this PC.

## What is ready

- Hostinger's MariaDB 11.8 database is reachable from both backend projects over TLS. The password must be rotated because it appeared in a diagnostic output; both local password entries are now blank until you enter the replacement locally.
- All 9 schema migrations have been applied to Hostinger.
- A fresh read-only capture archived 8 workbooks, 103 tabs, and 352,927 rows. Every workbook tab count reconciled with the archive.
- Initial normalized imports are in place for reference catalogs, staff, students, vacancies, targets, event/drive data, placement history, companies, deletion approvals, assets, leave requests, and support issues.
- The local `ipcs_portal_dev` schema was dropped at your request. Other local schemas were left alone.
- Several rows have duplicate or missing identifiers, so they were preserved in the archive and left unlinked instead of attaching them to the wrong student, TPO, company, or job.
- The live portals still use Google Sheets for most features. Hostinger data is staged and partly normalized, but the portal has not been switched to it. Keep Sheets available until the remaining modules and mail/report jobs are migrated and verified.

## The safe order

1. **Rotate the database password in Hostinger.** Enter the replacement privately in both portal `backend/.env` files on the `MYSQL_PASSWORD=` line. Do not paste it into chat or commit those files.
2. **Resume normalized imports.** Reconnect using the new password, review importer previews and warnings, then continue remaining table imports and reconciliation.
3. **Finish converting the portal.** Many features still read or write Sheets; migrate them and any mail/report schedules before a cutover.
4. **Prepare Render.** Add the database settings to each backend's protected Render environment and allow Render's actual outbound addresses at the database provider. A PC allowlist alone does not cover Render.
5. **Cut over after verification.** Deploy the MySQL-backed APIs and verify sign-in, permissions, student workflows, TPO workflows, email schedules, and report delivery. Keep the Sheets workbooks as a recovery copy until the cutover is reconciled.

## Email stays separate from database passwords

The TPO mail service currently has four main sender categories—placement, company, interview, and portal—plus a fallback sender. Their SMTP/App Script credentials stay in protected backend environment variables. Moving databases means moving the mail queue, delivery attempts, mail log, and quota history into MySQL; it does not mean storing sender passwords in MySQL or changing which account sends each message. The encrypted queue payload must remain encrypted, and scheduled mail must have only one active worker to avoid duplicates.

## Hostinger and Render connection note

Hostinger's Remote MySQL settings require allowing the connecting server's IP address. Render publishes outbound IP ranges for each service. Before production, we must confirm the Hostinger plan can allow the Render service's current addresses in a restricted way. Do not use an “allow any host” setting as a shortcut. If the two hosting plans cannot make a reliable restricted connection, solve that before production cutover.

Official setup references:

- [Hostinger: Set up remote MySQL access](https://support.hostinger.com/en/articles/1583546-how-to-set-up-remote-mysql-access-in-hostinger)
- [Render: Outbound IP addresses](https://render.com/docs/outbound-ip-addresses)
- [Vercel: Environment variables](https://vercel.com/docs/environment-variables)
