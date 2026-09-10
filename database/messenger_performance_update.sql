-- Messenger SQL notes: guide ito sa performance update ng message tables.
USE `messenger`;

SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'messages'
    AND INDEX_NAME = 'idx_messages_conversation_sent'
);

SET @sql := IF(
  @index_exists = 0,
  'CREATE INDEX idx_messages_conversation_sent ON messages (ConversationID, SentAt, MessageID)',
  'SELECT ''Index idx_messages_conversation_sent already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'messages'
    AND INDEX_NAME = 'idx_messages_unread'
);

SET @sql := IF(
  @index_exists = 0,
  'CREATE INDEX idx_messages_unread ON messages (ConversationID, SenderID, SentAt)',
  'SELECT ''Index idx_messages_unread already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
