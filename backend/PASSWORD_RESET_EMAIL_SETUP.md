# Password-reset email setup

The backend tries email providers in this order:

1. Google Apps Script over HTTPS.
2. Nodemailer over SMTP if Apps Script is unavailable or rejects the request.

Apps Script is the first route because a free Render web service blocks outbound SMTP. Nodemailer remains configured as a backup and can send from a paid Render service or another host that permits SMTP.

## Part 1: make a shared secret

The shared secret is a random password used only by the backend and your Apps Script. You create it; Google does not issue one.

1. Open PowerShell in the project folder.
2. Run this command:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Copy the 64-character output into a password manager or a temporary secure note. Do not send it to students, put it in frontend files, or commit it to Git.

## Part 2: set up the Apps Script sender

1. Sign in at [Google Apps Script](https://script.google.com/) using `placementcell.ipcs@gmail.com` and create a new project.
2. Open `backend/PasswordResetMailer.gs` in this project. Copy the whole file into the Apps Script editor's `Code.gs`, then save.
3. In the Apps Script project, open **Project Settings → Script properties → Add script property**. Set the property name to `RESET_MAIL_SHARED_SECRET`; paste the random value from Part 1 as its value; save.
4. Select `authorizeMailer` in the function dropdown and click **Run**. Google will ask the placement-cell account to grant permission to send email. Review and approve it.
5. Click **Deploy → New deployment** and select **Web app**. Set **Execute as** to **Me** (the placement-cell account) and **Who has access** to **Anyone**. The endpoint is public by design; the HMAC signature keeps mail requests restricted to the backend that knows the secret.
6. Click **Deploy**, finish any Google permission prompts, and copy the web app URL ending in `/exec`.
7. Optional failover: create a second web app deployment from this same script project and save its `/exec` URL too.

The `MailApp` sender is the account running the script. Since you deployed as `placementcell.ipcs@gmail.com`, reset emails will be sent from that account with the display name **IPCS Global · Talenzo**.

## Part 3: configure Render

Open the backend web service in Render, then **Environment → Add Environment Variable**. Add:

| Name | Value |
|---|---|
| `RESET_PASSWORD_BASE_URL` | `https://ipcstalenzo.com` |
| `APPS_SCRIPT_MAIL_URL` | The first Apps Script `/exec` URL |
| `APPS_SCRIPT_MAIL_FALLBACK_URL` | Optional second `/exec` URL |
| `APPS_SCRIPT_MAIL_SECRET` | The exact same random value used for `RESET_MAIL_SHARED_SECRET` |

Save changes and redeploy the backend. Reset links will point to `https://ipcstalenzo.com/reset-password`, the portal's public frontend. Keep the mail secret in Render's backend environment only. The frontend/Vercel does not need it.

## Part 4: configure Nodemailer backup

The backend already includes Nodemailer. Add these values to Render if you also want SMTP backup:

| Name | Value |
|---|---|
| `EMAIL_USER` | `placementcell.ipcs@gmail.com` |
| `EMAIL_PASS` | A Google App Password for the placement-cell account |
| `EMAIL_FROM` | `IPCS Global <placementcell.ipcs@gmail.com>` |
| `SMTP_HOST` | Leave unset for Gmail, or use your SMTP provider's host |
| `SMTP_PORT` | `465` for Gmail SSL |
| `SMTP_SECURE` | `true` for port 465 |

Google App Passwords require 2-Step Verification. Visit [Google App Passwords](https://myaccount.google.com/apppasswords) while signed in as the placement-cell account, create a password for the portal, then put it in Render as `EMAIL_PASS`. Use the app password here, never the account's normal password. Google may hide the App Password option for some protected/work-managed accounts. [Google's help page](https://support.google.com/accounts/answer/2461835)

After configuration, reset delivery tries Apps Script first and then Nodemailer. **Render Free blocks outbound SMTP ports 25, 465, and 587**, so on a free service Nodemailer may fail too; Apps Script over HTTPS remains the working route. Nodemailer SMTP backup needs a paid Render service or another host that allows SMTP. [Render free-service limits](https://render.com/docs/free)

## Notes

- IPv4 and IPv6 are network routes, not alternate email senders. The host chooses an available IP route for HTTPS or SMTP. The provider fallback above switches from Apps Script to Nodemailer at the application level.
- Apps Script's consumer Gmail account has a daily sending quota (currently 100 recipients per day). The mailer checks the remaining quota before sending. [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- Do not put any of these mail credentials in a file beginning with frontend `VITE_` variables; those are included in public frontend builds.
