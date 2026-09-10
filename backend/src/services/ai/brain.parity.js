/**
 * Node-only brain/knowledge parser regression check.
 * Run: node src/services/ai/brain.parity.js
 */
const assert = require('assert');
const B = require('./brain');

const [text, tags] = B.extractLearnTags(
  'Use the Fuel module. [LEARN: Fuel request | File it in Fuel | process]'
);
assert.equal(text, 'Use the Fuel module.');
assert.deepEqual(tags, [{ title: 'Fuel request', content: 'File it in Fuel', category: 'process' }]);
assert.equal(B.brainNormalize('DTR—May 9!'), 'dtr may 9');

console.log('brain Node regression: PASS');
