-- ============================================================
-- FILE: payroll_phase2.sql
-- PURPOSE: Phase 2 Payroll master, configuration, and audit tables
-- EDIT GUIDE: Add confirmed rate versions as new effective-dated rows
-- HUWAG BAGUHIN: Never rewrite historical compensation or audit rows
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_employee_profiles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usercode VARCHAR(64) NOT NULL,
    payroll_group VARCHAR(40) NOT NULL DEFAULT 'REGULAR',
    pay_basis ENUM('MONTHLY', 'DAILY', 'HOURLY') NOT NULL DEFAULT 'MONTHLY',
    statutory_regime VARCHAR(30) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payroll_employee_usercode (usercode),
    KEY idx_payroll_employee_group (payroll_group, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_compensation_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usercode VARCHAR(64) NOT NULL,
    effective_date DATE NOT NULL,
    basic_monthly DECIMAL(14,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payroll_compensation_date (usercode, effective_date),
    KEY idx_payroll_compensation_lookup (usercode, effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_periods (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    period_code VARCHAR(40) NOT NULL,
    payroll_group VARCHAR(40) NOT NULL,
    cutoff_start DATE NOT NULL,
    cutoff_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    status ENUM('DRAFT', 'OPEN', 'LOCKED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payroll_period_code (period_code),
    KEY idx_payroll_period_dates (payroll_group, cutoff_start, cutoff_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_component_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    component_code VARCHAR(40) NOT NULL,
    component_name VARCHAR(120) NOT NULL,
    component_type ENUM('EARNING', 'DEDUCTION') NOT NULL,
    taxable TINYINT(1) NOT NULL DEFAULT 0,
    contribution_basis TINYINT(1) NOT NULL DEFAULT 0,
    priority_order SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    is_enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payroll_component_code (component_code),
    KEY idx_payroll_component_type (component_type, is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_overtime_rates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rate_code VARCHAR(60) NOT NULL,
    label VARCHAR(120) NOT NULL,
    multiplier DECIMAL(8,4) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 0,
    requires_confirmation TINYINT(1) NOT NULL DEFAULT 1,
    display_order SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payroll_ot_rate_version (rate_code, effective_from),
    KEY idx_payroll_ot_rate_active (is_enabled, effective_from, effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_usercode VARCHAR(64) NOT NULL,
    action_type VARCHAR(40) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_key VARCHAR(128) NOT NULL,
    details_json LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_payroll_audit_entity (entity_type, entity_key, created_at),
    KEY idx_payroll_audit_actor (actor_usercode, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payroll_overtime_rates
    (rate_code, label, multiplier, effective_from, is_enabled, requires_confirmation, display_order, created_by)
VALUES
    ('OFFICE_DAY_OT', 'Office day overtime', 1.3000, '2026-07-30', 1, 0, 10, 'PHASE2_MIGRATION'),
    ('REGULAR_HOLIDAY_SET_A', 'Regular holiday - set A', 2.1000, '2026-07-30', 0, 1, 20, 'PHASE2_MIGRATION'),
    ('REST_SPECIAL_SET_A', 'Rest / special day - set A', 1.4000, '2026-07-30', 0, 1, 30, 'PHASE2_MIGRATION'),
    ('REGULAR_HOLIDAY_SET_B', 'Regular holiday - set B', 1.4000, '2026-07-30', 0, 1, 40, 'PHASE2_MIGRATION'),
    ('REST_SPECIAL_SET_B', 'Rest / special day - set B', 1.3500, '2026-07-30', 0, 1, 50, 'PHASE2_MIGRATION')
ON DUPLICATE KEY UPDATE
    label=VALUES(label),
    multiplier=VALUES(multiplier),
    is_enabled=VALUES(is_enabled),
    requires_confirmation=VALUES(requires_confirmation),
    display_order=VALUES(display_order);

INSERT INTO payroll_component_definitions
    (component_code, component_name, component_type, taxable, contribution_basis, priority_order, is_enabled, created_by)
VALUES
    ('BASIC', 'Basic pay', 'EARNING', 1, 1, 10, 1, 'PHASE2_MIGRATION'),
    ('OT', 'Overtime pay', 'EARNING', 1, 0, 20, 1, 'PHASE2_MIGRATION'),
    ('WITHHOLDING_TAX', 'Withholding tax', 'DEDUCTION', 0, 0, 10, 0, 'PHASE2_MIGRATION'),
    ('SSS_GSIS', 'SSS / GSIS', 'DEDUCTION', 0, 0, 20, 0, 'PHASE2_MIGRATION'),
    ('PHILHEALTH', 'PhilHealth', 'DEDUCTION', 0, 0, 30, 0, 'PHASE2_MIGRATION'),
    ('PAGIBIG', 'Pag-IBIG', 'DEDUCTION', 0, 0, 40, 0, 'PHASE2_MIGRATION')
ON DUPLICATE KEY UPDATE
    component_name=VALUES(component_name),
    priority_order=VALUES(priority_order);

-- ROLLBACK
-- Manual only after an approved backup because these statements remove Payroll data
DROP TABLE IF EXISTS payroll_audit_log;
DROP TABLE IF EXISTS payroll_overtime_rates;
DROP TABLE IF EXISTS payroll_component_definitions;
DROP TABLE IF EXISTS payroll_periods;
DROP TABLE IF EXISTS payroll_compensation_history;
DROP TABLE IF EXISTS payroll_employee_profiles;
