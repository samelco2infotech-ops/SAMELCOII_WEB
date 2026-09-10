const assert = require('assert');
const service = require('./reconnectionService');

assert.strictEqual(typeof service.listRequests, 'function');
assert.strictEqual(typeof service.getRequest, 'function');
assert.strictEqual(typeof service.saveRequest, 'function');
assert.strictEqual(typeof service.deleteRequest, 'function');
assert.strictEqual(typeof service.nextReconnId, 'function');

// Status is derived from the fields, not trusted from the caller — this is what stops someone
// from spoofing "Completed" to dodge the no-delete rule, or "Pending" to hide a paid job. It's
// payment-based (both required OR numbers), not field-work-based — printing happens once the
// order is paid, before the lineman fills in reconnectedAt/reconnectedBy.
assert.strictEqual(service.deriveStatus({}), 'Pending');
assert.strictEqual(service.deriveStatus({ reconnectionOr: 'OR-1' }), 'Pending', 'needs both OR numbers');
assert.strictEqual(
  service.deriveStatus({ reconnectionOr: 'OR-1', sealingOr: 'OR-2' }),
  'Completed'
);

console.log('Reconnection service self-check (sync) passed.');

(async () => {
  const db = require('../config/database');
  // Live round-trip against a fake ID that can never collide with a real saved request, cleaned up
  // either way.
  const id = `selfcheck-${Date.now()}`;
  const pending = { reconnId: 'SELFCHECK-001', accountNumber: '000000', consumerName: 'Self Check', orderDate: '2026-08-13' };
  try {
    const saved = await service.saveRequest({ id, fields: pending, actor: { usercode: 'SELFCHECK' } });
    assert.strictEqual(saved.id, id);
    assert.strictEqual(saved.status, 'Pending', 'no OR numbers yet');
    assert.strictEqual(saved.fields.reconnId, 'SELFCHECK-001');

    const fetched = await service.getRequest(id);
    assert.strictEqual(fetched.fields.consumerName, 'Self Check', 'round-trips through fields_json');

    const list = await service.listRequests();
    assert.ok(list.some((item) => item.id === id), 'saved request appears in listRequests');

    // nextReconnId scans the real table (not the capped listRequests()) for the highest existing
    // "RC#####" sequence, so saving that ID and asking again must return exactly one higher — this
    // is the actual duplicate-ID protection the feature exists for. Doesn't assert an absolute
    // starting number since real data may already have RC IDs saved.
    const firstId = await service.nextReconnId();
    assert.ok(/^RC\d{5}$/.test(firstId), `nextReconnId returns RC##### format, got "${firstId}"`);
    const secondId = `selfcheck-${Date.now()}-2`;
    await service.saveRequest({ id: secondId, fields: { reconnId: firstId }, actor: { usercode: 'SELFCHECK' } });
    try {
      const nextAfterOne = await service.nextReconnId();
      const firstNum = Number(firstId.slice(2));
      const nextNum = Number(nextAfterOne.slice(2));
      assert.strictEqual(nextNum, firstNum + 1, 'increments past an existing saved sequence');
    } finally {
      await db.execute('DELETE FROM `membership`.`reconnection_requests` WHERE id = ?', [secondId]);
    }

    // Now mark it paid and confirm delete is refused — this is the rule the whole delete-guard
    // feature exists for.
    const completed = await service.saveRequest({
      id,
      fields: {
        ...pending,
        reconnectionFee: '40.00', reconnectionOr: 'OR-1001', reconnectionOrDate: '2026-08-13',
        sealingLead: '75.00', sealingOr: 'OR-1002', sealingOrDate: '2026-08-13',
      },
      actor: { usercode: 'SELFCHECK' },
    });
    assert.strictEqual(completed.status, 'Completed');
    await assert.rejects(
      () => service.deleteRequest(id),
      (err) => err.status === 409,
      'deleteRequest must refuse a Completed request'
    );

    // syncMempayments must have upserted the SAME two charges into the shared mempayments ledger,
    // by accountnumber — this is the actual point of the feature (the user wants Reconnection
    // fee/Sealing lead visible in the existing payment ledger, not just this module's own table).
    const mempaymentsRow = await db.queryOne(
      'SELECT ReconFee, ReconFeeOR, SealingLed, SealingLedOR FROM `membership`.`mempayments` WHERE accountnumber = ?',
      [pending.accountNumber]
    );
    assert.ok(mempaymentsRow, 'mempayments row was created for the account');
    assert.strictEqual(Number(mempaymentsRow.ReconFee), 40, 'ReconFee synced to mempayments');
    assert.strictEqual(mempaymentsRow.ReconFeeOR, 'OR-1001', 'ReconFeeOR synced to mempayments');
    assert.strictEqual(Number(mempaymentsRow.SealingLed), 75, 'SealingLed synced to mempayments');
    assert.strictEqual(mempaymentsRow.SealingLedOR, 'OR-1002', 'SealingLedOR synced to mempayments');

    console.log('Reconnection service self-check (live DB) passed.');
  } finally {
    await db.execute('DELETE FROM `membership`.`reconnection_requests` WHERE id = ?', [id]);
    await db.execute('DELETE FROM `membership`.`mempayments` WHERE accountnumber = ?', [pending.accountNumber]);
    await db.close?.();
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
