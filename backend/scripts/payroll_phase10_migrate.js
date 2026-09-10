/** Phase 10 forward-only migration. */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

const run = async () => {
  const statements = fs.readFileSync(path.join(__dirname, 'payroll_phase10.sql'), 'utf8')
    .split(/^-- ROLLBACK\s*$/m)[0]
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);
  if (statements.length !== 4) throw new Error(`Expected 4 statements, found ${statements.length}.`);
  if (process.argv.includes('--check')) {
    console.log('payroll phase 10 migration check: passed');
    return;
  }
  try {
    for (const statement of statements) await db.execute(statement);
    console.log('payroll phase 10 migration: applied');
  } finally {
    await db.closePool();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
