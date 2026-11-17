-- Normalize the asset workbook snapshot for the shared MySQL database.
-- The source archive remains available for row-by-row reconciliation.

CREATE TABLE IF NOT EXISTS asset_classifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  classification_code VARCHAR(120) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  name VARCHAR(200) NOT NULL,
  parent_id CHAR(36) NULL,
  type_class VARCHAR(40) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_classification_code (classification_code),
  UNIQUE KEY uq_asset_classification_source (source, source_record_key),
  KEY ix_asset_classification_parent (parent_id, kind, status),
  CONSTRAINT fk_asset_classification_parent FOREIGN KEY (parent_id) REFERENCES asset_classifications(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE assets
  ADD COLUMN category_classification_id CHAR(36) NULL,
  ADD COLUMN subcategory_classification_id CHAR(36) NULL,
  ADD COLUMN type_classification_id CHAR(36) NULL,
  ADD COLUMN branch_id CHAR(36) NULL,
  ADD COLUMN asset_condition VARCHAR(40) NULL,
  ADD COLUMN brand VARCHAR(160) NULL,
  ADD COLUMN model VARCHAR(160) NULL,
  ADD COLUMN serial_number VARCHAR(200) NULL,
  ADD COLUMN vendor_name VARCHAR(240) NULL,
  ADD COLUMN invoice_number VARCHAR(160) NULL,
  ADD COLUMN warranty_end DATE NULL,
  ADD COLUMN created_by_name VARCHAR(200) NULL,
  ADD COLUMN updated_by_name VARCHAR(200) NULL;

ALTER TABLE assets
  ADD KEY ix_assets_branch_status (branch_id, status),
  ADD CONSTRAINT fk_asset_category_classification FOREIGN KEY (category_classification_id) REFERENCES asset_classifications(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_asset_subcategory_classification FOREIGN KEY (subcategory_classification_id) REFERENCES asset_classifications(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_asset_type_classification FOREIGN KEY (type_classification_id) REFERENCES asset_classifications(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_asset_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS asset_maintenance_tickets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ticket_code VARCHAR(120) NOT NULL,
  asset_id CHAR(36) NULL,
  issue TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  reported_by_user_id CHAR(36) NULL,
  reported_by_name VARCHAR(200) NULL,
  reported_at DATETIME NULL,
  resolved_at DATETIME NULL,
  previous_status VARCHAR(40) NULL,
  cost DECIMAL(12,2) NULL,
  remarks TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_maintenance_code (ticket_code),
  UNIQUE KEY uq_asset_maintenance_source (source, source_record_key),
  KEY ix_asset_maintenance_status (status, reported_at),
  KEY ix_asset_maintenance_asset (asset_id, reported_at),
  CONSTRAINT fk_asset_maintenance_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_maintenance_user FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  asset_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36) NULL,
  actor_name VARCHAR(200) NULL,
  branch_name VARCHAR(160) NULL,
  occurred_at DATETIME NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  remarks TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_history_source (source, source_record_key),
  KEY ix_asset_history_asset_time (asset_id, occurred_at),
  CONSTRAINT fk_asset_history_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_history_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_assignments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  assignment_code VARCHAR(120) NOT NULL,
  asset_id CHAR(36) NULL,
  employee_id VARCHAR(120) NULL,
  employee_name VARCHAR(200) NULL,
  branch_id CHAR(36) NULL,
  assigned_by_user_id CHAR(36) NULL,
  assigned_at DATETIME NULL,
  returned_at DATETIME NULL,
  condition_on_issue VARCHAR(40) NULL,
  condition_on_return VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'returned',
  remarks TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_assignment_code (assignment_code),
  UNIQUE KEY uq_asset_assignment_source (source, source_record_key),
  KEY ix_asset_assignment_asset (asset_id, status, assigned_at),
  KEY ix_asset_assignment_employee (employee_id, assigned_at),
  CONSTRAINT fk_asset_assignment_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_assignment_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_assignment_user FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_documents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  document_code VARCHAR(120) NOT NULL,
  asset_id CHAR(36) NULL,
  document_type VARCHAR(80) NULL,
  file_name VARCHAR(500) NULL,
  url TEXT NULL,
  uploaded_by_user_id CHAR(36) NULL,
  uploaded_by_name VARCHAR(200) NULL,
  uploaded_at DATETIME NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_document_code (document_code),
  UNIQUE KEY uq_asset_document_source (source, source_record_key),
  KEY ix_asset_document_asset (asset_id, uploaded_at),
  CONSTRAINT fk_asset_document_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_document_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_custom_fields (
  id CHAR(36) NOT NULL PRIMARY KEY,
  asset_id CHAR(36) NULL,
  field_name VARCHAR(200) NOT NULL,
  field_value MEDIUMTEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_custom_field_source (source, source_record_key),
  KEY ix_asset_custom_field_asset (asset_id, field_name),
  CONSTRAINT fk_asset_custom_field_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_inventory_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  item_code VARCHAR(120) NOT NULL,
  name VARCHAR(240) NOT NULL,
  category VARCHAR(160) NULL,
  subcategory VARCHAR(160) NULL,
  asset_type VARCHAR(160) NULL,
  branch_id CHAR(36) NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  minimum_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_inventory_code (item_code),
  UNIQUE KEY uq_asset_inventory_source (source, source_record_key),
  KEY ix_asset_inventory_branch_status (branch_id, status),
  CONSTRAINT fk_asset_inventory_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_inventory_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  transaction_code VARCHAR(120) NOT NULL,
  inventory_item_id CHAR(36) NULL,
  transaction_type VARCHAR(60) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  previous_quantity DECIMAL(12,2) NULL,
  new_quantity DECIMAL(12,2) NULL,
  actor_user_id CHAR(36) NULL,
  actor_name VARCHAR(200) NULL,
  occurred_at DATETIME NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_inventory_tx_code (transaction_code),
  UNIQUE KEY uq_asset_inventory_tx_source (source, source_record_key),
  KEY ix_asset_inventory_tx_item (inventory_item_id, occurred_at),
  CONSTRAINT fk_asset_inventory_tx_item FOREIGN KEY (inventory_item_id) REFERENCES asset_inventory_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_inventory_tx_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_vendors (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vendor_code VARCHAR(120) NOT NULL,
  name VARCHAR(240) NOT NULL,
  contact_person VARCHAR(200) NULL,
  phone VARCHAR(60) NULL,
  email VARCHAR(254) NULL,
  address TEXT NULL,
  gst_number VARCHAR(80) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_vendor_code (vendor_code),
  UNIQUE KEY uq_asset_vendor_source (source, source_record_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_approvals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  request_code VARCHAR(120) NOT NULL,
  request_type VARCHAR(60) NOT NULL,
  asset_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  requested_by_user_id CHAR(36) NULL,
  requested_by_name VARCHAR(200) NULL,
  requested_by_email VARCHAR(254) NULL,
  requested_at DATETIME NULL,
  decision VARCHAR(40) NOT NULL DEFAULT 'pending',
  decided_by_user_id CHAR(36) NULL,
  decided_by_name VARCHAR(200) NULL,
  decided_at DATETIME NULL,
  reason TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_approval_request (request_code),
  UNIQUE KEY uq_asset_approval_source (source, source_record_key),
  KEY ix_asset_approval_decision (decision, requested_at),
  CONSTRAINT fk_asset_approval_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_approval_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_approval_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_approval_decider FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_transfers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  transfer_code VARCHAR(120) NOT NULL,
  asset_id CHAR(36) NULL,
  from_branch_id CHAR(36) NULL,
  to_branch_id CHAR(36) NULL,
  requested_by_user_id CHAR(36) NULL,
  requested_at DATETIME NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  approved_by_user_id CHAR(36) NULL,
  approved_at DATETIME NULL,
  received_by_user_id CHAR(36) NULL,
  received_at DATETIME NULL,
  remarks TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_transfer_code (transfer_code),
  UNIQUE KEY uq_asset_transfer_source (source, source_record_key),
  KEY ix_asset_transfer_status (status, requested_at),
  CONSTRAINT fk_asset_transfer_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_transfer_from_branch FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_transfer_to_branch FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_transfer_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_transfer_approver FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_transfer_receiver FOREIGN KEY (received_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_transfer_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  transfer_id CHAR(36) NULL,
  asset_id CHAR(36) NULL,
  item_name VARCHAR(240) NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_transfer_item_source (source, source_record_key),
  KEY ix_asset_transfer_item_transfer (transfer_id),
  CONSTRAINT fk_asset_transfer_item_transfer FOREIGN KEY (transfer_id) REFERENCES asset_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_transfer_item_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_disposals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  disposal_code VARCHAR(120) NOT NULL,
  asset_id CHAR(36) NULL,
  reason TEXT NULL,
  method VARCHAR(100) NULL,
  value DECIMAL(12,2) NULL,
  requested_by_user_id CHAR(36) NULL,
  approved_by_user_id CHAR(36) NULL,
  disposed_at DATETIME NULL,
  remarks TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_disposal_code (disposal_code),
  UNIQUE KEY uq_asset_disposal_source (source, source_record_key),
  CONSTRAINT fk_asset_disposal_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_disposal_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_disposal_approver FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_qr_labels (
  id CHAR(36) NOT NULL PRIMARY KEY,
  asset_id CHAR(36) NOT NULL,
  qr_value TEXT NOT NULL,
  qr_version VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_by_user_id CHAR(36) NULL,
  created_by_name VARCHAR(200) NULL,
  created_at DATETIME NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  UNIQUE KEY uq_asset_qr_source (source, source_record_key),
  KEY ix_asset_qr_asset (asset_id, status),
  CONSTRAINT fk_asset_qr_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_qr_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_audits (
  id CHAR(36) NOT NULL PRIMARY KEY,
  audit_code VARCHAR(120) NOT NULL,
  name VARCHAR(240) NOT NULL,
  branch_id CHAR(36) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  created_by_user_id CHAR(36) NULL,
  created_by_name VARCHAR(200) NULL,
  created_at DATETIME NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  UNIQUE KEY uq_asset_audit_code (audit_code),
  UNIQUE KEY uq_asset_audit_source (source, source_record_key),
  CONSTRAINT fk_asset_audit_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_audit_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_audit_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  audit_id CHAR(36) NULL,
  asset_id CHAR(36) NULL,
  expected_status VARCHAR(40) NULL,
  counted_status VARCHAR(40) NULL,
  counted_by_user_id CHAR(36) NULL,
  counted_by_name VARCHAR(200) NULL,
  counted_at DATETIME NULL,
  remarks TEXT NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  UNIQUE KEY uq_asset_audit_item_source (source, source_record_key),
  CONSTRAINT fk_asset_audit_item_audit FOREIGN KEY (audit_id) REFERENCES asset_audits(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_audit_item_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_audit_item_user FOREIGN KEY (counted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_notification_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  recipient VARCHAR(254) NULL,
  subject VARCHAR(500) NULL,
  delivery_status VARCHAR(40) NOT NULL,
  provider VARCHAR(80) NULL,
  queue_id VARCHAR(120) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  related_entity_id VARCHAR(120) NULL,
  branch_name VARCHAR(160) NULL,
  created_at DATETIME NULL,
  source VARCHAR(80) NULL,
  source_record_key VARCHAR(200) NULL,
  metadata JSON NULL,
  UNIQUE KEY uq_asset_notification_source (source, source_record_key),
  KEY ix_asset_notification_created (created_at, delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('009_asset_management');
