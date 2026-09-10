const assert = require('assert');
const service = require('./warehouseService');

assert.strictEqual(service.meterStatusLabel(0), 'Rejected');
assert.strictEqual(service.meterStatusLabel(3), 'Warehouse');
assert.strictEqual(service.meterStatusLabel(99), 'Unknown');
assert.strictEqual(service.isMissingOptionalTable({ code: 'ER_NO_SUCH_TABLE' }), true);
assert.strictEqual(service.isMissingOptionalTable({ code: 'ER_PARSE_ERROR' }), false);
assert.strictEqual(typeof service.saveMeterPayment, 'function');

console.log('Warehouse service self-check passed.');
