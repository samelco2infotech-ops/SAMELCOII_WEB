/**
 * Purpose: Verify the print-approver override logic used by both warehouse.js and
 * membership/index.html (Recommending Approval / Approved By, swappable per print via the
 * settings icon, stored in localStorage under the shared key samelcii_print_approvers_v1).
 * Run with: node printApprover.selfcheck.js
 */
const assert = require('assert');

const PRINT_APPROVER_DEFAULTS = {
    recommending: { label: 'Recommending Approval', name: 'Raquel B. Borja', title: 'MEDS' },
    approved: { label: 'Approved By', name: 'Dickson Q. Bernales', title: 'ISD Manager' },
};

function makeStore() {
    const store = {};
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = value; },
    };
}

function loadPrintApproverOverrides(localStorage, key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_error) { return {}; }
}

function savePrintApproverOverride(localStorage, key, role, person) {
    const overrides = loadPrintApproverOverrides(localStorage, key);
    overrides[role] = { name: String(person?.name || '').trim(), title: String(person?.position || person?.title || '').trim() };
    localStorage.setItem(key, JSON.stringify(overrides));
}

function currentPrintApprover(localStorage, key, role) {
    const overrides = loadPrintApproverOverrides(localStorage, key);
    const stored = overrides[role];
    const fallback = PRINT_APPROVER_DEFAULTS[role];
    return { label: fallback.label, name: stored?.name || fallback.name, title: stored?.title || fallback.title };
}

function main() {
    const KEY = 'samelcii_print_approvers_v1';

    // No override yet -> falls back to the default pair.
    const store1 = makeStore();
    const recommending1 = currentPrintApprover(store1, KEY, 'recommending');
    assert.strictEqual(recommending1.name, 'Raquel B. Borja', 'defaults to the fallback name when nothing is stored');

    // Picking a replacement from the search results (mirrors the bootstrap employee shape) sticks.
    const store2 = makeStore();
    savePrintApproverOverride(store2, KEY, 'approved', { name: 'Juan Dela Cruz', position: 'Branch Manager' });
    const approved2 = currentPrintApprover(store2, KEY, 'approved');
    assert.strictEqual(approved2.name, 'Juan Dela Cruz', 'stores and returns the overridden name');
    assert.strictEqual(approved2.title, 'Branch Manager', 'falls back to position when no explicit title field');
    // The untouched role must be unaffected.
    const recommending2 = currentPrintApprover(store2, KEY, 'recommending');
    assert.strictEqual(recommending2.name, 'Raquel B. Borja', 'overriding one role must not touch the other');

    // Corrupted localStorage value must not throw — falls back to defaults.
    const store3 = makeStore();
    store3.setItem(KEY, '{not json');
    const recommending3 = currentPrintApprover(store3, KEY, 'recommending');
    assert.strictEqual(recommending3.name, 'Raquel B. Borja', 'corrupted stored value falls back to defaults without throwing');

    console.log('printApprover.selfcheck: passed');
}

main();
