/**
 * SAM brain + knowledge base — Node port ng:
 *   ai_chat.php    : ensureKnowledgeBase, searchKnowledgeBase, saveKnowledge, extractLearnTags
 *   ai_history.php : aiEnsureBrainTable, aiBrainNormalize, aiBrainIsLearnableAnswer,
 *                    aiLearnQA, aiRecallFromBrain, aiBrainSynonyms
 *
 * DALAWANG MAGKAIBANG IMBAKAN:
 *   ai_knowledge_base — kaalaman tungkol sa SAMELCO (patakaran, proseso). Hinahanap bago sumagot.
 *   sam_brain         — natutunang Q&A. Kapag may eksaktong tanong na dati nang sinagot, doon
 *                       kinukuha ang sagot at hindi na tumatawag sa LLM (mabilis at libre).
 *
 * ANG RECALL AY MAY THRESHOLD: kailangang tumugma ang sapat na bilang ng salita bago ibalik
 * ang lumang sagot — kung hindi, mali ang isasagot ni SAM sa ibang tanong.
 */

const crypto = require('crypto');
const db = require('../../config/database');
const embeddings = require('./embeddings');
// Ang mga SAM table ay nasa `messenger` DB (tingnan ang samDb.js) — hindi sa it_program.
const { sam } = require('./samDb');

// ── Knowledge base ──────────────────────────────────────────────────────────

async function ensureKnowledgeBase() {
  await db.queryAll(
    `CREATE TABLE IF NOT EXISTS ${sam('ai_knowledge_base')} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(100) NOT NULL DEFAULT "general",
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_category (category),
        KEY idx_created (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=latin1`
  );
}

const KB_STOP = new Set(['the', 'and', 'for', 'that', 'this', 'what', 'how', 'can', 'you',
  'mga', 'ang', 'yung', 'ano', 'paano', 'sino', 'saan', 'may', 'para', 'lang']);

/** searchKnowledgeBase(): OR-match ng hanggang 5 salita; "### title\ncontent" ang hugis. */
async function searchKnowledgeBase(query) {
  const words = [...new Set(
    String(query || '').toLowerCase().split(/\W+/u).filter((w) => w.length >= 3 && !KB_STOP.has(w))
  )].slice(0, 5);
  if (!words.length) return '';

  const params = [];
  const conditions = words.map((w) => {
    params.push(`%${w}%`, `%${w}%`);
    return '(title LIKE ? OR content LIKE ?)';
  });

  try {
    const rows = await db.queryAll(
      `SELECT title, content FROM ${sam('ai_knowledge_base')}
       WHERE ${conditions.join(' OR ')}
       ORDER BY created_at DESC LIMIT 5`,
      params
    );
    if (!rows.length) return '';
    return rows.map((r) => `### ${r.title}\n${r.content}`).join('\n\n');
  } catch {
    return '';
  }
}

const KB_CATEGORIES = ['general', 'employee', 'process', 'system', 'policy'];

async function saveKnowledge(title, content, category) {
  if (!title || !content) return;
  const cat = KB_CATEGORIES.includes(category) ? category : 'general';
  try {
    await db.queryAll(
      `INSERT INTO ${sam('ai_knowledge_base')} (category, title, content) VALUES (?, ?, ?)`,
      [cat, String(title).slice(0, 255), String(content).slice(0, 3000)]
    );
  } catch {
    // Tahimik na laktawan — hindi dapat masira ang chat dahil sa pag-save.
  }
}

/**
 * extractLearnTags(): kinukuha ang [LEARN: title | content | category] sa sagot ng LLM,
 * at ibinabalik ang malinis na teksto (walang tag) kasama ang nakuhang kaalaman.
 */
const LEARN_RE = /\[LEARN:\s*([^|\]]+)\s*\|\s*([^|\]]+)\s*\|\s*([^\]]+)\s*\]/gu;

function extractLearnTags(response) {
  const text = String(response || '');
  const knowledge = [];
  for (const m of text.matchAll(LEARN_RE)) {
    knowledge.push({
      title: m[1].trim(),
      content: m[2].trim(),
      category: m[3].trim().toLowerCase(),
    });
  }
  return [text.replace(LEARN_RE, '').trim(), knowledge];
}

// ── sam_brain (natutunang Q&A) ──────────────────────────────────────────────

async function ensureBrainTable() {
  await db.queryAll(
    `CREATE TABLE IF NOT EXISTS ${sam('sam_brain')} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question VARCHAR(500) NOT NULL,
        answer MEDIUMTEXT NOT NULL,
        search_text TEXT NOT NULL,
        category VARCHAR(60) NOT NULL DEFAULT "general",
        asked_by_id INT NOT NULL DEFAULT 0,
        asked_by_name VARCHAR(160) NOT NULL DEFAULT "",
        hit_count INT NOT NULL DEFAULT 1,
        source VARCHAR(30) NOT NULL DEFAULT "groq",
        question_hash CHAR(40) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uq_qhash (question_hash),
        KEY idx_category (category),
        KEY idx_created (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=latin1`
  );
  try {
    await db.queryAll(`ALTER TABLE ${sam('sam_brain')} ADD COLUMN bad_count INT NOT NULL DEFAULT 0`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  for (const migration of [
    `ALTER TABLE ${sam('sam_brain')} ADD COLUMN embedding_json LONGTEXT NULL`,
    `ALTER TABLE ${sam('sam_brain')} ADD COLUMN embedding_model VARCHAR(100) NULL`,
  ]) {
    try {
      await db.queryAll(migration);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
}

/** A cached answer users keep flagging as wrong stops being recalled — see markAnswerBad(). */
const BAD_THRESHOLD = 2;

/** aiBrainNormalize(): lowercase, alphanumeric lang, isahang space. */
function brainNormalize(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Hindi natututo sa mga sagot na error/restricted — mapanganib itong ulitin. */
const BAD_ANSWER_MARKERS = [
  'could not connect', 'encountered an error', 'not configured', 'no user message',
  'restricted:', 'i could not', 'sorry, i could not', 'try a different keyword',
  'no records were found', "i couldn't find", 'no attendance records',
];

function isLearnableAnswer(answer) {
  const a = String(answer || '').toLowerCase().trim();
  if (a.length < 12) return false;
  return !BAD_ANSWER_MARKERS.some((b) => a.includes(b));
}

/** aiLearnQA(): itinatala ang tanong+sagot; kung ulit, dinadagdagan ang hit_count. */
async function learnQA({ userId = 0, userName = '', question, answer, source = 'groq' }) {
  const q = String(question || '').trim();
  if (q.length < 6 || !isLearnableAnswer(answer)) return;
  try {
    await ensureBrainTable();
    const norm = brainNormalize(q);
    if (norm === '') return;
    await db.queryAll(
      `INSERT INTO ${sam('sam_brain')} (question, answer, search_text, asked_by_id, asked_by_name, source, question_hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
           answer = VALUES(answer), search_text = VALUES(search_text),
           asked_by_id = VALUES(asked_by_id), asked_by_name = VALUES(asked_by_name),
           hit_count = hit_count + 1, updated_at = NOW()`,
      [q.slice(0, 500), String(answer), norm, Number(userId) || 0, String(userName).slice(0, 160), source, sha1(norm)]
    );
    const vector = await embeddings.embed(norm, 'raw');
    if (vector.length) {
      await db.queryAll(
        `UPDATE ${sam('sam_brain')}
         SET embedding_json = ?, embedding_model = ?
         WHERE question_hash = ?`,
        [JSON.stringify(vector), embeddings.embeddingConfig().indexVersion, sha1(norm)]
      );
      semanticCache = null;
    }
  } catch {
    // Best-effort — hindi dapat masira ang chat.
  }
}

/**
 * markAnswerBad(): called when a user says a just-given cached answer was wrong.
 * Increments bad_count for the brain row matching that question; once a row hits
 * BAD_THRESHOLD, recallFromBrain stops serving it (falls through to a fresh LLM call).
 */
async function markAnswerBad(question) {
  const norm = brainNormalize(question);
  if (norm === '') return;
  try {
    await ensureBrainTable();
    await db.queryAll(
      `UPDATE ${sam('sam_brain')} SET bad_count = bad_count + 1 WHERE question_hash = ?`,
      [sha1(norm)]
    );
  } catch {
    // Best-effort — hindi dapat masira ang chat.
  }
}

const RECALL_STOP = new Set(['the', 'and', 'for', 'that', 'this', 'what', 'how', 'can', 'you', 'sam',
  'samelco', 'samelcii', 'please', 'about', 'with', 'from', 'our', 'your', 'are', 'who',
  'does', 'did', 'will', 'would', 'should', 'have', 'has', 'pwede', 'paano', 'ano',
  'cant', 'cannot', 'get', 'got', 'want', 'need', 'make', 'new', 'use', 'using',
  'dont', 'tell', 'able', 'give', 'let', 'put', 'set', 'via', 'one', 'some', 'here']);

/**
 * aiBrainSynonyms() — EKSAKTONG kopya ng listahan sa ai_history.php.
 *
 * HUWAG dagdagan o bawasan nang basta-basta: ito ang nagpapasya kung maaalala ni SAM ang
 * dating sagot kapag ibang salita ang ginamit ("gasoline" vs "fuel"). Kapag kulang ang
 * listahan, hindi na maaalala ni SAM ang 2,238 sagot na natutunan niya sa PHP.
 */
function brainSynonyms() {
  return {
    login: ['signin', 'sign', 'logon', 'log', 'access'],
    signin: ['login', 'sign', 'access'],
    sign: ['login', 'signin', 'logon'],
    logon: ['login', 'signin'],
    password: ['pass', 'pword', 'pwd', 'credentials'],
    pword: ['password'],
    pwd: ['password'],
    pass: ['password', 'epass'],
    leave: ['vacation', 'sick', 'absence', 'dayoff'],
    vacation: ['leave'],
    fuel: ['gas', 'gasoline', 'diesel', 'petrol'],
    gas: ['fuel', 'gasoline', 'diesel'],
    gasoline: ['fuel'],
    diesel: ['fuel'],
    epass: ['gatepass', 'gate', 'pass', 'travel'],
    gatepass: ['epass'],
    travel: ['epass', 'trip', 'destination'],
    dtr: ['attendance', 'timesheet', 'timein', 'timeout', 'punch'],
    attendance: ['dtr', 'timein', 'timeout', 'punch'],
    late: ['tardy', 'tardiness', 'huli'],
    report: ['generate', 'excel', 'export', 'print'],
    photo: ['picture', 'pic', 'image', 'avatar'],
    picture: ['photo', 'pic', 'image'],
    pic: ['photo', 'picture', 'image'],
    overtime: ['ot'],
    salary: ['pay', 'payroll', 'payslip', 'sweldo', 'wage'],
    pay: ['salary', 'payroll', 'payslip', 'sweldo'],
    materials: ['supplies', 'stock', 'items', 'equipment'],
    supplies: ['materials', 'stock'],
    computer: ['pc', 'laptop', 'desktop', 'unit'],
    printer: ['print'],
    profile: ['account', 'info', 'details'],
    member: ['membership', 'consumer'],
    bill: ['billing', 'soa', 'account'],
    request: ['apply', 'file', 'submit'],
    approve: ['approval', 'approver', 'sign'],
    cancel: ['withdraw', 'remove'],
    update: ['change', 'edit', 'modify'],
    check: ['view', 'see', 'show', 'find'],
  };
}

let semanticCache = null;
let semanticCacheLoadedAt = 0;
const SEMANTIC_CACHE_MS = 60000;
const SEMANTIC_THRESHOLD = 0.80;
const LIVE_DATA_QUESTION = /\b(how many|count|today|yesterday|current|latest|list|report|records?|balance|status|pending|approved|highest|lowest|most|who)\b/i;

async function loadSemanticCache() {
  if (semanticCache && Date.now() - semanticCacheLoadedAt < SEMANTIC_CACHE_MS) return semanticCache;
  const model = embeddings.embeddingConfig().indexVersion;
  const rows = await db.queryAll(
    `SELECT answer, embedding_json, hit_count FROM ${sam('sam_brain')}
     WHERE embedding_json IS NOT NULL
       AND embedding_model = ?
       AND bad_count < ${BAD_THRESHOLD}`,
    [model]
  );
  semanticCache = rows.map((row) => {
    try {
      return {
        answer: String(row.answer || ''),
        vector: JSON.parse(row.embedding_json),
        hits: Number(row.hit_count) || 0,
      };
    } catch {
      return null;
    }
  }).filter((row) => row && Array.isArray(row.vector) && row.vector.length);
  semanticCacheLoadedAt = Date.now();
  return semanticCache;
}

async function semanticRecall(normalizedQuestion) {
  if (!embeddings.embeddingConfig().enabled) return '';
  // Never answer live-data/report questions from a learned semantic cache.
  // Those must continue through SAM's deterministic database/report handlers.
  if (LIVE_DATA_QUESTION.test(normalizedQuestion)) return '';
  try {
    const queryVector = await embeddings.embed(normalizedQuestion, 'raw');
    if (!queryVector.length) return '';
    const candidates = await loadSemanticCache();
    let best = null;
    for (const candidate of candidates) {
      const score = embeddings.cosineSimilarity(queryVector, candidate.vector);
      if (!best || score > best.score || (score === best.score && candidate.hits > best.hits)) {
        best = { ...candidate, score };
      }
    }
    return best && best.score >= SEMANTIC_THRESHOLD ? best.answer : '';
  } catch {
    return '';
  }
}

/**
 * aiRecallFromBrain(): naghahanap ng dating sagot.
 *   1) eksaktong hash ng tanong — pinakatiyak
 *   2) grupo ng salita + synonyms, may score at threshold para hindi mag-sagot ng hindi kaugnay
 */
async function recallFromBrain(message) {
  const q = String(message || '').trim();
  if (q.length < 6) return '';
  try {
    await ensureBrainTable();
    const norm = brainNormalize(q);
    if (norm === '') return '';

    const exact = await db.queryOne(
      `SELECT answer FROM ${sam('sam_brain')} WHERE question_hash = ? AND bad_count < ${BAD_THRESHOLD} LIMIT 1`,
      [sha1(norm)]
    );
    if (exact && exact.answer !== null && exact.answer !== undefined) return String(exact.answer);

    const words = [...new Set(norm.split(/\s+/).filter((w) => w.length >= 3 && !RECALL_STOP.has(w)))].slice(0, 8);
    if (words.length < 1) return semanticRecall(norm);

    const syn = brainSynonyms();
    const groups = words.map((w) => [...new Set([w, ...(syn[w] || [])])]);

    const params = [];
    const orParts = [];
    for (const group of groups) {
      for (const term of group) {
        orParts.push('search_text LIKE ?');
        params.push(`%${term}%`);
      }
    }
    if (!orParts.length) return '';

    const rows = await db.queryAll(
      `SELECT answer, search_text, hit_count FROM ${sam('sam_brain')}
       WHERE (${orParts.join(' OR ')}) AND bad_count < ${BAD_THRESHOLD}
       ORDER BY hit_count DESC LIMIT 60`,
      params
    );
    if (!rows.length) return semanticRecall(norm);

    // Score = ilang grupo ang tumama. Mas mahigpit kapag mahaba ang tanong.
    const groupCount = groups.length;
    const threshold = groupCount >= 4 ? 3 : (groupCount >= 3 ? 2 : 1);

    let bestAnswer = '';
    let bestScore = 0;
    let bestHits = -1;
    for (const row of rows) {
      const text = String(row.search_text || '');
      let score = 0;
      for (const group of groups) {
        if (group.some((term) => text.includes(term))) score++;
      }
      const hits = Number(row.hit_count) || 0;
      if (score > bestScore || (score === bestScore && hits > bestHits)) {
        bestScore = score;
        bestHits = hits;
        bestAnswer = String(row.answer || '');
      }
    }

    return bestScore >= threshold ? bestAnswer : semanticRecall(norm);
  } catch {
    return '';
  }
}

module.exports = {
  ensureKnowledgeBase, searchKnowledgeBase, saveKnowledge, extractLearnTags,
  ensureBrainTable, brainNormalize, isLearnableAnswer, learnQA, recallFromBrain, brainSynonyms,
  markAnswerBad, semanticRecall,
};
