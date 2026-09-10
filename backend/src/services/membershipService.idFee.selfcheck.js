/**
 * Offline check for resolveIdFeeAmount (no DB needed).
 * Run from backend/: node src/services/membershipService.idFee.selfcheck.js
 */
const assert = require('assert');
const { resolveIdFeeAmount } = require('./membershipService');

// Real case (account 04200852): ID fee was saved into an Other/Price slot, MemID column is 0.
const fromSlot = resolveIdFeeAmount({ MemID: 0, Other3: 'ID', Price3: '50.00', Other1: 'Other Fee', Price1: '20.00' });
assert.strictEqual(fromSlot, '50.00', 'falls back to the Other/Price slot labeled ID');

// Legacy row that already has a real MemID amount must not be overwritten.
const fromColumn = resolveIdFeeAmount({ MemID: 100, Other1: 'ID', Price1: '999.00' });
assert.strictEqual(fromColumn, 100, 'keeps MemID when it already holds a nonzero amount');

// No ID slot and no MemID amount -> stays 0/blank, no crash.
const none = resolveIdFeeAmount({ MemID: 0, Other1: 'Other Fee', Price1: '20.00' });
assert.strictEqual(none, 0, 'no ID slot found -> unchanged');

console.log('OK — membershipService ID-fee fallback self-check passed');
