// One-time backfill: assigns a unique 3-letter+3-digit ShortCode to every complaint that
// doesn't have one yet (rows created before database/complaints_short_code.sql was applied).
// Run: node scripts/backfillComplaintShortCodes.js
const crypto = require('crypto');
const database = require('../src/config/database');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generateShortCode = () => {
  let code = '';
  for (let i = 0; i < 3; i += 1) code += LETTERS[crypto.randomInt(LETTERS.length)];
  for (let i = 0; i < 3; i += 1) code += String(crypto.randomInt(10));
  return code;
};

(async () => {
  await database.createPool();
  const rows = await database.queryAll(
    "SELECT CompID FROM complaint.complaints WHERE ShortCode IS NULL OR TRIM(ShortCode)=''"
  );
  console.log(`Backfilling ${rows.length} complaint(s)...`);
  const used = new Set(
    (await database.queryAll("SELECT ShortCode FROM complaint.complaints WHERE ShortCode IS NOT NULL AND TRIM(ShortCode)<>''"))
      .map((row) => row.ShortCode)
  );
  let updated = 0;
  for (const row of rows) {
    let code;
    do { code = generateShortCode(); } while (used.has(code));
    used.add(code);
    await database.execute('UPDATE complaint.complaints SET ShortCode=? WHERE CompID=?', [code, row.CompID]);
    updated += 1;
  }
  console.log(`Done. ${updated} row(s) updated.`);
  process.exit(0);
})().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
