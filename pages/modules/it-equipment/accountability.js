// IT accountability module ito; dito ayusin ang draft at save flow.
(function () {
    var API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/it-equipment`;
    var accRows = [];
    var draftLines = [];
    var lineUid = 1;
    var empSearchTimer = null;
    var masterRowClickTimer = null;
    var editingFormNo = null;
    var selectedAccRowKey = null;

    var tbody = document.getElementById("acc-master-tbody");
    var searchA = document.getElementById("acc-search-a");
    var searchB = document.getElementById("acc-search-b");
    var newBtn = document.getElementById("acc-new-btn");
    var userNameEl = document.getElementById("ite-acc-user-name");
    var modal = document.getElementById("acc-modal");
    var modalCloseBtn = document.getElementById("acc-modal-close");
    var modalCancelBtn = document.getElementById("acc-modal-cancel");
    var modalSaveBtn = document.getElementById("acc-modal-save");
    var modalPrintBtn = document.getElementById("acc-modal-print");
    var accFormId = document.getElementById("acc-form-id");
    var accDateIssued = document.getElementById("acc-date-issued");
    var accEmployee = document.getElementById("acc-employee-name");
    var accRecipientCode = document.getElementById("acc-recipient-usercode");
    var accPosition = document.getElementById("acc-position");
    var accDepartment = document.getElementById("acc-department");
    var accAccountCode = document.getElementById("acc-account-code");
    var accMaterial = document.getElementById("acc-material-desc");
    var accSerialIn = document.getElementById("acc-line-serial");
    var accQtyIn = document.getElementById("acc-line-qty");
    var linesTbody = document.getElementById("acc-lines-tbody");
    var accTotalQty = document.getElementById("acc-total-qty");
    var cbReleased = document.getElementById("acc-signed-released");
    var cbReceived = document.getElementById("acc-signed-received");
    var empToggle = document.getElementById("acc-emp-toggle");
    var empPicker = document.getElementById("acc-emp-picker");
    var empQ = document.getElementById("acc-emp-q");
    var empResults = document.getElementById("acc-emp-results");
    var modalTitleEl = document.getElementById("acc-modal-title");

    function sessionDisplayName() {
        var raw = localStorage.getItem("samelcii_session");
        if (!raw) return "—";
        try {
            var s = JSON.parse(raw);
            return (s.name || s.username || "—").trim() || "—";
        } catch (_e) {
            return "—";
        }
    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getAuthHeaders(extraHeaders) {
        var headers = extraHeaders ? Object.assign({}, extraHeaders) : {};
        var token = localStorage.getItem("samelcii_token");
        if (token) {
            if (token.split(".").length === 3) {
                headers.Authorization = "Bearer " + token;
            } else {
                localStorage.removeItem("samelcii_token");
            }
        }
        return headers;
    }

    function apiFetch(action, options, extraQuery) {
        var url = API + "?action=" + encodeURIComponent(action);
        if (extraQuery && typeof extraQuery === "object") {
            Object.keys(extraQuery).forEach(function (key) {
                var v = extraQuery[key];
                if (v == null) return;
                url += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(String(v));
            });
        }
        var opts = options || {};
        opts.credentials = "same-origin";
        if (!opts.headers) opts.headers = {};
        var authHeaders = getAuthHeaders();
        Object.keys(authHeaders).forEach(function (key) {
            opts.headers[key] = authHeaders[key];
        });
        if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(url, opts).then(function (res) {
            return res.text().then(function (text) {
                var data;
                try {
                    data = JSON.parse(text);
                } catch (_parseErr) {
                    throw new Error("Server returned non-JSON (" + res.status + "). Check the IT Equipment Node API.");
                }
                if (!res.ok) throw new Error((data && data.message) || res.statusText || "Request failed");
                return data;
            });
        });
    }

    function rowsMatchFilters(r) {
        var q1 = searchA ? searchA.value.trim().toLowerCase() : "";
        var q2 = searchB ? searchB.value.trim().toLowerCase() : "";
        var blob = [
            r.id,
            r.usercode,
            r.username,
            r.formNo,
            r.accountcode,
            r.releasedby,
            r.dateissued,
            r.flagLocation,
        ]
            .join(" ")
            .toLowerCase();
        if (q1 && blob.indexOf(q1) === -1) return false;
        if (q2 && blob.indexOf(q2) === -1) return false;
        return true;
    }

    function renderMaster() {
        if (!tbody) return;
        tbody.innerHTML = "";
        accRows.filter(rowsMatchFilters).forEach(function (r) {
            var tr = document.createElement("tr");
            tr.className = "acc-row" + (r.pending ? " acc-row-pending" : "");
            tr.dataset.formNo = r.formNo;
            tr.title = "Double-click to edit";

            function selectMasterRow(rowTr, row) {
                document.querySelectorAll("#acc-master-tbody tr.acc-row").forEach(function (x) {
                    x.classList.remove("is-selected");
                });
                rowTr.classList.add("is-selected");
                selectedAccRowKey = row.formNo;
            }

            var pendingDot = r.pending ? '<span class="acc-status-dot" aria-hidden="true"></span>' : "";

            tr.innerHTML =
                "<td>" +
                escHtml(r.id) +
                "</td><td>" +
                escHtml(r.usercode) +
                "</td><td>" +
                pendingDot +
                escHtml(r.username) +
                "</td><td>" +
                escHtml(r.dateissued) +
                "</td><td>" +
                escHtml(r.formNo) +
                "</td><td>" +
                escHtml(r.accountcode || "—") +
                "</td><td>" +
                escHtml(r.releasedby) +
                '</td><td class="acc-col-print"><button type="button" class="acc-row-print" title="Print"><i class="fa fa-print" aria-hidden="true"></i></button></td>';

            var printBtn = tr.querySelector(".acc-row-print");
            if (printBtn) {
                printBtn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    printAccRow(r);
                });
            }

            tr.addEventListener("click", function () {
                if (masterRowClickTimer) clearTimeout(masterRowClickTimer);
                masterRowClickTimer = setTimeout(function () {
                    masterRowClickTimer = null;
                    selectMasterRow(tr, r);
                }, 260);
            });

            tr.addEventListener("dblclick", function (e) {
                e.preventDefault();
                if (masterRowClickTimer) {
                    clearTimeout(masterRowClickTimer);
                    masterRowClickTimer = null;
                }
                selectMasterRow(tr, r);
                openEditModal(r);
            });

            tbody.appendChild(tr);
        });

        if (tbody.children.length === 0) {
            var trE = document.createElement("tr");
            trE.className = "acc-empty";
            trE.innerHTML = '<td colspan="8"><span class="acc-muted">No accountability rows yet, or filters hide all records.</span></td>';
            tbody.appendChild(trE);
        }
    }

    function runPrint(html) {
        var w = window.open("", "_blank");
        if (!w) {
            window.alert("Allow pop-ups to print.");
            return;
        }
        w.document.write(html);
        w.document.close();
        setTimeout(function () {
            w.focus();
            w.print();
        }, 180);
    }

    function printAccRow(r) {
        if (!r || !r.formNo) {
            window.alert("Missing form reference.");
            return;
        }

        apiFetch("get_accountability", { method: "GET" }, { formNo: r.formNo })
            .then(function (d) {
                var h = d.header || {};
                runPrint(writePrintHtml(h, d.lines || []));
            })
            .catch(function () {
                runPrint(writePrintHtml(r, []));
            });
    }

    function printModalDraft() {
        var code = accRecipientCode && accRecipientCode.value ? accRecipientCode.value.trim() : "";
        if (!code || !accEmployee || !accEmployee.value.trim()) {
            window.alert("Enter employee user code and name (or use lookup).");

            return;
        }
        var lines = draftLines.map(function (L) {
            return { itemno: L.itemno, description: L.description, serial: L.serial, qty: L.qty };
        });
        var hPreview = {
            usercode: code,
            username: accEmployee.value.trim(),
            dateissued: accDateIssued ? accDateIssued.value : "",
            formNo: accFormId ? accFormId.value : "",
            accountcode: accAccountCode ? accAccountCode.value.trim() : "",
            releasedby: sessionDisplayName(),
            releasedsign: cbReleased && cbReleased.checked ? 1 : 0,
            receivedsign: cbReceived && cbReceived.checked ? 1 : 0,
            flagLocation: siteLabel(getSelectedSite()),
        };

        runPrint(writePrintHtml(hPreview, lines));
    }

    function syncTotal() {
        var t = 0;
        draftLines.forEach(function (L) {
            t += L.qty || 0;
        });
        if (accTotalQty) accTotalQty.textContent = String(t);
    }

    function renderLines() {
        if (!linesTbody) return;
        linesTbody.innerHTML = "";
        draftLines.forEach(function (L) {
            var tr = document.createElement("tr");
            var lid = L._lid;
            tr.innerHTML =
                "<td>" +
                escHtml(L.itemno) +
                "</td><td>" +
                escHtml(L.description) +
                "</td><td>" +
                escHtml(L.serial) +
                "</td><td class=\"num\">" +
                escHtml(L.qty) +
                "</td><td><button type=\"button\" class=\"acc-line-remove\" data-lid=\"" +
                escHtml(lid) +
                "\">Remove</button></td>";
            tr.querySelector(".acc-line-remove").addEventListener("click", function (ev) {
                var id = parseInt(ev.currentTarget.getAttribute("data-lid"), 10);
                draftLines = draftLines.filter(function (x) {
                    return x._lid !== id;
                });
                renderLines();
                syncTotal();
            });
            linesTbody.appendChild(tr);
        });
        syncTotal();
    }

    function getSelectedSite() {
        var r = document.querySelector('input[name="acc-site"]:checked');
        return r ? r.value : "paranas";
    }

    function siteLabel(val) {
        var map = { paranas: "Paranas", catbalogan: "Catbalogan", basey: "Basey", villareal: "Villareal" };

        return map[val] || val;
    }

    function radioValueFromStoredFlag(flag) {
        var f = String(flag == null ? "" : flag).trim();
        var labels = {
            Paranas: "paranas",
            Catbalogan: "catbalogan",
            Basey: "basey",
            Villareal: "villareal",
        };
        if (labels[f]) return labels[f];
        var low = f.toLowerCase();
        if (low.indexOf("catbalogan") !== -1) return "catbalogan";
        if (low.indexOf("villareal") !== -1) return "villareal";
        if (low.indexOf("basey") !== -1) return "basey";
        if (low.indexOf("paranas") !== -1 || low === "") return "paranas";
        return ["paranas", "catbalogan", "basey", "villareal"].indexOf(low) !== -1 ? low : "paranas";
    }

    function applyHeaderToModal(h) {
        if (!h) return;
        if (accFormId) accFormId.value = String(h.formNo || "").trim();
        if (accRecipientCode) accRecipientCode.value = String(h.usercode || "").trim();
        if (accEmployee) accEmployee.value = String(h.username || "").trim();
        if (accAccountCode) accAccountCode.value = String(h.accountcode || "").trim();
        if (accDateIssued) accDateIssued.value = String(h.dateissued || "").slice(0, 10);
        if (cbReleased) cbReleased.checked = !!h.releasedsign;
        if (cbReceived) cbReceived.checked = !!h.receivedsign;
        var siteVal = radioValueFromStoredFlag(h.flagLocation);
        document.querySelectorAll('input[name="acc-site"]').forEach(function (radio) {
            radio.checked = radio.value === siteVal;
        });
    }

    function setDraftLinesFromServer(lines) {
        draftLines = [];
        (lines || []).forEach(function (L) {
            var qty = parseInt(L.qty, 10) || 1;
            draftLines.push({
                _lid: lineUid++,
                itemno: String(L.itemno || "").trim() || "(item)",
                description: String(L.description || L.itemno || "").trim() || "(item)",
                serial: String(L.serial || "").trim() || "—",
                qty: qty,
            });
        });
        renderLines();
        syncTotal();
    }

    function writePrintHtml(h, lines) {
        lines = lines || [];
        var fn = h.formNo || "—";
        var html =
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
            escHtml(fn) +
            "</title><style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:24px;color:#0f172a;}h1{font-size:18px;}table{border-collapse:collapse;width:100%;max-width:720px;}th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;}th{background:#f8fafc;}th.mini{width:12%;}</style></head><body>";
        html += "<h1>IT accountability — " + escHtml(fn) + "</h1>";
        html +=
            "<p><strong>" +
            escHtml(h.flagLocation || "") +
            "</strong></p><table><caption style=\"caption-side:bottom;text-align:left;padding-top:8px;color:#64748b\">SAMELCII — Accountability</caption>";
        html +=
            "<tr><th>User code</th><td>" +
            escHtml(h.usercode || "") +
            "</td></tr><tr><th>Name</th><td>" +
            escHtml(h.username || "") +
            "</td></tr><tr><th>Date issued</th><td>" +
            escHtml(String(h.dateissued || "")) +
            "</td></tr><tr><th>Form no.</th><td>" +
            escHtml(String(h.formNo || "")) +
            "</td></tr><tr><th>Account code</th><td>" +
            escHtml(String(h.accountcode || "—")) +
            '</td></tr><tr><th>Released by</th><td>' +
            escHtml(String(h.releasedby || "")) +
            '</td></tr><tr><th>Signatures</th><td>Released ' +
            (h.releasedsign ? "Yes" : "No") +
            " · Received " +
            (h.receivedsign ? "Yes" : "No") +
            "</td></tr></table>";

        html += "<h2 style=\"margin-top:20px;font-size:15px\">Materials</h2>";
        html += "<table><thead><tr><th>Item code</th><th>Description</th><th>Serial</th><th class=\"mini\">Qty</th></tr></thead><tbody>";
        lines.forEach(function (L) {
            html +=
                "<tr><td>" +
                escHtml(L.itemno || "") +
                "</td><td>" +
                escHtml(L.description || "") +
                "</td><td>" +
                escHtml(L.serial || "") +
                '</td><td style="text-align:right">' +
                escHtml(L.qty) +
                "</td></tr>";
        });
        html += "</tbody></table>";

        html += "</body></html>";
        return html;
    }

    function normalizeItemCode(text) {
        return String(text || "").trim();
    }

    function upsertDraftLine(primaryKeyText, serialRaw, qtyAdd) {
        var itemno = normalizeItemCode(primaryKeyText);
        if (!itemno) {
            window.alert("Enter materials / description first.");
            return;
        }
        var serial = normalizeItemCode(serialRaw) || "—";
        var add = qtyAdd || 1;
        if (add <= 0) add = 1;

        var found = -1;
        for (var i = 0; i < draftLines.length; i++) {
            if (draftLines[i].itemno === itemno) {
                found = i;
                break;
            }
        }
        if (found >= 0) {
            draftLines[found].qty += add;
            if (serial !== "—") draftLines[found].serial = serial;

            draftLines[found].description =
                String(draftLines[found].description || "").trim().length >= String(itemno).trim().length
                    ? draftLines[found].description
                    : itemno;

        } else {
            draftLines.push({
                _lid: lineUid++,
                itemno: itemno,
                description: itemno,
                serial: serial,
                qty: add,
            });
        }
        if (accMaterial) accMaterial.value = "";
        if (accSerialIn) accSerialIn.value = "";
        if (accQtyIn) accQtyIn.value = "1";
        renderLines();
        syncTotal();
    }

    function addLineFromInputs() {
        var qRaw = accQtyIn && accQtyIn.value ? accQtyIn.value : "1";
        var qty = parseInt(qRaw, 10) || 1;
        var serial = accSerialIn ? accSerialIn.value.trim() : "";
        var mat = accMaterial ? accMaterial.value.trim() : "";
        upsertDraftLine(mat, serial, qty);
    }

    function fetchNextFormNo() {
        return apiFetch("next_accountability_formno", { method: "GET" }).then(function (d) {
            if (accFormId && d.formNo) accFormId.value = d.formNo;
        });
    }

    function loadMaster() {
        return apiFetch("list_accountability", { method: "GET" })
            .then(function (d) {
                accRows = d.rows || [];
                renderMaster();
            })
            .catch(function (err) {
                window.alert(err.message || String(err));
            });
    }

    function openEditModal(row) {
        if (!modal || !row || !row.formNo) return;

        editingFormNo = String(row.formNo).trim();

        closeEmpPicker();
        draftLines = [];
        renderLines();
        syncTotal();
        if (accMaterial) accMaterial.blur();

        if (modalTitleEl) modalTitleEl.textContent = "Edit accountability";

        return apiFetch("get_accountability", { method: "GET" }, { formNo: row.formNo })

            .then(function (data) {

                applyHeaderToModal(data.header || {});

                setDraftLinesFromServer(data.lines || []);

                modal.classList.add("is-open");
                modal.setAttribute("aria-hidden", "false");
                document.body.classList.add("ite-modal-open");

                editingFormNo = ((data.header && data.header.formNo) || editingFormNo).trim();

                if (accMaterial) accMaterial.focus();

            })

            .catch(function (err) {

                editingFormNo = null;

                if (modalTitleEl) modalTitleEl.textContent = "New accountability";

                window.alert((err && err.message) || String(err));

            });
    }

    function openModal() {
        editingFormNo = null;
        if (modalTitleEl) modalTitleEl.textContent = "New accountability";

        draftLines = [];
        if (accDateIssued) accDateIssued.value = new Date().toISOString().slice(0, 10);
        if (accEmployee) accEmployee.value = "";
        if (accRecipientCode) accRecipientCode.value = "";
        if (accPosition) accPosition.value = "";
        if (accDepartment) accDepartment.value = "";
        if (accMaterial) accMaterial.value = "";
        if (accSerialIn) accSerialIn.value = "";
        if (accQtyIn) accQtyIn.value = "1";
        if (accAccountCode) accAccountCode.value = "";
        if (cbReleased) cbReleased.checked = false;
        if (cbReceived) cbReceived.checked = false;
        document.querySelectorAll('input[name="acc-site"]').forEach(function (r, i) {
            r.checked = i === 0;
        });
        closeEmpPicker();
        renderLines();
        syncTotal();
        return fetchNextFormNo().then(function () {
            if (modal) {
                modal.classList.add("is-open");
                modal.setAttribute("aria-hidden", "false");
            }
            document.body.classList.add("ite-modal-open");
            if (accMaterial) accMaterial.focus();
        });
    }

    function closeModal() {
        editingFormNo = null;
        if (modalTitleEl) modalTitleEl.textContent = "New accountability";

        closeEmpPicker();
        if (modal) {
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("ite-modal-open");
    }

    function closeEmpPicker() {
        if (empPicker) empPicker.hidden = true;
        if (empResults) {
            empResults.innerHTML = "";
            empResults.hidden = true;
        }
        if (empQ) empQ.value = "";
    }

    function toggleEmpPicker() {
        if (!empPicker) return;
        empPicker.hidden = !empPicker.hidden;
        if (!empPicker.hidden && empQ) {
            empQ.focus();
            renderEmpResults([]);
        }
    }

    function renderEmpResults(items) {
        if (!empResults) return;

        var qlen = empQ ? empQ.value.trim().length : 0;

        empResults.innerHTML = "";

        if (qlen < 2) {
            empResults.hidden = true;
            return;
        }

        empResults.hidden = false;

        (items || []).forEach(function (it) {
            var li = document.createElement("li");
            var b = document.createElement("button");
            b.type = "button";
            b.innerHTML =
                "<strong>" +
                escHtml(it.name) +
                '</strong><br><span class="acc-muted">' +
                escHtml(it.usercode) +
                "</span>";
            b.addEventListener("click", function () {
                if (accRecipientCode) accRecipientCode.value = String(it.usercode || "").trim();
                if (accEmployee) accEmployee.value = String(it.name || "").trim();
                if (accPosition) accPosition.value = String(it.position || "").trim();
                if (accDepartment) accDepartment.value = String(it.department || "").trim();
                closeEmpPicker();
            });
            li.appendChild(b);
            empResults.appendChild(li);
        });

        if ((items || []).length === 0) {
            empResults.innerHTML =
                '<li><span class="acc-muted">No matches found. Adjust your search.</span></li>';
        }
    }

    function runEmpSearch() {
        var q = empQ ? empQ.value.trim() : "";
        if (q.length < 2) {
            renderEmpResults([]);
            return;
        }
        apiFetch("search_users", { method: "GET" }, { q: q })
            .then(function (d) {
                renderEmpResults(d.items || []);
            })
            .catch(function () {
                renderEmpResults([]);
            });
    }

    function debouncedEmpSearch() {
        if (empSearchTimer) clearTimeout(empSearchTimer);
        empSearchTimer = setTimeout(runEmpSearch, 280);
    }

    function saveModal() {
        var uid = accRecipientCode ? accRecipientCode.value.trim() : "";
        var unm = accEmployee ? accEmployee.value.trim() : "";
        if (!uid || !unm) {
            window.alert("Enter employee user code and name (or use … lookup).");

            return;
        }

        var di = accDateIssued ? accDateIssued.value.trim() : "";
        if (!di) {

            window.alert("Date issued is required.");

            return;

        }

        if (draftLines.length === 0) {

            window.alert("Add at least one material line.");

            return;

        }



        var payload = {

            recipientUsercode: uid,

            recipientName: unm,

            dateissued: di,

            formNo: accFormId ? accFormId.value.trim() : "",

            accountCode: accAccountCode ? accAccountCode.value.trim() : "",

            flagLocation: siteLabel(getSelectedSite()),

            releasedsign: cbReleased && cbReleased.checked ? 1 : 0,

            receivedsign: cbReceived && cbReceived.checked ? 1 : 0,

            lines: draftLines.map(function (L) {

                return {

                    itemno: L.itemno,

                    description: L.description,

                    serial: L.serial === "—" ? "" : L.serial,

                    qty: L.qty,

                };

            }),

        };



        var action = editingFormNo ? "update_accountability" : "save_accountability";

        var body = editingFormNo ? Object.assign({}, payload, { existingFormNo: editingFormNo }) : payload;



        if (modalSaveBtn) modalSaveBtn.disabled = true;

        apiFetch(action, { method: "POST", body: body })

            .then(function (data) {

                window.alert(data.message || "Saved.");

                closeModal();

                return loadMaster();

            })

            .catch(function (err) {

                window.alert(err.message || String(err));

            })

            .then(function () {

                if (modalSaveBtn) modalSaveBtn.disabled = false;

            });

    }



    if (userNameEl) userNameEl.textContent = sessionDisplayName();



    if (newBtn) {

        newBtn.addEventListener("click", function () {

            openModal();

        });

    }

    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);

    if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);

    if (modalSaveBtn) modalSaveBtn.addEventListener("click", saveModal);

    if (modalPrintBtn) modalPrintBtn.addEventListener("click", printModalDraft);



    if (modal) {

        modal.addEventListener("click", function (e) {

            var tgt = e.target;

            var addBtnEl = tgt && tgt.closest ? tgt.closest("#acc-add-line") : null;

            if (tgt && (tgt.id === "acc-add-line" || addBtnEl)) {

                e.preventDefault();

                addLineFromInputs();

            }

        });

    }



    function bindEnterAddsLine(el) {

        if (!el) return;

        el.addEventListener("keydown", function (e) {

            if (e.key !== "Enter") return;

            e.preventDefault();

            addLineFromInputs();

        });

    }

    bindEnterAddsLine(accMaterial);

    bindEnterAddsLine(accSerialIn);

    if (accQtyIn) {

        accQtyIn.addEventListener("keydown", function (e) {

            if (e.key === "Enter") {

                e.preventDefault();

                addLineFromInputs();

            }

        });

    }



    if (empToggle) {

        empToggle.addEventListener("click", function () {

            toggleEmpPicker();

        });

    }

    if (empQ) {

        empQ.addEventListener("input", debouncedEmpSearch);

    }



    document.addEventListener("click", function (e) {

        if (

            empPicker &&

            !empPicker.hidden &&

            !empPicker.contains(e.target) &&

            e.target !== empToggle

        ) {

            closeEmpPicker();

        }

    });



    if (searchA) searchA.addEventListener("input", renderMaster);

    if (searchB) searchB.addEventListener("input", renderMaster);



    document.addEventListener("keydown", function (e) {

        if (e.key === "Escape" && modal && modal.classList.contains("is-open")) {

            if (empPicker && !empPicker.hidden) closeEmpPicker();

            else closeModal();

        }

    });



    loadMaster();

})();


