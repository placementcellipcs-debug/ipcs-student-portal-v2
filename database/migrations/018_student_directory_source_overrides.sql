ALTER TABLE student_profile_change_requests
  MODIFY COLUMN student_profile_id CHAR(36) NULL;

CREATE TABLE IF NOT EXISTS student_directory_source_overrides (
  source_key VARCHAR(80) NOT NULL,
  source_tab VARCHAR(160) NOT NULL,
  source_row_number INT UNSIGNED NOT NULL,
  fields_json JSON NOT NULL,
  updated_by_user_id CHAR(36) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_key, source_tab, source_row_number),
  KEY ix_student_directory_override_updated (updated_at),
  CONSTRAINT fk_student_directory_override_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('018_student_directory_source_overrides');
