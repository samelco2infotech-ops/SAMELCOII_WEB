/**
 * SAM report router — Node port of aiReportScope / aiReportFormat /
 * aiReportDateRange from api/ai_history.php. Uses word-boundary keyword scoring
 * (not substring) so "plate"/"this morning"/"reasonable" no longer misroute to
 * the wrong module — the same fix applied on the PHP side.
 */

// ── date helpers (local YYYY-MM-DD, matching PHP date()) ────────────────────
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => new Date();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function hasToken(message, tokens) {
  const lower = message.toLowerCase();
  return tokens.some((t) => new RegExp(`\\b${escapeRe(t.toLowerCase())}\\b`, 'u').test(lower));
}

function countTokenHits(message, tokens) {
  const lower = message.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (new RegExp(`\\b${escapeRe(t.toLowerCase())}\\b`, 'u').test(lower)) hits++;
  }
  return hits;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function monthNumberFromText(message) {
  const lower = message.toLowerCase();
  for (const [name, num] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return num;
  }
  return null;
}

// ── scope ───────────────────────────────────────────────────────────────────
const SCOPE_DEFS = {
  dtr: ['dtr', 'attendance', 'punch', 'time in', 'time out', 'biometric', 'checkinout', 'daily time record'],
  fuel: ['fuel', 'gasoline', 'diesel', 'fuel allocation'],
  epass: ['epass', 'e-pass', 'gate pass', 'exit pass'],
  leave: ['leave', 'vacation leave', 'sick leave', 'official leave'],
  travel: ['travel', 'trip', 'travel order', 'travel history'],
  it_joborder: ['it job', 'job order', 'it report', 'it equipment'],
  materials: ['warehouse', 'material', 'materials', 'inventory', 'stock', 'supplies'],
  status_report: ['status report', 'inspection', 'status inspection'],
  turnover: ['turnover', 'turn over', 'turnover report'],
  billing: ['billing', 'electric bill', 'electricity bill', 'billing report'],
  soa: ['soa', 'statement of account', 'account statement'],
  membership: ['membership', 'consumer', 'cooperative member', 'member record'],
  employees: ['employee', 'employees', 'profile', 'staff', 'personnel', 'headcount'],
};
// Tie-break: a specific module beats the generic "employees" roster.
const SCOPE_PRIORITY = ['epass', 'fuel', 'leave', 'travel', 'dtr', 'it_joborder', 'materials', 'status_report', 'turnover', 'billing', 'soa', 'membership', 'employees'];

function reportScope(message) {
  const lower = message.toLowerCase();
  if (hasToken(lower, ['all data', 'all records', 'all information', 'full data', 'full records', 'complete report', 'all report', 'everything'])) {
    return 'all_data';
  }

  let best = 'summary';
  let bestScore = 0;
  let bestRank = Number.MAX_SAFE_INTEGER;
  for (const [scope, tokens] of Object.entries(SCOPE_DEFS)) {
    const score = countTokenHits(lower, tokens);
    if (score === 0) continue;
    let rank = SCOPE_PRIORITY.indexOf(scope);
    if (rank === -1) rank = 50;
    if (score > bestScore || (score === bestScore && rank < bestRank)) {
      best = scope; bestScore = score; bestRank = rank;
    }
  }

  const isLate = hasToken(lower, ['late', 'lates', 'tardy', 'tardiness', 'dtr late', 'late dtr']);
  if (isLate && (best === 'dtr' || bestScore === 0)) return 'dtr_late';
  return best;
}

/**
 * Every module the message names (for multi-report requests like "fuel and dtr").
 * Returns scopes in priority order; empty when none match. `all_data` short-
 * circuits to a single combined scope.
 */
function allScopes(message) {
  const lower = message.toLowerCase();
  if (hasToken(lower, ['all data', 'all records', 'all information', 'full data', 'full records', 'everything'])) {
    return ['all_data'];
  }
  const hit = [];
  for (const [scope, tokens] of Object.entries(SCOPE_DEFS)) {
    if (countTokenHits(lower, tokens) > 0) hit.push(scope);
  }
  // dtr "late" refinement, consistent with reportScope
  if (hit.includes('dtr') && hasToken(lower, ['late', 'lates', 'tardy', 'tardiness'])) {
    hit[hit.indexOf('dtr')] = 'dtr_late';
  }
  return hit.sort((a, b) => {
    const ra = SCOPE_PRIORITY.indexOf(a) === -1 ? 50 : SCOPE_PRIORITY.indexOf(a);
    const rb = SCOPE_PRIORITY.indexOf(b) === -1 ? 50 : SCOPE_PRIORITY.indexOf(b);
    return ra - rb;
  });
}

// ── is this a generate-a-report request? (port of aiWantsGeneratedReport) ────
function looksLikeReportRequest(message) {
  const lower = message.toLowerCase();
  // 1. explicit file-format trigger
  if (hasToken(lower, ['excel', 'xls', 'xlsx', 'spreadsheet', 'csv', 'pdf', 'export', 'download', 'generate file', 'generate image', 'image report', 'picture report'])) {
    return true;
  }
  // 2. image/picture + a data keyword
  if (hasToken(lower, ['image', 'picture', 'photo']) &&
      hasToken(lower, ['dtr', 'fuel', 'epass', 'leave', 'travel', 'attendance', 'employee', 'report', 'billing', 'soa', 'membership', 'warehouse', 'material', 'inventory', 'turnover', 'status'])) {
    return true;
  }
  // 3. a create verb + a known report type
  const wantsCreate = hasToken(lower, ['generate', 'make', 'create', 'build', 'prepare', 'produce', 'show', 'send report', 'give me', 'gawa', 'igawa']);
  const hasType = hasToken(lower, ['report', 'table', 'talaan', 'dtr', 'fuel', 'epass', 'leave', 'travel', 'attendance', 'employee', 'employees', 'billing', 'soa', 'membership', 'warehouse', 'material', 'inventory', 'job order', 'turnover', 'list']);
  if (wantsCreate && hasType) return true;
  // 4. roster / "all records" requests
  if (hasToken(lower, ['all employees', 'all employee', 'employee list', 'list of employees', 'all staff', 'all data', 'all records', 'complete list', 'full list', 'directory'])) {
    return true;
  }
  return false;
}

// ── format ───────────────────────────────────────────────────────────────────
function reportFormat(message) {
  const lower = message.toLowerCase();
  if (lower.includes('pdf')) return 'pdf';
  if (lower.includes('csv')) return 'csv';
  if (lower.includes('image') || lower.includes('picture')) return 'image';
  if (hasToken(lower, ['table', 'talaan', 'lamesa'])) return 'table';
  return 'excel';
}

// ── date range → [from, to] YYYY-MM-DD ───────────────────────────────────────
function reportDateRange(message) {
  const iso = /(20\d{2}-\d{2}-\d{2})/;
  let m =
    message.match(/\bfrom\s+(20\d{2}-\d{2}-\d{2})\s+(?:to|until|through|-)\s+(20\d{2}-\d{2}-\d{2})\b/i) ||
    message.match(/\bbetween\s+(20\d{2}-\d{2}-\d{2})\s+and\s+(20\d{2}-\d{2}-\d{2})\b/i) ||
    message.match(/\b(20\d{2}-\d{2}-\d{2})\s+(?:to|until|through|-)\s+(20\d{2}-\d{2}-\d{2})\b/i);
  if (m) return m[1] <= m[2] ? [m[1], m[2]] : [m[2], m[1]];

  const lower = message.toLowerCase();
  m = message.match(/\b(?:last|past)\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/i);
  if (m) {
    const amount = Math.max(1, Math.min(365, parseInt(m[1], 10)));
    const unit = m[2].toLowerCase();
    if (unit.startsWith('week')) return [fmt(addDays(today(), -(amount * 7 - 1))), fmt(today())];
    if (unit.startsWith('month')) return [fmt(addMonths(firstOfMonth(today()), -(amount - 1))), fmt(today())];
    return [fmt(addDays(today(), -(amount - 1))), fmt(today())];
  }

  if (lower.includes('yesterday')) { const d = fmt(addDays(today(), -1)); return [d, d]; }
  if (lower.includes('today')) { const d = fmt(today()); return [d, d]; }
  if (lower.includes('last week')) {
    const mon = addDays(today(), -((today().getDay() + 6) % 7) - 7);
    return [fmt(mon), fmt(addDays(mon, 6))];
  }
  if (lower.includes('this week')) {
    const mon = addDays(today(), -((today().getDay() + 6) % 7));
    return [fmt(mon), fmt(today())];
  }
  if (lower.includes('last year')) { const y = today().getFullYear() - 1; return [`${y}-01-01`, `${y}-12-31`]; }
  if (lower.includes('this year')) return [`${today().getFullYear()}-01-01`, fmt(today())];
  if (lower.includes('last month')) {
    const lm = addMonths(today(), -1);
    return [fmt(firstOfMonth(lm)), fmt(lastOfMonth(lm))];
  }
  if (lower.includes('this month')) return [fmt(firstOfMonth(today())), fmt(today())];

  const month = monthNumberFromText(message);
  if (month !== null) {
    let year = today().getFullYear();
    const ym = message.match(/\b(20\d{2})\b/);
    if (ym) year = parseInt(ym[1], 10);
    const start = new Date(year, month - 1, 1);
    return [fmt(start), fmt(lastOfMonth(start))];
  }

  const single = message.match(iso);
  if (single) return [single[1], single[1]];

  return [fmt(firstOfMonth(today())), fmt(today())];
}

module.exports = {
  reportScope,
  allScopes,
  reportFormat,
  reportDateRange,
  looksLikeReportRequest,
  hasToken,
  countTokenHits,
  monthNumberFromText,
};

/**
 * wantsChatTableReport — Node port ng aiWantsChatTableReport() (api/ai_history.php).
 *
 * BAKIT KAILANGAN: may DALAWANG uri ng ulat ang PHP —
 *   looksLikeReportRequest()  = gumawa ng FILE (pdf/excel/image)
 *   wantsChatTableReport()    = ipakita bilang TALAHANAYAN sa chat
 * Kung ito lang ang wala, ang "fuel report this year" ay walang tumatanggap at
 * napupunta sa LLM — na hindi makakakita ng tunay na datos.
 */
function wantsChatTableReport(message) {
  const lower = String(message || '').toLowerCase();
  // Kung file ang hinihingi, hindi ito chat table.
  if (looksLikeReportRequest(message)) return false;
  // Ang mga ito ay may sariling handler (recommendation/briefing/anomaly).
  const advisory = ['recommend', 'recommendation', 'diagnose', 'briefing', 'executive summary', 'anomaly', 'warning', 'risk'];
  if (advisory.some((k) => lower.includes(k))) return false;
  const tableWords = ['table', 'report', 'list', 'show records', 'show record', 'records',
    'data', 'information', 'all data', 'all records', 'summary report'];
  return tableWords.some((k) => lower.includes(k));
}

module.exports.wantsChatTableReport = wantsChatTableReport;
