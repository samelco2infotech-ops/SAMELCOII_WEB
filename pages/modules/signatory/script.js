// Signatory module ito; dito ayusin ang module at signer flow.
(function () {
    const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
    const API = `${NODE_API_BASE}/signatory`;
    const APP_ROOT = "../../../";
    const SESSION_KEY = "samelcii_session";
    const AREA_OPTION_PREFIX = "area:";
    const state = {
        modules: [],
        departments: [],
        areas: [],
        employees: [],
        groups: [],
        members: [],
        activeModuleKey: "dtr",
        activeDepartment: "CORPORATE PLANNING DEPARTMENT",
        activeArea: "",
        selectedEmployeeCode: "",
        employeeLoadHint: "",
        searchTimer: null
    };

    const $ = (id) => document.getElementById(id);

    // [AUTH] HUWAG BAGUHIN: parehong token parsing sa dashboard at API para privilege 10 lang.
    function readSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}") || {};
        } catch (_error) {
            return {};
        }
    }

    function signatoryPrivilegeTokens(currentSession) {
        const source = `${currentSession.privilage || ""}-${currentSession.privilagemenu || ""}`;
        return source.split(/[^0-9]+/).filter(Boolean);
    }

    function showSuperAdminLock() {
        document.body.classList.add("access-denied");
        const lock = $("super-admin-lock");
        if (lock) {
            lock.hidden = false;
        }
    }

    if (!signatoryPrivilegeTokens(readSession()).includes("10")) {
        showSuperAdminLock();
        return;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function photoUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
        let clean = raw.replace(/^\/+/, "");
        clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, "");
        clean = clean.replace(/^uploads\//i, "uploads/");
        const base = window.SAMELCII_MEDIA_BASE || `${window.location.protocol || "http:"}//${window.location.hostname || "localhost"}:3000`;
        return `${base}/${clean.replace(/^(\.\.\/)+/, "")}`;
    }

    function initials(name) {
        return String(name || "?")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || "")
            .join("") || "?";
    }

    function avatar(person, className = "", usePhoto = true) {
        const src = photoUrl(person.profile_photo_url);
        if (usePhoto && src) {
            return `<img class="avatar ${className}" src="${escapeHtml(src)}" alt="${escapeHtml(person.name || person.usercode || "Employee")}" loading="lazy" decoding="async" />`;
        }
        return `<span class="avatar avatar-fallback ${className}">${escapeHtml(initials(person.name || person.usercode))}</span>`;
    }

    function orgCard(person, className = "", attrs = "") {
        const details = [person.position, person.department, person.area]
            .filter(Boolean)
            .join(" | ") || "-";
        return `
            <div class="org-card ${className}" ${attrs}>
                ${avatar(person, "", !className.includes("employee-card"))}
                <span>
                    <strong>${escapeHtml(person.name || person.usercode)}</strong>
                    <small>${escapeHtml(details)}</small>
                </span>
                <div class="card-tools" aria-hidden="true">
                    <span></span><span></span><span></span><b></b>
                </div>
            </div>
        `;
    }

    function setMessage(text, type = "") {
        const el = $("signatory-message");
        if (!el) return;
        el.className = `message ${type}`.trim();
        el.textContent = text || "";
    }

    async function request(action, options = {}) {
        const token = localStorage.getItem("samelcii_token");
        const headers = new Headers(options.headers || {});
        if (token && token.split(".").length === 3) {
            headers.set("Authorization", `Bearer ${token}`);
        }
        const response = await fetch(`${API}?action=${action}`, {
            credentials: "same-origin",
            ...options,
            headers
        });
        const payload = await response.json().catch(() => ({
            ok: false,
            message: "Invalid server response."
        }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Request failed.");
        }
        return payload;
    }

    function moduleByKey(key) {
        return state.modules.find((item) => item.key === key) || { key, label: key };
    }

    function employeeByCode(usercode) {
        return state.employees.find((item) => String(item.usercode).toUpperCase() === String(usercode).toUpperCase()) || null;
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") {
            return window.CSS.escape(value);
        }
        return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    function renderModules() {
        const target = $("module-list");
        if (!target) return;
        target.innerHTML = state.modules.map((module) => {
            const count = state.groups.filter((item) => item.module_key === module.key).length;
            return `
                <button class="module-label ${state.activeModuleKey === module.key ? "active" : ""}" type="button" draggable="true" data-module-key="${escapeHtml(module.key)}">
                    <strong>${escapeHtml(module.label)}</strong>
                    <small>${count} ${count === 1 ? "signatory" : "signatories"}</small>
                </button>
            `;
        }).join("");
    }

    function renderEmployees() {
        const target = $("employee-list");
        if (!target) return;
        if (state.employees.length === 0) {
            target.innerHTML = `<div class="empty-state">${escapeHtml(state.employeeLoadHint || "No employees found.")}</div>`;
            return;
        }
        target.innerHTML = state.employees.map((person) => `
            ${orgCard(person, "employee-card", `draggable="true" data-usercode="${escapeHtml(person.usercode)}"`)}
        `).join("");
    }

    function renderDepartments() {
        const select = $("department-filter");
        const summary = $("department-summary");
        if (!select) return;

        const currentValue = select.value;
        const departmentOptions = state.departments.map((department) => {
            const count = Number(department.employee_count || 0);
            const label = department.abbreviation
                ? `${department.abbreviation} - ${department.name}`
                : department.name;
            return `
                <option value="${escapeHtml(department.name)}">
                    ${escapeHtml(label)} (${count})
                </option>
            `;
        }).join("");
        const areaOptions = state.areas.map((area) => {
            const count = Number(area.employee_count || 0);
            return `<option value="${AREA_OPTION_PREFIX}${escapeHtml(area.name)}">Area: ${escapeHtml(area.name)} (${count})</option>`;
        }).join("");
        select.innerHTML = `
            <option value="">All Departments / Areas</option>
            <optgroup label="Departments">${departmentOptions}</optgroup>
            <optgroup label="Areas">${areaOptions}</optgroup>
        `;
        select.value = state.activeArea ? `${AREA_OPTION_PREFIX}${state.activeArea}` : (state.activeDepartment || currentValue || "");

        if (!summary) return;
        if (state.activeArea) {
            summary.textContent = `Area: ${state.activeArea} | ${state.employees.length} loaded`;
            return;
        }
        const active = state.departments.find((department) => department.name === state.activeDepartment);
        if (!active) {
            summary.textContent = state.employeeLoadHint || `${state.employees.length} employee${state.employees.length === 1 ? "" : "s"} loaded from all departments.`;
            return;
        }
        const head = active.head ? `${active.head}` : "No head/OIC set";
        const position = active.position ? `, ${active.position}` : "";
        summary.textContent = `${head}${position} | ${state.employees.length} loaded`;
    }

    function groupMembers(groupId) {
        return state.members.filter((item) => Number(item.group_id) === Number(groupId));
    }

    // [FREE-FORM] Per-card positions { 'd-{dept}' | 'g-{id}' | 'm-{id}' → {x,y} }
    const cardPositions = {};
    let dragCardState = null;   // { el, key, offsetX, offsetY }
    let connectDragState = null; // { fromGroupId, fromEl, tempPath, curX, curY }

    function getCardPos(key, dx, dy) {
        return cardPositions[key] || { x: dx, y: dy };
    }

    function autoArrange() {
        const groups = state.groups.filter((g) => g.module_key === state.activeModuleKey);
        if (!groups.length) return;
        const byDept = {};
        groups.forEach((g) => {
            const d = g.department || "Unassigned";
            if (!byDept[d]) byDept[d] = [];
            byDept[d].push(g);
        });
        const CW = 250, CH = 140, GX = 24, GY = 100, DTOP = 48;
        let dX = 48;
        Object.entries(byDept).sort(([a], [b]) => a.localeCompare(b)).forEach(([deptName, deptGroups]) => {
            let colW = 0;
            deptGroups.forEach((g) => { colW += Math.max(1, groupMembers(g.id).length) * (CW + GX); });
            colW = Math.max(colW, CW + GX);
            cardPositions[`d-${deptName}`] = { x: dX + colW / 2 - 110, y: DTOP };
            let sX = dX;
            deptGroups.forEach((group) => {
                const mems = groupMembers(group.id);
                const gW = Math.max(1, mems.length) * (CW + GX) - GX;
                cardPositions[`g-${group.id}`] = { x: sX + gW / 2 - CW / 2, y: DTOP + 80 + GY };
                mems.forEach((m, mi) => {
                    cardPositions[`m-${m.id}`] = { x: sX + mi * (CW + GX), y: DTOP + 80 + GY * 2 + CH };
                });
                sX += Math.max(1, mems.length) * (CW + GX);
            });
            dX += colW + 72;
        });
    }

    // [ZOOM/PAN] Pan and zoom state for the signatory chart viewport
    const viewState = {
        zoom: 0.75,
        panX: 0,
        panY: 0,
        isPanning: false,
        startX: 0,
        startY: 0,
        startPanX: 0,
        startPanY: 0
    };

    function applyViewTransform() {
        const viewport = $("chart-viewport");
        const label = $("zoom-label");
        if (!viewport) return;
        viewport.style.transform = `translate(${viewState.panX}px,${viewState.panY}px) scale(${viewState.zoom})`;
        if (label) label.textContent = Math.round(viewState.zoom * 100) + "%";
        window.requestAnimationFrame(drawConnectors);
    }

    function renderAssignments() {
        const target = $("assignment-list");
        if (!target) return;

        const groups = state.groups.filter((g) => g.module_key === state.activeModuleKey);
        const activeModule = moduleByKey(state.activeModuleKey);

        if (groups.length === 0) {
            target.innerHTML = `
                <div class="chart-empty" data-create-group="1" style="left:100px;top:80px">
                    <p class="preview-label">${escapeHtml(activeModule.label)}</p>
                    <p class="preview-hint">Drag an employee card here to set the ${escapeHtml(activeModule.label)} signatory</p>
                </div>`;
            drawConnectors();
            return;
        }

        // Auto-arrange positions on first load for this module
        const hasPos = groups.some((g) => cardPositions[`g-${g.id}`]);
        if (!hasPos) autoArrange();

        const byDept = {};
        groups.forEach((g) => {
            const d = g.department || "Unassigned";
            if (!byDept[d]) byDept[d] = [];
            byDept[d].push(g);
        });

        let html = "";

        // Dept nodes — draggable header cards
        Object.keys(byDept).forEach((deptName) => {
            const pos = getCardPos(`d-${deptName}`, 100, 40);
            const deptInfo = state.departments.find((d) => d.name === deptName || d.abbreviation === deptName);
            const headText = deptInfo?.head ? `${deptInfo.head}${deptInfo.position ? `, ${deptInfo.position}` : ""}` : "";
            html += `
                <div class="free-card dept-node"
                    data-card-key="d-${escapeHtml(deptName)}"
                    style="left:${pos.x}px;top:${pos.y}px">
                    <strong>${escapeHtml(deptName)}</strong>
                    ${headText ? `<small>${escapeHtml(headText)}</small>` : ""}
                </div>`;
        });

        // Signatory cards + member cards — each independently draggable
        groups.forEach((group) => {
            const pos = getCardPos(`g-${group.id}`, 100, 200);
            const sig = { usercode: group.signatory_usercode, name: group.signatory_name, department: group.department, position: group.title, profile_photo_url: group.profile_photo_url };
            const members = groupMembers(group.id);
            html += `
                <section class="free-card sig-card"
                    data-card-key="g-${escapeHtml(group.id)}"
                    data-group-id="${escapeHtml(group.id)}"
                    data-line-from="${escapeHtml(group.id)}"
                    data-member-drop="${escapeHtml(group.id)}"
                    data-change-signatory="${escapeHtml(group.id)}"
                    style="left:${pos.x}px;top:${pos.y}px">
                    <div class="card-hover-action">Change</div>
                    ${avatar(sig, "large")}
                    <div class="person-main">
                        <strong>${escapeHtml(group.signatory_name || group.signatory_usercode)}</strong>
                        <span>${escapeHtml(group.title || "Signatory")}</span>
                        <small>${escapeHtml(group.department || "-")}</small>
                        <em>${escapeHtml(activeModule.label)}</em>
                    </div>
                    <div class="card-tools"><span></span><span></span><span></span><b></b></div>
                    <button class="remove-group" type="button" data-remove-group="${escapeHtml(group.id)}">×</button>
                    <span class="connect-handle" data-connect-sig="${escapeHtml(group.id)}" title="Drag to connect member">⊕</span>
                </section>`;

            members.forEach((member, mi) => {
                const mp = getCardPos(`m-${member.id}`, pos.x + mi * 274, pos.y + 200);
                html += `
                    <div class="free-card mem-card"
                        data-card-key="m-${escapeHtml(member.id)}"
                        data-line-to="${escapeHtml(group.id)}"
                        data-member-id="${escapeHtml(member.id)}"
                        data-change-member="${escapeHtml(member.id)}"
                        data-group-id="${escapeHtml(group.id)}"
                        style="left:${mp.x}px;top:${mp.y}px">
                        <div class="card-hover-action">Change</div>
                        ${avatar(member)}
                        <span>
                            <strong>${escapeHtml(member.name || member.usercode)}</strong>
                            <small>${escapeHtml(member.position || member.department || "-")}</small>
                        </span>
                        <div class="card-tools"><span></span><span></span><span></span><b></b></div>
                        <button class="remove-member" type="button" data-remove-member="${escapeHtml(member.id)}">×</button>
                    </div>`;
            });
        });

        target.innerHTML = html;
        window.requestAnimationFrame(drawConnectors);
    }

    // Draw one bezier connector between two elements in content-space coordinates
    function drawLine(svg, fromEl, toEl, vpBox, scale, cls) {
        const fb = fromEl.getBoundingClientRect();
        const tb = toEl.getBoundingClientRect();
        const x1 = (fb.left + fb.width / 2 - vpBox.left) / scale;
        const y1 = (fb.bottom - vpBox.top) / scale;
        const x2 = (tb.left + tb.width / 2 - vpBox.left) / scale;
        const y2 = (tb.top - vpBox.top) / scale;
        const my = y1 + Math.max(18, (y2 - y1) / 2);
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("class", cls);
        p.setAttribute("d", `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`);
        svg.appendChild(p);
    }

    function drawConnectors() {
        const svg = $("connector-layer");
        const viewport = $("chart-viewport");
        if (!svg || !viewport) return;
        svg.innerHTML = "";

        const vpBox = viewport.getBoundingClientRect();
        const scale = viewState.zoom;
        const groups = state.groups.filter((g) => g.module_key === state.activeModuleKey);

        // Dept node → signatory lines (dashed blue)
        const byDept = {};
        groups.forEach((g) => {
            const d = g.department || "Unassigned";
            if (!byDept[d]) byDept[d] = [];
            byDept[d].push(g);
        });
        Object.entries(byDept).forEach(([deptName, deptGroups]) => {
            const dEl = document.querySelector(`[data-card-key="d-${cssEscape(deptName)}"]`);
            deptGroups.forEach((group) => {
                const sEl = document.querySelector(`[data-card-key="g-${cssEscape(group.id)}"]`);
                if (dEl && sEl) drawLine(svg, dEl, sEl, vpBox, scale, "connector-dept");
            });
        });

        // Signatory → member lines (solid)
        groups.forEach((group) => {
            const fromEl = document.querySelector(`[data-line-from="${cssEscape(group.id)}"]`);
            document.querySelectorAll(`[data-line-to="${cssEscape(group.id)}"]`).forEach((toEl) => {
                if (fromEl) drawLine(svg, fromEl, toEl, vpBox, scale, "connector-line");
            });
        });

        // Live connect-drag temp line
        if (connectDragState?.tempPath) svg.appendChild(connectDragState.tempPath);
    }

    function renderAll() {
        renderModules();
        renderDepartments();
        renderEmployees();
        renderAssignments();
    }

    async function load(q = "") {
        try {
            setMessage("Loading signatory chart...");
            const params = new URLSearchParams({
                q,
                department: state.activeDepartment,
                area: state.activeArea
            });
            const payload = await request(`bootstrap&${params.toString()}`);
            state.modules = payload.modules || [];
            state.departments = payload.departments || [];
            state.areas = payload.areas || [];
            state.employees = payload.employees || [];
            state.employeeLoadHint = payload.employee_load_hint || "";
            state.groups = payload.groups || [];
            state.members = payload.members || [];
            if (state.selectedEmployeeCode && !employeeByCode(state.selectedEmployeeCode)) {
                state.selectedEmployeeCode = "";
            }
            if (!state.modules.some((item) => item.key === state.activeModuleKey)) {
                state.activeModuleKey = state.modules[0]?.key || "dtr";
            }
            renderAll();
            setMessage("");
        } catch (error) {
            setMessage(error.message, "error");
        }
    }

    async function postForm(action, values, successMessage) {
        const formData = new URLSearchParams();
        Object.entries(values).forEach(([key, value]) => formData.set(key, value));
        try {
            await request(action, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: formData
            });
            setMessage(successMessage, "success");
            await load($("employee-search")?.value || "");
        } catch (error) {
            setMessage(error.message, "error");
        }
    }

    function createGroup(usercode) {
        const person = employeeByCode(usercode);
        postForm("create_group", {
            module_key: state.activeModuleKey,
            signatory_usercode: usercode
        }, `${person?.name || usercode} is now a ${moduleByKey(state.activeModuleKey).label} signatory.`);
    }

    function assignMember(groupId, usercode) {
        const person = employeeByCode(usercode);
        postForm("assign_member", {
            group_id: groupId,
            usercode
        }, `${person?.name || usercode} assigned.`);
    }

    function changeSignatory(groupId, usercode) {
        const person = employeeByCode(usercode);
        postForm("change_group_signatory", {
            group_id: groupId,
            signatory_usercode: usercode
        }, `Signatory changed to ${person?.name || usercode}.`);
    }

    function changeMember(groupId, memberId, usercode) {
        const person = employeeByCode(usercode);
        postForm("change_member", {
            group_id: groupId,
            member_id: memberId,
            usercode
        }, `Employee changed to ${person?.name || usercode}.`);
    }

    document.addEventListener("dragstart", (event) => {
        const employee = event.target.closest(".employee-card, .preview-card");
        const module = event.target.closest(".module-label");
        if (employee) {
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setData("text/usercode", employee.dataset.usercode || "");
            event.dataTransfer.setData("text/plain", employee.dataset.usercode || "");
        } else if (module) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/module", module.dataset.moduleKey || "");
            event.dataTransfer.setData("text/plain", module.dataset.moduleKey || "");
        }
    });

    document.addEventListener("dragover", (event) => {
        const dropTarget = event.target.closest("[data-create-group], [data-member-drop], [data-change-signatory], [data-change-member], .module-label");
        if (!dropTarget) return;
        event.preventDefault();
        dropTarget.classList.add("drag-over");
    });

    document.addEventListener("dragleave", (event) => {
        const dropTarget = event.target.closest("[data-create-group], [data-member-drop], [data-change-signatory], [data-change-member], .module-label");
        if (dropTarget) {
            dropTarget.classList.remove("drag-over");
        }
    });

    document.addEventListener("drop", (event) => {
        const dropTarget = event.target.closest("[data-create-group], [data-member-drop], [data-change-signatory], [data-change-member], .module-label");
        if (!dropTarget) return;
        event.preventDefault();
        dropTarget.classList.remove("drag-over");

        const moduleKey = event.dataTransfer.getData("text/module");
        const usercode = event.dataTransfer.getData("text/usercode");
        if (moduleKey && dropTarget.classList.contains("module-label")) {
            state.activeModuleKey = moduleKey;
            renderAll();
            return;
        }
        if (!usercode) return;
        if (dropTarget.dataset.createGroup) {
            createGroup(usercode);
        } else if (dropTarget.dataset.changeSignatory) {
            changeSignatory(dropTarget.dataset.changeSignatory, usercode);
        } else if (dropTarget.dataset.changeMember) {
            changeMember(dropTarget.dataset.groupId, dropTarget.dataset.changeMember, usercode);
        } else if (dropTarget.dataset.memberDrop) {
            assignMember(dropTarget.dataset.memberDrop, usercode);
        } else if (dropTarget.classList.contains("module-label")) {
            state.activeModuleKey = dropTarget.dataset.moduleKey || state.activeModuleKey;
            renderAll();
            createGroup(usercode);
        }
    });

    document.addEventListener("click", (event) => {
        const module = event.target.closest(".module-label");
        if (module) {
            state.activeModuleKey = module.dataset.moduleKey || state.activeModuleKey;
            renderAll();
            return;
        }

        const removeMember = event.target.closest("[data-remove-member]");
        if (removeMember) {
            postForm("remove_member", { id: removeMember.dataset.removeMember }, "Employee assignment removed.");
            return;
        }

        const removeGroup = event.target.closest("[data-remove-group]");
        if (removeGroup) {
            postForm("remove_group", { id: removeGroup.dataset.removeGroup }, "Signatory group removed.");
        }
    });

    const search = $("employee-search");
    if (search) {
        search.addEventListener("input", () => {
            window.clearTimeout(state.searchTimer);
            state.searchTimer = window.setTimeout(() => load(search.value.trim()), 250);
        });
    }

    const departmentFilter = $("department-filter");
    if (departmentFilter) {
        departmentFilter.addEventListener("change", () => {
            const value = departmentFilter.value;
            if (value.startsWith(AREA_OPTION_PREFIX)) {
                state.activeDepartment = "";
                state.activeArea = value.slice(AREA_OPTION_PREFIX.length);
            } else {
                state.activeDepartment = value;
                state.activeArea = "";
            }
            load(search?.value.trim() || "");
        });
    }

    window.addEventListener("resize", () => window.requestAnimationFrame(drawConnectors));

    // ── UNIFIED MOUSE HANDLER (card drag · connect drag · canvas pan) ──────────
    const canvas = $("assignment-canvas");

    if (canvas) {
        // Zoom with mouse wheel (zoom toward cursor)
        canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.max(0.2, Math.min(2.5, viewState.zoom * delta));
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const cx = (mx - viewState.panX) / viewState.zoom;
            const cy = (my - viewState.panY) / viewState.zoom;
            viewState.panX = mx - cx * newZoom;
            viewState.panY = my - cy * newZoom;
            viewState.zoom = newZoom;
            applyViewTransform();
        }, { passive: false });

        canvas.addEventListener("mousedown", (e) => {
            // 1. Connect-drag: drag ⊕ handle from signatory → assign member
            const handle = e.target.closest(".connect-handle[data-connect-sig]");
            if (handle) {
                const groupId = handle.dataset.connectSig;
                const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                tempPath.setAttribute("class", "connector-temp");
                connectDragState = { fromGroupId: groupId, fromEl: handle, tempPath, curX: e.clientX, curY: e.clientY };
                e.preventDefault();
                return;
            }

            // 2. Card drag: move any free-card
            const card = e.target.closest(".free-card");
            if (card && !e.target.closest("button, .connect-handle")) {
                const vp = $("chart-viewport");
                if (!vp) return;
                const cr = card.getBoundingClientRect();
                const vr = vp.getBoundingClientRect();
                dragCardState = {
                    el: card,
                    key: card.dataset.cardKey,
                    offsetX: (e.clientX - cr.left) / viewState.zoom,
                    offsetY: (e.clientY - cr.top) / viewState.zoom,
                    vpLeft: vr.left,
                    vpTop: vr.top
                };
                card.classList.add("card-dragging");
                e.preventDefault();
                return;
            }

            // 3. Canvas pan: click on empty background
            if (!e.target.closest(".free-card, .chart-zoom-bar, button")) {
                viewState.isPanning = true;
                viewState.startX = e.clientX;
                viewState.startY = e.clientY;
                viewState.startPanX = viewState.panX;
                viewState.startPanY = viewState.panY;
                canvas.classList.add("panning");
                e.preventDefault();
            }
        });
    }

    document.addEventListener("mousemove", (e) => {
        // Connect-drag: update temp SVG line
        if (connectDragState) {
            connectDragState.curX = e.clientX;
            connectDragState.curY = e.clientY;
            const svg = $("connector-layer");
            const vp = $("chart-viewport");
            if (svg && vp) {
                const vpBox = vp.getBoundingClientRect();
                const sc = viewState.zoom;
                const fb = connectDragState.fromEl.getBoundingClientRect();
                const x1 = (fb.left + fb.width / 2 - vpBox.left) / sc;
                const y1 = (fb.top + fb.height / 2 - vpBox.top) / sc;
                const x2 = (e.clientX - vpBox.left) / sc;
                const y2 = (e.clientY - vpBox.top) / sc;
                const my = (y1 + y2) / 2;
                connectDragState.tempPath.setAttribute("d", `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`);
                window.requestAnimationFrame(drawConnectors);
            }
            return;
        }

        // Card drag: reposition card
        if (dragCardState) {
            const vp = $("chart-viewport");
            if (!vp) return;
            const vr = vp.getBoundingClientRect();
            const x = Math.max(0, (e.clientX - vr.left) / viewState.zoom - dragCardState.offsetX);
            const y = Math.max(0, (e.clientY - vr.top) / viewState.zoom - dragCardState.offsetY);
            cardPositions[dragCardState.key] = { x, y };
            dragCardState.el.style.left = x + "px";
            dragCardState.el.style.top = y + "px";
            window.requestAnimationFrame(drawConnectors);
            return;
        }

        // Pan
        if (viewState.isPanning) {
            viewState.panX = viewState.startPanX + (e.clientX - viewState.startX);
            viewState.panY = viewState.startPanY + (e.clientY - viewState.startY);
            applyViewTransform();
        }
    });

    document.addEventListener("mouseup", (e) => {
        // Connect-drag end: drop on a sig-card → assign member, or drop on canvas → new signatory
        if (connectDragState) {
            const fromGroupId = connectDragState.fromGroupId;
            const target = e.target.closest(".mem-card, .sig-card, .employee-card");
            if (target) {
                if (target.classList.contains("mem-card") && target.dataset.groupId !== fromGroupId) {
                    // Move member from their current group to the source signatory group
                    postForm("change_member", {
                        group_id: fromGroupId,
                        member_id: target.dataset.memberId,
                        usercode: target.dataset.changeUsercode || ""
                    }, "Member reassigned.");
                } else if (target.classList.contains("employee-card")) {
                    assignMember(fromGroupId, target.dataset.usercode || "");
                }
            }
            connectDragState = null;
            window.requestAnimationFrame(drawConnectors);
            return;
        }

        // Card drag end
        if (dragCardState) {
            dragCardState.el.classList.remove("card-dragging");
            dragCardState = null;
            return;
        }

        // Pan end
        if (viewState.isPanning) {
            viewState.isPanning = false;
            $("assignment-canvas")?.classList.remove("panning");
        }
    });

    // Zoom buttons + auto-arrange
    $("zoom-in")?.addEventListener("click", () => { viewState.zoom = Math.min(2.5, viewState.zoom * 1.15); applyViewTransform(); });
    $("zoom-out")?.addEventListener("click", () => { viewState.zoom = Math.max(0.2, viewState.zoom / 1.15); applyViewTransform(); });
    $("zoom-reset")?.addEventListener("click", () => { viewState.zoom = 0.75; viewState.panX = 0; viewState.panY = 0; applyViewTransform(); });
    $("btn-auto-arrange")?.addEventListener("click", () => {
        const groups = state.groups.filter((g) => g.module_key === state.activeModuleKey);
        groups.forEach((g) => { delete cardPositions[`g-${g.id}`]; groupMembers(g.id).forEach((m) => delete cardPositions[`m-${m.id}`]); delete cardPositions[`d-${g.department || "Unassigned"}`]; });
        autoArrange();
        renderAssignments();
        applyViewTransform();
    });

    load().then(() => applyViewTransform());
})();
