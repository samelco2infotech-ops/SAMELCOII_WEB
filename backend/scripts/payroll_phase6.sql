-- Phase 6 payroll approval, release, and immutable register evidence.
ALTER TABLE payroll_runs
  MODIFY status ENUM('DRAFT','CALCULATED','LOCKED','APPROVED','RELEASED','CANCELLED')
  NOT NULL DEFAULT 'DRAFT';

CREATE TABLE IF NOT EXISTS payroll_run_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  approval_note VARCHAR(255) NOT NULL,
  approved_by VARCHAR(64) NOT NULL,
  approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_run_approval (run_id),
  KEY idx_payroll_approval_actor (approved_by,approved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_run_releases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  release_code VARCHAR(80) NOT NULL,
  release_note VARCHAR(255) NOT NULL,
  register_sha256 CHAR(64) NOT NULL,
  employee_count INT NOT NULL,
  gross_total DECIMAL(16,2) NOT NULL,
  deduction_total DECIMAL(16,2) NOT NULL,
  net_total DECIMAL(16,2) NOT NULL,
  released_by VARCHAR(64) NOT NULL,
  released_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_release_run (run_id),
  UNIQUE KEY uq_payroll_release_code (release_code),
  KEY idx_payroll_release_actor (released_by,released_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_run_releases;
DROP TABLE IF EXISTS payroll_run_approvals;
ALTER TABLE payroll_runs
  MODIFY status ENUM('DRAFT','CALCULATED','LOCKED','CANCELLED')
  NOT NULL DEFAULT 'DRAFT';
