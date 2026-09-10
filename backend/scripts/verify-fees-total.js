/**
 * Verifies saveFees() actually persists TotalAmount to mempayments, using a throwaway
 * test account so it never touches real member data. Cleans up after itself.
 * Run from backend/: node scripts/verify-fees-total.js
 */
const db = require('../src/config/database');
const membershipService = require('../src/services/membershipService');

const TEST_ACCOUNT = '__TOTALFIX_TEST__';

(async () => {
  await db.createPool();
  try {
    await membershipService.saveFees({
      memberId: TEST_ACCOUNT,
      fees: {
        Membership: '5.00',
        'Bill Deposit': '500.00',
        'Sealing Led': '75.00',
        'Service Fee': '238.10',
        'Inspection Fees': '200.00',
        Meter: '1200.00',
        'Coop Share': '500.00',
        'Ground Rod': '600.00',
      },
    });

    const row = await db.queryOne(
      'SELECT TotalAmount FROM `membership`.`mempayments` WHERE accountnumber = ?',
      [TEST_ACCOUNT]
    );
    console.log('Saved TotalAmount:', row ? row.TotalAmount : '(no row found)');
    if (!row || Number(row.TotalAmount) !== 3318.10) {
      throw new Error(`Expected TotalAmount 3318.10, got ${row ? row.TotalAmount : 'nothing'}`);
    }
    console.log('OK — TotalAmount persisted correctly.');
  } finally {
    await db.execute('DELETE FROM `membership`.`mempayments` WHERE accountnumber = ?', [TEST_ACCOUNT]);
    await db.closePool();
  }
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
