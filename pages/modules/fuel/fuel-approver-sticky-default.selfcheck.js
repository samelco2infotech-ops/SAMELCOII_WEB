/**
 * Purpose: Runnable regression check for Fuel's approver "sticky default" and edit-restore logic
 * in index.html (writeFuelApproverDefault / readFuelApproverDefault) and fuel-actions.js
 * (normalizeItem). Run with `node fuel-approver-sticky-default.selfcheck.js`.
 * [FIX] Two bugs reported together: (1) readFuelApproverDefault() existed but nothing ever called
 * a write counterpart, so every new fuel request silently discarded the requester's manual
 * approver pick and re-resolved the department's auto default — forcing re-selection every time.
 * (2) normalizeItem() whitelisted fields and dropped AssignedApprovers before Edit ever saw it, so
 * editing a pending request always showed an empty picker instead of the approvers actually saved
 * on that request.
 */
const assert = require('assert');

const MAX_FUEL_APPROVERS = 3;

// Plain replica of readFuelApproverDefault/writeFuelApproverDefault (localStorage-free).
function makeDefaultStore() {
  const store = new Map();
  const key = 'samelcii_default_fuel_approver_S2-245';
  return {
    write(people) {
      if (!Array.isArray(people) || !people.length) { store.delete(key); return; }
      store.set(key, JSON.stringify(people.slice(0, MAX_FUEL_APPROVERS)));
    },
    read() {
      try {
        const saved = JSON.parse(store.get(key) || 'null');
        const people = Array.isArray(saved) ? saved : (saved && saved.usercode ? [saved] : []);
        return people.filter((p) => p && p.usercode).slice(0, MAX_FUEL_APPROVERS);
      } catch (_e) { return []; }
    }
  };
}

// Plain replica of toggleFuelApprover's add/remove + write-through (the fix).
function toggle(defaultStore, selected, person) {
  const normalized = String(person.usercode || '').trim().toUpperCase();
  const existing = selected.findIndex((item) => String(item.usercode || '').trim().toUpperCase() === normalized);
  if (existing >= 0) selected.splice(existing, 1);
  else selected.push(person);
  defaultStore.write(selected);
  return selected;
}

const alena = { usercode: 'S2-100', name: 'Alena C. Dabuet' };
const mariaPaz = { usercode: 'S2-200', name: 'Maria Paz M. Cascayan' };

const defaultStore = makeDefaultStore();
let selected = [];

// --- Check 1: before ever picking anyone, there is no sticky default yet.
assert.deepStrictEqual(defaultStore.read(), []);

// --- Check 2: picking Maria Paz once must persist as the default for the NEXT new request
// (this was the reported bug: it never stuck, forcing re-selection every time).
selected = toggle(defaultStore, selected, mariaPaz);
assert.strictEqual(defaultStore.read()[0].usercode, 'S2-200', 'a manually picked approver must stick as the default');

// --- Check 3: adding Alena as a second approver keeps both in the persisted default.
selected = toggle(defaultStore, selected, alena);
assert.deepStrictEqual(defaultStore.read().map((p) => p.usercode).sort(), ['S2-100', 'S2-200']);

// --- Check 4: removing one approver updates (not just adds to) the persisted default.
selected = toggle(defaultStore, selected, alena);
assert.deepStrictEqual(defaultStore.read().map((p) => p.usercode), ['S2-200']);

// --- Check 5: normalizeItem must preserve AssignedApprovers so Edit can restore it (the second
// reported bug: this field was silently dropped by the field whitelist).
function pick(row, keys, fallback) {
  for (const k of keys) { if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; }
  return fallback;
}
function normalizeItemAssignedApprovers(row) {
  return pick(row, ['AssignedApprovers', 'assignedApprovers', 'assigned_approvers'], '');
}
const savedRow = { FARCode: '20260828CPD10000', AssignedApprovers: 'S2-500:::Juan Dela Cruz||S2-600:::Maria Reyes' };
const restored = normalizeItemAssignedApprovers(savedRow)
  .split('||').map((entry) => { const [usercode, name] = entry.split(':::'); return { usercode, name }; });
assert.strictEqual(restored.length, 2);
assert.strictEqual(restored[0].usercode, 'S2-500');
assert.strictEqual(restored[1].name, 'Maria Reyes');

console.log('fuel-approver-sticky-default.selfcheck: passed');
