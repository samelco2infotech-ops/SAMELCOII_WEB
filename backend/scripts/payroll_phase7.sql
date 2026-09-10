-- Phase 7 payment and remittance reconciliation tracking.
-- This schema records references and status only and does not transmit funds.
CREATE TABLE IF NOT EXISTS payroll_disbursement_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  batch_code VARCHAR(60) NOT NULL,
  payment_method ENUM('BANK_TRANSFER','CHECK','CASH','OTHER') NOT NULL,
  status ENUM('PREPARED','TRANSMITTED','CONFIRMED','FAILED','CANCELLED') NOT NULL DEFAULT 'PREPARED',
  employee_count INT NOT NULL,
  total_amount DECIMAL(16,2) NOT NULL,
  register_sha256 CHAR(64) NOT NULL,
  external_reference VARCHAR(120) NULL,
  failure_reason VARCHAR(255) NULL,
  prepared_by VARCHAR(64) NOT NULL,
  prepared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transmitted_by VARCHAR(64) NULL,
  transmitted_at DATETIME NULL,
  confirmed_by VARCHAR(64) NULL,
  confirmed_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_disbursement_run (run_id),
  UNIQUE KEY uq_payroll_disbursement_code (batch_code),
  KEY idx_payroll_disbursement_status (status,prepared_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_disbursement_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  run_employee_id BIGINT UNSIGNED NOT NULL,
  usercode VARCHAR(64) NOT NULL,
  employee_name VARCHAR(160) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('PENDING','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
  payment_reference VARCHAR(120) NULL,
  failure_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_disbursement_employee (batch_id,run_employee_id),
  KEY idx_payroll_disbursement_user (usercode,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_remittance_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  remittance_type ENUM('STATUTORY','LOAN') NOT NULL,
  component_code VARCHAR(40) NOT NULL,
  payee VARCHAR(120) NOT NULL,
  amount DECIMAL(16,2) NOT NULL,
  status ENUM('PREPARED','REMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PREPARED',
  external_reference VARCHAR(120) NULL,
  failure_reason VARCHAR(255) NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  remitted_by VARCHAR(64) NULL,
  remitted_at DATETIME NULL,
  confirmed_by VARCHAR(64) NULL,
  confirmed_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_remittance_component (run_id,remittance_type,component_code),
  KEY idx_payroll_remittance_status (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_remittance_batches;
DROP TABLE IF EXISTS payroll_disbursement_items;
DROP TABLE IF EXISTS payroll_disbursement_batches;
