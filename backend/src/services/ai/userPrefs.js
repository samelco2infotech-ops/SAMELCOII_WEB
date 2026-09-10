/**
 * Per-user SAM preferences — explicit only ("always give me Excel", "always
 * reply in Tagalog"), never inferred from a single message. Persisted in the
 * messenger DB alongside SAM's other memory (brain, audit, notices) so it
 * survives across sessions/devices, same as conversation history already does.
 */
const db = require('../../config/database');
const { sam } = require('./samDb');

async function ensureTable() {
  await db.queryAll(
    `CREATE TABLE IF NOT EXISTS ${sam('ai_user_prefs')} (
        user_id INT PRIMARY KEY,
        preferred_format VARCHAR(20) NOT NULL DEFAULT '',
        preferred_language VARCHAR(20) NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=latin1`
  );
}

const FORMAT_WORDS = { excel: 'excel', pdf: 'pdf', csv: 'csv', image: 'image', picture: 'image', table: 'table' };
const LANGUAGE_WORDS = {
  english: 'English', tagalog: 'Tagalog', filipino: 'Tagalog', waray: 'Waray-Waray', bisaya: 'Bisaya/Cebuano', cebuano: 'Bisaya/Cebuano',
};

/**
 * Detect an explicit preference-setting command. Requires the word "always"
 * (or its Tagalog equivalent "laging"/"palagi") plus a recognized format or
 * language word — deliberately narrow so ordinary report requests ("give me
 * an excel report") never get mistaken for a standing preference.
 */
function detectPreferenceCommand(message) {
  const lower = String(message || '').toLowerCase();

  if (/\b(forget|reset|clear)\b.*\b(preference|setting)s?\b/.test(lower)) {
    return { clear: true };
  }

  const wantsAlways = /\b(always|laging|palagi)\b/.test(lower);
  if (!wantsAlways) return null;

  for (const [word, format] of Object.entries(FORMAT_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return { format };
  }
  for (const [word, language] of Object.entries(LANGUAGE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return { language };
  }
  return null;
}

async function getPrefs(userId) {
  try {
    await ensureTable();
    const row = await db.queryOne(`SELECT preferred_format, preferred_language FROM ${sam('ai_user_prefs')} WHERE user_id = ?`, [Number(userId) || 0]);
    return { format: row?.preferred_format || '', language: row?.preferred_language || '' };
  } catch {
    return { format: '', language: '' }; // a pref lookup failure should never block a reply
  }
}

async function setPref(userId, { format, language, clear } = {}) {
  await ensureTable();
  const uid = Number(userId) || 0;
  if (clear) {
    await db.queryAll(`DELETE FROM ${sam('ai_user_prefs')} WHERE user_id = ?`, [uid]);
    return;
  }
  await db.queryAll(
    `INSERT INTO ${sam('ai_user_prefs')} (user_id, preferred_format, preferred_language)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       preferred_format = IF(VALUES(preferred_format) <> '', VALUES(preferred_format), preferred_format),
       preferred_language = IF(VALUES(preferred_language) <> '', VALUES(preferred_language), preferred_language)`,
    [uid, format || '', language || '']
  );
}

module.exports = { detectPreferenceCommand, getPrefs, setPref };
