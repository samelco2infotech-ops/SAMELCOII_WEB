# Database Migrations

## How to Run Migrations

### Option 1: Using MySQL Client (Recommended)

1. Open MySQL Client or phpMyAdmin
2. Select your database: `it_program`
3. Run the migration file: `migrations/001_link_fuel_epass_travel.sql`

**Command line example:**
```bash
mysql -u root -p it_program < migrations/001_link_fuel_epass_travel.sql
```

Or if using a different user/host:
```bash
mysql -h 192.168.1.99 -u root -p it_program < migrations/001_link_fuel_epass_travel.sql
```

### Option 2: Using phpMyAdmin

1. Log in to phpMyAdmin
2. Select the `it_program` database
3. Click the **SQL** tab
4. Open and copy the contents of `migrations/001_link_fuel_epass_travel.sql`
5. Paste into the SQL editor
6. Click **Go** to execute

---

## Pending Migrations

### ✓ 001_link_fuel_epass_travel.sql
**Status**: Ready to run  
**Purpose**: Add travelID column to fuel requests and establish relationships with Travel orders  
**Changes**:
- Add `travelID` column to `fuelallocation_history`
- Add check constraint: at least one of `epassID` or `travelID` must exist
- Add `fuel_farcode` column to `traveltb`
- Add indexes for performance

**Estimated time**: < 1 second  
**Risk level**: Low (only adds columns and constraints, no data loss)

---

## After Running Migrations

Verify the changes were applied correctly:

```sql
-- Check fuelallocation_history columns
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'fuelallocation_history' 
AND COLUMN_NAME IN ('travelID', 'epassID');

-- Check traveltb columns
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'traveltb' 
AND COLUMN_NAME IN ('fuel_farcode', 'Id');

-- Check that constraints were created
SELECT CONSTRAINT_NAME 
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_NAME = 'fuelallocation_history' 
AND CONSTRAINT_NAME = 'chk_epass_or_travel';

-- Check that indexes were created
SHOW INDEX FROM fuelallocation_history 
WHERE COLUMN_NAME IN ('epassID', 'travelID');

SHOW INDEX FROM traveltb 
WHERE COLUMN_NAME = 'fuel_farcode';
```

---

## Troubleshooting

### Error: "Constraint already exists"
This means the migration has already been applied. You can safely ignore this and continue.

### Error: "Duplicate key name"
The index already exists. You can safely ignore this and continue.

### Error: "Column 'travelID' already exists"
The column was already added. Verify your schema is correct and continue.

---

## Migration History

| Migration | Date | Status | Notes |
|-----------|------|--------|-------|
| 001_link_fuel_epass_travel.sql | 2026-05-24 | Pending | Link fuel, EPASS, and Travel requests |
