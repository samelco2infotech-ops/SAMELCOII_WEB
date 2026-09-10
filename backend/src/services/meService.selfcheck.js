/**
 * Live check for employee self-service aggregate (needs DB 192.168.1.99).
 * Run from backend/: node src/services/meService.selfcheck.js
 * Picks a real usercode from usertb, builds the summary, asserts the shape + invariants.
 */
const assert = require('assert');
const db = require('../config/database');
const meService = require('./meService');

(async () => {
  await db.createPool();

  // Pick a user who actually has attendance rows, so the DTR slice is exercised.
  const anyUser = await db.queryOne(
    `SELECT u.usercode
     FROM usertb u JOIN dtr_timeinout t ON t.userID = u.bioUID
     WHERE u.usercode IS NOT NULL AND u.usercode <> ''
     LIMIT 1`
  );
  assert.ok(anyUser && anyUser.usercode, 'found a usercode with attendance to test with');

  const s = await meService.buildMySummary(anyUser.usercode);
  assert.ok(s, 'summary built');
  assert.strictEqual(s.employee.usercode, anyUser.usercode, 'summary scoped to the requested user');

  // DTR block: counts are non-negative; late/early-out days never exceed days with records.
  assert.ok(s.dtr.days_with_records >= 0, 'days_with_records >= 0');
  assert.ok(s.dtr.late_days >= 0 && s.dtr.late_days <= s.dtr.days_with_records, 'late_days within record count');
  assert.ok(s.dtr.early_out_days >= 0 && s.dtr.early_out_days <= s.dtr.days_with_records, 'early_out_days within record count');
  assert.ok(s.dtr.total_late_min >= 0 && s.dtr.total_early_out_min >= 0, 'minute totals non-negative');

  // Leave + fuel blocks present with numeric fields.
  for (const k of ['vacation_leave', 'sick_leave', 'other_leave']) {
    assert.ok(typeof s.leave[k] === 'number', `leave.${k} is numeric`);
  }
  assert.ok(typeof s.fuel.requested_this_month === 'number', 'fuel.requested_this_month numeric');
  assert.ok(Array.isArray(s.fuel.recent_requests), 'fuel.recent_requests is an array');

  // A missing employee returns null, not a throw.
  assert.strictEqual(await meService.buildMySummary('__nope__'), null, 'unknown user → null');

  console.log(`OK — meService self-check passed (user ${anyUser.usercode}: ` +
    `${s.dtr.days_with_records} DTR days, ${s.dtr.late_days} late, ${s.dtr.early_out_days} early-out, VL=${s.leave.vacation_leave})`);
  await db.closePool?.();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
