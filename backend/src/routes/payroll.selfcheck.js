/**
 * Purpose: Non-mutating checks for Payroll access and exact OT computation.
 * EDIT GUIDE: Run with `node src/routes/payroll.selfcheck.js`.
 * HUWAG BAGUHIN: This check must not create tables or write compensation.
 * Tagalog: Access at formula lang ang tine-test; walang binabago sa payroll data.
 */
const assert = require('assert');
const app = require('../app');
const { generateToken } = require('../middleware/auth');
const db = require('../config/database');
const payrollRouter = require('./payroll');

const run = async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api/payroll`;

    const anonymous = await fetch(`${base}/health`);
    assert.strictEqual(anonymous.status, 401);

    const ordinaryToken = generateToken({ usercode: 'SELF-CHECK', privilage: '1' });
    const forbidden = await fetch(`${base}/health`, {
      headers: { Authorization: `Bearer ${ordinaryToken}` },
    });
    assert.strictEqual(forbidden.status, 403);

    const adminToken = generateToken({ usercode: 'SELF-CHECK', privilage: '10' });
    const health = await fetch(`${base}/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(health.status, 200);

    const runs = await fetch(`${base}/runs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(runs.status, 200);

    const schedules = await fetch(`${base}/schedules`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(schedules.status, 200);

    const phase5 = await fetch(`${base}/phase5/master-data`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase5.status, 200);
    const phase5Payload = await phase5.json();
    assert.strictEqual(phase5Payload.schemaReady, true);

    const phase6 = await fetch(`${base}/phase6/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase6.status, 200);
    const phase6Payload = await phase6.json();
    assert.strictEqual(phase6Payload.schemaReady, true);

    const phase6Headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    const invalidApproval = await fetch(`${base}/runs/0/approve`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidApproval.status, 422);
    const invalidRelease = await fetch(`${base}/runs/0/release`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidRelease.status, 422);

    const phase7 = await fetch(`${base}/phase7/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase7.status, 200);
    const phase7Payload = await phase7.json();
    assert.strictEqual(phase7Payload.schemaReady, true);

    const invalidDisbursement = await fetch(`${base}/disbursements/0/status`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidDisbursement.status, 422);
    const invalidRemittance = await fetch(`${base}/remittances/0/status`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidRemittance.status, 422);

    const phase8 = await fetch(`${base}/phase8/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase8.status, 200);
    const phase8Payload = await phase8.json();
    assert.strictEqual(phase8Payload.schemaReady, true);

    const invalidMapping = await fetch(`${base}/phase8/account-mappings`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidMapping.status, 422);
    const invalidClose = await fetch(`${base}/runs/0/close`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidClose.status, 422);

    const phase9 = await fetch(`${base}/phase9/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase9.status, 200);
    const phase9Payload = await phase9.json();
    assert.strictEqual(phase9Payload.schemaReady, true);

    const invalidParallelTest = await fetch(`${base}/phase9/parallel-tests`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidParallelTest.status, 422);
    const invalidSignoff = await fetch(`${base}/phase9/parallel-tests/0/signoffs`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidSignoff.status, 422);

    const phase10 = await fetch(`${base}/phase10/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase10.status, 200);
    const phase10Payload = await phase10.json();
    assert.strictEqual(phase10Payload.schemaReady, true);

    const invalidUatCycle = await fetch(`${base}/phase10/cycles`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidUatCycle.status, 422);
    const invalidUatCase = await fetch(`${base}/phase10/cycles/0/cases`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidUatCase.status, 422);
    const invalidUatIssue = await fetch(`${base}/phase10/cycles/0/issues`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidUatIssue.status, 422);
    const invalidAuthorization = await fetch(`${base}/phase10/cycles/0/authorize`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidAuthorization.status, 422);

    const phase11 = await fetch(`${base}/phase11/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase11.status, 200);
    const phase11Payload = await phase11.json();
    assert.strictEqual(phase11Payload.schemaReady, true);

    for (const endpoint of ['checklists', 'incidents', 'actions', 'status']) {
      const invalidOperation = await fetch(`${base}/phase11/windows/0/${endpoint}`, {
        method: 'POST', headers: phase6Headers, body: '{}',
      });
      assert.strictEqual(invalidOperation.status, 422);
    }
    const invalidWindow = await fetch(`${base}/phase11/windows`, {
      method: 'POST', headers: phase6Headers, body: '{}',
    });
    assert.strictEqual(invalidWindow.status, 422);

    const phase12 = await fetch(`${base}/phase12/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(phase12.status, 200);
    const phase12Payload = await phase12.json();
    assert.strictEqual(phase12Payload.schemaReady, true);

    for (const endpoint of ['periods', 'periods/0/reports', 'reports/0/status', 'periods/0/year-end',
      'year-end/0/status', 'periods/0/close']) {
      const invalidCompliance = await fetch(`${base}/phase12/${endpoint}`, {
        method: 'POST', headers: phase6Headers, body: '{}',
      });
      assert.strictEqual(invalidCompliance.status, 422);
    }

    assert.strictEqual(payrollRouter.payrollLogic.calculatePercentageAmount('1000.00', '5.0000'), '50.00');
    assert.strictEqual(payrollRouter.payrollLogic.prorateAmount('2000.00', '0.5000'), '1000.00');
    assert.strictEqual(payrollRouter.payrollLogic.csvCell('Doe, Jane'), '"Doe, Jane"');
    assert.strictEqual(payrollRouter.payrollLogic.csvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
    assert.strictEqual(payrollRouter.payrollLogic.hashRegister({ run: 1 }),
      payrollRouter.payrollLogic.hashRegister({ run: 1 }));
    assert.strictEqual(payrollRouter.payrollLogic.validStatusTransition('DISBURSEMENT', 'PREPARED', 'TRANSMITTED'), true);
    assert.strictEqual(payrollRouter.payrollLogic.validStatusTransition('DISBURSEMENT', 'CONFIRMED', 'FAILED'), false);
    assert.strictEqual(payrollRouter.payrollLogic.validStatusTransition('REMITTANCE', 'REMITTED', 'CONFIRMED'), true);
    assert.strictEqual(payrollRouter.payrollLogic.formatSignedCents(-125n), '-1.25');

    const calculation = await fetch(`${base}/calculate/ot`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workdayClassification: 'OFFICE_DAY',
        basicPay: '30000.00',
        approvedStart: '17:01',
        approvedEnd: '19:01',
        actualIn: '17:01',
        actualOut: '19:01',
        multiplier: '1.30',
      }),
    });
    assert.strictEqual(calculation.status, 200);
    const payload = await calculation.json();
    assert.strictEqual(payload.window.payableMinutes, 120);
    assert.strictEqual(payload.calculation.amount, '320.55');

    const missingOut = await fetch(`${base}/calculate/ot`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        basicPay: '30000.00',
        approvedStart: '17:01',
        approvedEnd: '19:01',
        actualIn: '17:01',
        actualOut: '',
        multiplier: '1.30',
      }),
    });
    const missingPayload = await missingOut.json();
    assert.strictEqual(missingPayload.window.payableMinutes, 0);
    assert.strictEqual(missingPayload.calculation, null);

    console.log('payroll route selfcheck: passed');
  } finally {
    server.close();
    await db.closePool();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
