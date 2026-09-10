# SAM Capability Audit — 2026-07-29

Full pass over `it_program` (the business database SAM reads from) to see what data
exists that SAM could report on or act on, versus what it actually covers today.
Purpose: give SAM (and whoever plans its next features) a real picture instead of
guessing module-by-module.

## Already covered by SAM today
Report scopes wired in `reportRouter.js` (report/table/PDF/Excel/CSV/image):
`epass, fuel, leave, travel, dtr (+ dtr_late), it_joborder, materials, status_report,
turnover, billing, soa, membership, employees`

Actions SAM can file (`samActions.js`): leave, fuel, overtime, travel order, EPASS,
own-summary lookup.

## Real data that exists but has NO SAM report or action yet

| Table(s) | What it is | Notes |
|---|---|---|
| `accountabiltytb`, `accoutabiltymaterials` | Equipment/materials accountability per employee | Who's accountable for what issued item — a real audit-style report SAM could do |
| `cashflow` | Financial in/out records | Likely privilege-sensitive (finance-only) |
| `vehicletb`, `fuel_vehicle_assignments` | Vehicle registry + who's assigned to which vehicle | **In progress** — was mid-build when this audit was requested |
| `power_rate` | Utility power rate data | Cooperative-specific reference data |
| `agmalist` | Annual General Membership list | Possibly overlaps with `membership` scope already covered — needs confirming, not assumed new |
| `checkinout`, `dtr_logs`, `dtr_timeinout`, `dtr_sync`, `autfilldt` | Raw biometric/DTR feeds | Already the SOURCE data behind the existing `dtr` report — not a new module, just infrastructure |
| `epasstb`, `traveltb`, `tbleave`, `overtimetb` (+ their `_copy` tables) | Already-covered modules | `_copy` tables look like manual backups, not live data — do not report from these |

## Config/workflow tables — not report material
`signatory_assignments`, `signatory_groups`, `signatory_group_members`,
`request_approvers`, `fuel_request_approvers`, `panel_settings`,
`employee_module_permissions`, `holiday_auto_overrides`, `philippine_holidays`,
`token_blacklist`, `token_audit_log`, `otp_sessions`, `user_otp`, `refresh_tokens`,
`call_sessions`, `user_presence`, `conversations`, `conversationparticipants`,
`messages`, `attachments`, `chatdb` — these back existing features (auth, approvals,
messenger, holidays used by DTR lateness calc) rather than being reportable data
on their own.

## Explicitly checked and NOT present
No payroll/salary/sweldo/wage/compensation/deduction table exists anywhere in
`it_program`. Payroll is handled outside this system entirely (different software,
or manual) — SAM cannot report on it without a new data source being connected,
which is a bigger decision than a report addition.

## Recommendation
Only two items here are genuinely new, real, and low-risk to build next:
1. **Vehicle Assignments** (`vehicletb` + `fuel_vehicle_assignments`) — already scoped, in progress.
2. **Accountability** (`accountabiltytb` + `accoutabiltymaterials`) — natural next one after Vehicle Assignments; same shape as an existing report (per-employee list).

`cashflow` needs an explicit privilege decision first (who's allowed to see it) before
any code gets written — financial data, not just internal ops data.
