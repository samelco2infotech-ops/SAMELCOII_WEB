/**
 * Offline self-check for the eligibility reasoning agent (no DB, no LLM).
 * Run from backend/: node src/services/ai/eligibility.selfcheck.js
 */
const assert = require('assert');
const E = require('./eligibility');

const user = { usercode: 'S2-100', name: 'Tess' };
const deps = { meService: { getLeaveBalance: async () => ({ vacation_leave: 4, sick_leave: 10, other_leave: 0 }) } };
const ask = (msg) => E.eligibilityReply(user, msg, deps);

(async () => {
  // Routing: questions match, commands do NOT (so they fall through to the action agent).
  assert.ok(E.wantsLeaveEligibility('can I file 5 days of vacation leave?'), 'question matches');
  assert.ok(!E.wantsLeaveEligibility('file a vacation leave from 2026-08-01 to 2026-08-03'), 'command does NOT match');
  assert.ok(!E.wantsLeaveEligibility('how do I request fuel'), 'unrelated does not match');

  // Enough balance → yes, with remaining.
  const yes = await ask('can I file 3 days of vacation leave?');
  assert.ok(/Yes/.test(yes) && /1 left/.test(yes), 'VL 4, ask 3 → yes, 1 left');

  // Not enough → no, with shortfall.
  const no = await ask('can I take 6 days vacation leave?');
  assert.ok(/Not quite/.test(no) && /short by 2/.test(no), 'VL 4, ask 6 → short by 2');

  // Sick leave counted separately.
  const sick = await ask('do I have enough sick leave for 8 days?');
  assert.ok(/Yes/.test(sick) && /Sick Leave/.test(sick), 'SL 10, ask 8 → yes');

  // General (no number) → reports all balances.
  const gen = await ask('how many vacation leave do I have left?');
  assert.ok(/Vacation: \*\*4\*\*/.test(gen) && /Sick: \*\*10\*\*/.test(gen), 'reports balances when no number given');

  // Non-eligibility message → null (lets other handlers run).
  assert.strictEqual(await ask('generate a fuel report'), null, 'non-eligibility → null');

  console.log('OK — eligibility agent self-check passed (routing + enough/short + per-type + general)');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
