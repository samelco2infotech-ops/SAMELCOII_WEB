/**
 * Offline self-check for replyGuard — no DB, no network.
 * Run: node src/services/ai/replyGuard.selfcheck.js
 */
const assert = require('assert');
const { findUngroundedClaim, guardReply } = require('./replyGuard');

// Ungrounded DOB claim — nothing in context backs it up.
const dobClaim = findUngroundedClaim('She was born on 1990-04-12 in Catbalogan.', '');
assert.ok(dobClaim && dobClaim.field === 'date of birth', 'flags a DOB claim not present in context');

// Same DOB, but it IS actually in the context — must NOT flag.
const groundedDob = findUngroundedClaim('She was born on 1990-04-12.', 'DOB: 1990-04-12');
assert.strictEqual(groundedDob, null, 'does not flag a DOB that is actually in context');

// Ordinary replies with no PII claims must never be flagged.
assert.strictEqual(findUngroundedClaim('Your fuel request is pending approval. 😊', ''), null, 'plain reply not flagged');
assert.strictEqual(findUngroundedClaim("I don't have that specific information on file.", ''), null, 'a refusal is not itself flagged');

// Salary and contact number checks.
const salary = findUngroundedClaim('Their salary is ₱25,000 monthly.', '');
assert.ok(salary && salary.field === 'salary', 'flags an ungrounded salary claim');
const contact = findUngroundedClaim('Their contact number is 09171234567.', '');
assert.ok(contact && contact.field === 'contact number', 'flags an ungrounded contact number');

// guardReply() end-to-end: swaps in the safe fallback and reports what was flagged.
const blocked = guardReply('Born on 1990-04-12, lives in Manila.', '');
assert.ok(blocked.flagged && blocked.flagged.field === 'date of birth', 'guardReply reports the flagged field');
assert.ok(/don't have that specific detail/i.test(blocked.reply), 'guardReply swaps in the safe fallback text');

const passed = guardReply('Here is your fuel report. 😊', '');
assert.strictEqual(passed.flagged, null, 'guardReply passes through a clean reply unchanged');
assert.strictEqual(passed.reply, 'Here is your fuel report. 😊', 'unmodified reply text');

console.log('OK — replyGuard self-check passed (ungrounded PII detection + grounded pass-through + safe fallback)');
