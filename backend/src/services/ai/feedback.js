/**
 * Text-based feedback capture — no reaction-button UI exists anywhere in this
 * app (checked: no reactions table in the DB at all, despite the old PHP-era
 * roadmap claiming it). Building real 👍/👎 buttons means new frontend UI on
 * live's already-diverged script.js — real risk this session has been
 * deliberately avoiding. This gets the same signal from what users already
 * naturally type ("that's wrong", "thanks that helped") with zero UI change.
 */
const POSITIVE_RE = /\b(thanks?|thank you|salamat|that helped|that's right|correct|perfect|great job|good job|ang galing)\b/i;
const NEGATIVE_RE = /\b(wrong|that's not right|incorrect|not correct|mali (yan|iyan)|useless|that's not what i asked|not helpful)\b/i;

/** Returns 'positive' | 'negative' | null. Negative checked first — "thanks but that's wrong" should count as negative. */
function detectFeedbackSignal(message) {
  const text = String(message || '');
  if (NEGATIVE_RE.test(text)) return 'negative';
  if (POSITIVE_RE.test(text)) return 'positive';
  return null;
}

module.exports = { detectFeedbackSignal };
