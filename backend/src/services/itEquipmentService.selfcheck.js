const assert = require('assert');
const service = require('./itEquipmentService');

const normalized = service.normalizeAccountabilityInput({
  recipientUsercode: ' s2-001 ',
  recipientName: ' Test Employee ',
  dateissued: '2026-07-28T09:00:00',
  lines: [{ description: 'Laptop', qty: 0 }],
});

assert.strictEqual(normalized.recipientUsercode, 'S2-001');
assert.strictEqual(normalized.dateissued, '2026-07-28');
assert.deepStrictEqual(normalized.lines[0], {
  itemno: 'Laptop',
  description: 'Laptop',
  serial: '',
  qty: 1,
});
assert.strictEqual(service.hydrateAccountabilityHeader({ formno: ' AC-00000002 ' }).formNo, 'AC-00000002');

console.log('IT Equipment service self-check passed.');
