/**
 * Public notices + audit log — Node port ng:
 *   aiNoticePostIntent, aiEnsurePublicNoticesTable, aiMaybePostNotice, aiSearchPublicNotices,
 *   aiPublicNoticesContext, aiWantsNoticeList, aiMaybeShowNotices,
 *   aiEnsureAuditLog, aiAuditActionType, aiWriteAuditLog
 *
 * NOTICES: puwedeng mag-post ng memo/abiso ang privilege 6-10 sa pamamagitan ng chat, at
 * makikita ito ng LAHAT kapag nagtanong sila tungkol dito. Kaya may privilege check — kung
 * wala, kahit sino makakapag-anunsyo sa buong kooperatiba.
 *
 * AUDIT: bawat sagot ni SAM ay itinatala (sino, ano ang tinanong, ano ang isinagot). Hindi
 * dapat masira ang chat kapag pumalya ang pag-log — kaya lahat ay nasa try/catch.
 */

const db = require('../../config/database');
// Ang mga SAM table ay nasa `messenger` DB (tingnan ang samDb.js) — hindi sa it_program.
const { sam } = require('./samDb');
const { hasFullDataAccess, requestsBlockedWrite } = require('./guards');
const { brainNormalize } = require('./brain');
const { cleanText } = require('./userHistory');

// ── Schema ──────────────────────────────────────────────────────────────────

async function ensurePublicNoticesTable() {
  await db.queryAll(
    `CREATE TABLE IF NOT EXISTS ${sam('sam_public_notices')} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(40) NOT NULL DEFAULT "notice",
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        search_text TEXT NOT NULL,
        posted_by_id INT NOT NULL DEFAULT 0,
        posted_by_name VARCHAR(160) NOT NULL DEFAULT "",
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_active_created (is_active, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function ensureAuditLog() {
  await db.queryAll(
    `CREATE TABLE IF NOT EXISTS ${sam('ai_audit_log')} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL DEFAULT 0,
        user_id INT NOT NULL DEFAULT 0,
        user_name VARCHAR(160) NOT NULL DEFAULT "",
        is_superadmin TINYINT(1) NOT NULL DEFAULT 0,
        target_query VARCHAR(160) NOT NULL DEFAULT "",
        request_text TEXT NOT NULL,
        response_preview TEXT NOT NULL,
        action_type VARCHAR(60) NOT NULL DEFAULT "chat",
        attachment_file VARCHAR(255) NOT NULL DEFAULT "",
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_created (created_at),
        KEY idx_user_created (user_id, created_at),
        KEY idx_action_created (action_type, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=latin1`
  );
  await addColumnIfMissing('provider', 'VARCHAR(20) NOT NULL DEFAULT ""');
  await addColumnIfMissing('latency_ms', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('guard_flagged', 'VARCHAR(40) NOT NULL DEFAULT ""');
  await addColumnIfMissing('feedback', 'VARCHAR(10) NOT NULL DEFAULT ""');
  await addColumnIfMissing('possible_gap', 'TINYINT(1) NOT NULL DEFAULT 0');
}

/**
 * Text-based feedback ("thanks that helped" / "that's wrong") applies to
 * whatever SAM said *just before* it, not the message carrying the feedback
 * itself — updates the most recent audit row for this conversation.
 */
/** Returns the request_text of the flagged row (or '') so callers can act on it, e.g. brain pruning. */
async function recordFeedbackOnLastReply(conversationId, userId, sentiment) {
  try {
    await ensureAuditLog();
    const row = await db.queryOne(
      `SELECT id, request_text FROM ${sam('ai_audit_log')}
       WHERE conversation_id = ? AND user_id = ? AND feedback = ''
       ORDER BY id DESC LIMIT 1`,
      [Number(conversationId) || 0, Number(userId) || 0]
    );
    if (!row) return '';
    await db.queryAll(`UPDATE ${sam('ai_audit_log')} SET feedback = ? WHERE id = ?`, [sentiment, row.id]);
    return String(row.request_text || '');
  } catch {
    // Hindi dapat humarang sa sagot ni SAM ang pagkabigo ng feedback logging.
    return '';
  }
}

/** MySQL has no `ADD COLUMN IF NOT EXISTS` before 8.0 — swallow the duplicate-column error instead. */
async function addColumnIfMissing(column, definition) {
  try {
    await db.queryAll(`ALTER TABLE ${sam('ai_audit_log')} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

// ── Post intent ─────────────────────────────────────────────────────────────

// Form A: "Memo: ...", "Notice: ...", "Abiso: ..."
const FORM_A = /^\s*(memorandum|memo|announcement|announce|public\s+notice|notice|abiso|pahibalo|bulletin)\s*[:\-–]\s*([\s\S]+)$/i;
// Form B: "announce that ...", "post a notice that ...", "inform everyone that ..."
const FORM_B = /^\s*(?:please\s+)?(?:post\s+(?:a\s+)?(?:memo|notice|announcement)|make\s+an?\s+announcement|announce|inform\s+everyone|i\s+want\s+to\s+announce)\b\s*(?:that\s+)?[:\-–]?\s*([\s\S]+)$/i;

/** aiNoticePostIntent(): null kung hindi ito pag-post ng abiso. */
function noticePostIntent(message) {
  const t = String(message || '').trim();
  let kw;
  let body;

  const a = t.match(FORM_A);
  if (a) {
    kw = a[1].toLowerCase();
    body = a[2].trim();
  } else {
    const b = t.match(FORM_B);
    if (!b) return null;
    kw = 'announcement';
    body = b[1].trim();
  }

  if (body === '' || body.length < 4) return null;

  const cat = kw.includes('memo') ? 'memo' : (kw.includes('announce') ? 'announcement' : 'notice');

  // Opsyonal na "Title | Content"; kung wala, unang linya ang title.
  let title;
  let content;
  if (body.includes('|')) {
    const idx = body.indexOf('|');
    title = body.slice(0, idx).trim();
    content = body.slice(idx + 1).trim();
  } else {
    title = cleanText(body.split('\n')[0].trim(), 90);
    content = body;
  }
  if (content === '') content = title;

  return {
    category: cat,
    title: title !== '' ? title : cleanText(content, 90),
    content,
  };
}

/** aiMaybePostNotice(): { handled, reply? } */
async function maybePostNotice({ user = {}, userId = 0, message }) {
  const intent = noticePostIntent(message);
  if (intent === null) return { handled: false };

  if (!hasFullDataAccess(user)) {
    return {
      handled: true,
      reply: "I'm so sorry, but only privilege 6 to 10 staff can post official memos or notices. 😊\nAction: Please ask an authorized officer (department head or admin) to post it for everyone.",
    };
  }

  try {
    await ensurePublicNoticesTable();
    await db.queryAll(
      `INSERT INTO ${sam('sam_public_notices')} (category, title, content, search_text, posted_by_id, posted_by_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        intent.category,
        String(intent.title).slice(0, 200),
        intent.content,
        brainNormalize(`${intent.title} ${intent.content}`),
        Number(userId) || 0,
        String(user.name || '').slice(0, 160),
      ]
    );
  } catch (e) {
    return { handled: true, reply: `I could not save that notice right now — please try again. (${e.message})` };
  }

  const label = intent.category.charAt(0).toUpperCase() + intent.category.slice(1);
  return {
    handled: true,
    reply: `Done! I've posted this **${label}** for everyone at SAMELCO II. 📢\n\n**${intent.title}**\n${intent.content}\n\nAnyone can now ask me about it. Thank you! 🌟`,
  };
}

// ── Search / context ────────────────────────────────────────────────────────

const NOTICE_STOP = new Set(['the', 'and', 'for', 'that', 'this', 'what', 'how', 'can', 'you', 'sam', 'are',
  'samelco', 'samelcii', 'please', 'about', 'with', 'from', 'our', 'your', 'who', 'when', 'any']);

async function searchPublicNotices(message, limit = 3) {
  try {
    await ensurePublicNoticesTable();
    const norm = brainNormalize(message);
    const words = [...new Set(norm.split(/\s+/).filter((w) => w.length >= 3 && !NOTICE_STOP.has(w)))].slice(0, 6);
    if (!words.length) return [];
    const params = [];
    const conds = words.map((w) => { params.push(`%${w}%`); return 'search_text LIKE ?'; });
    return await db.queryAll(
      `SELECT title, content, category, posted_by_name, created_at
       FROM ${sam('sam_public_notices')}
       WHERE is_active = 1 AND (${conds.join(' OR ')})
       ORDER BY created_at DESC LIMIT ${Number(limit) || 3}`,
      params
    );
  } catch {
    return [];
  }
}

/** Ang PHP ay kumukuha ng unang 10 char ng created_at (YYYY-MM-DD). */
function dateStr(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

async function publicNoticesContext(message) {
  const rows = await searchPublicNotices(message, 3);
  if (!rows.length) return '';
  const parts = rows.map((r) => {
    const cat = String(r.category || '');
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `- **${label}: ${r.title}** — ${r.content} (posted by ${r.posted_by_name}, ${dateStr(r.created_at)})`;
  });
  return `### Official Memos & Notices (relevant to this question)\n${parts.join('\n')}`;
}

// ── Audit ───────────────────────────────────────────────────────────────────

const wants = (text, keywords) => {
  const l = String(text || '').toLowerCase();
  return keywords.some((k) => l.includes(k));
};

/** aiAuditActionType(): pinag-uuri ang bawat interaksyon para masala ang audit log. */
function auditActionType(message, reply, attachment = {}) {
  const lower = `${String(message || '')}\n${String(reply || '')}`.toLowerCase();
  if (wants(lower, ['audit', 'sam log', 'ai log'])) return 'audit_lookup';
  if (attachment && Object.keys(attachment).length) return 'report_file';
  if (requestsBlockedWrite(message)) return 'restricted_write';
  if (wants(lower, ['analytics', 'highest', 'top', 'compute', 'count'])) return 'analytics';
  if (wants(lower, ['records', 'profile', 'dtr', 'fuel', 'epass', 'leave'])) return 'data_lookup';
  return 'chat';
}

/** Kinukuha ang pangalan/usercode na tinutukoy sa tanong (para sa audit trail). */
function extractEmployeeQuery(message) {
  const m = String(message || '').match(/\b(S2-?\d{3,4})\b/i);
  return m ? m[1].toUpperCase() : '';
}

async function writeAuditLog({
  conversationId = 0, userId = 0, user = {}, requestText = '', replyText = '', attachment = {},
  provider = '', latencyMs = 0, guardFlagged = '', possibleGap = false,
}) {
  try {
    await ensureAuditLog();
    await db.queryAll(
      `INSERT INTO ${sam('ai_audit_log')}
         (conversation_id, user_id, user_name, is_superadmin, target_query, request_text, response_preview, action_type, attachment_file, provider, latency_ms, guard_flagged, possible_gap)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(conversationId) || 0,
        Number(userId) || 0,
        String(user.name || user.username || '').slice(0, 160),
        hasFullDataAccess(user) ? 1 : 0,
        extractEmployeeQuery(requestText).slice(0, 160),
        String(requestText).slice(0, 3000),
        String(replyText).slice(0, 3000),
        auditActionType(requestText, replyText, attachment),
        String(attachment?.file_name || '').slice(0, 255),
        String(provider || '').slice(0, 20),
        Number(latencyMs) || 0,
        String(guardFlagged || '').slice(0, 40),
        possibleGap ? 1 : 0,
      ]
    );
  } catch {
    // Ang pagkabigo ng audit ay hindi dapat humarang sa sagot ni SAM.
  }
}

module.exports = {
  ensurePublicNoticesTable, ensureAuditLog,
  noticePostIntent, maybePostNotice, searchPublicNotices, publicNoticesContext,
  auditActionType, extractEmployeeQuery, writeAuditLog, recordFeedbackOnLastReply,
};
