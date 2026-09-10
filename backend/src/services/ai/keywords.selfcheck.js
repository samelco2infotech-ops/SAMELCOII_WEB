/**
 * Offline self-check for keywords.js — no DB, no network.
 * Regression test for a real production bug (2026-07-29): a verbose DTR request
 * ("...name and time in and put a color whos late and erly all employess by
 * department") got wrongly treated as a name/department search filter for the
 * literal words "name", "put", "color", "whos", and the typo "employess" —
 * wiping out all 237 real rows for that day because no employee is named "color".
 * Run: node src/services/ai/keywords.selfcheck.js
 */
const assert = require('assert');
const { extractReportKeywords, dtrFilterKeywords } = require('./keywords');

// The exact real-world message that caused the bug.
const REAL_BUG_MSG = 'can u generate me a report of DTR of july 20 name and time in and put '
  + 'a color whos late and erly all employess by department';
assert.deepStrictEqual(
  dtrFilterKeywords(REAL_BUG_MSG), [],
  'formatting filler words + typos must not survive as DTR filter keywords'
);

// A genuine department/name search term must still survive (the feature this
// whole mechanism exists for — don't let the fix above break real filtering).
assert.deepStrictEqual(
  extractReportKeywords('fuel report for engineering department'),
  ['engineering'],
  'a real department name is still extracted as a keyword'
);

// Typo-tolerance must not eat short real terms (department codes, etc.) — the
// length>=4 guard in isNearStopWord() exists specifically for this.
assert.deepStrictEqual(
  extractReportKeywords('epass for isd'),
  ['institutional'], // 'isd' survives length>=4 fuzzy-guard, then expandAbbreviations() maps it
  'a short real department code is not fuzzy-matched away'
);

// A single-letter typo of a stopword is dropped ("employess" -> close to "employees").
assert.ok(
  !extractReportKeywords('report for employess').includes('employess'),
  'a one-edit-away typo of a stopword is filtered out'
);

// But a genuinely different word that merely resembles a stopword in length must survive.
assert.deepStrictEqual(
  extractReportKeywords('fuel report for basey'),
  ['basey'],
  'a real, unrelated word is not accidentally fuzzy-matched to an unrelated stopword'
);

console.log('OK — keywords self-check passed (stop-word filtering + typo-tolerance regression)');
