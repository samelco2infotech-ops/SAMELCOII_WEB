/**
 * Offline self-check for privilege scoping (no DB, no LLM).
 * Run from backend/: node src/services/ai/privScope.selfcheck.js
 */
const assert = require('assert');
const P = require('./privScope');
const agent = require('./queryAgent');

// ── level resolution ─────────────────────────────────────────────────────────
assert.strictEqual(P.resolveScope({ privilage: '1' }).level, 'self', 'priv 1 → self');
assert.strictEqual(P.resolveScope({ privilage: '5' }).level, 'self', 'priv 5 → self');
assert.strictEqual(P.resolveScope({ privilage: '6' }).level, 'department', 'priv 6 → department');
assert.strictEqual(P.resolveScope({ privilage: '7' }).level, 'department', 'priv 7 → department');
assert.strictEqual(P.resolveScope({ privilage: '10' }).level, 'org', 'priv 10 → org');
assert.strictEqual(P.resolveScope({ privilage: '3,8' }).level, 'org', 'highest digit wins (3,8 → org)');
assert.strictEqual(P.resolveScope({}).level, 'self', 'no privilege → self (fail closed)');

// ── scopeClause bounds fixed SQL by level ────────────────────────────────────
const self = P.resolveScope({ privilage: '2', usercode: 'S2-100', department: 'TSD', bioUID: 42 });
const dept = P.resolveScope({ privilage: '6', usercode: 'S2-6', department: 'TSD' });
const org = P.resolveScope({ privilage: '9' });

let c = P.scopeClause(self, 'fuelallocation_history');
assert.ok(/`usercode` = \?/.test(c.sql) && c.params[0] === 'S2-100', 'self scopes fuel by usercode');

c = P.scopeClause(self, 'dtr_timeinout');
assert.ok(/`userID` = \?/.test(c.sql) && c.params[0] === 42, 'self scopes dtr by bioUID value');

c = P.scopeClause(self, 'tbleave');
assert.ok(/`empID` = \?/.test(c.sql) && c.params[0] === 'S2-100', 'self scopes leave by empID');

c = P.scopeClause(dept, 'fuelallocation_history');
assert.ok(/`Department` = \?/.test(c.sql) && c.params[0] === 'TSD', 'department scopes fuel by Department');

c = P.scopeClause(org, 'usertb');
assert.strictEqual(c.sql, '1=1', 'org is unrestricted');

c = P.scopeClause(self, 'sam_brain');
assert.strictEqual(c.sql, '1=1', 'shared table readable at any level');

// ── fail closed on missing identity ──────────────────────────────────────────
assert.throws(() => P.scopeClause(P.resolveScope({ privilage: '2' }), 'dtr_timeinout'), /missing bioUID/, 'self w/o bioUID → throw, not widen');
assert.throws(() => P.scopeClause(P.resolveScope({ privilage: '6' }), 'usertb'), /missing department/, 'dept w/o department → throw');
assert.throws(() => P.scopeClause(self, 'secret_table'), /no scope mapping/, 'unknown table → throw');

// ── free-form query gate ─────────────────────────────────────────────────────
assert.ok(!P.canRunFreeformQuery(self) && !P.canRunFreeformQuery(dept), 'staff/dept cannot run free-form SQL');
assert.ok(P.canRunFreeformQuery(org), 'managers can run free-form SQL');

(async () => {
  let ran = false;
  const deps = { llmCall: async () => 'SELECT * FROM usertb', runReadQuery: async () => { ran = true; return []; } };

  const blocked = await agent.answer('list everyone', { ...deps, scope: self });
  assert.ok(blocked.restricted && !ran, 'query agent blocks staff free-form BEFORE running');

  const allowed = await agent.answer('list everyone', { ...deps, scope: org });
  assert.ok(allowed.ok && ran, 'query agent runs for org level');

  console.log('OK — privilege scope self-check passed (levels + fixed-scope clause + free-form gate)');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
