// Self-check for the fuel approval race fix (applyFuelStatusTransition in fuel.js).
// Simulates two "concurrent" approve calls racing on the same FARCode against a fake DB row —
// proves the second one can't double-deduct. No real DB needed: a fake connection tracks a
// single mutable row and only lets an UPDATE...WHERE match if the row's current state agrees,
// the same way a real UPDATE's row lock would serialize two real transactions.
// Run: node src/routes/fuel.race.selfcheck.js
const assert = require('assert');
const { applyFuelStatusTransition } = require('./fuel')._selfcheck;

function makeFakeDb({ status, deptFuel, historyBalance }) {
  const row = { status, deptFuel, historyBalance };
  const calls = [];
  const connection = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('UPDATE fuelallocation_history SET status=?,approvedby=? WHERE FARCode=? AND status IN (2,3)')) {
        if ([2, 3].includes(row.status)) { row.status = params[0]; return [{ affectedRows: 1 }]; }
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('UPDATE fuelallocation_history SET status=?,approvedby=? WHERE FARCode=? AND status=1')) {
        if (row.status === 1) { row.status = params[0]; return [{ affectedRows: 1 }]; }
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('UPDATE fuelallocation_history SET status=?,approvedby=? WHERE FARCode=? AND status<>4')) {
        row.status = params[0]; return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE fuelallocation_limit SET fuel=fuel-?')) { row.deptFuel -= params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE fuelallocation_limit SET fuel=fuel+?')) { row.deptFuel += params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE fuelallocation_history SET balance=balance-?')) { row.historyBalance -= params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE fuelallocation_history SET balance=balance+?')) { row.historyBalance += params[0]; return [{ affectedRows: 1 }]; }
      throw new Error(`Unhandled SQL in fake connection: ${sql}`);
    },
  };
  return { row, connection };
}

(async () => {
  // Two concurrent approve clicks (both read currentStatus=2 before either committed) — only the
  // first should actually deduct; the second must be a no-op on the balance.
  const { row, connection } = makeFakeDb({ status: 2, deptFuel: 1000, historyBalance: 500 });
  const args = { status: 1, currentStatus: 2, farCode: 'FAR-1', amount: 200, departmentAbbr: 'TSD', actorUsercode: 'A1', usercode: 'EMP1' };

  const first = await applyFuelStatusTransition(connection, args);
  assert.strictEqual(first, true, 'first approve should win the compare-and-swap');
  assert.strictEqual(row.deptFuel, 800, 'first approve should deduct department fuel once');
  assert.strictEqual(row.historyBalance, 300, 'first approve should deduct history balance once');

  const second = await applyFuelStatusTransition(connection, args);
  assert.strictEqual(second, false, 'second (racing) approve must lose the compare-and-swap');
  assert.strictEqual(row.deptFuel, 800, 'second approve must NOT deduct department fuel again (the bug this fixes)');
  assert.strictEqual(row.historyBalance, 300, 'second approve must NOT deduct history balance again (the bug this fixes)');
  assert.strictEqual(row.status, 1, 'status still ends up Approved even though the second call was a no-op');

  // Reject path: symmetric refund, same compare-and-swap protection.
  const rejectDb = makeFakeDb({ status: 1, deptFuel: 800, historyBalance: 300 });
  const rejectArgs = { status: 3, currentStatus: 1, farCode: 'FAR-2', amount: 150, departmentAbbr: 'TSD', actorUsercode: 'A1', usercode: 'EMP1' };
  const rejectFirst = await applyFuelStatusTransition(rejectDb.connection, rejectArgs);
  assert.strictEqual(rejectFirst, true);
  assert.strictEqual(rejectDb.row.deptFuel, 950, 'reject should refund department fuel once');
  const rejectSecond = await applyFuelStatusTransition(rejectDb.connection, rejectArgs);
  assert.strictEqual(rejectSecond, false);
  assert.strictEqual(rejectDb.row.deptFuel, 950, 'a racing second reject must NOT refund again');

  // Already-settled request (e.g. re-clicking Approve on something already Released/Rejected):
  // no matching transition, no balance touch, but status still gets written (original behavior).
  const settledDb = makeFakeDb({ status: 4, deptFuel: 500, historyBalance: 200 });
  const settledResult = await applyFuelStatusTransition(settledDb.connection, { status: 1, currentStatus: 4, farCode: 'FAR-3', amount: 999, departmentAbbr: 'TSD', actorUsercode: 'A1', usercode: 'EMP1' });
  assert.strictEqual(settledResult, false);
  assert.strictEqual(settledDb.row.deptFuel, 500, 'no transition matched -> no balance change');

  console.log('fuel.js approval race self-check: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
