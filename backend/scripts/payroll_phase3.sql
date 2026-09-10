-- Phase 3 draft payroll runs. ROLLBACK remains manual.
CREATE TABLE IF NOT EXISTS payroll_runs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, run_code VARCHAR(40) NOT NULL,
 cutoff_start DATE NOT NULL, cutoff_end DATE NOT NULL, pay_date DATE NOT NULL,
 base_pay_factor DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
 status ENUM('DRAFT','CALCULATED','LOCKED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 employee_count INT NOT NULL DEFAULT 0, exception_count INT NOT NULL DEFAULT 0,
 gross_total DECIMAL(16,2) NOT NULL DEFAULT 0, deduction_total DECIMAL(16,2) NOT NULL DEFAULT 0,
 net_total DECIMAL(16,2) NOT NULL DEFAULT 0, created_by VARCHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_run_code(run_code), KEY idx_payroll_run_dates(cutoff_start,cutoff_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_run_employees (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, run_id BIGINT UNSIGNED NOT NULL,
 usercode VARCHAR(64) NOT NULL, employee_name VARCHAR(160) NOT NULL,
 basic_monthly DECIMAL(14,2) NOT NULL DEFAULT 0, basic_pay DECIMAL(14,2) NOT NULL DEFAULT 0,
 overtime_pay DECIMAL(14,2) NOT NULL DEFAULT 0, gross_pay DECIMAL(14,2) NOT NULL DEFAULT 0,
 deduction_total DECIMAL(14,2) NOT NULL DEFAULT 0, net_pay DECIMAL(14,2) NOT NULL DEFAULT 0,
 exception_count INT NOT NULL DEFAULT 0, status ENUM('READY','BLOCKED') NOT NULL DEFAULT 'BLOCKED',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_run_employee(run_id,usercode), KEY idx_payroll_run_employee_user(usercode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_run_items (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, run_employee_id BIGINT UNSIGNED NOT NULL,
 component_code VARCHAR(40) NOT NULL, component_type ENUM('EARNING','DEDUCTION') NOT NULL,
 amount DECIMAL(14,2) NOT NULL DEFAULT 0, source_reference VARCHAR(128) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), KEY idx_payroll_run_item_employee(run_employee_id,component_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_run_exceptions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, run_id BIGINT UNSIGNED NOT NULL,
 usercode VARCHAR(64) NULL, exception_code VARCHAR(60) NOT NULL,
 severity ENUM('BLOCKING','WARNING') NOT NULL DEFAULT 'BLOCKING',
 message VARCHAR(255) NOT NULL, is_resolved TINYINT(1) NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), KEY idx_payroll_exception_run(run_id,is_resolved,severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_run_exceptions;
DROP TABLE IF EXISTS payroll_run_items;
DROP TABLE IF EXISTS payroll_run_employees;
DROP TABLE IF EXISTS payroll_runs;
