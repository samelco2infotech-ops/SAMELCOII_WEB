# SAMELCII Web System Notes

Layunin: gabay sa pag-edit ng app at sa paglalagay ng short Tagalog comments.

## Manual Edit Guide

| File | Dito mag-edit | Susunod na seksyon |
|---|---|---|
| `index.html` | App root redirect | Route papuntang login |
| `api/config.php` | DB at key settings | Credentials, prefix, at DB charset |
| `api/auth.php` | Login/register/session | Auth flow at schema checks |
| `api/membership.php` | Save/load ng membership map | Payload at database mapping |
| `assets/js/script.js` | Shared auth UI logic | Login at register behavior |
| `assets/js/offline-sync.js` | Offline queue helper | Queue only real connectivity/server failures; badge is top-page-only so dashboard iframes do not duplicate it |
| `api/offline/db.php` | Offline cache DB bootstrap | Keep the file BOM-free so `strict_types` and headers behave correctly |
| `api/offline/queue.php` | Offline queue API | Queue push/count/list actions; keep the file BOM-free so PHP can load it |
| `api/offline/serve.php` | Offline cache serve API | Cache-first GET responses for module reads; keep the file BOM-free |
| `api/offline/sync.php` | Offline sync API | Queue flush and cache refresh status; keep the file BOM-free |
| `pages/auth/mobile.html` | Mobile auth host page | Bootstrap mobile login shell for phone approvers |
| `pages/auth/mobile.css` | Mobile auth styling | Bootstrap-like compact phone login layout, hero, and form controls |
| `pages/auth/mobile.js` | Mobile auth behavior | Approver-only mobile login, auto-remembered credentials, session creation, and redirect to approvals |
| `pages/modules/module.js` | Shared module shell | Session guard at header logic and mobile auth routing |
| `pages/modules/dtr/index.html` | DTR module host page | Old-form DTR shell, employee rail, date filters, and computed grid |
| `pages/modules/dtr/script.js` | DTR module behavior | Employee loading, monthly computed rows, selection, export, print actions, and logout sync |
| `pages/modules/dtr/styles.css` | DTR module styling | Flat DTR layout, employee rail, toolbar, table, and responsive rules |
| `pages/modules/mobile-approvals/index.html` | Mobile approvals host page | Android-style Material app shell for Fuel, EPASS, and Travel approvals, compact top app bar, current-date filter, combined all-request default view, search, queue summary, bottom navigator, request-detail popup shell, and thumb-friendly actions |
| `pages/modules/mobile-approvals/styles.css` | Mobile approvals styling | Android-style mobile theme, Material top app bar, icon-led controls, one-row summary cards, current-date toolbar, request-detail popup sheet, bottom navigator, approve/reject buttons, and responsive mobile layout |
| `pages/modules/mobile-approvals/script.js` | Mobile approvals behavior | Approver-only guard, compact summary card rendering, current-date queue filter, tap-to-open request detail popup, sticky queue order, combined all-request default view, root API path routing, bottom navigator, search, server logout sync, approval actions, and toast feedback |
| `pages/modules/membership/index.html` | Membership host page | Modal iframe contract, Smart Review colors, membership theme dropdown, webcam member photo modal, camera studio redesign, flat one-row New member queue list, Job Order default pending filter, all-months pending view, all-area pending view, hidden Job Order scope summary, compact centered Job Order stepper labels with stage text and offset spacing, one-row Job Order header, inline Job Order close button, tighter borderless Job Order print sheet, real logo asset, log-based signatory names in workflow notes position, formal no-divider signatory rows |
| `pages/modules/membership/map.html` | Map iframe shell | Satellite-only layout, cache-bust, hide/show panel, and capture buttons |
| `pages/modules/membership/map.js` | Map behavior at capture flow | Pin, Documents save path, employee account fallback, public ID filename prefix, panel toggle, capture fallback, satellite base, API path, at save actions |
| `api/membership.php` | Map data and capture endpoints | Point limits, image size, and streetview / satellite preview |
| `api/fuel.php` | Fuel request API | Employee-scoped history lookups, request save/update, balance, status flow, and avatar photo URL normalization |
| `pages/modules/fuel/index.html` | Fuel module UI | Fuel request form layout, floating hint labels (Area/Department/etc.), request list table shell, and responsive grid rules |
| `pages/modules/fuel/index.html` | Fuel offline bridge | Offline-sync script tag with cache-bust version for the fuel page |
| `pages/dashboard/index.html` | Dashboard offline bridge | Shared offline-sync script tag with cache-bust version for the dashboard shell |
| `pages/modules/editable-print/index.html` | Print form designer | Fuel and EPASS print template layout editor used by the dashboard Print Form shortcut |
| `pages/modules/signatory/index.html` | Signatory admin page | Super-admin-only assignment screen and direct URL lock message |
| `pages/modules/signatory/script.js` | Signatory admin behavior | Privilege 10 front-end guard, bootstrap loading, drag/drop signatory assignments |
| `pages/modules/signatory/styles.css` | Signatory admin styling | Assignment canvas layout and Super Admin Only lock screen |
| `pages/modules/*/*.js` | Module-specific logic | Edit sa file na hawak ng feature |
| `AGENTS.md` | Workspace app instructions | UI design workflow, comment rules, and membership scope |

## Switchable Parts

- `api/config.php`
  - `EDIT GUIDE:` `$SAMELCII_APP_WEB_PREFIX`
  - `EDIT GUIDE:` `$SAMELCII_INVENTORY_TABLE`
  - `EDIT GUIDE:` `$GOOGLE_MAPS_STATIC_API_KEY`
  - `EDIT GUIDE:` MySQL DSN charset must stay `utf8mb4` so names and request text do not turn into mojibake

- `pages/modules/membership/index.html`
  - `EDIT GUIDE:` iframe `src` ng map modal
  - `HUWAG BAGUHIN:` message names ng parent at iframe
  - `EDIT GUIDE:` New member queue flat one-row renderer and compact list density
  - `EDIT GUIDE:` Job Order modal defaults to `PENDING` so pending queue loads first
  - `EDIT GUIDE:` Job Order month filter can be set to `All months Ã‚Â· pending` to load the broader pending queue
  - `EDIT GUIDE:` Job Order area filter can stay on `ALL` to show pending records across every area
  - `EDIT GUIDE:` Job Order scope chips at the top are hidden; re-enable `.jo-scope` if you want that summary back
  - `EDIT GUIDE:` Job Order header is now one row; edit `.jo-head-copy` if you want the title and subtitle stacked again
  - `EDIT GUIDE:` Job Order inline close button uses `[data-jo-close]`; the sticky modal `X` hides while Job Order is open
  - `EDIT GUIDE:` Job Order print layout is built in `buildJobOrderPrintHtml()` and launched by `[data-jo-print]`; the form blocks are borderless, the header uses `assets/images/samelco-main.svg`, the signatories use the log-based handler names in the workflow-notes position with no divider lines, the footer is kept minimal, print dates use the short `MM/DD/YY` formatter, fee/date columns are centered, and the leading is tightened across labels/data
  - `EDIT GUIDE:` Job Order rows now show the stage stepper strip so the pending/active/done flow stays visible
  - `EDIT GUIDE:` Job Order stepper labels use compact markers with stage text, a finished/current summary, gray upcoming states, and offset marker spacing

- `AGENTS.md`
  - `EDIT GUIDE:` UI Design Upgrade section for stronger visual direction on future tasks

- `pages/modules/membership/map.js`
  - `EDIT GUIDE:` area centers at capture labels
  - `HUWAG BAGUHIN:` init/save/reset message contract
  - `EDIT GUIDE:` wait time, satellite base style, API path, Documents save folder, employee account fallback, public ID prefix, panel toggle, at capture fallback kung gusto mong mas mabilis
  - `HUWAG BAGUHIN:` satellite source path without checking live tile availability
  - `HUWAG BAGUHIN:` absolute API path for iframe calls
  - `EDIT GUIDE:` native zoom cap if satellite tiles start blanking at high zoom

- `pages/modules/membership/map.css`
  - `EDIT GUIDE:` floating overlay layout at control card style
  - `HUWAG BAGUHIN:` if same iframe sizing is expected by another page

- `api/membership.php`
  - `EDIT GUIDE:` streetview_capture preview auth exception and point limits
  - `EDIT GUIDE:` satellite fallback order when Google key is not set
  - `HUWAG BAGUHIN:` do not restore the old map-style fallback for street preview
  - `HUWAG BAGUHIN:` save/load actions unless you are changing the membership flow

- `pages/modules/membership/map.html`
  - `EDIT GUIDE:` cache-bust version for membership map.js
  - `EDIT GUIDE:` `Hide` button inside the panel and floating `Show Area` reopen button
  - `HUWAG BAGUHIN:` searchBox markup and zoom hint because map.js binds capture/search there
  - `HUWAG BAGUHIN:` iframe and control names if the parent message contract stays the same

- `pages/modules/membership/map.css`
  - `EDIT GUIDE:` panel collapse style and floating reopen button
  - `HUWAG BAGUHIN:` capture buttons and search box layout if the panel is hidden

- `pages/modules/membership/index.html`
  - `EDIT GUIDE:` public ID source from `samelcii_session.accountnumber` or `usercode`
  - `EDIT GUIDE:` Membership Theme dropdown for whole-page preset colors
  - `EDIT GUIDE:` prefilled field stroke now follows the theme `prefilledBorder`
  - `EDIT GUIDE:` Profile Picture Member modal needs secure context for webcam capture
  - `EDIT GUIDE:` Profile Picture Member card now uses the camera studio layout and preview stage
  - `HUWAG BAGUHIN:` section header color stays fixed for all membership groups
  - `HUWAG BAGUHIN:` member account field for database save flow

- `pages/modules/dtr/index.html`
  - `EDIT GUIDE:` keep the DTR shell flat and old-form style; do not restore the rounded dashboard cards
  - `EDIT GUIDE:` versioned `styles.css` and `script.js` links force the browser to reload the latest DTR arrangement
  - `EDIT GUIDE:` top bar keeps the logged user plus Dashboard and Logout controls
  - `EDIT GUIDE:` toolbar holds date options, department, employee number, dropdown area filters, and Print/Excel actions
  - `EDIT GUIDE:` employee rail on the left is the loaded employee list for the selected department
  - `EDIT GUIDE:` center table is the computed DTR grid and should stay the main focus
  - `HUWAG BAGUHIN:` `department-filter`, `employee-filter`, `employee-search`, `employee-list`, and `dtr-table-body` stay wired to the script

- `pages/dashboard/index.html`
  - `EDIT GUIDE:` DTR module now loads inside the dashboard iframe instead of redirecting away
  - `HUWAG BAGUHIN:` keep the DTR `data-title`, `data-src`, and `embeddedSrc` version strings matched if the module path changes
  - `EDIT GUIDE:` Mobile Approvals iframe opens `pages/modules/mobile-approvals/index.html`; bump the version string when the mobile queue UI changes
  - `EDIT GUIDE:` `Mobile Approvals` nav item in the sidebar is the quick entry for Fuel, EPASS, and Travel approvals
  - `EDIT GUIDE:` Mobile Approvals nav item is hidden for non-approvers and only opens for `privilage` 6 to 10
  - `EDIT GUIDE:` request cards now open `#approval-detail-modal`; edit the popup shell if you want different detail fields or action placement
  - `EDIT GUIDE:` queue summary strip hides while searching; restore it in `renderQueue()` if you want the top hint visible again during typing
  - `EDIT GUIDE:` request order is sticky through approve/reject; `queueOrder` in `script.js` keeps items from jumping around when the queue refreshes
  - `EDIT GUIDE:` request cards use a one-row summary layout now; edit `.approval-card__row` and `.approval-card__copy` if you want the list denser or the text stacked again
  - `EDIT GUIDE:` date filter input is `#queue-date`; it defaults to today and loads the selected day across Fuel, EPASS, and Travel
  - `EDIT GUIDE:` Android-style top app bar lives in `.approvals-appbar`; edit it first if you want to reskin the mobile page
  - `EDIT GUIDE:` ang `buildFuelHistoryRows()` sa Fuel list Ã¢â‚¬â€ kung magdadagdag ng column, i-sync ang `<thead>` at ang admin/employee row templates; ang **Station** column ay `item.fuelstation` mula sa `api/fuel.php` history
  - `EDIT GUIDE:` Fuel **Travel** Ã¢â‚¬â€ `#fuel-travel-center-modal` (gitnang popup) + `#fuel-inline-travel-frame`; `samelcii-fuel-embed-travel-close` pag sarado sa iframe
  - `EDIT GUIDE:` left sidebar order is Employees Profile, HRAD, ISD, SOA, FUEL, IT Equipment, then Messenger above BILLING; edit the `<nav class="menu">` block to reorder it
  - `EDIT GUIDE:` dashboard module loader lives at the bottom of `pages/dashboard/index.html`; it swaps the iframe for data-src buttons and keeps Fuel on the inline form shell
  - `EDIT GUIDE:` Fuel stays inside the dashboard form shell; the bottom dashboard loader shows or hides that shell when the Fuel nav item is clicked
  - `EDIT GUIDE:` inline Fuel request list is visible on fresh open in `#fuel-inline-request-list`; `showInlineFuelHistoryList()` and `loadFuelHistory()` control the current request queue display, with a latest-record fallback when no rows come back
  - `EDIT GUIDE:` Fuel now syncs against the logged-in account code; `getFuelSessionUsercode()`, `syncFuelAccountFromSession()`, `loadFuelEmployeeData()`, and `submitFuelRequest()` use the session usercode/accountnumber fallback
  - `EDIT GUIDE:` Fuel module report is in `pages/modules/fuel/` (`#fuel-reports-btn` Ã¢â€ â€™ full analytics modal); dashboard inline report modal remains in `pages/dashboard/index.html` but Fuel nav loads the standalone module.
  - `EDIT GUIDE:` dashboard module loader boots the active sidebar page on load; the Employees Profile iframe is the default fresh-open target
  - `EDIT GUIDE:` SOA, Billing, and Messenger are the standalone sidebar buttons and load their module iframe through `data-src`
  - `EDIT GUIDE:` Special Features section is visible only for privilege 10 and lives after Billing in the sidebar; edit `[data-admin-only="10"]` if Signatory or Print Form should move
  - `EDIT GUIDE:` dashboard logout now calls `api/auth.php?action=logout`, clears `samelcii_session`, and redirects back to the auth page
  - `HUWAG BAGUHIN:` keep the dashboard session guard near the module loader so the shell cannot stay open after logout

- `pages/modules/editable-print/index.html`
  - `EDIT GUIDE:` Print Form shortcut opens this designer; Fuel and EPASS tabs save layout data in browser storage for print use
  - `HUWAG BAGUHIN:` privilege token check uses both `privilage` and `privilagemenu` so non-super-admin users cannot see the designer through a direct URL

- `pages/modules/signatory/index.html`
  - `EDIT GUIDE:` `#super-admin-lock` is the fallback screen for non-privilege-10 direct URL access
  - `HUWAG BAGUHIN:` the visible Signatory workspace stays hidden unless `script.js` confirms privilege token 10

- `pages/modules/signatory/script.js`
  - `EDIT GUIDE:` `signatoryPrivilegeTokens()` controls the front-end privilege guard before loading the API data
  - `HUWAG BAGUHIN:` keep this guard aligned with `api/signatory.php::requirePrivilege10()`

- `pages/modules/signatory/styles.css`
  - `EDIT GUIDE:` `.super-admin-lock` and `body.access-denied` style the super-admin-only fallback state

- `pages/modules/dtr/script.js`
  - `EDIT GUIDE:` `loadDirectory()` loads the employee rail from signatory bootstrap or employee search
  - `EDIT GUIDE:` `loadRows()` computes the selected employees' monthly DTR rows and fills the center grid
  - `EDIT GUIDE:` `renderEmployees()` builds the clickable left employee list with selection checkboxes
  - `EDIT GUIDE:` `renderRows()` maps the computed monthly rows into the old-form grid columns
  - `EDIT GUIDE:` `downloadCsv()` powers the Excel button from the visible DTR rows
  - `EDIT GUIDE:` `syncDatePanel()`, `populateMonthYearControls()`, and `applyMonthYearToDates()` keep the top controls aligned
  - `EDIT GUIDE:` `logout()` now calls `api/auth.php?action=logout`, clears the saved session, and sends the user back to login
  - `HUWAG BAGUHIN:` `department-filter`, `employee-filter`, `employee-search`, `employee-list`, and `dtr-table-body` drive the page flow
  - `HUWAG BAGUHIN:` `logout-btn` stays bound to the DTR top-right control only

- `pages/modules/dtr/styles.css`
  - `EDIT GUIDE:` keep the DTR block flat, squared, and border-based instead of pill-heavy
  - `EDIT GUIDE:` `.dtr-page`, `.dtr-shell`, `.dtr-topbar`, and `.dtr-toolbar` control the old-form frame and tighter report spacing
  - `EDIT GUIDE:` `.dtr-top-btn` controls the Dashboard and Logout buttons in the header strip
  - `EDIT GUIDE:` `.dtr-date-block`, `.dtr-workbench`, `.dtr-sidebar`, and `.dtr-employee-item` control the left filter stack and employee rail
  - `EDIT GUIDE:` `.dtr-main`, `.dtr-month-controls`, and `.dtr-table-sheet` control the computed DTR grid and report header
  - `EDIT GUIDE:` `.dtr-action-row` groups the Print and Excel buttons inside the toolbar
  - `HUWAG BAGUHIN:` keep the DTR class scope if you do not want other modules to inherit this layout

- `api/membership.php`
  - `EDIT GUIDE:` `profile_photo_store` saves captured customer photos under `uploads/member_photos/<account>/`
  - `HUWAG BAGUHIN:` keep the file upload checks and account requirement in place

## Comment Rule

- Gumamit ng maikling Tagalog comment sa custom code.
- Lagyan ng `EDIT GUIDE:` ang madalas baguhin.
- Lagyan ng `HUWAG BAGUHIN:` ang delikadong logic.
- Huwag punuin ng comments ang bawat linya.

## Handoff Tip

- Kapag may binagong feature, maglagay muna ng short comment sa file.
- Pagkatapos, idagdag dito ang eksaktong file at seksyon na susunod baguhin.
| `pages/modules/employees-profile/index.html` | Employees profile host page | Employee form shell, profile cards, leave/travel/epass modal wiring |
| `pages/modules/employees-profile/styles.css` | Employees profile styling | Layout, cards, calendar, leave request, DTR panel, travel and EPASS visuals |
| `pages/modules/employees-profile/script.js` | Employees profile behavior | Employee data, modal forms, leave calendar, leave credit ledger, DTR leave compute, travel and EPASS actions |
| `api/epass.php` | EPASS request API | Request-number preview, create flow, list/history, and approval status |
| `assets/js/dept-head-approval-hub.js` | Department head approval hub | Floating badge count, queue loading, default Fuel section, and approve/reject routing |
| `assets/css/dept-head-approval-hub.css` | Department head approval hub styling | FAB circle glow, pending badge pulse, panel layout, and responsive desk styles |
| `api/travel.php` | Travel request API | Request-number preview, create flow, list/history, and approval status |

- `pages/modules/employees-profile/index.html`
  - `EDIT GUIDE:` fresh open now highlights the Leave quick-action only after script.js runs; the active class in the HTML should stay in sync with the startup form
  - `EDIT GUIDE:` leave modal now opens straight to the request sheet with a wider, flatter split workbench layout
  - `EDIT GUIDE:` keep leave date IDs stable because script.js reads them directly
  - `EDIT GUIDE:` preview chips and total band are the main editable UI summary blocks
  - `HUWAG BAGUHIN:` leave calendar and save button IDs must stay the same for form logic
  - `EDIT GUIDE:` leave credit ledger stays as a separate render block in script.js; the OT button now opens the overtime request form instead of that credits view
  - `EDIT GUIDE:` leave form card now starts directly at the request sheet without a header strip
  - `EDIT GUIDE:` quick-action row labels are now ALC, EPASS/TRAVEL, LEAVE, and OT; change the `<span>` text in `pages/modules/employees-profile/index.html` if you want the names swapped again
  - `EDIT GUIDE:` the section tags inside `pages/modules/employees-profile/script.js` now read ALC for the daily points sheet, Leave for the leave request, and OT for the overtime request
  - `EDIT GUIDE:` leave form copy should stay separate from ALC points copy
  - `EDIT GUIDE:` quick-action row uses **four** columns (ALC, EPASS/TRAVEL, LEAVE, OT); ang EPASS/TRAVEL ay nagbubukas ng `#epass-travel-picker-modal` bago ang main form
  - `EDIT GUIDE:` leave credits view is now intentionally flat and data-first instead of heavily designed
  - `EDIT GUIDE:` DTR modal now opens a color-assigned panel with a hero header, loading shell, summary cards, info strip, and monthly grid

- `pages/dashboard/index.html`
  - `EDIT GUIDE:` Employees Profile module source uses a versioned URL; bump it when the module UI changes
  - `EDIT GUIDE:` if Employees Profile button labels do not refresh on the dashboard, bump `../modules/employees-profile/index.html?v=...` in the sidebar item and moduleData block
  - `EDIT GUIDE:` Membership module source also uses a versioned URL; bump it when the queue UI changes
  - `EDIT GUIDE:` left sidebar order is Employees Profile, HRAD, ISD, SOA, FUEL, IT Equipment, then Messenger above BILLING; edit the `<nav class="menu">` block to reorder it
  - `EDIT GUIDE:` Fuel stays inside the dashboard form shell; the bottom dashboard loader shows or hides that shell when the Fuel nav item is clicked
  - `EDIT GUIDE:` inline Fuel request list is visible on fresh open in `#fuel-inline-request-list`; `showInlineFuelHistoryList()` and `loadFuelHistory()` control the current request queue display, with a latest-record fallback when no rows come back
  - `EDIT GUIDE:` Fuel now syncs against the logged-in account code; `getFuelSessionUsercode()`, `syncFuelAccountFromSession()`, `loadFuelEmployeeData()`, and `submitFuelRequest()` use the session usercode/accountnumber fallback
  - `EDIT GUIDE:` Fuel report button now simply scrolls to the current request list and refreshes the loaded rows.
  - `EDIT GUIDE:` dashboard module loader boots the active sidebar page on load; the Employees Profile iframe is the default fresh-open target
  - `EDIT GUIDE:` SOA, Billing, and Messenger are the standalone sidebar buttons and load their module iframe through `data-src`
  - `EDIT GUIDE:` OTTO agent tools were removed from the sidebar; keep the area below the module list free for the user card and logout button
  - `EDIT GUIDE:` IT Equipment sidebar now has Accountability, Turn over, Job order, Inventory, and Status Report items; they route to `pages/modules/it-equipment/index.html?tab=...` so the top tab strip stays removed
  - `EDIT GUIDE:` fuel List Request button now loads employee-scoped history from the current fuel-id field

- `api/fuel.php`
  - `EDIT GUIDE:` history endpoint now accepts optional `usercode` so employee request lists stay scoped to the selected employee
  - `EDIT GUIDE:` history responses normalize `EmployeePhotoUrl` so the Approval Desk Fuel card can use the real requester photo when it exists
  - `EDIT GUIDE:` `update_status` now checks approver privileges before approving or rejecting fuel requests

- `api/epass.php`
  - `EDIT GUIDE:` EPASS numbers can group many employees under one request; `requester_names`, `requester_usercodes`, and `requester_photo_urls` are returned alongside `granted_to` so the desk can show the full employee set instead of one name
  - `EDIT GUIDE:` `pending`, `all`, and `list` group by `epassnumber` and return every grouped employee via `granted_to`, `requester_names`, `requester_usercodes`, and `requester_photo_urls`; do not hard-code a sample EPASS number.
  - `EDIT GUIDE:` `pending` returns the mobile approval queue and `update_status` updates EPASS approval state
  - `EDIT GUIDE:` `all` returns full EPASS history for approvers in the mobile program
  - `EDIT GUIDE:` keep the approver privilege band aligned with Fuel and Travel

- `Approval Desk queue avatars`
  - `EDIT GUIDE:` EPASS list cards now summarize the whole employee group under one epass number, using the `EMPLOYEES:` label plus `requester_names` / `granted_to`, and the avatar fallback shows an employee-group label instead of `??` when no photo exists
  - `EDIT GUIDE:` Approval Desk EPASS detail header now uses a compact group subtitle (`count | department | destination`) so the list and detail panel do not repeat the same long employee line twice
  - `EDIT GUIDE:` EPASS detail now renders the included employee names as chips in `renderDetail()` so grouped requests are easier to scan at a glance
  - `EDIT GUIDE:` EPASS list cards are now minimal: requester photo on the left, a separate count bubble beside it, EPASS number in the title, and the employee-name line hidden because the full employee set stays in the detail form only
  - `EDIT GUIDE:` the EPASS avatar fallback now uses initials from the first included employee; if a profile photo exists, the image should show instead of the initials
  - `EDIT GUIDE:` Fuel, Travel, Leave, and Overtime queue cards now follow the same photo-led minimal list pattern as EPASS, with the name line hidden and the detail form carrying the full breakdown
  - `EDIT GUIDE:` queue cards now lead with one human name instead of the request number; EPASS uses the first included employee name, while the other queues use the requester name
  - `EDIT GUIDE:` EPASS count now overlays the bottom edge of the avatar like Messenger; adjust `.dept-head-approval-list-item__count-badge` if you want the bubble to sit lower or higher
  - `EDIT GUIDE:` every queue card now gets the same avatar count badge overlay; EPASS shows the real group count while Fuel, Travel, Leave, and Overtime show a compact single-count badge
  - `EDIT GUIDE:` queue card date now sits above the short visible name; adjust `.dept-head-approval-list-item__date` and `.dept-head-approval-list-item__top strong` if you want the stack to change
  - `EDIT GUIDE:` Fuel now uses the same visible date/name stack as the other queues; edit the Fuel override in `.dept-head-approval-list-item--fuel .dept-head-approval-list-item__top` if you want Fuel to look different again
  - `EDIT GUIDE:` Approval Desk detail rows now include a request source line (Fuel Form vs Employees Profile) and link rows for Fuel/Travel so approvers can see where each request came from and what it connects to
  - `EDIT GUIDE:` the Request date control now defaults to today so the desk stays day-scoped, and the new `All Pending` button clears the date filter when you need the full queue
  - `EDIT GUIDE:` `api/epass.php`, `api/travel.php`, `api/leave.php`, and `api/overtime.php` now include requester photo URLs so the shared Approval Desk list can show the real profile picture instead of initials when the upload exists
  - `EDIT GUIDE:` `assets/js/dept-head-approval-hub.js` uses the shared requester photo field for every queue card, and falls back to initials if no upload is available
  - `EDIT GUIDE:` Approval Desk EPASS group text is built by `requestEpassGroupSummary()` and `requestEpassCountLabel()`; edit those helpers if the group summary format needs to change

- `assets/css/dept-head-approval-hub.css`
  - `EDIT GUIDE:` `.dept-head-approval-detail__title span` and `.dept-head-approval-list-item__meta` clamp long EPASS group text so the panel stays readable
  - `EDIT GUIDE:` `.dept-head-approval-detail__people` and `.dept-head-approval-detail__person` control the EPASS employee chips; edit these if you want the included names to read like tags or pill labels
  - `EDIT GUIDE:` `.dept-head-approval-list-item--epass`, `.dept-head-approval-list-item__count-badge`, `.dept-head-approval-list-item__name`, and `.dept-head-approval-list-item__meta` control the simplified EPASS queue card with photo, Messenger-style count bubble, and hidden employee names; `.dept-head-approval-list-item__avatar-text` should stay visible unless the photo exists
  - `EDIT GUIDE:` `.dept-head-approval-list-item--profile .dept-head-approval-list-item__top strong` now carries the single visible name on each queue card, with `.dept-head-approval-list-item__date` above it
  - `EDIT GUIDE:` the same hidden-name photo-led style now applies to Fuel, Travel, Leave, and Overtime queue cards via `.dept-head-approval-list-item--profile`
  - `EDIT GUIDE:` the refined Approval Desk theme is in the final override block at the end of the stylesheet; edit that section when changing the card surfaces, panel header, or sidebar feel
  - `EDIT GUIDE:` the complete UI redesign block at the very end drives the current Approval Desk look; edit that block if you want to shift the layout, spacing, or color mood again

## OT Pending Edit Update

- `api/overtime.php`
  - `EDIT GUIDE:` `action=update` lets employees change OT date, time, hours, purpose, attachment type, and attachment JSON only while `status = 1` and `dept_head_status = 0`.
  - `HUWAG BAGUHIN:` update guard must stay aligned with approval flow so approved or department-head-started OT records cannot be changed.
  - `EDIT GUIDE:` `action=update_dept_status` now stores `dept_head_remarks` on OT rejection so the employee can see why the request was not approved.
  - `EDIT GUIDE:` `buildOvertimeMonitorSteps()` now renders the four-stage OT flow labels: Pre-Approved Overtime Authorization, HR Checking, Audit Verifying all Document Attachments, and GM for Approval.
  - `EDIT GUIDE:` `departmenttb` routing is used to resolve the actual signatories for Department Head, HR, IAD, and OGM so the OT monitor can show who the workflow points to.

- `pages/modules/employees-profile/script.js`
  - `EDIT GUIDE:` `setOvertimeEditMode()` and `fillOvertimeFormForEdit()` load pending OT rows back into the form; `submitOvertimeRequest()` switches between create and update.
  - `EDIT GUIDE:` OT history cards show the department-head approver plus rejection remarks when the request is denied.
  - `EDIT GUIDE:` pending OT cards stay clean and do not show reviewer text until the department-head step is done.
  - `EDIT GUIDE:` OT approval monitor uses a visible `blocked` state for later steps after rejection so the rejected step is the one that carries the real reason and the rest do not look like the same pending state.
  - `EDIT GUIDE:` overtime list rows now show `Rejected` immediately when any approver rejects the request, with the reason printed on the collapsed card so employees do not need to open the monitor.
  - `HUWAG BAGUHIN:` existing attachments are reloaded from `attachments_json` before update so files are not cleared accidentally.

- `pages/modules/employees-profile/styles.css`
  - `EDIT GUIDE:` `.overtime-edit-btn` styles the pending OT Edit button; `.overtime-save-btn.is-editing` marks update mode.
  - `EDIT GUIDE:` `.overtime-list-row` and `.overtime-monitor-inline` keep the request details and approver strip on one visible line.
  - `EDIT GUIDE:` `.overtime-monitor-step.blocked` gives later OT stages a yellow blocked accent so employees can spot where the workflow stopped.
  - `EDIT GUIDE:` `.overtime-list-note--rejected` styles the collapsed OT rejection reason line.

- `pages/modules/employees-profile/index.html`
  - `EDIT GUIDE:` CSS/JS version string was bumped to `20260522-overtime-reject-visible-v4`.

- `pages/dashboard/index.html`
  - `EDIT GUIDE:` Employees Profile iframe version string was bumped to `20260522-overtime-reject-visible-v4`.
  - `EDIT GUIDE:` rejected OT rows use the red `.epass-list-side em.error` chip so the list does not keep the orange pending look.

- `api/travel.php`
  - `EDIT GUIDE:` `pending` returns the mobile approval queue and `update_status` updates travel approval state
  - `EDIT GUIDE:` `all` returns full Travel history for approvers in the mobile program
  - `EDIT GUIDE:` keep the approver privilege band aligned with Fuel and EPASS

- `pages/modules/employees-profile/styles.css`
  - `EDIT GUIDE:` leave form card, calendar shell, preview band, and right rail all control the current Leave modal layout; the request sheet begins immediately with lighter borders and tighter spacing
  - `EDIT GUIDE:` `.epass-travel-picker-modal` at `.epass-travel-choice` Ã¢â‚¬â€ laki ng icon at grid ng picker dito
  - `EDIT GUIDE:` leave ledger table controls the spreadsheet-style credit view
  - `EDIT GUIDE:` dtr-leave-sheet, hero, summary cards, info strip, and topbars control the redesigned DTR panel
  - `EDIT GUIDE:` dtr sheet table controls the single combined month and day grid
  - `EDIT GUIDE:` `.profile-modal.dtr-mode .dtr-footer-total` width block fixes the DTR total column sizing near the bottom of the stylesheet
  - `EDIT GUIDE:` dtr-latest-point highlights the selected/latest month column while the rest stays neutral
  - `EDIT GUIDE:` dtr footer rows, footer legend, and leave-footer pills control the bottom leave-credit strip
  - `EDIT GUIDE:` leave form card and request sheet are separate layout blocks now
  - `EDIT GUIDE:` quick-action tab styling lives here, kabilang ang OT button
  - `EDIT GUIDE:` OT modal Ã¢â‚¬â€ left `.overtime-list-item-wrap` (hover = Upload file, green `.overtime-list-check` when uploaded); `.overtime-reference-grid` = 4 columns (date, from, to, hours)
  - `EDIT GUIDE:` `.overtime-list-overlay` Ã¢â‚¬â€ floating MY REQUESTS panel sa ibabaw ng form; laki/scroll sa `.overtime-history-panel` at `.overtime-list-body`
  - `EDIT GUIDE:` change gradients and accent colors here to reskin the leave module
  - `EDIT GUIDE:` flatten the leave credits styles here when you want a more data-first list view
  - `HUWAG BAGUHIN:` responsive rules for leave modal layout must stay aligned with script.js structure

- `pages/modules/employees-profile/script.js`
  - `EDIT GUIDE:` default fresh load now stays on the profile view; update the startup block near `renderDtrSheet()` if you want a form to auto-open again
  - `EDIT GUIDE:` OT request form Ã¢â‚¬â€ `renderOvertimeRequestForm()` left list upload per type; `overtimeAttachmentsByType` + `compressOvertimeAttachment()`; `#overtime-attachment-data` JSON payload for draft save
  - `EDIT GUIDE:` OT MY REQUESTS Ã¢â‚¬â€ `#overtime-list-overlay` + `setOvertimeListOverlayOpen()`; buksan/sara via My Requests button, Ãƒâ€”, o backdrop
  - `EDIT GUIDE:` OT saved times Ã¢â‚¬â€ `#overtime-time-presets-list`, `loadOvertimeTimePresets()`, API `overtime.php?action=time_presets`; click chip = auto-fill From/To/Hours
  - `EDIT GUIDE:` `setActiveQuickAction`, `openEpassTravelPicker`, at `.epass-travel-choice` Ã¢â‚¬â€ flow ng pinagsamang EPASS/TRAVEL quick button
  - `EDIT GUIDE:` `?embedTravel=1` + `body.profile-embed-travel` Ã¢â‚¬â€ Fuel iframe overlay; `closeFormModal` nagpo-postMessage `samelcii-fuel-embed-travel-close` sa parent
  - `EDIT GUIDE:` `samelcii-open-travel` postMessage Ã¢â‚¬â€ bukas Travel sa main dashboard iframe (Employees Profile module)
  - `EDIT GUIDE:` renderLeaveCreditLedger builds the spreadsheet-style leave credit section
  - `EDIT GUIDE:` renderDtrLeaveCompute loads the DTR summary and annual points data for the modal panel
  - `EDIT GUIDE:` renderDtrSummaryCards controls the hero summary cards at the top of the redesigned DTR panel
  - `EDIT GUIDE:` DTR single sheet now combines month headers, one points column per month, summary rows, and day rows in one table
  - `EDIT GUIDE:` dtr-latest-point is the main accent color in the grid and summary rows
  - `EDIT GUIDE:` DTR day cells now read the computed points from each month's own summary so the whole year shows in one grid
  - `EDIT GUIDE:` DTR footer rows add the leave type totals and the color legend strip below the sheet
  - `EDIT GUIDE:` DTR hero text, meta strip, and footer pills live in the same render block if you want to reskin the panel
  - `EDIT GUIDE:` remove the old VL/SL/OL triple columns here when you want a simpler monthly points list
  - `EDIT GUIDE:` leave request now skips both the old summary hero and the request-details header so the sheet opens immediately
  - `EDIT GUIDE:` update selectLeaveDate and updateLeaveSummary if date or total rules change
  - `EDIT GUIDE:` leave credits copy and table rows are kept simple so the data stays readable
  - `HUWAG BAGUHIN:` leave-from-date, leave-to-date, leave-type, and leave-submit IDs drive the save flow

- `pages/modules/employees-profile/styles.css`
  - `EDIT GUIDE:` `.epass-request-head` now keeps the EPASS header text-only; the orange request-number badge and duplicate title were removed

- `pages/modules/employees-profile/script.js`
  - `EDIT GUIDE:` `loadRequestNumberPreview()` fetches the EPASS preview number when the form opens or after save
  - `EDIT GUIDE:` `notifyApprovalDeskRefresh()` broadcasts the Approval Desk refresh ping after EPASS, Travel, and OT saves so the admin counts update without a click
  - `EDIT GUIDE:` the Approval Desk badge now pops outside the FAB and plays a 3-second radar burst only when the pending count increases
  - `EDIT GUIDE:` `openFormModal()` now refreshes the request-number badge before the user starts typing
  - `EDIT GUIDE:` request separators in `requestRequester()` and `requestShortMeta()` stay plain ASCII `|` so the Approval Desk never shows mojibake
  - `HUWAG BAGUHIN:` keep `epass-request-number` aligned with the badge loader so the preview text updates correctly

- `pages/modules/employees-profile/styles.css`
  - `EDIT GUIDE:` `.epass-request-head` now keeps the EPASS header text-only; the orange request-number badge was removed

- `assets/js/dept-head-approval-hub.js`
  - `EDIT GUIDE:` `#dept-head-approval-date` is optional; blank means all pending loads first, and mouse wheel steps the day only when you choose a date

- `api/epass.php`
  - `EDIT GUIDE:` `action=next_number` returns the next EPASS request number for the modal badge

- `assets/js/dept-head-approval-hub.js`
  - `EDIT GUIDE:` `mount()` now refreshes the queues on dashboard load so the admin sees pending counts immediately
  - `EDIT GUIDE:` `getDepartmentFilter()` keeps the desk scoped to the logged-in approver's actual department record, not the position title
  - `EDIT GUIDE:` Fuel queue follows the legacy area-based scope and does not send the department prefix filter anymore
  - `EDIT GUIDE:` approval section tabs now live in one horizontal row in the header area so the left request list gets more vertical space
  - `EDIT GUIDE:` Fuel and EPASS skip the front-end department filter so current pending rows stay visible in the list; Travel, Leave, and OT still respect the department filter
  - `EDIT GUIDE:` the `message` listener now accepts `samelcii-approval-refresh` and the save-event names from the request forms so the desk refreshes as soon as a request is submitted
  - `EDIT GUIDE:` `dept-head-approval-search` filters the left list by employee/request while approved rows stay visible with a green check and their original order
  - `EDIT GUIDE:` `has-pending` keeps the FAB in alert mode while `is-alerting` only plays the short radar animation for new requests
  - `EDIT GUIDE:` `queueOrder` and `reviewed` keep the list stable after approve/reject so the row does not jump away
  - `EDIT GUIDE:` `updateFabBadge()` toggles the glowing pending state for the approval FAB and orange count badge
  - `EDIT GUIDE:` blank `selectedDate` means the desk loads every pending request first; set a date only when you want to narrow the queue
  - `EDIT GUIDE:` privilege 6 approvers read the queue by department, so the title text does not control who can approve

- `assets/css/dept-head-approval-hub.css`
  - `EDIT GUIDE:` `.dept-head-approval-fab`, `.dept-head-approval-panel`, and `.dept-head-approval-detail` define the rebuilt smoother blue-violet Approval Desk theme
  - `EDIT GUIDE:` `.dept-head-approval-panel__head-tabs` keeps the section tabs inside the header, and `.dept-head-approval-tabs` forces one horizontal row
  - `EDIT GUIDE:` `.dept-head-approval-detail__head`, `.dept-head-approval-detail__title`, and `.dept-head-approval-detail__status` now create the shared top header strip for all request types
  - `EDIT GUIDE:` the smoother theme softens shadows, hover lift, and backdrop blur so the desk feels lighter without changing the queue logic
  - `EDIT GUIDE:` `.dept-head-approval-detail` and its child blocks now control the shared plain approval summary layout for Fuel, EPASS, Travel, Leave, and OT
  - `EDIT GUIDE:` `.dept-head-approval-list-item--profile`, `.dept-head-approval-list-item__avatar`, `.dept-head-approval-list-item__avatar-image`, and `.dept-head-approval-list-item__profile-copy` control the shared profile-style list cards for every queue

## DTR Connection Notes

- `pages/modules/dtr/index.html`
  - Redirects `file:` opens back to the served HTTP app so DTR API calls can load.
- `pages/modules/dtr/script.js`
  - Builds API URLs from the served app base instead of the local file path so fetch stays connected.
- `api/auth.php`
  - `EDIT GUIDE:` `logout` action clears the PHP session and session cookie so desktop and module logout stay in sync
  - `EDIT GUIDE:` dashboard, DTR, Fuel, Forms, SOA, and mobile approvals all call this same logout action before redirecting to login
## Fuel Module Transfer

- `pages/modules/fuel/index.html`
  - Standalone Fuel request UI now lives here.
  - The old Dashboard and Logout header buttons were removed from the module header.
  - The standalone page title and extra outer frame were removed so the Fuel content starts cleaner.
  - The large card wrappers around the summary, request form, and request list were flattened to fit the page tighter.
  - The outer page padding and shell border were reduced so the Fuel module no longer shows a double backdrop frame.
  - The Fuel module was then tightened again with smaller paddings, shorter cards, and smaller table controls so it does not feel oversized.
  - The main Fuel boxes now use a more uniform compact height so the balance card, inputs, and action buttons read as one set.
  - The Fuel summary and request fields now use icon-box textbox rows so the module matches the cleaner reference style.
  - The Purpose field was changed to match the same compact box height as the Vehicle field so the full request form stays uniform.
  - The red helper text under the Fuel balance was removed so the balance card stays minimal.
  - EDIT GUIDE: Change the balance card, request form, and current request list in this file when Fuel layout or fields need updates.
  - The Fuel input boxes are intentionally kept compact now so they stay close to the Vehicle box size.
  - The Fuel page is now rebuilt as a clean white shell with a red balance card, compact summary rails, and a cleaner request table layout.
  - The Fuel field icons were removed; buttons now use text labels instead of icon-only controls.
  - `EDIT GUIDE:` `#fuel-add-btn` opens add-fuel modal (`#fuel-allocation-modal`). White layout: left `.fuel-allocation-side` (gauge + metric rows in `.fuel-allocation-dept-card`), right `.fuel-allocation-panel` with blocks (search, employee ID, balance, footer save). Chart.js `#fuel-allocation-gauge`; CSS `/* SECTION: Add fuel modal */` in `index.html`.
  - `EDIT GUIDE:` Current Request List (`#fuel-table-body`) loads on page open via `loadHistory()` Ã¢â€ â€™ `api/fuel.php?action=history&limit=10`. Uses `accountnumber` then `usercode` from `samelcii_session` (same as dashboard). If history is empty, shows latest row from `action=employee` snapshot.
  - `EDIT GUIDE:` `#fuel-reports-btn` opens the full Fuel report modal (`#fuel-report-modal`) with Chart.js analytics, dept balance gauges (admin), and paginated history table.
  - `EDIT GUIDE:` Report logic lives in `pages/modules/fuel/fuel-report.js`; charts call `api/fuel.php?action=analytics`, list calls `action=history`, gauges call `action=fuel_balance_trend`.
  - `EDIT GUIDE:` Fuel report table renderer accepts legacy field names (`far_code`, `employee_name`, etc.) and the older API names (`FARCode`, `EmployeeName`, `ReqItem`, `ReqAmt`, `Status`, `PresRequestDate`) so the old data still renders.
  - `EDIT GUIDE:` Fuel page also loads `assets/js/offline-sync.js?v=20260525-sync-badge-quiet-v2`; bump the version if the shared offline queue helper changes again.
  - `EDIT GUIDE:` `loadEmployeeData()` now prefers `data.assigned_vehicle` from `api/fuel.php?action=employee` so the Vehicle field shows the employee's assigned plate before any history value.
  - `EDIT GUIDE:` `#fuel-vehicle` now opens a click-to-pick assigned vehicle dropdown; `loadVehicleSuggestions()` pulls `api/fuel.php?action=vehicles&assignedOnly=1`, and the standalone page uses `#fuel-vehicle-results` for the popup list.
  - `EDIT GUIDE:` `used_today` comes from today's `fuelallocation_history` rows so the vehicle picker can show `USED TODAY` and the note "In use today, but you can still proceed."
  - `EDIT GUIDE:` vehicle `status` is only shown when it is not the same as the daily availability badge, so `OK` is not duplicated in the picker.
  - `EDIT GUIDE:` the vehicle picker list now uses a card-stack look with rounded rows, an accent bar, and a scrollable max-height container; adjust `.vehicle-results`, `.vehicle-option`, and the chip classes for future visual changes.
  - `EDIT GUIDE:` `#fuel-purpose` now carries a helper note that the same purpose will be reused in the linked EPASS/Travel embed, so staff do not retype it twice.
  - HUWAG BAGUHIN: Keep the `api/fuel.php` action names aligned with the current request load and submit flow.

- `api/fuel.php`
  - `EDIT GUIDE:` `action=employee` now returns `assigned_vehicle` and `assigned_vehicle_detail` from the best vehicle match so both Fuel UIs can prefill the Vehicle field.
  - `EDIT GUIDE:` `action=vehicles` now attaches `used_today`, `used_today_count`, and `used_today_last_at` from today's fuel history so the picker can warn when a vehicle has already been used today.
  - `EDIT GUIDE:` Fuel approval now requires either a linked EPASS or a linked Travel order for the FAR before status can become approved.
  - `EDIT GUIDE:` `pending` and `all` stay area-based for legacy Fuel approval behavior so Main can see all areas without the department prefix choke point
  - `HUWAG BAGUHIN:` keep the approve/reject balance checks aligned with the Fuel EPASS linking flow
- `pages/dashboard/index.html`
  - The Fuel sidebar button now opens the standalone Fuel module page instead of the inline dashboard shell.
  - EDIT GUIDE: Update the Fuel click path here if the module location changes again; the current iframe URL is versioned (`?v=20260525-sync-badge-quiet-v2`) to force fresh fuel-module loads.
  - `EDIT GUIDE:` Shared offline helper is versioned at `assets/js/offline-sync.js?v=20260525-sync-badge-quiet-v2`; keep dashboard and module includes matched when queue behavior changes.
  - `EDIT GUIDE:` `loadFuelEmployeeData()` now prefers `data.assigned_vehicle` for `#fuel-vehicle`, then falls back to the latest request vehicle if the assignment lookup is empty.
  - `EDIT GUIDE:` Clicking or focusing `#fuel-vehicle` now opens `#vehicle-results` immediately so the user can pick an assigned vehicle without typing.
  - `EDIT GUIDE:` `#fuel-vehicle` uses the vehicle suggestion popup in `#vehicle-results`; `loadVehicleResults()` filters `api/fuel.php?action=vehicles&assignedOnly=1` to the logged-in area/department.
  - `EDIT GUIDE:` `#fuel-purpose` shows a helper note that the same purpose will flow into the linked EPASS/Travel embed.

## Membership Floating Button

- `pages/modules/membership/index.html`
  - `EDIT GUIDE:` `.member-list-toggle` controls the floating New Member List button; the glow and color-changing shadow now come from `memberListToggleAura`, `memberListToggleGlow`, and `memberListBadgePulse`.
  - `HUWAG BAGUHIN:` keep the button ID and pending badge ID unchanged because the queue counter script depends on them.

## Mobile Approval Desk Leave Queue

- `api/leave.php`
  - `EDIT GUIDE:` `pending` and `all` load leave rows from `tbleave`; change `leaveWhereClause()` if the Leave table date/search fields change.
  - `HUWAG BAGUHIN:` `update_status` uses `Id` instead of `trackingNo` because old leave rows can share a tracking number.

- `pages/modules/mobile-approvals/index.html`
  - `EDIT GUIDE:` Leave bottom-nav button uses `data-tab="leave"` and counter `#leave-count`; keep these aligned with `script.js`.

- `pages/modules/mobile-approvals/script.js`
  - `EDIT GUIDE:` `LEAVE_API`, `loadLeaveQueue()`, `updateLeaveStatus()`, and `requestBodyRows("leave")` control Leave list/load/detail/approval behavior.
  - `EDIT GUIDE:` Leave pending queue loads the selected month, while Leave all-history keeps the selected day filter.
  - `EDIT GUIDE:` default `state.activeTab` is Fuel and `state.mode` is pending so the page opens on Fuel first.
  - `HUWAG BAGUHIN:` Leave cards display `tracking_no`, but actions still send `leave_id` for safe single-row updates.

- `pages/modules/mobile-approvals/styles.css`
  - `EDIT GUIDE:` `.approvals-nav` now has six columns; adjust here if another approval tab is added.

- `pages/dashboard/index.html`
  - `EDIT GUIDE:` Mobile Approvals iframe version is bumped to `20260521-mobile-approval-leave-v1` so users receive the Leave queue update.
  - `EDIT GUIDE:` dashboard floating Approval Desk JS version is bumped to `20260525-epass-group-v2` so grouped EPASS employees refresh in the browser.

- `assets/js/dept-head-approval-hub.js`
  - `EDIT GUIDE:` `SECTIONS` now includes Leave, `loadLeaveQueue()` loads `api/leave.php?action=pending`, and `DEFAULT_SECTION` decides which tab opens first.
  - `HUWAG BAGUHIN:` Leave approval sends `leave_id` to keep duplicate tracking numbers from updating together.
  - `EDIT GUIDE:` Fuel list is department-scoped now so only the logged-in approver's department rows appear in the Approval Desk.
- `assets/css/dept-head-approval-hub.css`
  - `EDIT GUIDE:` `.dept-head-approval-sidebar__filters`, `.dept-head-approval-date`, and `.dept-head-approval-sidebar__search` keep the Request Date and Search controls pinned to the left filter stack above the request list.

- `assets/css/dept-head-approval-hub.css`
  - `EDIT GUIDE:` `.dept-head-approval-detail__type--leave` controls the Leave badge color in the floating Approval Desk.

## Approval Desk Overtime Default

- `assets/js/dept-head-approval-hub.js`
  - `EDIT GUIDE:` `DEFAULT_SECTION` controls which Approval Desk tab opens first; it is set to `ot` so department heads land directly on the Overtime interface.
  - `HUWAG BAGUHIN:` keep the Overtime approve/reject path on `api/overtime.php?action=update_dept_status` so department-head status stays aligned with the OT monitor.
  - `EDIT GUIDE:` OT detail rendering now uses a dedicated workbench layout with summary tiles, a purpose panel, and a review note block; edit the OT branch inside `renderDetail()` if the card shape needs to change again.

- `pages/dashboard/index.html`
  - `EDIT GUIDE:` dashboard floating Approval Desk CSS version is bumped to `20260526-approval-ot-design-v36` and the JS version to `20260526-approval-ot-design-v2` so the Overtime layout refreshes in the browser.

## Typography Standard

- `assets/css/style.css`
  - `EDIT GUIDE:` the whole system now uses one standard sans stack: `Segoe UI`, `Tahoma`, `Arial`, `sans-serif`.
- `pages/modules/module.css`
  - `EDIT GUIDE:` shared module controls inherit the same standard sans stack so dashboard-linked modules stay visually consistent.
- `pages/dashboard/index.html`
  - `EDIT GUIDE:` the dashboard shell now uses the same font stack, and the affected iframe URLs were bumped so cached module pages reload the new typography.

## OT 3-Approver Workflow

- `api/auth.php`
  - `EDIT GUIDE:` login now self-checks the legacy `usertb` employee fields it reads (`VLbal`, `SLbal`, `OLbal`, `OT`, and related profile columns) so the auth endpoint still returns JSON when the schema is missing older columns.
  - `EDIT GUIDE:` `publicUser()` now carries `OT` into the session so overtime approval can tell whether the logged-in user is Supervisor, Department Head, or GM.

- `api/overtime.php`
  - `EDIT GUIDE:` `ensureOvertimeTable()` now prepares `supervisor_*`, `dept_head_*`, and `gm_*` workflow columns for the three OT approver stages.
  - `EDIT GUIDE:` `pending_dept` filters the queue by the logged-in OT role so each approver sees only their current stage.
  - `EDIT GUIDE:` `update` still allows pending OT rows to be edited, but it now resets the approval stages so the request restarts from Supervisor after saving.
  - `EDIT GUIDE:` `remove` deletes pending OT rows; approved or rejected requests stay locked in the database.
  - `EDIT GUIDE:` `buildOvertimeMonitorSteps()` renders the three OT steps in order: Supervisor, Department Head, and GM.

- `assets/js/dept-head-approval-hub.js`
  - `EDIT GUIDE:` OT queue badges and detail copy now read the new three-stage OT status instead of the old department-head-only status.

- `pages/modules/employees-profile/script.js`
  - `EDIT GUIDE:` OT list cards now summarize Supervisor, Department Head, and GM approval states and mark the request fully approved only when all three stages are complete.
  - `EDIT GUIDE:` OT list cards now show Edit/Remove buttons for pending rows, and saving an edit restarts the approval flow from Supervisor.
  - `EDIT GUIDE:` OT monitor is rendered inline inside the same OT row so the three approver tiles stay visible as profile circles with names and step badges.
  - `EDIT GUIDE:` `setOvertimeListOverlayOpen()` keeps the My Requests sheet as a smaller overlay; it should not be converted into the fullscreen overtime form.
  - `EDIT GUIDE:` `renderOvertimeTimePresets()` now adds a visible "Use this time" cue so the saved OT chips are clearly reusable for Time From / Time To.
  - `EDIT GUIDE:` Saved OT time cards now use a compact ticket-style layout with the action, meta, and note arranged into a cleaner hierarchy.
  - `EDIT GUIDE:` overtime list rows now show the OT time range on its own line with a clock icon so the usable time is easier to scan.

- `pages/modules/employees-profile/styles.css`
  - `EDIT GUIDE:` `.overtime-list-card` is now borderless and overflow-visible so the OT approver strip does not get clipped.
  - `EDIT GUIDE:` `.overtime-edit-btn`, `.overtime-remove-btn`, and `.overtime-list-actions` control the pending-only row actions in the OT list.
  - `EDIT GUIDE:` `.overtime-monitor-step`, `.overtime-monitor-avatar`, and `.overtime-monitor-copy` control the compact inline OT approver strip; the secondary label is hidden so the names fit cleanly.
  - `EDIT GUIDE:` `.profile-modal.overtime-mode` is the fullscreen-ish OT request form shell; `.overtime-list-overlay .overtime-history-panel` and `.overtime-list-body` control the width, height, and bottom space of the smaller My Requests sheet.
  - `EDIT GUIDE:` `.overtime-purpose-shell .overtime-textarea` is pinned to the taller purpose box height the user wants.
  - `EDIT GUIDE:` `.overtime-time-presets`, `.overtime-time-preset-btn`, and the preset action/meta/note rules control the new compact ticket-style saved OT time design.

- `pages/modules/employees-profile/index.html`
  - `EDIT GUIDE:` bump the OT module CSS/script versions here when the overtime workflow or inline OT approver row changes again.

- `api/overtime.php`
  - `EDIT GUIDE:` `lookupOvertimeRoleApprover()` now carries the approver profile photo URL for the OT monitor, with a safe fallback when the image is missing.

- `OT schedule popup`
  - `EDIT GUIDE:` the overtime request now opens the schedule chooser as a centered popup; date and time must be confirmed there before saving a new OT request.
  - `EDIT GUIDE:` `#overtime-open-schedule`, `#overtime-schedule-overlay`, `#overtime-schedule-backdrop`, and `#overtime-close-schedule` control the popup open/close flow.
  - `EDIT GUIDE:` `pages/modules/employees-profile/script.js` keeps the popup state, summary text, and validation that blocks save until the schedule is confirmed.
  - `EDIT GUIDE:` `pages/modules/employees-profile/styles.css` controls the centered popup shell, backdrop, and responsive sizing for the schedule chooser.

| File | Section | How to Edit Next Time |
|---|---|---|
| `pages/modules/employees-profile/script.js` | `renderOvertimeRequestForm()`, `updateOvertimeScheduleSummary()`, `setOvertimeScheduleModalOpen()` | Dito i-adjust ang centered schedule popup, summary text, at the confirm-before-save behavior. |
| `pages/modules/employees-profile/styles.css` | OT schedule popup block | Dito i-tune ang backdrop, panel width, and mobile sizing ng centered date/time chooser. |
| `pages/modules/employees-profile/index.html` | OT asset version strings | Bump the `?v=` values kapag may bagong overtime popup or form layout change. |
| `pages/dashboard/index.html` | Employees Profile iframe URLs | Update the Employees Profile cache-bust kapag may bagong OT UI change para hindi ma-serve ang lumang version. |

## DTR Signatory Search — 2026-09-07

- `pages/modules/dtr/script.js`
  - `[SEARCH]` Global ang replacement-signatory lookup sa lahat ng privilege 5–10 employees; huwag ibalik ang department filter dahil puwedeng ibang department ang DTR approver.
- `pages/dashboard/index.html`
  - `EDIT GUIDE:` Sabay palitan ang dalawang DTR `?v=` values kapag nagbago ulit ang module para hindi lumang script ang ma-cache.

| File | Section | How to Edit Next Time |
|---|---|---|
| `pages/modules/dtr/script.js` | `searchSignatoryCandidates()` / `[SEARCH]` | Dito baguhin ang qualified-approver text search; panatilihing global ang candidate directory. |
| `pages/dashboard/index.html` | DTR iframe version strings | Parehong DTR `?v=` value ang i-bump pagkatapos ng DTR frontend change. |
## Holiday responsive Add/Edit form and sorting

| File | Section | How to Edit Next Time |
|---|---|---|
| `pages/modules/holiday/styles.css` | `[UI] RESPONSIVE ORDER` | Manatiling una ang Add/Edit form bago ang table sa 960px pababa. |
| `pages/modules/holiday/script.js` | `sortAroundToday()` | Upcoming dates first, then recent past newest-first; huwag ibalik ang `jumpToRow()` dahil inililipat nito ang user sa Page 4. |
| `pages/modules/holiday/index.html` | Holiday asset versions | Bump CSS/script versions kapag nagbago ang Holiday UI. |
| `pages/dashboard/index.html` | Holiday module URLs | Parehong sidebar at route-map cache-busters ang sabay palitan. |
