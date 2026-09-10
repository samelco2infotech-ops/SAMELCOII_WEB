-- Phase 9 parallel-payroll testing and production-readiness sign-offs.
CREATE TABLE IF NOT EXISTS payroll_parallel_tests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  test_code VARCHAR(60) NOT NULL,
  tolerance DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('PASSED','FAILED') NOT NULL,
  system_count INT NOT NULL,
  expected_count INT NOT NULL,
  matched_count INT NOT NULL,
  variance_count INT NOT NULL,
  gross_expected DECIMAL(16,2) NOT NULL,
  gross_system DECIMAL(16,2) NOT NULL,
  gross_variance DECIMAL(16,2) NOT NULL,
  deduction_expected DECIMAL(16,2) NOT NULL,
  deduction_system DECIMAL(16,2) NOT NULL,
  deduction_variance DECIMAL(16,2) NOT NULL,
  net_expected DECIMAL(16,2) NOT NULL,
  net_system DECIMAL(16,2) NOT NULL,
  net_variance DECIMAL(16,2) NOT NULL,
  source_name VARCHAR(160) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_parallel_test_code (test_code),
  KEY idx_payroll_parallel_test_run (run_id,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_parallel_test_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_id BIGINT UNSIGNED NOT NULL,
  usercode VARCHAR(64) NOT NULL,
  employee_name VARCHAR(160) NULL,
  expected_gross DECIMAL(14,2) NOT NULL DEFAULT 0,
  system_gross DECIMAL(14,2) NOT NULL DEFAULT 0,
  gross_variance DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
  system_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
  deduction_variance DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_net DECIMAL(14,2) NOT NULL DEFAULT 0,
  system_net DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_variance DECIMAL(14,2) NOT NULL DEFAULT 0,
  result ENUM('MATCH','VARIANCE','MISSING_EXPECTED','MISSING_SYSTEM') NOT NULL,
  within_tolerance TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_parallel_test_employee (test_id,usercode),
  KEY idx_payroll_parallel_variance (test_id,within_tolerance,result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_cutover_signoffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_id BIGINT UNSIGNED NOT NULL,
  signoff_role ENUM('HR','PAYROLL','FINANCE','MANAGEMENT') NOT NULL,
  statement VARCHAR(255) NOT NULL,
  signed_by VARCHAR(64) NOT NULL,
  signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_cutover_role (test_id,signoff_role),
  KEY idx_payroll_cutover_signer (signed_by,signed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_cutover_signoffs;
DROP TABLE IF EXISTS payroll_parallel_test_items;
DROP TABLE IF EXISTS payroll_parallel_tests;
