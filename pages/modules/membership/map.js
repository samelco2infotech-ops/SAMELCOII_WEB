// ── Configuration ─────────────────────────────────────────────────────────────
// EDIT GUIDE: set this to the exact parent page origin for stricter security.
// Example: "http://192.168.1.99" — leave empty ("") to allow same-origin only.
const ALLOWED_PARENT_ORIGIN = "";

// Timeouts for API fetches. Street view is slower because it hits Google first.
const FETCH_TIMEOUT_MS = 6_000;
const STREET_FETCH_TIMEOUT_MS = 10_000;

// EDIT GUIDE: set SAMELCII_MEMBERSHIP_API_BASE only when the approved API route moves.
// HUWAG BAGUHIN: same-origin ang default para gumana sa LAN, VPN, at desktop app nang walang exposed port 3000.
const resolveMembershipApiBase = () => window.SAMELCII_MEMBERSHIP_API_BASE
  || new URL("../../../api", window.location.href).toString().replace(/\/$/, "");
const MAP_API_BASE = resolveMembershipApiBase();
window.SAMELCII_API_BASE = MAP_API_BASE;
const MAP_API = `${MAP_API_BASE}/membership`;
// fallback kept only for older loaded pages that expect a global.
window.SAMELCII_RESOLVE_API_BASE = window.SAMELCII_RESOLVE_API_BASE || resolveMembershipApiBase;
/* ponytail: iisang same-origin endpoint ang Membership form at map.
   Ceiling: kapag lumipat ang route, i-configure ang SAMELCII_MEMBERSHIP_API_BASE. */

// EDIT GUIDE: dito ayusin ang sentro at zoom ng bawat area.
// Format: "AREA NAME": [lat, lng, zoomLevel]
const areaCenters = {
  "CATBALOGAN":       [11.775, 124.886, 13],
  "BASEY":            [11.287, 125.07,  12],
  "CALBIGA":          [11.623, 124.962, 12],
  "JIABONG":          [11.759, 124.952, 12],
  "MOTIONG":          [11.785, 125.184, 12],
  "PARANAS":          [11.826, 125.026, 12],
  "SAN SEBASTIAN":    [11.703, 125.3,   12],
  "HINABANGAN":       [11.684, 125.17,  12],
  "PINABACDAO":       [11.393, 124.996, 12],
  "VILLAREAL":        [11.565, 124.927, 12],
  "STA. RITA":        [11.462, 124.952, 12],
  "STA RITA":         [11.462, 124.952, 12],  // alias without period
  "TALALORA":         [11.529, 124.845, 12],
  "DARAM":            [11.675, 124.792, 11],
  "ZUMARRAGA":        [11.642, 124.841, 11],
  "MARABUT":          [11.29,  125.145, 11],
  "SAN JOSE DE BUAN": [11.86,  125.215, 11]
};

// ── Global state ──────────────────────────────────────────────────────────────
let map;
let userMarker = null;      // the pin dropped by the user
let highlightLayer = null;  // temporary highlight ring around a searched point
let currentLat = null;      // active pin latitude (string, 6 decimal places)
let currentLng = null;      // active pin longitude (string, 6 decimal places)
let activeAccount = "";     // account number passed in from the parent iframe
let activePublicId = "";    // login/public ID passed in from the parent iframe
let activeArea = "";        // area string from parent (e.g. "01 - CATBALOGAN")
let parentOrigin = "*";     // captured from first valid init message; used for sendToParent

// Mas magaan ito kaysa clustering library para mabilis mag-load ang iframe.
const cluster = L.layerGroup();

// Viewport fetch debounce — only fires after the user stops panning/zooming.
let viewportFetchTimer = null;
let lastViewportKey = "";           // prevents re-fetching the same bounding box
let viewportAbortController = null; // cancels an in-flight fetch when viewport changes again

// html2canvas is loaded on demand; this promise prevents duplicate script tags.
let html2canvasLoader = null;

// File System Access API handle — reused after the user picks a directory once.
let selectedRootDirHandle = null;

// Track capture state so we know what has already been saved this session.
let topCaptured = false;
let lastTopCaptureFilename = "";
let lastStreetCaptureFilename = "";
let lastStreetPreviewUrl = "";
let captureStreetLocked = false;  // mutex: prevent overlapping street captures
let isSaving = false;             // prevents double-click on the Save button
let leftPanelHidden = false;      // tracks whether the Area panel is collapsed

// Status bar auto-clear — track the timer so a newer message can cancel the old clear.
let statusClearTimer = null;

// ── Utility helpers ───────────────────────────────────────────────────────────

// Validates that coordinates are finite numbers within real-world bounds.
// Rejects values that are technically finite but geographically impossible.
function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

// Escapes HTML special characters so user-supplied strings are safe in tooltip/popup HTML.
function sanitizeText(v) {
  return String(v || "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Reads the login session the parent page already stored in localStorage.
function getLoggedUserSession() {
  try {
    return JSON.parse(localStorage.getItem("samelcii_session") || "null") || {};
  } catch (_error) {
    return {};
  }
}

// Tagalog: ang employee account number dito ay usercode mula sa usertb session.
// Kapag walang parent init, kukunin natin ito diretso sa localStorage para iwas `no_account`.
function getEmployeeAccountCode() {
  const session = getLoggedUserSession();
  const raw = activePublicId || activeAccount || session.accountnumber || session.usercode || session.username || "NO_ACCOUNT";
  return String(raw || "NO_ACCOUNT").trim() || "NO_ACCOUNT";
}

// Returns a fetch AbortSignal that times out after `ms` milliseconds.
// Falls back gracefully if the browser doesn't support AbortSignal.timeout (pre-2022).
function timeoutSignal(ms) {
  if (typeof AbortSignal?.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  window.setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// Combines two AbortSignals so that aborting either one cancels the fetch.
// Used when we need both a manual abort (viewport change) and a timeout.
function combineSignals(sig1, sig2) {
  if (typeof AbortSignal?.any === "function") return AbortSignal.any([sig1, sig2]);
  // Fallback: wire them up manually for older browsers.
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  sig1.addEventListener("abort", abort, { once: true });
  sig2.addEventListener("abort", abort, { once: true });
  return ctrl.signal;
}

// Retries a fetch once after a short delay on server error or network failure.
// Does NOT retry on AbortError/TimeoutError — those are intentional cancellations.
async function fetchWithRetry(url, options, retryDelayMs = 800) {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const r = await fetch(url, options);
      if (r.ok || attempt === 1) return r; // return on success or after last retry
      await new Promise((res) => window.setTimeout(res, retryDelayMs));
    } catch (err) {
      if (attempt === 1 || err?.name === "AbortError" || err?.name === "TimeoutError") throw err;
      await new Promise((res) => window.setTimeout(res, retryDelayMs));
    }
  }
}

// Schedules a status bar clear after `delayMs`.
// Cancels any previously scheduled clear so a newer message isn't wiped prematurely.
function scheduleStatusClear(delayMs) {
  if (statusClearTimer) window.clearTimeout(statusClearTimer);
  statusClearTimer = window.setTimeout(() => {
    mapSetCaptureStatus("");
    statusClearTimer = null;
  }, delayMs);
}

// ── Coordinate / pin helpers ──────────────────────────────────────────────────

// Returns true only when the user has actually placed a pin on the map.
function hasCurrentPoint() {
  return currentLat != null && currentLng != null;
}

// Returns the best available coordinate for capture:
// 1) the user's pin, 2) map center, 3) hard-coded fallback.
function getCapturePoint() {
  if (hasCurrentPoint()) {
    return { lat: Number(currentLat), lng: Number(currentLng), source: "pin" };
  }
  if (map) {
    const center = map.getCenter();
    return { lat: Number(center.lat), lng: Number(center.lng), source: "center" };
  }
  // Default to Samar area if map hasn't initialised yet.
  return { lat: 11.77, lng: 125.0, source: "default" };
}

// Removes the pin from the map and resets the coordinate fields.
function clearCurrentPoint() {
  if (userMarker) map.removeLayer(userMarker);
  userMarker = null;
  currentLat = null;
  currentLng = null;
  setMeta(); // sync the hidden lat/lng input fields
}

// Hides the street-view iframe and clears its src so the browser stops loading it.
function clearStreetPreviewPanel() {
  const iframe = document.getElementById("streetview");
  lastStreetPreviewUrl = "";
  if (iframe) {
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.removeAttribute("src"); // frees the Google Maps embed connection
  }
}

// ── Map initialisation ────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Guard against double-mount if the script is included twice.
  if (window.__membershipMapMounted) return;
  window.__membershipMapMounted = true;

  // Start at a central Samar view; each account will re-center via postMessage.
  map = L.map("map").setView([11.77, 125.0], 11);

  // Satellite ang default para mas kahawig ng Google map screenshot.
  const baseSatellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxNativeZoom: 17,
      maxZoom: 19,
      crossOrigin: true,  // needed so html2canvas can export the tiles
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }
  );
  baseSatellite.addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map); // move zoom off the default top-left

  // Attach the cluster layer so consumer dots appear on every tile load.
  map.addLayer(cluster);

  // ── Event wiring ─────────────────────────────────────────────────────────
  map.on("click", onMapClick);
  map.on("moveend", scheduleViewportPointsLoad); // reload dots whenever pan/zoom settles

  document.getElementById("btnTopView")?.addEventListener("click", showTopView);
  document.getElementById("btnStreetView")?.addEventListener("click", showStreetView);
  document.getElementById("panelToggleBtn")?.addEventListener("click", () => setLeftPanelHidden(true));
  document.getElementById("panelOpenBtn")?.addEventListener("click", () => setLeftPanelHidden(false));

  // Allow the user to press Enter inside the search box to trigger a search.
  document.getElementById("searchBox")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchLocation();
  });

  document.getElementById("municipalitySelect")?.addEventListener("change", onMunicipalityChange);

  // Live-relay landmark text to the parent so it can reflect changes in its form.
  document.getElementById("landmarkField")?.addEventListener("input", () => {
    sendToParent({ type: "landmark-change", landmark: document.getElementById("landmarkField").value });
  });

  document.getElementById("saveBtn")?.addEventListener("click", async () => {
    // Prevent duplicate submissions from a double-click during an async save.
    if (isSaving) return;

    if (!hasCurrentPoint()) {
      mapSetCaptureStatus("Pick a map point first.", true);
      sendToParent({ type: "capture-error", message: "Pick a map point first." });
      return;
    }

    isSaving = true;
    try {
      // Awtomatikong kunin muna ang street view bago mag-save.
      if (!lastStreetCaptureFilename) {
        await captureStreetViewImage(true); // silent=true: no status bar messages
      }
      // Parent window ang magse-save ng record; coordinates at files lang ang padala dito.
      sendToParent({
        type: "save",
        lat: currentLat,
        lng: currentLng,
        landmark: document.getElementById("landmarkField").value,
        topImage: lastTopCaptureFilename,
        streetImage: lastStreetCaptureFilename
      });
    } finally {
      isSaving = false; // always release the lock even if captureStreetViewImage threw
    }
  });

  // Toolbar shortcut buttons focus the real controls rather than duplicating logic.
  

  // Admin button highlights the active pin's marker on the map.
  

  // "Fit all dots" button — only useful when consumer dots are already loaded.
  

  document.getElementById("captureTopBtn")?.addEventListener("click", captureTopViewImage);

  // Wrapper lang ito para hindi maging `silent` ang click event.
  document.getElementById("captureStreetBtn")?.addEventListener("click", () => captureStreetViewImage(false));

  updateCaptureStateUI();

  // Listen for postMessage commands from the parent page (account init, reset, etc.).
  window.addEventListener("message", onParentMessage);

  // Tell the parent the map iframe is ready to receive its init payload.
  sendToParent({ type: "ready" });

  // Small delay so Leaflet finishes rendering tiles before we load viewport dots.
  map.whenReady(() => {
    window.setTimeout(() => scheduleViewportPointsLoad(), 200);
  });

  setLeftPanelHidden(false);
});

// ── Communication ─────────────────────────────────────────────────────────────

// All outgoing messages target the captured parent origin (set on first valid init).
// Using "*" only as a fallback before the parent has identified itself.
function sendToParent(payload) {
  window.parent.postMessage({ source: "membership-map", ...payload }, parentOrigin);
}

// Keeps the hidden lat/lng text fields in sync with the current pin position.
function setMeta() {
  document.getElementById("latField").value = currentLat ?? "";
  document.getElementById("lngField").value = currentLng ?? "";
}

function setLeftPanelHidden(hidden) {
  leftPanelHidden = Boolean(hidden);
  document.body.classList.toggle("panel-collapsed", leftPanelHidden);
  document.querySelector(".left-panel")?.classList.toggle("is-hidden", leftPanelHidden);
}

// Handles all incoming postMessages from the parent page.
function onParentMessage(event) {
  // Reject messages from unexpected origins to prevent cross-site message injection.
  const allowed = ALLOWED_PARENT_ORIGIN || window.location.origin;
  if (event.origin !== allowed) return;

  const msg = event.data || {};
  if (msg.source !== "membership-parent") return; // ignore messages from other frames

  if (msg.type === "init") {
    // Lock in the parent's origin now so all future sends are targeted correctly.
    parentOrigin = event.origin;

    // Linisin muna ang lumang state para walang maiwang dating pin o preview.
    clearCurrentPoint();
    clearStreetPreviewPanel();
    document.getElementById("topViewLabel").textContent = "None";
    document.getElementById("streetViewLabel").textContent = "None";

    activeAccount = String(msg.account || "").trim();
    activePublicId = String(msg.publicId || msg.usercode || "").trim();
    activeArea = String(msg.area || "").trim();

    // Strip the numeric prefix (e.g. "01 - CATBALOGAN" → "CATBALOGAN") for the lookup.
    const areaName = activeArea.includes(" - ")
      ? activeArea.split(" - ").slice(1).join(" - ").trim().toUpperCase()
      : activeArea.toUpperCase();

    const c = areaCenters[areaName];
    if (c) map.setView([c[0], c[1]], c[2]); // fly to the account's municipality

    // Sync the municipality dropdown to the incoming area.
    document.getElementById("municipalitySelect").value = areaCenters[areaName] ? areaName : "auto";
    document.getElementById("landmarkField").value = String(msg.landmark || "");

    // Restore previously saved filenames so the labels show the right values.
    lastTopCaptureFilename = String(msg.topImage || "").trim();
    lastStreetCaptureFilename = String(msg.streetImage || "").trim();

    // If the record already has coordinates, validate range before placing the pin.
    if (msg.lat !== undefined && msg.lat !== null && msg.lat !== ""
        && msg.lng !== undefined && msg.lng !== null && msg.lng !== "") {
      const lat = Number(msg.lat);
      const lng = Number(msg.lng);
      if (isValidLatLng(lat, lng)) {
        placeMarker(lat, lng, true);
      }
    }

    topCaptured = Boolean(lastTopCaptureFilename);
    document.getElementById("topViewLabel").textContent = lastTopCaptureFilename || "None";
    document.getElementById("streetViewLabel").textContent = lastStreetCaptureFilename || "None";
    updateCaptureStateUI();
    setMeta();
    return;
  }

  if (msg.type === "set-consumers" && Array.isArray(msg.points)) {
    // Replace all existing dots with the new set pushed from the parent.
    cluster.clearLayers();
    msg.points.forEach((p) => addPoint(p));
    return;
  }

  if (msg.type === "reset-pin") {
    // User clicked "Clear" on the parent form — wipe everything capture-related.
    clearCurrentPoint();
    clearStreetPreviewPanel();
    lastTopCaptureFilename = "";
    lastStreetCaptureFilename = "";
    topCaptured = false;
    document.getElementById("topViewLabel").textContent = "None";
    document.getElementById("streetViewLabel").textContent = "None";
    updateCaptureStateUI();
    mapSetCaptureStatus("");
  }
}

// ── Map interaction ───────────────────────────────────────────────────────────

// Forwards a map click into placeMarker; Leaflet provides the latlng.
function onMapClick(e) {
  placeMarker(e.latlng.lat, e.latlng.lng, true);
}

// Drops or moves the pin to the given coordinates.
// `notify` = true sends a "pin" message to the parent so it can update its form.
function placeMarker(lat, lng, notify) {
  // Reject coordinates outside real-world bounds (catches NaN and garbage values).
  if (!isValidLatLng(lat, lng)) return;

  // Remove the old marker before adding a new one to avoid duplicates.
  if (userMarker) map.removeLayer(userMarker);

  // Store as fixed-precision strings for consistent API and filename output.
  currentLat = Number(lat).toFixed(6);
  currentLng = Number(lng).toFixed(6);

  userMarker = L.marker([currentLat, currentLng]).addTo(map);
  // Popup content uses sanitized values; lat/lng are numbers so no XSS risk here.
  userMarker.bindPopup(`<b>Lat:</b> ${currentLat}<br><b>Lng:</b> ${currentLng}`).openPopup();
  setMeta();

  if (notify) sendToParent({ type: "pin", lat: currentLat, lng: currentLng });

  // If street view is already open, refresh it to follow the new pin location.
  if (streetPreviewIsOpen()) refreshStreetPreviewImg();
}

// Adds a single consumer dot (blue circle marker) to the cluster layer.
function addPoint(p) {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!isValidLatLng(lat, lng)) return;

  const mk = L.circleMarker([lat, lng], {
    radius: 5,
    color: "#0ea5e9",
    fillColor: "#0ea5e9",
    fillOpacity: 1,
    weight: 1
  });
  // Sanitize account before placing it in the tooltip to prevent XSS via poisoned API data.
  mk.bindTooltip(`ACC: ${sanitizeText(p.account)}`, { direction: "top" });
  cluster.addLayer(mk);
}

// ── Street view helpers ───────────────────────────────────────────────────────

// Builds the URLSearchParams for the server-side Street View capture endpoint.
function streetCaptureQueryParams(point = getCapturePoint()) {
  // Cap dimensions so the API doesn't time out on small screens.
  const width = Math.min(640, Math.max(1, Math.round(window.innerWidth - 320)));
  const height = Math.min(640, Math.max(1, Math.round(window.innerHeight - 120)));
  return new URLSearchParams({
    action: "streetview_capture",
    lat: String(point.lat),
    lng: String(point.lng),
    width: String(width),
    height: String(height),
    fov: "90",
    heading: "0",
    pitch: "0"
  });
}

// Returns the Google Maps Street View embed URL for the given pin position.
function streetPreviewImageUrl() {
  const point = getCapturePoint();
  const lat = point.lat.toFixed(6);
  const lng = point.lng.toFixed(6);
  return `https://www.google.com/maps?q=&layer=c&cbll=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&cbp=11,0,0,0,0&output=svembed`;
}

// Returns true when the street-view iframe is currently visible.
function streetPreviewIsOpen() {
  const iframe = document.getElementById("streetview");
  return Boolean(iframe && iframe.style.display === "block");
}

// Updates the iframe src to the current pin's street view URL.
function refreshStreetPreviewImg() {
  const iframe = document.getElementById("streetview");
  if (!iframe) return;
  lastStreetPreviewUrl = streetPreviewImageUrl();
  iframe.src = lastStreetPreviewUrl;
}

// Switches the view panel to Street View and hides the Leaflet map.
function showStreetView() {
  const iframe = document.getElementById("streetview");
  if (!iframe) return;
  const point = getCapturePoint();

  // Swap visibility between the map div and the street-view iframe.
  iframe.style.display = "block";
  iframe.setAttribute("aria-hidden", "false");
  document.getElementById("map").style.display = "none";

  // Update the toggle button states.
  document.getElementById("btnStreetView").classList.add("active");
  document.getElementById("btnTopView").classList.remove("active");

  // Show coordinates in the label so the user knows which spot is being previewed.
  document.getElementById("streetViewLabel").textContent =
    `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;

  lastStreetPreviewUrl = streetPreviewImageUrl();
  iframe.src = lastStreetPreviewUrl;
  mapSetCaptureStatus("Street View loaded.", false);
}

// Switches the view panel back to the Leaflet satellite map.
function showTopView() {
  const iframe = document.getElementById("streetview");
  if (iframe) {
    // Kill the iframe src so the browser stops the Google Maps connection.
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.removeAttribute("src");
  }
  document.getElementById("map").style.display = "block";
  document.getElementById("btnTopView").classList.add("active");
  document.getElementById("btnStreetView").classList.remove("active");

  const point = getCapturePoint();
  document.getElementById("topViewLabel").textContent =
    `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;

  // invalidateSize forces Leaflet to recalculate tile layout after the div was hidden.
  if (map) window.requestAnimationFrame(() => map.invalidateSize());
}

// ── Search ────────────────────────────────────────────────────────────────────

// Handles both "lat, lng" coordinate strings and free-text place names.
function searchLocation() {
  const q = String(document.getElementById("searchBox").value || "").trim();
  if (!q) return;

  // Try to parse a raw coordinate pair first — faster and doesn't need the network.
  const coordMatch = q.match(/(-?\d+(\.\d+)?)\s*[, ]\s*(-?\d+(\.\d+)?)/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[3]);
    if (isValidLatLng(lat, lng)) {
      map.setView([lat, lng], 18);
      placeMarker(lat, lng, true);
      return;
    }
    // Coordinates were parsed but failed range validation.
    mapSetCaptureStatus("Coordinates out of valid range (lat ±90, lng ±180).", true);
    return;
  }

  // Fall back to Nominatim geocoding for place-name searches.
  mapSetCaptureStatus("Searching...", false);
  fetch(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q),
    { signal: timeoutSignal(FETCH_TIMEOUT_MS) }
  )
    .then((r) => r.json())
    .then((results) => {
      if (!results || !results.length) {
        // Give the user actionable feedback instead of silently doing nothing.
        mapSetCaptureStatus("No location found. Try a different search term.", true);
        return;
      }
      const lat = Number(results[0].lat);
      const lng = Number(results[0].lon);
      if (!isValidLatLng(lat, lng)) {
        mapSetCaptureStatus("Search returned an invalid location.", true);
        return;
      }
      mapSetCaptureStatus(""); // clear "Searching..." now that we have a result
      map.setView([lat, lng], 18);
      placeMarker(lat, lng, true);
    })
    .catch((err) => {
      const msg = err?.name === "AbortError" || err?.name === "TimeoutError"
        ? "Search timed out. Check your connection."
        : "Search failed. Check your connection and try again.";
      mapSetCaptureStatus(msg, true);
    });
}

// Pans the map to the selected municipality's center and zoom.
function onMunicipalityChange() {
  const val = document.getElementById("municipalitySelect").value;
  if (val === "auto") return; // "auto" means no explicit municipality chosen
  const c = areaCenters[val];
  if (!c) return;
  map.setView([c[0], c[1]], c[2]);
}

// ── File naming utilities ─────────────────────────────────────────────────────

// Strips characters that are unsafe in filenames; collapses repeated underscores.
function fileSafe(v) {
  return String(v || "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// Produces a compact timestamp string like "20260513_140523" for filenames.
function timestampTag() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Truncates long filenames for display labels without breaking the stored value.
function shortFileLabel(name, maxLen = 34) {
  const text = String(name || "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

// ── UI state ──────────────────────────────────────────────────────────────────

// Re-enables capture buttons; called after any capture attempt finishes.
function updateCaptureStateUI() {
  const topBtn = document.getElementById("captureTopBtn");
  const streetBtn = document.getElementById("captureStreetBtn");
  if (topBtn) {
    topBtn.disabled = false;
    topBtn.title = "Capture map only";
  }
  if (!streetBtn) return;
  streetBtn.disabled = false;
  streetBtn.title = "Capture street view only";
}

// Shows a status message in the capture bar; toggles the error style when needed.
function mapSetCaptureStatus(text, isError = false) {
  const el = document.getElementById("mapCaptureStatus");
  if (!el) return;
  // Cancel any pending auto-clear so it doesn't wipe this new message.
  if (statusClearTimer) {
    window.clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
  el.textContent = String(text || "");
  el.classList.toggle("is-error", Boolean(isError) && el.textContent !== "");
}

// Enables or disables both capture buttons at once (used during an active capture).
function setCaptureButtonsDisabled(disabled) {
  ["captureTopBtn", "captureStreetBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

// ── File System Access API ────────────────────────────────────────────────────

// Returns a directory handle for `Documents/member_map/<account>/`.
// Prompts for directory access only once per session; reuses the handle after that.
async function ensureTargetDirectoryHandle() {
  if (!("showDirectoryPicker" in window)) {
    return null; // browser doesn't support the File System Access API
  }
  if (!selectedRootDirHandle) {
    // EDIT GUIDE: pumili ng Documents folder dito; doon gagawa ng member_map folder.
    selectedRootDirHandle = await window.showDirectoryPicker({ mode: "readwrite", startIn: "documents" });
  }
  // Create the folder hierarchy if it doesn't exist yet.
  const parentDir = await selectedRootDirHandle.getDirectoryHandle("member_map", { create: true });
  const accountFolder = fileSafe(getEmployeeAccountCode());
  const accountDir = await parentDir.getDirectoryHandle(accountFolder, { create: true });
  return accountDir;
}

// Writes a blob to the user's local Documents folder via the File System Access API.
async function saveBlobToDocuments(blob, filename) {
  const dirHandle = await ensureTargetDirectoryHandle();
  if (!dirHandle) {
    return { ok: false, path: "" };
  }
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close(); // always close to flush and release the lock
  }
  const accountFolder = fileSafe(getEmployeeAccountCode());
  return {
    ok: true,
    path: `Documents/member_map/${accountFolder}/${filename}`
  };
}

// Updates the filename tracking variables and on-screen label after a successful save.
function applySaveResult(filename, labelElId, captureKind) {
  const node = document.getElementById(labelElId);
  if (node) {
    node.textContent = shortFileLabel(filename);
    node.title = filename;
  }
  if (captureKind === "top") {
    lastTopCaptureFilename = filename;
  } else if (captureKind === "street") {
    lastStreetCaptureFilename = filename;
  }
}

// Syncs a file to the server. Retries once on failure before reporting an error.
// Non-blocking: called without await so a sync failure doesn't undo the local save.
async function syncToServer(blob, filename, captureKind, localPath) {
  try {
    const formData = new FormData();
    formData.append("account", getEmployeeAccountCode());
    formData.append("filename", filename);
    formData.append("kind", captureKind);
    formData.append("file", blob, filename);

    // GABAY: server upload ay pang-sync lang; huwag nitong pigilan ang local save.
    // Retry once in case of a transient server hiccup.
    const response = await fetchWithRetry(`${MAP_API}?action=streetview_store`, {
      method: "POST",
      credentials: "same-origin",
      body: formData,
      signal: timeoutSignal(FETCH_TIMEOUT_MS)
    });
    const result = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !result.ok) {
      sendToParent({
        type: "capture-error",
        message: `Local save ok at ${localPath}, but server sync failed.`
      });
    }
  } catch (_syncError) {
    // Network error or timeout during server sync — local copy is still safe.
    sendToParent({
      type: "capture-error",
      message: `Local save ok at ${localPath}, but server sync failed.`
    });
  }
}

// Master save function: tries local Documents first, then syncs to the server,
// with a browser-download fallback if the user denied directory access.
async function saveBlobToDisk(blob, filename, labelElId, captureKind) {
  try {
    // Tagalog: ang tunay na target ay ang local Documents folder, hindi browser download lang.
    const localSave = await saveBlobToDocuments(blob, filename);
    if (!localSave.ok) {
      throw new Error("Local Documents save failed.");
    }

    applySaveResult(filename, labelElId, captureKind);
    sendToParent({ type: "capture-saved", filename, kind: captureKind, path: localSave.path || "" });

    // Server sync is fire-and-forget after local save succeeds.
    syncToServer(blob, filename, captureKind, localSave.path);

    return true;
  } catch (_error) {
    // Kung walang Documents permission, subukan pa rin ang browser download bilang fallback.
    try {
      // Trigger a standard browser "Save As" download instead.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url); // release the object URL after the click

      applySaveResult(filename, labelElId, captureKind);
      sendToParent({
        type: "capture-error",
        message: `${filename} was downloaded because Documents save was denied or unavailable.`
      });
      return true;
    } catch (_fallbackError) {
      // Both paths failed — nothing was saved.
      sendToParent({ type: "capture-error", message: "Capture save cancelled or failed." });
      return false;
    }
  }
}

// Fetches an image from a URL and returns a Blob.
// Returns null if the response isn't a valid image or is too small to be useful.
async function blobFromPreviewUrl(previewUrl) {
  if (!previewUrl) return null;
  try {
    const response = await fetch(previewUrl, {
      credentials: "same-origin",
      signal: timeoutSignal(FETCH_TIMEOUT_MS)
    });
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok || !ct.includes("image/")) {
      return null;
    }
    const blob = await response.blob();
    return blob && blob.size >= 32 ? blob : null; // reject obviously empty responses
  } catch (_error) {
    return null;
  }
}

// ── html2canvas lazy loader ───────────────────────────────────────────────────

// Injects the html2canvas script tag on first use and reuses the same promise
// if called again before the script has finished loading.
async function ensureHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  if (!html2canvasLoader) {
    html2canvasLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      script.onload = () => resolve(window.html2canvas);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return html2canvasLoader;
}

// ── Paint / timing helpers ────────────────────────────────────────────────────

// Resolves after the browser has committed the next animation frame.
function waitForNextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

// Waits for an <img> element to finish loading (or fail).
// Resolves true on success, false on error or if the element is null.
function waitForImageElementLoad(img) {
  return new Promise((resolve) => {
    if (!img) { resolve(false); return; }
    // Already loaded and has real pixels — no need to wait.
    if (img.complete && img.naturalWidth > 0) { resolve(true); return; }
    const cleanup = () => { img.onload = null; img.onerror = null; };
    img.onload  = () => { cleanup(); resolve(true);  };
    img.onerror = () => { cleanup(); resolve(false); };
  });
}

// Forces Leaflet to re-render and waits long enough for tiles to paint.
// Required before html2canvas so the screenshot isn't taken mid-render.
async function waitForMapPaint() {
  if (!map) return;
  map.invalidateSize();
  await waitForNextFrame();
  await waitForNextFrame();
  await new Promise((resolve) => window.setTimeout(resolve, 100)); // extra buffer for tile decode
}

// Placeholder — direct DOM capture of a cross-origin iframe is blocked by the browser.
async function captureStreetPreviewPanelBlob() {
  return null;
}

// ── Screen capture (top-level tab) ───────────────────────────────────────────

// Asks the user to share their screen, grabs one frame, and returns it as a PNG Blob.
// Returns null if the browser doesn't support getDisplayMedia, if the user cancels,
// or if any other non-fatal error occurs — the caller falls back to the API fetch.
async function captureVisibleTabBlob() {
  if (!navigator.mediaDevices?.getDisplayMedia) return null;

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    // NotAllowedError = user clicked "Cancel" on the share dialog — not an error.
    // AbortError = dialog dismissed programmatically.
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") return null;
    throw err; // unexpected — let the caller decide what to do
  }

  try {
    const track = stream.getVideoTracks()[0];
    if (!track) return null;
    const settings = track.getSettings?.() || {};

    // Attach the stream to a hidden video element so we can draw a single frame.
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 150)); // let first frame arrive

    // Draw that frame onto a canvas at the native capture resolution.
    const width  = Math.max(1, Math.floor(settings.width  || video.videoWidth  || window.innerWidth));
    const height = Math.max(1, Math.floor(settings.height || video.videoHeight || window.innerHeight));
    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    // Always stop all tracks so the OS stops showing the "recording" indicator.
    stream.getTracks().forEach((t) => t.stop());
  }
}

// ── Capture functions ─────────────────────────────────────────────────────────

// Captures the Leaflet satellite map as a PNG and saves it via saveBlobToDisk.
async function captureTopViewImage() {
  try {
    // Snapshot lang ang top view, kaya html2canvas ang gamit.
    showTopView();
    await waitForMapPaint(); // ensure tiles are painted before the screenshot

    const html2canvas = await ensureHtml2Canvas();
    const mapNode = document.getElementById("map");
    const canvas = await html2canvas(mapNode, {
      useCORS: true,         // needed to export cross-origin tile images
      backgroundColor: null,
      ignoreElements: (el) => el.classList?.contains("leaflet-control-container") // skip zoom controls
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Map capture failed.");

    // Build a descriptive filename: account + coordinates + timestamp.
    const point = getCapturePoint();
    const filename = `${fileSafe(getEmployeeAccountCode())}-${fileSafe(point.lat.toFixed(6))}-${fileSafe(point.lng.toFixed(6))}_TOP_${timestampTag()}.png`;
    const ok = await saveBlobToDisk(blob, filename, "topViewLabel", "top");
    if (!ok) throw new Error("Unable to save map image.");

    topCaptured = true;
    updateCaptureStateUI();
  } catch (_error) {
    sendToParent({ type: "capture-error", message: _error?.message || "Unable to capture map image." });
  }
}

// Captures the Street View panel as a PNG.
// `silent` = true suppresses status bar messages (used during auto-capture on save).
async function captureStreetViewImage(silent = false) {
  const quiet = silent === true;
  if (captureStreetLocked) return ""; // prevent overlapping captures
  captureStreetLocked = true;

  try {
    if (!quiet) {
      mapSetCaptureStatus("Fetching Street View from server...", false);
    }
    setCaptureButtonsDisabled(true);

    const point = getCapturePoint();

    // Make sure street view is visible so getDisplayMedia captures the right panel.
    if (!streetPreviewIsOpen()) showStreetView();
    await waitForNextFrame();
    await waitForNextFrame();

    // First attempt: ask the user to share their screen and grab one frame.
    // Returns null silently if the user cancels the share dialog.
    let blob = await captureVisibleTabBlob();

    if (!blob) {
      // Fallback: fetch the static Street View image from the PHP API instead.
      const params = streetCaptureQueryParams(point);
      params.set("width", "640");
      params.set("height", "320");
      const response = await fetch(`${MAP_API}?${params.toString()}`, {
        credentials: "same-origin",
        signal: timeoutSignal(STREET_FETCH_TIMEOUT_MS) // longer timeout: hits Google servers
      });
      const ct = (response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || ct.includes("application/json")) {
        // API returned JSON — likely an error message; extract it for display.
        const errorBody = ct.includes("application/json")
          ? await response.json().catch(() => ({}))
          : {};
        const textFallback = ct.includes("application/json")
          ? ""
          : await response.text().catch(() => "");
        throw new Error(
          errorBody.message ||
          (textFallback && textFallback.length < 400 ? textFallback : "") ||
          "Street image fetch failed."
        );
      }
      blob = await response.blob();
    }

    if (!blob || blob.size < 32) {
      throw new Error("Street view image was empty or too small.");
    }

    // Build the filename the same way as the top-view capture.
    const filename = `${fileSafe(getEmployeeAccountCode())}-${fileSafe(point.lat.toFixed(6))}-${fileSafe(point.lng.toFixed(6))}_STREET_${timestampTag()}.png`;
    const ok = await saveBlobToDisk(blob, filename, "streetViewLabel", "street");
    if (!ok) {
      throw new Error("Unable to save street view (server upload and local download both failed).");
    }

    if (!quiet) {
      mapSetCaptureStatus("Street capture saved from the preview image.", false);
      scheduleStatusClear(3500); // auto-clear after 3.5 s without wiping a newer message
    } else {
      mapSetCaptureStatus(""); // silent mode: clear any previous status
    }
    return filename;
  } catch (_error) {
    const fallbackMessage =
      _error?.message ||
      (quiet ? "Unable to auto-capture street view image." : "Unable to capture street view image.");
    mapSetCaptureStatus(fallbackMessage, true);
    sendToParent({ type: "capture-error", message: fallbackMessage });
    return "";
  } finally {
    // Always release the lock and re-enable buttons, even if an error occurred.
    captureStreetLocked = false;
    setCaptureButtonsDisabled(false);
    updateCaptureStateUI();
  }
}

// ── Viewport dot loading ──────────────────────────────────────────────────────

// Debounces the viewport fetch so we don't hammer the server on every pixel of pan.
function scheduleViewportPointsLoad() {
  if (viewportFetchTimer) window.clearTimeout(viewportFetchTimer);
  viewportFetchTimer = window.setTimeout(loadViewportPoints, 220); // 220 ms quiet period
}

// Fetches consumer dots within the current map bounding box and renders them.
// Skips the request if the viewport hasn't changed since the last successful fetch.
async function loadViewportPoints() {
  if (!map) return;

  const bounds = map.getBounds();
  const zoom   = map.getZoom();
  const north  = bounds.getNorth();
  const south  = bounds.getSouth();
  const east   = bounds.getEast();
  const west   = bounds.getWest();

  // Build a cache key from the rounded bounds; small pans within 0.001° reuse the cache.
  const key = [zoom, north.toFixed(3), south.toFixed(3), east.toFixed(3), west.toFixed(3)].join("|");
  if (key === lastViewportKey) return; // same viewport — nothing to refresh
  lastViewportKey = key;

  // Cancel any in-flight request for the previous viewport.
  if (viewportAbortController) viewportAbortController.abort();
  viewportAbortController = new AbortController();

  try {
    const params = new URLSearchParams({
      action: "map_points",
      north: String(north),
      south: String(south),
      east: String(east),
      west: String(west)
    });
    // Combine the abort controller with a timeout so a hung server doesn't block forever.
    const signal = combineSignals(
      viewportAbortController.signal,
      timeoutSignal(FETCH_TIMEOUT_MS)
    );
    const response = await fetch(`${MAP_API}?${params.toString()}`, {
      credentials: "same-origin",
      signal
    });
    const result = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !result.ok) return;

    // Replace all dots with the fresh set from the server.
    cluster.clearLayers();
    (Array.isArray(result.points) ? result.points : []).forEach((p) => addPoint(p));
  } catch (error) {
    // AbortError/TimeoutError are expected when the user pans before the fetch finishes.
    if (error?.name === "AbortError" || error?.name === "TimeoutError") return;
  } finally {
    viewportAbortController = null; // allow the next fetch to create a fresh controller
  }
}
