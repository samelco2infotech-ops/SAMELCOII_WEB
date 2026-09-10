/* ============================================================
   FILE: script.js
   PURPOSE: Holiday list, recommendations, paging, at Add/Edit save flow.
   EDIT GUIDE: API URLs at PAGE_SIZE lang ang karaniwang ina-adjust.
   HUWAG BAGUHIN: Panatilihin ang sanitized rendering at save/delete confirmation flow.
   ============================================================ */
(function () {
    const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
    const API = `${NODE_API_BASE}/holiday`;
    const RECOMMEND_API = `${NODE_API_BASE}/holiday_recommendations`;

    const PAGE_SIZE = 10;
    let allItems = [];
    let currentPage = 1;
    let recommendTemplates = [];

    const els = {
        formPanel: document.getElementById("holiday-form-panel"),
        formTitle: document.getElementById("holiday-form-title"),
        id: document.getElementById("holiday-id"),
        name: document.getElementById("holiday-name"),
        date: document.getElementById("holiday-date"),
        type: document.getElementById("holiday-type"),
        coverage: document.getElementById("holiday-coverage"),
        coverageField: document.getElementById("holiday-coverage-field"),
        moreToggle: document.getElementById("holiday-more-toggle"),
        atc: document.getElementById("holiday-atc"),
        saveBtn: document.getElementById("holiday-save-btn"),
        cancelBtn: document.getElementById("holiday-cancel-btn"),
        formMessage: document.getElementById("holiday-form-message"),
        listMessage: document.getElementById("holiday-list-message"),
        body: document.getElementById("holiday-table-body"),
        pager: document.getElementById("holiday-pager"),
        pagerPrev: document.getElementById("holiday-pager-prev"),
        pagerNext: document.getElementById("holiday-pager-next"),
        pagerStatus: document.getElementById("holiday-pager-status"),
        recommendChips: document.getElementById("holiday-recommend-chips")
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getAuthHeaders(extra = {}) {
        const token = localStorage.getItem("samelcii_token");
        const headers = { ...extra };
        if (token && token.split(".").length === 3) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    async function request(action, { method = "GET", params = {}, body } = {}) {
        const url = new URL(API, window.location.href);
        url.searchParams.set("action", action);
        if (method === "GET") {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && String(value).trim() !== "") {
                    url.searchParams.set(key, String(value));
                }
            });
        }
        const options = { method, credentials: "same-origin", headers: getAuthHeaders() };
        if (method !== "GET") {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body || {});
        }
        const response = await fetch(url.toString(), options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
            throw new Error(payload.message || `Request failed (${response.status})`);
        }
        return payload;
    }

    async function recommendRequest(action, { method = "GET", params = {}, body } = {}) {
        const url = new URL(RECOMMEND_API, window.location.href);
        url.searchParams.set("action", action);
        if (method === "GET") {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && String(value).trim() !== "") {
                    url.searchParams.set(key, String(value));
                }
            });
        }
        const options = { method, credentials: "same-origin", headers: getAuthHeaders() };
        if (method !== "GET") {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body || {});
        }
        const response = await fetch(url.toString(), options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
            throw new Error(payload.message || `Request failed (${response.status})`);
        }
        return payload;
    }

    function dateParts(value) {
        const iso = String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0];
        if (!iso) return { month: "--", day: "-", full: "-", weekday: "" };
        const d = new Date(`${iso}T00:00:00Z`);
        return {
            month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
            day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" }),
            full: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
            weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
        };
    }

    function typeSlug(type) {
        return String(type || "").toLowerCase().startsWith("special") ? "special" : "regular";
    }

    function coverageLabel(portion) {
        return portion === "AM" ? "AM" : portion === "PM" ? "PM" : "";
    }

    // Upcoming holidays muna (nearest first), tapos recent past (newest first).
    // [LOGIC] Pinananatiling magkakasunod ang latest year bago lumabas ang lumang 2025 records.
    function sortAroundToday(items) {
        const todayIso = today();
        const upcoming = items.filter((item) => (item.holiday_date || "").slice(0, 10) >= todayIso);
        const past = items.filter((item) => (item.holiday_date || "").slice(0, 10) < todayIso);
        upcoming.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
        past.sort((a, b) => b.holiday_date.localeCompare(a.holiday_date));
        return [...upcoming, ...past];
    }

    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    function renderRows(items) {
        if (!els.body) return;
        if (!items.length) {
            els.body.innerHTML = `<tr><td colspan="5">No holidays found.</td></tr>`;
            return;
        }
        const isoDate = (value) => String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
        const todayIso = today();
        els.body.innerHTML = items.map((item) => {
            const parts = dateParts(item.holiday_date);
            const type = typeSlug(item.holiday_type);
            const atcOn = Number(item.atc) === 1;
            const coverage = coverageLabel(item.day_portion);
            const upcoming = isoDate(item.holiday_date) >= todayIso;
            return `
            <tr data-id="${item.id}" data-date="${isoDate(item.holiday_date)}" data-name="${escapeHtml(item.holiday_name)}" data-type="${escapeHtml(item.holiday_type)}" data-atc="${atcOn ? 1 : 0}" data-coverage="${escapeHtml(item.day_portion || "WHOLE")}" data-upcoming="${upcoming}">
                <td>
                    <div class="holiday-date-cell">
                        <span class="holiday-daytile" data-type="${type}"><em>${parts.month}</em><b>${parts.day}</b></span>
                        <span class="holiday-date-text"><strong>${parts.full}</strong><small>${parts.weekday}</small></span>
                    </div>
                </td>
                <td>${escapeHtml(item.holiday_name)}</td>
                <td><span class="holiday-type-badge" data-type="${type}">${escapeHtml(item.holiday_type)}</span>${coverage ? `<span class="holiday-coverage-tag">${coverage}</span>` : ""}</td>
                <td><span class="holiday-atc" data-on="${atcOn}"><i></i>${atcOn ? "Yes" : "No"}</span></td>
                <td>
                    <div class="holiday-row-actions">
                        <button class="btn light holiday-icon-btn holiday-edit-btn" type="button" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.holiday_name)}" title="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn light holiday-icon-btn holiday-delete-btn" type="button" data-id="${item.id}" aria-label="Delete ${escapeHtml(item.holiday_name)}" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join("");
    }

    function renderPage() {
        const pageCount = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
        currentPage = Math.min(Math.max(1, currentPage), pageCount);
        const start = (currentPage - 1) * PAGE_SIZE;
        renderRows(allItems.slice(start, start + PAGE_SIZE));
        renderRecommendChips();

        els.pager.hidden = allItems.length <= PAGE_SIZE;
        els.pagerStatus.textContent = `Page ${currentPage} of ${pageCount}`;
        els.pagerPrev.disabled = currentPage <= 1;
        els.pagerNext.disabled = currentPage >= pageCount;
    }

    async function loadList() {
        els.listMessage.textContent = "Loading...";
        els.listMessage.className = "message";
        try {
            const year = new Date().getFullYear();
            const payload = await request("list", { params: { from: `${year - 1}-01-01`, to: `${year + 1}-12-31` } });
            allItems = sortAroundToday(payload.items || []);
            currentPage = 1;
            renderPage();
            els.listMessage.textContent = "";
        } catch (error) {
            allItems = [];
            renderPage();
            els.listMessage.textContent = error.message || "Unable to load holidays.";
            els.listMessage.className = "message error";
        }
    }

    function setMoreOptions(on) {
        els.coverageField.hidden = !on;
        els.moreToggle.textContent = on ? "− Fewer options" : "+ More options";
    }

    function resetForm() {
        els.id.value = "";
        els.name.value = "";
        els.date.value = "";
        els.type.value = "Regular";
        els.coverage.value = "WHOLE";
        els.atc.checked = true;
        setMoreOptions(false);
        els.formMessage.textContent = "";
        els.formMessage.className = "message";
    }

    function openForm(record) {
        resetForm();
        if (record) {
            els.formTitle.textContent = "Edit holiday";
            els.id.value = record.id;
            els.name.value = record.holiday_name;
            els.date.value = String(record.holiday_date || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
            els.type.value = record.holiday_type;
            els.coverage.value = record.day_portion || "WHOLE";
            els.atc.checked = Number(record.atc) === 1;
            // Auto-reveal Coverage if this record already has a non-default value, so it's not hidden from view.
            if (els.coverage.value !== "WHOLE") setMoreOptions(true);
        } else {
            els.formTitle.textContent = "Add holiday";
            els.name.focus();
        }
    }

    async function saveForm() {
        const id = els.id.value;
        const name = els.name.value.trim();
        if (!name || !els.date.value) {
            els.formMessage.textContent = !name ? "Holiday name is required." : "Date is required.";
            els.formMessage.className = "message error";
            (!name ? els.name : els.date).focus();
            return;
        }
        const body = {
            holiday_name: name,
            holiday_date: els.date.value,
            holiday_type: els.type.value,
            day_portion: els.coverage.value,
            atc: els.atc.checked ? 1 : 0
        };
        if (id) body.id = id;

        els.saveBtn.disabled = true;
        try {
            await request(id ? "update" : "add", { method: "POST", body });
            openForm(null);
            // [UI] Manatili sa Page 1 para nearest upcoming holidays pa rin ang unang makikita.
            await loadList();
            els.listMessage.textContent = `"${name}" ${id ? "updated" : "added"}.`;
            els.listMessage.className = "message success";
        } catch (error) {
            els.formMessage.textContent = error.message || "Unable to save holiday.";
            els.formMessage.className = "message error";
        } finally {
            els.saveBtn.disabled = false;
        }
    }

    async function deleteHoliday(id) {
        if (!window.confirm("Delete this holiday?")) return;
        try {
            await request("delete", { method: "POST", body: { id } });
            await loadList();
        } catch (error) {
            els.listMessage.textContent = error.message || "Unable to delete holiday.";
            els.listMessage.className = "message error";
        }
    }

    // A recommendation whose name already matches a saved holiday IN THE CURRENT YEAR is done for
    // this year — drop it. Matching is scoped to this year only (not the whole 3-year window) so
    // the chip comes back next year even though the same name was already used before.
    function belongsToYear(isoDate, year) {
        const [y, m, d] = isoDate.split("-").map(Number);
        if (y === year) return true;
        // A New Year's Day holiday is sometimes logged against Dec 31 of the prior year
        // (a payroll cutoff convention) — still counts as "this year" for recommendations.
        return y === year - 1 && m === 12 && d >= 26;
    }

    function pendingRecommendations() {
        const year = new Date().getFullYear();
        const addedNames = new Set(
            allItems
                .filter((item) => belongsToYear(String(item.holiday_date || ""), year))
                .map((item) => String(item.holiday_name || "").trim().toLowerCase())
        );
        return recommendTemplates.filter((tpl) => !addedNames.has(String(tpl.name || "").trim().toLowerCase()));
    }

    function renderRecommendChips() {
        if (!els.recommendChips) return;
        const pending = pendingRecommendations();
        if (!pending.length) {
            els.recommendChips.innerHTML = `<span class="holiday-recommend-hint">No recommended holidays yet.</span>`;
            return;
        }
        els.recommendChips.innerHTML = pending.map((tpl) => `
            <button class="holiday-recommend-chip" type="button" data-id="${tpl.id}" data-type="${typeSlug(tpl.holiday_type)}">${escapeHtml(tpl.name)}</button>
        `).join("");
    }

    async function loadRecommendations() {
        try {
            const payload = await recommendRequest("list");
            recommendTemplates = Array.isArray(payload.templates) ? payload.templates : [];
            renderRecommendChips();
        } catch (_error) {
            recommendTemplates = [];
            renderRecommendChips();
        }
    }

    function applyRecommendation(id) {
        const tpl = recommendTemplates.find((item) => String(item.id) === String(id));
        if (!tpl) return;
        els.name.value = tpl.name;
        els.type.value = tpl.holiday_type;
        els.coverage.value = tpl.day_portion || "WHOLE";
        if (els.coverage.value !== "WHOLE") setMoreOptions(true);
        els.date.focus();
    }

    els.cancelBtn?.addEventListener("click", () => openForm(null));
    els.saveBtn?.addEventListener("click", saveForm);
    els.moreToggle?.addEventListener("click", () => setMoreOptions(els.coverageField.hidden));
    els.pagerPrev?.addEventListener("click", () => { currentPage -= 1; renderPage(); });
    els.pagerNext?.addEventListener("click", () => { currentPage += 1; renderPage(); });
    els.body?.addEventListener("click", (event) => {
        const editBtn = event.target.closest(".holiday-edit-btn");
        const deleteBtn = event.target.closest(".holiday-delete-btn");
        if (editBtn) {
            const row = editBtn.closest("tr");
            openForm({
                id: row.dataset.id,
                holiday_name: row.dataset.name,
                holiday_date: row.dataset.date,
                holiday_type: row.dataset.type,
                day_portion: row.dataset.coverage,
                atc: Number(row.dataset.atc) === 1 ? 1 : 0
            });
        } else if (deleteBtn) {
            deleteHoliday(deleteBtn.getAttribute("data-id"));
        }
    });

    els.recommendChips?.addEventListener("click", (event) => {
        const chip = event.target.closest(".holiday-recommend-chip");
        if (chip) applyRecommendation(chip.dataset.id);
    });
    loadList();
    loadRecommendations();
})();
