/**
 * Purpose: Apply only the forward section of the Phase 2 Payroll SQL.
 * EDIT GUIDE: Use --check to validate without connecting or changing the database.
 * HUWAG BAGUHIN: The runner never executes statements below the ROLLBACK marker.
 * Tagalog: Forward migration lang ang awtomatiko; manual at may backup ang rollback.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

const migrationPath = path.join(__dirname, 'payroll_phase2.sql');

const forwardStatements = () => {
  const source = fs.readFileSync(migrationPath, 'utf8');
  const forward = source.split(/^-- ROLLBACK\s*$/m)[0];
  const statements = forward
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement && !statement.split(/\r?\n/).every((line) => line.trim().startsWith('--')));
  if (statements.length !== 8) {
    throw new Error(`Expected 8 forward statements but found ${statements.length}.`);
  }
  return statements;
};

const run = async () => {
  const statements = forwardStatements();
  if (process.argv.includes('--check')) {
    console.log(`payroll migration check: passed (${statements.length} statements)`);
    return;
  }

  try {
    for (const statement of statements) {
      await db.execute(statement);
    }
    console.log(`payroll migration applied: ${statements.length} statements`);
  } finally {
    await db.closePool();
  }
};

run().catch((error) => {
  console.error(`payroll migration failed: ${error.message}`);
  process.exitCode = 1;
});
