/*
 * PURPOSE: Runnable offline checks for Department Head Team OT Memo validation.
 * EDIT GUIDE: Add one assert whenever privilege, date, employee, or optional-time rules change.
 * HUWAG BAGUHIN: Privilege 6 is the only memo-creator token; the API performs the same check.
 * Tinitiyak nito na department head lang ang makakagawa ng memo at kumpleto ang kailangang datos.
 */
'use strict';

const assert = require('assert');
const { memoHelpers } = require('./overtime');

// SECTION: Privilege boundary.
assert.strictEqual(memoHelpers.canCreateTeamMemo({ privilage: '6' }), true);
assert.strictEqual(memoHelpers.canCreateTeamMemo({ privilage: '2-6' }), true);
assert.strictEqual(memoHelpers.canCreateTeamMemo({ privilage: '10' }), false);
assert.strictEqual(memoHelpers.canCreateTeamMemo({ privilage: '5' }), false);

// SECTION: Required date, purpose, employees, and optional paired times.
const valid = memoHelpers.normalizeTeamMemoInput({
  date: '2026-08-10',
  department: 'TECHNICAL SERVICES DEPARTMENT',
  purpose: 'Restore feeder service after scheduled maintenance.',
  employee_codes: ['S2-101', 's2-102', 'S2-101'],
  time_from: '',
  time_to: ''
});
assert.deepStrictEqual(valid.employeeCodes, ['S2-101', 'S2-102']);
assert.strictEqual(valid.hours, 0);
const base = { date: '2026-08-10', department: 'TECHNICAL SERVICES DEPARTMENT', purpose: 'Task', employee_codes: ['S2-101'] };
assert.ok(memoHelpers.normalizeTeamMemoInput({ ...base, date: '2026-02-30' }).error);
assert.ok(memoHelpers.normalizeTeamMemoInput({ ...base, department: '' }).error);
assert.ok(memoHelpers.normalizeTeamMemoInput({ ...base, purpose: '' }).error);
assert.ok(memoHelpers.normalizeTeamMemoInput({ ...base, employee_codes: [] }).error);
assert.ok(memoHelpers.normalizeTeamMemoInput({ ...base, employee_codes: ['bad code'] }).error);
assert.ok(memoHelpers.normalizeTeamMemoInput({ ...base, time_from: '17:00' }).error);

const overnight = memoHelpers.normalizeTeamMemoInput({
  date: '2026-08-10', department: 'TECHNICAL SERVICES DEPARTMENT', purpose: 'Emergency restoration', employee_codes: ['S2-101'], time_from: '22:00', time_to: '02:00'
});
assert.strictEqual(overnight.hours, 4);

console.log('OK — Team OT Memo privilege and input self-check passed.');
