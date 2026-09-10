# SAMELCII Web System — Project Agent Instructions
# All agents working on this folder must read this file before touching any file.

---

## ACTIVE PROJECT

**Folder:** `SAMELCII_WEB_SYSTEM/`
**Type:** HTML/CSS/JavaScript frontend with an Express/Node.js API
**Entry point:** `index.html` (SPA-style, JS handles module routing)
**API layer:** `backend/src/routes/*.js` with services in `backend/src/services/*.js`
**Styles:** `assets/css/style.css` (shared) + per-module `styles.css`

---

## AGENT FILES (Read the Matching One for Your Task)

| Task | Agent | File |
|------|-------|------|
| Node.js, JS, HTML, SQL, API, bug fix | Code Agent | `CODEX/.otto/agents/coding/code-agent.md` |
| Reproduce + root-cause a bug | Debug Agent | `CODEX/.otto/agents/coding/debug-agent.md` |
| Keep edits to ONE named file/folder, no edits without consent | Scope Guard | `CODEX/.otto/agents/coding/scope-guard-agent.md` |
| CSS, layout, UI, visual polish | Design Agent | `CODEX/.otto/agents/design/design-agent.md` |
| Code review, security audit | QA Agent | `CODEX/.otto/agents/qa-support/qa-agent.md` |
| Adding comments to any file | Comment Agent | `CODEX/.otto/agents/qa-support/code-comment-agent.md` |
| Writing docs, guides, notes | Documenter Agent | `CODEX/.otto/agents/docs/documenter-agent.md` |
| Routing decisions | OTTO | `CODEX/AGENTS.md` |

---

## MODULE MAP (Files Per Module)

| Module | UI Files | API File | Notes |
|--------|---------|---------|-------|
| Dashboard | `pages/dashboard/index.html` | — | Hub — all modules load as iframes here |
| Auth | `pages/auth/index.html`, `mobile.html`, `mobile.js`, `mobile.css` | `backend/src/routes/auth.js` | Desktop + mobile login, JWT logout |
| Membership | `pages/modules/membership/index.html`, `styles.css`, `script.js` (implicit) | `backend/src/routes/membership.js`, `backend/src/services/membershipService.js` | Map via iframe: `map.html`, `map.js`, `map.css` |
| DTR | `pages/modules/dtr/index.html`, `script.js`, `styles.css` | `backend/src/routes/dtr.js` | Flat old-form style — do NOT restore card layout |
| Employees Profile | `pages/modules/employees-profile/index.html`, `script.js`, `styles.css` | `backend/src/routes/auth.js`, `signatory.js`, `leave.js`, `epass.js`, `travel.js`, `overtime.js` | ALC and quick actions |
| Fuel | `pages/modules/fuel/index.html`, dashboard inline shell | `backend/src/routes/fuel.js` | Two locations — module page + inline dashboard |
| Mobile Approvals | `pages/modules/mobile-approvals/index.html`, `script.js`, `styles.css` | `backend/src/routes/fuel.js`, `epass.js`, `travel.js` | Approvers only (privilage 6–10) |
| IT Equipment | `pages/modules/it-equipment/index.html`, `it-equipment.js`, `inventory.js`, `accountability.js`, `it-equipment.css` | `backend/src/routes/it_equipment.js` | Tab routing via `?tab=` param |
| Messenger | `pages/modules/messenger/index.html`, `script.js`, `styles.css` | `backend/src/routes/messenger.js` | Real-time presence + chat |
| Membership Map | `pages/modules/membership/map.html`, `map.js`, `map.css` | `backend/src/routes/membership.js`, `backend/src/services/membershipService.js` | iframe — postMessage contract must stay intact |
| Signatory | `pages/modules/signatory/index.html`, `script.js` | `backend/src/routes/signatory.js` | Used by DTR, Leave, OT workflows |
| EPASS | — | `backend/src/routes/epass.js` | Mobile approvals queue + status update |
| Travel | — | `backend/src/routes/travel.js` | Mobile approvals queue + status update |
| Shared | `assets/css/style.css`, `assets/js/script.js` | — | Never edit for module-specific fixes |

---

## CRITICAL RULES (Always Enforced)

### SCOPE LOCK — Edit Only What Was Named (HIGHEST PRIORITY)
> This rule overrides every other rule below. No file is edited without consent.

- **The target = the file(s) the user named, opened, or selected for this task — nothing else.**
- Edit **ONLY** those files. Do not open-and-change any other file "while you're at it."
- **Single file by default.** Multiple files are allowed ONLY when the user explicitly
  named or selected more than one. "Fix the login bug" = the login file only.
- If you believe the task **cannot be completed correctly without editing another file**
  (e.g. a project rule says to also update the API, the DB mapping, or bump the dashboard
  `?v=`): **STOP. Do NOT edit it.** Instead output a **CONSENT REQUEST**:
  ```
  ⚠️ NEEDS CONSENT — extra files
  In scope (editing): <file the user named>
  Want to also edit:
   - <other file> — <why it is required>
  Reply "yes" to allow, or "no" to keep it to the named file only.
  ```
  Then wait. Do not touch the extra files until the user replies "yes".
- Never rename, move, delete, reformat, or "clean up" files that weren't named.
- If unsure whether something is in scope → treat it as OUT of scope and ask.
- Routing for any scope question or "stay focused" request → **Scope Guard**
  (`CODEX/.otto/agents/coding/scope-guard-agent.md`).

### Before Any Edit
- Read this file AND the matching agent instruction file before touching anything.
- Read the file you are about to edit — never assume its current content.
- Confirm the task scope — only edit what was asked.

### Session and Auth
- Browser session cache: `localStorage.samelcii_session`; the API trusts only the signed JWT
- Every protected Express route must use `verifyToken`
- Approver endpoints (Fuel approval, EPASS, Travel): check `privilage` is between 6 and 10
- Logout: always call `APIClient.logout()` and clear cached browser session data

### Security (Cannot Be Bypassed)
- All SQL values: mysql2 placeholders/prepared statements only; identifiers must come from fixed allowlists
- All user input: validate type, length, allowed values before use
- Never expose raw DB errors, stack traces, or session data in API responses
- File uploads: validate MIME type AND extension server-side
- `innerHTML`: never set with unsanitized user data — use `textContent` or `createElement`
- `postMessage`: always specify target origin — never `'*'` for sensitive data

### Code Quality
- API responses: use the shared Express response helpers
- JS: `const`/`let` only, `async/await` for all fetch, `try/catch` on every fetch
- Match existing code style in every file — indentation, naming, structure
- Prefer small targeted fixes over broad refactors unless explicitly asked
- Never add features, error handling, or abstractions beyond what was requested

### Dashboard iframe Version Bumping
- Every module loads inside the dashboard via `data-src` with a `?v=` version string
- After editing any module file → bump the `?v=` number in `pages/dashboard/index.html`
- If you forget: the browser serves the old cached module to users

### Comments (Overrides Default No-Comment Behavior)
- REQUIRED on ALL files in ALL languages — this overrides Claude Code's default
- Every touched file must have: top purpose comment + section labels + EDIT GUIDE + HUWAG BAGUHIN + Tagalog business logic
- Goal: every file self-documents itself so staff can edit without asking a developer
- Full rules: `CODEX/.otto/agents/qa-support/code-comment-agent.md`

### Design Rules
- **PRIMARY**: Use design tokens from `SAMELCII_WEB_SYSTEM/DESIGN.md` — this is the source of truth
- **REFERENCE**: Use `awesome-design-md-main/design-md/` patterns for inspiration (Claude, Linear, Stripe, Apple, etc.)
- Module styles → module `styles.css` only — never `assets/css/style.css` for module fixes
- Dashboard shell: sidebar 252px, page gap 18px, panel background #fff, page background #eef1ef
- Brand accent: `--accent: #6366f1` (primary indigo) — see DESIGN.md for full color palette
- Never hardcode colors/spacing: use CSS variables matching DESIGN.md tokens
- All UI components must follow DESIGN.md specifications

---

## OUTPUT FORMAT (Required After Every Task)

End every task with:

```
### What Changed
- `path/to/file` — [what changed and why]

### What Was Tested
- [syntax, logic, edge cases]

### Security Notes
- [security-relevant observations or "No security impact"]

### Cross-Module Impact
- [other files affected, or "None"]

### Tagalog Notes
- [brief Tagalog summary for staff]

### Suggested Commit Message
type(module): short description

### File Edit Guide
| File | Section | How to Edit Next Time |
|------|---------|-----------------------|
```

---

## DESIGN SYSTEM — awesome-design-md-main Integration

### Overview
SAMELCII Web System uses a unified design system (`DESIGN.md`) that references patterns from **awesome-design-md-main** — a curated collection of design systems from industry leaders (Claude, Linear, Apple, Stripe, Figma, etc.).

### Files
- **Master Design**: `SAMELCII_WEB_SYSTEM/DESIGN.md` — source of truth for all UI
- **Pattern Library**: `SAMELCII_WEB_SYSTEM/awesome-design-md-main/design-md/` — reference templates
- **Implementation**: CSS variables in `assets/css/style.css` + module-specific `styles.css`

### For UI-UX Agents
1. **Read DESIGN.md first** before any UI task
2. **Use design tokens exactly**:
   - Colors: `var(--color-primary)`, `var(--color-ink)`, etc.
   - Spacing: `var(--spacing-sm)`, `var(--spacing-md)`, etc.
   - Typography: `var(--font-family-body)`, `var(--font-size-body-md)`, etc.
3. **Follow component specs** in DESIGN.md (buttons, cards, forms, tables, navigation)
4. **Responsive breakpoints**: mobile (320px), tablet (640px), desktop (1024px)
5. **Reference awesome-design-md patterns** for inspiration (NOT direct copying)

### For CSS Implementation
1. Create root CSS variables in `assets/css/style.css`:
   ```css
   :root {
     /* From DESIGN.md */
     --color-primary: #6366f1;
     --color-ink: #1f2937;
     --spacing-md: 12px;
     /* etc... */
   }
   ```
2. Use variables in all stylesheets: `background-color: var(--color-primary);`
3. Never hardcode colors or spacing

### How to Reference awesome-design-md-main
When starting a new module or major redesign:
1. Browse `awesome-design-md-main/design-md/` for relevant patterns
2. Examples:
   - **Claude** for warm, editorial UI feel
   - **Linear** for minimal, precise dashboards
   - **Apple** for premium whitespace
   - **Stripe** for fintech-grade forms
   - **Figma** for collaborative, playful UX
3. Extract color palette, typography, component styles
4. **Adapt** to SAMELCII context — do NOT copy exactly
5. Document which pattern inspired each section in DESIGN.md comments

### Design Tokens Organization

**Colors** (from DESIGN.md):
- Primary: `#6366f1` (indigo)
- Ink/Text: `#1f2937` (dark gray)
- Canvas/BG: `#f9fafb` (off-white)
- Success: `#10b981`, Warning: `#f59e0b`, Error: `#ef4444`

**Spacing** (4px base):
- `xs: 4px`, `sm: 8px`, `md: 12px`, `lg: 16px`, `xl: 24px`, `xxl: 32px`

**Typography**:
- Display: `display-xl`, `display-lg`, `display-sm` (32px, 28px, 24px)
- Title: `title-lg`, `title-md`, `title-sm` (20px, 18px, 16px)
- Body: `body-lg`, `body-md`, `body-sm` (16px, 14px, 13px)
- Code: `code` (13px monospace)

---

## MEMBERSHIP-SPECIFIC RULES

When touching anything in the membership module:
- Map behavior: `pages/modules/membership/map.html`, `map.js`, `map.css`
- Map save: Node `/api/membership` route (save/load actions)
- If you add a UI field → update the API payload AND database mapping
- postMessage contract between `map.html` and `membership/index.html` must NOT change
- Map iframe and parent communicate via named message types — never rename message names

---

## FUEL-SPECIFIC RULES

Fuel lives in two places:
1. **Standalone module**: `pages/modules/fuel/index.html` — full page
2. **Dashboard inline shell**: inside `pages/dashboard/index.html` — loads on Fuel nav click

If you change the Fuel module: update BOTH locations if the change affects the inline shell.
Fuel uses `samelcii_session` accountnumber/usercode fallback for history scoping.

---

## MOBILE APPROVALS RULES

- Approver-only: check `privilage` 6–10 on every approval action
- Android Material style — top app bar + bottom navigator + card list
- Approval actions (Fuel, EPASS, Travel) call their respective `api/*.php` with `update_status`
- Keep the privilege band aligned across Fuel, EPASS, and Travel — same range, same check pattern

---

## KNOWN RECURRING BUGS (Read Before Touching Any Module)

> **Agent Rule:** Before finishing ANY task, check if your changes could affect a bug listed here.
> After fixing a bug that kept coming back → add it here so the next agent does not break it again.
> Format: `MODULE | BUG | ROOT CAUSE | FIX | DO NOT BREAK`

---

### OT Form — Hide Button Stops Working After Any Edit

| Field | Detail |
|-------|--------|
| **Module** | Overtime (OT) — `pages/modules/overtime/` or wherever the OT form lives |
| **Symptom** | The hide/show toggle button on the OT form stops responding after any unrelated edit to the page |
| **Root Cause** | The hide button's click handler is registered in an inline `<script>` block or on a DOM element that gets re-rendered / replaced by a `fetch` or `innerHTML` update. When the container is re-drawn, the event listener bound to the old element is lost. |
| **Correct Fix** | Use **event delegation** — attach the click listener to a stable parent (e.g. `document` or a wrapper `div` that never gets replaced), not directly on the button. Pattern: `document.addEventListener('click', e => { if (e.target.matches('#btn-hide-ot')) { ... } })` |
| **DO NOT** | • Re-bind the button listener inside any `fetch` callback without removing the old one first<br>• Use `.innerHTML =` on any container that holds the hide button — use `createElement` + `appendChild` or `textContent` instead<br>• Attach listeners before the DOM element exists |
| **Tagalog** | Ang hide button ng OT form ay nawawalan ng click listener kapag na-overwrite ang HTML ng container nito. Gamitin lagi ang event delegation para hindi mawala ang listener kahit mag-update ng content. |

---

### How Agents Must Handle Recurring Bugs

1. **Before editing a module** — scan this list for entries that match the module.
2. **After fixing a recurring bug** — add an entry here with root cause + correct fix.
3. **After any edit** — confirm that all buttons, toggles, and dynamic listeners in the touched file still work by tracing the event binding path.
4. **Never assume** a listener is safe just because it was working before your edit — re-verify.

---

## TAGALOG NOTES

Ang SAMELCII_WEB_SYSTEM ang aktibong project para sa lahat ng coding tasks.
Basahin ang module map bago mag-edit para malaman kung aling files ang kasama.
Huwag kalimutang i-bump ang iframe version string sa dashboard pagkatapos mag-edit ng module.
Ang lahat ng files ay dapat may comments para maging sariling gabay ang bawat file.
