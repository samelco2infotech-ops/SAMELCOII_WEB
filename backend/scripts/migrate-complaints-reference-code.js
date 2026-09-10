/**
 * One-off migration: add complaint.complaints.ReferenceCode, backfill existing rows,
 * matching the exact "CMP-YYYYMMDD-####" format already computed client-side by referenceFor().
 * Run once: node scripts/migrate-complaints-reference-code.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT || 3306,
  });

  const [existing] = await connection.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA='complaint' AND TABLE_NAME='complaints' AND COLUMN_NAME='ReferenceCode'`
  );
  if (existing[0].n === 0) {
    console.log('Adding ReferenceCode column...');
    await connection.execute(
      `ALTER TABLE complaint.complaints ADD COLUMN ReferenceCode VARCHAR(30) DEFAULT NULL AFTER CompID`
    );
    await connection.execute(
      `ALTER TABLE complaint.complaints ADD UNIQUE KEY uk_complaints_reference_code (ReferenceCode)`
    );
    console.log('Column + unique index added.');
  } else {
    console.log('ReferenceCode column already exists, skipping ALTER.');
  }

  const [before] = await connection.execute(
    `SELECT COUNT(*) AS n FROM complaint.complaints WHERE ReferenceCode IS NULL`
  );
  console.log(`Rows needing backfill: ${before[0].n}`);

  const [result] = await connection.execute(
    `UPDATE complaint.complaints
     SET ReferenceCode = CONCAT('CMP-', IF(ReportedDateTime IS NULL, 'LEGACY', DATE_FORMAT(ReportedDateTime, '%Y%m%d')), '-', LPAD(CompID, 4, '0'))
     WHERE ReferenceCode IS NULL`
  );
  console.log(`Backfilled ${result.affectedRows} rows.`);

  const [after] = await connection.execute(
    `SELECT COUNT(*) AS n FROM complaint.complaints WHERE ReferenceCode IS NULL`
  );
  console.log(`Rows still missing ReferenceCode: ${after[0].n}`);

  const [sample] = await connection.execute(
    `SELECT CompID, ReferenceCode FROM complaint.complaints ORDER BY CompID DESC LIMIT 5`
  );
  console.log('Sample:', sample);

  await connection.end();
}

main().catch((error) => { console.error('Migration failed:', error); process.exit(1); });
