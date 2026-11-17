-- MySQL-backed vacancy maintenance and deletion approval workflow.
-- Existing vacancy fields remain in vacancies.metadata.fields so imported
-- tracker and student projections can keep reading the complete record.

CREATE TABLE IF NOT EXISTS companies (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_name VARCHAR(240) NOT NULL,
  normalized_name VARCHAR(240) NOT NULL,
  website TEXT NULL,
  contact_number VARCHAR(100) NULL,
  email VARCHAR(254) NULL,
  contact_person VARCHAR(200) NULL,
  logo_url TEXT NULL,
  location VARCHAR(240) NULL,
  created_by_user_id CHAR(36) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_normalized_name (normalized_name),
  CONSTRAINT fk_company_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vacancy_sequences (
  sequence_name VARCHAR(80) NOT NULL PRIMARY KEY,
  next_number INT UNSIGNED NOT NULL DEFAULT 10296,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO vacancy_sequences (sequence_name, next_number) VALUES ('job_code', 10296);

CREATE TABLE IF NOT EXISTS vacancy_edit_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vacancy_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(40) NOT NULL,
  changes JSON NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_vacancy_history_time (vacancy_id, occurred_at),
  CONSTRAINT fk_vacancy_history_vacancy FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_vacancy_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tpo_delete_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  request_code VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  record_type VARCHAR(80) NOT NULL,
  target_id VARCHAR(200) NOT NULL,
  target_summary VARCHAR(500) NOT NULL,
  target_snapshot JSON NULL,
  reason VARCHAR(500) NOT NULL,
  requested_by_user_id CHAR(36) NULL,
  requested_by_name VARCHAR(160) NOT NULL,
  requested_by_email VARCHAR(254) NOT NULL,
  requested_by_role VARCHAR(100) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id CHAR(36) NULL,
  reviewed_by_name VARCHAR(160) NULL,
  reviewed_by_email VARCHAR(254) NULL,
  reviewed_at DATETIME NULL,
  decision_notes VARCHAR(1000) NULL,
  execution_message VARCHAR(1000) NULL,
  metadata JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tpo_delete_request_code (request_code),
  KEY ix_tpo_delete_status_time (status, requested_at),
  KEY ix_tpo_delete_requester (requested_by_user_id, requested_at),
  KEY ix_tpo_delete_target (record_type, target_id, status),
  CONSTRAINT fk_tpo_delete_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tpo_delete_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('004_vacancy_management');
