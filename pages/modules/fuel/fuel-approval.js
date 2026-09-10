/**
 * Pending fuel approval queue — popup list for approvers.
 */
(function initFuelApprovalModule(global) {
  const FUEL_PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
  const API_BASE = `${FUEL_PAGE_ROOT}/api`;
  const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    window.SAMELCII_API_BASE = API_BASE;
    window.SAMELCII_MEDIA_BASE = window.location.origin;
  }
  const fuelApi = `${NODE_API_BASE}/fuel`;
  const state = { page: 1, totalPages: 1 };
  const getAuthHeaders = () => {
    const token = localStorage.getItem("samelcii_token");
    return token && token.split(".").length === 3 ? { Authorization: `Bearer ${token}` } : {};
  };

  const el = (id) => document.getElementById(id);

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

  const setModalOpen = (open) => {
    const modal = el("fuel-approval-modal");
    if (!modal) return;
    modal.classList.toggle("active", !!open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
  };

  const syncPager = () => {
    const page = state.page || 1;
    const total = state.totalPages || 1;
    if (el("fuel-approval-page-label")) {
      el("fuel-approval-page-label").textContent = `${page} / ${total}`;
    }
    if (el("fuel-approval-page-prev")) el("fuel-approval-page-prev").disabled = page <= 1;
    if (el("fuel-approval-page-next")) el("fuel-approval-page-next").disabled = page >= total;
  };

  const renderRows = (rows) => {
    const tbody = el("fuel-approval-table-body");
    if (!tbody) return;
    if (global.FuelActions && typeof global.FuelActions.resetFuelRowStore === "function") {
      global.FuelActions.resetFuelRowStore();
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="fuel-empty" colspan="8">No pending requests</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => (
      global.FuelActions && typeof global.FuelActions.renderApprovalRow === "function"
        ? global.FuelActions.renderApprovalRow(row)
        : "<tr><td class=\"fuel-empty\" colspan=\"8\">—</td></tr>"
    )).join("");
  };

  const loadApprovalQueue = async (page = 1) => {
    const tbody = el("fuel-approval-table-body");
    state.page = page;
    syncPager();
    if (tbody) {
      tbody.innerHTML = '<tr><td class="fuel-empty" colspan="8">Loading…</td></tr>';
    }
    const params = new URLSearchParams({
      action: "history",
      all: "1",
      status: "2",
      page: String(page),
      limit: "15",
    });
    const response = await fetch(`${fuelApi}?${params.toString()}`, {
      credentials: "same-origin",
      headers: getAuthHeaders()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const message = data.message || "Unable to load pending approvals.";
      if (tbody) {
        tbody.innerHTML = `<tr><td class="fuel-empty" colspan="8">${escapeHtml(message)}</td></tr>`;
      }
      return;
    }
    state.totalPages = Math.max(1, Number(data.totalPages) || 1);
    syncPager();
    renderRows(Array.isArray(data.items) ? data.items : []);
  };

  const openApprovalModal = async () => {
    setModalOpen(true);
    await loadApprovalQueue(1);
  };

  const closeApprovalModal = () => setModalOpen(false);

  const bindEvents = () => {
    el("fuel-approval-btn")?.addEventListener("click", () => {
      void openApprovalModal();
    });
    el("fuel-approval-close")?.addEventListener("click", closeApprovalModal);
    el("fuel-approval-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-approval-modal")) closeApprovalModal();
    });
    el("fuel-approval-page-prev")?.addEventListener("click", () => {
      if (state.page > 1) void loadApprovalQueue(state.page - 1);
    });
    el("fuel-approval-page-next")?.addEventListener("click", () => {
      if (state.page < state.totalPages) void loadApprovalQueue(state.page + 1);
    });
    el("fuel-approval-page-reload")?.addEventListener("click", () => {
      void loadApprovalQueue(state.page || 1);
    });
    global.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (el("fuel-approval-modal")?.classList.contains("active")) closeApprovalModal();
    });
  };

  global.FuelApproval = {
    open: openApprovalModal,
    close: closeApprovalModal,
    refresh: () => loadApprovalQueue(state.page || 1),
    setApproverVisible: (visible) => {
      const btn = el("fuel-approval-btn");
      if (btn) btn.classList.toggle("fuel-icon-btn--hidden", !visible);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEvents);
  } else {
    bindEvents();
  }
})(window);
