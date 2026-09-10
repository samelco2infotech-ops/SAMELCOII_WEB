/**
 * SAM read-only query agent — answers arbitrary data questions by writing ONE
 * SELECT, guarding it, and running it on the read-only DB pool.
 *
 * This is the ONLY component that issues free-form SQL, and it can only read:
 *   - the LLM is instructed to emit a single SELECT,
 *   - sqlReadGuard rejects anything that isn't a single read statement,
 *   - database.readQuery runs it as a SELECT-only MySQL user (structural backstop).
 * Writes never go here — they go through the whitelisted action agent (samActions).
 *
 * deps are injected: { llmCall, runReadQuery } → unit-testable with no DB/LLM.
 */
const guard = require('./sqlReadGuard');
const priv = require('./privScope');

// A compact schema hint keeps the LLM on real tables. Extend as needed; wrong guesses
// just fail the query and SAM says so, they can't corrupt anything (read-only).
const SCHEMA_HINT = [
  '-- MySQL, two databases. Qualify tables as `db`.`table`.',
  'it_program.usertb(usercode, name, position, department, area, VLbal, SLbal, OLbal, bioUID, privilage)',
  'it_program.dtr_timeinout(userID=bioUID, `date`, timeinAM, timeoutAM, timeinPM, timeoutPM, department)',
  'it_program.fuelallocation_history(FARCode, usercode, Department, PresRequest, status, PresRequestDate) -- status:1=approved,2=pending,3=rejected',
  'it_program.tbleave(Id, empID=usercode, NAME, division, numofdays, datafrom, dateto, remarks, Status) -- Status:1=pending,2=approved,3=rejected',
  'messenger.sam_brain(question, answer, hit_count) -- SAM learned Q&A',
].join('\n');

const PROMPT =
  'You are SAM\'s SQL analyst for SAMELCO II. Given a question, output ONE MySQL SELECT that answers it. ' +
  'Rules: SELECT only (never write), always add a sensible LIMIT, qualify tables as `db`.`table`, ' +
  'output ONLY the SQL — no prose, no code fences, no semicolon-separated extras.\n\n' +
  SCHEMA_HINT;

function extractSql(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/```sql/gi, '').replace(/```/g, '').trim(); // strip code fences if any
  const m = s.match(/\b(select|with)\b[\s\S]*/i);           // drop any leading prose
  return (m ? m[0] : s).trim();
}

/**
 * answer(question, deps) →
 *   { ok:true, sql, rows, count }
 *   { ok:false, reason, sql? }   (guard rejected, or the DB errored)
 */
async function answer(question, { llmCall, runReadQuery, scope } = {}) {
  if (!llmCall) return { ok: false, reason: 'no AI provider configured for the query agent' };

  // Free-form SQL is manager/admin only (privilege 8+). Staff/dept get bounded data
  // through the fixed report scopes, not raw SQL. When no scope is passed (internal
  // callers/tests) the gate is skipped — the live chat wiring MUST pass a scope.
  if (scope && !priv.canRunFreeformQuery(scope)) {
    return {
      ok: false,
      restricted: true,
      reason: 'privilege',
      reply: 'Open-ended data queries are for managers (privilege 8+). I can still pull **your own** records or your **department** reports — just say which. 😊',
    };
  }

  const raw = await llmCall(PROMPT, [{ role: 'user', content: String(question || '') }]);
  const candidate = extractSql(raw);

  const checked = guard.assertReadOnly(candidate);
  if (!checked.ok) return { ok: false, reason: checked.reason, sql: candidate };

  try {
    const rows = await runReadQuery(checked.sql);
    return { ok: true, sql: checked.sql, rows, count: rows.length };
  } catch (e) {
    // Read-only user ⇒ even a write attempt errors here rather than mutating data.
    return { ok: false, reason: `query failed: ${String(e.message || e).slice(0, 160)}`, sql: checked.sql };
  }
}

module.exports = { answer, extractSql, SCHEMA_HINT };
