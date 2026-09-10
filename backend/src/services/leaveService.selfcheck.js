const assert = require('assert');
const service = require('./leaveService');

assert.strictEqual(service.validDate('2026-02-28'), true);
assert.strictEqual(service.validDate('2026-02-29'), false);
assert.strictEqual(service.calendarDays('2026-02-28', '2026-03-01'), 2);
assert.strictEqual(service.requestParts('Birthday Leave - Whole Day', 1).category, 'Birthday Leave');
assert.strictEqual(service.requestParts('Vacation Leave - Half Day', 1).duration, 'Half Day');
assert.strictEqual(service.statusLabel({ DP_approved: '1', HR_approved: '1', Status: 'APPROVED' }), 'Approved');
assert.strictEqual(service.statusLabel({ DP_approved: '3', HR_approved: '0', Status: 'PENDING' }), 'Rejected');
assert.strictEqual(service.canApprove({ privilage: '2-6' }), true);
assert.strictEqual(service.isAdmin({ privilage: '6-10' }), true);
assert.throws(() => service.normalizeRequest({
  leave_category: 'Birthday Leave', leave_duration: 'Whole Day',
  date_from: '2026-07-10', date_to: '2026-07-11', reason: 'Birthday',
}), /single date/);

console.log('Leave service self-check passed.');
