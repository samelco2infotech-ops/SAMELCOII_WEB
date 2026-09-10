/**
 * Purpose: Centralized, validated Node runtime configuration.
 * EDIT GUIDE: Production secrets belong in backend/.env, never in this file.
 * HUWAG BAGUHIN: Production must fail closed when JWT_SECRET is missing or weak.
 * Tagalog: Pinipigilan nitong umandar ang live API gamit ang madaling hulaan na token secret.
 */
require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'development_secret_key';
const weakJwtSecrets = new Set([
  '',
  'development_secret_key',
  'change_me',
  'changeme',
  'secret',
]);
// ponytail: the exact-match denylist above missed the actual prod .env value —
// `your_super_secret_jwt_key_change_this_in_production` is 53 chars, so it passed the length
// check, and it isn't one of the known short strings, so it slipped past this fail-closed guard
// entirely (a long placeholder is still a placeholder). Catch that shape too, not just exact
// known strings, so the next differently-worded placeholder doesn't repeat this.
const looksLikePlaceholder = /change.?(this|me)|your.?secret|placeholder|example/i.test(jwtSecret);

if (
  nodeEnv === 'production'
  && (jwtSecret.length < 32 || weakJwtSecrets.has(jwtSecret.toLowerCase()) || looksLikePlaceholder)
) {
  throw new Error('JWT_SECRET must be a unique value of at least 32 characters in production.');
}

module.exports = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'it_program',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
  },
  // Consumer masters live on the billing server, separate from Membership/workflow on DB_HOST.
  dbConsumer: {
    host: process.env.CONSUMER_DB_HOST || '192.168.1.100',
    user: process.env.CONSUMER_DB_USER || process.env.DB_USER || 'root',
    password: process.env.CONSUMER_DB_PASS ?? (process.env.DB_PASS || ''),
    port: parseInt(process.env.CONSUMER_DB_PORT, 10) || 3306,
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    connectTimeout: parseInt(process.env.CONSUMER_DB_TIMEOUT_MS, 10) || 5000,
  },
  // DTR corrections and tamper-evident print records remain isolated on the audit MySQL service.
  dbDtrAudit: {
    host: process.env.DTR_AUDIT_DB_HOST || '127.0.0.1',
    user: process.env.DTR_AUDIT_DB_USER || 'root',
    password: process.env.DTR_AUDIT_DB_PASS || '',
    database: process.env.DTR_AUDIT_DB_NAME || 'it_program',
    port: parseInt(process.env.DTR_AUDIT_DB_PORT, 10) || 3307,
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    connectTimeout: parseInt(process.env.DTR_AUDIT_DB_TIMEOUT_MS, 10) || 5000,
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv,
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: '7d',
  },
  uploads: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 160000,
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  app: {
    name: process.env.APP_NAME || 'SAMELCII',
    webPrefix: process.env.APP_WEB_PREFIX || '/SAMELCII_WEB_SYSTEM',
  },
  ai: {
    // Tagalog: Ollama ang default para lahat ng SAM users ay dumaan sa lokal na AI server.
    provider: (process.env.AI_PROVIDER || 'ollama').toLowerCase(),
    ollama: {
      baseUrl: process.env.AI_OLLAMA_URL || 'http://192.168.2.119:11434',
      model: process.env.AI_OLLAMA_MODEL || 'llama3:8b',
    },
    embedding: {
      enabled: String(process.env.AI_EMBEDDING_ENABLED || 'true').toLowerCase() !== 'false',
      baseUrl: process.env.AI_EMBEDDING_URL || process.env.AI_OLLAMA_URL || 'http://192.168.2.119:11434',
      model: process.env.AI_EMBEDDING_MODEL || 'nomic-embed-text',
    },
    groq: {
      apiKey: process.env.AI_GROQ_API_KEY || '',
      model: process.env.AI_GROQ_MODEL || 'llama-3.3-70b-versatile',
      placeholder: 'YOUR_GROQ_API_KEY_HERE',
    },
    gemini: {
      apiKey: process.env.AI_GEMINI_API_KEY || '',
      model: process.env.AI_GEMINI_MODEL || 'gemini-2.0-flash',
      placeholder: 'YOUR_GEMINI_API_KEY_HERE',
    },
    anthropic: {
      apiKey: process.env.AI_ANTHROPIC_API_KEY || '',
      model: process.env.AI_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      placeholder: 'YOUR_ANTHROPIC_API_KEY_HERE',
    },
  },
  // Relational messenger DB (conversations/messages), distinct from it_program.
  dbMessenger: process.env.DB_MESSENGER || 'messenger',

  // Read-only connection for SAM's query agent. Point DB_RO_USER at a MySQL user
  // GRANTed only SELECT (see docs/SAM_QUERY_AGENT.md) so the agent is STRUCTURALLY
  // unable to write. Falls back to the main creds if unset (code guard still applies,
  // but you lose the DB-level guarantee — set these in production).
  dbRead: {
    host: process.env.DB_RO_HOST || process.env.DB_HOST || 'localhost',
    user: process.env.DB_RO_USER || process.env.DB_USER || 'root',
    password: process.env.DB_RO_PASS ?? (process.env.DB_PASS || ''),
    database: process.env.DB_NAME || 'it_program',
    port: parseInt(process.env.DB_RO_PORT || process.env.DB_PORT, 10) || 3306,
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    isDedicated: !!process.env.DB_RO_USER, // false ⇒ using fallback creds
  },
};
