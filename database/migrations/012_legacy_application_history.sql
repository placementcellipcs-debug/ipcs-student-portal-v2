-- Keep the historical application date nullable when the source has no date,
-- and give every imported history event a stable source identity.
ALTER TABLE job_applications
  MODIFY COLUMN applied_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE application_status_history
  MODIFY COLUMN occurred_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN source_key VARCHAR(120) NULL AFTER metadata,
  ADD COLUMN source_tab VARCHAR(160) NULL AFTER source_key,
  ADD COLUMN source_row_number INT UNSIGNED NULL AFTER source_tab,
  ADD COLUMN source_event_index SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER source_row_number,
  ADD UNIQUE KEY uq_application_history_source_event
    (source_key, source_tab, source_row_number, source_event_index);

INSERT IGNORE INTO schema_migrations (version) VALUES ('012_legacy_application_history');
