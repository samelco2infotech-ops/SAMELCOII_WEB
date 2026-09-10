-- Migration: Link Fuel, EPASS, and Travel Requests
-- Date: 2026-05-24
-- Purpose: Add foreign key columns and constraints to enforce fuel-epass-travel relationship
--
-- Changes:
-- 1. Add travelID column to fuelallocation_history
-- 2. Add constraint ensuring at least one of epassID or travelID exists
-- 3. Add indexes for faster lookups
-- 4. Add fuel_farcode column to traveltb
-- 5. Add index on fuel_farcode

-- ============================================================================
-- STEP 1: Add travelID column to fuelallocation_history (stores Travel Order number)
-- ============================================================================
ALTER TABLE fuelallocation_history
ADD COLUMN travelID VARCHAR(50) NULL
COMMENT 'Travel Order number linked to this fuel request';

-- ============================================================================
-- STEP 2: Add constraint: at least one of epassID or travelID must exist
-- ============================================================================
ALTER TABLE fuelallocation_history
ADD CONSTRAINT chk_epass_or_travel
CHECK (epassID IS NOT NULL OR travelID IS NOT NULL);

-- ============================================================================
-- STEP 3: Add indexes for faster lookups
-- ============================================================================
ALTER TABLE fuelallocation_history
ADD INDEX idx_epassID (epassID);

ALTER TABLE fuelallocation_history
ADD INDEX idx_travelID (travelID);

-- ============================================================================
-- STEP 4: Add fuel_farcode column to traveltb (links to fuel request FAR code)
-- ============================================================================
ALTER TABLE traveltb
ADD COLUMN fuel_farcode VARCHAR(50) NULL
COMMENT 'Fuel Allocation Request code linked to this travel order';

-- ============================================================================
-- STEP 5: Add index on fuel_farcode for faster lookups
-- ============================================================================
ALTER TABLE traveltb
ADD INDEX idx_fuel_farcode (fuel_farcode);

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to verify)
-- ============================================================================
-- Check that columns were added:
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME = 'fuelallocation_history' AND COLUMN_NAME IN ('travelID', 'epassID');
--
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME = 'traveltb' AND COLUMN_NAME = 'fuel_farcode';
--
-- Check that indexes were created:
-- SHOW INDEX FROM fuelallocation_history WHERE COLUMN_NAME IN ('epassID', 'travelID');
-- SHOW INDEX FROM traveltb WHERE COLUMN_NAME = 'fuel_farcode';
--
-- Check that constraint exists:
-- SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
-- WHERE TABLE_NAME = 'fuelallocation_history' AND CONSTRAINT_NAME = 'chk_epass_or_travel';
