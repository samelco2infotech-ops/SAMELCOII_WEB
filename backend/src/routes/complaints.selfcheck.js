const assert = require('assert');
const route = require('./complaints');

const {
  normalizeComplaint,
  searchLimit,
  listLimit,
  mapFloat,
  markerColor,
  actorFor,
  isAdminIdentity,
  cleanLegacy,
  statusFromLegacy,
  referenceFor,
  serializeComplaint,
  serializeConsumer,
  serializeHouse,
  houseCode,
  invalidLength,
  retryOnDupEntry,
} = route._selfcheck;

assert.strictEqual(normalizeComplaint('  NO   POWER  '), 'NO POWER');
assert.strictEqual(normalizeComplaint(null), '');
assert.strictEqual(searchLimit('20'), 3);
assert.strictEqual(searchLimit('2'), 2);
assert.strictEqual(searchLimit('0'), 1);
assert.strictEqual(searchLimit('invalid'), 3);
assert.strictEqual(listLimit('9999'), 10);
assert.strictEqual(listLimit('0'), 1);
assert.strictEqual(cleanLegacy(' NULL '), '');
assert.strictEqual(cleanLegacy('PERSONAL'), 'PERSONAL');
assert.strictEqual(statusFromLegacy({ Status: 'ACCOMPLISHED' }), 'Done');
assert.strictEqual(statusFromLegacy({ Status: 'NOT ACCOMPLISH', ReceivedBy: 'Employee' }), 'In Progress');
assert.strictEqual(statusFromLegacy({ Status: 'NOT ACCOMPLISH', ExecRecDateTime: new Date() }), 'Released');
assert.strictEqual(statusFromLegacy({ Status: 'NOT ACCOMPLISH', ReceivedDateTime: new Date() }), 'Pending');
assert.strictEqual(statusFromLegacy({ Status: 'NOT ACCOMPLISH' }), 'New');
assert.strictEqual(referenceFor({ CompID: 42, ReportedDateTime: '2026-07-30T01:00:00Z' }), 'CMP-20260730-0042');
assert.strictEqual(mapFloat('11.75', -90, 90), 11.75);
assert.strictEqual(mapFloat('181', -180, 180), null);
assert.strictEqual(markerColor('#F97316'), '#f97316');
assert.strictEqual(markerColor('invalid'), '#10b981');
assert.deepStrictEqual(actorFor({ usercode: 'AC01', name: 'Amado Cuna' }), { userCode: 'AC01', name: 'Amado Cuna' });
assert.strictEqual(isAdminIdentity({ role: 'Administrator' }), true);
assert.strictEqual(isAdminIdentity({ position: 'Field Technician' }), false);
assert.ok(houseCode('100245-8').length <= 50);
assert.strictEqual(houseCode('100245-8'), houseCode('100245-8'));
assert.deepStrictEqual(invalidLength({ account: '123' }), undefined);
assert.deepStrictEqual(invalidLength({ account: '1'.repeat(21) }), ['account', 20]);
assert.strictEqual(serializeComplaint({ CompID: 5, AccountNumber: '100', ManualName: 'TEST' }).consumer, 'TEST');
assert.strictEqual(serializeConsumer({ connectionStatus: 'A' }, 'dbsamelco').status, 'Active');
assert.strictEqual(serializeHouse({ latitude: '11.7', longitude: '125.0' }).latitude, 11.7);

const methods = route.stack
  .filter((layer) => layer.route)
  .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
assert.deepStrictEqual(methods, ['GET /types', 'POST /types', 'GET /', 'POST /', 'PATCH /:id']);

// retryOnDupEntry: covers the ReferenceCode day-count race (a real "Duplicate entry" false
// positive seen in production — see complaints.js handleCreate) without touching a real DB.
const dupError = () => Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
(async () => {
  // Succeeds on the 3rd try (within the retry budget) — fallback must not run.
  let calls = 0;
  const result = await route._selfcheck.retryOnDupEntry(
    () => { calls += 1; if (calls < 3) throw dupError(); return 'numbered'; },
    () => { throw new Error('fallback should not run'); },
  );
  assert.strictEqual(result, 'numbered');
  assert.strictEqual(calls, 3);

  // Still colliding after the retry budget — falls back instead of failing the save.
  const fallbackResult = await route._selfcheck.retryOnDupEntry(
    () => { throw dupError(); },
    () => 'fallback-code',
  );
  assert.strictEqual(fallbackResult, 'fallback-code');

  // A non-duplicate error must propagate untouched, not get swallowed into a retry/fallback.
  await assert.rejects(
    () => route._selfcheck.retryOnDupEntry(() => { throw new Error('connection lost'); }, () => 'unused'),
    /connection lost/,
  );

  console.log('Complaints route self-check passed.');
})();
