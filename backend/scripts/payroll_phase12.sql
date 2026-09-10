-- Phase 12 compliance reporting and year-end evidence. No government filing is submitted.
CREATE TABLE IF NOT EXISTS payroll_compliance_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_code VARCHAR(60) NOT NULL,
  period_key VARCHAR(12) NOT NULL,
  period_type ENUM('MONTHLY','YEAR_END') NOT NULL,
  calendar_year SMALLINT UNSIGNED NOT NULL,
  calendar_month TINYINT UNSIGNED NULL,
  note VARCHAR(255) NOT NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(64) NULL,
  closed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_compliance_period_code (period_code),
  UNIQUE KEY uq_payroll_compliance_period_key (period_key),
  KEY idx_payroll_compliance_period_status (status,calendar_year,calendar_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_compliance_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  run_id BIGINT UNSIGNED NULL,
  agency ENUM('SSS','PHILHEALTH','PAGIBIG','BIR','OTHER') NOT NULL,
  report_type VARCHAR(80) NOT NULL,
  report_code VARCHAR(60) NOT NULL,
  amendment_of_id BIGINT UNSIGNED NULL,
  component_codes_json TEXT NOT NULL,
  employee_count INT UNSIGNED NOT NULL,
  total_amount DECIMAL(16,2) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  status ENUM('DRAFT','VERIFIED','FILED','AMENDED') NOT NULL DEFAULT 'DRAFT',
  filing_reference VARCHAR(255) NULL,
  filing_date DATE NULL,
  prepared_by VARCHAR(64) NOT NULL,
  prepared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_by VARCHAR(64) NULL,
  status_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_compliance_report_code (report_code),
  KEY idx_payroll_compliance_report_period (period_id,agency,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_compliance_report_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  usercode VARCHAR(64) NOT NULL,
  employee_name VARCHAR(160) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_compliance_report_employee (report_id,usercode),
  KEY idx_payroll_compliance_report_amount (report_id,amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_year_end_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  usercode VARCHAR(64) NOT NULL,
  employee_name VARCHAR(160) NOT NULL,
  withholding_codes_json TEXT NOT NULL,
  gross_amount DECIMAL(16,2) NOT NULL,
  deduction_amount DECIMAL(16,2) NOT NULL,
  withholding_amount DECIMAL(16,2) NOT NULL,
  net_amount DECIMAL(16,2) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  status ENUM('DRAFT','VERIFIED','ISSUED') NOT NULL DEFAULT 'DRAFT',
  issue_reference VARCHAR(255) NULL,
  generated_by VARCHAR(64) NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_by VARCHAR(64) NULL,
  status_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_year_end_employee (period_id,usercode),
  KEY idx_payroll_year_end_status (period_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_year_end_records;
DROP TABLE IF EXISTS payroll_compliance_report_items;
DROP TABLE IF EXISTS payroll_compliance_reports;
DROP TABLE IF EXISTS payroll_compliance_periods;
