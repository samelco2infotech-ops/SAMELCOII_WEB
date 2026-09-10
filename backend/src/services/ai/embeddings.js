/**
 * Local semantic embeddings for SAM memory.
 *
 * The embedding model is deliberately separate from the chat model. Exact and
 * keyword brain recall remain first; this service is only the semantic fallback.
 */
const config = require('../../config/env');

const TIMEOUT_MS = 30000;

function embeddingConfig() {
  return {
    enabled: config.ai.embedding?.enabled !== false,
    baseUrl: config.ai.embedding?.baseUrl || config.ai.ollama.baseUrl,
    model: config.ai.embedding?.model || 'nomic-embed-text',
    indexVersion: `${config.ai.embedding?.model || 'nomic-embed-text'}:raw-v1`,
  };
}

async function embed(input, kind = 'query') {
  const conf = embeddingConfig();
  if (!conf.enabled) return [];

  const values = Array.isArray(input) ? input : [input];
  const prefix = kind === 'document' ? 'search_document: ' : (kind === 'query' ? 'search_query: ' : '');
  const normalized = values.map((value) => `${prefix}${String(value || '').trim()}`);
  if (normalized.some((value) => value === prefix)) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = new URL('/api/embed', `${String(conf.baseUrl).replace(/\/+$/, '')}/`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: conf.model,
        input: normalized,
        truncate: true,
        keep_alive: '5m',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.embeddings)) {
      throw new Error(data?.error || `Embedding error (HTTP ${response.status}).`);
    }
    return Array.isArray(input) ? data.embeddings : (data.embeddings[0] || []);
  } finally {
    clearTimeout(timer);
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : -1;
}

module.exports = {
  embeddingConfig,
  embed,
  cosineSimilarity,
};
