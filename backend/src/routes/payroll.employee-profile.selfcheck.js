/**
 * Purpose: Non-mutating checks for employee HR profile validation and masking.
 * EDIT GUIDE: Run with `node src/routes/payroll.employee-profile.selfcheck.js`.
 * HUWAG BAGUHIN: This check must never write employee data.
 */
const assert = require('assert');
const payrollRouter = require('./payroll');

const logic = payrollRouter.employeeProfileLogic;
assert.ok(logic, 'Employee profile helpers must be exported.');
assert.strictEqual(logic.normalizeDigits('12-345 6789'), '123456789');
assert.strictEqual(logic.maskIdentifier('1234567890'), '••••••7890');
assert.strictEqual(logic.maskIdentifier(''), '');

const valid = logic.validateEmployeeProfileInput({
  name: 'Sample Employee',
  position: 'Accountant',
  department: 'Finance',
  bioUID: 'BIO-100',
  email: 'employee@example.com',
  mobileNumber: '+63 917 123 4567',
  employmentDate: '2026-08-03',
  employmentType: 'REGULAR',
  employmentStatus: 'ACTIVE',
  tin: '123-456-789',
  sssNumber: '12-3456789-0',
  philhealthNumber: '12-345678901-2',
  pagibigNumber: '1234-5678-9012',
  nationalId: '1234-5678-9012',
  payrollId: 'PAY-100',
  bankAccountNumber: '12345-67890',
});
assert.strictEqual(valid.ok, true);
assert.strictEqual(valid.value.sssNumber, '1234567890');

const invalid = logic.validateEmployeeProfileInput({
  name: '', position: '', department: '', bioUID: '', email: 'wrong', sssNumber: '123',
});
assert.strictEqual(invalid.ok, false);
assert.ok(invalid.message.includes('name'));

console.log('Employee HR profile self-check passed.');
