/**
 * Fuel report modal — analytics charts, dept balance gauges, admin request list.
 * EDIT GUIDE: Dito ang logic ng Fuel report; kailangan aligned sa Node Fuel API (analytics, history, fuel_balance_trend).
 */
(function initFuelReportModule(global) {
  const FUEL_PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
  const API_BASE = `${FUEL_PAGE_ROOT}/api`;
  const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    window.SAMELCII_API_BASE = API_BASE;
    window.SAMELCII_MEDIA_BASE = window.location.origin;
  }
  const fuelApi = `${NODE_API_BASE}/fuel`;
  const sessionKey = "samelcii_session";
  const getAuthHeaders = (extraHeaders = {}) => {
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
  };

  const reportState = {
    page: 1,
    totalPages: 1,
    total: 0,
    autoRefreshTimer: null,
    gaugeCharts: [],
  };

  const chartInstances = {
    timeline: null,
    department: null,
    area: null,
  };

  const el = (id) => document.getElementById(id);

  const readSession = () => {
    try {
      return JSON.parse(global.localStorage.getItem(sessionKey) || "{}") || {};
    } catch (_error) {
      return {};
    }
  };

  const getSessionUserCode = () => {
    const session = readSession();
    return String(session.accountnumber || session.usercode || session.empno || session.employeeNo || "").trim().toUpperCase();
  };

  /** HUWAG BAGUHIN: Parehong privilege band sa Node Fuel API organization analytics. */
  const isFuelAdmin = () => {
    const raw = String(readSession().privilage || "");
    return raw.split(/\s*-\s*/).some((part) => {
      const value = Number.parseInt(String(part).trim(), 10);
      return Number.isFinite(value) && value >= 6 && value <= 10;
    });
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

  const normalizeDate = (value) => {
    if (!value) return "";
    if (typeof value === "string" && value.includes("T")) {
      return value.split("T")[0];
    }
    return String(value).slice(0, 10);
  };

  const normalizeStatusLabel = (raw) => {
    const v = String(raw ?? "").trim();
    if (v === "1") return "Approved";
    if (v === "2") return "Pending";
    if (v === "3") return "Rejected";
    return v || "-";
  };

  const normalizeStatusClass = (raw) => {
    const v = String(raw ?? "").trim();
    if (v === "1") return "status-row-approved";
    if (v === "2") return "status-row-pending";
    if (v === "3") return "status-row-rejected";
    const t = v.toLowerCase();
    if (t === "approved") return "status-row-approved";
    if (t === "pending") return "status-row-pending";
    if (t === "rejected") return "status-row-rejected";
    return "";
  };

  const pick = (row, keys, fallback = "-") => {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
    return fallback;
  };

  const setModalOpen = (active) => {
    const modal = el("fuel-report-modal");
    if (!modal) return;
    modal.classList.toggle("active", active);
    modal.setAttribute("aria-hidden", active ? "false" : "true");
  };

  const defaultReportDates = () => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromInput = el("fuel-analytics-from");
    const toInput = el("fuel-analytics-to");
    if (fromInput && !fromInput.value) {
      fromInput.value = from.toISOString().slice(0, 10);
    }
    if (toInput && !toInput.value) {
      toInput.value = today.toISOString().slice(0, 10);
    }
  };

  const initReportFilterOptions = () => {
    const yearSelect = el("fuel-report-year");
    const monthSelect = el("fuel-report-month");
    const daySelect = el("fuel-report-day");
    if (!yearSelect || yearSelect.dataset.ready === "1") {
      return;
    }

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '<option value="">Year</option>' + Array.from({ length: 8 }, (_, index) => {
      const year = currentYear - index;
      return `<option value="${year}">${year}</option>`;
    }).join("");

    monthSelect.innerHTML = '<option value="">Month</option>' + Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return `<option value="${month}">${month}</option>`;
    }).join("");

    daySelect.innerHTML = '<option value="">Day</option>' + Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      return `<option value="${day}">${day}</option>`;
    }).join("");

    yearSelect.dataset.ready = "1";
  };

  const syncAdminScopeVisibility = () => {
    const admin = isFuelAdmin();
    document.querySelectorAll(".fuel-report-admin-only").forEach((node) => {
      node.classList.toggle("fuel-report-hidden", !admin);
    });
  };

  const destroyChart = (chart) => {
    if (chart) {
      chart.destroy();
    }
  };

  const destroyGaugeCharts = () => {
    reportState.gaugeCharts.forEach((chart) => destroyChart(chart));
    reportState.gaugeCharts = [];
  };

  const destroyAllCharts = () => {
    destroyChart(chartInstances.timeline);
    destroyChart(chartInstances.department);
    destroyChart(chartInstances.area);
    chartInstances.timeline = null;
    chartInstances.department = null;
    chartInstances.area = null;
    destroyGaugeCharts();
  };

  const chartColors = {
    red: "rgba(185, 28, 28, 0.85)",
    redSoft: "rgba(185, 28, 28, 0.35)",
    redFill: "rgba(185, 28, 28, 0.14)",
    blue: "rgba(37, 99, 235, 0.85)",
    blueSoft: "rgba(37, 99, 235, 0.35)",
    blueFill: "rgba(37, 99, 235, 0.12)",
    green: "rgba(5, 150, 105, 0.85)",
    slate: "rgba(100, 116, 139, 0.75)",
  };

  const buildLiveLineDataset = (label, data, borderColor, fillColor) => ({
    label,
    data,
    type: "line",
    borderColor,
    backgroundColor: fillColor,
    borderWidth: 2.5,
    fill: true,
    tension: 0,
    pointRadius: 3,
    pointHoverRadius: 6,
    pointBackgroundColor: "#ffffff",
    pointBorderColor: borderColor,
    pointBorderWidth: 2,
    spanGaps: true,
  });

  const maxChartValue = (datasets) => {
    let max = 0;
    datasets.forEach((set) => {
      (set.data || []).forEach((value) => {
        const n = Number(value);
        if (Number.isFinite(n) && n > max) max = n;
      });
    });
    return max;
  };

  const fmtLiters = (n) => (Number(n) || 0).toLocaleString();

  const compareRowLabel = (row) => {
    if (row.label) return String(row.label);
    if (row.day) return `Day ${row.day}`;
    if (row.bucket !== undefined && row.bucket !== null) return String(row.bucket);
    return "";
  };

  const modeMeta = {
    daily: {
      title: "Daily — this month vs last month",
      yTitle: "Liters (per day)",
      maxTicks: 31,
      subtitle: (p) => `Red = ${p.prevLabel || "Last month"} (${fmtLiters(p.prevTotal)} L) · Blue = ${p.currLabel || "This month"} (${fmtLiters(p.currTotal)} L MTD) — days 1–31`,
    },
    monthly: {
      title: "Monthly — this year vs last year",
      yTitle: "Liters (per month)",
      maxTicks: 12,
      subtitle: (p) => `Red = ${p.prevLabel || "Last year"} (${fmtLiters(p.prevTotal)} L) · Blue = ${p.currLabel || "This year"} (${fmtLiters(p.currTotal)} L YTD) — Jan–Dec`,
    },
    weekly: {
      title: "Weekly — this week vs last week",
      yTitle: "Liters (per day)",
      maxTicks: 7,
      subtitle: (p) => `Red = ${p.prevLabel || "Last week"} (${fmtLiters(p.prevTotal)} L) · Blue = ${p.currLabel || "This week"} (${fmtLiters(p.currTotal)} L) — Mon–Sun`,
    },
    yearly: {
      title: "Yearly — fuel by year",
      yTitle: "Liters (per year)",
      maxTicks: 15,
      subtitle: (p) => `All years ${p.from || ""} to ${p.to || ""}`,
    },
  };

  const renderTimelineChart = (payload) => {
    const canvas = el("fuel-chart-timeline");
    const titleNode = el("fuel-chart-timeline-title");
    const subNode = el("fuel-chart-timeline-sub");
    if (!canvas || !global.Chart) return;

    destroyChart(chartInstances.timeline);

    const mode = String(payload.granularity || "daily");
    const meta = modeMeta[mode] || modeMeta.daily;
    const comparePayload = {
      prevLabel: payload.prevLabel || payload.prevMonthLabel,
      currLabel: payload.currLabel || payload.currMonthLabel,
      prevTotal: payload.prevTotal ?? payload.prevMonthTotal,
      currTotal: payload.currTotal ?? payload.currMonthTotal,
      from: payload.from,
      to: payload.to,
    };

    let labels = [];
    let datasets = [];
    const chartType = "line";

    if (mode === "yearly") {
      const rows = Array.isArray(payload.timeline) ? payload.timeline : [];
      labels = rows.map((row) => String(row.bucket || ""));
      datasets = [{
        label: "Liters",
        data: rows.map((row) => row.liters),
        type: "line",
        borderColor: chartColors.green,
        backgroundColor: "rgba(5, 150, 105, 0.12)",
        borderWidth: 2.5,
        fill: true,
        tension: 0,
        pointRadius: 4,
      }];
    } else {
      const rows = Array.isArray(payload.timelineCompare) ? payload.timelineCompare : [];
      labels = rows.map(compareRowLabel);
      datasets = [
        buildLiveLineDataset(
          comparePayload.prevLabel || "Previous",
          rows.map((row) => row.prevLiters),
          chartColors.red,
          chartColors.redFill
        ),
        buildLiveLineDataset(
          comparePayload.currLabel || "Current",
          rows.map((row) => row.currLiters),
          chartColors.blue,
          chartColors.blueFill
        ),
      ];
    }

    if (titleNode) titleNode.textContent = meta.title;
    if (subNode) {
      const updated = payload.liveUpdatedAt ? `Updated ${payload.liveUpdatedAt}` : "";
      subNode.textContent = `${meta.subtitle(comparePayload)}${updated ? `. ${updated}` : ""}`;
    }

    const isCompare = mode !== "yearly";
    const liveMax = maxChartValue(datasets);

    chartInstances.timeline = new global.Chart(canvas, {
      type: chartType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: "top",
            align: "end",
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.parsed?.y;
                if (value === null || value === undefined) return `${context.dataset.label}: —`;
                return `${context.dataset.label}: ${value} L`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: meta.maxTicks,
            },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            suggestedMax: isCompare && liveMax <= 0 ? 20 : undefined,
            title: { display: true, text: meta.yTitle },
            grid: { color: "rgba(148, 163, 184, 0.2)" },
          },
        },
      },
    });
  };

  const renderBarChart = (canvasId, chartKey, rows, labelKey, title) => {
    const canvas = el(canvasId);
    if (!canvas || !global.Chart) return;

    destroyChart(chartInstances[chartKey]);
    const topRows = rows.slice(0, 15);
    chartInstances[chartKey] = new global.Chart(canvas, {
      type: "bar",
      data: {
        labels: topRows.map((row) => row[labelKey]),
        datasets: [{
          label: title,
          data: topRows.map((row) => row.liters),
          backgroundColor: chartKey === "area" ? chartColors.blue : chartColors.green,
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });
  };

  const populateScopeFilters = (payload) => {
    if (!isFuelAdmin()) return;

    const deptSelect = el("fuel-analytics-filter-dept");
    const areaSelect = el("fuel-analytics-filter-area");
    const listDept = el("fuel-report-list-filter-dept");
    const listArea = el("fuel-report-list-filter-area");
    const departments = Array.isArray(payload.byDepartment) ? payload.byDepartment : [];
    const areas = Array.isArray(payload.byArea) ? payload.byArea : [];

    const fillSelect = (select, items, valueKey, labelKey, keepValue) => {
      if (!select || select.dataset.locked === "1") return;
      const current = keepValue ? select.value : "";
      select.innerHTML = `<option value="">All</option>` + items.map((item) => {
        const value = String(item[valueKey] ?? "");
        const label = String(item[labelKey] ?? value);
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
      }).join("");
      if (current) select.value = current;
    };

    fillSelect(deptSelect, departments, "department", "department", true);
    fillSelect(areaSelect, areas, "area", "area", true);
    fillSelect(listDept, departments, "department", "department", true);
    fillSelect(listArea, areas, "area", "area", true);
  };

  const loadReportAnalytics = async () => {
    const admin = isFuelAdmin();
    const params = new URLSearchParams({
      action: "analytics",
      from: String(el("fuel-analytics-from")?.value || "").trim(),
      to: String(el("fuel-analytics-to")?.value || "").trim(),
      granularity: String(el("fuel-analytics-granularity")?.value || "daily"),
    });

    if (admin) {
      params.set("all", "1");
      params.set("orgwide", "1");
      const filterDept = String(el("fuel-analytics-filter-dept")?.value || "").trim();
      const filterArea = String(el("fuel-analytics-filter-area")?.value || "").trim();
      if (filterDept) params.set("filterDept", filterDept);
      if (filterArea) params.set("filterArea", filterArea);
    }

    const response = await fetch(`${fuelApi}?${params.toString()}`, {
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to load fuel analytics.");
    }

    const updated = el("fuel-analytics-updated");
    if (updated) {
      updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }

    populateScopeFilters(payload);
    renderTimelineChart(payload);
    renderBarChart("fuel-chart-department", "department", payload.byDepartment || [], "department", "Liters");
    renderBarChart("fuel-chart-area", "area", payload.byArea || [], "area", "Liters");
  };

  const renderReportTable = (items) => {
    const body = el("fuel-report-list-body");
    const detail = el("fuel-report-page-detail");
    if (!body) return;

    if (!Array.isArray(items) || !items.length) {
      body.className = "request-empty";
      body.textContent = "No requests loaded yet";
      if (detail) detail.textContent = "";
      return;
    }

    if (global.FuelActions && typeof global.FuelActions.resetFuelRowStore === "function") {
      global.FuelActions.resetFuelRowStore();
    }

    body.className = "request-table-wrap";
    body.innerHTML = `
      <table class="request-table">
        <thead>
          <tr>
            <th>FAR Code</th>
            <th>Employee</th>
            <th>Item</th>
            <th>Ltrs</th>
            <th>Vehicle</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((row) => (
            global.FuelActions && typeof global.FuelActions.renderRequestRow === "function"
              ? global.FuelActions.renderRequestRow(row)
              : `<tr class="fuel-req-row"><td colspan="8">—</td></tr>`
          )).join("")}
        </tbody>
      </table>
    `;

    if (detail) {
      const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      detail.textContent = `Page ${reportState.page} of ${reportState.totalPages} · ${reportState.total} total · Updated ${time} · auto-refresh 45s`;
    }
  };

  const loadReportHistory = async (page = 1) => {
    const usercode = getSessionUserCode();
    const body = el("fuel-report-list-body");
    if (!usercode) {
      if (body) {
        body.className = "request-empty";
        body.textContent = "Employee number not found in session. Sign in again to load the report list.";
      }
      return;
    }
    if (body) {
      body.className = "request-empty";
      body.textContent = "Loading...";
    }

    const admin = isFuelAdmin();
    const params = new URLSearchParams({
      action: "history",
      page: String(page),
      limit: "100",
      usercode,
      all: admin ? "1" : "0",
    });

    if (admin) {
      params.set("orgwide", "1");
    }

    const search = String(el("fuel-report-search")?.value || "").trim();
    const year = String(el("fuel-report-year")?.value || "").trim();
    const month = String(el("fuel-report-month")?.value || "").trim();
    const day = String(el("fuel-report-day")?.value || "").trim();
    const filterDept = String(el("fuel-report-list-filter-dept")?.value || el("fuel-analytics-filter-dept")?.value || "").trim();
    const filterArea = String(el("fuel-report-list-filter-area")?.value || el("fuel-analytics-filter-area")?.value || "").trim();

    if (search) params.set("q", search);
    if (year) params.set("year", year);
    if (month) params.set("month", month);
    if (day) params.set("day", day);
    if (filterDept) params.set("filterDept", filterDept);
    if (filterArea) params.set("filterArea", filterArea);

    const response = await fetch(`${fuelApi}?${params.toString()}`, {
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to load fuel report list.");
    }

    reportState.page = payload.page || page;
    reportState.totalPages = payload.totalPages || 1;
    reportState.total = payload.total || 0;

    const pageLabel = el("fuel-report-page-label");
    if (pageLabel) pageLabel.textContent = String(reportState.page);

    renderReportTable(payload.items || []);
  };

  const renderDeptBalanceGauges = (departments) => {
    const host = el("fuel-dept-balance-cards");
    if (!host || !global.Chart) return;

    destroyGaugeCharts();
    host.innerHTML = "";

    if (!Array.isArray(departments) || !departments.length) {
      host.innerHTML = '<p class="request-empty">No department balance data.</p>';
      return;
    }

    departments.forEach((dept, index) => {
      const card = document.createElement("article");
      card.className = "fuel-balance-card--gauge";
      const pct = Number(dept.pctRemaining || 0);
      const issued = Number(dept.issuedYtd || 0);
      const quota = Number(dept.annualQuota || 0);
      card.innerHTML = `
        <h4 style="margin:0 0 6px;font-size:13px;">${escapeHtml(dept.department || "Dept")}</h4>
        <p style="margin:0 0 8px;font-size:11px;color:#64748b;">Issued ${issued.toLocaleString()} L · Quota ${quota.toLocaleString()} L</p>
      `;

      const wrap = document.createElement("div");
      wrap.className = "fuel-balance-gauge-wrap";
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-label", `Balance gauge for ${dept.department || "department"}`);
      wrap.appendChild(canvas);
      card.appendChild(wrap);
      host.appendChild(card);

      const chart = new global.Chart(canvas, {
        type: "doughnut",
        data: {
          labels: ["Remaining", "Used"],
          datasets: [{
            data: [Math.max(0, pct), Math.max(0, 100 - pct)],
            backgroundColor: [chartColors.green, "#e2e8f0"],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "72%",
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
        },
        plugins: [{
          id: `fuelGaugeCenter${index}`,
          afterDraw(chartRef) {
            const { ctx, chartArea } = chartRef;
            if (!chartArea) return;
            ctx.save();
            ctx.font = "bold 18px Segoe UI, Arial, sans-serif";
            ctx.fillStyle = "#0f172a";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${pct}%`, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2);
            ctx.restore();
          },
        }],
      });
      reportState.gaugeCharts.push(chart);
    });
  };

  const loadDeptBalanceTrend = async () => {
    if (!isFuelAdmin()) return;
    const year = String(el("fuel-balance-year")?.value || new Date().getFullYear());
    const params = new URLSearchParams({ action: "fuel_balance_trend", year });
    const response = await fetch(`${fuelApi}?${params.toString()}`, {
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to load department fuel balance.");
    }
    renderDeptBalanceGauges(payload.departments || []);
  };

  const initBalanceYearSelect = () => {
    const select = el("fuel-balance-year");
    if (!select || select.dataset.ready === "1") return;
    const currentYear = new Date().getFullYear();
    select.innerHTML = Array.from({ length: 6 }, (_, index) => {
      const year = currentYear - index;
      return `<option value="${year}">${year}</option>`;
    }).join("");
    select.dataset.ready = "1";
  };

  const refreshFuelReport = async () => {
    defaultReportDates();
    await Promise.all([
      loadReportAnalytics(),
      loadReportHistory(reportState.page),
      isFuelAdmin() ? loadDeptBalanceTrend() : Promise.resolve(),
    ]);
  };

  const isLiveMonitorMode = () => {
    const mode = String(el("fuel-analytics-granularity")?.value || "");
    return ["daily", "monthly", "weekly"].includes(mode);
  };

  const syncAutoRefresh = () => {
    if (reportState.autoRefreshTimer) {
      global.clearInterval(reportState.autoRefreshTimer);
      reportState.autoRefreshTimer = null;
    }
    const intervalMs = 45000;
    reportState.autoRefreshTimer = global.setInterval(() => {
      if (!el("fuel-report-modal")?.classList.contains("active")) {
        return;
      }
      void loadReportHistory(reportState.page || 1).catch(() => { /* noop */ });
      const refreshCharts = el("fuel-analytics-live")?.checked && isLiveMonitorMode();
      if (refreshCharts) {
        void loadReportAnalytics().catch(() => { /* noop */ });
        if (isFuelAdmin()) {
          void loadDeptBalanceTrend().catch(() => { /* noop */ });
        }
      }
    }, intervalMs);
  };

  const ensureLiveDefaults = () => {
    const live = el("fuel-analytics-live");
    if (live && isLiveMonitorMode() && !live.checked) {
      live.checked = true;
      syncAutoRefresh();
    }
  };

  const openFuelReport = async () => {
    initReportFilterOptions();
    initBalanceYearSelect();
    syncAdminScopeVisibility();
    defaultReportDates();
    ensureLiveDefaults();
    const live = el("fuel-analytics-live");
    if (live && !live.checked) {
      live.checked = true;
    }
    setModalOpen(true);
    reportState.page = 1;
    syncAutoRefresh();
    try {
      await refreshFuelReport();
    } catch (error) {
      global.alert(error.message || "Unable to open fuel report.");
    }
  };

  const closeFuelReport = () => {
    setModalOpen(false);
    if (reportState.autoRefreshTimer) {
      global.clearInterval(reportState.autoRefreshTimer);
      reportState.autoRefreshTimer = null;
    }
  };

  const bindReportEvents = () => {
    el("fuel-report-close")?.addEventListener("click", closeFuelReport);
    el("fuel-report-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-report-modal")) closeFuelReport();
    });

    el("fuel-analytics-refresh")?.addEventListener("click", () => {
      reportState.page = 1;
      void refreshFuelReport().catch((error) => global.alert(error.message));
    });

    const reloadList = () => {
      reportState.page = 1;
      void loadReportHistory(1).catch((error) => global.alert(error.message));
    };

    [
      "fuel-analytics-from",
      "fuel-analytics-to",
      "fuel-analytics-granularity",
      "fuel-analytics-filter-dept",
      "fuel-analytics-filter-area",
    ].forEach((id) => {
      el(id)?.addEventListener("change", () => {
        if (id === "fuel-analytics-granularity") {
          ensureLiveDefaults();
          syncAutoRefresh();
        }
        if (id === "fuel-analytics-granularity" && el("fuel-analytics-granularity")?.value === "yearly") {
          const live = el("fuel-analytics-live");
          if (live) live.checked = false;
        }
        syncAutoRefresh();
        void refreshFuelReport().catch((error) => global.alert(error.message));
      });
    });

    [
      "fuel-report-year",
      "fuel-report-month",
      "fuel-report-day",
      "fuel-report-list-filter-dept",
      "fuel-report-list-filter-area",
    ].forEach((id) => {
      el(id)?.addEventListener("change", reloadList);
    });

    let reportSearchTimer = null;
    el("fuel-report-search")?.addEventListener("input", () => {
      if (reportSearchTimer) global.clearTimeout(reportSearchTimer);
      reportSearchTimer = global.setTimeout(reloadList, 320);
    });
    el("fuel-report-search")?.addEventListener("change", reloadList);

    el("fuel-report-filter-refresh")?.addEventListener("click", reloadList);
    el("fuel-report-refresh-btn")?.addEventListener("click", reloadList);

    el("fuel-report-prev")?.addEventListener("click", () => {
      if (reportState.page <= 1) return;
      void loadReportHistory(reportState.page - 1).catch((error) => global.alert(error.message));
    });

    el("fuel-report-next")?.addEventListener("click", () => {
      if (reportState.page >= reportState.totalPages) return;
      void loadReportHistory(reportState.page + 1).catch((error) => global.alert(error.message));
    });

    el("fuel-analytics-live")?.addEventListener("change", syncAutoRefresh);

    el("fuel-balance-panel-toggle")?.addEventListener("click", () => {
      const panel = el("fuel-balance-panel");
      if (!panel) return;
      panel.classList.toggle("fuel-balance-panel--collapsed");
      const collapsed = panel.classList.contains("fuel-balance-panel--collapsed");
      el("fuel-balance-panel-toggle").textContent = collapsed ? "Show fuel balance" : "Hide fuel balance";
    });

    el("fuel-balance-year")?.addEventListener("change", () => {
      void loadDeptBalanceTrend().catch((error) => global.alert(error.message));
    });

    el("fuel-dept-scroll-prev")?.addEventListener("click", () => {
      el("fuel-dept-balance-track")?.scrollBy({ left: -280, behavior: "smooth" });
    });

    el("fuel-dept-scroll-next")?.addEventListener("click", () => {
      el("fuel-dept-balance-track")?.scrollBy({ left: 280, behavior: "smooth" });
    });

    global.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el("fuel-report-modal")?.classList.contains("active")) {
        closeFuelReport();
      }
    });
  };

  /** HUWAG BAGUHIN: ?report=1 o ?view=report — buksan agad ang report modal (tulad ng IT ?tab=). */
  const openReportFromQuery = () => {
    try {
      const params = new URLSearchParams(global.location.search);
      const flag = String(params.get("report") || params.get("view") || "").trim().toLowerCase();
      if (flag === "1" || flag === "true" || flag === "yes" || flag === "report") {
        void openFuelReport();
      }
    } catch (_error) {
      /* noop */
    }
  };

  const boot = () => {
    bindReportEvents();
    syncAdminScopeVisibility();
    global.FuelReport = {
      open: openFuelReport,
      close: closeFuelReport,
      refresh: refreshFuelReport,
      refreshList: () => loadReportHistory(reportState.page || 1),
      destroyCharts: destroyAllCharts,
    };
    openReportFromQuery();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
