/**
 * Fuel request row actions — EPASS/TRAVEL picker, Travel embed, Fuel EPASS, print.
 * EDIT GUIDE: Ginagamit ng fuel report list at current request list; aligned sa Node Fuel create_fuel_epass action.
 */
(function initFuelActionsModule(global) {
  const FUEL_PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
  const API_BASE = `${FUEL_PAGE_ROOT}/api`;
  const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    window.SAMELCII_API_BASE = API_BASE;
    window.SAMELCII_MEDIA_BASE = window.location.origin;
  }
  const fuelApi = `${NODE_API_BASE}/fuel`;
  const epassApi = `${NODE_API_BASE}/epass`;
  const travelApi = `${NODE_API_BASE}/travel`;
  const authApi = `${NODE_API_BASE}/auth`;
  const signatoryApi = `${NODE_API_BASE}/signatory`;
  const sessionKey = "samelcii_session";
  const printConfigKey = "samelcii_editable_print_config";
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
    const sessionRaw = localStorage.getItem(sessionKey);
    if (sessionRaw) {
      headers["X-SAMELCII-SESSION"] = sessionRaw;
    }
    return headers;
  };

  const removeOppositeFuelLink = async (api, farCode, label) => {
    const response = await fetch(`${api}?action=cancel_by_fuel_farcode`, {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ fuelFarCode: farCode }),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || `Unable to replace the linked ${label}.`);
    }
  };

  const EPASS_DEPARTMENTS = [
    ["OGM", "OFFICE OF THE GENERAL MANAGER"],
    ["CORPLAN", "CORPORATE PLANNING DEPARTMENT"],
    ["CPD", "CORPORATE PLANNING DEPARTMENT"],
    ["FSD", "FSD FINANCE SERVICES DEPARTMENT"],
    ["ISD", "INSTITUTIONAL SERVICES DEPARTMENT"],
    ["TSD", "TECHNICAL SERVICES DEPARTMENT"],
    ["IAD", "INTERNAL AUDIT DEPARTMENT"],
    ["HRAD", "HRAD"],
    ["ITS", "ITS"],
    ["IT", "IT"],
    ["BILLING", "BILLING"],
    ["ADMIN", "ADMINISTRATIVE DEPARTMENT"],
    ["ESD", "ENGINEERING SERVICES DEPARTMENT"],
    ["CATBALOGAN", "CATBALOGAN"],
    ["BASEY", "BASEY"],
    ["VILLAREAL", "VILLAREAL"],
  ];

  let pickerItem = null;
  let epassPeople = [];
  let epassPeopleDirty = false;
  let currentFuelEpassFarCode = "";
  let currentFuelEpassRequestId = "";
  let currentFuelEpassNumber = "";
  let currentFuelEpassDepartment = "";
  let currentFuelEpassReplacesTravel = false;
  let fuelEpassSearchResultsCache = [];
  let travelPeople = [];
  let travelPeopleDirty = false;
  let currentFuelTravelFarCode = "";
  let currentFuelTravelNumber = "";
  let currentFuelTravelDepartment = "";
  let currentFuelTravelReplacesEpass = false;
  let fuelTravelSearchResultsCache = [];
  let travelDates = [];
  let travelDefaultDate = "";
  // [FEATURE] Same click-to-choose Department Head / General Manager approval route as the
  // standalone Travel Request Details modal (employees-profile/script.js) — Fuel Travel used to
  // always send approver_mode:"auto" with no way to see or change who gets assigned.
  const travelApproverPeople = new Map();
  let travelApproverAutoDeptHead = null;
  let travelApproverAutoGeneralManager = null;
  let travelApproverSelectedDeptHead = null;
  let travelApproverSelectedGeneralManager = null;
  let travelApprovalEditingStage = "department_head";
  const EPASS_PEOPLE_DRAFT_PREFIX = "samelcii_fuel_epass_people_draft_";
  const TRAVEL_PEOPLE_DRAFT_PREFIX = "samelcii_fuel_travel_people_draft_";
  const EPASS_LINK_PREFIX = "samelcii_fuel_epass_link_";
  const TRAVEL_LINK_PREFIX = "samelcii_fuel_travel_link_";
  const fuelRowStore = new Map();
  let fuelRowSeq = 0;

  const el = (id) => document.getElementById(id);

  const resetFuelPeopleScroll = (formKey) => {
    global.requestAnimationFrame(() => {
      const results = el(`fuel-${formKey}-search-results`);
      const selected = el(`fuel-${formKey}-selected-list`);
      if (results) results.scrollTop = 0;
      if (selected) selected.scrollLeft = 0;
    });
  };

  const resetFuelRowStore = () => {
    fuelRowStore.clear();
    fuelRowSeq = 0;
  };

  const registerFuelRow = (row) => {
    const key = `r${fuelRowSeq}`;
    fuelRowSeq += 1;
    fuelRowStore.set(key, row);
    return key;
  };

  const getFuelRow = (key) => fuelRowStore.get(String(key ?? "")) || null;

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
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

  const pick = (row, keys, fallback = "") => {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return fallback;
  };

  const normalizeDate = (value) => {
    if (!value) return "";
    if (typeof value === "string" && value.includes("T")) return value.split("T")[0];
    return String(value).slice(0, 10);
  };

  const getEpassDraftKey = (farCode = currentFuelEpassFarCode) => {
    const key = String(farCode || "").trim().toUpperCase();
    return key ? `${EPASS_PEOPLE_DRAFT_PREFIX}${key}` : `${EPASS_PEOPLE_DRAFT_PREFIX}default`;
  };

  const getTravelDraftKey = (farCode = currentFuelTravelFarCode) => {
    const key = String(farCode || "").trim().toUpperCase();
    return `${TRAVEL_PEOPLE_DRAFT_PREFIX}${key || "default"}`;
  };

  const getEpassLinkKey = (farCode = currentFuelEpassFarCode) => {
    const key = String(farCode || "").trim().toUpperCase();
    return key ? `${EPASS_LINK_PREFIX}${key}` : `${EPASS_LINK_PREFIX}default`;
  };

  const getTravelLinkKey = (farCode = currentFuelEpassFarCode) => {
    const key = String(farCode || "").trim().toUpperCase();
    return key ? `${TRAVEL_LINK_PREFIX}${key}` : `${TRAVEL_LINK_PREFIX}default`;
  };

  const cloneFuelPeople = (people = []) => (Array.isArray(people) ? people : []).map((person) => ({
    name: String(person?.name || "").trim(),
    usercode: String(person?.usercode || "").trim().toUpperCase(),
    profile_photo_url: String(person?.profile_photo_url || person?.photo_url || "").trim(),
  })).filter((person) => person.name && person.usercode);

  const loadFuelPeopleDraft = (farCode) => {
    try {
      const raw = global.sessionStorage.getItem(getEpassDraftKey(farCode)) || global.localStorage.getItem(getEpassDraftKey(farCode));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return cloneFuelPeople(Array.isArray(parsed) ? parsed : []);
    } catch (_error) {
      return [];
    }
  };

  const saveFuelPeopleDraft = (farCode, people) => {
    const key = getEpassDraftKey(farCode);
    try {
      const raw = JSON.stringify(cloneFuelPeople(people));
      global.sessionStorage.setItem(key, raw);
      global.localStorage.setItem(key, raw);
    } catch (_error) {
      /* noop */
    }
  };

  const hasFuelPeopleDraft = (farCode) => {
    const key = getEpassDraftKey(farCode);
    try {
      return global.sessionStorage.getItem(key) !== null || global.localStorage.getItem(key) !== null;
    } catch (_error) {
      return false;
    }
  };

  const loadFuelTravelPeopleDraft = (farCode) => {
    try {
      const key = getTravelDraftKey(farCode);
      const raw = global.sessionStorage.getItem(key) || global.localStorage.getItem(key);
      return raw ? cloneFuelPeople(JSON.parse(raw)) : [];
    } catch (_error) {
      return [];
    }
  };

  const saveFuelTravelPeopleDraft = (farCode, people) => {
    try {
      const raw = JSON.stringify(cloneFuelPeople(people));
      global.sessionStorage.setItem(getTravelDraftKey(farCode), raw);
      global.localStorage.setItem(getTravelDraftKey(farCode), raw);
    } catch (_error) {
      /* noop */
    }
  };

  const hasFuelTravelPeopleDraft = (farCode) => {
    try {
      const key = getTravelDraftKey(farCode);
      return global.sessionStorage.getItem(key) !== null || global.localStorage.getItem(key) !== null;
    } catch (_error) {
      return false;
    }
  };

  const getFuelEpassPeople = () => cloneFuelPeople(epassPeople);

  const setFuelEpassPeople = (people, opts = {}) => {
    epassPeople = cloneFuelPeople(people);
    epassPeopleDirty = Boolean(opts.dirty);
    saveFuelPeopleDraft(currentFuelEpassFarCode, epassPeople);
    renderFuelEpassSelected();
    if (fuelEpassSearchResultsCache.length) {
      setFuelEpassSearchResults(fuelEpassSearchResultsCache);
    }
  };

  const loadFuelEpassLink = (farCode) => {
    try {
      const key = getEpassLinkKey(farCode);
      const raw = global.sessionStorage.getItem(key) || global.localStorage.getItem(key);
      return String(raw || "").trim();
    } catch (_error) {
      return "";
    }
  };

  const saveFuelEpassLink = (farCode, epassNumber) => {
    const key = getEpassLinkKey(farCode);
    const value = String(epassNumber || "").trim();
    try {
      if (!value) {
        global.sessionStorage.removeItem(key);
        global.localStorage.removeItem(key);
        return;
      }
      global.sessionStorage.setItem(key, value);
      global.localStorage.setItem(key, value);
    } catch (_error) {
      /* noop */
    }
  };

  const loadFuelTravelLink = (farCode) => {
    try {
      const key = getTravelLinkKey(farCode);
      const raw = global.sessionStorage.getItem(key) || global.localStorage.getItem(key);
      return String(raw || "").trim();
    } catch (_error) {
      return "";
    }
  };

  const saveFuelTravelLink = (farCode, travelNumber) => {
    const key = getTravelLinkKey(farCode);
    const value = String(travelNumber || "").trim();
    try {
      if (!value) {
        global.sessionStorage.removeItem(key);
        global.localStorage.removeItem(key);
        return;
      }
      global.sessionStorage.setItem(key, value);
      global.localStorage.setItem(key, value);
    } catch (_error) {
      /* noop */
    }
  };

  const renderFuelEpassSelected = () => {
    const target = el("fuel-epass-selected-list");
    const count = el("fuel-epass-selected-count");
    if (count) {
      count.textContent = `${epassPeople.length} selected`;
    }
    if (!target) return;
    if (!epassPeople.length) {
      target.innerHTML = '<div class="fuel-epass-selected-empty">No employee selected yet.</div>';
      return;
    }
    target.innerHTML = epassPeople.map((person) => `
      <div class="fuel-epass-person-row" title="${escapeHtml(`${person.name || "Employee"}${person.usercode ? ` (${person.usercode})` : ""}`)}" aria-label="${escapeHtml(person.name || "Employee")}">
        <div class="fuel-epass-person-avatar">${renderEmployeeAvatar(person.name, person.usercode, person.profile_photo_url)}</div>
        <div class="fuel-epass-person-meta">
          <strong>${escapeHtml(person.name || "Employee")}</strong>
          <small>${escapeHtml(person.usercode || "")}</small>
        </div>
        <button class="fuel-epass-person-remove" type="button" data-fuel-epass-remove="${escapeHtml(person.usercode || "")}" aria-label="Remove ${escapeHtml(person.name || "employee")}">&times;</button>
      </div>
    `).join("");
    target.querySelectorAll("[data-fuel-epass-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const code = String(button.getAttribute("data-fuel-epass-remove") || "").trim().toUpperCase();
        if (!code) return;
        setFuelEpassPeople(epassPeople.filter((item) => String(item.usercode || "").trim().toUpperCase() !== code), { dirty: true });
      });
    });
  };

  const setFuelEpassSearchResults = (items = []) => {
    const target = el("fuel-epass-search-results");
    if (!target) return;
    fuelEpassSearchResultsCache = Array.isArray(items) ? items.slice() : [];
    if (!Array.isArray(items) || !items.length) {
      target.innerHTML = '<div class="fuel-epass-search-results-empty">No matches. Try a name or employee number.</div>';
      target.classList.add("active");
      target.scrollTop = 0;
      return;
    }
    const selectedCodes = new Set(epassPeople.map((person) => String(person.usercode || "").trim().toUpperCase()).filter(Boolean));
    target.innerHTML = `<div class="fuel-epass-search-results-grid">${items.map((item) => {
      const code = String(item.usercode || "").trim().toUpperCase();
      const name = String(item.name || code).trim();
      const photo = String(item.profile_photo_url || item.photo_url || "").trim();
      const selected = selectedCodes.has(code);
      return `
        <button type="button" class="fuel-epass-search-result${selected ? " is-selected" : ""}" data-fuel-epass-usercode="${escapeHtml(code)}" data-fuel-epass-name="${escapeHtml(name)}" data-fuel-epass-photo="${escapeHtml(photo)}" aria-pressed="${selected ? "true" : "false"}">
          <span class="fuel-epass-search-result-check" aria-hidden="true">${selected ? "?" : "+"}</span>
          <div class="fuel-epass-search-result-avatar">${renderEmployeeAvatar(name, code, photo)}</div>
          <div class="fuel-epass-search-result-body">
            <strong>${escapeHtml(name || "-")}</strong>
            <small>${escapeHtml(code || "-")}</small>
          </div>
        </button>
      `;
    }).join("")}</div>`;
    target.classList.add("active");
    target.scrollTop = 0;
    target.querySelectorAll("[data-fuel-epass-usercode]").forEach((button) => {
      button.addEventListener("click", () => {
        const usercode = String(button.getAttribute("data-fuel-epass-usercode") || "").trim().toUpperCase();
        const name = String(button.getAttribute("data-fuel-epass-name") || "").trim();
        const photo = String(button.getAttribute("data-fuel-epass-photo") || "").trim();
        if (!usercode || !name) return;
        const selectedIndex = epassPeople.findIndex((item) => String(item.usercode || "").trim().toUpperCase() === usercode);
        if (selectedIndex >= 0) {
          const nextPeople = epassPeople.filter((item) => String(item.usercode || "").trim().toUpperCase() !== usercode);
          setFuelEpassPeople(nextPeople, { dirty: true });
        } else {
          setFuelEpassPeople([...epassPeople, { name, usercode, profile_photo_url: photo }], { dirty: true });
        }
        const search = el("fuel-epass-search");
        void searchFuelEpassEmployees(String(search?.value || ""), currentFuelEpassDepartment).catch(() => {});
      });
    });
  };

  const searchFuelEpassEmployees = async (query, department = currentFuelEpassDepartment) => {
    const q = String(query || "").trim();
    const dept = String(department || "").trim().toUpperCase();
    const results = el("fuel-epass-search-results");
    if (q.length < 2 && !dept) {
      if (results) {
        results.classList.remove("active");
        results.innerHTML = "";
      }
      return;
    }
    const params = new URLSearchParams({ action: "search_employee" });
    if (q) params.set("q", q);
    if (dept) params.set("department", dept);
    const response = await fetch(`${authApi}?${params.toString()}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false, items: [] }));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || "Unable to load employee suggestions.");
    }
    setFuelEpassSearchResults(Array.isArray(payload.items) ? payload.items : []);
  };

  const getFuelTravelPeople = () => cloneFuelPeople(travelPeople);

  const setFuelTravelPeople = (people, opts = {}) => {
    travelPeople = cloneFuelPeople(people);
    travelPeopleDirty = Boolean(opts.dirty);
    saveFuelTravelPeopleDraft(currentFuelTravelFarCode, travelPeople);
    renderFuelTravelSelected();
    if (fuelTravelSearchResultsCache.length) setFuelTravelSearchResults(fuelTravelSearchResultsCache);
  };

  const renderFuelTravelSelected = () => {
    const target = el("fuel-travel-selected-list");
    if (!target) return;
    if (!travelPeople.length) {
      target.innerHTML = '<div class="fuel-epass-selected-empty">No employee selected yet.</div>';
      return;
    }
    target.innerHTML = travelPeople.map((person) => `
      <div class="fuel-epass-person-row" title="${escapeHtml(`${person.name || "Employee"}${person.usercode ? ` (${person.usercode})` : ""}`)}" aria-label="${escapeHtml(person.name || "Employee")}">
        <div class="fuel-epass-person-avatar">${renderEmployeeAvatar(person.name, person.usercode, person.profile_photo_url)}</div>
        <div class="fuel-epass-person-meta">
          <strong>${escapeHtml(person.name || "Employee")}</strong>
          <small>${escapeHtml(person.usercode || "")}</small>
        </div>
        <button class="fuel-epass-person-remove" type="button" data-fuel-travel-remove="${escapeHtml(person.usercode || "")}" aria-label="Remove ${escapeHtml(person.name || "employee")}">&times;</button>
      </div>
    `).join("");
    target.querySelectorAll("[data-fuel-travel-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const code = String(button.getAttribute("data-fuel-travel-remove") || "").trim().toUpperCase();
        setFuelTravelPeople(travelPeople.filter((item) => String(item.usercode || "").trim().toUpperCase() !== code), { dirty: true });
      });
    });
  };

  // [FEATURE] Same click-to-toggle multi-date calendar as the employees-profile Travel request
  // form (renderCalendar/toggleCalendarDate("travel", ...) in that module's script.js) — one Fuel
  // request maps to one Travel order, but the trip itself (and its biometric days) can span
  // several non-consecutive dates.
  const travelCalendarView = { year: 0, month: 0 };

  const displayDate = (value) => {
    if (!value) return "Date";
    const raw = String(value).trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
  };

  const ensureFuelTravelCalendarView = () => {
    if (travelCalendarView.year) return;
    const base = travelDates[0] || String(el("fuel-travel-calendar")?.dataset.base || "");
    if (base) {
      const parts = base.split("-");
      travelCalendarView.year = parseInt(parts[0], 10);
      travelCalendarView.month = parseInt(parts[1], 10) - 1;
    } else {
      const now = new Date();
      travelCalendarView.year = now.getFullYear();
      travelCalendarView.month = now.getMonth();
    }
  };

  const renderFuelTravelDates = () => {
    const label = el("fuel-travel-calendar-trigger-label");
    if (label) label.textContent = !travelDates.length ? "+ Add date" : (travelDates.length === 1 ? displayDate(travelDates[0]) : `${travelDates.length} dates selected`);
    const target = el("fuel-travel-dates-list");
    if (!target) return;
    target.innerHTML = travelDates.map((date) => `
      <span class="fuel-date-chip">${escapeHtml(displayDate(date))}<button type="button" data-fuel-travel-date-remove="${escapeHtml(date)}" aria-label="Remove ${escapeHtml(displayDate(date))}">&times;</button></span>
    `).join("");
    target.querySelectorAll("[data-fuel-travel-date-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        toggleFuelTravelDate(String(button.getAttribute("data-fuel-travel-date-remove") || ""));
      });
    });
  };

  const toggleFuelTravelDate = (iso) => {
    const cleaned = String(iso || "").trim();
    if (!cleaned) return;
    const index = travelDates.indexOf(cleaned);
    if (index >= 0) travelDates.splice(index, 1);
    else { travelDates.push(cleaned); travelDates.sort(); }
    renderFuelTravelDates();
    renderFuelTravelCalendar();
  };

  const shiftFuelTravelCalendarMonth = (delta) => {
    ensureFuelTravelCalendarView();
    let { year, month } = travelCalendarView;
    month += delta;
    if (month < 0) { month = 11; year -= 1; }
    else if (month > 11) { month = 0; year += 1; }
    travelCalendarView.year = year;
    travelCalendarView.month = month;
    renderFuelTravelCalendar();
  };

  const renderFuelTravelCalendar = () => {
    ensureFuelTravelCalendarView();
    const target = el("fuel-travel-calendar");
    if (!target) return;
    const { year, month } = travelCalendarView;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayIso = new Date().toISOString().slice(0, 10);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let cellsHtml = "";
    for (let i = 0; i < firstWeekday; i += 1) {
      cellsHtml += `<button type="button" class="travel-calendar-day is-blank" disabled tabindex="-1"></button>`;
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const classes = ["travel-calendar-day"];
      if (travelDates.includes(iso)) classes.push("is-selected");
      else if (iso === todayIso) classes.push("is-today");
      cellsHtml += `<button type="button" class="${classes.join(" ")}" data-fuel-travel-calendar-day="${iso}">${day}</button>`;
    }
    target.innerHTML = `
      <div class="travel-calendar-head">
        <button type="button" class="travel-calendar-nav" data-fuel-travel-calendar-prev aria-label="Previous month">&#10094;</button>
        <strong>${monthNames[month]} ${year}</strong>
        <button type="button" class="travel-calendar-nav" data-fuel-travel-calendar-next aria-label="Next month">&#10095;</button>
      </div>
      <div class="travel-calendar-weekdays">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>
      <div class="travel-calendar-grid">${cellsHtml}</div>
    `;
    target.querySelectorAll("[data-fuel-travel-calendar-day]").forEach((button) => {
      button.addEventListener("click", () => toggleFuelTravelDate(button.getAttribute("data-fuel-travel-calendar-day")));
    });
    target.querySelector("[data-fuel-travel-calendar-prev]")?.addEventListener("click", () => shiftFuelTravelCalendarMonth(-1));
    target.querySelector("[data-fuel-travel-calendar-next]")?.addEventListener("click", () => shiftFuelTravelCalendarMonth(1));
  };

  const setFuelTravelSearchResults = (items = []) => {
    const target = el("fuel-travel-search-results");
    if (!target) return;
    fuelTravelSearchResultsCache = Array.isArray(items) ? items.slice() : [];
    if (!Array.isArray(items) || !items.length) {
      target.innerHTML = '<div class="fuel-epass-search-results-empty">No matches. Try a name or employee number.</div>';
      target.classList.add("active");
      target.scrollTop = 0;
      return;
    }
    const selectedCodes = new Set(travelPeople.map((person) => String(person.usercode || "").trim().toUpperCase()).filter(Boolean));
    target.innerHTML = `<div class="fuel-epass-search-results-grid">${items.map((item) => {
      const code = String(item.usercode || "").trim().toUpperCase();
      const name = String(item.name || code).trim();
      const photo = String(item.profile_photo_url || item.photo_url || "").trim();
      const selected = selectedCodes.has(code);
      return `<button type="button" class="fuel-epass-search-result${selected ? " is-selected" : ""}" data-fuel-travel-usercode="${escapeHtml(code)}" data-fuel-travel-name="${escapeHtml(name)}" data-fuel-travel-photo="${escapeHtml(photo)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="fuel-epass-search-result-check" aria-hidden="true">${selected ? "?" : "+"}</span>
        <div class="fuel-epass-search-result-avatar">${renderEmployeeAvatar(name, code, photo)}</div>
        <div class="fuel-epass-search-result-body">
          <strong>${escapeHtml(name || "-")}</strong>
          <small>${escapeHtml(code || "-")}</small>
        </div>
      </button>`;
    }).join("")}</div>`;
    target.classList.add("active");
    target.scrollTop = 0;
    target.querySelectorAll("[data-fuel-travel-usercode]").forEach((button) => {
      button.addEventListener("click", () => {
        const usercode = String(button.getAttribute("data-fuel-travel-usercode") || "").trim().toUpperCase();
        const name = String(button.getAttribute("data-fuel-travel-name") || "").trim();
        const photo = String(button.getAttribute("data-fuel-travel-photo") || "").trim();
        if (!usercode || !name) return;
        const selected = travelPeople.some((item) => String(item.usercode || "").trim().toUpperCase() === usercode);
        const nextPeople = selected
          ? travelPeople.filter((item) => String(item.usercode || "").trim().toUpperCase() !== usercode)
          : [...travelPeople, { name, usercode, profile_photo_url: photo }];
        setFuelTravelPeople(nextPeople, { dirty: true });
        void searchFuelTravelEmployees(String(el("fuel-travel-search")?.value || ""), currentFuelTravelDepartment).catch(() => {});
      });
    });
  };

  const searchFuelTravelEmployees = async (query, department = currentFuelTravelDepartment) => {
    const q = String(query || "").trim();
    const dept = String(department || "").trim().toUpperCase();
    const params = new URLSearchParams({ action: "search_employee" });
    if (q) params.set("q", q);
    if (dept) params.set("department", dept);
    const response = await fetch(`${authApi}?${params.toString()}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false, items: [] }));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || "Unable to load employee suggestions.");
    setFuelTravelSearchResults(Array.isArray(payload.items) ? payload.items : []);
  };

  const loadFuelTravelFromFarCode = async (farCode) => {
    const code = String(farCode || "").trim();
    if (!code) return { number: "", people: [], printSignatories: [] };
    const params = new URLSearchParams({ action: "by_fuel_farcode", farCode: code });
    const response = await fetch(`${travelApi}?${params.toString()}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok || !payload.item) return { number: "", people: [], printSignatories: [] };
    return {
      number: String(payload.item.to_number || "").trim(),
      people: cloneFuelPeople(payload.item.people || []),
      printSignatories: Array.isArray(payload.item.print_signatories) ? payload.item.print_signatories : [],
    };
  };

  // Itinatala ang print sa server at sinasabi kung na-print na dati (reprint = photocopy).
  // Kapag nabigo ang tawag, ituturing na "original" (walang watermark) para hindi ma-block ang print.
  const markFuelPrinted = async (farCode) => {
    const code = String(farCode || "").trim();
    if (!code) return false;
    try {
      const body = new URLSearchParams();
      body.append("action", "mark_print");
      body.append("farCode", code);
      const response = await fetch(fuelApi, { method: "POST", body, credentials: "include", headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({}));
      return Boolean(payload && payload.ok && payload.printed_before);
    } catch {
      return false;
    }
  };

  const loadFuelEpassFromDb = async (epassNumber) => {
    const number = String(epassNumber || "").trim();
    if (!number) return [];
    const params = new URLSearchParams({ action: "by_number", epassnumber: number });
    const response = await fetch(`${epassApi}?${params.toString()}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok || !payload.item) return [];
    const names = Array.isArray(payload.item.requester_names) ? payload.item.requester_names : [];
    const usercodes = Array.isArray(payload.item.requester_usercodes) ? payload.item.requester_usercodes : [];
    const photos = Array.isArray(payload.item.requester_photo_urls) ? payload.item.requester_photo_urls : [];
    const total = Math.max(names.length, usercodes.length, photos.length);
    const people = [];
    for (let index = 0; index < total; index += 1) {
      const name = String(names[index] || "").trim();
      const usercode = String(usercodes[index] || "").trim().toUpperCase();
      if (!name || !usercode) continue;
      people.push({ name, usercode, profile_photo_url: String(photos[index] || "").trim() });
    }
    return people;
  };

  const loadFuelEpassFromFarCode = async (farCode) => {
    const code = String(farCode || "").trim();
    if (!code) return [];
    const params = new URLSearchParams({ action: "by_fuel_farcode", farCode: code });
    const response = await fetch(`${epassApi}?${params.toString()}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok || !payload.item) return [];
    const names = Array.isArray(payload.item.requester_names) ? payload.item.requester_names : [];
    const usercodes = Array.isArray(payload.item.requester_usercodes) ? payload.item.requester_usercodes : [];
    const photos = Array.isArray(payload.item.requester_photo_urls) ? payload.item.requester_photo_urls : [];
    const total = Math.max(names.length, usercodes.length, photos.length);
    const people = [];
    for (let index = 0; index < total; index += 1) {
      const name = String(names[index] || "").trim();
      const usercode = String(usercodes[index] || "").trim().toUpperCase();
      if (!name || !usercode) continue;
      people.push({ name, usercode, profile_photo_url: String(photos[index] || "").trim() });
    }
    return people;
  };

  const normalizeItem = (row) => ({
    RequestId: pick(row, ["RequestId", "requestId", "request_id", "Id", "id"], ""),
    FARCode: pick(row, ["FARCode", "farCode", "far_code"], ""),
    EmployeeName: pick(row, ["EmployeeName", "employee_name", "employeeName"], ""),
    UserCode: pick(row, ["UserCode", "usercode", "userCode"], ""),
    EmployeePosition: pick(row, ["EmployeePosition", "position"], ""),
    EmployeeDeptAbbr: pick(row, ["EmployeeDeptAbbr", "department_abbr"], ""),
    EmployeeDepartmentName: pick(row, ["EmployeeDepartmentName", "department_name"], ""),
    Area: pick(row, ["Area", "area"], ""),
    ReqItem: pick(row, ["ReqItem", "Requested_item", "requestedItem", "item_requested", "item"], ""),
    ReqAmt: pick(row, ["ReqAmt", "presRequest", "PresRequest", "amount", "ltrs", "liters"], ""),
    Vehicle: pick(row, ["Vehicle", "unit_id", "vehicle"], ""),
    VehicleModel: pick(row, ["VehicleModel", "vehicle_model"], ""),
    VehicleMake: pick(row, ["VehicleMake", "vehiclemake", "vehicle_make"], ""),
    VehicleCode: pick(row, ["VehicleCode", "Vcode", "vcode"], ""),
    Purpose: pick(row, ["Purpose", "purpose"], ""),
    Destination: pick(row, ["Destination", "destination"], ""),
    Status: pick(row, ["Status", "status"], ""),
    PresRequestDate: normalizeDate(pick(row, ["PresRequestDate", "presRequestDate", "request_date", "date"], "")),
    PrevTravel: pick(row, ["PrevTravel", "prevTravel", "prev_travel"], ""),
    PrevRequestDate: normalizeDate(pick(row, ["PrevRequestDate", "prevRequestDate", "prev_request_date"], "")),
    PrevAlloc: pick(row, ["PrevAlloc", "prev_alloc", "PrevRequest", "prevRequest"], ""),
    Balance: pick(row, ["Balance", "balance"], ""),
    fuelstation: pick(row, ["fuelstation", "FuelStation", "station"], ""),
    FuelEpassNumber: pick(row, ["FuelEpassNumber", "fuelEpassNumber", "fuel_epass_number", "epassnumber", "epass_number", "epassID", "epass_id"], ""),
    TravelNumber: pick(row, ["TravelNumber", "travelNumber", "travel_number", "to_number", "toNumber"], ""),
    ApprovedByUserCode: pick(row, ["ApprovedByUserCode", "ApprovedBy", "approved_by_usercode", "approved_by"], ""),
    ApprovedByName: pick(row, ["ApprovedByName", "approved_by_name"], ""),
    ApprovedByPosition: pick(row, ["ApprovedByPosition", "approved_by_position"], ""),
    AssignedApprovers: pick(row, ["AssignedApprovers", "assignedApprovers", "assigned_approvers"], ""),
    requester_names: Array.isArray(row?.requester_names) ? row.requester_names : [],
    requester_usercodes: Array.isArray(row?.requester_usercodes) ? row.requester_usercodes : [],
    requester_photo_urls: Array.isArray(row?.requester_photo_urls) ? row.requester_photo_urls : [],
    granted_to: Array.isArray(row?.granted_to) ? row.granted_to : [],
  });

  const normalizeStatusLabel = (raw) => {
    const v = String(raw ?? "").trim();
    if (v === "1") return "Approved";
    if (v === "2") return "Pending";
    if (v === "3") return "Rejected";
    const t = v.toLowerCase();
    if (t === "approved" || t === "pending" || t === "rejected") {
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return v || "-";
  };

  const statusBadgeModifier = (raw) => {
    const v = String(raw ?? "").trim();
    if (v === "1" || v.toLowerCase() === "approved") return "approved";
    if (v === "2" || v.toLowerCase() === "pending") return "pending";
    if (v === "3" || v.toLowerCase() === "rejected") return "rejected";
    return "unknown";
  };

  const buildStatusBadge = (raw) => {
    const mod = statusBadgeModifier(raw);
    const label = normalizeStatusLabel(raw);
    return `<span class="fuel-status-badge fuel-status-badge--${mod}"><span class="fuel-status-badge__dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
  };

  const isApprovedStatus = (raw) => {
    const v = String(raw ?? "").trim();
    return v === "1" || v.toLowerCase() === "approved";
  };

  const isPendingStatus = (raw) => {
    const v = String(raw ?? "").trim();
    return v === "2" || v.toLowerCase() === "pending";
  };

  const choosePendingFuelLink = (status, reportedNumber, savedNumber) => {
    // [HUWAG] Pending request needs an explicit user choice. A FAR may repeat, so a link
    // inferred by the server must not silently choose EPASS or Travel for a new request.
    return isPendingStatus(status) ? savedNumber : (reportedNumber || savedNumber);
  };

  const getLinkedEpassNumber = (item) => {
    const reportedNumber =
      item?.FuelEpassNumber ??
      item?.fuelEpassNumber ??
      item?.fuel_epass_number ??
      item?.epassnumber ??
      item?.epass_number ??
      item?.epassID ??
      item?.epass_id ??
      "";
    const savedNumber = loadFuelEpassLink(item?.FARCode || item?.farCode || item?.far_code);
    return String(choosePendingFuelLink(item?.Status ?? item?.status, reportedNumber, savedNumber) || "").trim();
  };

  const hasLinkedEpass = (item) => Boolean(getLinkedEpassNumber(item));

  const getLinkedTravelNumber = (item) => {
    const reportedNumber =
      item?.TravelNumber ??
      item?.travelNumber ??
      item?.travel_number ??
      item?.to_number ??
      item?.toNumber ??
      "";
    const savedNumber = loadFuelTravelLink(item?.FARCode || item?.farCode || item?.far_code);
    return String(choosePendingFuelLink(item?.Status ?? item?.status, reportedNumber, savedNumber) || "").trim();
  };

  console.assert(choosePendingFuelLink(2, "STALE-LINK", "") === "", "Pending Fuel must ask for EPASS or Travel.");

  const hasLinkedTravel = (item) => Boolean(getLinkedTravelNumber(item));

  // Approved legacy requests may not have an EPASS/Travel link; their requester is the print fallback.
  const canPrintRequest = (item) => isApprovedStatus(item?.Status);
  console.assert(
    canPrintRequest({ Status: 1 })
    && !canPrintRequest({ Status: 2, FuelEpassNumber: "EP-1" }),
    "Fuel print approval gate failed."
  );

  const setModalActive = (node, open) => {
    if (!node) return;
    node.classList.toggle("active", !!open);
    node.setAttribute("aria-hidden", open ? "false" : "true");
  };

  const showToast = (title, text) => {
    const toast = el("fuel-toast");
    const toastTitle = el("fuel-toast-title");
    const toastText = el("fuel-toast-text");
    if (!toast) {
      global.alert(text || title);
      return;
    }
    if (toastTitle) toastTitle.textContent = title || "Notice";
    if (toastText) toastText.textContent = text || "";
    toast.classList.add("active");
    global.setTimeout(() => toast.classList.remove("active"), 4200);
  };

  const withTimeout = (promise, fallback, ms = 1200) => new Promise((resolve) => {
    const timer = global.setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (value) => {
        global.clearTimeout(timer);
        resolve(value);
      },
      () => {
        global.clearTimeout(timer);
        resolve(fallback);
      }
    );
  });

  const fillDepartmentOptions = () => {
    const options = [
      '<option value="">All departments</option>',
      ...EPASS_DEPARTMENTS.map(([abbr, label]) => `<option value="${escapeHtml(abbr)}">${escapeHtml(label)}</option>`),
    ].join("");
    [el("fuel-epass-department"), el("fuel-travel-department")].forEach((select) => {
      if (select) select.innerHTML = options;
    });
  };

  const resolveDepartmentValue = (abbr) => {
    const key = String(abbr || "").trim().toUpperCase();
    const hit = EPASS_DEPARTMENTS.find(([code]) => code === key);
    return hit ? hit[0] : key || "ADMIN";
  };

  const getSessionDepartment = () => {
    const session = readSession();
    return resolveDepartmentValue(session.department || session.area || "");
  };

  const setFuelEpassDepartment = (value, opts = {}) => {
    const department = String(value || "").trim().toUpperCase();
    currentFuelEpassDepartment = department;
    const select = el("fuel-epass-department");
    if (select && select.value !== department) {
      select.value = department;
    }
    if (opts.search !== false) {
      void searchFuelEpassEmployees(String(el("fuel-epass-search")?.value || ""), department).catch(() => {});
    }
  };

  const setFuelTravelDepartment = (value, opts = {}) => {
    const department = String(value || "").trim().toUpperCase();
    currentFuelTravelDepartment = department;
    const select = el("fuel-travel-department");
    if (select && select.value !== department) select.value = department;
    if (opts.search !== false) {
      void searchFuelTravelEmployees(String(el("fuel-travel-search")?.value || ""), department).catch(() => {});
    }
  };

  const syncPickerChoiceState = (linkedEpass, linkedTravel, allowSwitch = false) => {
    const pickEpassBtn = el("fuel-et-pick-epass");
    const pickTravelBtn = el("fuel-et-pick-travel");
    const epassDisabled = !allowSwitch && Boolean(linkedTravel);
    const travelDisabled = !allowSwitch && Boolean(linkedEpass);
    if (pickEpassBtn) {
      pickEpassBtn.disabled = epassDisabled;
      pickEpassBtn.setAttribute("aria-disabled", epassDisabled ? "true" : "false");
      pickEpassBtn.title = epassDisabled ? "Travel already exists for this Fuel request." : "Open Fuel EPASS form";
    }
    if (pickTravelBtn) {
      pickTravelBtn.disabled = travelDisabled;
      pickTravelBtn.setAttribute("aria-disabled", travelDisabled ? "true" : "false");
      pickTravelBtn.title = travelDisabled ? "Fuel EPASS already exists for this request." : "Open Travel form";
    }
    const sub = el("fuel-et-picker-subline");
    if (sub) {
      if (allowSwitch && (linkedEpass || linkedTravel)) {
        sub.textContent = "Pending pa ito. Puwede mong palitan ang existing link; ise-save muna ang bago bago alisin ang luma.";
      } else if (epassDisabled && travelDisabled) {
        sub.textContent = "May Fuel EPASS at Travel na ito. I-cancel muna ang existing request bago magbukas ulit.";
      } else if (epassDisabled) {
        sub.textContent = "May Travel na ito. Naka-disable ang EPASS hanggang ma-cancel ang Travel.";
      } else if (travelDisabled) {
        sub.textContent = "May Fuel EPASS na ito. Naka-disable ang Travel hanggang ma-cancel ang EPASS.";
      } else {
        sub.textContent = "Pumili ng form na bubuksan.";
      }
    }
  };

  const openPicker = (row) => {
    pickerItem = normalizeItem(row);
    const meta = el("fuel-et-picker-meta");
    if (meta) {
      const far = pickerItem.FARCode || "";
      const name = String(pickerItem.EmployeeName || "").trim();
      meta.textContent = far && name ? `${far} · ${name}` : far || name || "";
    }
    const linked = getLinkedEpassNumber(pickerItem);
    const travelLinked = getLinkedTravelNumber(pickerItem);
    if (linked) pickerItem.FuelEpassNumber = linked;
    if (travelLinked) pickerItem.TravelNumber = travelLinked;
    syncPickerChoiceState(Boolean(linked), Boolean(travelLinked), isPendingStatus(pickerItem.Status));
    // Pumili muna ang user; huwag mag-auto-detect ng EPASS/Travel mula sa kaparehong FAR/details.
    setModalActive(el("fuel-et-picker-modal"), true);
  };

  const closePicker = () => {
    pickerItem = null;
    syncPickerChoiceState(false, false);
    setModalActive(el("fuel-et-picker-modal"), false);
  };

  const openTravelModal = (row) => {
    const item = normalizeItem(row || pickerItem || {});
    currentFuelTravelFarCode = String(item.FARCode || "").trim();
    currentFuelTravelNumber = getLinkedTravelNumber(item);
    currentFuelTravelReplacesEpass = isPendingStatus(item.Status) && Boolean(getLinkedEpassNumber(item));
    travelApproverSelectedDeptHead = null;
    travelApproverSelectedGeneralManager = null;
    travelApprovalEditingStage = "department_head";
    const approverSearchField = el("fuel-travel-approver-search-field");
    const approverResults = el("fuel-travel-approver-results");
    if (approverSearchField) approverSearchField.hidden = true;
    if (approverResults) { approverResults.hidden = true; approverResults.classList.remove("active"); }
    bindFuelTravelApprovalRoute();
    const modal = el("fuel-travel-modal");
    fillDepartmentOptions();
    const initialDept = resolveDepartmentValue(item.EmployeeDeptAbbr || getSessionDepartment());
    setFuelTravelDepartment(initialDept, { search: false });
    void loadAutomaticFuelTravelApprovers();
    if (el("fuel-travel-farcode")) el("fuel-travel-farcode").value = currentFuelTravelFarCode;
    if (el("fuel-travel-number")) el("fuel-travel-number").value = currentFuelTravelNumber;
    travelDefaultDate = String(item.PresRequestDate || "").slice(0, 10);
    travelDates = travelDefaultDate ? [travelDefaultDate] : [];
    travelCalendarView.year = 0;
    renderFuelTravelDates();
    if (el("fuel-travel-location")) el("fuel-travel-location").value = String(item.Destination || item.PrevTravel || item.fuelstation || "").trim();
    if (el("fuel-travel-purpose")) el("fuel-travel-purpose").value = String(item.Purpose || "").trim();
    const requesterPeople = item.requester_names.map((name, index) => ({
      name,
      usercode: item.requester_usercodes[index] || "",
      profile_photo_url: item.requester_photo_urls[index] || "",
    }));
    const fallback = cloneFuelPeople(requesterPeople).length
      ? cloneFuelPeople(requesterPeople)
      : (item.EmployeeName && item.UserCode
        ? [{ name: item.EmployeeName, usercode: item.UserCode, profile_photo_url: "" }]
        : []);
    const draft = hasFuelTravelPeopleDraft(currentFuelTravelFarCode)
      ? loadFuelTravelPeopleDraft(currentFuelTravelFarCode)
      : fallback;
    setFuelTravelPeople(draft, { dirty: false });
    const saveBtn = el("fuel-travel-save-btn");
    if (saveBtn) saveBtn.disabled = true;
    setModalActive(modal, true);
    resetFuelPeopleScroll("travel");
    void loadFuelTravelFromFarCode(currentFuelTravelFarCode).then((linked) => {
      if (currentFuelTravelFarCode !== String(item.FARCode || "").trim()) return;
      if (linked.number) {
        currentFuelTravelNumber = linked.number;
        if (el("fuel-travel-number")) el("fuel-travel-number").value = linked.number;
        saveFuelTravelLink(currentFuelTravelFarCode, linked.number);
      }
      if (linked.people.length) setFuelTravelPeople(linked.people, { dirty: false });
    }).catch(() => {}).finally(() => {
      if (saveBtn) saveBtn.disabled = false;
    });
    void searchFuelTravelEmployees(String(el("fuel-travel-search")?.value || ""), initialDept).catch(() => {});
  };

  const closeTravelModal = () => {
    setModalActive(el("fuel-travel-modal"), false);
    el("fuel-travel-calendar-dialog")?.close();
    currentFuelTravelFarCode = "";
    currentFuelTravelNumber = "";
    currentFuelTravelDepartment = "";
    currentFuelTravelReplacesEpass = false;
    travelPeopleDirty = false;
  };

  const openEpassModal = (row) => {
    const item = normalizeItem(row || pickerItem || {});
    currentFuelEpassFarCode = String(item.FARCode || currentFuelEpassFarCode || "").trim();
    currentFuelEpassRequestId = String(item.RequestId || "").trim();
    currentFuelEpassNumber = getLinkedEpassNumber(item);
    currentFuelEpassReplacesTravel = isPendingStatus(item.Status) && Boolean(getLinkedTravelNumber(item));
    const modal = el("fuel-epass-modal");
    const title = el("fuel-epass-title");
    const subtitle = el("fuel-epass-subtitle");
    const farCodeInput = el("fuel-epass-farcode");
    const numberInput = el("fuel-epass-number");
    const dept = el("fuel-epass-department");
    const date = el("fuel-epass-date");
    const destination = el("fuel-epass-location");
    const purpose = el("fuel-epass-purpose");
    if (title) title.textContent = "Fuel EPASS";
    if (subtitle) {
      subtitle.textContent = item.FARCode
        ? `${item.FARCode}${item.EmployeeName ? ` · ${item.EmployeeName}` : ""}`
        : "Select employees for this Fuel EPASS.";
    }
    if (farCodeInput) farCodeInput.value = item.FARCode || "";
    if (numberInput) numberInput.value = getLinkedEpassNumber(item);
    fillDepartmentOptions();
    const initialDept = resolveDepartmentValue(item.EmployeeDeptAbbr || getSessionDepartment());
    if (dept) dept.value = initialDept;
    currentFuelEpassDepartment = initialDept;
    if (date && item.PresRequestDate) date.value = item.PresRequestDate;
    if (destination && (item.Destination || item.PrevTravel || item.fuelstation)) destination.value = String(item.Destination || item.PrevTravel || item.fuelstation || "");
    if (purpose && item.Purpose) purpose.value = item.Purpose;
    const farKey = currentFuelEpassFarCode;
    const saved = hasFuelPeopleDraft(farKey) ? loadFuelPeopleDraft(farKey) : [];
    if (currentFuelEpassNumber) {
      void loadFuelEpassFromDb(currentFuelEpassNumber).then((people) => {
        if (people.length) {
          setFuelEpassPeople(people, { dirty: false });
          return;
        }
        if (currentFuelEpassFarCode) {
          loadFuelEpassFromFarCode(currentFuelEpassFarCode).then((farPeople) => {
            if (farPeople.length) {
              setFuelEpassPeople(farPeople, { dirty: false });
              return;
            }
            if (hasFuelPeopleDraft(farKey)) {
              setFuelEpassPeople(saved, { dirty: false });
              return;
            }
            const fallback = item.EmployeeName && item.UserCode ? [{ name: item.EmployeeName, usercode: item.UserCode, profile_photo_url: "" }] : [];
            setFuelEpassPeople(fallback, { dirty: false });
          });
          return;
        }
        if (hasFuelPeopleDraft(farKey)) {
          setFuelEpassPeople(saved, { dirty: false });
          return;
        }
        const fallback = item.EmployeeName && item.UserCode ? [{ name: item.EmployeeName, usercode: item.UserCode, profile_photo_url: "" }] : [];
        setFuelEpassPeople(fallback, { dirty: false });
      });
    } else {
      if (currentFuelEpassFarCode) {
        void loadFuelEpassFromFarCode(currentFuelEpassFarCode).then((people) => {
          const initial = people.length
            ? people
            : (hasFuelPeopleDraft(farKey) ? saved : (item.EmployeeName && item.UserCode ? [{ name: item.EmployeeName, usercode: item.UserCode, profile_photo_url: "" }] : []));
          setFuelEpassPeople(initial, { dirty: false });
        });
      } else {
        const initial = hasFuelPeopleDraft(farKey)
          ? saved
          : (item.EmployeeName && item.UserCode ? [{ name: item.EmployeeName, usercode: item.UserCode, profile_photo_url: "" }] : []);
        setFuelEpassPeople(initial, { dirty: false });
      }
    }
    renderFuelEpassSelected();
    setModalActive(modal, true);
    resetFuelPeopleScroll("epass");
    void searchFuelEpassEmployees(String(el("fuel-epass-search")?.value || ""), currentFuelEpassDepartment).catch(() => {});
  };

  const closeEpassModal = async () => {
    if (epassPeopleDirty && currentFuelEpassFarCode) {
      const ok = await persistFuelEpass();
      if (!ok) {
        return;
      }
    }
    const modal = el("fuel-epass-modal");
    if (modal) {
      modal.classList.remove("active");
      modal.setAttribute("aria-hidden", "true");
    }
    currentFuelEpassFarCode = "";
    currentFuelEpassRequestId = "";
    currentFuelEpassNumber = "";
    currentFuelEpassDepartment = "";
    currentFuelEpassReplacesTravel = false;
  };

  const detailText = (value) => {
    const text = String(value ?? "").trim();
    return text ? escapeHtml(text) : "-";
  };

  const renderDetailField = (label, value, opts = {}) => {
    const wideClass = opts.wide ? " fuel-detail-field--wide" : "";
    const valueClass = opts.emphasis ? " fuel-detail-value--emphasis" : "";
    return `<div class="fuel-detail-field${wideClass}">
      <span class="fuel-detail-label">${escapeHtml(label)}</span>
      <span class="fuel-detail-value${valueClass}">${detailText(value)}</span>
    </div>`;
  };

  const renderDetailGroup = (title, fieldsHtml) => {
    const modifier = String(title || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `
    <section class="fuel-detail-group fuel-detail-group--${modifier}">
      <div class="fuel-detail-group-head">
        <span class="fuel-detail-group-title">${escapeHtml(title)}</span>
        <span class="fuel-detail-group-line" aria-hidden="true"></span>
      </div>
      <div class="fuel-detail-grid">${fieldsHtml}</div>
    </section>`;
  };

  const formatLiters = (raw) => {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    return `${text} L`;
  };

  const getInitials = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return "?";
    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  };

  const renderEmployeeAvatar = (name, code, photoUrl) => {
    const safePhoto = String(photoUrl || "").trim();
    const label = String(name || code || "Employee").trim();
    return safePhoto
      ? `<img src="${escapeHtml(safePhoto)}" alt="${escapeHtml(label)}" />`
      : escapeHtml(getInitials(label));
  };

  const renderLinkedEmployeeCard = (name, usercode, photoUrl) => {
    const safeName = String(name || "").trim();
    const safeCode = String(usercode || "").trim();
    const safePhoto = String(photoUrl || "").trim();
    return `<article class="fuel-linked-employee">
      <div class="fuel-linked-employee__avatar">${safePhoto ? `<img src="${escapeHtml(safePhoto)}" alt="${escapeHtml(safeName || safeCode || 'Employee')}" />` : escapeHtml(getInitials(safeName || safeCode))}</div>
      <div class="fuel-linked-employee__meta">
        <div class="fuel-linked-employee__name">${escapeHtml(safeName || safeCode || "Unknown employee")}</div>
        <div class="fuel-linked-employee__code">${escapeHtml(safeCode || "-")}</div>
      </div>
    </article>`;
  };

  const renderLinkedEmployeesSection = (item) => {
    const names = Array.isArray(item?.requester_names) ? item.requester_names : [];
    const codes = Array.isArray(item?.requester_usercodes) ? item.requester_usercodes : [];
    const photos = Array.isArray(item?.requester_photo_urls) ? item.requester_photo_urls : [];
    const total = Math.max(names.length, codes.length, photos.length, item?.granted_to?.length || 0);
    const cards = [];
    for (let i = 0; i < total; i += 1) {
      cards.push(renderLinkedEmployeeCard(names[i] || item?.requester_name || item?.usercode || "", codes[i] || "", photos[i] || ""));
    }
    return renderDetailGroup("Linked employees", `
      <div class="fuel-linked-employees">
        ${cards.length ? cards.join("") : '<div class="fuel-linked-employee__empty">No linked employees found for this EPASS yet.</div>'}
      </div>
    `);
  };

  const loadLinkedEpassDetails = async (epassNumber) => {
    const number = String(epassNumber || "").trim();
    if (!number) return null;
    const query = new URLSearchParams({ action: "by_number", epassnumber: number });
    const response = await fetch(`${epassApi}?${query.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      headers: getAuthHeaders(),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to load linked EPASS details.");
    }
    return payload.item || null;
  };

  const formatFiledDate = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return "";
    const date = new Date(`${text.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const renderApprovalRowGroup = (cellsHtml, modifier = "") => (
    `<div class="fuel-appr-row${modifier ? ` fuel-appr-row--${modifier}` : ""}">${cellsHtml}</div>`
  );

  const renderApprovalCell = (label, value, opts = {}) => (
    `<div class="fuel-appr-cell">
      <span class="fuel-appr-label">${escapeHtml(label)}</span>
      <span class="fuel-appr-value${opts.muted ? " fuel-appr-value--muted" : ""}">${detailText(value)}</span>
    </div>`
  );

  const renderApprovalCard = (item, rowKey) => {
    const dept = [item.EmployeeDeptAbbr, item.EmployeeDepartmentName].filter(Boolean).join(" | ");
    const pending = isPendingStatus(item.Status);
    const linkedEpass = getLinkedEpassNumber(item);
    const linkedTravel = getLinkedTravelNumber(item);
    const hasLink = Boolean(linkedEpass || linkedTravel);
    const approveDisabled = !pending || !hasLink ? " disabled" : "";
    const rejectDisabled = pending ? "" : " disabled";
    const photo = item.requester_photo_urls?.[0] || "";
    return `
    <div class="fuel-appr-card">
      <div class="fuel-appr-top">
        <div class="fuel-appr-person">
          <div class="fuel-appr-avatar">${renderEmployeeAvatar(item.EmployeeName, item.UserCode, photo)}</div>
          <div class="fuel-appr-person-meta">
            <span class="fuel-appr-eyebrow">Request submitted by</span>
            <h3 class="fuel-appr-name">${escapeHtml(item.EmployeeName || item.UserCode || "Unknown employee")}</h3>
            <div class="fuel-appr-role">${escapeHtml(item.EmployeePosition || "Employee")}</div>
            <div class="fuel-appr-tags">
              <span class="fuel-appr-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M3 10h5"/></svg>${escapeHtml(item.UserCode || "-")}</span>
              <span class="fuel-appr-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>${escapeHtml(item.Area || "Not provided")}</span>
            </div>
          </div>
        </div>
        <div class="fuel-appr-request">
          <span class="fuel-appr-request-eyebrow">Fuel request</span>
          <div class="fuel-appr-code">${escapeHtml(item.FARCode || "-")}</div>
          <div class="fuel-appr-filed">Filed ${escapeHtml(formatFiledDate(item.PresRequestDate) || "-")}</div>
          ${!hasLink ? `<span class="fuel-appr-warning">No EPASS or travel linked to this fuel request</span>` : ""}
        </div>
        <div class="fuel-appr-side">
          ${buildStatusBadge(item.Status)}
          <div class="fuel-appr-liters">
            <div class="fuel-appr-liters-icon">${escapeHtml(item.ReqAmt || "-")}</div>
            <span class="fuel-appr-liters-label">Liters</span>
            <span class="fuel-appr-liters-type">${escapeHtml((item.ReqItem || "-").toUpperCase())}</span>
          </div>
        </div>
      </div>

      ${item.Purpose ? `
      <div class="fuel-appr-about">
        <div>
          <span class="fuel-appr-about-eyebrow">About this request</span>
          <div class="fuel-appr-about-text">${escapeHtml(item.Purpose)}</div>
        </div>
      </div>` : ""}

      <div class="fuel-appr-rows">
        ${renderApprovalRowGroup(
          renderApprovalCell("Request source", "Fuel Form")
          + renderApprovalCell("Department", dept || "-")
        )}
        ${renderApprovalRowGroup(renderApprovalCell("Vehicle", item.Vehicle || "-"))}
        ${item.Destination ? renderApprovalRowGroup(
          `<div class="fuel-appr-cell"><span class="fuel-appr-label">Destination</span><span class="fuel-appr-value">${escapeHtml(item.Destination)}</span></div>`,
          "flag"
        ) : ""}
        ${renderApprovalRowGroup(
          renderApprovalCell("EPASS link", linkedEpass || "Not linked yet", { muted: !linkedEpass })
          + renderApprovalCell("Travel link", linkedTravel || "Not linked yet", { muted: !linkedTravel })
        )}
        ${renderApprovalRowGroup(renderApprovalCell("Balance", formatLiters(item.Balance) || "-"))}
      </div>
    </div>
    <div class="fuel-appr-footer">
      <div class="fuel-appr-footer-buttons">
        <button type="button" class="fuel-appr-btn fuel-appr-btn--approve"${approveDisabled} data-fuel-action="approve-request" data-fuel-row="${escapeHtml(rowKey)}">&check; Approve</button>
        <button type="button" class="fuel-appr-btn fuel-appr-btn--reject"${rejectDisabled} data-fuel-action="reject-request" data-fuel-row="${escapeHtml(rowKey)}">&times; Reject</button>
      </div>
      ${!hasLink ? `<div class="fuel-appr-footer-hint">Link a Fuel EPASS or Travel Order before this request can be approved.</div>` : ""}
    </div>`;
  };

  const openDetailsModal = async (row) => {
    const item = normalizeItem(row);
    const rowKey = registerFuelRow(row);
    const title = el("fuel-detail-title");
    const subtitle = el("fuel-detail-subtitle");
    const statusHost = el("fuel-detail-status");
    const body = el("fuel-detail-body");
    if (title) {
      title.textContent = item.FARCode ? `FAR ${item.FARCode}` : "Fuel request details";
    }
    if (subtitle) subtitle.hidden = true;
    if (statusHost) statusHost.hidden = true;
    if (body) {
      body.innerHTML = renderApprovalCard(item, rowKey);
    }
    setModalActive(el("fuel-detail-modal"), true);
    const epassNumber = getLinkedEpassNumber(item);
    if (!epassNumber || !body) return;
    const baseBodyHtml = body.innerHTML;
    try {
      const linked = await loadLinkedEpassDetails(epassNumber);
      if (!linked || !body.isConnected) return;
      const linkedStatus = linked.status_label || normalizeStatusLabel(linked.status || "");
      body.innerHTML = `
        ${baseBodyHtml}
        <div class="fuel-detail-extra-grid">
          ${renderDetailGroup("Linked EPASS", [
            renderDetailField("EPASS no.", linked.epassnumber || epassNumber, { emphasis: true }),
            renderDetailField("Department", linked.department),
            renderDetailField("Prev. Travel", linked.destination),
            renderDetailField("Purpose", linked.purpose, { wide: true }),
            renderDetailField("Date", linked.date),
            renderDetailField("Status", linkedStatus),
            renderDetailField("Granted to", linked.granted_to?.join(", ") || linked.requester_name || "-"),
          ].join(""))}
          ${renderLinkedEmployeesSection(linked)}
        </div>
      `;
    } catch (error) {
      if (!body.isConnected) return;
      body.innerHTML = `
        ${baseBodyHtml}
        <div class="fuel-detail-extra-grid">
          ${renderDetailGroup("Linked EPASS", [
            renderDetailField("EPASS no.", epassNumber, { emphasis: true }),
            renderDetailField("Linked employees", error.message || "Unable to load linked employee group.", { wide: true }),
          ].join(""))}
        </div>
      `;
    }
  };

  const closeDetailsModal = () => {
    setModalActive(el("fuel-detail-modal"), false);
  };

  const persistFuelEpass = async () => {
    const farCode = String(el("fuel-epass-farcode")?.value || currentFuelEpassFarCode || "").trim();
    const epassNumber = String(el("fuel-epass-number")?.value || currentFuelEpassNumber || "").trim();
    const destination = String(el("fuel-epass-location")?.value || "").trim();
    const purpose = String(el("fuel-epass-purpose")?.value || "").trim();
    const date = String(el("fuel-epass-date")?.value || "").trim();
    const department = String(el("fuel-epass-department")?.value || currentFuelEpassDepartment || "").trim();
    const message = el("fuel-epass-form-message");

    if (!farCode) {
      if (message) message.textContent = "Missing FAR code.";
      return false;
    }
    if (!destination || !purpose) {
      if (message) message.textContent = "Please complete destination and purpose.";
      return false;
    }
    if (!epassPeople.length && !currentFuelEpassNumber) {
      if (message) message.textContent = "Please select at least one employee.";
      return false;
    }

    const formData = new URLSearchParams();
    formData.append("action", "create_fuel_epass");
    formData.append("farCode", farCode);
    if (currentFuelEpassRequestId) formData.append("requestId", currentFuelEpassRequestId);
    formData.append("epassNumber", epassNumber);
    formData.append("destination", destination);
    formData.append("purpose", purpose);
    formData.append("date", date);
    formData.append("department", department);
    formData.append("people", JSON.stringify(getFuelEpassPeople()));

    const saveBtn = el("fuel-epass-save-btn");
    if (saveBtn) saveBtn.disabled = true;
    try {
      const response = await fetch(fuelApi, { method: "POST", body: formData, credentials: "include", headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Unable to save Fuel EPASS.");
      }
      const removed = !epassPeople.length;
      const savedNumber = String(payload.epassnumber || payload.epass_number || epassNumber || "").trim();
      if (removed) {
        currentFuelEpassNumber = "";
        if (el("fuel-epass-number")) el("fuel-epass-number").value = "";
        saveFuelEpassLink(farCode, "");
      } else if (savedNumber) {
        currentFuelEpassNumber = savedNumber;
        if (el("fuel-epass-number")) el("fuel-epass-number").value = savedNumber;
        saveFuelEpassLink(farCode, savedNumber);
      }
      if (!removed && currentFuelEpassReplacesTravel) {
        // [HUWAG] Save muna ang bagong EPASS bago alisin ang dating Travel para walang link loss.
        await removeOppositeFuelLink(travelApi, farCode, "Travel");
        saveFuelTravelLink(farCode, "");
        currentFuelEpassReplacesTravel = false;
      }
      epassPeopleDirty = false;
      saveFuelPeopleDraft(farCode, epassPeople);
      if (message) message.textContent = payload.message || (removed ? "Fuel EPASS removed." : "Fuel EPASS saved.");
      showToast("Fuel EPASS", payload.message || (removed ? "Fuel EPASS removed." : "Fuel EPASS saved."));
      global.dispatchEvent(new CustomEvent("samelcii-fuel-history-refresh"));
      return true;
    } catch (error) {
      if (message) message.textContent = error.message || "Save failed.";
      return false;
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  const saveFuelEpass = async (event) => {
    event.preventDefault();
    const ok = await persistFuelEpass();
    if (ok) {
      closeEpassModal();
    }
  };

  const isDepartmentHeadApprover = (person) => {
    const position = String(person?.position || "").trim().toUpperCase();
    if (!position || /\b(ASSISTANT|ASST|DEPUTY)\b/.test(position)) return false;
    return /(DEPARTMENT\s+(HEAD|MANAGER)|DIVISION\s+HEAD|GENERAL\s+MANAGER)/.test(position)
      || /(^|[^A-Z])(HEAD|MANAGER)([^A-Z]|$)/.test(position);
  };
  const isGeneralManagerApprover = (person) => /\bGENERAL\s+MANAGER\b/.test(String(person?.position || "").trim().toUpperCase());
  // [FEATURE] Same admin-only gate as canChangeTravelGeneralManager() in employees-profile/script.js.
  const canChangeTravelGeneralManager = () => {
    try {
      const session = JSON.parse(localStorage.getItem(sessionKey) || "{}");
      return String(session.privilage || "").split(/[^0-9]+/).filter(Boolean).includes("10");
    } catch (_error) {
      return false;
    }
  };

  const renderFuelTravelApprovalRoute = () => {
    const target = el("fuel-travel-approver-selected");
    if (!target) return;
    const deptHead = travelApproverSelectedDeptHead || travelApproverAutoDeptHead || null;
    const generalManager = travelApproverSelectedGeneralManager || travelApproverAutoGeneralManager || null;
    const gmChangeable = canChangeTravelGeneralManager();
    const stops = [
      { person: deptHead, label: "Dept. Head", changeable: true, stage: "department_head" },
      { person: generalManager, label: "General Mgr.", changeable: gmChangeable, stage: "general_manager" },
    ];
    target.innerHTML = stops.map(({ person, label, changeable, stage }, index) => `
      <div class="travel-route-stop${changeable ? " is-changeable" : ""}${person ? "" : " is-empty"}" data-change-travel-stage="${changeable ? stage : ""}" title="${changeable ? `Click to choose ${escapeHtml(label)}` : "General Manager is assigned automatically"}">
        <span class="stop-dot">
          <span class="fuel-epass-person-avatar">${person ? renderEmployeeAvatar(person.name, person.usercode, person.profile_photo_url) : (index + 1)}</span>
          <b class="stop-num">${index + 1}</b>
        </span>
        <span class="stop-label">
          <strong>${escapeHtml(person?.name || "Not set")}</strong>
          <small>${escapeHtml(label)}</small>
        </span>
      </div>`).join("");
  };

  const loadAutomaticFuelTravelApprovers = async () => {
    travelApproverAutoDeptHead = null;
    travelApproverAutoGeneralManager = null;
    renderFuelTravelApprovalRoute();
    try {
      const params = new URLSearchParams({ action: "search_employee", approvers_only: "1", limit: "100" });
      const response = await fetch(`${authApi}?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({ items: [] }));
      if (!response.ok || !payload.ok) return;
      const people = Array.isArray(payload.items) ? payload.items : [];
      travelApproverPeople.clear();
      people.forEach((person) => {
        const code = String(person.usercode || "").trim().toUpperCase();
        if (code) travelApproverPeople.set(code, person);
      });
      const dept = String(currentFuelTravelDepartment || "").trim().toUpperCase();
      travelApproverAutoDeptHead = people.find((item) => String(item.department || "").trim().toUpperCase() === dept && isDepartmentHeadApprover(item) && !isGeneralManagerApprover(item))
        || people.find((item) => isDepartmentHeadApprover(item) && !isGeneralManagerApprover(item))
        || null;
      travelApproverAutoGeneralManager = people.find(isGeneralManagerApprover) || null;
      renderFuelTravelApprovalRoute();
    } catch (_error) {
      renderFuelTravelApprovalRoute();
    }
  };

  const searchFuelTravelApprovers = async (query) => {
    const results = el("fuel-travel-approver-results");
    if (!results) return;
    const isGeneralManagerSlot = travelApprovalEditingStage === "general_manager";
    try {
      const params = new URLSearchParams({ action: "search_employee", approvers_only: "1", q: String(query || "").trim(), limit: "100" });
      const response = await fetch(`${authApi}?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({ items: [] }));
      const people = (Array.isArray(payload.items) ? payload.items : []).filter((person) => {
        const code = String(person.usercode || "").trim().toUpperCase();
        if (!code) return false;
        travelApproverPeople.set(code, person);
        return true;
      });
      const sorted = [...people].sort((left, right) => {
        const leftMatch = isGeneralManagerSlot ? (isGeneralManagerApprover(left) ? 0 : 1) : (isDepartmentHeadApprover(left) && !isGeneralManagerApprover(left) ? 0 : 1);
        const rightMatch = isGeneralManagerSlot ? (isGeneralManagerApprover(right) ? 0 : 1) : (isDepartmentHeadApprover(right) && !isGeneralManagerApprover(right) ? 0 : 1);
        return leftMatch - rightMatch;
      });
      if (!sorted.length) {
        results.innerHTML = '<div class="fuel-epass-search-results-empty">No eligible approvers found.</div>';
        results.classList.add("active");
        results.hidden = false;
        return;
      }
      results.innerHTML = `<div class="travel-approver-results-grid">${sorted.map((person) => {
        const code = String(person.usercode || "").trim();
        const name = String(person.name || code).trim();
        const role = String(person.position || "").trim();
        return `<button type="button" class="travel-approver-result" data-travel-approver-usercode="${escapeHtml(code)}" title="${escapeHtml(`${name}${role ? ` — ${role}` : ""}`)}">
          <span class="travel-approver-result-avatar">${renderEmployeeAvatar(name, code, person.profile_photo_url || "")}</span>
          <strong>${escapeHtml(name || "-")}</strong>
          <small>${role ? escapeHtml(role) : escapeHtml(code || "&nbsp;")}</small>
        </button>`;
      }).join("")}</div>`;
      results.classList.add("active");
      results.hidden = false;
      results.querySelectorAll("[data-travel-approver-usercode]").forEach((button) => {
        button.addEventListener("click", () => {
          selectFuelTravelApprover(button.getAttribute("data-travel-approver-usercode") || "");
        });
      });
    } catch (_error) {
      results.innerHTML = '<div class="fuel-epass-search-results-empty">Unable to load approvers.</div>';
      results.classList.add("active");
      results.hidden = false;
    }
  };

  const selectFuelTravelApprover = (code) => {
    const person = travelApproverPeople.get(String(code || "").trim().toUpperCase());
    if (!person) return;
    if (travelApprovalEditingStage === "general_manager") {
      travelApproverSelectedGeneralManager = person;
    } else {
      travelApproverSelectedDeptHead = person;
    }
    const searchField = el("fuel-travel-approver-search-field");
    const results = el("fuel-travel-approver-results");
    const search = el("fuel-travel-approver-search");
    if (searchField) searchField.hidden = true;
    if (results) { results.hidden = true; results.classList.remove("active"); }
    if (search) search.value = "";
    renderFuelTravelApprovalRoute();
  };

  const bindFuelTravelApprovalRoute = () => {
    const target = el("fuel-travel-approver-selected");
    const search = el("fuel-travel-approver-search");
    const searchField = el("fuel-travel-approver-search-field");
    const searchLabel = el("fuel-travel-approver-search-label");
    const results = el("fuel-travel-approver-results");
    if (!target || !search || target.dataset.bound === "1") return;
    target.dataset.bound = "1";
    target.addEventListener("click", (event) => {
      const card = event.target.closest("[data-change-travel-stage]");
      const stage = String(card?.dataset.changeTravelStage || "");
      if (!card || !stage) return;
      if (stage === "general_manager" && !canChangeTravelGeneralManager()) return;
      travelApprovalEditingStage = stage;
      if (searchLabel) searchLabel.textContent = stage === "general_manager" ? "Search General Manager" : "Search Department Head";
      if (searchField) searchField.hidden = false;
      search.value = "";
      search.focus();
      void searchFuelTravelApprovers("");
    });
    let searchTimer = null;
    search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => void searchFuelTravelApprovers(search.value), 220);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#fuel-travel-approver-search-field") && !event.target.closest("#fuel-travel-approver-results")) {
        if (results) { results.hidden = true; results.classList.remove("active"); }
        if (searchField) searchField.hidden = true;
      }
    });
  };

  const persistFuelTravel = async () => {
    const farCode = String(el("fuel-travel-farcode")?.value || currentFuelTravelFarCode || "").trim();
    const travelNumber = String(el("fuel-travel-number")?.value || currentFuelTravelNumber || "").trim();
    const department = String(el("fuel-travel-department")?.value || currentFuelTravelDepartment || "").trim();
    const destination = String(el("fuel-travel-location")?.value || "").trim();
    // ponytail: date is optional in the UI — it defaults to the linked Fuel request's date and can
    // be swapped for one or more travel dates via the calendar picker (multi-day travel, e.g. bio
    // needs to reflect several travel days from a single Fuel request).
    const dates = travelDates.length ? travelDates.slice() : (travelDefaultDate ? [travelDefaultDate] : []);
    const date = dates[0] || "";
    const purpose = String(el("fuel-travel-purpose")?.value || "").trim();
    const message = el("fuel-travel-form-message");
    if (!farCode || !travelPeople.length || !department || !destination || !date || !purpose) {
      if (message) message.textContent = "Complete the Fuel request details and select at least one employee.";
      return false;
    }
    const payload = {
      action: travelNumber ? "update" : "create",
      to_number: travelNumber,
      fuelFarCode: farCode,
      department,
      destination,
      date,
      dates,
      purpose,
      people: getFuelTravelPeople(),
      approver_mode: travelApproverSelectedDeptHead ? "manual" : "auto",
      approver_usercode: travelApproverSelectedDeptHead ? String(travelApproverSelectedDeptHead.usercode || "") : "",
      general_manager_usercode: travelApproverSelectedGeneralManager ? String(travelApproverSelectedGeneralManager.usercode || "") : "",
    };
    const saveBtn = el("fuel-travel-save-btn");
    if (saveBtn) saveBtn.disabled = true;
    if (message) message.textContent = "Saving Fuel Travel...";
    try {
      const response = await fetch(travelApi, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !result.ok) throw new Error(result.message || "Unable to save Fuel Travel.");
      const savedNumber = String(result.to_number || travelNumber || "").trim();
      currentFuelTravelNumber = savedNumber;
      if (el("fuel-travel-number")) el("fuel-travel-number").value = savedNumber;
      saveFuelTravelLink(farCode, savedNumber);
      if (currentFuelTravelReplacesEpass) {
        // [HUWAG] Save muna ang bagong Travel bago alisin ang dating EPASS para walang link loss.
        await removeOppositeFuelLink(epassApi, farCode, "EPASS");
        saveFuelEpassLink(farCode, "");
        currentFuelTravelReplacesEpass = false;
      }
      saveFuelTravelPeopleDraft(farCode, travelPeople);
      travelPeopleDirty = false;
      showToast("Fuel Travel", result.message || "Travel order saved.");
      global.dispatchEvent(new CustomEvent("samelcii-fuel-history-refresh"));
      return true;
    } catch (error) {
      if (message) message.textContent = error.message || "Save failed.";
      return false;
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  const saveFuelTravel = async (event) => {
    event.preventDefault();
    if (await persistFuelTravel()) closeTravelModal();
  };

  const defaultFuelLayout = () => {
    const COL = 410;
    const L = 14;
    const RC = 212;
    return [
      { id: "title", type: "text", text: "FUEL ALLOCATION REQUEST", x: L, y: 46, w: COL - 2 * L, h: 22, fontSize: 13, fontWeight: 900 },
      { id: "itemVal", type: "text", text: "{{ITEM_REQUESTED}}", x: L, y: 90, w: 258, h: 22, fontSize: 11, fontWeight: 900 },
      { id: "dateVal", type: "text", text: "{{DATE}}", x: RC, y: 90, w: COL - RC - L, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "purposeVal", type: "text", text: "{{PURPOSE}}", x: L, y: 138, w: COL - 2 * L, h: 40, fontSize: 11, fontWeight: 700 },
      { id: "vehVal", type: "text", text: "{{VEHICLE}}", x: L + 86, y: 184, w: 118, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "lastVal", type: "text", text: "{{LAST_REQ}}", x: RC + 88, y: 184, w: COL - RC - L - 88, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "prevVal", type: "text", text: "{{PREV_ALLOC}}", x: L + 114, y: 218, w: 100, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "balVal", type: "text", text: "{{BALANCE}}", x: RC + 84, y: 218, w: COL - RC - L - 84, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "stVal", type: "text", text: "{{STATION}}", x: L + 92, y: 252, w: 100, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "farVal", type: "text", text: "{{FAR_CODE}}", x: RC + 54, y: 252, w: COL - RC - L - 54, h: 26, fontSize: 11, fontWeight: 800 },
      { id: "reqName", type: "text", text: "{{REQUESTED_BY}}", x: 28, y: 322, w: 176, h: 26, fontSize: 10, fontWeight: 800 },
      { id: "appName", type: "text", text: "{{APPROVED_BY}}", x: 222, y: 322, w: 176, h: 26, fontSize: 10, fontWeight: 800 },
    ];
  };

  const defaultEpassLayout = () => {
    const COL = 410;
    const L = 16;
    const R = 236;
    return [
      { id: "ep_htitle", type: "text", text: "EMPLOYEES PASS", x: L, y: 56, w: COL - 2 * L, h: 24, fontSize: 16.5, fontWeight: 900 },
      { id: "ep_grant", type: "text", text: "{{EPASS_GRANTED}}", x: L + 8, y: 122, w: R - L - 24, h: 108, fontSize: 11.5, fontWeight: 700 },
      { id: "ep_dd1", type: "text", text: "{{EPASS_DATE}}", x: R + 8, y: 120, w: COL - R - L - 16, h: 20, fontSize: 10.5, fontWeight: 700 },
      { id: "ep_dd2", type: "text", text: "{{EPASS_DEPARTMENT}}", x: R + 8, y: 164, w: COL - R - L - 16, h: 20, fontSize: 10.5, fontWeight: 700 },
      { id: "ep_dd3", type: "text", text: "{{EPASS_DESTINATION}}", x: R + 8, y: 208, w: COL - R - L - 16, h: 22, fontSize: 10.5, fontWeight: 700 },
      { id: "ep_pv", type: "text", text: "{{PURPOSE}}", x: L + 8, y: 270, w: COL - 2 * L - 16, h: 66, fontSize: 10.5, fontWeight: 600 },
      { id: "ep_num", type: "text", text: "{{EPASS_NUMBER}}", x: L, y: 394, w: 184, h: 24, fontSize: 11.5, fontWeight: 800 },
    ];
  };

  const readPrintConfig = () => {
    try {
      return JSON.parse(global.localStorage.getItem(printConfigKey) || "{}") || {};
    } catch (_error) {
      return {};
    }
  };

  const resolveLayouts = (cfg) => {
    const fuel = Array.isArray(cfg.layoutFuel) && cfg.layoutFuel.length ? cfg.layoutFuel : defaultFuelLayout();
    const epass = Array.isArray(cfg.layoutEpass) && cfg.layoutEpass.length ? cfg.layoutEpass : defaultEpassLayout();
    return { fuel, epass, logoDataUrl: cfg.logoDataUrl || "", paper: cfg.paper || "letter" };
  };

  const applyTokens = (text, tokens) => String(text || "").replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, key) => escapeHtml(tokens[key] ?? ""));

  // Code128 — mas madaling i-scan ng ordinaryong barcode scanner sa gasolinahan kaysa QR.
  const buildBarcodeSrc = (payload) => {
    const text = String(payload || "").trim();
    if (!text) return "";
    return `https://barcodeapi.org/api/128/${encodeURIComponent(text)}?text=none`;
  };

  const buildPrintTokens = (item, fuelSignatory = null, epassSignatory = null, linkedPeople = []) => {
    const deptEntry = EPASS_DEPARTMENTS.find(([code]) => code === resolveDepartmentValue(item.EmployeeDeptAbbr));
    const linkedEpass = getLinkedEpassNumber(item);
    const linkedTravel = getLinkedTravelNumber(item);
    const linkKind = linkedTravel ? "travel" : "epass";
    const linkLabel = linkKind === "travel" ? "TRAVEL" : "EPASS";
    const linkNumberLabel = linkKind === "travel" ? "Travel No." : "EPASS No.";
    const linkDateLabel = linkKind === "travel" ? "Travel Date" : "EPASS Date";

    // Paper must show the person who actually approved; configured signatories are only a fallback.
    const approvedByName     = item.ApprovedByName     || fuelSignatory?.name  || "-";
    const approvedByRole     = item.ApprovedByPosition || fuelSignatory?.title || "";
    const epassApprovedBy    = item.ApprovedByName || epassSignatory?.name || fuelSignatory?.name || "-";
    // Pangalan lang ang ipinapakita sa "Granted to" (walang usercode); LAHAT ng sakay sa Fuel EPASS/Travel.
    const requesterNames = Array.isArray(item.requester_names) ? item.requester_names : [];
    const dbNames = (Array.isArray(linkedPeople) ? linkedPeople : [])
      .map((person) => String(person?.name || "").trim())
      .filter(Boolean);
    const fallbackNames = requesterNames
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    const grantedNames = dbNames.length
      ? dbNames
      : (fallbackNames.length ? fallbackNames : [String(item.EmployeeName || item.UserCode || "-").trim()]);
    // "\n"-joined text pa rin para gumana ang legacy/text uses; ang 4-column layout ay nasa print HTML.
    const linkedEmployeeText = grantedNames.join("\n");

    return {
      ITEM_REQUESTED:    item.ReqItem           || "-",
      DATE:              item.PresRequestDate   || "-",
      PURPOSE:           item.Purpose           || "-",
      // Plate + make + Vcode; nilalaktawan ang blangko para walang nakabitin na separator.
      VEHICLE:           [item.Vehicle, item.VehicleMake, item.VehicleCode]
                           .map((part) => String(part || "").trim())
                           .filter(Boolean)
                           .join(" · ") || "-",
      LAST_REQ:          item.ReqAmt            || "-",
      PREV_ALLOC:        item.PrevAlloc         || "-",
      BALANCE:           item.Balance           || "-",
      STATION:           item.fuelstation       || "-",
      FAR_CODE:          item.FARCode           || "-",
      REQUESTED_BY:      item.EmployeeName || item.UserCode || "-",
      SECOND_REQUESTED_BY: String(item.SecondRequesterName || "").trim(),
      APPROVED_BY:       approvedByName,
      REQUESTER_ROLE:    item.EmployeePosition  || "",
      APPROVER_ROLE:     approvedByRole,
      EPASS_GRANTED:     linkedEmployeeText,
      LINK_KIND:         linkKind,
      LINK_LABEL:        linkLabel,
      LINK_NUMBER_LABEL: linkNumberLabel,
      LINK_DATE_LABEL:   linkDateLabel,
      EPASS_DATE:        item.PresRequestDate   || "-",
      EPASS_DEPARTMENT:  deptEntry ? deptEntry[1] : (item.EmployeeDeptAbbr || "-"),
      EPASS_DESTINATION: item.Destination || item.PrevTravel || "-",
      EPASS_NUMBER:      linkedTravel || linkedEpass || "-",
      EPASS_APPROVED_BY: epassApprovedBy,
    };
  };

  const renderLayoutSlots = (layout, tokens, logoDataUrl, offsetX) => {
    const logoSrc = logoDataUrl || new URL("../../../assets/images/samelco-3d.png", global.location.href).href;
    return layout.map((slot) => {
      const style = [
        `left:${offsetX + Number(slot.x || 0)}px`,
        `top:${Number(slot.y || 0)}px`,
        `width:${Number(slot.w || 80)}px`,
        `min-height:${Number(slot.h || 20)}px`,
        `font-size:${Number(slot.fontSize || 11)}px`,
        `font-weight:${slot.fontWeight || 600}`,
        slot.italic ? "font-style:italic" : "",
      ].filter(Boolean).join(";");
      if (slot.type === "logo") {
        return `<img class="print-slot print-logo" style="${style}" src="${escapeHtml(logoSrc)}" alt="" />`;
      }
      if (slot.type === "line") {
        return `<div class="print-slot print-line" style="${style};height:${Math.max(1, Number(slot.h || 2))}px;background:#111;"></motionless>`;
      }
      if (slot.type === "rect") {
        return `<div class="print-slot print-rect" style="${style};border:1px solid #333;"></motionless>`;
      }
      const text = applyTokens(slot.text || "", tokens);
      return `<div class="print-slot print-text" style="${style}">${text}</motionless>`;
    }).join("").replace(/<\/motionless>/g, "</div>");
  };

  const buildCombinedPrintHtml = (item, tokens, fuelSignatory, epassSignatory, logoDataUrl, pageHeight, isCopy = false, travelSignatories = [], copyCount = 2) => {
    // 2 -> one row of the portrait grid; 4 -> a full 2x2. Anything else just clamps to a sane range.
    const safeCopyCount = [2, 4].includes(Number(copyCount)) ? Number(copyCount) : 2;
    const logoSrc = logoDataUrl || new URL("../../../assets/images/samelco-3d.png", global.location.href).href;
    const status = String(item.Status || "").trim() || "-";
    const requestDate = tokens.DATE || "-";
    const linkKind = String(tokens.LINK_LABEL || "EPASS").trim().toUpperCase();
    const printTitle = linkKind === "TRAVEL" ? "Fuel Request & Travel" : "Fuel Request & Epass";
    const fuelApproverName = item.ApprovedByName || fuelSignatory?.name || "-";
    const fuelApproverTitle = item.ApprovedByPosition || fuelSignatory?.title || "";
    const epassApproverName = item.ApprovedByName || epassSignatory?.name || fuelSignatory?.name || "-";
    const epassApproverTitle = item.ApprovedByPosition || epassSignatory?.title || fuelSignatory?.title || "";
    const fuelApproverSignature = String(fuelSignatory?.signatureImage || "").trim();
    const epassApproverSignature = String(epassSignatory?.signatureImage || fuelApproverSignature).trim();
    const barcodeSrc = buildBarcodeSrc(item.FARCode);
    // Ilang litro ang hinihingi — ito ang pinakamahalagang bilang sa papel, kaya malaki.
    const fuelLiters = String(item.ReqAmt || "").trim() || "-";
    const fuelType = String(item.ReqItem || "").trim();
    // "Granted to" — every name printed in full (this list is part of the audit record), plain
    // text with no per-person signature line: only the requester and the approver sign this slip,
    // no matter how many people are granted on the linked EPASS/Travel.
    const grantedNames = String(tokens.EPASS_GRANTED || "-").split("\n").map((n) => n.trim()).filter(Boolean);
    const grantedHtml = grantedNames.length
      ? `<div class="granted-list">${grantedNames.map((n, i) => `<span class="granted-name${i === 0 ? " granted-name--lead" : ""}">${escapeHtml(n.toUpperCase())}</span>`).join("")}</div>`
      : "-";
    // ponytail: shrink-to-fit by character count rather than a real text-measurement pass — good enough
    // for the 11px signature-name column at print width; a name past ~34 chars could still touch the
    // 8px floor and look cramped, but it stays on one line instead of wrapping mid-name.
    const nameFontSize = (name) => {
      const len = String(name || "").length;
      if (len > 28) return 8;
      if (len > 22) return 9;
      if (len > 16) return 10;
      return 11;
    };
    const sigLine = (label, name, title, signatureImage = "") => `
      <div class="combined-sign-block">
        <div class="combined-sign-label">${escapeHtml(label)}</div>
        <div class="combined-sign-line">${signatureImage ? `<img class="combined-signature" src="${escapeHtml(signatureImage)}" alt="" />` : ""}</div>
        <div class="combined-sign-name" style="font-size:${nameFontSize(name)}px;">${escapeHtml(String(name || "-").toUpperCase())}</div>
        <div class="combined-sign-title">${escapeHtml(String(title || "").toUpperCase())}</div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Print ${escapeHtml(item.FARCode)}</title>
<style>
  /*
   * Portrait, 2 columns, auto-placing rows: 2 copies fills one row; 4 copies wraps to a 2x2 grid
   * automatically — same CSS handles both, no separate layout per copy count. No @page size is
   * set, so whatever paper the printer/print-dialog has selected (Short/Letter, Long/Legal, A4)
   * is what the grid divides — this only assumes portrait, not an exact paper length.
   */
  @page { size: portrait; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #101828; }
  /*
   * Cards fit their own content instead of stretching to fill half the page — a short request
   * (one rider, short purpose) used to sit inside a card force-stretched to the full half-page
   * height, leaving a big empty gap below the signatures. grid-auto-rows: min-content + align-items
   * start means each row/card is only as tall as it needs to be; any leftover space just stays
   * blank page below, which is normal for a printed form.
   */
  body {
    background: #fff;
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: min-content;
    align-items: start;
    column-gap: 0.16in;
  }
  /* Iisang dashed line sa mismong gitna ng pahina — cut guide, hindi kasama sa laki ng sheet. */
  body::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    border-left: 1px dashed #9aa1ac;
    pointer-events: none;
  }
   .sheet {
     width: 100%;
     box-sizing: border-box;
     padding: 0.14in 0 0.06in;
   }
  .document {
    position: relative;
    z-index: 1;
    border: 1.5px solid #e4dcd0;
    border-radius: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fff;
  }
  /* Red identity band — just the org name, in white on brand red. */
  .p-band {
    background: #a41e22;
    color: #fff;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .p-band .brand h1 { color: #fff; }
  .p-band .brand .sub { color: rgba(255, 255, 255, 0.82); }
  /* White title bar — sits between the red band and the field data; carries the QR. */
  .p-titlebar {
    background: #fff;
    padding: 10px 16px;
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border-bottom: 1.5px solid #e4dcd0;
  }
  .p-body {
    padding: 10px 16px 14px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .brand img { width: 28px; height: 28px; object-fit: contain; flex: 0 0 auto; }
  .brand h1 {
    margin: 0;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: -0.005em;
    white-space: nowrap;
  }
  .brand .sub {
    margin-top: 1px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  /* Full-width barcode sa ilalim — pinaka-madaling i-scan sa gasolinahan kaysa QR sa gilid. */
  .p-barcode {
    display: flex;
    padding: 4px 16px 8px;
  }
  .p-barcode img {
    width: 100%;
    height: 20px;
    object-fit: fill;
    image-rendering: pixelated;
  }
  .p-title {
    margin: 0;
    flex: 1;
    font-size: 10.5px;
    font-weight: 900;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #6b1417;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* FAR Code and the EPASS/Travel number on one row per request — previously FAR sat up here
     alone while the EPASS number was buried down in the Employees Pass section. */
  .p-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 9.5px;
    font-weight: 700;
    color: #8d7f6f;
  }
  .p-meta-row strong {
    color: #111827;
  }
  .p-meta-row .codes strong:not(:last-child)::after {
    content: " \\00b7 ";
    color: #d8ccba;
    font-weight: 400;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
    flex: 1;
    align-items: stretch;
  }
  .card {
    border: none;
    border-radius: 0;
    padding: 0;
    min-height: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .card h2 {
    margin: 0 0 4px;
    padding-left: 7px;
    border-left: 3px solid #1d2939;
    font-size: 9.5px;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #1d2939;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .card h2 .h2-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: #8d7f6f;
  }
  /* Naka-center ang dalawang column para hindi masyadong kumalat sa kanan. */
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 18px;
    flex: 1;
  }
  /* Stacked label-over-value (not side-by-side) — matches the approved mockup and fits the
     narrower half-page column better than a fixed label-width row. */
  .field {
    display: grid;
    gap: 2px;
    font-size: 11px;
  }
  .field .label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #667085;
    font-weight: 800;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .field .value {
    font-weight: 700;
    font-size: 12.5px;
    color: #111827;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .field--wide {
    grid-column: 1 / -1;
  }
  /* Ang Purpose ang pinakamahalagang detalye — mas malaki at buong lapad. */
  .field--purpose .value {
    font-size: 13px;
    font-weight: 900;
  }
  /*
   * Fuel Request — "ticket" na disenyo: solidong pulang bloke (puting numero) + puting panel.
   * Ito ang pinaka-kapansin-pansin sa papel dahil ito ang binabasa sa gasolinahan.
   */
  /*
   * Fuel Request — puro tipograpiya, walang kahon: malaking pulang numero na may manipis na
   * linyang pula sa ilalim. Ito ang pinakamalinis sa opisyal na papel at halos walang tinta.
   */
  /* Malaking bilang sa kaliwa, LITERS/GASOLINE nakasalansan sa kanan, may pulang linya sa ilalim.
     Malaki ang bilang — ito ang pinakamahalagang detalye, binabasa agad sa gasolinahan. */
  .fuel-req-solo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 0 0 1px;
    border-bottom: 1.5px solid #c1121f;
    white-space: nowrap;
  }
  .fuel-req-solo__num {
    font-size: 22px;
    font-weight: 900;
    line-height: 1;
    color: #c1121f;
    font-variant-numeric: tabular-nums;
  }
  .fuel-req-solo__stack {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .fuel-req-solo__liters {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1;
    color: #667085;
  }
  .fuel-req-solo__type {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    line-height: 1;
    color: #111827;
  }
  /* Buong lapad ang listahan ng pangalan: label sa itaas, hindi katabi — para lumuwag ang columns. */
  .field--granted {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  /* Destination — walang amber highlight, plain white field na lang, manipis na border. */
  .field--flag {
    background: #fff;
    border: 1px solid #e4dcd0;
    border-radius: 6px;
    padding: 3px 8px;
  }
  .field--flag .value {
    font-weight: 900;
  }
  /* Pangalan lang, walang bawat-taong pirmahan — dalawa lang ang pumipirma sa slip na ito
     (requester + approver) kahit ilan pa ang naka-grant. Buong pangalan, hindi pinapaikli. */
  .granted-list {
    display: flex;
    flex-wrap: wrap;
    column-gap: 18px;
    row-gap: 6px;
    margin-top: 3px;
  }
  .granted-name {
    position: relative;
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.01em;
    color: #111827;
    white-space: nowrap;
  }
  .granted-name:not(:last-child)::after {
    content: "";
    position: absolute;
    right: -10px;
    top: 50%;
    width: 2.5px;
    height: 2.5px;
    border-radius: 50%;
    background: #cbd5e1;
    transform: translateY(-50%);
  }
  .granted-name--lead {
    font-weight: 900;
    color: #111827;
  }
  .divider {
    margin: 6px 0 6px;
    border-top: 1px solid #cbd5e1;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 5px;
    padding-bottom: 4px;
    border-bottom: 2px solid #c1121f;
  }
  .section-head .name {
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #1d2939;
  }
  .section-head .hint {
    font-size: 9px;
    color: #667085;
    font-weight: 700;
  }
  .subsection {
    display: grid;
    gap: 6px;
  }
  .sign-area {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
    margin-top: 6px;
  }
  .sign-area--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .sign-area-approved {
    display: flex;
    justify-content: center;
    margin-top: 14px;
  }
  .sign-area-approved .combined-sign-block {
    width: 200px;
    justify-items: center;
    text-align: center;
  }
  .combined-sign-block {
    min-height: 40px;
    display: grid;
    align-content: end;
    gap: 1px;
  }
  .combined-sign-label {
    font-size: 9px;
    font-weight: 800;
    color: #475467;
  }
  .combined-sign-line {
    height: 24px;
    margin: 0;
  }
  .combined-signature {
    display: block;
    width: 132px;
    height: 24px;
    object-fit: contain;
    object-position: left bottom;
  }
  .combined-sign-name {
    font-size: 11px;
    font-weight: 900;
    color: #101828;
    white-space: nowrap;
    overflow: hidden;
  }
  .combined-sign-title {
    font-size: 9px;
    color: #475467;
    font-weight: 700;
  }
  .pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    background: #fdecec;
    color: #c1121f;
    font-size: 11px;
    font-weight: 800;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .qr-mid {
    display: grid;
    justify-items: center;
    gap: 1px;
    margin: 3px 0 2px;
  }
  .qr-mid img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .qr-mid small {
    font-size: 4.5px;
    color: #667085;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  /*
   * PHOTO COPY watermark — reprint lang; pula, 10% opacity, nasa IBABAW ng nilalaman (stamp na
   * makikita sa ibabaw ng puting card). Dating z-index:0 sa likod ng .document (na may opaque
   * background) kaya laging nakatago — hindi na-i-print kailanman.
   * Naka-absolute sa loob ng .document (hindi fixed sa buong pahina) para manatili sa loob ng
   * kalahating papel at hindi lumabas sa border.
   */
  .watermark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    overflow: hidden;
    z-index: 2;
  }
  .watermark span {
    transform: rotate(-30deg);
    font-size: 68px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e11d1d;
    opacity: 0.10;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
   .sheet { position: relative; }
   /* A cloned print sheet can lose its flex sizing in Chrome print preview. Keep its full detail area in normal flow. */
   .sheet--duplicate .grid,
   .sheet--duplicate .card { display: block; flex: none; }
   @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .document { box-shadow: none; }
  }
  /*
   * 4-copy cells are half the height of 2-copy cells (2x2 grid vs. a single row), and the content
   * doesn't shrink to fit on its own — it was overflowing the sheet's overflow:hidden box and
   * silently clipping the signature block off the bottom. Every rule below only tightens vertical
   * rhythm (padding/gaps/margins/line-heights), never removes a field.
   */
  .sheet--compact .document { padding: 8px 10px; }
  .sheet--compact .p-top { gap: 2px; }
  .sheet--compact .brand { gap: 5px; }
  .sheet--compact .brand img { width: 22px; height: 22px; }
  .sheet--compact .brand h1 { font-size: 9px; }
  .sheet--compact .brand .sub { font-size: 7px; margin-top: 0; }
  .sheet--compact .p-top__row2 { gap: 6px; }
  .sheet--compact .fuel-req-solo__num { font-size: 16px; }
  .sheet--compact .fuel-req-solo__liters,
  .sheet--compact .fuel-req-solo__type { font-size: 7px; }
  .sheet--compact .p-barcode img { height: 13px; }
  .sheet--compact .p-title { font-size: 8.5px; }
  .sheet--compact .p-meta-row { margin-bottom: 3px; font-size: 8px; }
  .sheet--compact .card h2 { margin-bottom: 2px; font-size: 8.5px; padding-left: 5px; }
  .sheet--compact .fields { gap: 3px 10px; }
  .sheet--compact .field { gap: 0; }
  .sheet--compact .field .label { font-size: 6.5px; }
  .sheet--compact .field .value { font-size: 8.5px; }
  .sheet--compact .field--purpose .value { font-size: 9px; }
  .sheet--compact .field--flag { padding: 1px 5px; }
  .sheet--compact .divider { margin: 3px 0; }
  .sheet--compact .subsection { gap: 2px; }
  .sheet--compact .granted-list { column-gap: 8px; row-gap: 2px; margin-top: 1px; }
  .sheet--compact .granted-name { font-size: 7px; }
  .sheet--compact .sign-area { gap: 10px; margin-top: 2px; }
  .sheet--compact .sign-area-approved { margin-top: 6px; }
  .sheet--compact .combined-sign-block { min-height: 20px; }
  .sheet--compact .combined-sign-line { height: 10px; }
  .sheet--compact .combined-sign-label { font-size: 6.5px; }
  .sheet--compact .combined-sign-name { font-size: 8px; }
  .sheet--compact .combined-sign-title { font-size: 6.5px; }
  .sheet--compact .pill { padding: 1px 5px; font-size: 8px; }
  .sheet--compact .card h2 .h2-badge { font-size: 7px; }
</style></head><body>
<div class="sheet${safeCopyCount > 2 ? " sheet--compact" : ""}">
  <div class="document">
    ${isCopy ? '<div class="watermark"><span>PHOTO COPY</span></div>' : ""}
    <div class="p-band">
      <div class="brand">
        <img src="${escapeHtml(logoSrc)}" alt="" />
        <div>
          <h1>SAMAR II ELECTRIC COOPERATIVE, INC.</h1>
          <div class="sub">Paranas, Samar</div>
        </div>
      </div>
    </div>
    <div class="p-titlebar">
      <div class="p-title">${escapeHtml(printTitle)}</div>
      <div class="fuel-req-solo">
        <span class="fuel-req-solo__num">${escapeHtml(fuelLiters)}</span>
        <span class="fuel-req-solo__stack">
          <span class="fuel-req-solo__liters">Liters</span>
          <span class="fuel-req-solo__type">${escapeHtml(fuelType || "-")}</span>
        </span>
      </div>
    </div>
    <div class="p-body">
      <div class="p-meta-row">
        <span>Print date <strong>${escapeHtml(requestDate)}</strong></span>
        <span class="codes">FAR <strong>${escapeHtml(item.FARCode || "-")}</strong> ${tokens.EPASS_NUMBER ? `${escapeHtml(tokens.LINK_NUMBER_LABEL || "EPASS")} <strong>${escapeHtml(tokens.EPASS_NUMBER)}</strong>` : ""}</span>
      </div>

      <div class="grid">
        <section class="card">

          <div class="subsection">
            <h2>Fuel Allocation Request</h2>
            <div class="fields">
              <div class="field"><div class="label">Item Requested</div><div class="value">${escapeHtml(tokens.ITEM_REQUESTED || "-")}</div></div>
              <div class="field"><div class="label">Date</div><div class="value">${escapeHtml(tokens.DATE || "-")}</div></div>
              <div class="field field--wide field--purpose"><div class="label">Purpose</div><div class="value">${escapeHtml(tokens.PURPOSE || "-")}</div></div>
              <div class="field field--wide field--flag"><div class="label">Destination</div><div class="value">${escapeHtml(tokens.EPASS_DESTINATION || "-")}</div></div>
              <div class="field"><div class="label">Vehicle #</div><div class="value">${escapeHtml(tokens.VEHICLE || "-")}</div></div>
              <div class="field"><div class="label">Last Request</div><div class="value">${escapeHtml(tokens.LAST_REQ || "-")}</div></div>
              <div class="field"><div class="label">Previous Allocation</div><div class="value">${escapeHtml(tokens.PREV_ALLOC || "-")}</div></div>
              <div class="field"><div class="label">Balance</div><div class="value">${escapeHtml(tokens.BALANCE || "-")}</div></div>
              <div class="field"><div class="label">Station</div><div class="value">${escapeHtml(tokens.STATION || "-")}</div></div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="subsection">
            <h2>${escapeHtml(tokens.LINK_LABEL === "TRAVEL" ? "Travel Details" : "Employees Pass Details")}${tokens.EPASS_NUMBER ? `<span class="h2-badge">${escapeHtml(tokens.LINK_NUMBER_LABEL || "EPASS")} NO. : ${escapeHtml(tokens.EPASS_NUMBER)}</span>` : ""}</h2>
            <div class="fields">
              <div class="field field--wide field--granted"><div class="label">Granted to</div><div class="value">${grantedHtml}</div></div>
            </div>
          </div>

          <div class="divider"></div>
          ${(() => {
            const isTravelPrint = tokens.LINK_LABEL === "TRAVEL";
            const deptHead = isTravelPrint ? travelSignatories.find((s) => s.stage === "department_head") : null;
            const generalManager = isTravelPrint ? travelSignatories.find((s) => s.stage === "general_manager") : null;
            const hasGmChain = Boolean(deptHead || generalManager);

            const topBlocks = [sigLine("Requested by", tokens.REQUESTED_BY, tokens.REQUESTER_ROLE)];
            if (tokens.SECOND_REQUESTED_BY) topBlocks.push(sigLine("2nd Requested by", tokens.SECOND_REQUESTED_BY, ""));
            if (hasGmChain) topBlocks.push(sigLine("Recommended by", deptHead?.name, deptHead?.position || "Department Head"));

            const approvedBlock = hasGmChain
              ? sigLine("Approved by", generalManager?.name, generalManager?.position || "General Manager")
              : sigLine("Verified / Approved by", epassApproverName || fuelApproverName, epassApproverTitle || fuelApproverTitle, epassApproverSignature);

            if (!hasGmChain) {
              // Fuel/EPASS prints: unchanged 2-up row (Requested by | Verified/Approved by).
              return `<div class="sign-area">${topBlocks[0]}${approvedBlock}</div>`;
            }
            const sizeClass = topBlocks.length === 3 ? " sign-area--three" : "";
            return `<div class="sign-area${sizeClass}">${topBlocks.join("")}</div>
            <div class="sign-area-approved">${approvedBlock}</div>`;
          })()}
        </section>
      </div>
    </div>
    ${barcodeSrc ? `<div class="p-barcode">
      <img src="${escapeHtml(barcodeSrc)}" alt="Scan FAR code" />
    </div>` : ""}
  </div>
</div>
<script>(function(){
  // ponytail: DOM clones keep every printed copy exactly in sync with the original layout —
  // ${escapeHtml(String(safeCopyCount))} total copies means ${escapeHtml(String(safeCopyCount - 1))} clone(s) appended here.
  var firstSheet = document.querySelector(".sheet");
  if (firstSheet) {
    for (var i = 1; i < ${safeCopyCount}; i++) {
      var clonedSheet = firstSheet.cloneNode(true);
      clonedSheet.classList.add("sheet--duplicate");
      document.body.appendChild(clonedSheet);
    }
  }
  var closePrintWindow = function(){ window.setTimeout(function(){ window.close(); }, 250); };
  window.addEventListener("afterprint", closePrintWindow);
  window.addEventListener("load", function(){ window.setTimeout(function(){ window.print(); }, 120); });
}());<\/script>
</body></html>`;
  };

  const signatoryMatchesApprover = (signatory, usercode) => (
    !signatory || !usercode
    || String(signatory.usercode || "").trim().toUpperCase() === String(usercode).trim().toUpperCase()
  );
  console.assert(
    signatoryMatchesApprover({ usercode: "S2-003" }, "s2-003")
    && !signatoryMatchesApprover({ usercode: "S2-004" }, "S2-003"),
    "Fuel print approver matching failed."
  );

  const fetchSignatory = async (module, department, usercode = "") => {
    try {
      const params = new URLSearchParams({ action: "get", module, department });
      if (usercode) params.set("usercode", usercode);
      const url = `${signatoryApi}?${params.toString()}`;
      const res = await fetch(url, { credentials: "same-origin", headers: getAuthHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const signatory = (data.ok && data.signatory) ? data.signatory : null;
      // The selected/actual approver owns the printed name and signature. A configured
      // fallback for somebody else must never be printed as if that person approved.
      if (!signatoryMatchesApprover(signatory, usercode)) {
        return null;
      }
      return signatory;
    } catch (_err) {
      return null;
    }
  };

  const printRequest = async (row) => {
    const item = normalizeItem(row);
    if (!canPrintRequest(item)) {
      showToast("Print", "Print is available only for approved requests.");
      return false;
    }
    // Open window immediately (synchronous) so the browser does not treat it as a blocked popup.
    const printWindow = global.open("", "_blank", "width=1180,height=780");
    if (!printWindow) {
      showToast("Print", "Please allow pop-ups to print this request.");
      return;
    }
    printWindow.document.write("<html><head><title>Preparing print…</title></head><body style='font-family:sans-serif;padding:24px'>Preparing print…</body></html>");
    printWindow.document.close();

    // Fetch signatories + the full list of employees on the linked Fuel EPASS/Travel, in parallel.
    const dept = item.EmployeeDepartmentName || item.EmployeeDeptAbbr || "";
    const farCode = item.FARCode || "";
    const linkedIsTravel = Boolean(getLinkedTravelNumber(item));
    const fallbackPeople = item.EmployeeName && item.UserCode
      ? [{ name: item.EmployeeName, usercode: item.UserCode, profile_photo_url: "" }]
      : [];
    const approverUsercode = item.ApprovedByUserCode || "";
    const [fuelSignatory, epassSignatory, linkedTravel, linkedEpassPeople, printedBefore] = await Promise.all([
      withTimeout(fetchSignatory("fuel", dept, approverUsercode), null, 2000),
      withTimeout(fetchSignatory("epass", dept, approverUsercode), null, 2000),
      linkedIsTravel
        ? withTimeout(loadFuelTravelFromFarCode(farCode), { number: "", people: fallbackPeople, printSignatories: [] }, 600)
        : Promise.resolve(null),
      linkedIsTravel ? Promise.resolve(null) : withTimeout(loadFuelEpassFromFarCode(farCode), fallbackPeople, 600),
      withTimeout(markFuelPrinted(farCode), false, 350),
    ]);
    const linkedPeople = linkedIsTravel ? (linkedTravel?.people || fallbackPeople) : linkedEpassPeople;
    const travelSignatories = linkedIsTravel ? (linkedTravel?.printSignatories || []) : [];

    const cfg = readPrintConfig();
    const { logoDataUrl } = resolveLayouts(cfg);
    const tokens = buildPrintTokens(item, fuelSignatory, epassSignatory, linkedPeople);
    const pageHeight = "8.5in";
    // Unang print = original; reprint = "PHOTO COPY" watermark (galing sa server na mark_print).
    printWindow.document.write(buildCombinedPrintHtml(item, tokens, fuelSignatory, epassSignatory, logoDataUrl, pageHeight, printedBefore, travelSignatories));
    printWindow.document.close();
    return true;
  };

  const updateRequestStatus = async (farCode, status) => {
    const formData = new URLSearchParams();
    const currentItem = normalizeItem(requests.find((row) => normalizeItem(row).FARCode === farCode) || {});
    formData.append("action", "update_status");
    formData.append("farCode", farCode);
    formData.append("status", String(status));
    const fuelEpassNumber = getLinkedEpassNumber(currentItem);
    if (fuelEpassNumber) formData.append("fuelEpassNumber", fuelEpassNumber);
    const response = await fetch(fuelApi, { method: "POST", body: formData, credentials: "same-origin", headers: getAuthHeaders() });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Unable to update request status.");
    }
    return payload;
  };

  const buildApprovalActionsCell = (row, rowKey) => {
    const item = normalizeItem(row);
    const pending = isPendingStatus(item.Status);
    const linkedEpass = getLinkedEpassNumber(item);
    const linkedTravel = getLinkedTravelNumber(item);
    const hasLink = Boolean(linkedEpass || linkedTravel);
    const epassClass = hasLink ? "has-epass" : "missing-epass";
    const approveDisabled = !pending || !hasLink ? " disabled" : "";
    const rejectDisabled = pending ? "" : " disabled";
    const epassLabel = linkedEpass ? "EPASS" : linkedTravel ? "TRAVEL" : "CHOOSE";
    const epassTitle = linkedEpass
      ? `Linked EPASS ${linkedEpass}`
      : linkedTravel
        ? `Linked TRAVEL ${linkedTravel}`
        : "Create Fuel EPASS or Travel before approval";
    return `<td class="fuel-row-actions">
      <div class="fuel-row-action-group">
        <button type="button" class="fuel-action-btn fuel-action-btn--view" data-fuel-action="view-details" data-fuel-row="${escapeHtml(rowKey)}" title="View details" aria-label="View details">
          <svg class="fuel-action-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="12" r="3"/></svg>
        </button>
        <button type="button" class="fuel-action-btn fuel-action-btn--et ${epassClass}" data-fuel-action="epass-travel" data-fuel-row="${escapeHtml(rowKey)}" title="${escapeHtml(epassTitle)}">
          <span class="fuel-action-btn__label">${escapeHtml(epassLabel)}</span>
        </button>
        <button type="button" class="fuel-action-btn fuel-action-btn--approve"${approveDisabled} data-fuel-action="approve-request" data-fuel-row="${escapeHtml(rowKey)}" title="Approve request">
          <span class="fuel-action-btn__label">Approve</span>
        </button>
        <button type="button" class="fuel-action-btn fuel-action-btn--reject"${rejectDisabled} data-fuel-action="reject-request" data-fuel-row="${escapeHtml(rowKey)}" title="Reject request">
          <span class="fuel-action-btn__label">Reject</span>
        </button>
      </div>
    </td>`;
  };

  const buildActionsCell = (row, rowKey) => {
    const item = normalizeItem(row);
    const pending = isPendingStatus(item.Status);
    const linkedEpass = getLinkedEpassNumber(item);
    const linkedTravel = getLinkedTravelNumber(item);
    const hasLink = Boolean(linkedEpass || linkedTravel);
    const epassClass = hasLink ? "has-epass" : "missing-epass";
    const printDisabled = canPrintRequest(item) ? "" : " disabled";
    const epassLabel = linkedEpass ? "EPASS" : linkedTravel ? "TRAVEL" : "CHOOSE";
    const epassTitle = linkedEpass
      ? `Linked EPASS ${linkedEpass} — open EPASS or Travel`
      : linkedTravel
        ? `Linked TRAVEL ${linkedTravel} — open EPASS or Travel`
        : "Create Fuel EPASS or open Travel form";
    return `<td class="fuel-row-actions">
      <div class="fuel-row-action-group">
        <button type="button" class="fuel-action-btn fuel-action-btn--view" data-fuel-action="view-details" data-fuel-row="${escapeHtml(rowKey)}" title="View all details" aria-label="View all details">
          <svg class="fuel-action-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="12" r="3"/></svg>
        </button>
        <button type="button" class="fuel-action-btn fuel-action-btn--et ${epassClass}" data-fuel-action="epass-travel" data-fuel-row="${escapeHtml(rowKey)}" title="${escapeHtml(epassTitle)}">
          <span class="fuel-action-btn__label">${escapeHtml(epassLabel)}</span>
        </button>
        ${pending ? `<button type="button" class="fuel-action-btn fuel-action-btn--edit" data-fuel-action="edit-request" data-fuel-row="${escapeHtml(rowKey)}" title="Edit pending request">
          <span class="fuel-action-btn__label">Edit</span>
        </button>` : ""}
        <button type="button" class="fuel-action-btn fuel-action-btn--print"${printDisabled} data-fuel-action="print" data-fuel-row="${escapeHtml(rowKey)}" title="Print fuel request with EPASS">
          <span class="fuel-action-btn__label">Print</span>
        </button>
      </div>
    </td>`;
  };

  const renderRequestRowHtml = (row, actionsCell) => {
    const item = normalizeItem(row);
    const statusClass = statusBadgeModifier(item.Status);
    const rowDate = new Date(`${String(item.PresRequestDate || "").slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ageClass = rowDate instanceof Date && !Number.isNaN(rowDate.getTime()) && rowDate < today ? " fuel-req-row--old" : "";
    return `<tr class="fuel-req-row fuel-req-row--${statusClass}${ageClass}">
      <td><code class="fuel-far-code">${escapeHtml(item.FARCode || "-")}</code></td>
      <td class="fuel-cell-employee">${escapeHtml(item.EmployeeName || item.UserCode || "-")}</td>
      <td class="fuel-cell-item">${escapeHtml(item.ReqItem || "-")}</td>
      <td class="fuel-cell-ltrs"><span class="fuel-ltrs-num">${escapeHtml(item.ReqAmt || "-")}</span><span class="fuel-ltrs-unit"> L</span></td>
      <td class="fuel-cell-vehicle">${escapeHtml(item.Vehicle || "-")}</td>
      <td class="fuel-cell-destination">${escapeHtml(item.Destination || "-")}</td>
      <td class="fuel-cell-date">${escapeHtml(item.PresRequestDate || "-")}</td>
      ${actionsCell}
      <td class="fuel-cell-status">${buildStatusBadge(item.Status)}</td>
    </tr>`;
  };

  const renderRequestRow = (row) => {
    const rowKey = registerFuelRow(row);
    return renderRequestRowHtml(row, buildActionsCell(row, rowKey));
  };

  const renderApprovalRow = (row) => {
    const rowKey = registerFuelRow(row);
    return renderRequestRowHtml(row, buildApprovalActionsCell(row, rowKey));
  };

  const handleTableClick = (event) => {
    const button = event.target.closest("[data-fuel-action]");
    if (!button || button.disabled) return;
    const row = getFuelRow(button.getAttribute("data-fuel-row"));
    if (!row) return;
    const action = button.getAttribute("data-fuel-action");
    if (action === "view-details") {
      openDetailsModal(row);
      return;
    }
    if (action === "epass-travel") {
      openPicker(normalizeItem(row));
      return;
    }
    if (action === "print") {
      printRequest(row);
      return;
    }
    if (action === "edit-request") {
      const item = normalizeItem(row);
      if (!isPendingStatus(item.Status)) {
        showToast("Cannot edit", "Only pending fuel requests can be edited.");
        return;
      }
      global.dispatchEvent(new CustomEvent("samelcii-fuel-edit-request", { detail: { item } }));
      return;
    }
    if (action === "approve-request") {
      const item = normalizeItem(row);
      if (!item.FARCode) return;
      updateRequestStatus(item.FARCode, 1)
        .then((payload) => {
          showToast("Approved", payload.message || "Fuel request approved.");
          closeDetailsModal();
          global.dispatchEvent(new CustomEvent("samelcii-fuel-history-refresh"));
          if (global.FuelApproval && typeof global.FuelApproval.refresh === "function") {
            void global.FuelApproval.refresh();
          }
        })
        .catch((error) => showToast("Approve failed", error.message || "Unable to approve."));
      return;
    }
    if (action === "reject-request") {
      const item = normalizeItem(row);
      if (!item.FARCode) return;
      if (!global.confirm(`Reject fuel request ${item.FARCode}?`)) return;
      updateRequestStatus(item.FARCode, 3)
        .then((payload) => {
          showToast("Rejected", payload.message || "Fuel request rejected.");
          closeDetailsModal();
          global.dispatchEvent(new CustomEvent("samelcii-fuel-history-refresh"));
          if (global.FuelApproval && typeof global.FuelApproval.refresh === "function") {
            void global.FuelApproval.refresh();
          }
        })
        .catch((error) => showToast("Reject failed", error.message || "Unable to reject."));
    }
  };

  let tableClickWired = false;

  const wireTableClicks = () => {
    if (tableClickWired) return;
    tableClickWired = true;
    document.addEventListener("click", handleTableClick, true);
  };

  const bindTableActions = () => {
    wireTableClicks();
  };

  const wireChrome = () => {
    fillDepartmentOptions();
    el("fuel-et-picker-close")?.addEventListener("click", closePicker);
    el("fuel-et-pick-epass")?.addEventListener("click", () => {
      if (el("fuel-et-pick-epass")?.disabled) {
        showToast("Fuel EPASS", "EPASS is disabled while Travel exists. Cancel the Travel first.");
        return;
      }
      const item = pickerItem;
      if (item && isPendingStatus(item.Status) && getLinkedTravelNumber(item)
          && !global.confirm("Replace the linked Fuel Travel with a Fuel EPASS? The Travel link will be removed after the EPASS is saved.")) {
        return;
      }
      closePicker();
      if (item) openEpassModal(item);
    });
    el("fuel-et-pick-travel")?.addEventListener("click", () => {
      if (el("fuel-et-pick-travel")?.disabled) {
        showToast("Fuel EPASS", "Travel is disabled while a Fuel EPASS exists. Cancel the EPASS first.");
        return;
      }
      const item = pickerItem;
      if (item && isPendingStatus(item.Status) && getLinkedEpassNumber(item)
          && !global.confirm("Replace the linked Fuel EPASS with Fuel Travel? The EPASS link will be removed after Travel is saved.")) {
        return;
      }
      closePicker();
      openTravelModal(item);
    });
    el("fuel-epass-close")?.addEventListener("click", closeEpassModal);
    el("fuel-epass-form")?.addEventListener("submit", saveFuelEpass);
    el("fuel-epass-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-epass-modal")) void closeEpassModal();
    });
    el("fuel-epass-search")?.addEventListener("input", (event) => {
      void searchFuelEpassEmployees(event.target.value, currentFuelEpassDepartment);
    });
    el("fuel-epass-search")?.addEventListener("focus", (event) => {
      const q = String(event.target.value || "").trim();
      void searchFuelEpassEmployees(q, currentFuelEpassDepartment);
    });
    el("fuel-epass-department")?.addEventListener("change", (event) => {
      const department = String(event.target.value || "").trim().toUpperCase();
      setFuelEpassDepartment(department, { search: true });
    });
    el("fuel-travel-close")?.addEventListener("click", closeTravelModal);
    el("fuel-travel-form")?.addEventListener("submit", saveFuelTravel);
    el("fuel-travel-calendar-trigger")?.addEventListener("click", () => {
      renderFuelTravelCalendar();
      el("fuel-travel-calendar-dialog")?.showModal();
    });
    el("fuel-travel-calendar-close")?.addEventListener("click", () => {
      el("fuel-travel-calendar-dialog")?.close();
    });
    el("fuel-travel-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-travel-modal")) closeTravelModal();
    });
    el("fuel-travel-search")?.addEventListener("input", (event) => {
      void searchFuelTravelEmployees(event.target.value, currentFuelTravelDepartment);
    });
    el("fuel-travel-search")?.addEventListener("focus", (event) => {
      void searchFuelTravelEmployees(String(event.target.value || "").trim(), currentFuelTravelDepartment);
    });
    el("fuel-travel-department")?.addEventListener("change", (event) => {
      setFuelTravelDepartment(String(event.target.value || "").trim().toUpperCase(), { search: true });
    });
    el("fuel-et-picker-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-et-picker-modal")) closePicker();
    });
    el("fuel-detail-close")?.addEventListener("click", closeDetailsModal);
    el("fuel-detail-modal")?.addEventListener("click", (event) => {
      if (event.target === el("fuel-detail-modal")) closeDetailsModal();
    });
    global.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (el("fuel-epass-modal")?.classList.contains("active")) {
        return;
      }
      if (el("fuel-travel-modal")?.classList.contains("active")) {
        closeTravelModal();
        return;
      }
      closePicker();
      closeDetailsModal();
    });
    wireTableClicks();
  };

  global.FuelActions = {
    resetFuelRowStore,
    buildActionsCell,
    buildStatusBadge,
    renderRequestRow,
    renderApprovalRow,
    bindTableActions,
    openPicker,
    openDetailsModal,
    closeDetailsModal,
    openEpassModal,
    openTravelModal,
    printRequest,
    canPrintRequest,
    normalizeItem,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireChrome);
  } else {
    wireChrome();
  }
})(window);
