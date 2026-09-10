/**
 * FILE: warehouse.js
 * PURPOSE: Hybrid Warehouse queue, legacy fee details, meter save, and SCO print flow.
 * EDIT GUIDE: API calls are in apiFetch; print layout is in buildPrintDocument.
 * HUWAG BAGUHIN: Print preview never advances workflow without the user's success confirmation.
 */
(function () {
    "use strict";
    var API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/warehouse`;
    var MEMBERSHIP_API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/membership`;
    var SIGNATORY_API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/signatory`;
    var WITHDRAWN_DEPARTMENTS = ["TSD", "ESD"];
    // Default Recommending Approval / Approved By signatories, used until the user picks a
    // replacement via the print preview's settings icon (stored in localStorage, shared with the
    // Membership module's Job Order print so both stay in sync).
    // Prepared By is intentionally excluded because it comes from the actual workflow employee.
    var PRINT_APPROVER_STORAGE_KEY = "samelcii_print_approvers_v1";
    var PRINT_APPROVER_DEFAULTS = {
        recommending: { label: "Recommending Approval", name: "Raquel B. Borja", title: "MEDS" },
        approved: { label: "Approved By", name: "Dickson Q. Bernales", title: "ISD Manager" },
    };

    function loadPrintApproverOverrides() {
        try {
            var parsed = JSON.parse(localStorage.getItem(PRINT_APPROVER_STORAGE_KEY) || "{}");
            return (parsed && typeof parsed === "object") ? parsed : {};
        } catch (error) { return {}; }
    }

    function savePrintApproverOverride(role, person) {
        var overrides = loadPrintApproverOverrides();
        overrides[role] = { name: String(person.name || "").trim(), title: String(person.position || person.title || "").trim() };
        try { localStorage.setItem(PRINT_APPROVER_STORAGE_KEY, JSON.stringify(overrides)); } catch (error) {}
    }

    function currentPrintApprover(role) {
        var overrides = loadPrintApproverOverrides();
        var stored = overrides[role];
        var fallback = PRINT_APPROVER_DEFAULTS[role];
        return {
            label: fallback.label,
            name: (stored && stored.name) || fallback.name,
            title: (stored && stored.title) || fallback.title,
        };
    }

    function currentPrintApprovers() {
        return [currentPrintApprover("recommending"), currentPrintApprover("approved")]
            .map(function (person) { return [person.label, person.name, person.title]; });
    }
    var PAGE_SIZE = 10;
    var requestedView = new URLSearchParams(window.location.search).get("view");
    var activeView = requestedView === "report" || requestedView === "inventory" ? requestedView : "orders";
    var rows = [];
    var inventoryRows = [];
    var currentPage = 1;
    var pendingOnly = false;
    var selected = null;
    var details = null;
    var selectionVersion = 0;
    var searchTimer = null;

    var byId = function (id) { return document.getElementById(id); };
    var refs = {
        account: byId("wh-account"), accountDisplay: byId("wh-account-display"),
        brand: byId("wh-meter-brand"), serial: byId("wh-serial"), seal: byId("wh-seal"), erc: byId("wh-erc"), reading: byId("wh-reading"),
        withdrawnUsercode: byId("wh-withdrawn-usercode"), withdrawnSearch: byId("wh-withdrawn-search"), withdrawnResults: byId("wh-withdrawn-results"),
        withdrawnWarning: byId("wh-withdrawn-warning"),
        executedAt: byId("wh-executed-at"),
        save: byId("warehouse-save-btn"), energized: byId("warehouse-energized-btn"), cancel: byId("warehouse-cancel-btn"), refresh: byId("warehouse-refresh-btn"),
        print: byId("warehouse-print-btn"), search: byId("warehouse-search"), month: byId("warehouse-filter-month"),
        year: byId("warehouse-filter-year"), area: byId("warehouse-filter-area"), tbody: byId("warehouse-master-tbody"), prev: byId("warehouse-page-prev"),
        next: byId("warehouse-page-next"), page: byId("warehouse-page-label"), eyebrow: byId("warehouse-detail-eyebrow"),
        title: byId("warehouse-detail-title"), desc: byId("warehouse-detail-desc"), feeBody: byId("warehouse-fee-tbody"),
        feeTotal: byId("warehouse-fee-total"), status: byId("warehouse-status-message"),
        readiness: byId("warehouse-readiness"), readinessTitle: byId("warehouse-readiness-title"),
        readinessText: byId("warehouse-readiness-text"),
        pendingCount: byId("warehouse-pending-count"),
        viewTitle: byId("warehouse-view-title"), viewKicker: byId("warehouse-view-kicker"),
        orderView: byId("warehouse-order-view"), reportView: byId("warehouse-report-view"),
        inventoryView: byId("warehouse-inventory-view"), reportPeriod: byId("warehouse-report-period"),
        reportTotal: byId("warehouse-report-total"), reportQueue: byId("warehouse-report-queue"),
        reportSaved: byId("warehouse-report-saved"), reportCompleted: byId("warehouse-report-completed"),
        reportBody: byId("warehouse-report-tbody"), inventoryBody: byId("warehouse-inventory-tbody"),
        inventoryCount: byId("warehouse-inventory-count"),
    };

    function authHeaders(extra) {
        var headers = Object.assign({}, extra || {});
        var token = localStorage.getItem("samelcii_token");
        if (token && token.split(".").length === 3) headers.Authorization = "Bearer " + token;
        return headers;
    }

    function apiFetch(action, options, params) {
        var query = new URLSearchParams(Object.assign({ action: action }, params || {}));
        var opts = Object.assign({ credentials: "same-origin" }, options || {});
        opts.headers = authHeaders(opts.headers);
        if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(API + "?" + query.toString(), opts).then(function (res) {
            return res.text().then(function (raw) {
                var data;
                try { data = JSON.parse(raw); }
                catch (_error) { throw new Error("Warehouse API returned non-JSON (" + res.status + "). Check login and Node API logs."); }
                if (!res.ok) throw new Error(data.message || res.statusText || "Request failed");
                return data;
            });
        });
    }

    function apiPathFetch(path) {
        return fetch(API + "/" + path, { credentials: "same-origin", headers: authHeaders() }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) throw new Error(data.message || "Warehouse request failed.");
                return data;
            });
        });
    }

    function announce(message) { if (refs.status) refs.status.textContent = message; }
    function money(value) {
        return Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function esc(value) {
        return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function setBusy(button, busy) { if (button) button.disabled = busy; }
    function formatDurationSeconds(value) {
        var totalMinutes = Math.max(0, Math.floor(Number(value || 0) / 60));
        var days = Math.floor(totalMinutes / 1440);
        var hours = Math.floor((totalMinutes % 1440) / 60);
        var minutes = totalMinutes % 60;
        var parts = [];
        if (days) parts.push(days + "d");
        if (hours) parts.push(hours + "h");
        if (minutes || !parts.length) parts.push(minutes + "m");
        return parts.join(" ");
    }
    function releaseTimingText(item) {
        if (!item || !item.releasedAt) return "Not released from Warehouse.";
        var duration = formatDurationSeconds(item.releaseElapsedSeconds);
        return item.energizedAt ? "Energized after " + duration + "." : "Released · awaiting return for " + duration + ".";
    }
    function syncActions() {
        var missing = missingMeterFields();
        var saved = details && (Number(details.statusCode) === 5 || Number(details.statusCode) === 6);
        var released = Boolean(details && details.releasedAt);
        var energized = Boolean(details && details.energizedAt);
        if (refs.cancel) refs.cancel.disabled = !selected;
        if (refs.save) refs.save.disabled = !selected || !details || missing.length > 0 || energized;
        if (refs.print) refs.print.disabled = !selected || !details || !saved || missing.length > 0 || meterFieldsAreDirty();
        if (refs.energized) refs.energized.disabled = !selected || !details || !released || energized;
        updateReadiness(missing);
    }

    function statusClass(code) {
        var n = Number(code);
        if (n === 0) return "status mem-rej";
        if (n === 1) return "status mem-isd";
        if (n === 2) return "status mem-fees";
        if (n === 3 || n === 4) return "status mem-wh";
        if (n === 5 || n === 6) return "status mem-done";
        return "status mem-unknown";
    }

    function renderFees(item) {
        refs.feeBody.innerHTML = "";
        var fees = item && Array.isArray(item.feeItems) ? item.feeItems : [];
        if (!fees.length) {
            refs.feeBody.innerHTML = '<tr class="fee-empty"><td colspan="2">No paid fee items for this payment.</td></tr>';
        } else {
            fees.forEach(function (fee) {
                var tr = document.createElement("tr");
                var label = document.createElement("td");
                var amount = document.createElement("td");
                label.textContent = fee.label;
                amount.textContent = money(fee.amount);
                tr.appendChild(label); tr.appendChild(amount); refs.feeBody.appendChild(tr);
            });
        }
        refs.feeTotal.textContent = money(item ? item.totalAmount : 0);
    }

    function nowForDatetimeLocal() {
        var now = new Date();
        var pad = function (n) { return String(n).padStart(2, "0"); };
        return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())
            + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
    }

    function fillDetails(item) {
        details = item;
        refs.account.value = item.accountNumber || "";
        refs.accountDisplay.value = item.accountNumber || "";
        refs.brand.value = item.meterBrand || "";
        refs.serial.value = item.meterSerial || "";
        refs.seal.value = item.sealNumber || "";
        refs.erc.value = item.ercSealNumber || "";
        refs.reading.value = item.initialReading || "";
        refs.withdrawnUsercode.value = (item.withdrawnBy && item.withdrawnBy.usercode) || "";
        refs.withdrawnSearch.value = (item.withdrawnBy && item.withdrawnBy.name) || "";
        refs.executedAt.value = item.executedAt || nowForDatetimeLocal();
        refs.eyebrow.textContent = "Selected payment";
        refs.title.textContent = item.accountNumber || "—";
        refs.desc.textContent = (item.fullName || "—") + " · Apply ID " + item.id + " · Status " + item.statusLabel + ". " + releaseTimingText(item);
        renderFees(item);
        syncActions();
    }

    function clearDetails() {
        details = null;
        [refs.account, refs.accountDisplay, refs.brand, refs.serial, refs.seal, refs.erc, refs.reading, refs.withdrawnUsercode, refs.withdrawnSearch].forEach(function (input) { input.value = ""; });
        refs.executedAt.value = nowForDatetimeLocal();
        refs.title.textContent = "No payment selected";
        refs.desc.textContent = "Select a row from the list.";
        renderFees(null);
        syncActions();
    }

    function loadDetails(row) {
        var version = ++selectionVersion;
        announce("Loading payment details.");
        return apiFetch("get_meter_payment_details", { method: "GET" }, { applyId: row.id, accountNumber: row.accountNumber })
            .then(function (data) {
                if (version !== selectionVersion || !selected || String(selected.id) !== String(row.id)) return null;
                fillDetails(data.item);
                announce("Payment details loaded.");
                return data.item;
            }).catch(function (error) {
                if (version === selectionVersion) { clearDetails(); window.alert(error.message); }
                return null;
            });
    }

    function selectRow(row) {
        selected = row;
        details = null;
        currentPage = Math.floor(visibleQueueRows().findIndex(function (item) { return String(item.id) === String(row.id); }) / PAGE_SIZE) + 1;
        renderList();
        syncActions();
        return loadDetails(row);
    }

    function isPendingPayment(row) {
        return Number(row.statusCode) === 3 || Number(row.statusCode) === 4;
    }

    function visibleQueueRows() {
        return pendingOnly ? rows.filter(isPendingPayment) : rows;
    }

    function renderList() {
        var queueRows = visibleQueueRows();
        var totalPages = Math.max(1, Math.ceil(queueRows.length / PAGE_SIZE));
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);
        var start = (currentPage - 1) * PAGE_SIZE;
        refs.tbody.innerHTML = "";
        queueRows.slice(start, start + PAGE_SIZE).forEach(function (row, index) {
            var tr = document.createElement("tr");
            tr.className = "master-row" + (Number(row.statusCode) === 5 ? " row-done" : "");
            tr.tabIndex = 0;
            tr.setAttribute("aria-selected", selected && String(selected.id) === String(row.id) ? "true" : "false");
            if (selected && String(selected.id) === String(row.id)) tr.classList.add("is-selected");
            var numberCell = document.createElement("td");
            numberCell.innerHTML = '<span class="row-num">' + (start + index + 1) + (Number(row.statusCode) === 5 ? ' <i class="fa fa-check-circle row-done-icon" aria-hidden="true"></i>' : "") + "</span>";
            var itemCell = document.createElement("td");
            var strong = document.createElement("strong"); strong.textContent = row.accountNumber || "—";
            var member = document.createElement("span"); member.textContent = row.fullName || "—";
            itemCell.appendChild(strong); itemCell.appendChild(member);
            var statusCell = document.createElement("td");
            var badge = document.createElement("span"); badge.className = statusClass(row.statusCode); badge.textContent = row.statusLabel || "—";
            statusCell.appendChild(badge);
            var printCell = document.createElement("td"); printCell.className = "master-row-print";
            var printButton = document.createElement("button"); printButton.type = "button"; printButton.className = "row-print-btn";
            printButton.setAttribute("aria-label", "Print order for " + row.accountNumber); printButton.innerHTML = '<i class="fa fa-print" aria-hidden="true"></i>';
            var rowCanPrint = Number(row.statusCode) === 5 || Number(row.statusCode) === 6;
            printButton.disabled = !rowCanPrint;
            printButton.title = rowCanPrint ? "Print saved order" : "Complete and save meter details before printing";
            printButton.addEventListener("click", function (event) {
                event.stopPropagation();
                var popup = openPrintWindow();
                if (!popup) return;
                selectRow(row).then(function (item) {
                    if (item) printSelected(popup);
                    else closePrintWindow(popup);
                });
            });
            printCell.appendChild(printButton);
            [numberCell, itemCell, statusCell, printCell].forEach(function (cell) { tr.appendChild(cell); });
            tr.addEventListener("click", function (event) { if (!event.target.closest(".row-print-btn")) selectRow(row); });
            tr.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRow(row); } });
            refs.tbody.appendChild(tr);
        });
        if (!queueRows.length) refs.tbody.innerHTML = '<tr class="warehouse-empty-row"><td colspan="4">' + (pendingOnly ? "No pending requests for this month." : "No payments found for this month.") + '</td></tr>';
        refs.page.textContent = "Page " + currentPage + " of " + totalPages;
        refs.prev.disabled = currentPage <= 1;
        refs.next.disabled = currentPage >= totalPages || !queueRows.length;
        var pendingCount = rows.filter(isPendingPayment).length;
        if (refs.pendingCount) {
            refs.pendingCount.innerHTML = '<i class="fa ' + (pendingOnly ? "fa-filter" : "fa-clock-o") + '" aria-hidden="true"></i><strong>' + pendingCount + '</strong><span>' + (pendingOnly ? "Showing pending" : "Pending") + '</span>';
            refs.pendingCount.classList.toggle("is-zero", pendingCount === 0);
            refs.pendingCount.classList.toggle("is-active", pendingOnly);
            refs.pendingCount.setAttribute("aria-pressed", pendingOnly ? "true" : "false");
            refs.pendingCount.disabled = pendingCount === 0 && !pendingOnly;
            refs.pendingCount.setAttribute("aria-label", (pendingOnly ? "Show all requests. " : "Show pending requests. ") + pendingCount + " pending new connection " + (pendingCount === 1 ? "request" : "requests"));
        }
    }

    function renderReport() {
        if (!refs.reportBody) return;
        var queueCount = rows.filter(function (row) { return Number(row.statusCode) === 3 || Number(row.statusCode) === 4; }).length;
        var savedCount = rows.filter(function (row) { return Number(row.statusCode) === 5; }).length;
        var completedCount = rows.filter(function (row) { return Number(row.statusCode) === 6; }).length;
        refs.reportTotal.textContent = String(rows.length);
        refs.reportQueue.textContent = String(queueCount);
        refs.reportSaved.textContent = String(savedCount);
        refs.reportCompleted.textContent = String(completedCount);
        refs.reportPeriod.textContent = refs.month.options[refs.month.selectedIndex].text + " " + refs.year.value;
        refs.reportBody.innerHTML = rows.length ? rows.map(function (row) {
            return "<tr><td>" + esc(row.id) + "</td><td><strong>" + esc(row.accountNumber || "—") + "</strong></td><td>" + esc(row.fullName || "—") + "</td><td><span class=\"" + statusClass(row.statusCode) + "\">" + esc(row.statusLabel || "—") + "</span></td><td>" + esc(row.processedBy || "—") + "</td><td>" + esc(row.createdDate || "—") + "</td></tr>";
        }).join("") : '<tr class="secondary-empty"><td colspan="6">No Warehouse orders found for this period.</td></tr>';
    }

    function stockValue(row, keys, fallback) {
        for (var i = 0; i < keys.length; i += 1) {
            if (row[keys[i]] != null && String(row[keys[i]]).trim() !== "") return row[keys[i]];
        }
        return fallback == null ? "—" : fallback;
    }

    function renderInventory() {
        if (!refs.inventoryBody) return;
        var query = refs.search.value.trim().toLowerCase();
        var filtered = !query ? inventoryRows : inventoryRows.filter(function (row) {
            return Object.keys(row).map(function (key) { return String(row[key] == null ? "" : row[key]); }).join(" ").toLowerCase().indexOf(query) !== -1;
        });
        refs.inventoryCount.textContent = String(filtered.length);
        refs.inventoryBody.innerHTML = filtered.length ? filtered.map(function (row) {
            return "<tr><td><strong>" + esc(stockValue(row, ["item_name", "itemName", "name", "description"])) + "</strong></td><td>" + esc(stockValue(row, ["category", "item_category", "type"])) + "</td><td>" + esc(stockValue(row, ["quantity", "qty", "stock", "balance"], 0)) + "</td><td>" + esc(stockValue(row, ["unit", "unit_name", "uom"])) + "</td><td>" + esc(stockValue(row, ["updated_at", "last_updated", "transaction_date", "date_updated"])) + "</td></tr>";
        }).join("") : '<tr class="secondary-empty"><td colspan="5">No Warehouse inventory records found.</td></tr>';
    }

    function loadInventory() {
        announce("Loading Warehouse inventory.");
        return apiPathFetch("stock").then(function (data) {
            inventoryRows = data.stock || [];
            renderInventory();
            announce(inventoryRows.length + " inventory records loaded.");
        }).catch(function (error) { window.alert(error.message); });
    }

    function loadPayments(keepSelection) {
        var previousId = keepSelection && selected ? String(selected.id) : "";
        announce("Loading Warehouse payments.");
        return apiFetch("list_meter_payments", { method: "GET" }, {
            month: refs.month.value, year: refs.year.value, area: refs.area.value, search: refs.search.value.trim(),
        }).then(function (data) {
            rows = data.rows || [];
            selected = previousId ? rows.find(function (row) { return String(row.id) === previousId; }) || null : null;
            if (!selected) clearDetails();
            currentPage = 1;
            renderList(); syncActions();
            if (activeView === "report") renderReport();
            announce(rows.length + " Warehouse payments loaded.");
            if (selected) return loadDetails(selected);
            return null;
        }).catch(function (error) { window.alert(error.message); });
    }

    function fieldValue(input) { return input ? input.value.trim() : ""; }
    function fieldIsMissing(input) {
        return fieldValue(input) === "";
    }
    function meterFieldDefinitions() {
        return [
            { input: refs.brand, label: "Meter Brand" },
            { input: refs.serial, label: "Serial Number" },
            { input: refs.seal, label: "Seal Number" },
            { input: refs.erc, label: "ERC Seal No." },
            { input: refs.reading, label: "Initial Reading" },
        ];
    }
    function missingMeterFields() {
        if (!selected || !details) return [];
        return meterFieldDefinitions().filter(function (field) { return fieldIsMissing(field.input); });
    }
    function updateReadiness(missing) {
        var fields = meterFieldDefinitions();
        fields.forEach(function (field) {
            var label = field.input.closest("label");
            var hasValue = !fieldIsMissing(field.input);
            label.classList.toggle("is-missing", Boolean(selected && details && !hasValue));
            label.classList.toggle("is-complete", Boolean(selected && details && hasValue));
            field.input.setAttribute("aria-invalid", selected && details && !hasValue ? "true" : "false");
        });
        // ponytail: "Withdrawn/Executed by" stays optional (not in meterFieldDefinitions, so it
        // never blocks Save/Print) — this is just a visible nudge so it isn't silently skipped,
        // which an audit found happening on every recent released order.
        if (refs.withdrawnWarning) {
            var hasWithdrawn = Boolean(fieldValue(refs.withdrawnUsercode) || fieldValue(refs.withdrawnSearch));
            refs.withdrawnWarning.hidden = !selected || !details || hasWithdrawn;
        }
        if (!refs.readiness) return;
        var icon = refs.readiness.querySelector("i");
        if (!selected) {
            refs.readiness.dataset.state = "waiting";
            refs.readinessTitle.textContent = "Select a payment";
            refs.readinessText.textContent = "Choose a queue record to check its release requirements.";
            icon.className = "fa fa-info-circle";
        } else if (!details) {
            refs.readiness.dataset.state = "waiting";
            refs.readinessTitle.textContent = "Checking meter details";
            refs.readinessText.textContent = "Please wait while the selected payment is loaded.";
            icon.className = "fa fa-spinner fa-spin";
        } else if (missing.length) {
            refs.readiness.dataset.state = "missing";
            refs.readinessTitle.textContent = missing.length + (missing.length === 1 ? " detail is missing" : " details are missing");
            refs.readinessText.textContent = "Complete " + missing.map(function (field) { return field.label; }).join(", ") + " before Save or Print.";
            icon.className = "fa fa-exclamation-triangle";
        } else if (meterFieldsAreDirty() || (Number(details.statusCode) !== 5 && Number(details.statusCode) !== 6)) {
            refs.readiness.dataset.state = "ready";
            refs.readinessTitle.textContent = "Ready to save";
            refs.readinessText.textContent = "All required details are complete. Save before printing.";
            icon.className = "fa fa-save";
        } else {
            refs.readiness.dataset.state = "ready";
            refs.readinessTitle.textContent = "Ready to print";
            refs.readinessText.textContent = "All required meter details are complete and saved.";
            icon.className = "fa fa-check-circle";
        }
    }
    function meterFieldsAreDirty() {
        if (!details) return false;
        return fieldValue(refs.brand) !== String(details.meterBrand || "") ||
            fieldValue(refs.serial) !== String(details.meterSerial || "") ||
            fieldValue(refs.seal) !== String(details.sealNumber || "") ||
            fieldValue(refs.erc) !== String(details.ercSealNumber || "") ||
            fieldValue(refs.reading) !== String(details.initialReading || "") ||
            fieldValue(refs.executedAt) !== String(details.executedAt || "");
    }
    function saveSelected() {
        if (!selected) return;
        var missing = missingMeterFields();
        if (missing.length) {
            window.alert("Complete the highlighted meter details before saving.");
            missing[0].input.focus();
            return;
        }
        var reading = fieldValue(refs.reading);
        if (reading !== "" && (!Number.isFinite(Number(reading)) || Number(reading) < 0)) {
            window.alert("Initial Reading must be a non-negative number."); refs.reading.focus(); return;
        }
        setBusy(refs.save, true);
        apiFetch("save_meter_payment", { method: "POST", body: {
            applyId: selected.id, accountNumber: selected.accountNumber,
            meterBrand: fieldValue(refs.brand), meterSerial: fieldValue(refs.serial),
            sealNumber: fieldValue(refs.seal), ercSealNumber: fieldValue(refs.erc), initialReading: reading,
            withdrawnBy: fieldValue(refs.withdrawnUsercode), executedAt: fieldValue(refs.executedAt),
        }}).then(function (data) {
            window.alert(data.message || "Meter details saved.");
            return loadPayments(true);
        }).catch(function (error) { window.alert(error.message); })
            .finally(function () { setBusy(refs.save, false); syncActions(); });
    }

    // [FIX] The "books" lookup only fills in a decorative address label — it must never be allowed
    // to block printing. It has been observed to hang indefinitely server-side (no response at all),
    // so it runs with a hard client-side timeout and printing proceeds without the label on failure.
    function fetchWithTimeout(url, timeoutMs) {
        var controller = new AbortController();
        var timer = window.setTimeout(function () { controller.abort(); }, timeoutMs);
        return fetch(url, { credentials: "same-origin", headers: authHeaders(), signal: controller.signal })
            .finally(function () { window.clearTimeout(timer); });
    }

    function loadMembershipPrintDetail(accountNumber) {
        var url = MEMBERSHIP_API + "?" + new URLSearchParams({ action: "job_order_detail", account: accountNumber }).toString();
        return fetch(url, { credentials: "same-origin", headers: authHeaders() }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok || !data.ok) throw new Error(data.message || "Unable to load Membership Job Order details.");
                var record = data.record || {};
                var areaCode = String(record.Area || "").replace(/\D+/g, "").padStart(3, "0").slice(-3);
                var bookCode = String(record.Book || "").replace(/\D+/g, "").padStart(3, "0").slice(-3);
                if (areaCode === "000" || bookCode === "000") return data;
                // [FIX] Was: fetch the full book list for the area and string-match a prefix in it.
                // That list is built by joining several live DB tables, which can come back
                // incomplete for a given book on the real prod database even though its canonical
                // name exists — silently falling back to raw area/book numbers. This looks up the
                // one area+book pair directly instead.
                var labelUrl = MEMBERSHIP_API + "?" + new URLSearchParams({ action: "book_label", area: areaCode, book: bookCode }).toString();
                return fetchWithTimeout(labelUrl, 4000).then(function (labelResponse) {
                    return labelResponse.json().catch(function () { return {}; }).then(function (labelData) {
                        if (!labelResponse.ok || !labelData.ok) return data;
                        data.addressLabel = String(labelData.label || "").trim();
                        return data;
                    });
                }).catch(function () { return data; });
            });
        });
    }

    function printDate(value) {
        if (!value) return "-";
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return String(date.getMonth() + 1).padStart(2, "0") + "/" + String(date.getDate()).padStart(2, "0") + "/" + String(date.getFullYear()).slice(-2);
    }

    function printTime(value) {
        if (!value) return "-";
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";
        var hours = date.getHours();
        var period = hours >= 12 ? "PM" : "AM";
        var hour12 = hours % 12 || 12;
        return String(hour12).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + " " + period;
    }

    function membershipFeeRows(fees) {
        return [
            ["Membership Fee", fees.MembeshipFee, fees.MembeshipFeeOR, fees.MembeshipFeeDate],
            ["Security Deposit", fees.SDeposit, fees.SDepositOR, fees.SDepositDate],
            ["Service Fee", fees.ServiceFee, fees.ServiceFeeOR, fees.ServiceFeeDate],
            ["Inspection Fee", fees.InspectionFee, fees.InspectionFeeOR, fees.InspectionFeeDate],
            ["Meter", fees.Meter, fees.MeterOR, fees.MeterDate],
            ["Coop Share", fees.CoopShare, fees.CoopShareOR, fees.CoopShareDate],
            ["Ground Rod", fees.GroundRod, fees.GroundRodOR, fees.GroundRodDate],
            ["SD Wire", fees.SDWire, fees.SDWireOR, fees.SDWireDate],
            ["Sedma", fees.Sedma, fees.SedmaOR, fees.SedmaDate],
            ["Meter Box", fees.MeterBox, fees.MeterBoxOR, fees.MeterBoxDate],
            ["Meter Base", fees.MeterBase, fees.MeterBaseOR, fees.MeterBaseDate],
            ["Sealing Led", fees.SealingLed, fees.SealingLedOR, fees.SealingLedDate],
            ["ID", fees.MemID, fees.MemIdOR, fees.MemIdDate],
        ];
    }

    function jobOrderFeeTable(rows) {
        return rows.map(function (row) {
            return "<tr><td>" + esc(row[0]) + "</td><td>" + money(row[1]) + "</td><td>" + esc(String(row[2] == null ? "" : row[2]).trim() || "-") + "</td><td>" + esc(printDate(row[3])) + "</td></tr>";
        }).join("");
    }

    function buildPrintDocument(item, membershipDetail) {
        var record = membershipDetail.record || {}, fees = membershipDetail.fees || {};
        var feeRows = membershipFeeRows(fees);
        var total = feeRows.reduce(function (sum, row) { return sum + (Number(row[1]) || 0); }, 0);
        var fullName = [record.LastName, record.FirstName, record.MiddleName, record.ExtensionName].filter(function (part) { return part && String(part).trim().toUpperCase() !== "N/A"; }).join(" ").replace(/\s+/g, " ").trim() || "-";
        var spouse = [record.SpouseLastName, record.SpouseFirstName, record.SpouseMiddleName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "-";
        var address = membershipDetail.addressLabel
            ? [record.Street, membershipDetail.addressLabel].filter(Boolean).join(" / ")
            : [record.Area, record.Book, record.Street].filter(Boolean).join(" / ") || "-";
        var logo = new URL("../../../assets/images/samelco-3d.png", window.location.href).href;
        var workflowSignatures = item.signatures || {};
        var signatories = [["Prepared By", workflowSignatures.preparedBy || "-", workflowSignatures.preparedPosition || "-"]].concat(currentPrintApprovers());
        var signatoryHtml = signatories.map(function (sig) { return '<div class="sig-row"><span>' + esc(sig[0]) + '</span><div><strong>' + esc(sig[1]) + '</strong><small>' + esc(sig[2]) + '</small></div></div>'; }).join("");
        var preparedHtml = '<div class="prepared-person"><span>Release By</span><strong>' + esc(workflowSignatures.releasedBy || "-") + '</strong><small>' + esc(workflowSignatures.releasedPosition || "-") + '</small></div>';
        var metaLeft = '<div class="meta-block"><div class="meta-line"><span>Run Date</span><strong>' + printDate(new Date()) + '</strong></div><div class="meta-line"><span>Account No</span><strong>' + esc(record.AccountNumber || item.accountNumber || '-') + '</strong></div><div class="meta-line"><span>Name</span><strong>' + esc(fullName) + '</strong></div><div class="meta-line"><span>Co-Member</span><strong>' + esc(spouse) + '</strong></div><div class="meta-line"><span>Address</span><strong>' + esc(address) + '</strong></div></div>';
        // [FIX] Was record.StatusStage (the 1-6 workflow stage number, e.g. "3" for Warehouse) —
        // that's not a control number, it's why every order sitting at the same stage printed the
        // same digit. item.id is mempayments' own auto-increment ApplyID: always unique, always
        // increasing, and never runs out.
        var metaRight = '<div class="meta-block"><div class="meta-line"><span>Control No</span><strong>' + esc(String(item.id || 0).padStart(6, "0")) + '</strong></div><div class="meta-line"><span>Date</span><strong>' + esc(printDate(record.ISD_DT || new Date())) + '</strong></div><div class="meta-line"><span>Member Type</span><strong>' + esc(record.Membership || '-') + '</strong></div><div class="meta-line"><span>Conn. Type</span><strong>' + esc(record.Classification || '-') + '</strong></div><div class="meta-line"><span>Remarks</span><strong>' + esc(record.RemarksID || 'NEW CONNECTION') + '</strong></div></div>';
        var withdrawnByName = (item.withdrawnBy && item.withdrawnBy.name) || "";
        var executionHtml = '<section class="execution-block"><table class="execution-table"><thead><tr><th>Executed By</th><th>Date</th><th>Time</th></tr></thead><tbody><tr><td>' + (withdrawnByName ? esc(withdrawnByName) : "&nbsp;") + '</td><td>' + esc(printDate(item.executedAt)) + '</td><td>' + esc(printTime(item.executedAt)) + '</td></tr></tbody></table><p class="ack-text">I acknowledge having received the above service.</p></section>';
        var meterHtml = '<div class="kv"><h2>Meter Details</h2><div class="kv-row"><span>Meter Brand</span><strong>' + esc(item.meterBrand || '-') + '</strong></div><div class="kv-row"><span>Meter Serial No.</span><strong>' + esc(item.meterSerial || '-') + '</strong></div><div class="kv-row"><span>Seal Number</span><strong>' + esc(item.sealNumber || '-') + '</strong></div><div class="kv-row"><span>ERC Seal No.</span><strong>' + esc(item.ercSealNumber || '-') + '</strong></div><div class="kv-row"><span>Initial Reading</span><strong>' + esc(item.initialReading || '-') + '</strong></div></div>';
        // Larger field text plus dedicated vertical room for handwritten signatures.
        var printScaleCss = '@page{size:A4 portrait;margin:0}.sheet{padding:5mm 7mm}.header{gap:4px;padding-bottom:4px}.brand img{width:34px;height:34px}.brand h1{font-size:21px}.brand p{font-size:12px}.title{font-size:18px}.meta-grid{margin-top:6px;font-size:13px}.meta-line{grid-template-columns:82px 1fr;gap:5px}.meta-line span,.kv-row span,.sig-row>span{font-size:11px}.section-title{margin:12px 0 6px;font-size:13px}.fee-grid{gap:12px}.fee-grid th,.fee-grid td{padding-top:0;padding-bottom:0;line-height:1.05}.fee-grid .panel h2{margin-bottom:0}.panel h2,.kv h2{font-size:13px;margin-bottom:4px}th,td{padding:3.5px 4px;font-size:12px;line-height:1.2}th{font-size:10px}.totals{padding-top:6px;font-size:15px}.execution-block{margin-top:6px}.execution-table{width:40%}.execution-table th,.execution-table td{border:1px solid #94a3b8;padding:2px 5px}.execution-table th:first-child{width:56%}.execution-table td{height:22px}.ack-text{margin:4px 0 10px;font-size:12px}.details-grid{gap:14px;margin-top:8px}.details-left .execution-table{width:80%}.prepared-person{width:80%;margin-bottom:8px;text-align:left}.prepared-person span,.prepared-person strong,.prepared-person small{display:block}.prepared-person span{margin-bottom:2px;font-size:11px;font-weight:900;text-transform:uppercase;color:#64748b}.prepared-person strong,.prepared-person small{text-align:center;text-transform:uppercase}.prepared-person strong{font-size:12px}.prepared-person small{font-size:10px}.kv-row{grid-template-columns:108px 1fr;gap:5px;margin-bottom:4px;font-size:12px}.sig-stack{gap:0;margin-top:6px}.sig-row{grid-template-columns:120px minmax(0,1fr);gap:12px;min-height:40px;padding:5px 0;align-items:start;font-size:12px}.sig-row>span{padding-top:1px;line-height:1.2}.sig-row>div{min-width:0;padding-top:0}.sig-row strong{font-size:12px;line-height:1.2;text-transform:uppercase}.sig-row small{font-size:10px;line-height:1.25;margin-top:3px;white-space:normal;text-transform:uppercase}.footer{margin-top:8px;font-size:12px}.footer span{width:88px}';
        var html = '<!doctype html><html><head><meta charset="utf-8"><title>Warehouse Order - ' + esc(record.AccountNumber || item.accountNumber) + '</title><style>' +
            '@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:"Segoe UI",Tahoma,Arial,sans-serif}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.header{display:grid;grid-template-columns:1fr auto;gap:12px;padding-bottom:8px;border-bottom:1px solid #d1d5db}.brand{display:flex;gap:10px}.brand img{width:28px;height:28px;object-fit:contain}.brand h1{margin:0;font-size:17px;line-height:1.02;letter-spacing:.02em;font-weight:900}.brand p{margin:1px 0 0;font-size:10px;color:#4b5563}.title{margin-top:4px;font-size:15px;font-weight:900;letter-spacing:.06em}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:11px}.meta-block{display:grid;gap:1px}.meta-line{display:grid;grid-template-columns:64px 1fr;gap:3px}.meta-line span,.kv-row span,.sig-row>span{font-weight:900;text-transform:uppercase;color:#64748b;font-size:10px}.section-title{margin:12px 0 6px;text-align:center;font-weight:900;letter-spacing:.24em;font-size:11px}.fee-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:6px}.panel h2,.kv h2{margin:0 0 2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#334155}table{width:100%;border-collapse:collapse}th,td{padding:2px 3px;font-size:10px;text-align:left;line-height:1.05}th{color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-size:9px}th:nth-child(n+2),td:nth-child(n+2){text-align:center;white-space:nowrap}.totals{display:flex;justify-content:flex-end;padding-top:3px;font-size:12px;font-weight:900;color:#b45309}.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.kv-row{display:grid;grid-template-columns:86px 1fr;gap:3px;margin-bottom:2px;font-size:10px}.sig-stack{display:grid;gap:7px}.sig-row{display:grid;grid-template-columns:136px 1fr;gap:6px;min-height:26px;font-size:10px}.sig-row strong,.sig-row small{display:block}.sig-row strong{font-size:10px;font-weight:900}.sig-row small{font-size:9px;color:#475569}.footer{margin-top:8px;font-size:10px}.footer span{display:inline-block;width:74px;font-weight:900;text-transform:uppercase;color:#64748b}</style></head><body><div class="sheet">' +
            '<div class="header"><div class="brand"><img src="' + esc(logo) + '" alt="SAMELCO II logo"><div><h1>SAMAR II ELECTRIC COOPERATIVE, INC.</h1><p>Paranas, Samar</p></div></div></div><div class="meta-grid">' + metaLeft + metaRight + '</div>' +
            '<div class="section-title">FEES &amp; CHARGES</div><div class="fee-grid"><div class="panel"><h2>Base Fees</h2><table><thead><tr><th>Description</th><th>Amount</th><th>OR</th><th>Date</th></tr></thead><tbody>' + jobOrderFeeTable(feeRows.slice(0,8)) + '</tbody></table></div><div class="panel"><h2>Other Charges</h2><table><thead><tr><th>Description</th><th>Amount</th><th>OR</th><th>Date</th></tr></thead><tbody>' + jobOrderFeeTable(feeRows.slice(8)) + '</tbody></table></div></div><div class="totals">Total Amount: ' + money(total) + '</div>' +
            '<div class="details-grid"><div class="details-left">' + preparedHtml + meterHtml + executionHtml + '</div><div class="kv"><h2>Signatories</h2><div class="sig-stack">' + signatoryHtml + '</div></div></div><div class="footer"><span>Remarks</span>' + esc(record.RemarksID || 'NEW CONNECTION') + '</div></div></body></html>';
        return html.replace('</style>', printScaleCss + '</style>');
    }

    function confirmPrinted(item) {
        if (!window.confirm("Was the Service Connection Order printed successfully?\n\nChoose OK only after a successful physical print. Preview or Cancel must choose Cancel.")) return;
        apiFetch("mark_meter_payment_printed", { method: "POST", body: { applyId: item.id, accountNumber: item.accountNumber } })
            .then(function (data) { window.alert(data.message || "Print confirmed."); return loadPayments(true); })
            .catch(function (error) { window.alert("Printed, but workflow confirmation failed: " + error.message); });
    }

    function markEnergizedSelected() {
        if (!selected || !details || !details.releasedAt || details.energizedAt) return;
        if (!window.confirm("Confirm that this released order returned from the field and the connection is now ENERGIZED?")) return;
        setBusy(refs.energized, true);
        apiFetch("mark_meter_payment_energized", {
            method: "POST",
            body: { applyId: selected.id, accountNumber: selected.accountNumber },
        }).then(function (data) {
            var seconds = Number(data.timing && data.timing.releaseElapsedSeconds || 0);
            window.alert((data.message || "Order marked Energized.") + "\nRelease-to-energized time: " + formatDurationSeconds(seconds));
            return loadPayments(true);
        }).catch(function (error) {
            window.alert(error.message);
        }).finally(function () {
            setBusy(refs.energized, false);
            syncActions();
        });
    }

    // Settings icon in the print preview: lets the user swap Recommending Approval / Approved By
    // per print, since different branches (Villareal, Catbalogan, Basey, ...) have different
    // signing officers than Main. Choice is saved to localStorage via savePrintApproverOverride.
    // The whole section stays hidden until the gear icon is clicked; within it, each row's search
    // box stays collapsed until that row's own name is clicked (click-to-edit, one open at a time).
    // Inline SVG so the icons always render regardless of whether an icon font is loaded on the
    // page (FontAwesome isn't linked on every module that embeds this print preview).
    var ICON_GEAR_SVG = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.6"></circle><path d="M10 2.7v2.1M10 15.2v2.1M17.3 10h-2.1M4.8 10H2.7M15.1 4.9l-1.5 1.5M6.4 13.6l-1.5 1.5M15.1 15.1l-1.5-1.5M6.4 6.4L4.9 4.9"></path></svg>';
    var ICON_PENCIL_SVG = '<svg viewBox="0 0 20 20" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.3 3.3l3.4 3.4L6.4 17H3v-3.4L13.3 3.3z"></path></svg>';

    function buildPrintApproverPanel() {
        var roles = [
            { role: "recommending", label: "Recommending Approval" },
            { role: "approved", label: "Approved By" },
        ];
        return '<div class="print-approver-panel" data-approver-panel hidden>' +
            roles.map(function (item) {
                return '<div class="print-approver-row" data-approver-role="' + item.role + '">' +
                    '<span class="print-approver-label">' + item.label + '</span>' +
                    '<button type="button" class="print-approver-current" data-approver-current title="Click to change"></button>' +
                    '<div class="print-approver-editor" data-approver-editor>' +
                        '<input type="text" class="print-approver-search" data-approver-search placeholder="Search employee to replace..." autocomplete="off" />' +
                        '<div class="print-approver-results" data-approver-results hidden></div>' +
                    '</div>' +
                '</div>';
            }).join("") +
        '</div>';
    }

    function renderPrintApproverPanel(overlay) {
        overlay.querySelectorAll("[data-approver-role]").forEach(function (row) {
            var role = row.getAttribute("data-approver-role");
            var person = currentPrintApprover(role);
            row.querySelector("[data-approver-current]").innerHTML =
                '<span class="print-approver-current-copy"><strong>' + esc(person.name) + '</strong><small>' + esc(person.title) + '</small></span>' +
                '<span class="print-approver-pencil">' + ICON_PENCIL_SVG + '</span>';
        });
    }

    function collapsePrintApproverRow(row) {
        row.classList.remove("is-editing");
        var search = row.querySelector("[data-approver-search]");
        // [FIX] Results now live in document.body (see initPrintApproverPanel), not under row
        // anymore, so row.querySelector can't find it — read the reference stashed there instead.
        var results = row._approverResults;
        search.value = "";
        if (results) { results.hidden = true; results.innerHTML = ""; }
    }

    function positionPrintApproverResults(search, results) {
        var rect = search.getBoundingClientRect();
        results.style.left = rect.left + "px";
        results.style.top = (rect.bottom + 4) + "px";
        results.style.width = rect.width + "px";
    }

    function initPrintApproverPanel(overlay, onChange) {
        var toggle = overlay.querySelector(".print-preview-settings");
        var panel = overlay.querySelector("[data-approver-panel]");
        renderPrintApproverPanel(overlay);
        toggle.addEventListener("click", function () {
            panel.hidden = !panel.hidden;
            toggle.classList.toggle("is-active", !panel.hidden);
        });

        overlay._movedApproverResults = overlay._movedApproverResults || [];
        overlay.querySelectorAll("[data-approver-role]").forEach(function (row) {
            var role = row.getAttribute("data-approver-role");
            var current = row.querySelector("[data-approver-current]");
            var search = row.querySelector("[data-approver-search]");
            var results = row.querySelector("[data-approver-results]");
            var searchTimer = null;

            // [FIX] position:fixed is only viewport-relative if no ancestor has a transform — but
            // .print-approver-editor's own open/close animation applies one, which silently makes
            // it the containing block instead and threw off every coordinate this was positioned
            // with. Moving the dropdown out to document.body sidesteps that (and any future
            // ancestor overflow/transform) entirely; cleaned up in closePrintWindow.
            row._approverResults = results;
            if (results.parentNode !== document.body) {
                document.body.appendChild(results);
                overlay._movedApproverResults.push(results);
            }

            current.addEventListener("click", function () {
                var opening = !row.classList.contains("is-editing");
                overlay.querySelectorAll(".print-approver-row.is-editing").forEach(collapsePrintApproverRow);
                if (opening) { row.classList.add("is-editing"); search.focus(); }
            });

            search.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                var query = search.value.trim();
                if (query.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
                searchTimer = window.setTimeout(function () {
                    var url = SIGNATORY_API + "?" + new URLSearchParams({ action: "bootstrap", q: query }).toString();
                    // [FIX] Force a fresh network round-trip: earlier failed search attempts (before
                    // the backend bugs were fixed) got cached by the browser for these exact query
                    // strings, and were replaying that stale empty result via 304 ever since.
                    fetch(url, { credentials: "same-origin", headers: authHeaders(), cache: "no-store" })
                        .then(function (response) {
                            return response.json().catch(function () { return {}; }).then(function (data) {
                                if (!response.ok || data.ok === false) throw new Error(data.message || "Search failed.");
                                return data;
                            });
                        })
                        .then(function (data) {
                            var people = (data && data.employees) || [];
                            if (!people.length) {
                                results.innerHTML = '<div class="print-approver-empty">No matches.</div>';
                            } else {
                                results.innerHTML = people.slice(0, 20).map(function (person, index) {
                                    return '<button type="button" class="print-approver-result-item" data-index="' + index + '">' +
                                        esc(person.name) + '<small>' + esc(person.position || "-") + " · " + esc(person.department || "-") + '</small></button>';
                                }).join("");
                                results.querySelectorAll("[data-index]").forEach(function (button) {
                                    button.addEventListener("click", function () {
                                        var person = people[Number(button.getAttribute("data-index"))];
                                        savePrintApproverOverride(role, person);
                                        renderPrintApproverPanel(overlay);
                                        collapsePrintApproverRow(row);
                                        row.classList.add("just-changed");
                                        window.setTimeout(function () { row.classList.remove("just-changed"); }, 900);
                                        if (onChange) onChange();
                                    });
                                });
                            }
                            positionPrintApproverResults(search, results);
                            results.hidden = false;
                        })
                        .catch(function (error) {
                            positionPrintApproverResults(search, results);
                            results.innerHTML = '<div class="print-approver-empty">' + esc(error.message || "Search failed. Try again.") + '</div>';
                            results.hidden = false;
                        });
                }, 250);
            });
        });
    }

    // [FIX] Print preview is an in-page modal (iframe + Print button) — no new browser tab/window
    // ever appears, and printing only fires when the user clicks Print, not automatically.
    function openPrintWindow() {
        var overlay = document.createElement("div");
        overlay.className = "print-preview-overlay";
        overlay.innerHTML =
            '<div class="print-preview-modal">' +
                '<div class="print-preview-header">' +
                    '<h2>Print Preview — Service Connection Order</h2>' +
                    '<div class="print-preview-actions">' +
                        '<button type="button" class="print-preview-settings" title="Change signatories" aria-label="Change signatories">' + ICON_GEAR_SVG + '</button>' +
                        '<button type="button" class="print-preview-cancel">Cancel</button>' +
                        '<button type="button" class="print-preview-print" disabled>Print</button>' +
                    '</div>' +
                '</div>' +
                buildPrintApproverPanel() +
                '<iframe class="print-preview-frame" title="Service Connection Order preview"></iframe>' +
            '</div>';
        document.body.appendChild(overlay);
        var frame = overlay.querySelector(".print-preview-frame");
        frame.contentDocument.open();
        frame.contentDocument.write('<!doctype html><title>Loading Service Connection Order</title><p style="font:14px Segoe UI;padding:24px">Loading Membership Job Order details...</p>');
        frame.contentDocument.close();
        overlay.querySelector(".print-preview-cancel").addEventListener("click", function () { closePrintWindow(overlay); });
        overlay.frame = frame;
        return overlay;
    }

    function closePrintWindow(overlay) {
        if (!overlay) return;
        // Results dropdowns for this overlay were moved to document.body (see initPrintApproverPanel)
        // so they can't be trapped by an ancestor's overflow/transform; they must be cleaned up here
        // since destroying the overlay itself won't remove them.
        (overlay._movedApproverResults || []).forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function printSelected(popup) {
        popup = popup || null;
        function rejectPrint(message, input) {
            closePrintWindow(popup);
            window.alert(message);
            if (input) input.focus();
        }
        if (!selected) { rejectPrint("Select a meter payment first."); return; }
        if (!details) { rejectPrint("Wait for the selected meter payment to finish loading."); return; }
        var missing = missingMeterFields();
        if (missing.length) {
            rejectPrint("Complete " + missing.map(function (field) { return field.label; }).join(", ") + " before printing.", missing[0].input);
            return;
        }
        if (meterFieldsAreDirty()) { rejectPrint("Save the changed meter details before printing."); return; }
        if (Number(details.statusCode) !== 5 && Number(details.statusCode) !== 6) {
            rejectPrint("Save the completed meter details before printing.");
            return;
        }
        popup = popup || openPrintWindow();
        if (!popup) return;
        setBusy(refs.print, true);
        loadMembershipPrintDetail(selected.accountNumber)
            .then(function (membershipDetail) {
                var item = details;
                var handled = false;
                var frame = popup.frame;
                var win = frame.contentWindow;
                var doc = frame.contentDocument || win.document;
                var printButton = popup.querySelector(".print-preview-print");

                // Rebuilds the preview document from the current signatory selection — called on
                // first load and again whenever the user swaps a signatory in the settings panel.
                function renderDoc() {
                    printButton.disabled = true;
                    doc.open();
                    doc.write(buildPrintDocument(item, membershipDetail));
                    doc.close();
                    var images = Array.prototype.slice.call(doc.images || []);
                    var remaining = images.length;
                    var readyToPrint = function () { printButton.disabled = false; };
                    if (!images.length) {
                        readyToPrint();
                    } else {
                        images.forEach(function (img) {
                            if (img.complete && img.naturalWidth > 0) { remaining -= 1; if (remaining <= 0) readyToPrint(); }
                            else {
                                var tick = function () { remaining -= 1; if (remaining <= 0) readyToPrint(); };
                                img.addEventListener("load", tick, { once: true });
                                img.addEventListener("error", tick, { once: true });
                            }
                        });
                    }
                }

                win.addEventListener("afterprint", function () {
                    if (handled) return; handled = true;
                    closePrintWindow(popup);
                    window.setTimeout(function () { confirmPrinted(item); }, 100);
                });
                printButton.addEventListener("click", function () { win.focus(); win.print(); });
                initPrintApproverPanel(popup, renderDoc);
                renderDoc();
            }).catch(function (error) {
                closePrintWindow(popup);
                window.alert(error.message);
            })
            .finally(function () { setBusy(refs.print, false); syncActions(); });
    }

    var withdrawnEmployees = null;
    var withdrawnEmployeesPromise = null;
    function loadWithdrawnEmployees() {
        if (withdrawnEmployeesPromise) return withdrawnEmployeesPromise;
        withdrawnEmployeesPromise = Promise.all(WITHDRAWN_DEPARTMENTS.map(function (department) {
            var url = SIGNATORY_API + "?" + new URLSearchParams({ action: "bootstrap", department: department }).toString();
            return fetch(url, { credentials: "same-origin", headers: authHeaders() }).then(function (response) {
                return response.json().catch(function () { return {}; });
            }).then(function (data) { return (data && data.employees) || []; }).catch(function () { return []; });
        })).then(function (lists) {
            var seen = {};
            withdrawnEmployees = [];
            lists.forEach(function (list) {
                list.forEach(function (person) {
                    if (person.usercode && !seen[person.usercode]) { seen[person.usercode] = true; withdrawnEmployees.push(person); }
                });
            });
            return withdrawnEmployees;
        });
        return withdrawnEmployeesPromise;
    }
    function renderWithdrawnResults(people) {
        if (!people.length) {
            refs.withdrawnResults.innerHTML = '<div class="withdrawn-result-empty">No TSD/ESD employee matches.</div>';
        } else {
            refs.withdrawnResults.innerHTML = people.slice(0, 20).map(function (person) {
                return '<button type="button" class="withdrawn-result-item" data-usercode="' + esc(person.usercode) + '">' +
                    esc(person.name) + '<small>' + esc(person.position || "-") + " &middot; " + esc(person.department || "-") + '</small></button>';
            }).join("");
        }
        refs.withdrawnResults.hidden = false;
    }
    function selectWithdrawnEmployee(person) {
        refs.withdrawnUsercode.value = person.usercode;
        refs.withdrawnSearch.value = person.name;
        refs.withdrawnResults.hidden = true;
        syncActions();
    }
    refs.withdrawnSearch.addEventListener("input", function () {
        refs.withdrawnUsercode.value = "";
        syncActions();
        var query = refs.withdrawnSearch.value.trim().toLowerCase();
        if (!query) { refs.withdrawnResults.hidden = true; return; }
        loadWithdrawnEmployees().then(function (people) {
            var matches = people.filter(function (person) {
                return (person.name + " " + person.usercode + " " + (person.position || "")).toLowerCase().indexOf(query) !== -1;
            });
            renderWithdrawnResults(matches);
        });
    });
    refs.withdrawnSearch.addEventListener("focus", function () {
        if (refs.withdrawnSearch.value.trim()) refs.withdrawnSearch.dispatchEvent(new Event("input"));
    });
    refs.withdrawnResults.addEventListener("click", function (event) {
        var button = event.target.closest(".withdrawn-result-item");
        if (!button) return;
        var usercode = button.getAttribute("data-usercode");
        loadWithdrawnEmployees().then(function (people) {
            var person = people.find(function (item) { return item.usercode === usercode; });
            if (person) selectWithdrawnEmployee(person);
        });
    });
    document.addEventListener("click", function (event) {
        if (!event.target.closest(".withdrawn-picker")) refs.withdrawnResults.hidden = true;
    });

    function bindWheel(select) {
        select.addEventListener("wheel", function (event) {
            event.preventDefault();
            var next = Math.min(Math.max(select.selectedIndex + (event.deltaY > 0 ? 1 : -1), 0), select.options.length - 1);
            if (next !== select.selectedIndex) { select.selectedIndex = next; select.dispatchEvent(new Event("change")); }
        }, { passive: false });
    }

    function configureView() {
        document.body.classList.add("view-" + activeView);
        refs.orderView.hidden = activeView !== "orders";
        refs.reportView.hidden = activeView !== "report";
        refs.inventoryView.hidden = activeView !== "inventory";
        if (activeView === "report") {
            refs.viewTitle.textContent = "Warehouse Report";
            refs.viewKicker.textContent = "Monthly operations";
            refs.search.placeholder = "Search account or member";
        } else if (activeView === "inventory") {
            refs.viewTitle.textContent = "Inventory";
            refs.viewKicker.textContent = "Warehouse stock";
            refs.search.placeholder = "Search inventory items";
        } else {
            refs.viewTitle.textContent = "Membership Order";
            refs.viewKicker.textContent = "Meter release desk";
        }
    }

    var today = new Date();
    refs.month.value = String(today.getMonth() + 1);
    if (!refs.year.querySelector('option[value="' + today.getFullYear() + '"]')) refs.year.add(new Option(String(today.getFullYear()), String(today.getFullYear())));
    refs.year.value = String(today.getFullYear());
    [refs.month, refs.year].forEach(function (select) { bindWheel(select); select.addEventListener("change", function () { if (activeView !== "inventory") loadPayments(false); }); });
    refs.area.addEventListener("change", function () { if (activeView !== "inventory") loadPayments(false); });
    refs.search.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { if (activeView === "inventory") renderInventory(); else loadPayments(false); }, 250);
    });
    refs.refresh.addEventListener("click", function () { if (activeView === "inventory") loadInventory(); else loadPayments(true); });
    refs.save.addEventListener("click", saveSelected);
    refs.print.addEventListener("click", function () { printSelected(); });
    refs.energized.addEventListener("click", markEnergizedSelected);
    refs.pendingCount.addEventListener("click", function () {
        pendingOnly = !pendingOnly;
        currentPage = 1;
        if (pendingOnly && selected && !isPendingPayment(selected)) {
            selected = null;
            clearDetails();
        }
        renderList();
        announce(pendingOnly ? "Showing pending new connection requests only." : "Showing all Warehouse requests.");
    });
    refs.cancel.addEventListener("click", function () {
        if (!selected || !window.confirm("Cancel this meter payment order and mark it Rejected?")) return;
        apiFetch("update_meter_payment_status", { method: "POST", body: { applyId: selected.id, status: 0 } })
            .then(function (data) { window.alert(data.message || "Cancelled."); return loadPayments(false); })
            .catch(function (error) { window.alert(error.message); });
    });
    refs.prev.addEventListener("click", function () { if (currentPage > 1) { currentPage -= 1; renderList(); } });
    refs.next.addEventListener("click", function () { if (currentPage < Math.ceil(visibleQueueRows().length / PAGE_SIZE)) { currentPage += 1; renderList(); } });
    meterFieldDefinitions().forEach(function (field) {
        field.input.addEventListener("input", syncActions);
        field.input.addEventListener("change", syncActions);
    });
    configureView();
    if (activeView === "inventory") loadInventory(); else loadPayments(false);
}());
