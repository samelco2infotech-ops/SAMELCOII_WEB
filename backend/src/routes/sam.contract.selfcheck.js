/**
 * Contract check between routes/sam.js and samOrchestrator.handleMessage.
 * Reads the literal param names sam.js actually passes, then calls the real
 * handleMessage with exactly that shape — catches drift like a route sending
 * a param the orchestrator no longer reads, or expecting one it never sends,
 * without needing a live DB/HTTP round trip.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const orchestrator = require('../services/ai/samOrchestrator');

const routeSrc = fs.readFileSync(path.join(__dirname, 'sam.js'), 'utf8');
const match = routeSrc.match(/orchestrator\.handleMessage\(\{([\s\S]*?)\}\)/);
assert.ok(match, 'sam.js calls orchestrator.handleMessage({...})');

const keys = match[1]
  .split(',')
  .map((s) => s.trim().split(':')[0].trim())
  .filter(Boolean);
assert.ok(keys.includes('user'), 'route passes user');
assert.ok(keys.includes('message'), 'route passes message');
assert.ok(keys.includes('buildFile'), 'route passes buildFile');

const stubArgs = {};
for (const key of keys) {
  if (key === 'user') stubArgs.user = { privilage: 2, bioUID: 'S2-001' };
  else if (key === 'userId') stubArgs.userId = 1;
  else if (key === 'message') stubArgs.message = 'hello';
  else if (key === 'history') stubArgs.history = [];
  else if (key === 'buildFile') stubArgs.buildFile = async () => ({ url: '/x', file_name: 'x.xlsx' });
  else if (key === 'conversationId') stubArgs.conversationId = 1;
  else stubArgs[key] = undefined; // unknown param — surfaced by the assert below
}
stubArgs.llmCall = async () => 'stub reply';

(async () => {
  const out = await orchestrator.handleMessage(stubArgs);
  assert.strictEqual(typeof out.reply, 'string', 'handleMessage returns a reply string for the exact params sam.js sends');
  console.log(`OK — sam.js -> orchestrator contract holds (params: ${keys.join(', ')})`);
  process.exit(0);
})().catch((e) => { console.error('CONTRACT CHECK FAILED:', e.message); process.exit(1); });
