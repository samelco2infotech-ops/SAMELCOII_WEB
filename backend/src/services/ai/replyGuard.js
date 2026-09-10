/**
 * Self-check pass on the LLM's free-form chat reply — a code-level backstop
 * for the prompt's "NEVER FABRICATE" rule (samPrompt.js), not just a hope that
 * the model follows it. Small local models drift; this catches the specific,
 * damaging failure mode of confidently stating a DOB/address/salary/contact/
 * hire-date that was never actually in the context provided to it.
 *
 * Deliberately narrow: flags a claim only when it names a real value (a date,
 * a number, a phone-shaped string) for one of these specific fields AND that
 * exact value doesn't appear anywhere in the context the model was given.
 * General claims ("I don't have that on file") are never flagged.
 */

const CHECKS = [
  {
    field: 'date of birth',
    re: /\b(?:born|birthday|date of birth|dob)\b[^.\n]{0,30}?(\d{4}-\d{2}-\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b)/i,
  },
  {
    field: 'salary',
    re: /\b(?:salary|compensation|monthly pay)\b[^.\n]{0,30}?(?:₱|php\s?)([\d,]{3,}(?:\.\d+)?)/i,
  },
  {
    field: 'contact number',
    re: /\b(?:contact|phone|mobile|cell)(?:\s+number)?\b[^.\n]{0,20}?(\+?\d[\d\-\s]{7,}\d)/i,
  },
  {
    field: 'hire date',
    re: /\b(?:hired|hire date|date hired)\b[^.\n]{0,30}?(\d{4}-\d{2}-\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b)/i,
  },
];

/**
 * Returns null when the reply is safe, or { field, value } for the first
 * ungrounded claim found.
 */
function findUngroundedClaim(reply, context) {
  const text = String(reply || '');
  const ctx = String(context || '');
  for (const { field, re } of CHECKS) {
    const match = text.match(re);
    if (!match) continue;
    const value = match[1].trim();
    if (!ctx.includes(value)) {
      return { field, value };
    }
  }
  return null;
}

const SAFE_FALLBACK = "I don't have that specific detail on file, so I don't want to guess. 😊\nAction: Ask your department head or HR to check the official record for this.";

/** Returns the original reply, or a safe fallback + the flagged claim if one was ungrounded. */
function guardReply(reply, context) {
  const claim = findUngroundedClaim(reply, context);
  if (!claim) return { reply, flagged: null };
  return { reply: SAFE_FALLBACK, flagged: claim };
}

module.exports = { findUngroundedClaim, guardReply };
