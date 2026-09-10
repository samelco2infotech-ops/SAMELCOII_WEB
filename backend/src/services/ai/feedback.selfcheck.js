/**
 * Offline self-check for feedback.js — no DB, no network.
 * Run: node src/services/ai/feedback.selfcheck.js
 */
const assert = require('assert');
const { detectFeedbackSignal } = require('./feedback');

assert.strictEqual(detectFeedbackSignal('thanks that helped a lot'), 'positive', 'thanks -> positive');
assert.strictEqual(detectFeedbackSignal('salamat sam'), 'positive', 'salamat -> positive');
assert.strictEqual(detectFeedbackSignal("that's wrong, not what I asked"), 'negative', 'wrong -> negative');
assert.strictEqual(detectFeedbackSignal('mali iyan'), 'negative', 'Tagalog "mali iyan" -> negative');
assert.strictEqual(detectFeedbackSignal('generate fuel report for april'), null, 'an ordinary request is not feedback');
assert.strictEqual(detectFeedbackSignal('thanks but that is wrong'), 'negative', 'negative wins when both appear ("thanks but wrong")');

console.log('OK — feedback self-check passed (positive/negative/none detection)');
