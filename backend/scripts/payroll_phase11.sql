-- Phase 11 production-operations control records. No external activation is performed.
CREATE TABLE IF NOT EXISTS payroll_production_windows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  authorization_id BIGINT UNSIGNED NOT NULL,
  window_code VARCHAR(60) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  cutoff_at DATETIME NOT NULL,
  status ENUM('PLANNED','ACTIVE','HOLD','CLOSED') NOT NULL DEFAULT 'PLANNED',
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_by VARCHAR(64) NULL,
  status_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_production_authorization (authorization_id),
  UNIQUE KEY uq_payroll_production_window_code (window_code),
  KEY idx_payroll_production_status (status,cutoff_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_operation_checklists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  window_id BIGINT UNSIGNED NOT NULL,
  stage ENUM('PRE_RUN','POST_RUN') NOT NULL,
  item_code VARCHAR(60) NOT NULL,
  item_label VARCHAR(255) NOT NULL,
  status ENUM('PENDING','PASSED','FAILED','NOT_APPLICABLE') NOT NULL,
  evidence_reference VARCHAR(255) NULL,
  checked_by VARCHAR(64) NOT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_operation_checklist (window_id,stage,item_code),
  KEY idx_payroll_operation_checklist_status (window_id,stage,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_operation_incidents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  window_id BIGINT UNSIGNED NOT NULL,
  incident_code VARCHAR(60) NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  summary VARCHAR(255) NOT NULL,
  status ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  resolution VARCHAR(500) NULL,
  recorded_by VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by VARCHAR(64) NULL,
  resolved_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_operation_incident (window_id,incident_code),
  KEY idx_payroll_operation_incident_status (window_id,status,severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_operation_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  window_id BIGINT UNSIGNED NOT NULL,
  action_code VARCHAR(60) NOT NULL,
  action_type ENUM('CORRECTION','REVERSAL','OFF_CYCLE','RECOVERY') NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('REQUESTED','APPROVED','COMPLETED','REJECTED') NOT NULL,
  authority_reference VARCHAR(255) NULL,
  evidence_reference VARCHAR(255) NULL,
  recorded_by VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_operation_action (window_id,action_code),
  KEY idx_payroll_operation_action_status (window_id,action_type,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_operation_actions;
DROP TABLE IF EXISTS payroll_operation_incidents;
DROP TABLE IF EXISTS payroll_operation_checklists;
DROP TABLE IF EXISTS payroll_production_windows;
