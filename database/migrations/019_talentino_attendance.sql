CREATE TABLE IF NOT EXISTS talentino_attendance_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  student_profile_id CHAR(36) NOT NULL,
  student_email VARCHAR(254) NOT NULL,
  normalized_student_email VARCHAR(254) NOT NULL,
  student_name VARCHAR(200) NOT NULL,
  branch_name VARCHAR(160) NOT NULL,
  course_name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  feedback TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  attendance_date_raw VARCHAR(16) NOT NULL,
  timestamp_raw VARCHAR(100) NOT NULL,
  source_cells_json JSON NOT NULL,
  request_id VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_talentino_attendance_student_date (normalized_student_email, attendance_date),
  KEY ix_talentino_attendance_profile_date (student_profile_id, attendance_date),
  CONSTRAINT fk_talentino_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_talentino_attendance_profile FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('019_talentino_attendance');
