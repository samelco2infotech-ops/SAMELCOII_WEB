/**
 * Offline self-check for the SAM AI Node port (no DB, no real network).
 * EDIT GUIDE: Add provider contract checks in the providers section below.
 * HUWAG BAGUHIN: External AI calls stay mocked so this check is repeatable.
 * Tagalog: Sinisiguro nitong tama ang Ollama request nang hindi gumagamit ng live model.
 * Run: node src/services/ai/selfcheck.js   (from the backend dir, so .env loads)
 * Exits non-zero on the first failed assertion.
 */
const assert = require('assert');
const config = require('../../config/env');
const providers = require('./providers');
const aiChatService = require('../aiChatService');
const router = require('./reportRouter');
const files = require('./reportFiles');

// ── providers ────────────────────────────────────────────────────────────────
const rp = providers.resolveProvider();
assert.ok(['ollama', 'groq', 'gemini', 'anthropic'].includes(rp.provider), 'provider resolves');
assert.ok(providers.isConfigured(), 'active provider is configured');
const originalProvider = config.ai.provider;
try {
  config.ai.provider = 'ollama';
  assert.deepStrictEqual(
    aiChatService.getAIConfig(),
    { provider: 'ollama', model: 'llama3:8b', configured: true },
    'public AI config reports Ollama ready without exposing connection details',
  );
} finally {
  config.ai.provider = originalProvider;
}
const merged = providers.mergeConsecutiveRoles([
  { role: 'assistant', content: 'hi' },
  { role: 'user', content: 'a' },
  { role: 'user', content: 'b' },
]);
assert.strictEqual(merged[0].role, 'user', 'history starts with user');
assert.ok(merged.some((m) => m.content === 'a\nb'), 'consecutive same-role merged');

// ── router: the exact misroutes that used to break ──────────────────────────
const routeCases = {
  'generate fuel report for plate number 123': 'fuel',
  'fuel allocation this morning': 'fuel',
  'please make a dtr report': 'dtr',
  'show me the late employees in dtr': 'dtr_late',
  'generate epass report': 'epass',
  'employee fuel report for april': 'fuel',
  'all employee profile list': 'employees',
  'statement of account report': 'soa',
  'reasonable leave request summary': 'leave',
  'give me all records': 'all_data',
  'who is late today': 'dtr_late',
  'random hello there': 'summary',
};
for (const [msg, want] of Object.entries(routeCases)) {
  assert.strictEqual(router.reportScope(msg), want, `scope("${msg}") => ${want}`);
}
assert.strictEqual(router.reportFormat('give me the dtr image'), 'image', 'format image');
assert.strictEqual(router.reportFormat('export to excel'), 'excel', 'format excel');
const [from, to] = router.reportDateRange('report from 2026-04-01 to 2026-04-30');
assert.strictEqual(from, '2026-04-01', 'date from');
assert.strictEqual(to, '2026-04-30', 'date to');

// ── system prompt: structural snapshot ────────────────────────────────────────
// Not a byte-for-byte snapshot (the wording is allowed to improve) — asserts the
// specific behavioral clauses that were ACTUAL bugs this session stay present.
// A prompt edit that silently drops one of these should fail loudly, not ship.
{
  const { buildSystemPrompt } = require('./samPrompt');
  const personal = buildSystemPrompt({ name: 'Amado', privilage: '2' }, '');
  const full = buildSystemPrompt({ name: 'Boss', privilage: '6' }, '');

  assert.ok(/ONE language only/i.test(personal), 'prompt forbids bilingual replies (today\'s duplication bug)');
  assert.ok(/never answer the same thing twice/i.test(personal), 'prompt explicitly bans re-answering in a second language');
  assert.ok(/no more than 50 words/i.test(personal), 'prompt keeps the short-reply budget (paired with providers.js num_predict cap)');
  assert.ok(/## Examples/.test(personal), 'few-shot examples present (small-model drift guard)');
  assert.ok(/NEVER FABRICATE/.test(personal), 'anti-fabrication section present');
  assert.ok(/read-only/i.test(personal), 'reports-are-read-only rule present');
  assert.ok(/PERSONAL \(Privilege 1-5\)/.test(personal) && !/FULL \(Privilege 6-10/.test(personal), 'low-privilege user gets the personal-only access block, not full');
  assert.ok(/FULL \(Privilege 6-10/.test(full) && !/PERSONAL \(Privilege 1-5\)/.test(full), 'high-privilege user gets the full-access block, not personal-only');
}

// ── file builders ────────────────────────────────────────────────────────────
const rows = [
  { Name: 'Juan Dela Cruz Magbanua', Date: '2026-06-24', 'Time In': '07:58 AM', Status: 'Approved', Area: 'Catbalogan Main Office' },
  { Name: 'Maria Lopez', Date: '2026-06-24', 'Time In': '08:31 AM', Status: 'Pending', Area: 'Calbayog' },
  { Name: 'Pedro Reyes', Date: '2026-06-24', 'Time In': '09:10 AM', Status: 'Rejected', Area: 'Gandara' },
];

const xlsx = files.reportXlsxContent('DTR Attendance — June 2026', rows);
assert.ok(Buffer.isBuffer(xlsx) && xlsx.slice(0, 2).toString() === 'PK', 'xlsx is a real zip');
const cols = files.colsXml(Object.keys(rows[0]), rows);
assert.ok(cols.includes('<cols>') && cols.includes('customWidth="1"'), 'cols present');
const widths = [...cols.matchAll(/width="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
assert.ok(Math.max(...widths) >= 23, 'wide column auto-sized');
assert.strictEqual(Math.min(...widths), 5, '# column stays narrow');

const svg = files.reportImageContent('DTR Attendance — June 2026', rows);
assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'well-formed svg');
assert.ok(svg.includes('x="52"'), 'row-number gutter at x=52');
assert.ok(svg.includes('x="88"'), 'first data column at x=88 (no overlap)');
assert.ok(svg.includes('stroke="#e5ecf6"'), 'column separators drawn');
assert.ok(svg.includes('#15803d') && svg.includes('#b45309') && svg.includes('#dc2626'), 'status colors');
assert.ok(svg.includes('height="284"'), 'height tracks row count');
assert.ok(svg.includes('role="img"') && svg.includes('<title id="svgTitle">DTR Attendance'), 'accessible title for screen readers');
assert.ok(svg.includes('<desc id="svgDesc">'), 'accessible desc summarizes the table');

const csv = files.reportCsvContent('DTR Attendance — June 2026', rows);
assert.ok(csv.startsWith('﻿'), 'UTF-8 BOM prefix so Excel/Windows opens it cleanly');
const csvLines = csv.slice(1).split('\r\n');
assert.strictEqual(csvLines.length, rows.length + 1, 'header row + one row per record');
assert.strictEqual(csvLines[0], 'Name,Date,Time In,Status,Area', 'header row matches column order');
assert.ok(csvLines[1].includes('Juan Dela Cruz Magbanua'), 'data row present');
const quotedCsv = files.reportCsvContent('t', [{ Note: 'has, a comma' }]);
assert.ok(quotedCsv.includes('"has, a comma"'), 'fields with commas get quoted');

// ── agent (offline: injected fake LLM, data source, file writer) ─────────────
const agent = require('./samAgent');

const sampleRows = rows; // reuse the DTR-ish rows above
const fakeFetch = async ({ scope }) => (scope === 'employees' ? [] : sampleRows);
const writes = [];
const fakeSave = async (name, content) => {
  writes.push({ name, content });
  return { url: `/uploads/messenger/${name}`, size: Buffer.byteLength(content) };
};

(async () => {
  // Ollama contract with a mocked fetch; no real network request.
  const originalFetch = global.fetch;
  let ollamaRequest;
  try {
    global.fetch = async (url, options) => {
      ollamaRequest = { url: String(url), body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: { content: 'SAM OLLAMA CONNECTED' } }),
      };
    };
    const ollamaReply = await providers._callOllama(
      'http://192.168.2.119:11434',
      'llama3:8b',
      'You are SAM.',
      [{ role: 'user', content: 'Hello' }],
    );
    assert.strictEqual(ollamaReply, 'SAM OLLAMA CONNECTED', 'Ollama reply parsed');
    assert.strictEqual(ollamaRequest.url, 'http://192.168.2.119:11434/api/chat', 'Ollama chat URL');
    assert.strictEqual(ollamaRequest.body.stream, false, 'Ollama non-stream response requested');
    assert.strictEqual(ollamaRequest.body.messages[0].role, 'system', 'Ollama system prompt included');
  } finally {
    global.fetch = originalFetch;
  }

  // ── fallback: primary provider down -> falls through to the next configured one ──
  {
    const originalFetch = global.fetch;
    const originalProvider = config.ai.provider;
    const originalGroqKey = config.ai.groq.apiKey;
    try {
      config.ai.provider = 'ollama'; // primary
      config.ai.groq.apiKey = 'fake-configured-groq-key'; // fallback becomes eligible
      global.fetch = async (url) => {
        if (String(url).includes('11434')) {
          return { ok: false, status: 500, json: async () => ({ error: 'ollama down' }) };
        }
        return {
          ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'GROQ FALLBACK REPLY' } }] }),
        };
      };
      const reply = await providers.callConfiguredAI('You are SAM.', [{ role: 'user', content: 'hi' }]);
      assert.strictEqual(reply, 'GROQ FALLBACK REPLY', 'falls through to groq when ollama fails');
      assert.strictEqual(providers.getLastUsedProvider(), 'groq', 'records which provider actually answered');
    } finally {
      global.fetch = originalFetch;
      config.ai.provider = originalProvider;
      config.ai.groq.apiKey = originalGroqKey;
    }
  }

  // deterministic intent
  const di = agent.deterministicIntent('generate fuel excel for april 2026');
  assert.strictEqual(di.is_report, true, 'detects report request');
  assert.strictEqual(di.scope, 'fuel', 'deterministic scope');
  assert.strictEqual(di.format, 'excel', 'deterministic format');
  assert.strictEqual(di.date_from, '2026-04-01', 'deterministic date_from');

  // LLM intent with an injected model reply; missing dates backfilled by router
  const llmGood = async () => '{"is_report":true,"scope":"dtr","format":"image","date_from":null,"date_to":null}';
  const i2 = await agent.extractIntent('show me dtr as a picture for april 2026', { llmCall: llmGood });
  assert.strictEqual(i2.scope, 'dtr', 'LLM scope honored');
  assert.strictEqual(i2.format, 'image', 'LLM format honored');
  assert.strictEqual(i2.date_from, '2026-04-01', 'null LLM date backfilled from router');

  // garbage model reply → deterministic fallback
  const llmJunk = async () => 'sorry I cannot do that';
  const i3 = await agent.extractIntent('generate epass report', { llmCall: llmJunk });
  assert.strictEqual(i3.scope, 'epass', 'bad JSON falls back to deterministic');

  // non-report message
  const none = await agent.runReportAgent({
    message: 'hello sam how are you', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(none.handled, false, 'chatter is not a report');

  // full report generation (deterministic, no network)
  const out = await agent.runReportAgent({
    message: 'generate fuel excel for april 2026', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(out.handled, true, 'report handled');
  assert.ok(out.attachment.file_name.endsWith('.xlsx'), 'excel file produced');
  assert.ok(out.reply.includes('3 records'), 'reply states record count');
  assert.ok(Buffer.isBuffer(writes[writes.length - 1].content), 'xlsx content is a Buffer');

  // image requested but >30 rows → falls back to excel
  const many = Array.from({ length: 40 }, (_, i) => ({ Name: `Emp ${i}`, Status: 'Approved' }));
  const big = await agent.runReportAgent({
    message: 'fuel picture for april 2026',
    fetchRows: async () => many, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(big.intent.format, 'excel', 'image downgraded to excel for many rows');

  // ── upgrade: clarify when the module is unclear ──
  const clarify = await agent.runReportAgent({
    message: 'generate a report please', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(clarify.handled, true, 'unclear report is handled');
  assert.strictEqual(clarify.needsClarification, true, 'asks instead of guessing');
  assert.ok(!clarify.attachment, 'no file generated while clarifying');

  // ── upgrade: topic memory — terse follow-up inherits prior report ──
  const fuelHistory = [{ role: 'user', content: 'generate fuel excel for april 2026' }];
  const newDate = await agent.runReportAgent({
    message: 'now May 2026', history: fuelHistory, fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(newDate.handled, true, 'date-only follow-up handled');
  assert.strictEqual(newDate.intent.scope, 'fuel', 'follow-up inherits fuel scope');
  assert.strictEqual(newDate.intent.date_from, '2026-05-01', 'follow-up uses the new month');

  const asImage = await agent.runReportAgent({
    message: 'as an image', history: fuelHistory, fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(asImage.intent.scope, 'fuel', 'format follow-up keeps fuel scope');
  assert.strictEqual(asImage.intent.format, 'image', 'switches to image');
  assert.strictEqual(asImage.intent.date_from, '2026-04-01', 'inherits prior April dates');

  // memory must NOT hijack ordinary chatter
  const thanks = await agent.runReportAgent({
    message: 'thank you sam', history: fuelHistory, fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(thanks.handled, false, 'plain thanks is not a report');

  // ── complete real table: in-chat [SAM_TABLE] block (all rows) + Excel ──
  const table = await agent.runReportAgent({
    message: 'generate fuel table for april 2026', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(table.handled, true, 'table request handled');
  assert.strictEqual(table.intent.format, 'table', 'table format chosen');
  assert.ok(table.reply.startsWith('[SAM_TABLE]') && table.reply.trim().endsWith('[/SAM_TABLE]'), 'reply is a SAM_TABLE block');
  const payload = JSON.parse(table.reply.match(/\[SAM_TABLE\]\s*([\s\S]+?)\s*\[\/SAM_TABLE\]/)[1]);
  assert.strictEqual(payload.rows.length, 3, 'table includes every row');
  assert.ok(payload.columns.length >= 1 && payload.columns.length <= 6, 'columns within UI cap');
  assert.ok(table.attachment.file_name.endsWith('.xlsx'), 'complete Excel attached alongside the table');

  // ── guardrail: never mutate records from chat ──
  const del = await agent.runReportAgent({
    message: 'delete all dtr records for april', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(del.restricted, true, 'destructive request refused');
  assert.ok(!del.attachment, 'no file for a blocked write');

  // ── guardrail: org-wide report needs privilege 6–10 ──
  const lowPriv = await agent.runReportAgent({
    message: 'generate all employees fuel report', userInfo: { privilage: '3' },
    fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(lowPriv.restricted, true, 'low privilege blocked from all-employee report');
  const highPriv = await agent.runReportAgent({
    message: 'generate all employees fuel report', userInfo: { privilage: '7' },
    fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.ok(!highPriv.restricted && highPriv.handled, 'privilege 7 allowed');

  // ── multi-report: conjunction → one file per module ──
  const multi = await agent.runReportAgent({
    message: 'generate fuel and dtr excel for april 2026', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.strictEqual(multi.multi, true, 'multi-report triggered by conjunction');
  assert.strictEqual(multi.attachments.length, 2, 'two files for two modules');
  // no false multi without a conjunction
  const single = await agent.runReportAgent({
    message: 'employee fuel report for april 2026', fetchRows: fakeFetch, saveFile: fakeSave, options: { useLLM: false },
  });
  assert.ok(!single.multi && single.intent.scope === 'fuel', 'no conjunction → single fuel report');

  console.log('OK — SAM Node port self-check passed (providers + router + builders + agent + clarify + memory + table + guards + multi)');
})().catch((e) => { console.error('SELF-CHECK FAILED:', e.message); process.exit(1); });
