/**
 * Purpose: Store HR/payroll identity fields that do not exist in the legacy usertb table.
 * EDIT GUIDE: Run once against the local SAMELCII application database.
 * HUWAG BAGUHIN: Employee ID remains the immutable usertb.usercode link.
 */
CREATE TABLE IF NOT EXISTS payroll_employee_hr_profiles (
    usercode VARCHAR(191) NOT NULL,
    tin VARCHAR(20) NULL,
    sss_number VARCHAR(20) NULL,
    philhealth_number VARCHAR(20) NULL,
    pagibig_number VARCHAR(20) NULL,
    national_id VARCHAR(24) NULL,
    payroll_id VARCHAR(40) NULL,
    bank_name VARCHAR(120) NULL,
    bank_account_name VARCHAR(120) NULL,
    bank_account_number VARCHAR(40) NULL,
    employment_type VARCHAR(30) NULL,
    employment_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    supervisor VARCHAR(120) NULL,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (usercode),
    UNIQUE KEY uq_employee_hr_tin (tin),
    UNIQUE KEY uq_employee_hr_sss (sss_number),
    UNIQUE KEY uq_employee_hr_philhealth (philhealth_number),
    UNIQUE KEY uq_employee_hr_pagibig (pagibig_number),
    UNIQUE KEY uq_employee_hr_national_id (national_id),
    UNIQUE KEY uq_employee_hr_payroll_id (payroll_id),
    UNIQUE KEY uq_employee_hr_bank_account (bank_account_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
