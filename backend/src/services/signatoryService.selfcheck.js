const assert = require('assert');
const service = require('./signatoryService');

assert(service.MODULE_KEYS.has('dtr'));
assert(service.MODULE_KEYS.has('leave'));
assert(!service.MODULE_KEYS.has('unknown'));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
assert(service.dataUri(png).startsWith('data:image/png;base64,'));
assert.strictEqual(service.dataUri(null), '');

console.log('Signatory service self-check passed.');
