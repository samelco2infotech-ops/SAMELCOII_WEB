/**
 * Node-only user-history formatting regression check.
 * Run: node src/services/ai/userHistory.parity.js
 */
const assert = require('assert');
const H = require('./userHistory');

assert.equal(H.cleanText(null), '-');
assert.equal(H.cleanText('  SAM   history  '), 'SAM history');
assert.equal(H.statusLabel('1'), 'pending');
assert.equal(H.statusLabel('2'), 'approved');
assert.ok(H.profileSummary({ usercode: 'S2-001', name: 'Test User' }).some((line) => line.includes('Test User')));

console.log('userHistory Node regression: PASS');
