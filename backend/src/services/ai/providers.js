/**
 * SAM AI providers — Node port of the provider clients in api/ai_chat.php
 * (callGroqAPI / callGeminiAPI / callClaudeAPI + dispatcher). Uses the global
 * fetch in Node 18+, so no SDK/dependency is added. Each call throws on failure;
 * the caller decides whether to fall back to keyword/knowledge replies.
 * EDIT GUIDE: Add provider HTTP clients here and runtime values in config/env.js.
 * HUWAG BAGUHIN: Provider failures must throw so SAM can use its safe fallback.
 * Tagalog: Ollama ang lokal na default; optional pa rin ang cloud providers.
 */
const config = require('../../config/env');

const TIMEOUT_MS = 120000;

/** fetch with an AbortController timeout so a slow provider can't hang a request. */
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the active provider into { provider, apiKey, model, placeholder }. */
function resolveProvider() {
  const p = config.ai.provider;
  const conf = config.ai[p] || config.ai.anthropic;
  return { provider: config.ai[p] ? p : 'anthropic', ...conf };
}

/** True when the given provider name has a real (non-empty, non-placeholder) key. */
function isProviderConfigured(name) {
  const conf = config.ai[name];
  if (!conf) return false;
  if (name === 'ollama') return Boolean(conf.baseUrl && conf.model);
  return conf.apiKey !== '' && conf.apiKey !== conf.placeholder;
}

/** True when the active provider has a real (non-empty, non-placeholder) key. */
function isConfigured() {
  return isProviderConfigured(resolveProvider().provider);
}

// ponytail: fixed priority order for automatic fallback — local Ollama first
// (free, private), then whichever cloud keys happen to be filled in. A single
// hardcoded order, not per-task routing (#21 in the upgrade doc) — that needs
// real usage data first to be worth the complexity.
const FALLBACK_ORDER = ['ollama', 'groq', 'gemini', 'anthropic'];
let lastUsedProvider = '';

/** Which provider actually answered the most recent callConfiguredAI() call. */
function getLastUsedProvider() {
  return lastUsedProvider;
}

// Ollama / local Llama
// Tagalog: Dito ipinapadala ang SAM prompt sa lokal na Ollama server.
async function callOllama(baseUrl, model, systemPrompt, messages) {
  if (!baseUrl || !model) {
    throw new Error('SAM is not configured: set AI_OLLAMA_URL and AI_OLLAMA_MODEL.');
  }

  const url = new URL('/api/chat', `${String(baseUrl).replace(/\/+$/, '')}/`);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SAM Ollama URL must use HTTP or HTTPS.');
  }

  const chatMessages = [{ role: 'system', content: systemPrompt }, ...messages.map((m) => ({
    role: String(m.role),
    content: String(m.content),
  }))];
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      stream: false,
      // ponytail: num_predict caps runaway generation (small local models can loop/
      // ramble with no stop condition — this was the actual cause of the "too long,
      // repeats itself in two languages" replies). keep_alive avoids a cold-load
      // delay on every request by keeping the model resident between calls.
      options: { temperature: 0.7, num_predict: 220 },
      keep_alive: '30m',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.message?.content) {
    throw new Error(data?.error || `Ollama error (HTTP ${res.status}).`);
  }
  return String(data.message.content).trim();
}

// ── Groq / Llama (OpenAI-compatible) ────────────────────────────────────────
async function callGroq(apiKey, model, systemPrompt, messages) {
  if (!apiKey || apiKey === 'YOUR_GROQ_API_KEY_HERE') {
    throw new Error('SAM is not configured: set AI_GROQ_API_KEY.');
  }
  const chatMessages = [{ role: 'system', content: systemPrompt }, ...messages.map((m) => ({
    role: String(m.role),
    content: String(m.content),
  }))];

  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: chatMessages, max_tokens: 1024, temperature: 0.7 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.choices?.[0]?.message?.content) {
    throw new Error(data?.error?.message || `Groq error (HTTP ${res.status}).`);
  }
  return String(data.choices[0].message.content).trim();
}

// ── Google Gemini ───────────────────────────────────────────────────────────
async function callGemini(apiKey, model, systemPrompt, messages) {
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    throw new Error('SAM is not configured: set AI_GEMINI_API_KEY.');
  }
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content) }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini error (HTTP ${res.status}).`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (text === '') {
    const blocked = data?.candidates?.[0]?.finishReason || '';
    throw new Error(blocked ? `Gemini returned no text (${blocked}).` : 'Gemini returned an empty reply.');
  }
  return String(text).trim();
}

// ── Anthropic Claude ────────────────────────────────────────────────────────
async function callClaude(apiKey, model, systemPrompt, messages) {
  if (!apiKey || apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
    throw new Error('SAM is not configured: set AI_ANTHROPIC_API_KEY.');
  }
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.content?.[0]?.text) {
    throw new Error(data?.error?.message || `AI service error (HTTP ${res.status}).`);
  }
  return String(data.content[0].text).trim();
}

/**
 * Merge consecutive same-role messages and guarantee the history starts with a
 * user turn — required by Claude and harmless for the others. Mirrors
 * mergeConsecutiveRoles() in ai_chat.php.
 */
function mergeConsecutiveRoles(messages) {
  const merged = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += `\n${msg.content}`;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }
  if (merged.length && merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: 'Hello' });
  }
  return merged.length ? merged : [{ role: 'user', content: 'Hello' }];
}

async function callByName(provider, systemPrompt, history) {
  const conf = config.ai[provider];
  switch (provider) {
    case 'ollama':
      return callOllama(conf.baseUrl, conf.model, systemPrompt, history);
    case 'gemini':
      return callGemini(conf.apiKey, conf.model, systemPrompt, history);
    case 'groq':
      return callGroq(conf.apiKey, conf.model, systemPrompt, history);
    default:
      return callClaude(conf.apiKey, conf.model, systemPrompt, history);
  }
}

/**
 * Call the configured provider; on failure, fall through FALLBACK_ORDER to the
 * next configured provider instead of failing the whole request. Throws only
 * when every configured provider has been tried and failed.
 * ponytail: each attempt uses the full TIMEOUT_MS (120s), so worst case is
 * (configured providers × 120s) before the final apology reply. Fine while only
 * 2-3 providers are ever configured at once; if that grows, give fallback
 * attempts a shorter timeout than the primary call.
 */
async function callConfiguredAI(systemPrompt, messages) {
  const primary = resolveProvider().provider;
  const history = mergeConsecutiveRoles(messages);

  const order = [primary, ...FALLBACK_ORDER.filter((p) => p !== primary)]
    .filter((p) => isProviderConfigured(p));

  let lastErr;
  for (const provider of order) {
    try {
      const reply = await callByName(provider, systemPrompt, history);
      lastUsedProvider = provider;
      return reply;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No AI provider is configured.');
}

module.exports = {
  resolveProvider,
  isConfigured,
  isProviderConfigured,
  getLastUsedProvider,
  mergeConsecutiveRoles,
  callConfiguredAI,
  // exported for targeted tests
  _callOllama: callOllama,
  _callGroq: callGroq,
  _callGemini: callGemini,
  _callClaude: callClaude,
};
