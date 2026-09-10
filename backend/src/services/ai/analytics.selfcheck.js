/**
 * Self-check for fuelAnomalyReply — real DB, no PHP equivalent to compare
 * against (this is new, not a port). Run: node src/services/ai/analytics.selfcheck.js
 */
const assert = require('assert');
const db = require('../../config/database');
const analytics = require('./analytics');

(async () => {
  const admin = await db.queryOne('SELECT * FROM usertb WHERE usercode = ? LIMIT 1', ['S2-075']);
  const staff = { ...admin, usercode: 'S2-999', privilage: '2' };
  if (!admin) { console.log('S2-075 not found; aborting'); process.exit(1); }

  // Gate: only fires when both "fuel" and an anomaly keyword are present.
  const notFuel = await analytics.fuelAnomalyReply(admin, 'any unusual leave requests?');
  assert.strictEqual(notFuel, null, 'no "fuel" -> not handled');
  const notAnomaly = await analytics.fuelAnomalyReply(admin, 'top fuel department this year');
  assert.strictEqual(notAnomaly, null, 'no anomaly keyword -> not handled (that\'s fuelAnalyticsReply\'s job)');

  // Privilege gate: low-privilege users get Restricted, not real data.
  const restricted = await analytics.fuelAnomalyReply(staff, 'any unusual fuel requests this year');
  assert.ok(/\*\*Restricted:\*\*/.test(restricted), 'privilege 2 blocked from org-wide anomaly check');

  // Admin: runs a real query against real data — just needs to not throw and
  // return either "none found" or a flagged list, both valid depending on data.
  const result = await analytics.fuelAnomalyReply(admin, 'flag any unusual fuel requests this year');
  assert.ok(typeof result === 'string' && result.startsWith('**Fuel anomaly check:**'), 'admin gets a real anomaly-check reply');

  // Wired into the main dispatcher, not just callable standalone.
  const viaDispatcher = await analytics.analyticsReply(admin, 'flag any unusual fuel requests this year');
  assert.strictEqual(viaDispatcher, result, 'analyticsReply() dispatches to fuelAnomalyReply');

  console.log('OK — analytics self-check passed (fuel anomaly: gating + privilege + live query + dispatcher wiring)');
  await db.close?.();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
