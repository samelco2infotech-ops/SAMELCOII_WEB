/**
 * SAM safety guardrails — Node port of aiMessageRequestsBlockedWrite /
 * aiUserHasFullDataAccess / aiWantsAllEmployees from api/ai_history.php.
 * Reports are read-only; SAM never mutates records from chat, and broad
 * all-employee reports require an elevated privilege.
 */
const { hasToken } = require('./reportRouter');

/** Destructive/mutating request that SAM must refuse from chat. */
function requestsBlockedWrite(message) {
  return hasToken(message, [
    'delete', 'remove', 'erase', 'drop', 'truncate', 'destroy',
    'clear records', 'update database', 'edit database',
    'change database', 'modify database',
  ]);
}

/** Asking for the whole organization's data (not just their own records). */
function wantsAllEmployees(message) {
  return hasToken(message, [
    'all employee', 'all employees', 'all staff', 'everyone', 'every employee',
    'whole company', 'company wide', 'organization wide',
  ]);
}

/**
 * Full data access = privilege level 6–10 (department heads, managers, admins).
 * `privilage` may be a list like "3,7" — any digit in 6..10 grants access.
 * Privilege 1–5 (or blank) is limited to the user's own records.
 */
function hasFullDataAccess(userInfo = {}) {
  const parts = String(userInfo.privilage ?? '').split(/[^0-9]+/).filter(Boolean);
  return parts.some((p) => {
    const n = parseInt(p, 10);
    return n >= 6 && n <= 10;
  });
}

module.exports = { requestsBlockedWrite, wantsAllEmployees, hasFullDataAccess };
