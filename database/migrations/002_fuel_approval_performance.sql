-- Fuel Approval Desk performance indexes
-- Date: 2026-07-28
-- Safe to run more than once on the it_program database.
USE `it_program`;

SET @index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='fuelallocation_history'
    AND INDEX_NAME='idx_fuel_approval_date'
);
SET @sql := IF(
  @index_exists=0,
  'CREATE INDEX idx_fuel_approval_date ON fuelallocation_history (PresRequestDate, status, FARCode, Id)',
  'SELECT ''Index idx_fuel_approval_date already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='request_approvers'
    AND INDEX_NAME='idx_fuel_approver_request'
);
SET @sql := IF(
  @index_exists=0,
  'CREATE INDEX idx_fuel_approver_request ON request_approvers (module, approver_usercode, request_number)',
  'SELECT ''Index idx_fuel_approver_request already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='departmenttb'
    AND INDEX_NAME='idx_department_name'
);
SET @sql := IF(
  @index_exists=0,
  'CREATE INDEX idx_department_name ON departmenttb (NAME)',
  'SELECT ''Index idx_department_name already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Runnable verification: all three rows must report index_count=1.
SELECT 'idx_fuel_approval_date' AS index_name, COUNT(*) > 0 AS index_count
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fuelallocation_history' AND INDEX_NAME='idx_fuel_approval_date'
UNION ALL
SELECT 'idx_fuel_approver_request', COUNT(*) > 0
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='request_approvers' AND INDEX_NAME='idx_fuel_approver_request'
UNION ALL
SELECT 'idx_department_name', COUNT(*) > 0
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='departmenttb' AND INDEX_NAME='idx_department_name';
