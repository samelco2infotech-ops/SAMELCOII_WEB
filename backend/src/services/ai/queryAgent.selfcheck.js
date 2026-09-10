/**
 * Offline self-check for the read-only query agent + SQL guard (no DB, no LLM).
 * The guard is the security boundary, so it is tested hard here.
 * Run from backend/: node src/services/ai/queryAgent.selfcheck.js
 */
const assert = require('assert');
const guard = require('./sqlReadGuard');
const agent = require('./queryAgent');

// ── Guard: things that MUST pass ─────────────────────────────────────────────
const ALLOW = [
  'SELECT name FROM `it_program`.usertb WHERE department = "OGM"',
  'select count(*) from fuelallocation_history where status = 1',
  'WITH t AS (SELECT usercode FROM usertb) SELECT * FROM t',
  "SELECT name FROM usertb WHERE name = 'DROP TABLE x'", // write word only inside a string
  'SELECT * FROM usertb -- delete this later\n',          // write word only in a comment
];
for (const sql of ALLOW) {
  const r = guard.assertReadOnly(sql);
  assert.ok(r.ok, `should ALLOW: ${sql} — got ${r.reason}`);
}
// LIMIT auto-appended when missing, preserved when present.
assert.match(guard.assertReadOnly('SELECT 1').sql, /limit\s+\d+/i, 'LIMIT appended when missing');
assert.strictEqual((guard.assertReadOnly('SELECT 1 LIMIT 5').sql.match(/limit/gi) || []).length, 1, 'existing LIMIT kept, not doubled');

// ── Guard: things that MUST be rejected ──────────────────────────────────────
const DENY = [
  ['', 'empty'],
  ['UPDATE usertb SET name = "x"', 'update'],
  ['DELETE FROM usertb', 'delete'],
  ['DROP TABLE usertb', 'drop'],
  ['TRUNCATE usertb', 'truncate'],
  ['INSERT INTO usertb VALUES (1)', 'insert'],
  ['SELECT 1; DROP TABLE usertb', 'stacked statements'],
  ['SELECT 1; SELECT 2', 'stacked selects'],
  ['SELECT * INTO OUTFILE "/tmp/x" FROM usertb', 'outfile'],
  ['GRANT ALL ON *.* TO x', 'grant'],
  ['CALL some_proc()', 'call'],
  ['SET @x = 1', 'set'],
  ['SELECT 1 /* ; DROP TABLE t */; DELETE FROM t', 'comment-masked injection'],
];
for (const [sql, label] of DENY) {
  assert.ok(!guard.assertReadOnly(sql).ok, `should DENY (${label}): ${sql}`);
}

// ── Agent: extracts SQL from a chatty/fenced LLM reply ───────────────────────
assert.match(agent.extractSql('```sql\nSELECT 1\n```'), /^SELECT 1$/i, 'strips code fences');
assert.match(agent.extractSql('Sure! Here you go:\nSELECT name FROM usertb'), /^SELECT name/i, 'drops leading prose');

// ── Agent: a malicious LLM output is blocked BEFORE touching the DB ───────────
(async () => {
  let ran = null;
  const runReadQuery = async (sql) => { ran = sql; return [{ ok: 1 }]; };

  const bad = await agent.answer('drop everything', {
    llmCall: async () => 'DELETE FROM usertb',
    runReadQuery,
  });
  assert.ok(!bad.ok && ran === null, 'write SQL blocked by guard, never reached the DB');

  const good = await agent.answer('how many users', {
    llmCall: async () => 'SELECT COUNT(*) AS n FROM usertb',
    runReadQuery,
  });
  assert.ok(good.ok && good.count === 1 && /limit/i.test(ran), 'valid SELECT runs (with LIMIT) and returns rows');

  console.log('OK — query agent + SQL guard self-check passed (allow/deny + injection blocked pre-DB)');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
