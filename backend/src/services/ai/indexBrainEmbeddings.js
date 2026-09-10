/**
 * One-time/backfill indexer for existing sam_brain questions.
 * Run: node src/services/ai/indexBrainEmbeddings.js
 */
const db = require('../../config/database');
const brain = require('./brain');
const embeddings = require('./embeddings');
const { sam } = require('./samDb');

const BATCH_SIZE = 24;

(async () => {
  await db.createPool();
  await brain.ensureBrainTable();
  const conf = embeddings.embeddingConfig();
  const model = conf.indexVersion;
  const rows = await db.queryAll(
    `SELECT id, search_text FROM ${sam('sam_brain')}
     WHERE embedding_json IS NULL OR embedding_model <> ?
     ORDER BY id ASC`,
    [model]
  );
  console.log(`Indexing ${rows.length} SAM brain question(s) with ${conf.model} (${model})...`);

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const vectors = await embeddings.embed(batch.map((row) => row.search_text), 'raw');
    await Promise.all(batch.map((row, index) => db.queryAll(
      `UPDATE ${sam('sam_brain')}
       SET embedding_json = ?, embedding_model = ?, updated_at = COALESCE(updated_at, NOW())
       WHERE id = ?`,
      [JSON.stringify(vectors[index] || []), model, row.id]
    )));
    console.log(`${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }

  await db.closePool();
  console.log('SAM semantic brain index is ready.');
})().catch(async (error) => {
  console.error(error);
  try { await db.closePool(); } catch {}
  process.exit(1);
});
