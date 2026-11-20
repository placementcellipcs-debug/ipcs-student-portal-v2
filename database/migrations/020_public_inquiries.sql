CREATE TABLE IF NOT EXISTS portal_inquiries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  inquiry_id VARCHAR(120) NOT NULL,
  inquiry_type VARCHAR(40) NOT NULL,
  submitted_at_raw VARCHAR(100) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'New',
  assigned_name VARCHAR(200) NULL,
  assigned_email VARCHAR(254) NULL,
  assigned_branch VARCHAR(160) NULL,
  assigned_at_raw VARCHAR(100) NULL,
  assigned_by VARCHAR(200) NULL,
  notification_status VARCHAR(500) NULL,
  notification_sent_at_raw VARCHAR(100) NULL,
  internal_email_status VARCHAR(500) NULL,
  fields_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portal_inquiries_inquiry_id (inquiry_id),
  KEY ix_portal_inquiries_type_created (inquiry_type, created_at),
  KEY ix_portal_inquiries_status (inquiry_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('020_public_inquiries');
