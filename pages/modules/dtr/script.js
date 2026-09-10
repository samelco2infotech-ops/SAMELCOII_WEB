/* GABAY: ito ang old-form DTR controller; dito naka-load ang employees at monthly computed rows. */
(function () {
// EDIT GUIDE: Use the served app base so DTR fetches work from the dashboard shell.
const DTR_PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
const APP_BASE = DTR_PAGE_ROOT;
const API_BASE = `${DTR_PAGE_ROOT}/api`;
window.SAMELCII_API_BASE = API_BASE;
window.SAMELCII_MEDIA_BASE = window.location.origin;
const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
const API = `${NODE_API_BASE}/dtr`;
const SIGNATORY_API = `${NODE_API_BASE}/signatory`;
const AUTH_API = `${NODE_API_BASE}/auth`;
    const STANDARD_START_MINUTES = 8 * 60;

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const els = {
        loggedUser: document.getElementById("logged-user"),
        dateFrom: document.getElementById("date-from"),
        dateTo: document.getElementById("date-to"),
        datePanel: null,
        dateToggle: null,
        departmentFilter: document.getElementById("department-filter"),
        employeeFilter: document.getElementById("employee-filter"),
        includeWeekends: document.getElementById("include-weekends"),
        loadBtn: document.getElementById("load-records"),
        updateDataBtn: document.getElementById("dtr-update-data"),
        pageBar: document.getElementById("dtr-page-bar"),
        pagePrev: document.getElementById("dtr-page-prev"),
        pageNext: document.getElementById("dtr-page-next"),
        pageInfo: document.getElementById("dtr-page-info"),
        clearBtn: null,
        printBtn: document.getElementById("print-report"),
        exportBtn: document.getElementById("export-report"),
        logoutBtn: document.getElementById("logout-btn"),
        message: document.getElementById("dtr-message"),
        messageStrip: document.getElementById("dtr-message-strip"),
        employeeSearch: document.getElementById("employee-search"),
        employeeList: document.getElementById("employee-list"),
        areaFilter: document.getElementById("area-filter"),
        selectFiltered: document.getElementById("select-filtered"),
        employeeCount: document.getElementById("employee-count"),
        selectedEmployeeCount: document.getElementById("selected-employee-count"),
        openEmployeePicker: document.getElementById("open-employee-picker"),
        employeePicker: document.getElementById("employee-picker-dialog"),
        closeEmployeePicker: document.getElementById("close-employee-picker"),
        cancelEmployeePicker: document.getElementById("cancel-employee-picker"),
        applyEmployeePicker: document.getElementById("apply-employee-picker"),
        pickerDepartment: document.getElementById("picker-department-filter"),
        pickerSearch: document.getElementById("picker-search"),
        pickerSelectVisible: document.getElementById("picker-select-visible"),
        pickerClear: document.getElementById("picker-clear"),
        pickerList: document.getElementById("picker-employee-list"),
        pickerResultsCount: document.getElementById("picker-results-count"),
        pickerSelectedCount: document.getElementById("picker-selected-count"),
        pickerSelectedCountInline: document.getElementById("picker-selected-count-inline"),
        signatoryPanel: document.getElementById("dtr-signatory-panel"),
        signatoryCopy: document.getElementById("dtr-signatory-copy"),
        signatoryAvatar: document.getElementById("dtr-signatory-avatar"),
        signatoryName: document.getElementById("dtr-signatory-name"),
        signatoryTitle: document.getElementById("dtr-signatory-title"),
        signatoryChange: document.getElementById("dtr-signatory-change"),
        signatoryRemove: document.getElementById("dtr-signatory-remove"),
        signatorySearchBox: document.getElementById("dtr-signatory-search"),
        signatorySearchInput: document.getElementById("dtr-signatory-search-input"),
        signatoryResults: document.getElementById("dtr-signatory-results"),
        pickerSignatorySummary: document.getElementById("dtr-picker-signatory-summary"),
        pickerBulkSignatory: document.getElementById("dtr-picker-bulk-signatory"),
        pickerBulkSignatoryCount: document.getElementById("picker-bulk-signatory-count"),
        bulkSignatoryLabel: document.getElementById("dtr-bulk-signatory-label"),
        bulkSignatoryInput: document.getElementById("dtr-bulk-signatory-input"),
        bulkSignatoryResults: document.getElementById("dtr-bulk-signatory-results"),
        bulkSignatoryReview: document.getElementById("dtr-bulk-signatory-review"),
        monthBadge: document.getElementById("dtr-month-badge"),
        areaBadge: document.getElementById("dtr-area-badge"),
        finalBadge: document.getElementById("dtr-final-badge"),
        finalizeBtn: document.getElementById("dtr-finalize-btn"),
        scheduleBtn: document.getElementById("dtr-schedule-btn"),
        scheduleDialog: document.getElementById("schedule-dialog"),
        closeScheduleDialog: document.getElementById("close-schedule-dialog"),
        scheduleUsercode: document.getElementById("schedule-usercode"),
        scheduleMessage: document.getElementById("schedule-message"),
        scheduleForm: document.getElementById("schedule-form"),
        scheduleAmStart: document.getElementById("schedule-am-start"),
        scheduleAmEnd: document.getElementById("schedule-am-end"),
        schedulePmStart: document.getElementById("schedule-pm-start"),
        schedulePmEnd: document.getElementById("schedule-pm-end"),
        scheduleEffectiveFrom: document.getElementById("schedule-effective-from"),
        scheduleHistory: document.getElementById("schedule-history"),
        monthSelect: document.getElementById("dtr-month-select"),
        yearSelect: document.getElementById("dtr-year-select"),
        body: document.getElementById("dtr-table-body"),
        totalUndertime: document.getElementById("dtr-total-undertime")
    };

    let bulkSignatoryCandidate = null;

    const state = {
        sessionUser: null,
        departments: [],
        employees: [],
        directoryEmployees: [],
        signatoryDirectory: [],
        selectedUsercodes: new Set(),
        pickerSelectedUsercodes: new Set(),
        rowCache: new Map(),
        rawRows: [],
        rows: [],
        // ponytail: separate from state.rawRows on purpose — rawRows now only holds the current
        // on-screen PAGE's rows, but print/PDF export (printPreviewPages) needs every selected
        // employee's rows regardless of page. Set once by printWithAudit via
        // ensureFullRosterRows(), read by printPreviewPages.
        printRawRows: [],
        printSnapshot: null,
        currentDepartment: "",
        customSelection: false,
        currentAreas: [],
        currentSearch: "",
        signatories: [],
        employeeSignatories: new Map(),
        loadGeneration: 0,
        // ponytail: "All departments" was rendering every selected employee's rows in one table
        // paint — with 300+ employees × ~30 days that's thousands of <tr>s rebuilt from scratch on
        // every progress tick. Paginating by employee keeps each on-screen render small; Print and
        // Export still pull the FULL selected roster (see ensureFullRosterRows) so output is
        // unaffected by which page happens to be showing.
        pageSize: 25,
        currentPage: 0
    };

    // GABAY: session at maliit na helpers ito; huwag galawin ang API field names.
    function getSession() {
        try {
            const raw = localStorage.getItem("samelcii_session");
            return raw ? JSON.parse(raw) : null;
        } catch (_error) {
            return null;
        }
    }

    function normalizeText(value) {
        return String(value ?? "").trim().toLowerCase();
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function pad(value) {
        return String(value).padStart(2, "0");
    }

    function today() {
        const now = new Date();
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    function monthStart() {
        const now = new Date();
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    }

    function parseTimeMinutes(value) {
        if (!value) {
            return null;
        }
        const parts = String(value).trim().split(":").map((segment) => Number(segment));
        if (parts.length < 2 || parts.some((segment) => Number.isNaN(segment))) {
            return null;
        }
        const [hours, minutes] = parts;
        return hours * 60 + minutes;
    }

    function minutesBetween(start, end) {
        const from = parseTimeMinutes(start);
        const to = parseTimeMinutes(end);
        if (from === null || to === null || to < from) {
            return 0;
        }
        return to - from;
    }

    function formatNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? String(num) : "0";
    }

    function formatMaybe(value) {
        const text = String(value ?? "").trim();
        return text === "" ? "--" : escapeHtml(text);
    }

    function formatDateLabel(dateString) {
        if (!dateString) {
            return "--";
        }
        const date = new Date(`${dateString}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(dateString);
        }
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric"
        });
    }

    function setMessage(text, type = "") {
        if (!els.message) {
            return;
        }
        els.message.textContent = text;
        els.message.className = `message dtr-message ${type}`.trim();
        if (els.messageStrip) {
            const trimmedType = String(type || "").trim();
            if (!String(text || "").trim()) {
                els.messageStrip.dataset.state = "idle";
            } else if (trimmedType === "error") {
                els.messageStrip.dataset.state = "error";
            } else if (trimmedType === "success") {
                els.messageStrip.dataset.state = "success";
            } else {
                els.messageStrip.dataset.state = "info";
            }
        }
    }

    // ponytail: counter, not a boolean — loadDirectory() and loadRows() can be in flight at the
    // same time (loadDirectory calls loadRows internally, and other handlers can trigger loadRows
    // on its own mid-way through). A boolean would let whichever call finishes FIRST hide the
    // splash while the other is still loading, showing a half-loaded roster as if it were done.
    let activeLoadCount = 0;
    function beginLoading() {
        activeLoadCount += 1;
        const overlay = document.getElementById("dtr-loading-overlay");
        if (overlay) overlay.hidden = false;
    }
    function endLoading() {
        activeLoadCount = Math.max(0, activeLoadCount - 1);
        if (activeLoadCount === 0) {
            const overlay = document.getElementById("dtr-loading-overlay");
            if (overlay) overlay.hidden = true;
        }
    }

    function syncLoggedUser(session) {
        const label = session?.user?.username || session?.user?.name || session?.name || "Guest";
        if (els.loggedUser) {
            els.loggedUser.textContent = label;
        }
    }

    function request(action, params = {}, endpoint = API) {
        const url = new URL(endpoint, window.location.href);
        url.searchParams.set("action", action);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value).trim() !== "") {
                url.searchParams.set(key, String(value));
            }
        });

        const token = localStorage.getItem("samelcii_token");
        const headers = token && token.split(".").length === 3 ? { Authorization: `Bearer ${token}` } : {};
        return fetch(url.toString(), { credentials: "same-origin", headers })
            .then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload.ok === false) {
                    throw new Error(payload.message || `Request failed (${response.status})`);
                }
                return payload;
            });
    }

    function syncDatePanel() {
        if (!els.datePanel || !els.dateToggle) {
            return;
        }
        els.datePanel.hidden = !els.dateToggle.checked;
    }

    function populateMonthYearControls() {
        if (!els.monthSelect || !els.yearSelect) {
            return;
        }

        const current = new Date();
        els.monthSelect.innerHTML = "";
        MONTH_NAMES.forEach((month, index) => {
            const option = document.createElement("option");
            option.value = String(index + 1);
            option.textContent = month;
            els.monthSelect.appendChild(option);
        });

        els.yearSelect.innerHTML = "";
        for (let year = current.getFullYear() - 2; year <= current.getFullYear() + 2; year += 1) {
            const option = document.createElement("option");
            option.value = String(year);
            option.textContent = String(year);
            els.yearSelect.appendChild(option);
        }

        els.monthSelect.value = String(current.getMonth() + 1);
        els.yearSelect.value = String(current.getFullYear());
    }

    function syncMonthYearFromDates() {
        if (!els.dateFrom || !els.monthSelect || !els.yearSelect) {
            return;
        }
        const date = new Date(`${els.dateFrom.value || today()}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
            return;
        }
        els.monthSelect.value = String(date.getMonth() + 1);
        els.yearSelect.value = String(date.getFullYear());
    }

    function applyMonthYearToDates() {
        if (!els.dateFrom || !els.dateTo || !els.monthSelect || !els.yearSelect) {
            return;
        }

        const monthIndex = Math.max(1, Math.min(12, Number(els.monthSelect.value || "1"))) - 1;
        const year = Number(els.yearSelect.value || String(new Date().getFullYear()));
        const start = new Date(year, monthIndex, 1);
        const end = new Date(year, monthIndex + 1, 0);

        els.dateFrom.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
        els.dateTo.value = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    }

    function guessDefaultDepartment(departments) {
        const names = departments.map((item) => String(item?.name || "").trim()).filter(Boolean);
        const preferred = names.find((name) => /maintenance/i.test(name)) || names[0] || "Maintenance";
        return preferred;
    }

    function normalizeEmployee(item) {
        return {
            usercode: String(item?.usercode || item?.bioUID || "").trim(),
            name: String(item?.name || item?.username || item?.usercode || "").trim(),
            position: String(item?.position || "").trim(),
            department: String(item?.department || "").trim(),
            area: String(item?.area || "").trim(),
            profile_photo_url: String(item?.profile_photo_url || "").trim(),
            privilage: String(item?.privilage || "").trim(),
            privilagemenu: String(item?.privilagemenu || "").trim()
        };
    }

    // Signatories should be supervisory/managerial staff — privilege token 5-10, same convention
    // used elsewhere in this app for "can approve/manage" roles.
    function hasSignatoryPrivilege(employee) {
        const tokens = `${employee.privilage || ""}-${employee.privilagemenu || ""}`.split(/[^0-9]+/).filter(Boolean);
        return tokens.some((token) => Number(token) >= 5 && Number(token) <= 10);
    }

    function setDepartmentOptions(departments) {
        if (!els.departmentFilter) {
            return;
        }

        const current = String(els.departmentFilter.value || "").trim();
        const options = departments
            .map((item) => String(item?.name || item?.abbreviation || "").trim())
            .filter(Boolean);

        const map = new Set(options.map((value) => value.toLowerCase()));
        const keepCurrent = current && map.has(current.toLowerCase());

        els.departmentFilter.innerHTML = "";
        const all = document.createElement("option");
        all.value = "__ALL__";
        all.textContent = "All departments";
        els.departmentFilter.appendChild(all);

        if (!options.length) {
            els.departmentFilter.value = "__ALL__";
            return;
        }

        options.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            els.departmentFilter.appendChild(option);
        });

        els.departmentFilter.value = current === "__ALL__" || !current
            ? "__ALL__"
            : (keepCurrent ? current : "__ALL__");
    }

    function setPickerDepartmentOptions() {
        if (!els.pickerDepartment) {
            return;
        }
        // ponytail: no "All departments" option here by request — this picker must always be
        // scoped to one department, unlike the main sidebar filter which keeps it.
        const current = String(els.pickerDepartment.value || "");
        const names = state.departments
            .map((item) => String(item?.name || item?.abbreviation || "").trim())
            .filter(Boolean);
        els.pickerDepartment.replaceChildren();
        names.forEach((name) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            els.pickerDepartment.appendChild(option);
        });
        els.pickerDepartment.value = names.includes(current) ? current : (names[0] || "");
    }

    async function ensureEmployeeDirectory() {
        if (state.directoryEmployees.length) {
            return;
        }
        const payload = await request("roster", { department: "__ALL__" });
        state.directoryEmployees = (Array.isArray(payload.items) ? payload.items : []).map(normalizeEmployee);
    }

    // ponytail: separate from ensureEmployeeDirectory() on purpose — that one backs "who to print
    // a DTR for" and is correctly restricted to bioUID-enrolled (time-clock) employees. An approver
    // doesn't punch a time clock themselves (e.g. a GM/executive usually has bioUID=0), so the
    // "search for an approver" boxes need this unrestricted list instead, or executives are
    // permanently unsearchable there.
    async function ensureSignatoryDirectory() {
        if (state.signatoryDirectory.length) {
            return;
        }
        const payload = await request("signatory_candidates", {});
        state.signatoryDirectory = (Array.isArray(payload.items) ? payload.items : []).map(normalizeEmployee);
    }

    function syncBadges() {
        if (els.monthBadge && els.dateFrom) {
            const date = new Date(`${els.dateFrom.value || today()}T00:00:00`);
            const label = Number.isNaN(date.getTime())
                ? "DTR"
                : `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
            els.monthBadge.textContent = label;
        }

        if (els.areaBadge) {
            if (state.customSelection) {
                els.areaBadge.textContent = `${state.selectedUsercodes.size} selected`;
            } else {
                const department = String(els.departmentFilter?.value || "").trim();
                els.areaBadge.textContent = department === "__ALL__" ? "All departments" : (department || "—");
            }
        }
    }

    // Additive, read-only status badge: shows how many days of the loaded month are frozen into
    // dtr_final for the currently-active (first selected) employee. Does not affect the live grid,
    // which keeps rendering from monthly_computed exactly as before.
    async function updateFinalizedBadge(roster, generation) {
        // ponytail: the finalized-COUNT BADGE was removed from the toolbar by request (too
        // cluttered) and stays hidden unconditionally below. The "Finalize this month" BUTTON is
        // kept working though: a month can already be 100% frozen by punch-field count yet still
        // print wrong (e.g. a holiday added to philippine_holidays *after* that month was frozen —
        // dtr_final's upgrade check doesn't revisit a day just because a punch count didn't
        // change). This button is the app-side way an admin forces that recompute, instead of
        // deleting rows out of dtr_final by hand.
        if (els.finalBadge) {
            els.finalBadge.hidden = true;
        }
        if (!els.finalizeBtn) {
            return;
        }
        if (!roster.length) {
            els.finalizeBtn.hidden = true;
            return;
        }
        try {
            const usercode = roster[0].usercode;
            const payload = await request("monthly_final", {
                date_from: els.dateFrom?.value || monthStart(),
                date_to: els.dateTo?.value || today(),
                usercode
            });
            if (generation !== state.loadGeneration) {
                return;
            }
            const items = Array.isArray(payload.items) ? payload.items : [];
            // ponytail: no longer gated on "any unfinalized day" — see comment above, a fully
            // frozen range can still be stale. Only real guard left is a genuinely past range,
            // since finalizeRange refuses today/future dates anyway.
            const dateTo = els.dateTo?.value || today();
            els.finalizeBtn.hidden = !(items.length > 0 && dateTo < today());
        } catch (_error) {
            if (generation === state.loadGeneration) {
                els.finalizeBtn.hidden = true;
            }
        }
    }

    function cacheKey(usercode) {
        return [
            usercode,
            els.dateFrom?.value || "",
            els.dateTo?.value || "",
            els.includeWeekends?.checked ? "1" : "0"
        ].join("|");
    }

    // ponytail: "All departments" fires one monthly_final request PER employee (300+), which is
    // what actually makes that load slow — not the roster fetch. Persisting each employee's rows in
    // localStorage means that cost is only paid once per month/date-range; every load after that
    // (including across page reloads) reads the cache instantly. "Update data" is the only thing
    // that pays the cost again, on purpose.
    const DTR_CACHE_PREFIX = "samelcii_dtr_rows:";
    function readPersistedRows(key) {
        try {
            const raw = localStorage.getItem(DTR_CACHE_PREFIX + key);
            return raw ? JSON.parse(raw) : null;
        } catch (_error) {
            return null;
        }
    }
    function writePersistedRows(key, items) {
        try {
            localStorage.setItem(DTR_CACHE_PREFIX + key, JSON.stringify(items));
        } catch (_error) {
            // ponytail: quota exceeded or storage disabled — in-memory cache (state.rowCache) still
            // works for this session, we just lose the across-reload benefit. Not worth surfacing.
        }
    }
    function clearPersistedRows() {
        Object.keys(localStorage)
            .filter((key) => key.startsWith(DTR_CACHE_PREFIX))
            .forEach((key) => localStorage.removeItem(key));
    }

    async function loadDirectory(options) {
        beginLoading();
        try {
            return await loadDirectoryInner(options);
        } finally {
            endLoading();
        }
    }

    async function loadDirectoryInner({ preserveSelection = false, force = false } = {}) {
        if (!preserveSelection) {
            state.currentPage = 0;
        }
        const department = String(els.departmentFilter?.value || "").trim() || "__ALL__";
        const q = String(els.employeeFilter?.value || "").trim();

        setMessage("Loading employees...", "");

        try {
            const deptPayload = await request("departments", {});
            state.departments = Array.isArray(deptPayload.items) ? deptPayload.items : state.departments;
            setDepartmentOptions(state.departments);
            setPickerDepartmentOptions();

            await refreshPrintSignatories();

            const rosterPayload = await request("roster", { department });
            const rosterEmployees = (Array.isArray(rosterPayload.items) ? rosterPayload.items : []).map(normalizeEmployee);
            if (department === "__ALL__") {
                state.directoryEmployees = rosterEmployees;
            } else {
                await ensureEmployeeDirectory();
            }
            state.currentDepartment = department === "__ALL__" ? "All departments" : department;
            state.currentSearch = q;
            state.customSelection = false;

            if (q.length >= 2) {
                const needle = normalizeText(q);
                const matched = rosterEmployees.filter((employee) => normalizeText(employee.usercode).includes(needle));
                if (matched.length > 0) {
                    state.employees = matched;
                } else {
                    try {
                        const searchPayload = await request("search_employee", { q }, AUTH_API);
                        state.employees = Array.isArray(searchPayload.items)
                            ? searchPayload.items.map(normalizeEmployee)
                            : [];
                    } catch (_searchError) {
                        state.employees = [];
                    }
                }
            } else {
                state.employees = rosterEmployees;
            }

            if (!preserveSelection) {
                state.selectedUsercodes = new Set(
                    state.employees
                        .map((employee) => employee.usercode)
                        .filter(Boolean)
                );
            } else {
                const visibleCodes = new Set(state.employees.map((employee) => employee.usercode));
                state.selectedUsercodes = new Set(
                    Array.from(state.selectedUsercodes).filter((code) => visibleCodes.has(code))
                );
            }

            renderEmployeeRoster();
            syncSelectionSummary();
            syncBadges();
            await loadRows({ force });

            if (state.rows.length > 0) {
                const hint = `Loaded ${state.employees.length} employee(s) from ${department}.`;
                setMessage(hint, "success");
            }
        } catch (error) {
            state.employees = [];
            state.selectedUsercodes = new Set();
            renderEmployeeRoster();
            syncSelectionSummary();
            renderRows([]);
            setMessage(error.message, "error");
        }
    }

    // ponytail: department load auto-checks every employee (see sidebar copy), but the header
    // search/area filter only ever narrowed the DISPLAYED cards — hidden-but-still-checked
    // employees silently stayed selected and printed, so "search arl, see 2" could still print
    // all 25. Reconciling selection to what's visible keeps the badge/print count honest with what
    // the user can actually see and uncheck. Only removes hidden selections; clearing the filter
    // does not restore anything auto-deselected this way (re-Load to reset to "all checked").
    function reconcileSelectionToVisible() {
        const visible = new Set(filteredRosterEmployees().map((employee) => employee.usercode));
        state.selectedUsercodes = new Set(
            Array.from(state.selectedUsercodes).filter((code) => visible.has(code))
        );
        syncSelectionSummary();
        syncBadges();
    }

    function syncSelectionSummary() {
        if (els.selectedEmployeeCount) {
            els.selectedEmployeeCount.textContent = String(state.selectedUsercodes.size);
        }
    }

    function filteredRosterEmployees() {
        const search = normalizeText(els.employeeSearch?.value || "");
        const area = normalizeText(els.areaFilter?.value || "");
        return state.employees.filter((employee) => {
            // ponytail: no privilege restriction here by request — matches the original desktop
            // SAMELCOII_ITS_DTR_FORM.cs GetEmployeesByDepartment(), which shows everyone in the
            // department/area with no privilege filter. (hasSignatoryPrivilege still gates who can
            // be picked AS a signatory elsewhere — unrelated to who's visible in this roster.)
            if (area && normalizeText(employee.area) !== area) {
                return false;
            }
            if (!search) {
                return true;
            }
            return [
                employee.name,
                employee.usercode,
                employee.department,
                employee.position,
                employee.area
            ].some((value) => normalizeText(value).includes(search));
        });
    }

    function syncAreaFilterOptions() {
        if (!els.areaFilter) {
            return;
        }
        const current = els.areaFilter.value;
        const areas = [...new Set(state.employees.map((employee) => String(employee.area || "").trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        els.areaFilter.innerHTML = `<option value="">All areas</option>${areas.map((area) =>
            `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join("")}`;
        if (areas.includes(current)) {
            els.areaFilter.value = current;
        }
    }

    function renderEmployeeRoster() {
        if (!els.employeeList) {
            return;
        }
        syncAreaFilterOptions();
        const items = filteredRosterEmployees();
        if (els.employeeCount) {
            els.employeeCount.textContent = String(items.length);
            els.employeeCount.title = `${items.length} of ${state.employees.length} employees shown`;
        }
        if (!items.length) {
            els.employeeList.innerHTML = '<div class="dtr-empty-list">No employees match this roster search.</div>';
            return;
        }

        // ponytail: only show/fetch per-card DTR signatory info once a search has narrowed the
        // roster down — fetching it for all 324 unfiltered employees would be one signatory
        // lookup per distinct department on every render, wasted on a list nobody's reading yet.
        const searchActive = normalizeText(els.employeeSearch?.value || "").length > 0;
        const showSignatory = searchActive && items.length <= 40;

        els.employeeList.innerHTML = items.map((employee) => {
            const checked = state.selectedUsercodes.has(employee.usercode);
            const details = [employee.usercode, employee.department].filter(Boolean).join(" - ");
            return `
                <label class="dtr-employee-item${checked ? " active" : ""}">
                    <span class="dtr-employee-check">
                        <input type="checkbox" data-roster-usercode="${escapeHtml(employee.usercode)}" ${checked ? "checked" : ""} />
                        <span>Include</span>
                    </span>
                    <strong>${escapeHtml(employee.name || employee.usercode)}</strong>
                    <span>${escapeHtml(details || "Employee")}</span>
                    <small>${escapeHtml(employee.position || "No position")}</small>
                    <em>${escapeHtml(employee.area || "Main")}</em>
                    ${showSignatory ? `<div class="dtr-roster-signatory" data-roster-signatory-usercode="${escapeHtml(employee.usercode || "")}">Loading signatory…</div>` : ""}
                </label>
            `;
        }).join("");

        if (showSignatory) {
            loadRosterSignatories(items);
        }
    }

    // ── Per-EMPLOYEE DTR signatory (roster search) ──────────────────────────
    // dtr_employee_signatory table (backend/src/services/dtrService.js) — one signatory per
    // employee, not a shared department/area group. Replaces the old group-based lookup, which
    // kept resolving to the wrong person whenever an employee's literal department AND their
    // area-based print grouping both had someone assigned.
    const rosterSignatoryCache = new Map();
    async function loadRosterSignatories(items) {
        await Promise.all(items.map(async (employee) => {
            const usercode = String(employee.usercode || "").trim();
            if (!usercode) return;
            if (!rosterSignatoryCache.has(usercode)) {
                rosterSignatoryCache.set(usercode, request("employee_signatory_get", { usercode }, API)
                    .then((payload) => (payload.signatory?.active ? payload.signatory : null))
                    .catch(() => null));
            }
            const signatory = await rosterSignatoryCache.get(usercode);
            els.employeeList.querySelectorAll(`[data-roster-signatory-usercode="${cssEscape(usercode)}"]`).forEach((node) => {
                renderRosterSignatoryRow(node, usercode, signatory);
            });
        }));
    }

    function cssEscape(value) {
        return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
    }

    function renderRosterSignatoryRow(node, usercode, signatory) {
        const canManage = canManageSignatories();
        node.innerHTML = `
            <span class="dtr-roster-signatory-avatar">${escapeHtml(initials(signatory?.approver_name))}</span>
            <span class="dtr-roster-signatory-copy">${signatory
                ? `<b>${escapeHtml(signatory.approver_name)}</b> <small>${escapeHtml(signatory.approver_title || "Signatory")}</small>`
                : `<b>No DTR signatory</b>`}</span>
            ${canManage ? `
                <button type="button" class="dtr-roster-signatory-change" data-roster-signatory-change="${escapeHtml(usercode)}">${signatory ? "Change" : "Assign"}</button>
                ${signatory ? `<button type="button" class="dtr-roster-signatory-change" data-roster-signatory-remove="${escapeHtml(usercode)}">Remove</button>` : ""}
            ` : ""}
        `;
    }

    function openRosterSignatoryEditor(node, usercode) {
        node.innerHTML = `
            <input type="search" class="dtr-roster-signatory-input" placeholder="Search employees…" />
            <div class="dtr-signatory-results"></div>
        `;
        const input = node.querySelector(".dtr-roster-signatory-input");
        const results = node.querySelector(".dtr-signatory-results");
        node.addEventListener("click", (event) => event.stopPropagation());
        input.focus();
        let timer = null;
        input.addEventListener("input", () => {
            clearTimeout(timer);
            const q = input.value;
            timer = setTimeout(async () => {
                if (!q || q.trim().length < 2) {
                    results.innerHTML = "";
                    return;
                }
                results.innerHTML = `<p style="padding:6px 10px;color:var(--hy-ink-soft,#6b7280);font-size:12px;">Searching...</p>`;
                try {
                    await ensureSignatoryDirectory();
                    const needle = normalizeText(q);
                    const employees = state.signatoryDirectory.filter((employee) =>
                        hasSignatoryPrivilege(employee) && employee.usercode !== usercode
                        && [employee.name, employee.usercode, employee.department, employee.position]
                            .some((value) => normalizeText(value).includes(needle)));
                    results.innerHTML = employees.length
                        ? employees.slice(0, 20).map((employee) => `
                            <button type="button" class="dtr-signatory-result" data-roster-signatory-pick="${escapeHtml(employee.usercode)}">
                                <span class="dtr-signatory-avatar">${employee.profile_photo_url
                                    ? `<img src="${escapeHtml(employee.profile_photo_url)}" alt="" loading="lazy" />`
                                    : escapeHtml(initials(employee.name))}</span>
                                <span>${escapeHtml(employee.name)} <small style="color:var(--hy-ink-soft,#6b7280);">${escapeHtml(employee.position || "")}</small></span>
                            </button>
                        `).join("")
                        : `<p style="padding:6px 10px;color:var(--hy-ink-soft,#6b7280);font-size:12px;">No employees found.</p>`;
                } catch (error) {
                    results.innerHTML = `<p style="padding:6px 10px;color:var(--dtr-danger,#b91c1c);font-size:12px;">${escapeHtml(error.message)}</p>`;
                }
            }, 300);
        });
        results.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const button = event.target.closest("[data-roster-signatory-pick]");
            if (!button) return;
            const approverUsercode = button.getAttribute("data-roster-signatory-pick");
            try {
                await postJson("employee_signatory_set", { usercode, approver_usercode: approverUsercode }, API);
                rosterSignatoryCache.delete(usercode);
                const fresh = await request("employee_signatory_get", { usercode }, API)
                    .then((p) => (p.signatory?.active ? p.signatory : null));
                rosterSignatoryCache.set(usercode, Promise.resolve(fresh));
                els.employeeList.querySelectorAll(`[data-roster-signatory-usercode="${cssEscape(usercode)}"]`).forEach((n) => {
                    renderRosterSignatoryRow(n, usercode, fresh);
                });
                await refreshPrintSignatories();
            } catch (error) {
                setMessage(error.message, "error");
            }
        });
    }

    async function removeRosterSignatory(usercode) {
        try {
            await postJson("employee_signatory_remove", { usercode }, API);
            rosterSignatoryCache.set(usercode, Promise.resolve(null));
            els.employeeList.querySelectorAll(`[data-roster-signatory-usercode="${cssEscape(usercode)}"]`).forEach((node) => {
                renderRosterSignatoryRow(node, usercode, null);
            });
            await refreshPrintSignatories();
        } catch (error) {
            setMessage(error.message, "error");
        }
    }

    // ── Department "pseudo-values" (mirrors classifyDepartmentFilter/employeesByDepartment in
    // backend/src/services/dtrService.js, ported from SAMELCOII_ITS_DTR_FORM.cs
    // GetEmployeesByDepartment()) — "Catbalogan"/"Basey"/"Villareal" mean "match by AREA, excluding
    // shift-worker positions that already have their own dedicated entry", not a literal department
    // field. The picker used to compare employee.department === "Catbalogan" directly, which can
    // never match (no one's actual department field IS "Catbalogan") — hence 0 results.
    function normalizeCompact(value) {
        return String(value || "").toUpperCase().replace(/\s+/g, "");
    }

    function isSubstationTenderPosition(position) {
        const compact = normalizeCompact(position);
        return compact === "SUBSTATIONTENDER" || compact === "SSTENDER"
            || (compact.includes("SUBST") && compact.includes("TENDER"));
    }

    function isMrCollectorPosition(position) {
        const compact = normalizeCompact(position);
        return compact === "MR/COLLECTOR" || compact === "MRCOLLECTOR";
    }

    function isSpecialExcludedPosition(position) {
        return normalizeText(position) === "security guard"
            || isSubstationTenderPosition(position)
            || isMrCollectorPosition(position)
            || normalizeCompact(position) === "DISCONNECTOR";
    }

    function pickerEmployeeMatches(employee, department, search) {
        const dep = String(department || "").trim();
        const upper = dep.toUpperCase();
        let matchesDepartment;
        if (!dep || upper === "ALL" || upper === "__ALL__") {
            matchesDepartment = true;
        } else if (upper === "SECURITY GUARD") {
            matchesDepartment = normalizeText(employee.position) === "security guard";
        } else if (upper === "SUBSTATION TENDER") {
            matchesDepartment = isSubstationTenderPosition(employee.position);
        } else if (upper === "MR/COLLECTOR" || upper === "MR COLLECTOR") {
            matchesDepartment = isMrCollectorPosition(employee.position);
        } else if (upper === "DISCONNECTOR") {
            matchesDepartment = normalizeCompact(employee.position) === "DISCONNECTOR";
        } else if (/ TSD$/i.test(dep)) {
            const area = dep.slice(0, -4).trim();
            const empDept = String(employee.department || "").toUpperCase();
            matchesDepartment = normalizeText(employee.area) === normalizeText(area)
                && (empDept === "TSD" || empDept.includes("TECHNICAL SERVICES DEPARTMENT"));
        } else if (["BASEY", "VILLAREAL", "CATBALOGAN"].includes(upper)) {
            const empDept = String(employee.department || "").toUpperCase();
            matchesDepartment = normalizeText(employee.area) === normalizeText(dep)
                && empDept !== "TSD" && !empDept.includes("TECHNICAL SERVICES DEPARTMENT")
                && !isSpecialExcludedPosition(employee.position);
        } else {
            matchesDepartment = normalizeText(employee.department) === normalizeText(dep)
                && normalizeText(employee.area || "MAIN") === "main"
                && !isSpecialExcludedPosition(employee.position);
        }
        if (!matchesDepartment) {
            return false;
        }
        if (!search) {
            return true;
        }
        const haystack = [
            employee.name,
            employee.usercode,
            employee.department,
            employee.position,
            employee.area
        ].join(" ").toLowerCase();
        return haystack.includes(search);
    }

    console.assert(
        pickerEmployeeMatches({ name: "Ana Cruz", department: "HR", area: "MAIN" }, "HR", "ana"),
        "DTR employee picker filter failed"
    );
    console.assert(
        pickerEmployeeMatches({ name: "Danilo Espelita", department: "OFFICE OF THE GENERAL MANAGER", position: "Driver", area: "Catbalogan" }, "Catbalogan", ""),
        "DTR employee picker area-pseudo-department filter failed"
    );
    console.assert(
        !pickerEmployeeMatches({ name: "Someone", department: "ENGINEERING SERVICES DEPARTMENT", position: "Substation Tender", area: "Catbalogan" }, "Catbalogan", ""),
        "DTR employee picker area filter should exclude Substation Tender (has its own entry)"
    );

    function pickerFilteredEmployees() {
        const department = String(els.pickerDepartment?.value || "__ALL__").trim() || "__ALL__";
        const search = normalizeText(els.pickerSearch?.value || "");
        return state.directoryEmployees.filter((employee) => pickerEmployeeMatches(employee, department, search));
    }

    function syncPickerSelectedCount() {
        if (els.pickerSelectedCount) {
            els.pickerSelectedCount.textContent = String(state.pickerSelectedUsercodes.size);
        }
        if (els.pickerSelectedCountInline) {
            els.pickerSelectedCountInline.textContent = String(state.pickerSelectedUsercodes.size);
        }
        const count = state.pickerSelectedUsercodes.size;
        if (els.pickerBulkSignatoryCount) {
            els.pickerBulkSignatoryCount.textContent = String(count);
        }
        if (els.pickerBulkSignatory) {
            els.pickerBulkSignatory.hidden = !(canManageSignatories() && count > 0);
        }
    }

    function renderEmployeePicker() {
        if (!els.pickerList) {
            return;
        }
        const items = pickerFilteredEmployees();
        const department = String(els.pickerDepartment?.value || "__ALL__");
        if (els.pickerResultsCount) {
            els.pickerResultsCount.textContent = `${items.length} employee${items.length === 1 ? "" : "s"} found`;
        }
        if (els.pickerSelectVisible) {
            els.pickerSelectVisible.textContent = department === "__ALL__" ? "Select shown" : "Select department";
        }
        syncPickerSelectedCount();

        if (!items.length) {
            els.pickerList.innerHTML = '<div class="dtr-picker-empty">No employees match this department and search.</div>';
            return;
        }

        els.pickerList.innerHTML = items.map((employee, index) => {
            const checked = state.pickerSelectedUsercodes.has(employee.usercode) ? "checked" : "";
            const details = [employee.usercode, employee.position, employee.area].filter(Boolean).join(" · ");
            const inputId = `dtr-picker-employee-${index}`;
            return `
                <div class="dtr-picker-employee" data-picker-employee-row="${escapeHtml(employee.usercode)}">
                    <input id="${inputId}" type="checkbox" data-picker-usercode="${escapeHtml(employee.usercode)}" ${checked} />
                    <label class="dtr-picker-employee-copy" for="${inputId}">
                        <strong>${escapeHtml(employee.name || employee.usercode)}</strong>
                        <small>${escapeHtml(details || "Employee")}</small>
                    </label>
                    <span class="dtr-picker-employee-dept">${escapeHtml(employee.department || "No department")}</span>
                    <div class="dtr-picker-employee-signatory" data-picker-employee-signatory="${escapeHtml(employee.usercode)}">
                        <span>Loading signatory…</span>
                    </div>
                </div>
            `;
        }).join("");
        renderPickerEmployeeSignatories(items);
    }

    async function openEmployeePicker() {
        if (!els.employeePicker || els.employeePicker.open) {
            return;
        }
        if (els.openEmployeePicker) {
            els.openEmployeePicker.disabled = true;
            els.openEmployeePicker.setAttribute("aria-busy", "true");
        }
        try {
            await Promise.all([ensureEmployeeDirectory(), refreshPrintSignatories(), ensureSignatoryDirectory()]);
            // ponytail: setPickerDepartmentOptions() already picks a sensible default (current
            // value if still valid, else the first real department) — no "__ALL__" to fall back
            // to anymore now that option is gone, so don't stomp its choice here.
            setPickerDepartmentOptions();
            state.pickerSelectedUsercodes = new Set(state.selectedUsercodes);
            resetBulkSignatoryEditor();
            if (els.pickerSearch) {
                els.pickerSearch.value = "";
            }
            renderEmployeePicker();
            els.employeePicker.showModal();
            renderPickerSelectionSignatories();
            els.pickerSearch?.focus();
        } catch (error) {
            setMessage(error.message || "Unable to load the employee directory.", "error");
        } finally {
            if (els.openEmployeePicker) {
                els.openEmployeePicker.disabled = false;
                els.openEmployeePicker.removeAttribute("aria-busy");
            }
        }
    }

    function closeEmployeePicker() {
        if (els.employeePicker?.open) {
            els.employeePicker.close();
        }
    }

    // ── Department DTR signatory ────────────────────────────────────────────
    // Persisted via the existing signatoryService (signatory_groups, module='dtr'), auto-seeded
    // once per department from departmenttb.HeadsorOic — see backend/src/services/signatoryService.js.
    function canManageSignatories() {
        // ponytail: widened from "token 10 only" to privilege 6-10 by request — was locking out
        // everyone except the 4 literal privilege-10 IT accounts.
        const tokens = `${state.sessionUser?.privilage || ""}-${state.sessionUser?.privilagemenu || ""}`.split(/[^0-9]+/).filter(Boolean);
        return tokens.some((token) => Number(token) >= 6 && Number(token) <= 10);
    }

    function initials(name) {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
    }

    function renderSignatoryAvatar(target, signatory) {
        if (!target) {
            return;
        }
        if (signatory?.profilePhotoUrl) {
            target.innerHTML = `<img src="${escapeHtml(signatory.profilePhotoUrl)}" alt="" loading="lazy" />`;
        } else {
            target.textContent = initials(signatory?.name);
        }
    }

    async function resolvePickerEmployeeSignatory(employee) {
        const usercode = String(employee?.usercode || "").trim().toUpperCase();
        const individual = state.employeeSignatories.get(usercode);
        if (individual) {
            return {
                name: String(individual.approver_name || "").trim(),
                title: String(individual.approver_title || "Department Head").trim(),
                usercode: String(individual.approver_usercode || "").trim().toUpperCase(),
                source: "direct"
            };
        }
        const fallback = isShiftEmployee(employee) ? await areaApprover(employee) : employeeApprover(employee);
        return {
            name: String(fallback?.name || "").trim(),
            title: String(fallback?.title || "Department Head").trim(),
            usercode: String(fallback?.usercode || "").trim().toUpperCase(),
            source: fallback?.name ? "default" : "none"
        };
    }

    function paintPickerEmployeeSignatory(node, employee, signatory) {
        if (!node) return;
        const name = signatory.name || "No assigned signatory";
        const source = signatory.source === "direct"
            ? "Direct assignment"
            : signatory.source === "default" ? "Department/area default" : "No default configured";
        node.innerHTML = `
            <span class="dtr-picker-signatory-copy">
                <small>Signatory</small>
                <strong>${escapeHtml(name)}</strong>
                <em>${escapeHtml(source)}</em>
            </span>
        `;
    }

    let pickerEmployeeSignatoryGeneration = 0;

    async function renderPickerEmployeeSignatories(employees) {
        const generation = ++pickerEmployeeSignatoryGeneration;
        const resolved = await Promise.all(employees.map(resolvePickerEmployeeSignatory));
        if (generation !== pickerEmployeeSignatoryGeneration) return;
        employees.forEach((employee, index) => {
            const node = els.pickerList?.querySelector(`[data-picker-employee-signatory="${cssEscape(employee.usercode)}"]`);
            paintPickerEmployeeSignatory(node, employee, resolved[index]);
        });
    }

    function pickerSignatoryCandidates(query) {
        const needle = normalizeText(query);
        return state.signatoryDirectory.filter((employee) =>
            hasSignatoryPrivilege(employee)
            && [employee.name, employee.usercode, employee.department, employee.position]
                .some((value) => normalizeText(value).includes(needle)));
    }

    async function refreshPickerAfterSignatoryChange(message) {
        rosterSignatoryCache.clear();
        await refreshPrintSignatories();
        const scrollTop = els.pickerList?.scrollTop || 0;
        renderEmployeePicker();
        if (els.pickerList) els.pickerList.scrollTop = scrollTop;
        await renderPickerSelectionSignatories();
        setMessage(message, "success");
    }

    function groupPickerSignatories(employees, approvers) {
        const groups = new Map();
        employees.forEach((employee, index) => {
            const approver = approvers[index] || {};
            const name = String(approver.name || "").trim();
            const title = String(approver.title || "").trim();
            const usercode = String(approver.usercode || "").trim().toUpperCase();
            const key = normalizeText(name) || "__NONE__";
            if (!groups.has(key)) {
                groups.set(key, { name, title, usercode, employees: [], sources: new Set() });
            } else if (!groups.get(key).usercode && usercode) {
                groups.get(key).usercode = usercode;
            }
            groups.get(key).employees.push(employee);
            groups.get(key).sources.add(approver.source || "none");
        });
        return Array.from(groups.values());
    }

    console.assert(
        groupPickerSignatories(
            [{ usercode: "E1" }, { usercode: "E2" }, { usercode: "E3" }],
            [{ name: "Approver A" }, { name: "Approver B" }, { name: "Approver A" }]
        ).length === 2,
        "DTR checked-employee signatory grouping failed"
    );

    let pickerSignatorySummaryGeneration = 0;

    function getPickerSignatorySummary() {
        let summary = els.pickerSignatorySummary || document.getElementById("dtr-picker-signatory-summary");
        if (!summary && els.signatoryCopy?.parentElement) {
            summary = document.createElement("div");
            summary.id = "dtr-picker-signatory-summary";
            summary.className = "dtr-picker-signatory-summary";
            els.signatoryCopy.parentElement.insertBefore(summary, els.signatorySearchBox || els.signatoryChange?.parentElement || null);
        }
        return summary;
    }

    function hidePickerSignatorySummary() {
        const summary = document.getElementById("dtr-picker-signatory-summary");
        if (summary) {
            summary.hidden = true;
            summary.style.display = "none";
        }
        if (els.signatoryAvatar) els.signatoryAvatar.hidden = false;
        if (els.signatoryCopy) els.signatoryCopy.hidden = false;
    }

    async function renderPickerSelectionSignatories() {
        const generation = ++pickerSignatorySummaryGeneration;
        const selected = state.directoryEmployees.filter((employee) =>
            state.pickerSelectedUsercodes.has(employee.usercode));
        if (!selected.length) {
            await loadSignatoryPanel(els.pickerDepartment?.value || "");
            return;
        }

        const summary = getPickerSignatorySummary();
        if (!summary || !els.signatoryPanel) return;
        els.signatoryPanel.hidden = false;
        summary.hidden = false;
        summary.style.display = "grid";
        summary.innerHTML = `<span style="color:var(--hy-ink-soft,#6b7280);font-size:12px;">Loading signatories for ${selected.length} selected employee${selected.length === 1 ? "" : "s"}...</span>`;
        if (els.signatoryAvatar) els.signatoryAvatar.hidden = true;
        if (els.signatoryCopy) els.signatoryCopy.hidden = true;
        if (els.signatorySearchBox) els.signatorySearchBox.hidden = true;
        if (els.signatoryChange) els.signatoryChange.hidden = true;
        if (els.signatoryRemove) els.signatoryRemove.hidden = true;

        // [SIGNATORY] Pareho sa print: sariling assignment muna, saka lamang ang group/shift fallback.
        const approvers = await Promise.all(selected.map(resolvePickerEmployeeSignatory));
        if (generation !== pickerSignatorySummaryGeneration) return;

        const groups = groupPickerSignatories(selected, approvers);
        summary.innerHTML = groups.map((group) => {
            const candidate = state.signatoryDirectory.find((employee) =>
                String(employee.usercode || "").trim().toUpperCase() === group.usercode);
            const name = group.name || "No assigned signatory";
            const title = group.name ? (group.title || "Signatory") : "Blank signature line on print";
            const source = group.sources.size === 1 && group.sources.has("direct")
                ? "Direct assignment"
                : group.sources.size === 1 && group.sources.has("default")
                    ? "Department/area default" : "Mixed assignment sources";
            return `
                <article class="dtr-picker-signatory-group">
                    <span class="dtr-signatory-avatar">${candidate?.profile_photo_url
                        ? `<img src="${escapeHtml(candidate.profile_photo_url)}" alt="" loading="lazy" />`
                        : escapeHtml(initials(name))}</span>
                    <span class="dtr-picker-signatory-group-copy">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(title)} · ${group.employees.length} employee${group.employees.length === 1 ? "" : "s"} · ${escapeHtml(source)}</small>
                    </span>
                    <details>
                        <summary>View employees</summary>
                        <span>${group.employees.map((employee) => escapeHtml(employee.name || employee.usercode)).join(" · ")}</span>
                    </details>
                </article>`;
        }).join("");
    }

    function currentBulkSignatoryTargets() {
        return Array.from(state.pickerSelectedUsercodes);
    }

    function resetBulkSignatoryEditor() {
        bulkSignatoryCandidate = null;
        if (els.bulkSignatoryInput) {
            els.bulkSignatoryInput.value = "";
            els.bulkSignatoryInput.closest(".dtr-signatory-search").hidden = false;
        }
        if (els.bulkSignatoryResults) els.bulkSignatoryResults.innerHTML = "";
        if (els.bulkSignatoryReview) {
            els.bulkSignatoryReview.hidden = true;
            els.bulkSignatoryReview.innerHTML = "";
        }
        const count = currentBulkSignatoryTargets().length;
        if (els.pickerBulkSignatoryCount) els.pickerBulkSignatoryCount.textContent = String(count);
        if (els.bulkSignatoryLabel) {
            els.bulkSignatoryLabel.innerHTML = `Change signatory for <strong>${count}</strong> checked employee${count === 1 ? "" : "s"}:`;
        }
    }

    function stageBulkSignatory(candidate) {
        const usercodes = currentBulkSignatoryTargets();
        const targets = state.directoryEmployees.filter((employee) => usercodes.includes(employee.usercode));
        if (!candidate || !targets.length || !els.bulkSignatoryReview) return;
        bulkSignatoryCandidate = candidate;
        const search = els.bulkSignatoryInput?.closest(".dtr-signatory-search");
        if (search) search.hidden = true;
        els.bulkSignatoryReview.hidden = false;
        els.bulkSignatoryReview.innerHTML = `
            <span><strong>Review:</strong> ${targets.length} employee${targets.length === 1 ? "" : "s"} → <strong>${escapeHtml(candidate.name || candidate.usercode)}</strong></span>
            <small>${targets.slice(0, 6).map((employee) => escapeHtml(employee.name || employee.usercode)).join(" · ")}${targets.length > 6 ? ` · +${targets.length - 6} more` : ""}</small>
            <span class="dtr-signatory-review-actions">
                <button type="button" class="dtr-tool-btn" data-bulk-signatory-cancel>Cancel</button>
                <button type="button" class="dtr-tool-btn dtr-tool-btn--accent" data-bulk-signatory-save>Confirm change</button>
            </span>`;
    }

    let signatoryDepartment = "";
    let signatoryState = null;

    async function loadSignatoryPanel(department) {
        signatoryDepartment = String(department || "").trim();
        if (!els.signatoryPanel) {
            return;
        }
        hidePickerSignatorySummary();
        if (!signatoryDepartment || signatoryDepartment === "__ALL__") {
            els.signatoryPanel.hidden = true;
            return;
        }
        els.signatoryPanel.hidden = false;
        els.signatorySearchBox && (els.signatorySearchBox.hidden = true);
        els.signatoryCopy && (els.signatoryCopy.hidden = false);
        if (els.signatoryName) els.signatoryName.textContent = "Loading signatory...";
        if (els.signatoryTitle) els.signatoryTitle.textContent = "";
        try {
            const payload = await request("get", { module: "dtr", department: signatoryDepartment }, SIGNATORY_API);
            signatoryState = payload.signatory || null;
            renderSignatoryAvatar(els.signatoryAvatar, signatoryState);
            if (els.signatoryName) {
                els.signatoryName.textContent = signatoryState?.name || "No signatory assigned";
            }
            if (els.signatoryTitle) {
                els.signatoryTitle.textContent = signatoryState
                    ? (signatoryState.title || "Signatory")
                    : "Prints will show a blank signature line";
            }
            const canManage = canManageSignatories();
            if (els.signatoryChange) {
                els.signatoryChange.hidden = !canManage;
                els.signatoryChange.textContent = signatoryState ? "Change" : "Assign";
            }
            if (els.signatoryRemove) {
                els.signatoryRemove.hidden = !canManage || !signatoryState;
            }
        } catch (error) {
            if (els.signatoryName) els.signatoryName.textContent = "Signatory unavailable";
            if (els.signatoryTitle) els.signatoryTitle.textContent = error.message || "";
        }
    }

    let signatorySearchTimer = null;
    // ponytail: filters the already-loaded, correctly-classified roster directory client-side
    // instead of calling signatoryService's "bootstrap" action — bootstrap only understands real
    // departmenttb rows, not DTR's area-based pseudo-departments ("Catbalogan" etc. mean "match by
    // area, excluding shift-worker positions" — see pickerEmployeeMatches), so it returned nothing
    // for those even though matching employees clearly exist.
    async function searchSignatoryCandidates(q) {
        if (!els.signatoryResults) {
            return;
        }
        if (!q || q.trim().length < 2) {
            els.signatoryResults.innerHTML = "";
            return;
        }
        els.signatoryResults.innerHTML = `<p style="padding:6px 10px;color:var(--hy-ink-soft,#6b7280);font-size:12px;">Searching...</p>`;
        try {
            await ensureSignatoryDirectory();
            const needle = normalizeText(q);
            // [SEARCH] Global ang replacement picker: puwedeng ibang department ang DTR approver.
            const employees = state.signatoryDirectory.filter((employee) =>
                hasSignatoryPrivilege(employee)
                && [employee.name, employee.usercode, employee.department, employee.position]
                    .some((value) => normalizeText(value).includes(needle)));
            if (!employees.length) {
                els.signatoryResults.innerHTML = `<p style="padding:6px 10px;color:var(--hy-ink-soft,#6b7280);font-size:12px;">No employees found.</p>`;
                return;
            }
            els.signatoryResults.innerHTML = employees.slice(0, 20).map((employee) => `
                <button type="button" class="dtr-signatory-result" data-signatory-usercode="${escapeHtml(employee.usercode)}">
                    <span class="dtr-signatory-avatar">${employee.profile_photo_url
                        ? `<img src="${escapeHtml(employee.profile_photo_url)}" alt="" loading="lazy" />`
                        : escapeHtml(initials(employee.name))}</span>
                    <span>${escapeHtml(employee.name)} <small style="color:var(--hy-ink-soft,#6b7280);">${escapeHtml(employee.position || "")}</small></span>
                </button>
            `).join("");
        } catch (error) {
            els.signatoryResults.innerHTML = `<p style="padding:6px 10px;color:var(--dtr-danger,#b91c1c);font-size:12px;">${escapeHtml(error.message)}</p>`;
        }
    }

    async function assignSignatory(usercode) {
        try {
            if (signatoryState?.groupId) {
                await postJson("change_group_signatory", { group_id: signatoryState.groupId, signatory_usercode: usercode, department: signatoryDepartment }, SIGNATORY_API);
            } else {
                await postJson("create_group", { module_key: "dtr", signatory_usercode: usercode, department: signatoryDepartment }, SIGNATORY_API);
            }
            if (els.signatorySearchBox) els.signatorySearchBox.hidden = true;
            if (els.signatorySearchInput) els.signatorySearchInput.value = "";
            await loadSignatoryPanel(signatoryDepartment);
            await refreshPrintSignatories();
        } catch (error) {
            setMessage(error.message, "error");
        }
    }

    async function removeSignatory() {
        if (!signatoryState?.groupId) {
            return;
        }
        try {
            await postJson("remove_group", { id: signatoryState.groupId }, SIGNATORY_API);
            await loadSignatoryPanel(signatoryDepartment);
            await refreshPrintSignatories();
        } catch (error) {
            setMessage(error.message, "error");
        }
    }

    async function applyEmployeePicker() {
        state.currentPage = 0;
        const allUsercodes = new Set(
            state.directoryEmployees.map((employee) => employee.usercode).filter(Boolean)
        );
        const requestedUsercodes = new Set(
            Array.from(state.pickerSelectedUsercodes).filter((code) => allUsercodes.has(code))
        );
        const hasCustomSelection = requestedUsercodes.size > 0 && requestedUsercodes.size < allUsercodes.size;

        // ponytail: an empty or all-selected picker means no employee filter; use the full directory.
        state.selectedUsercodes = hasCustomSelection ? requestedUsercodes : allUsercodes;
        state.employees = hasCustomSelection
            ? state.directoryEmployees.filter((employee) => state.selectedUsercodes.has(employee.usercode))
            : [...state.directoryEmployees];
        state.currentDepartment = hasCustomSelection ? "Custom selection" : "All departments";
        state.customSelection = hasCustomSelection;
        renderEmployeeRoster();
        syncSelectionSummary();
        syncBadges();
        closeEmployeePicker();
        await loadRows();
        const count = state.selectedUsercodes.size;
        setMessage(
            hasCustomSelection
                ? `Loaded ${count} selected employee${count === 1 ? "" : "s"}.`
                : `Loaded all ${count} employees.`,
            count ? "success" : ""
        );
    }

    function rowWorkedMinutes(row) {
        const computed = Number(row.worked_minutes);
        return Number.isFinite(computed)
            ? computed
            : minutesBetween(row.morning_in, row.morning_out) + minutesBetween(row.afternoon_in, row.afternoon_out);
    }

    function rowLateMinutes(row) {
        const computed = Number(row.late_min ?? row.late_minutes);
        if (Number.isFinite(computed)) {
            return computed;
        }
        const morningIn = parseTimeMinutes(row.morning_in);
        return morningIn === null ? 0 : Math.max(0, morningIn - STANDARD_START_MINUTES);
    }

    function rowDailyPay(row) {
        const value = Number(row.daily_pay);
        return Number.isFinite(value) ? value.toFixed(2) : "--";
    }

    async function fetchEmployeeRows(usercode, force = false) {
        const key = cacheKey(usercode);
        if (!force && state.rowCache.has(key)) {
            return state.rowCache.get(key);
        }
        if (!force) {
            const persisted = readPersistedRows(key);
            if (persisted) {
                state.rowCache.set(key, persisted);
                return persisted;
            }
        }

        // ponytail: monthly_final reads the frozen dtr_final cache and only falls back to a live
        // compute for days that aren't finalized yet (e.g. today) — same row shape as
        // monthly_computed plus a `finalized` flag, so the grid/print/CSV need no other changes.
        const payload = await request("monthly_final", {
            date_from: els.dateFrom?.value || monthStart(),
            date_to: els.dateTo?.value || today(),
            usercode
        });

        const items = Array.isArray(payload.items) ? payload.items : [];
        state.rowCache.set(key, items);
        writePersistedRows(key, items);
        return items;
    }

    async function mapWithConcurrency(items, limit, mapper) {
        const output = new Array(items.length);
        let cursor = 0;
        async function worker() {
            while (cursor < items.length) {
                const index = cursor++;
                output[index] = await mapper(items[index], index);
            }
        }
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
        return output;
    }

    function showLoadedRows(rows) {
        state.rawRows = [...rows];
        // ponytail: include-weekends checkbox removed from the DOM (sidebar cleanup); default
        // stays "include" (its old checked-by-default behavior) since there's no UI to toggle it.
        state.rows = els.includeWeekends && !els.includeWeekends.checked
            ? rows.filter((row) => {
                const day = String(row.day_name || "").toLowerCase();
                return day !== "saturday" && day !== "sunday";
            })
            : [...rows];

        state.rows.sort((a, b) => {
            const userCompare = String(a.usercode || "").localeCompare(String(b.usercode || ""));
            if (userCompare !== 0) {
                return userCompare;
            }
            const dateCompare = String(a.work_date || "").localeCompare(String(b.work_date || ""));
            if (dateCompare !== 0) {
                return dateCompare;
            }
            return String(a.name || a._employeeName || "").localeCompare(String(b.name || b._employeeName || ""));
        });

        renderRows(state.rows);
        updateTotals(state.rows);
        syncBadges();
    }

    // ponytail: thin wrapper, not inline begin/endLoading() calls — the real function has several
    // early `return`s (no employees, no selection) that would each need their own endLoading()
    // call to avoid the splash getting stuck forever. Wrapping it means every exit path, including
    // ones added later, is covered by one try/finally with no chance of missing one.
    async function loadRows({ force = false } = {}) {
        beginLoading();
        try {
            return await loadRowsInner(force);
        } finally {
            endLoading();
        }
    }

    function employeeToRows(employee, items) {
        const usercode = employee.usercode;
        return items.map((item) => ({
            ...item,
            _employeeName: employee?.name || item.name || usercode,
            _employeeDept: employee?.department || item.department || "",
            _employeeArea: employee?.area || ""
        }));
    }

    // Fetches DTR rows for a roster of employees with bounded concurrency, optionally painting
    // progress into the on-screen table as results come in. Shared by the paginated on-screen
    // loader and the full-roster fetch used for Print/Export.
    async function fetchRosterRows(roster, { force = false, generation = null, progressive = false } = {}) {
        const partialRows = [];
        let completedEmployees = 0;
        let failedEmployees = 0;
        let lastError = null;
        const results = await mapWithConcurrency(
            roster,
            6,
            async (employee) => {
                let employeeRows = [];
                try {
                    const items = await fetchEmployeeRows(employee.usercode, force);
                    employeeRows = employeeToRows(employee, items);
                } catch (error) {
                    failedEmployees += 1;
                    lastError = error;
                }

                completedEmployees += 1;
                if (progressive) {
                    partialRows.push(...employeeRows);
                    const shouldPaint = completedEmployees <= 6 ||
                        completedEmployees % 24 === 0 ||
                        completedEmployees === roster.length;
                    if (generation === state.loadGeneration && shouldPaint) {
                        showLoadedRows(partialRows);
                        setMessage(
                            `Loading DTR: ${completedEmployees}/${roster.length} employees${failedEmployees ? ` (${failedEmployees} skipped)` : ""}...`,
                            ""
                        );
                        await new Promise((resolve) => requestAnimationFrame(resolve));
                    }
                }
                return employeeRows;
            }
        );
        const rows = results.flat().filter(Boolean);
        return { rows, failedEmployees, lastError };
    }

    function syncPageInfo(rosterLength) {
        if (!els.pageBar) {
            return;
        }
        const totalPages = Math.max(1, Math.ceil(rosterLength / state.pageSize));
        state.currentPage = Math.min(state.currentPage, totalPages - 1);
        els.pageBar.hidden = rosterLength <= state.pageSize;
        if (els.pageInfo) {
            const start = state.currentPage * state.pageSize + 1;
            const end = Math.min(rosterLength, start + state.pageSize - 1);
            els.pageInfo.textContent = `Showing ${start}-${end} of ${rosterLength} employees (page ${state.currentPage + 1}/${totalPages})`;
        }
        if (els.pagePrev) {
            els.pagePrev.disabled = state.currentPage <= 0;
        }
        if (els.pageNext) {
            els.pageNext.disabled = state.currentPage >= totalPages - 1;
        }
    }

    async function loadRowsInner(force = false) {
        const generation = ++state.loadGeneration;
        const roster = state.employees.filter((employee) =>
            state.selectedUsercodes.has(employee.usercode)
        );

        if (!state.employees.length) {
            state.rawRows = [];
            state.rows = [];
            renderRows([]);
            updateTotals([]);
            syncPageInfo(0);
            setMessage(state.customSelection ? "Select at least one employee." : "Load employees from the selected department.", "");
            return;
        }

        if (!roster.length) {
            state.rawRows = [];
            state.rows = [];
            renderRows([]);
            updateTotals([]);
            syncPageInfo(0);
            setMessage("Pick one or more employees from the left list.", "error");
            return;
        }

        syncPageInfo(roster.length);
        const pageStart = state.currentPage * state.pageSize;
        const pageRoster = roster.slice(pageStart, pageStart + state.pageSize);

        try {
            setMessage(`Loading DTR for ${pageRoster.length} of ${roster.length} employee(s)...`, "");
            const { rows, failedEmployees, lastError } = await fetchRosterRows(pageRoster, { force, generation, progressive: true });
            if (generation !== state.loadGeneration) {
                return;
            }

            if (failedEmployees === pageRoster.length && lastError) {
                throw lastError;
            }

            showLoadedRows(rows);
            updateFinalizedBadge(pageRoster, generation);
            setMessage(
                `Loaded ${state.rows.length} DTR row(s) from ${pageRoster.length - failedEmployees} employee(s)` +
                    `${roster.length > pageRoster.length ? ` (page ${state.currentPage + 1} of ${Math.ceil(roster.length / state.pageSize)} — Print/Export use all ${roster.length})` : ""}` +
                    `${failedEmployees ? `; ${failedEmployees} could not be loaded.` : "."}`,
                failedEmployees ? "" : "success"
            );
        } catch (error) {
            if (generation !== state.loadGeneration) {
                return;
            }
            state.rawRows = [];
            state.rows = [];
            renderRows([]);
            updateTotals([]);
            setMessage(error.message, "error");
        }
    }

    // Print and Export must reflect the FULL selected roster, not just whatever page is on screen.
    // Reuses the same per-employee cache (in-memory + localStorage), so pages already viewed cost
    // nothing here — only employees not yet fetched trigger network calls.
    async function ensureFullRosterRows({ force = false } = {}) {
        const roster = state.employees.filter((employee) => state.selectedUsercodes.has(employee.usercode));
        if (!roster.length) {
            return [];
        }
        beginLoading();
        try {
            setMessage(`Preparing full DTR data for ${roster.length} employee(s)...`, "");
            const { rows, failedEmployees, lastError } = await fetchRosterRows(roster, { force, progressive: false });
            if (failedEmployees === roster.length && lastError) {
                throw lastError;
            }
            return rows;
        } finally {
            endLoading();
        }
    }

    function updateTotals(rows) {
        if (!els.totalUndertime) {
            return;
        }
        const total = rows.reduce((sum, row) => sum + Number(row.undertime_min || 0), 0);
        els.totalUndertime.textContent = String(total);
    }

    function renderDtrTimeCell(row, field) {
        const correction = row.corrections?.[field];
        const value = row[field] || "";
        if (!correction) {
            return `<td>${escapeHtml(value)}</td>`;
        }
        const original = row[`biometric_${field}`] ?? correction.original_value ?? "";
        return `<td title="Original biometric: ${escapeHtml(original || "empty")}" style="background:#ecfdf3;color:#067647;font-weight:800;">${escapeHtml(value)}<small style="display:block;font-size:9px;color:#067647;">Manual edit</small></td>`;
    }

    async function toggleDayPunches(cell) {
        const row = cell.closest("tr");
        const existing = row?.nextElementSibling;
        if (existing?.classList.contains("dtr-day-punches-row")) {
            existing.remove();
            return;
        }
        row?.parentElement?.querySelectorAll(".dtr-day-punches-row").forEach((el) => el.remove());
        const usercode = cell.getAttribute("data-usercode");
        const workDate = cell.getAttribute("data-work-date");
        if (!usercode || !workDate) {
            return;
        }
        const detail = document.createElement("tr");
        detail.className = "dtr-day-punches-row";
        detail.innerHTML = `<td colspan="15">Loading raw punches...</td>`;
        row.insertAdjacentElement("afterend", detail);
        try {
            const payload = await request("day_punches", { usercode, date: workDate, date_from: workDate, date_to: workDate });
            const punches = payload.items || [];
            detail.innerHTML = `<td colspan="15">${
                punches.length
                    ? `Raw punches for ${escapeHtml(workDate)}: ${punches.map((p) => `<b>${escapeHtml(p.display_time || p.time || "")}</b> (${escapeHtml(p.type || "")}${p.area ? ", " + escapeHtml(p.area) : ""})`).join(" &nbsp;→&nbsp; ")}`
                    : `No biometric punches found for ${escapeHtml(workDate)}.`
            }</td>`;
        } catch (error) {
            detail.innerHTML = `<td colspan="15">Failed to load punches: ${escapeHtml(error.message)}</td>`;
        }
    }

    function postJson(action, body, endpoint = API) {
        return fetch(`${endpoint}?action=${action}`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                ...(localStorage.getItem("samelcii_token")?.split(".").length === 3
                    ? { Authorization: `Bearer ${localStorage.getItem("samelcii_token")}` }
                    : {})
            },
            body: JSON.stringify(body)
        }).then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.message || `Request failed (${response.status})`);
            }
            return payload;
        });
    }

    function renderScheduleHistory(items) {
        if (!els.scheduleHistory) {
            return;
        }
        if (!items.length) {
            els.scheduleHistory.innerHTML = `<p style="color:var(--hy-muted);font-size:13px;">No schedule overrides yet — this employee uses the standard 8:00-12:00 / 1:00-5:00 template.</p>`;
            return;
        }
        els.scheduleHistory.innerHTML = items.map((item) => `
            <div class="schedule-history-row" data-schedule-id="${item.id}">
                <span>From <b>${escapeHtml(item.effective_from)}</b>: ${escapeHtml(item.am_start || "--")}-${escapeHtml(item.am_end || "--")} / ${escapeHtml(item.pm_start || "--")}-${escapeHtml(item.pm_end || "--")}</span>
                <button class="dtr-tool-btn" type="button" data-delete-schedule="${item.id}">Remove</button>
            </div>
        `).join("");
    }

    async function loadScheduleHistory(usercode) {
        if (!els.scheduleHistory) {
            return;
        }
        els.scheduleHistory.innerHTML = `<p style="color:var(--hy-muted);font-size:13px;">Loading...</p>`;
        try {
            const payload = await request("schedule_list", { usercode });
            renderScheduleHistory(payload.items || []);
        } catch (error) {
            els.scheduleHistory.innerHTML = `<p style="color:var(--dtr-danger);font-size:13px;">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderRows(rows) {
        if (!els.body) {
            return;
        }

        if (!rows.length) {
            els.body.innerHTML = `
                <tr>
                    <td colspan="15" class="dtr-empty-table">No DTR rows loaded yet.</td>
                </tr>
            `;
            return;
        }

        els.body.innerHTML = rows.map((row) => {
            const isWeekend = /saturday|sunday/i.test(String(row.day_name || ""));
            const special = String(row.special_label || "").trim();
            const worked = rowWorkedMinutes(row);
            const undertime = Number(row.undertime_min || 0);
            const late = rowLateMinutes(row);
            const dailyPay = rowDailyPay(row);
            const lateCount = Number(row.late_count ?? (late > 0 ? 1 : 0));

            if (special) {
                return `
                    <tr class="dtr-special-row ${isWeekend ? "weekend-row" : ""}">
                        <td>${escapeHtml(formatDateLabel(row.work_date || ""))}</td>
                        <td colspan="14" class="dtr-special-cell">${escapeHtml(special)}</td>
                    </tr>
                `;
            }

            return `
                <tr class="${isWeekend ? "weekend-row" : ""}">
                    <td class="dtr-day-cell" data-day-punches data-usercode="${escapeHtml(row.usercode || "")}" data-work-date="${escapeHtml(row.work_date || "")}" title="Click to see raw biometric punches">${escapeHtml(row.work_date || "--")}</td>
                    ${renderDtrTimeCell(row, "morning_in")}
                    ${renderDtrTimeCell(row, "morning_out")}
                    ${renderDtrTimeCell(row, "afternoon_in")}
                    ${renderDtrTimeCell(row, "afternoon_out")}
                    ${renderDtrTimeCell(row, "ot_in")}
                    ${renderDtrTimeCell(row, "ot_out")}
                    <td>${formatNumber(worked)}</td>
                    <td>${formatNumber(undertime)}</td>
                    <td>${formatNumber(late)}</td>
                    <td>${escapeHtml(dailyPay)}</td>
                    <td>${formatNumber(row.per_hour || 0)}</td>
                    <td>${formatNumber(row.per_minute || 0)}</td>
                    <td>${formatNumber(row.ot_minutes || 0)}</td>
                    <td>${formatNumber(lateCount)}</td>
                </tr>
            `;
        }).join("");
    }

    function printSnapshotRows(rows) {
        return rows.map((row) => ({
            usercode: row.usercode || "",
            name: row.name || row._employeeName || "",
            department: row.department || row._employeeDept || "",
            area: row.area || row._employeeArea || "",
            work_date: row.work_date || "",
            special_label: row.special_label || "",
            morning_in: row.morning_in || "",
            morning_out: row.morning_out || "",
            afternoon_in: row.afternoon_in || "",
            afternoon_out: row.afternoon_out || "",
            ot_in: row.ot_in || "",
            ot_out: row.ot_out || "",
            worked_minutes: rowWorkedMinutes(row),
            undertime_minutes: Number(row.undertime_min || 0),
            late_minutes: rowLateMinutes(row),
            daily_pay: rowDailyPay(row),
            per_hour: Number(row.per_hour || 0),
            per_minute: Number(row.per_minute || 0),
            ot_minutes: Number(row.ot_minutes || 0),
            late_count: Number(row.late_count ?? (rowLateMinutes(row) > 0 ? 1 : 0)),
            correction_ids: Object.values(row.corrections || {}).map((item) => Number(item?.id || 0)).filter((id) => id > 0)
        }));
    }

    const printPreviewState = {
        pages: [],
        currentPage: 0
    };

    function rowHasPunch(row) {
        return ["morning_in", "morning_out", "afternoon_in", "afternoon_out", "ot_in", "ot_out"]
            .some((field) => Boolean(String(row?.[field] || "").trim()));
    }

    function isShiftEmployee(employee) {
        return /maintenance|security\s*guard|substation\s*tender|ss\s*tender/i.test(String(employee?.position || ""));
    }

    // ponytail: isShiftEmployee() above only guesses from the job title, which is wrong for a
    // Maintenance-titled employee who (per their actual punches this month) works a plain single
    // day shift, not a real midnight/day/evening rotation — the backend already tells the two apart
    // (dtrService.js shiftPositionKind + the overnight-punch check) and stamps the real answer on
    // every row as `row.shift`. Prefer that; fall back to the title guess only when no rows are
    // loaded yet for this employee (e.g. before their DTR has been fetched).
    function employeeIsShift(employee, rowsByEmployee) {
        const rows = rowsByEmployee?.get(employee?.usercode) || [];
        const withFlag = rows.find((row) => typeof row.shift === "boolean");
        return withFlag ? withFlag.shift : isShiftEmployee(employee);
    }

    // ponytail: print-approver lookup stays on the shared signatory "get" action (non-admin-gated,
    // unlike "bootstrap") — DTR only reads it here, signatoryService.js itself is untouched.
    // Must be re-run after ANY signatory assign/change/remove (roster card, picker panel) — this
    // cached copy is what employeeApprover() actually reads at print time, so a stale copy here
    // means a signatory you just assigned won't show up on a print until this refreshes.
    async function refreshPrintSignatories() {
        try {
            const signatoryPayload = await request("get", { module: "dtr" }, SIGNATORY_API);
            state.signatories = Array.isArray(signatoryPayload.signatories) ? signatoryPayload.signatories : [];
        } catch (_signatoryError) {
            state.signatories = [];
        }
        try {
            const individualPayload = await request("employee_signatory_list", {}, API);
            const items = Array.isArray(individualPayload.items) ? individualPayload.items : [];
            state.employeeSignatories = new Map(items.map((item) => [String(item.usercode || "").trim().toUpperCase(), item]));
        } catch (_individualError) {
            state.employeeSignatories = new Map();
        }
    }

    // ponytail: mirrors classifyDepartmentFilter()/employeesByDepartment() in
    // backend/src/services/dtrService.js — signatories can be assigned under an AREA-style grouping
    // (Basey/Villareal/Catbalogan, or "X TSD" for that area's technical staff) rather than the
    // employee's literal usertb.department. Matching on department alone silently misses those —
    // an assigned Catbalogan/Basey/Villareal signatory would never show on any print.
    const DTR_AREA_GROUPS = ["basey", "villareal", "catbalogan"];
    function employeeDepartmentGroupKey(employee) {
        const department = String(employee?.department || "").trim();
        const area = String(employee?.area || "").trim();
        const isTsd = /technical services department/i.test(department) || department.toUpperCase() === "TSD";
        if (isTsd && area) {
            return `${area} TSD`;
        }
        if (!isTsd && area && DTR_AREA_GROUPS.includes(area.toLowerCase())) {
            return area;
        }
        return department;
    }

    function employeeApprover(employee) {
        // ponytail: per-employee assignment (dtr_employee_signatory) always wins over the old
        // shared department/area group lookup below — it's exact (one row per person, no
        // literal-department-vs-area-group priority guessing needed) and is what "Assign" on the
        // roster card now writes to. The group lookup stays only as a fallback for employees who
        // haven't been individually assigned yet.
        const individual = state.employeeSignatories?.get(String(employee?.usercode || "").trim().toUpperCase());
        if (individual) {
            return {
                name: String(individual.approver_name || "").trim(),
                title: String(individual.approver_title || "Department Head").trim()
            };
        }
        const department = normalizeText(employee?.department);
        const groupKey = normalizeText(employeeDepartmentGroupKey(employee));
        const byKey = (key, requireName) => state.signatories.find((item) => {
            const itemDept = normalizeText(item?.department);
            if (!key || itemDept !== key) return false;
            return requireName ? Boolean(String(item?.name || "").trim()) : true;
        });
        // ponytail: an area/TSD/special-position employee (groupKey !== their literal department)
        // is NEVER printed under their home department — per classifyDepartmentFilter in
        // dtrService.js, e.g. a Catbalogan-area Finance Services employee only ever shows up under
        // the "Catbalogan" grouping, not "FINANCE SERVICES DEPARTMENT". So the area/group signatory
        // must win over a literal-department one whenever both exist and both have a real person
        // assigned — otherwise an assigned Catbalogan signatory silently loses to the employee's
        // home department's auto-seeded head just because that record happens to come first.
        const match = (groupKey !== department && byKey(groupKey, true))
            || byKey(department, true)
            || byKey(groupKey, true)
            || byKey(department, false)
            || byKey(groupKey, false);
        // NOTE: the signatory "get" API returns each record as { name, title, department, ... } —
        // the field is `.name`, not `.signatory_name` (a previous bug: title resolved fine since
        // that field really is called `title`, but name always read undefined).
        // ponytail: a department head IS that department's configured signatory, so the lookup
        // above resolves back to themselves when printing their own DTR (self-signing). Per
        // company policy a department head's DTR is approved by the General Manager instead —
        // found by title rather than a hardcoded department name, since the GM's row in the
        // Signatory panel is assigned the same way as any other department.
        const isSelfMatch = match
            && String(match.usercode || "").trim().toUpperCase() === String(employee?.usercode || "").trim().toUpperCase();
        const resolved = isSelfMatch
            ? state.signatories.find((item) => /general manager/i.test(String(item?.title || "")))
            : match;
        return {
            name: String(resolved?.name || "").trim(),
            title: String(resolved?.title || "Department Head").trim()
        };
    }

    const areaApproverCache = new Map();
    // Shift workers (Maintenance/Security/Substation Tender) sign under one company-wide manager
    // (ESD Manager / TSD Manager) regardless of which branch area they're deployed to — looked up
    // live from usertb rather than hardcoded, so it stays correct if that person changes.
    async function areaApprover(employee) {
        const cacheKey = String(employee?.department || "");
        if (areaApproverCache.has(cacheKey)) {
            return areaApproverCache.get(cacheKey);
        }
        const promise = request("area_approver", { department: employee?.department || "" }, API)
            .then((payload) => payload.approver
                ? { name: String(payload.approver.name || "").trim(), title: String(payload.approver.title || "").trim() }
                : { name: "", title: "" })
            .catch(() => ({ name: "", title: "" }));
        areaApproverCache.set(cacheKey, promise);
        return promise;
    }

    const epassDatesCache = new Map();
    // ponytail: a day frozen in dtr_final before the EPASS label was simplified to plain "EPASS"
    // still has the old destination text baked into that frozen row — freezing is a cache, it
    // never rewrites old data on its own (see dtrService.js's insertFinalRows). Rather than editing
    // dtr_final directly, this live read-only check lets renderPrintDay override the DISPLAYED
    // text to "EPASS" for any date it returns, leaving whatever's actually stored untouched.
    async function fetchEpassDates(employee, dateFrom, dateTo) {
        const cacheKey = `${employee?.usercode || ""}|${dateFrom}|${dateTo}`;
        if (epassDatesCache.has(cacheKey)) {
            return epassDatesCache.get(cacheKey);
        }
        const promise = request("epass_dates", { usercode: employee?.usercode || "", date_from: dateFrom, date_to: dateTo }, API)
            .then((payload) => new Set(Array.isArray(payload.dates) ? payload.dates : []))
            .catch(() => new Set());
        epassDatesCache.set(cacheKey, promise);
        return promise;
    }

    async function buildEmployeePrintModels(rawRows) {
        const selected = state.employees.filter((employee) => state.selectedUsercodes.has(employee.usercode));
        const rowsByEmployee = new Map();
        rawRows.forEach((row) => {
            const code = String(row.usercode || "").trim();
            if (!rowsByEmployee.has(code)) {
                rowsByEmployee.set(code, []);
            }
            rowsByEmployee.get(code).push(row);
        });

        // ponytail: shift workers (Maintenance/Security Guard/Substation Tender) used to always go
        // straight to areaApprover() (the company-wide ESD/TSD Manager fallback), completely
        // ignoring any per-employee override in dtr_employee_signatory — so assigning a specific
        // signatory to a guard via "Assign" on the roster had no effect on the printed form, it
        // still showed the ESD/TSD Manager every time. Individual override now wins for shift
        // workers too, same priority employeeApprover() already used for regular staff.
        const approvers = await Promise.all(selected.map((employee) => {
            const individual = state.employeeSignatories?.get(String(employee?.usercode || "").trim().toUpperCase());
            if (individual) {
                return Promise.resolve({
                    name: String(individual.approver_name || "").trim(),
                    title: String(individual.approver_title || "Department Head").trim()
                });
            }
            return employeeIsShift(employee, rowsByEmployee) ? areaApprover(employee) : Promise.resolve(employeeApprover(employee));
        }));

        const printDateFrom = els.dateFrom?.value || monthStart();
        const printDateTo = els.dateTo?.value || today();
        const epassDateSets = await Promise.all(selected.map((employee) => fetchEpassDates(employee, printDateFrom, printDateTo)));

        return selected.map((employee, index) => {
            const rows = rowsByEmployee.get(employee.usercode) || [];
            if (!rows.some(rowHasPunch)) {
                return null;
            }
            const byDay = new Map(rows.map((row) => [String(row.work_date || ""), row]));
            const from = new Date(`${els.dateFrom?.value || monthStart()}T00:00:00`);
            const year = from.getFullYear();
            const month = from.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const days = Array.from({ length: 31 }, (_, index2) => {
                const day = index2 + 1;
                if (day > daysInMonth) {
                    return { day, date: "", row: null };
                }
                const date = `${year}-${pad(month + 1)}-${pad(day)}`;
                return { day, date, row: byDay.get(date) || null };
            });
            return {
                employee,
                rows,
                days,
                approver: approvers[index],
                shift: employeeIsShift(employee, rowsByEmployee),
                epassDates: epassDateSets[index]
            };
        }).filter(Boolean);
    }

    const PRINT_AREA_LEGEND = [
        ["MAIN", "MAIN"],
        ["CATBALOGAN", "CATBALOGAN"],
        ["CATBALOGAN SUB", "CATBALOGAN SUB"],
        ["VILLAREAL", "VILLAREAL"],
        ["VILLAREAL SUB", "VILLAREAL SUB"],
        ["BASEY", "BASEY"],
        ["BAGOLIBAS SUB", "BAGOLIBAS SUB"]
    ];

    function printAreaKey(area) {
        return normalizeText(area).replace(/\s+/g, " ").toUpperCase();
    }

    function printAreaClass(area) {
        return printAreaKey(area).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }

    function displayPrintArea(area) {
        const value = printAreaKey(area);
        return !value || value === "MAIN" ? "PARANAS" : value;
    }

    function renderPrintAreaLegend() {
        return PRINT_AREA_LEGEND.map(([area, label]) => `
            <span class="dtr-print-legend-item">
                <i class="dtr-print-area-color dtr-print-area-color--${printAreaClass(area)}"></i>
                ${escapeHtml(label)}
            </span>`).join("");
    }

    function printTime(row, field, employeeArea) {
        const value = String(row?.[field] || "").trim();
        if (!value) {
            return "";
        }
        const punchArea = String(row?.[`${field}_area`] || "").trim();
        const moved = punchArea && printAreaKey(punchArea) !== printAreaKey(employeeArea);
        const marker = moved
            ? `<i class="dtr-print-area-stripe dtr-print-area-color--${printAreaClass(punchArea)}"></i>`
            : "";
        return `${marker}${escapeHtml(value)}`;
    }

    function renderPrintDay(model, item) {
        if (!item.date) {
            return `<tr><th>${item.day}</th><td colspan="7"></td></tr>`;
        }
        let row = item.row || {};
        let special = String(row.special_label || "").trim();
        // Live override for a day frozen before the EPASS label was simplified to plain "EPASS" —
        // see fetchEpassDates() above. Holiday keeps priority (matches the backend's own
        // HOLIDAY > EPASS ordering), so this never overwrites an already-correct HOLIDAY row.
        if (special && !/holiday/i.test(special) && model.epassDates?.has(item.date)) {
            special = "EPASS";
        }
        const anyPunch = rowHasPunch(row);
        if (special && !anyPunch && /holiday/i.test(special)) {
            return `<tr class="dtr-print-special dtr-print-special--holiday"><th>${item.day}</th><td colspan="6">${escapeHtml(special)}</td><td></td></tr>`;
        }
        // ponytail: a future date (hasn't happened yet) has zero punches for the same reason a real
        // rest day does — there's nothing to distinguish them from rowHasPunch() alone. Without this
        // check, every day from tomorrow through the end of the month printed as "REST DAY" (e.g.
        // Aug 15-31 on an Aug 13 printout), which reads as if the employee is scheduled off for two
        // straight weeks. A future day gets a blank row instead — nothing to report yet, not a rest
        // day.
        const isFutureDate = item.date > today();
        // ponytail: shift/area staff (isShiftEmployee) used to get a blanket pass here — ANY
        // no-punch day read as their rest day, on the theory that their schedule rotates and isn't
        // fixed Mon-Fri like office staff. In practice this hid real unexcused absences (e.g. a
        // Substation Tender with a plain no-punch Tuesday printed "REST DAY" instead of undertime)
        // for anyone the system couldn't otherwise verify was genuinely off that day — there's still
        // no per-employee rest-day schedule stored anywhere to tell a scheduled rest day apart from
        // an absence, so the blanket exemption was pure guesswork. Removed by explicit instruction:
        // only an actual calendar Saturday/Sunday is a rest day now, for shift and regular staff
        // alike; every other no-punch past day is charged the full 480-minute undertime below.
        // Known tradeoff (flagged before removal, confirmed anyway): some shift workers with a real
        // rotating schedule — confirmed via checkinout history to actually work weekends — will now
        // be charged undertime on what may be a legitimate earned weekday rest. There is no stored
        // roster to distinguish those from real absences; fixing that properly needs a real
        // per-employee rest-day schedule (new column/table + UI), not a print-time heuristic.
        const dayOfWeek = new Date(`${item.date}T00:00:00`).getDay();
        const isCalendarWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isRestDay = isCalendarWeekend;
        if (!special && !anyPunch && !isFutureDate && isRestDay) {
            return `<tr class="dtr-print-special dtr-print-special--weekend"><th>${item.day}</th><td colspan="6">${escapeHtml(String(row.day_name || "Rest day").toUpperCase())}</td><td></td></tr>`;
        }
        if (!special && !anyPunch && isFutureDate) {
            return `<tr><th>${item.day}</th><td colspan="7"></td></tr>`;
        }
        if (!special && !anyPunch && !isFutureDate && !isRestDay) {
            row = { ...row, undertime_min: 480 };
        }
        const fields = ["morning_in", "morning_out", "afternoon_in", "afternoon_out", "ot_in", "ot_out"];
        const values = fields.map((field) => printTime(row, field, model.employee.area));
        // ponytail: an EPASS/LEAVE/OT/duty-area note (special_label) used to always squeeze into a
        // fixed spot (AM-OUT+PM-IN merged, or crammed under whichever value happened to be there),
        // even when other columns sat entirely empty. Now it's flexible: pick whichever real time
        // column is UNUSED (common for single-shift staff, where Shift 2/3 are always blank) and
        // give the note that whole cell to itself — only falls back to squeezing beside a real
        // value if every column in the row is genuinely in use.
        let cells;
        if (special && !anyPunch) {
            // No punch anywhere this day — the classic full EPASS/LEAVE/HOLIDAY day. Keep the wide
            // merged badge; there's no time data it could ever be hiding.
            cells = [
                `<td>${values[0]}</td>`,
                `<td colspan="2"><span class="dtr-print-inline-special">${escapeHtml(special)}</span></td>`,
                `<td>${values[3]}</td>`,
                `<td>${values[4]}</td>`,
                `<td>${values[5]}</td>`,
            ];
        } else if (special && !values[1] && !values[2]) {
            // AM-OUT and PM-IN (the usual lunch-break pair) are both empty — e.g. a single AM-IN
            // punch before leaving for travel. Merge that pair into one wide cell instead of
            // cramming the note into just one narrow column, per request.
            cells = [
                `<td>${values[0]}</td>`,
                `<td colspan="2"><span class="dtr-print-inline-special">${escapeHtml(special)}</span></td>`,
                `<td>${values[3]}</td>`,
                `<td>${values[4]}</td>`,
                `<td>${values[5]}</td>`,
            ];
        } else if (special) {
            const emptySlot = [2, 3, 4, 5, 1].find((i) => !values[i]);
            cells = emptySlot !== undefined
                ? values.map((value, i) => (i === emptySlot
                    ? `<td><span class="dtr-print-inline-note">${escapeHtml(special)}</span></td>`
                    : `<td>${value}</td>`))
                : values.map((value, i) => (i === 1
                    ? `<td>${value}<span class="dtr-print-inline-note">${escapeHtml(special)}</span></td>`
                    : `<td>${value}</td>`));
        } else {
            cells = values.map((value) => `<td>${value}</td>`);
        }
        return `
            <tr>
                <th>${item.day}</th>
                ${cells.join("")}
                <td>${Number(row.undertime_min || 0) || ""}</td>
            </tr>`;
    }

    function renderPrintCard(model) {
        const employee = model.employee;
        const totalUndertime = model.days.reduce((sum, item) => sum + Number(item.row?.undertime_min || 0), 0);
        const firstDate = new Date(`${els.dateFrom?.value || monthStart()}T00:00:00`);
        const firstGroup = model.shift ? "SHIFT 1" : "A M";
        const secondGroup = model.shift ? "SHIFT 2" : "P M";
        const thirdGroup = model.shift ? "SHIFT 3" : "OVER TIME";
        return `
            <article class="dtr-print-card" data-usercode="${escapeHtml(employee.usercode)}">
                <header class="dtr-print-card-head">
                    <img class="dtr-print-logo" src="../../../assets/images/LOGO.png" alt="" />
                    <div class="dtr-print-meta">
                        <div><span>ID:</span>${escapeHtml(employee.usercode)}</div>
                        <div><span>Name:</span><strong>${escapeHtml(employee.name || employee.usercode)}</strong></div>
                        <div class="dtr-print-month-area">
                            <span>Month:</span>${escapeHtml(MONTH_NAMES[firstDate.getMonth()])}
                            <b>|</b><span>Area:</span>${escapeHtml(displayPrintArea(employee.area))}
                        </div>
                    </div>
                </header>
                <table class="dtr-print-form">
                    <thead>
                        <tr><th rowspan="2">Day</th><th colspan="2">${firstGroup}</th><th colspan="2">${secondGroup}</th><th colspan="2">${thirdGroup}</th><th rowspan="2">Under<br>Time</th></tr>
                        <tr><th>IN</th><th>OUT</th><th>IN</th><th>OUT</th><th>IN</th><th>OUT</th></tr>
                    </thead>
                    <tbody>${model.days.map((item) => renderPrintDay(model, item)).join("")}</tbody>
                </table>
                <div class="dtr-print-total"><span>Total:</span><strong>${totalUndertime.toLocaleString()}</strong></div>
                <div class="dtr-print-signatures">
                    <div class="dtr-print-signature dtr-print-signature--employee">
                        <strong>${escapeHtml(String(employee.name || employee.usercode).toUpperCase())}</strong><i></i>
                        <span>${escapeHtml(employee.position || "EMPLOYEE")}</span>
                    </div>
                    <div class="dtr-print-signature dtr-print-signature--approver">
                        <strong>${escapeHtml(String(model.approver.name || " ").toUpperCase())}</strong><i></i>
                        <span>${escapeHtml(model.approver.title || "DEPARTMENT HEAD")}</span>
                    </div>
                </div>
                <div class="dtr-print-area-legend">${renderPrintAreaLegend()}</div>
                <div class="dtr-card-audit">Audit pending · choose a print action</div>
            </article>`;
    }

    function setPreviewPage(index) {
        const root = document.getElementById("dtr-print-preview");
        const total = printPreviewState.pages.length;
        if (!root || !total) {
            return;
        }
        printPreviewState.currentPage = Math.max(0, Math.min(index, total - 1));
        root.querySelectorAll(".dtr-print-page").forEach((page, pageIndex) => {
            page.classList.toggle("is-current", pageIndex === printPreviewState.currentPage);
        });
        const label = root.querySelector("[data-print-page-label]");
        if (label) {
            label.textContent = `Page ${printPreviewState.currentPage + 1} of ${total}`;
        }
        root.querySelector("[data-print-action='previous']").disabled = printPreviewState.currentPage === 0;
        root.querySelector("[data-print-action='next']").disabled = printPreviewState.currentPage === total - 1;
    }

    function parsePrintRange(value, totalPages) {
        const pages = new Set();
        String(value || "").split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
            const match = part.match(/^(\d+)(?:-(\d+))?$/);
            if (!match) {
                throw new Error("Use a page range such as 1-3,5.");
            }
            const from = Number(match[1]);
            const to = Number(match[2] || match[1]);
            if (from < 1 || to < from || to > totalPages) {
                throw new Error(`Choose pages from 1 to ${totalPages}.`);
            }
            for (let page = from; page <= to; page += 1) {
                pages.add(page - 1);
            }
        });
        if (!pages.size) {
            throw new Error("Enter at least one page.");
        }
        return Array.from(pages).sort((a, b) => a - b);
    }

    async function printPreviewPages(pageIndexes, suggestedFileName = "") {
        const root = document.getElementById("dtr-print-preview");
        if (!root) {
            return;
        }
        const buttons = Array.from(root.querySelectorAll("button"));
        buttons.forEach((button) => { button.disabled = true; });
        const previousTitle = document.title;
        if (suggestedFileName) {
            document.title = suggestedFileName;
        }
        try {
            for (const pageIndex of pageIndexes) {
                const pageModels = printPreviewState.pages[pageIndex] || [];
                const codes = new Set(pageModels.map((model) => model.employee.usercode));
                const rows = state.printRawRows.filter((row) => codes.has(String(row.usercode || "").trim()));
                const snapshot = await createPrintSnapshot(rows);
                const audit = root.querySelector(`.dtr-print-page[data-page-index="${pageIndex}"] .dtr-card-audit`);
                root.querySelectorAll(`.dtr-print-page[data-page-index="${pageIndex}"] .dtr-card-audit`).forEach((item) => {
                    item.textContent = `${snapshot.audit_id} · ${snapshot.checksum_short} · ${snapshot.printed_at}`;
                });
                if (audit) {
                    audit.dataset.snapshotUuid = snapshot.snapshot_uuid || "";
                }
            }
            root.querySelectorAll(".dtr-print-page").forEach((page, index) => {
                page.classList.toggle("is-print-excluded", !pageIndexes.includes(index));
            });
            document.body.classList.add("dtr-batch-printing");
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            window.print();
        } catch (error) {
            setMessage(error.message || "Unable to prepare DTR printing.", "error");
        } finally {
            document.title = previousTitle;
            document.body.classList.remove("dtr-batch-printing");
            root.querySelectorAll(".dtr-print-page").forEach((page) => page.classList.remove("is-print-excluded"));
            buttons.forEach((button) => { button.disabled = false; });
            setPreviewPage(printPreviewState.currentPage);
        }
    }

    function openBatchPrintPreview(models) {
        document.getElementById("dtr-print-preview")?.remove();
        printPreviewState.pages = [];
        for (let index = 0; index < models.length; index += 3) {
            printPreviewState.pages.push(models.slice(index, index + 3));
        }

        const preview = document.createElement("section");
        preview.id = "dtr-print-preview";
        preview.className = "dtr-print-preview";
        preview.setAttribute("role", "dialog");
        preview.setAttribute("aria-modal", "true");
        preview.setAttribute("aria-label", "DTR batch print preview");
        preview.innerHTML = `
            <div class="dtr-print-preview-toolbar">
                <strong>DTR Print Preview</strong>
                <button type="button" data-print-action="page">Print Page</button>
                <button type="button" data-print-action="all">Print All</button>
                <label>Range <input type="text" data-print-range placeholder="1-3,5" /></label>
                <button type="button" data-print-action="range">Print Range</button>
                <button type="button" data-print-action="previous" aria-label="Previous page">‹</button>
                <span data-print-page-label></span>
                <button type="button" data-print-action="next" aria-label="Next page">›</button>
                <button type="button" data-print-action="pdf" class="dtr-print-pdf-btn" title="Opens the browser print dialog — choose &quot;Save as PDF&quot; as the destination">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" /><path d="M9 15l3 3 3-3" />
                    </svg>
                    Save as PDF
                </button>
                <button type="button" data-print-action="close">Close</button>
            </div>
            <div class="dtr-print-root">
                ${printPreviewState.pages.map((pageModels, pageIndex) => `
                    <section class="dtr-print-page" data-page-index="${pageIndex}">
                        ${pageModels.map(renderPrintCard).join("")}
                        <div class="dtr-print-page-number">Page ${pageIndex + 1} of ${printPreviewState.pages.length}</div>
                    </section>`).join("")}
            </div>`;
        document.body.appendChild(preview);
        preview.addEventListener("click", (event) => {
            const action = event.target.closest("[data-print-action]")?.getAttribute("data-print-action");
            if (!action) {
                return;
            }
            if (action === "close") {
                preview.remove();
            } else if (action === "previous") {
                setPreviewPage(printPreviewState.currentPage - 1);
            } else if (action === "next") {
                setPreviewPage(printPreviewState.currentPage + 1);
            } else if (action === "page") {
                printPreviewPages([printPreviewState.currentPage]);
            } else if (action === "all") {
                printPreviewPages(printPreviewState.pages.map((_page, index) => index));
            } else if (action === "pdf") {
                // [FIX] the server-rendered PDF endpoint was erroring for the user; "Save as PDF"
                // now just opens the same browser print dialog as the other buttons and relies on
                // the browser's own "Save as PDF" print destination instead of a server render.
                printPreviewPages(printPreviewState.pages.map((_page, index) => index));
            } else if (action === "range") {
                try {
                    const pages = parsePrintRange(preview.querySelector("[data-print-range]")?.value, printPreviewState.pages.length);
                    printPreviewPages(pages);
                } catch (error) {
                    setMessage(error.message, "error");
                }
            }
        });
        setPreviewPage(0);
    }

    function renderPrintAudit(snapshot) {
        let panel = document.getElementById("dtr-print-audit");
        if (!panel) {
            const style = document.createElement("style");
            style.textContent = `
                #dtr-print-audit{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin:10px 0;padding:10px 12px;border:1px solid #b8c8e8;border-radius:10px;background:#f7f9ff;color:#273859;font-size:11px}#dtr-print-audit strong{font-size:13px;color:#17233b}#dtr-print-audit code{padding:3px 6px;border-radius:5px;background:#e9efff;color:#2447a8;font-weight:800}#dtr-print-audit small{display:block;color:#64748b}@media print{#dtr-print-audit{display:flex!important;border:1px solid #000;border-radius:0;background:#fff;color:#000;break-inside:avoid}#dtr-print-audit strong,#dtr-print-audit code,#dtr-print-audit small{color:#000;background:transparent}}
            `;
            document.head.appendChild(style);
            panel = document.createElement("section");
            panel.id = "dtr-print-audit";
            panel.setAttribute("aria-label", "DTR print audit identity");
            els.body?.closest(".dtr-table-wrap")?.insertAdjacentElement("beforebegin", panel);
        }
        panel.innerHTML = `
            <div><small>Immutable DTR print snapshot</small><strong>${escapeHtml(snapshot.audit_id || "")}</strong></div>
            <div><small>Checksum</small><code>${escapeHtml(snapshot.checksum_short || "")}</code></div>
            <div><small>Printed by / time</small><span>${escapeHtml(snapshot.printed_by || "--")} · ${escapeHtml(snapshot.printed_at || "--")}</span></div>
            <div><small>Snapshot UUID</small><span>${escapeHtml(snapshot.snapshot_uuid || "")}</span></div>`;
    }

    async function createPrintSnapshot(rows) {
        const response = await fetch(`${API}?action=create_print_snapshot`, {
            method: "POST",
            credentials: "same-origin",
            // ponytail: plain fetch() has no built-in timeout and can hang forever on a stalled
            // connection — that class of bug is what left "Save as PDF" stuck before.
            signal: AbortSignal.timeout(20000),
            headers: {
                "Content-Type": "application/json",
                ...(localStorage.getItem("samelcii_token")?.split(".").length === 3
                    ? { Authorization: `Bearer ${localStorage.getItem("samelcii_token")}` }
                    : {})
            },
            body: JSON.stringify({
                date_from: els.dateFrom?.value || monthStart(),
                date_to: els.dateTo?.value || today(),
                rows: printSnapshotRows(rows)
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
            throw new Error(payload.message || "Unable to create the DTR print audit snapshot.");
        }
        state.printSnapshot = payload;
        renderPrintAudit(payload);
        return payload;
    }

    async function printWithAudit() {
        if (!state.selectedUsercodes.size) {
            setMessage("Select at least one employee before printing.", "error");
            return;
        }
        setMessage("Preparing print preview...", "");
        await refreshPrintSignatories();
        // Print always covers the full selection, independent of which page is on screen.
        // [FIX] force:true — printing feeds a hash-chained audit trail, so it must never serve a
        // stale localStorage-cached row (e.g. cached before a day's dtr_final was written).
        const fullRows = await ensureFullRosterRows({ force: true });
        state.printRawRows = fullRows;
        const models = await buildEmployeePrintModels(fullRows);
        if (!models.length) {
            setMessage("No selected employee has biometric punches for this month.", "error");
            return;
        }
        openBatchPrintPreview(models);
        setMessage(`Prepared ${models.length} employee DTR form(s) on ${Math.ceil(models.length / 3)} page(s).`, "success");
    }

    function downloadCsv(rows) {
        const header = [
            "User ID", "Name", "Date",
            "AM IN", "AM OUT", "PM IN", "PM OUT", "OT IN", "OT OUT",
            "Worked", "Under Time", "Late", "Daily Pay", "Per Hour", "Per Minute",
            "OT Min", "Late Count"
        ];

        const lines = [header.join(",")];

        rows.forEach((row) => {
            const special = String(row.special_label || "").trim();
            if (special) {
                lines.push([
                    csvValue(row.usercode || ""),
                    csvValue(row.name || row._employeeName || ""),
                    csvValue(row.work_date || ""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(special),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue(""),
                    csvValue("")
                ].join(","));
                return;
            }

            lines.push([
                csvValue(row.usercode || ""),
                csvValue(row.name || row._employeeName || ""),
                csvValue(row.work_date || ""),
                csvValue(row.morning_in || ""),
                csvValue(row.morning_out || ""),
                csvValue(row.afternoon_in || ""),
                csvValue(row.afternoon_out || ""),
                csvValue(row.ot_in || ""),
                csvValue(row.ot_out || ""),
                csvValue(rowWorkedMinutes(row)),
                csvValue(row.undertime_min || 0),
                csvValue(rowLateMinutes(row)),
                csvValue(rowDailyPay(row)),
                csvValue(row.per_hour || 0),
                csvValue(row.per_minute || 0),
                csvValue(row.ot_minutes || 0),
                csvValue(row.late_count ?? (rowLateMinutes(row) > 0 ? 1 : 0))
            ].join(","));
        });

        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = `${els.dateFrom?.value || today()}_${els.dateTo?.value || today()}`.replace(/-/g, "");
        link.href = url;
        link.download = `dtr_${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function csvValue(value) {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
    }

    function logout() {
        fetch(`${AUTH_API}?action=logout`, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders()
        }).catch(() => {
            /* noop */
        }).finally(() => {
            localStorage.removeItem("samelcii_session");
            localStorage.removeItem("samelcii_token");
            localStorage.removeItem("samelcii_user");
            window.location.href = "../../auth/index.html";
        });
    }

    function resetFilters() {
        if (els.dateFrom) {
            els.dateFrom.value = monthStart();
        }
        if (els.dateTo) {
            els.dateTo.value = today();
        }
        if (els.departmentFilter) {
            els.departmentFilter.value = "__ALL__";
        }
        if (els.employeeFilter) {
            els.employeeFilter.value = "";
        }
        if (els.employeeSearch) {
            els.employeeSearch.value = "";
        }
        if (els.pickerSearch) {
            els.pickerSearch.value = "";
        }
        if (els.includeWeekends) {
            els.includeWeekends.checked = true;
        }
        state.selectedUsercodes = new Set();
        state.pickerSelectedUsercodes = new Set();
        state.customSelection = false;
        state.rowCache.clear();
        renderEmployeeRoster();
        syncSelectionSummary();
        syncDatePanel();
        syncMonthYearFromDates();
        syncBadges();
    }

    function bindEvents() {
        if (els.monthSelect) {
            els.monthSelect.addEventListener("change", () => {
                applyMonthYearToDates();
                syncBadges();
                loadRows();
            });
        }

        if (els.yearSelect) {
            els.yearSelect.addEventListener("change", () => {
                applyMonthYearToDates();
                syncBadges();
                loadRows();
            });
        }

        if (els.departmentFilter) {
            els.departmentFilter.addEventListener("change", async () => {
                // ponytail: used to clear the row cache here, forcing a full per-employee refetch
                // on every department switch — that's the "long wait" this cache exists to avoid.
                // cacheKey() is per-usercode+date-range, so entries from other departments can't
                // collide; nothing to invalidate just because the dropdown changed.
                await loadDirectory({ preserveSelection: false });
                // loadDirectory selects the full department roster, but the sidebar only shows
                // privilege 5-10 staff (filteredRosterEmployees) — narrow the print selection to
                // match what's actually visible, same fix already used for search/area filter.
                reconcileSelectionToVisible();
            });
        }

        if (els.employeeFilter) {
            els.employeeFilter.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    loadDirectory({ preserveSelection: false });
                }
            });
            // ponytail: typing alone now searches (debounced) — Apply/Enter still work for anyone
            // who prefers to hit a button, but neither is required anymore.
            let employeeFilterTimer = null;
            els.employeeFilter.addEventListener("input", () => {
                clearTimeout(employeeFilterTimer);
                employeeFilterTimer = setTimeout(() => {
                    loadDirectory({ preserveSelection: false });
                }, 400);
            });
        }

        if (els.loadBtn) {
            els.loadBtn.addEventListener("click", () => {
                loadDirectory({ preserveSelection: false });
            });
        }

        if (els.updateDataBtn) {
            els.updateDataBtn.addEventListener("click", async () => {
                state.rowCache.clear();
                clearPersistedRows();
                await loadDirectory({ preserveSelection: true, force: true });
            });
        }

        if (els.pagePrev) {
            els.pagePrev.addEventListener("click", () => {
                if (state.currentPage > 0) {
                    state.currentPage -= 1;
                    loadRows();
                }
            });
        }

        if (els.pageNext) {
            els.pageNext.addEventListener("click", () => {
                state.currentPage += 1;
                loadRows();
            });
        }

        if (els.employeeSearch) {
            els.employeeSearch.addEventListener("input", () => {
                reconcileSelectionToVisible();
                renderEmployeeRoster();
            });
        }

        if (els.areaFilter) {
            els.areaFilter.addEventListener("change", () => {
                reconcileSelectionToVisible();
                renderEmployeeRoster();
            });
        }

        if (els.selectFiltered) {
            els.selectFiltered.addEventListener("click", () => {
                filteredRosterEmployees().forEach((employee) => state.selectedUsercodes.add(employee.usercode));
                state.customSelection = true;
                renderEmployeeRoster();
                syncSelectionSummary();
            });
        }

        if (els.employeeList) {
            els.employeeList.addEventListener("change", (event) => {
                const checkbox = event.target.closest("input[data-roster-usercode]");
                if (!checkbox) {
                    return;
                }
                const code = String(checkbox.getAttribute("data-roster-usercode") || "").trim();
                if (!code) {
                    return;
                }
                if (checkbox.checked) {
                    state.selectedUsercodes.add(code);
                } else {
                    state.selectedUsercodes.delete(code);
                }
                renderEmployeeRoster();
                syncSelectionSummary();
                loadRows();
            });

            // Roster-card signatory "Change/Assign"/"Remove" — must preventDefault before the
            // label's native click-forwards-to-checkbox behavior fires, or clicking it would also
            // toggle that employee's Include checkbox.
            els.employeeList.addEventListener("click", (event) => {
                const changeButton = event.target.closest("[data-roster-signatory-change]");
                const removeButton = event.target.closest("[data-roster-signatory-remove]");
                const button = changeButton || removeButton;
                if (!button) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (removeButton) {
                    removeRosterSignatory(removeButton.getAttribute("data-roster-signatory-remove") || "");
                    return;
                }
                const usercode = button.getAttribute("data-roster-signatory-change") || "";
                const node = button.closest(".dtr-roster-signatory");
                if (node) {
                    openRosterSignatoryEditor(node, usercode);
                }
            });
        }

        if (els.openEmployeePicker) {
            els.openEmployeePicker.addEventListener("click", openEmployeePicker);
        }

        [els.closeEmployeePicker, els.cancelEmployeePicker].forEach((button) => {
            button?.addEventListener("click", closeEmployeePicker);
        });

        if (els.pickerDepartment) {
            els.pickerDepartment.addEventListener("change", () => {
                resetBulkSignatoryEditor();
                renderEmployeePicker();
                renderPickerSelectionSignatories();
            });
        }

        // ponytail: signatory-panel controls (Change/Assign, Remove, result picks) are delegated
        // on the dialog itself instead of bound directly on each button — a direct binding on
        // #dtr-signatory-change went silently dead (no error, no effect) once, most likely a stale
        // reference to a detached node from an unrelated re-render. Delegation re-queries the live
        // DOM via closest() on every click, so it can't go stale the same way.
        if (els.employeePicker) {
            els.employeePicker.addEventListener("click", (event) => {
                if (event.target === els.employeePicker) {
                    closeEmployeePicker();
                    return;
                }
                if (event.target.closest("#dtr-signatory-change")) {
                    if (!els.signatorySearchBox) return;
                    const opening = els.signatorySearchBox.hidden;
                    els.signatorySearchBox.hidden = !opening;
                    if (els.signatoryCopy) els.signatoryCopy.hidden = opening;
                    if (opening) {
                        els.signatorySearchInput?.focus();
                    } else if (els.signatoryResults) {
                        els.signatoryResults.innerHTML = "";
                    }
                    return;
                }
                if (event.target.closest("#dtr-signatory-remove")) {
                    removeSignatory();
                    return;
                }
                const resultButton = event.target.closest("[data-signatory-usercode]");
                if (resultButton) {
                    assignSignatory(resultButton.getAttribute("data-signatory-usercode"));
                }
            });
            els.employeePicker.addEventListener("input", (event) => {
                if (!event.target.closest("#dtr-signatory-search-input")) return;
                clearTimeout(signatorySearchTimer);
                const q = event.target.value;
                signatorySearchTimer = setTimeout(() => searchSignatoryCandidates(q), 300);
            });
        }

        if (els.pickerSearch) {
            els.pickerSearch.addEventListener("input", renderEmployeePicker);
        }

        if (els.pickerSelectVisible) {
            els.pickerSelectVisible.addEventListener("click", () => {
                pickerFilteredEmployees().forEach((employee) => {
                    if (employee.usercode) {
                        state.pickerSelectedUsercodes.add(employee.usercode);
                    }
                });
                resetBulkSignatoryEditor();
                renderEmployeePicker();
                renderPickerSelectionSignatories();
            });
        }

        if (els.pickerClear) {
            els.pickerClear.addEventListener("click", () => {
                state.pickerSelectedUsercodes.clear();
                resetBulkSignatoryEditor();
                renderEmployeePicker();
                renderPickerSelectionSignatories();
            });
        }

        // Bulk signatory assign — candidate selection only stages a review. The existing bulk API
        // is called after Confirm change, so an approver result click cannot rewrite employees.
        if (els.bulkSignatoryInput) {
            let bulkSignatoryTimer = null;
            els.bulkSignatoryInput.addEventListener("input", () => {
                clearTimeout(bulkSignatoryTimer);
                const q = els.bulkSignatoryInput.value;
                bulkSignatoryTimer = setTimeout(async () => {
                    if (!els.bulkSignatoryResults) return;
                    if (!q || q.trim().length < 2) {
                        els.bulkSignatoryResults.innerHTML = "";
                        return;
                    }
                    els.bulkSignatoryResults.innerHTML = `<p style="padding:6px 10px;color:var(--hy-ink-soft,#6b7280);font-size:12px;">Searching...</p>`;
                    try {
                        await ensureSignatoryDirectory();
                        const employees = pickerSignatoryCandidates(q);
                        els.bulkSignatoryResults.innerHTML = employees.length
                            ? employees.slice(0, 20).map((employee) => `
                                <button type="button" class="dtr-signatory-result" data-bulk-signatory-pick="${escapeHtml(employee.usercode)}">
                                    <span class="dtr-signatory-avatar">${employee.profile_photo_url
                                        ? `<img src="${escapeHtml(employee.profile_photo_url)}" alt="" loading="lazy" />`
                                        : escapeHtml(initials(employee.name))}</span>
                                    <span>${escapeHtml(employee.name)} <small style="color:var(--hy-ink-soft,#6b7280);">${escapeHtml(employee.position || "")}</small></span>
                                </button>
                            `).join("")
                            : `<p style="padding:6px 10px;color:var(--hy-ink-soft,#6b7280);font-size:12px;">No employees found.</p>`;
                    } catch (error) {
                        els.bulkSignatoryResults.innerHTML = `<p style="padding:6px 10px;color:var(--dtr-danger,#b91c1c);font-size:12px;">${escapeHtml(error.message)}</p>`;
                    }
                }, 300);
            });
        }

        if (els.bulkSignatoryResults) {
            els.bulkSignatoryResults.addEventListener("click", (event) => {
                const button = event.target.closest("[data-bulk-signatory-pick]");
                if (!button) return;
                const approverUsercode = button.getAttribute("data-bulk-signatory-pick");
                const candidate = state.signatoryDirectory.find((employee) => employee.usercode === approverUsercode);
                stageBulkSignatory(candidate);
            });
        }

        if (els.bulkSignatoryReview) {
            els.bulkSignatoryReview.addEventListener("click", async (event) => {
                if (event.target.closest("[data-bulk-signatory-cancel]")) {
                    resetBulkSignatoryEditor();
                    return;
                }
                const save = event.target.closest("[data-bulk-signatory-save]");
                if (!save || !bulkSignatoryCandidate) return;
                const usercodes = currentBulkSignatoryTargets();
                if (!usercodes.length) return;
                save.disabled = true;
                try {
                    const result = await postJson("employee_signatory_set_bulk", {
                        usercodes,
                        approver_usercode: bulkSignatoryCandidate.usercode
                    }, API);
                    resetBulkSignatoryEditor();
                    await refreshPickerAfterSignatoryChange(result.message || `Signatory saved for ${usercodes.length} employee(s).`);
                } catch (error) {
                    save.disabled = false;
                    setMessage(error.message, "error");
                }
            });
        }

        if (els.pickerList) {
            els.pickerList.addEventListener("change", (event) => {
                const checkbox = event.target.closest("input[data-picker-usercode]");
                if (!checkbox) {
                    return;
                }
                const code = String(checkbox.getAttribute("data-picker-usercode") || "").trim();
                if (!code) {
                    return;
                }
                if (checkbox.checked) {
                    state.pickerSelectedUsercodes.add(code);
                } else {
                    state.pickerSelectedUsercodes.delete(code);
                }
                resetBulkSignatoryEditor();
                syncPickerSelectedCount();
                renderPickerSelectionSignatories();
            });
        }

        if (els.applyEmployeePicker) {
            els.applyEmployeePicker.addEventListener("click", async () => {
                els.applyEmployeePicker.disabled = true;
                els.applyEmployeePicker.setAttribute("aria-busy", "true");
                try {
                    await applyEmployeePicker();
                } finally {
                    els.applyEmployeePicker.disabled = false;
                    els.applyEmployeePicker.removeAttribute("aria-busy");
                }
            });
        }

        if (els.printBtn) {
            els.printBtn.addEventListener("click", printWithAudit);
        }

        if (els.finalizeBtn) {
            els.finalizeBtn.addEventListener("click", async () => {
                const dateFrom = els.dateFrom?.value || monthStart();
                const dateTo = els.dateTo?.value || today();
                els.finalizeBtn.disabled = true;
                els.finalizeBtn.textContent = "Finalizing...";
                setMessage(`Finalizing ${dateFrom} to ${dateTo} for all active employees — this can take a bit the first time...`, "");
                try {
                    const response = await fetch(`${API}?action=finalize_period`, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type": "application/json",
                            ...(localStorage.getItem("samelcii_token")?.split(".").length === 3
                                ? { Authorization: `Bearer ${localStorage.getItem("samelcii_token")}` }
                                : {})
                        },
                        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo })
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok || result.ok === false) {
                        throw new Error(result.message || "Unable to finalize this period.");
                    }
                    setMessage(`Finalized ${result.rows_inserted ?? 0} day-row(s) across ${result.employees ?? 0} employee(s). Reloading...`, "success");
                    state.rowCache.clear();
                    await loadRows();
                } catch (error) {
                    setMessage(error.message, "error");
                } finally {
                    els.finalizeBtn.disabled = false;
                    els.finalizeBtn.textContent = "Finalize this month";
                }
            });
        }

        if (els.scheduleBtn && els.scheduleDialog) {
            // ponytail: button stays hidden — removed from the toolbar by request. The click
            // handler below still works if a visible trigger is ever added back.
            els.scheduleBtn.addEventListener("click", () => {
                els.scheduleDialog.showModal();
                els.scheduleUsercode?.focus();
                if (els.scheduleUsercode?.value.trim()) {
                    loadScheduleHistory(els.scheduleUsercode.value.trim().toUpperCase());
                }
            });
        }

        if (els.closeScheduleDialog) {
            els.closeScheduleDialog.addEventListener("click", () => els.scheduleDialog?.close());
        }

        if (els.scheduleUsercode) {
            els.scheduleUsercode.addEventListener("change", () => {
                const usercode = els.scheduleUsercode.value.trim().toUpperCase();
                if (usercode) {
                    loadScheduleHistory(usercode);
                }
            });
        }

        if (els.scheduleForm) {
            els.scheduleForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const usercode = els.scheduleUsercode?.value.trim().toUpperCase();
                if (!usercode) {
                    if (els.scheduleMessage) els.scheduleMessage.textContent = "Enter an employee number first.";
                    return;
                }
                const saveBtn = document.getElementById("schedule-save");
                if (saveBtn) saveBtn.disabled = true;
                if (els.scheduleMessage) els.scheduleMessage.textContent = "Saving...";
                try {
                    await postJson("schedule_save", {
                        usercode,
                        am_start: els.scheduleAmStart?.value || "",
                        am_end: els.scheduleAmEnd?.value || "",
                        pm_start: els.schedulePmStart?.value || "",
                        pm_end: els.schedulePmEnd?.value || "",
                        effective_from: els.scheduleEffectiveFrom?.value || ""
                    });
                    if (els.scheduleMessage) els.scheduleMessage.textContent = "Schedule saved.";
                    els.scheduleForm.reset();
                    state.rowCache.clear();
                    await loadScheduleHistory(usercode);
                } catch (error) {
                    if (els.scheduleMessage) els.scheduleMessage.textContent = error.message;
                } finally {
                    if (saveBtn) saveBtn.disabled = false;
                }
            });
        }

        if (els.scheduleHistory) {
            els.scheduleHistory.addEventListener("click", async (event) => {
                const button = event.target.closest("[data-delete-schedule]");
                if (!button) {
                    return;
                }
                const id = button.getAttribute("data-delete-schedule");
                const usercode = els.scheduleUsercode?.value.trim().toUpperCase();
                button.disabled = true;
                try {
                    await postJson("schedule_delete", { id, usercode });
                    state.rowCache.clear();
                    await loadScheduleHistory(usercode);
                } catch (error) {
                    if (els.scheduleMessage) els.scheduleMessage.textContent = error.message;
                    button.disabled = false;
                }
            });
        }

        if (els.exportBtn) {
            els.exportBtn.addEventListener("click", async () => {
                if (!state.selectedUsercodes.size) {
                    setMessage("Select at least one employee before exporting.", "error");
                    return;
                }
                // Export always covers the full selection, independent of which page is on screen.
                // [FIX] force:true — same staleness risk as printing (see printWithAudit).
                const fullRows = await ensureFullRosterRows({ force: true });
                const rows = els.includeWeekends && !els.includeWeekends.checked
                    ? fullRows.filter((row) => {
                        const day = String(row.day_name || "").toLowerCase();
                        return day !== "saturday" && day !== "sunday";
                    })
                    : fullRows;
                downloadCsv(rows);
            });
        }

        if (els.logoutBtn) {
            els.logoutBtn.addEventListener("click", logout);
        }

        if (els.includeWeekends) {
            els.includeWeekends.addEventListener("change", loadRows);
        }

        if (els.body) {
            els.body.addEventListener("click", (event) => {
                const cell = event.target.closest("[data-day-punches]");
                if (cell) {
                    toggleDayPunches(cell);
                }
            });
        }

    }

    // ponytail: fire-and-forget — not awaited, doesn't block the grid. Nudges any recently-completed
    // day into dtr_final so the cache stays current even before the nightly 1AM job reaches it.
    // Safe to call as often as the page loads: finalizeRange refuses today/future dates and only
    // INSERT IGNOREs, so an already-frozen day is never touched.
    function refreshRecentFinalDays() {
        fetch(`${API}?action=refresh_recent`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                ...(localStorage.getItem("samelcii_token")?.split(".").length === 3
                    ? { Authorization: `Bearer ${localStorage.getItem("samelcii_token")}` }
                    : {})
            },
            body: JSON.stringify({ days: 3 })
        }).catch(() => {});
    }

    async function init() {
        state.sessionUser = getSession();
        syncLoggedUser(state.sessionUser);
        populateMonthYearControls();
        syncDatePanel();
        resetFilters();
        bindEvents();
        refreshRecentFinalDays();
        await loadDirectory({ preserveSelection: false });
    }

    init();
})();
