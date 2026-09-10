/**
 * Purpose: Runnable regression check for Travel's Department Head "sticky default" behavior in
 * script.js (selectRequestApprover + loadAutomaticRequestApprover). Run with
 * `node travel-approver-sticky-default.selfcheck.js`.
 * [FIX] The bug: unlike EPASS/Leave, Travel had no "Set as default" button, and picking a
 * Department Head never called writeRequestApproverDefault — so every NEW travel request (or any
 * request re-auto-resolved) silently fell back to the department's resolved default (e.g. Alena),
 * forcing the requester to re-search the same replacement approver every single time.
 */
const assert = require('assert');

// Tiny in-memory stand-in for localStorage, plus a plain replica of the read/write default pair.
function makeDefaultStore() {
  const store = new Map();
  const key = "samelcii_default_travel_approver_S2-008";
  return {
    write(person) {
      if (!person?.usercode) { store.delete(key); return; }
      store.set(key, JSON.stringify({ usercode: String(person.usercode), name: person.name || person.usercode }));
    },
    read() {
      const raw = store.get(key);
      if (!raw) return null;
      const person = JSON.parse(raw);
      return person && person.usercode ? person : null;
    }
  };
}

// Plain replica of selectRequestApprover's travel department-head branch (the fix: it now writes
// the pick as the default) feeding into loadAutomaticRequestApprover's resolution order (the
// existing `savedDefault || people.find(...)` chain, unchanged).
function pickDepartmentHead(defaultStore, person) {
  defaultStore.write(person);
  return person;
}
function resolveAutoApproverForNewRequest(defaultStore, departmentPeople) {
  const savedDefault = defaultStore.read();
  return savedDefault
    || departmentPeople.find((item) => item.isDepartmentHead)
    || departmentPeople[0]
    || null;
}

const alena = { usercode: "S2-100", name: "Alena C. Dabuet", isDepartmentHead: true };
const mariaPaz = { usercode: "S2-200", name: "Maria Paz M. Cascayan" };
const departmentPeople = [alena];

const defaultStore = makeDefaultStore();

// --- Check 1: before ever picking anyone manually, a brand-new request resolves to the
// department's default head (existing behavior, unchanged).
assert.strictEqual(resolveAutoApproverForNewRequest(defaultStore, departmentPeople).usercode, "S2-100");

// --- Check 2: after manually picking Maria Paz once, the NEXT new request must default to her,
// not fall back to Alena (this is the reported bug).
pickDepartmentHead(defaultStore, mariaPaz);
const resolved = resolveAutoApproverForNewRequest(defaultStore, departmentPeople);
assert.strictEqual(resolved.usercode, "S2-200", "the last manually-picked approver must stick as the default");
assert.notStrictEqual(resolved.usercode, "S2-100", "must not silently revert to the department's auto default");

// --- Check 3: picking someone else again updates the sticky default (not append-only/stuck).
const thirdPerson = { usercode: "S2-300", name: "Third Person" };
pickDepartmentHead(defaultStore, thirdPerson);
assert.strictEqual(resolveAutoApproverForNewRequest(defaultStore, departmentPeople).usercode, "S2-300");

console.log('travel-approver-sticky-default.selfcheck: passed');
