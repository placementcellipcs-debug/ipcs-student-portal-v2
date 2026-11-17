-- MySQL-backed student sign-in, session invalidation, and password recovery.
ALTER TABLE users
  ADD COLUMN session_version VARCHAR(64) NOT NULL DEFAULT '0' AFTER password_hash;

CREATE TABLE IF NOT EXISTS student_password_reset_tokens (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  used_at DATETIME(6) NULL,
  UNIQUE KEY uq_student_reset_token_hash (token_hash),
  KEY ix_student_reset_user_status_time (user_id, status, created_at),
  KEY ix_student_reset_expiry (status, expires_at),
  CONSTRAINT fk_student_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('005_student_auth');
