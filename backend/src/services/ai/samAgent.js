/**
 * SAM data-generation agent (Node).
 *
 * Given an employee's message, the agent:
 *   1. decides whether they want a generated data file (a report),
 *   2. extracts WHAT to build — scope (module), format, and date range,
 *   3. fetches the rows and renders a real .xlsx / .svg, returning a warm reply
 *      plus an attachment descriptor.
 *
 * Intelligence is a hybrid: when a provider is configured it asks the LLM to
 * return structured intent JSON (tool-use style), then backfills any missing
 * field from the deterministic word-boundary router — so it degrades gracefully
 * when the model is offline or replies with junk.
 *
 * Data access and file persistence are INJECTED (`fetchRows`, `saveFile`) so the
 * agent is DB/FS-agnostic and unit-testable; the messenger route wires the real
 * MySQL data source + uploads writer.
 */
const router = require('./reportRouter');
const files = require('./reportFiles');
const providers = require('./providers');
const guards = require('./guards');

const VALID_SCOPES = new Set([
  'all_data', 'dtr', 'dtr_late', 'fuel', 'epass', 'leave', 'travel',
  'it_joborder', 'materials', 'status_report', 'turnover', 'billing',
  'soa', 'membership', 'employees', 'summary',
]);

const SCOPE_LABEL = {
  all_data: 'All Data', dtr: 'DTR Attendance', dtr_late: 'DTR Late',
  fuel: 'Fuel', epass: 'EPASS', leave: 'Leave', travel: 'Travel Orders',
  it_joborder: 'IT Job Orders', materials: 'Warehouse Materials',
  status_report: 'Status Report', turnover: 'Turnover', billing: 'Billing',
  soa: 'Statement of Account', membership: 'Membership', employees: 'Employees',
  summary: 'Summary',
};

// ── upgrade helpers: format/date signals + topic memory ─────────────────────
const FORMAT_RE = /\b(excel|xls|xlsx|spreadsheet|csv|image|picture|photo|larawan|pdf|table|talaan|lamesa)\b/i;
const DATE_RE = /\b(today|yesterday|this week|last week|this month|last month|this year|last year|ngayon|kahapon|(?:last|past)\s+\d+\s+\w+|20\d{2}-\d{2}-\d{2}|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t)?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;
const CUE_RE = /\b(now|same|again|also|instead|how about|what about|as (an )?(image|picture|excel|pdf)|ulit|usab|balik|ngayon|pareho|ganon din|gawin mong)\b/i;

const mentionsFormat = (m) => FORMAT_RE.test(m);
const hasDateSignal = (m) => DATE_RE.test(m);

/** A short message that only tweaks a prior report ("now May", "as image", "ulit"). */
function isShortFollowUp(message) {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  return words <= 8 && (CUE_RE.test(message) || hasDateSignal(message));
}

/**
 * Topic memory: find the most recent prior USER report request in the
 * conversation and return its scope/format/dates so a terse follow-up can
 * inherit them. `history` is prior turns (oldest-first), each { role, content }
 * (role 'user'|'assistant'); the current message is NOT included.
 */
function carryTopicContext(history = []) {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn || turn.role !== 'user') continue;
    const text = String(turn.content || '');
    if (!router.looksLikeReportRequest(text)) continue;
    const [dateFrom, dateTo] = router.reportDateRange(text);
    return { scope: router.reportScope(text), format: router.reportFormat(text), dateFrom, dateTo };
  }
  return {};
}

/** Deterministic intent purely from the router — the always-available fallback. */
function deterministicIntent(message) {
  const [dateFrom, dateTo] = router.reportDateRange(message);
  return {
    is_report: router.looksLikeReportRequest(message),
    scope: router.reportScope(message),
    format: router.reportFormat(message),
    date_from: dateFrom,
    date_to: dateTo,
  };
}

const INTENT_PROMPT =
  'You are SAM\'s request router for SAMELCO II. Read the employee message and output ONLY a compact JSON object, no prose:\n' +
  '{"is_report": boolean, "scope": one of ' +
  '["all_data","dtr","dtr_late","fuel","epass","leave","travel","it_joborder","materials","status_report","turnover","billing","soa","membership","employees","summary"], ' +
  '"format": "excel"|"image"|"table"|"pdf", "date_from": "YYYY-MM-DD"|null, "date_to": "YYYY-MM-DD"|null}\n' +
  'Use "table" when they ask for a table / talaan shown in chat. ' +
  'is_report is true only when they want a GENERATED data file/report. Pick the single best scope. Use null dates when unsure. Output JSON only.';

/**
 * Resolve intent. When a provider is configured, ask the LLM for structured
 * intent and backfill missing/invalid fields from the deterministic router.
 * `llmCall` is injectable for tests; pass `useLLM:false` to skip the model.
 */
async function extractIntent(message, { useLLM = true, llmCall = providers.callConfiguredAI } = {}) {
  const base = deterministicIntent(message);
  if (!useLLM || !providers.isConfigured()) return base;

  try {
    const raw = await llmCall(INTENT_PROMPT, [{ role: 'user', content: String(message) }]);
    const match = String(raw).match(/\{[\s\S]*\}/);
    if (!match) return base;
    const parsed = JSON.parse(match[0]);

    const scope = VALID_SCOPES.has(parsed.scope) ? parsed.scope : base.scope;
    const format = ['excel', 'image', 'table', 'pdf'].includes(parsed.format) ? parsed.format : base.format;
    const dateRe = /^20\d{2}-\d{2}-\d{2}$/;
    return {
      is_report: typeof parsed.is_report === 'boolean' ? parsed.is_report : base.is_report,
      scope,
      format,
      date_from: dateRe.test(parsed.date_from) ? parsed.date_from : base.date_from,
      date_to: dateRe.test(parsed.date_to) ? parsed.date_to : base.date_to,
    };
  } catch (_err) {
    return base; // model offline / bad JSON — deterministic intent still works
  }
}

/** Fetch + render + save one scope's report file. Used by single and multi paths. */
async function renderScope({ scope, format, dateFrom, dateTo, userInfo, fetchRows, saveFile }) {
  const rows = (await fetchRows({ scope, dateFrom, dateTo, userInfo })) || [];
  let fmt = format;
  if (fmt === 'image' && rows.length > 30) fmt = 'excel'; // too many rows for a clear image
  if (fmt === 'table' || fmt === 'pdf') fmt = 'excel';    // multi/PDF fall back to Excel
  const title = reportTitle(scope, dateFrom, dateTo);
  let content;
  let ext;
  let type;
  if (fmt === 'image') {
    content = files.reportImageContent(title, rows); ext = 'svg'; type = 'image';
  } else {
    content = files.reportXlsxContent(title, rows); ext = 'xlsx'; type = 'file';
  }
  const fileName = `sam_report_${scope}_${tsName()}_${rand4()}.${ext}`;
  const saved = await saveFile(fileName, content);
  return {
    count: rows.length,
    format: fmt,
    title,
    attachment: { type, url: saved.url, file_name: fileName, file_size: saved.size ?? null },
  };
}

function reportTitle(scope, dateFrom, dateTo) {
  const label = SCOPE_LABEL[scope] || 'Report';
  const period = dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`;
  return `SAMELCO II ${label} Report (${period})`;
}

function rand4() {
  return Math.floor(1000 + Math.random() * 9000);
}
function tsName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Intent + topic-memory resolution — the same follow-up logic runReportAgent
 * uses, extracted so a caller with its own fetch/save wiring (e.g.
 * samOrchestrator's stepGenerateReport) can reuse the multi-report/topic-memory
 * smarts without adopting this file's fetchRows/saveFile contract.
 *
 * Pass { useLLM: true, llmCall } to let the model catch phrasing the
 * deterministic keyword router can't (e.g. "I need a couple days off next
 * Monday" has no report keyword at all) — extractIntent() already backfills
 * from the deterministic router when the model is unavailable or replies junk,
 * so this degrades safely either way. Omit options (or useLLM: false) for the
 * original zero-LLM-cost behavior.
 */
async function resolveIntentWithMemory(message, history = [], options = {}) {
  // extractIntent()'s OWN default is useLLM:true — override that here so a
  // caller passing no options at all keeps the original zero-LLM-cost behavior.
  const intent = await extractIntent(message, { useLLM: false, ...options });
  const carry = carryTopicContext(history);
  const followUp = isShortFollowUp(message) && !!carry.scope;

  if (!intent.is_report && followUp) {
    intent.is_report = true;
    intent.scope = carry.scope;
  }
  if (intent.is_report && followUp) {
    if (intent.scope === 'summary') intent.scope = carry.scope;
    if (!mentionsFormat(message) && carry.format) intent.format = carry.format;
    if (!hasDateSignal(message) && carry.dateFrom) {
      intent.date_from = carry.dateFrom;
      intent.date_to = carry.dateTo;
    }
  } else if (intent.is_report && intent.scope === 'summary' && carry.scope) {
    intent.scope = carry.scope;
  }
  return intent;
}

/**
 * Run the agent.
 *   fetchRows({ scope, dateFrom, dateTo, userInfo }) -> Promise<Array<Object>>
 *   saveFile(fileName, contentBufferOrString) -> Promise<{ url, size }>
 * Returns { handled:false } when the message is not a report request, else
 * { handled:true, reply, attachment, intent, count }.
 */
async function runReportAgent({ message, userInfo = {}, fetchRows, saveFile, history = [], options = {} }) {
  // ── Guardrail: SAM never mutates records from chat ──
  if (guards.requestsBlockedWrite(message)) {
    return {
      handled: true,
      restricted: true,
      reply:
        '**Restricted:** Hindi po ako pwedeng mag-delete, mag-update, o mag-modify ng records dito sa chat — read-only lang ang reports. 😊\n' +
        'Action: Gamitin po ang tamang module screen at authorized workflow para sa mga pagbabago.',
    };
  }

  const intent = await extractIntent(message, options);

  // ── Topic memory: let a terse follow-up inherit the prior report's topic ──
  const carry = carryTopicContext(history);
  const followUp = isShortFollowUp(message) && !!carry.scope;
  if (!intent.is_report && followUp) {
    intent.is_report = true;          // "now May" / "as image" after a report = a report
    intent.scope = carry.scope;
  }
  if (intent.is_report && followUp) {
    if (intent.scope === 'summary') intent.scope = carry.scope;
    if (!mentionsFormat(message) && carry.format) intent.format = carry.format;
    if (!hasDateSignal(message) && carry.dateFrom) {
      intent.date_from = carry.dateFrom;
      intent.date_to = carry.dateTo;
    }
  } else if (intent.is_report && intent.scope === 'summary' && carry.scope) {
    intent.scope = carry.scope;       // missing module, but the thread had one
  }

  if (!intent.is_report) return { handled: false, intent };

  // ── Guardrail: org-wide reports require elevated privilege (6–10) ──
  if (guards.wantsAllEmployees(message) && !guards.hasFullDataAccess(userInfo)) {
    return {
      handled: true,
      restricted: true,
      intent,
      reply:
        '**Restricted:** Ang all-employee reports po ay para lang sa privilege 6 to 10 (department heads, managers, admins). 😊\n' +
        'Action: Pwede ko pong gawan ng report ang inyong sariling records lamang.',
    };
  }

  // ── Multi-report: "fuel and dtr for April" → one file per module ──
  // Require an explicit conjunction so "employee fuel report" stays a single
  // fuel report (one subject + its people), not two separate files.
  const hasConjunction = /\b(and|plus|at|tapos|saka|pati|as well as)\b|[,&]/i.test(message);
  const scopes = router.allScopes(message);
  if (scopes.length > 1 && hasConjunction && intent.format !== 'table') {
    const lines = [];
    const attachments = [];
    for (const scope of scopes) {
      const r = await renderScope({
        scope, format: intent.format, dateFrom: intent.date_from, dateTo: intent.date_to,
        userInfo, fetchRows, saveFile,
      });
      attachments.push(r.attachment);
      lines.push(`• **${SCOPE_LABEL[scope] || scope}** — ${r.count} record(s) (${r.attachment.file_name})`);
    }
    return {
      handled: true,
      multi: true,
      intent: { ...intent, scopes },
      reply:
        `Of course! I prepared ${scopes.length} reports for you — happy to help! 😊\n\n` +
        `${lines.join('\n')}\n\n**Period:** ${intent.date_from} to ${intent.date_to}\n` +
        'All files are attached below. Let me know kung may kailangan pa kayo! 🌟',
      attachments,
    };
  }

  // ── Clarify instead of guessing when the module is still unknown ──
  if (intent.scope === 'summary') {
    return {
      handled: true,
      needsClarification: true,
      intent,
      reply:
        'Masaya akong tumulong! 😊 Aling report po ang kailangan ninyo — ' +
        '**DTR, Fuel, EPASS, Leave, Travel, IT, Warehouse, Billing, SOA, Membership,** o **Employees**? ' +
        'Sabihin nyo lang ang module at petsa, gagawin ko agad! 🌟',
    };
  }

  const rows = (await fetchRows({
    scope: intent.scope,
    dateFrom: intent.date_from,
    dateTo: intent.date_to,
    userInfo,
  })) || [];

  // Many rows don't render legibly as an image — fall back to Excel.
  let format = intent.format;
  if (format === 'image' && rows.length > 30) format = 'excel';

  const title = reportTitle(intent.scope, intent.date_from, intent.date_to);

  // ── Table mode: a real in-chat table (every row) + the complete Excel ──
  if (format === 'table') {
    const fileName = `sam_report_${intent.scope}_${tsName()}_${rand4()}.xlsx`;
    const saved = await saveFile(fileName, files.reportXlsxContent(title, rows));
    const note = rows.length
      ? `Showing all ${rows.length} record(s). The attached Excel has every column.`
      : 'No records found for this period.';
    return {
      handled: true,
      isTable: true,
      intent: { ...intent, format },
      count: rows.length,
      // The frontend renders a message that IS exactly the [SAM_TABLE] block.
      reply: files.buildSamTable(title, rows, { note }),
      attachment: { type: 'file', url: saved.url, file_name: fileName, file_size: saved.size ?? null },
    };
  }

  let content;
  let ext;
  let type;
  if (format === 'image') {
    content = files.reportImageContent(title, rows);
    ext = 'svg';
    type = 'image';
  } else {
    content = files.reportXlsxContent(title, rows); // pdf not yet ported → Excel
    ext = 'xlsx';
    type = 'file';
  }

  const fileName = `sam_report_${intent.scope}_${tsName()}_${rand4()}.${ext}`;
  const saved = await saveFile(fileName, content);

  const count = rows.length;
  const formatLabel = format === 'image' ? 'SVG image' : 'Excel file';
  const countNote = count === 0
    ? 'No records were found for this period — the file is still attached.'
    : `**${count} record${count === 1 ? '' : 's'}** found.`;

  const reply =
    `Of course! Here is your **${(SCOPE_LABEL[intent.scope] || 'report').toUpperCase()}** report — happy to help! 😊\n\n` +
    `**Report:** ${title}\n` +
    `**Period:** ${intent.date_from} to ${intent.date_to}\n` +
    `**Records:** ${countNote}\n` +
    `**Format:** ${formatLabel}\n\n` +
    `I attached the ${formatLabel} below. Let me know if you need a different date range, format, or module — I'm always here to help! 🌟\n` +
    `Download: ${saved.url}`;

  return {
    handled: true,
    intent: { ...intent, format },
    count,
    reply,
    attachment: {
      type,
      url: saved.url,
      file_name: fileName,
      file_size: saved.size ?? null,
    },
  };
}

module.exports = {
  runReportAgent,
  extractIntent,
  deterministicIntent,
  resolveIntentWithMemory,
  reportTitle,
  mentionsFormat,
  VALID_SCOPES,
};
