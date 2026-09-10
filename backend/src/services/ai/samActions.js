/**
 * SAM action agent — lets SAM DO things for an employee, not just read/report.
 *
 * Flow for every message:
 *   1. select  — LLM (tool-use) picks an action + params; deterministic keyword
 *                router backfills / works offline.
 *   2. authorize — hard block on destructive verbs (delete/drop) + privilege gate.
 *   3. validate  — required params present? else ask for the missing ones.
 *   4. confirm   — any WRITE action pauses for a yes/no before it runs.
 *   5. run       — execute the handler, return a warm reply + an audit descriptor.
 *
 * Handlers receive INJECTED deps ({ meService, fuelService, db }) so the whole
 * agent is unit-testable with no DB and no LLM (see samActions.selfcheck.js).
 *
 * Safety stance: "SAM can do anything the employee asks" == anything the employee
 * is AUTHORIZED to do. Writes are opt-in per action, gated, confirmed, and audited —
 * they never bypass an approval workflow (a filed leave is still status=pending).
 */
const guards = require('./guards');

// ── Action registry ─────────────────────────────────────────────────────────
// write:true  → requires an explicit confirm step before running.
// minPrivilege→ from guards (1 = own records; 6+ = dept/org). Self-service = 1.
const ACTIONS = {
  my_summary: {
    write: false,
    minPrivilege: 1,
    params: [],
    describe: () => 'show your own DTR, leave balance, and fuel this month',
    run: async ({ userInfo, deps }) => {
      const s = await deps.meService.buildMySummary(userInfo.usercode);
      if (!s) return { reply: 'I could not find your employee record. 😔' };
      return {
        reply:
          `Here's your month so far, ${s.employee.name}! 😊\n` +
          `• DTR: ${s.dtr.days_with_records} day(s) on record, ${s.dtr.late_days} late, ${s.dtr.early_out_days} early-out\n` +
          `• Leave balance: VL ${s.leave.vacation_leave} · SL ${s.leave.sick_leave} · OL ${s.leave.other_leave}\n` +
          `• Fuel requested this month: ${s.fuel.requested_this_month} L`,
        data: s,
      };
    },
  },

  submit_fuel: {
    write: true,
    minPrivilege: 1,
    params: [{ name: 'liters', required: true, kind: 'number' }],
    describe: (p) => `submit a fuel request for ${p.liters} liter(s)`,
    run: async ({ userInfo, params, deps }) => {
      const farCode = await deps.fuelService.createFuelRequest(userInfo.usercode, params.liters);
      if (!farCode) return { reply: 'Sorry, the fuel request could not be created. 😔', ok: false };
      return {
        reply: `Done! ✅ Your fuel request for **${params.liters} L** is submitted (ref ${farCode}) and now pending approval.`,
        data: { far_code: farCode },
      };
    },
  },

  file_overtime: {
    write: true,
    minPrivilege: 1,
    params: [
      { name: 'hours', required: true, kind: 'number' },
      { name: 'reason', required: true, kind: 'string' },
    ],
    describe: (p) => `file an overtime request for ${p.hours} hour(s)`,
    run: async ({ userInfo, params, deps }) => {
      const id = await deps.overtimeService.createOvertimeRequest(userInfo.usercode, params.hours, params.reason);
      if (!id) return { reply: 'Sorry, the overtime request could not be filed. 😔', ok: false };
      return { reply: `Filed! ✅ Your overtime request for **${params.hours} hour(s)** is submitted and pending approval.`, data: { id } };
    },
  },

  file_travel_order: {
    write: true,
    minPrivilege: 1,
    params: [
      { name: 'destination', required: true, kind: 'string' },
      { name: 'purpose', required: true, kind: 'string' },
      { name: 'date', required: true, kind: 'date' },
    ],
    describe: (p) => `file a travel order to ${p.destination} on ${p.date}`,
    run: async ({ userInfo, params, deps }) => {
      const toNumber = await deps.travelService.createTravel(userInfo.usercode, {
        department: userInfo.department || '', destination: params.destination, purpose: params.purpose, date: params.date,
      });
      if (!toNumber) return { reply: 'Sorry, the travel order could not be filed. 😔', ok: false };
      return { reply: `Filed! ✅ Your travel order to **${params.destination}** (${params.date}) is submitted (ref ${toNumber}), pending approval.`, data: { to_number: toNumber } };
    },
  },

  submit_epass: {
    write: true,
    minPrivilege: 1,
    params: [{ name: 'department', required: true, kind: 'string' }],
    describe: (p) => `submit a gate pass for ${p.department}${p.passenger ? ` (${p.passenger})` : ''}`,
    // ponytail: uses epassService.createEpass's simple single-request path (no
    // `people` array) — the multi-person/approver-routing path stays module-only,
    // too many required fields for a chat one-liner to be worth it yet.
    run: async ({ userInfo, params, deps }) => {
      const epassNumber = await deps.epassService.createEpass(userInfo.usercode, {
        department: params.department, weight: params.weight || null, passenger: params.passenger || '',
      });
      if (!epassNumber) return { reply: 'Sorry, the gate pass could not be created. 😔', ok: false };
      return {
        reply: `Done! ✅ Your gate pass for **${params.department}** is submitted (ref ${epassNumber}) and now pending approval.`,
        data: { epass_number: epassNumber },
      };
    },
  },

  file_leave: {
    write: true,
    minPrivilege: 1,
    params: [
      { name: 'leave_type', required: true, kind: 'string' },
      { name: 'date_from', required: true, kind: 'date' },
      { name: 'date_to', required: true, kind: 'date' },
    ],
    describe: (p) => `file a ${p.leave_type} from ${p.date_from} to ${p.date_to}`,
    // ponytail: mirrors routes/leave.js POST /request (same tbleave insert) rather than
    // extracting a shared leaveService — one query, not worth a new module yet.
    run: async ({ userInfo, params, deps }) => {
      const res = await deps.db.execute(
        `INSERT INTO tbleave (trackingNo, empID, NAME, Position, datafrom, dateto, remarks, Status, datecreated)
         VALUES (?, ?, ?, ?, ?, ?, ?, '1', CURDATE())`,
        [`LV-${Date.now()}`, userInfo.usercode, userInfo.name || userInfo.usercode,
          userInfo.position || '', params.date_from, params.date_to, params.reason || params.leave_type]
      );
      if (!res.affectedRows) return { reply: 'Sorry, the leave request could not be filed. 😔', ok: false };
      return {
        reply: `Filed! ✅ Your **${params.leave_type}** (${params.date_from} → ${params.date_to}) is submitted and pending approval.`,
        data: { affectedRows: res.affectedRows },
      };
    },
  },
};

// ── Deterministic selector (offline fallback + param backfill) ───────────────
const { looksLikeReportRequest } = require('./reportRouter');

const firstNumber = (m) => { const x = m.match(/\d+(?:\.\d+)?/); return x ? Number(x[0]) : null; };
const isoDates = (m) => m.match(/20\d{2}-\d{2}-\d{2}/g) || [];

// Ang bawat write-action ay may sariling "kailangang-narito" na salita sa mensahe —
// pinagbabahaginan ito ng deterministicSelect() AT ng selectAction()'s LLM sanity-check
// (huwag hayaang dumaan ang isang action na hindi naman totoong tinutukoy sa mensahe).
const ACTION_KEYWORDS = {
  submit_fuel: /\b(fuel|gas|gasoline|diesel|petrol)\b/,
  file_overtime: /\b(overtime|ot)\b/,
  file_travel_order: /\btravel\b/,
  submit_epass: /\b(epass|e-pass|gate\s*pass|exit\s*pass)\b/,
  file_leave: /\b(leave|vacation|sick|absen(t|ce))\b/,
};

function deterministicSelect(message) {
  const m = String(message || '').toLowerCase();
  const dates = isoDates(String(message || ''));

  const FILE_VERB = /\b(request|submit|apply|file|need|want|pahingi|kailangan|magfile|mag-file|magrequest)\b/;
  if (ACTION_KEYWORDS.submit_fuel.test(m) && FILE_VERB.test(m)) {
    return { action: 'submit_fuel', params: { liters: firstNumber(m) } };
  }
  if (ACTION_KEYWORDS.file_overtime.test(m) && FILE_VERB.test(m)) {
    return { action: 'file_overtime', params: { hours: firstNumber(m), reason: null } };
  }
  if (ACTION_KEYWORDS.file_travel_order.test(m) && FILE_VERB.test(m)) {
    return { action: 'file_travel_order', params: { destination: null, purpose: null, date: dates[0] || null } };
  }
  if (ACTION_KEYWORDS.submit_epass.test(m) && FILE_VERB.test(m)) {
    const deptMatch = m.match(/\bfor\s+(?:the\s+)?([a-z][a-z\s]*?)(?:\s+department|\s+dept)?$/i);
    return { action: 'submit_epass', params: { department: deptMatch ? deptMatch[1].trim() : null } };
  }
  if (ACTION_KEYWORDS.file_leave.test(m) && FILE_VERB.test(m)) {
    const leave_type = /\bsick\b/.test(m) ? 'Sick Leave' : (/\bvacation\b/.test(m) ? 'Vacation Leave' : 'Leave');
    return { action: 'file_leave', params: { leave_type, date_from: dates[0] || null, date_to: dates[1] || dates[0] || null } };
  }
  if (/\bmy\b.*\b(dtr|attendance|late|leave|balance|fuel|record|summary)\b|how many.*(late|leave)|(balance|record|dtr)\s+ko\b/.test(m)) {
    return { action: 'my_summary', params: {} };
  }
  return { action: null, params: {} };
}

function selectPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are SAM's action router for SAMELCO II. Today's date is ${today} — resolve relative dates ("next Monday", "tomorrow") against it. Pick ONE action the employee wants and output ONLY compact JSON:\n` +
    '{"action": "my_summary"|"submit_fuel"|"file_overtime"|"file_travel_order"|"submit_epass"|"file_leave"|null, "params": {…}}\n' +
    'my_summary: their own DTR/leave/fuel this month (no params).\n' +
    'submit_fuel: params {"liters": number}.\n' +
    'file_overtime: params {"hours": number, "reason": string}.\n' +
    'file_travel_order: params {"destination": string, "purpose": string, "date": "YYYY-MM-DD"}.\n' +
    'submit_epass: params {"department": string, "passenger": string (optional), "weight": number (optional)}.\n' +
    'file_leave: params {"leave_type": "Sick Leave"|"Vacation Leave"|"Leave", "date_from":"YYYY-MM-DD", "date_to":"YYYY-MM-DD"}.\n' +
    'Dates MUST be real resolved calendar dates in YYYY-MM-DD form — never output the literal string "YYYY-MM-DD".\n' +
    'Use null when the message is a general question or a report request (handled elsewhere). JSON only.';
}

const REAL_DATE_RE = /^20\d{2}-\d{2}-\d{2}$/;

/** Drop any param value that isn't a real, resolved value — a model echoing back a format placeholder like "YYYY-MM-DD" must not reach a handler as if it were real. */
function sanitizeParams(action, params) {
  const clean = {};
  for (const def of ACTIONS[action]?.params || []) {
    const value = params[def.name];
    if (value === null || value === undefined || value === '') continue;
    if (def.kind === 'date' && !REAL_DATE_RE.test(String(value))) continue;
    if (def.kind === 'number' && !Number.isFinite(Number(value))) continue;
    clean[def.name] = value;
  }
  // Non-schema/free-text params (e.g. leave_type) pass through as-is.
  for (const [key, value] of Object.entries(params)) {
    if (!(key in clean) && !ACTIONS[action]?.params?.some((p) => p.name === key)) clean[key] = value;
  }
  return clean;
}

async function selectAction(message, { useLLM = true, llmCall } = {}) {
  const base = deterministicSelect(message);
  if (!useLLM || !llmCall) return base;
  try {
    const raw = await llmCall(selectPrompt(), [{ role: 'user', content: String(message) }]);
    const match = String(raw).match(/\{[\s\S]*\}/);
    if (!match) return base;
    const parsed = JSON.parse(match[0]);
    if (!ACTIONS[parsed.action]) return base;
    // Real bug caught in production: a small local model classified "generate excel
    // fuel report for the month of june" as file_travel_order (destination "Fuel
    // Report", date 2026-06-01) — pure hallucination, the message never asked to file
    // anything. NB: an earlier, stricter version of this guard (require the action's
    // own keyword literally in the message) also broke legit fuzzy phrasing like "I
    // need a couple days off next Monday" -> file_leave, which is the whole point of
    // LLM-assisted routing. looksLikeReportRequest() is the right signal instead: a
    // message that reads as "give me a report/file" should never become a WRITE
    // action, regardless of which action the model picked.
    if (looksLikeReportRequest(message)) return base;
    // Merge: trust sanitized LLM params, fall back to deterministic where LLM left blanks/junk.
    const sanitized = sanitizeParams(parsed.action, parsed.params || {});
    return { action: parsed.action, params: { ...base.params, ...sanitized } };
  } catch {
    return base;
  }
}

// ── Authorize / validate ─────────────────────────────────────────────────────
function authorize(actionName, message, userInfo) {
  if (guards.requestsBlockedWrite(message)) {
    return { ok: false, reason: 'restricted', reply: '**Restricted:** I can\'t delete or modify records from chat — that must go through the proper module. 😊' };
  }
  const def = ACTIONS[actionName];
  const priv = Math.max(0, ...String(userInfo.privilage ?? '').split(/[^0-9]+/).filter(Boolean).map(Number), 1);
  if (priv < def.minPrivilege) {
    return { ok: false, reason: 'privilege', reply: `**Restricted:** That action needs privilege ${def.minPrivilege}+. 😊` };
  }
  return { ok: true };
}

function missingParams(actionName, params) {
  return ACTIONS[actionName].params
    .filter((p) => p.required && (params[p.name] === null || params[p.name] === undefined || params[p.name] === ''))
    .map((p) => p.name);
}

/** Fills missing/null values with a neutral placeholder so describe() never renders "to undefined"/"to null" in the "still need X" preview. */
function describableParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, (value === null || value === undefined || value === '') ? '___' : value])
  );
}

/**
 * Main entry. Returns one of:
 *   { handled:false }                        — not an action; let report/chat agent take it
 *   { handled:true, restricted:true, reply } — blocked by guard/privilege
 *   { handled:true, needsInput:true, missing, reply }
 *   { handled:true, needsConfirmation:true, action, params, reply }   (writes)
 *   { handled:true, done:true, reply, data, audit }
 */
async function handleMessage({ message, userInfo = {}, confirmed = false, deps, options = {} }) {
  const { action, params } = await selectAction(message, options);
  if (!action) return { handled: false };

  const auth = authorize(action, message, userInfo);
  if (!auth.ok) return { handled: true, restricted: true, reason: auth.reason, reply: auth.reply };

  const missing = missingParams(action, params);
  if (missing.length) {
    return {
      handled: true,
      needsInput: true,
      action,
      missing,
      reply: `Almost there! To ${ACTIONS[action].describe(describableParams(params))} I still need: **${missing.join(', ')}**. 😊`,
    };
  }

  const def = ACTIONS[action];
  if (def.write && !confirmed) {
    return {
      handled: true,
      needsConfirmation: true,
      action,
      params,
      reply: `Just to confirm — you want me to ${def.describe(params)}? Reply **yes** to proceed. 😊`,
    };
  }

  const result = await def.run({ userInfo, params, deps });
  return {
    handled: true,
    done: true,
    action,
    reply: result.reply,
    data: result.data ?? null,
    // Caller persists this to ai_audit_log (write actions especially).
    audit: {
      action,
      write: def.write,
      usercode: userInfo.usercode || '',
      params,
      ok: result.ok !== false,
    },
  };
}

module.exports = { ACTIONS, selectAction, deterministicSelect, authorize, missingParams, handleMessage };
