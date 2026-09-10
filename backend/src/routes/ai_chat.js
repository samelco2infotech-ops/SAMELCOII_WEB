const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const db = require('../config/database');
const aiChatService = require('../services/aiChatService');
const orchestrator = require('../services/ai/samOrchestrator');
const reportFiles = require('../services/ai/reportFiles');
const { successResponse, badRequestResponse, unauthorizedResponse } = require('../utils/response');

const REPORT_DIR = path.resolve(__dirname, '../../uploads/messenger');

/**
 * Isulat ang ulat sa uploads at ibalik ang attachment metadata na inaasahan ng frontend.
 * Tinatawag lang ito ng orchestrator kapag talagang may hinihinging file.
 */
async function buildFile({ title, rows, format }) {
  const slug = title.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  const stamp = `${Date.now()}`;
  let content;
  let ext;
  let type;
  if (format === 'pdf') {
    content = reportFiles.reportPdfContent(title, rows); ext = 'pdf'; type = 'file';
  } else if (format === 'image') {
    content = reportFiles.reportImageContent(title, rows); ext = 'svg'; type = 'image';
  } else {
    content = reportFiles.reportXlsxContent(title, rows); ext = 'xlsx'; type = 'file';
  }
  const fileName = `sam_${slug}_${stamp}.${ext}`;
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, fileName), content);
  return {
    type,
    file_name: fileName,
    file_size: Buffer.byteLength(content),
    url: `/uploads/messenger/${fileName}`,
  };
}

router.get('/history', async (req, res, next) => {
  try {
    const history = await aiChatService.getChatHistory(req.user.usercode);
    return successResponse(res, { history, total: history.length });
  } catch (error) {
    next(error);
  }
});

router.post('/chat', async (req, res, next) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return badRequestResponse(res, 'Message is required.');
    }

    // Ang privilage/bioUID ay KINUKUHA SA DB, hindi sa token — puwedeng magpasa ang
    // kliyente ng sariling `x-samelcii-session` JSON, kaya hindi ito mapagkakatiwalaan
    // para sa privilege gate ng orchestrator (memo posting, org-wide reports).
    const user = await db.queryOne('SELECT * FROM usertb WHERE usercode = ? LIMIT 1', [
      req.user.usercode,
    ]);
    if (!user) return unauthorizedResponse(res, 'User not found.');

    // Huling ilang palitan lang — sapat para sa follow-up ("now May", "as an image")
    // at hindi lumolobo ang prompt.
    const past = await aiChatService.getChatHistory(req.user.usercode, 6);
    const history = past
      .reverse()
      .flatMap((row) => [
        { role: 'user', content: String(row.user_message || '') },
        { role: 'assistant', content: String(row.ai_response || '') },
      ])
      .filter((m) => m.content);

    const out = await orchestrator.handleMessage({
      user,
      userId: user.Id || 0,
      message: String(message),
      history,
      buildFile,
    });

    const savedContext = JSON.stringify({
      request_context: context || null,
      source: out.source,
      attachment: out.attachment || null,
    });

    const saved = await aiChatService.saveChatMessage(
      req.user.usercode,
      message,
      out.reply,
      savedContext
    );

    if (saved === false) {
      return badRequestResponse(res, 'Failed to save chat message.');
    }

    return successResponse(res, {
      user_message: message,
      ai_response: out.reply,
      attachment: out.attachment || null,
      source: out.source,
      context: context || null,
      history_saved: saved === true,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/config', async (req, res, next) => {
  try {
    const config = await aiChatService.getAIConfig();
    return successResponse(res, { config });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
