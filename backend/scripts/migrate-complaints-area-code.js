/**
 * One-off migration: add complaint.complaints.AreaCode (free-text, e.g. "001") so the queue can
 * filter/collapse by area. Run once: node scripts/migrate-complaints-area-code.js
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
     WHERE TABLE_SCHEMA='complaint' AND TABLE_NAME='complaints' AND COLUMN_NAME='AreaCode'`
  );
  if (existing[0].n === 0) {
    console.log('Adding AreaCode column...');
    await connection.execute(`ALTER TABLE complaint.complaints ADD COLUMN AreaCode VARCHAR(10) DEFAULT NULL AFTER Location`);
    await connection.execute(`ALTER TABLE complaint.complaints ADD KEY idx_complaints_area_code (AreaCode)`);
    console.log('Column + index added.');
  } else {
    console.log('AreaCode column already exists, skipping.');
  }

  await connection.end();
}

main().catch((error) => { console.error('Migration failed:', error); process.exit(1); });
