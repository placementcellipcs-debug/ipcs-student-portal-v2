-- Student Portal leave and absence submissions. Legacy date/timestamp strings
-- are retained alongside parsed dates so ambiguous source values are not lost.
CREATE TABLE IF NOT EXISTS student_leave_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_id CHAR(36) NULL,
  student_email VARCHAR(254) NOT NULL,
  student_name VARCHAR(200) NOT NULL,
  roll_number VARCHAR(100) NULL,
  branch_id CHAR(36) NULL,
  course_id CHAR(36) NULL,
  branch_name VARCHAR(160) NULL,
  course_name VARCHAR(200) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  start_date_raw VARCHAR(100) NOT NULL DEFAULT '',
  end_date_raw VARCHAR(100) NOT NULL DEFAULT '',
  request_type VARCHAR(40) NOT NULL DEFAULT 'Leave Request',
  reason TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  requested_at DATETIME NULL,
  requested_at_raw VARCHAR(100) NOT NULL DEFAULT '',
  source VARCHAR(80) NOT NULL,
  source_record_key VARCHAR(200) NOT NULL,
  source_row_number INT UNSIGNED NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_leave_source (source, source_record_key),
  KEY ix_student_leave_owner_time (student_id, created_at),
  KEY ix_student_leave_email_time (student_email, created_at),
  KEY ix_student_leave_status (status, created_at),
  CONSTRAINT fk_student_leave_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_leave_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_leave_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('006_student_leave_requests');
