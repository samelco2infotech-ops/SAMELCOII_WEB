/**
 * SAM orchestration — Node port ng pangunahing daloy ng api/ai_chat.php (linya ~1090-1245).
 *
 * ANG PAGKAKASUNOD-SUNOD AY MAHALAGA. Ganito ang ginagawa ng PHP at dapat pareho:
 *
 *   1. postNotice        — mag-post ng memo (privilege 6-10)
 *   2. showNotices       — ipakita ang mga naka-post na abiso
 *   3. dtrFlexible       — tiyak na petsa / late / on-time na tanong
 *   4. documentTopic     — gumawa ng .docx (memo, sulat, minutes)
 *   5. generateReport    — PDF/Excel/table na ulat
 *   6. universalSearch   — "hanapin ang kahit anong item"
 *   ── kung walang tumugon sa itaas ──
 *   7. brain recall      — dating sagot sa parehong tanong (walang LLM call)
 *   8. LLM               — Groq/Gemini/Claude na may buong konteksto
 *   9. learn + audit     — itala ang natutunan at ang interaksyon
 *
 * Kapag nag-iba ang pagkakasunod, iba ang sasagutin ni SAM. Halimbawa: kung mauuna ang
 * report kaysa DTR, ang "sino ang late noong May 9" ay magiging generic na report at
 * hindi ang tamang DTR na sagot.
 */

const guards = require('./guards');
const providers = require('./providers');
const brain = require('./brain');
const notices = require('./notices');
const analytics = require('./analytics');
const dtrFlex = require('./dtrFlex');
const userHistory = require('./userHistory');
const { reportRows } = require('./reportRows');
const reportRouter = require('./reportRouter');
const samAgent = require('./samAgent');
const userPrefs = require('./userPrefs');
const replyGuard = require('./replyGuard');
const feedback = require('./feedback');
const { buildSystemPrompt } = require('./samPrompt');
const samActions = require('./samActions');
const queryAgent = require('./queryAgent');
const privScope = require('./privScope');
const eligibility = require('./eligibility');
const db = require('../../config/database');
const meService = require('../meService');
const fuelService = require('../fuelService');
const epassService = require('../epassService');
const overtimeService = require('../overtimeService');
const travelService = require('../travelService');

// Deps for the action agent's handlers (DB/service-agnostic → injected here).
const ACTION_DEPS = {
  meService, fuelService, overtimeService, travelService, epassService, db,
};

// "yes / oo / sige" style confirmations, and the marker SAM's confirm prompt leaves.
const AFFIRM_RE = /^(yes|yep|yeah|yup|oo|opo|sige|go|proceed|confirm|okay|ok|sure|do it|please do|tama|oo na|g)\b/i;
const CONFIRM_MARKER = /reply \*\*yes\*\* to proceed/i;

// Clearly data-shaped questions that the read-only query agent should try (org only).
const DATA_CUE_RE = /\b(how many|how much|count|number of|list all|total|average|avg|sum of|highest|lowest|top \d+|breakdown|per department|by department|which department|who has the|show me all)\b/i;

/**
 * Isang hakbang ng daloy. Ang bawat handler ay nagbabalik ng:
 *   { handled: false }                      — hindi ako ang tamang handler, subukan ang susunod
 *   { handled: true, reply, attachment? }   — ito na ang sagot
 */

/**
 * 0: explicit user preferences ("always give me Excel", "always reply in
 * Tagalog", "forget my preferences"). Deliberately requires the word "always"
 * (see userPrefs.detectPreferenceCommand) so an ordinary report request never
 * gets mistaken for a standing preference.
 */
async function stepPreference({ userId, message }) {
  const cmd = userPrefs.detectPreferenceCommand(message);
  if (!cmd) return { handled: false };

  if (cmd.clear) {
    await userPrefs.setPref(userId, { clear: true });
    return { handled: true, reply: 'Done — I cleared your saved preferences. 😊' };
  }
  await userPrefs.setPref(userId, cmd);
  const what = cmd.format ? `send reports as **${cmd.format}**` : `reply in **${cmd.language}**`;
  return { handled: true, reply: `Got it — I'll ${what} from now on. 😊` };
}

/** 1-2: notices (post o ipakita). */
async function stepNotices({ user, userId, message }) {
  const posted = await notices.maybePostNotice({ user, userId, message });
  if (posted.handled) return posted;
  return { handled: false };
}

/** 3: DTR flexible — tiyak na petsa o late/on-time na tanong. */
async function stepDtrFlexible({ user, message, buildFile }) {
  if (!dtrFlex.wantsDtrQuery(message)) return { handled: false };

  const dates = dtrFlex.extractDtrDates(message);
  const statusFilter = dtrFlex.dtrStatusFilter(message);
  const [from, to] = reportRouter.reportDateRange(message);

  const rows = await dtrFlex.dtrFlexRows({ user, dates, from, to, statusFilter, message });
  if (!rows.length) {
    const span = dates.length ? dates.join(', ') : `${from} to ${to}`;
    return {
      handled: true,
      reply: `I could not find any DTR records for ${span}. 😊\nAction: Try a different date, or check if the biometric logs for that day were uploaded.`,
    };
  }

  const label = statusFilter === 'late' ? 'Late' : (statusFilter === 'ontime' ? 'On-time' : 'DTR');
  const span = dates.length ? dates.join(', ') : `${from} to ${to}`;
  const title = `${label} attendance — ${span}`;

  // Kung hiniling ang file (pdf/excel/image), gawin; kung hindi, talahanayan sa chat.
  const format = reportRouter.reportFormat(message);
  if (format && buildFile) {
    if (format === 'excel' && dates.length > 1) {
      const attachments = [];
      for (const date of dates) {
        const dateRows = rows.filter((row) => row.Date === date);
        if (!dateRows.length) continue;
        attachments.push(await buildFile({ title: `${label} attendance - ${date}`, rows: dateRows, format }));
      }
      if (attachments.length) {
        const links = attachments.map((file, index) => `${index + 1}. [${file.file_name}](${file.url})`).join('\n');
        return {
          handled: true,
          reply: `I prepared **${attachments.length} separate DTR Excel file(s)** - one for each requested date.\n${links}`,
          attachment: attachments[0],
        };
      }
    }
    const attachment = await buildFile({ title, rows, format });
    return { handled: true, reply: `Here is the **${title}** (${rows.length} record(s)). 😊`, attachment };
  }
  return { handled: true, reply: formatChatTable(title, rows) };
}

/**
 * 5: report engine — PDF/Excel/table.
 * DALAWANG trigger tulad ng PHP: file request (looksLikeReportRequest) at chat table
 * (wantsChatTableReport). Kulang ang una lang — mahuhulog sa LLM ang "fuel report this year".
 *
 * Also carries topic memory (a terse "now May" / "as image" follow-up inherits the
 * prior report's module/format/dates) and multi-report requests ("fuel and dtr for
 * April" -> one file per module), via samAgent's deterministic intent resolver —
 * same logic already tested in samAgent.selfcheck.js, just reused here instead of
 * left wired to nothing.
 */
async function stepGenerateReport({
  user, userId, message, buildFile, history = [], llmCall,
}) {
  const intent = await samAgent.resolveIntentWithMemory(message, history, { useLLM: true, llmCall });
  const wantsTable = reportRouter.wantsChatTableReport(message);
  if (!intent.is_report && !wantsTable) return { handled: false };

  const wantsFile = intent.is_report;
  const scope = intent.is_report ? intent.scope : reportRouter.reportScope(message);
  const dateFrom = intent.date_from;
  const dateTo = intent.date_to;
  let format = intent.format;

  // ponytail: a saved "always give me X" preference only kicks in when this
  // message didn't name a format AND the router landed on its bare default
  // ('excel') rather than something carried over from topic memory — can't
  // fully distinguish "default" from "carried excel" here, acceptable edge case.
  if (!samAgent.mentionsFormat(message) && format === 'excel') {
    const prefs = await userPrefs.getPrefs(userId);
    if (prefs.format) format = prefs.format;
  }

  // Ask instead of guessing when the module is still unknown — a vague
  // "create me a report" (or a complaint that happens to mention "excel"/
  // "report") must not silently regenerate a generic summary file.
  if (scope === 'summary') {
    return {
      handled: true,
      needsClarification: true,
      reply:
        'Happy to help! 😊 Which report do you need — ' +
        '**DTR, Fuel, EPASS, Leave, Travel, IT, Warehouse, Billing, SOA, Membership,** or **Employees**? ' +
        'Just tell me the module and date range and I\'ll prepare it right away! 🌟',
    };
  }

  // Ang org-wide na ulat ay para sa privilege 6-10 lamang.
  if (guards.wantsAllEmployees(message) && !guards.hasFullDataAccess(user)) {
    return {
      handled: true,
      restricted: true,
      reply: '**Restricted:** Organization-wide reports are available only to privilege 6 to 10 users.\nAction: I can prepare a report of your own records instead. 😊',
    };
  }

  // Multi-report: "fuel and dtr for April" -> one file per module. Requires an
  // explicit conjunction so "employee fuel report" stays a single fuel report.
  const hasConjunction = /\b(and|plus|at|tapos|saka|pati|as well as)\b|[,&]/i.test(message);
  const scopes = reportRouter.allScopes(message);
  if (wantsFile && buildFile && scopes.length > 1 && hasConjunction && format !== 'table') {
    const lines = [];
    const attachments = [];
    for (const oneScope of scopes) {
      const oneRows = await reportRows({
        user, scope: oneScope, dateFrom, dateTo, message,
      });
      if (!oneRows.length) continue;
      const oneTitle = `${oneScope.replace(/_/g, ' ')} report — ${dateFrom} to ${dateTo}`;
      const attachment = await buildFile({ title: oneTitle, rows: oneRows, format });
      attachments.push(attachment);
      lines.push(`• **${oneTitle}** — ${oneRows.length} record(s) ([${attachment.file_name}](${attachment.url}))`);
    }
    if (attachments.length) {
      // ponytail: the message pipeline only persists ONE attachment per reply —
      // the first file downloads directly, the rest are real links in the text.
      // Ceiling: upgrade to multi-attachment storage if this becomes the common case.
      return {
        handled: true,
        multi: true,
        attachment: attachments[0],
        reply:
          `Of course! I prepared ${attachments.length} report(s) for you — happy to help! 😊\n\n` +
          `${lines.join('\n')}\n\n**Period:** ${dateFrom} to ${dateTo}\n` +
          'The first file is attached below; tap the others\' links above to download. 🌟',
      };
    }
  }

  const rows = await reportRows({ user, scope, dateFrom, dateTo, message });
  const title = `${scope.replace(/_/g, ' ')} report — ${dateFrom} to ${dateTo}`;

  if (!rows.length) {
    return {
      handled: true,
      reply: `No records were found for **${title}**. 😊\nAction: Try a wider date range or a different keyword.`,
    };
  }

  // File lang kapag talagang humihingi ng file; kung chat-table lang, huwag mag-attach.
  if (wantsFile && buildFile) {
    const attachment = await buildFile({ title, rows, format });
    return { handled: true, reply: `Here is your **${title}** (${rows.length} record(s)). 😊`, attachment };
  }
  return { handled: true, reply: formatChatTable(title, rows) };
}

/**
 * 4 (new): action agent — SAM DOES things (submit fuel, file leave) for the employee.
 * Confirm-across-turns: when the previous SAM turn asked to confirm and this message
 * is an affirmation, re-run the prior request with confirmed:true.
 */
async function stepAction({
  user, message, history = [], llmCall,
}) {
  const trimmed = String(message).trim();
  const lastAssistant = [...history].reverse().find((t) => t.role === 'assistant');
  if (AFFIRM_RE.test(trimmed) && lastAssistant && CONFIRM_MARKER.test(String(lastAssistant.content))) {
    const priorUser = [...history].reverse().find((t) => t.role === 'user');
    if (priorUser) {
      const confirmed = await samActions.handleMessage({
        message: String(priorUser.content), userInfo: user, confirmed: true,
        deps: ACTION_DEPS, options: { useLLM: true, llmCall },
      });
      if (confirmed.handled) return confirmed;
    }
  }
  // LLM-assisted action routing: catches phrasing the deterministic keyword
  // router can't ("I need a couple days off next Monday" has no report/action
  // keyword at all). selectAction() backfills from the deterministic router
  // whenever the model is unavailable or replies junk, so this degrades safely.
  const out = await samActions.handleMessage({
    message, userInfo: user, confirmed: false, deps: ACTION_DEPS, options: { useLLM: true, llmCall },
  });
  return out.handled ? out : { handled: false };
}

/**
 * 7 (new): read-only query agent — free-form data questions for managers (privilege 8+).
 * Sits AFTER analytics + brain so those still win; fails soft (handled:false) so a bad
 * or empty query falls through to the normal LLM answer.
 */
/**
 * Hard safety net on top of the prompt's own length guidance — a small local
 * model can ignore "50 words" and ramble/loop. Cut at the last sentence
 * boundary before the cap so it doesn't end mid-word.
 */
function capReplyLength(text, maxChars = 900) {
  const str = String(text || '');
  if (str.length <= maxChars) return str;
  const cut = str.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  return (lastBreak > maxChars * 0.5 ? cut.slice(0, lastBreak + 1) : cut).trim();
}

async function stepQuery({ user, message, llmCall }) {
  const scope = privScope.resolveScope(user);
  if (!privScope.canRunFreeformQuery(scope) || !DATA_CUE_RE.test(message)) return { handled: false };
  try {
    const res = await queryAgent.answer(message, { llmCall, runReadQuery: db.readQuery, scope });
    if (res.ok && res.rows.length) {
      const title = `Answer — ${String(message).slice(0, 60)}`;
      return { handled: true, reply: formatChatTable(title, res.rows) };
    }
  } catch (_e) { /* fall through to LLM */ }
  return { handled: false };
}

/**
 * A message that still reads like it wanted a report/data/action but fell all the way
 * through to the generic LLM chat path (no handler, report router, or action agent
 * claimed it) is a real capability gap worth surfacing to admins — see
 * notices.ensureAuditLog's `possible_gap` column and queryAgent for how to review these.
 */
const GAP_HINT_RE = /\b(report|generate|export|download|schedule|request|file|submit|apply for)\b/i;

/** Talahanayan sa chat kapag walang hinihinging file. */
function formatChatTable(title, rows, maxRows = 20) {
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, maxRows);
  const head = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = shown.map((r) => `| ${cols.map((c) => String(r[c] ?? '').replace(/\|/g, '/')).join(' | ')} |`);
  const more = rows.length > maxRows ? `\n\n_…and ${rows.length - maxRows} more. Ask for Excel or PDF to get the full list._` : '';
  return `**${title}** — ${rows.length} record(s)\n\n${head}\n${sep}\n${body.join('\n')}${more}`;
}

/**
 * Buong daloy ng isang mensahe.
 *
 * @param {object}   p
 * @param {object}   p.user          galing sa usertb (kasama ang privilage at bioUID)
 * @param {number}   p.userId
 * @param {string}   p.message       ang tinanong
 * @param {Array}    p.history       naunang mga mensahe [{role, content}]
 * @param {Function} p.buildFile     ({title, rows, format}) -> attachment
 * @param {Function} p.llmCall       (systemPrompt, messages) -> string
 * @returns {Promise<{reply: string, attachment?: object, source: string}>}
 */
async function handleMessage({
  user = {},
  userId = 0,
  message = '',
  history = [],
  buildFile = null,
  llmCall = providers.callConfiguredAI,
  conversationId = 0,
}) {
  const audit = (reply, attachment = {}, extra = {}) =>
    notices.writeAuditLog({
      conversationId, userId, user, requestText: message, replyText: reply, attachment, ...extra,
    });

  // Text-based feedback ("thanks that helped" / "that's wrong") applies to
  // SAM's PRIOR reply, not this message — record it, then keep processing
  // normally so the user still gets a real reply to what they just said.
  const feedbackSignal = feedback.detectFeedbackSignal(message);
  if (feedbackSignal) {
    notices.recordFeedbackOnLastReply(conversationId, userId, feedbackSignal).then((flaggedQuestion) => {
      // A brain-cached answer that just got told "that's wrong" stops being served —
      // see brain.markAnswerBad(). Positive feedback needs no action: reuse already
      // grows hit_count naturally.
      if (feedbackSignal === 'negative' && flaggedQuestion) return brain.markAnswerBad(flaggedQuestion);
    }).catch(() => {});
  }

  // ── 1-6: mga deterministikong handler (walang LLM, kaya mabilis at libre) ──
  const steps = [
    () => stepPreference({ userId, message }),
    () => stepNotices({ user, userId, message }),
    () => stepDtrFlexible({ user, message, buildFile }),
    // Eligibility ("can I file…") must precede the action agent so a QUESTION is
    // answered instead of being executed as a filing COMMAND.
    async () => {
      const reply = await eligibility.eligibilityReply(user, message, ACTION_DEPS);
      return reply ? { handled: true, reply } : { handled: false };
    },
    () => stepAction({ user, message, history, llmCall }),
    () => stepGenerateReport({ user, userId, message, buildFile, history, llmCall }),
  ];
  for (const step of steps) {
    const out = await step();
    if (out.handled) {
      await audit(out.reply, out.attachment || {});
      return { reply: out.reply, attachment: out.attachment, source: out.action ? 'action' : 'handler' };
    }
  }

  // ── Analytics ("sinong department ang pinakamataas...") ──
  const analyticsReply = await analytics.analyticsReply(user, message);
  if (analyticsReply) {
    await audit(analyticsReply);
    return { reply: analyticsReply, source: 'analytics' };
  }

  // ── 7: brain recall — kung nasagot na dati, huwag nang tumawag sa LLM ──
  const recalled = await brain.recallFromBrain(message);
  if (recalled) {
    await audit(recalled);
    return { reply: recalled, source: 'brain' };
  }

  // ── 7b: read-only query agent — free-form data questions (managers only) ──
  const queried = await stepQuery({ user, message, llmCall });
  if (queried.handled) {
    await audit(queried.reply);
    return { reply: queried.reply, source: 'query' };
  }

  // ── 8: LLM na may buong konteksto ──
  const [knowledge, userContext, noticeContext] = await Promise.all([
    brain.searchKnowledgeBase(message),
    userHistory.buildUserContext(user),
    notices.publicNoticesContext(message),
  ]);

  let context = knowledge;
  if (userContext) context += `${context ? '\n\n' : ''}## User Records\n${userContext}`;
  if (noticeContext) context += `${context ? '\n\n' : ''}${noticeContext}`;

  // Saved "always reply in X" preference overrides the per-message language mirroring.
  const savedPrefs = await userPrefs.getPrefs(userId);
  if (savedPrefs.language) {
    context += `${context ? '\n\n' : ''}## Language preference\nThis user has asked to always be replied to in ${savedPrefs.language}. Use that language regardless of what language they type in.`;
  }

  // Web search ay SADYANG naka-patay: SAMELCO II lang ang saklaw ni SAM.
  const systemPrompt = buildSystemPrompt(user, context, '');
  const messages = providers.mergeConsecutiveRoles([...history, { role: 'user', content: message }]);

  let raw;
  let fromLLM = false;
  let usedProvider = '';
  const startedAt = Date.now();
  try {
    raw = await llmCall(systemPrompt, messages);
    fromLLM = true;
    usedProvider = providers.getLastUsedProvider();
  } catch (err) {
    raw = `I could not reach the AI service right now (${err.message}). 😊\nAction: Please try again in a moment — or ask me for a report, which I can still prepare.`;
  }
  const latencyMs = Date.now() - startedAt;

  // ── 9: kunin ang [LEARN:...] tags, i-save, at matuto sa tunay na sagot ──
  const [cleanRaw, learned] = brain.extractLearnTags(raw);

  // Self-check: catch the model stating a DOB/salary/contact/hire-date that
  // was never actually in the context it was given — a code-level backstop
  // for the prompt's "NEVER FABRICATE" rule, not just trust in the model.
  const guarded = fromLLM ? replyGuard.guardReply(cleanRaw, context) : { reply: cleanRaw, flagged: null };
  if (guarded.flagged) {
    console.warn(`SAM reply guard: blocked ungrounded ${guarded.flagged.field} claim ("${guarded.flagged.value}") for user ${userId}`);
  }
  const clean = capReplyLength(guarded.reply);

  for (const item of learned) {
    await brain.saveKnowledge(item.title, item.content, item.category);
  }
  // Never cache a blocked (possibly-hallucinated) reply into the brain.
  if (fromLLM && !guarded.flagged) {
    await brain.learnQA({ userId, userName: user.name || '', question: message, answer: clean, source: usedProvider || 'llm' });
  }

  const possibleGap = fromLLM && GAP_HINT_RE.test(message);
  await audit(clean, {}, { provider: usedProvider, latencyMs, guardFlagged: guarded.flagged ? guarded.flagged.field : '', possibleGap });
  return { reply: clean, source: fromLLM ? 'llm' : 'fallback' };
}

module.exports = {
  handleMessage, formatChatTable, stepNotices, stepDtrFlexible, stepGenerateReport, stepAction, stepQuery, capReplyLength,
};
