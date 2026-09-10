CREATE TABLE IF NOT EXISTS payroll_components (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 component_code VARCHAR(40) NOT NULL, component_name VARCHAR(120) NOT NULL,
 component_type ENUM('EARNING','DEDUCTION') NOT NULL,
 amount_mode ENUM('FIXED_PER_RUN','MONTHLY_PRORATED') NOT NULL DEFAULT 'FIXED_PER_RUN',
 is_statutory TINYINT(1) NOT NULL DEFAULT 0, is_taxable TINYINT(1) NOT NULL DEFAULT 0,
 is_active TINYINT(1) NOT NULL DEFAULT 1, created_by VARCHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_component_code(component_code),
 KEY idx_payroll_component_active(component_type,is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_employee_components (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(64) NOT NULL,
 component_id BIGINT UNSIGNED NOT NULL, amount DECIMAL(13,2) NOT NULL,
 effective_from DATE NOT NULL, effective_to DATE NULL,
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_employee_component(usercode,component_id,effective_from),
 KEY idx_payroll_employee_component_lookup(usercode,effective_from,effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_loans (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(64) NOT NULL,
 loan_code VARCHAR(40) NOT NULL, lender VARCHAR(120) NOT NULL,
 original_amount DECIMAL(13,2) NOT NULL, balance DECIMAL(13,2) NOT NULL,
 installment_amount DECIMAL(13,2) NOT NULL, effective_from DATE NOT NULL,
 status ENUM('ACTIVE','PAID','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_employee_loan(usercode,loan_code),
 KEY idx_payroll_loan_active(usercode,status,effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_statutory_rules (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, component_id BIGINT UNSIGNED NOT NULL,
 rule_code VARCHAR(40) NOT NULL, effective_from DATE NOT NULL, effective_to DATE NULL,
 salary_from DECIMAL(13,2) NOT NULL DEFAULT 0, salary_to DECIMAL(13,2) NULL,
 fixed_amount DECIMAL(13,2) NOT NULL DEFAULT 0, rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_statutory_rule(component_id,rule_code,effective_from),
 KEY idx_payroll_statutory_lookup(component_id,effective_from,effective_to,salary_from,salary_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_run_adjustments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, run_id BIGINT UNSIGNED NOT NULL,
 usercode VARCHAR(64) NOT NULL, component_code VARCHAR(40) NOT NULL,
 component_type ENUM('EARNING','DEDUCTION') NOT NULL, amount DECIMAL(13,2) NOT NULL,
 reason VARCHAR(255) NOT NULL, created_by VARCHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), KEY idx_payroll_run_adjustment(run_id,usercode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_run_adjustments;
DROP TABLE IF EXISTS payroll_statutory_rules;
DROP TABLE IF EXISTS payroll_loans;
DROP TABLE IF EXISTS payroll_employee_components;
DROP TABLE IF EXISTS payroll_components;
