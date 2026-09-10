const assert = require('assert');
const service = require('./epassService');

assert.deepStrictEqual(service.splitGroupList('A || B|| C'), ['A', 'B', 'C']);
assert.strictEqual(service.getFirstGroupValue(['', ' S2-001 ']), 'S2-001');
assert.deepStrictEqual(service.privilegeNumbers('2-6-10'), [2, 6, 10]);
assert.strictEqual(service.userCanManageApprovals({ privilage: '2-6' }), true);
assert.strictEqual(service.userCanManageApprovals({ privilage: '2-4' }), false);
assert.strictEqual(typeof service.archiveAndRemovePerson, 'function');

console.log('EPASS service self-check passed.');
