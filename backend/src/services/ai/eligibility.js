/**
 * Eligibility reasoning agent — answers "can I…?" BEFORE the employee files.
 * e.g. "can I file 5 days vacation leave?" → checks their VL balance and says yes/no.
 *
 * Runs BEFORE the action agent so a QUESTION ("can I file…") is answered, while a
 * COMMAND ("file a vacation leave 2026-08-01") still routes to the action agent.
 * Read-only, self-scoped — reuses meService.getLeaveBalance.
 */

// Interrogative cues that mean "check, don't do".
const ASKS = /\b(can i|could i|am i eligible|do i have (enough|any)|may i|how many .*(leave|vl|sl|vacation|sick).*(left|remaining)|enough (leave|vl|sl|credits?))\b/i;
const LEAVE_TOPIC = /\b(leave|vl|sl|ol|vacation|sick|day-?off|absence|credits?)\b/i;

function wantsLeaveEligibility(message) {
  const m = String(message || '');
  return ASKS.test(m) && LEAVE_TOPIC.test(m);
}

function leaveKind(m) {
  if (/\bsick\b|\bsl\b/i.test(m)) return { key: 'sick_leave', label: 'Sick Leave' };
  if (/\bvacation\b|\bvl\b/i.test(m)) return { key: 'vacation_leave', label: 'Vacation Leave' };
  if (/\b(other|ol|emergency)\b/i.test(m)) return { key: 'other_leave', label: 'Other Leave' };
  return null;
}

/** Returns a reply string, or null if this isn't an eligibility question. */
async function eligibilityReply(user, message, deps) {
  if (!wantsLeaveEligibility(message)) return null;

  const bal = await deps.meService.getLeaveBalance(user.usercode);
  const kind = leaveKind(message);
  const nMatch = String(message).match(/\b(\d+(?:\.\d+)?)\b/);
  const requested = nMatch ? Number(nMatch[1]) : null;

  // Specific check: "can I file N days of <kind> leave?"
  if (kind && requested !== null) {
    const have = Number(bal[kind.key]) || 0;
    if (have >= requested) {
      return `Yes! ✅ You have **${have} ${kind.label}** credit(s), enough to file **${requested} day(s)**. After filing you'd have ${have - requested} left. Want me to file it?`;
    }
    return `Not quite 😔 — you have **${have} ${kind.label}** credit(s), but you're asking for **${requested} day(s)** (short by ${requested - have}). Action: file fewer days, or check with HR about your balance.`;
  }

  // General: just report the balances.
  return `Here are your leave credits, ${user.name || 'kaibigan'}: 😊\n` +
    `• Vacation: **${Number(bal.vacation_leave) || 0}**\n` +
    `• Sick: **${Number(bal.sick_leave) || 0}**\n` +
    `• Other: **${Number(bal.other_leave) || 0}**\n` +
    `Tell me how many days you want to file and I'll check if you're covered.`;
}

module.exports = { eligibilityReply, wantsLeaveEligibility, leaveKind };
