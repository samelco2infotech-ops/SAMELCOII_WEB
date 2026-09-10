const assert = require('assert');
const service = require('./travelService');

assert.strictEqual(service.getStatusLabel(1), 'Pending');
assert.strictEqual(service.getStatusLabel(2), 'Approved');
assert.strictEqual(service.userCanManageApprovals({ privilage: '1-6' }), true);
assert.strictEqual(service.userCanManageApprovals({ privilage: '1-4' }), false);
assert.strictEqual(typeof service.updateTravel, 'function');
assert.strictEqual(typeof service.requestIsAssignedTo, 'function');
assert.strictEqual(typeof service.archiveAndRemovePerson, 'function');
assert.deepStrictEqual(service.TRAVEL_APPROVAL_STAGES, ['department_head', 'general_manager']);
assert.match(service.TRAVEL_MEMBER_SCOPE_SQL, /member\.to_number=t\.to_number/);
assert.deepStrictEqual(service.travelApprovalTransition('department_head', 2), {
  status: 1, final: false, next_stage: 'general_manager',
});
assert.deepStrictEqual(service.travelApprovalTransition('general_manager', 2), {
  status: 2, final: true, next_stage: null,
});
assert.deepStrictEqual(service.travelApprovalTransition('department_head', 3), {
  status: 3, final: true, next_stage: null,
});
assert.throws(() => service.travelApprovalTransition('department_head', 1), /Invalid Travel approval decision/);
assert.strictEqual(service.isDepartmentHead({ position: 'Department Manager' }), true);
assert.strictEqual(service.isDepartmentHead({ position: 'General Manager' }), false);
assert.strictEqual(service.isDepartmentHead({ position: 'Assistant Department Head' }), false);
assert.deepStrictEqual(service.travelPrintSignatories({
  department_head_name: 'Dept Head',
  department_head_position: 'Department Manager',
  general_manager_name: 'GM Name',
  general_manager_position: 'General Manager',
}), [
  { stage: 'department_head', label: 'Recommending Approval', name: 'Dept Head', position: 'Department Manager' },
  { stage: 'general_manager', label: 'Approved By', name: 'GM Name', position: 'General Manager' },
]);

// [FEATURE] A department head traveling can't recommend their own trip: assignRequestApprover
// with skipDepartmentHead=true must insert only the general_manager stage and start the request
// there directly, never touching department_head at all.
(async () => {
  const calls = [];
  const fakeConnection = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
    },
  };
  await service.assignRequestApprover(
    fakeConnection, 'S2Y2600001',
    { usercode: 'DEPTHEAD-1' }, { usercode: 'GM-1' }, 'REQUESTER-1', 'auto', true
  );
  const insertCalls = calls.filter((call) => call.sql.includes('INSERT INTO request_approvers'));
  assert.strictEqual(insertCalls.length, 1, 'skipDepartmentHead must insert exactly one stage row');
  assert.strictEqual(insertCalls[0].params[1], 'general_manager');
  assert.strictEqual(insertCalls[0].params[2], 'GM-1');
  const updateCall = calls.find((call) => call.sql.includes('UPDATE traveltb'));
  assert.deepStrictEqual(updateCall.params, ['GM-1', 'general_manager', 'S2Y2600001']);

  const normalCalls = [];
  const normalConnection = { execute: async (sql, params) => { normalCalls.push({ sql, params }); } };
  await service.assignRequestApprover(
    normalConnection, 'S2Y2600002',
    { usercode: 'DEPTHEAD-1' }, { usercode: 'GM-1' }, 'REQUESTER-1', 'auto', false
  );
  const normalInsertCalls = normalCalls.filter((call) => call.sql.includes('INSERT INTO request_approvers'));
  assert.strictEqual(normalInsertCalls.length, 2, 'normal flow must still insert both stages');
  assert.strictEqual(normalInsertCalls[0].params[1], 'department_head');

  console.log('Travel service self-check passed.');
})();
