# SAM AI / SAMELCII — 100 Upgrades Roadmap

Goal: make daily life easier for **employees** and the **office**. Sequenced so cheap
blockers land first (they unblock everything else), then module features, then platform.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `(blocker)` unblocks others

---

## Batch 1 — Quick wins & blockers (do first)
- [x] 100. pm2 autostart — `backend/ecosystem.config.js` added; run `pm2 start && pm2 save && pm2 startup` on server
- [x] 72. PHP→Node SAM engine port — CODE-COMPLETE, all 10 parity/selfcheck harnesses pass vs live PHP (fixed a false-failing brain.parity check). Only frontend cutover (deploy) remains.
- [ ] 32. Surface already-detected EPASS pending backlog anomaly to approvers
- [ ] 59. Surface already-detected high-material-outflow anomaly to warehouse
- [ ] 87. One-click export to real .xlsx (no fake .xls — Defender/Chrome block those)

## Batch 2 — Employee self-service (in progress)
- [x] 1. My DTR — `GET /api/me/summary` returns this-month present days, late days/min, early-out days/min (computed from `dtr_timeinout` via bioUID; verified `meService.selfcheck.js`)
- [x] 11. Leave balance — same endpoint returns VL/SL/OL balances
- [x] 21. Fuel self-request — already had `POST /api/fuel/request`; self-service view now shows requested-this-month + recent requests in `/api/me/summary`
- [ ] 46. Ticket status — BLOCKED: no helpdesk/ticket module exists yet; needs #45 (build ticket system) first
- [ ] next: frontend "My Self-Service" page that renders `/api/me/summary`

## Attendance / DTR (1–10)
- [ ] 1. Self-service "my DTR" — own late/undertime/OT totals live
- [ ] 2. Missed-punch correction request (employee files, supervisor approves)
- [ ] 3. Auto-flag suspicious punches (same second, impossible location)
- [ ] 4. "You forgot to time out" reminder at end of shift
- [ ] 5. Monthly DTR auto-emailed to each employee on cutoff day
- [ ] 6. Overtime pre-request + approval tied to actual punches
- [ ] 7. Shift/schedule templates so night-shift/field staff aren't marked late wrongly
- [ ] 8. Grace-period rules per department (config, not code)
- [ ] 9. Holiday/suspension-aware DTR
- [ ] 10. DTR discrepancy dashboard for HR (exceptions only)

## Leave (11–20)
- [ ] 11. Leave balance visible to employee before filing
- [ ] 12. Online leave filing with attachment
- [ ] 13. Approval chain routing (supervisor → dept head → HR) with status
- [ ] 14. Auto-deduct/credit leave balance on approval
- [ ] 15. Leave calendar per department
- [ ] 16. Carry-over / forfeiture automated at year-end
- [ ] 17. "Leave without pay" impact preview
- [ ] 18. Substitute/coverage note field
- [ ] 19. Email + Messenger notification on each approval step
- [ ] 20. Leave usage analytics surfaced to the employee too

## Fuel (21–29)
- [ ] 21. Employee/driver self-request (vehicle + purpose)
- [ ] 22. Per-vehicle consumption history + outlier alerts
- [ ] 23. Monthly fuel budget vs actual per department
- [ ] 24. Approval-rate + turnaround dashboard
- [ ] 25. Duplicate/large-request warning at submission
- [ ] 26. Odometer capture → km-per-liter
- [ ] 27. Receipt photo attachment on liquidation
- [ ] 28. Fuel request status push to requester
- [ ] 29. Auto-generated monthly fuel summary for accounting

## EPASS / Gate Pass (30–37)
- [ ] 30. Employee self-service gate pass request with item list
- [ ] 31. QR-coded pass for fast guard verification
- [ ] 33. Return/expiry tracking for items taken out
- [ ] 34. Guard log: scan in/out with timestamp
- [ ] 35. Pass templates for recurring movements
- [ ] 36. Notification to requester on approve/deny
- [ ] 37. Monthly EPASS movement report per department

## Travel (38–44)
- [ ] 38. Online travel order filing (destination, purpose, dates)
- [ ] 39. Per diem / allowance auto-computation
- [ ] 40. Travel approval routing + status
- [ ] 41. Post-travel report + liquidation attachment
- [ ] 42. Travel calendar (who's out and when)
- [ ] 43. Conflict warning (already on leave / another trip)
- [ ] 44. Travel spend analytics per department

## IT Job Orders / Helpdesk (45–54)
- [ ] 45. Self-service ticket filing (category + screenshot)
- [ ] 46. Ticket status tracking for requester
- [ ] 47. Auto-assign tickets by category
- [ ] 48. SLA timers + overdue alerts
- [ ] 49. Knowledge base of common fixes surfaced before filing
- [ ] 50. Satisfaction rating after close
- [ ] 51. Recurring-issue detection (same asset failing)
- [ ] 52. Asset linkage — ticket tied to inventory item
- [ ] 53. Priority queue view for IT staff
- [ ] 54. Monthly IT workload report per technician

## Warehouse / Inventory (55–62)
- [ ] 55. Low-stock reorder alerts
- [ ] 56. Barcode/QR scan for issue & receipt
- [ ] 57. Accountability slip auto-generated on assignment
- [ ] 58. Item history — who held what, when returned
- [ ] 60. Photo + condition on turnover/return
- [ ] 61. Pending-return dashboard (items out past due)
- [ ] 62. Stock valuation + movement report

## Messenger / Communication (63–71)
- [ ] 63. Read receipts + typing indicators
- [ ] 64. Group/department channels
- [ ] 65. Pinned announcements from management
- [ ] 66. File/document sharing with preview
- [ ] 67. Search across message history
- [ ] 68. @mention notifications
- [ ] 69. Message translation (English ↔ local)
- [ ] 70. Offline queue — send when connection returns
- [ ] 71. Do-not-disturb / working-hours mute

## SAM AI Assistant (72–83)
- [ ] 73. "Ask SAM" natural-language self-service ("how many leaves left?")
- [ ] 74. Voice input on mobile
- [ ] 75. Proactive daily briefing to each manager
- [ ] 76. Feedback thumbs up/down on SAM answers
- [ ] 77. AI training/admin panel for non-coders
- [ ] 78. Charts embedded inside generated Excel reports
- [ ] 79. Scheduled auto-reports (daily/weekly/monthly)
- [ ] 80. Long-running report progress bar
- [ ] 81. SAM remembers conversation context within a session
- [ ] 82. Multi-language SAM responses
- [ ] 83. SAM suggests actions, not just data

## Reports & Analytics (84–90)
- [ ] 84. Self-serve report builder (module, range, department)
- [ ] 85. Audit-log viewer of every SAM/data request
- [ ] 86. Fiscal/payroll-period aliases + holiday-aware ranges
- [ ] 88. Executive dashboard (attendance, fuel, tickets, inventory)
- [ ] 89. Trend comparisons (month vs month, year vs year)
- [ ] 90. Scheduled report email distribution lists

## Employee Experience / Platform (91–100)
- [ ] 91. Single unified self-service portal (one login)
- [ ] 92. Mobile-friendly / installable PWA
- [ ] 93. Unified notification center (in-app + email + Messenger) with prefs
- [ ] 94. Digital payslip access
- [ ] 95. Employee directory (photo, dept, contact, who-to-ask)
- [ ] 96. Onboarding checklist for new hires
- [ ] 97. Announcement/bulletin board on dashboard
- [ ] 98. Accessibility pass — keyboard nav, contrast, screen-reader labels
- [ ] 99. Role-based access cleanup

---

## Recommended sequencing rationale
1. **Batch 1 first** — pm2 (#100) + port (#72) are blockers; without them SAM upgrades are
   fragile or land in PHP only.
2. **Self-service items** (#1, #11, #21, #30, #45, #91) give employees the biggest daily
   relief for the least backend change.
3. **Notification center (#93)** is a shared dependency for #4, #19, #28, #36, #48, #55, #61.
4. **Executive dashboard (#88)** reuses analytics that already exist — high visibility, low new code.
