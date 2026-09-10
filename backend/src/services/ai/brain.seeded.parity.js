/**
 * Node-only seed/recall helper regression check.
 * Run: node src/services/ai/brain.seeded.parity.js
 */
const assert = require('assert');
const B = require('./brain');

assert.equal(B.brainNormalize(' Hi, SAM!  Fuel   Request? '), 'hi sam fuel request');
assert.equal(B.isLearnableAnswer('A complete and useful SAMELCO II answer.'), true);
assert.equal(B.isLearnableAnswer('Error'), false);
assert.ok(B.brainSynonyms().fuel.includes('gasoline'));
assert.ok(B.brainSynonyms().dtr.includes('attendance'));

console.log('brain seed helpers Node regression: PASS');
