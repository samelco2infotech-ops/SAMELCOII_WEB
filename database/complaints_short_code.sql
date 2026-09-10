-- Adds a short, easy-to-read/say complaint code (3 letters + 3 digits, e.g. ABC123) shown
-- centered at the top of the printed slip. Separate from ReferenceCode (CMP-YYYYMMDD-####),
-- which stays the code used for search/tracking. Applied on prod (2026-08-10) via direct
-- DB connection, not this file (MySQL 5.5.8 here does not support ADD COLUMN IF NOT EXISTS,
-- which needs 8.0.29+). Kept as documentation / for use on a fresh environment. Check column
-- existence first if running this again anywhere.
USE `complaint`;

ALTER TABLE `complaints`
  ADD COLUMN `ShortCode` char(6) DEFAULT NULL AFTER `ReferenceCode`;

ALTER TABLE `complaints`
  ADD UNIQUE INDEX `idx_complaints_shortcode` (`ShortCode`);

-- Backfill: every row created before this migration has no code yet. New rows get one at
-- creation time (backend/src/routes/complaints.js, handleCreate). Existing rows are backfilled
-- once via backend/scripts/backfillComplaintShortCodes.js (application-level, so it can enforce
-- uniqueness the same way handleCreate does — a single SQL UPDATE can't easily guarantee that
-- across many rows at once).

-- Verification: column + unique index must both exist.
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'complaint'
  AND TABLE_NAME = 'complaints'
  AND COLUMN_NAME = 'ShortCode';

SELECT INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'complaint'
  AND TABLE_NAME = 'complaints'
  AND INDEX_NAME = 'idx_complaints_shortcode';
