/**
 * Node-only public-notice parser regression check.
 * Run: node src/services/ai/notices.parity.js
 */
const assert = require('assert');
const N = require('./notices');

const intent = N.noticePostIntent('Post announcement: Office closes at 4 PM');
assert.ok(intent && typeof intent === 'object');
assert.ok(String(intent.content || '').includes('Office closes at 4 PM'));
assert.equal(N.auditActionType('generate fuel report', 'Done', { file_name: 'fuel.xlsx' }), 'report_file');
assert.equal(N.extractEmployeeQuery('show employee S2-067'), 'S2-067');

console.log('notices Node regression: PASS');
