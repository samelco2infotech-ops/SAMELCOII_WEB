-- Phase 10 user-acceptance testing and controlled go-live authorization.
CREATE TABLE IF NOT EXISTS payroll_uat_cycles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_id BIGINT UNSIGNED NOT NULL,
  cycle_code VARCHAR(60) NOT NULL,
  scope_statement VARCHAR(255) NOT NULL,
  status ENUM('OPEN','AUTHORIZED','HOLD') NOT NULL DEFAULT 'OPEN',
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_uat_cycle_code (cycle_code),
  KEY idx_payroll_uat_cycle_test (test_id,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_uat_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id BIGINT UNSIGNED NOT NULL,
  case_code VARCHAR(60) NOT NULL,
  case_type ENUM('PAYSLIP','ATTENDANCE','OVERTIME','EARNINGS','DEDUCTIONS','ACCOUNTING','PAYMENT','SECURITY','BACKUP_ROLLBACK') NOT NULL,
  scenario VARCHAR(255) NOT NULL,
  expected_result VARCHAR(500) NOT NULL,
  actual_result VARCHAR(500) NOT NULL,
  status ENUM('PENDING','PASSED','FAILED','BLOCKED') NOT NULL,
  evidence_reference VARCHAR(255) NULL,
  executed_by VARCHAR(64) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_uat_case (cycle_id,case_code),
  KEY idx_payroll_uat_case_status (cycle_id,case_type,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_uat_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id BIGINT UNSIGNED NOT NULL,
  issue_code VARCHAR(60) NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  summary VARCHAR(255) NOT NULL,
  resolution VARCHAR(500) NULL,
  status ENUM('OPEN','RESOLVED','ACCEPTED_RISK') NOT NULL DEFAULT 'OPEN',
  recorded_by VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by VARCHAR(64) NULL,
  resolved_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_uat_issue (cycle_id,issue_code),
  KEY idx_payroll_uat_issue_status (cycle_id,status,severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_go_live_authorizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id BIGINT UNSIGNED NOT NULL,
  authorization_code VARCHAR(60) NOT NULL,
  scheduled_at DATETIME NOT NULL,
  rollback_reference VARCHAR(255) NOT NULL,
  statement VARCHAR(500) NOT NULL,
  authorized_by VARCHAR(64) NOT NULL,
  authorized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_go_live_cycle (cycle_id),
  UNIQUE KEY uq_payroll_go_live_code (authorization_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_go_live_authorizations;
DROP TABLE IF EXISTS payroll_uat_issues;
DROP TABLE IF EXISTS payroll_uat_cases;
DROP TABLE IF EXISTS payroll_uat_cycles;
