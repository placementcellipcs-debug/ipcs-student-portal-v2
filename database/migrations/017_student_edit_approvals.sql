CREATE TABLE IF NOT EXISTS student_profile_change_requests (
  request_id VARCHAR(80) NOT NULL PRIMARY KEY,
  student_profile_id CHAR(36) NOT NULL,
  source_row_number INT UNSIGNED NOT NULL,
  student_roll_number VARCHAR(160) NULL,
  student_name VARCHAR(200) NOT NULL,
  student_branch VARCHAR(160) NULL,
  requested_by_user_id CHAR(36) NULL,
  requested_by_name VARCHAR(160) NOT NULL,
  requested_by_email VARCHAR(254) NOT NULL,
  requested_by_role VARCHAR(100) NULL,
  change_summary VARCHAR(500) NOT NULL,
  original_data_json JSON NOT NULL,
  proposed_data_json JSON NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Pending',
  reviewed_by_user_id CHAR(36) NULL,
  reviewed_by_name VARCHAR(160) NULL,
  reviewed_by_email VARCHAR(254) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  decision_notes VARCHAR(1000) NULL,
  execution_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_student_edit_requests_status_time (status, requested_at),
  KEY ix_student_edit_requests_requester (requested_by_email, status, reviewed_at),
  KEY ix_student_edit_requests_profile (student_profile_id, status),
  CONSTRAINT fk_student_edit_request_profile FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_edit_request_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_edit_request_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_notifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  notification_type VARCHAR(80) NOT NULL,
  title VARCHAR(240) NOT NULL,
  message TEXT NOT NULL,
  data_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  KEY ix_portal_notifications_user_created (user_id, created_at),
  KEY ix_portal_notifications_user_unread (user_id, read_at, created_at),
  CONSTRAINT fk_portal_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('017_student_edit_approvals');
