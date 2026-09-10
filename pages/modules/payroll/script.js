// ============================================================
// FILE: script.js
// PURPOSE: Connects the Payroll Phase 2 workspace to the Node API using the dashboard session.
// EDIT GUIDE: API port and cache behavior are in the constants block.
// HUWAG BAGUHIN: Reuse the dashboard token; never collect another password here.
// ============================================================

(function () {
    "use strict";

    // ============================================================
    // [CONFIG] API AND EXISTING DASHBOARD SESSION
    // ============================================================
    const host = window.location.hostname || "127.0.0.1";
    const API_BASE = `http://${host}:3000/api/payroll`;
    const SEARCH_DELAY_MS = 250;

    const state = {
        token: localStorage.getItem("samelcii_token") || "",
        employees: [],
        runs: [],
        components: [],
        currentRegister: null,
        currentReconciliation: null,
        currentPhase8Report: null,
        parallelTests: [],
        currentPhase9Readiness: null,
        uatCycles: [],
        currentPhase10Readiness: null,
        operationsWindows: [],
        currentPhase11Readiness: null,
        compliancePeriods: [],
        currentPhase12Readiness: null,
        searchTimer: null,
        modalTrigger: null,
    };

    const nodes = {
        serviceState: document.getElementById("service-state"),
        serviceLabel: document.getElementById("service-state-label"),
        notice: document.getElementById("payroll-notice"),
        workspace: document.getElementById("payroll-workspace"),
        employeeSearch: document.getElementById("employee-search"),
        employeeBody: document.getElementById("employee-table-body"),
        refreshEmployees: document.getElementById("refresh-employees"),
        rates: document.getElementById("overtime-rate-list"),
        calculator: document.getElementById("overtime-calculator"),
        calculateButton: document.getElementById("calculate-ot-button"),
        calculationResult: document.getElementById("calculation-result"),
        calculationTime: document.getElementById("calculation-time"),
        calculationAmount: document.getElementById("calculation-amount"),
        runForm: document.getElementById("payroll-run-form"),
        runCreate: document.getElementById("run-create"),
        runBody: document.getElementById("payroll-run-body"),
        runDetail: document.getElementById("payroll-run-detail"),
        salaryImportForm: document.getElementById("salary-import-form"),
        salaryImportButton: document.getElementById("salary-import-button"),
        salaryImportResult: document.getElementById("salary-import-result"),
        scheduleTemplateForm: document.getElementById("schedule-template-form"),
        scheduleAssignForm: document.getElementById("schedule-assign-form"),
        scheduleTemplate: document.getElementById("schedule-template"),
        phase5Status: document.getElementById("phase5-status"),
        phase5Summary: document.getElementById("phase5-summary"),
        componentForm: document.getElementById("component-form"),
        assignmentForm: document.getElementById("component-assignment-form"),
        assignmentComponent: document.getElementById("assignment-component"),
        loanForm: document.getElementById("loan-form"),
        statutoryForm: document.getElementById("statutory-rule-form"),
        statutoryComponent: document.getElementById("statutory-component"),
        adjustmentForm: document.getElementById("adjustment-form"),
        adjustmentRun: document.getElementById("adjustment-run"),
        phase6Status: document.getElementById("phase6-status"),
        phase6Summary: document.getElementById("phase6-summary"),
        phase6Form: document.getElementById("phase6-action-form"),
        phase6Run: document.getElementById("phase6-run"),
        phase6Note: document.getElementById("phase6-note"),
        phase6Approve: document.getElementById("phase6-approve"),
        phase6Release: document.getElementById("phase6-release"),
        phase6Register: document.getElementById("phase6-register"),
        phase6Employee: document.getElementById("phase6-employee"),
        phase6Payslip: document.getElementById("phase6-payslip"),
        phase6Export: document.getElementById("phase6-export"),
        phase6Output: document.getElementById("phase6-output"),
        phase7Status: document.getElementById("phase7-status"),
        phase7Summary: document.getElementById("phase7-summary"),
        phase7Run: document.getElementById("phase7-run"),
        phase7BatchCode: document.getElementById("phase7-batch-code"),
        phase7Method: document.getElementById("phase7-method"),
        phase7Prepare: document.getElementById("phase7-prepare"),
        phase7PrepareRemittances: document.getElementById("phase7-remittances"),
        phase7Refresh: document.getElementById("phase7-refresh"),
        phase7BatchStatus: document.getElementById("phase7-batch-status"),
        phase7Reference: document.getElementById("phase7-reference"),
        phase7Reason: document.getElementById("phase7-reason"),
        phase7UpdateBatch: document.getElementById("phase7-update-batch"),
        phase7Remittance: document.getElementById("phase7-remittance"),
        phase7RemittanceStatus: document.getElementById("phase7-remittance-status"),
        phase7UpdateRemittance: document.getElementById("phase7-update-remittance"),
        phase7Output: document.getElementById("phase7-output"),
        phase8Status: document.getElementById("phase8-status"),
        phase8Summary: document.getElementById("phase8-summary"),
        phase8MappingForm: document.getElementById("phase8-mapping-form"),
        phase8SaveMapping: document.getElementById("phase8-save-mapping"),
        phase8Run: document.getElementById("phase8-run"),
        phase8Reports: document.getElementById("phase8-reports"),
        phase8Journal: document.getElementById("phase8-journal"),
        phase8Export: document.getElementById("phase8-export"),
        phase8YtdUser: document.getElementById("phase8-ytd-user"),
        phase8YtdYear: document.getElementById("phase8-ytd-year"),
        phase8Ytd: document.getElementById("phase8-ytd"),
        phase8CloseNote: document.getElementById("phase8-close-note"),
        phase8CloseConfirm: document.getElementById("phase8-close-confirm"),
        phase8Close: document.getElementById("phase8-close"),
        phase8Output: document.getElementById("phase8-output"),
        phase9Status: document.getElementById("phase9-status"),
        phase9Summary: document.getElementById("phase9-summary"),
        phase9TestForm: document.getElementById("phase9-test-form"),
        phase9Run: document.getElementById("phase9-run"),
        phase9TestCode: document.getElementById("phase9-test-code"),
        phase9Tolerance: document.getElementById("phase9-tolerance"),
        phase9File: document.getElementById("phase9-file"),
        phase9Compare: document.getElementById("phase9-compare"),
        phase9Test: document.getElementById("phase9-test"),
        phase9ViewTest: document.getElementById("phase9-view-test"),
        phase9Readiness: document.getElementById("phase9-readiness"),
        phase9Role: document.getElementById("phase9-role"),
        phase9Statement: document.getElementById("phase9-statement"),
        phase9Confirm: document.getElementById("phase9-confirm"),
        phase9Sign: document.getElementById("phase9-sign"),
        phase9Output: document.getElementById("phase9-output"),
        phase10Status: document.getElementById("phase10-status"),
        phase10Summary: document.getElementById("phase10-summary"),
        phase10Cycle: document.getElementById("phase10-cycle"),
        phase10Refresh: document.getElementById("phase10-refresh"),
        phase10CycleForm: document.getElementById("phase10-cycle-form"),
        phase10Test: document.getElementById("phase10-test"),
        phase10CycleCode: document.getElementById("phase10-cycle-code"),
        phase10Scope: document.getElementById("phase10-scope"),
        phase10Create: document.getElementById("phase10-create"),
        phase10CaseForm: document.getElementById("phase10-case-form"),
        phase10SaveCase: document.getElementById("phase10-save-case"),
        phase10IssueForm: document.getElementById("phase10-issue-form"),
        phase10SaveIssue: document.getElementById("phase10-save-issue"),
        phase10AuthorizeForm: document.getElementById("phase10-authorize-form"),
        phase10Confirm: document.getElementById("phase10-confirm"),
        phase10Authorize: document.getElementById("phase10-authorize"),
        phase10Output: document.getElementById("phase10-output"),
        phase11Status: document.getElementById("phase11-status"),
        phase11Summary: document.getElementById("phase11-summary"),
        phase11Window: document.getElementById("phase11-window"),
        phase11Refresh: document.getElementById("phase11-refresh"),
        phase11WindowForm: document.getElementById("phase11-window-form"),
        phase11Authorization: document.getElementById("phase11-authorization"),
        phase11CreateWindow: document.getElementById("phase11-create-window"),
        phase11ChecklistForm: document.getElementById("phase11-checklist-form"),
        phase11SaveCheck: document.getElementById("phase11-save-check"),
        phase11IncidentForm: document.getElementById("phase11-incident-form"),
        phase11SaveIncident: document.getElementById("phase11-save-incident"),
        phase11ActionForm: document.getElementById("phase11-action-form"),
        phase11SaveAction: document.getElementById("phase11-save-action"),
        phase11StatusForm: document.getElementById("phase11-status-form"),
        phase11Confirm: document.getElementById("phase11-confirm"),
        phase11SaveStatus: document.getElementById("phase11-save-status"),
        phase11Output: document.getElementById("phase11-output"),
        phase12Status: document.getElementById("phase12-status"),
        phase12Summary: document.getElementById("phase12-summary"),
        phase12Period: document.getElementById("phase12-period"),
        phase12Refresh: document.getElementById("phase12-refresh"),
        phase12PeriodForm: document.getElementById("phase12-period-form"),
        phase12CreatePeriod: document.getElementById("phase12-create-period"),
        phase12ReportForm: document.getElementById("phase12-report-form"),
        phase12Run: document.getElementById("phase12-run"),
        phase12Amendment: document.getElementById("phase12-amendment"),
        phase12PrepareReport: document.getElementById("phase12-prepare-report"),
        phase12FilingForm: document.getElementById("phase12-filing-form"),
        phase12Report: document.getElementById("phase12-report"),
        phase12FilingConfirm: document.getElementById("phase12-filing-confirm"),
        phase12SaveFiling: document.getElementById("phase12-save-filing"),
        phase12DownloadReport: document.getElementById("phase12-download-report"),
        phase12YearEndForm: document.getElementById("phase12-year-end-form"),
        phase12GenerateYearEnd: document.getElementById("phase12-generate-year-end"),
        phase12YearRecord: document.getElementById("phase12-year-record"),
        phase12SaveYearStatus: document.getElementById("phase12-save-year-status"),
        phase12DownloadYearEnd: document.getElementById("phase12-download-year-end"),
        phase12CloseForm: document.getElementById("phase12-close-form"),
        phase12CloseConfirm: document.getElementById("phase12-close-confirm"),
        phase12Close: document.getElementById("phase12-close"),
        phase12Output: document.getElementById("phase12-output"),
        modal: document.getElementById("compensation-modal"),
        modalBackdrop: document.getElementById("compensation-backdrop"),
        modalClose: document.getElementById("compensation-close"),
        modalCancel: document.getElementById("compensation-cancel"),
        compensationForm: document.getElementById("compensation-form"),
        compensationSave: document.getElementById("compensation-save"),
    };

    // ============================================================
    // [HELPER] DISPLAY AND REQUEST STATE
    // ============================================================
    function setButtonState(button, busy, resultState) {
        button.setAttribute("aria-busy", busy ? "true" : "false");
        button.disabled = Boolean(busy);
        if (resultState) {
            button.dataset.state = resultState;
            window.setTimeout(() => delete button.dataset.state, 1600);
        }
    }

    function showNotice(message, tone) {
        nodes.notice.textContent = String(message || "");
        nodes.notice.dataset.state = tone || "info";
        nodes.notice.hidden = !message;
    }

    function setServiceState(value, label) {
        nodes.serviceState.dataset.state = value;
        nodes.serviceLabel.textContent = label;
    }

    async function request(path, options) {
        const settings = Object.assign({ method: "GET" }, options || {});
        settings.headers = Object.assign({}, settings.headers || {});
        if (settings.body) settings.headers["Content-Type"] = "application/json";
        if (state.token) {
            settings.headers.Authorization = `Bearer ${state.token}`;
        }

        const response = await fetch(`${API_BASE}${path}`, settings);
        const payload = await response.json().catch(() => ({
            ok: false,
            message: "Payroll service returned an unreadable response.",
        }));
        if (!response.ok) {
            throw new Error(payload.message || `Payroll request failed (${response.status}).`);
        }
        return payload;
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value ?? "—");
    }

    function setGate(id, ready, readyText, blockedText) {
        const gate = document.getElementById(id);
        if (!gate) return;
        gate.dataset.state = ready ? "ready" : "blocked";
        const status = gate.querySelector("strong");
        if (status) status.textContent = ready ? readyText : blockedText;
    }

    function money(value) {
        if (value === null || value === undefined || value === "") return "Not configured";
        const amount = Number(value);
        return Number.isFinite(amount)
            ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)
            : "Not configured";
    }

    // ============================================================
    // [API] FOUNDATION METRICS AND RATE STATUS
    // ============================================================
    function renderRates(rates) {
        nodes.rates.replaceChildren();
        if (!Array.isArray(rates) || rates.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-copy";
            empty.textContent = "Run the Phase 2 migration to load OT configuration.";
            nodes.rates.appendChild(empty);
            return;
        }

        rates.forEach((rate) => {
            const row = document.createElement("div");
            row.className = "rate-row";
            const copy = document.createElement("div");
            const label = document.createElement("span");
            const status = document.createElement("small");
            const multiplier = document.createElement("strong");
            label.textContent = rate.label || rate.rate_code;
            status.textContent = Number(rate.requires_confirmation) === 1
                ? "Needs rule clarification"
                : (Number(rate.is_enabled) === 1 ? "Confirmed and enabled" : "Disabled");
            multiplier.textContent = Number(rate.multiplier).toFixed(2);
            copy.append(label, status);
            row.append(copy, multiplier);
            nodes.rates.appendChild(row);
        });
    }

    function renderFoundation(payload) {
        const metrics = payload.metrics || {};
        setText("metric-employees", metrics.employees);
        setText("metric-salaries", metrics.configuredSalaries);
        setText("metric-identities", Number(metrics.missingUsercode || 0) + Number(metrics.missingBio || 0));
        setText("metric-schedules", metrics.schedules);

        const salaryReady = Number(metrics.employees || 0) > 0
            && Number(metrics.configuredSalaries || 0) === Number(metrics.employees || 0);
        const scheduleReady = Number(metrics.schedules || 0) > 0;
        const rates = Array.isArray(payload.overtimeRates) ? payload.overtimeRates : [];
        const multiplierReady = rates.length > 0
            && !rates.some((rate) => Number(rate.requires_confirmation) === 1);

        setGate("gate-schema", Boolean(payload.schemaReady), "Ready", "Migration required");
        setGate("gate-salary", salaryReady, "Complete", "Incomplete");
        setGate("gate-schedule", scheduleReady, "Available", "No schedules");
        setGate("gate-multiplier", multiplierReady, "Resolved", "Decision required");
        setText(
            "readiness-summary",
            payload.schemaReady
                ? "The Phase 2 schema is available. Payroll computation remains blocked until salary, schedule, and multiplier gates are complete."
                : "Apply the reviewed Phase 2 migration before maintaining employee compensation."
        );
        renderRates(rates);
    }

    async function loadFoundation() {
        const payload = await request("/foundation");
        renderFoundation(payload);
    }

    // ============================================================
    // [UI] EMPLOYEE MASTER TABLE — DOM nodes prevent data-driven HTML injection.
    // ============================================================
    function tableMessage(message) {
        nodes.employeeBody.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "table-message";
        cell.textContent = message;
        row.appendChild(cell);
        nodes.employeeBody.appendChild(row);
    }

    function renderEmployees(items, schemaReady) {
        state.employees = Array.isArray(items) ? items : [];
        nodes.employeeBody.replaceChildren();
        if (state.employees.length === 0) {
            tableMessage("No employees match the current search.");
            return;
        }

        state.employees.forEach((employee) => {
            const row = document.createElement("tr");
            const employeeCell = document.createElement("td");
            const identity = document.createElement("div");
            const name = document.createElement("strong");
            const code = document.createElement("small");
            identity.className = "employee-cell";
            name.textContent = employee.name || "Unnamed employee";
            code.textContent = employee.usercode || "Missing employee code";
            identity.append(name, code);
            employeeCell.appendChild(identity);

            const department = document.createElement("td");
            department.textContent = employee.department || "Not assigned";
            department.className = "secondary-value";

            const basis = document.createElement("td");
            basis.textContent = employee.pay_basis || "Not configured";

            const salary = document.createElement("td");
            salary.className = "money-value";
            salary.textContent = money(employee.basic_monthly);
            if (employee.effective_date) {
                const effective = document.createElement("small");
                effective.className = "secondary-value";
                effective.textContent = ` from ${String(employee.effective_date).slice(0, 10)}`;
                salary.appendChild(effective);
            }

            const readiness = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = "readiness-badge";
            badge.dataset.state = employee.readiness === "READY" ? "ready" : "blocked";
            badge.textContent = employee.readiness || "Needs review";
            readiness.appendChild(badge);

            const action = document.createElement("td");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "button button-quiet";
            button.textContent = employee.basic_monthly ? "Add new rate" : "Set basic pay";
            button.disabled = !schemaReady || !employee.usercode;
            button.addEventListener("click", () => openCompensation(employee, button));
            action.appendChild(button);

            row.append(employeeCell, department, basis, salary, readiness, action);
            nodes.employeeBody.appendChild(row);
        });
    }

    async function loadEmployees() {
        tableMessage("Loading employee payroll records…");
        try {
            const query = encodeURIComponent(nodes.employeeSearch.value.trim());
            const payload = await request(`/employees?q=${query}`);
            renderEmployees(payload.items, payload.schemaReady);
        } catch (error) {
            tableMessage(error.message);
            showNotice(error.message, "error");
        }
    }

    // ============================================================
    // [FORM] COMPENSATION HISTORY — append-only, may audit reference.
    // ============================================================
    function setModalOpen(open) {
        nodes.modal.hidden = !open;
        document.body.style.overflow = open ? "hidden" : "";
        if (open) {
            document.getElementById("compensation-basic").focus();
        } else if (state.modalTrigger) {
            state.modalTrigger.focus();
        }
    }

    function openCompensation(employee, trigger) {
        state.modalTrigger = trigger;
        document.getElementById("compensation-usercode").value = employee.usercode || "";
        document.getElementById("compensation-code-display").value = employee.usercode || "";
        document.getElementById("compensation-employee-name").textContent = employee.name || "Employee";
        document.getElementById("compensation-group").value = employee.payroll_group || "REGULAR";
        document.getElementById("compensation-basis").value = employee.pay_basis || "MONTHLY";
        document.getElementById("compensation-basic").value = "";
        document.getElementById("compensation-date").value = new Date().toISOString().slice(0, 10);
        document.getElementById("compensation-reason").value = "";
        setModalOpen(true);
    }

    async function saveCompensation(event) {
        event.preventDefault();
        if (!nodes.compensationForm.reportValidity()) return;
        setButtonState(nodes.compensationSave, true);
        try {
            const payload = await request("/compensation", {
                method: "POST",
                body: JSON.stringify({
                    usercode: document.getElementById("compensation-usercode").value,
                    payrollGroup: document.getElementById("compensation-group").value.trim(),
                    payBasis: document.getElementById("compensation-basis").value,
                    basicPay: document.getElementById("compensation-basic").value.trim(),
                    effectiveDate: document.getElementById("compensation-date").value,
                    reason: document.getElementById("compensation-reason").value.trim(),
                }),
            });
            setButtonState(nodes.compensationSave, false, "success");
            setModalOpen(false);
            showNotice(payload.message, "success");
            await Promise.all([loadFoundation(), loadEmployees()]);
        } catch (error) {
            setButtonState(nodes.compensationSave, false, "error");
            showNotice(error.message, "error");
        }
    }

    // ============================================================
    // [LOGIC] OT PREVIEW — Node owns the formula and accepted-time rule.
    // ============================================================
    async function calculateOvertime(event) {
        event.preventDefault();
        if (!nodes.calculator.reportValidity()) return;
        setButtonState(nodes.calculateButton, true);
        nodes.calculationResult.hidden = true;
        try {
            const payload = await request("/calculate/ot", {
                method: "POST",
                body: JSON.stringify({
                    workdayClassification: "OFFICE_DAY",
                    basicPay: document.getElementById("calculator-basic").value.trim(),
                    approvedStart: document.getElementById("calculator-approved-start").value,
                    approvedEnd: document.getElementById("calculator-approved-end").value,
                    actualIn: document.getElementById("calculator-actual-in").value,
                    actualOut: document.getElementById("calculator-actual-out").value,
                    unpaidBreakMinutes: 0,
                    multiplier: document.getElementById("calculator-multiplier").value,
                }),
            });
            nodes.calculationTime.textContent = `${payload.window.payableMinutes} minutes`;
            nodes.calculationAmount.textContent = payload.calculation
                ? money(payload.calculation.amount)
                : "No automatic OT";
            nodes.calculationResult.hidden = false;
            setButtonState(nodes.calculateButton, false, "success");
        } catch (error) {
            setButtonState(nodes.calculateButton, false, "error");
            showNotice(error.message, "error");
        }
    }

    async function loadWorkspace() {
        try {
            await Promise.all([loadFoundation(), loadEmployees(), loadRuns(), loadSchedules(), loadPhase5(), loadPhase6(), loadPhase7(), loadPhase8(), loadPhase9(), loadPhase10(), loadPhase11(), loadPhase12()]);
            renderHybridSummary();
        } catch (error) {
            showNotice(error.message, "error");
        }
    }

    // ============================================================
    // [PHASE 3] DRAFT PAYROLL RUNS
    // ============================================================
    function runCell(row, value, className) {
        const cell = document.createElement("td");
        cell.textContent = String(value ?? "");
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    }

    async function showRun(id) {
        try {
            const payload = await request(`/runs/${id}`);
            const blocked = payload.exceptions.filter((item) => item.severity === "BLOCKING" && !Number(item.is_resolved));
            nodes.runDetail.replaceChildren();
            const title = document.createElement("strong");
            title.textContent = `${payload.run.run_code} review`;
            const summary = document.createElement("span");
            summary.textContent = `${payload.employees.length} employees · Gross ${money(payload.run.gross_total)} · Deductions ${money(payload.run.deduction_total)} · Net ${money(payload.run.net_total)}`;
            if (payload.approval) summary.textContent += ` · Approved by ${payload.approval.approved_by}`;
            if (payload.release) summary.textContent += ` · Released ${payload.release.release_code}`;
            const list = document.createElement("ul");
            blocked.slice(0, 8).forEach((item) => {
                const entry = document.createElement("li");
                entry.textContent = `${item.usercode || "Run"}: ${item.message}`;
                list.appendChild(entry);
            });
            const ledger = document.createElement("div");
            ledger.className = "run-ledger";
            const grouped = (payload.items || []).reduce((result, item) => {
                const key = `${item.component_type}:${item.component_code}`;
                result[key] = (result[key] || 0) + Number(item.amount || 0);
                return result;
            }, {});
            Object.entries(grouped).slice(0, 12).forEach(([key, amount]) => {
                const entry = document.createElement("span");
                const [type, code] = key.split(":");
                entry.dataset.type = type;
                entry.textContent = `${code} ${money(amount)}`;
                ledger.appendChild(entry);
            });
            nodes.runDetail.append(title, summary, ledger, list);
            nodes.runDetail.hidden = false;
        } catch (error) {
            showNotice(error.message, "error");
        }
    }

    async function runAction(id, action, button) {
        setButtonState(button, true);
        try {
            const payload = await request(`/runs/${id}/${action}`, { method: "POST" });
            showNotice(payload.message, "success");
            await loadRuns();
            await showRun(id);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(button, false);
        }
    }

    function renderRuns(items) {
        nodes.runBody.replaceChildren();
        if (!items.length) {
            const row = document.createElement("tr");
            runCell(row, "No draft payroll runs yet.", "table-message").colSpan = 9;
            nodes.runBody.appendChild(row);
            return;
        }
        items.forEach((item) => {
            const row = document.createElement("tr");
            runCell(row, item.run_code);
            runCell(row, `${String(item.cutoff_start).slice(0, 10)} – ${String(item.cutoff_end).slice(0, 10)}`);
            runCell(row, item.status);
            runCell(row, item.employee_count);
            runCell(row, item.exception_count);
            runCell(row, money(item.gross_total), "money-value");
            runCell(row, money(item.deduction_total), "money-value");
            runCell(row, money(item.net_total), "money-value");
            const actions = runCell(row, "");
            actions.className = "run-actions";
            const view = document.createElement("button");
            view.type = "button"; view.className = "button button-quiet"; view.textContent = "Review";
            view.addEventListener("click", () => showRun(item.id));
            const calculate = document.createElement("button");
            calculate.type = "button"; calculate.className = "button button-primary"; calculate.textContent = "Calculate";
            calculate.disabled = !["DRAFT", "CALCULATED"].includes(item.status);
            calculate.addEventListener("click", () => runAction(item.id, "calculate", calculate));
            const lock = document.createElement("button");
            lock.type = "button"; lock.className = "button button-quiet"; lock.textContent = "Lock";
            lock.disabled = item.status !== "CALCULATED" || Number(item.exception_count) > 0;
            lock.addEventListener("click", () => runAction(item.id, "lock", lock));
            actions.append(view, calculate, lock);
            nodes.runBody.appendChild(row);
        });
    }

    async function loadRuns() {
        const payload = await request("/runs");
        state.runs = Array.isArray(payload.items) ? payload.items : [];
        renderRuns(state.runs);
        nodes.adjustmentRun.replaceChildren(new Option("Select an unlocked draft", ""));
        state.runs.filter((item) => ["DRAFT", "CALCULATED"].includes(item.status)).forEach((item) => {
            nodes.adjustmentRun.add(new Option(`${item.run_code} · ${item.status}`, item.id));
        });
        const selected = nodes.phase6Run.value;
        nodes.phase6Run.replaceChildren(new Option("Select a payroll run", ""));
        state.runs.filter((item) => ["LOCKED", "APPROVED", "RELEASED"].includes(item.status)).forEach((item) => {
            nodes.phase6Run.add(new Option(`${item.run_code} · ${item.status}`, item.id));
        });
        if ([...nodes.phase6Run.options].some((option) => option.value === selected)) nodes.phase6Run.value = selected;
        syncPhase6Actions();
        const selectedPhase7 = nodes.phase7Run.value;
        nodes.phase7Run.replaceChildren(new Option("Select a released run", ""));
        state.runs.filter((item) => item.status === "RELEASED").forEach((item) => {
            nodes.phase7Run.add(new Option(`${item.run_code} · ${money(item.net_total)}`, item.id));
        });
        if ([...nodes.phase7Run.options].some((option) => option.value === selectedPhase7)) nodes.phase7Run.value = selectedPhase7;
        syncPhase7Actions();
        const selectedPhase8 = nodes.phase8Run.value;
        nodes.phase8Run.replaceChildren(new Option("Select a released run", ""));
        state.runs.filter((item) => item.status === "RELEASED").forEach((item) => {
            nodes.phase8Run.add(new Option(`${item.run_code} · ${String(item.pay_date).slice(0, 10)}`, item.id));
        });
        if ([...nodes.phase8Run.options].some((option) => option.value === selectedPhase8)) nodes.phase8Run.value = selectedPhase8;
        syncPhase8Actions();
        const selectedPhase9 = nodes.phase9Run.value;
        nodes.phase9Run.replaceChildren(new Option("Select a released run", ""));
        state.runs.filter((item) => item.status === "RELEASED").forEach((item) => {
            nodes.phase9Run.add(new Option(`${item.run_code} · ${String(item.pay_date).slice(0, 10)}`, item.id));
        });
        if ([...nodes.phase9Run.options].some((option) => option.value === selectedPhase9)) nodes.phase9Run.value = selectedPhase9;
        syncPhase9Actions();
        const selectedPhase12 = nodes.phase12Run.value;
        nodes.phase12Run.replaceChildren(new Option("Select a released run", ""));
        state.runs.filter((item) => item.status === "RELEASED").forEach((item) => {
            nodes.phase12Run.add(new Option(`${item.run_code} · ${String(item.pay_date).slice(0, 10)}`, item.id));
        });
        if ([...nodes.phase12Run.options].some((option) => option.value === selectedPhase12)) nodes.phase12Run.value = selectedPhase12;
        syncPhase12Actions();
    }

    async function createRun(event) {
        event.preventDefault();
        if (!nodes.runForm.reportValidity()) return;
        setButtonState(nodes.runCreate, true);
        try {
            const payload = await request("/runs", {
                method: "POST",
                body: JSON.stringify({
                    runCode: document.getElementById("run-code").value.trim(),
                    cutoffStart: document.getElementById("run-start").value,
                    cutoffEnd: document.getElementById("run-end").value,
                    payDate: document.getElementById("run-pay-date").value,
                    basePayFactor: document.getElementById("run-factor").value,
                }),
            });
            nodes.runForm.reset();
            document.getElementById("run-factor").value = "0.5000";
            showNotice(payload.message, "success");
            await loadRuns();
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.runCreate, false);
        }
    }

    function parseCsvLine(line) {
        const values = []; let value = ""; let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
            else if (char === '"') quoted = !quoted;
            else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
            else value += char;
        }
        values.push(value.trim()); return values;
    }

    async function importSalaries(event) {
        event.preventDefault();
        const file = document.getElementById("salary-file").files[0];
        if (!file) return;
        setButtonState(nodes.salaryImportButton, true);
        try {
            const lines = (await file.text()).split(/\r?\n/).filter(line => line.trim());
            const headers = parseCsvLine(lines.shift() || "").map(item => item.toLowerCase());
            if (!["usercode", "basicpay", "effectivedate", "reason"].every(header => headers.includes(header))) throw new Error("CSV headers must be usercode,basicPay,effectiveDate,reason.");
            const rows = lines.map(line => { const values = parseCsvLine(line); const row = Object.fromEntries(headers.map((header,index)=>[header,values[index]||""])); return { usercode:row.usercode,basicPay:row.basicpay,effectiveDate:row.effectivedate,reason:row.reason }; });
            const payload = await request("/salaries/import", { method:"POST", body:JSON.stringify({sourceName:file.name,rows}) });
            nodes.salaryImportResult.textContent = payload.message; nodes.salaryImportResult.hidden = false;
            showNotice(payload.message,"success"); await Promise.all([loadFoundation(),loadEmployees()]);
        } catch(error) { nodes.salaryImportResult.textContent=error.message; nodes.salaryImportResult.hidden=false; showNotice(error.message,"error"); }
        finally { setButtonState(nodes.salaryImportButton,false); }
    }

    async function loadSchedules() {
        const payload=await request("/schedules");
        nodes.scheduleTemplate.replaceChildren(new Option("Select template",""));
        payload.templates.forEach(item=>nodes.scheduleTemplate.add(new Option(`${item.template_code} · ${item.template_name}`,item.id)));
    }

    async function saveScheduleTemplate(event) {
        event.preventDefault(); if(!nodes.scheduleTemplateForm.reportValidity())return;
        const payload=await request("/schedules/templates",{method:"POST",body:JSON.stringify({
            templateCode:document.getElementById("schedule-code").value,templateName:document.getElementById("schedule-name").value,
            workStart:document.getElementById("schedule-start").value,workEnd:document.getElementById("schedule-end").value,
            breakMinutes:Number(document.getElementById("schedule-break").value),workDays:document.getElementById("schedule-days").value})});
        showNotice(payload.message,"success"); await loadSchedules();
    }

    async function assignSchedules(event) {
        event.preventDefault(); if(!nodes.scheduleAssignForm.reportValidity())return;
        const payload=await request("/schedules/assign",{method:"POST",body:JSON.stringify({
            templateId:Number(nodes.scheduleTemplate.value),usercodes:document.getElementById("schedule-usercodes").value.split(",").map(v=>v.trim()).filter(Boolean),
            effectiveFrom:document.getElementById("schedule-effective").value})});
        showNotice(payload.message,"success"); await loadFoundation();
    }

    // ============================================================
    // [PHASE 5] EARNINGS, DEDUCTIONS, LOANS, AND ADJUSTMENTS
    // ============================================================
    async function loadPhase5() {
        const payload = await request("/phase5/master-data");
        nodes.phase5Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase5Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        state.components = Array.isArray(payload.components) ? payload.components : [];
        nodes.assignmentComponent.replaceChildren(new Option("Select component", ""));
        state.components.filter((item) => Number(item.is_active) && !Number(item.is_statutory)).forEach((item) => {
            nodes.assignmentComponent.add(new Option(`${item.component_code} · ${item.component_name}`, item.id));
        });
        nodes.statutoryComponent.replaceChildren(new Option("Select statutory deduction", ""));
        state.components.filter((item) => Number(item.is_active) && Number(item.is_statutory)).forEach((item) => {
            nodes.statutoryComponent.add(new Option(`${item.component_code} · ${item.component_name}`, item.id));
        });
        nodes.phase5Summary.textContent = payload.schemaReady
            ? `${state.components.length} components · ${payload.assignments.length} recent assignments · ${payload.loans.filter((item) => item.status === "ACTIVE").length} active loans · ${payload.statutoryRules.length} statutory brackets`
            : "Apply the reviewed Phase 5 migration before entering master data.";
    }

    async function submitPhase5Form(event, path, body, afterSave) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const button = form.querySelector('button[type="submit"]');
        setButtonState(button, true);
        try {
            const payload = await request(path, { method: "POST", body: JSON.stringify(body) });
            showNotice(payload.message, "success");
            form.reset();
            if (afterSave) await afterSave();
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(button, false);
        }
    }

    function saveComponent(event) {
        return submitPhase5Form(event, "/components", {
            componentCode: document.getElementById("component-code").value,
            componentName: document.getElementById("component-name").value,
            componentType: document.getElementById("component-type").value,
            amountMode: document.getElementById("component-mode").value,
            isStatutory: document.getElementById("component-statutory").checked,
            isTaxable: document.getElementById("component-taxable").checked,
        }, loadPhase5);
    }

    function assignComponent(event) {
        return submitPhase5Form(event, "/components/assign", {
            usercode: document.getElementById("assignment-usercode").value,
            componentId: Number(nodes.assignmentComponent.value),
            amount: document.getElementById("assignment-amount").value,
            effectiveFrom: document.getElementById("assignment-from").value,
            effectiveTo: document.getElementById("assignment-to").value,
        }, loadPhase5);
    }

    function saveLoan(event) {
        return submitPhase5Form(event, "/loans", {
            usercode: document.getElementById("loan-usercode").value,
            loanCode: document.getElementById("loan-code").value,
            lender: document.getElementById("loan-lender").value,
            originalAmount: document.getElementById("loan-original").value,
            installmentAmount: document.getElementById("loan-installment").value,
            effectiveFrom: document.getElementById("loan-from").value,
        }, loadPhase5);
    }

    function saveStatutoryRule(event) {
        return submitPhase5Form(event, "/statutory-rules", {
            componentId: Number(nodes.statutoryComponent.value),
            ruleCode: document.getElementById("statutory-code").value,
            effectiveFrom: document.getElementById("statutory-from").value,
            effectiveTo: document.getElementById("statutory-to").value,
            salaryFrom: document.getElementById("statutory-salary-from").value,
            salaryTo: document.getElementById("statutory-salary-to").value,
            fixedAmount: document.getElementById("statutory-fixed").value,
            ratePercent: document.getElementById("statutory-rate").value,
        }, async () => {
            document.getElementById("statutory-salary-from").value = "0.00";
            document.getElementById("statutory-fixed").value = "0.00";
            document.getElementById("statutory-rate").value = "0";
            await loadPhase5();
        });
    }

    function saveAdjustment(event) {
        return submitPhase5Form(event, `/runs/${nodes.adjustmentRun.value}/adjustments`, {
            usercode: document.getElementById("adjustment-usercode").value,
            componentCode: document.getElementById("adjustment-code").value,
            componentType: document.getElementById("adjustment-type").value,
            amount: document.getElementById("adjustment-amount").value,
            reason: document.getElementById("adjustment-reason").value,
        }, loadPhase5);
    }

    // ============================================================
    // [PHASE 6] APPROVAL, RELEASE, REGISTER, AND PAYSLIPS
    // ============================================================
    function selectedPhase6Run() {
        return state.runs.find((item) => String(item.id) === nodes.phase6Run.value) || null;
    }

    function syncPhase6Actions() {
        const run = selectedPhase6Run();
        nodes.phase6Approve.disabled = !run || run.status !== "LOCKED";
        nodes.phase6Release.disabled = !run || run.status !== "APPROVED";
        nodes.phase6Register.disabled = !run || !["LOCKED", "APPROVED", "RELEASED"].includes(run.status);
        nodes.phase6Export.disabled = !run || run.status !== "RELEASED";
        if (!run || state.currentRegister?.run?.id !== run.id) {
            state.currentRegister = null;
            nodes.phase6Employee.replaceChildren(new Option("Open a released register first", ""));
            nodes.phase6Employee.disabled = true;
            nodes.phase6Payslip.disabled = true;
            nodes.phase6Output.hidden = true;
        }
    }

    async function loadPhase6() {
        const payload = await request("/phase6/readiness");
        nodes.phase6Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase6Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        nodes.phase6Summary.textContent = payload.schemaReady
            ? `${payload.approved} approved runs · ${payload.released} released runs`
            : "Apply the reviewed Phase 6 migration before approval and release.";
    }

    function renderPhase6Table(titleText, summaryText, headers, rows) {
        nodes.phase6Output.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = titleText;
        const summary = document.createElement("p");
        summary.textContent = summaryText;
        const shell = document.createElement("div");
        shell.className = "phase6-table-shell";
        const table = document.createElement("table");
        table.className = "payroll-table phase6-table";
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        headers.forEach((value) => {
            const cell = document.createElement("th");
            cell.textContent = value;
            headRow.appendChild(cell);
        });
        head.appendChild(headRow);
        const body = document.createElement("tbody");
        rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => runCell(row, value));
            body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        nodes.phase6Output.append(title, summary, shell);
        nodes.phase6Output.hidden = false;
    }

    async function openRegister() {
        const run = selectedPhase6Run();
        if (!run) return showNotice("Select a payroll run first.", "error");
        setButtonState(nodes.phase6Register, true);
        try {
            const payload = await request(`/runs/${run.id}/register`);
            state.currentRegister = payload;
            nodes.phase6Employee.replaceChildren(new Option("Select employee", ""));
            payload.employees.forEach((employee) => {
                nodes.phase6Employee.add(new Option(`${employee.employee_name} · ${employee.usercode}`, employee.usercode));
            });
            nodes.phase6Employee.disabled = run.status !== "RELEASED";
            nodes.phase6Payslip.disabled = true;
            renderPhase6Table(`${payload.run.run_code} payroll register`,
                `${payload.employees.length} employees · Gross ${money(payload.run.gross_total)} · Deductions ${money(payload.run.deduction_total)} · Net ${money(payload.run.net_total)}`,
                ["Employee", "Code", "Gross", "Deductions", "Net"],
                payload.employees.slice(0, 50).map((employee) => [employee.employee_name, employee.usercode,
                    money(employee.gross_pay), money(employee.deduction_total), money(employee.net_pay)]));
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase6Register, false);
            syncPhase6Actions();
        }
    }

    async function phase6Action(action, button) {
        const run = selectedPhase6Run();
        const note = nodes.phase6Note.value.trim();
        if (!run || note.length < 3) return showNotice("Select a run and enter an approval or release note.", "error");
        setButtonState(button, true);
        try {
            const payload = await request(`/runs/${run.id}/${action}`, {
                method: "POST",
                body: JSON.stringify({ note }),
            });
            showNotice(payload.message, "success");
            nodes.phase6Note.value = "";
            await Promise.all([loadRuns(), loadPhase6()]);
            nodes.phase6Run.value = String(run.id);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(button, false);
            syncPhase6Actions();
        }
    }

    async function viewPayslip() {
        const run = selectedPhase6Run();
        const usercode = nodes.phase6Employee.value;
        if (!run || !usercode) return showNotice("Select an employee from the released register.", "error");
        setButtonState(nodes.phase6Payslip, true);
        try {
            const payload = await request(`/runs/${run.id}/payslips/${encodeURIComponent(usercode)}`);
            const payslip = payload.payslip;
            renderPhase6Table(`Payslip ${payslip.payslipNo}`,
                `${payslip.employee.employee_name} · Gross ${money(payslip.employee.gross_pay)} · Deductions ${money(payslip.employee.deduction_total)} · Net ${money(payslip.employee.net_pay)}`,
                ["Component", "Type", "Amount"],
                payslip.items.map((item) => [item.component_code, item.component_type, money(item.amount)]));
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase6Payslip, false);
        }
    }

    async function downloadRegister() {
        const run = selectedPhase6Run();
        if (!run || run.status !== "RELEASED") return showNotice("Select a released payroll run.", "error");
        setButtonState(nodes.phase6Export, true);
        try {
            const response = await fetch(`${API_BASE}/runs/${run.id}/export.csv`, {
                headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || "Payroll register download failed.");
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = `${run.run_code}-register.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showNotice("Released payroll register downloaded.", "success");
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase6Export, false);
            syncPhase6Actions();
        }
    }

    // ============================================================
    // [PHASE 7] PAYMENT AND REMITTANCE RECONCILIATION
    // ============================================================
    function selectedPhase7Run() {
        return state.runs.find((item) => String(item.id) === nodes.phase7Run.value) || null;
    }

    function selectedRemittance() {
        return state.currentReconciliation?.remittances?.find((item) => String(item.id) === nodes.phase7Remittance.value) || null;
    }

    function syncPhase7Actions() {
        const run = selectedPhase7Run();
        const currentMatches = run && state.currentReconciliation?.run?.id === run.id;
        const batch = currentMatches ? state.currentReconciliation.batch : null;
        nodes.phase7Prepare.disabled = !run || Boolean(batch);
        nodes.phase7PrepareRemittances.disabled = !run;
        nodes.phase7Refresh.disabled = !run;
        nodes.phase7UpdateBatch.disabled = !batch || !["PREPARED", "TRANSMITTED"].includes(batch.status);
        const remittance = selectedRemittance();
        nodes.phase7UpdateRemittance.disabled = !remittance || !["PREPARED", "REMITTED"].includes(remittance.status);
        if (!currentMatches) {
            state.currentReconciliation = null;
            nodes.phase7Remittance.replaceChildren(new Option("Reconcile a run first", ""));
            nodes.phase7Remittance.disabled = true;
            nodes.phase7Output.hidden = true;
        }
    }

    async function loadPhase7() {
        const payload = await request("/phase7/readiness");
        nodes.phase7Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase7Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        nodes.phase7Summary.textContent = payload.schemaReady
            ? `${payload.disbursements} disbursement batches · ${payload.confirmed} confirmed · ${payload.remittances} remittance summaries`
            : "Apply the reviewed Phase 7 migration before reconciliation.";
    }

    function appendPhase7Table(titleText, headers, rows) {
        const heading = document.createElement("strong");
        heading.textContent = titleText;
        const shell = document.createElement("div");
        shell.className = "phase7-table-shell";
        const table = document.createElement("table");
        table.className = "payroll-table phase7-table";
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        headers.forEach((value) => {
            const cell = document.createElement("th");
            cell.textContent = value;
            headRow.appendChild(cell);
        });
        head.appendChild(headRow);
        const body = document.createElement("tbody");
        rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => runCell(row, value));
            body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        nodes.phase7Output.append(heading, shell);
    }

    function renderReconciliation(payload) {
        nodes.phase7Output.replaceChildren();
        const metrics = document.createElement("div");
        metrics.className = "phase7-metrics";
        [
            ["Disbursement", payload.batch?.status || "Not prepared"],
            ["Net variance", money(payload.reconciliation.disbursementVariance)],
            ["Remittance variance", money(payload.reconciliation.remittanceVariance)],
            ["Duplicate reference", payload.reconciliation.duplicatePaymentReference ? "Review required" : "None detected"],
            ["Register evidence", payload.reconciliation.registerMatches ? "Verified" : "Mismatch"],
        ].forEach(([label, value]) => {
            const item = document.createElement("span");
            const name = document.createElement("small");
            const result = document.createElement("strong");
            name.textContent = label;
            result.textContent = value;
            item.append(name, result);
            metrics.appendChild(item);
        });
        nodes.phase7Output.appendChild(metrics);
        if (payload.items.length) appendPhase7Table("Employee disbursement tracking",
            ["Employee", "Code", "Status", "Amount"],
            payload.items.slice(0, 50).map((item) => [item.employee_name, item.usercode, item.status, money(item.amount)]));
        if (payload.remittances.length) appendPhase7Table("Deduction remittances",
            ["Type", "Component", "Payee", "Status", "Amount"],
            payload.remittances.map((item) => [item.remittance_type, item.component_code, item.payee, item.status, money(item.amount)]));
        nodes.phase7Output.hidden = false;
    }

    async function loadReconciliation() {
        const run = selectedPhase7Run();
        if (!run) return showNotice("Select a released payroll run.", "error");
        setButtonState(nodes.phase7Refresh, true);
        try {
            const payload = await request(`/runs/${run.id}/reconciliation`);
            state.currentReconciliation = payload;
            nodes.phase7Remittance.replaceChildren(new Option("Select remittance", ""));
            payload.remittances.forEach((item) => {
                nodes.phase7Remittance.add(new Option(`${item.component_code} · ${item.status} · ${money(item.amount)}`, item.id));
            });
            nodes.phase7Remittance.disabled = !payload.remittances.length;
            renderReconciliation(payload);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase7Refresh, false);
            syncPhase7Actions();
        }
    }

    async function prepareDisbursement() {
        const run = selectedPhase7Run();
        const batchCode = nodes.phase7BatchCode.value.trim();
        if (!run || !batchCode) return showNotice("Select a released run and enter a batch code.", "error");
        setButtonState(nodes.phase7Prepare, true);
        try {
            const payload = await request(`/runs/${run.id}/disbursements`, {
                method: "POST",
                body: JSON.stringify({ batchCode, paymentMethod: nodes.phase7Method.value }),
            });
            showNotice(payload.message, "success");
            await Promise.all([loadPhase7(), loadReconciliation()]);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase7Prepare, false);
            syncPhase7Actions();
        }
    }

    async function prepareRemittances() {
        const run = selectedPhase7Run();
        if (!run) return showNotice("Select a released payroll run.", "error");
        setButtonState(nodes.phase7PrepareRemittances, true);
        try {
            const payload = await request(`/runs/${run.id}/remittances/prepare`, { method: "POST" });
            showNotice(payload.message, "success");
            await Promise.all([loadPhase7(), loadReconciliation()]);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase7PrepareRemittances, false);
            syncPhase7Actions();
        }
    }

    async function updateDisbursement() {
        const batch = state.currentReconciliation?.batch;
        if (!batch) return showNotice("Prepare or reconcile a disbursement first.", "error");
        setButtonState(nodes.phase7UpdateBatch, true);
        try {
            const payload = await request(`/disbursements/${batch.id}/status`, {
                method: "POST",
                body: JSON.stringify({ status: nodes.phase7BatchStatus.value,
                    reference: nodes.phase7Reference.value.trim(), reason: nodes.phase7Reason.value.trim() }),
            });
            showNotice(payload.message, "success");
            await Promise.all([loadPhase7(), loadReconciliation()]);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase7UpdateBatch, false);
            syncPhase7Actions();
        }
    }

    async function updateRemittance() {
        const remittance = selectedRemittance();
        if (!remittance) return showNotice("Select a remittance first.", "error");
        setButtonState(nodes.phase7UpdateRemittance, true);
        try {
            const payload = await request(`/remittances/${remittance.id}/status`, {
                method: "POST",
                body: JSON.stringify({ status: nodes.phase7RemittanceStatus.value,
                    reference: nodes.phase7Reference.value.trim(), reason: nodes.phase7Reason.value.trim() }),
            });
            showNotice(payload.message, "success");
            await Promise.all([loadPhase7(), loadReconciliation()]);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase7UpdateRemittance, false);
            syncPhase7Actions();
        }
    }

    // ============================================================
    // [PHASE 8] ACCOUNTING REPORTS AND IRREVERSIBLE PERIOD CLOSE
    // ============================================================
    function selectedPhase8Run() {
        return state.runs.find((item) => String(item.id) === nodes.phase8Run.value) || null;
    }

    function syncPhase8Actions() {
        const run = selectedPhase8Run();
        const reportMatches = run && state.currentPhase8Report?.run?.id === run.id;
        const closed = Boolean(reportMatches && state.currentPhase8Report.closure);
        nodes.phase8Reports.disabled = !run;
        nodes.phase8Journal.disabled = !run;
        nodes.phase8Export.disabled = !run;
        nodes.phase8Close.disabled = !run || !nodes.phase8CloseConfirm.checked || closed;
        if (!reportMatches) {
            state.currentPhase8Report = null;
            nodes.phase8Output.hidden = true;
        }
    }

    async function loadPhase8() {
        const payload = await request("/phase8/readiness");
        nodes.phase8Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase8Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        nodes.phase8Summary.textContent = payload.schemaReady
            ? `${payload.mappings} active account mappings · ${payload.closedPeriods} closed payroll periods`
            : "Apply the reviewed Phase 8 migration before accounting reports and closing.";
    }

    function appendPhase8Table(titleText, headers, rows) {
        const heading = document.createElement("strong");
        heading.textContent = titleText;
        const shell = document.createElement("div");
        shell.className = "phase8-table-shell";
        const table = document.createElement("table");
        table.className = "payroll-table phase8-table";
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        headers.forEach((value) => {
            const cell = document.createElement("th");
            cell.textContent = value;
            headRow.appendChild(cell);
        });
        head.appendChild(headRow);
        const body = document.createElement("tbody");
        rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => runCell(row, value));
            body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        nodes.phase8Output.append(heading, shell);
    }

    async function saveAccountMapping(event) {
        event.preventDefault();
        if (!nodes.phase8MappingForm.reportValidity()) return;
        setButtonState(nodes.phase8SaveMapping, true);
        try {
            const payload = await request("/phase8/account-mappings", {
                method: "POST",
                body: JSON.stringify({
                    componentCode: document.getElementById("phase8-component").value,
                    componentType: document.getElementById("phase8-component-type").value,
                    debitAccountCode: document.getElementById("phase8-debit-code").value,
                    debitAccountName: document.getElementById("phase8-debit-name").value,
                    creditAccountCode: document.getElementById("phase8-credit-code").value,
                    creditAccountName: document.getElementById("phase8-credit-name").value,
                    effectiveFrom: document.getElementById("phase8-effective").value,
                }),
            });
            showNotice(payload.message, "success");
            nodes.phase8MappingForm.reset();
            await loadPhase8();
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase8SaveMapping, false);
        }
    }

    async function loadPhase8Reports() {
        const run = selectedPhase8Run();
        if (!run) return showNotice("Select a released payroll run.", "error");
        setButtonState(nodes.phase8Reports, true);
        try {
            const payload = await request(`/runs/${run.id}/phase8/reports`);
            state.currentPhase8Report = payload;
            nodes.phase8Output.replaceChildren();
            const status = document.createElement("p");
            status.className = "phase8-close-state";
            status.dataset.state = payload.closure ? "closed" : "open";
            status.textContent = payload.closure
                ? `Closed as ${payload.closure.close_code} by ${payload.closure.closed_by}`
                : "Period remains open. Confirm reconciliation and journal mappings before closing.";
            nodes.phase8Output.appendChild(status);
            appendPhase8Table("Department summary", ["Department", "Employees", "Gross", "Deductions", "Net"],
                payload.departments.map((item) => [item.department, item.employees, money(item.gross), money(item.deductions), money(item.net)]));
            appendPhase8Table("Component summary", ["Component", "Type", "Rows", "Amount"],
                payload.components.map((item) => [item.component_code, item.component_type, item.employee_rows, money(item.amount)]));
            nodes.phase8Output.hidden = false;
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase8Reports, false);
            syncPhase8Actions();
        }
    }

    async function loadJournalPreview() {
        const run = selectedPhase8Run();
        if (!run) return showNotice("Select a released payroll run.", "error");
        setButtonState(nodes.phase8Journal, true);
        try {
            const payload = await request(`/runs/${run.id}/journal`);
            nodes.phase8Output.replaceChildren();
            const status = document.createElement("p");
            status.className = "phase8-close-state";
            status.dataset.state = payload.complete ? "closed" : "open";
            status.textContent = payload.complete
                ? `${payload.closed ? "Closed journal snapshot" : "Journal ready"} · Debits ${money(payload.totalDebits)} · Credits ${money(payload.totalCredits)}`
                : `${payload.missing.length} account mappings still required.`;
            nodes.phase8Output.appendChild(status);
            appendPhase8Table("Journal lines", ["Component", "Side", "Account", "Name", "Debit", "Credit"],
                payload.lines.map((line) => [line.componentCode, line.side, line.accountCode, line.accountName,
                    money(line.debit), money(line.credit)]));
            if (payload.missing.length) appendPhase8Table("Missing mappings", ["Component", "Type"],
                payload.missing.map((item) => [item.componentCode, item.componentType]));
            nodes.phase8Output.hidden = false;
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase8Journal, false);
        }
    }

    async function downloadJournal() {
        const run = selectedPhase8Run();
        if (!run) return showNotice("Select a released payroll run.", "error");
        setButtonState(nodes.phase8Export, true);
        try {
            const response = await fetch(`${API_BASE}/runs/${run.id}/journal.csv`, {
                headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || "Payroll journal download failed.");
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = `${run.run_code}-journal.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showNotice("Payroll journal downloaded.", "success");
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase8Export, false);
        }
    }

    async function loadYtdLedger() {
        const usercode = nodes.phase8YtdUser.value.trim();
        const year = nodes.phase8YtdYear.value;
        if (!usercode || !year) return showNotice("Enter an employee code and year.", "error");
        setButtonState(nodes.phase8Ytd, true);
        try {
            const payload = await request(`/employees/${encodeURIComponent(usercode)}/ytd?year=${encodeURIComponent(year)}`);
            nodes.phase8Output.replaceChildren();
            const status = document.createElement("p");
            status.className = "phase8-close-state";
            status.dataset.state = "open";
            status.textContent = `${payload.usercode} · ${payload.year} · Gross ${money(payload.totals.gross)} · Deductions ${money(payload.totals.deductions)} · Net ${money(payload.totals.net)}`;
            nodes.phase8Output.appendChild(status);
            appendPhase8Table("Released payroll ledger", ["Pay date", "Run", "Basic", "OT", "Gross", "Deductions", "Net"],
                payload.items.map((item) => [String(item.pay_date).slice(0, 10), item.run_code, money(item.basic_pay),
                    money(item.overtime_pay), money(item.gross_pay), money(item.deduction_total), money(item.net_pay)]));
            nodes.phase8Output.hidden = false;
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase8Ytd, false);
        }
    }

    async function closePayrollPeriod() {
        const run = selectedPhase8Run();
        const note = nodes.phase8CloseNote.value.trim();
        if (!run || note.length < 3 || !nodes.phase8CloseConfirm.checked) {
            return showNotice("Select a run, enter a close note, and confirm the irreversible close.", "error");
        }
        setButtonState(nodes.phase8Close, true);
        try {
            const payload = await request(`/runs/${run.id}/close`, {
                method: "POST",
                body: JSON.stringify({ note, confirm: true }),
            });
            showNotice(payload.message, "success");
            nodes.phase8CloseNote.value = "";
            nodes.phase8CloseConfirm.checked = false;
            await Promise.all([loadPhase8(), loadPhase8Reports()]);
        } catch (error) {
            showNotice(error.message, "error");
        } finally {
            setButtonState(nodes.phase8Close, false);
            syncPhase8Actions();
        }
    }

    // ============================================================
    // [PHASE 9] PARALLEL PAYROLL AND PRODUCTION-READINESS EVIDENCE
    // ============================================================
    function syncPhase9Actions() {
        const testSelected = Boolean(nodes.phase9Test.value);
        const readiness = state.currentPhase9Readiness;
        nodes.phase9Compare.disabled = !nodes.phase9Run.value;
        nodes.phase9ViewTest.disabled = !testSelected;
        nodes.phase9Sign.disabled = !testSelected || !readiness?.baseReady
            || !nodes.phase9Confirm.checked || nodes.phase9Statement.value.trim().length < 10;
    }

    function appendPhase9Table(titleText, headers, rows) {
        const heading = document.createElement("h3");
        heading.textContent = titleText;
        const shell = document.createElement("div");
        shell.className = "phase9-table-shell";
        const table = document.createElement("table");
        table.className = "payroll-table phase9-table";
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        headers.forEach((value) => runCell(headRow, value));
        head.appendChild(headRow);
        const body = document.createElement("tbody");
        if (!rows.length) {
            const row = document.createElement("tr");
            runCell(row, "No records.", "table-message").colSpan = headers.length;
            body.appendChild(row);
        } else rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => runCell(row, value));
            body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        nodes.phase9Output.append(heading, shell);
    }

    function renderPhase9Readiness(payload) {
        state.currentPhase9Readiness = payload.readiness;
        nodes.phase9Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase9Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        if (!payload.schemaReady) {
            nodes.phase9Summary.textContent = "Apply the reviewed Phase 9 migration before parallel-payroll validation.";
            syncPhase9Actions();
            return;
        }
        nodes.phase9Summary.textContent = `${payload.tests} parallel tests · ${payload.passedTests} passed · Production activation remains outside this workspace`;
        const readiness = payload.readiness;
        if (readiness) {
            nodes.phase9Output.replaceChildren();
            const status = document.createElement("p");
            status.className = "phase9-cutover-state";
            status.dataset.state = readiness.ready ? "ready" : "blocked";
            status.textContent = readiness.ready
                ? "All recorded cutover gates and required signoffs are complete."
                : "Cutover is blocked until every evidence gate and all four role signoffs are complete.";
            const gates = document.createElement("div");
            gates.className = "phase9-gates";
            const labels = { salaryCoverage: "Salary coverage", scheduleCoverage: "Schedule coverage",
                statutoryConfigured: "Statutory rules", parallelPassed: "Parallel test", journalReady: "Balanced journal",
                paymentReconciled: "Payment reconciliation", periodClosed: "Period closed", requiredSignoffs: "Four signoffs" };
            Object.entries(readiness.gates || {}).forEach(([key, passed]) => {
                const gate = document.createElement("span");
                gate.dataset.state = passed ? "ready" : "blocked";
                gate.textContent = `${labels[key] || key}: ${passed ? "Ready" : "Blocked"}`;
                gates.appendChild(gate);
            });
            nodes.phase9Output.append(status, gates);
            appendPhase9Table("Recorded signoffs", ["Role", "Signed by", "Signed at", "Statement"],
                (readiness.signoffs || []).map((item) => [item.signoff_role, item.signed_by,
                    String(item.signed_at || "").slice(0, 19), item.statement]));
            nodes.phase9Output.hidden = false;
        }
        syncPhase9Actions();
    }

    async function loadPhase9() {
        const selected = nodes.phase9Test.value;
        const readinessPayload = await request(`/phase9/readiness${selected ? `?testId=${encodeURIComponent(selected)}` : ""}`);
        if (!readinessPayload.schemaReady) return renderPhase9Readiness(readinessPayload);
        const testsPayload = await request("/phase9/parallel-tests");
        state.parallelTests = Array.isArray(testsPayload.items) ? testsPayload.items : [];
        nodes.phase10Test.replaceChildren(new Option("Select an approved test", ""));
        state.parallelTests.filter((item) => item.status === "PASSED" && Number(item.signoff_count) === 4)
            .forEach((item) => nodes.phase10Test.add(new Option(`${item.test_code} · ${item.run_code}`, item.id)));
        nodes.phase9Test.replaceChildren(new Option("Select a completed test", ""));
        state.parallelTests.forEach((item) => nodes.phase9Test.add(new Option(
            `${item.test_code} · ${item.status} · ${item.signoff_count}/4 signoffs`, item.id)));
        if ([...nodes.phase9Test.options].some((option) => option.value === selected)) nodes.phase9Test.value = selected;
        renderPhase9Readiness(readinessPayload);
    }

    async function refreshPhase9Readiness() {
        try {
            const suffix = nodes.phase9Test.value ? `?testId=${encodeURIComponent(nodes.phase9Test.value)}` : "";
            renderPhase9Readiness(await request(`/phase9/readiness${suffix}`));
        } catch (error) { showNotice(error.message, "error"); }
    }

    async function compareParallelPayroll(event) {
        event.preventDefault();
        const file = nodes.phase9File.files[0];
        if (!nodes.phase9TestForm.reportValidity() || !file) return;
        setButtonState(nodes.phase9Compare, true);
        try {
            const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
            const headers = parseCsvLine(lines.shift() || "").map((item) => item.toLowerCase());
            if (!["usercode", "grosspay", "deductions", "netpay"].every((header) => headers.includes(header))) {
                throw new Error("CSV headers must be usercode,grossPay,deductions,netPay.");
            }
            const rows = lines.map((line) => {
                const values = parseCsvLine(line);
                const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
                return { usercode: row.usercode, grossPay: row.grosspay, deductions: row.deductions, netPay: row.netpay };
            });
            const payload = await request("/phase9/parallel-tests", { method: "POST", body: JSON.stringify({
                runId: Number(nodes.phase9Run.value), testCode: nodes.phase9TestCode.value.trim(),
                tolerance: nodes.phase9Tolerance.value.trim(), sourceName: file.name, rows,
            }) });
            showNotice(payload.message, payload.status === "PASSED" ? "success" : "error");
            nodes.phase9TestForm.reset();
            nodes.phase9Tolerance.value = "0.00";
            await loadPhase9();
            nodes.phase9Test.value = String(payload.id);
            await refreshPhase9Readiness();
            await viewParallelTest();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase9Compare, false); syncPhase9Actions(); }
    }

    async function viewParallelTest() {
        if (!nodes.phase9Test.value) return;
        setButtonState(nodes.phase9ViewTest, true);
        try {
            const payload = await request(`/phase9/parallel-tests/${encodeURIComponent(nodes.phase9Test.value)}`);
            const test = payload.test;
            nodes.phase9Output.replaceChildren();
            const status = document.createElement("p");
            status.className = "phase9-cutover-state";
            status.dataset.state = test.status === "PASSED" ? "ready" : "blocked";
            status.textContent = `${test.test_code} · ${test.status} · ${test.matched_count}/${test.system_count} employees matched · tolerance ${money(test.tolerance)}`;
            nodes.phase9Output.appendChild(status);
            appendPhase9Table("Register totals", ["Measure", "Expected", "System", "Variance"], [
                ["Gross", money(test.gross_expected), money(test.gross_system), money(test.gross_variance)],
                ["Deductions", money(test.deduction_expected), money(test.deduction_system), money(test.deduction_variance)],
                ["Net", money(test.net_expected), money(test.net_system), money(test.net_variance)],
            ]);
            appendPhase9Table("Employee comparison", ["Employee", "Result", "Gross variance", "Deduction variance", "Net variance"],
                payload.items.map((item) => [item.usercode, item.result, money(item.gross_variance),
                    money(item.deduction_variance), money(item.net_variance)]));
            nodes.phase9Output.hidden = false;
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase9ViewTest, false); syncPhase9Actions(); }
    }

    async function recordPhase9Signoff() {
        if (!nodes.phase9Test.value || !nodes.phase9Confirm.checked || nodes.phase9Statement.value.trim().length < 10) {
            return showNotice("Select a test, enter a signoff statement, and confirm it.", "error");
        }
        setButtonState(nodes.phase9Sign, true);
        try {
            const payload = await request(`/phase9/parallel-tests/${encodeURIComponent(nodes.phase9Test.value)}/signoffs`, {
                method: "POST", body: JSON.stringify({ role: nodes.phase9Role.value,
                    statement: nodes.phase9Statement.value.trim(), confirm: true }),
            });
            showNotice(payload.message, "success");
            nodes.phase9Statement.value = "";
            nodes.phase9Confirm.checked = false;
            await loadPhase9();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase9Sign, false); syncPhase9Actions(); }
    }

    // ============================================================
    // [PHASE 10] UAT, ISSUE RESOLUTION, AND CONTROLLED AUTHORIZATION
    // ============================================================
    function syncPhase10Actions() {
        const readiness = state.currentPhase10Readiness;
        const hasCycle = Boolean(nodes.phase10Cycle.value);
        const immutable = Boolean(readiness?.authorization);
        nodes.phase10Create.disabled = !nodes.phase10Test.value;
        nodes.phase10SaveCase.disabled = !hasCycle || immutable;
        nodes.phase10SaveIssue.disabled = !hasCycle || immutable;
        nodes.phase10Authorize.disabled = !hasCycle || immutable || !readiness?.baseReady || !nodes.phase10Confirm.checked;
    }

    function appendPhase10Table(titleText, headers, rows) {
        const heading = document.createElement("h3");
        heading.textContent = titleText;
        const shell = document.createElement("div");
        shell.className = "phase10-table-shell";
        const table = document.createElement("table");
        table.className = "payroll-table phase10-table";
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        headers.forEach((value) => runCell(headRow, value));
        head.appendChild(headRow);
        const body = document.createElement("tbody");
        if (!rows.length) {
            const row = document.createElement("tr");
            runCell(row, "No records.", "table-message").colSpan = headers.length;
            body.appendChild(row);
        } else rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => runCell(row, value));
            body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        nodes.phase10Output.append(heading, shell);
    }

    function renderPhase10Readiness(payload) {
        state.currentPhase10Readiness = payload.readiness;
        nodes.phase10Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase10Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        if (!payload.schemaReady) {
            nodes.phase10Summary.textContent = "Apply the reviewed Phase 10 migration before recording UAT evidence.";
            syncPhase10Actions();
            return;
        }
        nodes.phase10Summary.textContent = `${payload.cycles} UAT cycles · ${payload.authorized} controlled authorizations · No automatic production switch`;
        const readiness = payload.readiness;
        nodes.phase10Output.replaceChildren();
        if (!readiness?.cycle) {
            nodes.phase10Output.hidden = true;
            syncPhase10Actions();
            return;
        }
        const status = document.createElement("p");
        status.className = "phase10-cutover-state";
        status.dataset.state = readiness.ready ? "ready" : "blocked";
        status.textContent = readiness.ready
            ? `${readiness.cycle.cycle_code} is authorized for the recorded controlled schedule. No production switch was executed.`
            : `${readiness.cycle.cycle_code} remains blocked until every UAT evidence gate passes.`;
        const gates = document.createElement("div");
        gates.className = "phase10-gates";
        const labels = { phase9Approved: "Phase 9 approved", requiredCases: "Nine UAT areas",
            allCasesPassed: "All cases passed", noOpenIssues: "No open issues",
            rollbackEvidence: "Rollback evidence", authorizationRecorded: "Authorization" };
        Object.entries(readiness.gates || {}).forEach(([key, passed]) => {
            const gate = document.createElement("span");
            gate.dataset.state = passed ? "ready" : "blocked";
            gate.textContent = `${labels[key] || key}: ${passed ? "Ready" : "Blocked"}`;
            gates.appendChild(gate);
        });
        nodes.phase10Output.append(status, gates);
        appendPhase10Table("UAT cases", ["Code", "Area", "Status", "Evidence", "Executed by"],
            readiness.cases.map((item) => [item.case_code, item.case_type, item.status,
                item.evidence_reference || "Not supplied", item.executed_by]));
        appendPhase10Table("UAT issues", ["Code", "Severity", "Status", "Summary", "Resolution"],
            readiness.issues.map((item) => [item.issue_code, item.severity, item.status, item.summary, item.resolution || "Open"]));
        if (readiness.authorization) appendPhase10Table("Go-live authorization", ["Code", "Scheduled", "Rollback", "Authorized by"], [[
            readiness.authorization.authorization_code, String(readiness.authorization.scheduled_at).slice(0, 19),
            readiness.authorization.rollback_reference, readiness.authorization.authorized_by,
        ]]);
        nodes.phase10Output.hidden = false;
        syncPhase10Actions();
    }

    async function loadPhase10() {
        const selected = nodes.phase10Cycle.value;
        const readinessPayload = await request(`/phase10/readiness${selected ? `?cycleId=${encodeURIComponent(selected)}` : ""}`);
        if (!readinessPayload.schemaReady) return renderPhase10Readiness(readinessPayload);
        const cyclesPayload = await request("/phase10/cycles");
        state.uatCycles = Array.isArray(cyclesPayload.items) ? cyclesPayload.items : [];
        nodes.phase10Cycle.replaceChildren(new Option("Select a UAT cycle", ""));
        state.uatCycles.forEach((item) => nodes.phase10Cycle.add(new Option(
            `${item.cycle_code} · ${item.status} · ${item.passed_count}/${item.case_count} passed`, item.id)));
        if ([...nodes.phase10Cycle.options].some((option) => option.value === selected)) nodes.phase10Cycle.value = selected;
        renderPhase10Readiness(readinessPayload);
    }

    async function refreshPhase10Readiness() {
        try {
            const suffix = nodes.phase10Cycle.value ? `?cycleId=${encodeURIComponent(nodes.phase10Cycle.value)}` : "";
            renderPhase10Readiness(await request(`/phase10/readiness${suffix}`));
        } catch (error) { showNotice(error.message, "error"); }
    }

    async function createUatCycle(event) {
        event.preventDefault();
        if (!nodes.phase10CycleForm.reportValidity()) return;
        setButtonState(nodes.phase10Create, true);
        try {
            const payload = await request("/phase10/cycles", { method: "POST", body: JSON.stringify({
                testId: Number(nodes.phase10Test.value), cycleCode: nodes.phase10CycleCode.value.trim(),
                scopeStatement: nodes.phase10Scope.value.trim(),
            }) });
            showNotice(payload.message, "success");
            nodes.phase10CycleForm.reset();
            await loadPhase10();
            nodes.phase10Cycle.value = String(payload.id);
            await refreshPhase10Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase10Create, false); syncPhase10Actions(); }
    }

    async function saveUatCase(event) {
        event.preventDefault();
        if (!nodes.phase10CaseForm.reportValidity() || !nodes.phase10Cycle.value) return;
        setButtonState(nodes.phase10SaveCase, true);
        try {
            const payload = await request(`/phase10/cycles/${encodeURIComponent(nodes.phase10Cycle.value)}/cases`, {
                method: "POST", body: JSON.stringify({
                    caseCode: document.getElementById("phase10-case-code").value,
                    caseType: document.getElementById("phase10-case-type").value,
                    scenario: document.getElementById("phase10-scenario").value,
                    expectedResult: document.getElementById("phase10-expected").value,
                    actualResult: document.getElementById("phase10-actual").value,
                    evidenceReference: document.getElementById("phase10-evidence").value,
                    status: document.getElementById("phase10-case-status").value,
                }),
            });
            showNotice(payload.message, "success");
            nodes.phase10CaseForm.reset();
            await loadPhase10();
            await refreshPhase10Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase10SaveCase, false); syncPhase10Actions(); }
    }

    async function saveUatIssue(event) {
        event.preventDefault();
        if (!nodes.phase10IssueForm.reportValidity() || !nodes.phase10Cycle.value) return;
        setButtonState(nodes.phase10SaveIssue, true);
        try {
            const payload = await request(`/phase10/cycles/${encodeURIComponent(nodes.phase10Cycle.value)}/issues`, {
                method: "POST", body: JSON.stringify({
                    issueCode: document.getElementById("phase10-issue-code").value,
                    severity: document.getElementById("phase10-severity").value,
                    summary: document.getElementById("phase10-issue-summary").value,
                    resolution: document.getElementById("phase10-resolution").value,
                    status: document.getElementById("phase10-issue-status").value,
                }),
            });
            showNotice(payload.message, "success");
            nodes.phase10IssueForm.reset();
            await loadPhase10();
            await refreshPhase10Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase10SaveIssue, false); syncPhase10Actions(); }
    }

    async function authorizeGoLive(event) {
        event.preventDefault();
        if (!nodes.phase10AuthorizeForm.reportValidity() || !nodes.phase10Cycle.value || !nodes.phase10Confirm.checked) return;
        setButtonState(nodes.phase10Authorize, true);
        try {
            const payload = await request(`/phase10/cycles/${encodeURIComponent(nodes.phase10Cycle.value)}/authorize`, {
                method: "POST", body: JSON.stringify({
                    authorizationCode: document.getElementById("phase10-auth-code").value,
                    scheduledAt: document.getElementById("phase10-scheduled").value,
                    rollbackReference: document.getElementById("phase10-rollback").value,
                    statement: document.getElementById("phase10-auth-statement").value,
                    confirm: true,
                }),
            });
            showNotice(payload.message, "success");
            nodes.phase10AuthorizeForm.reset();
            await loadPhase10();
            await refreshPhase10Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase10Authorize, false); syncPhase10Actions(); }
    }

    // ============================================================
    // [PHASE 11] PRODUCTION OPERATIONS CONTROL AND INCIDENT EVIDENCE
    // ============================================================
    function syncPhase11Actions() {
        const readiness = state.currentPhase11Readiness;
        const hasWindow = Boolean(nodes.phase11Window.value);
        const closed = readiness?.window?.status === "CLOSED";
        const target = document.getElementById("phase11-target-status").value;
        const statusGate = target === "ACTIVE" ? readiness?.activationReady
            : target === "CLOSED" ? readiness?.closeReady : hasWindow;
        nodes.phase11CreateWindow.disabled = !nodes.phase11Authorization.value;
        nodes.phase11SaveCheck.disabled = !hasWindow || closed;
        nodes.phase11SaveIncident.disabled = !hasWindow || closed;
        nodes.phase11SaveAction.disabled = !hasWindow || closed;
        nodes.phase11SaveStatus.disabled = !hasWindow || closed || !statusGate || !nodes.phase11Confirm.checked;
    }

    function syncPhase11ChecklistItems() {
        const stage = document.getElementById("phase11-stage").value;
        const select = document.getElementById("phase11-item-code");
        const items = stage === "PRE_RUN"
            ? [["BACKUP_VERIFIED", "Backup verified"], ["ACCESS_REVIEWED", "Access reviewed"],
                ["MASTER_DATA_FROZEN", "Master data frozen"], ["RUN_CONTROL_APPROVED", "Run control approved"]]
            : [["PAYMENT_RECONCILED", "Payment reconciled"], ["REPORTS_ARCHIVED", "Reports archived"],
                ["PAYSLIPS_RELEASED", "Payslips released"], ["PERIOD_CLOSED", "Period closed"]];
        select.replaceChildren(...items.map(([value, label]) => new Option(label, value)));
    }

    function appendPhase11Table(titleText, headers, rows) {
        const heading = document.createElement("h3");
        heading.textContent = titleText;
        const shell = document.createElement("div");
        shell.className = "phase11-table-shell";
        const table = document.createElement("table");
        table.className = "payroll-table phase11-table";
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        headers.forEach((value) => runCell(headRow, value));
        head.appendChild(headRow);
        const body = document.createElement("tbody");
        if (!rows.length) {
            const row = document.createElement("tr");
            runCell(row, "No records.", "table-message").colSpan = headers.length;
            body.appendChild(row);
        } else rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => runCell(row, value));
            body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        nodes.phase11Output.append(heading, shell);
    }

    function renderPhase11Readiness(payload) {
        state.currentPhase11Readiness = payload.readiness;
        nodes.phase11Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase11Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        if (!payload.schemaReady) {
            nodes.phase11Summary.textContent = "Apply the reviewed Phase 11 migration before production operations tracking.";
            syncPhase11Actions();
            return;
        }
        nodes.phase11Summary.textContent = `${payload.windows} operations windows · ${payload.active} active · ${payload.closed} closed · No external activation`;
        const readiness = payload.readiness;
        nodes.phase11Output.replaceChildren();
        if (!readiness?.window) {
            nodes.phase11Output.hidden = true;
            syncPhase11Actions();
            return;
        }
        const status = document.createElement("p");
        status.className = "phase11-operation-state";
        status.dataset.state = readiness.ready ? "ready" : readiness.window.status === "HOLD" ? "hold" : "blocked";
        status.textContent = `${readiness.window.window_code} · ${readiness.window.status} · ${String(readiness.window.period_start).slice(0, 10)} to ${String(readiness.window.period_end).slice(0, 10)}. This is an internal control state only.`;
        const gates = document.createElement("div");
        gates.className = "phase11-gates";
        const labels = { uatAuthorized: "UAT authorization", preRunChecklist: "Pre-run controls",
            noOpenIncidents: "No open incidents", postRunChecklist: "Post-run controls",
            noPendingActions: "No pending actions", windowClosed: "Window closed" };
        Object.entries(readiness.gates || {}).forEach(([key, passed]) => {
            const gate = document.createElement("span");
            gate.dataset.state = passed ? "ready" : "blocked";
            gate.textContent = `${labels[key] || key}: ${passed ? "Ready" : "Blocked"}`;
            gates.appendChild(gate);
        });
        nodes.phase11Output.append(status, gates);
        appendPhase11Table("Operational checklist", ["Stage", "Code", "Status", "Evidence", "Checked by"],
            readiness.checklists.map((item) => [item.stage, item.item_code, item.status,
                item.evidence_reference || "Not supplied", item.checked_by]));
        appendPhase11Table("Incidents", ["Code", "Severity", "Status", "Summary", "Resolution"],
            readiness.incidents.map((item) => [item.incident_code, item.severity, item.status, item.summary, item.resolution || "Open"]));
        appendPhase11Table("Exceptional actions", ["Code", "Type", "Status", "Authority", "Evidence"],
            readiness.actions.map((item) => [item.action_code, item.action_type, item.status,
                item.authority_reference || "Not supplied", item.evidence_reference || "Not supplied"]));
        nodes.phase11Output.hidden = false;
        syncPhase11Actions();
    }

    async function loadPhase11() {
        const selected = nodes.phase11Window.value;
        const readinessPayload = await request(`/phase11/readiness${selected ? `?windowId=${encodeURIComponent(selected)}` : ""}`);
        if (!readinessPayload.schemaReady) return renderPhase11Readiness(readinessPayload);
        const windowsPayload = await request("/phase11/windows");
        state.operationsWindows = Array.isArray(windowsPayload.items) ? windowsPayload.items : [];
        nodes.phase11Window.replaceChildren(new Option("Select an operations window", ""));
        state.operationsWindows.forEach((item) => nodes.phase11Window.add(new Option(
            `${item.window_code} · ${item.status} · ${item.open_incident_count} open incidents`, item.id)));
        if ([...nodes.phase11Window.options].some((option) => option.value === selected)) nodes.phase11Window.value = selected;
        nodes.phase11Authorization.replaceChildren(new Option("Select an authorization", ""));
        (windowsPayload.authorizations || []).forEach((item) => nodes.phase11Authorization.add(new Option(
            `${item.authorization_code} · ${item.cycle_code}`, item.id)));
        renderPhase11Readiness(readinessPayload);
    }

    async function refreshPhase11Readiness() {
        try {
            const suffix = nodes.phase11Window.value ? `?windowId=${encodeURIComponent(nodes.phase11Window.value)}` : "";
            renderPhase11Readiness(await request(`/phase11/readiness${suffix}`));
        } catch (error) { showNotice(error.message, "error"); }
    }

    async function createOperationsWindow(event) {
        event.preventDefault();
        if (!nodes.phase11WindowForm.reportValidity()) return;
        setButtonState(nodes.phase11CreateWindow, true);
        try {
            const payload = await request("/phase11/windows", { method: "POST", body: JSON.stringify({
                authorizationId: Number(nodes.phase11Authorization.value),
                windowCode: document.getElementById("phase11-window-code").value,
                periodStart: document.getElementById("phase11-period-start").value,
                periodEnd: document.getElementById("phase11-period-end").value,
                cutoffAt: document.getElementById("phase11-cutoff").value,
            }) });
            showNotice(payload.message, "success");
            nodes.phase11WindowForm.reset();
            await loadPhase11();
            nodes.phase11Window.value = String(payload.id);
            await refreshPhase11Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase11CreateWindow, false); syncPhase11Actions(); }
    }

    async function saveOperationsChecklist(event) {
        event.preventDefault();
        if (!nodes.phase11ChecklistForm.reportValidity() || !nodes.phase11Window.value) return;
        setButtonState(nodes.phase11SaveCheck, true);
        try {
            const payload = await request(`/phase11/windows/${encodeURIComponent(nodes.phase11Window.value)}/checklists`, {
                method: "POST", body: JSON.stringify({
                    stage: document.getElementById("phase11-stage").value,
                    itemCode: document.getElementById("phase11-item-code").value,
                    itemLabel: document.getElementById("phase11-item-label").value,
                    evidenceReference: document.getElementById("phase11-check-evidence").value,
                    status: document.getElementById("phase11-check-status").value,
                }),
            });
            showNotice(payload.message, "success");
            nodes.phase11ChecklistForm.reset(); syncPhase11ChecklistItems();
            await loadPhase11(); await refreshPhase11Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase11SaveCheck, false); syncPhase11Actions(); }
    }

    async function saveOperationsIncident(event) {
        event.preventDefault();
        if (!nodes.phase11IncidentForm.reportValidity() || !nodes.phase11Window.value) return;
        setButtonState(nodes.phase11SaveIncident, true);
        try {
            const payload = await request(`/phase11/windows/${encodeURIComponent(nodes.phase11Window.value)}/incidents`, {
                method: "POST", body: JSON.stringify({
                    incidentCode: document.getElementById("phase11-incident-code").value,
                    severity: document.getElementById("phase11-incident-severity").value,
                    summary: document.getElementById("phase11-incident-summary").value,
                    resolution: document.getElementById("phase11-incident-resolution").value,
                    status: document.getElementById("phase11-incident-status").value,
                }),
            });
            showNotice(payload.message, "success"); nodes.phase11IncidentForm.reset();
            await loadPhase11(); await refreshPhase11Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase11SaveIncident, false); syncPhase11Actions(); }
    }

    async function saveOperationsAction(event) {
        event.preventDefault();
        if (!nodes.phase11ActionForm.reportValidity() || !nodes.phase11Window.value) return;
        setButtonState(nodes.phase11SaveAction, true);
        try {
            const payload = await request(`/phase11/windows/${encodeURIComponent(nodes.phase11Window.value)}/actions`, {
                method: "POST", body: JSON.stringify({
                    actionCode: document.getElementById("phase11-action-code").value,
                    actionType: document.getElementById("phase11-action-type").value,
                    reason: document.getElementById("phase11-action-reason").value,
                    authorityReference: document.getElementById("phase11-action-authority").value,
                    evidenceReference: document.getElementById("phase11-action-evidence").value,
                    status: document.getElementById("phase11-action-status").value,
                }),
            });
            showNotice(payload.message, "success"); nodes.phase11ActionForm.reset();
            await loadPhase11(); await refreshPhase11Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase11SaveAction, false); syncPhase11Actions(); }
    }

    async function saveOperationsStatus(event) {
        event.preventDefault();
        if (!nodes.phase11StatusForm.reportValidity() || !nodes.phase11Window.value || !nodes.phase11Confirm.checked) return;
        setButtonState(nodes.phase11SaveStatus, true);
        try {
            const payload = await request(`/phase11/windows/${encodeURIComponent(nodes.phase11Window.value)}/status`, {
                method: "POST", body: JSON.stringify({ status: document.getElementById("phase11-target-status").value,
                    statement: document.getElementById("phase11-status-statement").value, confirm: true }),
            });
            showNotice(payload.message, "success"); nodes.phase11StatusForm.reset();
            await loadPhase11(); await refreshPhase11Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase11SaveStatus, false); syncPhase11Actions(); }
    }

    // ============================================================
    // [PHASE 12] COMPLIANCE REPORTING AND YEAR-END EVIDENCE
    // ============================================================
    const splitComplianceCodes = (value) => [...new Set(String(value || "").split(",")
        .map((item) => item.trim().toUpperCase()).filter(Boolean))];

    function syncPhase12PeriodType() {
        const monthly = document.getElementById("phase12-period-type").value === "MONTHLY";
        const month = document.getElementById("phase12-month");
        month.disabled = !monthly;
        month.required = monthly;
        if (!monthly) month.value = "";
    }

    function syncPhase12Actions() {
        const readiness = state.currentPhase12Readiness;
        const period = readiness?.period;
        const open = Boolean(period && period.status !== "CLOSED");
        const yearEnd = open && period.period_type === "YEAR_END";
        nodes.phase12PrepareReport.disabled = !open || !nodes.phase12Run.value;
        nodes.phase12SaveFiling.disabled = !open || !nodes.phase12Report.value || !nodes.phase12FilingConfirm.checked;
        nodes.phase12DownloadReport.disabled = !nodes.phase12Report.value;
        nodes.phase12GenerateYearEnd.disabled = !yearEnd;
        nodes.phase12SaveYearStatus.disabled = !yearEnd || !nodes.phase12YearRecord.value;
        nodes.phase12DownloadYearEnd.disabled = !yearEnd || !(readiness?.yearEndRecords || []).length;
        nodes.phase12Close.disabled = !open || !readiness?.closeReady || !nodes.phase12CloseConfirm.checked;
    }

    function appendPhase12Table(titleText, headers, rows) {
        const heading = document.createElement("h3"); heading.textContent = titleText;
        const shell = document.createElement("div"); shell.className = "phase12-table-shell";
        const table = document.createElement("table"); table.className = "payroll-table phase12-table";
        const head = document.createElement("thead"); const headRow = document.createElement("tr");
        headers.forEach((value) => runCell(headRow, value)); head.appendChild(headRow);
        const body = document.createElement("tbody");
        if (!rows.length) { const row = document.createElement("tr"); runCell(row, "No records.", "table-message").colSpan = headers.length; body.appendChild(row); }
        else rows.forEach((values) => { const row = document.createElement("tr"); values.forEach((value) => runCell(row, value)); body.appendChild(row); });
        table.append(head, body); shell.appendChild(table); nodes.phase12Output.append(heading, shell);
    }

    function renderPhase12Readiness(payload) {
        state.currentPhase12Readiness = payload.readiness;
        nodes.phase12Status.dataset.state = payload.schemaReady ? "ready" : "blocked";
        nodes.phase12Status.textContent = payload.schemaReady ? "Schema ready" : "Migration required";
        if (!payload.schemaReady) {
            nodes.phase12Summary.textContent = "Apply the reviewed Phase 12 migration before preparing compliance evidence.";
            return syncPhase12Actions();
        }
        nodes.phase12Summary.textContent = `${payload.periods} compliance periods · ${payload.filedReports} reports filed externally · ${payload.closedPeriods} periods closed`;
        const readiness = payload.readiness;
        nodes.phase12Report.replaceChildren(new Option("Select a report", ""));
        nodes.phase12Amendment.replaceChildren(new Option("Original report", ""));
        nodes.phase12YearRecord.replaceChildren(new Option("Select an annual employee record", ""));
        nodes.phase12Output.replaceChildren();
        if (!readiness?.period) { nodes.phase12Output.hidden = true; return syncPhase12Actions(); }
        readiness.reports.forEach((item) => {
            nodes.phase12Report.add(new Option(`${item.report_code} · ${item.agency} · ${item.status}`, item.id));
            if (item.status === "FILED") nodes.phase12Amendment.add(new Option(`${item.report_code} · filed`, item.id));
        });
        readiness.yearEndRecords.forEach((item) => nodes.phase12YearRecord.add(new Option(
            `${item.usercode} · ${item.employee_name} · ${item.status}`, item.id)));
        const status = document.createElement("p"); status.className = "phase12-compliance-state";
        status.dataset.state = readiness.ready ? "ready" : "blocked";
        status.textContent = `${readiness.period.period_code} · ${readiness.period.status} · ${readiness.period.period_key}. No government filing is submitted from this workspace.`;
        const gates = document.createElement("div"); gates.className = "phase12-gates";
        const labels = { reportsPrepared: "Reports prepared", reportsFiled: "Reports filed",
            yearEndGenerated: "Annual records generated", yearEndIssued: "Annual records issued", periodClosed: "Period closed" };
        Object.entries(readiness.gates || {}).forEach(([key, passed]) => { const gate = document.createElement("span");
            gate.dataset.state = passed ? "ready" : "blocked"; gate.textContent = `${labels[key] || key}: ${passed ? "Ready" : "Blocked"}`; gates.appendChild(gate); });
        nodes.phase12Output.append(status, gates);
        appendPhase12Table("Compliance reports", ["Code", "Agency", "Type", "Employees", "Amount", "Status", "Filing reference"],
            readiness.reports.map((item) => [item.report_code, item.agency, item.report_type, item.employee_count,
                money(item.total_amount), item.status, item.filing_reference || "Not filed"]));
        if (readiness.period.period_type === "YEAR_END") appendPhase12Table("Annual employee records", ["Employee", "Gross", "Deductions", "Withholding", "Net", "Status"],
            readiness.yearEndRecords.map((item) => [item.usercode, money(item.gross_amount), money(item.deduction_amount),
                money(item.withholding_amount), money(item.net_amount), item.status]));
        nodes.phase12Output.hidden = false; syncPhase12Actions();
    }

    async function loadPhase12() {
        const selected = nodes.phase12Period.value;
        const readinessPayload = await request(`/phase12/readiness${selected ? `?periodId=${encodeURIComponent(selected)}` : ""}`);
        if (!readinessPayload.schemaReady) return renderPhase12Readiness(readinessPayload);
        const periodsPayload = await request("/phase12/periods");
        state.compliancePeriods = Array.isArray(periodsPayload.items) ? periodsPayload.items : [];
        nodes.phase12Period.replaceChildren(new Option("Select a compliance period", ""));
        state.compliancePeriods.forEach((item) => nodes.phase12Period.add(new Option(
            `${item.period_code} · ${item.period_type} · ${item.status}`, item.id)));
        if ([...nodes.phase12Period.options].some((option) => option.value === selected)) nodes.phase12Period.value = selected;
        renderPhase12Readiness(readinessPayload);
    }

    async function refreshPhase12Readiness() {
        try {
            const suffix = nodes.phase12Period.value ? `?periodId=${encodeURIComponent(nodes.phase12Period.value)}` : "";
            renderPhase12Readiness(await request(`/phase12/readiness${suffix}`));
        } catch (error) { showNotice(error.message, "error"); }
    }

    async function createCompliancePeriod(event) {
        event.preventDefault(); if (!nodes.phase12PeriodForm.reportValidity()) return;
        setButtonState(nodes.phase12CreatePeriod, true);
        try {
            const payload = await request("/phase12/periods", { method: "POST", body: JSON.stringify({
                periodCode: document.getElementById("phase12-period-code").value,
                periodType: document.getElementById("phase12-period-type").value,
                year: Number(document.getElementById("phase12-year").value),
                month: Number(document.getElementById("phase12-month").value),
                note: document.getElementById("phase12-period-note").value,
            }) });
            showNotice(payload.message, "success"); nodes.phase12PeriodForm.reset(); syncPhase12PeriodType();
            await loadPhase12(); nodes.phase12Period.value = String(payload.id); await refreshPhase12Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase12CreatePeriod, false); }
    }

    async function prepareComplianceReport(event) {
        event.preventDefault(); if (!nodes.phase12ReportForm.reportValidity() || !nodes.phase12Period.value) return;
        setButtonState(nodes.phase12PrepareReport, true);
        try {
            const payload = await request(`/phase12/periods/${encodeURIComponent(nodes.phase12Period.value)}/reports`, {
                method: "POST", body: JSON.stringify({ runId: Number(nodes.phase12Run.value),
                    agency: document.getElementById("phase12-agency").value,
                    reportType: document.getElementById("phase12-report-type").value,
                    reportCode: document.getElementById("phase12-report-code").value,
                    componentCodes: splitComplianceCodes(document.getElementById("phase12-components").value),
                    amendmentOfId: Number(nodes.phase12Amendment.value) || null }),
            });
            showNotice(payload.message, "success"); nodes.phase12ReportForm.reset();
            await loadPhase12(); await refreshPhase12Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase12PrepareReport, false); syncPhase12Actions(); }
    }

    async function saveComplianceReportStatus(event) {
        event.preventDefault(); if (!nodes.phase12Report.value || !nodes.phase12FilingConfirm.checked) return;
        setButtonState(nodes.phase12SaveFiling, true);
        try {
            const payload = await request(`/phase12/reports/${encodeURIComponent(nodes.phase12Report.value)}/status`, {
                method: "POST", body: JSON.stringify({ status: document.getElementById("phase12-report-status").value,
                    filingReference: document.getElementById("phase12-filing-reference").value,
                    filingDate: document.getElementById("phase12-filing-date").value, confirm: true }),
            });
            showNotice(payload.message, "success"); nodes.phase12FilingForm.reset();
            await loadPhase12(); await refreshPhase12Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase12SaveFiling, false); syncPhase12Actions(); }
    }

    async function downloadComplianceFile(path, filename) {
        try {
            const response = await fetch(`${API_BASE}${path}`, { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} });
            if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || "Download failed."); }
            const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a");
            link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        } catch (error) { showNotice(error.message, "error"); }
    }

    async function generateYearEndRecords() {
        if (!nodes.phase12Period.value) return;
        setButtonState(nodes.phase12GenerateYearEnd, true);
        try {
            const payload = await request(`/phase12/periods/${encodeURIComponent(nodes.phase12Period.value)}/year-end`, {
                method: "POST", body: JSON.stringify({ withholdingCodes: splitComplianceCodes(document.getElementById("phase12-withholding-codes").value) }),
            });
            showNotice(payload.message, "success"); await loadPhase12(); await refreshPhase12Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase12GenerateYearEnd, false); syncPhase12Actions(); }
    }

    async function saveYearEndStatus(event) {
        event.preventDefault(); if (!nodes.phase12YearRecord.value) return;
        setButtonState(nodes.phase12SaveYearStatus, true);
        try {
            const payload = await request(`/phase12/year-end/${encodeURIComponent(nodes.phase12YearRecord.value)}/status`, {
                method: "POST", body: JSON.stringify({ status: document.getElementById("phase12-year-status").value,
                    issueReference: document.getElementById("phase12-issue-reference").value, confirm: true }),
            });
            showNotice(payload.message, "success"); await loadPhase12(); await refreshPhase12Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase12SaveYearStatus, false); syncPhase12Actions(); }
    }

    async function closeCompliancePeriod(event) {
        event.preventDefault(); if (!nodes.phase12Period.value || !nodes.phase12CloseConfirm.checked) return;
        setButtonState(nodes.phase12Close, true);
        try {
            const payload = await request(`/phase12/periods/${encodeURIComponent(nodes.phase12Period.value)}/close`, {
                method: "POST", body: JSON.stringify({ statement: document.getElementById("phase12-close-statement").value, confirm: true }),
            });
            showNotice(payload.message, "success"); nodes.phase12CloseForm.reset(); await loadPhase12(); await refreshPhase12Readiness();
        } catch (error) { showNotice(error.message, "error"); }
        finally { setButtonState(nodes.phase12Close, false); syncPhase12Actions(); }
    }

    // ============================================================
    // [HYBRID UI] SIX WORKSPACES, FOCUSED SUB-TABS, AND TASK DRAWER
    // ============================================================
    const hybridUi = { activeTab: "overview", activeSubtabs: {}, drawerForm: null, drawerLauncher: null };

    const hybridFormLabels = {
        "salary-import-form": "Import employee salaries", "schedule-template-form": "Create work schedule",
        "schedule-assign-form": "Assign employee schedules", "component-form": "Create pay component",
        "component-assignment-form": "Assign recurring component", "loan-form": "Record employee loan",
        "statutory-rule-form": "Create statutory bracket", "adjustment-form": "Add run adjustment",
        "phase8-mapping-form": "Configure account mapping", "payroll-run-form": "Create payroll run",
        "phase6-action-form": "Approve or release payroll", "phase9-test-form": "Run parallel payroll comparison",
        "phase10-cycle-form": "Open UAT cycle", "phase10-case-form": "Record UAT case",
        "phase10-issue-form": "Track UAT issue", "phase10-authorize-form": "Authorize controlled go-live",
        "phase11-window-form": "Plan production window", "phase11-checklist-form": "Record operations checklist",
        "phase11-incident-form": "Record production incident", "phase11-action-form": "Record exceptional action",
        "phase11-status-form": "Change operations status", "phase12-period-form": "Open compliance period",
        "phase12-report-form": "Prepare statutory report", "phase12-filing-form": "Record filing evidence",
        "phase12-year-end-form": "Manage annual employee records", "phase12-close-form": "Close compliance period",
        "overtime-calculator": "Preview overtime amount",
    };

    function hybridElement(selector) { return typeof selector === "string" ? document.querySelector(selector) : selector; }

    function buildHybridSubtabs(panelKey, specs, persistent = []) {
        const panel = document.querySelector(`[data-hybrid-panel="${panelKey}"]`);
        const nav = panel.querySelector(".hybrid-subnav");
        const body = panel.querySelector(".hybrid-panel-body");
        persistent.map(hybridElement).filter(Boolean).forEach((item) => body.appendChild(item));
        specs.forEach((spec, index) => {
            const button = document.createElement("button");
            button.type = "button"; button.role = "tab"; button.textContent = spec.label;
            button.dataset.hybridSubtab = spec.key; button.setAttribute("aria-selected", index === 0 ? "true" : "false");
            const view = document.createElement("section");
            view.className = `hybrid-subview ${spec.layout || ""}`.trim();
            view.dataset.hybridSubview = spec.key; view.hidden = index !== 0;
            const heading = document.createElement("header"); heading.className = "hybrid-subview-heading";
            const title = document.createElement("h2"); title.textContent = spec.label;
            const copy = document.createElement("p"); copy.textContent = spec.description;
            heading.append(title, copy); view.appendChild(heading);
            spec.items.map(hybridElement).filter(Boolean).forEach((item) => view.appendChild(item));
            button.addEventListener("click", () => activateHybridSubtab(panelKey, spec.key));
            button.addEventListener("keydown", hybridArrowNavigation);
            nav.appendChild(button); body.appendChild(view);
        });
        hybridUi.activeSubtabs[panelKey] = specs[0]?.key || "";
    }

    function hybridArrowNavigation(event) {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const buttons = [...event.currentTarget.parentElement.querySelectorAll('[role="tab"]')];
        const index = buttons.indexOf(event.currentTarget);
        buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length].focus();
    }

    function activateHybridSubtab(panelKey, subKey, updateHash = true) {
        const panel = document.querySelector(`[data-hybrid-panel="${panelKey}"]`);
        panel.querySelectorAll("[data-hybrid-subtab]").forEach((button) => button.setAttribute("aria-selected", button.dataset.hybridSubtab === subKey ? "true" : "false"));
        panel.querySelectorAll("[data-hybrid-subview]").forEach((view) => { view.hidden = view.dataset.hybridSubview !== subKey; });
        hybridUi.activeSubtabs[panelKey] = subKey;
        if (updateHash) history.replaceState(null, "", `#payroll/${panelKey}/${subKey}`);
    }

    function activateHybridTab(tabKey, subKey, updateHash = true) {
        const validTab = document.querySelector(`[data-hybrid-panel="${tabKey}"]`) ? tabKey : "overview";
        document.querySelectorAll("[data-hybrid-tab]").forEach((button) => button.setAttribute("aria-selected", button.dataset.hybridTab === validTab ? "true" : "false"));
        document.querySelectorAll("[data-hybrid-panel]").forEach((panel) => { panel.hidden = panel.dataset.hybridPanel !== validTab; });
        hybridUi.activeTab = validTab;
        const wantedSub = subKey && document.querySelector(`[data-hybrid-panel="${validTab}"] [data-hybrid-subview="${subKey}"]`)
            ? subKey : hybridUi.activeSubtabs[validTab];
        if (wantedSub) activateHybridSubtab(validTab, wantedSub, false);
        if (updateHash) history.replaceState(null, "", `#payroll/${validTab}/${wantedSub || ""}`);
    }

    function closeHybridDrawer() {
        const drawer = document.getElementById("payroll-hybrid-drawer");
        if (hybridUi.drawerForm && hybridUi.drawerLauncher) {
            hybridUi.drawerLauncher.after(hybridUi.drawerForm);
            hybridUi.drawerForm.hidden = true; hybridUi.drawerLauncher.hidden = false;
        }
        drawer.hidden = true; document.body.classList.remove("hybrid-drawer-open");
        hybridUi.drawerLauncher?.querySelector("button")?.focus();
        hybridUi.drawerForm = null; hybridUi.drawerLauncher = null;
    }

    function openHybridDrawer(form, launcher, label) {
        if (hybridUi.drawerForm) closeHybridDrawer();
        hybridUi.drawerForm = form; hybridUi.drawerLauncher = launcher;
        document.getElementById("hybrid-drawer-title").textContent = label;
        document.getElementById("hybrid-drawer-body").appendChild(form);
        form.hidden = false; launcher.hidden = true;
        document.getElementById("payroll-hybrid-drawer").hidden = false;
        document.body.classList.add("hybrid-drawer-open");
        window.setTimeout(() => form.querySelector("input:not([type=hidden]),select,button")?.focus(), 0);
    }

    function configureHybridDrawerForms() {
        document.querySelectorAll(".payroll-hybrid-panels form").forEach((form) => {
            if (form.id === "compensation-form") return;
            const label = hybridFormLabels[form.id] || form.querySelector("h3")?.textContent || "Open payroll task";
            const launcher = document.createElement("article"); launcher.className = "hybrid-launch-card";
            const copy = document.createElement("div"); const title = document.createElement("strong"); title.textContent = label;
            const hint = document.createElement("span"); hint.textContent = "Open this task when you are ready to add or update a record.";
            const button = document.createElement("button"); button.type = "button"; button.className = "button button-primary"; button.textContent = `Open ${label}`;
            button.addEventListener("click", () => openHybridDrawer(form, launcher, label));
            copy.append(title, hint); launcher.append(copy, button); form.before(launcher); form.hidden = true;
        });
    }

    function topFormChild(form, selector) {
        let element = form.querySelector(selector);
        while (element && element.parentElement !== form) element = element.parentElement;
        return element;
    }

    function configureHybridWizard(form, groupSelectors, labels) {
        if (!form) return;
        const progress = document.createElement("div"); progress.className = "hybrid-wizard-progress";
        form.prepend(progress); const steps = [];
        groupSelectors.forEach((selectors, index) => {
            const step = document.createElement("section"); step.className = "hybrid-wizard-step"; step.hidden = index !== 0;
            [...new Set(selectors.map((selector) => topFormChild(form, selector)).filter(Boolean))].forEach((item) => step.appendChild(item));
            const actions = document.createElement("div"); actions.className = "hybrid-wizard-actions";
            if (index > 0) { const back = document.createElement("button"); back.type = "button"; back.className = "button button-quiet"; back.textContent = "Back"; back.addEventListener("click", () => showStep(index - 1)); actions.appendChild(back); }
            if (index < groupSelectors.length - 1) { const next = document.createElement("button"); next.type = "button"; next.className = "button button-primary"; next.textContent = "Continue"; next.addEventListener("click", () => {
                const invalid = [...step.querySelectorAll("input,select,textarea")].find((input) => !input.checkValidity());
                if (invalid) return invalid.reportValidity(); showStep(index + 1);
            }); actions.appendChild(next); }
            step.appendChild(actions); form.appendChild(step); steps.push(step);
        });
        function showStep(index) { steps.forEach((step, stepIndex) => { step.hidden = stepIndex !== index; });
            progress.textContent = `Step ${index + 1} of ${steps.length} · ${labels[index]}`; }
        form.classList.add("hybrid-wizard-form"); form.addEventListener("reset", () => window.setTimeout(() => showStep(0), 0)); showStep(0);
    }

    function createHybridOverview() {
        const section = document.createElement("section"); section.className = "hybrid-overview-command";
        section.innerHTML = `<div class="hybrid-overview-heading"><div><p>Command center</p><h2>What needs attention</h2></div><button class="button button-primary" id="hybrid-next-action" type="button">Open next action</button></div><div class="hybrid-overview-cards"><article><span>Current run</span><strong id="hybrid-current-run">Loading</strong><small id="hybrid-current-run-note">Checking payroll runs</small></article><article><span>Blocking exceptions</span><strong id="hybrid-blockers">—</strong><small>Unresolved run exceptions</small></article><article><span>Pending approval</span><strong id="hybrid-approvals">—</strong><small>Locked payroll awaiting approval</small></article><article><span>Testing readiness</span><strong id="hybrid-testing">—</strong><small>Parallel, UAT, and operations</small></article><article><span>Compliance</span><strong id="hybrid-compliance">—</strong><small>Periods and filing evidence</small></article></div><p class="hybrid-next-copy" id="hybrid-next-copy">Loading the next required payroll action.</p>`;
        return section;
    }

    function renderHybridSummary() {
        const latest = state.runs[0]; const blockers = state.runs.reduce((sum, run) => sum + Number(run.exception_count || 0), 0);
        const pending = state.runs.filter((run) => run.status === "LOCKED").length;
        setText("hybrid-current-run", latest?.run_code || "No payroll run");
        setText("hybrid-current-run-note", latest ? `${latest.status} · ${String(latest.pay_date).slice(0, 10)}` : "Create a draft when setup is complete");
        setText("hybrid-blockers", blockers); setText("hybrid-approvals", pending);
        setText("hybrid-testing", `${state.parallelTests.length} parallel · ${state.uatCycles.length} UAT`);
        setText("hybrid-compliance", `${state.compliancePeriods.length} periods`);
        const employees = Number(document.getElementById("metric-employees")?.textContent || 0);
        const salaries = Number(document.getElementById("metric-salaries")?.textContent || 0);
        let next = { copy: "Review the latest payroll run and continue its required workflow.", tab: "run", sub: "runs" };
        if (!employees || salaries < employees) next = { copy: "Complete employee salary coverage before creating payroll.", tab: "setup", sub: "people" };
        else if (Number(document.getElementById("metric-schedules")?.textContent || 0) < employees) next = { copy: "Assign work schedules to every employee.", tab: "setup", sub: "schedules" };
        else if (!latest) next = { copy: "Setup is ready. Create the first draft payroll run.", tab: "run", sub: "runs" };
        else if (blockers) next = { copy: "Resolve blocking payroll exceptions before locking the run.", tab: "run", sub: "runs" };
        else if (pending) next = { copy: "Review and approve the locked payroll run.", tab: "run", sub: "approvals" };
        setText("hybrid-next-copy", next.copy);
        const action = document.getElementById("hybrid-next-action"); action.onclick = () => activateHybridTab(next.tab, next.sub);
        const order = ["DRAFT", "CALCULATED", "LOCKED", "APPROVED", "RELEASED"];
        document.querySelectorAll("[data-run-step]").forEach((step) => {
            const index = Number(step.dataset.runStep); const current = latest ? order.indexOf(latest.status) : -1;
            step.dataset.state = current >= index ? "complete" : current + 1 === index ? "current" : "pending";
        });
    }

    function setupHybridInterface() {
        const overview = createHybridOverview();
        buildHybridSubtabs("overview", [{ key: "command", label: "Command Center", description: "Readiness, alerts, current payroll, and the next required action.", items: [overview, ".metric-strip", ".readiness-panel"] }]);
        buildHybridSubtabs("setup", [
            { key: "people", label: "Employees & Salaries", description: "Search employee payroll profiles and maintain effective salary history.", items: ["#salary-import-form", ".workspace-main"] },
            { key: "schedules", label: "Work Schedules", description: "Create reusable schedules and assign them to employees.", items: ["#schedule-template-form", "#schedule-assign-form"] },
            { key: "components", label: "Earnings & Deductions", description: "Maintain components, recurring assignments, and draft adjustments.", items: ["#component-form", "#component-assignment-form", "#adjustment-form", "#phase5-summary"] },
            { key: "loans", label: "Loans", description: "Record approved employee loans and installments.", items: ["#loan-form"] },
            { key: "statutory", label: "Statutory Rules", description: "Maintain approved effective-dated contribution and deduction brackets.", items: ["#statutory-rule-form"] },
            { key: "accounting", label: "Account Mappings", description: "Map payroll components to approved debit and credit accounts.", items: ["#phase8-mapping-form"] },
            { key: "overtime", label: "Overtime Rules", description: "Review multipliers and preview supported overtime calculations.", items: [".workspace-side"] },
        ]);
        const stepper = document.createElement("ol"); stepper.className = "hybrid-run-stepper";
        const runLevels = [0, 1, 1, 1, 1, 2, 3, 4, 4];
        ["Create", "Calculate", "Review", "Resolve", "Adjust", "Lock", "Approve", "Release", "Payslips"].forEach((label, index) => { const item = document.createElement("li"); item.dataset.runStep = runLevels[index]; item.textContent = label; stepper.appendChild(item); });
        buildHybridSubtabs("run", [
            { key: "runs", label: "Runs & Exceptions", description: "Create, calculate, review, correct, and lock payroll snapshots.", items: [".run-panel"] },
            { key: "approvals", label: "Approvals & Payslips", description: "Approve, release, inspect registers, and open employee payslips.", items: [".phase6-panel"] },
        ], [stepper]);
        buildHybridSubtabs("payments", [
            { key: "reconciliation", label: "Disbursement & Remittances", description: "Track external payment confirmation and statutory remittance reconciliation.", items: [".phase7-panel"] },
            { key: "accounting", label: "Journal, Reports & Close", description: "Review accounting evidence, reports, and irreversible period closing.", items: [".phase8-panel"] },
        ]);
        buildHybridSubtabs("testing", [
            { key: "parallel", label: "Parallel Payroll", description: "Compare independent payroll totals and collect cutover signoffs.", items: [".phase9-panel"] },
            { key: "uat", label: "UAT & Go-Live", description: "Record UAT evidence, issues, rollback proof, and controlled authorization.", items: [".phase10-panel"] },
            { key: "operations", label: "Production Operations", description: "Manage operating windows, checklists, incidents, and exceptional actions.", items: [".phase11-panel"] },
        ]);
        buildHybridSubtabs("compliance", [
            { key: "periods", label: "Compliance Periods", description: "Open monthly or year-end compliance periods.", items: ["#phase12-period-form"] },
            { key: "reports", label: "Reports & Filing", description: "Prepare statutory summaries, verify evidence, file externally, and amend reports.", items: ["#phase12-report-form", "#phase12-filing-form"] },
            { key: "annual", label: "Annual Records", description: "Generate, verify, issue, and export annual employee payroll records.", items: ["#phase12-year-end-form"] },
            { key: "close", label: "Year-End Close", description: "Close a fully filed compliance period after final review.", items: ["#phase12-close-form"] },
        ], [".phase12-panel > .section-heading", ".phase12-toolbar", ".phase12-summary", ".phase12-output"]);
        [".master-data-panel", ".phase5-panel", ".workspace-grid", ".phase12-panel"].forEach((selector) => { const item = document.querySelector(selector); if (item) item.hidden = true; });
        configureHybridWizard(nodes.runForm, [["#run-code", "#run-start", "#run-end"], ["#run-pay-date", "#run-factor", "#run-create"]], ["Cutoff", "Pay date and confirmation"]);
        configureHybridWizard(nodes.phase12ReportForm, [["#phase12-run"], ["#phase12-report-type", "#phase12-components"], ["#phase12-amendment", "#phase12-prepare-report"]], ["Source and agency", "Report definition", "Review and prepare"]);
        configureHybridDrawerForms();
        document.querySelectorAll("[data-hybrid-tab]").forEach((button) => { button.addEventListener("click", () => activateHybridTab(button.dataset.hybridTab)); button.addEventListener("keydown", hybridArrowNavigation); });
        document.getElementById("hybrid-drawer-backdrop").addEventListener("click", closeHybridDrawer);
        document.getElementById("hybrid-drawer-close").addEventListener("click", closeHybridDrawer);
        window.addEventListener("hashchange", () => { const [, tab, sub] = location.hash.split("/"); activateHybridTab(tab, sub, false); });
        const [, tab, sub] = location.hash.split("/"); activateHybridTab(tab, sub, false);
        document.body.classList.add("hybrid-ready");
    }

    setupHybridInterface();

    // ============================================================
    // [EVENT] PAGE WIRING
    // ============================================================
    nodes.refreshEmployees.addEventListener("click", loadEmployees);
    nodes.runForm.addEventListener("submit", createRun);
    nodes.salaryImportForm.addEventListener("submit", importSalaries);
    nodes.scheduleTemplateForm.addEventListener("submit", saveScheduleTemplate);
    nodes.scheduleAssignForm.addEventListener("submit", assignSchedules);
    nodes.componentForm.addEventListener("submit", saveComponent);
    nodes.assignmentForm.addEventListener("submit", assignComponent);
    nodes.loanForm.addEventListener("submit", saveLoan);
    nodes.statutoryForm.addEventListener("submit", saveStatutoryRule);
    nodes.adjustmentForm.addEventListener("submit", saveAdjustment);
    nodes.phase6Run.addEventListener("change", syncPhase6Actions);
    nodes.phase6Employee.addEventListener("change", () => {
        nodes.phase6Payslip.disabled = !nodes.phase6Employee.value;
    });
    nodes.phase6Approve.addEventListener("click", () => phase6Action("approve", nodes.phase6Approve));
    nodes.phase6Release.addEventListener("click", () => phase6Action("release", nodes.phase6Release));
    nodes.phase6Register.addEventListener("click", openRegister);
    nodes.phase6Payslip.addEventListener("click", viewPayslip);
    nodes.phase6Export.addEventListener("click", downloadRegister);
    nodes.phase7Run.addEventListener("change", syncPhase7Actions);
    nodes.phase7Remittance.addEventListener("change", syncPhase7Actions);
    nodes.phase7Prepare.addEventListener("click", prepareDisbursement);
    nodes.phase7PrepareRemittances.addEventListener("click", prepareRemittances);
    nodes.phase7Refresh.addEventListener("click", loadReconciliation);
    nodes.phase7UpdateBatch.addEventListener("click", updateDisbursement);
    nodes.phase7UpdateRemittance.addEventListener("click", updateRemittance);
    nodes.phase8MappingForm.addEventListener("submit", saveAccountMapping);
    nodes.phase8Run.addEventListener("change", syncPhase8Actions);
    nodes.phase8CloseConfirm.addEventListener("change", syncPhase8Actions);
    nodes.phase8Reports.addEventListener("click", loadPhase8Reports);
    nodes.phase8Journal.addEventListener("click", loadJournalPreview);
    nodes.phase8Export.addEventListener("click", downloadJournal);
    nodes.phase8Ytd.addEventListener("click", loadYtdLedger);
    nodes.phase8Close.addEventListener("click", closePayrollPeriod);
    nodes.phase9TestForm.addEventListener("submit", compareParallelPayroll);
    nodes.phase9Run.addEventListener("change", syncPhase9Actions);
    nodes.phase9Test.addEventListener("change", async () => { await refreshPhase9Readiness(); syncPhase9Actions(); });
    nodes.phase9ViewTest.addEventListener("click", viewParallelTest);
    nodes.phase9Readiness.addEventListener("click", refreshPhase9Readiness);
    nodes.phase9Confirm.addEventListener("change", syncPhase9Actions);
    nodes.phase9Statement.addEventListener("input", syncPhase9Actions);
    nodes.phase9Sign.addEventListener("click", recordPhase9Signoff);
    nodes.phase10CycleForm.addEventListener("submit", createUatCycle);
    nodes.phase10Test.addEventListener("change", syncPhase10Actions);
    nodes.phase10Cycle.addEventListener("change", refreshPhase10Readiness);
    nodes.phase10Refresh.addEventListener("click", refreshPhase10Readiness);
    nodes.phase10CaseForm.addEventListener("submit", saveUatCase);
    nodes.phase10IssueForm.addEventListener("submit", saveUatIssue);
    nodes.phase10Confirm.addEventListener("change", syncPhase10Actions);
    nodes.phase10AuthorizeForm.addEventListener("submit", authorizeGoLive);
    nodes.phase11WindowForm.addEventListener("submit", createOperationsWindow);
    nodes.phase11Authorization.addEventListener("change", syncPhase11Actions);
    nodes.phase11Window.addEventListener("change", refreshPhase11Readiness);
    nodes.phase11Refresh.addEventListener("click", refreshPhase11Readiness);
    nodes.phase11ChecklistForm.addEventListener("submit", saveOperationsChecklist);
    document.getElementById("phase11-stage").addEventListener("change", syncPhase11ChecklistItems);
    nodes.phase11IncidentForm.addEventListener("submit", saveOperationsIncident);
    nodes.phase11ActionForm.addEventListener("submit", saveOperationsAction);
    document.getElementById("phase11-target-status").addEventListener("change", syncPhase11Actions);
    nodes.phase11Confirm.addEventListener("change", syncPhase11Actions);
    nodes.phase11StatusForm.addEventListener("submit", saveOperationsStatus);
    nodes.phase12PeriodForm.addEventListener("submit", createCompliancePeriod);
    document.getElementById("phase12-period-type").addEventListener("change", syncPhase12PeriodType);
    nodes.phase12Period.addEventListener("change", refreshPhase12Readiness);
    nodes.phase12Refresh.addEventListener("click", refreshPhase12Readiness);
    nodes.phase12Run.addEventListener("change", syncPhase12Actions);
    nodes.phase12ReportForm.addEventListener("submit", prepareComplianceReport);
    nodes.phase12Report.addEventListener("change", syncPhase12Actions);
    nodes.phase12FilingConfirm.addEventListener("change", syncPhase12Actions);
    nodes.phase12FilingForm.addEventListener("submit", saveComplianceReportStatus);
    nodes.phase12DownloadReport.addEventListener("click", () => {
        if (nodes.phase12Report.value) downloadComplianceFile(`/phase12/reports/${encodeURIComponent(nodes.phase12Report.value)}.csv`, "compliance-controlled.csv");
    });
    nodes.phase12GenerateYearEnd.addEventListener("click", generateYearEndRecords);
    nodes.phase12YearRecord.addEventListener("change", syncPhase12Actions);
    nodes.phase12YearEndForm.addEventListener("submit", saveYearEndStatus);
    nodes.phase12DownloadYearEnd.addEventListener("click", () => {
        if (nodes.phase12Period.value) downloadComplianceFile(`/phase12/periods/${encodeURIComponent(nodes.phase12Period.value)}/year-end.csv`, "annual-controlled.csv");
    });
    nodes.phase12CloseConfirm.addEventListener("change", syncPhase12Actions);
    nodes.phase12CloseForm.addEventListener("submit", closeCompliancePeriod);
    document.getElementById("component-statutory").addEventListener("change", (event) => {
        if (event.target.checked) document.getElementById("component-type").value = "DEDUCTION";
    });
    nodes.employeeSearch.addEventListener("input", () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(loadEmployees, SEARCH_DELAY_MS);
    });
    nodes.compensationForm.addEventListener("submit", saveCompensation);
    nodes.modalBackdrop.addEventListener("click", () => setModalOpen(false));
    nodes.modalClose.addEventListener("click", () => setModalOpen(false));
    nodes.modalCancel.addEventListener("click", () => setModalOpen(false));
    nodes.calculator.addEventListener("submit", calculateOvertime);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !nodes.modal.hidden) setModalOpen(false);
        else if (event.key === "Escape" && !document.getElementById("payroll-hybrid-drawer").hidden) closeHybridDrawer();
    });

    // ============================================================
    // [INIT] SERVICE CHECK — dashboard already handled user authentication
    // ============================================================
    async function initialize() {
        try {
            nodes.phase8YtdYear.value = String(new Date().getFullYear());
            syncPhase11ChecklistItems();
            document.getElementById("phase12-year").value = String(new Date().getFullYear());
            syncPhase12PeriodType();
            await request("/health");
            setServiceState("online", "Node payroll service online");
            await loadWorkspace();
        } catch (_error) {
            setServiceState("offline", "Node payroll service unavailable");
            showNotice(`Start the Node service on ${API_BASE.replace("/api/payroll", "")} before using Payroll.`, "error");
        }
    }

    initialize();
})();
