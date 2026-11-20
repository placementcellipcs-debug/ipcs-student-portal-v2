-- Preserve imported mail history without placing old queue payloads back into
-- the active delivery worker. Imported delivery attempts may not have a
-- matching MySQL outbox row, and historical source dates may be blank.

ALTER TABLE email_delivery_attempts
  MODIFY COLUMN outbox_id CHAR(36) NULL,
  MODIFY COLUMN attempted_at DATETIME NULL,
  ADD COLUMN source_key VARCHAR(80) NULL,
  ADD COLUMN source_tab VARCHAR(120) NULL,
  ADD COLUMN source_record_key VARCHAR(180) NULL,
  ADD UNIQUE KEY uq_email_attempt_source (source_key, source_tab, source_record_key);

ALTER TABLE mail_logs
  MODIFY COLUMN occurred_at DATETIME NULL,
  ADD COLUMN source_key VARCHAR(80) NULL,
  ADD COLUMN source_tab VARCHAR(120) NULL,
  ADD COLUMN source_record_key VARCHAR(180) NULL,
  ADD UNIQUE KEY uq_mail_log_source (source_key, source_tab, source_record_key);

ALTER TABLE email_quota_usage
  MODIFY COLUMN sent_at DATETIME NULL,
  ADD COLUMN source_key VARCHAR(80) NULL,
  ADD COLUMN source_tab VARCHAR(120) NULL,
  ADD COLUMN source_record_key VARCHAR(180) NULL,
  ADD UNIQUE KEY uq_email_usage_source (source_key, source_tab, source_record_key);

CREATE TABLE IF NOT EXISTS email_queue_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  source_key VARCHAR(80) NOT NULL,
  source_tab VARCHAR(120) NOT NULL,
  source_record_key VARCHAR(180) NOT NULL,
  source_queue_id VARCHAR(190) NULL,
  email_category VARCHAR(80) NULL,
  status VARCHAR(30) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  provider VARCHAR(80) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  metadata JSON NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_queue_history_source (source_key, source_tab, source_record_key),
  KEY ix_email_queue_history_status_time (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('011_mail_history');
