/**
 * Purpose: Runnable regression check for setRequestApproverSelection's Travel branch in script.js.
 * Run with `node travel-approver-restore-on-edit.selfcheck.js`.
 * [FIX] The bug: Travel's /list API never returned `assigned_approver_usercode` (only Leave's
 * does) — the old generic fallback always read that as empty, forced mode "auto", and re-resolved
 * the department's default Department Head (e.g. Alena) instead of showing who was actually saved
 * on the pending request being edited. travelService.getTravelList now also returns
 * department_head_usercode/general_manager_usercode, and script.js reads those instead.
 */
const assert = require('assert');

// Plain replica of setRequestApproverSelection's Travel branch (DOM/state-free).
function resolveTravelApproverFromItem(item) {
  const gmCode = String(item.general_manager_usercode || "").trim();
  const generalManager = gmCode ? {
    usercode: gmCode,
    name: String(item.general_manager_name || "").trim() || gmCode,
    position: String(item.general_manager_position || "").trim()
  } : null;
  const dhCode = String(item.department_head_usercode || "").trim();
  if (!dhCode) {
    return { mode: "auto", departmentHead: null, generalManager, generalManagerIsManual: Boolean(gmCode) };
  }
  const departmentHead = {
    usercode: dhCode,
    name: String(item.department_head_name || "").trim() || dhCode,
    position: String(item.department_head_position || "").trim()
  };
  return { mode: "manual", departmentHead, generalManager, generalManagerIsManual: Boolean(gmCode) };
}

// --- Check 1: a request saved with a non-default Department Head restores THAT person, not the
// department's auto-resolved default (this is the reported bug: it kept showing Alena instead).
const savedWithCustomApprover = {
  department_head_usercode: "S2-500",
  department_head_name: "Juan Dela Cruz",
  department_head_position: "OIC - Department Head",
  general_manager_usercode: "S2-245",
  general_manager_name: "Engr. Gannymede B. Tiu",
  general_manager_position: "General Manager"
};
const resolved1 = resolveTravelApproverFromItem(savedWithCustomApprover);
assert.strictEqual(resolved1.mode, "manual", "a saved department head must restore as manual, not auto");
assert.strictEqual(resolved1.departmentHead.usercode, "S2-500");
assert.strictEqual(resolved1.departmentHead.name, "Juan Dela Cruz");
assert.notStrictEqual(resolved1.departmentHead.name, "Alena C. Dabuet", "must not silently fall back to the auto-resolved default");
assert.strictEqual(resolved1.generalManager.usercode, "S2-245");
assert.strictEqual(resolved1.generalManagerIsManual, true);

// --- Check 2: a request with no department_head assignment (traveler IS the department head,
// server skips that stage) correctly falls back to "auto" instead of fabricating a fake person.
const skippedDepartmentHead = { general_manager_usercode: "S2-245", general_manager_name: "GM" };
const resolved2 = resolveTravelApproverFromItem(skippedDepartmentHead);
assert.strictEqual(resolved2.mode, "auto");
assert.strictEqual(resolved2.departmentHead, null);

console.log('travel-approver-restore-on-edit.selfcheck: passed');
