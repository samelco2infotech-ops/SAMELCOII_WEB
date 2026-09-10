/**
 * Offline check for mapFeesPayload's TotalAmount arithmetic (no DB needed).
 * Run from backend/: node src/services/membershipService.feesTotal.selfcheck.js
 */
const assert = require('assert');
const { mapFeesPayload } = require('./membershipService');

// Same fee set/amounts as the Fees modal screenshot (member 01017651): total = 3318.10.
const normalized = mapFeesPayload({
  Membership: '5.00',
  'Bill Deposit': '500.00',
  'Sealing Led': '75.00',
  'Service Fee': '238.10',
  'Inspection Fees': '200.00',
  Meter: '1200.00',
  'Coop Share': '500.00',
  'Ground Rod': '600.00',
});
assert.strictEqual(normalized.TotalAmount, '3318.10', 'base fees sum to the displayed grand total');

// Other-fee rows (Other_ prefix) must be added into the total too.
const withOther = mapFeesPayload({ Membership: '5.00', Other_Permit: '150.50' });
assert.strictEqual(withOther.TotalAmount, '155.50', 'other-fee amounts are included in the total');

// Zero/blank fees contribute nothing and don't crash.
const empty = mapFeesPayload({});
assert.strictEqual(empty.TotalAmount, '0.00', 'no fees -> zero total');

console.log('OK — membershipService fees-total self-check passed');
