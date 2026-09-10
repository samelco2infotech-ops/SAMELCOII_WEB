/**
 * Node-only report row sanitizer regression check.
 * Run: node src/services/ai/reportRows.parity.js
 */
const assert = require('assert');
const { cleanText } = require('./reportRows');

assert.equal(cleanText(null), '');
assert.equal(cleanText('  one   two\r\nthree  '), 'one two three');
assert.equal(cleanText(Buffer.from('SAM')), 'SAM');

console.log('reportRows Node regression: PASS');
