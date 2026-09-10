/**
 * One-off data fix: split employees currently merged onto a single EPASS number back into
 * individual EPASS records, one per person. This undoes the effect of the createEpass bug
 * (fixed in src/services/epassService.js) that kept reusing and overwriting one EPASS number
 * for every save against the same fuel request, regardless of its approval status — so an
 * already-Approved record kept absorbing every later, unrelated request instead of getting
 * its own number.
 *
 * HUWAG BAGUHIN: this cannot recover the *original* grouping — every prior save already
 * deleted and rewrote the rows, so that history is gone. This only creates a fresh 1-person-
 * per-EPASS split of whoever is currently on the record, preserving their department,
 * destination, date, purpose, status, and approver exactly as they are now.
 *
 * Accepts either an EPASS number (starts with "S2Y") or a fuel FAR code — a FAR code is
 * resolved to its linked EPASS number the same way the app itself does (most recent
 * epasstb row for that fuel_farcode).
 *
 * Dry run (default, no writes): node scripts/split-merged-epass.js <EPASSNUMBER|FARCODE>
 * Apply for real:                node scripts/split-merged-epass.js <EPASSNUMBER|FARCODE> --apply
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function generateNextNumber(connection, prefix) {
  const [[result]] = await connection.execute(
    `SELECT MAX(CAST(SUBSTRING(epassnumber, 6) AS UNSIGNED)) AS latest
       FROM epasstb WHERE epassnumber LIKE ?`,
    [`${prefix}%`]
  );
  const next = parseInt(result?.latest || 0, 10) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

async function resolveEpassNumber(connection, input) {
  if (/^S2Y\d/i.test(input)) return input;
  const [rows] = await connection.execute(
    'SELECT epassnumber FROM epasstb WHERE fuel_farcode = ? ORDER BY Id DESC LIMIT 1',
    [input]
  );
  if (!rows[0]?.epassnumber) {
    throw new Error(`No EPASS is linked to fuel FAR code "${input}".`);
  }
  console.log(`FAR code ${input} -> resolved to EPASS ${rows[0].epassnumber}`);
  return rows[0].epassnumber;
}

async function main() {
  const inputArg = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!inputArg) {
    console.error('Usage: node scripts/split-merged-epass.js <EPASSNUMBER|FARCODE> [--apply]');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
  });

  try {
    const epassNumber = await resolveEpassNumber(connection, inputArg);
    const [rows] = await connection.execute(
      `SELECT Id, epassnumber, usercode, grantedto1, department, destination, \`date\`, purpose,
              status, fuel_farcode, epass_approved
         FROM epasstb
        WHERE epassnumber = ?
        ORDER BY Id`,
      [epassNumber]
    );

    if (rows.length === 0) {
      console.log(`No epasstb rows found for ${epassNumber}. Nothing to do.`);
      return;
    }

    // Dedupe by usercode, keep the earliest (lowest Id) row per person.
    const seen = new Set();
    const people = [];
    for (const row of rows) {
      const code = String(row.usercode || '').trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      people.push(row);
    }

    console.log(`${epassNumber}: ${rows.length} raw row(s) -> ${people.length} unique employee(s).`);

    const [approverRows] = await connection.execute(
      `SELECT stage, approver_usercode, assigned_by, assignment_mode
         FROM request_approvers
        WHERE module='epass' AND request_number=?
        LIMIT 1`,
      [epassNumber]
    );
    const approverRow = approverRows[0] || null;
    const year = new Date().getFullYear();
    const prefix = `S2Y${String(year).slice(2)}`;

    if (!apply) {
      // Simulate the increment in-memory instead of calling generateNextNumber repeatedly —
      // dry-run never inserts, so a real DB re-query would return the same "next" number every
      // time and make the preview misleadingly show one repeated number for everyone.
      const [[result]] = await connection.execute(
        `SELECT MAX(CAST(SUBSTRING(epassnumber, 6) AS UNSIGNED)) AS latest
           FROM epasstb WHERE epassnumber LIKE ?`,
        [`${prefix}%`]
      );
      let seq = parseInt(result?.latest || 0, 10);
      for (const person of people) {
        seq += 1;
        const preview = `${prefix}${String(seq).padStart(5, '0')}`;
        console.log(`  DRY RUN: would create ${preview} for ${person.usercode} (${person.grantedto1 || ''})`);
      }
      console.log('Dry run only — nothing written. Re-run with --apply to commit.');
      return;
    }

    await connection.beginTransaction();
    try {
      for (const person of people) {
        const newNumber = await generateNextNumber(connection, prefix);
        await connection.execute(
          `INSERT INTO epasstb
             (grantedto1, usercode, department, destination, \`date\`, purpose, status, epassnumber, fuel_farcode, epass_approved)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [person.grantedto1, person.usercode, person.department, person.destination, person.date,
            person.purpose, person.status, newNumber, person.fuel_farcode, person.epass_approved]
        );
        if (approverRow) {
          await connection.execute(
            `INSERT INTO request_approvers
               (module, request_number, stage, approver_usercode, assigned_by, assignment_mode, assigned_at)
             VALUES ('epass', ?, ?, ?, ?, ?, NOW())`,
            [newNumber, approverRow.stage, approverRow.approver_usercode, approverRow.assigned_by, approverRow.assignment_mode]
          );
        }
        console.log(`  Created ${newNumber} for ${person.usercode} (${person.grantedto1 || ''})`);
      }

      await connection.execute('DELETE FROM epasstb WHERE epassnumber = ?', [epassNumber]);
      await connection.execute(
        `DELETE FROM request_approvers WHERE module='epass' AND request_number=?`,
        [epassNumber]
      );
      await connection.commit();
      console.log(`Committed. Retired original ${epassNumber} (${rows.length} row(s) removed), ${people.length} new EPASS number(s) created.`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Split failed:', error);
  process.exit(1);
});
