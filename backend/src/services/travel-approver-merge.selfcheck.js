// ponytail: standalone assert check for the batched department_head/general_manager merge in
// travelService.getPendingApprovals() — re-implements only the JS grouping+merge step (not the SQL
// itself, which needs a live DB) to confirm it reproduces what the old 6-per-row correlated
// subqueries used to compute, now done via 1 flat batch query instead of up to 6 per row.
// Run with: node travel-approver-merge.selfcheck.js
"use strict";
const assert = require("assert");

function buildApproverMap(approverRows) {
    const map = new Map();
    approverRows.forEach((row) => {
        const key = `${row.request_number}::${row.stage}`;
        if (!map.has(key)) map.set(key, row);
    });
    return map;
}

function mergeTravels(travels, approverByToNumberAndStage) {
    return travels.map((t) => {
        const dh = approverByToNumberAndStage.get(`${t.to_number}::department_head`);
        const gm = approverByToNumberAndStage.get(`${t.to_number}::general_manager`);
        return {
            ...t,
            department_head_usercode: dh?.approver_usercode || null,
            department_head_name: dh?.name || null,
            department_head_position: dh?.position || null,
            general_manager_usercode: gm?.approver_usercode || null,
            general_manager_name: gm?.name || null,
            general_manager_position: gm?.position || null,
        };
    });
}

// Case 1: a request with both stages assigned -> both sets of fields populated from the batch map.
{
    const approverMap = buildApproverMap([
        { request_number: "TO-1", stage: "department_head", approver_usercode: "S2-010", name: "Juan Dela Cruz", position: "Dept Head" },
        { request_number: "TO-1", stage: "general_manager", approver_usercode: "S2-001", name: "Ana Reyes", position: "GM" },
    ]);
    const [item] = mergeTravels([{ to_number: "TO-1" }], approverMap);
    assert.strictEqual(item.department_head_usercode, "S2-010");
    assert.strictEqual(item.department_head_name, "Juan Dela Cruz");
    assert.strictEqual(item.general_manager_usercode, "S2-001");
    assert.strictEqual(item.general_manager_name, "Ana Reyes");
}

// Case 2: a request with only department_head assigned -> general_manager fields stay null, not undefined/crash.
{
    const approverMap = buildApproverMap([
        { request_number: "TO-2", stage: "department_head", approver_usercode: "S2-011", name: "Pedro Cruz", position: "Dept Head" },
    ]);
    const [item] = mergeTravels([{ to_number: "TO-2" }], approverMap);
    assert.strictEqual(item.department_head_usercode, "S2-011");
    assert.strictEqual(item.general_manager_usercode, null, "expected null, not undefined, when unassigned");
    assert.strictEqual(item.general_manager_name, null);
}

// Case 3: a request with no approver rows at all -> everything null, still returns the base row.
{
    const [item] = mergeTravels([{ to_number: "TO-3" }], buildApproverMap([]));
    assert.strictEqual(item.department_head_usercode, null);
    assert.strictEqual(item.general_manager_usercode, null);
}

// Case 4: duplicate rows for the same (to_number, stage) -> first one wins, matching the old bare
// "LIMIT 1" with no ORDER BY (stable, doesn't silently overwrite with a later duplicate).
{
    const approverMap = buildApproverMap([
        { request_number: "TO-4", stage: "department_head", approver_usercode: "S2-020", name: "First", position: "Dept Head" },
        { request_number: "TO-4", stage: "department_head", approver_usercode: "S2-021", name: "Second", position: "Dept Head" },
    ]);
    const [item] = mergeTravels([{ to_number: "TO-4" }], approverMap);
    assert.strictEqual(item.department_head_usercode, "S2-020", "expected the first matching row to win");
}

// Case 5: two different requests must not bleed into each other's approver fields.
{
    const approverMap = buildApproverMap([
        { request_number: "TO-5", stage: "department_head", approver_usercode: "S2-030", name: "A", position: "Dept Head" },
        { request_number: "TO-6", stage: "department_head", approver_usercode: "S2-031", name: "B", position: "Dept Head" },
    ]);
    const items = mergeTravels([{ to_number: "TO-5" }, { to_number: "TO-6" }], approverMap);
    assert.strictEqual(items[0].department_head_usercode, "S2-030");
    assert.strictEqual(items[1].department_head_usercode, "S2-031");
}

console.log("travel-approver-merge.selfcheck.js: all checks passed");
