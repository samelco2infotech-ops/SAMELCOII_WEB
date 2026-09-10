/**
 * Offline self-check for the SAM action agent (no DB, no LLM).
 * Run from backend/: node src/services/ai/samActions.selfcheck.js
 */
const assert = require('assert');
const A = require('./samActions');

// Fake deps — record calls, never touch a DB.
const calls = [];
const deps = {
  meService: { buildMySummary: async (u) => ({ employee: { name: 'Tess', usercode: u }, dtr: { days_with_records: 5, late_days: 1, early_out_days: 0 }, leave: { vacation_leave: 3, sick_leave: 2, other_leave: 0 }, fuel: { requested_this_month: 10 } }) },
  fuelService: { createFuelRequest: async (u, l) => { calls.push(['fuel', u, l]); return 'FAR-TEST-1'; } },
  overtimeService: { createOvertimeRequest: async (u, h, r) => { calls.push(['ot', u, h, r]); return 77; } },
  travelService: { createTravel: async (u, d) => { calls.push(['travel', u, d.destination, d.date]); return 'TO-TEST-9'; } },
  epassService: { createEpass: async (u, d) => { calls.push(['epass', u, d.department]); return 'EP-TEST-4'; } },
  db: { execute: async (sql, p) => { calls.push(['leave', p[1], p[4], p[5]]); return { affectedRows: 1 }; } },
};
const emp = { usercode: 'S2-100', name: 'Tess', privilage: '1' };
const opts = { useLLM: false };
const run = (message, extra = {}) => A.handleMessage({ message, userInfo: emp, deps, options: opts, ...extra });

(async () => {
  // 1. Routing (deterministic).
  assert.strictEqual(A.deterministicSelect('show my dtr and leave balance').action, 'my_summary', 'routes my_summary');
  assert.strictEqual(A.deterministicSelect('please request 25 liters of fuel').action, 'submit_fuel', 'routes submit_fuel');
  assert.strictEqual(A.deterministicSelect('file a sick leave from 2026-08-01 to 2026-08-02').action, 'file_leave', 'routes file_leave');
  assert.strictEqual(A.deterministicSelect('what is the epass process').action, null, 'general question → no action');

  // 2. Read action runs immediately, no confirm.
  const r1 = await run('show my summary');
  assert.ok(r1.done && /DTR/.test(r1.reply), 'my_summary executes and replies');
  assert.strictEqual(r1.audit.write, false, 'read action audited as non-write');

  // 3. Write action PAUSES for confirmation, does NOT run yet.
  const r2 = await run('request 25 liters of fuel');
  assert.ok(r2.needsConfirmation && !r2.done, 'submit_fuel waits for confirmation');
  assert.strictEqual(calls.length, 0, 'nothing executed before confirm');

  // 4. Confirmed write runs the handler.
  const r3 = await run('request 25 liters of fuel', { confirmed: true });
  assert.ok(r3.done && /FAR-TEST-1/.test(r3.reply), 'confirmed fuel request executes');
  assert.deepStrictEqual(calls[0], ['fuel', 'S2-100', 25], 'handler called with parsed liters');

  // 5. Missing params → ask, never guess.
  const r4 = await run('file a vacation leave');
  assert.ok(r4.needsInput && r4.missing.includes('date_from'), 'file_leave asks for missing dates');

  // 6. Full leave flow with confirm.
  const r5 = await run('file a sick leave from 2026-08-01 to 2026-08-02', { confirmed: true });
  assert.ok(r5.done && /Sick Leave/.test(r5.reply), 'sick leave filed on confirm');
  assert.strictEqual(calls[1][0], 'leave', 'leave insert executed');

  // 7. Destructive verb is blocked even if it mentions a known noun.
  const r6 = await run('delete my leave request', { confirmed: true });
  assert.ok(r6.restricted && calls.length === 2, 'delete blocked, no new execution');

  // 8. Overtime + travel route correctly and ask for their missing params.
  assert.strictEqual(A.deterministicSelect('file overtime for 3 hours').action, 'file_overtime', 'routes file_overtime');
  assert.ok((await run('request overtime for 3 hours')).missing.includes('reason'), 'overtime asks for reason');
  assert.strictEqual(A.deterministicSelect('file a travel order on 2026-08-01').action, 'file_travel_order', 'routes file_travel_order');
  assert.ok((await run('file travel')).missing.includes('destination'), 'travel asks for destination');

  // 9. Handlers execute against injected services (params supplied directly).
  const ot = await A.ACTIONS.file_overtime.run({ userInfo: emp, params: { hours: 3, reason: 'system cutover' }, deps });
  assert.ok(/3 hour/.test(ot.reply) && calls.some((c) => c[0] === 'ot' && c[2] === 3), 'overtime handler files via service');
  const tr = await A.ACTIONS.file_travel_order.run({ userInfo: emp, params: { destination: 'Manila', purpose: 'training', date: '2026-08-01' }, deps });
  assert.ok(/Manila/.test(tr.reply) && calls.some((c) => c[0] === 'travel' && c[2] === 'Manila'), 'travel handler files via service');

  // 10. EPASS: routes, confirms, and runs via the injected service.
  assert.strictEqual(A.deterministicSelect('request an epass for finance department').action, 'submit_epass', 'routes submit_epass');
  const epassPending = await run('request a gate pass for finance department');
  assert.ok(epassPending.needsConfirmation, 'epass request waits for confirmation');
  const epassDone = await run('request a gate pass for finance department', { confirmed: true });
  assert.ok(epassDone.done && /EP-TEST-4/.test(epassDone.reply), 'confirmed epass request executes');
  assert.ok(calls.some((c) => c[0] === 'epass' && c[2] === 'finance'), 'epass handler called with department');
  // "generate epass report" must NOT be hijacked as a filing action (no FILE_VERB).
  assert.strictEqual(A.deterministicSelect('generate epass report').action, null, '"generate...report" is not a filing verb');

  // 11. LLM-assisted routing: catches phrasing the deterministic router can't,
  // and rejects a model echoing back the literal "YYYY-MM-DD" placeholder
  // instead of a real resolved date (today's real bug, caught against live Ollama).
  const fuzzyLLM = async () => JSON.stringify({
    action: 'file_leave', params: { leave_type: 'Vacation Leave', date_from: 'YYYY-MM-DD', date_to: 'YYYY-MM-DD' },
  });
  const fuzzy = await run('I need a couple days off next Monday', { options: { useLLM: true, llmCall: fuzzyLLM } });
  assert.ok(fuzzy.needsInput && fuzzy.missing.includes('date_from'), 'LLM understood "leave" intent from fuzzy phrasing, but garbage placeholder dates are rejected and asked for instead of accepted');

  const realDateLLM = async () => JSON.stringify({
    action: 'file_leave', params: { leave_type: 'Vacation Leave', date_from: '2026-08-03', date_to: '2026-08-04' },
  });
  const real = await run('I need a couple days off next Monday', { options: { useLLM: true, llmCall: realDateLLM } });
  assert.ok(real.needsConfirmation && /2026-08-03/.test(real.reply), 'a real resolved date from the LLM is accepted');

  // 12. Missing-param preview never leaks "undefined"/"null" into the reply text.
  const missingDest = await run('file travel', { options: { useLLM: false } });
  assert.ok(!/undefined|null/.test(missingDest.reply), `"still need" preview must not say undefined/null: ${missingDest.reply}`);

  // 13. Real production bug (2026-07-29): a small local model classified "generate
  // excel fuel report for the month of june all department" as file_travel_order
  // (destination "Fuel Report", date 2026-06-01) — pure hallucination, SAM tried to
  // confirm filing a travel order instead of generating the report the user asked
  // for. A report-shaped message must never become a WRITE action, no matter what
  // the model picked.
  const hallucinatingLLM = async () => JSON.stringify({
    action: 'file_travel_order', params: { destination: 'Fuel Report', purpose: null, date: '2026-06-01' },
  });
  const reportMsg = await A.selectAction(
    'generate excel fuel report for the month of june all department',
    { useLLM: true, llmCall: hallucinatingLLM }
  );
  assert.strictEqual(reportMsg.action, null, 'a report-shaped request is never hijacked into a WRITE action, even if the LLM hallucinates one');
  // Guard rail must not break legit fuzzy LLM routing for non-report messages (test 11 above).
  const stillWorks = await A.selectAction(
    'I need a couple days off next Monday',
    { useLLM: true, llmCall: async () => JSON.stringify({ action: 'file_leave', params: { leave_type: 'Vacation Leave', date_from: '2026-08-03', date_to: '2026-08-04' } }) }
  );
  assert.strictEqual(stillWorks.action, 'file_leave', 'the report-request guard does not block legitimate non-report fuzzy routing');

  console.log('OK — SAM action agent self-check passed (6 actions: route + authorize + confirm + run + guard + LLM-assist sanitization)');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
