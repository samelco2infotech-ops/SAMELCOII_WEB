-- Records who actually encoded each complaint, for print's "Prepared By" line.
-- Separate from ReportedBy, which is the complainant, not the employee.
-- Already applied on prod (2026-08-07) via direct DB connection, not this file, because this
-- server runs MySQL 5.5.8 which does not support "ADD COLUMN IF NOT EXISTS" (that needs 8.0.29+).
-- Kept here as documentation / for use on a fresh environment. Check column existence first if
-- running this again anywhere.
USE `complaint`;

ALTER TABLE `complaints`
  ADD COLUMN `EncodedByUserCode` varchar(50) DEFAULT NULL AFTER `ReportedBy`,
  ADD COLUMN `EncodedByName` varchar(200) DEFAULT NULL AFTER `EncodedByUserCode`;

-- Backfill from complaint_activity's CREATED entry, for complaints that already had one logged
-- (only works where the activity table was already tracking at the time — most legacy rows have
-- no such entry and cannot be recovered).
UPDATE `complaints` c
JOIN (
  SELECT a1.CompID, a1.ActorUserCode, a1.ActorName
  FROM `complaint_activity` a1
  WHERE a1.ActionType = 'CREATED'
    AND a1.ActivityID = (SELECT MIN(a2.ActivityID) FROM `complaint_activity` a2 WHERE a2.CompID = a1.CompID AND a2.ActionType = 'CREATED')
) act ON act.CompID = c.CompID
SET c.EncodedByUserCode = act.ActorUserCode, c.EncodedByName = act.ActorName
WHERE c.EncodedByName IS NULL;

-- Verification: both columns must be returned.
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'complaint'
  AND TABLE_NAME = 'complaints'
  AND COLUMN_NAME IN ('EncodedByUserCode','EncodedByName')
ORDER BY COLUMN_NAME;
