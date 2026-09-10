/**
 * Purpose: Legacy /api/ai-chat history plus safe Node AI configuration metadata.
 * EDIT GUIDE: provider secrets stay in config/env.js and must never be returned by getAIConfig().
 * HUWAG BAGUHIN: missing PHP-era history tables are optional; unrelated database errors must still fail.
 * Tagalog: Ang kasalukuyang Messenger/SAM history ay nasa messenger DB; compatibility lang ang lumang ai-chat history.
 */
const db = require('../config/database');
const providers = require('./ai/providers');

const isMissingOptionalTable = (error) => error?.code === 'ER_NO_SUCH_TABLE';

const getChatHistory = async (usercode, limit = 50) => {
  try {
    return await db.queryAll(
      `SELECT * FROM ai_chat_history
       WHERE usercode = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [usercode, limit]
    );
  } catch (error) {
    // ponytail: the current SAM route stores history in Messenger; add a migration only if this legacy route is reactivated.
    if (isMissingOptionalTable(error)) return [];
    throw error;
  }
};

const saveChatMessage = async (usercode, userMessage, aiResponse, context = null) => {
  try {
    const result = await db.execute(
      `INSERT INTO ai_chat_history (usercode, user_message, ai_response, context, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [usercode, userMessage, aiResponse, context]
    );
    return result.affectedRows > 0;
  } catch (error) {
    if (isMissingOptionalTable(error)) return null;
    throw error;
  }
};

const getAIConfig = () => {
  const { provider, model } = providers.resolveProvider();
  return {
    provider,
    model: model || '',
    configured: providers.isConfigured(),
  };
};

module.exports = {
  isMissingOptionalTable,
  getChatHistory,
  saveChatMessage,
  getAIConfig,
};
