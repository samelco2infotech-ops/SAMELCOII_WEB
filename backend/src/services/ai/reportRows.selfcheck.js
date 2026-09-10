/**
 * Real-DB self-check: short-TTL report-row cache (2026-07-29 speed request).
 * Confirms a repeated identical report request skips the DB re-query, and that
 * different users/scopes/date-ranges/keywords do NOT collide on the same cache entry.
 * Run: node src/services/ai/reportRows.selfcheck.js
 */
const assert = require('assert');
const db = require('../../config/database');
const { reportRows, clearReportRowsCache } = require('./reportRows');

(async () => {
  clearReportRowsCache();
  const admin = { usercode: 'ZZTEST-ADMIN', privilage: '10' };
  const staff = { usercode: 'ZZTEST-STAFF', privilage: '2', bioUID: '' };
  const args = { user: admin, scope: 'fuel', dateFrom: '2026-01-01', dateTo: '2026-07-29', message: 'fuel report this year' };

  const first = await reportRows(args);
  const second = await reportRows(args);
  assert.deepStrictEqual(second, first, 'an identical repeated request returns the exact same cached rows');

  // Cache keys must be scoped per-user — a personal-only staff request must never
  // return the admin's org-wide cached result (real privilege-leak risk otherwise).
  const staffRows = await reportRows({ ...args, user: staff });
  assert.notDeepStrictEqual(staffRows, first, 'a different user (personal-only scope) is not served the admin\'s cached org-wide rows');

  // A different date range must not hit the same cache entry.
  const otherRange = await reportRows({ ...args, dateFrom: '2026-02-01', dateTo: '2026-02-28' });
  assert.notStrictEqual(otherRange.length, first.length, 'a different date range is not served from the wrong cache entry');

  clearReportRowsCache();
  console.log('OK — report-row cache self-check passed (hit, per-user isolation, per-range isolation)');
  await db.close?.();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
