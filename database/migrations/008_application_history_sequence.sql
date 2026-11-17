-- Give each application history event a stable insertion order. DATETIME alone
-- can tie when a student applies and a TPO updates the record in one second.
ALTER TABLE application_status_history
  ADD COLUMN history_sequence BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE AFTER id,
  ADD KEY ix_application_history_sequence (application_id, history_sequence);

INSERT IGNORE INTO schema_migrations (version) VALUES ('008_application_history_sequence');
