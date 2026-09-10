// Mobile approvals module ito; dito dumadaloy ang queue load at approve/reject actions.
(function () {
    /* SECTION: Session at API setup */
    const sessionRaw = localStorage.getItem("samelcii_session");
    let session = {};
    try {
        session = sessionRaw ? JSON.parse(sessionRaw) : {};
    } catch (_error) {
        session = {};
    }

    function canUseApprovals() {
        const raw = String(session.privilage || "");
        return raw.split("-").some((part) => {
            const n = Number(String(part).trim());
            return Number.isFinite(n) && n >= 6 && n <= 10;
        });
    }

    function denyAccess() {
        document.body.innerHTML = `
            <main class="approvals-page approvals-denied">
                <section class="approvals-hero approvals-hero--light">
                    <div class="approvals-hero-copy">
                        <p class="eyebrow">Access denied</p>
                        <h1>Approvers only</h1>
                        <p class="hero-subtitle">Mobile approvals is locked to privilege 6 to 10 accounts only.</p>
                    </div>
                    <div class="approvals-hero-meta">
                        <div class="meta-pill meta-pill--light">
                            <span class="meta-label">Current user</span>
                            <strong>${escapeHtml(session.username || session.usercode || "-")}</strong>
                        </div>
                        <div class="meta-pill meta-pill--light">
                            <span class="meta-label">Privilege</span>
                            <strong>${escapeHtml(session.privilage || "-")}</strong>
                        </div>
                    </div>
                </section>
                <section class="approvals-panel approvals-panel--notice">
                    <p class="notice-text">You do not have access to this mobile approval desk. If you need approval access, sign in with an approver account.</p>
                    <a class="footer-link" href="../../dashboard/index.html">Back to dashboard</a>
                </section>
            </main>
        `;
    }

    if (!canUseApprovals()) {
        const nextUrl = encodeURIComponent("../../pages/modules/mobile-approvals/index.html");
        window.location.href = `../../auth/mobile.html?next=${nextUrl}`;
        return;
    }

    const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
    const FUEL_API = `${NODE_API_BASE}/fuel`;
    const EPASS_API = `${NODE_API_BASE}/epass`;
    const TRAVEL_API = `${NODE_API_BASE}/travel`;
    const LEAVE_API = `${NODE_API_BASE}/leave`;

    function getAuthHeaders(extraHeaders = {}) {
        const headers = { ...extraHeaders };
        const token = localStorage.getItem("samelcii_token");
        if (token) {
            if (token.split(".").length === 3) {
                headers.Authorization = `Bearer ${token}`;
            } else {
                localStorage.removeItem("samelcii_token");
            }
        }
        return headers;
    }

    const state = {
        activeTab: "fuel",
        mode: "pending",
        search: "",
        selectedDate: "",
        loading: false,
        selected: null,
        queueOrder: {},
        queueOrderSeq: 0,
        queues: {
            fuel: [],
            epass: [],
            travel: [],
            leave: [],
        },
        lastLoadedAt: null,
    };

    state.selectedDate = todayDateKey();

    const tabMeta = {
        fuel: {
            label: "Fuel",
            typeClass: "type-badge--fuel",
        },
        epass: {
            label: "EPASS",
            typeClass: "type-badge--epass",
        },
        travel: {
            label: "Travel",
            typeClass: "type-badge--travel",
        },
        leave: {
            label: "Leave",
            typeClass: "type-badge--leave",
        },
    };

    /* SECTION: Helpers */
    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function qs(id) {
        return document.getElementById(id);
    }

    function todayDateKey() {
        return formatDateKey(new Date());
    }

    function formatDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function parseDateKey(value) {
        const raw = String(value ?? "").trim();
        if (!raw) {
            return "";
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return raw;
        }
        const parsed = Date.parse(raw);
        if (!Number.isFinite(parsed)) {
            return "";
        }
        return formatDateKey(new Date(parsed));
    }

    function selectedDateParts() {
        const source = String(state.selectedDate || todayDateKey());
        const parts = source.split("-");
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const day = Number(parts[2]);
        const now = new Date();
        return {
            year: Number.isFinite(year) ? year : now.getFullYear(),
            month: Number.isFinite(month) ? month : now.getMonth() + 1,
            day: Number.isFinite(day) ? day : now.getDate(),
        };
    }

    function selectedDateLabel() {
        const parts = selectedDateParts();
        const date = new Date(parts.year, parts.month - 1, parts.day);
        return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    }

    function updateDateLabel() {
        const node = qs("current-date-label");
        if (node) {
            node.textContent = selectedDateLabel();
        }
    }

    function toast(message, isError = false) {
        const el = qs("approval-toast");
        if (!el) {
            return;
        }
        el.textContent = message;
        el.style.background = isError ? "rgba(163, 31, 31, 0.94)" : "rgba(15, 23, 42, 0.92)";
        el.classList.add("show");
        window.clearTimeout(toast.hideTimer);
        toast.hideTimer = window.setTimeout(() => {
            el.classList.remove("show");
        }, 2600);
    }

    function setBusy(isBusy, message) {
        state.loading = isBusy;
        const status = qs("queue-status");
        const refresh = qs("refresh-queue-btn");
        if (status) {
            status.textContent = message || (isBusy ? "Loading queue..." : "Queue ready.");
        }
        if (refresh) {
            refresh.disabled = isBusy;
        }
        document.querySelectorAll(".nav-btn").forEach((btn) => {
            btn.disabled = isBusy;
        });
    }

    function currentTabLabel() {
        if (state.activeTab === "all") {
            return "All";
        }
        return tabMeta[state.activeTab]?.label || "Fuel";
    }

    function statusInfo(tab, value) {
        const raw = String(value ?? "");
        if (tab === "fuel") {
            if (raw === "1") return { label: "Approved", className: "approved" };
            if (raw === "3") return { label: "Rejected", className: "rejected" };
            return { label: "Pending", className: "pending" };
        }
        if (raw === "2") return { label: "Approved", className: "approved" };
        if (raw === "3") return { label: "Rejected", className: "rejected" };
        return { label: "Pending", className: "pending" };
    }

    function requestNumber(tab, item) {
        if (tab === "fuel") return String(item.FARCode || "").trim();
        if (tab === "epass") return String(item.epassnumber || "").trim();
        if (tab === "leave") return String(item.leave_id || "").trim();
        return String(item.to_number || "").trim();
    }

    function requestTitle(tab, item) {
        if (tab === "leave") {
            return String(item.tracking_no || item.leave_id || "").trim();
        }
        return requestNumber(tab, item);
    }

    function requestRequester(tab, item) {
        return [
            String(item.requester_name || item.EmployeeName || "").trim(),
            String(item.usercode || item.UserCode || "").trim(),
        ].filter(Boolean).join(" - ");
    }

    function requestDepartment(item) {
        return String(item.department || item.EmployeeDeptAbbr || "").trim();
    }

    function requestDateText(tab, item) {
        if (tab === "fuel") return String(item.PresRequestDate || item.request_date || item.date || "").trim();
        if (tab === "leave") return String(item.request_date || item.date || "").trim();
        return String(item.date || item.request_date || "").trim();
    }

    function requestDateSort(tab, item) {
        const raw = requestDateText(tab, item);
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        const fallback = String(item.Id || item.sort_id || "0").trim();
        return Number.parseInt(fallback, 10) || 0;
    }

    function requestDateKey(tab, item) {
        return parseDateKey(requestDateText(tab, item));
    }

    function requestBodyRows(tab, item) {
        const rows = [];
        if (tab === "fuel") {
            rows.push({ label: "Date", value: item.PresRequestDate || "-" });
            rows.push({ label: "FAR Code", value: item.FARCode || "-" });
            rows.push({ label: "Employee", value: requestRequester(tab, item) || "-" });
            rows.push({ label: "Dept", value: [item.EmployeeDeptAbbr, item.EmployeeDepartmentName].filter(Boolean).join(" - ") || "-" });
            rows.push({ label: "Vehicle", value: item.Vehicle || "-" });
            rows.push({ label: "Liters", value: item.ReqAmt || "-" });
            rows.push({ label: "Station", value: item.fuelstation || "-" });
            rows.push({ label: "Purpose", value: item.Purpose || "-" });
            rows.push({ label: "EPASS", value: item.FuelEpassNumber || "Create first" });
            rows.push({ label: "Approved By", value: item.ApprovedByName || item.ApprovedBy || "-" });
            rows.push({ label: "Balance", value: item.Balance || "-" });
        } else if (tab === "epass") {
            rows.push({ label: "Date", value: item.date || "-" });
            rows.push({ label: "EPASS No.", value: item.epassnumber || "-" });
            rows.push({ label: "Requester", value: requestRequester(tab, item) || "-" });
            rows.push({ label: "Department", value: item.department || "-" });
            rows.push({ label: "Destination", value: item.destination || "-" });
            rows.push({ label: "Purpose", value: item.purpose || "-" });
            rows.push({ label: "Approved By", value: item.approver_name || item.approved_by || "-" });
        } else if (tab === "leave") {
            rows.push({ label: "Date Filed", value: item.date || "-" });
            rows.push({ label: "Tracking No.", value: item.tracking_no || "-" });
            rows.push({ label: "Requester", value: requestRequester(tab, item) || "-" });
            rows.push({ label: "Department", value: item.department || "-" });
            rows.push({ label: "Leave Type", value: item.leave_type || "-" });
            rows.push({ label: "Date Range", value: item.date_range || "-" });
            rows.push({ label: "Days", value: item.days || "-" });
            rows.push({ label: "Purpose", value: item.purpose || "-" });
            rows.push({ label: "Approved By", value: item.approver_name || item.approved_by || "-" });
        } else {
            rows.push({ label: "Date", value: item.date || "-" });
            rows.push({ label: "Travel No.", value: item.to_number || "-" });
            rows.push({ label: "Requester", value: requestRequester(tab, item) || "-" });
            rows.push({ label: "Department", value: item.department || "-" });
            rows.push({ label: "Destination", value: item.destination || "-" });
            rows.push({ label: "Purpose", value: item.purpose || "-" });
            rows.push({ label: "Approved By", value: item.approver_name || item.approved_by || "-" });
        }
        return rows;
    }

    function requestShortMeta(tab, item) {
        const rows = [];
        rows.push(requestDateText(tab, item) || "-");
        const dept = requestDepartment(item);
        if (dept) {
            rows.push(dept);
        }
        return rows.join(" • ");
    }

    function queueEntry(tab, item) {
        return {
            tab,
            item,
            sort: requestDateSort(tab, item),
            order: rememberQueueOrder(tab, item),
        };
    }

    /* SECTION: Order memory */
    function queueOrderKey(tab, item) {
        const number = requestNumber(tab, item);
        if (number) {
            return `${tab}:${number}`;
        }
        const fallback = [
            item.Id,
            item.id,
            item.FARCode,
            item.epassnumber,
            item.to_number,
            item.date,
            item.request_date,
        ].find((value) => String(value ?? "").trim());
        return `${tab}:${String(fallback || Math.random()).trim()}`;
    }

    function rememberQueueOrder(tab, item) {
        const key = queueOrderKey(tab, item);
        if (!Object.prototype.hasOwnProperty.call(state.queueOrder, key)) {
            state.queueOrder[key] = state.queueOrderSeq += 1;
        }
        return state.queueOrder[key];
    }

    function requestStatusRaw(tab, item) {
        if (tab === "fuel") {
            return String(item.Status ?? item.status ?? "");
        }
        return String(item.status ?? item.Status ?? "");
    }

    function renderDetailRows(rows) {
        return rows.map((row) => `
            <div class="detail-row">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(row.value)}</strong>
            </div>
        `).join("");
    }

    function queueItems(tab) {
        return (state.queues[tab] || []).filter((item) => {
            const haystack = [
                requestNumber(tab, item),
                requestRequester(tab, item),
                requestDepartment(item),
                item.destination,
                item.purpose,
                item.Purpose,
                item.leave_type,
                item.tracking_no,
                item.date_range,
                item.fuelstation,
                item.Vehicle,
            ].join(" ").toLowerCase();
            const matchesDate = !state.selectedDate || requestDateKey(tab, item) === state.selectedDate;
            return matchesDate && (!state.search || haystack.includes(state.search));
        });
    }

    function queueEntries(tab) {
        return queueItems(tab).map((item) => queueEntry(tab, item));
    }

    function pendingQueueEntries(tab) {
        return pendingOnlyQueue(tab).map((item) => queueEntry(tab, item));
    }

    function allQueueEntries() {
        return ["fuel", "epass", "travel", "leave"].flatMap((tab) => queueItems(tab).map((item) => queueEntry(tab, item)));
    }

    function pendingOnlyQueue(tab) {
        return queueItems(tab).filter((item) => {
            const status = requestStatusRaw(tab, item);
            if (tab === "fuel") {
                return status === "2";
            }
            if (tab === "leave") {
                return status === "1";
            }
            return status === "1";
        });
    }

    function renderCounts() {
        const fuelCount = state.queues.fuel.length;
        const epassCount = state.queues.epass.length;
        const travelCount = state.queues.travel.length;
        const leaveCount = state.queues.leave.length;
        const total = fuelCount + epassCount + travelCount + leaveCount;
        const nodes = {
            fuel: qs("fuel-count"),
            epass: qs("epass-count"),
            travel: qs("travel-count"),
            leave: qs("leave-count"),
            total: qs("queue-total"),
        };
        if (nodes.fuel) nodes.fuel.textContent = String(fuelCount);
        if (nodes.epass) nodes.epass.textContent = String(epassCount);
        if (nodes.travel) nodes.travel.textContent = String(travelCount);
        if (nodes.leave) nodes.leave.textContent = String(leaveCount);
        if (nodes.total) nodes.total.textContent = String(total);
    }

    function renderQueue() {
        const list = qs("queue-list");
        const summaryCopy = qs("queue-summary-copy");
        const chip = qs("current-tab-chip");
        const summary = qs("queue-summary");
        const items = state.mode === "all" ? allQueueEntries() : pendingQueueEntries(state.activeTab);
        const showSummary = !state.search;
        const dateLabel = selectedDateLabel();
        const isToday = state.selectedDate === todayDateKey();
        if (chip) {
            chip.textContent = isToday ? "Today" : dateLabel;
            chip.hidden = !showSummary;
        }
        updateDateLabel();
        if (summaryCopy) {
            if (state.mode === "all") {
                summaryCopy.textContent = state.search
                    ? `Showing ${items.length} result(s) for "${state.search}".`
                    : `Showing ${items.length} request(s) for ${dateLabel}.`;
            } else {
                summaryCopy.textContent = state.search
                    ? `Showing ${items.length} result(s) for "${state.search}".`
                    : `Showing ${items.length} pending ${currentTabLabel().toLowerCase()} request(s) for ${dateLabel}.`;
            }
            summaryCopy.hidden = !showSummary;
        }
        if (summary) {
            summary.hidden = !showSummary;
        }
        if (!list) {
            return;
        }
        if (!items.length) {
            list.innerHTML = `
                <div class="queue-empty">
                    <strong>No ${state.mode === "all" ? "request" : "pending"} ${state.mode === "all" ? "items" : currentTabLabel()} found</strong>
                    <span>${state.search ? "Try a different search term." : "This queue is clear for now."}</span>
                </div>
            `;
            return;
        }

        list.innerHTML = items
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((entry) => {
            const tab = entry.tab || state.activeTab;
            const item = entry.item || entry;
            const number = requestNumber(tab, item);
            const title = requestTitle(tab, item);
            const status = statusInfo(tab, requestStatusRaw(tab, item));
            const meta = tabMeta[tab];
            const requester = requestRequester(tab, item) || "No requester listed";
            const summary = requestShortMeta(tab, item) || "-";
            return `
                <article class="approval-card card border-0 rounded-4 shadow-sm" data-tab="${escapeHtml(tab)}" data-number="${escapeHtml(number)}" role="button" tabindex="0">
                    <div class="card-body p-2">
                        <div class="approval-card__row">
                            <div class="approval-card__main">
                                <span class="type-badge ${meta.typeClass}">${meta.label}</span>
                                <div class="approval-card__copy">
                                    <h3>${escapeHtml(title || "-")}</h3>
                                    <p>${escapeHtml(requester)}</p>
                                </div>
                            </div>
                            <span class="status-chip ${status.className}">${escapeHtml(status.label)}</span>
                        </div>
                        <div class="approval-card__summary">
                            <span class="queue-card-meta__item">${escapeHtml(summary)}</span>
                            <span class="queue-card-meta__item">${escapeHtml(tab.toUpperCase())}</span>
                        </div>
                        <div class="queue-card-hint">Tap for details</div>
                    </div>
                </article>
            `;
        }).join("");
    }

    function findQueueItem(tab, number) {
        return (state.queues[tab] || []).find((row) => requestNumber(tab, row) === number) || null;
    }

    function showDetailModal(tab, number) {
        const item = findQueueItem(tab, number);
        const modal = qs("approval-detail-modal");
        const type = qs("detail-type");
        const numberEl = qs("detail-number");
        const requester = qs("detail-requester");
        const statusEl = qs("detail-status");
        const dateEl = qs("detail-date");
        const rowsEl = qs("detail-rows");
        const approveBtn = qs("detail-approve-btn");
        const rejectBtn = qs("detail-reject-btn");
        if (!modal || !item || !type || !numberEl || !requester || !statusEl || !dateEl || !rowsEl || !approveBtn || !rejectBtn) {
            return;
        }

        const status = statusInfo(tab, requestStatusRaw(tab, item));
        state.selected = { tab, number };

        type.textContent = (tabMeta[tab]?.label || "Request").toUpperCase();
        numberEl.textContent = requestTitle(tab, item) || "-";
        requester.textContent = requestRequester(tab, item) || "No requester listed";
        statusEl.textContent = status.label;
        statusEl.className = `status-chip ${status.className}`;
        dateEl.textContent = requestDateText(tab, item) || "-";
        rowsEl.innerHTML = renderDetailRows(requestBodyRows(tab, item));

        const canApprove = status.className === "pending";
        approveBtn.disabled = !canApprove;
        rejectBtn.disabled = !canApprove;
        modal.hidden = false;
        modal.classList.add("show");
        document.body.classList.add("modal-open");
    }

    function hideDetailModal() {
        const modal = qs("approval-detail-modal");
        if (!modal) {
            return;
        }
        state.selected = null;
        modal.classList.remove("show");
        modal.hidden = true;
        document.body.classList.remove("modal-open");
    }

    /* SECTION: API loaders */
    async function loadFuelQueue() {
        const dateParts = selectedDateParts();
        const params = new URLSearchParams({
            action: "history",
            all: "1",
            orgwide: "1",
            limit: state.mode === "pending" ? "50" : "100",
            year: String(dateParts.year),
            month: String(dateParts.month),
            day: String(dateParts.day),
        });
        const response = await fetch(`${FUEL_API}?${params.toString()}`, { credentials: "same-origin", headers: getAuthHeaders() });
        const payload = await response.json().catch(() => ({ ok: false, items: [] }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Unable to load fuel queue.");
        }
        state.queues.fuel = payload.items || [];
    }

    async function loadEpassQueue() {
        const dateParts = selectedDateParts();
        const params = new URLSearchParams({
            action: state.mode === "pending" ? "pending" : "all",
            limit: state.mode === "pending" ? "50" : "100",
            year: String(dateParts.year),
            month: String(dateParts.month),
            day: String(dateParts.day),
        });
        const response = await fetch(`${EPASS_API}?${params.toString()}`, { credentials: "same-origin", headers: getAuthHeaders() });
        const payload = await response.json().catch(() => ({ ok: false, items: [] }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Unable to load EPASS queue.");
        }
        state.queues.epass = payload.items || [];
    }

    async function loadTravelQueue() {
        const dateParts = selectedDateParts();
        const params = new URLSearchParams({
            action: state.mode === "pending" ? "pending" : "all",
            limit: state.mode === "pending" ? "50" : "100",
            year: String(dateParts.year),
            month: String(dateParts.month),
            day: String(dateParts.day),
        });
        const response = await fetch(`${TRAVEL_API}?${params.toString()}`, { credentials: "same-origin", headers: getAuthHeaders() });
        const payload = await response.json().catch(() => ({ ok: false, items: [] }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Unable to load travel queue.");
        }
        state.queues.travel = payload.items || [];
    }

    async function loadLeaveQueue() {
        // HUWAG BAGUHIN: Leave uses row Id for actions because trackingNo can be duplicated in legacy data.
        const dateParts = selectedDateParts();
        const params = new URLSearchParams({
            action: state.mode === "pending" ? "pending" : "all",
            limit: state.mode === "pending" ? "50" : "100",
            year: String(dateParts.year),
            month: String(dateParts.month),
        });
        if (state.mode !== "pending") {
            params.set("day", String(dateParts.day));
        }
        const response = await fetch(`${LEAVE_API}?${params.toString()}`, { credentials: "same-origin", headers: getAuthHeaders() });
        const payload = await response.json().catch(() => ({ ok: false, items: [] }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Unable to load leave queue.");
        }
        state.queues.leave = payload.items || [];
    }

    async function refreshAllQueues() {
        setBusy(true, "Refreshing approval queues...");
        try {
            const results = await Promise.allSettled([loadFuelQueue(), loadEpassQueue(), loadTravelQueue(), loadLeaveQueue()]);
            const failures = results
                .filter((result) => result.status === "rejected")
                .map((result) => result.reason?.message || "Queue load failed");
            state.lastLoadedAt = new Date();
            renderCounts();
            renderQueue();
            if (failures.length) {
                setBusy(false, `${failures[0]} Showing the queues that loaded.`);
                toast(failures[0], true);
                return;
            }
            setBusy(false, `Updated ${state.lastLoadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
        } catch (error) {
            setBusy(false, error.message || "Unable to refresh queue.");
            toast(error.message || "Unable to refresh queue.", true);
        }
    }

    /* SECTION: Actions */
    async function updateFuelStatus(farCode, status, fuelEpassNumber = "") {
        const formData = new URLSearchParams();
        formData.append("farCode", farCode);
        formData.append("status", String(status));
        if (fuelEpassNumber) {
            formData.append("fuelEpassNumber", fuelEpassNumber);
        }
        const response = await fetch(`${FUEL_API}?action=update_status`, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders(),
            body: formData,
        });
        const payload = await response.json().catch(() => ({ ok: false, message: "Invalid fuel response." }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Fuel approval failed.");
        }
        return payload;
    }

    async function updateEpassStatus(epassnumber, status) {
        const formData = new URLSearchParams();
        formData.append("epassnumber", epassnumber);
        formData.append("status", String(status));
        const response = await fetch(`${EPASS_API}?action=update_status`, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders(),
            body: formData,
        });
        const payload = await response.json().catch(() => ({ ok: false, message: "Invalid EPASS response." }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "EPASS approval failed.");
        }
        return payload;
    }

    async function updateTravelStatus(toNumber, status) {
        const formData = new URLSearchParams();
        formData.append("to_number", toNumber);
        formData.append("status", String(status));
        const response = await fetch(`${TRAVEL_API}?action=update_status`, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders(),
            body: formData,
        });
        const payload = await response.json().catch(() => ({ ok: false, message: "Invalid travel response." }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Travel approval failed.");
        }
        return payload;
    }

    async function updateLeaveStatus(leaveId, status) {
        const formData = new URLSearchParams({ leave_id: leaveId, status: String(status) });
        const response = await fetch(`${LEAVE_API}?action=update_status`, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }),
            body: formData.toString(),
        });
        const payload = await response.json().catch(() => ({ ok: false, message: "Invalid leave response." }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Leave approval failed.");
        }
        return payload;
    }

    async function approveOrReject(tab, number, nextStatus) {
        const item = (state.queues[tab] || []).find((row) => requestNumber(tab, row) === number);
        if (!item) {
            toast("Request no longer available.", true);
            return false;
        }

        const tabLabel = tabMeta[tab]?.label || currentTabLabel();
        const actionLabel = nextStatus === 1 || nextStatus === 2 ? "approve" : "reject";
        const ok = window.confirm(`Do you want to ${actionLabel} ${tabLabel} ${number}?`);
        if (!ok) {
            return false;
        }

        try {
            setBusy(true, `Updating ${tabLabel} ${number}...`);
            if (tab === "fuel") {
                await updateFuelStatus(number, nextStatus, String(item.FuelEpassNumber || item.epassID || "").trim());
            } else if (tab === "epass") {
                await updateEpassStatus(number, nextStatus);
            } else if (tab === "leave") {
                await updateLeaveStatus(number, nextStatus);
            } else {
                await updateTravelStatus(number, nextStatus);
            }
            toast(`${tabLabel} ${number} ${nextStatus === 1 || nextStatus === 2 ? "approved" : "rejected"}.`);
            await refreshAllQueues();
            return true;
        } catch (error) {
            setBusy(false, error.message || "Approval update failed.");
            toast(error.message || "Approval update failed.", true);
            return false;
        }
    }

    function logout() {
        fetch(`${NODE_API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders()
        }).catch(() => {
            /* noop */
        }).finally(() => {
            localStorage.removeItem("samelcii_session");
            localStorage.removeItem("samelcii_token");
            localStorage.removeItem("samelcii_user");
            window.location.href = "../../auth/mobile.html";
        });
    }

    function syncNavigation() {
        document.querySelectorAll(".nav-btn[data-tab]").forEach((button) => {
            const tab = button.getAttribute("data-tab") || "fuel";
            const active = state.mode === "all" ? tab === "all" : tab === state.activeTab;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    /* SECTION: Events */
    function bindEvents() {
        document.querySelectorAll(".nav-btn[data-tab]").forEach((button) => {
            button.addEventListener("click", () => {
                const nextTab = button.getAttribute("data-tab") || "fuel";
                if (nextTab === "all") {
                    state.mode = "all";
                    state.activeTab = "all";
                } else {
                    state.mode = "pending";
                    state.activeTab = nextTab;
                }
                syncNavigation();
                void refreshAllQueues();
            });
        });

        const search = qs("queue-search");
        const dateInput = qs("queue-date");
        if (search) {
            let timer = null;
            search.addEventListener("input", () => {
                window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    state.search = search.value.trim().toLowerCase();
                    renderQueue();
                }, 140);
            });
        }
        if (dateInput) {
            dateInput.value = state.selectedDate;
            dateInput.addEventListener("change", () => {
                state.selectedDate = parseDateKey(dateInput.value) || todayDateKey();
                updateDateLabel();
                renderQueue();
                void refreshAllQueues();
            });
        }

        const refresh = qs("refresh-queue-btn");
        const logoutBtn = qs("logout-btn");
        if (refresh) {
            refresh.addEventListener("click", () => {
                void refreshAllQueues();
            });
        }
        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => {
                logout();
            });
        }

        const list = qs("queue-list");
        if (list) {
            list.addEventListener("click", (event) => {
                const card = event.target.closest(".approval-card");
                if (card && !event.target.closest("button")) {
                    const tab = card.getAttribute("data-tab") || "all";
                    const number = card.getAttribute("data-number") || "";
                    showDetailModal(tab, number);
                    return;
                }
            });

            list.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }
                const card = event.target.closest(".approval-card");
                if (!card) {
                    return;
                }
                event.preventDefault();
                const tab = card.getAttribute("data-tab") || "all";
                const number = card.getAttribute("data-number") || "";
                showDetailModal(tab, number);
            });
        }

        const modal = qs("approval-detail-modal");
        const closeBtn = qs("approval-detail-close");
        const approveBtn = qs("detail-approve-btn");
        const rejectBtn = qs("detail-reject-btn");
        if (modal) {
            modal.addEventListener("click", (event) => {
                if (event.target && event.target.getAttribute && event.target.getAttribute("data-modal-close")) {
                    hideDetailModal();
                }
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener("click", hideDetailModal);
        }
        if (approveBtn) {
            approveBtn.addEventListener("click", () => {
                if (!state.selected) {
                    return;
                }
                const next = state.selected.tab === "fuel" ? 1 : 2;
                void (async () => {
                    const done = await approveOrReject(state.selected.tab, state.selected.number, next);
                    if (done) {
                        hideDetailModal();
                    }
                })();
            });
        }
        if (rejectBtn) {
            rejectBtn.addEventListener("click", () => {
                if (!state.selected) {
                    return;
                }
                void (async () => {
                    const done = await approveOrReject(state.selected.tab, state.selected.number, 3);
                    if (done) {
                        hideDetailModal();
                    }
                })();
            });
        }

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                hideDetailModal();
            }
        });
    }

    /* SECTION: Bootstrap */
    document.addEventListener("DOMContentLoaded", () => {
        bindEvents();
        syncNavigation();
        const loggedUser = qs("logged-user");
        if (loggedUser) {
            loggedUser.textContent = session.username || session.usercode || "-";
        }
        updateDateLabel();
        void refreshAllQueues();
    });
})();

