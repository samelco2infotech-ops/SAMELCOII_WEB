/** Phase 3 forward-only migration. Run --check for a non-mutating parse check. */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');
const statements = () => fs.readFileSync(path.join(__dirname, 'payroll_phase3.sql'), 'utf8')
  .split(/^-- ROLLBACK\s*$/m)[0].split(';').map((item) => item.trim()).filter(Boolean);
const run = async () => {
  const sql = statements();
  if (sql.length !== 4) throw new Error(`Expected 4 statements, found ${sql.length}.`);
  if (process.argv.includes('--check')) return console.log('payroll phase 3 migration check: passed');
  try { for (const statement of sql) await db.execute(statement); console.log('payroll phase 3 migration: applied'); }
  finally { await db.closePool(); }
};
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
