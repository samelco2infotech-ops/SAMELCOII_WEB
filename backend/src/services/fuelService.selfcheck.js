const assert = require('assert');
const service = require('./fuelService');

assert.deepStrictEqual(service.parseApproverCodes('["s2-001","S2-001","S2-002"]'), ['S2-001', 'S2-002']);
assert.strictEqual(service.canManageFuelApprovals({ privilage: '2-5' }), true);
assert.strictEqual(service.canViewOrganizationFuel({ privilage: '2-5' }), false);
assert.strictEqual(service.normalizeFuelRequest({
  usercode: 's2-001',
  requestedItem: 'DIESEL',
  amount: '10',
  vehicle: 'abc-123',
  purpose: 'Field work',
  prevTravel: 'Basey',
  presRequestDate: '2026-07-28',
  fuelstation: 'Station 1',
  approver_mode: 'manual',
  approver_usercode: 's2-002',
}).vehicle, 'ABC-123');
assert.throws(() => service.normalizeFuelRequest({ usercode: 'S2-001' }), /complete all required/);

console.log('Fuel service self-check passed.');
