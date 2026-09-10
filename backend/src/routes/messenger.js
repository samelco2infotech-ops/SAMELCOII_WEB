// Messenger Node route: authenticated chat, attachments, reactions, forwarding, and calls.
// EDIT GUIDE: keep identity in getUserId() token-only; validate conversation membership before every message/call mutation.
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const mysql = require('mysql2/promise');
const appDb = require('../config/database');
const { successResponse, badRequestResponse, forbiddenResponse, notFoundResponse } = require('../utils/response');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const APP_DB_NAME = process.env.DB_NAME || 'it_program';
const MESSENGER_DB_NAME = process.env.DB_MESSENGER || process.env.MESSENGER_DB_NAME || 'messenger';
const APP_USER_TABLE = `\`${APP_DB_NAME.replace(/`/g, '``')}\`.\`usertb\``;
const MESSENGER_UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/messenger');
const PROJECT_UPLOAD_ROOT = path.resolve(__dirname, '../../../uploads');
const PRESENCE_ONLINE_SECONDS = 45;
const MAX_MESSAGE_CHARS = 1000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const messengerPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: MESSENGER_DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  charset: process.env.DB_CHARSET || 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

const mQueryOne = async (sql, params = []) => {
  const [rows] = await messengerPool.query(sql, params);
  return rows[0] || null;
};

const mQueryAll = async (sql, params = []) => {
  const [rows] = await messengerPool.query(sql, params);
  return rows;
};

const appQueryOne = async (sql, params = []) => {
  return appDb.queryOne(sql, params);
};

const appQueryAll = async (sql, params = []) => {
  return appDb.queryAll(sql, params);
};

const fileExists = async (absPath) => {
  try {
    await fs.access(absPath);
    return true;
  } catch (_error) {
    return false;
  }
};

const resolveExistingUploadUrl = async (rawUrl) => {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;

  let clean = raw.replace(/^\/+/, '');
  while (/^SAMELCII_WEB_SYSTEM\/+/i.test(clean)) {
    clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, '');
  }

  const marker = clean.toLowerCase().indexOf('uploads/');
  if (marker < 0) {
    return '';
  }

  const rel = clean.slice(marker + 'uploads/'.length);
  if (!rel) {
    return '';
  }

  const abs = path.resolve(PROJECT_UPLOAD_ROOT, rel);
  return (await fileExists(abs)) ? `/uploads/${rel}` : '';
};

const mapUserRow = async (row) => {
  if (!row) return row;
  return {
    ...row,
    profile_photo_url: await resolveExistingUploadUrl(row.profile_photo_url || ''),
  };
};

const getUserId = async (req) => {
  // HUWAG BAGUHIN: galing lang sa verified JWT ang identity; huwag tumanggap ng user_id/usercode sa request.
  const direct = Number(req.user?.id || req.user?.userId || 0);
  if (direct > 0) return direct;

  const usercode = String(req.user?.usercode || '').trim();
  if (!usercode) return 0;

  const row = await appQueryOne(
    `SELECT Id FROM ${APP_USER_TABLE} WHERE usercode = ? LIMIT 1`,
    [usercode]
  );
  return Number(row?.Id || row?.id || 0);
};

const fetchUser = async (userId) => {
  if (!userId) return null;
  const row = await appQueryOne(
    `SELECT
       Id AS id,
       COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(username), ''), TRIM(usercode), 'User') AS name,
       TRIM(COALESCE(username, '')) AS username,
       TRIM(COALESCE(usercode, '')) AS usercode,
       TRIM(COALESCE(position, '')) AS position,
       TRIM(COALESCE(department, '')) AS department,
       TRIM(COALESCE(profile_photo_url, '')) AS profile_photo_url
     FROM ${APP_USER_TABLE}
     WHERE Id = ?
     LIMIT 1`,
    [userId]
  );
  return mapUserRow(row);
};

// SAM identity: prefer the Messenger setting, then fall back to the reserved app account.
// HUWAG BAGUHIN: validate the ID against usertb before creating a conversation.
const getAiUserId = async () => {
  let configuredId = 0;
  try {
    const setting = await mQueryOne(
      "SELECT setting_value FROM ai_settings WHERE setting_key = 'ai_user_id' LIMIT 1"
    );
    configuredId = Number(setting?.setting_value || 0);
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  if (configuredId > 0 && await fetchUser(configuredId)) {
    return configuredId;
  }

  const fallback = await appQueryOne(
    `SELECT Id FROM ${APP_USER_TABLE} WHERE username = ? OR usercode = ? LIMIT 1`,
    ['__samelco_ai__', '__samelco_ai__']
  );
  return Number(fallback?.Id || 0);
};

const fetchUsersByIds = async (ids = []) => {
  const cleanIds = Array.from(new Set(ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
  if (!cleanIds.length) return [];
  const placeholders = cleanIds.map(() => '?').join(',');
  const rows = await appQueryAll(
    `SELECT
       Id AS id,
       COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(username), ''), TRIM(usercode), 'User') AS name,
       TRIM(COALESCE(username, '')) AS username,
       TRIM(COALESCE(usercode, '')) AS usercode,
       TRIM(COALESCE(position, '')) AS position,
       TRIM(COALESCE(department, '')) AS department,
       TRIM(COALESCE(profile_photo_url, '')) AS profile_photo_url
     FROM ${APP_USER_TABLE}
     WHERE Id IN (${placeholders})`,
    cleanIds
  );
  return Promise.all(rows.map((row) => mapUserRow(row)));
};

const normalizeProfiles = (rawProfiles = '') => {
  return String(rawProfiles || '')
    .split('|')
    .filter(Boolean)
    .map((part) => {
      const pieces = String(part).split(':');
      const id = Number(pieces[0] || 0);
      return {
        id,
        name: pieces[1] || 'User',
        usercode: pieces[2] || '',
        position: pieces[3] || '',
        department: pieces[4] || '',
        photo_url: pieces.slice(5).join(':') || '',
      };
    });
};

const conversationTitle = (row, currentUserId) => {
  if (Number(row.IsGroup) === 1 && String(row.ConversationName || '').trim()) {
    return String(row.ConversationName).trim();
  }
  const profiles = normalizeProfiles(row.ParticipantProfiles || '');
  const other = profiles.find((profile) => Number(profile.id) !== Number(currentUserId)) || profiles[0];
  return other?.name || other?.usercode || 'Messenger';
};

const conversationPhoto = (row, currentUserId) => {
  const profiles = normalizeProfiles(row.ParticipantProfiles || '');
  const other = profiles.find((profile) => Number(profile.id) !== Number(currentUserId)) || profiles[0];
  return other?.photo_url || '';
};

const conversationOnline = (row, currentUserId) => {
  const profiles = normalizeProfiles(row.ParticipantPresence || '');
  return profiles.some((profile) => Number(profile.id) !== Number(currentUserId) && Number(profile.online) === 1);
};

const buildConversationPayload = async (row, currentUserId, aiUserId = 0) => {
  const profiles = await Promise.all(normalizeProfiles(row.ParticipantProfiles || '').map(async (profile) => ({
    ...profile,
    photo_url: await resolveExistingUploadUrl(profile.photo_url || ''),
  })));
  const participantIds = profiles.map((profile) => Number(profile.id)).filter((value) => Number.isFinite(value) && value > 0);
  const other = profiles.find((profile) => Number(profile.id) !== Number(currentUserId)) || profiles[0];
  const isAiConversation = aiUserId > 0
    && Number(row.IsGroup) !== 1
    && participantIds.length === 2
    && participantIds.includes(Number(currentUserId))
    && participantIds.includes(Number(aiUserId));
  return {
    id: Number(row.ConversationID),
    title: Number(row.IsGroup) === 1 && String(row.ConversationName || '').trim()
      ? String(row.ConversationName).trim()
      : (other?.name || other?.usercode || 'Messenger'),
    is_group: Number(row.IsGroup) === 1,
    last_message: String(row.LastMessage || ''),
    last_sent_at: row.LastSentAt || row.CreatedAt || '',
    unread_count: Number(row.UnreadCount || 0),
    is_online: conversationOnline(row, currentUserId),
    photo_url: other?.photo_url || '',
    profiles,
    is_ai_conversation: isAiConversation,
    participant_ids: participantIds,
  };
};

const requireMessengerParticipant = async (conversationId, userId) => {
  const row = await mQueryOne(
    'SELECT 1 FROM conversationparticipants WHERE ConversationID = ? AND UserID = ? LIMIT 1',
    [conversationId, userId]
  );
  return Boolean(row);
};

const ensureDirectConversation = async (userId, otherUserId) => {
  const existing = await mQueryOne(
    `SELECT c.ConversationID
     FROM conversations c
     WHERE COALESCE(c.IsGroup, 0) = 0
       AND (SELECT COUNT(*) FROM conversationparticipants WHERE ConversationID = c.ConversationID) = 2
       AND EXISTS (SELECT 1 FROM conversationparticipants WHERE ConversationID = c.ConversationID AND UserID = ?)
       AND EXISTS (SELECT 1 FROM conversationparticipants WHERE ConversationID = c.ConversationID AND UserID = ?)
     ORDER BY c.ConversationID DESC
     LIMIT 1`,
    [userId, otherUserId]
  );
  if (existing) {
    return Number(existing.ConversationID);
  }

  const result = await messengerPool.execute(
    'INSERT INTO conversations (ConversationName, IsGroup, CreatedAt) VALUES (?, 0, NOW())',
    [null]
  );
  const conversationId = Number(result[0]?.insertId || 0);
  if (!conversationId) {
    throw new Error('Unable to create conversation.');
  }
  await messengerPool.execute(
    'INSERT INTO conversationparticipants (ConversationID, UserID, JoinedAt) VALUES (?, ?, NOW()), (?, ?, NOW())',
    [conversationId, userId, conversationId, otherUserId]
  );
  return conversationId;
};

const createGroupConversation = async (userId, participantIds = [], conversationName = '') => {
  const uniqueIds = Array.from(
    new Set([userId, ...participantIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)])
  );
  if (uniqueIds.length < 3) {
    throw new Error('Select at least two members to create a group.');
  }

  const participants = await fetchUsersByIds(uniqueIds);
  if (participants.length !== uniqueIds.length) {
    throw new Error('One or more selected employees were not found.');
  }

  const fallbackName = participants
    .filter((person) => Number(person.id) !== Number(userId))
    .slice(0, 3)
    .map((person) => person.name || person.usercode || 'User')
    .join(', ');
  const finalName = String(conversationName || '').trim() || `Group: ${fallbackName || 'New chat'}`;

  const [result] = await messengerPool.execute(
    'INSERT INTO conversations (ConversationName, IsGroup, CreatedAt) VALUES (?, 1, NOW())',
    [finalName]
  );
  const conversationId = Number(result.insertId || 0);
  if (!conversationId) {
    throw new Error('Unable to create group conversation.');
  }

  const placeholders = uniqueIds.map(() => '(?, ?, NOW())').join(', ');
  await messengerPool.execute(
    `INSERT INTO conversationparticipants (ConversationID, UserID, JoinedAt) VALUES ${placeholders}`,
    uniqueIds.flatMap((participantId) => [conversationId, participantId])
  );

  return conversationId;
};

const listConversations = async (userId, aiUserId = 0) => {
  const rows = await mQueryAll(
    `SELECT
        c.ConversationID,
        c.ConversationName,
        c.IsGroup,
        c.CreatedAt,
        (
          SELECT m.SentAt
          FROM messages m
          WHERE m.ConversationID = c.ConversationID
          ORDER BY m.SentAt DESC, m.MessageID DESC
          LIMIT 1
        ) AS LastSentAt,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.ConversationID = c.ConversationID
            AND m.SenderID <> ?
            AND (mine.LastReadAt IS NULL OR m.SentAt > mine.LastReadAt)
        ) AS UnreadCount,
        (
          SELECT m.MessageText
          FROM messages m
          WHERE m.ConversationID = c.ConversationID
          ORDER BY m.SentAt DESC, m.MessageID DESC
          LIMIT 1
        ) AS LastMessage,
        GROUP_CONCAT(DISTINCT CONCAT_WS(':',
          cp.UserID,
          COALESCE(NULLIF(u.name, ''), u.username, u.usercode, ''),
          COALESCE(u.usercode, ''),
          COALESCE(u.position, ''),
          COALESCE(u.department, ''),
          COALESCE(u.profile_photo_url, '')
        ) ORDER BY cp.UserID SEPARATOR '|') AS ParticipantProfiles,
        GROUP_CONCAT(DISTINCT CONCAT(cp.UserID, ':', CASE WHEN up.LastSeenAt >= DATE_SUB(NOW(), INTERVAL ${PRESENCE_ONLINE_SECONDS} SECOND) THEN 1 ELSE 0 END) ORDER BY cp.UserID SEPARATOR '|') AS ParticipantPresence
     FROM conversations c
     INNER JOIN conversationparticipants mine
        ON mine.ConversationID = c.ConversationID AND mine.UserID = ?
     INNER JOIN conversationparticipants cp
        ON cp.ConversationID = c.ConversationID
     LEFT JOIN ${APP_USER_TABLE} u
        ON u.Id = cp.UserID
     LEFT JOIN user_presence up
        ON up.UserID = cp.UserID
     GROUP BY c.ConversationID, c.ConversationName, c.IsGroup, c.CreatedAt, mine.LastReadAt
     ORDER BY COALESCE(LastSentAt, c.CreatedAt) DESC
     LIMIT 50`,
    [userId, userId]
  );

  return Promise.all(rows.map((row) => buildConversationPayload(row, userId, aiUserId)));
};

const listConversationsWithSam = async (userId) => {
  const aiUserId = await getAiUserId();
  if (aiUserId > 0 && aiUserId !== userId) {
    // ponytail: select-then-insert is sufficient for the single Node process; add a
    // canonical participant-pair key if Messenger is ever run by multiple instances.
    await ensureDirectConversation(userId, aiUserId);
  }
  return { items: await listConversations(userId, aiUserId), aiUserId };
};

const loadMessages = async (conversationId, userId) => {
  const messages = await mQueryAll(
    `SELECT *
     FROM (
        SELECT
            m.MessageID,
            m.ConversationID,
            m.SenderID,
            m.MessageText,
            m.ReplyToMessageID,
            m.ForwardedFromMessageID,
            m.SentAt,
            COALESCE(NULLIF(u.name, ''), u.username, u.usercode, 'User') AS SenderName,
            COALESCE(u.profile_photo_url, '') AS SenderPhotoUrl,
            COALESCE(u.usercode, '') AS SenderUserCode,
            COALESCE(u.position, '') AS SenderPosition,
            COALESCE(u.department, '') AS SenderDepartment,
            rm.MessageText AS ReplyToText,
            COALESCE(NULLIF(ru.name, ''), ru.username, ru.usercode, 'User') AS ReplyToSenderName,
            fm.MessageText AS ForwardedFromText,
            COALESCE(NULLIF(fu.name, ''), fu.username, fu.usercode, 'User') AS ForwardedFromSenderName
         FROM messages m
         LEFT JOIN ${APP_USER_TABLE} u
            ON u.Id = m.SenderID
         LEFT JOIN messages rm
            ON rm.MessageID = m.ReplyToMessageID
         LEFT JOIN ${APP_USER_TABLE} ru
            ON ru.Id = rm.SenderID
         LEFT JOIN messages fm
            ON fm.MessageID = m.ForwardedFromMessageID
         LEFT JOIN ${APP_USER_TABLE} fu
            ON fu.Id = fm.SenderID
         WHERE m.ConversationID = ?
         ORDER BY m.SentAt DESC, m.MessageID DESC
         LIMIT 80
     ) recent_messages
     ORDER BY SentAt ASC, MessageID ASC`,
    [conversationId]
  );

  if (!messages.length) {
    return [];
  }

  const messageIds = messages.map((item) => Number(item.MessageID)).filter((value) => Number.isFinite(value) && value > 0);
  const attachmentsByMessage = new Map();
  if (messageIds.length) {
    const placeholders = messageIds.map(() => '?').join(',');
    const attachments = await mQueryAll(
      `SELECT AttachmentID, MessageID, Type, URL, FileName, FileSize, CreatedAt
       FROM attachments
       WHERE MessageID IN (${placeholders})
       ORDER BY AttachmentID ASC`,
      messageIds
    );
    for (const attachment of attachments) {
      const key = Number(attachment.MessageID);
      if (!attachmentsByMessage.has(key)) {
        attachmentsByMessage.set(key, []);
      }
      attachmentsByMessage.get(key).push(attachment);
    }
  }

  const reactionsByMessage = new Map();
  if (messageIds.length) {
    const placeholders = messageIds.map(() => '?').join(',');
    const reactions = await mQueryAll(
      `SELECT MessageID, Reaction, COUNT(*) AS ReactionCount, MAX(CASE WHEN UserID = ? THEN 1 ELSE 0 END) AS Mine
       FROM message_reactions
       WHERE MessageID IN (${placeholders})
       GROUP BY MessageID, Reaction
       ORDER BY ReactionCount DESC, Reaction ASC`,
      [userId, ...messageIds]
    );
    const reactionEmojiMap = {
      like: '👍',
      heart: '❤️',
      laugh: '😂',
      wow: '😮',
      sad: '😢',
      pray: '🙏',
    };
    for (const reaction of reactions) {
      const key = Number(reaction.MessageID);
      if (!reactionsByMessage.has(key)) {
        reactionsByMessage.set(key, []);
      }
      reactionsByMessage.get(key).push({
        Reaction: reactionEmojiMap[String(reaction.Reaction)] || String(reaction.Reaction),
        Count: Number(reaction.ReactionCount || 0),
        Mine: Boolean(reaction.Mine),
      });
    }
  }

  const mappedAttachments = new Map();
  await Promise.all(Array.from(attachmentsByMessage.entries()).map(async ([messageId, attachments]) => {
    const cleaned = [];
    for (const attachment of attachments) {
      const url = await resolveExistingUploadUrl(attachment.URL || '');
      if (url) {
        cleaned.push({ ...attachment, URL: url });
      }
    }
    mappedAttachments.set(messageId, cleaned);
  }));

  return Promise.all(messages.map(async (message) => ({
    ...message,
    SenderPhotoUrl: await resolveExistingUploadUrl(message.SenderPhotoUrl || ''),
    Attachments: mappedAttachments.get(Number(message.MessageID)) || [],
    Reactions: reactionsByMessage.get(Number(message.MessageID)) || [],
  })));
};

const sendChatMessage = async (conversationId, senderId, message, replyToMessageId = 0) => {
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new Error('Message must be 1000 characters or fewer.');
  }

  if (!(await requireMessengerParticipant(conversationId, senderId))) {
    throw new Error('You are not a participant in this conversation.');
  }

  if (replyToMessageId > 0) {
    const reply = await mQueryOne(
      'SELECT MessageID FROM messages WHERE MessageID = ? AND ConversationID = ? LIMIT 1',
      [replyToMessageId, conversationId]
    );
    if (!reply) {
      throw new Error('The message you are replying to is not available.');
    }
  } else {
    replyToMessageId = null;
  }

  const [result] = await messengerPool.execute(
    'INSERT INTO messages (ConversationID, SenderID, MessageText, ReplyToMessageID) VALUES (?, ?, ?, ?)',
    [conversationId, senderId, message, replyToMessageId]
  );

  return Number(result.insertId || 0);
};

const saveImageAttachment = async (conversationId, senderId, message, file) => {
  if (!file || !file.buffer) {
    throw new Error('Select an image to send.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be 2MB or smaller.');
  }

  await fs.mkdir(MESSENGER_UPLOAD_ROOT, { recursive: true });
  const safeName = `${Date.now()}_${String(file.originalname || 'image').replace(/[^a-zA-Z0-9_.-]+/g, '_')}`;
  const absPath = path.join(MESSENGER_UPLOAD_ROOT, safeName);
  await fs.writeFile(absPath, file.buffer);
  const url = `/uploads/messenger/${safeName}`;

  const messageId = await sendChatMessage(conversationId, senderId, message || '', 0);
  await messengerPool.execute(
    'INSERT INTO attachments (MessageID, Type, URL, FileName, FileSize, CreatedAt) VALUES (?, ?, ?, ?, ?, NOW())',
    [messageId, 'image', url, file.originalname || safeName, file.size || null]
  );

  return { messageId, url };
};

const parseAction = (req) => String(req.query.action || req.body?.action || '').trim().toLowerCase();

router.all('/', upload.single('image'), async (req, res, next) => {
  try {
    const action = parseAction(req);
    if (!action) {
      return next();
    }

    const userId = await getUserId(req);
    if (!userId) {
      return badRequestResponse(res, 'Login session is required.');
    }

    if (action === 'offline') {
      return successResponse(res, { ok: true });
    }

    if (action === 'unread_count') {
      const row = await mQueryOne(
        `SELECT COUNT(*) AS count
         FROM messages m
         INNER JOIN conversationparticipants cp
            ON cp.ConversationID = m.ConversationID
           AND cp.UserID = ?
         WHERE m.SenderID <> ?
           AND (cp.LastReadAt IS NULL OR m.SentAt > cp.LastReadAt)`,
        [userId, userId]
      );
      return successResponse(res, { ok: true, count: Number(row?.count || 0) });
    }

    if (action === 'search_users') {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) {
        return successResponse(res, { ok: true, items: [] });
      }
      const like = `%${q}%`;
      const items = await appQueryAll(
        `SELECT
           Id AS id,
           TRIM(usercode) AS usercode,
           TRIM(COALESCE(name, '')) AS name,
           TRIM(COALESCE(position, '')) AS position,
           TRIM(COALESCE(department, '')) AS department,
           TRIM(COALESCE(profile_photo_url, '')) AS profile_photo_url
         FROM ${APP_USER_TABLE}
         WHERE (usercode LIKE ? OR name LIKE ?)
           AND usercode IS NOT NULL AND TRIM(usercode) <> ''
         ORDER BY name ASC
         LIMIT 40`,
        [like, like]
      );
      return successResponse(res, { ok: true, items: await Promise.all(items.map((row) => mapUserRow(row))) });
    }

    if (action === 'start') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to start a conversation.');
      }
      const otherUserId = Number(req.body?.other_user_id || req.body?.user_id || req.query?.other_user_id || req.query?.user_id || 0);
      if (!otherUserId) {
        return badRequestResponse(res, 'Missing user_id parameter.');
      }
      const otherUser = await fetchUser(otherUserId);
      if (!otherUser) {
        return notFoundResponse(res, 'Employee not found.');
      }
      const conversationId = await ensureDirectConversation(userId, otherUserId);
      return successResponse(res, { ok: true, conversation_id: conversationId });
    }

    if (action === 'create_group') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to create a group.');
      }
      const participantIdsRaw = String(req.body?.participant_ids || req.body?.member_ids || req.body?.user_ids || '').trim();
      const participantIds = participantIdsRaw
        ? participantIdsRaw.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0)
        : [];
      const conversationName = String(req.body?.conversation_name || req.body?.group_name || '').trim();
      const conversationId = await createGroupConversation(userId, participantIds, conversationName);
      return successResponse(res, { ok: true, conversation_id: conversationId });
    }

    if (action === 'list') {
      const { items, aiUserId } = await listConversationsWithSam(userId);
      return successResponse(res, { ok: true, items, ai_user_id: aiUserId });
    }

    if (action === 'messages') {
      const conversationId = Number(req.query.conversation_id || req.body?.conversation_id || 0);
      if (!conversationId) {
        return badRequestResponse(res, 'Missing conversation.');
      }
      if (!(await requireMessengerParticipant(conversationId, userId))) {
        return badRequestResponse(res, 'You are not a participant in this conversation.');
      }
      await messengerPool.execute(
        'UPDATE conversationparticipants SET LastReadAt = NOW() WHERE ConversationID = ? AND UserID = ?',
        [conversationId, userId]
      );
      const items = await loadMessages(conversationId, userId);
      const participants = await mQueryAll(
        'SELECT UserID FROM conversationparticipants WHERE ConversationID = ? ORDER BY UserID',
        [conversationId]
      );
      return successResponse(res, {
        ok: true,
        participants: participants.map((row) => Number(row.UserID)),
        items,
      });
    }

    if (action === 'send') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to send a message.');
      }
      const conversationId = Number(req.body?.conversation_id || req.query?.conversation_id || 0);
      const message = String(req.body?.message || req.query?.message || '').trim();
      const replyToMessageId = Number(req.body?.reply_to_message_id || 0);
      if (!conversationId || !message) {
        return badRequestResponse(res, 'Message and conversation are required.');
      }
      const messageId = await sendChatMessage(conversationId, userId, message, replyToMessageId);
      return successResponse(res, { ok: true, message_id: messageId, ai_replied: false });
    }

    if (action === 'send_image') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to send an image.');
      }
      const conversationId = Number(req.body?.conversation_id || 0);
      const message = String(req.body?.message || '').trim();
      if (!conversationId) {
        return badRequestResponse(res, 'Missing conversation.');
      }
      if (!(await requireMessengerParticipant(conversationId, userId))) {
        return badRequestResponse(res, 'You are not a participant in this conversation.');
      }
      const { messageId, url } = await saveImageAttachment(conversationId, userId, message, req.file);
      return successResponse(res, { ok: true, message_id: messageId, attachment_url: url });
    }

    if (action === 'forward') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to forward a message.');
      }
      const targetConversationId = Number(req.body?.conversation_id || 0);
      const sourceMessageId = Number(req.body?.message_id || 0);
      if (!targetConversationId || !sourceMessageId) {
        return badRequestResponse(res, 'Message and target conversation are required.');
      }
      if (!(await requireMessengerParticipant(targetConversationId, userId))) {
        return forbiddenResponse(res, 'You are not a participant in this conversation.');
      }
      const source = await mQueryOne(
        `SELECT m.MessageText
         FROM messages m
         INNER JOIN conversationparticipants cp
            ON cp.ConversationID = m.ConversationID
           AND cp.UserID = ?
         WHERE m.MessageID = ?
         LIMIT 1`,
        [userId, sourceMessageId]
      );
      if (!source) {
        return notFoundResponse(res, 'Message to forward was not found.');
      }
      const newMessageId = await sendChatMessage(targetConversationId, userId, String(source.MessageText || '[Forwarded message]'));
      const attachments = await mQueryAll(
        'SELECT Type, URL, FileName, FileSize FROM attachments WHERE MessageID = ? ORDER BY AttachmentID ASC',
        [sourceMessageId]
      );
      for (const attachment of attachments) {
        await messengerPool.execute(
          'INSERT INTO attachments (MessageID, Type, URL, FileName, FileSize, CreatedAt) VALUES (?, ?, ?, ?, ?, NOW())',
          [newMessageId, attachment.Type, attachment.URL, attachment.FileName, attachment.FileSize]
        );
      }
      return successResponse(res, { ok: true, message_id: newMessageId });
    }

    if (action === 'react') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to react to a message.');
      }
      const messageId = Number(req.body?.message_id || 0);
      const reaction = String(req.body?.reaction || '').trim();
      const allowed = {
        like: 'like',
        heart: 'heart',
        laugh: 'laugh',
        wow: 'wow',
        sad: 'sad',
        pray: 'pray',
        [String.fromCodePoint(0x1F44D)]: 'like',
        [String.fromCodePoint(0x2764, 0xFE0F)]: 'heart',
        [String.fromCodePoint(0x1F602)]: 'laugh',
        [String.fromCodePoint(0x1F62E)]: 'wow',
        [String.fromCodePoint(0x1F622)]: 'sad',
        [String.fromCodePoint(0x1F64F)]: 'pray',
      };
      const normalizedReaction = String(reaction || '').trim();
      const reactionCode = allowed[reaction] || allowed[normalizedReaction] || normalizedReaction;
      if (!messageId || !reactionCode) {
        return badRequestResponse(res, 'Choose a valid reaction.');
      }
      const accessibleMessage = await mQueryOne(
        `SELECT 1 AS ok
         FROM messages m
         INNER JOIN conversationparticipants cp
            ON cp.ConversationID = m.ConversationID
           AND cp.UserID = ?
         WHERE m.MessageID = ?
         LIMIT 1`,
        [userId, messageId]
      );
      if (!accessibleMessage) {
        return forbiddenResponse(res, 'You are not a participant in this conversation.');
      }
      const existing = await mQueryOne(
        'SELECT Reaction FROM message_reactions WHERE MessageID = ? AND UserID = ? LIMIT 1',
        [messageId, userId]
      );
      if (existing && String(existing.Reaction) === reactionCode) {
        await messengerPool.execute('DELETE FROM message_reactions WHERE MessageID = ? AND UserID = ?', [messageId, userId]);
      } else {
        await messengerPool.execute(
          `INSERT INTO message_reactions (MessageID, UserID, Reaction, CreatedAt)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE Reaction = VALUES(Reaction), CreatedAt = VALUES(CreatedAt)`,
          [messageId, userId, reactionCode]
        );
      }
      return successResponse(res, { ok: true });
    }

    if (action === 'delete_conversation') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to delete a conversation.');
      }
      const conversationId = Number(req.body?.conversation_id || 0);
      if (!conversationId) {
        return badRequestResponse(res, 'Missing conversation.');
      }
      if (!(await requireMessengerParticipant(conversationId, userId))) {
        return badRequestResponse(res, 'You are not a participant in this conversation.');
      }
      await messengerPool.execute('DELETE FROM conversations WHERE ConversationID = ? LIMIT 1', [conversationId]);
      return successResponse(res, { ok: true, message: 'Conversation deleted.' });
    }

    if (action === 'start_call') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to start a call.');
      }
      const conversationId = Number(req.body?.conversation_id || 0);
      const callType = String(req.body?.call_type || 'audio').trim().toLowerCase();
      if (!conversationId) {
        return badRequestResponse(res, 'Missing conversation.');
      }
      if (!(await requireMessengerParticipant(conversationId, userId))) {
        return badRequestResponse(res, 'You are not a participant in this conversation.');
      }
      const [result] = await messengerPool.execute(
        'INSERT INTO call_sessions (ConversationID, CallerID, CallType, Status, StartedAt) VALUES (?, ?, ?, "active", NOW())',
        [conversationId, userId, callType]
      );
      return successResponse(res, { ok: true, call_id: Number(result.insertId || 0) });
    }

    if (action === 'end_call') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Use POST to end a call.');
      }
      const callId = Number(req.body?.call_id || 0);
      if (!callId) {
        return badRequestResponse(res, 'Missing call_id.');
      }
      const [result] = await messengerPool.execute(
        `UPDATE call_sessions cs
         INNER JOIN conversationparticipants cp
            ON cp.ConversationID = cs.ConversationID
           AND cp.UserID = ?
         SET cs.Status = "ended", cs.EndedAt = NOW()
         WHERE cs.CallID = ?`,
        [userId, callId]
      );
      if (!result.affectedRows) {
        return forbiddenResponse(res, 'You are not authorized to end this call.');
      }
      return successResponse(res, { ok: true });
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
});

router.get('/list', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return badRequestResponse(res, 'Login session is required.');
    const { items, aiUserId } = await listConversationsWithSam(userId);
    return successResponse(res, { ok: true, items, ai_user_id: aiUserId });
  } catch (error) {
    next(error);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return badRequestResponse(res, 'Login session is required.');
    const conversationId = Number(req.query.conversation_id || 0);
    if (!conversationId) return badRequestResponse(res, 'Missing conversation.');
    if (!(await requireMessengerParticipant(conversationId, userId))) {
      return badRequestResponse(res, 'You are not a participant in this conversation.');
    }
    const items = await loadMessages(conversationId, userId);
    const participants = await mQueryAll(
      'SELECT UserID FROM conversationparticipants WHERE ConversationID = ? ORDER BY UserID',
      [conversationId]
    );
    return successResponse(res, {
      ok: true,
      participants: participants.map((row) => Number(row.UserID)),
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return badRequestResponse(res, 'Login session is required.');
    const conversationId = Number(req.body?.conversation_id || 0);
    const message = String(req.body?.message || '').trim();
    if (!conversationId || !message) {
      return badRequestResponse(res, 'Message and conversation are required.');
    }
    const messageId = await sendChatMessage(conversationId, userId, message, Number(req.body?.reply_to_message_id || 0));
    return successResponse(res, { ok: true, message_id: messageId, ai_replied: false });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

