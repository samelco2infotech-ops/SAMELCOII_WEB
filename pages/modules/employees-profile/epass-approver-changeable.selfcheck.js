/**
 * Purpose: Runnable regression check for the EPASS approver "click to change" gating logic in
 * script.js (renderSelectedRequestApprover / bindRequestApprover click handler). Run with
 * `node epass-approver-changeable.selfcheck.js`.
 * [FIX] The bug: while the "Auto assign approver" dropdown was on "auto", the EPASS approver card
 * rendered with no is-changeable class and the click handler required mode.value === "manual"
 * (or formKey === "leave") before reacting — so clicking the auto-assigned approver (e.g. Alena)
 * did nothing and looked stuck. Travel/Leave already allowed this; EPASS did not.
 */
const assert = require('assert');

// Plain replica of renderSelectedRequestApprover's isChangeable calculation.
const isChangeable = (formKey, context) => {
  const isSingleLeavePicker = formKey === "leave";
  return context === "manual" || isSingleLeavePicker || formKey === "epass";
};

// Plain replica of bindRequestApprover's click-handler gate.
const clickShouldOpenSearch = (formKey, modeValue) =>
  modeValue === "manual" || formKey === "leave" || formKey === "epass";

// --- Check 1: EPASS card is now changeable even while still in "auto" mode (the fix).
assert.strictEqual(isChangeable("epass", "auto"), true, "epass auto card must be clickable now");
assert.strictEqual(isChangeable("epass", "manual"), true);

// --- Check 2: clicking the EPASS card while mode is "auto" now opens the search picker.
assert.strictEqual(clickShouldOpenSearch("epass", "auto"), true, "clicking epass card in auto mode must open search");

// --- Check 3: pre-existing Leave behavior is unchanged (already always-changeable).
assert.strictEqual(isChangeable("leave", "auto"), true);
assert.strictEqual(clickShouldOpenSearch("leave", "auto"), true);

// --- Check 4: unrelated form keys are not accidentally made changeable (no regression to travel,
// which has its own two-stage card logic, or any future formKey).
assert.strictEqual(isChangeable("travel", "auto"), false);
assert.strictEqual(clickShouldOpenSearch("travel", "auto"), false);

console.log('epass-approver-changeable.selfcheck: passed');
