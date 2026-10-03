/**
 * Google Apps Script web app for Talenzo password-reset email delivery.
 * Deploy this script while signed in as placementcell.ipcs@gmail.com.
 * Set RESET_MAIL_SHARED_SECRET in Project Settings > Script properties.
 */

function doGet() {
  return jsonOutput_({ success: true, service: 'IPCS password-reset mailer' });
}

function authorizeMailer() {
  return MailApp.getRemainingDailyQuota();
}

function doPost(event) {
  try {
    if (!event || !event.postData || !event.postData.contents) {
      return jsonOutput_({ success: false, code: 'EMPTY_REQUEST', message: 'Request body is required.' });
    }

    var payload = JSON.parse(event.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('RESET_MAIL_SHARED_SECRET');
    if (!secret) {
      return jsonOutput_({ success: false, code: 'MISSING_SECRET', message: 'Mailer secret is not configured.' });
    }

    var timestamp = Number(payload.timestamp);
    if (payload.version !== 1 || !/^[a-f0-9-]{36}$/i.test(String(payload.requestId || '')) ||
        !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return jsonOutput_({ success: false, code: 'INVALID_REQUEST', message: 'Request is invalid or expired.' });
    }

    var canonical = JSON.stringify({
      version: payload.version,
      requestId: payload.requestId,
      timestamp: payload.timestamp,
      to: payload.to,
      name: payload.name,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      logoBase64: payload.logoBase64 || '',
    });
    var expectedSignature = Utilities.base64Encode(
      Utilities.computeHmacSha256Signature(canonical, secret)
    );
    if (!constantTimeEquals_(expectedSignature, String(payload.signature || ''))) {
      return jsonOutput_({ success: false, code: 'INVALID_SIGNATURE', message: 'Request authentication failed.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.to || '')) ||
        !payload.subject || !payload.text || !payload.html) {
      return jsonOutput_({ success: false, code: 'INVALID_EMAIL', message: 'Email content is incomplete.' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var cache = CacheService.getScriptCache();
      var idempotencyKey = 'reset_mail_' + payload.requestId;
      if (cache.get(idempotencyKey)) {
        return jsonOutput_({ success: true, duplicate: true });
      }
      if (MailApp.getRemainingDailyQuota() < 1) {
        return jsonOutput_({ success: false, code: 'MAIL_QUOTA_EXHAUSTED', message: 'The sender email quota has been reached.' });
      }

      var options = {
        name: 'IPCS Global · Talenzo',
        htmlBody: String(payload.html),
      };
      if (payload.logoBase64) {
        options.inlineImages = {
          'ipcs-global-logo': Utilities.newBlob(
            Utilities.base64Decode(payload.logoBase64),
            'image/png',
            'ipcs-global-logo.png'
          ),
        };
      }
      MailApp.sendEmail(String(payload.to), String(payload.subject), String(payload.text), options);
      // The primary and fallback deployments should be created from this same
      // Apps Script project so they share this short-lived duplicate-send guard.
      cache.put(idempotencyKey, 'sent', 21600);
    } finally {
      lock.releaseLock();
    }

    return jsonOutput_({ success: true });
  } catch (error) {
    console.error('Password reset MailApp delivery failed:', error && error.message ? error.message : error);
    return jsonOutput_({ success: false, code: 'MAIL_SEND_FAILED', message: 'Google Apps Script could not send the email.' });
  }
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
