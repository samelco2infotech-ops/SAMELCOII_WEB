// ponytail: standalone assert check for the batched Balance/TravelNumber/AssignedApprovers merge
// in GET /api/fuel?action=history (fuel.js) — re-implements only the JS merge step (not the SQL
// itself, which needs a live DB) to confirm it reproduces what the old per-row correlated
// subqueries used to compute, now done via 3 flat batch queries instead of N per-row ones.
// Run with: node fuel-history-merge.selfcheck.js
"use strict";
const assert = require("assert");

function mergeHistoryRows(rows, latestBalanceByUsercode, travelNumberByFarCode, approversByFarCode) {
    return rows.map((row) => {
        const { RowBalance, ...rest } = row;
        return {
            ...rest,
            Balance: latestBalanceByUsercode.has(row.UserCode) ? latestBalanceByUsercode.get(row.UserCode) : RowBalance,
            TravelNumber: String(row.epassID || "").trim() ? "" : String(travelNumberByFarCode.get(row.FARCode) || ""),
            AssignedApprovers: (approversByFarCode.get(row.FARCode) || []).join("||"),
        };
    });
}

// Case 1: usercode has a real status=4 balance row -> use the batched latest balance, not the row's own stale Balance.
{
    const items = mergeHistoryRows(
        [{ UserCode: "S2-001", FARCode: "FAR-1", RowBalance: 5, epassID: "" }],
        new Map([["S2-001", 42]]),
        new Map(),
        new Map()
    );
    assert.strictEqual(items[0].Balance, 42, "expected the latest batched balance to win over the row's own Balance");
}

// Case 2: usercode has NO status=4 row at all -> fall back to the row's own Balance, same as the old COALESCE.
{
    const items = mergeHistoryRows(
        [{ UserCode: "S2-002", FARCode: "FAR-2", RowBalance: 7, epassID: "" }],
        new Map(),
        new Map(),
        new Map()
    );
    assert.strictEqual(items[0].Balance, 7, "expected fallback to the row's own Balance when no batched entry exists");
}

// Case 3: epassID present -> TravelNumber must stay blank even if a travel number exists for that FARCode.
{
    const items = mergeHistoryRows(
        [{ UserCode: "S2-003", FARCode: "FAR-3", RowBalance: 0, epassID: "EPASS-9" }],
        new Map(),
        new Map([["FAR-3", "TO-123"]]),
        new Map()
    );
    assert.strictEqual(items[0].TravelNumber, "", "expected TravelNumber blank whenever epassID is set");
}

// Case 4: no epassID -> TravelNumber pulls from the batched map.
{
    const items = mergeHistoryRows(
        [{ UserCode: "S2-004", FARCode: "FAR-4", RowBalance: 0, epassID: "" }],
        new Map(),
        new Map([["FAR-4", "TO-456"]]),
        new Map()
    );
    assert.strictEqual(items[0].TravelNumber, "TO-456", "expected the batched travel number");
}

// Case 5: multiple approvers for one FARCode join with '||', same separator as the old GROUP_CONCAT.
{
    const items = mergeHistoryRows(
        [{ UserCode: "S2-005", FARCode: "FAR-5", RowBalance: 0, epassID: "" }],
        new Map(),
        new Map(),
        new Map([["FAR-5", ["S2-010:::Juan Dela Cruz", "S2-011:::Ana Reyes"]]])
    );
    assert.strictEqual(items[0].AssignedApprovers, "S2-010:::Juan Dela Cruz||S2-011:::Ana Reyes", "expected '||'-joined approvers");
}

// Case 6: no approvers assigned -> empty string, not "undefined" or a stray separator.
{
    const items = mergeHistoryRows(
        [{ UserCode: "S2-006", FARCode: "FAR-6", RowBalance: 0, epassID: "" }],
        new Map(),
        new Map(),
        new Map()
    );
    assert.strictEqual(items[0].AssignedApprovers, "", "expected empty string when no approvers are assigned");
}

console.log("fuel-history-merge.selfcheck.js: all checks passed");
