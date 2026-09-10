/**
 * Real-DB self-check: feedback-driven brain pruning.
 *
 * Covers the gap this session closed — negative feedback ("that's wrong") used to be
 * logged and forgotten. Now brain.markAnswerBad() lets a repeatedly-flagged cached
 * answer stop being served, and notices.recordFeedbackOnLastReply() hands back the
 * question text so the orchestrator can act on it.
 *
 * PATAKBUHIN: node src/services/ai/brain.feedback.selfcheck.js
 */
const assert = require('assert');
const db = require('../../config/database');
const { sam } = require('./samDb');
const brain = require('./brain');
const notices = require('./notices');

async function cleanup() {
  try { await db.queryAll(`DELETE FROM ${sam('sam_brain')} WHERE question LIKE ?`, ['%ZZTEST%']); } catch {}
  try { await db.queryAll(`DELETE FROM ${sam('ai_audit_log')} WHERE request_text LIKE ?`, ['%ZZTEST%']); } catch {}
}

(async () => {
  await cleanup();
  const zzQ = `ZZTEST brain-prune probe ${Date.now()}`;
  const zzA = 'ZZTEST cached answer for pruning check';

  await brain.learnQA({ userId: 0, userName: 'zztest', question: zzQ, answer: zzA, source: 'test' });
  const before = await brain.recallFromBrain(zzQ);
  assert.ok(before.includes(zzA), 'learned answer is recalled before any negative feedback');

  await brain.markAnswerBad(zzQ);
  const oneFlag = await brain.recallFromBrain(zzQ);
  assert.ok(oneFlag.includes(zzA), 'a single "wrong" flag does not yet suppress the answer');

  await brain.markAnswerBad(zzQ);
  const twoFlags = await brain.recallFromBrain(zzQ);
  assert.strictEqual(twoFlags, '', 'answer stops being recalled once bad_count reaches threshold');

  // notices.recordFeedbackOnLastReply must hand back the flagged question so the
  // orchestrator can find and prune the matching brain row.
  await notices.writeAuditLog({
    conversationId: 424242, userId: -999, user: { name: 'zztest' },
    requestText: `ZZTEST feedback-link probe ${Date.now()}`, replyText: 'some cached reply', attachment: {},
  });
  const flaggedQuestion = await notices.recordFeedbackOnLastReply(424242, -999, 'negative');
  assert.ok(/ZZTEST feedback-link probe/.test(flaggedQuestion), 'recordFeedbackOnLastReply returns the question it flagged');

  // possible_gap: a chat reply that reads like it wanted a report/action but had none
  // handle it should be flagged for admin review — see samOrchestrator's GAP_HINT_RE.
  const gapQ = `ZZTEST possible-gap probe ${Date.now()}`;
  await notices.writeAuditLog({
    conversationId: 0, userId: -999, user: { name: 'zztest' },
    requestText: gapQ, replyText: 'a generic chat reply', attachment: {}, possibleGap: true,
  });
  const gapRow = await db.queryOne(`SELECT possible_gap FROM ${sam('ai_audit_log')} WHERE request_text = ?`, [gapQ]);
  assert.strictEqual(Number(gapRow.possible_gap), 1, 'possible_gap flag is persisted for admin review');

  await cleanup();
  console.log('OK — feedback-driven brain pruning self-check passed (suppress-after-threshold + question hand-back + gap flag)');
  await db.close?.();
  process.exit(0);
})().catch(async (e) => { console.error('FAIL:', e.message); await cleanup(); process.exit(1); });
