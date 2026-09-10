CREATE TABLE IF NOT EXISTS payroll_schedule_templates (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, template_code VARCHAR(40) NOT NULL,
 template_name VARCHAR(120) NOT NULL, work_start TIME NOT NULL, work_end TIME NOT NULL,
 break_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60, work_days VARCHAR(40) NOT NULL DEFAULT '1,2,3,4,5',
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_schedule_code(template_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_employee_schedules (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(64) NOT NULL,
 template_id BIGINT UNSIGNED NOT NULL, effective_from DATE NOT NULL, effective_to DATE NULL,
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_payroll_employee_schedule(usercode,effective_from),
 KEY idx_payroll_schedule_lookup(usercode,effective_from,effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_import_batches (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, import_type VARCHAR(40) NOT NULL,
 source_name VARCHAR(160) NOT NULL, row_count INT NOT NULL DEFAULT 0,
 accepted_count INT NOT NULL DEFAULT 0, rejected_count INT NOT NULL DEFAULT 0,
 details_json LONGTEXT NOT NULL, created_by VARCHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), KEY idx_payroll_import_type(import_type,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
DROP TABLE IF EXISTS payroll_import_batches;
DROP TABLE IF EXISTS payroll_employee_schedules;
DROP TABLE IF EXISTS payroll_schedule_templates;
