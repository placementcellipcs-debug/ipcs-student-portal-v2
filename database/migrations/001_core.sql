-- IPCS shared database foundation. Target: MySQL 8.0+ or MariaDB / InnoDB.
-- Apply only to a new database. Existing Sheets remain untouched until import and reconciliation.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  normalized_name VARCHAR(160) NOT NULL,
  region VARCHAR(120) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branches_normalized_name (normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  category VARCHAR(160) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_courses_normalized_name (normalized_name),
  KEY ix_courses_category (category, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NULL,
  normalized_email VARCHAR(254) NULL,
  password_hash VARCHAR(255) NULL,
  role VARCHAR(40) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(40) NULL,
  sitting_branch_id CHAR(36) NULL,
  linkedin_url TEXT NULL,
  birthday DATE NULL,
  position_title VARCHAR(240) NULL,
  description TEXT NULL,
  employee_id VARCHAR(100) NULL,
  profile_photo_url TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  metadata JSON NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_normalized_email (normalized_email),
  UNIQUE KEY uq_users_employee_id (employee_id),
  KEY ix_users_role_status (role, status),
  KEY ix_users_full_name (full_name),
  CONSTRAINT fk_users_sitting_branch FOREIGN KEY (sitting_branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NULL,
  roll_number VARCHAR(100) NOT NULL,
  normalized_roll_number VARCHAR(100) NOT NULL,
  course_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  personal_email VARCHAR(254) NULL,
  phone VARCHAR(40) NULL,
  resume_url TEXT NULL,
  profile_photo_url TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_roll_number (normalized_roll_number),
  UNIQUE KEY uq_student_user_id (user_id),
  KEY ix_students_branch_course (branch_id, course_id, status),
  KEY ix_students_email (personal_email),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_branch_assignments (
  user_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, branch_id),
  CONSTRAINT fk_user_branch_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_branch_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_course_assignments (
  user_id CHAR(36) NOT NULL,
  course_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, course_id),
  CONSTRAINT fk_user_course_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_course_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vacancies (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_code VARCHAR(100) NOT NULL,
  title VARCHAR(240) NOT NULL,
  company_name VARCHAR(240) NOT NULL,
  company_website TEXT NULL,
  location VARCHAR(240) NULL,
  description MEDIUMTEXT NULL,
  qualification VARCHAR(500) NULL,
  employment_type VARCHAR(80) NULL,
  salary_text VARCHAR(120) NULL,
  apply_by DATE NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  assigned_tpo_user_id CHAR(36) NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vacancies_job_code (job_code),
  UNIQUE KEY uq_vacancy_source_key (source, source_record_key),
  KEY ix_vacancy_owner_status (assigned_tpo_user_id, status, apply_by),
  KEY ix_vacancy_company (company_name),
  CONSTRAINT fk_vacancy_assigned_tpo FOREIGN KEY (assigned_tpo_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vacancy_courses (
  vacancy_id CHAR(36) NOT NULL,
  course_id CHAR(36) NOT NULL,
  PRIMARY KEY (vacancy_id, course_id),
  CONSTRAINT fk_vacancy_course_vacancy FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE,
  CONSTRAINT fk_vacancy_course_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  vacancy_id CHAR(36) NOT NULL,
  owner_tpo_user_id CHAR(36) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'applied',
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  UNIQUE KEY uq_student_vacancy_application (student_id, vacancy_id),
  UNIQUE KEY uq_application_source_key (source, source_record_key),
  KEY ix_application_owner_status (owner_tpo_user_id, status, applied_at),
  KEY ix_application_vacancy_status (vacancy_id, status),
  CONSTRAINT fk_application_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_application_vacancy FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_application_owner FOREIGN KEY (owner_tpo_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_status_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  note TEXT NULL,
  actor_user_id CHAR(36) NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSON NULL,
  KEY ix_application_history_time (application_id, occurred_at),
  CONSTRAINT fk_application_history_application FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_application_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS placement_targets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tpo_user_id CHAR(36) NOT NULL,
  target_year SMALLINT UNSIGNED NOT NULL,
  target_month TINYINT UNSIGNED NOT NULL,
  target_count INT UNSIGNED NOT NULL DEFAULT 0,
  assigned_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tpo_monthly_target (tpo_user_id, target_year, target_month),
  CONSTRAINT fk_target_tpo FOREIGN KEY (tpo_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_target_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS placement_outcomes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_id CHAR(36) NULL,
  application_id CHAR(36) NULL,
  student_name VARCHAR(200) NOT NULL,
  roll_number VARCHAR(100) NULL,
  course_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  company_name VARCHAR(240) NOT NULL,
  position_title VARCHAR(240) NULL,
  location VARCHAR(240) NULL,
  package_lpa DECIMAL(10,2) NULL,
  placement_date DATE NULL,
  joining_status VARCHAR(50) NULL,
  recorded_by_user_id CHAR(36) NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_placement_source_key (source, source_record_key),
  KEY ix_placements_date (placement_date),
  KEY ix_placements_student (student_id, placement_date),
  KEY ix_placements_branch_course (branch_id, course_id),
  CONSTRAINT fk_placement_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_placement_application FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE SET NULL,
  CONSTRAINT fk_placement_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_placement_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_placement_actor FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drives (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(240) NOT NULL,
  company_name VARCHAR(240) NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  location VARCHAR(240) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  created_by_user_id CHAR(36) NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_drive_source_key (source, source_record_key),
  KEY ix_drives_status_start (status, starts_at),
  CONSTRAINT fk_drive_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drive_registrations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  drive_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'registered',
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSON NULL,
  UNIQUE KEY uq_drive_student (drive_id, student_id),
  CONSTRAINT fk_drive_registration_drive FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE,
  CONSTRAINT fk_drive_registration_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_id VARCHAR(120) NULL,
  details JSON NULL,
  KEY ix_audit_entity_time (entity_type, entity_id, occurred_at),
  KEY ix_audit_actor_time (actor_user_id, occurred_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_outbox (
  id CHAR(36) NOT NULL PRIMARY KEY,
  idempotency_key VARCHAR(190) NOT NULL,
  sender_key VARCHAR(40) NOT NULL,
  email_category VARCHAR(80) NOT NULL,
  encrypted_payload MEDIUMTEXT NOT NULL,
  context_json JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT NULL,
  sent_at DATETIME NULL,
  related_entity_type VARCHAR(100) NULL,
  related_entity_id VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_idempotency (idempotency_key),
  KEY ix_email_queue (status, available_at, sender_key),
  KEY ix_email_related (related_entity_type, related_entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_delivery_attempts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  outbox_id CHAR(36) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sender_key VARCHAR(40) NULL,
  sender_email VARCHAR(254) NULL,
  email_category VARCHAR(80) NULL,
  provider VARCHAR(80) NULL,
  result VARCHAR(30) NOT NULL,
  recipient_count INT UNSIGNED NULL,
  remaining_quota INT NULL,
  subject VARCHAR(500) NULL,
  provider_message_id VARCHAR(255) NULL,
  error_message TEXT NULL,
  metadata JSON NULL,
  KEY ix_email_attempts_outbox (outbox_id, attempted_at),
  CONSTRAINT fk_email_attempt_outbox FOREIGN KEY (outbox_id) REFERENCES email_outbox(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mail_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  occurred_at DATETIME NOT NULL,
  recipient_name VARCHAR(200) NULL,
  recipient_email VARCHAR(254) NULL,
  mail_type VARCHAR(100) NULL,
  subject VARCHAR(500) NULL,
  status VARCHAR(120) NOT NULL,
  sender_key VARCHAR(40) NULL,
  provider VARCHAR(80) NULL,
  outbox_id CHAR(36) NULL,
  metadata JSON NULL,
  KEY ix_mail_logs_time_type (occurred_at, mail_type),
  KEY ix_mail_logs_recipient (recipient_email, occurred_at),
  CONSTRAINT fk_mail_log_outbox FOREIGN KEY (outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_quota_usage (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sender_key VARCHAR(40) NOT NULL,
  email_category VARCHAR(80) NOT NULL,
  sender_email VARCHAR(254) NOT NULL,
  provider VARCHAR(80) NULL,
  recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
  tracked_remaining INT NULL,
  apps_script_remaining INT NULL,
  sent_at DATETIME NOT NULL,
  metadata JSON NULL,
  KEY ix_email_usage_sender_time (sender_key, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_locations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  parent_location_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_location_branch_name (branch_id, normalized_name),
  CONSTRAINT fk_asset_location_parent FOREIGN KEY (parent_location_id) REFERENCES asset_locations(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_location_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  asset_code VARCHAR(120) NOT NULL,
  name VARCHAR(240) NOT NULL,
  category VARCHAR(160) NULL,
  subcategory VARCHAR(160) NULL,
  asset_type VARCHAR(160) NULL,
  tracking_mode VARCHAR(30) NOT NULL DEFAULT 'individual',
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
  unit VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  location_id CHAR(36) NULL,
  qr_token CHAR(36) NOT NULL,
  image_url TEXT NULL,
  model_3d_url TEXT NULL,
  purchased_at DATE NULL,
  purchase_cost DECIMAL(12,2) NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_code (asset_code),
  UNIQUE KEY uq_asset_qr_token (qr_token),
  UNIQUE KEY uq_asset_source_key (source, source_record_key),
  KEY ix_assets_location_status (location_id, status),
  KEY ix_assets_classification (category, subcategory, asset_type),
  CONSTRAINT fk_asset_location FOREIGN KEY (location_id) REFERENCES asset_locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_activity (
  id CHAR(36) NOT NULL PRIMARY KEY,
  asset_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details JSON NULL,
  KEY ix_asset_activity_time (asset_id, occurred_at),
  CONSTRAINT fk_asset_activity_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_activity_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('001_core');
