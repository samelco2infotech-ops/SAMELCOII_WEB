/**
 * Privilege scope — the dial that decides HOW MUCH data SAM may return.
 *
 *   level 'self'       (privilege 1–5): only the employee's own rows
 *   level 'department' (privilege 6–7): their whole department
 *   level 'org'        (privilege 8–10): everything
 *
 * Two uses:
 *   1. Fixed report/self-service SQL (we own the SQL) → `scopeClause(scope, table)`
 *      returns a WHERE fragment + params that reliably bounds the query.
 *   2. Free-form query agent (arbitrary SQL) → only 'org' may run it. MySQL has no
 *      row-level security, so we cannot safely rewrite arbitrary SQL to bound it;
 *      staff/dept get bounded data through the FIXED scopes instead, never raw SQL.
 *      ponytail: ceiling = no free-form for <priv 8. Upgrade path = per-table scoped
 *      views in MySQL, then lift the gate.
 */

/** Highest privilege digit in `privilage` ("3,7" → 7); defaults to 1. */
function maxPrivilege(userInfo = {}) {
  const digits = String(userInfo.privilage ?? '').split(/[^0-9]+/).filter(Boolean).map(Number);
  return digits.length ? Math.max(...digits) : 1;
}

function resolveScope(userInfo = {}) {
  const max = maxPrivilege(userInfo);
  const level = max >= 8 ? 'org' : (max >= 6 ? 'department' : 'self');
  return {
    level,
    max,
    usercode: userInfo.usercode || '',
    department: userInfo.department || '',
    bioUID: userInfo.bioUID ?? null,
  };
}

/** Only managers/admins (privilege 8+) may run the free-form query agent. */
function canRunFreeformQuery(scope) {
  return !!scope && scope.level === 'org';
}

// Owner/department columns per known table. `ownerValue:'bioUID'` means the owner
// column stores the biometric UID, not the usercode (dtr_timeinout).
const TABLE_OWNER = {
  usertb: { owner: 'usercode', dept: 'department' },
  tbleave: { owner: 'empID', dept: 'division' },
  fuelallocation_history: { owner: 'usercode', dept: 'Department' },
  dtr_timeinout: { owner: 'userID', dept: 'department', ownerValue: 'bioUID' },
  sam_brain: { shared: true }, // learned Q&A, not personal — readable at any level
};

/**
 * A WHERE fragment that bounds `table` to the caller's scope.
 * Returns { sql:'1=1', params:[] } for org / shared tables (no restriction),
 * or throws if a restricted caller lacks the identity needed to be bounded
 * (fail closed — never widen access on missing data).
 */
function scopeClause(scope, table, alias = '') {
  const p = alias ? `${alias}.` : '';
  const meta = TABLE_OWNER[String(table || '').toLowerCase()];
  if (!meta) throw new Error(`no scope mapping for table "${table}"`);
  if (scope.level === 'org' || meta.shared) return { sql: '1=1', params: [] };

  if (scope.level === 'self') {
    const value = meta.ownerValue === 'bioUID' ? scope.bioUID : scope.usercode;
    if (value === null || value === undefined || value === '') {
      throw new Error(`cannot scope ${table} to self: missing ${meta.ownerValue || 'usercode'}`);
    }
    return { sql: `${p}\`${meta.owner}\` = ?`, params: [value] };
  }

  // department
  if (!scope.department) throw new Error(`cannot scope ${table} to department: missing department`);
  return { sql: `${p}\`${meta.dept}\` = ?`, params: [scope.department] };
}

module.exports = { resolveScope, maxPrivilege, canRunFreeformQuery, scopeClause, TABLE_OWNER };
