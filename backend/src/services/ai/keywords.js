/**
 * Keyword extraction — Node port ng aiExtractReportKeywords, aiExpandAbbreviations,
 * aiBuildKeywordFilter, aiDtrFilterKeywords (api/ai_history.php).
 *
 * BAKIT HIWALAY NA FILE: ginagamit ito ng reportRows.js AT ng dtrFlex.js. Dapat iisa lang
 * ang pinagmumulan — kung mag-iiba ang stop-word list, iba na rin ang lalabas na rows.
 *
 * MAHALAGA: ang stop-word list ang pumipigil sa mga salitang tulad ng "late" o "pending" na
 * maging LIKE filter sa PANGALAN ng empleyado. Kapag tinanggal, magiging zero-row ang resulta
 * ng "late dtr report" dahil walang empleyadong nagngangalang "late".
 */

const STOP_WORDS = new Set([
  // actions
  'generate', 'report', 'excel', 'image', 'download', 'show', 'make', 'create', 'give',
  'get', 'list', 'please', 'pls', 'gawa', 'igawa', 'prepare', 'build', 'send', 'produce',
  // modal/filler verbs
  'can', 'cant', 'cannot', 'could', 'would', 'will', 'shall', 'need', 'want', 'wanna', 'help', 'kindly',
  // DTR status qualifiers — hawak na ito ng report type (hal. dtr_late HAVING)
  'late', 'tardy', 'undertime', 'absent', 'present', 'ontime', 'timein', 'timeout', 'log', 'logs',
  // record-status qualifiers — status column ang tinutukoy, hindi pangalan
  'pending', 'approved', 'approve', 'rejected', 'denied', 'cancelled', 'canceled', 'cancel',
  'released', 'release', 'completed', 'complete', 'done', 'open', 'closed', 'active', 'inactive',
  'issued', 'returned', 'borrowed', 'allocated', 'disbursed', 'posted', 'draft', 'ongoing', 'approval',
  // report-modifier words
  'full', 'details', 'detail', 'complete', 'roster', 'directory', 'everyone', 'everybody',
  'whole', 'entire', 'overall', 'combined', 'total', 'file', 'sheet', 'spreadsheet',
  // formatting requests SAM can't actually apply yet (color-coding, bolding, etc.) — these
  // must never be treated as a name/department search term (real bug: "put a color whos
  // late" wiped out all 237 real rows because no employee is literally named "color").
  'name', 'names', 'put', 'color', 'colour', 'colors', 'colours', 'highlight', 'highlighted',
  'mark', 'marked', 'bold', 'bolded',
  // output formats
  'pdf', 'csv', 'xls', 'xlsx', 'svg', 'word', 'doc', 'docx', 'format', 'picture',
  // connectors / filler
  'the', 'and', 'for', 'from', 'to', 'of', 'in', 'on', 'a', 'an', 'it', 'at', 'by', 'with',
  'all', 'my', 'our', 'your', 'their', 'its', 'his', 'her',
  // time
  'last', 'this', 'month', 'year', 'week', 'today', 'yesterday', 'recent', 'latest', 'now',
  'april', 'january', 'february', 'march', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  // module names (na-resolve na ng scope)
  'fuel', 'dtr', 'epass', 'leave', 'travel', 'attendance', 'billing', 'soa',
  'membership', 'warehouse', 'material', 'inventory', 'employee', 'employees',
  'staff', 'job', 'order', 'turnover', 'status', 'summary', 'request', 'records',
  'data', 'information', 'info', 'profile', 'profiles', 'department', 'dept',
  'it', 'hr', 'admin',
  // NB: sinasadyang WALA rito ang 'corplan' — tunay itong filter keyword (tulad ng PHP).
]);

/** aiExpandAbbreviations(): pinapalitan ang dept code ng buong salita para tumama sa LIKE. */
const ABBREVIATIONS = {
  ogm: 'general manager',
  esd: 'engineering',
  fsd: 'finance',
  isd: 'institutional',
  tsd: 'technical',
  iad: 'internal audit',
  cpd: 'corporate planning',
};

function expandAbbreviations(keywords) {
  return keywords.map((k) => ABBREVIATIONS[String(k).toLowerCase()] ?? k);
}

/** True kapag 1 titik lang ang pagkakaiba (typo) ng `a` sa `b` — parehong haba ± 1. */
function isOneEditAway(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false; // exact match na hinahawakan ng STOP_WORDS.has() mismo
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (a.length === b.length) { i++; j++; } else if (a.length > b.length) { i++; } else { j++; }
  }
  edits += (a.length - i) + (b.length - j);
  return edits <= 1;
}

// ponytail: sinusubok lang ang isang-titik-na-pagkakamali (edit distance 1), hindi
// buong fuzzy-matching library — sapat na ito para sa mga totoong nasagap na typo
// ("employess", "erlie") nang hindi nagdaragdag ng dependency. Kisame: hindi mahuhuli
// ang 2+ letrang typo o transposition ng buong salita. Upgrade path: palitan ng tunay
// na Levenshtein kung lumabas pang mas malalang typo sa totoong paggamit.
function isNearStopWord(word) {
  if (word.length < 4) return false; // maiikling totoong termino (hal. "IT", "HR") ay hindi dapat ma-drop
  for (const stop of STOP_WORDS) {
    if (Math.abs(stop.length - word.length) > 1) continue;
    if (isOneEditAway(word, stop)) return true;
  }
  return false;
}

/**
 * aiExtractReportKeywords(): hinahati sa whitespace/,;/\| , inaalis ang hindi alphanumeric,
 * itinatapon ang <3 letra, ang nasa stop list, at ang malapit-sa-stop-list (typo), unique,
 * unang 5, tapos i-expand.
 */
function extractReportKeywords(message = '') {
  const lower = String(message).toLowerCase();
  const words = lower.split(/[\s,;/\\|]+/).filter(Boolean);
  const results = [];
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (clean.length >= 3 && !STOP_WORDS.has(clean) && !isNearStopWord(clean)) results.push(clean);
  }
  return expandAbbreviations([...new Set(results)].slice(0, 5));
}

/** aiDtrFilterKeywords(): report keywords na inalisan pa ng mga salitang pang-DTR. */
const DTR_EXTRA = new Set([
  'who', 'whom', 'whos', 'morning', 'late', 'ontime', 'present', 'absent', 'tardy', 'tardiness',
  'undertime', 'early', 'erly', 'time', 'timein', 'clock', 'biometric', 'dtr', 'attendance',
  'sino', 'kinsa', 'maaga', 'huli', 'get', 'show', 'list', 'give', 'make', 'report',
]);

function dtrFilterKeywords(message = '') {
  return extractReportKeywords(message).filter((w) => !DTR_EXTRA.has(w));
}

/**
 * aiBuildKeywordFilter(): " AND (f1 LIKE ? OR f2 LIKE ?) AND (…)".
 * AND sa pagitan ng keywords, OR sa pagitan ng fields — dapat tumama ang BAWAT keyword
 * kahit saang field. Isinusulat ang params sa ibinigay na array (positional para sa mysql2).
 */
function buildKeywordFilter(keywords, fields, params) {
  if (!keywords.length || !fields.length) return '';
  const andParts = keywords.map((kw) => {
    const orParts = fields.map((field) => {
      params.push(`%${kw}%`);
      return `${field} LIKE ?`;
    });
    return `(${orParts.join(' OR ')})`;
  });
  return ` AND ${andParts.join(' AND ')}`;
}

module.exports = { extractReportKeywords, dtrFilterKeywords, buildKeywordFilter, expandAbbreviations, STOP_WORDS };
