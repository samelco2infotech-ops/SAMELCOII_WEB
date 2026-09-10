const db = require('../config/database');

const getMessages = async (usercode, limit = 50) => {
  return db.queryAll(
    `SELECT * FROM messenger
     WHERE recipient = ? OR sender = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [usercode, usercode, limit]
  );
};

const sendMessage = async (sender, recipient, message, attachmentUrl = null) => {
  const result = await db.execute(
    `INSERT INTO messenger (sender, recipient, message, attachment_url, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [sender, recipient, message, attachmentUrl]
  );

  return result.affectedRows > 0;
};

module.exports = {
  getMessages,
  sendMessage,
};
