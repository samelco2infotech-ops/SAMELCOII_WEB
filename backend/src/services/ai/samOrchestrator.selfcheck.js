/**
 * End-to-end self-check ng samOrchestrator.handleMessage().
 *
 * Sinusubok na TAMA ANG RUTA: napupunta ba ang bawat uri ng tanong sa tamang handler,
 * at gumagana ba ang privilege gate. Ginagamitan ng STUB na LLM — walang tunay na tawag
 * sa Groq/Gemini (walang gastos, walang network).
 *
 * PATAKBUHIN: node src/services/ai/samOrchestrator.selfcheck.js
 */

const db = require('../../config/database');
const orch = require('./samOrchestrator');
const { reportPdfContent, reportXlsxContent } = require('./reportFiles');
const { clearReportRowsCache } = require('./reportRows');
// Ang SAM tables (brain/audit/notices) ay nasa `messenger` DB — hindi sa it_program.
const { sam } = require('./samDb');

// Stub LLM: hindi tumatawag sa labas; ibinabalik ang isang kilalang teksto.
const STUB_REPLY = 'This is a stubbed SAM answer about SAMELCO II fuel procedures for testing.';
const stubLLM = async () => STUB_REPLY;

// Stub file builder: hindi nagsusulat sa disk; ibinabalik lang ang metadata.
const stubBuildFile = async ({ title, rows, format }) => ({
  type: format,
  file_name: `${title.replace(/[^a-z0-9]+/gi, '_')}.${format === 'excel' ? 'xlsx' : format}`,
  file_size: format === 'pdf' ? reportPdfContent(title, rows).length : rows.length * 40,
  url: '/uploads/messenger/stub',
});

const CASES = [
  { label: 'notice post (admin)', message: 'Memo: ZZTEST-orch check | body text here', expect: 'handler', expectText: /posted this/i },
  { label: 'dtr specific dates', message: 'who is late on May 9, 18 and 23', expect: 'handler', expectText: /attendance|could not find/i },
  { label: 'fuel report (table)', message: 'fuel report this year', expect: 'handler', expectText: /record\(s\)|No records/i },
  { label: 'fuel report (pdf)', message: 'generate fuel report this year as pdf', expect: 'handler', expectText: /Here is your|No records/i },
  { label: 'analytics', message: 'which department has the highest fuel consumed this year', expect: 'analytics', expectText: /Fuel analytics/i },
  // Karaniwang usapan: ang brain (2,238 natutunang sagot) ang unang sinusuri bago ang LLM.
  // Ang "kumusta ka sam" ay natutunan na, kaya brain ang dapat sumagot — tama iyon at
  // mas mabilis/mas mura kaysa tumawag sa Groq.
  { label: 'known chat -> brain', message: 'kumusta ka sam', expect: 'brain', expectText: /\S/ },
  // Isang tanong na tiyak na WALA sa brain, para masubok ang landas papuntang LLM.
  { label: 'novel chat -> LLM', message: `ZZTEST unique probe ${Date.now()} xyzzy qwerty`, expect: 'llm', expectText: /stubbed SAM answer/i },
];

async function cleanup() {
  clearReportRowsCache(); // isang test run ay hindi dapat makakita ng cached rows mula sa naunang run
  try { await db.queryAll(`DELETE FROM ${sam('sam_public_notices')} WHERE title LIKE ?`, ['ZZTEST-%']); } catch {}
  try { await db.queryAll(`DELETE FROM ${sam('sam_brain')} WHERE question LIKE ?`, ['%ZZTEST%']); } catch {}
  try { await db.queryAll(`DELETE FROM ${sam('ai_audit_log')} WHERE request_text LIKE ?`, ['%ZZTEST%']); } catch {}
  // Ang stub na sagot ay hindi dapat maiwan sa tunay na brain ni SAM.
  try { await db.queryAll(`DELETE FROM ${sam('sam_brain')} WHERE answer = ?`, [STUB_REPLY]); } catch {}
  try { await db.queryAll(`DELETE FROM ${sam('ai_user_prefs')} WHERE user_id = -999`); } catch {}
}

(async () => {
  let pass = 0;
  let fail = 0;
  await cleanup();

  const attendanceXlsx = reportXlsxContent('DTR attendance - 2026-07-20', [
    { Employee: 'Present Test', Department: 'ISD', Status: 'PRESENT' },
    { Employee: 'Late Test', Department: 'ISD', Status: 'LATE' },
    { Employee: 'Absent Test', Department: 'ISD', Status: 'ABSENT' },
  ]);
  const okAttendanceXlsx = ['Present: 1', 'Late: 1', 'Absent: 1', 'FFF0FFF4', 'FFFFFBEB', 'FFFFF5F5']
    .every((marker) => attendanceXlsx.includes(Buffer.from(marker)));
  okAttendanceXlsx ? pass++ : fail++;
  console.log(`  ${okAttendanceXlsx ? 'OK  ' : 'FAIL'}  DTR Excel has totals and status colors`);

  const admin = await db.queryOne('SELECT * FROM usertb WHERE usercode = ? LIMIT 1', ['S2-075']);
  if (!admin) { console.log('S2-075 not found; aborting'); process.exit(1); }

  console.log(`=== routing (user ${admin.usercode}, privilage=${admin.privilage}) ===`);
  for (const c of CASES) {
    let out;
    try {
      out = await orch.handleMessage({
        user: admin, userId: Number(admin.Id) || 0, message: c.message,
        history: [], buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
      });
    } catch (e) {
      console.log(`  FAIL  ${c.label.padEnd(22)} threw: ${e.message.slice(0, 80)}`);
      fail++;
      continue;
    }
    const routeOk = out.source === c.expect;
    const textOk = c.expectText.test(String(out.reply || ''));
    const ok = routeOk && textOk;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${c.label.padEnd(22)} source=${String(out.source).padEnd(9)} ${String(out.reply || '').replace(/\n/g, ' ').slice(0, 52)}`);
    if (!ok) console.log(`        expected source=${c.expect} text=${c.expectText}`);
  }

  console.log('\n=== multi-report + topic memory ===');
  // "fuel and dtr" would collide with the DTR-flexible step, which runs earlier
  // in the pipeline and owns any message mentioning "dtr" — use epass instead,
  // which has no earlier step claiming it, to exercise the multi-report path itself.
  const multi = await orch.handleMessage({
    user: admin, userId: Number(admin.Id) || 0, message: 'generate fuel and epass excel for this year',
    history: [], buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
  });
  const okMulti = /prepared 2 report/i.test(multi.reply) && /fuel/i.test(multi.reply) && /epass/i.test(multi.reply);
  okMulti ? pass++ : fail++;
  console.log(`  ${okMulti ? 'OK  ' : 'FAIL'}  "fuel and epass" -> one message, both modules`);

  const firstReport = await orch.handleMessage({
    user: admin, userId: Number(admin.Id) || 0, message: 'generate fuel excel for april 2026',
    history: [], buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
  });
  const followUpHistory = [{ role: 'user', content: 'generate fuel excel for april 2026' }, { role: 'assistant', content: firstReport.reply }];
  const followUp = await orch.handleMessage({
    user: admin, userId: Number(admin.Id) || 0, message: 'now May',
    history: followUpHistory, buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
  });
  const okFollowUp = followUp.handled !== false && /fuel/i.test(followUp.reply || '') && !/which report/i.test(followUp.reply || '');
  okFollowUp ? pass++ : fail++;
  console.log(`  ${okFollowUp ? 'OK  ' : 'FAIL'}  "now May" after a fuel report inherits fuel scope (no re-asking)`);

  console.log('\n=== user preferences ===');
  const prefUserId = -999; // fake, isolated id — never a real usertb row
  const setPdf = await orch.handleMessage({
    user: admin, userId: prefUserId, message: 'always give me pdf reports',
    history: [], buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
  });
  const okSetPref = /pdf/i.test(setPdf.reply || '') && setPdf.source === 'handler';
  okSetPref ? pass++ : fail++;
  console.log(`  ${okSetPref ? 'OK  ' : 'FAIL'}  "always give me pdf reports" saves a preference`);

  // "give me MY fuel report" collides with the action agent's own-records
  // summary trigger, which runs earlier in the pipeline — epass avoids that.
  const unspecified = await orch.handleMessage({
    user: admin, userId: prefUserId, message: 'generate epass report',
    history: [], buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
  });
  const okAppliedPref = unspecified.attachment?.file_name?.endsWith('.pdf') || unspecified.attachment?.type === 'pdf';
  okAppliedPref ? pass++ : fail++;
  console.log(`  ${okAppliedPref ? 'OK  ' : 'FAIL'}  saved format preference applied when message doesn't say a format (got ${unspecified.attachment?.type})`);

  const cleared = await orch.handleMessage({
    user: admin, userId: prefUserId, message: 'forget my preferences',
    history: [], buildFile: stubBuildFile, llmCall: stubLLM, conversationId: 0,
  });
  const okClear = /cleared/i.test(cleared.reply || '');
  okClear ? pass++ : fail++;
  console.log(`  ${okClear ? 'OK  ' : 'FAIL'}  "forget my preferences" clears the saved preference`);

  console.log('\n=== privilege gate through the orchestrator ===');
  const staff = { ...admin, usercode: 'S2-999', name: 'Low Priv', privilage: '2', bioUID: '' };
  const blockedNotice = await orch.handleMessage({
    user: staff, userId: 0, message: 'Memo: ZZTEST-should be blocked | body',
    buildFile: stubBuildFile, llmCall: stubLLM,
  });
  const okNotice = /only privilege 6 to 10/i.test(blockedNotice.reply || '');
  okNotice ? pass++ : fail++;
  console.log(`  ${okNotice ? 'OK  ' : 'FAIL'}  privilege 2 cannot post a memo`);

  const blockedAnalytics = await orch.handleMessage({
    user: staff, userId: 0, message: 'which department has the highest fuel consumed this year',
    buildFile: stubBuildFile, llmCall: stubLLM,
  });
  const okAnalytics = /\*\*Restricted:\*\*/.test(blockedAnalytics.reply || '');
  okAnalytics ? pass++ : fail++;
  console.log(`  ${okAnalytics ? 'OK  ' : 'FAIL'}  privilege 2 blocked from org-wide analytics`);

  console.log('\n=== reply length safety net ===');
  const short = orch.capReplyLength('Hi Amado!');
  const okShortUnchanged = short === 'Hi Amado!';
  okShortUnchanged ? pass++ : fail++;
  console.log(`  ${okShortUnchanged ? 'OK  ' : 'FAIL'}  short reply passes through untouched`);

  const rambling = 'Hello! '.repeat(300); // simulates a small local model looping
  const capped = orch.capReplyLength(rambling, 900);
  const okCapped = capped.length <= 900 && capped.length > 0;
  okCapped ? pass++ : fail++;
  console.log(`  ${okCapped ? 'OK  ' : 'FAIL'}  runaway reply capped (${rambling.length} -> ${capped.length} chars)`);

  console.log('\n=== audit log written? ===');
  const audits = await db.queryOne(`SELECT COUNT(*) AS n FROM ${sam('ai_audit_log')} WHERE request_text LIKE ?`, ['%ZZTEST%']);
  const okAudit = Number(audits.n) > 0;
  okAudit ? pass++ : fail++;
  console.log(`  ${okAudit ? 'OK  ' : 'FAIL'}  ${audits.n} audit row(s) recorded for test messages`);

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.close?.();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
