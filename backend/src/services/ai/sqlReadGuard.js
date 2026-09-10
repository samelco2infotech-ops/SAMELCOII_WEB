/**
 * SQL read-only guard — the code layer that keeps SAM's query agent read-only.
 *
 * This is defense-in-depth, NOT the primary protection: the primary protection is
 * running the query agent on a MySQL user granted only SELECT (see database.readQuery).
 * Even if this guard had a hole, the DB itself would refuse a write. This guard exists
 * so a bad query is rejected BEFORE it hits the DB, with a clear reason.
 *
 * Rules (a query must pass ALL):
 *   - exactly ONE statement (no stacked `...; DROP ...` injection),
 *   - starts with SELECT or WITH (a CTE that resolves to a SELECT),
 *   - no INTO OUTFILE / INTO DUMPFILE (those write files to the server),
 *   - no write/DDL keyword appears as a bare token (belt-and-suspenders).
 * A LIMIT is appended when the query has none, to cap runaway result sets.
 */

const MAX_ROWS = 1000;

// Blank out string/identifier literals and strip comments so structural checks
// (semicolons, keywords) can't be fooled by content inside quotes or comments.
function mask(sql) {
  let out = '';
  let i = 0;
  const s = String(sql);
  while (i < s.length) {
    const c = s[i];
    // line comments: -- …  and  # …
    if ((c === '-' && s[i + 1] === '-') || c === '#') {
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }
    // block comment: /* … */
    if (c === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
      i += 2;
      out += ' ';
      continue;
    }
    // quoted string / identifier: ' " `  (blank the contents, keep the quotes)
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += q;
      i += 1;
      while (i < s.length) {
        if (s[i] === '\\' && q !== '`') { i += 2; continue; } // escaped char in strings
        if (s[i] === q) {
          if (s[i + 1] === q) { i += 2; continue; } // doubled quote = literal quote
          break;
        }
        i += 1;
      }
      out += 'x' + q; // placeholder body + closing quote
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const FORBIDDEN = [
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate',
  'replace', 'grant', 'revoke', 'rename', 'load', 'call', 'handler',
  'lock', 'unlock', 'set', 'do', 'prepare', 'execute', 'commit', 'rollback',
];

/** Returns { ok:true, sql } (possibly LIMIT-appended) or { ok:false, reason }. */
function assertReadOnly(rawSql) {
  const original = String(rawSql || '').trim();
  if (!original) return { ok: false, reason: 'empty query' };

  const masked = mask(original).trim();

  // one statement only — a lone trailing semicolon is fine, an inner one is not.
  const withoutTrailing = masked.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) return { ok: false, reason: 'multiple statements are not allowed' };

  if (!/^(select|with)\b/i.test(withoutTrailing)) {
    return { ok: false, reason: 'only SELECT / WITH queries are allowed' };
  }

  if (/\binto\s+(outfile|dumpfile)\b/i.test(withoutTrailing)) {
    return { ok: false, reason: 'INTO OUTFILE/DUMPFILE is not allowed' };
  }

  const tokens = new Set(withoutTrailing.toLowerCase().match(/[a-z_]+/g) || []);
  for (const kw of FORBIDDEN) {
    if (tokens.has(kw)) return { ok: false, reason: `disallowed keyword: ${kw}` };
  }

  // Cap result size if the author left LIMIT off. ponytail: simple append — assumes
  // no UNION tail needing its own LIMIT; fine for single-SELECT agent output.
  let sql = original.replace(/;\s*$/, '');
  if (!/\blimit\b\s+\d+/i.test(masked)) sql += ` LIMIT ${MAX_ROWS}`;

  return { ok: true, sql };
}

module.exports = { assertReadOnly, MAX_ROWS };
