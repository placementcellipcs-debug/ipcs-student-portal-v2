# Backend deployment and email setup

The primary production API is `https://api.ipcstalenzo.com`. Vercel previews and local development use the Render API at `https://ipcs-student-portal-v2.onrender.com` for testing. The Express service uses `npm run build` (a no-op) and starts with `npm start` (`node server.js`); it listens on `process.env.PORT` when provided by the host.

## Gmail SMTP

Password-reset and placement-drive confirmation emails use Nodemailer with Gmail SMTP. Set these values in the backend host's protected environment settings:

| Variable | Value |
|---|---|
| `EMAIL_USER` | `placementcell.ipcs@gmail.com` |
| `EMAIL_PASS` | A Google App Password for that account |
| `EMAIL_FROM` | `IPCS Global <placementcell.ipcs@gmail.com>` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `FRONTEND_URL` | `https://ipcstalenzo.com` |
| `RESET_PASSWORD_BASE_URL` | `https://ipcstalenzo.com` |

Create the App Password while signed into `placementcell.ipcs@gmail.com` with 2-Step Verification enabled. Enter it directly in the hosting provider's private `EMAIL_PASS` setting. Never put the mailbox password in `.env.example`, the ZIP, frontend variables, or Git. Google Apps Script is no longer used for sending these emails; it can remain for separate Sheets/Drive features.

## Other required backend configuration

- Set `SPREADSHEET_ID` to the portal's Google Sheets ID.
- Set `JWT_SECRET` to a long, random secret used only by the backend.
- Provide the Google service-account credentials separately and securely. The backend expects `google-credentials.json` beside `server.js`; this private key is intentionally excluded from the ZIP.
- Set any Drive IDs or Apps Script URLs needed by the Drive/photo features in the host's environment.

After saving the settings and credentials, redeploy the backend. The API health endpoint is `/` and returns the Talenzo API status.
