/**
 * Real self-check: Ollama /api/embed + semantic brain recall (semanticRecall).
 * Needs the embedding model (nomic-embed-text) pulled and Ollama reachable.
 * Run: node src/services/ai/embeddings.selfcheck.js
 */
const assert = require('assert');
const db = require('../../config/database');
const { sam } = require('./samDb');
const embeddings = require('./embeddings');
const brain = require('./brain');

async function cleanup() {
  try { await db.queryAll(`DELETE FROM ${sam('sam_brain')} WHERE question LIKE ?`, ['%ZZTEST%']); } catch {}
}

(async () => {
  await cleanup();

  // 1. Ollama /api/embed is reachable and returns a real vector for a single input.
  const vec = await embeddings.embed('how do I request fuel', 'query');
  assert.ok(Array.isArray(vec) && vec.length > 0, 'embed() returns a real vector (Ollama /api/embed reachable)');

  // 2. cosineSimilarity: identical vector -> ~1.
  assert.ok(embeddings.cosineSimilarity(vec, vec) > 0.999, 'cosine similarity of a vector with itself is ~1');

  // 3. Batch input (used by indexBrainEmbeddings.js) returns one vector per input.
  const batch = await embeddings.embed(['fuel request', 'leave request'], 'document');
  assert.strictEqual(batch.length, 2, 'batch embed() returns one vector per input');

  // 4. End-to-end: learnQA indexes an embedding, and a same-language paraphrase with
  // no shared keywords still recalls it via semanticRecall — but a live-data-shaped
  // question (e.g. "how many...") must NOT be answered from the semantic cache.
  const zzQ = `ZZTEST how do I request extra fuel allocation ${Date.now()}`;
  const zzA = 'ZZTEST Answer: submit a fuel request through the Fuel module.';
  await brain.learnQA({ userId: 0, userName: 'zztest', question: zzQ, answer: zzA, source: 'test' });

  const paraphrase = brain.brainNormalize(`ZZTEST how can I ask for additional fuel allocation ${Date.now()}`);
  const recalled = await brain.semanticRecall(paraphrase);
  assert.ok(recalled.includes(zzA), 'a same-language paraphrase with different words recalls the learned answer via embeddings');

  const liveDataShaped = brain.brainNormalize('how many fuel requests are pending today ZZTEST');
  const blocked = await brain.semanticRecall(liveDataShaped);
  assert.strictEqual(blocked, '', 'a live-data-shaped question is never answered from the semantic cache');

  await cleanup();
  console.log('OK — embeddings + semantic brain recall self-check passed');
  await db.close?.();
  process.exit(0);
})().catch(async (e) => { console.error('FAIL:', e.message); await cleanup(); process.exit(1); });
