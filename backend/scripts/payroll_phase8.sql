-- Phase 8 accounting mappings and irreversible payroll-period closure.
CREATE TABLE IF NOT EXISTS payroll_account_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  component_code VARCHAR(40) NOT NULL,
  component_type ENUM('EARNING','DEDUCTION','NET_PAY') NOT NULL,
  debit_account_code VARCHAR(40) NOT NULL,
  debit_account_name VARCHAR(120) NOT NULL,
  credit_account_code VARCHAR(40) NOT NULL,
  credit_account_name VARCHAR(120) NOT NULL,
  effective_from DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_account_mapping (component_code,effective_from),
  KEY idx_payroll_account_mapping_active (is_active,effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_period_closures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  close_code VARCHAR(80) NOT NULL,
  close_note VARCHAR(255) NOT NULL,
  register_sha256 CHAR(64) NOT NULL,
  journal_sha256 CHAR(64) NOT NULL,
  total_debits DECIMAL(16,2) NOT NULL,
  total_credits DECIMAL(16,2) NOT NULL,
  checklist_json LONGTEXT NOT NULL,
  closed_by VARCHAR(64) NOT NULL,
  closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_period_closure_run (run_id),
  UNIQUE KEY uq_payroll_period_close_code (close_code),
  KEY idx_payroll_period_closed_at (closed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_period_journal_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  closure_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  component_code VARCHAR(40) NOT NULL,
  side ENUM('DEBIT','CREDIT') NOT NULL,
  account_code VARCHAR(40) NOT NULL,
  account_name VARCHAR(120) NOT NULL,
  debit DECIMAL(16,2) NOT NULL DEFAULT 0,
  credit DECIMAL(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_closed_journal_line (closure_id,line_no),
  KEY idx_payroll_closed_journal_account (account_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_period_journal_lines;
DROP TABLE IF EXISTS payroll_period_closures;
DROP TABLE IF EXISTS payroll_account_mappings;
