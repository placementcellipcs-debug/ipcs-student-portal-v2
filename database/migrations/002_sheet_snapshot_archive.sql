-- Idempotent staging area for a read-only Google Sheets migration.
-- This keeps original row order and every active tab without mixing the two
-- portals' source-of-truth data into normalized tables prematurely.

CREATE TABLE IF NOT EXISTS source_import_runs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'running',
  workbook_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tab_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  record_count INT UNSIGNED NOT NULL DEFAULT 0,
  password_hash_count INT UNSIGNED NOT NULL DEFAULT 0,
  repeated_student_roll_count INT UNSIGNED NOT NULL DEFAULT 0,
  warning_message TEXT NULL,
  error_message TEXT NULL,
  KEY ix_source_import_status (status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_sheet_manifest (
  source_key VARCHAR(120) NOT NULL,
  tab_name VARCHAR(160) NOT NULL,
  workbook_sources JSON NOT NULL,
  headers_json JSON NOT NULL,
  header_row_number INT UNSIGNED NULL,
  imported_record_count INT UNSIGNED NOT NULL DEFAULT 0,
  imported_run_id CHAR(36) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_key, tab_name),
  KEY ix_sheet_manifest_run (imported_run_id),
  CONSTRAINT fk_sheet_manifest_run FOREIGN KEY (imported_run_id) REFERENCES source_import_runs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_sheet_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(120) NOT NULL,
  tab_name VARCHAR(160) NOT NULL,
  sheet_row_number INT UNSIGNED NOT NULL,
  row_data_json JSON NOT NULL,
  row_fingerprint CHAR(64) NOT NULL,
  imported_run_id CHAR(36) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sheet_source_row (source_key, tab_name, sheet_row_number),
  KEY ix_sheet_records_run (imported_run_id),
  CONSTRAINT fk_sheet_record_manifest FOREIGN KEY (source_key, tab_name) REFERENCES source_sheet_manifest(source_key, tab_name) ON DELETE CASCADE,
  CONSTRAINT fk_sheet_record_run FOREIGN KEY (imported_run_id) REFERENCES source_import_runs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('002_sheet_snapshot_archive');
