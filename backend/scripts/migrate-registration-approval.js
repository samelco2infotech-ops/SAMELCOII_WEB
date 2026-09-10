/**
 * One-off migration: add usertb.registration_pending so self-registered accounts can't log in
 * until an admin approves them (closes the account-takeover hole where anyone could look up an
 * unregistered employee's usercode via the public search-employee endpoint and register as them
 * first — see the 2026-09-10 security audit). DEFAULT 0 means every existing row (all already-
 * registered employees) is unaffected; only new self-registrations start out pending.
 * Run once: node scripts/migrate-registration-approval.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'it_program',
  });

  const [existing] = await connection.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='usertb' AND COLUMN_NAME='registration_pending'`
  );
  if (existing[0].n === 0) {
    console.log('Adding usertb.registration_pending...');
    await connection.execute(
      `ALTER TABLE usertb ADD COLUMN registration_pending TINYINT(1) NOT NULL DEFAULT 0`
    );
    console.log('Column added.');
  } else {
    console.log('registration_pending already exists, skipping.');
  }

  const [counts] = await connection.execute(
    `SELECT COUNT(*) AS total, SUM(registration_pending) AS pending FROM usertb`
  );
  console.log(`usertb: ${counts[0].total} rows, ${counts[0].pending || 0} pending approval.`);

  await connection.end();
}

main().catch((error) => { console.error('Migration failed:', error); process.exit(1); });
