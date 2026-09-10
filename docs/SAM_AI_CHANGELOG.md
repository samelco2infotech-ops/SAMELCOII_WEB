# SAM AI Changelog

Behavior changes to SAM specifically — prompt edits, model/provider changes, new
actions/reports, routing changes. Separate from general commits because these
change what SAM *does and sounds like*, not just the code. Add an entry here
whenever `samPrompt.js`, `providers.js` model/temperature settings, or SAM's
routing/action set changes — newest first.

## 2026-07-29

- **Fix:** SAM's replies were unbounded in length on Ollama (`num_predict` was
  never set) — root cause of runaway/repeated-language replies. Capped at 220
  tokens, plus a code-level hard cap (`capReplyLength`) as a second safety net.
- **Fix:** System prompt said "mirror the user's language mix," which the local
  model interpreted as "answer in both languages." Changed to "reply in ONE
  language only... never answer the same thing twice in two languages," with
  few-shot examples reinforcing the single-language shape.
- **Fix:** Vague report requests ("create me a report") silently generated a
  generic "summary" Excel instead of asking which module — the clarify logic
  existed in `samAgent.js` but was never wired into the live orchestrator.
- **Perf:** Added `keep_alive` to the Ollama call so the local model stays
  resident between requests — cut warm-call latency from ~40s to ~6s.
- **New:** Automatic provider fallback — Ollama down now falls through to
  Groq/Gemini instead of just apologizing.
- **New:** Multi-report requests ("fuel and dtr for April") now generate both
  files in one reply; short follow-ups ("now May", "as image") correctly
  inherit the prior report's module/format/dates instead of re-asking.
- **New:** CSV export alongside Excel/PDF/image.
- **New:** Per-user preferences — "always give me PDF reports" / "always reply
  in Tagalog" persist and apply as a fallback on future ambiguous requests.
- **New:** SAM can now file a gate pass (EPASS) request from chat, matching
  the existing fuel/leave/overtime/travel action pattern.
- **New:** Fuel anomaly detection — "flag any unusual fuel requests" surfaces
  individual outlier requests (2x department average), not just rankings.
- **Accessibility:** Generated report images (SVG) now carry `role="img"` and
  a `<title>`/`<desc>` for screen readers.
- **Reliability:** Latency and which provider actually answered are now logged
  per reply in `ai_audit_log` (`provider`, `latency_ms` columns).

## Template for new entries

```
## YYYY-MM-DD
- **Fix|New|Perf|Accessibility|Reliability:** one line, what changed and why
  a user would notice.
```
