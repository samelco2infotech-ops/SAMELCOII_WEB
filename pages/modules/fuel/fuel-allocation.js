/**
 * Add fuel per employee — search, balance assignment modal.
 * EDIT GUIDE: Dito ang UI flow ng add-fuel button; Node APIs: fuel assign_balance, auth search_employee.
 */
(function initFuelAllocationModule(global) {
  const FUEL_PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
  const API_BASE = `${FUEL_PAGE_ROOT}/api`;
  const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    window.SAMELCII_API_BASE = API_BASE;
    window.SAMELCII_MEDIA_BASE = window.location.origin;
  }
  const fuelApi = `${NODE_API_BASE}/fuel`;
  const authApi = `${NODE_API_BASE}/auth`;
  const sessionKey = "samelcii_session";
  const getAuthHeaders = () => {
    const token = localStorage.getItem("samelcii_token");
    return token && token.split(".").length === 3 ? { Authorization: `Bearer ${token}` } : {};
  };

  const state = {
    selectedUsercode: "",
    selectedName: "",
    chargeDepartment: "",
    currentBalance: 0,
    departmentMonthlyQuota: 0,
    departmentRemainingMonth: 0,
    departmentIssuedMonth: 0,
    searchTimer: null,
  };

  let deptGaugeChart = null;

  const formatLiters = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
  };

  const formatPct = (part, whole) => {
    const w = Number(whole);
    const p = Number(part);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(p)) return "0%";
    return `${Math.round((p / w) * 100)}%`;
  };

  const normalizeDepartment = (value) => {
    const raw = String(value || "").trim().toUpperCase();
    const compact = raw.replace(/[^A-Z0-9]/g, "");
    const aliases = {
      "CORPORATEPLANNINGDEPARTMENT": "CPD",
      "FINANCESERVICESDEPARTMENT": "FSD",
      "INSTITUTIONALSERVICESDEPARTMENT": "ISD",
      "TECHNICALSERVICESDEPARTMENT": "TSD",
      "OFFICEOFTHEGENERALMANAGER": "OGM",
      "OFFICEGENERALMANAGER": "OGM",
      "ADMINISTRATIVE": "ADMIN",
      "ADMINISTRATIVEDEPARTMENT": "ADMIN",
      "CATBALOGAN": "CTB",
      "VILLAREAL": "VLR",
      "BASEY": "BSY",
    };
    return aliases[compact] || compact || raw;
  };

  const loadChargeDepartmentStats = async (department) => {
    const dept = normalizeDepartment(department);
    if (!dept) {
      renderDeptStats({});
      return;
    }
    const response = await fetch(`${fuelApi}?action=department_fuel&department=${encodeURIComponent(dept)}`, {
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to load department fuel.");
    }
    renderDeptStats(payload);
  };

  /** HUWAG BAGUHIN: Donut gauge segments — gradient used + gray remaining (reference UI). */
  const buildGaugeSegments = (quota, issued, remaining) => {
    const q = Math.max(0, quota);
    const used = q > 0 ? Math.max(0, Math.min(issued, q)) : Math.max(0, issued);
    const rem = q > 0 ? Math.max(0, q - used) : Math.max(0, remaining);
    if (q <= 0 && used <= 0 && rem <= 0) {
      return { data: [1], colors: ["#e2e8f0"], center: 0 };
    }
    if (used <= 0) {
      return { data: [rem || 1], colors: ["#16a34a"], center: rem };
    }
    const third = used / 3;
    return {
      data: [third, third, used - third * 2, rem || 0.001],
      colors: ["#dc2626", "#f97316", "#fbbf24", "#e2e8f0"],
      center: rem,
    };
  };

  const destroyDeptGauge = () => {
    if (deptGaugeChart) {
      deptGaugeChart.destroy();
      deptGaugeChart = null;
    }
  };

  const renderDeptGauge = () => {
    const canvas = el("fuel-allocation-gauge");
    if (!canvas || !global.Chart) return;
    const seg = buildGaugeSegments(
      state.departmentMonthlyQuota,
      state.departmentIssuedMonth,
      state.departmentRemainingMonth
    );
    const centerNode = el("fuel-allocation-gauge-value");
    if (centerNode) {
      centerNode.innerHTML = `${formatLiters(seg.center)} <small>L</small>`;
    }
    destroyDeptGauge();
    deptGaugeChart = new global.Chart(canvas, {
      type: "doughnut",
      data: {
        datasets: [{
          data: seg.data,
          backgroundColor: seg.colors,
          borderWidth: 0,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "78%",
        rotation: 225,
        circumference: 270,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
  };

  /** I-render ang dark gauge panel + metric list sa kaliwa ng modal. */
  const renderDeptStats = (data = {}) => {
    const monthly = Number(data.department_monthly_quota ?? data.monthly_quota ?? 0);
    const remaining = Number(
      data.department_remaining_month ?? data.remaining_month ?? data.department_balance ?? 0
    );
    const issued = Number(data.department_issued_month ?? data.issued_month ?? 0);
    state.departmentMonthlyQuota = monthly;
    state.departmentRemainingMonth = remaining;
    state.departmentIssuedMonth = issued;
    if (el("fuel-allocation-dept-total")) {
      el("fuel-allocation-dept-total").textContent = formatLiters(monthly);
    }
    if (el("fuel-allocation-dept-remaining")) {
      el("fuel-allocation-dept-remaining").textContent = formatLiters(remaining);
    }
    if (el("fuel-allocation-dept-issued")) {
      el("fuel-allocation-dept-issued").textContent = formatLiters(issued);
    }
    if (el("fuel-allocation-pct-quota")) {
      el("fuel-allocation-pct-quota").textContent = monthly > 0 ? "100%" : "—";
    }
    if (el("fuel-allocation-pct-issued")) {
      el("fuel-allocation-pct-issued").textContent = formatPct(issued, monthly);
    }
    if (el("fuel-allocation-pct-remaining")) {
      el("fuel-allocation-pct-remaining").textContent = formatPct(remaining, monthly);
    }
    renderDeptGauge();
    syncSaveState();
  };

  const el = (id) => document.getElementById(id);
  const EMPLOYEE_FUEL_FAST_CACHE_PREFIX = "samelcii_fast_employee_fuel_v1:";

  const readEmployeeFuelFastCache = (usercode) => {
    try {
      const cached = JSON.parse(global.localStorage.getItem(`${EMPLOYEE_FUEL_FAST_CACHE_PREFIX}${String(usercode || "").toUpperCase()}`) || "null");
      return cached && cached.data ? cached.data : null;
    } catch (_error) {
      return null;
    }
  };

  const writeEmployeeFuelFastCache = (usercode, data) => {
    try {
      global.localStorage.setItem(`${EMPLOYEE_FUEL_FAST_CACHE_PREFIX}${String(usercode || "").toUpperCase()}`, JSON.stringify({
        savedAt: Date.now(),
        data
      }));
    } catch (_error) {
      // ponytail: cache is optional; modal still works from the live API.
    }
  };

  const readSession = () => {
    try {
      return JSON.parse(global.localStorage.getItem(sessionKey) || "{}") || {};
    } catch (_error) {
      return {};
    }
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

  let toastTimer = null;

  const showToast = (title, text, tone = "info") => {
    const toast = el("fuel-toast");
    const titleNode = el("fuel-toast-title");
    const textNode = el("fuel-toast-text");
    if (!toast || !titleNode || !textNode) return;
    toast.className = `fuel-toast ${tone} active`;
    titleNode.textContent = title || "Notice";
    textNode.textContent = text || "";
    if (toastTimer) global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(() => {
      toast.classList.remove("active");
    }, 3200);
  };

  const setModalOpen = (active) => {
    const modal = el("fuel-allocation-modal");
    if (!modal) return;
    modal.classList.toggle("active", active);
    modal.setAttribute("aria-hidden", active ? "false" : "true");
  };

  /** I-update lang Save button — tinanggal na ang quick chips at Current/New preview. */
  const syncSaveState = () => {
    const liters = Number(el("fuel-allocation-liters")?.value || 0);
    const saveBtn = el("fuel-allocation-save");
    if (saveBtn) {
      saveBtn.disabled = !state.selectedUsercode || !state.chargeDepartment || liters < 0;
    }
    updateOverQuotaWarning(liters);
  };

  // [FEATURE] This is a non-blocking warning, not a validation gate — setting a balance above
  // the department's remaining monthly quota still saves (a manager may be intentionally
  // overriding it). It just has to stop being silent about the negative effect.
  const updateOverQuotaWarning = (liters) => {
    const input = el("fuel-allocation-liters");
    const warning = el("fuel-allocation-liters-warning");
    if (!input || !warning) return;
    const remaining = Number(state.departmentRemainingMonth) || 0;
    const isOver = state.chargeDepartment && Number.isFinite(liters) && liters > remaining && remaining >= 0;
    input.classList.toggle("is-over-quota", Boolean(isOver));
    if (isOver) {
      const over = liters - remaining;
      warning.textContent = `⚠ Exceeds ${state.chargeDepartment}'s remaining allocation by ${formatLiters(over)}L this month.`;
      warning.hidden = false;
    } else {
      warning.hidden = true;
      warning.textContent = "";
    }
  };

  const renderSearchResults = (items) => {
    const host = el("fuel-allocation-results");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<button type="button" class="fuel-allocation-result" disabled>No matches</button>';
      host.classList.add("active");
      return;
    }
    host.innerHTML = items.map((item) => {
      const code = String(item.usercode || "").trim();
      const name = String(item.name || code).trim();
      const dept = String(item.department || "").trim();
      return `<button type="button" class="fuel-allocation-result" data-usercode="${escapeHtml(code)}" data-name="${escapeHtml(name)}">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(code)}${dept ? ` · ${escapeHtml(dept)}` : ""}</span>
      </button>`;
    }).join("");
    host.classList.add("active");
    host.querySelectorAll(".fuel-allocation-result[data-usercode]").forEach((button) => {
      button.addEventListener("click", () => {
        void selectEmployee(button.dataset.usercode || "", button.dataset.name || "");
      });
    });
  };

  const loadEmployeeFuel = async (usercode) => {
    const cached = readEmployeeFuelFastCache(usercode);
    if (cached) {
      state.currentBalance = Number(cached.balance || 0);
      renderDeptStats(cached);
      if (el("fuel-allocation-liters")) {
        el("fuel-allocation-liters").value = String(Math.round(state.currentBalance));
      }
      syncSaveState();
    }
    const response = await fetch(`${fuelApi}?action=employee&usercode=${encodeURIComponent(usercode)}`, {
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.message || "Unable to load employee fuel data.");
    }
    const data = payload.data;
    writeEmployeeFuelFastCache(usercode, data);
    state.currentBalance = Number(data.balance || 0);
    if (!state.chargeDepartment) {
      state.chargeDepartment = normalizeDepartment(data.department_abbr || data.department || "");
      if (el("fuel-allocation-charge-dept")) el("fuel-allocation-charge-dept").value = state.chargeDepartment;
    }
    if (state.chargeDepartment) {
      await loadChargeDepartmentStats(state.chargeDepartment);
    } else {
      renderDeptStats(data);
    }
    if (el("fuel-allocation-liters")) {
      el("fuel-allocation-liters").value = String(Math.round(state.currentBalance));
    }
    if (el("fuel-allocation-sub")) {
      const dept = String(data.department || "").trim();
      el("fuel-allocation-sub").textContent = dept
        ? `${dept} — set liters for this employee.`
        : "Set liters for this employee.";
    }
    syncSaveState();
  };

  const selectEmployee = async (usercode, name) => {
    const code = String(usercode || "").trim().toUpperCase();
    if (!code) return;
    state.selectedUsercode = code;
    state.selectedName = String(name || code).trim();
    if (el("fuel-allocation-name")) el("fuel-allocation-name").textContent = state.selectedName;
    if (el("fuel-allocation-usercode")) el("fuel-allocation-usercode").textContent = code;
    if (el("fuel-allocation-search")) el("fuel-allocation-search").value = state.selectedName;
    el("fuel-allocation-results")?.classList.remove("active");
    try {
      await loadEmployeeFuel(code);
    } catch (error) {
      showToast("Add fuel", error.message || "Unable to load employee.", "error");
    }
  };

  const searchEmployees = async (query) => {
    const q = String(query || "").trim();
    if (q.length < 2) {
      el("fuel-allocation-results")?.classList.remove("active");
      return;
    }
    const response = await fetch(`${authApi}?action=search_employee&q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => ({ ok: false, items: [] }));
    renderSearchResults(Array.isArray(payload.items) ? payload.items : []);
  };

  const saveAllocation = async () => {
    if (!state.selectedUsercode) {
      showToast("Add fuel", "Select an employee first.", "error");
      return;
    }
    const balance = Number(el("fuel-allocation-liters")?.value || 0);
    const chargeDepartment = normalizeDepartment(el("fuel-allocation-charge-dept")?.value || state.chargeDepartment);
    if (!Number.isFinite(balance) || balance < 0) {
      showToast("Add fuel", "Enter a valid fuel balance.", "error");
      return;
    }
    if (!chargeDepartment) {
      showToast("Add fuel", "Choose the department paying this fuel.", "error");
      return;
    }

    const formData = new URLSearchParams();
    formData.append("action", "assign_balance");
    formData.append("usercode", state.selectedUsercode);
    formData.append("balance", String(balance));
    formData.append("charge_department", chargeDepartment);

    const response = await fetch(fuelApi, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to save fuel balance.");
    }

    showToast("Add fuel", payload.message || "Fuel balance saved.", "success");
    state.currentBalance = Number(payload.balance ?? balance);
    state.chargeDepartment = chargeDepartment;
    renderDeptStats(payload);
    syncSaveState();

    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("samelcii-fuel-balance-updated", {
        detail: { usercode: state.selectedUsercode, balance: state.currentBalance },
      }));
    }
  };

  const openAllocationModal = async () => {
    state.selectedUsercode = "";
    state.selectedName = "";
    state.chargeDepartment = "";
    state.currentBalance = 0;
    renderDeptStats({});

    if (el("fuel-allocation-name")) el("fuel-allocation-name").textContent = "Select employee";
    if (el("fuel-allocation-usercode")) el("fuel-allocation-usercode").textContent = "—";
    if (el("fuel-allocation-search")) el("fuel-allocation-search").value = "";
    if (el("fuel-allocation-liters")) el("fuel-allocation-liters").value = "0";
    if (el("fuel-allocation-charge-dept")) {
      const session = readSession();
      const dept = normalizeDepartment(session.department_abbr || session.department || "");
      state.chargeDepartment = dept;
      el("fuel-allocation-charge-dept").value = dept;
      if (dept) void loadChargeDepartmentStats(dept).catch(() => {});
    }
    if (el("fuel-allocation-sub")) {
      el("fuel-allocation-sub").textContent = "Search by name or employee number, then set liters.";
    }
    syncSaveState();
    setModalOpen(true);

    const session = readSession();
    const selfCode = String(session.accountnumber || session.usercode || "").trim();
    if (selfCode) {
      await selectEmployee(selfCode, String(session.name || session.username || selfCode));
    }
  };

  const closeAllocationModal = () => {
    setModalOpen(false);
    destroyDeptGauge();
    el("fuel-allocation-results")?.classList.remove("active");
  };

  const bindEvents = () => {
    el("fuel-add-btn")?.addEventListener("click", () => {
      void openAllocationModal();
    });
    el("fuel-allocation-close")?.addEventListener("click", closeAllocationModal);
    el("fuel-allocation-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-allocation-modal")) closeAllocationModal();
    });
    el("fuel-allocation-save")?.addEventListener("click", () => {
      void saveAllocation().catch((error) => showToast("Add fuel", error.message, "error"));
    });
    el("fuel-allocation-liters")?.addEventListener("input", syncSaveState);
    el("fuel-allocation-charge-dept")?.addEventListener("change", (event) => {
      state.chargeDepartment = normalizeDepartment(event.target?.value || "");
      syncSaveState();
      void loadChargeDepartmentStats(state.chargeDepartment).catch((error) => {
        showToast("Add fuel", error.message || "Unable to load department fuel.", "error");
      });
    });

    el("fuel-allocation-search")?.addEventListener("input", (event) => {
      const value = event.target?.value || "";
      if (state.searchTimer) global.clearTimeout(state.searchTimer);
      state.searchTimer = global.setTimeout(() => {
        void searchEmployees(value).catch(() => renderSearchResults([]));
      }, 280);
    });

    global.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el("fuel-allocation-modal")?.classList.contains("active")) {
        closeAllocationModal();
      }
    });
  };

  const boot = () => {
    bindEvents();
    global.FuelAllocation = {
      open: openAllocationModal,
      close: closeAllocationModal,
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
