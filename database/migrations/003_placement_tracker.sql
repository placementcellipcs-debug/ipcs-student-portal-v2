-- Preserve application and TPO tracker history as append-only records.
-- This intentionally does not impose one application per student/job pair:
-- existing sheets contain repeats and historical job IDs.
CREATE TABLE IF NOT EXISTS placement_tracker_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  source_key VARCHAR(120) NOT NULL,
  source_tab VARCHAR(160) NOT NULL,
  source_row_number INT UNSIGNED NOT NULL,
  student_id CHAR(36) NULL,
  vacancy_id CHAR(36) NULL,
  owner_tpo_user_id CHAR(36) NULL,
  roll_number VARCHAR(100) NULL,
  student_name VARCHAR(200) NULL,
  job_code VARCHAR(100) NULL,
  company_name VARCHAR(240) NULL,
  position_title VARCHAR(240) NULL,
  status VARCHAR(80) NULL,
  occurred_at DATETIME NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tracker_source_row (source_key, source_tab, source_row_number),
  KEY ix_tracker_student_time (student_id, occurred_at),
  KEY ix_tracker_owner_time (owner_tpo_user_id, occurred_at),
  KEY ix_tracker_job (job_code, status),
  CONSTRAINT fk_tracker_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_tracker_vacancy FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE SET NULL,
  CONSTRAINT fk_tracker_owner FOREIGN KEY (owner_tpo_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('003_placement_tracker');
