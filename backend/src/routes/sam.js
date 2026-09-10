const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const router = express.Router();
const config = require('../config/env');
const db = require('../config/database');
const orchestrator = require('../services/ai/samOrchestrator');
const { sam, app: appTbl } = require('../services/ai/samDb');
const {
  reportPdfContent, reportXlsxContent, reportImageContent, reportCsvContent,
} = require('../services/ai/reportFiles');

/**
 * SAM AI — NATIVE Node engine.
 *
 * DATI: ang route na ito ay proxy lang papuntang api/ai_chat.php. NGAYON: nasa Node na ang
 * buong lohika (samOrchestrator at mga module nito), na pinatunayang katumbas ng PHP sa
 * pamamagitan ng mga *.parity.js na pagsubok (reports, DTR, analytics, brain, notices, PDF).
 *
 * PANATILIHIN ang hugis ng response — ito pa rin ang tinatawag ng frontend:
 *     POST { conversation_id }  ->  { ok: true, response: "<sagot>" }
 *
 * TIWALA: verifyToken ang naglalagay ng req.user sa /api/sam. Ang identity ay
 * laging galing sa verified JWT at saka sine-check laban sa conversationparticipants.
 *
 * MGA DATABASE (mahalaga):
 *   messenger  — conversations, messages, attachments, at ang alaala ni SAM
 *                (sam_brain, ai_knowledge_base, ai_audit_log, sam_public_notices)
 *   it_program — datos ng kooperatiba (usertb, fuelallocation_history, checkinout, ...)
 */

const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/messenger');
const PUBLIC_BASE = `${config.app?.webPrefix || ''}/uploads/messenger`;

/** Ang AI ay isa ring messenger user; nakaimbak ang UserID niya sa ai_settings. */
async function getAiUserId() {
  let configuredId = 0;
  try {
    const row = await db.queryOne(
      `SELECT setting_value FROM ${sam('ai_settings')} WHERE setting_key = 'ai_user_id' LIMIT 1`
    );
    configuredId = Number(row?.setting_value || 0);
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  if (configuredId > 0) {
    const configuredUser = await db.queryOne(
      `SELECT Id FROM ${appTbl('usertb')} WHERE Id = ? LIMIT 1`,
      [configuredId]
    );
    if (configuredUser) return configuredId;
  }

  const fallback = await db.queryOne(
    `SELECT Id FROM ${appTbl('usertb')} WHERE username = ? OR usercode = ? LIMIT 1`,
    ['__samelco_ai__', '__samelco_ai__']
  );
  return Number(fallback?.Id || 0);
}

/** HUWAG BAGUHIN: identity must come from the verified JWT, never from req.body. */
async function authenticatedUserId(req) {
  const direct = Number(req.user?.id || req.user?.userId || 0);
  if (direct > 0) return direct;

  const usercode = String(req.user?.usercode || '').trim();
  if (!usercode) return 0;
  const row = await db.queryOne(
    `SELECT Id FROM ${appTbl('usertb')} WHERE usercode = ? LIMIT 1`,
    [usercode]
  );
  return Number(row?.Id || 0);
}

/** Seguridad: kasali ba talaga ang user sa usapang ito? */
async function userInConversation(conversationId, userId) {
  const row = await db.queryOne(
    `SELECT 1 AS ok FROM ${sam('conversationparticipants')}
     WHERE ConversationID = ? AND UserID = ? LIMIT 1`,
    [conversationId, userId]
  );
  return Boolean(row);
}

/** Pinakahuling mensahe lang ang sasagutin; kung kay SAM iyon, wala nang pending reply. */
async function pendingUserMessage(conversationId, aiUserId) {
  const row = await db.queryOne(
    `SELECT MessageID, SenderID, MessageText FROM ${sam('messages')}
     WHERE ConversationID = ?
     ORDER BY MessageID DESC LIMIT 1`,
    [conversationId]
  );
  if (!row || Number(row.SenderID) === Number(aiUserId)) return null;
  return { id: Number(row.MessageID), text: String(row.MessageText || '') };
}

/** Nakaraang usapan para may konteksto ang LLM (pinakaluma muna). */
async function recentHistory(conversationId, aiUserId, beforeMessageId, limit = 10) {
  const rows = await db.queryAll(
    `SELECT SenderID, MessageText FROM ${sam('messages')}
     WHERE ConversationID = ? AND MessageID < ?
     ORDER BY MessageID DESC LIMIT ${Number(limit) || 10}`,
    [conversationId, beforeMessageId]
  );
  return rows.reverse().map((m) => ({
    role: Number(m.SenderID) === aiUserId ? 'assistant' : 'user',
    content: String(m.MessageText || ''),
  }));
}

/** Katulad ng aiHistoryUser(): hinahanap sa usertb.Id (hindi usercode). */
async function appUser(userId) {
  return (await db.queryOne(
    `SELECT Id, usercode, username, name, position, department, area, emailadd, address,
            COALESCE(privilage, "") AS privilage,
            COALESCE(VLbal, 0) AS VLbal, COALESCE(SLbal, 0) AS SLbal, COALESCE(OLbal, 0) AS OLbal,
            COALESCE(bioUID, "") AS bioUID
     FROM ${appTbl('usertb')} WHERE Id = ? LIMIT 1`,
    [userId]
  )) || {};
}

/** Gumagawa ng tunay na file sa uploads/messenger at ibinabalik ang attachment metadata. */
async function buildFile({ title, rows, format }) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  const rand = Math.floor(1000 + Math.random() * 9000);

  let ext = 'xlsx';
  let type = 'file';
  let content;
  if (format === 'pdf') {
    ext = 'pdf';
    content = reportPdfContent(title, rows);
  } else if (format === 'image' || format === 'picture') {
    ext = 'svg';
    type = 'image';
    content = Buffer.from(reportImageContent(title, rows), 'utf8');
  } else if (format === 'csv') {
    ext = 'csv';
    content = Buffer.from(reportCsvContent(title, rows), 'utf8');
  } else {
    content = reportXlsxContent(title, rows);
  }

  const fileName = `sam_${slug}_${stamp}_${rand}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), content);
  return { type, url: `${PUBLIC_BASE}/${fileName}`, file_name: fileName, file_size: content.length };
}

/** Isinusulat ang sagot ni SAM sa usapan (kasama ang attachment kung meron). */
async function insertAiReply(conversationId, aiUserId, reply, attachment) {
  const result = await db.execute(
    `INSERT INTO ${sam('messages')} (ConversationID, SenderID, MessageText) VALUES (?, ?, ?)`,
    [conversationId, aiUserId, reply]
  );
  const messageId = result?.insertId;
  if (attachment && messageId) {
    await db.execute(
      `INSERT INTO ${sam('attachments')} (MessageID, Type, URL, FileName, FileSize, CreatedAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [messageId, attachment.type || 'file', attachment.url || '', attachment.file_name || '', attachment.file_size ?? null]
    );
  }
  return messageId;
}

router.post('/reply', async (req, res) => {
  const conversationId = Number(req.body.conversation_id);

  try {
    const userId = await authenticatedUserId(req);
    if (!userId || !conversationId) {
      return res.status(400).json({ ok: false, message: 'A signed-in user and conversation_id are required.' });
    }

    const aiUserId = await getAiUserId();
    if (!aiUserId) {
      return res.status(500).json({ ok: false, message: 'SAM not initialized — please reload Messenger.' });
    }
    if (!(await userInConversation(conversationId, userId))) {
      return res.status(403).json({ ok: false, message: 'Not authorized for this conversation.' });
    }
    if (!(await userInConversation(conversationId, aiUserId))) {
      return res.status(400).json({ ok: false, message: 'SAM is not part of this conversation.' });
    }

    const pending = await pendingUserMessage(conversationId, aiUserId);
    if (!pending?.text.trim()) {
      return res.status(400).json({ ok: false, message: 'No user message to answer yet.' });
    }

    const [user, history] = await Promise.all([
      appUser(userId),
      recentHistory(conversationId, aiUserId, pending.id),
    ]);

    const out = await orchestrator.handleMessage({
      user, userId, message: pending.text, history, buildFile, conversationId,
    });

    await insertAiReply(conversationId, aiUserId, out.reply, out.attachment);
    return res.json({ ok: true, response: out.reply });
  } catch (err) {
    // Laging may sagot ang user kahit may error — huwag mag-iwan ng nakabiting chat.
    console.error('SAM reply failed:', err);
    return res.status(500).json({ ok: false, message: 'SAM encountered an internal error. Please try again.' });
  }
});

module.exports = router;
