const assert = require('assert');
const service = require('./overtimeService');

assert.strictEqual(typeof service.getOvertimeRecords, 'function');
assert.strictEqual(typeof service.createOvertimeRequest, 'function');
assert.strictEqual(typeof service.updateOvertimeStatus, 'function');

console.log('Overtime service self-check passed.');
