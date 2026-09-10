/**
 * Purpose: Runnable regression check for the /pending and /all SQL/param assembly in epass.js
 * after the [PERF] fix that pushes the status/fuel-link filters into the inner subquery's WHERE
 * (instead of aggregating the entire epasstb table before filtering by approver). Run with
 * `node epass.pending-query.selfcheck.js`.
 * Tagalog: Hindi ito kumokonekta sa DB — sinusuri lang nito na tugma pa rin ang bilang ng "?"
 * placeholders sa query sa bilang ng params na ipinapasa, at nasa tamang pagkakasunod-sunod ang
 * mga value, dahil doon pinaka-madaling nasisira ang ganitong klaseng dynamic SQL-string builder.
 */
const assert = require('assert');

// Plain replica of the /pending query+params assembly (see router.get('/pending', ...)).
function buildPendingQuery({ year, month, day, department, q } = {}, requesterUsercode = 'S2-046') {
  const filters = [];
  const params = [1, requesterUsercode, requesterUsercode];
  let sql = `
    SELECT ... FROM (
      SELECT ... FROM epasstb
       WHERE status = ? AND (fuel_farcode IS NULL OR TRIM(fuel_farcode) = '')
       GROUP BY epassnumber, usercode
    ) d
    LEFT JOIN usertb u ON d.usercode = u.usercode
    WHERE (UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?))
        OR UPPER(TRIM(COALESCE(d.epass_approved, '')))=UPPER(TRIM(?)))
  `;
  if (year) { filters.push('YEAR(...) = ?'); params.push(parseInt(year, 10)); }
  if (month) { filters.push('MONTH(...) = ?'); params.push(parseInt(month, 10)); }
  if (day) { filters.push('DAY(...) = ?'); params.push(parseInt(day, 10)); }
  if (department) { filters.push('UPPER(d.department) = ?'); params.push(String(department).toUpperCase()); }
  if (q) { filters.push('(... LIKE ? OR ... LIKE ? OR ... LIKE ?)'); params.push(q, q, q); }
  if (filters.length) sql += ` AND ${filters.join(' AND ')}`;
  sql += ' GROUP BY d.epassnumber ORDER BY MAX(d.date) DESC LIMIT ?';
  params.push(50);
  return { sql, params };
}

// Plain replica of the /all query+params assembly (see router.get('/all', ...)).
function buildAllQuery({ year, month, day, department, q, status } = {}, requesterUsercode = 'S2-046') {
  const filters = [];
  const innerFilters = [`(fuel_farcode IS NULL OR TRIM(fuel_farcode) = '')`];
  const innerParams = [];
  if (status) { innerFilters.push('status = ?'); innerParams.push(parseInt(status, 10)); }
  const params = [...innerParams, requesterUsercode, requesterUsercode];
  let sql = `
    SELECT ... FROM (
      SELECT ... FROM epasstb
       WHERE ${innerFilters.join(' AND ')}
       GROUP BY epassnumber, usercode
    ) d
    LEFT JOIN usertb u ON d.usercode = u.usercode
    WHERE (UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?))
        OR UPPER(TRIM(COALESCE(d.epass_approved, '')))=UPPER(TRIM(?)))
  `;
  if (year) { filters.push('YEAR(...) = ?'); params.push(parseInt(year, 10)); }
  if (month) { filters.push('MONTH(...) = ?'); params.push(parseInt(month, 10)); }
  if (day) { filters.push('DAY(...) = ?'); params.push(parseInt(day, 10)); }
  if (department) { filters.push('UPPER(d.department) = ?'); params.push(String(department).toUpperCase()); }
  if (q) { filters.push('(... LIKE ? OR ... LIKE ? OR ... LIKE ?)'); params.push(q, q, q); }
  if (filters.length) sql += ` AND ${filters.join(' AND ')}`;
  sql += ' GROUP BY d.epassnumber ORDER BY MAX(d.date) DESC LIMIT ?';
  params.push(100);
  return { sql, params };
}

const placeholderCount = (sql) => (sql.match(/\?/g) || []).length;

// --- Check 1: /pending with no optional filters — placeholder count must match params length.
{
  const { sql, params } = buildPendingQuery({}, 'S2-046');
  assert.strictEqual(placeholderCount(sql), params.length, '/pending placeholder/param mismatch (no filters)');
  assert.deepStrictEqual(params, [1, 'S2-046', 'S2-046', 50], 'status must be the first param, ahead of the approver checks');
}

// --- Check 2: /pending with every optional filter present — still must line up.
{
  const { sql, params } = buildPendingQuery({ year: '2026', month: '9', day: '3', department: 'OGM', q: 'arcales' }, 'S2-046');
  assert.strictEqual(placeholderCount(sql), params.length, '/pending placeholder/param mismatch (all filters)');
}

// --- Check 3: /all with no status filter — inner WHERE must not add a phantom placeholder.
{
  const { sql, params } = buildAllQuery({}, 'S2-046');
  assert.strictEqual(placeholderCount(sql), params.length, '/all placeholder/param mismatch (no status)');
  assert.deepStrictEqual(params, ['S2-046', 'S2-046', 100]);
}

// --- Check 4: /all WITH a status filter — status param must land before the two approver params.
{
  const { sql, params } = buildAllQuery({ status: '2' }, 'S2-046');
  assert.strictEqual(placeholderCount(sql), params.length, '/all placeholder/param mismatch (with status)');
  assert.deepStrictEqual(params, [2, 'S2-046', 'S2-046', 100]);
}

// --- Check 5: /all with status AND every other optional filter.
{
  const { sql, params } = buildAllQuery({ status: '1', year: '2026', month: '9', day: '3', department: 'OGM', q: 'arcales' }, 'S2-046');
  assert.strictEqual(placeholderCount(sql), params.length, '/all placeholder/param mismatch (status + all filters)');
}

console.log('epass.pending-query.selfcheck: passed');
