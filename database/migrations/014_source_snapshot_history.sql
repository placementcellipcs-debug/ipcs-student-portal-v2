CREATE TABLE IF NOT EXISTS source_sheet_record_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(120) NOT NULL,
  tab_name VARCHAR(160) NOT NULL,
  sheet_row_number INT UNSIGNED NOT NULL,
  source_import_run_id CHAR(36) NOT NULL,
  replaced_by_import_run_id CHAR(36) NOT NULL,
  row_data_json JSON NOT NULL,
  row_fingerprint CHAR(64) NOT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_sheet_record_version (source_key, tab_name, sheet_row_number, source_import_run_id),
  KEY ix_source_sheet_history_run (source_import_run_id),
  KEY ix_source_sheet_history_replaced_by (replaced_by_import_run_id),
  CONSTRAINT fk_source_sheet_history_source_run FOREIGN KEY (source_import_run_id) REFERENCES source_import_runs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_sheet_history_replacement_run FOREIGN KEY (replaced_by_import_run_id) REFERENCES source_import_runs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_sheet_manifest_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(120) NOT NULL,
  tab_name VARCHAR(160) NOT NULL,
  source_import_run_id CHAR(36) NOT NULL,
  workbook_sources JSON NOT NULL,
  headers_json JSON NOT NULL,
  header_row_number INT UNSIGNED NULL,
  imported_record_count INT UNSIGNED NOT NULL DEFAULT 0,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_sheet_manifest_version (source_key, tab_name, source_import_run_id),
  KEY ix_source_sheet_manifest_history_run (source_import_run_id),
  CONSTRAINT fk_source_sheet_manifest_history_run FOREIGN KEY (source_import_run_id) REFERENCES source_import_runs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('014_source_snapshot_history');
