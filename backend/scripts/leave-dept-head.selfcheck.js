/**
 * Self-check for Leave's Department Head auto-resolution.
 * Run: node scripts/leave-dept-head.selfcheck.js
 * Regression guard for the bug where resolveStage() only trusted a position-title regex —
 * missing Corplan/ESD/ISD entirely (titles are "Corplan Manager" etc, no literal "DEPARTMENT")
 * and picking the wrong person for FSD/IAD/TSD/OGM. Fix: check signatory_groups
 * (module_key='leave', title='Department Head') first, same as Fuel/EPASS/Travel/Overtime.
 */
const assert = require('assert');
const service = require('../src/services/leaveService');

async function main() {
  // One employee per department that used to fail or mismatch before the fix.
  const cases = {
    'S2-085': 'Engr. Gemil M. Longara Jr.',   // CORPLAN — used to resolve to nobody
    'S2-096': 'Ricky L. Langi',               // ESD — used to resolve to nobody
    'S2-038': 'Dickson Q. Bernales',          // ISD — used to resolve to nobody
    'S2-199': 'Marjessel T. Marabut',         // IAD — used to resolve to "Financial Audit Chief"
    'S2-161': 'Domingo C. Barongo',           // TSD — used to resolve to "SLRP Crew Chief"
  };

  for (const [usercode, expectedHead] of Object.entries(cases)) {
    const { approver } = await service.approver({ usercode });
    assert.ok(approver, `${usercode} resolves a Department Head at all`);
    assert.strictEqual(approver.name, expectedHead, `${usercode}'s Department Head is ${expectedHead}, got ${approver.name}`);
  }

  console.log(`OK — Leave Department Head resolves correctly for ${Object.keys(cases).length}/${Object.keys(cases).length} previously-broken departments.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Leave dept-head self-check FAILED:', error.message);
  process.exit(1);
});
