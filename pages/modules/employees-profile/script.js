// Employees profile script ito; dito baguhin ang photo at data flow.
(function () {
    const PROFILE_PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
    const API_BASE = String(window.SAMELCII_API_BASE || `${PROFILE_PAGE_ROOT}/api`).replace(/\/+$/, "");
    window.SAMELCII_API_BASE = API_BASE;
    // FIX: media/photo URLs must include the app root (e.g. /SAMELCII_WEB_SYSTEM under IP access); bare origin 404s. PROFILE_PAGE_ROOT is correct under both IP and the vhost.
    window.SAMELCII_MEDIA_BASE = window.SAMELCII_MEDIA_BASE || PROFILE_PAGE_ROOT;
    console.assert(API_BASE.endsWith("/api"), "SAMELCII API base should end with /api");
    // FIX: never hardcode localhost â€” clients aren't the server. Fall back to the current host's :3000.
    const NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
    const DTR_API = `${NODE_API_BASE}/dtr`;
    const LEAVE_API = `${NODE_API_BASE}/leave`;
    const EPASS_API = `${NODE_API_BASE}/epass`;
    const TRAVEL_API = `${NODE_API_BASE}/travel`;
    const OVERTIME_API = `${NODE_API_BASE}/overtime`;
    const AUTH_API = `${NODE_API_BASE}/auth`;
    const IT_EQUIP_API = `${NODE_API_BASE}/it-equipment`;
    const PROFILE_PHOTO_MAX_BYTES = 150 * 1024;
    const PROFILE_PHOTO_SIZE = 160;
    // EDIT GUIDE: Palitan ang max size/quality kung kailangan mas maliit na OT attachment
    const OT_ATTACHMENT_MAX_EDGE = 720;
    const OT_ATTACHMENT_MAX_BYTES = 180 * 1024;
    const sessionRaw = localStorage.getItem("samelcii_session");
    let session = {};

    if (sessionRaw) {
        try {
            session = JSON.parse(sessionRaw);
        } catch (_error) {
            session = {};
        }
    }

    const users = JSON.parse(localStorage.getItem("samelcii_users") || "[]");
    const employee = users.find((item) =>
        (item.username || "").toLowerCase() === (session.username || "").toLowerCase() ||
        (item.usercode || "").toLowerCase() === (session.usercode || "").toLowerCase()
    ) || {};
    const PROFILE_LAYOUT_DEFAULT = {
        order: ["profile", "attendance", "side"],
        sideOrder: ["accountability", "leave"],
        left: 340,
        right: 270,
        sideSplit: 65,
        hidden: [],
        collapsed: [],
        density: "comfortable"
    };
    const profileLayoutOwner = String(employee.usercode || session.usercode || session.accountnumber || session.username || "default")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "_");
    // ponytail: Layout stays browser-local; move this key to the API only if users need the same layout on different computers.
    const PROFILE_LAYOUT_STORAGE_KEY = `samelcii_profile_layout_v1_${profileLayoutOwner}`;
    const LOCAL_CACHE_LIMIT = 3000;
    const LOCAL_CACHE_PREFIX = "samelcii_cache_";
    const DTR_CACHE_VERSION = "v9-direct-dtr-edit";
    const CROP_STAGE_SIZE = 220;
    const EPASS_PEOPLE_DRAFT_KEY = "samelcii_epass_people_draft";
    const TRAVEL_PEOPLE_DRAFT_KEY = "samelcii_travel_people_draft";
    const EPASS_SUPPRESS_KEY_PREFIX = "samelcii_epass_suppress_";
    const TRAVEL_SUPPRESS_KEY_PREFIX = "samelcii_travel_suppress_";
    let epassPeople = [];
    let epassListItems = [];
    let epassEditingNumber = "";
    let epassEmployeeDirectoryItems = [];
    let epassEmployeeDirectoryPage = 1;
    let epassEmployeeDirectoryTotalPages = 1;
    let epassEmployeeDirectoryTotalItems = 0;
    let travelEmployeeDirectoryItems = [];
    let travelEmployeeDirectoryPage = 1;
    let travelEmployeeDirectoryTotalPages = 1;
    let travelEmployeeDirectoryTotalItems = 0;
    let travelPeople = [];
    let travelDates = [];
    let travelListItems = [];
    let travelEditingNumber = "";
    const calendarView = { epass: null, travel: null };
    let overtimeListItems = [];
    let overtimeListPage = 1;
    let overtimeListTotalPages = 1;
    const OVERTIME_LIST_PAGE_SIZE = 10;
    let overtimeTimePresets = [];
    let overtimeActiveTimePresetKey = "";
    let overtimeSelectedTimePresets = new Map();
    let overtimeDtrPresetPage = 1;
    const OVERTIME_DTR_PRESET_PAGE_SIZE = 20;
    let overtimeDtrMonthLoadId = 0;
    let overtimeEditingNumber = "";
    let overtimeMemoEmployees = [];
    const overtimeMemoSelectedCodes = new Set();
    let overtimeMemoVisibleCodes = [];
    // EDIT GUIDE: Ito ang live preview state para sa auto-loaded request number ng EPASS at Travel.
    const requestNumberPreviewState = {
        epass: ""
    };
    let epassSearchTimer = null;
    let epassDirectorySearchTimer = null;
    const requestApproverState = {
        epass: { people: new Map(), timer: null, selectedPerson: null, autoPerson: null },
        travel: { people: new Map(), timer: null, selectedPerson: null, autoPerson: null, generalManager: null, generalManagerIsManual: false },
        leave: { people: new Map(), timer: null, selectedPerson: null, autoPerson: null }
    };
    // [FEATURE] Which Travel approval slot the shared search/results picker is currently filling:
    // "department_head" (default, always editable) or "general_manager" (privilege-10 only —
    // see canChangeTravelGeneralManager).
    let travelApprovalEditingStage = "department_head";
    let avatarCropState = null;
    let overtimeAttachmentsByType = {};
    let leaveCalendarMarkers = {};
    let leaveRequestCalendarMarkers = {};
    let leaveRequestHistoryItems = [];
    let leaveEditingId = "";
    let leaveAvailableCredits = { vl: null, sl: null, ol: null, birthday: null };
    let leaveApprovalRouteReady = false;
    let leaveApprovalRouteMessage = "Loading the three-stage Leave approval route...";
    let leaveApprovalRoutePeople = [];
    let leaveApprovalRouteOverrides = {};
    let leaveApprovalCanChangeGeneralManager = false;
    let leaveApprovalEditingStage = "";
    let epassHistoryCollapsed = true;
    const epassExpandedRows = new Set();
    const EPASS_EMPLOYEE_DIRECTORY_LIMIT = 20;
    const TRAVEL_EMPLOYEE_DIRECTORY_LIMIT = 20;
    const profilePhotoAvailabilityCache = new Map();
    let activeFormKey = "";
    let fuelEmbedAutoSaveInProgress = false;
    let sessionProfilePromise = null;
    let lastDtrQuery = {
        employeeId: "",
        attempts: [],
        range: null,
        requestedRange: null,
        fallbackUsed: false,
        resolvedEmployee: null
    };
    let dtrCorrectionItems = [];
    let latestDtrRows = {};
    let latestDtrRange = null;
    let dtrRenderRequestId = 0;
    const DTR_EDIT_FIELDS = [
        ["morning_in", "AM IN"], ["morning_out", "AM OUT"],
        ["afternoon_in", "PM IN"], ["afternoon_out", "PM OUT"],
        ["ot_in", "OT IN"], ["ot_out", "OT OUT"]
    ];

    function getAuthHeaders(extraHeaders = {}) {
        const headers = { ...extraHeaders };
        let token = window.APIClient?.getToken?.() || localStorage.getItem("samelcii_token");
        if (!token && window.parent !== window) {
            try {
                token = window.parent.APIClient?.getToken?.()
                    || window.parent.localStorage.getItem("samelcii_token");
            } catch (_error) {
                // Parent access is optional; same-origin dashboard normally allows it.
            }
        }
        if (token) {
            if (token.split(".").length === 3) {
                headers.Authorization = `Bearer ${token}`;
            } else {
                localStorage.removeItem("samelcii_token");
            }
        }
        // ponytail: used to also send the raw session JSON as X-SAMELCII-SESSION, but the backend
        // never reads it (its own security self-checks assert it must stay unused/untrusted) and a
        // non-Latin1 character in any session field (name/department/position/area) makes fetch()
        // throw synchronously before the request is even sent — breaking every authenticated call.
        return headers;
    }

    function getOvertimeAuthHeaders(extraHeaders = {}) {
        return getAuthHeaders(extraHeaders);
    }

    function resolveMediaUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try {
            const parsed = new URL(raw, window.location.href);
            const action = String(parsed.searchParams.get("action") || "").toLowerCase();
            const legacyAuthPhoto = /\/api\/auth(?:\.php)?$/i.test(parsed.pathname) && action === "profile_photo";
            const directAuthPhoto = /\/api\/auth\/profile-photo$/i.test(parsed.pathname);
            if (legacyAuthPhoto || directAuthPhoto) {
                const userId = parsed.searchParams.get("user_id") || parsed.searchParams.get("id") || "";
                const version = parsed.searchParams.get("v");
                if (/^\d+$/.test(userId) && Number(userId) > 0) {
                    return `${AUTH_API}/profile-photo?user_id=${encodeURIComponent(userId)}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
                }
            }
            const isNodeMediaPath = /^\/(?:uploads\/|api\/auth\/)/i.test(parsed.pathname);
            const isSameHost = parsed.hostname === window.location.hostname
                || ["localhost", "127.0.0.1"].includes(parsed.hostname);
            if (isNodeMediaPath && isSameHost) {
                const nodeMediaRoot = NODE_API_BASE.replace(/\/api\/?$/i, "");
                return `${nodeMediaRoot}${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
        } catch (_error) {
            // Continue with the shared resolver for non-URL values.
        }
        if (typeof window.APIClient?.resolveMediaUrl === "function") {
            return window.APIClient.resolveMediaUrl(raw);
        }
        if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
        const appMarker = "/SAMELCII_WEB_SYSTEM/";
        const appMarkerIndex = raw.toUpperCase().indexOf(appMarker);
        if (appMarkerIndex >= 0) {
            return `${PROFILE_PAGE_ROOT}/${raw.slice(appMarkerIndex + appMarker.length)}`;
        }
        if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
        let clean = raw.replace(/^\/+/, "");
        clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, "");
        clean = clean.replace(/^uploads\//i, "uploads/");
        return `${PROFILE_PAGE_ROOT}/${clean}`;
    }

    function inventoryThumbnailUrl(value) {
        const original = resolveMediaUrl(value);
        if (!original || original.startsWith("data:")) return original;
        try {
            const url = new URL(original, window.location.href);
            if (!/\/uploads\/it-inventory\//i.test(url.pathname)) return original;
            url.pathname = url.pathname
                .replace(/\/uploads\/it-inventory\//i, "/uploads/it-inventory-thumbs/")
                .replace(/\.[a-z0-9]+$/i, ".jpg");
            return url.href;
        } catch (_error) {
            return original;
        }
    }

    async function canUseProfilePhoto(url) {
        const normalized = String(url || "").trim();
        if (!normalized) {
            return false;
        }
        if (normalized.startsWith("data:")) {
            return true;
        }
        if (profilePhotoAvailabilityCache.has(normalized)) {
            return profilePhotoAvailabilityCache.get(normalized);
        }

        try {
            const response = await fetch(normalized, {
                method: "HEAD",
                credentials: "include"
            });
            const ok = response.ok;
            profilePhotoAvailabilityCache.set(normalized, ok);
            return ok;
        } catch (_error) {
            profilePhotoAvailabilityCache.set(normalized, false);
            return false;
        }
    }

    async function fetchJsonWithSessionRetry(url, options = {}, fallbackMessage = "Invalid server response.") {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({
            ok: false,
            message: fallbackMessage
        }));

        return { response, payload };
    }

    function cacheKey(name) {
        return `${LOCAL_CACHE_PREFIX}${name}`;
    }

    function readCache(name) {
        try {
            const raw = localStorage.getItem(cacheKey(name));
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function writeCache(name, records) {
        const clean = Array.isArray(records) ? records.slice(-LOCAL_CACHE_LIMIT) : [];
        try {
            localStorage.setItem(cacheKey(name), JSON.stringify(clean));
        } catch (_error) {
            try {
                localStorage.setItem(cacheKey(name), JSON.stringify(clean.slice(-Math.floor(LOCAL_CACHE_LIMIT / 2))));
            } catch (__error) {
                // Local storage may be full or disabled; the app can still use live API data.
            }
        }
    }

    function getCachedValue(name, key, maxAgeMs = 86400000) {
        const now = Date.now();
        const found = readCache(name).find((record) => record && record.key === key);
        if (!found || now - Number(found.savedAt || 0) > maxAgeMs) {
            return null;
        }
        return found.value;
    }

    function setCachedValue(name, key, value) {
        const records = readCache(name).filter((record) => record && record.key !== key);
        records.push({ key, value, savedAt: Date.now() });
        writeCache(name, records);
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value || "-";
        }
    }

    function initialsLabel(value) {
        const words = String(value || "").trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
            return "EM";
        }
        return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
    }

    function normalizePersonName(value) {
        return String(value || "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "")
            .trim();
    }

    function employeeProfilePhotoUrl(person = {}) {
        const raw = String(
            person.profile_photo_url ||
            person.photo_url ||
            person.photo ||
            ""
        ).trim();
        return raw ? resolveMediaUrl(raw) : "";
    }

    function normalizeEmployeeDirectoryItem(item = {}) {
        const name = String(item.name || item.fullname || item.display_name || "").trim();
        const usercode = String(item.usercode || item.code || "").trim().toUpperCase();
        const department = String(item.department || item.office || item.division || "Employee").trim() || "Employee";
        const area = String(item.area || item.location || item.branch || "").trim();
        const profile_photo_url = String(item.profile_photo_url || item.photo_url || item.photo || "").trim();
        return {
            name,
            usercode,
            department,
            area,
            profile_photo_url
        };
    }

    function localEpassEmployeeDirectory(department = "", query = "") {
        const needle = String(query || "").trim().toLowerCase();
        const departmentNeedle = String(department || "").trim().toLowerCase();
        const departmentTerms = epassDepartmentSearchTerms(department);
        const areaTerms = epassAreaSearchTerms(department);
        const normalizedUsers = users
            .map((item) => normalizeEmployeeDirectoryItem(item))
            .filter((item) => item.name && item.usercode)
            .filter((item) => {
                if (!needle) {
                    return true;
                }
                return (
                    item.name.toLowerCase().includes(needle) ||
                    item.usercode.toLowerCase().includes(needle) ||
                    String(item.department || "").toLowerCase().includes(needle)
                );
            });

        if (!departmentNeedle || departmentNeedle === "all") {
            return normalizedUsers;
        }

        const departmentMatches = normalizedUsers.filter((item) => {
            const dept = String(item.department || "").toLowerCase();
            const area = String(item.area || "").toLowerCase();
            return departmentTerms.some((term) => dept.includes(String(term || "").toLowerCase())) ||
                areaTerms.some((term) => area.includes(String(term || "").toLowerCase()));
        });

        if (departmentMatches.length) {
            return departmentMatches;
        }

        if (needle) {
            return normalizedUsers;
        }

        return users
            .map((item) => normalizeEmployeeDirectoryItem(item))
            .filter((item) => item.name && item.usercode);
    }

    function renderEmployeeAvatar(person = {}, className = "epass-avatar") {
        const name = String(person.name || "Employee").trim() || "Employee";
        const initials = initialsLabel(name);
        const photoUrl = employeeProfilePhotoUrl(person);
        return `
            <span class="${className}" aria-hidden="true">
                ${photoUrl ? `<img class="${className}-image" src="${escapeHtml(photoUrl)}" alt="" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" />` : ""}
                <span class="${className}-fallback"${photoUrl ? ' style="display:none;"' : ""}>${escapeHtml(initials)}</span>
            </span>
        `;
    }

    async function setProfileAvatar() {
        const avatar = document.getElementById("profile-avatar");
        if (!avatar) {
            return;
        }

        const applyFallbackAvatar = () => {
            const genderValue = String(
                employee.gender ||
                employee.sex ||
                session.gender ||
                session.sex ||
                ""
            ).trim().toLowerCase();

            const isFemale = /^(f|female|girl|woman)$/.test(genderValue);
            avatar.src = isFemale
                ? "../../../assets/images/avatar-female.jpg?v=20260615-avatar-small-v2"
                : "../../../assets/images/avatar-male.jpg?v=20260615-avatar-small-v2";
            avatar.alt = isFemale ? "Female employee avatar" : "Male employee avatar";
        };

        const photoUrl = employee.profile_photo_url || session.profile_photo_url || "";
        if (photoUrl) {
            const resolvedPhotoUrl = resolveMediaUrl(photoUrl);
            if (await canUseProfilePhoto(resolvedPhotoUrl)) {
                avatar.onerror = () => {
                    avatar.onerror = null;
                    applyFallbackAvatar();
                };
                avatar.src = resolvedPhotoUrl;
                avatar.alt = `${employee.name || session.name || "Employee"} profile photo`;
                return;
            }

            avatar.onerror = () => {
                avatar.onerror = null;
                employee.profile_photo_url = "";
                session.profile_photo_url = "";
                try {
                    localStorage.setItem("samelcii_session", JSON.stringify(session));
                } catch (_error) {
                    // Ignore cache write errors; fallback avatar still keeps the UI usable.
                }
                try {
                    const cachedUsers = JSON.parse(localStorage.getItem("samelcii_users") || "[]");
                    if (Array.isArray(cachedUsers)) {
                        const updatedUsers = cachedUsers.map((item) => {
                            const sameUser = Number(item.id || item.Id || 0) === Number(session.id || 0) ||
                                String(item.usercode || "").toLowerCase() === String(session.usercode || "").toLowerCase();
                            return sameUser ? { ...item, profile_photo_url: "" } : item;
                        });
                        localStorage.setItem("samelcii_users", JSON.stringify(updatedUsers));
                    }
                } catch (_error) {
                    // Ignore cache write errors; fallback avatar still keeps the UI usable.
                }
                applyFallbackAvatar();
            };
            profilePhotoAvailabilityCache.set(resolvedPhotoUrl, false);
            avatar.onerror();
            return;
        }

        avatar.onerror = null;
        applyFallbackAvatar();
    }

    function dataUrlToBlob(dataUrl) {
        const [header, data] = dataUrl.split(",");
        const mimeMatch = header.match(/data:(.*?);base64/);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: mime });
    }

    function canvasToBlob(canvas, quality) {
        return new Promise((resolve) => {
            if (canvas.toBlob) {
                canvas.toBlob(resolve, "image/jpeg", quality);
                return;
            }
            resolve(dataUrlToBlob(canvas.toDataURL("image/jpeg", quality)));
        });
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Profile photo could not be read."));
            image.src = URL.createObjectURL(file);
        });
    }

    function getCropBaseSize(image) {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const scale = Math.max(CROP_STAGE_SIZE / width, CROP_STAGE_SIZE / height);
        return {
            width: width * scale,
            height: height * scale
        };
    }

    function renderAvatarCrop() {
        if (!avatarCropState) {
            return;
        }
        const image = document.getElementById("avatar-crop-image");
        if (!image) {
            return;
        }

        const displayWidth = avatarCropState.baseWidth * avatarCropState.zoom;
        const displayHeight = avatarCropState.baseHeight * avatarCropState.zoom;
        image.style.width = `${displayWidth}px`;
        image.style.height = `${displayHeight}px`;
        image.style.transform = `translate(calc(-50% + ${avatarCropState.x}px), calc(-50% + ${avatarCropState.y}px))`;
    }

    function clampAvatarCrop() {
        if (!avatarCropState) {
            return;
        }
        const halfOverflowX = Math.max(0, ((avatarCropState.baseWidth * avatarCropState.zoom) - CROP_STAGE_SIZE) / 2);
        const halfOverflowY = Math.max(0, ((avatarCropState.baseHeight * avatarCropState.zoom) - CROP_STAGE_SIZE) / 2);
        avatarCropState.x = Math.max(-halfOverflowX, Math.min(halfOverflowX, avatarCropState.x));
        avatarCropState.y = Math.max(-halfOverflowY, Math.min(halfOverflowY, avatarCropState.y));
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Hindi mabasa ang compressed image."));
            reader.readAsDataURL(blob);
        });
    }

    // GABAY: Auto-resize at i-convert ang OT attachment sa maliit na JPEG (para sa draft/save payload)
    async function compressOvertimeAttachment(file) {
        if (!file || !/^image\//i.test(file.type || "")) {
            throw new Error("Pili ng image file lang (JPG, PNG, WEBP).");
        }
        const image = await loadImage(file);
        if (image.src && image.src.startsWith("blob:")) {
            URL.revokeObjectURL(image.src);
        }
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const scale = Math.min(1, OT_ATTACHMENT_MAX_EDGE / Math.max(sourceWidth, sourceHeight, 1));
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        let quality = 0.78;
        let blob = await canvasToBlob(canvas, quality);
        while (blob && blob.size > OT_ATTACHMENT_MAX_BYTES && quality > 0.42) {
            quality -= 0.08;
            blob = await canvasToBlob(canvas, quality);
        }
        if (!blob || blob.size > OT_ATTACHMENT_MAX_BYTES) {
            throw new Error("Masyadong malaki ang larawan kahit na-compress na. Pumili ng mas maliit na file.");
        }
        return blob;
    }

    async function createProfilePhotoBlob() {
        if (!avatarCropState) {
            throw new Error("Choose a profile photo first.");
        }
        const image = avatarCropState.image;
        const canvas = document.createElement("canvas");
        canvas.width = PROFILE_PHOTO_SIZE;
        canvas.height = PROFILE_PHOTO_SIZE;
        const context = canvas.getContext("2d");
        const outputScale = PROFILE_PHOTO_SIZE / CROP_STAGE_SIZE;
        const displayWidth = avatarCropState.baseWidth * avatarCropState.zoom;
        const displayHeight = avatarCropState.baseHeight * avatarCropState.zoom;
        const drawX = ((CROP_STAGE_SIZE - displayWidth) / 2 + avatarCropState.x) * outputScale;
        const drawY = ((CROP_STAGE_SIZE - displayHeight) / 2 + avatarCropState.y) * outputScale;
        context.drawImage(image, drawX, drawY, displayWidth * outputScale, displayHeight * outputScale);

        let quality = 0.78;
        let blob = await canvasToBlob(canvas, quality);
        while (blob && blob.size > PROFILE_PHOTO_MAX_BYTES && quality > 0.42) {
            quality -= 0.08;
            blob = await canvasToBlob(canvas, quality);
        }
        if (!blob || blob.size > PROFILE_PHOTO_MAX_BYTES) {
            throw new Error("Profile photo must be smaller. Please choose a lighter image.");
        }
        return blob;
    }

    function closeAvatarCropModal() {
        const modal = document.getElementById("avatar-crop-modal");
        const image = document.getElementById("avatar-crop-image");
        if (modal) {
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden", "true");
        }
        if (avatarCropState?.objectUrl) {
            URL.revokeObjectURL(avatarCropState.objectUrl);
        }
        if (image) {
            image.removeAttribute("src");
        }
        avatarCropState = null;
    }

    async function openAvatarCropModal(file) {
        if (!file) {
            return;
        }
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
            throw new Error("Only JPG, PNG, or WEBP profile photos are allowed.");
        }

        const modal = document.getElementById("avatar-crop-modal");
        const cropImage = document.getElementById("avatar-crop-image");
        const zoom = document.getElementById("avatar-crop-zoom");
        if (!modal || !cropImage || !zoom) {
            return;
        }

        const image = await loadImage(file);
        const base = getCropBaseSize(image);
        avatarCropState = {
            image,
            objectUrl: image.src,
            baseWidth: base.width,
            baseHeight: base.height,
            x: 0,
            y: 0,
            zoom: 1,
            dragStartX: 0,
            dragStartY: 0,
            startX: 0,
            startY: 0,
            dragging: false
        };
        cropImage.src = image.src;
        zoom.value = "1";
        renderAvatarCrop();
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    async function uploadProfilePhoto() {
        const compressed = await createProfilePhotoBlob();
        const formData = new FormData();
        formData.append("file", compressed, "profile.jpg");

        // [FIX] Walang timeout dati dito -- kung mag-stall ang network, nakabitin magpakailanman
        // ang request (Saving... na naka-disable ang button) nang walang error. 20s ceiling na may
        // malinaw na retry-able na mensahe kapag na-abort.
        const uploadController = new AbortController();
        const uploadTimeoutId = setTimeout(() => uploadController.abort(), 20000);
        let response;
        try {
            response = await fetch(`${AUTH_API}/upload-profile-photo`, {
                method: "POST",
                body: formData,
                credentials: "include",
                headers: getAuthHeaders(),
                signal: uploadController.signal
            });
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new Error("Upload took too long. Please check your connection and try again.");
            }
            throw error;
        } finally {
            clearTimeout(uploadTimeoutId);
        }
        const payload = await response.json().catch(() => ({
            ok: false,
            message: "Invalid profile photo response."
        }));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Profile photo could not be updated.");
        }

        session.profile_photo_url = payload.profile_photo_url || "";
        employee.profile_photo_url = session.profile_photo_url;
        localStorage.setItem("samelcii_session", JSON.stringify(session));
        const updatedUsers = users.map((item) => {
            const sameUser = Number(item.id || item.Id || 0) === Number(session.id || 0) ||
                String(item.usercode || "").toLowerCase() === String(session.usercode || "").toLowerCase();
            return sameUser ? { ...item, profile_photo_url: session.profile_photo_url } : item;
        });
        localStorage.setItem("samelcii_users", JSON.stringify(updatedUsers));
        setProfileAvatar();
    }

    function escapeHtml(text) {
        return String(text ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#039;"
        }[char]));
    }

    function escapeHtmlAttribute(text) {
        return String(text ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    }

    function formatShortUsDate(value) {
        const raw = value == null ? "" : String(value).trim();
        if (!raw) {
            return "";
        }
        const t = Date.parse(raw);
        if (Number.isFinite(t)) {
            const d = new Date(t);
            return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
        }
        return raw;
    }

    function mergeEmployeeDisplay(dtrProfile) {
        const d = dtrProfile && typeof dtrProfile === "object" ? dtrProfile : {};
        return {
            name: String(d.name || employee.name || session.name || session.username || "Employee"),
            usercode: String(d.usercode || employee.usercode || session.usercode || ""),
            position: String(d.position || employee.position || session.position || ""),
            department: String(d.department || employee.department || session.department || ""),
            area: String(d.area || employee.area || session.area || ""),
            employmentdate: d.employmentdate ?? employee.employmentdate ?? session.employmentdate ?? employee.hiredate ?? session.hiredate ?? "",
            birthdate: String(employee.birthdate || session.birthdate || "").trim(),
            basic: d.basic ?? employee.basic ?? session.basic ?? null,
            privilage: String(employee.privilage || session.privilage || "").trim()
        };
    }

    /**
     * Employee header for ALC (ledger skin) or Daily points / DTR (dtr skin).
     * @param {{ headline: string, year?: number, skin?: "ledger"|"dtr", dtrProfile?: object }} opts
     */
    function renderEmployeeSheetBanner(opts) {
        const skin = opts.skin === "dtr" ? "dtr" : "ledger";
        const headline = String(opts.headline || "EMPLOYEE").trim().toUpperCase();
        const year = Number(opts.year);
        const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
        const fields = mergeEmployeeDisplay(opts.dtrProfile);
        const displayName = escapeHtml(fields.name.toUpperCase());
        const dateHired = escapeHtml(formatShortUsDate(fields.employmentdate) || "â€”");
        const positionTitle = escapeHtml(fields.position || "â€”");
        const dobRaw = formatShortUsDate(fields.birthdate) || fields.birthdate || "â€”";
        const dob = escapeHtml(dobRaw);
        const empId = escapeHtml(fields.usercode || "â€”");
        const rawBasic = fields.basic;
        let basicPayHtml = "â€”";
        if (rawBasic !== "" && rawBasic != null && rawBasic !== undefined) {
            const n = Number(rawBasic);
            basicPayHtml = Number.isFinite(n)
                ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : escapeHtml(String(rawBasic));
        }
        const rankVal = escapeHtml(fields.privilage || "â€”");

        const bannerItem = (label, valueHtml) => `
            <div class="leave-ledger-banner-item">
                <span class="leave-ledger-banner-label">${escapeHtml(label)}</span>
                <span class="leave-ledger-banner-colon">:</span>
                <span class="leave-ledger-banner-value">${valueHtml}</span>
            </div>
        `;

        if (skin === "dtr") {
            return ``;
        }
        return `
            <div class="leave-ledger-sheet-banner" aria-label="Employee report header">
                <div class="leave-ledger-banner-left">
                    <div class="leave-ledger-banner-title">${escapeHtml(headline)} - YEAR ${safeYear}</div>
                    <div class="leave-ledger-banner-name">${displayName}</div>
                </div>
                <div class="leave-ledger-banner-right">
                    ${bannerItem("Date Hired", dateHired)}
                    ${bannerItem("Title/Position", positionTitle)}
                    ${bannerItem("Date of Birth", dob)}
                    ${bannerItem("Employee ID No.", empId)}
                    <div class="leave-ledger-banner-row-split">
                        ${bannerItem("Basic Pay", basicPayHtml)}
                        ${bannerItem("Rank", rankVal)}
                    </div>
                </div>
            </div>
        `;
    }

    async function loadMyAccountabilityBorrowed() {
        const root = document.getElementById("accountability-borrowed-root");
        if (!root) {
            return;
        }
        root.innerHTML = "<div class=\"accountability-borrowed-loading\">Loading borrowed itemsâ€¦</div>";
        try {
            const { response: res, payload: data } = await fetchJsonWithSessionRetry(
                `${IT_EQUIP_API}?action=my_accountability_borrowed`,
                {
                    credentials: "include",
                    headers: getAuthHeaders(),
                },
                "Invalid IT accountability response."
            );
            if (res.status === 401 || (data.message && String(data.message).toLowerCase().includes("login"))) {
                root.innerHTML =
                    "<div class=\"accountability-borrowed-empty\">Sign in again to see borrowed IT equipment linked to your account.</div>";
                return;
            }
            if (!res.ok || !data.ok) {
                root.innerHTML = `<div class="accountability-borrowed-empty">${escapeHtml(data.message || "Could not load IT accountability.")}</div>`;
                return;
            }
            const forms = Array.isArray(data.forms) ? data.forms : [];
            if (!forms.length) {
                root.innerHTML =
                    "<div class=\"accountability-borrowed-empty\">You have no open IT accountability records. Borrowed gear will appear here with a photo when the inventory catalog matches the item.</div>";
                return;
            }

            root.innerHTML = forms
                .map((bundle) => {
                    const header = bundle.header || {};
                    const lines = Array.isArray(bundle.lines) ? bundle.lines : [];
                    const formNo = escapeHtml(header.formNo || "â€”");
                    const issuedRaw = escapeHtml(header.dateissued || "");
                    const loc = header.flagLocation ? escapeHtml(header.flagLocation) : "";
                    const locHtml = loc ? `<span class="accountability-chip">${loc}</span>` : "";

                    const lineBlocks = lines
                        .map((ln) => {
                            const imgUrl = typeof ln.photoUrl === "string" ? resolveMediaUrl(ln.photoUrl) : "";
                            const thumbnailUrl = inventoryThumbnailUrl(imgUrl);
                            const desc = escapeHtml(ln.description || ln.itemno || "Item");
                            const metaBits = [];
                            if (ln.itemno) {
                                metaBits.push(escapeHtml(ln.itemno));
                            }
                            if (ln.serial) {
                                metaBits.push(`SN ${escapeHtml(ln.serial)}`);
                            }
                            const qtyNum = Number(ln.qty);
                            if (!Number.isNaN(qtyNum) && qtyNum !== 1) {
                                metaBits.push(`Qty ${escapeHtml(String(ln.qty))}`);
                            }
                            const meta = metaBits.filter(Boolean).join(" Â· ");

                            const thumb = thumbnailUrl
                                ? `<div class="accountability-thumb-wrap"><img class="accountability-thumb" src="${escapeHtmlAttribute(
                                      thumbnailUrl
                                  )}"${thumbnailUrl !== imgUrl ? ` data-full-src="${escapeHtmlAttribute(imgUrl)}"` : ""} alt="" loading="lazy" decoding="async" fetchpriority="low" width="56" height="56" onerror="if(this.dataset.fullSrc){this.src=this.dataset.fullSrc;this.removeAttribute('data-full-src');}else{this.hidden=true;}" /></div>`
                                : "<div class=\"accountability-thumb-wrap accountability-thumb-placeholder\" aria-hidden=\"true\"></div>";

                            return `
                        <li class="accountability-line">
                            ${thumb}
                            <div class="accountability-line-body">
                                <strong>${desc}</strong>
                                ${meta ? `<small>${meta}</small>` : ""}
                            </div>
                        </li>`;
                        })
                        .join("");

                    return `
                <section class="accountability-form-panel" aria-label="Accountability ${formNo}">
                    <div class="accountability-form-head">
                        <div>
                            <span class="accountability-form-id">${formNo}</span>
                            ${locHtml}
                        </div>
                        <time class="accountability-form-date" datetime="">${issuedRaw}</time>
                    </div>
                    ${lines.length
                        ? `<ul class="accountability-line-list">${lineBlocks}</ul>`
                        : "<p class=\"accountability-lines-empty\">No items listed yet for this form.</p>"
                    }
                </section>`;
                })
                .join("");
        } catch (_error) {
            root.innerHTML =
                "<div class=\"accountability-borrowed-empty\">We could not reach the IT equipment service. Try again shortly.</div>";
        }
    }

    function formatNow() {
        return new Date().toLocaleString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function datePart(year, monthIndex, day) {
        const month = String(monthIndex + 1).padStart(2, "0");
        const dayValue = String(day).padStart(2, "0");
        return `${year}-${month}-${dayValue}`;
    }

    function monthRange(date) {
        const candidate = date instanceof Date ? date : new Date(date);
        const safeDate = Number.isFinite(candidate.getTime()) ? candidate : new Date();
        const year = safeDate.getFullYear();
        const monthIndex = safeDate.getMonth();
        const days = new Date(year, monthIndex + 1, 0).getDate();

        return {
            year,
            monthIndex,
            days,
            from: datePart(year, monthIndex, 1),
            to: datePart(year, monthIndex, days)
        };
    }

    function monthRangeFor(year, monthIndex) {
        const date = new Date(year, monthIndex, 1);
        return monthRange(date);
    }

    function populateDtrMonthControls() {
        const monthSelect = document.getElementById("dtr-month-select");
        const yearSelect = document.getElementById("dtr-year-select");
        if (!monthSelect || !yearSelect) {
            return;
        }

        const now = new Date();
        monthSelect.innerHTML = "";
        for (let index = 0; index < 12; index += 1) {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = new Date(now.getFullYear(), index, 1).toLocaleString("en-US", { month: "long" });
            monthSelect.appendChild(option);
        }

        yearSelect.innerHTML = "";
        for (let year = now.getFullYear(); year >= now.getFullYear() - 10; year -= 1) {
            const option = document.createElement("option");
            option.value = String(year);
            option.textContent = String(year);
            yearSelect.appendChild(option);
        }

        monthSelect.value = String(now.getMonth());
        yearSelect.value = String(now.getFullYear());
    }

    function selectedDtrDate() {
        const monthSelect = document.getElementById("dtr-month-select");
        const yearSelect = document.getElementById("dtr-year-select");
        const now = new Date();
        const monthIndex = Number(monthSelect?.value ?? now.getMonth());
        const year = Number(yearSelect?.value ?? now.getFullYear());
        const safeMonth = Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11
            ? monthIndex
            : now.getMonth();
        const safeYear = Number.isInteger(year) && year >= 1900 && year <= now.getFullYear() + 1
            ? year
            : now.getFullYear();
        const selected = new Date(safeYear, safeMonth, 1);
        return Number.isFinite(selected.getTime()) ? selected : new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dtrDateGuardSelfCheck = monthRange(new Date(Number.NaN));
    console.assert(
        !dtrDateGuardSelfCheck.from.includes("NaN") && !dtrDateGuardSelfCheck.to.includes("NaN"),
        "DTR date guard must never produce NaN date parameters."
    );

    // Format a Date as YYYY-MM-DD using LOCAL parts (not toISOString, which shifts a day in UTC+8 / Philippine time).
    function formatDateInput(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function currentMonthRange() {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
            year: now.getFullYear(),
            monthIndex: now.getMonth(),
            days: to.getDate(),
            from: formatDateInput(from),
            to: formatDateInput(to)
        };
    }

    function resolveDtrEmployeeId() {
        const candidates = [
            employee.bioUID,
            employee.bioUid,
            employee.accountnumber,
            session.bioUID,
            session.bioUid,
            session.accountnumber,
            employee.usercode,
            session.usercode
        ];
        return candidates
            .map((value) => String(value || "").trim().toUpperCase())
            .find(Boolean) || "";
    }

    function addDtrCandidate(target, value) {
        const raw = String(value || "").trim().toUpperCase();
        if (!raw) {
            return;
        }

        target.push(raw);

        const compact = raw.replace(/[^A-Z0-9]/g, "");
        if (compact && compact !== raw) {
            target.push(compact);
        }
    }

    async function getCurrentSessionProfile() {
        if (sessionProfilePromise) {
            return sessionProfilePromise;
        }

        sessionProfilePromise = (async () => {
            try {
                const params = new URLSearchParams({ action: "me" });
                const response = await fetch(`${AUTH_API}?${params.toString()}`, {
                    cache: "no-store",
                    credentials: "include",
                    headers: getAuthHeaders()
                });
                const payload = await response.json().catch(() => ({ ok: false, user: null }));
                if (response.ok && payload.ok && payload.user) {
                    return payload.user;
                }
            } catch (_error) {
                return null;
            }
            return null;
        })();

        return sessionProfilePromise;
    }

    function resolveDtrEmployeeIds(profile = null) {
        const ordered = [
            profile?.bioUID,
            profile?.bioUid,
            profile?.accountnumber,
            profile?.usercode,
            employee.bioUID,
            employee.bioUid,
            employee.accountnumber,
            session.bioUID,
            session.bioUid,
            session.accountnumber,
            employee.usercode,
            session.usercode
        ];

        const normalized = [];
        ordered.forEach((value) => addDtrCandidate(normalized, value));

        return [...new Set(normalized)];
    }

    function buildDtrIdentityDebug(profile = null) {
        const sources = [
            ["live.bioUID", profile?.bioUID],
            ["live.bioUid", profile?.bioUid],
            ["live.accountnumber", profile?.accountnumber],
            ["live.usercode", profile?.usercode],
            ["cache.bioUID", employee.bioUID],
            ["cache.bioUid", employee.bioUid],
            ["cache.accountnumber", employee.accountnumber],
            ["cache.usercode", employee.usercode],
            ["session.bioUID", session.bioUID],
            ["session.bioUid", session.bioUid],
            ["session.accountnumber", session.accountnumber],
            ["session.usercode", session.usercode]
        ];

        return sources
            .map(([label, value]) => `${label}=${String(value || "").trim() || "-"}`)
            .join(" | ");
    }

    function buildDtrRows(items) {
        const rows = {};
        (items || []).forEach((item) => {
            const workDate = String(item.work_date || item.date || item.workDate || item.dtr_date || "").trim();
            if (!workDate) {
                return;
            }

            const daySource = String(item.day || item.Day || item.work_day || "").trim();
            const match = daySource ? daySource.match(/\d{1,2}/) : workDate.match(/(\d{1,2})(?!.*\d)/);
            const day = Number(match ? match[0] : "");
            if (!day || Number.isNaN(day)) {
                return;
            }

            const specialLabel = String(
                item.special_label || item.special || item.label || item.description || ""
            ).trim();
            const hasTime = [
                item.morning_in,
                item.morning_out,
                item.afternoon_in,
                item.afternoon_out,
                item.ot_in,
                item.ot_out
            ].some(Boolean);
            if (specialLabel && !hasTime) {
                rows[day] = { label: specialLabel, work_date: workDate };
                return;
            }

            const row = [
                item.morning_in || "",
                item.morning_out || "",
                item.afternoon_in || "",
                item.afternoon_out || "",
                item.ot_in || "",
                item.ot_out || "",
                item.undertime_min ? String(item.undertime_min) : ""
            ];
            row.workDate = workDate;
            row.approvedCorrections = item.corrections || {};
            row.biometricPunches = Array.isArray(item.biometric_punches) ? item.biometric_punches : [];
            rows[day] = row;
        });

        return rows;
    }

    function dtrActivityDay(value, range) {
        const parsed = new Date(String(value || "").trim());
        if (Number.isNaN(parsed.getTime())
            || parsed.getFullYear() !== range.year
            || parsed.getMonth() !== range.monthIndex) {
            return 0;
        }
        return parsed.getDate();
    }

    async function requestDtrActivities(range) {
        const profile = await getCurrentSessionProfile();
        const usercode = String(employee.usercode || profile?.usercode || session.usercode || "").trim().toUpperCase();
        if (!usercode) {
            return [];
        }

        const fetchItems = async (url, headers = getAuthHeaders()) => {
            const { response, payload } = await fetchJsonWithSessionRetry(
                url,
                { cache: "no-store", credentials: "include", headers },
                "Invalid employee request response."
            );
            if (!response.ok || !payload.ok) {
                return { items: [], totalPages: 1 };
            }
            return {
                items: payload.items || payload.records || payload.rows || payload.data || [],
                totalPages: Math.max(1, Number(payload.total_pages || 1))
            };
        };

        const epassTask = (async () => {
            const identifiers = getEpassHistoryIdentifiers(profile);
            for (const identifier of identifiers) {
                const params = new URLSearchParams({ action: "list", usercode: identifier });
                const result = await fetchItems(`${EPASS_API}?${params.toString()}`, getAuthHeaders());
                if (result.items.length) {
                    return result.items;
                }
            }
            return [];
        })();
        const travelParams = new URLSearchParams({ action: "list", usercode });
        const travelTask = fetchItems(`${TRAVEL_API}?${travelParams.toString()}`, getAuthHeaders()).then((result) => result.items);
        const overtimeTask = (async () => {
            const firstParams = new URLSearchParams({ action: "list", usercode, page: "1", limit: "10" });
            const first = await fetchItems(`${OVERTIME_API}?${firstParams.toString()}`, getOvertimeAuthHeaders());
            const items = first.items.slice();
            // ponytail: 200 OT records is the client-side ceiling; add API date filters if history grows beyond it.
            const lastPage = Math.min(20, first.totalPages);
            for (let page = 2; page <= lastPage; page += 1) {
                const params = new URLSearchParams({ action: "list", usercode, page: String(page), limit: "10" });
                const result = await fetchItems(`${OVERTIME_API}?${params.toString()}`, getOvertimeAuthHeaders());
                items.push(...result.items);
            }
            return items;
        })();

        const [epassResult, travelResult, overtimeResult] = await Promise.allSettled([epassTask, travelTask, overtimeTask]);
        const epassItems = epassResult.status === "fulfilled" ? epassResult.value : [];
        const travelItems = travelResult.status === "fulfilled" ? travelResult.value : [];
        const overtimeItems = overtimeResult.status === "fulfilled" ? overtimeResult.value : [];
        return [
            ...epassItems.filter((item) => epassStatusClass(item.status) === "approved").map((item) => ({
                type: "epass",
                day: dtrActivityDay(item.date, range),
                label: `EPASS · ${item.destination || item.epassnumber || "Approved"}`
            })),
            ...travelItems.filter((item) => epassStatusClass(item.status) === "approved").map((item) => ({
                type: "travel",
                day: dtrActivityDay(item.date, range),
                label: `TRAVEL · ${item.destination || item.to_number || "Approved"}`
            })),
            ...overtimeItems.filter((item) => Number(item.status || 1) !== 3).map((item) => {
                const approved = Number(item.status || 1) === 2;
                return {
                    type: "overtime",
                    day: dtrActivityDay(item.date_value || item.date, range),
                    label: `${approved ? "OT" : "OT REQUEST"} · ${[item.time_from, item.time_to].filter(Boolean).join("–") || item.hours || (approved ? "Approved" : "Pending")}`,
                    timeFrom: item.time_from || "",
                    timeTo: item.time_to || "",
                    statusLabel: approved ? "Approved OT" : "Pending OT request"
                };
            })
        ].filter((item) => item.day > 0);
    }

    function mergeDtrActivities(rows, activities) {
        const targetColumns = { epass: 1, travel: 3, overtime: 4 };
        (activities || []).forEach((activity) => {
            const day = Number(activity.day || 0);
            if (!day) {
                return;
            }
            if (!Array.isArray(rows[day])) {
                rows[day] = ["", "", "", "", "", "", ""];
            }
            const column = targetColumns[activity.type] ?? 1;
            const activityCells = rows[day].activityCells || Array.from({ length: 6 }, () => []);
            activityCells[column].push(activity);
            rows[day].activityCells = activityCells;
        });
        return rows;
    }

    async function requestDtrCorrections(range) {
        const params = new URLSearchParams({
            action: "my_corrections",
            date_from: range.from,
            date_to: range.to
        });
        const { response, payload } = await fetchJsonWithSessionRetry(
            `${DTR_API}?${params.toString()}`,
            { cache: "no-store", credentials: "include", headers: getAuthHeaders() },
            "Invalid DTR correction response."
        );
        if (!response.ok || !payload.ok) {
            return [];
        }
        return Array.isArray(payload.items) ? payload.items : [];
    }

    function mergeDtrCorrectionStates(rows, corrections, range) {
        const fieldColumns = Object.fromEntries(DTR_EDIT_FIELDS.map(([field], index) => [field, index]));
        const latest = new Map();
        (corrections || []).forEach((item) => {
            const key = `${item.work_date}|${item.field_name}`;
            if (!latest.has(key) || Number(item.id || 0) > Number(latest.get(key)?.id || 0)) {
                latest.set(key, item);
            }
        });
        latest.forEach((item) => {
            const day = dtrActivityDay(item.work_date, range);
            const column = fieldColumns[item.field_name];
            if (!day || column === undefined) {
                return;
            }
            if (!Array.isArray(rows[day])) {
                rows[day] = ["", "", "", "", "", "", ""];
            }
            rows[day].workDate = item.work_date;
            rows[day].correctionCells = rows[day].correctionCells || {};
            rows[day].correctionCells[column] = item;
            const savedTime = String(item.proposed_value || "");
            const match = savedTime.match(/^(\d{1,2}):(\d{2})$/);
            rows[day][column] = match ? `${Number(match[1]) % 12 || 12}:${match[2]}` : savedTime;
        });
        return rows;
    }

    function dtrCorrectionTone(correction) {
        return { color: "#067647", background: "#ecfdf3", label: "Manual" };
    }

    function dtrValueAs24Hour(value, field) {
        const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return "";
        let hour = Number(match[1]);
        if ((field.startsWith("afternoon_") || field.startsWith("ot_")) && hour < 12) hour += 12;
        return `${String(hour).padStart(2, "0")}:${match[2]}`;
    }

    function dtrScheduleTimeValue(value) {
        const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
        if (!match) return "";
        let hour = Number(match[1]);
        const minute = Number(match[2]);
        const meridiem = String(match[3] || "").toUpperCase();
        if (meridiem === "PM" && hour < 12) hour += 12;
        if (meridiem === "AM" && hour === 12) hour = 0;
        if (hour > 23 || minute > 59) return "";
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function ensureDtrCorrectionDialog() {
        let dialog = document.getElementById("dtr-correction-dialog");
        if (dialog) return dialog;

        const style = document.createElement("style");
        style.textContent = `
            #dtr-correction-dialog{width:min(520px,calc(100vw - 28px));padding:0;border:0;border-radius:22px;color:#17233b;box-shadow:0 24px 70px rgba(16,35,70,.28)}
            #dtr-correction-dialog::backdrop{background:rgba(15,23,42,.56);backdrop-filter:blur(3px)}
            .dtr-correction-card{padding:22px;background:#fff}.dtr-correction-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.dtr-correction-head h3{margin:3px 0 0;font-size:20px}.dtr-correction-head small{color:#66758f;font-weight:700}.dtr-correction-close{border:0;background:#eef2f8;border-radius:10px;width:36px;height:36px;font-size:22px;cursor:pointer}
            .dtr-correction-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.dtr-correction-grid label{display:grid;gap:6px;color:#64748b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.dtr-correction-grid input,.dtr-correction-grid select{width:100%;box-sizing:border-box;border:1px solid #d8deea;border-radius:11px;padding:10px 11px;background:#fbfcff;color:#17233b;font:inherit;text-transform:none;letter-spacing:normal}.dtr-correction-wide{grid-column:1/-1}.dtr-correction-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.dtr-correction-actions button{border:0;border-radius:11px;padding:10px 16px;font-weight:800;cursor:pointer}.dtr-correction-cancel{background:#eef2f8;color:#34425d}.dtr-correction-save{background:#315be8;color:#fff}.dtr-correction-message{min-height:18px;margin:10px 0 0;color:#b42318;font-size:12px;font-weight:700}
            .dtr-punch-chooser{grid-column:1/-1}.dtr-punch-chooser-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#64748b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.dtr-punch-chooser-title small{padding:3px 8px;border-radius:999px;background:#edf4ff;color:#155eef;font-size:10px}.dtr-punch-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.dtr-punch-option{display:flex;align-items:center;gap:11px;min-width:0;padding:11px 12px;border:1px solid #d7e0f0;border-radius:13px;background:#f8faff;color:#17233b;text-align:left;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s,transform .15s}.dtr-punch-option:hover{border-color:#86a6ff;background:#f2f6ff}.dtr-punch-option.is-selected{border-color:#315be8;background:#edf3ff;box-shadow:0 0 0 2px rgba(49,91,232,.12)}.dtr-punch-option.is-assigned{border-color:#75c9a5}.dtr-punch-option.is-sticker-target{border-color:#6938ef;background:#f3efff;box-shadow:0 0 0 3px rgba(105,56,239,.15);transform:scale(1.025)}.dtr-punch-option.sticker-pop{animation:dtrStickerPop .38s ease}.dtr-punch-option.is-ot-schedule{border-color:#c9b8ff;background:#f7f4ff}.dtr-punch-option.is-ot-schedule .dtr-punch-time{background:#6938ef}.dtr-punch-time{flex:0 0 auto;padding:7px 9px;border-radius:9px;background:#17233b;color:#fff;font-size:13px;font-weight:900}.dtr-punch-option.is-selected .dtr-punch-time{background:#315be8}.dtr-punch-details{min-width:0}.dtr-punch-details strong,.dtr-punch-details small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dtr-punch-details strong{font-size:12px}.dtr-punch-details small{margin-top:2px;color:#66758f;font-size:10px}.dtr-punch-assignment{width:max-content;max-width:100%;padding:2px 6px;border:1px dashed #b8c2d3;border-radius:5px;background:#fff;color:#66758f;transform:rotate(-1deg)}.dtr-punch-option.is-assigned .dtr-punch-assignment{border-style:solid;border-color:#75c9a5;background:#dcfae6;color:#067647;font-weight:900;box-shadow:0 2px 5px rgba(6,118,71,.12)}.dtr-punch-empty{grid-column:1/-1;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;text-align:center;font-size:12px;font-weight:700}
            .dtr-column-picker{grid-column:1/-1}.dtr-column-picker>span{display:block;margin-bottom:8px;color:#64748b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.dtr-column-list{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}.dtr-column-option{position:relative;overflow:hidden;padding:11px 5px 10px;border:1px solid #bdc9df;border-radius:7px;background:linear-gradient(145deg,#fff 0%,#eef3ff 100%);color:#34425d;font-size:10px;font-weight:900;cursor:grab;box-shadow:0 3px 7px rgba(23,35,59,.1);transform:rotate(-1deg);transition:transform .16s,box-shadow .16s,border-color .16s,opacity .16s,filter .16s}.dtr-column-option[data-dtr-target^="ot_"]{border-color:#f6b85f;background:linear-gradient(145deg,#fffaf0 0%,#ffedd5 100%);color:#b54708}.dtr-column-option:nth-child(even){transform:rotate(1deg)}.dtr-column-option::after{content:"";position:absolute;right:0;bottom:0;border-style:solid;border-width:0 0 8px 8px;border-color:transparent transparent #cbd8f5 transparent}.dtr-column-option[data-dtr-target^="ot_"]::after{border-color:transparent transparent #f6b85f transparent}.dtr-column-option:hover,.dtr-column-option.is-drop-target{border-color:#86a6ff;box-shadow:0 6px 13px rgba(49,91,232,.18);transform:translateY(-2px) rotate(0)}.dtr-column-option.is-selected{border-color:#315be8;background:linear-gradient(145deg,#416cff,#234bd5);color:#fff;box-shadow:0 5px 12px rgba(49,91,232,.28);transform:rotate(0) scale(1.03)}.dtr-column-option[data-dtr-target^="ot_"].is-selected{border-color:#f79009;background:linear-gradient(145deg,#fdb022,#dc6803);color:#fff;box-shadow:0 5px 12px rgba(220,104,3,.28)}.dtr-column-option.is-used:not(.is-selected){opacity:.38;filter:grayscale(.85) blur(.35px);cursor:not-allowed;box-shadow:none}.dtr-column-option.is-dragging{opacity:.5;cursor:grabbing;transform:rotate(5deg) scale(.94)}.dtr-punch-assignment[data-sticker-target^="ot_"]{border-color:#f6b85f!important;background:#fff3d6!important;color:#b54708!important;box-shadow:0 2px 5px rgba(181,71,8,.14)!important}.dtr-punch-assignment[data-remove-assignment]{cursor:pointer;padding-right:5px}.dtr-punch-assignment[data-remove-assignment]::after{content:" ×";padding-left:3px;font-size:12px}.dtr-correction-hide{margin-right:auto;background:#fff0ee;color:#b42318}.dtr-drag-help{grid-column:1/-1;margin:-4px 0 0;color:#66758f;font-size:11px;text-align:center}@keyframes dtrStickerPop{0%{transform:scale(.96)}55%{transform:scale(1.04)}100%{transform:scale(1)}}
            @media(max-width:560px){.dtr-correction-grid{grid-template-columns:1fr}.dtr-correction-wide{grid-column:auto}.dtr-punch-list{grid-template-columns:1fr}.dtr-column-list{grid-template-columns:repeat(3,1fr)}}
        `;
        document.head.appendChild(style);
        dialog = document.createElement("dialog");
        dialog.id = "dtr-correction-dialog";
        dialog.innerHTML = `
            <form class="dtr-correction-card" method="dialog" id="dtr-correction-form">
                <div class="dtr-correction-head"><div><small>Raw biometric punches</small><h3 id="dtr-correction-title">Manual DTR assignment</h3></div><button class="dtr-correction-close" type="button" aria-label="Close">&times;</button></div>
                <div class="dtr-correction-grid">
                    <label>Date<input id="dtr-correction-date" type="date" readonly></label>
                    <label>Clicked cell value<input id="dtr-correction-original" type="text" readonly></label>
                    <section class="dtr-punch-chooser" aria-labelledby="dtr-punch-title"><div class="dtr-punch-chooser-title"><span id="dtr-punch-title">Choose biometric or OT time</span><small id="dtr-punch-count">0 times</small></div><div class="dtr-punch-list" id="dtr-correction-punch" role="listbox"></div></section>
                    <section class="dtr-column-picker" aria-labelledby="dtr-column-title"><span id="dtr-column-title">Drag a column sticker onto a time</span><div class="dtr-column-list" id="dtr-correction-columns">${DTR_EDIT_FIELDS.map(([value, label]) => `<button class="dtr-column-option" type="button" draggable="true" data-dtr-target="${value}" title="Drag ${label} onto a time card">${label}</button>`).join("")}</div></section>
                    <p class="dtr-drag-help">Drag either direction: sticker to time, or time to sticker. Clicking still works.</p>
                </div>
                <p class="dtr-correction-message" id="dtr-correction-message" role="status"></p>
                <div class="dtr-correction-actions"><button class="dtr-correction-hide" type="submit" value="hide">Hide selected time</button><button class="dtr-correction-cancel" type="button">Cancel</button><button class="dtr-correction-save" type="submit" value="move">Move time</button></div>
            </form>`;
        document.body.appendChild(dialog);

        const close = () => typeof dialog.close === "function" ? dialog.close() : dialog.removeAttribute("open");
        dialog.querySelector(".dtr-correction-close")?.addEventListener("click", close);
        dialog.querySelector(".dtr-correction-cancel")?.addEventListener("click", close);
        dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
        const readAssignments = () => {
            try {
                return JSON.parse(dialog.dataset.assignments || "{}");
            } catch (_error) {
                return {};
            }
        };
        const refreshAssignments = () => {
            const assignments = readAssignments();
            const labels = Object.fromEntries(DTR_EDIT_FIELDS);
            const usedTargets = new Set(Object.values(assignments));
            // [FIX] Keyed by punch INDEX, not the raw time string — two biometric punches can
            // share the exact same clock time (duplicate minute-level punches), and keying by
            // time made both cards collapse onto the same assignment slot.
            dialog.querySelectorAll("[data-punch-index]").forEach((item) => {
                const index = item.getAttribute("data-punch-index") || "";
                const target = assignments[index] || "";
                item.classList.toggle("is-assigned", Boolean(target));
                const status = item.querySelector("[data-punch-assignment]");
                if (status) {
                    status.textContent = target ? `${labels[target] || target} attached` : "Drop sticker here";
                    if (target) {
                        status.setAttribute("data-remove-assignment", index);
                        status.setAttribute("data-sticker-target", target);
                    } else {
                        status.removeAttribute("data-remove-assignment");
                        status.removeAttribute("data-sticker-target");
                    }
                }
            });
            dialog.querySelectorAll("[data-dtr-target]").forEach((item) => {
                const used = usedTargets.has(item.getAttribute("data-dtr-target") || "");
                item.classList.toggle("is-used", used);
                item.setAttribute("aria-disabled", String(used));
            });
            dialog.querySelector(".dtr-correction-save").textContent = "Save sticker changes";
        };
        dialog.refreshAssignments = refreshAssignments;
        const selectPunch = (option) => {
            dialog.querySelectorAll("[data-punch-index]").forEach((item) => {
                const selected = item === option;
                item.classList.toggle("is-selected", selected);
                item.setAttribute("aria-selected", String(selected));
            });
            const index = option?.getAttribute("data-punch-index") || "";
            dialog.dataset.selectedPunch = index;
            const assignedTarget = readAssignments()[index] || "";
            dialog.dataset.targetField = assignedTarget;
            dialog.querySelectorAll("[data-dtr-target]").forEach((item) => item.classList.toggle("is-selected", item.getAttribute("data-dtr-target") === assignedTarget));
        };
        const selectTarget = (option) => {
            const selectedPunch = dialog.dataset.selectedPunch || "";
            const target = option?.getAttribute("data-dtr-target") || "";
            if (!selectedPunch || !target) {
                dialog.querySelector("#dtr-correction-message").textContent = "Choose a captured punch first.";
                return;
            }
            const assignments = readAssignments();
            // [FIX] Moving a sticker that's already attached elsewhere used to just block with an
            // error and make the user manually remove it first — real drag-and-drop should just
            // move it.
            const occupiedBy = Object.keys(assignments).find((index) => index !== selectedPunch && assignments[index] === target);
            if (occupiedBy) {
                delete assignments[occupiedBy];
            }
            assignments[selectedPunch] = target;
            dialog.dataset.assignments = JSON.stringify(assignments);
            dialog.querySelectorAll("[data-dtr-target]").forEach((item) => item.classList.toggle("is-selected", item === option));
            dialog.dataset.targetField = target;
            dialog.querySelector("#dtr-correction-message").textContent = occupiedBy ? "Sticker moved to the new time." : "";
            refreshAssignments();
            const assignedCard = Array.from(dialog.querySelectorAll("[data-punch-index]")).find((item) => item.getAttribute("data-punch-index") === selectedPunch);
            if (assignedCard) {
                assignedCard.classList.remove("sticker-pop");
                void assignedCard.offsetWidth;
                assignedCard.classList.add("sticker-pop");
            }
        };
        dialog.querySelector("#dtr-correction-punch")?.addEventListener("click", (event) => {
            const remove = event.target.closest("[data-remove-assignment]");
            if (remove) {
                const assignments = readAssignments();
                delete assignments[remove.getAttribute("data-remove-assignment") || ""];
                dialog.dataset.assignments = JSON.stringify(assignments);
                dialog.dataset.selectedPunch = "";
                dialog.dataset.targetField = "";
                dialog.querySelectorAll("[data-punch-time],[data-dtr-target]").forEach((item) => item.classList.remove("is-selected"));
                dialog.querySelector("#dtr-correction-message").textContent = "Sticker removed. Save changes to update the DTR.";
                refreshAssignments();
                return;
            }
            const option = event.target.closest("[data-punch-time]");
            if (option) selectPunch(option);
        });
        dialog.querySelector("#dtr-correction-punch")?.addEventListener("dragstart", (event) => {
            const option = event.target.closest("[data-punch-time]");
            if (!option) return;
            selectPunch(option);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            event.dataTransfer?.setData("text/plain", option.getAttribute("data-punch-time") || "");
        });
        dialog.querySelector("#dtr-correction-punch")?.addEventListener("dragover", (event) => {
            const option = event.target.closest("[data-punch-time]");
            if (!option || !Array.from(event.dataTransfer?.types || []).includes("application/x-dtr-column")) return;
            event.preventDefault();
            option.classList.add("is-sticker-target");
        });
        dialog.querySelector("#dtr-correction-punch")?.addEventListener("dragleave", (event) => {
            event.target.closest("[data-punch-time]")?.classList.remove("is-sticker-target");
        });
        dialog.querySelector("#dtr-correction-punch")?.addEventListener("drop", (event) => {
            const punch = event.target.closest("[data-punch-time]");
            const target = event.dataTransfer?.getData("application/x-dtr-column") || "";
            if (!punch || !DTR_EDIT_FIELDS.some(([field]) => field === target)) return;
            event.preventDefault();
            dialog.querySelectorAll(".is-sticker-target").forEach((item) => item.classList.remove("is-sticker-target"));
            selectPunch(punch);
            selectTarget(Array.from(dialog.querySelectorAll("[data-dtr-target]")).find((item) => item.getAttribute("data-dtr-target") === target));
        });
        dialog.querySelector("#dtr-correction-columns")?.addEventListener("dragstart", (event) => {
            const option = event.target.closest("[data-dtr-target]");
            if (!option || !event.dataTransfer) return;
            if (option.classList.contains("is-used")) {
                event.preventDefault();
                dialog.querySelector("#dtr-correction-message").textContent = "This sticker is already attached. Remove it from its time card first.";
                return;
            }
            option.classList.add("is-dragging");
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("application/x-dtr-column", option.getAttribute("data-dtr-target") || "");
            event.dataTransfer.setData("text/plain", option.textContent?.trim() || "");
        });
        dialog.querySelector("#dtr-correction-columns")?.addEventListener("dragend", () => {
            dialog.querySelectorAll(".is-dragging,.is-sticker-target").forEach((item) => item.classList.remove("is-dragging", "is-sticker-target"));
        });
        dialog.querySelector("#dtr-correction-columns")?.addEventListener("click", (event) => {
            const option = event.target.closest("[data-dtr-target]");
            if (option) selectTarget(option);
        });
        dialog.querySelector("#dtr-correction-columns")?.addEventListener("dragover", (event) => {
            const option = event.target.closest("[data-dtr-target]");
            if (!option) return;
            event.preventDefault();
            dialog.querySelectorAll("[data-dtr-target]").forEach((item) => item.classList.toggle("is-drop-target", item === option));
        });
        dialog.querySelector("#dtr-correction-columns")?.addEventListener("dragleave", (event) => {
            event.target.closest("[data-dtr-target]")?.classList.remove("is-drop-target");
        });
        dialog.querySelector("#dtr-correction-columns")?.addEventListener("drop", (event) => {
            const option = event.target.closest("[data-dtr-target]");
            if (!option) return;
            event.preventDefault();
            dialog.querySelectorAll("[data-dtr-target]").forEach((item) => item.classList.remove("is-drop-target"));
            selectTarget(option);
        });
        dialog.querySelector("#dtr-correction-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const mode = event.submitter?.value === "hide" ? "hide" : "move";
            const selectedPunch = dialog.dataset.selectedPunch || "";
            const clickedTime = dtrValueAs24Hour(dialog.dataset.clickedValue || "", dialog.dataset.clickedField || "");
            const message = dialog.querySelector("#dtr-correction-message");
            const save = dialog.querySelector(".dtr-correction-save");
            let rowValues = [];
            try {
                rowValues = JSON.parse(dialog.dataset.rowValues || "[]");
            } catch (_error) {
                rowValues = [];
            }
            let punchTimes = [];
            try {
                punchTimes = JSON.parse(dialog.dataset.punchTimes || "[]");
            } catch (_error) {
                punchTimes = [];
            }
            // assignments/initialAssignments are keyed by punch INDEX; the backend needs the
            // actual clock time, so every index gets resolved through this before it's sent.
            const timeForIndex = (index) => String(punchTimes[Number(index)] || "");
            // [FIX] Was `.filter(([_field, index]) => ...)`, which destructured DTR_EDIT_FIELDS'
            // display LABEL ("AM IN") into `index` instead of the field's real array position —
            // `rowValues[index]` was therefore always undefined, so this always returned [].
            // That silently broke "Hide selected time" (always fell into "no time" empty state).
            const sourceFieldsFor = (time) => DTR_EDIT_FIELDS
                .filter((_entry, index) => time && String(rowValues[index] || "") === time)
                .map(([field]) => field);
            const changesByField = new Map();
            if (mode === "hide") {
                const sourceTime = selectedPunch ? timeForIndex(selectedPunch) : clickedTime;
                sourceFieldsFor(sourceTime).forEach((field) => changesByField.set(field, ""));
                if (!changesByField.size) {
                    message.textContent = "Select a displayed biometric time to hide.";
                    return;
                }
            } else {
                const assignments = readAssignments();
                let initialAssignments = {};
                try {
                    initialAssignments = JSON.parse(dialog.dataset.initialAssignments || "{}");
                } catch (_error) {
                    initialAssignments = {};
                }
                const changedIndexes = new Set([...Object.keys(initialAssignments), ...Object.keys(assignments)]);
                changedIndexes.forEach((index) => {
                    const oldTarget = initialAssignments[index] || "";
                    const newTarget = assignments[index] || "";
                    if (oldTarget && oldTarget !== newTarget) changesByField.set(oldTarget, "");
                });
                Object.entries(assignments).forEach(([index, target]) => {
                    sourceFieldsFor(timeForIndex(index)).forEach((field) => {
                        if (field !== target) changesByField.set(field, "");
                    });
                });
                Object.entries(assignments).forEach(([index, target]) => changesByField.set(target, timeForIndex(index)));
                changedIndexes.forEach((index) => {
                    if ((initialAssignments[index] || "") === (assignments[index] || "")) {
                        const unchangedTarget = assignments[index] || "";
                        if (unchangedTarget) changesByField.delete(unchangedTarget);
                    }
                });
                if (!changesByField.size) {
                    message.textContent = "No sticker changes to save.";
                    return;
                }
            }
            const changes = Array.from(changesByField, ([field_name, proposed_value]) => ({ field_name, proposed_value }));
            save.disabled = true;
            message.textContent = mode === "hide" ? "Hiding time..." : "Saving sticker changes...";
            try {
                const response = await fetch(`${DTR_API}?action=submit_correction`, {
                    method: "POST",
                    credentials: "include",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({
                        work_date: dialog.dataset.workDate,
                        changes
                    })
                });
                const payload = await response.json().catch(() => ({ ok: false }));
                if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to save correction.");
                close();
                await renderDtrSheet(new Date(`${dialog.dataset.workDate}T00:00:00`));
            } catch (error) {
                message.textContent = error.message || "Unable to save correction.";
            } finally {
                save.disabled = false;
            }
        });
        return dialog;
    }

    function canSubmitDtrCorrections() {
        // Same "token 6-10" privilege convention used elsewhere (e.g. dashboard privilegeTokens/isPrivilege10).
        // Backend now enforces this too (dtrService.canManageCorrections, 403 otherwise) — this is UI-only.
        const tokens = `${session.privilage || ""}-${session.privilagemenu || ""}`.split(/[^0-9]+/).filter(Boolean);
        return tokens.some((token) => Number(token) >= 6 && Number(token) <= 10);
    }

    function openDtrCorrectionDialog(cell) {
        if (!canSubmitDtrCorrections()) return;
        const dialog = ensureDtrCorrectionDialog();
        const workDate = cell.getAttribute("data-dtr-edit-date") || "";
        const value = cell.getAttribute("data-dtr-edit-value") || "";
        let punches = [];
        try {
            punches = JSON.parse(cell.getAttribute("data-dtr-biometric-punches") || "[]");
        } catch (_error) {
            punches = [];
        }
        let overtimeTimes = [];
        try {
            overtimeTimes = JSON.parse(cell.getAttribute("data-dtr-overtime-times") || "[]");
        } catch (_error) {
            overtimeTimes = [];
        }
        // ponytail: keep duplicate minute-level punches visible; the biometric feed may contain separate records with the same time.
        const timeOptions = [...punches, ...overtimeTimes].filter((item) => item?.time);
        dialog.dataset.workDate = workDate;
        dialog.dataset.clickedField = cell.getAttribute("data-dtr-edit-field") || "";
        dialog.dataset.clickedValue = value;
        dialog.dataset.rowValues = cell.getAttribute("data-dtr-row-values") || "[]";
        dialog.dataset.selectedPunch = "";
        dialog.dataset.targetField = "";
        let currentRowValues = [];
        try {
            currentRowValues = JSON.parse(dialog.dataset.rowValues);
        } catch (_error) {
            currentRowValues = [];
        }
        // [FIX] Keyed by punch INDEX, not time — a duplicate-time punch (same clock minute
        // recorded twice) used to collapse onto the same key as its sibling, so only one of the
        // two could ever be assigned and both showed the same "attached" badge. Each field claims
        // the first still-unclaimed punch matching its stored time, so duplicates land on
        // different physical punches.
        const claimedPunchIndexes = new Set();
        const initialAssignments = {};
        DTR_EDIT_FIELDS.forEach(([field], fieldIndex) => {
            const time = String(currentRowValues[fieldIndex] || "");
            if (!time) return;
            const matchIndex = timeOptions.findIndex((option, optionIndex) => option.time === time && !claimedPunchIndexes.has(optionIndex));
            if (matchIndex >= 0) {
                claimedPunchIndexes.add(matchIndex);
                initialAssignments[String(matchIndex)] = field;
            }
        });
        console.assert(
            new Set(Object.values(initialAssignments)).size === Object.values(initialAssignments).length,
            "Each DTR column sticker must be assigned to only one time."
        );
        dialog.dataset.punchTimes = JSON.stringify(timeOptions.map((option) => option.time || ""));
        dialog.dataset.assignments = JSON.stringify(initialAssignments);
        dialog.dataset.initialAssignments = JSON.stringify(initialAssignments);
        dialog.querySelector("#dtr-correction-date").value = workDate;
        dialog.querySelector("#dtr-correction-original").value = value || "No biometric value";
        dialog.querySelectorAll("[data-dtr-target]").forEach((item) => item.classList.remove("is-selected", "is-drop-target"));
        const punchList = dialog.querySelector("#dtr-correction-punch");
        dialog.querySelector("#dtr-punch-count").textContent = `${timeOptions.length} time${timeOptions.length === 1 ? "" : "s"}`;
        punchList.innerHTML = timeOptions.length
            ? timeOptions.map((punch, index) => {
                const type = String(punch.type || "").toUpperCase();
                const typeLabel = type === "I" ? "IN punch" : (type === "O" ? "OUT punch" : (type || "RAW punch"));
                const scheduleClass = punch.source === "overtime" ? " is-ot-schedule" : "";
                const sourceLabel = punch.source === "overtime" ? punch.area : `${punch.area || "Biometric device"} · Bio record ${index + 1}`;
                return `<button class="dtr-punch-option${scheduleClass}" type="button" role="option" aria-selected="false" draggable="true" data-punch-time="${escapeHtml(punch.time || "")}" data-punch-index="${index}"><span class="dtr-punch-time">${escapeHtml(punch.display_time || punch.time || "--:--")}</span><span class="dtr-punch-details"><strong>${escapeHtml(typeLabel)}</strong><small>${escapeHtml(sourceLabel)}</small><small class="dtr-punch-assignment" data-punch-assignment>Drop sticker here</small></span></button>`;
            }).join("")
            : '<div class="dtr-punch-empty">No biometric punches or overtime schedule for this date</div>';
        dialog.querySelector("#dtr-correction-message").textContent = "";
        dialog.refreshAssignments?.();
        typeof dialog.showModal === "function" ? dialog.showModal() : dialog.setAttribute("open", "");
    }

    function bindDtrCorrectionCells(scope) {
        if (scope.dataset.correctionBound === "1") return;
        scope.dataset.correctionBound = "1";
        scope.addEventListener("click", (event) => {
            const cell = event.target.closest("[data-dtr-edit-field]");
            if (cell) openDtrCorrectionDialog(cell);
        });
        scope.addEventListener("keydown", (event) => {
            if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-dtr-edit-field]")) {
                event.preventDefault();
                openDtrCorrectionDialog(event.target);
            }
        });
    }

    function weekendRow(year, monthIndex, day) {
        const weekDay = new Date(year, monthIndex, day).getDay();
        if (weekDay === 6) {
            return { label: "SATURDAY" };
        }
        if (weekDay === 0) {
            return { label: "SUNDAY" };
        }

        return null;
    }

    function isEmptyDtrValue(value) {
        const text = String(value ?? "").trim();
        return !text || text === "0" || text === "0.00" || text === "0:00";
    }

    function isIdleDtrRow(row) {
        return Array.isArray(row) && row.slice(0, 7).every(isEmptyDtrValue);
    }

    function renderDtrTable(dtrRows, range) {
        const dtrTableBody = document.getElementById("dtr-table-body");
        if (!dtrTableBody) {
            return;
        }

        latestDtrRows = dtrRows || {};
        latestDtrRange = range || null;

        let totalUnderTime = 0;
        const rows = [];
        for (let day = 1; day <= range.days; day += 1) {
            const sourceRow = dtrRows[day];
            const weekend = weekendRow(range.year, range.monthIndex, day);
            const row = Array.isArray(sourceRow) ? sourceRow : (Array.isArray(weekend) ? weekend : ["", "", "", "", "", "", ""]);
            if (!Array.isArray(sourceRow) && sourceRow?.label) {
                const labelClass = String(sourceRow.label).toUpperCase() === "HOLIDAY" ? "holiday-row" : "day-off";
                rows.push(`
                    <tr>
                        <td class="day-cell">${day}</td>
                        <td class="${labelClass}" colspan="7">${escapeHtml(sourceRow.label)}</td>
                    </tr>
                `);
                continue;
            }

            if (weekend && isIdleDtrRow(row)) {
                const labelClass = String(weekend.label).toUpperCase() === "HOLIDAY" ? "holiday-row" : "day-off";
                const workDate = `${range.year}-${String(range.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                rows.push(`
                    <tr>
                        <td class="day-cell">${day}</td>
                        <td class="${labelClass}" colspan="7">${escapeHtml(weekend.label)} <button type="button" data-dtr-edit-date="${workDate}" data-dtr-edit-field="ot_in" data-dtr-edit-value="" style="margin-left:10px;border:1px solid #c8d3eb;border-radius:8px;padding:3px 8px;background:#fff;color:#315be8;font-size:9px;font-weight:800;cursor:pointer;">Add OT correction</button></td>
                    </tr>
                `);
                continue;
            }

            const undertime = row[6] || "";
            totalUnderTime += Number.parseInt(undertime || "0", 10) || 0;
            const isLetterRow = row.slice(0, 6).every((value) => value && !value.includes(":") && Number.isNaN(Number(value)));

            const activityCells = row.activityCells || [];
            const correctionCells = row.correctionCells || {};
            const workDate = row.workDate || `${range.year}-${String(range.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const biometricPunches = Array.isArray(row.biometricPunches) ? row.biometricPunches : [];
            const biometricPunchesAttr = escapeHtml(JSON.stringify(biometricPunches));
            const overtimeScheduleTimes = activityCells.flat().filter((activity) => activity?.type === "overtime").flatMap((activity) => [
                { time: dtrScheduleTimeValue(activity.timeFrom), display_time: activity.timeFrom, type: "OT START", area: activity.statusLabel, source: "overtime" },
                { time: dtrScheduleTimeValue(activity.timeTo), display_time: activity.timeTo, type: "OT END", area: activity.statusLabel, source: "overtime" }
            ]).filter((item) => item.time);
            const overtimeScheduleAttr = escapeHtml(JSON.stringify(overtimeScheduleTimes));
            const rowMoveValues = row.slice(0, 6).map((value, column) => {
                const correction = correctionCells[column] || row.approvedCorrections?.[DTR_EDIT_FIELDS[column][0]] || null;
                return correction?.proposed_value !== undefined
                    ? String(correction.proposed_value || "")
                    : dtrValueAs24Hour(value, DTR_EDIT_FIELDS[column][0]);
            });
            const rowValuesAttr = escapeHtml(JSON.stringify(rowMoveValues));
            const hasUndertime = (Number.parseInt(undertime || "0", 10) || 0) > 0;
            const dayHasPunches = row.slice(0, 6).some((value) => value && String(value).trim());
            const isPastDay = new Date(`${workDate}T00:00:00`) < new Date(new Date().toDateString());
            const dayStatus = dayHasPunches ? (hasUndertime ? "undertime" : "present") : (isPastDay ? "absent" : "");
            const statusDot = dayStatus ? `<span class="status-dot status-${dayStatus}" title="${dayStatus}"></span>` : "";
            rows.push(`
                <tr>
                    <td class="day-cell">${day}${statusDot}${biometricPunches.length ? `<small title="${escapeHtml(biometricPunches.map((punch) => [punch.display_time || punch.time, punch.type, punch.area].filter(Boolean).join(" · ")).join(" | "))}" style="display:block;color:#66758f;font-size:8px;font-weight:800;">${biometricPunches.length} bio</small>` : ""}</td>
                    ${row.slice(0, 6).map((value, column) => {
                        const markers = Array.isArray(activityCells[column]) ? activityCells[column] : [];
                        const correction = correctionCells[column] || row.approvedCorrections?.[DTR_EDIT_FIELDS[column][0]] || null;
                        const isHidden = correction && String(correction.proposed_value || "") === "";
                        const tone = correction && !isHidden ? dtrCorrectionTone(correction) : null;
                        const displayValue = value || "";
                        const hasContent = Boolean(displayValue) || markers.length > 0 || Boolean(correction && !isHidden);
                        return `
                            <td class="${hasContent ? (isLetterRow ? "day-off" : "") : "empty-slot"}" data-dtr-edit-date="${escapeHtml(workDate)}" data-dtr-edit-field="${escapeHtml(DTR_EDIT_FIELDS[column][0])}" data-dtr-edit-value="${escapeHtml(value || "")}" data-dtr-row-values="${rowValuesAttr}" data-dtr-biometric-punches="${biometricPunchesAttr}" data-dtr-overtime-times="${overtimeScheduleAttr}" tabindex="0" role="button" title="Edit ${escapeHtml(DTR_EDIT_FIELDS[column][1])}" style="cursor:pointer;${tone ? `background:${tone.background};color:${tone.color};` : ""}">
                                ${escapeHtml(displayValue || "")}
                                ${markers.map((marker) => {
                                    const markerColor = marker.type === "overtime" ? "#6938ef" : "#155eef";
                                    return `<span title="${escapeHtml(marker.label)}" style="display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${markerColor};font-size:10px;font-weight:800;line-height:1.15;">${escapeHtml(marker.label)}</span>`;
                                }).join("")}
                            </td>
                        `;
                    }).join("")}
                    <td class="${hasUndertime ? "has-undertime" : ""}">${escapeHtml(undertime)}</td>
                </tr>
            `);
        }

        dtrTableBody.innerHTML = rows.join("");
        setText("dtr-total-undertime", String(totalUnderTime));
        bindDtrCorrectionCells(dtrTableBody);
        if (document.getElementById("overtime-time-presets-list")) {
            const selectedOtMonth = (document.getElementById("overtime-date")?.value || "").slice(0, 7);
            const renderedDtrMonth = `${range.year}-${String(range.monthIndex + 1).padStart(2, "0")}`;
            if (!selectedOtMonth || selectedOtMonth === renderedDtrMonth) {
                renderOvertimeTimePresets(dtrOvertimeTimePresets());
            }
        }
    }
    function renderDtrQueryDebug() {
        const debug = document.getElementById("dtr-query-debug");
        if (debug) {
            debug.remove();
        }
    }

    function setDtrHeader(monthName, year) {
        const monthBadge = document.getElementById("dtr-month-badge");
        const areaBadge = document.getElementById("dtr-area-badge");
        const queriedIds = lastDtrQuery.attempts.length ? lastDtrQuery.attempts.join(" / ") : resolveDtrEmployeeId();
        const areaText = (employee.area || session.area || "MAIN OFFICE").toUpperCase();

        setText("dtr-month-badge", `${monthName.toUpperCase()} ${year}`);
        setText("dtr-area-badge", areaText);
        if (monthBadge) {
            monthBadge.title = `DTR month: ${monthName} ${year}`;
        }
        if (areaBadge) {
            areaBadge.title = `DTR query IDs: ${queriedIds}`;
        }
        renderDtrQueryDebug();
    }

    async function tryDtrRange(range, profile = null) {
        const resolvedUsercodes = resolveDtrEmployeeIds(profile);
        const preferredUsercode = String(lastDtrQuery.employeeId || "").trim().toUpperCase();
        const usercodes = preferredUsercode && resolvedUsercodes.includes(preferredUsercode)
            ? [preferredUsercode, ...resolvedUsercodes.filter((item) => item !== preferredUsercode)]
            : resolvedUsercodes;
        const attempts = [];
        for (const usercode of usercodes) {
            const params = new URLSearchParams({
                action: "monthly_computed",
                date_from: range.from,
                date_to: range.to,
                usercode
            });

            attempts.push(usercode);
            const { response, payload } = await fetchJsonWithSessionRetry(
                `${DTR_API}?${params.toString()}`,
                {
                    cache: "no-store",
                    credentials: "include",
                    headers: getAuthHeaders()
                },
                "Invalid DTR server response."
            );

            if (!response.ok || !payload.ok) {
                continue;
            }

            const items = payload.items || payload.records || payload.rows || payload.data || [];
            const resolvedEmployee = payload.employee || null;
            if (Array.isArray(items) && items.length > 0) {
                lastDtrQuery = { employeeId: usercode, attempts, range, profile, resolvedEmployee };
                return items;
            }

            lastDtrQuery = { employeeId: usercode, attempts, range, profile, resolvedEmployee };
        }

        lastDtrQuery = {
            employeeId: usercodes[0] || "",
            attempts: attempts.length ? attempts : usercodes,
            range,
            profile,
            resolvedEmployee: null
        };
        return [];
    }

    async function requestDtrRecords(range) {
        const profile = await getCurrentSessionProfile();
        const usercodes = resolveDtrEmployeeIds(profile);
        if (!usercodes.length) {
            lastDtrQuery = { employeeId: "", attempts: [], range, requestedRange: range, fallbackUsed: false, profile, resolvedEmployee: null };
            return [];
        }

        // ponytail: never cache the still-changing current month — punches/EPASS/OT/corrections
        // land throughout the day and a 12h cache hid them behind stale data. Closed past months
        // don't change anymore, so caching those is still safe and keeps re-visits fast.
        const today = new Date();
        const isCurrentMonth = range.year === today.getFullYear() && range.monthIndex === today.getMonth();

        if (!isCurrentMonth) {
            const cachedKeys = usercodes.map((usercode) => `${DTR_CACHE_VERSION}:${usercode}:${range.from}:${range.to}`);
            for (let index = 0; index < usercodes.length; index += 1) {
                const usercode = usercodes[index];
                const cached = getCachedValue("employees_profile_dtr", cachedKeys[index], 12 * 60 * 60 * 1000);
                if (Array.isArray(cached) && cached.length > 0) {
                    lastDtrQuery = { employeeId: usercode, attempts: usercodes.slice(), range, requestedRange: range, fallbackUsed: false, profile, resolvedEmployee: null };
                    return cached;
                }
            }
        }

        const items = await tryDtrRange(range, profile);
        if (Array.isArray(items) && items.length > 0) {
            if (!isCurrentMonth) {
                const key = `${DTR_CACHE_VERSION}:${lastDtrQuery.employeeId}:${range.from}:${range.to}`;
                setCachedValue("employees_profile_dtr", key, items);
            }
            lastDtrQuery.requestedRange = range;
            lastDtrQuery.fallbackUsed = false;
            return items;
        }
        // ponytail: selected month only; automatic year-wide searching caused dozens of blocking requests.
        lastDtrQuery.requestedRange = range;
        lastDtrQuery.fallbackUsed = false;
        return [];
    }

    async function requestDtrLeaveSummary(range) {
        const profile = await getCurrentSessionProfile();
        const usercode = resolveDtrEmployeeIds(profile)[0] || resolveDtrEmployeeId();
        if (!usercode) {
            return null;
        }
        const key = `${DTR_CACHE_VERSION}:leave_summary:${usercode}:${range.from}:${range.to}`;
        const cached = getCachedValue("employees_profile_leave_summary_v3", key, 12 * 60 * 60 * 1000);
        if (cached) {
            return cached;
        }

        const params = new URLSearchParams({
            action: "leave_summary",
            date_from: range.from,
            date_to: range.to,
            usercode
        });

        const { response, payload } = await fetchJsonWithSessionRetry(
            `${DTR_API}?${params.toString()}`,
            {
                cache: "no-store",
                credentials: "include",
                headers: getAuthHeaders()
            },
            "Invalid DTR server response."
        );

        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Unable to load leave credits.");
        }

        const summary = payload.summary || null;
        if (summary) {
            setCachedValue("employees_profile_leave_summary_v3", key, summary);
        }
        return summary;
    }

    // EDIT GUIDE: Index 0 is January and index 11 is December; each row must total exactly 20.00.
    // HUWAG BAGUHIN: Daily ALC points use the month's combined VL + SL credit divided by the fixed 30-day basis.
    const ALC_MONTHLY_VL_CREDITS = Object.freeze([1.67, 1.66, 1.67, 1.67, 1.66, 1.67, 1.67, 1.66, 1.67, 1.67, 1.66, 1.67]);
    const ALC_MONTHLY_SL_CREDITS = Object.freeze([1.66, 1.67, 1.67, 1.66, 1.67, 1.67, 1.66, 1.67, 1.67, 1.66, 1.67, 1.67]);
    const ALC_CREDIT_DAYS_PER_MONTH = 30;

    async function requestDtrAnnualLeave(year) {
        const profile = await getCurrentSessionProfile();
        const usercode = resolveDtrEmployeeIds(profile)[0] || resolveDtrEmployeeId();
        if (!usercode) {
            return [];
        }

        const cacheKey = `${DTR_CACHE_VERSION}:leave_annual:${usercode}:${year}`;
        const cached = getCachedValue("employees_profile_leave_annual_v8", cacheKey, 12 * 60 * 60 * 1000);
        if (cached) {
            return cached;
        }

        const monthRows = [];
        for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
            const from = datePart(year, monthIndex, 1);
            const to = datePart(year, monthIndex, new Date(year, monthIndex + 1, 0).getDate());
            const params = new URLSearchParams({
                action: "monthly_computed",
                date_from: from,
                date_to: to,
                usercode
            });

            const { response, payload } = await fetchJsonWithSessionRetry(
                `${DTR_API}?${params.toString()}`,
                {
                    cache: "no-store",
                    credentials: "include",
                    headers: getAuthHeaders()
                },
                "Invalid DTR server response."
            );

            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load yearly DTR summary.");
            }

            const items = Array.isArray(payload.items) ? payload.items : [];
            const byDay = new Map();
            items.forEach((item) => {
                const workDate = String(item.work_date || "").trim();
                const dayMatch = workDate.match(/-(\d{2})$/);
                const day = Number(dayMatch ? dayMatch[1] : 0);
                if (!day) {
                    return;
                }
                byDay.set(day, item);
            });

            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
            const workedDays = items.length;
            monthRows.push({
                monthIndex,
                monthLabel: new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "short" }).toUpperCase(),
                workingDays: workedDays,
                daysInMonth,
                byDay,
                items
            });
        }

        const annualVlTotal = Number(ALC_MONTHLY_VL_CREDITS.reduce((total, credit) => total + credit, 0).toFixed(2));
        const annualSlTotal = Number(ALC_MONTHLY_SL_CREDITS.reduce((total, credit) => total + credit, 0).toFixed(2));
        let cumulativeVl = 0;
        let cumulativeSl = 0;
        const annual = monthRows.map((entry, monthIndex) => {
            const vlShare = ALC_MONTHLY_VL_CREDITS[monthIndex];
            const slShare = ALC_MONTHLY_SL_CREDITS[monthIndex];
            const combinedShare = Number((vlShare + slShare).toFixed(2));
            const workingDays = Number(entry.workingDays || 0);
            const daysInMonth = Number(entry.daysInMonth || 0);
            const dailyPoint = combinedShare / ALC_CREDIT_DAYS_PER_MONTH;
            cumulativeVl = Number((cumulativeVl + vlShare).toFixed(2));
            cumulativeSl = Number((cumulativeSl + slShare).toFixed(2));
            const days = Array.from({ length: daysInMonth }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const dateValue = datePart(year, monthIndex, day);
                const weekday = new Date(year, monthIndex, day).getDay();
                const item = entry.byDay.get(day) || null;
                const marker = leaveCalendarMarkers[dateValue] || null;
                const labelFromItem = String(item?.special_label || item?.special || item?.label || item?.description || "").trim();
                if (labelFromItem && !item?.morning_in && !item?.morning_out && !item?.afternoon_in && !item?.afternoon_out) {
                    const normalized = labelFromItem.toUpperCase();
                    return {
                        day,
                        status: normalized.includes("HOLIDAY") ? "HOLIDAY" : normalized,
                        label: labelFromItem.toUpperCase(),
                        points: dailyPoint
                    };
                }
                if (marker?.type === "holiday" || String(marker?.label || "").toUpperCase().includes("HOLIDAY")) {
                    return { day, status: "HOLIDAY", label: "HOLIDAY", points: dailyPoint };
                }
                if (weekday === 6) {
                    return { day, status: "SATURDAY", label: "SATURDAY", points: dailyPoint };
                }
                if (weekday === 0) {
                    return { day, status: "SUNDAY", label: "SUNDAY", points: dailyPoint };
                }
                if (item) {
                    return { day, status: "WORKDAY", label: "", points: dailyPoint };
                }
                return { day, status: "ABSENT", label: "", points: dailyPoint };
            });

            return {
                monthIndex,
                monthLabel: entry.monthLabel,
                summary: {
                    earned_vl: vlShare,
                    earned_sl: slShare,
                    current_vl: cumulativeVl,
                    current_sl: cumulativeSl,
                    projected_vl: annualVlTotal,
                    projected_sl: annualSlTotal,
                    attendance_ratio: daysInMonth > 0 ? Number(((workingDays / daysInMonth) * 100).toFixed(1)) : 0,
                    present_days: workingDays,
                    working_days: daysInMonth,
                    days
                }
            };
        });

        setCachedValue("employees_profile_leave_annual_v8", cacheKey, annual);
        return annual;
    }
    function dtrIsFutureAnnualMonth(year, monthIndex) {
        const targetYear = Number(year);
        const targetMonth = Number(monthIndex);
        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth)) {
            return false;
        }
        const now = new Date();
        if (targetYear > now.getFullYear()) {
            return true;
        }
        if (targetYear < now.getFullYear()) {
            return false;
        }
        return targetMonth > now.getMonth();
    }

    function dtrAnnualMonthOpacity(year, monthIndex) {
        return dtrIsFutureAnnualMonth(year, monthIndex) ? 'opacity: 0.42;' : '';
    }

    function renderDtrSheetSummaryRows(annual, range) {
        const columns = Array.isArray(annual) ? annual : [];
        const latestMonthIndex = Math.max(0, Math.min(columns.length - 1, range?.monthIndex || 0));
        const rows = [
            {
                label: "VL",
                field: "earned_vl"
            },
            {
                label: "SL",
                field: "earned_sl"
            }
        ];

        return rows.map((row) => `
            <tr class="dtr-sheet-summary" style="height: 30px;">
                <th class="dtr-sheet-label" style="height: 30px; padding: 8px 6px;">${escapeHtml(row.label)}</th>
                ${columns.map((entry) => {
                    const summary = entry.summary || {};
                    const value = Number(summary[row.field] || 0).toFixed(2);
                    const latestClass = entry.monthIndex === latestMonthIndex ? " dtr-latest-point" : "";
                    const monthStyle = dtrAnnualMonthOpacity(range?.year, entry.monthIndex);
                    const highlightStyle = latestClass ? 'background: rgba(74, 144, 255, 0.14); color: #173d92; font-weight: 800;' : '';
                    const styleParts = [monthStyle, highlightStyle].filter(Boolean).join(' ');
                    return `<td class="${latestClass.trim()}"${styleParts ? ` style="${styleParts}"` : ""}>${escapeHtml(value)}</td>`;
                }).join("")}
                <td class="dtr-sheet-total" style="height: 30px; padding: 8px 6px;">${escapeHtml(columns.reduce((total, entry) => total + Number((entry.summary || {})[row.field] || 0), 0).toFixed(2))}</td>
            </tr>
        `).join("");
    }

    function renderDtrMonthSubheader(months, year = new Date().getFullYear()) {
        return `
            <tr class="dtr-sheet-subheader" style="height: 28px;">
                <th class="dtr-sheet-label" style="height: 28px; padding: 7px 6px;">#</th>
                ${months.map((entry) => {
                    const monthStyle = dtrAnnualMonthOpacity(year, entry.monthIndex);
                    const highlightStyle = 'background: rgba(74, 144, 255, 0.10); color: #173d92;';
                    const styleParts = [monthStyle, highlightStyle].filter(Boolean).join(' ');
                    const cellStyle = styleParts ? `${styleParts} height: 28px; padding: 7px 6px;` : 'height: 28px; padding: 7px 6px;';
                    return `<th${cellStyle ? ` style="${cellStyle}"` : ""}>PTS</th>`;
                }).join("")}
                <th class="dtr-sheet-total" style="height: 28px; padding: 7px 6px;">TOTAL</th>
            </tr>
        `;
    }

    function renderDtrBottomRows(annual, year = new Date().getFullYear()) {
        const columns = Array.isArray(annual) ? annual : [];
        const footerRows = [
            {
                label: "VL",
                name: "Vacation Leave",
                key: "earned_vl",
                tone: "vl",
                total: Number(session.VLbal || 0),
                monthly: columns.map((entry) => Number(entry.summary?.earned_vl || 0))
            },
            {
                label: "SL",
                name: "Sick Leave",
                key: "earned_sl",
                tone: "sl",
                total: Number(session.SLbal || 0),
                monthly: columns.map((entry) => Number(entry.summary?.earned_sl || 0))
            },
            {
                label: "EL",
                name: "Emergency Leave",
                key: "el",
                tone: "el",
                total: Number(session.OLbal || 0),
                monthly: columns.map(() => 0)
            },
            {
                label: "PL",
                name: "Privilege Leave",
                key: "pl",
                tone: "pl",
                total: Number(session.PLbal || 0),
                monthly: columns.map(() => 0)
            },
            {
                label: "UL",
                name: "Union Leave",
                key: "ul",
                tone: "ul",
                total: Number(session.ULbal || 0),
                monthly: columns.map(() => 0)
            }
        ];

        const monthCount = columns.length > 0 ? columns.length : 12;
        const combinedMonthly = Array.from({ length: monthCount }, (_, monthIndex) =>
            footerRows.reduce((sum, row) => sum + Number(row.monthly[monthIndex] || 0), 0)
        );
        const yearCombinedEarned = combinedMonthly.reduce((sum, value) => sum + Number(value || 0), 0);

        return `
            <tr class="dtr-footer-row dtr-footer-row-total tone-total" style="height: 28px;">
                <th class="dtr-footer-label" style="height: 28px; padding: 7px 6px;">
                    <span class="dtr-footer-label-compact"><strong>TOTAL</strong><small>Â· all types</small></span>
                </th>
                ${combinedMonthly.map((value, monthIndex) => {
                    const monthStyle = dtrAnnualMonthOpacity(year, monthIndex);
                    const highlightStyle = 'background: rgba(74, 144, 255, 0.14); color: #173d92; font-weight: 800;';
                    const styleParts = [monthStyle, highlightStyle].filter(Boolean).join(' ');
                    return `<td${styleParts ? ` style="${styleParts}"` : ""}>${escapeHtml(Number(value || 0).toFixed(2))}</td>`;
                }).join("")}
                <td class="dtr-footer-total" style="height: 28px; padding: 7px 6px;">${escapeHtml(yearCombinedEarned.toFixed(2))}</td>
            </tr>
        `;
    }

    function renderDtrFooterLegend() {
        return `
            <div class="dtr-footer-legend">
                <span class="dtr-legend-chip">Saturday, Sunday, and Holiday = with daily points</span>
                <span class="dtr-legend-chip vl">Birthday Leave</span>
                <span class="dtr-legend-chip sl">Medical Leave</span>
                <span class="dtr-legend-chip el">Fiesta Leave</span>
                <span class="dtr-legend-chip pl">Union Leave</span>
                <span class="dtr-legend-chip ul">PL / ML</span>
                <span class="dtr-legend-chip spl">SPL</span>
            </div>
        `;
    }

    function sumDtrAnnualField(annual, field, monthLimit = null) {
        const rows = Array.isArray(annual) ? annual : [];
        return rows.reduce((sum, entry, index) => {
            if (monthLimit != null && index > monthLimit) {
                return sum;
            }
            return sum + Number(entry?.summary?.[field] || 0);
        }, 0);
    }

    function renderDtrLeavePointsAside(summary, range = null, annual = []) {
        const rows = Array.isArray(annual) ? annual : [];
        const monthIndex = Number(range?.monthIndex ?? new Date().getMonth());
        const yearCap = 20;
        const currentVl = rows.slice(0, monthIndex + 1).reduce((sum, entry) => sum + Number(entry?.summary?.earned_vl || 0), 0);
        const currentSl = rows.slice(0, monthIndex + 1).reduce((sum, entry) => sum + Number(entry?.summary?.earned_sl || 0), 0);
        const earnedVl = Number(rows[monthIndex]?.summary?.earned_vl || 0);
        const earnedSl = Number(rows[monthIndex]?.summary?.earned_sl || 0);
        const projectedVl = Math.min(yearCap, rows.reduce((sum, entry) => sum + Number(entry?.summary?.earned_vl || 0), 0));
        const projectedSl = Math.min(yearCap, rows.reduce((sum, entry) => sum + Number(entry?.summary?.earned_sl || 0), 0));
        const currentPoints = currentVl + currentSl;
        const earnedPoints = earnedVl + earnedSl;
        const projectedPoints = projectedVl + projectedSl;
        const workingDays = rows.reduce((sum, entry) => sum + Number(entry?.summary?.present_days || 0), 0);
        const totalPossibleDays = rows.reduce((sum, entry) => sum + Number(entry?.summary?.working_days || 0), 0);
        const attendanceRatio = totalPossibleDays > 0 ? (workingDays / totalPossibleDays) * 100 : 0;
        const presentDays = workingDays;
        const estimatedLeaveDays = Math.max(0, Math.floor(currentPoints));

        const stat = (label, value) => `
            <div style="background: rgba(255,255,255,0.86); border: 1px solid rgba(141,166,232,0.26); border-radius: 14px; padding: 10px 12px;">
                <span style="display:block; font-size: 11px; font-weight: 800; color:#6c7aa6; text-transform: uppercase; letter-spacing: .04em;">${escapeHtml(label)}</span>
                <strong style="display:block; margin-top: 4px; font-size: 18px; line-height: 1.1; color:#1f2f57;">${escapeHtml(value)}</strong>
            </div>
        `;

        return `
            <aside class="dtr-leave-points-aside" style="width: min(300px, 100%); display:flex; flex-direction:column; gap: 12px;">
                <section class="dtr-leave-points-card" style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(241,246,255,0.98)); border: 1px solid rgba(141,166,232,0.36); border-radius: 22px; box-shadow: 0 12px 32px rgba(25,45,95,0.08); padding: 16px;">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 12px;">
                        <div>
                            <span style="display:block; font-size: 12px; font-weight: 800; color:#5e6e96; text-transform: uppercase; letter-spacing: .06em;">Leave points</span>
                            <strong style="display:block; margin-top: 4px; font-size: 18px; color:#1f2f57;">Available credits</strong>
                        </div>
                        <div style="text-align:right;">
                            <span style="display:block; font-size: 11px; font-weight: 800; color:#2b7a78; text-transform: uppercase; letter-spacing: .06em;">Attendance</span>
                            <strong style="display:block; margin-top: 4px; font-size: 18px; color:#2b7a78;">${escapeHtml(attendanceRatio.toFixed(1))}%</strong>
                        </div>
                    </div>
                    <div style="display:flex; align-items:baseline; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                        <span style="font-size: 38px; font-weight: 900; color:#0f1f46; line-height: 1;">${escapeHtml(currentPoints.toFixed(2))}</span>
                        <span style="font-size: 12px; font-weight: 700; color:#6c7aa6;">current leave points</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                        ${stat("Current VL", currentVl.toFixed(2))}
                        ${stat("Current SL", currentSl.toFixed(2))}
                        ${stat("Earned this month", earnedPoints.toFixed(2))}
                        ${stat("Projected total", projectedPoints.toFixed(2))}
                    </div>
                    <div style="border-radius: 16px; background: rgba(44,99,255,0.08); border: 1px solid rgba(44,99,255,0.14); padding: 12px 14px;">
                        <div style="display:flex; justify-content:space-between; gap: 10px; align-items: center; margin-bottom: 8px;">
                            <strong style="font-size: 13px; color:#23345d;">Estimated leave days</strong>
                            <span style="font-size: 12px; color:#6c7aa6;">based on current points</span>
                        </div>
                        <div style="font-size: 26px; font-weight: 900; color:#2c63ff; line-height: 1;">${escapeHtml(String(estimatedLeaveDays))}</div>
                        <div style="margin-top: 4px; font-size: 12px; color:#5f6f99;">Present days: ${escapeHtml(String(presentDays))} / ${escapeHtml(String(workingDays))}</div>
                    </div>
                    <div style="margin-top: 12px; font-size: 12px; line-height: 1.45; color:#607197;">
                        Based on the employee&apos;s DTR attendance. This card shows the leave credit you can use now and the projected credits by December.
                    </div>
                </section>
            </aside>
        `;
    }
    async function loadDtrLeaveSidebar(date = selectedDtrDate()) {
        const root = document.getElementById("dtr-leave-sidebar-root");
        if (!root) {
            return;
        }

        const range = monthRange(date);
        root.innerHTML = `
            <div class="accountability-borrowed-loading">Loading leave points...</div>
        `;

        try {
            const [summary, annual] = await Promise.all([
                requestDtrLeaveSummary(range),
                requestDtrAnnualLeave(range.year)
            ]);
            if (!summary) {
                root.innerHTML = `
                    <div class="accountability-borrowed-empty">No leave points could be loaded.</div>
                `;
                return;
            }
            root.innerHTML = renderDtrLeavePointsAside(summary, range, annual);
        } catch (error) {
            root.innerHTML = `
                <div class="accountability-borrowed-empty">${escapeHtml(error.message || "Unable to load leave points.")}</div>
            `;
        }
    }
    function renderDtrDayGrid(summary, range, annual = []) {
        const monthlySummaries = Array.isArray(annual) ? annual : [];
        const latestMonthIndex = Math.max(0, Math.min(monthlySummaries.length - 1, range.monthIndex || 0));
        const currentYear = Number(range?.year) || new Date().getFullYear();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const rows = [];
        for (let day = 1; day <= 31; day += 1) {
            const monthCells = monthlySummaries.map((entry, monthIndex) => {
                const monthDays = new Map((entry?.summary?.days || []).map((item) => [Number(item.day || 0), item]));
                const dayItem = monthDays.get(day) || null;
                const normalizedStatus = String(dayItem?.status || '').toLowerCase().replace(/[^a-z]+/g, '-');
                const pointsValue = dayItem ? Number(dayItem.points || 0) : NaN;
                const hasPoints = Number.isFinite(pointsValue) && pointsValue !== 0;
                const monthYear = Number(range.year) || new Date().getFullYear();
                const monthDate = new Date(monthYear, Number(entry?.monthIndex ?? monthIndex) || monthIndex, day);
                const isFutureDate = monthDate > today;
                const weekDay = monthDate.getDay();
                const weekendLabel = weekDay === 6 ? 'SATURDAY' : weekDay === 0 ? 'SUNDAY' : '';
                const holidayLabel = normalizedStatus.includes('holiday') || normalizedStatus === 'holiday' || String(dayItem?.label || '').toLowerCase().includes('holiday')
                    ? 'HOLIDAY'
                    : '';
                const isAbsent = !isFutureDate && !holidayLabel && !weekendLabel && dayItem && String(dayItem.status || '').toUpperCase() === 'ABSENT';
                const label = holidayLabel || weekendLabel || (isAbsent ? 'ABSENT' : '');
                const cellClass = holidayLabel ? 'holiday-row' : label === 'ABSENT' ? 'absent-row' : label ? 'day-off' : (normalizedStatus || 'muted');
                const latestClass = monthIndex === latestMonthIndex ? ' dtr-latest-point' : '';
                const monthStyle = dtrAnnualMonthOpacity(currentYear, monthIndex);
                const pointsLabel = hasPoints ? pointsValue.toFixed(2) : '';
                const display = isFutureDate && !holidayLabel && !weekendLabel
                    ? ''
                    : (label && pointsLabel ? `${label} - ${pointsLabel}` : (label || (dayItem ? pointsValue.toFixed(2) : '')));
                const highlightStyle = latestClass ? 'background: rgba(74, 144, 255, 0.14); color: #173d92; font-weight: 800;' : '';
                const extraStyle = label === 'ABSENT'
                    ? 'color: #8b0000; font-weight: 800; background: rgba(139, 0, 0, 0.08);'
                    : '';
                const styleParts = [monthStyle, highlightStyle, extraStyle].filter(Boolean).join(' ');
                return `
                    <td class="dtr-grid-cell ${cellClass} month-${monthIndex + 1}${latestClass}"${styleParts ? ` style="${styleParts}; height: 32px; padding: 7px 6px; line-height: 1.2;"` : ` style="height: 32px; padding: 7px 6px; line-height: 1.2;"`}>${escapeHtml(display)}</td>
                `;
            }).join('');

            rows.push(`
                <tr class="leave-day-row" style="height: 32px;">
                    <td class="leave-day-cell" style="height: 32px; padding: 7px 6px;">${day}</td>
                    ${monthCells}
                    <td class="dtr-sheet-total"></td>
                </tr>
            `);
        }

        return rows.join('');
    }
    function renderDtrLeaveSummary(summary, range, annual = []) {
        const root = document.getElementById("dtr-leave-root");
        if (!root) {
            return;
        }
        if (!summary) {
            root.innerHTML = `
                <div class="dtr-leave-shell" style="max-height: calc(100vh - 190px); overflow-y: auto; scrollbar-gutter: stable; padding-right: 4px;">
                    ${renderEmployeeSheetBanner({ headline: "DAILY POINTS", year: monthRange(selectedDtrDate()).year, skin: "dtr" })}
                    <p class="dtr-leave-empty">No leave summary could be loaded.</p>
                </div>`;
            return;
        }

        const totalEarned = Number(summary.earned_vl || 0) + Number(summary.earned_sl || 0);
        const monthlyHeaders = (Array.isArray(annual) && annual.length === 12
            ? annual
            : Array.from({ length: 12 }, (_, monthIndex) => ({
                monthIndex,
                monthLabel: new Date(range.year, monthIndex, 1).toLocaleString("en-US", { month: "short" }).toUpperCase(),
                summary: null
            })));
        root.innerHTML = `
            <div class="dtr-leave-shell" style="max-height: calc(100vh - 190px); overflow-y: auto; scrollbar-gutter: stable; padding-right: 4px;">
                ${renderEmployeeSheetBanner({ headline: "DAILY POINTS", year: range.year, skin: "dtr", dtrProfile: summary.employee })}
                <div style="display:flex; flex-direction:column; gap: 12px; align-items:stretch;">
                        <section class="dtr-sheet-wrap" style="flex: 0 0 auto; min-height: 0;">
                            <div class="dtr-sheet-scroll" style="height: auto; max-height: none; overflow-x: auto; overflow-y: visible;">
                                <table class="dtr-sheet-table" style="width: 100%;">
                                    <thead>
                                        <tr class="dtr-sheet-months">
                                            <th class="dtr-sheet-label"></th>
                                            ${monthlyHeaders.map((entry) => {
                                                const monthStyle = dtrAnnualMonthOpacity(range.year, entry.monthIndex);
                                                const highlightStyle = entry.monthIndex === range.monthIndex ? 'background: rgba(74, 144, 255, 0.12); color: #173d92; font-weight: 800;' : '';
                                                const styleParts = [monthStyle, highlightStyle].filter(Boolean).join(' ');
                                                return `<th${styleParts ? ` style="${styleParts}"` : ""}>${escapeHtml(entry.monthLabel)}</th>`;
                                            }).join("")}
                                            <th class="dtr-sheet-total"></th>
                                        </tr>
                                        ${renderDtrSheetSummaryRows(monthlyHeaders, range)}
                                        ${renderDtrMonthSubheader(monthlyHeaders, range.year)}
                                    </thead>
                                    <tbody>
                                        ${renderDtrDayGrid(summary, range, monthlyHeaders)}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                        <section class="dtr-footer-wrap" style="flex: 0 0 auto; min-height: 0; margin-top: 0;">
                            <div class="dtr-footer-topbar">
                                <div>
                                    <span>Leave summary</span>
                                    <strong>Per month, all types ï¿½ last = year sum</strong>
                                </div>
                            </div>
                            <div class="dtr-footer-scroll" style="height: auto; max-height: none; overflow-x: auto; overflow-y: visible;">
                                <table class="dtr-footer-table" style="width: 100%;">
                                    <tbody>
                                        ${renderDtrBottomRows(monthlyHeaders, range.year)}
                                    </tbody>
                                </table>
                            </div>
                            ${renderDtrFooterLegend()}
                        </section>
                        <div class="dtr-leave-footer">
                            <span>Total earned leave: ${escapeHtml(totalEarned.toFixed(2))}</span>
                            <span>Attendance ratio: ${escapeHtml(Number(summary.attendance_ratio || 0).toFixed(1))}%</span>
                        </div>
                </div>
            </div>
        `;
    }

    function renderAlcDashboard(summary, range, annual = []) {
        const root = document.getElementById("dtr-leave-root");
        if (!root) return;
        if (!summary) {
            root.innerHTML = `
                <div class="dtr-leave-shell alc-dashboard">
                    <div class="alc-empty-state">
                        <span class="alc-empty-state__icon"><i class="fa fa-line-chart" aria-hidden="true"></i></span>
                        <strong>ALC summary is unavailable</strong>
                        <p>No attendance-based leave credits could be loaded for this account.</p>
                    </div>
                </div>`;
            return;
        }

        const months = Array.isArray(annual) && annual.length === 12
            ? annual
            : Array.from({ length: 12 }, (_, monthIndex) => ({
                monthIndex,
                monthLabel: new Date(range.year, monthIndex, 1).toLocaleString("en-US", { month: "short" }).toUpperCase(),
                summary: null
            }));
        const activeMonthIndex = Math.max(0, Math.min(11, Number(range.monthIndex || 0)));
        const currentVl = sumDtrAnnualField(months, "earned_vl", activeMonthIndex);
        const currentSl = sumDtrAnnualField(months, "earned_sl", activeMonthIndex);
        const activeSummary = months[activeMonthIndex]?.summary || summary || {};
        const earnedThisMonth = Number(activeSummary.earned_vl || 0) + Number(activeSummary.earned_sl || 0);
        const projectedCredits = sumDtrAnnualField(months, "earned_vl") + sumDtrAnnualField(months, "earned_sl");
        const attendanceRatio = Number(activeSummary.attendance_ratio ?? summary.attendance_ratio ?? 0);
        const metricCard = (tone, icon, label, value, note) => `
            <article class="alc-metric alc-metric--${tone}">
                <span class="alc-metric__icon"><i class="fa ${icon}" aria-hidden="true"></i></span>
                <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(note)}</p></div>
            </article>`;

        root.innerHTML = `
            <div class="dtr-leave-shell alc-dashboard">
                <section class="alc-metrics" aria-label="ALC credit summary">
                    ${metricCard("total", "fa-star", "Available credits", (currentVl + currentSl).toFixed(3), "VL + SL earned through this month")}
                    ${metricCard("vacation", "fa-sun-o", "Vacation leave", currentVl.toFixed(3), "Accrued VL balance")}
                    ${metricCard("sick", "fa-heartbeat", "Sick leave", currentSl.toFixed(3), "Accrued SL balance")}
                    ${metricCard("attendance", "fa-calendar-check-o", "Attendance", `${attendanceRatio.toFixed(1)}%`, `${earnedThisMonth.toFixed(3)} credits earned this month`)}
                </section>

                <section class="alc-monthly-section">
                    <div class="alc-section-heading">
                        <div><span>Year overview</span><h4>Monthly credit growth</h4></div>
                        <div class="alc-projection"><small>Projected annual credits</small><strong>${escapeHtml(projectedCredits.toFixed(3))}</strong></div>
                    </div>
                    <div class="alc-month-grid">
                        ${months.map((entry, index) => {
                            const monthSummary = entry.summary || {};
                            const monthVl = Number(monthSummary.earned_vl || 0);
                            const monthSl = Number(monthSummary.earned_sl || 0);
                            const isFuture = dtrIsFutureAnnualMonth(range.year, index);
                            return `
                                <article class="alc-month-card${index === activeMonthIndex ? " is-current" : ""}${isFuture ? " is-future" : ""}">
                                    <span>${escapeHtml(entry.monthLabel)}</span>
                                    <div class="alc-month-card__credits">
                                        <strong><small>VL</small>${escapeHtml(monthVl.toFixed(3))}</strong>
                                        <strong><small>SL</small>${escapeHtml(monthSl.toFixed(3))}</strong>
                                    </div>
                                    <small>${isFuture ? "Projected" : index === activeMonthIndex ? "Current month" : "Earned"}</small>
                                </article>`;
                        }).join("")}
                    </div>
                </section>

                <details class="alc-detail-panel">
                    <summary title="Show daily points computation">
                        <span class="alc-dock-button" aria-hidden="true">
                            <i class="fa fa-table alc-dock-icon alc-dock-icon--closed"></i>
                            <i class="fa fa-chevron-down alc-dock-icon alc-dock-icon--open"></i>
                        </span>
                        <span class="sr-only">Show or hide daily points computation</span>
                    </summary>
                    <div class="alc-drawer-surface">
                        <header class="alc-drawer-head">
                            <span class="alc-detail-panel__icon"><i class="fa fa-table" aria-hidden="true"></i></span>
                            <div><strong>Daily points computation</strong><small>Complete day-by-month attendance matrix</small></div>
                        </header>
                        <section class="dtr-sheet-wrap alc-detail-table">
                            <div class="dtr-sheet-scroll">
                                <table class="dtr-sheet-table">
                                    <thead>
                                        <tr class="dtr-sheet-months">
                                            <th class="dtr-sheet-label"></th>
                                            ${months.map((entry) => `<th>${escapeHtml(entry.monthLabel)}</th>`).join("")}
                                            <th class="dtr-sheet-total"></th>
                                        </tr>
                                        ${renderDtrMonthSubheader(months, range.year)}
                                    </thead>
                                    <tbody>${renderDtrDayGrid(summary, range, months)}</tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </details>

            </div>`;
    }

    async function renderDtrLeaveCompute(date = selectedDtrDate()) {
        const root = document.getElementById("dtr-leave-root");
        if (!root) {
            return;
        }

        const range = monthRange(date);
        root.innerHTML = `
            <div class="dtr-leave-shell alc-dashboard">
                <div class="alc-loading-state">
                    <span class="alc-loading-state__mark"><i class="fa fa-line-chart" aria-hidden="true"></i></span>
                    <div><strong>Preparing your ALC dashboard</strong><p>Calculating attendance-based credits for ${escapeHtml(range.year)}…</p></div>
                </div>
            </div>`;
        try {
            const [summary, annual] = await Promise.all([
                requestDtrLeaveSummary(range),
                requestDtrAnnualLeave(range.year)
            ]);
            renderAlcDashboard(summary, range, annual);
        } catch (error) {
            root.innerHTML = `
                <div class="dtr-leave-shell alc-dashboard">
                    <div class="alc-empty-state">
                        <span class="alc-empty-state__icon"><i class="fa fa-exclamation-circle" aria-hidden="true"></i></span>
                        <strong>Unable to load ALC credits</strong>
                        <p>${escapeHtml(error.message || "Unable to load leave summary.")}</p>
                    </div>
                </div>`;
        }
    }

    async function renderDtrSheet(date = selectedDtrDate()) {
        const dtrTableBody = document.getElementById("dtr-table-body");
        if (!dtrTableBody) {
            return;
        }

        const requestId = ++dtrRenderRequestId;
        const requestedRange = monthRange(date);
        setDtrHeader(date.toLocaleString("en-US", { month: "long" }), requestedRange.year);
        renderDtrTable({}, requestedRange);
        renderDtrQueryDebug();

        try {
            const items = await requestDtrRecords(requestedRange);
            if (requestId !== dtrRenderRequestId) return;
            const activeRange = requestedRange;
            let activities = [];
            let corrections = [];
            const renderEnrichedRows = () => {
                if (requestId !== dtrRenderRequestId) return;
                const rows = mergeDtrActivities(buildDtrRows(items), activities);
                renderDtrTable(mergeDtrCorrectionStates(rows, corrections, activeRange), activeRange);
                renderDtrQueryDebug();
            };

            // Render attendance first; request markers and corrections no longer block the table.
            renderEnrichedRows();
            void loadDtrLeaveSidebar(new Date(activeRange.year, activeRange.monthIndex, 1));
            void requestDtrActivities(activeRange).then((itemsResult) => {
                activities = itemsResult;
                renderEnrichedRows();
            }).catch((error) => console.warn("DTR activities could not load.", error));
            void requestDtrCorrections(activeRange).then((itemsResult) => {
                corrections = itemsResult;
                dtrCorrectionItems = corrections;
                renderEnrichedRows();
            }).catch((error) => console.warn("DTR corrections could not load.", error));
        } catch (error) {
            console.error(error);
        }
    }

    function renderDetailRows(items) {
        return items.map((item) => `
            <div class="form-detail-row">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value || "-")}</strong>
            </div>
        `).join("");
    }

    function epassStatusClass(status) {
        const value = String(status || "").toLowerCase();
        if (value === "2" || value === "approved") {
            return "approved";
        }
        if (value === "3" || value === "rejected") {
            return "error";
        }
        return "pending";
    }

    function isEpassStalePending(item) {
        const statusClass = Number(item?.dept_head_status || 0) === 2 || Number(item?.status || 0) === 3
            ? "error"
            : epassStatusClass(item?.status);
        if (statusClass !== "pending") {
            return false;
        }
        const rawDate = String(item?.date || "").trim();
        if (!rawDate) {
            return false;
        }
        const parsedDate = new Date(rawDate);
        if (Number.isNaN(parsedDate.getTime())) {
            return false;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        parsedDate.setHours(0, 0, 0, 0);
        return parsedDate < today;
    }

    function todayInputValue() {
        return new Date().toISOString().slice(0, 10);
    }

    function displayDate(value) {
        if (!value) {
            return "Date";
        }
        // ponytail: some callers pass a plain "YYYY-MM-DD" (append local midnight so it doesn't shift
        // a day when parsed), others pass a full ISO timestamp from the DB (e.g. "...T16:00:00.000Z")
        // — appending "T00:00:00" to that broke Date parsing entirely and leaked the raw string.
        const raw = String(value).trim();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
    }

    function leaveCalendarTypeKey(value) {
        const normalized = String(value || "").trim().toLowerCase();
        if (normalized.includes("half")) return "half-day";
        if (normalized.includes("whole")) return "whole-day";
        if (normalized.includes("vacation")) return "vacation";
        if (normalized.includes("sick")) return "sick";
        if (normalized.includes("maternity")) return "maternity";
        if (normalized.includes("paternity")) return "paternity";
        if (normalized.includes("emergency")) return "emergency";
        if (normalized.includes("official")) return "official";
        return "other";
    }

    function officialPhilippineHolidays(year) {
        if (Number(year) !== 2026) return {};
        return {
            "2026-01-01": "New Year's Day",
            "2026-02-17": "Chinese New Year",
            "2026-03-20": "Eid'l Fitr",
            "2026-04-02": "Maundy Thursday",
            "2026-04-03": "Good Friday",
            "2026-04-04": "Black Saturday",
            "2026-04-09": "Araw ng Kagitingan",
            "2026-05-01": "Labor Day",
            "2026-05-27": "Eid'l Adha",
            "2026-06-12": "Independence Day",
            "2026-08-21": "Ninoy Aquino Day",
            "2026-08-31": "National Heroes Day",
            "2026-11-01": "All Saints' Day",
            "2026-11-02": "All Souls' Day",
            "2026-11-30": "Bonifacio Day",
            "2026-12-08": "Feast of the Immaculate Conception",
            "2026-12-24": "Christmas Eve",
            "2026-12-25": "Christmas Day",
            "2026-12-30": "Rizal Day",
            "2026-12-31": "Last Day of the Year"
        };
    }

    function leaveRequestStatusKey(value) {
        const normalized = String(value || "").trim().toLowerCase();
        if (normalized === "2" || normalized.includes("approved")) return "approved";
        if (normalized === "3" || normalized.includes("rejected")) return "rejected";
        return "pending";
    }

    function leaveHistoryDateValue(value) {
        const raw = String(value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return "";
        return datePart(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    function indexLeaveRequestsForCalendar(items = []) {
        const indexed = {};
        (Array.isArray(items) ? items : []).forEach((item) => {
            const fromValue = leaveHistoryDateValue(item.date_from_value || item.date_from);
            const toValue = leaveHistoryDateValue(item.date_to_value || item.date_to || item.date_from_value || item.date_from);
            if (!fromValue || !toValue || toValue < fromValue) return;

            const cursor = new Date(`${fromValue}T00:00:00`);
            const end = new Date(`${toValue}T00:00:00`);
            const marker = {
                type: String(item.leave_category || item.leave_type || "Leave Request").trim(),
                duration: String(item.leave_duration || "").trim(),
                typeKey: leaveCalendarTypeKey(item.leave_category || item.leave_type),
                status: leaveRequestStatusKey(item.status_label || item.status),
                tracking: String(item.tracking_no || "").trim(),
                dateFrom: String(item.date_from || "").trim(),
                dateTo: String(item.date_to || item.date_from || "").trim(),
                fromValue, toValue, isMultiDay: toValue !== fromValue,
                purpose: String(item.purpose || "").trim(),
                days: Number(item.days || 0),
                leaveId: String(item.leave_id || "").trim(),
                approverName: String(item.approver_name || item.assigned_approver_name || "").trim(),
                approverStage: (Array.isArray(item.approval_route)
                    ? item.approval_route.find((person) => person.approval_status?.tone === "pending")
                    : null)?.stage_label || ""
            };
            for (let day = 0; cursor <= end && day < 366; day += 1, cursor.setDate(cursor.getDate() + 1)) {
                const key = datePart(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
                if (!indexed[key]) indexed[key] = [];
                indexed[key].push(marker);
            }
        });
        leaveRequestCalendarMarkers = indexed;
    }

    function closeLeaveRequestDetails() {
        document.getElementById("leave-request-detail-overlay")?.remove();
    }

    function showLeaveRequestDetails(dateValue) {
        const requests = leaveRequestCalendarMarkers[dateValue] || [];
        const workspace = document.querySelector(".profile-modal.leave-mode .leave-request-workspace");
        if (!workspace || !requests.length) return;
        closeLeaveRequestDetails();

        const cards = requests.map((request) => {
            const statusLabel = request.status.charAt(0).toUpperCase() + request.status.slice(1);
            const range = request.dateFrom && request.dateTo && request.dateFrom !== request.dateTo
                ? `${request.dateFrom} to ${request.dateTo}`
                : (request.dateFrom || request.dateTo || displayDate(dateValue));
            const days = request.days === 0.5 ? "0.5 day" : `${request.days || 1} day${Number(request.days || 1) === 1 ? "" : "s"}`;
            const updateAction = request.status === "pending" && request.leaveId
                ? `<footer><button type="button" class="leave-request-detail-update" data-update-leave-request="${escapeHtml(request.leaveId)}"><i class="fa fa-pencil" aria-hidden="true"></i><span>Update Request</span></button></footer>`
                : "";
            return `
                <article class="leave-request-detail-card is-${escapeHtml(request.status)}">
                    <div class="leave-request-detail-card-head">
                        <div>
                            <span>Tracking number</span>
                            <strong>${escapeHtml(request.tracking || `Leave #${request.leaveId}`)}</strong>
                        </div>
                        <b>${escapeHtml(statusLabel)}</b>
                    </div>
                    <dl>
                        <div><dt>Leave type</dt><dd>${escapeHtml(request.type)}</dd></div>
                        <div><dt>Date coverage</dt><dd>${escapeHtml(range)}</dd></div>
                        <div><dt>Requested days</dt><dd>${escapeHtml(days)}</dd></div>
                        <div><dt>${escapeHtml(request.approverStage || "Approver")}</dt><dd>${escapeHtml(request.approverName || "Not assigned yet")}</dd></div>
                        <div class="leave-request-detail-purpose"><dt>Purpose</dt><dd>${escapeHtml(request.purpose || "No purpose provided")}</dd></div>
                    </dl>
                    ${updateAction}
                </article>`;
        }).join("");

        const overlay = document.createElement("div");
        overlay.className = "leave-request-detail-overlay";
        overlay.id = "leave-request-detail-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "leave-request-detail-title");
        overlay.innerHTML = `
            <section class="leave-request-detail-dialog">
                <header>
                    <div>
                        <span>Leave request details</span>
                        <h3 id="leave-request-detail-title">${escapeHtml(displayDate(dateValue))}</h3>
                    </div>
                    <button type="button" data-close-leave-request-details aria-label="Close leave request details"><i class="fa fa-times" aria-hidden="true"></i></button>
                </header>
                <div class="leave-request-detail-list">${cards}</div>
            </section>`;
        workspace.appendChild(overlay);
        overlay.querySelector("[data-close-leave-request-details]")?.focus();
    }

    function renderLeaveCalendar(date = new Date(), fromValue = "", toValue = "") {
        const year = date.getFullYear();
        const month = date.getMonth();
        const monthName = date.toLocaleString("en-US", { month: "long" });
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const today = todayInputValue();
        const activeLeaveType = document.getElementById("leave-type")?.value || "Half Day Leave";
        const activeTypeKey = leaveCalendarTypeKey(activeLeaveType);
        const officialHolidays = officialPhilippineHolidays(year);
        const cells = [];

        for (let index = 0; index < 42; index += 1) {
            const dayOffset = index - firstDay + 1;
            let cellDate;
            let label;
            let muted = false;

            if (dayOffset <= 0) {
                label = prevMonthDays + dayOffset;
                cellDate = new Date(year, month - 1, label);
                muted = true;
            } else if (dayOffset > daysInMonth) {
                label = dayOffset - daysInMonth;
                cellDate = new Date(year, month + 1, label);
                muted = true;
            } else {
                label = dayOffset;
                cellDate = new Date(year, month, label);
            }

            const value = datePart(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
            const inRange = fromValue && toValue && value >= fromValue && value <= toValue;
            const isSelected = value === fromValue || value === toValue;
            const marker = leaveCalendarMarkers[value] || null;
            const loadedMarkerType = marker ? String(marker.type || "").toLowerCase() : "";
            const loadedHolidayLabel = loadedMarkerType === "holiday" ? String(marker?.label || "").trim() : "";
            const holidayName = officialHolidays[value]
                || (loadedHolidayLabel && loadedHolidayLabel.toUpperCase() !== "HOLIDAY" ? loadedHolidayLabel : "")
                || (loadedMarkerType === "holiday" ? "Official Holiday" : "");
            const leaveLabel = loadedMarkerType === "leave" ? String(marker?.label || "Leave") : "";
            const markerTypeKey = leaveLabel ? leaveCalendarTypeKey(leaveLabel) : "";
            const requestMarkers = leaveRequestCalendarMarkers[value] || [];
            const primaryRequest = requestMarkers[0] || null;
            const requestStatuses = [...new Set(requestMarkers.map((request) => request.status))];
            const weekday = cellDate.getDay();
            const selectedTypeKey = inRange || isSelected ? activeTypeKey : "";
            // A multi-day request spans several day-cells; give the touching cells matching, unrounded
            // edges so the badges read as one continuous bar instead of looking like separate requests.
            const rangePosition = !primaryRequest?.isMultiDay ? "single"
                : value === primaryRequest.fromValue ? "start"
                : value === primaryRequest.toValue ? "end"
                : "mid";
            const classes = [
                "leave-calendar-day",
                muted ? "muted" : "",
                weekday === 0 ? "sunday" : "",
                weekday === 6 ? "saturday" : "",
                value === today ? "today" : "",
                holidayName ? "marked-holiday" : "",
                leaveLabel ? "marked-leave" : "",
                markerTypeKey ? `leave-type-${markerTypeKey}` : "",
                primaryRequest ? "has-leave-request" : "",
                primaryRequest ? `request-range-${rangePosition}` : "",
                primaryRequest?.typeKey ? `leave-type-${primaryRequest.typeKey}` : "",
                ...requestStatuses.map((status) => `request-status-${status}`),
                selectedTypeKey ? `leave-type-${selectedTypeKey}` : "",
                inRange ? "in-range" : "",
                isSelected ? "selected" : ""
            ].filter(Boolean).join(" ");
            const markerLabel = [holidayName, leaveLabel].filter((label, index, labels) => label && labels.indexOf(label) === index).join(" • ");
            const holidayHtml = holidayName
                ? `<span class="leave-calendar-holiday-label"><i aria-hidden="true">H</i><b>${escapeHtml(holidayName)}</b></span>`
                : "";
            const leaveMarkerHtml = leaveLabel ? `<small>${escapeHtml(leaveLabel)}</small>` : "";
            // Only the first day of a multi-day request spells out type/status text; the rest of the
            // range shows a plain connector bar so it doesn't repeat "Vacation Pending" five times.
            const requestBadges = requestMarkers.slice(0, 1).map((request) => {
                const shortType = request.type.replace(/\s+Leave$/i, "") || "Leave";
                const statusLabel = request.status.charAt(0).toUpperCase() + request.status.slice(1);
                const showText = rangePosition !== "mid" && rangePosition !== "end";
                return `<em class="leave-request-date-badge is-${escapeHtml(request.status)}">`
                    + (showText
                        ? `<i aria-hidden="true"></i><b>${escapeHtml(shortType)}</b><span>${escapeHtml(statusLabel)}</span>`
                        : `<b class="leave-request-date-badge__spacer" aria-hidden="true"></b>`)
                    + `</em>`;
            }).join("");
            const extraRequests = requestMarkers.length > 1 ? `<em class="leave-request-date-more">+${requestMarkers.length - 1} more</em>` : "";
            const requestHtml = requestBadges ? `<span class="leave-request-date-badges">${requestBadges}${extraRequests}</span>` : "";
            const dateDescription = cellDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            const requestDetails = requestMarkers.map((request) => `${request.type}: ${request.status}`).join(", ");
            const details = [dateDescription, markerLabel, requestDetails, isSelected ? activeLeaveType : ""].filter(Boolean).join(" - ");

            const dateContent = `<span>${label}</span>${holidayHtml}${leaveMarkerHtml}${requestHtml}`;
            if (primaryRequest) {
                const requestActions = `
                    <span class="leave-calendar-request-actions" aria-label="Choose an action for ${escapeHtml(displayDate(value))}">
                        <button type="button" data-leave-request-action="view" data-leave-request-date="${value}" aria-label="View request"><i class="fa fa-eye" aria-hidden="true"></i><b>View</b></button>
                        <button type="button" data-leave-request-action="select" data-leave-request-date="${value}" aria-label="Select this date"><i class="fa fa-check" aria-hidden="true"></i><b>Select</b></button>
                    </span>`;
                cells.push(`<div class="${classes}" role="group" tabindex="0" data-leave-date="${value}" data-has-leave-request="1" data-leave-kind="${escapeHtml(primaryRequest.typeKey || markerTypeKey || selectedTypeKey)}" aria-label="${escapeHtml(`${details}. Choose View or Select.`)}">${dateContent}${requestActions}</div>`);
            } else {
                cells.push(`<button class="${classes}" type="button" data-leave-date="${value}" data-has-leave-request="0" data-leave-kind="${escapeHtml(markerTypeKey || selectedTypeKey)}" title="${escapeHtml(details)}" aria-label="${escapeHtml(details)}">${dateContent}</button>`);
            }
        }

        return `
            <div class="leave-calendar" data-calendar-year="${year}" data-calendar-month="${month}">
                <div class="leave-calendar-toolbar">
                    <div class="leave-calendar-tabs">
                        <button class="active" type="button">Month</button>
                        <button type="button">Week</button>
                        <button type="button">Day</button>
                    </div>
                    <strong>${monthName} ${year}</strong>
                    <div class="leave-calendar-nav">
                        <button type="button" data-leave-calendar-nav="-1" aria-label="Previous month"><i class="fa fa-angle-left"></i></button>
                        <button type="button" data-leave-calendar-today>Today</button>
                        <button type="button" data-leave-calendar-nav="1" aria-label="Next month"><i class="fa fa-angle-right"></i></button>
                    </div>
                </div>
                <div class="leave-calendar-legend" aria-label="Calendar color guide">
                    <span class="legend-half-day"><i>½</i> Half day</span>
                    <span class="legend-vacation"><i>V</i> Vacation</span>
                    <span class="legend-sick"><i>S</i> Sick</span>
                    <span class="legend-maternity"><i>M</i> Maternity</span>
                    <span class="legend-emergency"><i>E</i> Emergency</span>
                    <span class="legend-holiday"><i>H</i> Holiday</span>
                </div>
                <div class="leave-calendar-weekdays">
                    ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => `<span>${day}</span>`).join("")}
                </div>
                <div class="leave-calendar-grid">${cells.join("")}</div>
            </div>
        `;
    }

    function departmentOptions(selectedDepartment) {
        const selectedRaw = String(selectedDepartment || "").trim();
        const selectedUpper = selectedRaw.toUpperCase();
        const selectedLabel = resolveEpassDepartmentFilter(selectedRaw).toUpperCase();
        const departments = [
            { value: "", label: "All departments" },
            { value: "OGM", label: "OFFICE OF THE GENERAL MANAGER" },
            { value: "CORPLAN", label: "CORPORATE PLANNING DEPARTMENT" },
            { value: "CPD", label: "CORPORATE PLANNING DEPARTMENT" },
            { value: "FSD", label: "FSD FINANCE SERVICES DEPARTMENT" },
            { value: "ISD", label: "INSTITUTIONAL SERVICES DEPARTMENT" },
            { value: "TSD", label: "TECHNICAL SERVICES DEPARTMENT" },
            { value: "IAD", label: "INTERNAL AUDIT DEPARTMENT" },
            { value: "HRAD", label: "HRAD" },
            { value: "ITS", label: "ITS" },
            { value: "IT", label: "IT" },
            { value: "BILLING", label: "BILLING" },
            { value: "ADMIN", label: "ADMINISTRATIVE DEPARTMENT" },
            { value: "ESD", label: "ENGINEERING SERVICES DEPARTMENT" },
            { value: "CATBALOGAN", label: "CATBALOGAN" },
            { value: "BASEY", label: "BASEY" },
            { value: "VILLAREAL", label: "VILLAREAL" }
        ];
        return departments.map((department) => {
            const isSelected = !department.value
                ? !selectedRaw
                : selectedUpper === department.value.toUpperCase() || selectedLabel === department.label.toUpperCase();
            return `
                <option value="${escapeHtml(department.value)}" ${isSelected ? "selected" : ""}>${escapeHtml(department.label)}</option>
            `;
        }).join("");
    }

    const EPASS_DEPARTMENT_LOOKUP = new Map([
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
        ["VILLAREAL", "VILLAREAL"]
    ]);

    function currentEpassDepartment() {
        const department = document.getElementById("epass-department")?.value;
        return String(department || "").trim();
    }

    function currentEpassDirectoryDepartment() {
        const department = document.getElementById("epass-directory-department")?.value
            || document.getElementById("epass-department")?.value;
        return String(department || "").trim() || currentEpassDepartment();
    }

    function currentEpassDirectoryQuery() {
        const search = document.getElementById("epass-directory-search")?.value
            || document.getElementById("epass-search-input")?.value;
        return String(search || "").trim();
    }

    function loadPeopleDraft(storageKey) {
        try {
            const raw = window.sessionStorage.getItem(storageKey) || window.localStorage.getItem(storageKey);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .map((person) => ({
                    name: String(person?.name || "").trim(),
                    usercode: String(person?.usercode || "").trim().toUpperCase(),
                    profile_photo_url: String(person?.profile_photo_url || "").trim()
                }))
                .filter((person) => person.name && person.usercode);
        } catch (_error) {
            return [];
        }
    }

    function savePeopleDraft(storageKey, people) {
        try {
            if (!Array.isArray(people) || !people.length) {
                window.sessionStorage.removeItem(storageKey);
                window.localStorage.removeItem(storageKey);
                return;
            }
            const raw = JSON.stringify(people);
            window.sessionStorage.setItem(storageKey, raw);
            window.localStorage.setItem(storageKey, raw);
        } catch (_error) {
            /* noop */
        }
    }

    function clonePeopleList(people = []) {
        return (Array.isArray(people) ? people : [])
            .map((person) => ({
                name: String(person?.name || "").trim(),
                usercode: String(person?.usercode || "").trim().toUpperCase(),
                profile_photo_url: String(person?.profile_photo_url || "").trim()
            }))
            .filter((person) => person.name && person.usercode);
    }

    function getFuelPeopleForForm(formKey) {
        return formKey === "travel"
            ? clonePeopleList(travelPeople)
            : clonePeopleList(epassPeople);
    }

    function clearFuelPeopleForForm(formKey) {
        const suppressKey = formKey === "travel" ? getTravelSelectionSuppressKey() : getEpassSelectionSuppressKey();
        if (formKey === "travel") {
            travelPeople = [];
            savePeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY, travelPeople);
            clearFuelSelectionSuppressKey(suppressKey);
            renderTravelPeople();
            return;
        }

        epassPeople = [];
        savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
        clearFuelSelectionSuppressKey(suppressKey);
        renderEpassPeople();
    }

    function getFuelSelectionSuppressKey(formKey) {
        const farCode = String(fuelEmbedContext.farCode || "").trim();
        if (!farCode) {
            return "";
        }
        return `${formKey === "travel" ? TRAVEL_SUPPRESS_KEY_PREFIX : EPASS_SUPPRESS_KEY_PREFIX}${farCode}`;
    }

    function getEpassSelectionSuppressKey() {
        return getFuelSelectionSuppressKey("epass");
    }

    function getTravelSelectionSuppressKey() {
        return getFuelSelectionSuppressKey("travel");
    }

    function isFuelSelectionSuppressed(formKey) {
        const key = getFuelSelectionSuppressKey(formKey);
        if (!key) {
            return false;
        }
        try {
            return window.sessionStorage.getItem(key) === "1";
        } catch (_error) {
            return false;
        }
    }

    function setFuelSelectionSuppressed(formKey, suppressed) {
        const key = getFuelSelectionSuppressKey(formKey);
        if (!key) {
            return;
        }
        try {
            if (suppressed) {
                window.sessionStorage.setItem(key, "1");
            } else {
                window.sessionStorage.removeItem(key);
            }
        } catch (_error) {
            /* noop */
        }
    }

    function clearFuelSelectionSuppressKey(key) {
        if (!key) {
            return;
        }
        try {
            window.sessionStorage.removeItem(key);
        } catch (_error) {
            /* noop */
        }
    }

    function getFuelChoiceLockKey(formKey) {
        const farCode = String(fuelEmbedContext.farCode || "").trim();
        if (!farCode) {
            return "";
        }
        const normalized = formKey === "travel" ? "travel" : "epass";
        return `samelcii_fuel_choice_lock_${normalized}_${farCode}`;
    }

    function isFuelChoiceLocked(formKey) {
        const key = getFuelChoiceLockKey(formKey);
        if (!key) {
            return false;
        }
        try {
            return window.sessionStorage.getItem(key) === "1"
                || window.localStorage.getItem(key) === "1";
        } catch (_error) {
            return false;
        }
    }

    function setFuelChoiceLocked(formKey, locked) {
        const key = getFuelChoiceLockKey(formKey);
        if (!key) {
            return;
        }
        [window.sessionStorage, window.localStorage].forEach((storage) => {
            try {
                if (locked) {
                    storage.setItem(key, "1");
                } else {
                    storage.removeItem(key);
                }
            } catch (_error) {
                /* noop */
            }
        });
    }

    function syncFuelChoiceButtons() {
        const epassLocked = isFuelChoiceLocked("epass");
        const travelLocked = isFuelChoiceLocked("travel");
        const epassChoice = document.querySelector('.epass-travel-choice[data-pick="epass"]');
        const travelChoice = document.querySelector('.epass-travel-choice[data-pick="travel"]');
        const comboButton = document.querySelector('.quick-action-btn[data-form="epass-travel"]');

        if (epassChoice) {
            epassChoice.disabled = epassLocked;
            epassChoice.setAttribute("aria-disabled", epassLocked ? "true" : "false");
            epassChoice.classList.toggle("is-locked", epassLocked);
            epassChoice.title = epassLocked ? "Fuel EPASS is already in use for this request." : "Open Fuel EPASS.";
        }

        if (travelChoice) {
            travelChoice.disabled = travelLocked;
            travelChoice.setAttribute("aria-disabled", travelLocked ? "true" : "false");
            travelChoice.classList.toggle("is-locked", travelLocked);
            travelChoice.title = travelLocked ? "Fuel Travel is already in use for this request." : "Open Fuel Travel.";
        }

        if (comboButton) {
            const comboLabel = epassLocked && !travelLocked
                ? "EPASS only"
                : travelLocked && !epassLocked
                    ? "Travel only"
                    : "Choose EPASS or Travel";
            comboButton.title = comboLabel;
            comboButton.setAttribute("aria-label", comboLabel);
        }
    }

    function getAvailableFuelChoice() {
        const epassLocked = isFuelChoiceLocked("epass");
        const travelLocked = isFuelChoiceLocked("travel");
        if (epassLocked && !travelLocked) {
            return "travel";
        }
        if (travelLocked && !epassLocked) {
            return "epass";
        }
        return "";
    }

    async function cancelFuelEmbedRequest(formKey) {
        const isEpass = formKey === "epass";
        const isTravel = formKey === "travel";
        if (!isEpass && !isTravel) {
            return false;
        }

        const farCode = String(fuelEmbedContext.farCode || "").trim();
        const endpoint = isEpass ? EPASS_API : TRAVEL_API;
        const message = document.getElementById(isEpass ? "epass-form-message" : "travel-form-message");

        if (!farCode) {
            clearFuelPeopleForForm(formKey);
            return true;
        }

        if (message) {
            message.textContent = isEpass
                ? "Removing empty Fuel EPASS draft..."
                : "Removing empty travel draft...";
        }

        const cancelViaEndpoint = async (apiBase) => {
            const response = await fetch(`${apiBase}?action=cancel_by_fuel_farcode`, {
                method: "POST",
                credentials: "include",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ fuelFarCode: farCode })
            });
            const result = await response.json().catch(() => ({
                ok: false,
                message: isEpass ? "Invalid EPASS server response." : "Invalid travel server response."
            }));
            return { response, result };
        };

        const { response, result } = await cancelViaEndpoint(endpoint);

        if (!response.ok || !result.ok) {
            throw new Error(result.message || (isEpass ? "Unable to remove EPASS request." : "Unable to remove travel request."));
        }

        clearFuelPeopleForForm(formKey);
        setFuelChoiceLocked("epass", false);
        setFuelChoiceLocked("travel", false);
        syncFuelChoiceButtons();
        if (isEpass) {
            notifyFuelParent("samelcii-fuel-epass-cancelled", {
                farCode
            });
        } else {
            notifyFuelParent("samelcii-fuel-travel-cancelled", {
                farCode
            });
        }
        setFuelSelectionSuppressed(formKey, false);
        notifyApprovalDeskRefresh(formKey, {
            farCode
        });
        return true;
    }

    function syncFuelPeopleDrafts(targetFormKey) {
        if (String(fuelEmbedContext.farCode || "").trim()) {
            renderEpassPeople();
            renderTravelPeople();
            return;
        }
        const epassDraft = loadPeopleDraft(EPASS_PEOPLE_DRAFT_KEY);
        const travelDraft = loadPeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY);

        if (targetFormKey === "epass") {
            if (!epassPeople.length && epassDraft.length) {
                epassPeople = clonePeopleList(epassDraft);
            }
        } else if (targetFormKey === "travel") {
            if (!travelPeople.length && travelDraft.length) {
                travelPeople = clonePeopleList(travelDraft);
            }
        }

        renderEpassPeople();
        renderTravelPeople();
        savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
        savePeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY, travelPeople);
    }

    function epassDepartmentSearchTerms(value) {
        const raw = String(value || "").trim().toUpperCase();
        if (!raw) {
            return [];
        }
        const shared = {
            OGM: ["OGM", "OFFICE OF THE GENERAL MANAGER"],
            CORPLAN: ["CORPLAN", "CPD", "CORPORATE PLANNING DEPARTMENT"],
            CPD: ["CPD", "CORPLAN", "CORPORATE PLANNING DEPARTMENT"],
            FSD: ["FSD", "FINANCE SERVICES DEPARTMENT", "FSD FINANCE SERVICES DEPARTMENT"],
            ISD: ["ISD", "INSTITUTIONAL SERVICES DEPARTMENT"],
            TSD: ["TSD", "TECHNICAL SERVICES DEPARTMENT"],
            IAD: ["IAD", "INTERNAL AUDIT DEPARTMENT"],
            HRAD: ["HRAD"],
            ITS: ["ITS"],
            IT: ["IT"],
            BILLING: ["BILLING"],
            ADMIN: ["ADMIN", "ADMINISTRATIVE DEPARTMENT"],
            ESD: ["ESD", "ENGINEERING SERVICES DEPARTMENT"],
            CATBALOGAN: ["CATBALOGAN"],
            BASEY: ["BASEY"],
            VILLAREAL: ["VILLAREAL"]
        };
        return shared[raw] || [raw];
    }

    function epassAreaSearchTerms(value) {
        const raw = String(value || "").trim().toUpperCase();
        if (!raw) {
            return [];
        }
        const shared = {
            CATBALOGAN: ["CATBALOGAN", "CATBALOGAN SUB"],
            BASEY: ["BASEY"],
            VILLAREAL: ["VILLAREAL"]
        };
        return shared[raw] || [];
    }

    function resolveEpassDepartmentFilter(value) {
        const raw = String(value || "").trim();
        if (!raw) {
            return "";
        }
        const lookup = EPASS_DEPARTMENT_LOOKUP.get(raw.toUpperCase());
        return lookup || raw;
    }

    function leaveTypeOptions(selectedType) {
        const leaveTypes = [
            "Half Day Leave",
            "Whole Day Leave",
            "Vacation Leave",
            "Sick Leave",
            "Official Leave",
            "Emergency Leave",
            "Maternity Leave",
            "Paternity Leave"
        ];
        return leaveTypes.map((typeName) => `
            <option value="${escapeHtml(typeName)}" ${typeName === selectedType ? "selected" : ""}>${escapeHtml(typeName)}</option>
        `).join("");
    }

    const BIRTHDAY_LEAVE_CATEGORY = "Birthday Leave";
    const BIRTHDAY_LEAVE_CREDIT = 1;

    function birthdayLeaveRequestForYear(year, excludeLeaveId = "") {
        const targetYear = Number(year);
        if (!Number.isInteger(targetYear)) return null;
        return leaveRequestHistoryItems.find((item) => {
            if (String(item.leave_id || "") === String(excludeLeaveId || "")) return false;
            if (leaveRequestStatusKey(item.status_label || item.status) === "rejected") return false;
            const category = String(item.leave_category || item.leave_type || "").trim().toLowerCase();
            if (category !== BIRTHDAY_LEAVE_CATEGORY.toLowerCase()) return false;
            const dateValue = leaveHistoryDateValue(item.date_from_value || item.date_from);
            return Number(dateValue.slice(0, 4)) === targetYear;
        }) || null;
    }

    function birthdayLeaveState(dateValue, excludeLeaveId = "") {
        const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))
            ? new Date(`${dateValue}T00:00:00`)
            : null;
        if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
            return { available: 0, message: "Choose a date for your Birthday Leave." };
        }
        const claimed = birthdayLeaveRequestForYear(selectedDate.getFullYear(), excludeLeaveId);
        if (claimed) {
            return {
                available: 0,
                claimed,
                message: `Birthday Leave is already claimed or reserved under ${claimed.tracking_no || "an existing request"}.`
            };
        }
        return { available: BIRTHDAY_LEAVE_CREDIT, message: "1.00 Birthday Special Leave is available." };
    }

    const LEAVE_DURATION_RULES = {
        "Vacation Leave": ["Half Day", "Whole Day", "Multiple Days"],
        "Sick Leave": ["Half Day", "Whole Day", "Multiple Days"],
        "Birthday Leave": ["Whole Day"],
        "Official Leave": ["Whole Day", "Multiple Days"],
        "Emergency Leave": ["Whole Day", "Multiple Days"],
        "Maternity Leave": ["Multiple Days"],
        "Paternity Leave": ["Multiple Days"],
        "Other Leave": ["Whole Day", "Multiple Days"]
    };

    function leaveSelectionOptions(selectedCategory = "Vacation Leave", selectedDuration = "Half Day", includeBirthday = true) {
        return Object.entries(LEAVE_DURATION_RULES)
            .filter(([category]) => includeBirthday || category !== BIRTHDAY_LEAVE_CATEGORY)
            .map(([category, durations]) => `
            <optgroup label="${escapeHtml(category)}">
                ${durations.map((duration) => {
                    const selected = category === selectedCategory && duration === selectedDuration;
                    return `<option value="${escapeHtml(`${category}|${duration}`)}" ${selected ? "selected" : ""}>${escapeHtml(`${category} — ${duration}`)}</option>`;
                }).join("")}
            </optgroup>
        `).join("");
    }

    function setLeaveSelection(category = "Vacation Leave", duration = "Half Day") {
        const allowedDurations = LEAVE_DURATION_RULES[category] || LEAVE_DURATION_RULES["Other Leave"];
        if (!LEAVE_DURATION_RULES[category]) category = "Other Leave";
        if (!allowedDurations.includes(duration)) duration = allowedDurations[0];
        const typeInput = document.getElementById("leave-type");
        const durationInput = document.getElementById("leave-duration");
        const selectionInput = document.getElementById("leave-selection");
        if (typeInput) typeInput.value = category;
        if (durationInput) durationInput.value = duration;
        if (selectionInput) selectionInput.value = `${category}|${duration}`;
    }

    function syncLeaveSelection() {
        const selection = String(document.getElementById("leave-selection")?.value || "");
        const separator = selection.lastIndexOf("|");
        if (separator < 1) return;
        setLeaveSelection(selection.slice(0, separator), selection.slice(separator + 1));
    }

    function refreshBirthdayLeaveSelectionOptions() {
        const selectionInput = document.getElementById("leave-selection");
        if (!selectionInput) return;
        const fromValue = document.getElementById("leave-from-date")?.value || todayInputValue();
        const selectedYear = Number(String(fromValue).slice(0, 4)) || new Date().getFullYear();
        const currentCategory = document.getElementById("leave-type")?.value || "Vacation Leave";
        const currentDuration = document.getElementById("leave-duration")?.value || "Half Day";
        const includeBirthday = !birthdayLeaveRequestForYear(selectedYear, leaveEditingId);
        const nextCategory = includeBirthday || currentCategory !== BIRTHDAY_LEAVE_CATEGORY ? currentCategory : "Vacation Leave";
        const nextDuration = nextCategory === currentCategory ? currentDuration : "Half Day";
        selectionInput.innerHTML = leaveSelectionOptions(nextCategory, nextDuration, includeBirthday);
        setLeaveSelection(nextCategory, nextDuration);
    }

    function renderLeaveCreditLedger() {
        const months = [
            "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
            "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
        ];
        const ledgerRows = [
            {
                code: "VL",
                label: "Vacation Leave",
                annual: Number(session.VLbal || 20).toFixed(2),
                values: ALC_MONTHLY_VL_CREDITS.map((credit) => credit.toFixed(2)),
                tone: "vl"
            },
            {
                code: "SL",
                label: "Sick Leave",
                annual: Number(session.SLbal || 20).toFixed(2),
                values: ALC_MONTHLY_SL_CREDITS.map((credit) => credit.toFixed(2)),
                tone: "sl"
            },
            {
                code: "EL",
                label: "Emergency Leave",
                annual: Number(session.OLbal || 6).toFixed(2),
                values: Array.from({ length: 12 }, () => "0.00"),
                tone: "el"
            },
            {
                code: "PL",
                label: "Privilege Leave",
                annual: Number(session.PLbal || 7).toFixed(2),
                values: Array.from({ length: 12 }, () => "0.00"),
                tone: "pl"
            },
            {
                code: "UL",
                label: "Union Leave",
                annual: Number(session.ULbal || 4).toFixed(2),
                values: Array.from({ length: 12 }, () => "0.00"),
                tone: "ul"
            }
        ];

        const year = new Date().getFullYear();

        return `
            <!-- GABAY: leave credit ledger itong flat data list sa profiling. -->
            <section class="leave-ledger-card" data-leave-ledger-card>
                ${renderEmployeeSheetBanner({ headline: "ACCRUED LEAVE CREDITS", year, skin: "ledger" })}
                <div class="leave-ledger-head leave-ledger-head--after-banner">
                    <div>
                        <h3>Accrued leave credits</h3>
                        <p>Monthly accrual and annual totals by leave type.</p>
                    </div>
                </div>
                <div class="leave-ledger-scroll">
                    <table class="leave-ledger-table">
                        <thead>
                            <tr>
                                <th class="leave-ledger-code-col">TYPE</th>
                                ${months.map((month) => `<th>${month}</th>`).join("")}
                                <th class="leave-ledger-total-col">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ledgerRows.map((row) => `
                                <tr class="tone-${row.tone}">
                                    <th class="leave-ledger-code-col">
                                        <span>${escapeHtml(row.code)}</span>
                                        <small>${escapeHtml(row.label)}</small>
                                    </th>
                                    ${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}
                                    <td class="leave-ledger-total-col">${escapeHtml(row.annual)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
                <div class="leave-ledger-footer">
                    <span class="leave-chip">Birth Leave</span>
                    <span class="leave-chip">Medical Leave</span>
                    <span class="leave-chip">Fiesta Leave</span>
                    <span class="leave-chip">Union Leave</span>
                    <span class="leave-chip">EL</span>
                    <span class="leave-chip">PL / ML</span>
                    <span class="leave-chip">SPL</span>
                </div>
            </section>
        `;
    }

    function ensureDefaultEpassPeople() {
        if (epassPeople.length > 0) {
            return;
        }
        // HUWAG mag-auto-insert ng sarili kapag may Fuel-linked request na;
        // dito dapat manggaling ang list mula sa saved request o draft.
        if (String(fuelEmbedContext.farCode || "").trim()) {
            return;
        }
        if (isFuelSelectionSuppressed("epass")) {
            return;
        }

        const name = employee.name || session.name || session.username || "";
        const usercode = employee.usercode || session.usercode || "";
        if (name && usercode) {
            epassPeople = [{
                name,
                usercode,
                profile_photo_url: employee.profile_photo_url || session.profile_photo_url || ""
            }];
            savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
        }
    }

    function findEpassPerson(query) {
        const search = String(query || "").trim();
        if (!search) {
            return null;
        }

        const match = users.find((item) => {
            const name = String(item.name || "").toLowerCase();
            const usercode = String(item.usercode || "").toLowerCase();
            const username = String(item.username || "").toLowerCase();
            const needle = search.toLowerCase();
            return name.includes(needle) || usercode.includes(needle) || username.includes(needle);
        });

        if (match && match.name && match.usercode) {
            return {
                name: match.name,
                usercode: String(match.usercode).toUpperCase(),
                profile_photo_url: match.profile_photo_url || ""
            };
        }

        if (search.includes(",")) {
            const [name, code] = search.split(",").map((part) => part.trim());
            if (name && code) {
                return { name, usercode: code.toUpperCase() };
            }
        }

        return null;
    }

    function addEpassPerson(person) {
        if (!person || !person.name || !person.usercode) {
            return false;
        }

        const normalized = {
            name: String(person.name).trim(),
            usercode: String(person.usercode).trim().toUpperCase(),
            profile_photo_url: String(person.profile_photo_url || person.photo_url || "").trim()
        };

        if (!normalized.name || !normalized.usercode) {
            return false;
        }

        if (!epassPeople.some((item) => item.usercode.toUpperCase() === normalized.usercode)) {
            epassPeople.push(normalized);
        }
        savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
        setFuelSelectionSuppressed("epass", false);
        renderEpassPeople();
        return true;
    }

    function removeEpassPersonByUsercode(usercode) {
        const normalizedUsercode = String(usercode || "").trim().toUpperCase();
        if (!normalizedUsercode) {
            return false;
        }
        const nextPeople = epassPeople.filter((item) => String(item.usercode || "").trim().toUpperCase() !== normalizedUsercode);
        if (nextPeople.length === epassPeople.length) {
            return false;
        }
        epassPeople = nextPeople;
        savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
        if (!epassPeople.length) {
            setFuelSelectionSuppressed("epass", true);
        } else if (normalizedUsercode === String(fuelEmbedContext.usercode || "").trim().toUpperCase()) {
            setFuelSelectionSuppressed("epass", true);
        }
        renderEpassPeople();
        return true;
    }

    function ensureDefaultTravelPeople() {
        if (travelPeople.length > 0) {
            return;
        }
        if (isFuelSelectionSuppressed("travel")) {
            return;
        }
    }

    function ensureDefaultTravelDates() {
        if (travelDates.length > 0) {
            return;
        }
        travelDates = [todayInputValue()];
    }

    function renderCalendarTriggerLabel(formKey) {
        const label = document.getElementById(`${formKey}-calendar-trigger-label`);
        if (!label) {
            return;
        }
        const dates = getCalendarDates(formKey);
        if (!dates.length) {
            label.textContent = formKey === "travel" ? "+ Add date" : "Pick a date";
            return;
        }
        if (formKey === "epass") {
            label.textContent = displayDate(dates[0]);
            return;
        }
        label.textContent = dates.length === 1 ? displayDate(dates[0]) : `${dates.length} dates selected`;
    }

    function renderTravelDates() {
        renderCalendarTriggerLabel("travel");
        const target = document.getElementById("travel-dates-list");
        if (!target) {
            return;
        }

        if (!travelDates.length) {
            target.innerHTML = "";
            return;
        }

        target.innerHTML = `
            <div class="travel-selected-head">
                <strong>Selected date${travelDates.length === 1 ? "" : "s"}</strong>
                <span>${travelDates.length} date${travelDates.length === 1 ? "" : "s"} for this Travel Request</span>
            </div>
            <div class="travel-selected-list__rail">
                ${travelDates.map((value) => `
                    <div class="travel-selected-chip" style="grid-template-columns:minmax(0,1fr) auto !important;" title="${escapeHtml(displayDate(value))}">
                        <span class="travel-selected-meta">
                            <strong>${escapeHtml(displayDate(value))}</strong>
                        </span>
                        <button type="button" class="travel-selected-remove" data-remove-travel-date="${escapeHtml(value)}" aria-label="Remove ${escapeHtml(displayDate(value))}">&times;</button>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderEpassDateSummary() {
        renderCalendarTriggerLabel("epass");
        const target = document.getElementById("epass-dates-list");
        if (!target) {
            return;
        }
        const value = String(document.getElementById("epass-date")?.value || "").trim();
        if (!value) {
            target.innerHTML = "";
            return;
        }
        target.innerHTML = `
            <div class="travel-selected-list__rail">
                <div class="travel-selected-chip" style="grid-template-columns:minmax(0,1fr) auto !important;" title="${escapeHtml(displayDate(value))}">
                    <span class="travel-selected-meta">
                        <strong>${escapeHtml(displayDate(value))}</strong>
                    </span>
                    <button type="button" class="travel-selected-remove" data-clear-epass-date aria-label="Clear date">&times;</button>
                </div>
            </div>
        `;
    }

    function getCalendarDates(formKey) {
        if (formKey === "travel") {
            return travelDates.slice();
        }
        const value = String(document.getElementById("epass-date")?.value || "").trim();
        return value ? [value] : [];
    }

    function toggleCalendarDate(formKey, iso) {
        const cleaned = String(iso || "").trim();
        if (!cleaned) {
            return;
        }
        if (formKey === "travel") {
            const index = travelDates.indexOf(cleaned);
            if (index >= 0) {
                travelDates.splice(index, 1);
            } else {
                travelDates.push(cleaned);
                travelDates.sort();
            }
            renderTravelDates();
        } else {
            const input = document.getElementById("epass-date");
            if (input) {
                input.value = input.value === cleaned ? "" : cleaned;
            }
            renderEpassDateSummary();
        }
        renderCalendar(formKey);
    }

    function ensureCalendarView(formKey) {
        if (calendarView[formKey]) {
            return;
        }
        const dates = getCalendarDates(formKey);
        if (dates.length) {
            const parts = dates[0].split("-");
            calendarView[formKey] = { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1 };
        } else {
            const now = new Date();
            calendarView[formKey] = { year: now.getFullYear(), month: now.getMonth() };
        }
    }

    function shiftCalendarMonth(formKey, delta) {
        ensureCalendarView(formKey);
        let { year, month } = calendarView[formKey];
        month += delta;
        if (month < 0) {
            month = 11;
            year -= 1;
        } else if (month > 11) {
            month = 0;
            year += 1;
        }
        calendarView[formKey] = { year, month };
        renderCalendar(formKey);
    }

    function renderCalendar(formKey) {
        ensureCalendarView(formKey);
        const target = document.getElementById(`${formKey}-calendar`);
        if (!target) {
            return;
        }
        const { year, month } = calendarView[formKey];
        const selected = getCalendarDates(formKey);
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayIso = todayInputValue();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        let cellsHtml = "";
        for (let i = 0; i < firstWeekday; i += 1) {
            cellsHtml += `<button type="button" class="travel-calendar-day is-blank" disabled tabindex="-1"></button>`;
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const classes = ["travel-calendar-day"];
            if (selected.includes(iso)) {
                classes.push("is-selected");
            } else if (iso === todayIso) {
                classes.push("is-today");
            }
            cellsHtml += `<button type="button" class="${classes.join(" ")}" data-calendar-day="${iso}" data-calendar-form="${formKey}">${day}</button>`;
        }

        target.innerHTML = `
            <div class="travel-calendar-head">
                <button type="button" class="travel-calendar-nav" data-calendar-prev="${formKey}" aria-label="Previous month">&#10094;</button>
                <strong>${monthNames[month]} ${year}</strong>
                <button type="button" class="travel-calendar-nav" data-calendar-next="${formKey}" aria-label="Next month">&#10095;</button>
            </div>
            <div class="travel-calendar-weekdays">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            <div class="travel-calendar-grid">${cellsHtml}</div>
        `;
    }

    function renderTravelPeople() {
        const target = document.getElementById("travel-selected-list");
        if (!target) {
            return;
        }

        if (!travelPeople.length) {
            target.innerHTML = "";
            return;
        }

        target.innerHTML = `
            <div class="travel-selected-head">
                <strong>Selected employee${travelPeople.length === 1 ? "" : "s"}</strong>
                <span>${travelPeople.length} linked to this Travel Request</span>
            </div>
            <div class="travel-selected-list__rail">
                ${travelPeople.map((person, index) => {
                    // ponytail: legacy S2 code suffix matches user Id; the avatar keeps initials if the endpoint fails.
                    const legacyUserId = Number(String(person.usercode || "").match(/(\d+)$/)?.[1] || 0);
                    const personWithPhoto = {
                        ...person,
                        profile_photo_url: person.profile_photo_url || (legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "")
                    };
                    return `
                        <div class="travel-selected-chip" title="${escapeHtml(`${person.name || "Employee"}${person.usercode ? ` (${person.usercode})` : ""}`)}">
                            ${renderEmployeeAvatar(personWithPhoto, "travel-selected-avatar")}
                            <span class="travel-selected-meta">
                                <strong>${escapeHtml(person.name || "Employee")}</strong>
                                <small>${escapeHtml(person.usercode || "")}</small>
                            </span>
                            <button type="button" class="travel-selected-remove" data-remove-travel-person="${index}" aria-label="Remove ${escapeHtml(person.name || "employee")}">&times;</button>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function syncTravelEmployeeDirectorySelectionState() {
        const selectedCodes = new Set(
            travelPeople
                .map((person) => String(person.usercode || "").trim().toUpperCase())
                .filter(Boolean)
        );

        document.querySelectorAll("[data-travel-directory-usercode]").forEach((button) => {
            const usercode = String(button.getAttribute("data-travel-directory-usercode") || "").trim().toUpperCase();
            const selected = selectedCodes.has(usercode);
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
            button.setAttribute("data-selected-state", selected ? "true" : "false");
            button.title = selected ? "Selected. Click to remove." : "Click to add.";
        });
    }

    function addTravelPerson(person) {
        if (!person || !person.name || !person.usercode) {
            return false;
        }

        const normalized = {
            name: String(person.name).trim(),
            usercode: String(person.usercode).trim().toUpperCase()
        };

        if (!normalized.name || !normalized.usercode) {
            return false;
        }

        const existingIndex = travelPeople.findIndex((item) => item.usercode.toUpperCase() === normalized.usercode);
        if (existingIndex >= 0) {
            travelPeople = travelPeople.filter((item) => item.usercode.toUpperCase() !== normalized.usercode);
        } else {
            travelPeople.push({
                ...normalized,
                profile_photo_url: String(person.profile_photo_url || person.photo_url || "").trim()
            });
        }
        savePeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY, travelPeople);
        setFuelSelectionSuppressed("travel", false);
        renderTravelPeople();
        syncTravelEmployeeDirectorySelectionState();
        return true;
    }

    function renderEpassSearchResults(items) {
        const target = document.getElementById("epass-search-results");
        if (!target) {
            return;
        }

        if (!items || items.length === 0) {
            target.innerHTML = "";
            target.classList.remove("active");
            return;
        }

        target.innerHTML = items.map((item) => `
            <button type="button" data-epass-search-usercode="${escapeHtml(item.usercode)}" data-epass-search-name="${escapeHtml(item.name)}" data-epass-search-photo="${escapeHtml(item.profile_photo_url || item.photo_url || "")}">
                ${renderEmployeeAvatar(item, "epass-search-avatar")}
                <span>${escapeHtml(item.name)}</span>
                <small>${escapeHtml(item.usercode)}</small>
            </button>
        `).join("");
        target.classList.add("active");
    }

    function renderEpassEmployeeDirectoryPager(page = 1, totalPages = 1, totalItems = 0) {
        const pageLabel = document.getElementById("epass-directory-page-label");
        const countLabel = document.getElementById("epass-directory-count");
        const prevBtn = document.getElementById("epass-directory-prev");
        const nextBtn = document.getElementById("epass-directory-next");

        if (pageLabel) {
            pageLabel.textContent = `Page ${page} / ${totalPages}`;
        }
        if (countLabel) {
            countLabel.textContent = `${totalItems} employee${totalItems === 1 ? "" : "s"}`;
        }
        if (prevBtn) {
            prevBtn.disabled = page <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = page >= totalPages;
        }
    }

    function renderEpassEmployeeDirectory(items, page = 1, totalPages = 1, totalItems = 0) {
        const target = document.getElementById("epass-employee-directory-list");
        if (!target) {
            return;
        }
        const directoryCard = target.closest(".epass-employee-directory");

        epassEmployeeDirectoryItems = Array.isArray(items) ? items : [];
        epassEmployeeDirectoryPage = Number(page || 1);
        epassEmployeeDirectoryTotalPages = Math.max(1, Number(totalPages || 1));
        epassEmployeeDirectoryTotalItems = Math.max(0, Number(totalItems || 0));
        renderEpassEmployeeDirectoryPager(
            epassEmployeeDirectoryPage,
            epassEmployeeDirectoryTotalPages,
            epassEmployeeDirectoryTotalItems
        );

        if (!epassEmployeeDirectoryItems.length) {
            target.innerHTML = `
                <div class="epass-employee-directory-empty">
                    No employees found.
                </div>
            `;
            if (directoryCard) {
                directoryCard.hidden = false;
            }
            return;
        }

        if (directoryCard) {
            directoryCard.hidden = false;
        }

        const selectedCodes = new Set(epassPeople.map((person) => String(person.usercode || "").toUpperCase()));
        const orderedItems = epassEmployeeDirectoryItems
            .map((item, index) => ({ item, index }))
            .sort((left, right) => {
                const leftSelected = selectedCodes.has(String(left.item.usercode || "").trim().toUpperCase()) ? 0 : 1;
                const rightSelected = selectedCodes.has(String(right.item.usercode || "").trim().toUpperCase()) ? 0 : 1;
                if (leftSelected !== rightSelected) {
                    return leftSelected - rightSelected;
                }
                return left.index - right.index;
            })
            .map((entry) => entry.item);

        target.innerHTML = orderedItems.map((item) => {
            const usercode = String(item.usercode || "").trim().toUpperCase();
            const name = String(item.name || "").trim();
            const department = String(item.department || "").trim() || "Employee";
            const isSelected = selectedCodes.has(usercode);
            // ponytail: legacy S2 code suffix matches user Id; initials remain if the image endpoint has no photo.
            const legacyUserId = Number(usercode.match(/(\d+)$/)?.[1] || 0);
            const profilePhotoUrl = String(
                item.profile_photo_url
                || item.photo_url
                || (legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "")
            ).trim();
            return `
                <button
                    type="button"
                    class="epass-employee-directory-item${isSelected ? " is-selected" : ""}"
                    data-selected-state="${isSelected ? "true" : "false"}"
                    data-epass-directory-usercode="${escapeHtml(usercode)}"
                    data-epass-directory-name="${escapeHtml(name)}"
                    data-epass-directory-photo="${escapeHtml(item.profile_photo_url || item.photo_url || "")}"
                    aria-pressed="${isSelected ? "true" : "false"}"
                    title="${isSelected ? "Selected. Click to remove." : "Click to add."}"
                >
                    ${renderEmployeeAvatar({ name, profile_photo_url: item.profile_photo_url || item.photo_url || "" }, "epass-employee-directory-avatar")}
                    <span class="epass-employee-directory-main">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(department)}</small>
                    </span>
                    <span class="epass-employee-directory-code">${escapeHtml(usercode)}</span>
                </button>
            `;
        }).join("");
    }

    async function loadEpassEmployeeDirectory(
        page = 1,
        forceRefresh = false,
        department = currentEpassDepartment(),
        query = currentEpassDirectoryQuery()
    ) {
        const safePage = Math.max(1, Number(page || 1));
        const safeDepartment = String(department || "").trim();
        const safeQuery = String(query || "").trim();
        const departmentFilter = resolveEpassDepartmentFilter(safeDepartment);
        const browseQuery = safeQuery.length >= 2 ? safeQuery : "";
        const cacheKey = `dept:${(departmentFilter || safeDepartment || "ALL")}:q:${browseQuery || "ALL"}:page:${safePage}:limit:${EPASS_EMPLOYEE_DIRECTORY_LIMIT}`;

        if (!forceRefresh) {
            const cached = getCachedValue("employees_profile_epass_directory", cacheKey, 15 * 60 * 1000);
            if (cached && Array.isArray(cached.items)) {
                renderEpassEmployeeDirectory(
                    cached.items,
                    cached.page || safePage,
                    cached.totalPages || 1,
                    cached.totalItems || cached.items.length
                );
                return;
            }
        }

        const target = document.getElementById("epass-employee-directory-list");
        if (target) {
            const directoryCard = target.closest(".epass-employee-directory");
            if (directoryCard) {
                directoryCard.hidden = false;
            }
            target.innerHTML = `
                <div class="epass-employee-directory-empty">
                    Loading employees...
                </div>
            `;
        }

        try {
            const params = new URLSearchParams({
                action: "search_employee",
                page: String(safePage),
                limit: String(EPASS_EMPLOYEE_DIRECTORY_LIMIT)
            });
            if (departmentFilter) {
                params.set("department", departmentFilter);
            }
            if (browseQuery) {
                params.set("q", browseQuery);
            }
            const response = await fetch(`${AUTH_API}?${params.toString()}`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false, items: [] }));
            let items = response.ok && payload.ok ? (payload.items || []) : [];
            let totalItems = Math.max(0, Number(payload.total_items || items.length));
            let totalPages = Math.max(1, Number(payload.total_pages || 1));
            if (!items.length) {
                const fallbackItems = localEpassEmployeeDirectory(safeDepartment, browseQuery);
                totalItems = fallbackItems.length;
                totalPages = Math.max(1, Math.ceil(totalItems / EPASS_EMPLOYEE_DIRECTORY_LIMIT) || 1);
                const start = (safePage - 1) * EPASS_EMPLOYEE_DIRECTORY_LIMIT;
                items = fallbackItems.slice(start, start + EPASS_EMPLOYEE_DIRECTORY_LIMIT);
            }
            setCachedValue("employees_profile_epass_directory", cacheKey, {
                items,
                page: safePage,
                totalPages,
                totalItems
            });
            renderEpassEmployeeDirectory(items, safePage, totalPages, totalItems);
        } catch (_error) {
            const fallbackItems = localEpassEmployeeDirectory(safeDepartment, browseQuery);
            const totalItems = fallbackItems.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / EPASS_EMPLOYEE_DIRECTORY_LIMIT) || 1);
            const start = (safePage - 1) * EPASS_EMPLOYEE_DIRECTORY_LIMIT;
            const items = fallbackItems.slice(start, start + EPASS_EMPLOYEE_DIRECTORY_LIMIT);
            renderEpassEmployeeDirectory(items, safePage, totalPages, totalItems);
        }
    }

    function renderTravelEmployeeDirectoryPager(page = 1, totalPages = 1, totalItems = 0) {
        const pageLabel = document.getElementById("travel-directory-page-label");
        const countLabel = document.getElementById("travel-directory-count");
        const prevBtn = document.getElementById("travel-directory-prev");
        const nextBtn = document.getElementById("travel-directory-next");

        if (pageLabel) {
            pageLabel.textContent = `Page ${page} / ${totalPages}`;
        }
        if (countLabel) {
            countLabel.textContent = `${totalItems} employee${totalItems === 1 ? "" : "s"}`;
        }
        if (prevBtn) {
            prevBtn.disabled = page <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = page >= totalPages;
        }
    }

    function renderTravelEmployeeDirectory(items, page = 1, totalPages = 1, totalItems = 0, errorMessage = "") {
        const target = document.getElementById("travel-employee-directory-list");
        if (!target) {
            return;
        }
        const directoryCard = target.closest(".travel-employee-directory");

        travelEmployeeDirectoryItems = Array.isArray(items) ? items : [];
        travelEmployeeDirectoryPage = Number(page || 1);
        travelEmployeeDirectoryTotalPages = Math.max(1, Number(totalPages || 1));
        travelEmployeeDirectoryTotalItems = Math.max(0, Number(totalItems || 0));
        renderTravelEmployeeDirectoryPager(
            travelEmployeeDirectoryPage,
            travelEmployeeDirectoryTotalPages,
            travelEmployeeDirectoryTotalItems
        );

        if (!travelEmployeeDirectoryItems.length) {
            // ponytail: distinguish "genuinely no matches" from "the request failed" so a 401/network
            // hiccup doesn't render identically to zero results with no way to tell them apart.
            target.innerHTML = errorMessage
                ? `
                    <div class="travel-employee-directory-empty travel-employee-directory-error">
                        ${escapeHtml(errorMessage)}
                        <button type="button" class="travel-employee-directory-retry" id="travel-directory-retry">Retry</button>
                    </div>
                `
                : `
                    <div class="travel-employee-directory-empty">
                        No employees found.
                    </div>
                `;
            if (directoryCard) {
                directoryCard.hidden = false;
            }
            return;
        }

        if (directoryCard) {
            directoryCard.hidden = false;
        }

        const selectedCodes = new Set(travelPeople.map((person) => String(person.usercode || "").trim().toUpperCase()).filter(Boolean));
        const orderedItems = travelEmployeeDirectoryItems
            .map((item, index) => ({ item, index }))
            .sort((left, right) => {
                const leftSelected = selectedCodes.has(String(left.item.usercode || "").trim().toUpperCase()) ? 0 : 1;
                const rightSelected = selectedCodes.has(String(right.item.usercode || "").trim().toUpperCase()) ? 0 : 1;
                if (leftSelected !== rightSelected) {
                    return leftSelected - rightSelected;
                }
                return left.index - right.index;
            })
            .map((entry) => entry.item);

        target.innerHTML = orderedItems.map((item) => {
            const usercode = String(item.usercode || "").trim().toUpperCase();
            const name = String(item.name || "").trim();
            const department = String(item.department || "").trim() || "Employee";
            const isSelected = selectedCodes.has(usercode);
            const legacyUserId = Number(usercode.match(/(\d+)$/)?.[1] || 0);
            const profilePhotoUrl = String(
                item.profile_photo_url
                || item.photo_url
                || (legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "")
            ).trim();
            return `
                <button
                    type="button"
                    class="travel-employee-directory-item${isSelected ? " is-selected" : ""}"
                    data-selected-state="${isSelected ? "true" : "false"}"
                    data-travel-directory-usercode="${escapeHtml(usercode)}"
                    data-travel-directory-name="${escapeHtml(name)}"
                    data-travel-directory-photo="${escapeHtml(profilePhotoUrl)}"
                    aria-pressed="${isSelected ? "true" : "false"}"
                    title="${isSelected ? "Selected. Click to remove." : "Click to add."}"
                >
                    ${renderEmployeeAvatar({ name, profile_photo_url: profilePhotoUrl }, "travel-employee-directory-avatar")}
                    <span class="travel-employee-directory-main">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(department)}</small>
                    </span>
                    <span class="travel-employee-directory-code">${escapeHtml(usercode)}</span>
                </button>
            `;
        }).join("");
    }

    async function loadTravelEmployeeDirectory(
        page = 1,
        forceRefresh = false,
        department = document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
        query = ""
    ) {
        const safePage = Math.max(1, Number(page || 1));
        const safeDepartment = String(department || "").trim();
        const safeQuery = String(query || "").trim();
        const browseQuery = safeQuery.length >= 2 ? safeQuery : "";
        const cacheKey = `dept:${safeDepartment || "ALL"}:q:${browseQuery || "ALL"}:page:${safePage}:limit:${TRAVEL_EMPLOYEE_DIRECTORY_LIMIT}`;

        if (!forceRefresh) {
            const cached = getCachedValue("employees_profile_travel_directory", cacheKey, 15 * 60 * 1000);
            if (cached && Array.isArray(cached.items) && cached.items.length) {
                renderTravelEmployeeDirectory(
                    cached.items,
                    cached.page || safePage,
                    cached.totalPages || 1,
                    cached.totalItems || cached.items.length
                );
                return;
            }
        }

        const target = document.getElementById("travel-employee-directory-list");
        if (target) {
            const directoryCard = target.closest(".travel-employee-directory");
            if (directoryCard) {
                directoryCard.hidden = false;
            }
            target.innerHTML = `
                <div class="travel-employee-directory-empty">
                    Loading employees...
                </div>
            `;
        }

        try {
            const params = new URLSearchParams({
                action: "search_employee",
                page: "1",
                limit: "100"
            });
            if (browseQuery) {
                params.set("q", browseQuery);
            }
            const response = await fetch(`${AUTH_API}?${params.toString()}`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false, items: [] }));
            const requestFailed = !response.ok || !payload.ok;
            let directoryItems = requestFailed ? [] : (payload.items || []);
            if (requestFailed) {
                console.error("[travel-directory] search_employee failed", response.status, payload.message);
            }
            if (directoryItems.length && safeDepartment) {
                const departmentTerms = epassDepartmentSearchTerms(safeDepartment).map((term) => String(term || "").toLowerCase());
                const areaTerms = epassAreaSearchTerms(safeDepartment).map((term) => String(term || "").toLowerCase());
                const departmentMatches = directoryItems.filter((item) => {
                    const itemDepartment = String(item.department || "").toLowerCase();
                    const itemArea = String(item.area || "").toLowerCase();
                    return departmentTerms.some((term) => itemDepartment.includes(term))
                        || areaTerms.some((term) => itemArea.includes(term));
                });
                if (departmentMatches.length) {
                    directoryItems = departmentMatches;
                }
            }
            if (!directoryItems.length) {
                directoryItems = localEpassEmployeeDirectory(safeDepartment, browseQuery);
            }
            const totalItems = directoryItems.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / TRAVEL_EMPLOYEE_DIRECTORY_LIMIT) || 1);
            const resolvedPage = Math.min(safePage, totalPages);
            const start = (resolvedPage - 1) * TRAVEL_EMPLOYEE_DIRECTORY_LIMIT;
            const items = directoryItems.slice(start, start + TRAVEL_EMPLOYEE_DIRECTORY_LIMIT);
            if (items.length) {
                setCachedValue("employees_profile_travel_directory", cacheKey, {
                    items,
                    page: resolvedPage,
                    totalPages,
                    totalItems
                });
            }
            const errorMessage = !items.length && requestFailed
                ? `Couldn't load employees (${payload.message || `server error ${response.status}`}).`
                : "";
            renderTravelEmployeeDirectory(items, resolvedPage, totalPages, totalItems, errorMessage);
        } catch (error) {
            console.error("[travel-directory] search_employee network error", error);
            const fallbackItems = localEpassEmployeeDirectory(safeDepartment, browseQuery);
            const totalItems = fallbackItems.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / TRAVEL_EMPLOYEE_DIRECTORY_LIMIT) || 1);
            const start = (safePage - 1) * TRAVEL_EMPLOYEE_DIRECTORY_LIMIT;
            const items = fallbackItems.slice(start, start + TRAVEL_EMPLOYEE_DIRECTORY_LIMIT);
            const errorMessage = !items.length ? "Couldn't reach the server. Check your connection and retry." : "";
            renderTravelEmployeeDirectory(items, safePage, totalPages, totalItems, errorMessage);
        }
    }

    function renderTravelSearchResults(items) {
        const target = document.getElementById("travel-search-results");
        if (!target) {
            return;
        }

        if (!items || items.length === 0) {
            target.innerHTML = "";
            target.classList.remove("active");
            return;
        }

        const selectedCodes = new Set(travelPeople.map((person) => String(person.usercode || "").trim().toUpperCase()).filter(Boolean));
        target.innerHTML = `
            <div class="travel-search-grid">
                ${items.map((item) => {
                    const code = String(item.usercode || "").trim().toUpperCase();
                    const name = String(item.name || code).trim();
                    const dept = String(item.department || item.department_name || "").trim();
                    const photo = String(item.profile_photo_url || item.photo_url || "").trim();
                    const selected = selectedCodes.has(code);
                    return `
                        <button type="button" class="travel-search-result${selected ? " is-selected" : ""}" data-travel-search-usercode="${escapeHtml(code)}" data-travel-search-name="${escapeHtml(name)}" data-travel-search-photo="${escapeHtml(photo)}" aria-pressed="${selected ? "true" : "false"}">
                            <span class="travel-search-result-check" aria-hidden="true">${selected ? "âœ“" : "+"}</span>
                            ${renderEmployeeAvatar({ name, usercode: code, profile_photo_url: photo }, "travel-search-result-avatar")}
                            <div class="travel-search-result-body">
                                <strong>${escapeHtml(name || "-")}</strong>
                                <small>${escapeHtml(code || "-")}</small>
                                <small>${dept ? escapeHtml(dept) : "&nbsp;"}</small>
                            </div>
                        </button>
                    `;
                }).join("")}
            </div>
        `;
        target.classList.add("active");
    }

    async function searchEpassEmployees(query) {
        const value = String(query || document.getElementById("epass-search-input")?.value || "").trim();
        if (value.length < 2) {
            renderEpassSearchResults([]);
            return;
        }
        const key = value.toLowerCase();
        const cached = getCachedValue("employees_profile_employee_search", key, 24 * 60 * 60 * 1000);
        if (cached) {
            renderEpassSearchResults(cached);
            return;
        }

        try {
            // limit: other search_employee calls in this file already pass 100 (the server's max);
            // this one was left at the unstated default of 30, silently hiding matches past the 30th.
            const params = new URLSearchParams({ action: "search_employee", q: value, limit: "100" });
            const response = await fetch(`${AUTH_API}?${params.toString()}`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false, items: [] }));
            const items = response.ok && payload.ok ? (payload.items || []) : [];
            setCachedValue("employees_profile_employee_search", key, items);
            renderEpassSearchResults(items);
        } catch (_error) {
            renderEpassSearchResults([]);
        }
    }

    function syncEpassRequestSummary() {
        const number = document.getElementById("epass-summary-number");
        const department = document.getElementById("epass-summary-department");
        const date = document.getElementById("epass-summary-date");
        const destination = document.getElementById("epass-summary-destination");
        const purpose = document.getElementById("epass-summary-purpose");
        const count = document.getElementById("epass-summary-count");
        const requestNumber = document.getElementById("epass-request-number")?.textContent || "-";
        const departmentValue = document.getElementById("epass-department")?.value || currentEpassDepartment();
        const dateValue = document.getElementById("epass-date")?.value || "";
        const destinationValue = document.getElementById("epass-destination")?.value || "";
        const purposeValue = document.getElementById("epass-purpose")?.value || "";
        const selectedCount = Array.isArray(epassPeople) ? epassPeople.length : 0;

        if (number) number.textContent = requestNumber || "-";
        if (department) department.textContent = departmentValue || "-";
        if (date) date.textContent = dateValue ? displayDate(dateValue) : "-";
        if (destination) destination.textContent = destinationValue || "-";
        if (purpose) purpose.textContent = purposeValue || "-";
        if (count) count.textContent = `${selectedCount} employee${selectedCount === 1 ? "" : "s"} selected`;
    }

    async function searchTravelEmployees(query) {
        const value = String(query || "").trim();
        if (value.length < 2) {
            renderTravelSearchResults([]);
            return;
        }
        const key = value.toLowerCase();
        const cached = getCachedValue("employees_profile_employee_search", key, 24 * 60 * 60 * 1000);
        if (cached) {
            renderTravelSearchResults(cached);
            return;
        }

        try {
            // limit: other search_employee calls in this file already pass 100 (the server's max);
            // this one was left at the unstated default of 30, silently hiding matches past the 30th.
            const params = new URLSearchParams({ action: "search_employee", q: value, limit: "100" });
            const response = await fetch(`${AUTH_API}?${params.toString()}`, {
                credentials: "include"
            });
            const payload = await response.json().catch(() => ({ ok: false, items: [] }));
            const items = response.ok && payload.ok ? (payload.items || []) : [];
            setCachedValue("employees_profile_employee_search", key, items);
            renderTravelSearchResults(items);
        } catch (_error) {
            renderTravelSearchResults([]);
        }
    }

    function renderEpassPeople() {
        if (epassEmployeeDirectoryItems.length) {
            renderEpassEmployeeDirectory(
                epassEmployeeDirectoryItems,
                epassEmployeeDirectoryPage,
                epassEmployeeDirectoryTotalPages,
                epassEmployeeDirectoryTotalItems
            );
        }
        renderFuelEmbedSelectedSummary();
        syncEpassRequestSummary();
    }

    function epassRequestPeople(item = {}) {
        const names = Array.isArray(item.requester_names) ? item.requester_names : [];
        const usercodes = Array.isArray(item.requester_usercodes) ? item.requester_usercodes : [];
        const photos = Array.isArray(item.requester_photo_urls) ? item.requester_photo_urls : [];
        const grantedTo = Array.isArray(item.granted_to) ? item.granted_to : [];
        const directoryByCode = new Map(
            [...(Array.isArray(users) ? users : []), ...(Array.isArray(epassEmployeeDirectoryItems) ? epassEmployeeDirectoryItems : [])]
                .map((person) => [String(person?.usercode || "").trim().toUpperCase(), person])
                .filter(([usercode]) => usercode)
        );
        const length = Math.max(names.length, usercodes.length, photos.length, grantedTo.length);
        const people = [];

        for (let index = 0; index < length; index += 1) {
            const grantedPerson = grantedTo[index] && typeof grantedTo[index] === "object" ? grantedTo[index] : {};
            const name = String(names[index] || grantedPerson.name || grantedTo[index] || "").trim();
            const usercode = String(usercodes[index] || grantedPerson.usercode || "").trim().toUpperCase();
            if (!name && !usercode) {
                continue;
            }
            const directoryPerson = directoryByCode.get(usercode) || {};
            // ponytail: legacy S2 codes end with the user Id; keep initials as the safe fallback if that convention changes.
            const legacyUserId = Number(usercode.match(/(\d+)$/)?.[1] || 0);
            people.push({
                name: name || usercode || "Employee",
                usercode,
                position: String(directoryPerson.position || grantedPerson.position || "").trim(),
                profile_photo_url: String(
                    directoryPerson.profile_photo_url ||
                    directoryPerson.photo_url ||
                    grantedPerson.profile_photo_url ||
                    grantedPerson.photo_url ||
                    photos[index] ||
                    (legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "") ||
                    ""
                ).trim()
            });
        }

        if (!people.length && grantedTo.length) {
            return grantedTo.map((person) => typeof person === "object"
                ? normalizeEmployeeDirectoryItem(person)
                : { name: String(person || "").trim() || "Employee", usercode: "", profile_photo_url: "" });
        }

        return people;
    }

    function epassDateInputValue(value) {
        const raw = String(value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return raw;
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
            return "";
        }
        return datePart(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    function fillEpassFormForEdit(item) {
        if (!item || epassStatusClass(item.status) !== "pending") {
            return false;
        }

        const epassNumber = String(item.epassnumber || "").trim();
        if (!epassNumber) {
            return false;
        }

        epassEditingNumber = epassNumber;
        setRequestApproverSelection("epass", item);
        requestNumberPreviewState.epass = epassNumber;
        const number = document.getElementById("epass-request-number");
        const department = document.getElementById("epass-department");
        const destination = document.getElementById("epass-destination");
        const date = document.getElementById("epass-date");
        const dateLabel = document.getElementById("epass-date-label");
        const purpose = document.getElementById("epass-purpose");
        const submit = document.getElementById("epass-submit");
        const newRequest = document.getElementById("epass-new-request");
        const message = document.getElementById("epass-form-message");
        const dateValue = epassDateInputValue(item.date);

        if (number) number.textContent = epassNumber;
        if (department) {
            const wanted = resolveEpassDepartmentFilter(item.department).toUpperCase();
            const option = Array.from(department.options).find((entry) => (
                String(entry.value || "").toUpperCase() === String(item.department || "").toUpperCase()
                || String(entry.textContent || "").trim().toUpperCase() === wanted
            ));
            if (option) department.value = option.value;
        }
        if (destination) destination.value = String(item.destination || "");
        if (date) date.value = dateValue;
        if (dateLabel) dateLabel.textContent = dateValue ? displayDate(dateValue) : "Date";
        if (purpose) purpose.value = String(item.purpose || "");
        if (submit) submit.textContent = "UPDATE";
        if (newRequest) newRequest.hidden = false;
        if (message) message.textContent = `Editing ${epassNumber}. Save changes while this request is pending.`;

        calendarView.epass = null;
        renderEpassDateSummary();
        renderCalendar("epass");

        epassPeople = epassRequestPeople(item);
        savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
        renderEpassPeople();
        syncEpassRequestSummary();
        document.getElementById("epass-destination")?.focus();
        return true;
    }

    function syncEpassHistoryPanel() {
        const panel = document.querySelector(".epass-reference-history");
        const shell = panel?.closest(".epass-history-shell");
        const toggle = document.getElementById("epass-history-toggle");
        const pinToggle = document.getElementById("epass-history-pin-toggle");
        if (!panel || !toggle) {
            return;
        }
        panel.classList.toggle("is-collapsed", epassHistoryCollapsed);
        panel.classList.toggle("is-open", !epassHistoryCollapsed);
        if (shell) {
            shell.classList.toggle("is-history-collapsed", epassHistoryCollapsed);
            shell.classList.toggle("is-history-open", !epassHistoryCollapsed);
        }
        toggle.setAttribute("aria-expanded", epassHistoryCollapsed ? "false" : "true");
        toggle.innerHTML = epassHistoryCollapsed
            ? '<i class="fa fa-chevron-down" aria-hidden="true"></i><span>Show old requests</span>'
            : '<i class="fa fa-chevron-up" aria-hidden="true"></i><span>Hide old requests</span>';
        if (pinToggle) {
            pinToggle.classList.toggle("is-pinned", !epassHistoryCollapsed);
            pinToggle.setAttribute("aria-pressed", epassHistoryCollapsed ? "false" : "true");
            pinToggle.setAttribute("aria-label", epassHistoryCollapsed ? "Show old requests" : "Hide old requests");
            pinToggle.setAttribute("title", epassHistoryCollapsed ? "Show old requests" : "Hide old requests");
        }
    }

    function renderEpassList(items) {
        const target = document.getElementById("epass-list-body");
        epassListItems = items || [];
        if (!target) {
            return;
        }

        if (!epassListItems.length) {
            target.innerHTML = `
                <div class="epass-list-empty">
                    <i class="fa fa-id-card-o"></i>
                    <span>No EPASS requests yet.</span>
                </div>
            `;
            showEpassDetail(null);
            return;
        }

        target.innerHTML = epassListItems.map((item, index) => {
            const people = epassRequestPeople(item);
            const statusClass = Number(item.dept_head_status || 0) === 2 || Number(item.status || 0) === 3
                ? "error"
                : epassStatusClass(item.status);
            const cardTone = statusClass === "approved"
                ? {
                    background: "linear-gradient(135deg,#ffffff 0%,#f2fff7 55%,#dcfce7 100%)",
                    border: "1px solid rgba(74, 222, 128, 0.35)"
                }
                : statusClass === "error"
                    ? {
                        background: "linear-gradient(135deg,#ffffff 0%,#fff5f5 55%,#ffe1e1 100%)",
                        border: "1px solid rgba(248, 113, 113, 0.35)"
                    }
                    : {
                        background: "linear-gradient(135deg,#ffffff 0%,#fffdf2 55%,#fef3c7 100%)",
                        border: "1px solid rgba(251, 191, 36, 0.35)"
                    };
            const stalePending = isEpassStalePending(item);
            const canPrint = statusClass === "approved";
            const isExpanded = epassExpandedRows.has(index);
            const peopleSummary = people.length
                ? `${people.length} employee${people.length === 1 ? "" : "s"} linked`
                : "No employees listed";
            return `
                <div class="epass-list-row epass-list-card epass-history-entry status-${statusClass}${stalePending ? " stale-pending" : ""}${isExpanded ? " is-expanded" : ""}" data-epass-list-index="${index}" data-epass-editable="${statusClass === "pending" ? "true" : "false"}" role="button" tabindex="0" title="${statusClass === "pending" ? "Click to edit this pending EPASS" : "Approved requests cannot be edited"}" style="display:block;padding:14px 16px;border-radius:14px;background:${cardTone.background};border:${cardTone.border};cursor:${statusClass === "pending" ? "pointer" : "default"};">
                    <div class="epass-list-card-top epass-history-entry-top" style="width:100%;min-width:0;display:flex;align-items:center;gap:14px;">
                        <div class="epass-list-icon epass-history-entry-icon" style="width:44px;height:44px;flex:0 0 44px;border-radius:12px;background:linear-gradient(135deg,#eef2ff 0%,#e7f0ff 100%);color:#4f6ef7;display:grid;place-items:center;"><i class="fa fa-id-card-o"></i></div>
                        <div class="epass-list-main epass-history-entry-main" style="flex:1 1 auto;min-width:0;display:grid;gap:3px;">
                            <strong>${escapeHtml(item.epassnumber || "-")}</strong>
                            <span>${escapeHtml(item.destination || item.department || "-")}</span>
                            <small>${escapeHtml(peopleSummary)}</small>
                        </div>
                        <div class="epass-list-side epass-history-entry-side" style="flex:0 0 108px;min-width:108px;display:grid;gap:6px;justify-items:end;text-align:right;">
                            <span>${escapeHtml(item.date || "-")}</span>
                            <em class="${statusClass}">${escapeHtml(item.status_label || "Pending")}</em>
                        </div>
                        <div class="epass-list-actions epass-history-entry-actions" style="flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;">
                            <button class="epass-people-toggle" type="button" data-epass-list-expand="${index}" aria-expanded="${isExpanded ? "true" : "false"}" title="${isExpanded ? "Hide employees" : "Show employees"}" style="width:36px;height:36px;border-radius:11px;border:1px solid rgba(162,186,226,.45);background:#fff;color:#4a77d4;">
                                <i class="fa ${isExpanded ? "fa-chevron-up" : "fa-chevron-down"}"></i>
                            </button>
                            ${canPrint ? `
                                <button class="epass-print-btn" type="button" data-epass-print-index="${index}" title="Print approved EPASS" aria-label="Print ${escapeHtml(item.epassnumber || "approved EPASS")}" style="width:36px;height:36px;border-radius:11px;border:1px solid rgba(22,163,74,.28);background:#ecfdf3;color:#15803d;">
                                    <i class="fa fa-print"></i>
                                </button>
                            ` : ""}
                        </div>
                    </div>
                    <div class="epass-list-people-panel${isExpanded ? " is-open" : ""}" style="${isExpanded ? "max-height:140px;opacity:1;transform:translateY(0);margin-top:12px;overflow:hidden;" : "max-height:0;opacity:0;transform:translateY(-8px);overflow:hidden;"}">
                        <div class="epass-list-people-grid" style="display:flex;gap:10px;padding:2px 2px 8px;overflow-x:auto;overflow-y:hidden;white-space:nowrap;scrollbar-width:thin;-webkit-overflow-scrolling:touch;">
                            ${people.length ? people.map((person) => `
                                <div class="epass-list-person-chip" style="flex:0 0 260px;display:grid;grid-template-columns:42px minmax(0,1fr);align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:#ffffff;border:1px solid rgba(200,215,240,.9);">
                                    ${renderEmployeeAvatar(person, "epass-list-person-avatar")}
                                    <span class="epass-list-person-main" style="display:grid;gap:2px;min-width:0;">
                                        <strong style="color:#1f3153;font-size:14px;font-weight:800;line-height:1.25;overflow-wrap:anywhere;">${escapeHtml(person.name)}</strong>
                                        <small style="color:#6b7b95;font-size:12px;font-weight:700;line-height:1.3;">${escapeHtml(person.usercode || "Linked employee")}</small>
                                    </span>
                                </div>
                            `).join("") : '<div class="epass-list-person-chip is-empty" style="flex:0 0 260px;padding:12px 14px;border-radius:12px;background:#fff;border:1px dashed rgba(162,186,226,.5);"><span class="epass-list-person-main" style="display:grid;gap:2px;"><strong style="color:#1f3153;font-size:14px;font-weight:800;">No employees listed</strong><small style="color:#6b7b95;font-size:12px;font-weight:700;">This EPASS record has no saved employee names.</small></span></div>'}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
        syncEpassHistoryPanel();
    }

    function getEpassHistoryIdentifiers(profile = null) {
        // ponytail: history belongs to the profile owner, not the EPASS passenger list.
        const ids = [
            employee.usercode,
            employee.accountnumber,
            employee.username,
            employee.bioUID,
            session.usercode,
            session.accountnumber,
            session.username,
            session.bioUID,
            profile?.usercode,
            profile?.accountnumber,
            profile?.username,
            profile?.bioUID
        ];

        return Array.from(new Set(
            ids
                .map((value) => String(value || "").trim().toUpperCase())
                .filter(Boolean)
        ));
    }

    function overtimeTimePresetKey(preset) {
        return [preset?.time_from || "", preset?.time_to || "", String(preset?.hours ?? "")].join("|");
    }

    function normalizeOvertimeTimeInputClient(value) {
        const raw = String(value || "").trim();
        if (!raw) {
            return "";
        }
        if (/^\d{1,2}:\d{2}$/.test(raw)) {
            const parts = raw.split(":");
            return `${String(Number(parts[0] || 0)).padStart(2, "0")}:${String(Number(parts[1] || 0)).padStart(2, "0")}`;
        }
        const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (match) {
            let hour = Number(match[1] || 0);
            const minute = String(match[2] || "00").padStart(2, "0");
            const meridiem = String(match[3] || "").toUpperCase();
            if (meridiem === "PM" && hour < 12) {
                hour += 12;
            }
            if (meridiem === "AM" && hour === 12) {
                hour = 0;
            }
            return `${String(hour).padStart(2, "0")}:${minute}`;
        }
        return raw;
    }

    function formatOvertimeTimeLabel(value24) {
        const raw = String(value24 || "").trim();
        if (!raw) {
            return "";
        }
        const parts = raw.split(":");
        const hour = Number(parts[0] || 0);
        const minute = Number(parts[1] || 0);
        const stamp = new Date(2000, 0, 1, hour, minute);
        return stamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    function syncOvertimeHours() {
        const fromInput = document.getElementById("overtime-time-from");
        const toInput = document.getElementById("overtime-time-to");
        const hoursInput = document.getElementById("overtime-hours");
        if (!fromInput || !toInput || !hoursInput) {
            return;
        }
        const fromParts = (fromInput.value || "17:00").split(":");
        const toParts = (toInput.value || "19:00").split(":");
        const fromMinutes = Number(fromParts[0] || 0) * 60 + Number(fromParts[1] || 0);
        const toMinutes = Number(toParts[0] || 0) * 60 + Number(toParts[1] || 0);
        const diff = Math.max(0, toMinutes - fromMinutes);
        hoursInput.value = (diff / 60).toFixed(diff % 60 === 0 ? 0 : 1);
    }

    function updateOvertimeCalendarFace(dateValue = "") {
        const date = new Date(`${dateValue || todayInputValue()}T00:00:00`);
        if (Number.isNaN(date.getTime())) return;
        const month = document.getElementById("overtime-calendar-month");
        const day = document.getElementById("overtime-calendar-day");
        const caption = document.getElementById("overtime-calendar-caption");
        if (month) month.textContent = date.toLocaleString("en-US", { month: "long" }).toUpperCase();
        if (day) day.textContent = String(date.getDate()).padStart(2, "0");
        if (caption) caption.textContent = `${date.toLocaleString("en-US", { weekday: "long" })} · ${date.getFullYear()}`;
    }

    // [UI] GABAY: Sa schedule picker naka-centralize ang date at oras; dito binubuo ang summary sa main OT form.
    function updateOvertimeScheduleSummary() {
        const summary = document.getElementById("overtime-schedule-summary");
        const status = document.getElementById("overtime-schedule-status");
        const dateValue = document.getElementById("overtime-date")?.value || "";
        const fromValue = document.getElementById("overtime-time-from")?.value || "";
        const toValue = document.getElementById("overtime-time-to")?.value || "";
        const hoursValue = Number(document.getElementById("overtime-hours")?.value || 0);
        const parts = [];

        if (!overtimeEditingNumber && overtimeSelectedTimePresets.size) {
            const selected = Array.from(overtimeSelectedTimePresets.values())
                .sort((left, right) => String(left.date_value).localeCompare(String(right.date_value)));
            const selectedCards = selected.map((item) => {
                const date = new Date(`${item.date_value || ""}T00:00:00`);
                const validDate = !Number.isNaN(date.getTime());
                const monthLabel = validDate ? date.toLocaleString("en-US", { month: "long" }).toUpperCase() : "OT";
                const dayLabel = validDate ? String(date.getDate()).padStart(2, "0") : "--";
                const dateCaption = validDate ? `${date.toLocaleString("en-US", { weekday: "short" })} ${date.getFullYear()}` : "Selected date";
                const fromLabel = formatOvertimeTimeLabel(item.time_from) || "--:--";
                const toLabel = formatOvertimeTimeLabel(item.time_to) || "--:--";
                const hoursValue = Number(item.hours || 0);
                const hoursLabel = hoursValue > 0 ? `${Number(hoursValue.toFixed(2))} hr` : "DTR time";
                return '<span class="overtime-selected-summary-card">'
                    + '<span class="dtr-ot-card-month">' + escapeHtml(monthLabel) + '</span>'
                    + '<span class="dtr-ot-card-multi-select" aria-hidden="true"><i class="fa fa-check"></i></span>'
                    + '<span class="dtr-ot-card-main">'
                    + '<span class="dtr-ot-card-date"><strong>' + escapeHtml(dayLabel) + '</strong><small>' + escapeHtml(dateCaption) + '</small></span>'
                    + '<span class="dtr-ot-card-times"><span class="dtr-ot-card-time dtr-ot-card-time--in"><small>OT IN</small><strong>' + escapeHtml(fromLabel) + '</strong></span><i class="fa fa-long-arrow-right dtr-ot-card-arrow" aria-hidden="true"></i><span class="dtr-ot-card-time dtr-ot-card-time--out"><small>OT OUT</small><strong>' + escapeHtml(toLabel) + '</strong></span></span>'
                    + '</span>'
                    + '<span class="dtr-ot-card-foot"><span class="dtr-ot-card-duration">' + escapeHtml(hoursLabel) + '</span><span class="dtr-ot-card-use"><i class="fa fa-check-circle" aria-hidden="true"></i> Selected</span></span>'
                    + '</span>';
            });
            if (summary) {
                summary.classList.add("is-multi-calendar");
                summary.innerHTML = selectedCards.join("");
            }
            if (status) status.textContent = `${selected.length} OT day${selected.length === 1 ? "" : "s"} selected with the same task.`;
            return `${selected.length} selected OT day${selected.length === 1 ? "" : "s"}`;
        }

        if (dateValue) {
            parts.push(displayDate(dateValue));
        }
        if (fromValue || toValue) {
            const fromLabel = formatOvertimeTimeLabel(fromValue);
            const toLabel = formatOvertimeTimeLabel(toValue);
            parts.push([fromLabel, toLabel].filter(Boolean).join(" - "));
        }
        if (hoursValue > 0) {
            parts.push(`${hoursValue}${hoursValue % 1 === 0 ? "" : ""} hr`);
        }

        const value = parts.length ? parts.join(" | ") : "Select date and time";
        if (summary) {
            summary.classList.remove("is-multi-calendar");
            summary.textContent = value;
        }
        if (status) {
            status.textContent = parts.length ? "Date and time confirmed." : "Confirm date and time before saving.";
        }
        return value;
    }

    function setOvertimeScheduleModalOpen(open) {
        const overlay = document.getElementById("overtime-schedule-overlay");
        const panel = overlay?.querySelector(".overtime-schedule-panel");
        const toggle = document.getElementById("overtime-open-schedule");
        if (!overlay) {
            return;
        }

        const isOpen = Boolean(open);
        if (isOpen) {
            setOvertimeListOverlayOpen(false);
        }
        overlay.classList.toggle("is-open", isOpen);
        overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
        if (toggle) {
            toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
        if (isOpen) {
            requestAnimationFrame(() => {
                document.getElementById("overtime-date")?.focus();
            });
        } else {
            panel?.blur?.();
        }
    }

    function highlightOvertimeTimePreset(key = "") {
        overtimeActiveTimePresetKey = key;
        document.querySelectorAll(".overtime-time-preset-btn").forEach((button) => {
            const active = button.dataset.presetKey === key;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function updateOvertimeMultiSelectionUi() {
        const count = overtimeSelectedTimePresets.size;
        const saveBtn = document.getElementById("overtime-submit");
        const note = document.getElementById("overtime-schedule-foot-note");
        if (saveBtn && !overtimeEditingNumber) {
            saveBtn.textContent = count > 1 ? `SAVE ${count} DAYS OT` : "SAVE OT";
        }
        if (note) {
            note.textContent = count
                ? `${count} OT day${count === 1 ? "" : "s"} selected. All will use the same task.`
                : "Choose a date and time, then close this popup to continue.";
        }
    }

    function toggleOvertimeMultiPreset(button) {
        const key = String(button?.dataset?.presetKey || "");
        if (!key) return;
        if (overtimeSelectedTimePresets.has(key)) {
            overtimeSelectedTimePresets.delete(key);
        } else {
            overtimeSelectedTimePresets.set(key, {
                key,
                date_value: button.dataset.dateValue || "",
                time_from: button.dataset.timeFrom || "",
                time_to: button.dataset.timeTo || "",
                hours: Number(button.dataset.hours || 0)
            });
        }
        renderOvertimeTimePresets(overtimeTimePresets);
        updateOvertimeMultiSelectionUi();
        updateOvertimeScheduleSummary();
    }

    function applyOvertimeTimePreset(preset, options = {}) {
        if (!preset) {
            return;
        }
        const fromInput = document.getElementById("overtime-time-from");
        const toInput = document.getElementById("overtime-time-to");
        const hoursInput = document.getElementById("overtime-hours");
        const dateInput = document.getElementById("overtime-date");
        if (dateInput && preset.date_value) {
            dateInput.value = preset.date_value;
        }
        if (fromInput && preset.time_from) {
            fromInput.value = preset.time_from;
        }
        if (toInput && preset.time_to) {
            toInput.value = preset.time_to;
        }
        syncOvertimeHours();
        if (hoursInput && Number(preset.hours || 0) > 0) {
            hoursInput.value = Number(preset.hours).toFixed(Number(preset.hours) % 1 === 0 ? 0 : 1);
        }
        highlightOvertimeTimePreset(overtimeTimePresetKey(preset));
        updateOvertimeScheduleSummary();
        if (options.closeListOverlay) {
            setOvertimeListOverlayOpen(false);
        }
    }

    function overtimePresetStatusTone(status) {
        return epassStatusClass(status);
    }

    function selectedOvertimeTimePreset() {
        const timeFrom = document.getElementById("overtime-time-from")?.value || "";
        const timeTo = document.getElementById("overtime-time-to")?.value || "";
        if (!timeFrom || !timeTo) {
            return null;
        }
        const dateValue = document.getElementById("overtime-date")?.value || "";
        return {
            time_from: timeFrom,
            time_to: timeTo,
            hours: Number(document.getElementById("overtime-hours")?.value || 0),
            time_label: `${formatOvertimeTimeLabel(timeFrom)} – ${formatOvertimeTimeLabel(timeTo)}`,
            status_tone: "pending",
            note: `${dateValue ? displayDate(dateValue) : "Current date"} · Selected schedule`,
            is_current_selection: true
        };
    }

    function dtrOvertimeTimePresets(rowsSource = latestDtrRows, range = latestDtrRange) {
        const presets = [];
        if (!range) return presets;
        for (let day = 1; day <= range.days; day += 1) {
            const row = rowsSource[day];
            if (!Array.isArray(row)) continue;
            const correctionCells = row.correctionCells || {};
            const rowValues = row.slice(0, 6).map((value, column) => {
                const correction = correctionCells[column] || row.approvedCorrections?.[DTR_EDIT_FIELDS[column][0]] || null;
                return correction?.proposed_value !== undefined
                    ? String(correction.proposed_value || "")
                    : dtrValueAs24Hour(value, DTR_EDIT_FIELDS[column][0]);
            });
            const timeFrom = String(rowValues[4] || "");
            const timeTo = String(rowValues[5] || "");
            if (!timeFrom && !timeTo) continue;
            const dateValue = row.workDate || `${range.year}-${String(range.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const [fromHour = 0, fromMinute = 0] = timeFrom.split(":").map(Number);
            const [toHour = 0, toMinute = 0] = timeTo.split(":").map(Number);
            const hours = timeFrom && timeTo
                ? Math.max(0, ((toHour * 60 + toMinute) - (fromHour * 60 + fromMinute)) / 60)
                : 0;
            presets.push({
                date_value: dateValue,
                time_from: timeFrom,
                time_to: timeTo,
                hours,
                time_label: [formatOvertimeTimeLabel(timeFrom), formatOvertimeTimeLabel(timeTo)].filter(Boolean).join(" - "),
                status_tone: "approved",
                note: `${dateValue ? displayDate(dateValue) : "DTR"} - From DTR overtime`,
                last_used: ""
            });
        }
        // ponytail: accept any loaded month while defaulting to the DTR already rendered on screen.
        return presets;
    }

    function renderOvertimeTimePresets(presets) {
        const target = document.getElementById("overtime-time-presets-list");
        const wrap = document.getElementById("overtime-time-presets-wrap");
        if (!target) {
            return;
        }

        if (!document.getElementById("dtr-ot-calendar-card-style")) {
            const style = document.createElement("style");
            style.id = "dtr-ot-calendar-card-style";
            style.textContent = `
                #overtime-time-presets-wrap{padding:18px!important;border-radius:20px!important;background:linear-gradient(145deg,#f8faff,#eef4ff)!important}
                #overtime-time-presets-list{display:flex!important;gap:14px!important;overflow-x:auto;padding:3px 3px 12px;scroll-snap-type:x mandatory;scrollbar-width:thin;scrollbar-color:#9db4e8 transparent}
                #overtime-time-presets-list .overtime-time-preset-btn{position:relative;display:flex!important;flex:0 0 258px;min-width:0!important;flex-direction:column;overflow:hidden;padding:0!important;border:1px solid #ccd9f2!important;border-radius:19px!important;background:#fff!important;color:#17233b!important;text-align:left;box-shadow:0 10px 24px rgba(32,56,111,.1)!important;scroll-snap-align:start;transition:transform .18s,box-shadow .18s,border-color .18s,filter .18s}
                #overtime-time-presets-list .overtime-time-preset-btn:hover{transform:translateY(-4px);border-color:#7da2ff!important;box-shadow:0 16px 30px rgba(32,56,111,.16)!important}
                #overtime-time-presets-list .overtime-time-preset-btn.active{border-color:#12a66a!important;box-shadow:0 0 0 3px rgba(18,166,106,.13),0 14px 28px rgba(18,166,106,.15)!important}
                #overtime-time-presets-list .overtime-time-preset-btn.is-multi-selected{border-color:#315be8!important;box-shadow:0 0 0 3px rgba(49,91,232,.14),0 14px 28px rgba(49,91,232,.15)!important}
                #overtime-time-presets-list .overtime-time-preset-btn.is-old{filter:grayscale(1);border-color:#c8cdd6!important;background:#eef0f3!important;box-shadow:none!important;opacity:.78}#overtime-time-presets-list .overtime-time-preset-btn.is-old .dtr-ot-card-month{background:#737b89}#overtime-time-presets-list .overtime-time-preset-btn.is-old:hover{filter:grayscale(.75);opacity:1;transform:translateY(-3px)}
                .dtr-ot-card-month{display:block;padding:9px 14px;background:linear-gradient(110deg,#315be8,#6938ef);color:#fff;font-size:10px;font-weight:950;letter-spacing:.18em;text-align:center}
                .overtime-time-preset-btn.active .dtr-ot-card-month{background:linear-gradient(110deg,#087a55,#12a66a)}
                .dtr-ot-card-multi-select{position:absolute;right:10px;top:7px;z-index:2;display:grid;width:23px;height:23px;place-items:center;border:2px solid rgba(255,255,255,.94);border-radius:50%;background:#fff;color:transparent;box-shadow:0 3px 9px rgba(24,40,86,.25);cursor:pointer;transition:transform .16s,background .16s,color .16s}.dtr-ot-card-multi-select:hover{transform:scale(1.12)}.overtime-time-preset-btn.is-multi-selected .dtr-ot-card-multi-select{background:#315be8;color:#fff}.dtr-ot-card-multi-select i{font-size:11px}
                .dtr-ot-card-main{display:grid!important;grid-template-columns:82px 1fr;gap:13px;align-items:center;padding:15px!important}
                .dtr-ot-card-date{display:flex;min-height:76px;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid #e1e7f2}.dtr-ot-card-date strong{font-size:42px;font-weight:950;line-height:.9;letter-spacing:-.06em}.dtr-ot-card-date small{margin-top:8px;color:#6a7891;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
                .dtr-ot-card-times{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.dtr-ot-card-time{display:flex;min-width:0;flex-direction:column}.dtr-ot-card-time small{color:#71809a;font-size:8px;font-weight:950;letter-spacing:.12em}.dtr-ot-card-time strong{margin-top:4px;font-size:14px;font-weight:950;white-space:nowrap}.dtr-ot-card-time--in strong{color:#087a55}.dtr-ot-card-time--out strong{color:#c05213}.dtr-ot-card-arrow{color:#91a0ba;font-size:15px}
                .dtr-ot-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid #e4e9f3;background:#f8faff}.dtr-ot-card-duration{color:#4c5e7b;font-size:10px;font-weight:900}.dtr-ot-card-use{color:#315be8;font-size:9px;font-weight:950;letter-spacing:.05em;text-transform:uppercase}.overtime-time-preset-btn.active .dtr-ot-card-use{color:#087a55}
                .dtr-ot-card-age{position:absolute;right:8px;top:39px;padding:3px 6px;border-radius:999px;background:#5f6672;color:#fff;font-size:7px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
                #overtime-schedule-summary.is-multi-calendar{display:flex;gap:10px;max-width:100%;overflow-x:auto;padding:4px 2px 8px;scroll-snap-type:x mandatory}
                .overtime-selected-summary-card{position:relative;display:flex;flex:0 0 250px;flex-direction:column;overflow:hidden;border:2px solid #315be8;border-radius:16px;background:#fff;box-shadow:0 7px 18px rgba(49,91,232,.13);scroll-snap-align:start}
                .overtime-selected-summary-card .dtr-ot-card-month{padding:7px 12px;font-size:9px;text-align:left}.overtime-selected-summary-card .dtr-ot-card-main{grid-template-columns:74px 1fr;padding:11px!important}.overtime-selected-summary-card .dtr-ot-card-date{min-height:64px}.overtime-selected-summary-card .dtr-ot-card-date strong{font-size:35px}.overtime-selected-summary-card .dtr-ot-card-time strong{font-size:12px}.overtime-selected-summary-card .dtr-ot-card-foot{padding:7px 11px}.overtime-selected-summary-card .dtr-ot-card-multi-select{background:#315be8;color:#fff;cursor:default}
                .profile-modal.overtime-mode .profile-modal-card{display:flex!important;flex-direction:column!important}.profile-modal.overtime-mode .profile-modal-body{flex:1 1 auto!important;height:0!important}.profile-modal.overtime-mode .overtime-panel,.profile-modal.overtime-mode .overtime-form-card,.profile-modal.overtime-mode .overtime-request-sheet,.profile-modal.overtime-mode .overtime-request-layout{height:100%!important;min-height:0!important}.profile-modal.overtime-mode .overtime-form-card,.profile-modal.overtime-mode .overtime-request-sheet{grid-template-rows:minmax(0,1fr)!important}
                .overtime-memorandum-slab{display:flex;align-items:center;gap:12px;padding:12px 15px;border-radius:14px;background:#eef3fb;color:#17233b}.overtime-memorandum-slab span{color:#65738c;font-size:9px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.overtime-memorandum-slab strong{font-size:14px;font-weight:950}.overtime-panel .overtime-profile-slab-form{grid-template-columns:repeat(2,minmax(0,1fr))!important}
                .overtime-panel .overtime-purpose-shell{flex:3 1 0!important;min-height:130px!important}.overtime-panel .overtime-result-shell{flex:2 1 0!important;min-height:105px!important}.overtime-panel .overtime-purpose,.overtime-panel .overtime-result{flex:1 1 auto;height:100%!important;min-height:100%!important;resize:vertical}
                .overtime-history-panel{overflow:hidden!important;border:1px solid #dbe4f3!important;border-radius:22px!important;background:#f3f6fb!important;box-shadow:0 24px 60px rgba(24,42,82,.22)!important}.overtime-history-head{padding:17px 20px!important;background:linear-gradient(120deg,#182641,#274375)!important;color:#fff!important}.overtime-history-head-copy span{color:#9ebcff!important}.overtime-history-head-copy strong{color:#fff!important;font-size:17px!important}.overtime-history-head-actions button,.overtime-pager-page{color:#fff!important}.overtime-list-body{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px!important;align-content:start;padding:16px!important;background:#f3f6fb!important;overflow:auto!important}
                .overtime-request-card{overflow:hidden;border:1px solid #dbe4f2;border-radius:18px;background:#fff;box-shadow:0 9px 24px rgba(28,50,94,.08);transition:transform .18s,box-shadow .18s,border-color .18s}.overtime-request-card:hover{transform:translateY(-2px);border-color:#9bb5ef;box-shadow:0 15px 32px rgba(28,50,94,.13)}.overtime-request-card.status-error{border-color:#f3b5b5}.overtime-request-card__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid #e7ecf4;background:linear-gradient(135deg,#fff,#f7f9fd)}.overtime-request-card__identity{display:flex;align-items:center;gap:10px;min-width:0}.overtime-request-card__identity>span:last-child{display:flex;min-width:0;flex-direction:column}.overtime-request-card__identity small,.overtime-request-card__state time,.overtime-request-card__work small,.overtime-request-card__memo small,.overtime-request-card__monitor-title small,.overtime-request-card__schedule small{color:#70809b;font-size:8px;font-weight:950;letter-spacing:.12em}.overtime-request-card__identity strong{margin-top:2px;color:#17233b;font-size:15px;font-weight:950}.overtime-request-card__icon{display:grid;width:36px;height:36px;place-items:center;border-radius:12px;background:#e9efff;color:#315be8}.overtime-request-card__state{display:flex;align-items:flex-end;flex-direction:column;gap:5px}.overtime-request-card__state em{padding:5px 9px;border-radius:999px;background:#fff1d5;color:#a66300;font-size:9px;font-style:normal;font-weight:950}.overtime-request-card__state em.approved{background:#dcf8e8;color:#087a55}.overtime-request-card__state em.error{background:#ffe3e3;color:#bd2727}
                .overtime-request-card__body{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(160px,.85fr);gap:14px;padding:14px}.overtime-request-card__details{display:grid;gap:10px;min-width:0}.overtime-request-card__schedule{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-radius:13px;background:#eef3ff}.overtime-request-card__schedule span{display:flex;min-width:0;flex-direction:column}.overtime-request-card__schedule strong{margin-top:3px;color:#1e3f8f;font-size:13px}.overtime-request-card__schedule b{padding:6px 8px;border-radius:9px;background:#fff;color:#315be8;font-size:11px}.overtime-request-card__tags{display:flex;flex-wrap:wrap;gap:6px}.overtime-request-card__tags span{padding:4px 7px;border-radius:7px;background:#edf1f6;color:#526078;font-size:8px;font-weight:900;text-transform:uppercase}.overtime-request-card__memo{display:flex;flex-direction:column;padding:8px 10px;border-left:3px solid #6b4bf4;background:#f7f5ff}.overtime-request-card__memo strong{margin-top:2px;color:#32276b;font-size:11px}.overtime-request-card__work{display:grid;grid-template-columns:1fr 1fr;gap:8px}.overtime-request-card__work>div{min-width:0;padding:10px;border-radius:12px;background:#f7f9fc}.overtime-request-card__work>div.result{background:#f0fbf5}.overtime-request-card__work p{display:-webkit-box;overflow:hidden;margin:4px 0 0;color:#28364d;font-size:11px;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:3}.overtime-request-card__work .result small{color:#168157}
                .overtime-request-card__monitor{min-width:0;padding:10px;border:1px solid #e2e8f2;border-radius:14px;background:#fbfcff}.overtime-request-card__monitor-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.overtime-request-card__monitor-title span{color:#526078;font-size:9px;font-weight:900}.overtime-request-card .overtime-monitor-inline{width:100%!important;margin:0!important;padding:0!important}.overtime-request-card .overtime-monitor-steps{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}.overtime-request-card .overtime-monitor-step{display:flex!important;min-width:0!important;align-items:center!important;flex-direction:column!important;gap:5px!important;text-align:center!important}.overtime-request-card .overtime-monitor-avatar{width:38px!important;height:38px!important}.overtime-request-card .overtime-monitor-copy strong{display:block;overflow:hidden;max-width:100%;font-size:8px!important;text-overflow:ellipsis;white-space:nowrap}.overtime-request-card .overtime-monitor-copy small{font-size:7px!important}.overtime-request-card__foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid #e7ecf4;background:#fafbfd}.overtime-request-card__audit{display:flex;min-width:0;align-items:center;gap:7px;color:#6b7890;font-size:9px}.overtime-request-card__audit>span{display:flex;min-width:0;flex-direction:column}.overtime-request-card__audit small{overflow:hidden;max-width:280px;text-overflow:ellipsis;white-space:nowrap}.overtime-request-card .overtime-list-actions{display:flex;gap:6px}.overtime-request-card .overtime-edit-btn,.overtime-request-card .overtime-remove-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:9px;font-size:9px;font-weight:900}.overtime-request-card .overtime-edit-btn{border:1px solid #b9cdfa;background:#edf3ff;color:#2858c7}.overtime-request-card .overtime-remove-btn{border:1px solid #ffc3c3;background:#fff1f1;color:#c52c2c}
                .overtime-list-overlay .overtime-history-panel{height:min(86vh,820px)!important;max-height:min(86vh,820px)!important;flex:1 1 auto!important}.overtime-list-overlay .overtime-list-body{grid-template-columns:1fr!important;grid-auto-rows:max-content!important;max-height:none!important}.overtime-request-card{display:flex!important;height:auto!important;min-height:310px!important;max-height:none!important;flex-direction:column!important;overflow:visible!important}.overtime-request-card__body{display:grid!important;height:auto!important;min-height:190px!important;overflow:visible!important}.overtime-request-card__details{display:flex!important;height:auto!important;min-height:0!important;flex-direction:column!important}.overtime-request-card__monitor{height:auto!important;min-height:150px!important;overflow:visible!important}.overtime-request-card__foot{justify-content:flex-end!important;margin-top:auto}
                .overtime-request-card__monitor{display:flex!important;min-height:210px!important;flex-direction:column!important;padding:18px!important}.overtime-request-card .overtime-monitor-inline,.overtime-request-card .overtime-monitor-steps-inner{display:flex!important;flex:1 1 auto!important;width:100%!important}.overtime-request-card .overtime-monitor-steps{display:grid!important;width:100%!important;grid-template-columns:repeat(auto-fit,minmax(110px,1fr))!important;gap:18px!important;align-items:center!important}.overtime-request-card .overtime-monitor-step{justify-content:center!important;gap:9px!important}.overtime-request-card .overtime-monitor-stage{display:grid!important;width:70px!important;height:70px!important;place-items:center!important}.overtime-request-card .overtime-monitor-avatar{width:64px!important;height:64px!important;border:3px solid #fff!important;box-shadow:0 6px 16px rgba(24,42,82,.16)!important}.overtime-request-card .overtime-monitor-avatar-image{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important}.overtime-request-card .overtime-monitor-avatar-fallback{display:grid;width:100%;height:100%;place-items:center;border-radius:50%;background:linear-gradient(145deg,#dfe8ff,#bcd0ff);color:#2447aa;font-size:17px;font-weight:950}.overtime-request-card .overtime-monitor-copy{width:100%!important}.overtime-request-card .overtime-monitor-copy strong{display:-webkit-box!important;overflow:hidden!important;font-size:11px!important;line-height:1.25!important;text-overflow:clip!important;white-space:normal!important;-webkit-box-orient:vertical;-webkit-line-clamp:2}.overtime-request-card .overtime-monitor-copy small{display:block!important;margin-top:3px;font-size:9px!important;line-height:1.2!important}.overtime-request-card .overtime-monitor-step-badge{font-size:9px!important}.overtime-request-card .overtime-monitor-status-icon{transform:scale(1.15)}
                .overtime-monitor-step.is-changeable{position:relative}.overtime-monitor-step.is-changeable .overtime-monitor-stage{padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer}.overtime-monitor-step.is-changeable .overtime-monitor-stage:hover,.overtime-monitor-step.is-changeable .overtime-monitor-stage:focus-visible{outline:3px solid rgba(49,91,232,.25);outline-offset:3px}.overtime-approver-popover{display:none}.overtime-approver-modal{position:fixed;z-index:100000;inset:0;display:grid;place-items:center;padding:20px;background:rgba(19,32,58,.58);backdrop-filter:blur(5px)}.overtime-approver-modal__card{width:min(480px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 40px));overflow:hidden;border:1px solid #d5e0f4;border-radius:22px;background:#fff;box-shadow:0 30px 80px rgba(10,24,52,.35)}.overtime-approver-modal__head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid #e5eaf3;background:linear-gradient(135deg,#f8faff,#eef3ff)}.overtime-approver-modal__head span{display:flex;flex-direction:column}.overtime-approver-modal__head small{color:#315be8;font-size:9px;font-weight:950;letter-spacing:.12em}.overtime-approver-modal__head strong{margin-top:3px;color:#17233b;font-size:18px}.overtime-approver-modal__close{display:grid;width:36px;height:36px;place-items:center;border:0;border-radius:11px;background:#e7edfa;color:#233c70;font-size:20px;cursor:pointer}.overtime-approver-modal .overtime-approver-popover{display:grid;gap:8px;max-height:min(480px,calc(100vh - 150px));overflow:auto;padding:14px}.overtime-approver-option{display:grid;width:100%;grid-template-columns:46px minmax(0,1fr) 22px;gap:11px;align-items:center;padding:11px;border:1px solid #e1e7f1;border-radius:13px;background:#f8faff;color:#17233b;text-align:left;cursor:pointer}.overtime-approver-option:hover,.overtime-approver-option.is-current{border-color:#6388ef;background:#edf3ff}.overtime-approver-option img,.overtime-approver-option__avatar{display:grid;width:46px;height:46px;place-items:center;border-radius:50%;object-fit:cover;background:#dfe8ff;color:#2447aa;font-size:12px;font-weight:950}.overtime-approver-option span{min-width:0}.overtime-approver-option strong,.overtime-approver-option small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.overtime-approver-option strong{font-size:12px}.overtime-approver-option small{margin-top:3px;color:#71809a;font-size:9px}.overtime-approver-popover__message{padding:18px;color:#66758f;font-size:10px;font-weight:800;text-align:center}
                .dtr-ot-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}.dtr-ot-pager button{padding:7px 11px;border:1px solid #c9d5ed;border-radius:10px;background:#fff;color:#315be8;font-size:10px;font-weight:900;cursor:pointer}.dtr-ot-pager button:disabled{opacity:.38;cursor:not-allowed}.dtr-ot-pager span{min-width:72px;color:#65738c;font-size:10px;font-weight:850;text-align:center}
                @media(max-width:900px){.overtime-list-body{grid-template-columns:1fr!important}.overtime-request-card__body{grid-template-columns:1fr!important}}@media(max-width:560px){#overtime-time-presets-list .overtime-time-preset-btn{flex-basis:238px}.dtr-ot-card-main{grid-template-columns:72px 1fr}.dtr-ot-card-times{gap:5px}.dtr-ot-card-time strong{font-size:12px}.overtime-panel .overtime-profile-slab-form{grid-template-columns:1fr!important}.overtime-panel .overtime-purpose-shell,.overtime-panel .overtime-purpose{min-height:140px!important}.overtime-panel .overtime-result-shell,.overtime-panel .overtime-result{min-height:110px!important}.overtime-request-card__work{grid-template-columns:1fr}.overtime-request-card__head,.overtime-request-card__foot{align-items:flex-start;flex-direction:column}.overtime-request-card__state{align-items:flex-start}.overtime-request-card .overtime-list-actions{width:100%}.overtime-request-card .overtime-edit-btn,.overtime-request-card .overtime-remove-btn{flex:1;justify-content:center}}
            `;
            document.head.appendChild(style);
        }

        const allItems = Array.isArray(presets) ? presets : [];
        overtimeTimePresets = allItems;
        const selectedDateValue = document.getElementById("overtime-date")?.value || "";
        const selectedMonthKey = selectedDateValue.slice(0, 7);
        const items = selectedMonthKey
            ? allItems.filter((item) => String(item?.date_value || "").slice(0, 7) === selectedMonthKey)
            : allItems;
        const totalPages = Math.max(1, Math.ceil(items.length / OVERTIME_DTR_PRESET_PAGE_SIZE));
        overtimeDtrPresetPage = Math.min(Math.max(1, overtimeDtrPresetPage), totalPages);
        const pageStart = (overtimeDtrPresetPage - 1) * OVERTIME_DTR_PRESET_PAGE_SIZE;
        const pageItems = items.slice(pageStart, pageStart + OVERTIME_DTR_PRESET_PAGE_SIZE);

        if (!items.length) {
            if (wrap) {
                wrap.hidden = false;
            }
            const selectedDate = selectedDateValue ? new Date(`${selectedDateValue}T00:00:00`) : null;
            const selectedMonthLabel = selectedDate && !Number.isNaN(selectedDate.getTime())
                ? selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" })
                : "the selected month";
            target.innerHTML = `<span class="overtime-time-presets-empty">No DTR overtime is available for ${escapeHtml(selectedMonthLabel)}.</span>`;
            wrap?.querySelector(".dtr-ot-pager")?.setAttribute("hidden", "");
            return;
        }

        if (wrap) {
            wrap.hidden = false;
        }

        target.innerHTML = pageItems.map((preset) => {
            const key = overtimeTimePresetKey(preset);
            const multiSelected = overtimeSelectedTimePresets.has(key);
            const label = preset.time_label
                || `${formatOvertimeTimeLabel(preset.time_from)} â€“ ${formatOvertimeTimeLabel(preset.time_to)}`;
            const hoursValue = Number(preset.hours || 0);
            const hoursLabel = hoursValue > 0 ? `${Number(hoursValue.toFixed(2))} hr` : "";
            const usedLabel = Number(preset.use_count || 0) > 0 ? `Used ${preset.use_count}Ã—` : "";
            const meta = [hoursLabel, usedLabel, preset.last_used || ""].filter(Boolean).join(" Â· ");
            const tone = preset.status_tone || overtimePresetStatusTone(preset.status);
            const note = preset.note || "Overtime used";
            const date = new Date(`${preset.date_value || ""}T00:00:00`);
            const validDate = !Number.isNaN(date.getTime());
            const oneMonthAgo = new Date();
            oneMonthAgo.setHours(0, 0, 0, 0);
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            const isOld = validDate && date < oneMonthAgo;
            const monthLabel = validDate ? date.toLocaleString("en-US", { month: "long" }).toUpperCase() : "DTR OVERTIME";
            const dayLabel = validDate ? String(date.getDate()).padStart(2, "0") : "--";
            const dateCaption = validDate ? `${date.toLocaleString("en-US", { weekday: "short" })} ${date.getFullYear()}` : note;
            const fromLabel = formatOvertimeTimeLabel(preset.time_from) || "--:--";
            const toLabel = formatOvertimeTimeLabel(preset.time_to) || "--:--";
            return (
                '<button type="button" class="overtime-time-preset-btn status-' + escapeHtml(tone) + (isOld ? ' is-old' : '') + (multiSelected ? ' is-multi-selected' : '') + '" role="listitem"'
                + ' data-preset-key="' + escapeHtml(key) + '"'
                + ' data-date-value="' + escapeHtml(preset.date_value || "") + '"'
                + ' data-time-from="' + escapeHtml(preset.time_from || "") + '"'
                + ' data-time-to="' + escapeHtml(preset.time_to || "") + '"'
                + ' data-hours="' + escapeHtml(String(preset.hours ?? "")) + '"'
                + ' data-status-tone="' + escapeHtml(tone) + '"'
                + ' aria-pressed="false">'
                + '<span class="dtr-ot-card-month">' + escapeHtml(monthLabel) + "</span>"
                + '<span class="dtr-ot-card-multi-select" data-ot-multi-select role="checkbox" aria-checked="' + (multiSelected ? 'true' : 'false') + '" aria-label="' + (multiSelected ? 'Remove from multi-day overtime' : 'Add to multi-day overtime') + '"><i class="fa fa-check" aria-hidden="true"></i></span>'
                + (isOld ? '<span class="dtr-ot-card-age">Older than 1 month</span>' : '')
                + '<span class="overtime-time-preset-label dtr-ot-card-main">'
                + '<span class="dtr-ot-card-date"><strong>' + escapeHtml(dayLabel) + '</strong><small>' + escapeHtml(dateCaption) + "</small></span>"
                + '<span class="dtr-ot-card-times"><span class="dtr-ot-card-time dtr-ot-card-time--in"><small>OT IN</small><strong>' + escapeHtml(fromLabel) + '</strong></span><i class="fa fa-long-arrow-right dtr-ot-card-arrow" aria-hidden="true"></i><span class="dtr-ot-card-time dtr-ot-card-time--out"><small>OT OUT</small><strong>' + escapeHtml(toLabel) + "</strong></span></span>"
                + "</span>"
                + '<span class="dtr-ot-card-foot"><span class="dtr-ot-card-duration">' + escapeHtml(hoursLabel || "DTR time") + '</span><span class="dtr-ot-card-use"><i class="fa fa-check-circle-o" aria-hidden="true"></i> Use schedule</span></span>'
                + "</button>"
            );
        }).join("");

        const pagerHost = wrap || target.parentElement;
        let pager = pagerHost?.querySelector(".dtr-ot-pager");
        if (pagerHost && !pager) {
            pager = document.createElement("nav");
            pager.className = "dtr-ot-pager";
            pager.setAttribute("aria-label", "DTR overtime pages");
            pagerHost.appendChild(pager);
        }
        if (pager) {
            pager.hidden = totalPages <= 1;
            pager.innerHTML = `<button type="button" data-dtr-ot-page="prev" ${overtimeDtrPresetPage <= 1 ? "disabled" : ""}>Previous</button><span>Page ${overtimeDtrPresetPage} of ${totalPages}</span><button type="button" data-dtr-ot-page="next" ${overtimeDtrPresetPage >= totalPages ? "disabled" : ""}>Next</button>`;
            pager.querySelector('[data-dtr-ot-page="prev"]')?.addEventListener("click", () => {
                overtimeDtrPresetPage = Math.max(1, overtimeDtrPresetPage - 1);
                renderOvertimeTimePresets(overtimeTimePresets);
            });
            pager.querySelector('[data-dtr-ot-page="next"]')?.addEventListener("click", () => {
                overtimeDtrPresetPage = Math.min(totalPages, overtimeDtrPresetPage + 1);
                renderOvertimeTimePresets(overtimeTimePresets);
            });
        }

        if (overtimeActiveTimePresetKey) {
            highlightOvertimeTimePreset(overtimeActiveTimePresetKey);
        }
        updateOvertimeMultiSelectionUi();
    }

    async function loadOvertimeTimePresets(forceRefresh = false) {
        const target = document.getElementById("overtime-time-presets-list");
        if (!target) {
            return;
        }
        const dateValue = document.getElementById("overtime-date")?.value || todayInputValue();
        const date = new Date(`${dateValue}T00:00:00`);
        const selectedDate = Number.isNaN(date.getTime()) ? new Date() : date;
        const range = monthRange(selectedDate);
        if (latestDtrRange?.from === range.from && latestDtrRange?.to === range.to) {
            renderOvertimeTimePresets(dtrOvertimeTimePresets());
            return;
        }

        const loadId = ++overtimeDtrMonthLoadId;
        target.innerHTML = `<span class="overtime-time-presets-empty">Loading DTR overtime for ${escapeHtml(selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" }))}...</span>`;
        try {
            const [items, corrections] = await Promise.all([
                requestDtrRecords(range),
                requestDtrCorrections(range)
            ]);
            if (loadId !== overtimeDtrMonthLoadId) return;
            const rows = mergeDtrCorrectionStates(buildDtrRows(items), corrections, range);
            overtimeDtrPresetPage = 1;
            renderOvertimeTimePresets(dtrOvertimeTimePresets(rows, range));
        } catch (error) {
            if (loadId !== overtimeDtrMonthLoadId) return;
            target.innerHTML = '<span class="overtime-time-presets-empty">Unable to load DTR overtime for the selected month.</span>';
            console.warn("DTR overtime month could not load.", error);
        }
    }

    function overtimeMonitorStepClass(state) {
        const value = String(state || "").toLowerCase();
        if (value === "approved" || value === "submitted") {
            return "approved";
        }
        if (value === "rejected") {
            return "error";
        }
        if (value === "blocked") {
            return "blocked";
        }
        return "pending";
    }

    // [UI] GABAY: Gamitin ang aktwal na profile photo ng approver kung meron, para mukha siyang tao imbes na numero lang.
    function overtimeMonitorPhotoUrl(step) {
        const raw = String(step?.photo_url || step?.approver_photo_url || "").trim();
        const approverName = normalizePersonName(step?.approver || "");
        const directoryPerson = users.find((person) => normalizePersonName(person?.name || person?.Name || person?.fullname || person?.EmployeeName || person?.username || "") === approverName);
        const directoryPhoto = employeeProfilePhotoUrl({
            ...(directoryPerson || {}),
            profile_photo_url: directoryPerson?.profile_photo_url || directoryPerson?.ProfilePhotoUrl || directoryPerson?.EmployeePhotoUrl || ""
        });
        if (directoryPhoto) return directoryPhoto;
        if (raw) return resolveMediaUrl(raw.replace(/^(\.\.\/)+/, ""));
        const legacyUserId = Number(directoryPerson?.id || directoryPerson?.user_id || 0);
        return legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "";
    }

    // [UI] GABAY: Kapag walang photo, initials ng approver ang fallback sa maliit na avatar badge.
    function overtimeMonitorAvatarLabel(step) {
        const name = String(step?.approver || step?.sublabel || step?.label || "").trim();
        if (!name) {
            return String(step?.step || "?").trim() || "?";
        }
        const parts = name.split(/\s+/).filter(Boolean);
        const initials = parts.slice(0, 2).map((part) => part.charAt(0)).join("");
        return (initials || name.charAt(0) || "?").toUpperCase();
    }

    // [UI] GABAY: Isinasama ang approver strip sa mismong OT list row para kita agad ang tatlong pangalan.
    function renderOvertimeMonitorSteps(item, itemIndex = -1) {
        const steps = Array.isArray(item.monitor_steps) ? item.monitor_steps : [];
        if (!steps.length) {
            return "";
        }

        const rows = steps.map((step) => {
            const stateClass = overtimeMonitorStepClass(step.state);
            // [UI] GABAY: Ang status icon ay naka-overlay sa step circle para makita agad kung approved na.
            const statusIcon = stateClass === "approved"
                ? '<span class="overtime-monitor-status-icon overtime-monitor-status-icon--approved" aria-hidden="true"><i class="fa fa-check"></i></span>'
                : (stateClass === "error"
                    ? '<span class="overtime-monitor-status-icon overtime-monitor-status-icon--error" aria-hidden="true"><i class="fa fa-times"></i></span>'
                    : "");
            const approver = String(step.approver || step.sublabel || step.label || "").trim();
            const photoUrl = overtimeMonitorPhotoUrl(step);
            const avatarLabel = overtimeMonitorAvatarLabel(step);
            const avatarBody = photoUrl
                ? '<img class="overtime-monitor-avatar-image" src="' + escapeHtml(photoUrl) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span class="overtime-monitor-avatar-fallback" hidden>' + escapeHtml(avatarLabel) + '</span>'
                : '<span class="overtime-monitor-avatar-fallback">' + escapeHtml(avatarLabel) + '</span>';
            const canReassign = step.can_reassign === true || step.can_reassign === 1 || step.can_reassign === "1";
            const picker = canReassign
                ? '<div class="overtime-approver-popover" data-overtime-approver-picker data-overtime-index="' + itemIndex + '" data-overtime-stage="' + escapeHtml(step.key || "") + '" data-current-approver="' + escapeHtml(step.assigned_usercode || "") + '"><span class="overtime-approver-popover__message">Loading eligible approvers...</span></div>'
                : "";
            const stageOpen = canReassign
                ? '<button type="button" class="overtime-monitor-stage" title="Click profile to choose approver" aria-label="Change ' + escapeHtml(step.label || "approver") + '">'
                : '<span class="overtime-monitor-stage">';
            const stageClose = canReassign ? "</button>" : "</span>";
            return (
                '<li class="overtime-monitor-step ' + stateClass + (canReassign ? ' is-changeable' : '') + '">'
                + stageOpen
                + '<span class="overtime-monitor-avatar">' + avatarBody + "</span>"
                + '<span class="overtime-monitor-step-badge">' + escapeHtml(String(step.step || "")) + "</span>"
                + statusIcon
                + stageClose
                + '<span class="overtime-monitor-copy">'
                + "<strong>" + escapeHtml(approver || "Pending") + "</strong>"
                + "<small>" + escapeHtml(step.label || "") + "</small>"
                + "</span>"
                + picker
                + "</li>"
            );
        }).join("");

        return (
            '<div class="overtime-monitor-inline" aria-label="Approval monitor">'
            + '<div class="overtime-monitor-steps-inner" data-step-count="' + steps.length + '">'
            + '<ol class="overtime-monitor-steps">' + rows + "</ol>"
            + "</div></div>"
        );
    }

    async function loadOvertimeApproverOptions(picker) {
        if (!picker || picker.dataset.loaded === "1" || picker.dataset.loading === "1") return;
        picker.dataset.loading = "1";
        try {
            const stage = picker.dataset.overtimeStage || "";
            const response = await fetch(`${OVERTIME_API}?action=approver_options&stage=${encodeURIComponent(stage)}`, {
                credentials: "same-origin",
                cache: "no-store",
                headers: getOvertimeAuthHeaders()
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to load approvers.");
            const current = String(picker.dataset.currentApprover || "").toUpperCase();
            const options = Array.isArray(payload.items) ? payload.items : [];
            picker.innerHTML = options.length ? options.map((person) => {
                const code = String(person.usercode || "").toUpperCase();
                const name = String(person.name || code || "Approver");
                const photo = resolveMediaUrl(String(person.profile_photo_url || ""));
                const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
                const avatar = photo
                    ? '<img src="' + escapeHtml(photo) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" onerror="this.outerHTML=\'<span class=&quot;overtime-approver-option__avatar&quot;>' + escapeHtml(initials) + '</span>\'">'
                    : '<span class="overtime-approver-option__avatar">' + escapeHtml(initials) + '</span>';
                return '<button type="button" class="overtime-approver-option' + (code === current ? ' is-current' : '') + '" data-overtime-approver-code="' + escapeHtml(code) + '">' + avatar
                    + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml([person.position, person.department].filter(Boolean).join(" · ") || code) + '</small></span>'
                    + '<i class="fa ' + (code === current ? 'fa-check-circle' : 'fa-chevron-right') + '" aria-hidden="true"></i></button>';
            }).join("") : '<span class="overtime-approver-popover__message">No eligible ' + (stage === "supervisor" ? "Supervisor accounts" : "admin approvers") + ' found.</span>';
            picker.dataset.loaded = "1";
        } catch (error) {
            picker.innerHTML = '<span class="overtime-approver-popover__message">' + escapeHtml(error.message || "Unable to load approvers.") + '</span>';
        } finally {
            delete picker.dataset.loading;
        }
    }

    async function changeOvertimeApprover(button) {
        const picker = button.closest("[data-overtime-approver-picker]");
        const item = overtimeListItems[Number(picker?.dataset.overtimeIndex || -1)];
        if (!picker || !item || button.classList.contains("is-current")) return;
        button.disabled = true;
        try {
            const response = await fetch(`${OVERTIME_API}?action=assign_approver&stage=${encodeURIComponent(picker.dataset.overtimeStage || "")}`, {
                method: "POST",
                credentials: "same-origin",
                headers: getOvertimeAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ ot_number: item.ot_number, approver_usercode: button.dataset.overtimeApproverCode || "" })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to change approver.");
            button.closest(".overtime-approver-modal")?.remove();
            await loadOvertimeList(overtimeListPage, true);
        } catch (error) {
            picker.innerHTML = '<span class="overtime-approver-popover__message">' + escapeHtml(error.message || "Unable to change approver.") + '</span>';
        } finally {
            button.disabled = false;
        }
    }

    async function showCenteredOvertimeApproverPicker(step) {
        const source = step.querySelector("[data-overtime-approver-picker]");
        if (!source) return;
        document.querySelector(".overtime-approver-modal")?.remove();
        const modal = document.createElement("div");
        const stage = source.dataset.overtimeStage || "";
        const chooserTitle = stage === "supervisor" ? "Choose a Supervisor" : "Choose an Admin Approver";
        modal.className = "overtime-approver-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.innerHTML = '<section class="overtime-approver-modal__card">'
            + '<header class="overtime-approver-modal__head"><span><small>OVERTIME APPROVAL</small><strong>' + escapeHtml(chooserTitle) + '</strong></span><button type="button" class="overtime-approver-modal__close" aria-label="Close">&times;</button></header>'
            + '<div class="overtime-approver-popover" data-overtime-approver-picker data-overtime-index="' + escapeHtml(source.dataset.overtimeIndex || "") + '" data-overtime-stage="' + escapeHtml(source.dataset.overtimeStage || "") + '" data-current-approver="' + escapeHtml(source.dataset.currentApprover || "") + '"><span class="overtime-approver-popover__message">Loading eligible approvers...</span></div>'
            + '</section>';
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector(".overtime-approver-modal__close")?.addEventListener("click", close);
        modal.addEventListener("click", async (event) => {
            if (event.target === modal) {
                close();
                return;
            }
            const option = event.target.closest("[data-overtime-approver-code]");
            if (!option) return;
            event.preventDefault();
            if (option.classList.contains("is-current")) {
                close();
                return;
            }
            await changeOvertimeApprover(option);
        });
        const picker = modal.querySelector("[data-overtime-approver-picker]");
        if (picker) await loadOvertimeApproverOptions(picker);
        modal.querySelector(".overtime-approver-modal__close")?.focus();
    }

    function bindRenderedOvertimeApproverCards(target) {
        target.querySelectorAll(".overtime-monitor-step.is-changeable").forEach((step) => {
            step.addEventListener("click", async (event) => {
                const option = event.target.closest("[data-overtime-approver-code]");
                if (option) {
                    event.preventDefault();
                    event.stopPropagation();
                    await changeOvertimeApprover(option);
                    return;
                }
                if (!event.target.closest(".overtime-monitor-stage")) return;
                event.preventDefault();
                event.stopPropagation();
                await showCenteredOvertimeApproverPicker(step);
            });
        });
    }

    function bindOvertimeListCardCollapse(scope = document) {
        // Delegation on stable scope (body) so listeners survive body.innerHTML replacement
        scope.addEventListener("error", (event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement) || !image.classList.contains("overtime-monitor-avatar-image")) return;
            image.hidden = true;
            const fallback = image.nextElementSibling;
            if (fallback) fallback.hidden = false;
        }, true);
        scope.addEventListener("click", async (event) => {
            const approverButton = event.target.closest("[data-overtime-approver-code]");
            if (approverButton) {
                event.preventDefault();
                event.stopPropagation();
                await changeOvertimeApprover(approverButton);
                return;
            }
            const approverStep = event.target.closest(".overtime-monitor-stage")?.closest(".overtime-monitor-step.is-changeable");
            if (approverStep) {
                event.preventDefault();
                event.stopPropagation();
                await showCenteredOvertimeApproverPicker(approverStep);
                return;
            }
            const removeButton = event.target.closest(".overtime-remove-btn");
            if (removeButton) {
                // [EVENT] GABAY: Remove button ay para lang sa pending OT na wala pang approval stage.
                event.preventDefault();
                event.stopPropagation();
                const item = overtimeListItems[Number(removeButton.dataset.overtimeRemoveIndex || -1)];
                if (!item) {
                    return;
                }
                const ok = window.confirm(`Remove ${item.ot_number || "this overtime request"}? This cannot be undone.`);
                if (!ok) {
                    return;
                }
                await removeOvertimeRequest(item, removeButton);
                return;
            }

            const editButton = event.target.closest(".overtime-edit-btn");
            if (editButton) {
                // [EVENT] GABAY: Pending OT lang ang puwedeng i-load pabalik sa form para ma-update.
                event.preventDefault();
                event.stopPropagation();
                const item = overtimeListItems[Number(editButton.dataset.overtimeEditIndex || -1)];
                if (!item) {
                    return;
                }
                fillOvertimeFormForEdit(item);
                setOvertimeListOverlayOpen(false);
                document.getElementById("overtime-date")?.focus();
                return;
            }
        });
    }

    function renderOvertimeList(items) {
        const target = document.getElementById("overtime-list-body");
        if (!target) {
            return;
        }
        overtimeListItems = items || [];

        if (!overtimeListItems.length) {
            target.innerHTML = `
                <div class="epass-list-empty">
                    <i class="fa fa-hourglass-half"></i>
                    <span>No overtime requests yet.</span>
                </div>
            `;
            return;
        }

        target.innerHTML = overtimeListItems.map((item, index) => {
            const hoursLabel = Number(item.hours || 0) > 0 ? `${item.hours} hr` : "";
            const subtitle = [item.attachment_type, hoursLabel, item.time_from && item.time_to ? `${item.time_from} â€“ ${item.time_to}` : ""]
                .filter(Boolean)
                .join(" Â· ");
            const timeRange = item.time_from && item.time_to ? `${item.time_from} â€“ ${item.time_to}` : "";
            const purpose = overtimeTaskParts(item.purpose || "").task;
            const taskParts = overtimeTaskParts(item.purpose || "");
            const taskText = taskParts.task || "No task provided";
            const resultText = taskParts.result || "No result recorded yet";
            const purposeShort = purpose.length > 72 ? `${purpose.slice(0, 72)}â€¦` : purpose;
            // [EDIT GUIDE] Approver at rejection remarks dito lang lumalabas kapag may actual review na.
            const supervisorStatus = Number(item.supervisor_status || 0);
            const deptHeadStatus = Number(item.dept_head_status || 0);
            const gmStatus = Number(item.gm_status || 0);
            const isRejected = supervisorStatus === 2
                || deptHeadStatus === 2
                || gmStatus === 2
                || Number(item.status || 0) === 3
                || (Array.isArray(item.monitor_steps) && item.monitor_steps.some((step) => step.state === "rejected"));
            const statusClass = isRejected ? "error" : epassStatusClass(item.status);
            const approverName = [
                item.gm_approver_name,
                item.dept_head_approver_name,
                item.supervisor_approver_name,
                item.approver_name
            ].map((value) => String(value || "").trim()).find(Boolean) || "";
            const deptHeadRemarks = [
                item.gm_remarks,
                item.dept_head_remarks,
                item.supervisor_remarks
            ].map((value) => String(value || "").trim()).find(Boolean) || "";
            const canUpdate = item.can_update === true || item.can_update === 1 || item.can_update === "1";
            const canRemove = item.can_remove === true || item.can_remove === 1 || item.can_remove === "1";
            const editButton = canUpdate
                ? '<button type="button" class="overtime-edit-btn" data-overtime-edit-index="' + index + '" title="Edit pending OT"><i class="fa fa-pencil" aria-hidden="true"></i><span>Edit</span></button>'
                : "";
            const removeButton = canRemove
                ? '<button type="button" class="overtime-remove-btn" data-overtime-remove-index="' + index + '" title="Remove pending OT"><i class="fa fa-trash" aria-hidden="true"></i><span>Remove</span></button>'
                : "";
            const listActions = (editButton || removeButton)
                ? '<div class="overtime-list-actions">' + editButton + removeButton + '</div>'
                : "";
            const allApproved = Array.isArray(item.monitor_steps)
                && item.monitor_steps.length > 0
                && item.monitor_steps.every((step) => step.state === "approved");
            const summaryLabel = isRejected ? "Rejected" : (allApproved ? "Fully approved" : (item.status_label || "Pending"));
            const cardStatusClass = isRejected ? "error" : (allApproved ? "approved" : statusClass);
            const approverStrip = renderOvertimeMonitorSteps(item, index);

            if (item) {
                return (
                    '<article class="overtime-list-card overtime-request-card status-' + escapeHtml(cardStatusClass) + '" data-overtime-list-index="' + index + '">'
                    + '<header class="overtime-request-card__head">'
                    + '<div class="overtime-request-card__identity"><span class="overtime-request-card__icon"><i class="fa fa-hourglass-half" aria-hidden="true"></i></span><span><small>OVERTIME REQUEST</small><strong>' + escapeHtml(item.ot_number || "-") + '</strong></span></div>'
                    + '<div class="overtime-request-card__state"><time>' + escapeHtml(item.date || "-") + '</time><em class="' + escapeHtml(cardStatusClass) + '">' + escapeHtml(summaryLabel) + '</em></div>'
                    + '</header>'
                    + '<div class="overtime-request-card__body">'
                    + '<section class="overtime-request-card__details">'
                    + '<div class="overtime-request-card__schedule"><span><small>SCHEDULE</small><strong><i class="fa fa-clock-o" aria-hidden="true"></i> ' + escapeHtml(timeRange || "No time") + '</strong></span><b>' + escapeHtml(hoursLabel || "0 hr") + '</b></div>'
                    + '<div class="overtime-request-card__tags"><span>' + escapeHtml(item.attachment_type || "Overtime") + '</span>' + (item.department ? '<span>' + escapeHtml(item.department) + '</span>' : '') + '</div>'
                    + (taskParts.memorandum ? '<div class="overtime-request-card__memo"><small>MEMORANDUM TO</small><strong>' + escapeHtml(taskParts.memorandum) + '</strong></div>' : '')
                    + '<div class="overtime-request-card__work"><div><small>TASK</small><p>' + escapeHtml(taskText) + '</p></div><div class="result"><small>RESULT</small><p>' + escapeHtml(resultText) + '</p></div></div>'
                    + '</section>'
                    + '<section class="overtime-request-card__monitor"><div class="overtime-request-card__monitor-title"><small>APPROVAL PROGRESS</small><span>' + escapeHtml(summaryLabel) + '</span></div>' + approverStrip + '</section>'
                    + '</div>'
                    + '</article>'
                );
            }

            return (
                '<article class="overtime-list-card" data-overtime-list-index="' + index + '">'
                + '<div class="epass-list-row overtime-list-row">'
                + '<div class="epass-list-icon"><i class="fa fa-hourglass-half"></i></div>'
                + '<div class="epass-list-main">'
                + "<strong>" + escapeHtml(item.ot_number || "-") + "</strong>"
                + "<span>" + escapeHtml(subtitle || item.department || "-") + "</span>"
                + (timeRange ? '<small class="overtime-list-time"><i class="fa fa-clock-o" aria-hidden="true"></i><span>' + escapeHtml(timeRange) + "</span></small>" : "")
                + "<small>" + escapeHtml(purposeShort || "No purpose") + "</small>"
                + ((approverName || deptHeadRemarks)
                    ? "<small>" + escapeHtml(approverName ? `Checked by: ${approverName}` : "")
                        + (approverName && deptHeadRemarks ? " â€¢ " : "")
                        + escapeHtml(deptHeadRemarks ? `Remarks: ${deptHeadRemarks}` : "")
                        + "</small>"
                    : "")
                + "</div>"
                + approverStrip
                + '<div class="epass-list-side">'
                + "<span>" + escapeHtml(item.date || "-") + "</span>"
                + '<em class="' + statusClass + '">' + escapeHtml(summaryLabel) + "</em>"
                + listActions
                + "\u003c/div\u003e"
                + "\u003c/div\u003e"
                + "</article>"
            );
        }).join("");
        bindRenderedOvertimeApproverCards(target);
    }

    function updateOvertimePagerUi(page, totalPages) {
        overtimeListPage = Math.max(1, Number(page) || 1);
        overtimeListTotalPages = Math.max(1, Number(totalPages) || 1);
        const label = document.getElementById("overtime-page-label");
        const prevBtn = document.getElementById("overtime-page-prev");
        const nextBtn = document.getElementById("overtime-page-next");
        if (label) {
            label.textContent = `${overtimeListPage} / ${overtimeListTotalPages}`;
        }
        if (prevBtn) {
            prevBtn.disabled = overtimeListPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = overtimeListPage >= overtimeListTotalPages;
        }
    }

    const OVERTIME_LIST_SLIDE_MS = 380;

    function setOvertimeListOverlayOpen(open) {
        const overlay = document.getElementById("overtime-list-overlay");
        const panel = overlay?.querySelector(".overtime-history-panel");
        const toggle = document.getElementById("overtime-open-list");
        if (!overlay) {
            return;
        }

        if (overlay._otListCloseTimer) {
            clearTimeout(overlay._otListCloseTimer);
            overlay._otListCloseTimer = null;
        }

        const isOpen = Boolean(open);
        if (isOpen) {
            overlay.classList.remove("is-closing");
            overlay.setAttribute("aria-hidden", "false");
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    overlay.classList.add("is-open");
                });
            });
        } else {
            overlay.classList.remove("is-open");
            overlay.classList.add("is-closing");
            overlay.setAttribute("aria-hidden", "true");

            const finishClose = () => {
                overlay.classList.remove("is-closing");
                overlay._otListCloseTimer = null;
            };

            if (!panel) {
                overlay._otListCloseTimer = window.setTimeout(finishClose, OVERTIME_LIST_SLIDE_MS);
            } else {
                const onSlideEnd = (event) => {
                    if (event.target !== panel || event.propertyName !== "transform") {
                        return;
                    }
                    panel.removeEventListener("transitionend", onSlideEnd);
                    finishClose();
                };
                panel.addEventListener("transitionend", onSlideEnd);
                overlay._otListCloseTimer = window.setTimeout(finishClose, OVERTIME_LIST_SLIDE_MS + 60);
            }
        }

        if (toggle) {
            toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
    }

    function bindOvertimeListOverlay(scope = document) {
        // Delegation on stable scope (body) â€” child elements may be recreated on re-render
        scope.addEventListener("click", (e) => {
            if (e.target.closest("#overtime-open-list")) {
                setOvertimeScheduleModalOpen(false);
                setOvertimeListOverlayOpen(true);
            } else if (e.target.closest("#overtime-close-list")) {
                setOvertimeListOverlayOpen(false);
            } else if (e.target.closest("#overtime-list-overlay-backdrop")) {
                setOvertimeListOverlayOpen(false);
            }
        });
    }

    function bindOvertimeListPager(scope = document) {
        // Delegation on stable scope (body) â€” pager buttons are recreated on each body.innerHTML replacement
        scope.addEventListener("click", (e) => {
            if (e.target.closest("#overtime-page-prev")) {
                if (overtimeListPage > 1) void loadOvertimeList(overtimeListPage - 1, true);
            } else if (e.target.closest("#overtime-page-next")) {
                if (overtimeListPage < overtimeListTotalPages) void loadOvertimeList(overtimeListPage + 1, true);
            } else if (e.target.closest("#overtime-page-refresh")) {
                void loadOvertimeList(overtimeListPage, true);
            }
        });
    }

    async function loadOvertimeList(page = overtimeListPage, forceRefresh = false) {
        const target = document.getElementById("overtime-list-body");
        const usercode = (employee.usercode || session.usercode || "").trim().toUpperCase();
        if (!target || !usercode) {
            return;
        }

        const safePage = Math.max(1, Number(page) || 1);
        target.innerHTML = '<div class="epass-list-empty">Loading overtime list...</div>';
        const refreshBtn = document.getElementById("overtime-page-refresh");
        if (refreshBtn) {
            refreshBtn.disabled = true;
        }

        try {
            const params = new URLSearchParams({
                action: "list",
                usercode,
                page: String(safePage),
                limit: String(OVERTIME_LIST_PAGE_SIZE)
            });
            const response = await fetch(`${OVERTIME_API}?${params.toString()}`, {
                credentials: "include",
                cache: forceRefresh ? "no-store" : "default",
                headers: getOvertimeAuthHeaders()
            });
            const payload = await response.json().catch(() => ({
                ok: false,
                message: "Invalid overtime server response."
            }));

            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load overtime list.");
            }

            updateOvertimePagerUi(payload.page || safePage, payload.total_pages || 1);
            renderOvertimeList(payload.items || []);
        } catch (error) {
            target.innerHTML = `<div class="epass-list-empty">${escapeHtml(error.message)}</div>`;
            updateOvertimePagerUi(safePage, 1);
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
            }
        }
    }

    // [FIX] EPASS print now matches the Approval Desk's EPASS print exactly (same quarter-page,
    // red-bordered, "APPROVED" badge card with position + photo per rider, real e-signature
    // image, and a copies/e-signature dialog) instead of its own separate full-page blue card —
    // both entry points print the same physical document.
    async function fetchEpassApproverSignature(item) {
        const usercode = String(item.approved_by || item.assigned_approver_usercode || "").trim();
        try {
            const params = new URLSearchParams({ action: "get", module: "epass", department: String(item.department || "").trim() });
            if (usercode) params.set("usercode", usercode);
            const { response, payload } = await fetchJsonWithSessionRetry(`${NODE_API_BASE}/signatory?${params.toString()}`, {
                headers: getAuthHeaders()
            }, "Unable to load approver signature.");
            if (response.ok && payload?.ok && payload.signatory) {
                return String(payload.signatory.signatureImage || "").trim();
            }
        } catch (_error) {
            // No signature on file for this department/usercode — print with a blank line.
        }
        return "";
    }

    function chooseEpassPrintCopies(hasSignatureOnFile) {
        const storageKey = "samelcii_epass_print_copies";
        const savedCopies = Number(window.localStorage.getItem(storageKey));
        const defaultCopies = Number.isInteger(savedCopies) && savedCopies >= 1 && savedCopies <= 4 ? savedCopies : 4;
        const esigStorageKey = `${storageKey}_esig`;
        const defaultIncludeSignature = window.localStorage.getItem(esigStorageKey) !== "0";

        return new Promise((resolve) => {
            const dialog = document.createElement("dialog");
            dialog.className = "epass-print-choice";
            dialog.setAttribute("aria-labelledby", "epass-print-choice-title");
            dialog.innerHTML = `
                <style>
                    .epass-print-choice{width:min(460px,calc(100vw - 32px));padding:0;border:0;border-radius:22px;color:#102444;background:#fff;box-shadow:0 28px 80px rgba(15,35,68,.28)}
                    .epass-print-choice::backdrop{background:rgba(15,23,42,.56);backdrop-filter:blur(4px)}
                    .epass-print-choice__body{padding:24px}
                    .epass-print-choice__head{display:flex;align-items:start;justify-content:space-between;gap:16px}
                    .epass-print-choice__head small{display:block;margin-bottom:5px;color:#b91c1c;font:800 11px/1 Arial,sans-serif;letter-spacing:.12em}
                    .epass-print-choice__head h2{margin:0;font:800 24px/1.15 Arial,sans-serif}
                    .epass-print-choice__close{width:36px;height:36px;border:0;border-radius:12px;color:#64748b;background:#f1f5f9;font-size:22px;cursor:pointer}
                    .epass-print-choice__hint{margin:9px 0 18px;color:#64748b;font:500 13px/1.5 Arial,sans-serif}
                    .epass-print-choice__quantity{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;align-items:center;gap:10px;padding:10px;border:1px solid #d8e2f1;border-radius:18px;background:#f8fbff}
                    .epass-print-choice__step{height:48px;border:1px solid #bfd0e8;border-radius:14px;color:#1d4ed8;background:#fff;font:900 25px/1 Arial,sans-serif;cursor:pointer}.epass-print-choice__step:hover{border-color:#2563eb;background:#eff6ff}
                    .epass-print-choice__value{display:grid;place-items:center;gap:3px}.epass-print-choice__value input{width:82px;border:0;color:#102444;background:transparent;text-align:center;font:900 34px/1 Arial,sans-serif;outline:0}.epass-print-choice__value span{color:#64748b;font:800 10px/1 Arial,sans-serif;letter-spacing:.08em}
                    .epass-print-choice__remember{display:flex;align-items:center;gap:9px;margin-top:18px;color:#475569;font:600 13px/1.3 Arial,sans-serif;cursor:pointer}.epass-print-choice__remember input{width:17px;height:17px;accent-color:#2563eb}
                    .epass-print-choice__print{width:100%;margin-top:18px;padding:14px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#2563eb,#1d4ed8);font:900 14px/1 Arial,sans-serif;letter-spacing:.05em;cursor:pointer;box-shadow:0 10px 24px rgba(37,99,235,.24)}
                </style>
                <div class="epass-print-choice__body">
                    <div class="epass-print-choice__head"><div><small>PRINT LAYOUT</small><h2 id="epass-print-choice-title">How many EPASS copies?</h2></div><button class="epass-print-choice__close" type="button" aria-label="Cancel print">&times;</button></div>
                    <p class="epass-print-choice__hint">Enter 1 to 4 copies. Every copy keeps the same quarter-page size.</p>
                    <div class="epass-print-choice__quantity">
                        <button class="epass-print-choice__step" type="button" data-step="-1" aria-label="Decrease copies">&minus;</button>
                        <label class="epass-print-choice__value"><input type="number" min="1" max="4" step="1" value="${defaultCopies}" data-copy-count aria-label="Number of copies"><span>COPIES (MAXIMUM 4)</span></label>
                        <button class="epass-print-choice__step" type="button" data-step="1" aria-label="Increase copies">+</button>
                    </div>
                    ${hasSignatureOnFile ? `<label class="epass-print-choice__remember"><input type="checkbox" data-esig${defaultIncludeSignature ? " checked" : ""}> Include e-signature image</label>` : ''}
                    <button class="epass-print-choice__print" type="button" data-print-epass>PRINT EPASS</button>
                </div>`;

            const finish = (value) => {
                dialog.close();
                dialog.remove();
                resolve(value);
            };
            dialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                finish(null);
            });
            dialog.addEventListener("click", (event) => {
                if (event.target.closest(".epass-print-choice__close")) {
                    finish(null);
                    return;
                }
                const countInput = dialog.querySelector("[data-copy-count]");
                const stepButton = event.target.closest("[data-step]");
                if (stepButton) {
                    countInput.value = String(Math.min(4, Math.max(1, Number(countInput.value || defaultCopies) + Number(stepButton.dataset.step))));
                    return;
                }
                if (!event.target.closest("[data-print-epass]")) {
                    return;
                }
                const copies = Math.min(4, Math.max(1, Math.round(Number(countInput.value) || defaultCopies)));
                countInput.value = String(copies);
                const printWindow = window.open("", "_blank", "width=920,height=720");
                if (!printWindow) {
                    window.alert("Please allow pop-ups to print this EPASS request.");
                    return;
                }
                window.localStorage.setItem(storageKey, String(copies));
                const includeSignature = hasSignatureOnFile ? !!dialog.querySelector("[data-esig]")?.checked : false;
                if (hasSignatureOnFile) {
                    window.localStorage.setItem(esigStorageKey, includeSignature ? "1" : "0");
                }
                finish({ copies, printWindow, includeSignature });
            });
            document.body.appendChild(dialog);
            dialog.showModal();
        });
    }

    async function printEpassRequest(item) {
        if (!item || epassStatusClass(item.status) !== "approved") {
            const message = document.getElementById("epass-form-message");
            if (message) message.textContent = "Only approved EPASS requests can be printed.";
            return;
        }

        const logoUrl = new URL("../../../assets/images/samelco-3d.png", window.location.href).href;
        const signatureImage = await fetchEpassApproverSignature(item);
        const hasSignatureOnFile = !!signatureImage;
        const printChoice = await chooseEpassPrintCopies(hasSignatureOnFile);
        if (!printChoice) {
            return;
        }
        const { copies, printWindow, includeSignature } = printChoice;

        const approverSignatureHtml = (hasSignatureOnFile && includeSignature)
            ? '<img class="approved-by__signature" src="' + escapeHtml(signatureImage) + '" alt="">'
            : '<span class="approved-by__signature" aria-hidden="true"></span>';

        const grantedPeople = epassRequestPeople(item);
        const showGrantedPositions = grantedPeople.length <= 4;
        const grantedPeopleHtml = grantedPeople.length
            ? grantedPeople.map((person) => {
                return '<div class="granted-person"><span class="granted-person__text"><b>' + escapeHtml(String(person.name || "").toUpperCase()) + '</b>'
                    + (showGrantedPositions ? '<small>' + escapeHtml(person.position || "Position not recorded") + '</small>' : '') + '</span></div>';
            }).join("")
            : '<div class="granted-person"><span class="granted-person__text"><b>No employee listed</b><small>Position not recorded</small></span></div>';

        const epassCopyHtml = (
            '<article class="copy epass-copy"><header class="epass-head">'
            + '<img class="epass-logo" src="' + escapeHtml(logoUrl) + '" alt="SAMELCII logo">'
            + '<div class="epass-org"><strong>SAMAR II ELECTRIC COOPERATIVE, INC.</strong><span>Paranas, Samar</span><h1>EMPLOYEES PASS</h1></div>'
            + '<div class="epass-number"><small>EPASS NO.</small><b>' + escapeHtml(item.epassnumber || "-") + '</b><span>APPROVED</span></div>'
            + '</header><section class="epass-facts">'
            + '<div><small>DATE</small><strong>' + escapeHtml(item.date || "-") + '</strong></div>'
            + '<div><small>DEPARTMENT</small><strong>' + escapeHtml(item.department || "-") + '</strong></div>'
            + '<div><small>DESTINATION</small><strong>' + escapeHtml(item.destination || "-") + '</strong></div>'
            + '</section><section class="epass-purpose"><small>PURPOSE</small><strong>' + escapeHtml(item.purpose || "-") + '</strong></section>'
            + '<section class="granted-section"><div class="granted-head"><strong>GRANTED TO</strong><span>'
            + grantedPeople.length + ' employee' + (grantedPeople.length === 1 ? '' : 's') + '</span></div><div class="granted-grid'
            + (grantedPeople.length <= 4 ? ' granted-grid--few' : '') + '">'
            + grantedPeopleHtml + '</div></section><section class="approved-by">' + approverSignatureHtml + '<small>APPROVED BY</small><b>'
            + escapeHtml(String(item.approver_name || item.approved_by || "Department Head").toUpperCase()) + '</b><em>'
            + escapeHtml("Department Head") + '</em></section>'
            + '<footer class="foot">Printed ' + escapeHtml(new Date().toLocaleString()) + '</footer></article>'
        );

        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>EPASS ${escapeHtml(item.epassnumber || "")}</title>
<style>
@page{size:A4 portrait;margin:.25in}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}body{margin:0;padding:10mm;font-family:Arial,sans-serif;color:#1f2937;background:#e5e7eb}
.page{max-width:197.3mm;margin:auto;background:#fff}.page--epass{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));align-content:start;gap:4mm;width:197.3mm;height:284.3mm}.page--count-1 .epass-copy:first-child,.page--count-3 .epass-copy:last-child{grid-column:1/-1;justify-self:center;width:calc((100% - 4mm)/2)}
.copy{position:relative;min-width:0;overflow:hidden;padding:4.5mm;border:1px solid #d1d5db;border-top:3px solid #b91c1c;border-radius:2.5mm;background:linear-gradient(180deg,#fff 0%,#fff 76%,#fffaf0 100%)}.copy:after{content:"";position:absolute;right:0;top:0;width:18mm;height:3px;background:#fbbf24}
.epass-copy{display:flex;flex-direction:column;padding:4.5mm}.epass-head{display:grid;grid-template-columns:12mm minmax(0,1fr) auto;align-items:start;gap:2.4mm;padding-bottom:2.5mm;border-bottom:1.5px solid #b91c1c}.epass-logo{width:11mm;height:15mm;object-fit:contain}.epass-org{display:grid;gap:.3mm;text-align:center}.epass-org>strong{font-size:11.5px;line-height:1.08}.epass-org>span{font-size:9px;font-weight:700}.epass-org h1{margin:.65mm 0 0;color:#991b1b;font-size:17px;letter-spacing:.025em}.epass-number{display:grid;justify-items:end;gap:.45mm}.epass-number small{color:#6b7280;font-size:8px;font-weight:900}.epass-number b{font-size:10px}.epass-number span{padding:.9mm 1.4mm;border-radius:999px;background:#dcfce7;color:#166534;font-size:7.5px;font-weight:900}
.epass-facts{display:grid;grid-template-columns:.75fr 1.1fr 1.15fr;gap:2mm;padding:2.5mm 0;border-bottom:1px solid #e5e7eb}.epass-facts>div,.epass-purpose{display:grid;align-content:start;gap:.55mm;min-width:0}.epass-facts small,.epass-purpose small{color:#9f1239;font-size:8.3px;font-weight:900;letter-spacing:.04em}.epass-facts strong,.epass-purpose strong{overflow-wrap:anywhere;font-size:10.5px;line-height:1.2}.epass-purpose{min-height:13mm;padding:2.1mm 0 2.4mm;border-bottom:1px solid #e5e7eb}
.granted-section{display:grid;align-content:start;gap:1.4mm;padding-top:2mm}.granted-head{display:flex;align-items:center;justify-content:space-between;gap:2mm;color:#991b1b}.granted-head strong{font-size:8.5px;letter-spacing:.04em}.granted-head span{font-size:7.6px;font-weight:800}.granted-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:5.6mm;gap:.55mm 2.4mm}.granted-grid--few{grid-template-columns:1fr;grid-auto-rows:minmax(14mm,auto);gap:1.5mm}.granted-person{display:flex;align-items:center;gap:1.6mm;min-width:0;padding:.4mm 0;border:0;background:transparent}.granted-grid--few .granted-person{padding:1.2mm 0}.granted-person__avatar{flex:none;display:grid;place-items:center;width:9mm;height:9mm;border-radius:50%;overflow:hidden;background:#fee2e2;color:#991b1b;font:800 7px/1 Arial,sans-serif;text-transform:uppercase}.granted-person__avatar.has-photo{background:#e5e7eb}.granted-person__avatar img{width:100%;height:100%;object-fit:cover}.granted-person__text{display:grid;align-content:center;gap:.2mm;min-width:0}.granted-person b{overflow:hidden;font-size:9px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}.granted-person small{overflow:hidden;color:#4b5563;font-size:6.8px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}
.approved-by{display:flex;flex-direction:column;gap:.4mm;margin-top:auto;padding-top:1mm}.approved-by__signature{display:block;width:42mm;height:7mm;object-fit:contain;margin:0 auto}.approved-by small{display:block;text-align:left;color:#9f1239;font-size:7.2px;font-weight:900;letter-spacing:.045em}.approved-by b{display:block;text-align:center;font-size:9px;text-transform:uppercase}.approved-by em{display:block;text-align:center;color:#4b5563;font-size:6.8px;font-weight:800;font-style:normal;text-transform:uppercase}.epass-copy .foot{margin-top:1.1mm;padding-top:.7mm;font-size:7px}
.foot{margin-top:2.3mm;padding-top:1.3mm;border-top:1px solid #e5e7eb;color:#6b7280;font-size:5.2px;text-align:right}
.print-preview-bar{position:sticky;top:0;z-index:9;display:flex;align-items:center;justify-content:center;gap:10px;margin:-10mm -10mm 10mm;padding:10px;background:#0f172a}.print-preview-bar button{padding:9px 18px;border:0;border-radius:8px;font:800 13px/1 Arial,sans-serif;cursor:pointer}.print-preview-bar button[data-do-print]{color:#fff;background:#1d4ed8}.print-preview-bar button[data-close-preview]{color:#e2e8f0;background:#334155}
@media print{.print-preview-bar{display:none}html,body{width:100%;margin:0;padding:0;background:#fff}.page{max-width:none;margin:0}.page--epass{position:absolute;top:0;left:0;width:100%!important;max-width:none!important;height:calc(297mm - .5in);margin:0!important}.copy{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><div class="print-preview-bar"><button type="button" data-do-print>Print</button><button type="button" data-close-preview>Close</button></div><main class="page page--epass page--count-${copies}">${epassCopyHtml.repeat(copies)}</main>
<script>document.querySelector("[data-do-print]").addEventListener("click",function(){window.print();});document.querySelector("[data-close-preview]").addEventListener("click",function(){window.close();});<\/script></body></html>`);
        printWindow.document.close();
    }

    function chooseTravelPrintCopies() {
        const storageKey = "samelcii_travel_print_copies";
        const savedCopies = Number(window.localStorage.getItem(storageKey));
        const defaultCopies = Number.isInteger(savedCopies) && savedCopies >= 1 && savedCopies <= 4 ? savedCopies : 4;

        return new Promise((resolve) => {
            const dialog = document.createElement("dialog");
            dialog.className = "travel-print-choice";
            dialog.setAttribute("aria-labelledby", "travel-print-choice-title");
            dialog.innerHTML = `
                <style>
                    .travel-print-choice{width:min(460px,calc(100vw - 32px));padding:0;border:0;border-radius:22px;color:#102444;background:#fff;box-shadow:0 28px 80px rgba(15,35,68,.28);}
                    .travel-print-choice::backdrop{background:rgba(15,23,42,.56);backdrop-filter:blur(4px);}
                    .travel-print-choice__body{padding:24px;}
                    .travel-print-choice__head{display:flex;align-items:start;justify-content:space-between;gap:16px;}
                    .travel-print-choice__head small{display:block;margin-bottom:5px;color:#a92a26;font:800 11px/1 Arial,sans-serif;letter-spacing:.12em;}
                    .travel-print-choice__head h2{margin:0;font:800 24px/1.15 Arial,sans-serif;}
                    .travel-print-choice__close{width:36px;height:36px;border:0;border-radius:12px;color:#64748b;background:#f1f5f9;font-size:22px;cursor:pointer;}
                    .travel-print-choice__hint{margin:9px 0 18px;color:#64748b;font:500 13px/1.5 Arial,sans-serif;}
                    .travel-print-choice__quantity{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;align-items:center;gap:10px;padding:10px;border:1px solid #ece1cb;border-radius:18px;background:#fbf7ef;}
                    .travel-print-choice__step{height:48px;border:1px solid #d8cdb8;border-radius:14px;color:#a92a26;background:#fff;font:900 25px/1 Arial,sans-serif;cursor:pointer;}.travel-print-choice__step:hover{border-color:#a92a26;background:#f4e2df;}
                    .travel-print-choice__value{display:grid;place-items:center;gap:3px;}.travel-print-choice__value input{width:82px;border:0;color:#102444;background:transparent;text-align:center;font:900 34px/1 Arial,sans-serif;outline:0;}.travel-print-choice__value span{color:#64748b;font:800 10px/1 Arial,sans-serif;letter-spacing:.08em;}
                    .travel-print-choice__remember{display:flex;align-items:center;gap:9px;margin-top:18px;color:#475569;font:600 13px/1.3 Arial,sans-serif;cursor:pointer;}.travel-print-choice__remember input{width:17px;height:17px;accent-color:#a92a26;}
                    .travel-print-choice__print{width:100%;margin-top:18px;padding:14px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#a92a26,#8c1f1c);font:900 14px/1 Arial,sans-serif;letter-spacing:.05em;cursor:pointer;box-shadow:0 10px 24px rgba(169,42,38,.24);}
                </style>
                <div class="travel-print-choice__body">
                    <div class="travel-print-choice__head"><div><small>PRINT LAYOUT</small><h2 id="travel-print-choice-title">How many copies?</h2></div><button class="travel-print-choice__close" type="button" aria-label="Cancel print">&times;</button></div>
                    <p class="travel-print-choice__hint">Enter 1 to 4 copies. Every copy keeps the same quarter-page size.</p>
                    <div class="travel-print-choice__quantity">
                        <button class="travel-print-choice__step" type="button" data-step="-1" aria-label="Decrease copies">&minus;</button>
                        <label class="travel-print-choice__value"><input type="number" min="1" max="4" step="1" value="${defaultCopies}" data-copy-count aria-label="Number of copies"><span>COPIES (MAXIMUM 4)</span></label>
                        <button class="travel-print-choice__step" type="button" data-step="1" aria-label="Increase copies">+</button>
                    </div>
                    <button class="travel-print-choice__print" type="button" data-print-travel>PRINT TRAVEL ORDER</button>
                </div>`;

            const finish = (value) => {
                dialog.close();
                dialog.remove();
                resolve(value);
            };
            dialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                finish(null);
            });
            dialog.addEventListener("click", (event) => {
                if (event.target.closest(".travel-print-choice__close")) {
                    finish(null);
                    return;
                }
                const countInput = dialog.querySelector("[data-copy-count]");
                const stepButton = event.target.closest("[data-step]");
                if (stepButton) {
                    countInput.value = String(Math.min(4, Math.max(1, Number(countInput.value || defaultCopies) + Number(stepButton.dataset.step))));
                    return;
                }
                if (!event.target.closest("[data-print-travel]")) {
                    return;
                }
                const copies = Math.min(4, Math.max(1, Math.round(Number(countInput.value) || defaultCopies)));
                countInput.value = String(copies);
                const printWindow = window.open("", "_blank", "width=980,height=760");
                if (!printWindow) {
                    finish(null);
                    return;
                }
                window.localStorage.setItem(storageKey, String(copies));
                finish({ copies, printWindow });
            });
            document.body.appendChild(dialog);
            dialog.showModal();
        });
    }

    async function printTravelRequest(item) {
        if (!item || epassStatusClass(item.status) !== "approved") {
            const message = document.getElementById("travel-form-message");
            if (message) message.textContent = "Only approved Travel requests can be printed.";
            return;
        }

        const people = travelRequestPeople(item);
        const signatories = Array.isArray(item.print_signatories) ? item.print_signatories : [];
        const savedDepartmentHead = signatories.find((person) => person.stage === "department_head") || {};
        const savedGeneralManager = signatories.find((person) => person.stage === "general_manager") || {};
        const automaticDepartmentHead = requestApproverState.travel?.selectedPerson
            || requestApproverState.travel?.autoPerson
            || readRequestApproverDefault("travel")
            || {};
        const automaticGeneralManager = requestApproverState.travel?.generalManager || {};
        // [FEATURE] A department head traveling can't recommend their own trip — request_approvers
        // never got a department_head row for this request (see travelService.js createTravel), so
        // print_signatories comes back with an empty name. Only in that exact case do we hide the
        // block; don't fall back to a guessed approver just because the name looks blank.
        const hasDepartmentHeadStage = Boolean(savedDepartmentHead.name);
        const departmentHead = savedDepartmentHead.name ? savedDepartmentHead : automaticDepartmentHead;
        const generalManager = savedGeneralManager.name ? savedGeneralManager : automaticGeneralManager;
        const logoUrl = new URL("../../../assets/images/samelco-3d.png", window.location.href).href;

        const printChoice = await chooseTravelPrintCopies();
        if (!printChoice) {
            return;
        }
        const { copies, printWindow } = printChoice;

        const riderRows = (people.length ? people : [{ name: "No employees listed" }])
            .map((person) => `<div class="granted-person"><span class="granted-person__text"><b>${escapeHtml(String(person.name || "-").toUpperCase())}</b></span></div>`)
            .join("");
        // [FIX] Centered signature block: label, printed NAME, position — no line, no background.
        const travelApprovalCol = (label, profile, fallbackLabel) => `
            <div class="travel-approvals__col">
                <small>${escapeHtml(label)}</small>
                <b>${escapeHtml(String(profile?.name || fallbackLabel).toUpperCase())}</b>
                <em>${escapeHtml(String(profile?.position || fallbackLabel).toUpperCase())}</em>
            </div>`;

        // [DESIGN] Quarter-page card, 2x2 per sheet — matching EPASS's print layout exactly,
        // kept in sync with the Approval Desk's travel print (dept-head-approval-hub.js).
        const cardHtml = `
            <article class="copy travel-copy"><header class="epass-head">
                <img class="epass-logo" src="${logoUrl}" alt="SAMELCII logo">
                <div class="epass-org"><strong>SAMAR II ELECTRIC COOPERATIVE, INC.</strong><span>Paranas, Samar</span><h1>TRAVEL ORDER</h1></div>
                <div class="epass-number"><small>ORDER NO.</small><b>${escapeHtml(item.to_number || "-")}</b><span>APPROVED</span></div>
            </header><section class="epass-facts">
                <div><small>DATE</small><strong>${escapeHtml(displayDate(item.date) || item.date || "-")}</strong></div>
                <div><small>DEPARTMENT</small><strong>${escapeHtml(item.department_name || item.department || "-")}</strong></div>
                <div><small>DESTINATION</small><strong>${escapeHtml(item.destination || "-")}</strong></div>
            </section><section class="epass-purpose"><small>PURPOSE</small><strong>${escapeHtml(item.purpose || "-")}</strong></section>
            <p class="travel-terms">All expenses to be incurred in connection with your official travel shall be charged against the proper funds of this cooperative subject to the usual accounting and auditing regulations.</p>
            <section class="granted-section"><div class="granted-head"><strong>TRAVELLING EMPLOYEE${people.length === 1 ? "" : "S"}</strong><span>${people.length || 1} employee${people.length === 1 ? "" : "s"}</span></div>
                <div class="granted-grid granted-grid--few">${riderRows}</div>
            </section>
            <section class="travel-approvals${hasDepartmentHeadStage ? "" : " travel-approvals--single"}">
                ${hasDepartmentHeadStage ? travelApprovalCol("RECOMMENDED BY", departmentHead, "Department Head") : ""}
                ${travelApprovalCol("APPROVED BY", generalManager, "General Manager")}
            </section>
            <footer class="foot">Printed ${escapeHtml(new Date().toLocaleString())}</footer></article>`;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Travel Order ${escapeHtml(item.to_number || "")}</title>
                <style>
                    @page { size: A4 portrait; margin: .25in; }
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
                    body { margin: 0; padding: 10mm; color: #1f2937; background: #e5e7eb; font-family: Arial, sans-serif; }
                    .page { max-width: 197.3mm; margin: auto; background: #fff; }
                    .page--travel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); align-content: start; gap: 4mm; width: 197.3mm; height: 284.3mm; }
                    .page--travel-count-1 .travel-copy:first-child, .page--travel-count-3 .travel-copy:last-child { grid-column: 1 / -1; justify-self: center; width: calc((100% - 4mm) / 2); }
                    .copy { position: relative; min-width: 0; overflow: hidden; padding: 4.5mm; border: 1px solid #d1d5db; border-top: 3px solid #b91c1c; border-radius: 2.5mm; background: linear-gradient(180deg, #fff 0%, #fff 76%, #fffaf0 100%); }
                    .travel-copy { display: flex; flex-direction: column; padding: 4.5mm; }
                    .epass-head { display: grid; grid-template-columns: 12mm minmax(0, 1fr) auto; align-items: start; gap: 2.4mm; padding-bottom: 2.5mm; border-bottom: 1.5px solid #b91c1c; }
                    .epass-logo { width: 11mm; height: 15mm; object-fit: contain; }
                    .epass-org { display: grid; gap: .3mm; text-align: center; }
                    .epass-org > strong { font-size: 11.5px; line-height: 1.08; }
                    .epass-org > span { font-size: 9px; font-weight: 700; }
                    .epass-org h1 { margin: .65mm 0 0; color: #991b1b; font-size: 17px; letter-spacing: .025em; }
                    .epass-number { display: grid; justify-items: end; gap: .45mm; }
                    .epass-number small { color: #6b7280; font-size: 8px; font-weight: 900; }
                    .epass-number b { font-size: 10px; }
                    .epass-number span { padding: .9mm 1.4mm; border-radius: 999px; background: #dcfce7; color: #166534; font-size: 7.5px; font-weight: 900; }
                    .epass-facts { display: grid; grid-template-columns: .75fr 1.1fr 1.15fr; gap: 2mm; padding: 2.5mm 0; border-bottom: 1px solid #e5e7eb; }
                    .epass-facts > div, .epass-purpose { display: grid; align-content: start; gap: .55mm; min-width: 0; }
                    .epass-facts small, .epass-purpose small { color: #9f1239; font-size: 8.3px; font-weight: 900; letter-spacing: .04em; }
                    .epass-facts strong, .epass-purpose strong { overflow-wrap: anywhere; font-size: 10.5px; line-height: 1.2; }
                    .epass-purpose { min-height: 13mm; padding: 2.1mm 0 2.4mm; border-bottom: 1px solid #e5e7eb; }
                    .granted-section { display: grid; align-content: start; gap: 1.4mm; padding-top: 2mm; }
                    .granted-head { display: flex; align-items: center; justify-content: space-between; gap: 2mm; color: #991b1b; }
                    .granted-head strong { font-size: 8.5px; letter-spacing: .04em; }
                    .granted-head span { font-size: 7.6px; font-weight: 800; }
                    .granted-grid--few { grid-template-columns: 1fr; grid-auto-rows: minmax(14mm, auto); gap: 1.5mm; }
                    .granted-person { display: flex; align-items: center; gap: 1.6mm; min-width: 0; padding: 1.2mm 0; }
                    .granted-person__text { display: grid; align-content: center; gap: .2mm; min-width: 0; }
                    .granted-person b { overflow: hidden; font-size: 9px; line-height: 1.05; text-overflow: ellipsis; white-space: nowrap; }
                    .travel-approvals { display: flex; justify-content: space-between; gap: 3mm; margin-top: auto; padding-top: 1mm; }
                    .travel-approvals--single { justify-content: center; }
                    .travel-approvals--single .travel-approvals__col { flex: 0 0 auto; min-width: 32mm; }
                    .travel-approvals__col { display: flex; flex-direction: column; gap: .3mm; flex: 1; min-width: 0; }
                    .travel-approvals__col small { display: block; text-align: left; color: #9f1239; font-size: 6.4px; font-weight: 900; letter-spacing: .04em; margin-bottom: 8mm; }
                    .travel-approvals__col b { display: block; text-align: center; font-size: 8px; text-transform: uppercase; margin-top: .8mm; }
                    .travel-approvals__col em { display: block; text-align: center; color: #4b5563; font-size: 6.4px; font-weight: 700; font-style: normal; text-transform: uppercase; }
                    .travel-terms { margin: 1.2mm 0 0; color: #111827; font-size: 8px; line-height: 1.4; text-align: justify; }
                    .foot { margin-top: 1.1mm; padding-top: .7mm; font-size: 7px; color: #6b7280; text-align: right; }
                    @media print {
                        html, body { width: 100%; margin: 0; padding: 0; background: #fff; }
                        .page { max-width: none; margin: 0; }
                        .page--travel { position: absolute; top: 0; left: 0; width: 100% !important; max-width: none !important; height: calc(297mm - .5in); margin: 0 !important; }
                        .copy { break-inside: avoid; page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <main class="page page--travel page--travel-count-${copies}">
                    ${cardHtml.repeat(copies)}
                </main>
                <script>window.onload = function () { window.print(); };<\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    function renderRequestApproverControl(formKey) {
        const title = formKey === "epass" ? "EPASS approver" : (formKey === "travel" ? "Travel approver" : "Leave approver");
        if (formKey === "leave") {
            return `
                <div class="request-approver-control" data-request-approver="leave" style="grid-template-columns:minmax(0,1fr);margin:0;">
                    <input id="leave-approver-mode" type="hidden" value="auto" />
                    <input id="leave-approver-usercode" type="hidden" />
                    <div class="request-approver-picker" id="leave-approver-manual">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;">
                            <strong style="font-size:12px;color:#18345f;">Leave approval route</strong>
                            <small style="font-size:10px;color:#64769a;">Required order: 1 → 2 → 3</small>
                        </div>
                        <div class="request-approver-selected" id="leave-approver-selected"></div>
                        <div id="leave-route-editor" hidden style="margin-top:8px;padding:9px;border:1px solid #c9d8ef;border-radius:12px;background:#f8fbff;">
                            <label style="display:grid;gap:5px;">
                                <span id="leave-route-editor-label" style="font-size:11px;font-weight:800;color:#294b7a;">Change signatory</span>
                                <input id="leave-route-search" type="search" placeholder="Search eligible approver" autocomplete="off" style="width:100%;padding:8px 10px;border:1px solid #bfd0e8;border-radius:9px;" />
                            </label>
                            <div id="leave-route-results" style="display:grid;gap:5px;margin-top:7px;max-height:228px;overflow-y:auto;overscroll-behavior:contain;padding-right:4px;"></div>
                        </div>
                    </div>
                </div>`;
        }
        if (formKey === "travel") {
            return `
                <div class="request-approver-control" data-request-approver="travel">
                    <label class="request-approver-field">
                        <span>Travel approval route</span>
                        <input id="travel-approver-mode" type="hidden" value="auto" />
                        <small>Required order: Department Head &rarr; General Manager. Click a card below to change who approves.</small>
                    </label>
                    <div class="request-approver-picker" id="travel-approver-manual">
                        <label class="request-approver-field" id="travel-approver-search-field" hidden>
                            <span>Search Department Head</span>
                            <input id="travel-approver-search" type="search" placeholder="Type name or employee number" autocomplete="off" />
                            <input id="travel-approver-usercode" type="hidden" />
                        </label>
                        <div class="request-approver-selected" id="travel-approver-selected"></div>
                        <div class="request-approver-results" id="travel-approver-results" hidden></div>
                    </div>
                </div>`;
        }
        return `
            <div class="request-approver-control" data-request-approver="${formKey}">
                <label class="request-approver-field">
                    <span>${title}</span>
                    <input id="${formKey}-approver-mode" type="hidden" value="auto" />
                    <small>Click the approver card below to search and choose someone else.</small>
                </label>
                <div class="request-approver-picker" id="${formKey}-approver-manual">
                    <label class="request-approver-field" id="${formKey}-approver-search-field" hidden>
                        <span>Search approver</span>
                        <input id="${formKey}-approver-search" type="search" placeholder="Type name or employee number" autocomplete="off" />
                        <input id="${formKey}-approver-usercode" type="hidden" />
                    </label>
                    <div class="request-approver-selected" id="${formKey}-approver-selected"></div>
                    <div class="request-approver-results" id="${formKey}-approver-results" hidden></div>
                </div>
            </div>`;
    }

    function renderEpassRequestForm(message = "") {
        const area = employee.area || session.area || "Main Office";
        const department = employee.department || session.department || "ADMIN";
        const today = todayInputValue();
        const defaultDestination = "Catbalogan Field Office";
        const defaultPurpose = "Site inspection and submission of office records.";
        return `
            <div class="ops-panel epass-panel epass-panel--rebuilt">
                <section class="ops-card epass-compose epass-sheet epass-reference-sheet epass-request-shell epass-request-form">
                    <div class="epass-request-head">
                        <div class="form-chip-row">
                            <span class="form-chip approved" data-request-number-badge="epass">
                                <i class="fa fa-hashtag" aria-hidden="true"></i>
                                <span id="epass-request-number">-</span>
                            </span>
                        </div>
                    </div>
                    <section class="fuel-epass-selected-summary epass-current-selection" id="fuel-epass-selected-summary" aria-label="Employees selected for this EPASS" aria-live="polite"></section>
                    <div class="epass-request-grid">
                        <div class="epass-reference-field epass-field-search epass-search-wrap">
                            <i class="fa fa-search epass-field-icon" aria-hidden="true"></i>
                            <input class="epass-pill-input ops-input" id="epass-search-input" type="text" placeholder="Search employee name or ID..." autocomplete="off" />
                            <div class="epass-search-results" id="epass-search-results" aria-label="Search results"></div>
                        </div>
                        <div class="epass-reference-field epass-field-department">
                            <i class="fa fa-building epass-field-icon" aria-hidden="true"></i>
                            <select class="epass-pill-input ops-input" id="epass-department" aria-label="Department">
                                ${departmentOptions(department)}
                            </select>
                        </div>
                        <input id="epass-date" type="hidden" value="${today}" />
                        <button class="epass-date-pill" id="epass-calendar-trigger" type="button" data-open-calendar-dialog="epass" aria-label="Choose request date">
                            <i class="fa fa-calendar-o epass-field-icon" aria-hidden="true"></i>
                            <span>Request Date</span>
                            <b id="epass-calendar-trigger-label">${escapeHtml(displayDate(today))}</b>
                        </button>
                    </div>
                    <dialog id="epass-calendar-dialog" class="calendar-popup">
                        <div class="calendar-popup-head">
                            <strong>Select Request Date</strong>
                            <button type="button" class="calendar-popup-close" data-close-calendar-dialog aria-label="Close">&times;</button>
                        </div>
                        <div id="epass-calendar" class="travel-calendar" aria-label="EPASS date calendar"></div>
                        <div id="epass-dates-list" class="travel-selected-list travel-selected-list--compact" aria-label="Selected request date"></div>
                    </dialog>
                    <div class="epass-destination-row">
                        <div class="epass-destination-wrap">
                            <i class="fa fa-map-marker epass-field-icon" aria-hidden="true"></i>
                            <input class="epass-destination-input ops-input" id="epass-destination" type="text" value="${escapeHtml(defaultDestination)}" placeholder="Destination" />
                        </div>
                        <div class="epass-request-actions">
                            <button class="epass-new-request-btn" id="epass-new-request" type="button" hidden>NEW REQUEST</button>
                            <button class="epass-save-btn ops-save-btn" id="epass-submit" type="button">SAVE</button>
                        </div>
                    </div>
                    ${renderRequestApproverControl("epass")}
                    <label class="epass-reference-purpose" for="epass-purpose">
                        <i class="fa fa-pencil-square-o epass-purpose-icon" aria-hidden="true"></i>
                        <span class="sr-only">Purpose</span>
                        <textarea class="epass-purpose-box ops-textarea" id="epass-purpose" rows="5" placeholder="Purpose">${escapeHtml(defaultPurpose)}</textarea>
                    </label>
                    <span class="epass-message epass-message-inline" id="epass-form-message">${escapeHtml(area)} origin | ready to save${message ? ` | ${escapeHtml(message)}` : ""}</span>
                </section>
                <section class="ops-card epass-request-archive" id="epass-reference-history" aria-label="EPASS request list">
                    <div class="epass-request-archive-head">
                        <div>
                            <p class="epass-request-kicker">Request history</p>
                            <h3>EPASS Requests</h3>
                            <p>Saved requests for this employee.</p>
                        </div>
                        <i class="fa fa-list-alt" aria-hidden="true"></i>
                    </div>
                    <div class="epass-list-body" id="epass-list-body">
                        <div class="epass-list-empty">
                            <i class="fa fa-id-card-o"></i>
                            <span>Loading EPASS requests...</span>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    function renderLegacyLeaveRequestForm(message = "") {
        const employeeName = employee.name || session.name || session.username || "Employee";
        const employeeCode = employee.usercode || session.usercode || "S2-0000";
        const initialDate = todayInputValue();
        const leaveBalance = (
            Number(session.VLbal || 0) +
            Number(session.SLbal || 0) +
            Number(session.OLbal || 0)
        ).toFixed(1);

        return `
            <div class="ops-panel leave-panel">
                <!-- GABAY: request sheet lang ang unang tingin; dito naka-focus ang leave entry at save flow. -->
                <section class="ops-card leave-form-card">
                    <div class="leave-request-sheet">
                    <div class="leave-request-layout">
                        <section class="leave-calendar-pane" id="leave-calendar-pane">
                            ${renderLeaveCalendar(new Date(), initialDate, initialDate)}
                        </section>
                        <aside class="leave-form-pane">
                            <input id="leave-from-date" type="hidden" value="${initialDate}" />
                            <input id="leave-to-date" type="hidden" value="${initialDate}" />
                            <div class="leave-profile-slab">
                                <div class="leave-profile-chip">
                                    <span>Profiling</span>
                                    <strong>${escapeHtml(employeeCode)}</strong>
                                </div>
                                <div class="leave-profile-chip">
                                    <span>Employee</span>
                                    <strong>${escapeHtml(employeeName)}</strong>
                                </div>
                            </div>
                            <div class="leave-input-grid">
                                <input class="leave-pill-input ops-input" id="leave-search-input" type="text" value="${escapeHtml(employeeCode)}" placeholder="Employee Search" aria-label="Employee Search" />
                                <select class="leave-pill-input ops-input" id="leave-type" aria-label="Type Leave Form">
                                    ${leaveTypeOptions("Half Day Leave")}
                                </select>
                            </div>
                            <div class="leave-date-row">
                                <button class="leave-date-pill ops-date-btn" id="leave-from-button" type="button">
                                    <span>Date Start</span>
                                    <b id="leave-from-label">${escapeHtml(displayDate(initialDate))}</b>
                                </button>
                                <button class="leave-date-pill ops-date-btn" id="leave-to-button" type="button">
                                    <span>Date End</span>
                                    <b id="leave-to-label">${escapeHtml(displayDate(initialDate))}</b>
                                </button>
                            </div>
                            <textarea class="leave-textbox purpose ops-textarea" id="leave-purpose" rows="8" placeholder="Purpose"></textarea>
                            <div class="leave-preview-band">
                                <div class="leave-preview-total">
                                    <strong id="leave-total-days">1</strong>
                                    <div>
                                        <span id="leave-preview-total">1 day selected</span>
                                        <small>${escapeHtml(employeeName)} Â· ${escapeHtml(leaveBalance)} day balance</small>
                                    </div>
                                </div>
                                <div class="leave-summary-chips">
                                    <span class="leave-chip">From: <b id="leave-preview-dates">${escapeHtml(initialDate)}</b></span>
                                    <span class="leave-chip">Type: <b id="leave-preview-type">Half Day Leave</b></span>
                                </div>
                                <div class="leave-form-footer">
                                    <button class="leave-save-btn ops-save-btn" id="leave-submit" type="button">SAVE LEAVE</button>
                                </div>
                            </div>
                            <span class="leave-message" id="leave-form-message">${escapeHtml(message)}</span>
                        </aside>
                    </div>
                    </div>
                </section>
            </div>
        `;
    }

    function renderLeaveRequestForm(message = "") {
        const initialDate = todayInputValue();

        return `
            <div class="ops-panel leave-panel leave-panel--rebuilt">
                <div class="leave-request-workspace">
                    <section class="ops-card leave-request-compose" aria-label="New leave request">
                        <input id="leave-from-date" type="hidden" value="${initialDate}" />
                        <input id="leave-to-date" type="hidden" value="${initialDate}" />

                        <div class="leave-credit-overview">
                            <div>
                                <p class="leave-section-kicker">ALC leave credits</p>
                                <span class="leave-credit-note">Current credits for your account</span>
                            </div>
                            <div class="leave-credit-grid" aria-label="Available leave credits" style="grid-template-columns:repeat(4,minmax(0,1fr));">
                                <article class="leave-credit-card leave-credit-card--vl">
                                    <span>VL</span>
                                    <strong id="leave-credit-vl">...</strong>
                                    <small>Vacation Leave</small>
                                </article>
                                <article class="leave-credit-card leave-credit-card--sl">
                                    <span>SL</span>
                                    <strong id="leave-credit-sl">...</strong>
                                    <small>Sick Leave</small>
                                </article>
                                <article class="leave-credit-card leave-credit-card--ol">
                                    <span>OL</span>
                                    <strong id="leave-credit-ol">...</strong>
                                    <small>Other Leave</small>
                                </article>
                                <article class="leave-credit-card leave-credit-card--ol">
                                    <span>BL</span>
                                    <strong id="leave-credit-birthday">...</strong>
                                    <small id="leave-credit-birthday-note">Birthday Special Leave</small>
                                </article>
                            </div>
                        </div>

                        ${renderRequestApproverControl("leave")}

                        <div class="leave-date-row--compact leave-schedule-row" style="grid-template-columns:repeat(3,minmax(0,1fr));">
                            <label class="leave-field-control leave-type-control" style="max-width:none;display:flex;align-items:center;gap:10px;">
                                <span style="flex:0 0 auto;">Leave type</span>
                                <select class="leave-pill-input ops-input" id="leave-selection" aria-label="Leave type and duration" style="min-width:0;flex:1;">
                                    ${leaveSelectionOptions("Vacation Leave", "Half Day")}
                                </select>
                                <input id="leave-type" type="hidden" value="Vacation Leave" />
                                <input id="leave-duration" type="hidden" value="Half Day" />
                            </label>

                            <button class="leave-date-pill ops-date-btn" id="leave-from-button" type="button" aria-label="Choose start date">
                                <i class="fa fa-calendar-o" aria-hidden="true"></i>
                                <span>Date Start</span>
                                <b id="leave-from-label">${escapeHtml(displayDate(initialDate))}</b>
                            </button>
                            <button class="leave-date-pill ops-date-btn" id="leave-to-button" type="button" aria-label="Choose end date">
                                <i class="fa fa-calendar-o" aria-hidden="true"></i>
                                <span>Date End</span>
                                <b id="leave-to-label">${escapeHtml(displayDate(initialDate))}</b>
                            </button>
                        </div>

                        <div class="leave-balance-impact" id="leave-balance-impact">
                            <div><small>Balance impact</small><strong id="leave-impact-equation">Loading available credits...</strong></div>
                            <span id="leave-impact-note">Your remaining balance will appear here.</span>
                        </div>
                        <div class="leave-smart-warning" id="leave-smart-warning" hidden></div>

                        <label class="leave-purpose-field" for="leave-purpose">
                            <span>Purpose</span>
                            <textarea class="leave-textbox purpose ops-textarea" id="leave-purpose" rows="4" placeholder="Enter the reason for this leave request"></textarea>
                        </label>

                        <details class="leave-calendar-disclosure" id="leave-calendar-disclosure" open>
                            <summary><i class="fa fa-calendar" aria-hidden="true"></i> Choose dates from calendar</summary>
                            <section class="leave-calendar-pane" id="leave-calendar-pane">
                                ${renderLeaveCalendar(new Date(), initialDate, initialDate)}
                            </section>
                        </details>

                        <div class="leave-submit-actions" style="display:flex;justify-content:flex-end;gap:9px;">
                            <span id="leave-total-days" hidden>0.5</span>
                            <button class="leave-edit-cancel" id="leave-edit-cancel" type="button" hidden>CANCEL</button>
                            <button class="leave-save-btn ops-save-btn" id="leave-submit" type="button">SAVE LEAVE</button>
                        </div>
                        <span class="leave-message" id="leave-form-message">${escapeHtml(message || "")}</span>
                    </section>

                    <aside class="ops-card leave-request-history" id="leave-request-history" aria-label="Leave request history">
                        <div class="leave-history-header" data-leave-history-drag title="Drag to move this panel">
                            <div>
                                <p class="leave-section-kicker">Request history</p>
                                <h3>Leave Requests</h3>
                                <span>Click a request to see the approval route.</span>
                            </div>
                            <div class="leave-history-actions">
                                <b class="leave-history-count" id="leave-history-count">0</b>
                                <i class="fa fa-calendar-check-o" aria-hidden="true"></i>
                                <button id="leave-history-collapse" type="button" aria-label="Hide Leave Requests" aria-expanded="true" title="Hide">
                                    <i class="fa fa-eye-slash" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>
                        <div class="leave-history-list" id="leave-history-list">
                            <div class="leave-history-empty">
                                <i class="fa fa-inbox" aria-hidden="true"></i>
                                <strong>Loading leave requests...</strong>
                                <span>Checking your saved requests.</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        `;
    }

    function overtimeTypeSlug(typeKey) {
        return String(typeKey || "ot")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function clearOvertimeAttachmentsStore() {
        Object.values(overtimeAttachmentsByType).forEach((entry) => {
            if (entry?.previewUrl) {
                URL.revokeObjectURL(entry.previewUrl);
            }
        });
        overtimeAttachmentsByType = {};
    }

    function loadOvertimeAttachmentsFromJson(jsonText = "") {
        // [LOGIC] GABAY: Ginagamit sa edit mode para hindi mawala ang existing OT attachment kapag nag-update.
        clearOvertimeAttachmentsStore();
        try {
            const parsed = JSON.parse(jsonText || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return;
            }
            Object.entries(parsed).forEach(([typeKey, entry]) => {
                if (!entry || typeof entry !== "object" || !entry.dataUrl) {
                    return;
                }
                overtimeAttachmentsByType[typeKey] = {
                    dataUrl: entry.dataUrl,
                    name: entry.name || "ot-attachment.jpg",
                    size: Number(entry.size || 0)
                };
            });
        } catch (_error) {
            overtimeAttachmentsByType = {};
        }
    }

    function overtimeTaskParts(value = "") {
        const raw = String(value || "").trim();
        const memorandum = raw.match(/(?:^|\n)MEMORANDUM TO:\s*([^\n]*)/i)?.[1]?.trim() || "";
        const task = raw.match(/(?:^|\n)TASK:\s*([\s\S]*?)(?=\nRESULT:|$)/i)?.[1]?.trim() || raw;
        const result = raw.match(/(?:^|\n)RESULT:\s*([\s\S]*)$/i)?.[1]?.trim() || "";
        return { memorandum, task, result };
    }

    function setOvertimeEditMode(item = null) {
        // [FORM] GABAY: Pending OT lang ang editable; kapag nag-update, nire-reset ang approval flow.
        const saveBtn = document.getElementById("overtime-submit");
        const message = document.getElementById("overtime-form-message");
        overtimeEditingNumber = item?.ot_number || "";
        if (overtimeEditingNumber) {
            overtimeSelectedTimePresets.clear();
            updateOvertimeMultiSelectionUi();
        }
        if (saveBtn) {
            saveBtn.textContent = overtimeEditingNumber ? "UPDATE OT" : "SAVE OT";
            saveBtn.classList.toggle("is-editing", Boolean(overtimeEditingNumber));
        }
        if (message && overtimeEditingNumber) {
            message.textContent = `Editing ${overtimeEditingNumber}. Saving will restart the approval flow.`;
        }
    }

    function fillOvertimeFormForEdit(item) {
        if (!item) {
            return;
        }
        const taskParts = overtimeTaskParts(item.purpose || "");
        document.getElementById("overtime-date").value = item.date_value || "";
        document.getElementById("overtime-time-from").value = item.time_from_value || "";
        document.getElementById("overtime-time-to").value = item.time_to_value || "";
        document.getElementById("overtime-hours").value = Number(item.hours || 0).toString();
        document.getElementById("overtime-purpose").value = taskParts.task;
        const resultInput = document.getElementById("overtime-result");
        if (resultInput) resultInput.value = taskParts.result;
        const memorandum = document.getElementById("overtime-memorandum-to");
        if (memorandum && taskParts.memorandum) memorandum.textContent = taskParts.memorandum;
        document.getElementById("overtime-type").value = item.attachment_type || OVERTIME_DEFAULT_ATTACHMENT;

        loadOvertimeAttachmentsFromJson(item.attachments_json || "");
        refreshOvertimeListAttachmentMarks();
        document.querySelectorAll(".overtime-list-item-wrap").forEach((wrap) => {
            const isActive = (wrap.dataset.overtimeType || "") === (item.attachment_type || OVERTIME_DEFAULT_ATTACHMENT);
            wrap.classList.toggle("active", isActive);
            wrap.querySelector(".overtime-list-item")?.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
        syncOvertimeHours();
        setOvertimeEditMode(item);
    }

    const OVERTIME_DEFAULT_ATTACHMENT = "Collection Report - Teller";

    const OVERTIME_SAMPLE_ATTACHMENTS = [
        { key: "Collection Report - Teller", icon: "fa-file-text-o" },
        { key: "Reading Summary for MR Collectors", icon: "fa-bar-chart" },
        { key: "Log Sheets for Tenders", icon: "fa-list-alt" },
        { key: "Substation Tenders/Lineman Maintenance", icon: "fa-wrench" },
        { key: "Other", icon: "fa-ellipsis-h" }
    ];

    function canCreateOvertimeTeamMemo() {
        const tokens = `${employee.privilage || ""}-${session.privilage || ""}-${employee.privilagemenu || ""}-${session.privilagemenu || ""}`
            .split(/[^0-9]+/).filter(Boolean);
        return tokens.includes("6");
    }

    function setOvertimeTeamMemoOpen(open) {
        const overlay = document.getElementById("overtime-team-memo-overlay");
        const toggle = document.getElementById("overtime-team-memo-open");
        if (!overlay) return;
        overlay.classList.toggle("is-open", Boolean(open));
        overlay.setAttribute("aria-hidden", open ? "false" : "true");
        toggle?.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function renderOvertimeMemoEmployees(query = "") {
        const list = document.getElementById("overtime-team-memo-employees");
        const count = document.getElementById("overtime-team-memo-count");
        const selectAllBtn = document.getElementById("overtime-team-memo-select-all");
        if (!list) return;
        const needle = String(query || "").trim().toLowerCase();
        const areaFilter = String(document.getElementById("overtime-team-memo-area")?.value || "").trim().toLowerCase();
        const items = overtimeMemoEmployees
            .filter((item) => !areaFilter || String(item.area || "").trim().toLowerCase() === areaFilter)
            .filter((item) => !needle || [item.name, item.usercode, item.position, item.area]
                .some((value) => String(value || "").toLowerCase().includes(needle)));
        overtimeMemoVisibleCodes = items.map((item) => String(item.usercode || "").trim().toUpperCase());
        list.replaceChildren();
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "overtime-team-memo-empty";
            empty.textContent = overtimeMemoEmployees.length ? "No employee matches this area/search." : "No employees are available in the selected department.";
            list.appendChild(empty);
        } else {
            items.forEach((item) => {
                const code = String(item.usercode || "").trim().toUpperCase();
                const selected = overtimeMemoSelectedCodes.has(code);
                const button = document.createElement("button");
                button.type = "button";
                button.className = `overtime-team-memo-person${selected ? " is-selected" : ""}`;
                button.dataset.memoEmployeeCode = code;
                button.setAttribute("aria-pressed", selected ? "true" : "false");

                const avatar = document.createElement("span");
                avatar.className = "overtime-team-memo-avatar";
                avatar.textContent = String(item.name || code).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "OT";
                const copy = document.createElement("span");
                copy.className = "overtime-team-memo-person-copy";
                const name = document.createElement("strong");
                name.textContent = item.name || code;
                const meta = document.createElement("small");
                meta.textContent = [item.position, item.area, code].filter(Boolean).join(" · ");
                copy.append(name, meta);
                const check = document.createElement("i");
                check.className = "fa fa-check-circle overtime-team-memo-person-check";
                check.setAttribute("aria-hidden", "true");
                button.append(avatar, copy, check);
                list.appendChild(button);
            });
        }
        if (count) count.textContent = `${overtimeMemoSelectedCodes.size} selected`;
        if (selectAllBtn) {
            const allSelected = overtimeMemoVisibleCodes.length > 0 && overtimeMemoVisibleCodes.every((code) => overtimeMemoSelectedCodes.has(code));
            selectAllBtn.textContent = allSelected ? "Clear shown" : "Select all shown";
            selectAllBtn.disabled = !overtimeMemoVisibleCodes.length;
        }
    }

    async function loadOvertimeMemoEmployees(department) {
        const message = document.getElementById("overtime-team-memo-message");
        const search = document.getElementById("overtime-team-memo-search");
        overtimeMemoEmployees = [];
        if (search) search.value = "";
        renderOvertimeMemoEmployees();
        if (message) message.textContent = `Loading employees from ${department || "the selected group"}...`;
        const params = new URLSearchParams({ action: "memo_employees", department: department || "" });
        const response = await fetch(`${OVERTIME_API}?${params.toString()}`, {
            credentials: "include",
            headers: getOvertimeAuthHeaders()
        });
        const payload = await response.json().catch(() => ({ ok: false }));
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to load department employees.");
        overtimeMemoEmployees = Array.isArray(payload.items) ? payload.items : [];
        renderOvertimeMemoEmployees();
        const areaValue = document.getElementById("overtime-team-memo-area")?.value || "";
        const areaLabel = areaValue ? ` · ${areaValue}` : "";
        const selectedElsewhere = overtimeMemoSelectedCodes.size - overtimeMemoVisibleCodes.filter((code) => overtimeMemoSelectedCodes.has(code)).length;
        const carryNote = selectedElsewhere > 0 ? ` (${selectedElsewhere} more selected elsewhere)` : "";
        if (message) message.textContent = `Showing ${overtimeMemoVisibleCodes.length} employee${overtimeMemoVisibleCodes.length === 1 ? "" : "s"} from ${payload.department || department}${areaLabel}.${carryNote}`;
    }

    async function openOvertimeTeamMemo() {
        if (!canCreateOvertimeTeamMemo()) return;
        overtimeMemoSelectedCodes.clear();
        const date = document.getElementById("overtime-team-memo-date");
        const purpose = document.getElementById("overtime-team-memo-purpose");
        const from = document.getElementById("overtime-team-memo-from");
        const to = document.getElementById("overtime-team-memo-to");
        const search = document.getElementById("overtime-team-memo-search");
        const message = document.getElementById("overtime-team-memo-message");
        if (date) date.value = todayInputValue();
        if (purpose) purpose.value = "";
        if (from) from.value = "";
        if (to) to.value = "";
        if (search) search.value = "";
        if (message) message.textContent = "Loading departments...";
        overtimeMemoEmployees = [];
        renderOvertimeMemoEmployees();
        setOvertimeScheduleModalOpen(false);
        setOvertimeListOverlayOpen(false);
        setOvertimeTeamMemoOpen(true);
        try {
            const response = await fetch(`${OVERTIME_API}?action=memo_departments`, {
                credentials: "include",
                headers: getOvertimeAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false }));
            if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to load departments.");
            const departmentSelect = document.getElementById("overtime-team-memo-department");
            const departments = Array.isArray(payload.departments) ? payload.departments : [];
            if (!departmentSelect || !departments.length) throw new Error("No departments are available.");
            departmentSelect.replaceChildren();
            departments.forEach((departmentName) => {
                const option = document.createElement("option");
                option.value = departmentName;
                option.textContent = departmentName;
                option.selected = departmentName === payload.selected_department;
                departmentSelect.appendChild(option);
            });
            await loadOvertimeMemoEmployees(departmentSelect.value);
            purpose?.focus();
        } catch (error) {
            overtimeMemoEmployees = [];
            renderOvertimeMemoEmployees();
            if (message) message.textContent = error?.message || "Unable to load department employees.";
        }
    }

    async function submitOvertimeTeamMemo() {
        const save = document.getElementById("overtime-team-memo-save");
        const message = document.getElementById("overtime-team-memo-message");
        const payload = {
            date: document.getElementById("overtime-team-memo-date")?.value || "",
            department: document.getElementById("overtime-team-memo-department")?.value || "",
            purpose: document.getElementById("overtime-team-memo-purpose")?.value?.trim() || "",
            time_from: document.getElementById("overtime-team-memo-from")?.value || "",
            time_to: document.getElementById("overtime-team-memo-to")?.value || "",
            employee_codes: Array.from(overtimeMemoSelectedCodes)
        };
        if (!payload.department || !payload.date || !payload.purpose || !payload.employee_codes.length) {
            if (message) message.textContent = "Department, date, purpose, and at least one assigned employee are required.";
            return;
        }
        if (Boolean(payload.time_from) !== Boolean(payload.time_to)) {
            if (message) message.textContent = "Enter both optional times, or leave both blank.";
            return;
        }
        if (save) save.disabled = true;
        if (message) message.textContent = "Creating the team OT memo...";
        try {
            const response = await fetch(`${OVERTIME_API}?action=create_team_memo`, {
                method: "POST",
                credentials: "include",
                headers: getOvertimeAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({ ok: false }));
            if (!response.ok || !result.ok) throw new Error(result.message || "Unable to create the Team OT Memo.");
            setOvertimeTeamMemoOpen(false);
            const formMessage = document.getElementById("overtime-form-message");
            if (formMessage) formMessage.textContent = result.message || "Team OT memo created.";
            notifyApprovalDeskRefresh("ot", { action: "create_team_memo" });
        } catch (error) {
            if (message) message.textContent = error?.message || "Unable to create the Team OT Memo.";
        } finally {
            if (save) save.disabled = false;
        }
    }

    function renderOvertimeRequestForm(message = "") {
        clearOvertimeAttachmentsStore();
        overtimeEditingNumber = "";
        overtimeSelectedTimePresets.clear();

        const defaultDate = todayInputValue();
        const area = employee.area || session.area || "Main Office";
        const department = employee.department || session.department || "ADMIN";
        const employeeName = employee.name || session.name || session.username || "Employee";
        const overtimeItems = OVERTIME_SAMPLE_ATTACHMENTS;

        // GABAY: Kaliwa = sample attachment list + upload; kanan = schedule summary, purpose, at request list.
        // EDIT GUIDE: Ang schedule picker ay popup sa gitna para ma-confirm muna ang date at oras bago mag-save.
        return `
            <div class="ops-panel overtime-panel">
                <section class="ops-card overtime-form-card">
                    <div class="overtime-request-sheet">
                        <div class="overtime-request-layout">
                            <aside class="overtime-list-rail" aria-label="Sample attachments">
                                <div class="overtime-list-head">
                                    <span>OT LIST</span>
                                    <strong>Sample Attachment</strong>
                                </div>
                                ${canCreateOvertimeTeamMemo() ? `
                                    <button class="overtime-team-memo-launch" id="overtime-team-memo-open" type="button" aria-controls="overtime-team-memo-overlay" aria-expanded="false">
                                        <span class="overtime-team-memo-launch-icon"><i class="fa fa-users" aria-hidden="true"></i></span>
                                        <span>
                                            <small>DEPARTMENT HEAD</small>
                                            <strong>Create Team OT Memo</strong>
                                        </span>
                                        <i class="fa fa-arrow-right" aria-hidden="true"></i>
                                    </button>
                                ` : ""}
                                <div class="overtime-list-items">
                                    ${overtimeItems.map((item, index) => {
                                        const slug = overtimeTypeSlug(item.key);
                                        return `
                                            <div class="overtime-list-item-wrap${index === 0 ? " active" : ""}" data-overtime-type="${escapeHtml(item.key)}">
                                                <button class="overtime-list-item" type="button" aria-pressed="${index === 0 ? "true" : "false"}">
                                                    <i class="fa ${escapeHtml(item.icon)} overtime-list-item-icon" aria-hidden="true"></i>
                                                    <span class="overtime-list-item-copy">
                                                        <span>${escapeHtml(item.key)}</span>
                                                    </span>
                                                </button>
                                                <label class="overtime-list-upload" for="overtime-file-${slug}">
                                                    <input
                                                        class="overtime-type-file-input"
                                                        id="overtime-file-${slug}"
                                                        type="file"
                                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                                        hidden
                                                    />
                                                    <span>Upload file</span>
                                                </label>
                                                <span class="overtime-list-check" aria-hidden="true">
                                                    <i class="fa fa-check" aria-hidden="true"></i>
                                                </span>
                                            </div>
                                        `;
                                    }).join("")}
                                </div>
                                <input type="hidden" id="overtime-attachment-data" value="" />
                            </aside>

                            <section class="overtime-form-pane leave-form-pane">
                                <input type="hidden" id="overtime-type" value="${escapeHtml(OVERTIME_DEFAULT_ATTACHMENT)}" />
                                <div class="overtime-schedule-summary-card">
                                    <div class="overtime-schedule-summary-copy">
                                        <span>Schedule</span>
                                        <strong id="overtime-schedule-summary">Select date and time</strong>
                                        <small id="overtime-schedule-status">Confirm date and time before saving.</small>
                                    </div>
                                    <button class="overtime-schedule-open-btn" type="button" id="overtime-open-schedule" aria-controls="overtime-schedule-overlay" aria-expanded="false">
                                        <i class="fa fa-calendar-check-o" aria-hidden="true"></i>
                                        <span>Set schedule</span>
                                    </button>
                                </div>
                                <div class="overtime-profile-slab overtime-profile-slab-form">
                                    <div class="overtime-profile-chip">
                                        <span>Area</span>
                                        <strong id="overtime-area">${escapeHtml(area)}</strong>
                                    </div>
                                    <div class="overtime-profile-chip">
                                        <span>Department</span>
                                        <strong id="overtime-department">${escapeHtml(department)}</strong>
                                    </div>
                                </div>
                                <label class="overtime-reference-field overtime-field-shell overtime-purpose-shell" for="overtime-purpose">
                                    <i class="fa fa-pencil-square-o overtime-field-icon overtime-field-icon-top"></i>
                                    <textarea
                                        class="overtime-textarea ops-textarea overtime-purpose"
                                        id="overtime-purpose"
                                        rows="6"
                                        placeholder="Task (required)"
                                        aria-label="Task"
                                        required
                                        aria-required="true"
                                    ></textarea>
                                </label>
                                <label class="overtime-reference-field overtime-field-shell overtime-result-shell" for="overtime-result">
                                    <i class="fa fa-check-square-o overtime-field-icon overtime-field-icon-top"></i>
                                    <textarea
                                        class="overtime-textarea ops-textarea overtime-result"
                                        id="overtime-result"
                                        rows="4"
                                        placeholder="Result"
                                        aria-label="Result"
                                    ></textarea>
                                </label>
                                <div class="overtime-form-footer leave-form-footer">
                                    <span class="overtime-message" id="overtime-form-message">${escapeHtml(message)}</span>
                                    <button class="overtime-list-open-btn" type="button" id="overtime-open-list" aria-controls="overtime-list-overlay" aria-expanded="false">
                                        <i class="fa fa-list-ul" aria-hidden="true"></i>
                                        <span>My Requests</span>
                                    </button>
                                    <button class="overtime-save-btn leave-save-btn ops-save-btn" id="overtime-submit" type="button">SAVE OT</button>
                                </div>

                                <div class="overtime-schedule-overlay" id="overtime-schedule-overlay" aria-hidden="true">
                                    <button class="overtime-schedule-backdrop" type="button" id="overtime-schedule-backdrop" aria-label="Close schedule picker"></button>
                                    <section class="overtime-schedule-panel" id="overtime-schedule-panel" aria-label="Confirm overtime schedule">
                                        <div class="overtime-schedule-head">
                                            <div class="overtime-schedule-head-copy">
                                                <span>Overtime schedule</span>
                                                <strong>Select date and time before saving</strong>
                                            </div>
                                            <button class="overtime-schedule-close-btn" type="button" id="overtime-close-schedule" aria-label="Close schedule picker" title="Close">&times;</button>
                                        </div>
                                        <div class="overtime-input-grid overtime-reference-grid">
                                            <label class="overtime-reference-field overtime-field-shell" for="overtime-date">
                                                <i class="fa fa-calendar-o overtime-field-icon"></i>
                                                <input class="overtime-input ops-input" id="overtime-date" type="date" value="${defaultDate}" aria-label="Date" />
                                            </label>
                                            <label class="overtime-reference-field overtime-field-shell" for="overtime-time-from">
                                                <i class="fa fa-clock-o overtime-field-icon"></i>
                                                <input class="overtime-input ops-input" id="overtime-time-from" type="time" value="17:00" aria-label="Time From" />
                                            </label>
                                            <label class="overtime-reference-field overtime-field-shell" for="overtime-time-to">
                                                <i class="fa fa-clock-o overtime-field-icon"></i>
                                                <input class="overtime-input ops-input" id="overtime-time-to" type="time" value="19:00" aria-label="Time To" />
                                            </label>
                                            <label class="overtime-reference-field overtime-field-shell overtime-field-readonly" for="overtime-hours">
                                                <i class="fa fa-calculator overtime-field-icon"></i>
                                                <input class="overtime-input ops-input" id="overtime-hours" type="number" min="0" step="0.5" value="2" readonly aria-label="Hours (auto)" title="Auto mula sa Time From at Time To" />
                                            </label>
                                            <div class="overtime-time-presets overtime-time-presets-span" id="overtime-time-presets-wrap">
                                                <div class="overtime-time-presets-head">
                                                    <span>DTR OVERTIME TIMES</span>
                                                    <strong>Choose an OT IN / OT OUT pair from your displayed DTR</strong>
                                                </div>
                                                <div class="overtime-time-presets-list" id="overtime-time-presets-list" role="list">
                                                    <span class="overtime-time-presets-empty">Loading saved times...</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="overtime-schedule-foot">
                                            <span class="overtime-schedule-foot-note" id="overtime-schedule-foot-note">Choose a date and time, then close this popup to continue.</span>
                                            <button class="overtime-schedule-done-btn" type="button" id="overtime-close-schedule">
                                                <i class="fa fa-check" aria-hidden="true"></i>
                                                <span>Done</span>
                                            </button>
                                        </div>
                                    </section>
                                </div>
                            </section>
                        </div>
                        <div class="overtime-list-overlay" id="overtime-list-overlay" aria-hidden="true">
                            <button class="overtime-list-overlay-backdrop" type="button" id="overtime-list-overlay-backdrop" aria-label="Close request list"></button>
                            <section class="overtime-history-panel" id="overtime-history-panel" aria-label="My overtime requests">
                                <div class="overtime-history-head">
                                    <div class="overtime-history-head-copy">
                                        <span>MY REQUESTS</span>
                                        <strong>Overtime list &amp; approval monitor</strong>
                                    </div>
                                    <div class="overtime-history-head-actions">
                                        <nav class="overtime-pager" aria-label="Overtime list pagination">
                                            <button class="overtime-pager-btn" type="button" id="overtime-page-prev" aria-label="Previous page" title="Previous page">&#9664;</button>
                                            <span class="overtime-pager-page" id="overtime-page-label" aria-live="polite">1 / 1</span>
                                            <button class="overtime-pager-btn" type="button" id="overtime-page-next" aria-label="Next page" title="Next page">&#9654;</button>
                                            <button class="overtime-pager-btn overtime-pager-refresh" type="button" id="overtime-page-refresh" aria-label="Refresh list" title="Refresh list">&#8635;</button>
                                        </nav>
                                        <button class="overtime-list-close-btn" type="button" id="overtime-close-list" aria-label="Close request list" title="Close">&times;</button>
                                    </div>
                                </div>
                                <div id="overtime-list-body" class="epass-list-body overtime-list-body">
                                    <div class="epass-list-empty">Loading overtime list...</div>
                                </div>
                            </section>
                        </div>
                        ${canCreateOvertimeTeamMemo() ? `
                            <div class="overtime-team-memo-overlay" id="overtime-team-memo-overlay" aria-hidden="true">
                                <button class="overtime-team-memo-backdrop" id="overtime-team-memo-backdrop" type="button" aria-label="Close Team OT Memo"></button>
                                <section class="overtime-team-memo-dialog" role="dialog" aria-modal="true" aria-labelledby="overtime-team-memo-title">
                                    <aside class="overtime-team-memo-hero">
                                        <span class="overtime-team-memo-kicker"><i class="fa fa-bolt" aria-hidden="true"></i> TEAM DISPATCH</span>
                                        <h3 id="overtime-team-memo-title">Create an OT memo that moves with the team.</h3>
                                        <p>Assign the purpose and date now. Add time only when the work window is already known.</p>
                                        <div class="overtime-team-memo-hero-cards">
                                            <div class="overtime-team-memo-hero-card">
                                                <i class="fa fa-building-o" aria-hidden="true"></i>
                                                <span><label for="overtime-team-memo-department">BROWSE EMPLOYEES BY</label><select id="overtime-team-memo-department" aria-label="Browse employees by department or group"><option value="${escapeHtml(department)}">${escapeHtml(department)}</option></select></span>
                                            </div>
                                            <div class="overtime-team-memo-hero-card">
                                                <i class="fa fa-map-marker" aria-hidden="true"></i>
                                                <span><label for="overtime-team-memo-area">AREA</label><select id="overtime-team-memo-area" aria-label="Narrow the list to one area"><option value="Main" selected>Main</option><option value="Catbalogan">Catbalogan</option><option value="Villareal">Villareal</option><option value="Basey">Basey</option></select></span>
                                            </div>
                                        </div>
                                    </aside>
                                    <div class="overtime-team-memo-workspace">
                                        <div class="overtime-team-memo-head">
                                            <div><span>TEAM OT MEMO</span><strong>Plan the work assignment</strong></div>
                                            <button id="overtime-team-memo-close" type="button" aria-label="Close Team OT Memo" title="Close">&times;</button>
                                        </div>
                                        <label class="overtime-team-memo-purpose" for="overtime-team-memo-purpose">
                                            <span>Purpose / work assignment <b>*</b></span>
                                            <textarea id="overtime-team-memo-purpose" maxlength="2000" rows="4" placeholder="Describe what the assigned employees need to accomplish..."></textarea>
                                        </label>
                                        <div class="overtime-team-memo-schedule">
                                            <label for="overtime-team-memo-date"><span>Required date <b>*</b></span><input id="overtime-team-memo-date" type="date" value="${defaultDate}" /></label>
                                            <label for="overtime-team-memo-from"><span>Start time <em>Optional</em></span><input id="overtime-team-memo-from" type="time" /></label>
                                            <label for="overtime-team-memo-to"><span>End time <em>Optional</em></span><input id="overtime-team-memo-to" type="time" /></label>
                                        </div>
                                        <div class="overtime-team-memo-people-head">
                                            <div><span>ASSIGNED EMPLOYEES</span><strong id="overtime-team-memo-count">0 selected</strong></div>
                                            <div class="overtime-team-memo-people-actions">
                                                <button class="overtime-team-memo-select-all" id="overtime-team-memo-select-all" type="button">Select all shown</button>
                                                <label for="overtime-team-memo-search"><i class="fa fa-search" aria-hidden="true"></i><input id="overtime-team-memo-search" type="search" placeholder="Search name, position, or area" autocomplete="off" /></label>
                                            </div>
                                        </div>
                                        <div class="overtime-team-memo-employees" id="overtime-team-memo-employees" aria-label="Department employees">
                                            <div class="overtime-team-memo-empty">Open the memo to load employees.</div>
                                        </div>
                                        <div class="overtime-team-memo-foot">
                                            <span id="overtime-team-memo-message" aria-live="polite">Date, purpose, and assigned employees are required.</span>
                                            <button id="overtime-team-memo-save" type="button"><i class="fa fa-paper-plane" aria-hidden="true"></i><span>Create Memo</span></button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ` : ""}
                    </div>
                </section>
            </div>
        `;
    }

    function renderTravelRequestForm() {
        const area = employee.area || session.area || "Main Office";
        const department = employee.department || session.department || "ADMIN";
        const today = todayInputValue();
        ensureDefaultTravelPeople();
        ensureDefaultTravelDates();

        return `
            <div class="ops-panel epass-panel travel-panel travel-panel--rebuilt">
                <section class="ops-card epass-compose epass-sheet epass-reference-sheet epass-request-form travel-request-form">
                    <div class="epass-request-grid travel-request-grid">
                        <div class="epass-reference-field epass-field-search epass-search-wrap travel-search-wrap">
                            <i class="fa fa-search epass-field-icon" aria-hidden="true"></i>
                            <input class="epass-pill-input ops-input" id="travel-search-input" type="text" placeholder="Search employee name or ID..." autocomplete="off" />
                            <section class="travel-employee-directory travel-employee-picker" aria-label="Employee search results">
                                <div class="travel-employee-directory-head">
                                    <div>
                                        <strong>Employees</strong>
                                        <div class="travel-employee-directory-meta" id="travel-directory-count">0 employees</div>
                                    </div>
                                    <div class="travel-employee-directory-pager">
                                        <button class="travel-employee-directory-page-btn" id="travel-directory-prev" type="button" aria-label="Previous employees page">&#9664;</button>
                                        <span class="travel-employee-directory-page-label" id="travel-directory-page-label">Page 1 / 1</span>
                                        <button class="travel-employee-directory-page-btn" id="travel-directory-next" type="button" aria-label="Next employees page">&#9654;</button>
                                    </div>
                                </div>
                                <div class="travel-employee-directory-list" id="travel-employee-directory-list">
                                    <div class="travel-employee-directory-empty">Loading employees...</div>
                                </div>
                            </section>
                        </div>
                        <div class="epass-reference-field epass-field-department">
                            <i class="fa fa-building epass-field-icon" aria-hidden="true"></i>
                            <select class="epass-pill-input ops-input" id="travel-department-select" aria-label="Department">
                                ${departmentOptions(department)}
                            </select>
                        </div>
                        <button class="epass-date-pill" id="travel-calendar-trigger" type="button" data-open-calendar-dialog="travel" aria-label="Choose travel dates">
                            <i class="fa fa-calendar-o epass-field-icon" aria-hidden="true"></i>
                            <span>Travel Date(s)</span>
                            <b id="travel-calendar-trigger-label">+ Add date</b>
                        </button>
                    </div>
                    <dialog id="travel-calendar-dialog" class="calendar-popup">
                        <div class="calendar-popup-head">
                            <strong>Select Travel Date(s)</strong>
                            <button type="button" class="calendar-popup-close" data-close-calendar-dialog aria-label="Close">&times;</button>
                        </div>
                        <p class="travel-calendar-hint">Click days to add or remove them &mdash; non-consecutive dates are fine.</p>
                        <div id="travel-calendar" class="travel-calendar" aria-label="Travel date calendar"></div>
                        <div id="travel-dates-list" class="travel-selected-list travel-selected-list--compact" aria-label="Selected travel dates"></div>
                    </dialog>
                    <div id="travel-selected-list" class="travel-selected-list travel-selected-list--compact" aria-label="Selected employees"></div>
                    <div class="epass-destination-row travel-destination-row">
                        <div class="epass-destination-wrap">
                            <i class="fa fa-map-marker epass-field-icon" aria-hidden="true"></i>
                            <input class="epass-destination-input ops-input" id="travel-destination" type="text" value="Catbalogan Field Office" placeholder="Destination" />
                        </div>
                        <div class="epass-request-actions">
                            <button class="epass-new-request-btn" id="travel-new-request" type="button" hidden>NEW REQUEST</button>
                            <button class="epass-save-btn ops-save-btn" id="travel-submit" type="button">SAVE</button>
                        </div>
                    </div>
                    ${renderRequestApproverControl("travel")}
                    <label class="epass-reference-purpose travel-purpose" for="travel-purpose">
                        <i class="fa fa-pencil-square-o epass-purpose-icon" aria-hidden="true"></i>
                        <span class="sr-only">Purpose</span>
                        <textarea class="epass-purpose-box ops-textarea" id="travel-purpose" rows="5" placeholder="Purpose">Site inspection and submission of office records.</textarea>
                    </label>
                    <input id="travel-type" type="hidden" value="Field Work" />
                    <input id="travel-department" type="hidden" value="${escapeHtml(department)}" />
                    <span class="epass-message epass-message-inline" id="travel-form-message">${escapeHtml(area)} origin | ready to save</span>
                </section>
                <section class="ops-card epass-request-archive travel-request-archive" aria-label="Travel request list">
                    <div class="epass-request-archive-head">
                        <div>
                            <p class="epass-request-kicker">Request history</p>
                            <h3>Travel Requests</h3>
                            <p>Saved travel requests for this employee.</p>
                        </div>
                        <i class="fa fa-plane" aria-hidden="true"></i>
                    </div>
                    <div class="epass-list-body" id="travel-list-body">
                        <div class="epass-list-empty">
                            <i class="fa fa-plane"></i>
                            <span>Loading travel requests...</span>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    async function loadLeaveRequestCredits() {
        const fallback = {
            vl: Number(session.VLbal || 0),
            sl: Number(session.SLbal || 0),
            ol: Number(session.OLbal || 0)
        };

        try {
            const range = monthRange(new Date());
            const [summary, annual] = await Promise.all([
                requestDtrLeaveSummary(range),
                requestDtrAnnualLeave(range.year)
            ]);
            const hasAnnualPoints = Array.isArray(annual) && annual.length > 0;
            const credits = {
                vl: hasAnnualPoints
                    ? sumDtrAnnualField(annual, "earned_vl", range.monthIndex)
                    : Number(summary?.current_vl ?? summary?.employee?.VLbal ?? fallback.vl),
                sl: hasAnnualPoints
                    ? sumDtrAnnualField(annual, "earned_sl", range.monthIndex)
                    : Number(summary?.current_sl ?? summary?.employee?.SLbal ?? fallback.sl),
                ol: Number(summary?.employee?.OLbal ?? fallback.ol)
            };
            leaveAvailableCredits = credits;

            Object.entries(credits).forEach(([key, value]) => {
                const target = document.getElementById(`leave-credit-${key}`);
                if (target) target.textContent = (Number.isFinite(value) ? value : 0).toFixed(3);
            });

            const total = Object.values(credits).reduce((sum, value) => (
                sum + (Number.isFinite(value) ? value : 0)
            ), 0);
            const summaryText = document.getElementById("leave-credit-summary-text");
            if (summaryText) {
                summaryText.textContent = `${employee.name || session.name || session.username || "Employee"} · ${total.toFixed(3)} total ALC credits`;
            }
            updateLeaveSummary();
        } catch (error) {
            console.error("Unable to load ALC leave credits.", error);
            leaveAvailableCredits = fallback;
            Object.entries(fallback).forEach(([key, value]) => {
                const target = document.getElementById(`leave-credit-${key}`);
                if (target) target.textContent = (Number.isFinite(value) ? value : 0).toFixed(2);
            });
            const fallbackTotal = Object.values(fallback).reduce((sum, value) => (
                sum + (Number.isFinite(value) ? value : 0)
            ), 0);
            const summaryText = document.getElementById("leave-credit-summary-text");
            if (summaryText) {
                summaryText.textContent = `${employee.name || session.name || session.username || "Employee"} · ${fallbackTotal.toFixed(3)} available credits`;
            }
            updateLeaveSummary();
        }
    }

    const LEAVE_STAGE_ORDER = ["department_head", "administrative_chief", "general_manager"];
    const LEAVE_STAGE_LABELS = {
        department_head: "Department Head",
        administrative_chief: "OIC - Administrative Chief",
        general_manager: "General Manager",
    };
    const LEAVE_TONE_STYLE = {
        approved: { ring: "#16a34a", bg: "#dff8eb", text: "#087443" },
        pending: { ring: "#f59e0b", bg: "#fff0c8", text: "#936000" },
        waiting: { ring: "#cbd5e1", bg: "#f1f5f9", text: "#94a3b8" },
        rejected: { ring: "#dc2626", bg: "#ffe5e8", text: "#ae2832" },
    };

    // Always renders all 3 stages in order, even if a later stage hasn't been assigned an
    // approver yet — a missing `request_approvers` row just becomes a muted "Not yet assigned" step.
    function buildLeaveRoute(item) {
        const byStage = {};
        (Array.isArray(item.approval_route) ? item.approval_route : []).forEach((person) => {
            byStage[person.stage] = person;
        });
        return LEAVE_STAGE_ORDER.map((stageKey) => {
            const person = byStage[stageKey];
            const tone = person?.approval_status?.tone || "waiting";
            const label = person?.approval_status?.label || (person ? "Waiting" : "Not yet assigned");
            const style = LEAVE_TONE_STYLE[tone] || LEAVE_TONE_STYLE.waiting;
            const stageLabel = person?.stage_label || LEAVE_STAGE_LABELS[stageKey] || stageKey;
            const avatarHtml = person
                ? renderEmployeeAvatar(person, "leave-route-avatar")
                : `<span class="leave-route-avatar" aria-hidden="true"><span class="leave-route-avatar-fallback">-</span></span>`;
            return { stageLabel, tone, label, name: person?.name || "-", avatarHtml, ring: style.ring, bg: style.bg, textColor: style.text };
        });
    }

    function renderLeaveRouteStepper(route) {
        return `<div class="leave-route">${route.map((stage, i) => `
            <div class="leave-route-stage">
                <div class="leave-route-avatar-wrap">
                    <div class="leave-route-ring${stage.tone === "pending" ? " is-pulsing" : ""}${stage.tone === "waiting" ? " is-waiting" : ""}" style="box-shadow:0 0 0 3px #fff, 0 0 0 4px ${stage.ring};background:${stage.bg};">
                        ${stage.avatarHtml}
                    </div>
                    ${stage.tone === "approved" ? `<span class="leave-route-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>` : ""}
                </div>
                <div class="leave-route-labels">
                    <span class="leave-route-stage-name">${escapeHtml(stage.stageLabel)}</span>
                    <span class="leave-route-person">${escapeHtml(stage.name)}</span>
                    ${stage.tone === "pending"
                        ? `<span class="leave-route-status leave-route-reviewing" style="color:${stage.textColor}">Reviewing<i></i><i></i><i></i></span>`
                        : `<span class="leave-route-status" style="color:${stage.textColor}">${escapeHtml(stage.label)}</span>`}
                </div>
            </div>
            ${i < route.length - 1 ? `<div class="leave-route-connector"><div class="leave-route-connector-fill" style="background:${stage.tone === "approved" ? "#16a34a" : "#e2e8f0"};animation-delay:${i * 120}ms;"></div></div>` : ""}
        `).join("")}</div>`;
    }

    function renderLeaveRouteDetail(route) {
        return `<div class="leave-route-detail">
            <div class="leave-route-detail-title">Approval route</div>
            ${route.map((stage) => `
                <div class="leave-route-detail-row">
                    <span class="leave-route-detail-dot" style="background:${stage.ring};"></span>
                    <div>
                        <strong>${escapeHtml(stage.stageLabel)}</strong>
                        <span>${escapeHtml(stage.name)} &middot; ${escapeHtml(stage.label)}</span>
                    </div>
                </div>`).join("")}
        </div>`;
    }

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const toggle = event.target.closest?.("[data-leave-toggle-route]");
        if (!toggle) return;
        event.preventDefault();
        toggle.click();
    });

    function renderLeaveRequestHistory(items = []) {
        const list = document.getElementById("leave-history-list");
        if (!list) return;
        const count = Array.isArray(items) ? items.length : 0;
        const countLabel = document.getElementById("leave-history-count");
        if (countLabel) countLabel.textContent = String(count);
        document.querySelectorAll(".leave-history-launcher-count").forEach((badge) => {
            badge.textContent = String(count);
            badge.hidden = count === 0;
        });

        if (!Array.isArray(items) || !items.length) {
            list.innerHTML = `
                <div class="leave-history-empty">
                    <i class="fa fa-inbox" aria-hidden="true"></i>
                    <strong>No leave requests yet</strong>
                    <span>Your saved leave requests will appear here.</span>
                </div>`;
            return;
        }

        list.innerHTML = items.map((item) => {
            const rawStatus = String(item.status_label || item.status || "Pending").trim().toLowerCase();
            const status = rawStatus === "2" || rawStatus.includes("approved")
                ? "approved"
                : (rawStatus === "3" || rawStatus.includes("rejected") ? "rejected" : "pending");
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
            const from = String(item.date_from || "").trim();
            const to = String(item.date_to || "").trim();
            const dateRange = from && to && from !== to ? `${from} to ${to}` : (from || to || "Date unavailable");
            const editButton = status === "pending"
                ? `<button class="leave-history-edit" type="button" data-edit-leave-request="${escapeHtml(item.leave_id || "")}" aria-label="Edit ${escapeHtml(item.tracking_no || "pending leave request")}"><i class="fa fa-pencil" aria-hidden="true"></i> Edit</button>`
                : "";
            const route = buildLeaveRoute(item);
            return `
                <article class="leave-history-entry is-${status}">
                    <div class="leave-history-entry-row" data-leave-toggle-route role="button" tabindex="0" aria-expanded="false">
                        <div class="leave-history-entry-main">
                            <div class="leave-history-entry-head">
                                <div class="leave-history-entry-icon"><i class="fa fa-calendar-check-o" aria-hidden="true"></i></div>
                                <div class="leave-history-entry-copy">
                                    <strong>${escapeHtml(item.tracking_no || `Leave #${item.leave_id || ""}`)}</strong>
                                    <b>${escapeHtml(item.leave_category || item.leave_type || "Leave Request")}</b>
                                    ${item.leave_duration ? `<em>${escapeHtml(item.leave_duration)}</em>` : ""}
                                    <span>${escapeHtml(dateRange)}</span>
                                </div>
                            </div>
                            <div class="leave-history-entry-actions">
                                <span class="leave-history-status">${statusLabel}</span>
                                ${editButton}
                            </div>
                        </div>
                        ${renderLeaveRouteStepper(route)}
                        <i class="fa fa-chevron-down leave-history-chevron" aria-hidden="true"></i>
                    </div>
                    <div class="leave-history-expand">
                        <small class="leave-route-purpose">${escapeHtml(item.purpose || "No purpose provided")}</small>
                        ${renderLeaveRouteDetail(route)}
                    </div>
                </article>`;
        }).join("");
    }

async function renderAlcLeaveStatement(monthlyPanel) {
  if (!monthlyPanel || monthlyPanel.dataset.statementLoading === "true" || monthlyPanel.parentElement?.querySelector(":scope > #alcLeaveStatement")) return;
  monthlyPanel.dataset.statementLoading = "true";

  const readMetric = (label) => {
    const card = [...document.querySelectorAll("[class*='alc']")]
      .filter((node) => node.textContent.toLowerCase().includes(label))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const match = (card?.querySelector("[class*='value']")?.textContent || card?.textContent || "").match(/\d+(?:\.\d+)?/);
    return Number(match?.[0] || 0);
  };
  const earnedCredits = readMetric("available credits");
  let requests = [];
  try {
    const response = await fetch(`${LEAVE_API}?action=history&limit=50`, {
      credentials: "include",
      cache: "no-store",
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`Leave history request failed (${response.status})`);
    const payload = await response.json();
    requests = Array.isArray(payload) ? payload : [payload?.data, payload?.data?.items, payload?.data?.requests, payload?.requests, payload?.history, payload?.items].find(Array.isArray) || [];
  } catch (error) {
    console.warn("Unable to load the ALC leave statement.", error);
  }

  const statusOf = (item) => String(item?.Status ?? item?.status ?? "Pending").trim();
  const daysOf = (item) => {
    const value = Number(item?.numofdays ?? item?.num_of_days ?? item?.days ?? item?.duration ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  };
  const typeOf = (item) => item?.leave_type || item?.type || item?.leaveType ||
    (item?.flagVL ? "Vacation Leave" : item?.flagSL ? "Sick Leave" : item?.flagML ? "Maternity Leave" : "Other Leave");
  const approvedDays = requests.filter((item) => /approved/i.test(statusOf(item))).reduce((total, item) => total + daysOf(item), 0);
  const pendingDays = requests.filter((item) => /pending|for approval/i.test(statusOf(item))).reduce((total, item) => total + daysOf(item), 0);
  const availableNow = Math.max(0, earnedCredits - approvedDays);
  const plannedAvailable = Math.max(0, availableNow - pendingDays);
  const alertState = pendingDays > availableNow
    ? ["danger", "!", "Pending requests exceed your available credits."]
    : plannedAvailable < 2
      ? ["warning", "!", "Your planned balance is low. Review pending leave before submitting another request."]
      : ["good", "\u2713", "Your leave credits are in good standing."];
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
  const formatDays = (value) => `${Number(value).toFixed(3)} day${Number(value) === 1 ? "" : "s"}`;
  const formatDate = (value) => {
    if (!value) return "Date unavailable";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const recentRequests = requests.slice(0, 5).map((item) => {
    const status = statusOf(item);
    const tone = /approved/i.test(status) ? "approved" : /reject|cancel/i.test(status) ? "rejected" : "pending";
    const tracking = item?.trackingNo || item?.tracking_no || item?.tracking || `Leave #${item?.Id || item?.id || ""}`;
    const date = item?.datafrom || item?.date_from || item?.dateStart || item?.datecreated || "";
    return `<li class="alc-statement-request">
      <span class="alc-statement-request-icon" aria-hidden="true">${safe(String(typeOf(item)).slice(0, 1).toUpperCase())}</span>
      <span class="alc-statement-request-copy"><strong>${safe(typeOf(item))}</strong><small>${safe(tracking)} \u00b7 ${safe(formatDate(date))} \u00b7 ${formatDays(daysOf(item))}</small></span>
      <span class="alc-statement-status is-${tone}">${safe(status || "Pending")}</span>
    </li>`;
  }).join("");

  const statement = document.createElement("section");
  statement.id = "alcLeaveStatement";
  statement.className = "alc-statement";
  statement.innerHTML = `
    <div class="alc-statement-head">
      <div><span class="alc-statement-eyebrow">EMPLOYEE REPORT</span><h3>Leave Credit Statement</h3><p>How saved leave requests affect your available credits.</p></div>
      <span class="alc-statement-alert is-${alertState[0]}"><b>${alertState[1]}</b>${alertState[2]}</span>
    </div>
    <div class="alc-statement-body">
      <div class="alc-statement-balance" aria-label="Leave credit balance calculation">
        <div class="alc-statement-step"><span>Credits earned</span><strong>${formatDays(earnedCredits)}</strong></div><i>\u2212</i>
        <div class="alc-statement-step"><span>Approved used</span><strong>${formatDays(approvedDays)}</strong></div><i>\u2212</i>
        <div class="alc-statement-step"><span>Pending reserved</span><strong>${formatDays(pendingDays)}</strong></div><i>=</i>
        <div class="alc-statement-step is-result"><span>Planned available</span><strong>${formatDays(plannedAvailable)}</strong><small>${formatDays(availableNow)} after approvals</small></div>
      </div>
      <div class="alc-statement-recent">
        <div class="alc-statement-recent-head"><h4>Recent leave requests</h4><span>${requests.length} saved</span></div>
        ${recentRequests ? `<ul>${recentRequests}</ul>` : `<div class="alc-statement-empty">No saved leave requests yet.</div>`}
      </div>
    </div>`;
  monthlyPanel.insertAdjacentElement("afterend", statement);
  monthlyPanel.dataset.statementLoading = "false";
}

const alcStatementObserver = new MutationObserver(() => {
  const title = [...document.querySelectorAll("h1, h2, h3, h4, strong")]
    .find((node) => node.textContent.trim().toLowerCase() === "monthly credit growth");
  const panel = title?.closest("section, article, .alc-year-overview, .alc-overview-card");
  if (panel) renderAlcLeaveStatement(panel);
});
if (document.body) {
  alcStatementObserver.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener("DOMContentLoaded", () => alcStatementObserver.observe(document.body, { childList: true, subtree: true }), { once: true });
}

async function loadLeaveRequestHistory() {
        const list = document.getElementById("leave-history-list");
        if (!list) return;
        try {
            const { response, payload } = await fetchJsonWithSessionRetry(
                `${LEAVE_API}?action=history&limit=50`,
                { cache: "no-store", credentials: "include", headers: getAuthHeaders() },
                "Unable to load leave request history."
            );
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load leave request history.");
            }
            const items = payload.items || [];
            leaveRequestHistoryItems = items;
            indexLeaveRequestsForCalendar(items);
            renderLeaveRequestHistory(items);
            refreshBirthdayLeaveSelectionOptions();
            updateLeaveSummary();
            refreshLeaveCalendar();
        } catch (error) {
            list.innerHTML = `
                <div class="leave-history-empty">
                    <i class="fa fa-exclamation-circle" aria-hidden="true"></i>
                    <strong>Unable to load requests</strong>
                    <span>${escapeHtml(error.message || "Please try again.")}</span>
                </div>`;
        }
    }

    function resetLeaveEditMode(clearForm = false) {
        leaveEditingId = "";
        refreshBirthdayLeaveSelectionOptions();
        const submitButton = document.getElementById("leave-submit");
        const cancelButton = document.getElementById("leave-edit-cancel");
        if (submitButton) submitButton.textContent = "SAVE LEAVE";
        if (cancelButton) cancelButton.hidden = true;

        if (clearForm) {
            const today = todayInputValue();
            const fromInput = document.getElementById("leave-from-date");
            const toInput = document.getElementById("leave-to-date");
            const purposeInput = document.getElementById("leave-purpose");
            if (fromInput) fromInput.value = today;
            if (toInput) toInput.value = today;
            setLeaveSelection("Vacation Leave", "Half Day");
            if (purposeInput) purposeInput.value = "";
            setRequestApproverSelection("leave", {});
            updateLeaveSummary();
            refreshLeaveCalendar();
        }
    }

    function beginLeaveRequestEdit(leaveId) {
        const item = leaveRequestHistoryItems.find((request) => String(request.leave_id || "") === String(leaveId || ""));
        const message = document.getElementById("leave-form-message");
        if (!item || leaveRequestStatusKey(item.status_label || item.status) !== "pending") {
            console.warn("[leave-edit] blocked: item not found or not pending", { leaveId, found: Boolean(item), status: item?.status_label || item?.status });
            if (message) {
                message.textContent = "Only pending leave requests can be edited.";
                message.classList.add("is-error");
            }
            return;
        }

        const fromValue = item.date_from_value || leaveHistoryDateValue(item.date_from);
        const toValue = item.date_to_value || leaveHistoryDateValue(item.date_to || item.date_from);
        const fromInput = document.getElementById("leave-from-date");
        const toInput = document.getElementById("leave-to-date");
        const typeInput = document.getElementById("leave-type");
        const durationInput = document.getElementById("leave-duration");
        const purposeInput = document.getElementById("leave-purpose");
        if (!fromValue || !toValue || !fromInput || !toInput || !typeInput || !durationInput || !purposeInput) {
            console.warn("[leave-edit] blocked: missing field", {
                fromValue, toValue,
                hasFromInput: Boolean(fromInput), hasToInput: Boolean(toInput),
                hasTypeInput: Boolean(typeInput), hasDurationInput: Boolean(durationInput), hasPurposeInput: Boolean(purposeInput)
            });
            return;
        }
        console.info("[leave-edit] editing", { leaveId, item });

        leaveEditingId = String(item.leave_id || "");
        fromInput.value = fromValue;
        toInput.value = toValue;
        refreshBirthdayLeaveSelectionOptions();
        setLeaveSelection(
            item.leave_category || (String(item.leave_type || "").includes("Vacation") ? "Vacation Leave" : "Other Leave"),
            item.leave_duration || (Number(item.days) === 0.5 ? "Half Day" : (Number(item.days) > 1 ? "Multiple Days" : "Whole Day"))
        );
        purposeInput.value = item.purpose || "";
        // [FIX] Always show what's actually saved for THIS request (item.approval_route), never
        // re-derive a fresh auto-suggestion here — that used the CURRENTLY LOGGED-IN user's own
        // department, not the original requester's, so editing someone else's request silently
        // swapped in the viewer's own department head instead of the real assigned signatory.
        setRequestApproverSelection("leave", item);

        const submitButton = document.getElementById("leave-submit");
        const cancelButton = document.getElementById("leave-edit-cancel");
        if (submitButton) submitButton.textContent = "UPDATE LEAVE";
        if (cancelButton) cancelButton.hidden = false;
        if (message) {
            message.classList.remove("is-error", "is-success");
            message.textContent = `Editing ${item.tracking_no || `Leave #${leaveEditingId}`}. Only pending requests can be updated.`;
        }

        updateLeaveSummary();
        const editDate = new Date(`${fromValue}T00:00:00`);
        const pane = document.getElementById("leave-calendar-pane");
        if (pane && !Number.isNaN(editDate.getTime())) {
            pane.innerHTML = renderLeaveCalendar(editDate, fromValue, toValue);
            void loadLeaveCalendarMarkers(editDate);
        }
        purposeInput.focus();
    }

    async function submitLeaveRequest() {
        const button = document.getElementById("leave-submit");
        const message = document.getElementById("leave-form-message");
        const leaveCategory = document.getElementById("leave-type")?.value || "";
        const leaveDuration = document.getElementById("leave-duration")?.value || "";
        const dateFrom = document.getElementById("leave-from-date")?.value || "";
        const dateTo = document.getElementById("leave-to-date")?.value || "";
        const purpose = document.getElementById("leave-purpose")?.value.trim() || "";
        const totalDays = Number(document.getElementById("leave-total-days")?.textContent || "0");
        const approverMode = document.getElementById("leave-approver-mode")?.value || "auto";
        const approverUsercode = document.getElementById("leave-approver-usercode")?.value || "";

        const showMessage = (text, state = "") => {
            if (!message) return;
            message.textContent = text;
            message.classList.toggle("is-error", state === "error");
            message.classList.toggle("is-success", state === "success");
        };

        if (!leaveCategory || !leaveDuration || !dateFrom || !dateTo || totalDays <= 0) {
            showMessage("Select a leave category, duration, and valid date range first.", "error");
            return;
        }
        if (!purpose) {
            showMessage("Enter the purpose of your leave request.", "error");
            document.getElementById("leave-purpose")?.focus();
            return;
        }
        if (approverMode === "manual" && !approverUsercode) {
            showMessage("Search and choose a Leave approver first.", "error");
            document.getElementById("leave-approver-search")?.focus();
            return;
        }
        if (button?.dataset.leaveBlocked === "1") {
            showMessage(button.dataset.leaveBlockedMessage || "Resolve the leave warning before saving.", "error");
            return;
        }
        if (!button || button.disabled) return;

        const editingId = leaveEditingId;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.textContent = editingId ? "UPDATING..." : "SAVING...";
        showMessage(editingId ? "Updating your pending leave request..." : "Submitting your leave request...");

        try {
            const body = new URLSearchParams({
                leave_type: leaveCategory,
                leave_category: leaveCategory,
                leave_duration: leaveDuration,
                approver_usercode: approverUsercode,
                approver_mode: approverMode,
                department_head_usercode: String(leaveApprovalRouteOverrides.department_head || ""),
                administrative_chief_usercode: String(leaveApprovalRouteOverrides.administrative_chief || ""),
                date_from: dateFrom,
                date_to: dateTo,
                reason: purpose
            });
            if (leaveApprovalCanChangeGeneralManager && leaveApprovalRouteOverrides.general_manager) {
                body.set("general_manager_usercode", String(leaveApprovalRouteOverrides.general_manager));
            }
            if (editingId) body.set("leave_id", editingId);
            const { response, payload } = await fetchJsonWithSessionRetry(
                `${LEAVE_API}?action=${editingId ? "update" : "submit"}`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: getAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }),
                    body: body.toString()
                },
                "The leave service returned an invalid response."
            );
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || `Unable to ${editingId ? "update" : "save"} the leave request.`);
            }

            const tracking = payload.tracking_no ? ` Reference: ${payload.tracking_no}.` : "";
            await loadLeaveRequestHistory();
            resetLeaveEditMode(true);
            showMessage(`${payload.message || (editingId ? "Pending leave request updated." : "Leave request saved.")}${tracking}`, "success");
        } catch (error) {
            showMessage(error.message || `Unable to ${editingId ? "update" : "save"} the leave request. Please try again.`, "error");
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.textContent = leaveEditingId ? "UPDATE LEAVE" : "SAVE LEAVE";
        }
    }

    function leaveCreditBucket(category) {
        if (category === "Vacation Leave") return { key: "vl", label: "VL" };
        if (category === "Sick Leave") return { key: "sl", label: "SL" };
        if (category === BIRTHDAY_LEAVE_CATEGORY) return { key: "birthday", label: "BL" };
        return { key: "ol", label: "OL" };
    }

    function findOverlappingLeaveRequest(fromValue, toValue) {
        if (!fromValue || !toValue) return null;
        return leaveRequestHistoryItems.find((item) => {
            if (String(item.leave_id || "") === String(leaveEditingId || "")) return false;
            if (leaveRequestStatusKey(item.status_label || item.status) === "rejected") return false;
            const itemFrom = leaveHistoryDateValue(item.date_from_value || item.date_from);
            const itemTo = leaveHistoryDateValue(item.date_to_value || item.date_to || item.date_from_value || item.date_from);
            return itemFrom && itemTo && itemFrom <= toValue && itemTo >= fromValue;
        }) || null;
    }

    function updateLeaveSummary() {
        const fromInput = document.getElementById("leave-from-date");
        const toInput = document.getElementById("leave-to-date");
        const typeInput = document.getElementById("leave-type");
        const durationInput = document.getElementById("leave-duration");
        const employeeInput = document.getElementById("leave-search-input");
        const fromLabel = document.getElementById("leave-from-label");
        const toLabel = document.getElementById("leave-to-label");
        const totalDaysEl = document.getElementById("leave-total-days");
        const previewEmployee = document.getElementById("leave-preview-employee");
        const previewType = document.getElementById("leave-preview-type");
        const previewDuration = document.getElementById("leave-preview-duration");
        const previewDates = document.getElementById("leave-preview-dates");
        const previewTotal = document.getElementById("leave-preview-total");

        const fromValue = fromInput?.value || "";
        const toValue = toInput?.value || "";
        const typeValue = typeInput?.value || "Vacation Leave";
        const durationValue = durationInput?.value || "Half Day";
        const employeeValue = employeeInput?.value || employee.name || session.name || session.username || "Employee";

        if (fromLabel) fromLabel.textContent = displayDate(fromValue);
        if (toLabel) toLabel.textContent = displayDate(toValue);
        if (previewEmployee) previewEmployee.textContent = employeeValue;
        if (previewType) previewType.textContent = typeValue;
        if (previewDuration) previewDuration.textContent = durationValue;

        let totalDays = 0;
        if (fromValue && toValue) {
            const start = new Date(`${fromValue}T00:00:00`);
            const end = new Date(`${toValue}T00:00:00`);
            const diff = end.getTime() - start.getTime();
            if (!Number.isNaN(diff) && diff >= 0) {
                totalDays = Math.floor(diff / 86400000) + 1;
            }
        }
        if (durationValue === "Half Day" && totalDays > 0) {
            totalDays = 0.5;
        }
        if (durationValue === "Whole Day" && totalDays > 0) {
            totalDays = 1;
        }

        const totalText = Number.isInteger(totalDays) ? String(totalDays) : totalDays.toFixed(1);
        if (totalDaysEl) totalDaysEl.textContent = totalText;
        if (previewTotal) previewTotal.textContent = `${totalText} day${totalDays === 1 ? "" : "s"} selected`;

        if (previewDates) {
            if (fromValue && toValue) {
                previewDates.textContent = `${displayDate(fromValue)} to ${displayDate(toValue)}`;
            } else if (fromValue) {
                previewDates.textContent = displayDate(fromValue);
            } else {
                previewDates.textContent = "-";
            }
        }

        const bucket = leaveCreditBucket(typeValue);
        const birthdayState = birthdayLeaveState(fromValue, leaveEditingId);
        const balance = bucket.key === "birthday" ? birthdayState.available : leaveAvailableCredits[bucket.key];
        const equation = document.getElementById("leave-impact-equation");
        const impactNote = document.getElementById("leave-impact-note");
        const impact = document.getElementById("leave-balance-impact");
        const warning = document.getElementById("leave-smart-warning");
        const submit = document.getElementById("leave-submit");
        const overlap = findOverlappingLeaveRequest(fromValue, toValue);
        const birthdayCredit = document.getElementById("leave-credit-birthday");
        const birthdayCreditNote = document.getElementById("leave-credit-birthday-note");
        if (birthdayCredit) birthdayCredit.textContent = birthdayState.available.toFixed(3);
        if (birthdayCreditNote) birthdayCreditNote.textContent = birthdayState.message;
        leaveAvailableCredits.birthday = birthdayState.available;

        const creditControlled = bucket.key === "vl" || bucket.key === "sl" || bucket.key === "birthday";
        const insufficient = creditControlled && Number.isFinite(balance) && totalDays > balance;
        const birthdayIssue = typeValue === BIRTHDAY_LEAVE_CATEGORY
            ? (fromValue !== toValue || durationValue !== "Whole Day"
                ? "Birthday Leave must use one whole-day date."
                : (birthdayState.available < BIRTHDAY_LEAVE_CREDIT ? birthdayState.message : ""))
            : "";
        const routeIssue = leaveApprovalRouteReady ? "" : leaveApprovalRouteMessage;
        const blockedMessage = routeIssue || birthdayIssue || (overlap
            ? `Dates overlap ${overlap.tracking_no || "an existing leave request"}.`
            : (insufficient ? `Insufficient ${bucket.label} credits for ${totalText} day${totalDays === 1 ? "" : "s"}.` : ""));

        if (equation) {
            equation.textContent = Number.isFinite(balance)
                ? `${balance.toFixed(3)} ${bucket.label} − ${totalDays.toFixed(3)} = ${(balance - totalDays).toFixed(3)} remaining`
                : "Loading available credits...";
        }
        if (impactNote) {
            impactNote.textContent = typeValue === BIRTHDAY_LEAVE_CATEGORY
                ? birthdayState.message
                : (creditControlled
                    ? `${typeValue} uses your ${bucket.label} balance.`
                    : `${typeValue} follows the assigned approver's policy.`);
        }
        impact?.classList.toggle("is-danger", insufficient);
        if (warning) {
            warning.hidden = !blockedMessage;
            warning.textContent = blockedMessage;
        }
        if (submit) {
            submit.dataset.leaveBlocked = blockedMessage ? "1" : "0";
            submit.dataset.leaveBlockedMessage = blockedMessage;
        }
    }

    function refreshLeaveCalendar() {
        const pane = document.getElementById("leave-calendar-pane");
        const calendar = pane?.querySelector(".leave-calendar");
        if (!pane || !calendar) {
            return;
        }
        const year = Number(calendar.dataset.calendarYear || new Date().getFullYear());
        const month = Number(calendar.dataset.calendarMonth || new Date().getMonth());
        const fromValue = document.getElementById("leave-from-date")?.value || "";
        const toValue = document.getElementById("leave-to-date")?.value || "";
        pane.innerHTML = renderLeaveCalendar(new Date(year, month, 1), fromValue, toValue);
    }

    async function loadLeaveCalendarMarkers(date = new Date()) {
        const profile = await getCurrentSessionProfile();
        const usercode = resolveDtrEmployeeIds(profile)[0] || resolveDtrEmployeeId();
        if (!usercode) {
            return;
        }

        const year = date.getFullYear();
        const month = date.getMonth();
        const from = datePart(year, month, 1);
        const to = datePart(year, month, new Date(year, month + 1, 0).getDate());
        const key = `${DTR_CACHE_VERSION}:leave_calendar:${usercode}:${from}:${to}`;
        const cached = getCachedValue("employees_profile_leave_calendar_v2", key, 30 * 60 * 1000);
        if (cached) {
            leaveCalendarMarkers = cached;
            refreshLeaveCalendar();
            return;
        }

        const params = new URLSearchParams({
            action: "monthly_computed",
            date_from: from,
            date_to: to,
            usercode
        });

        try {
            const { response, payload } = await fetchJsonWithSessionRetry(
                `${DTR_API}?${params.toString()}`,
                {
                    cache: "no-store",
                    credentials: "include",
                    headers: getAuthHeaders()
                },
                "Invalid DTR server response."
            );
            if (!response.ok || !payload.ok) {
                return;
            }

            const markers = {};
            (payload.items || []).forEach((item) => {
                const dateValue = item.work_date || "";
                const label = String(item.special_label || "").trim();
                if (!dateValue || !label) {
                    return;
                }
                const normalized = label.toLowerCase();
                markers[dateValue] = {
                    type: normalized.includes("holiday") ? "holiday" : "leave",
                    label
                };
            });
            leaveCalendarMarkers = markers;
            setCachedValue("employees_profile_leave_calendar_v2", key, markers);
            refreshLeaveCalendar();
        } catch (_error) {
            // The calendar remains usable even if markers cannot load.
        }
    }

    function selectLeaveDate(value) {
        const fromInput = document.getElementById("leave-from-date");
        const toInput = document.getElementById("leave-to-date");
        const durationValue = document.getElementById("leave-duration")?.value || "";
        if (!fromInput || !toInput) {
            return;
        }

        if (durationValue === "Half Day" || durationValue === "Whole Day") {
            fromInput.value = value;
            toInput.value = value;
            refreshBirthdayLeaveSelectionOptions();
            updateLeaveSummary();
            refreshLeaveCalendar();
            return;
        }

        if (!fromInput.value || fromInput.value && toInput.value) {
            fromInput.value = value;
            toInput.value = "";
        } else if (value < fromInput.value) {
            toInput.value = fromInput.value;
            fromInput.value = value;
        } else {
            toInput.value = value;
        }

        refreshBirthdayLeaveSelectionOptions();
        updateLeaveSummary();
        refreshLeaveCalendar();
    }

    function bindFloatingLeaveHistory() {
        const panel = document.getElementById("leave-request-history");
        const workspace = panel?.closest(".leave-request-workspace");
        const handle = panel?.querySelector("[data-leave-history-drag]");
        const collapse = document.getElementById("leave-history-collapse");
        if (!panel || !workspace || !handle || !collapse || panel.dataset.floatingBound === "1") {
            return;
        }
        panel.dataset.floatingBound = "1";

        workspace.style.position = "relative";
        workspace.style.display = "block";
        const compose = workspace.querySelector(".leave-request-compose");
        if (compose) {
            Object.assign(compose.style, {
                display: "grid",
                gridTemplateColumns: "minmax(390px, .82fr) minmax(560px, 1.18fr)",
                gridTemplateRows: "auto auto auto auto auto minmax(150px, 210px) auto auto",
                alignContent: "start",
                gap: "14px 18px",
                width: "100%",
                height: "100%",
                overflow: "hidden"
            });
            const place = (selector, column, row) => {
                const target = compose.querySelector(selector);
                if (target) {
                    target.style.gridColumn = column;
                    target.style.gridRow = row;
                }
                return target;
            };
            place(":scope > .leave-credit-overview", "1", "1");
            place(':scope > .request-approver-control[data-request-approver="leave"]', "1", "2");
            place(":scope > .leave-schedule-row", "1", "3");
            place(":scope > .leave-balance-impact", "1", "4");
            place(":scope > .leave-smart-warning", "1", "5");
            const purposeField = place(":scope > .leave-purpose-field", "1", "6");
            place(":scope > .leave-submit-actions", "1", "7");
            place(":scope > .leave-message", "1", "8");
            const calendarField = place(":scope > .leave-calendar-disclosure", "2", "1 / 9");
            if (purposeField) {
                purposeField.style.minHeight = "0";
                const textarea = purposeField.querySelector("textarea");
                if (textarea) {
                    textarea.style.height = "100%";
                    textarea.style.minHeight = "150px";
                    textarea.style.resize = "vertical";
                }
            }
            if (calendarField) {
                calendarField.open = true;
                calendarField.style.height = "100%";
                calendarField.style.minHeight = "0";
                calendarField.style.overflow = "auto";
            }
        }
        // A small draggable corner card never had enough room for the request details AND the
        // approval route without one of them getting squeezed — the panel's real size depends on
        // the modal/window it happened to open in. Promoted to its own centered, viewport-sized
        // overlay instead: fixed dimensions the surrounding layout can't shrink, so there's no
        // "too small" left to chase. Dragging doesn't apply to a centered takeover, so it's gone.
        const backdrop = document.createElement("div");
        backdrop.id = "leave-history-backdrop";
        Object.assign(backdrop.style, {
            position: "fixed",
            inset: "0",
            zIndex: "29",
            background: "rgba(15, 23, 42, .38)",
            display: "none"
        });
        workspace.appendChild(backdrop);

        Object.assign(panel.style, {
            position: "fixed",
            zIndex: "30",
            top: "50%",
            left: "50%",
            right: "auto",
            transform: "translate(-50%, -50%)",
            width: "min(1200px, 94vw)",
            height: "min(780px, 88vh)",
            display: "none",
            boxShadow: "0 24px 60px rgba(15, 23, 42, .32)"
        });
        handle.style.cursor = "default";
        collapse.style.display = "grid";
        collapse.style.placeItems = "center";
        collapse.style.cursor = "pointer";

        const launcher = document.createElement("button");
        launcher.id = "leave-history-launcher";
        launcher.type = "button";
        launcher.setAttribute("aria-label", "Show Leave Requests");
        launcher.title = "Show Leave Requests";
        launcher.innerHTML = `<i class="fa fa-list-alt" aria-hidden="true"></i><span>SHOW REQUESTS</span><b class="leave-history-launcher-count" ${leaveRequestHistoryItems.length ? "" : "hidden"}>${leaveRequestHistoryItems.length}</b>`;
        Object.assign(launcher.style, {
            position: "absolute",
            zIndex: "31",
            bottom: "14px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minHeight: "42px",
            padding: "0 14px",
            border: "1px solid #9db9e8",
            borderRadius: "10px",
            background: "#ffffff",
            color: "#2458b8",
            fontWeight: "900",
            cursor: "pointer",
            boxShadow: "0 12px 28px rgba(15, 23, 42, .18)"
        });
        collapse.setAttribute("aria-expanded", "false");
        workspace.appendChild(launcher);

        const openPanel = () => {
            panel.style.display = "flex";
            backdrop.style.display = "block";
            launcher.style.display = "none";
            collapse.setAttribute("aria-expanded", "true");
        };
        const closePanel = () => {
            panel.style.display = "none";
            backdrop.style.display = "none";
            launcher.style.display = "flex";
            collapse.setAttribute("aria-expanded", "false");
        };

        collapse.addEventListener("click", (event) => {
            event.stopPropagation();
            closePanel();
        });
        backdrop.addEventListener("click", closePanel);
        launcher.addEventListener("click", openPanel);
    }

    function bindLeaveRequestForm(body) {
        bindRequestApprover("leave");
        updateLeaveSummary();
        void loadLeaveRequestCredits();
        void loadLeaveRequestHistory();
        bindFloatingLeaveHistory();
        if (body.dataset.leaveBound === "1") {
            return;
        }
        body.dataset.leaveBound = "1";

        body.addEventListener("click", (event) => {
            const updateRequest = event.target.closest("[data-update-leave-request]");
            if (updateRequest) {
                const leaveId = updateRequest.dataset.updateLeaveRequest || "";
                closeLeaveRequestDetails();
                beginLeaveRequestEdit(leaveId);
                // Scroll to the approval-route section (not the purpose field) so the signatory
                // "Change" buttons land in view too — editing details and swapping the approver
                // are both things "Update Request" should make obvious, not just the purpose box.
                (document.getElementById("leave-approver-manual") || document.getElementById("leave-purpose"))
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }

            const editRequest = event.target.closest("[data-edit-leave-request]");
            if (editRequest) {
                beginLeaveRequestEdit(editRequest.dataset.editLeaveRequest);
                return;
            }

            const routeToggle = event.target.closest("[data-leave-toggle-route]");
            if (routeToggle) {
                const entry = routeToggle.closest(".leave-history-entry");
                const expanded = entry?.classList.toggle("is-expanded");
                routeToggle.setAttribute("aria-expanded", String(Boolean(expanded)));
                return;
            }

            if (event.target.closest("#leave-edit-cancel")) {
                resetLeaveEditMode(true);
                const message = document.getElementById("leave-form-message");
                if (message) {
                    message.classList.remove("is-error", "is-success");
                    message.textContent = "Edit cancelled. You can create a new leave request.";
                }
                return;
            }

            if (event.target.closest("[data-close-leave-request-details]") || event.target.id === "leave-request-detail-overlay") {
                closeLeaveRequestDetails();
                return;
            }

            const requestAction = event.target.closest("[data-leave-request-action]");
            if (requestAction) {
                const dateValue = requestAction.dataset.leaveRequestDate || "";
                if (requestAction.dataset.leaveRequestAction === "view") {
                    showLeaveRequestDetails(dateValue);
                } else if (requestAction.dataset.leaveRequestAction === "select") {
                    selectLeaveDate(dateValue);
                }
                return;
            }

            const calendarDate = event.target.closest("[data-leave-date]");
            if (calendarDate) {
                if (calendarDate.dataset.hasLeaveRequest === "1") {
                    calendarDate.focus({ preventScroll: true });
                    // Clicking anywhere on a day that already has a request opens its details
                    // (same as the hover-only "View" icon) — the request may span multiple days,
                    // and "Update Request" inside that popup loads + highlights the whole range.
                    showLeaveRequestDetails(calendarDate.dataset.leaveDate);
                    return;
                }
                selectLeaveDate(calendarDate.dataset.leaveDate);
                return;
            }

            const calendarNav = event.target.closest("[data-leave-calendar-nav]");
            if (calendarNav) {
                const pane = document.getElementById("leave-calendar-pane");
                const calendar = pane?.querySelector(".leave-calendar");
                if (pane && calendar) {
                    const year = Number(calendar.dataset.calendarYear || new Date().getFullYear());
                    const month = Number(calendar.dataset.calendarMonth || new Date().getMonth());
                    const direction = Number(calendarNav.dataset.leaveCalendarNav || 0);
                    const fromValue = document.getElementById("leave-from-date")?.value || "";
                    const toValue = document.getElementById("leave-to-date")?.value || "";
                    pane.innerHTML = renderLeaveCalendar(new Date(year, month + direction, 1), fromValue, toValue);
                    loadLeaveCalendarMarkers(new Date(year, month + direction, 1));
                }
                return;
            }

            if (event.target.closest("[data-leave-calendar-today]")) {
                const pane = document.getElementById("leave-calendar-pane");
                const fromValue = document.getElementById("leave-from-date")?.value || "";
                const toValue = document.getElementById("leave-to-date")?.value || "";
                if (pane) {
                    pane.innerHTML = renderLeaveCalendar(new Date(), fromValue, toValue);
                    loadLeaveCalendarMarkers(new Date());
                }
                return;
            }

            if (event.target.closest("#leave-from-button")) {
                const disclosure = document.getElementById("leave-calendar-disclosure");
                if (disclosure) disclosure.open = true;
                return;
            }

            if (event.target.closest("#leave-to-button")) {
                const disclosure = document.getElementById("leave-calendar-disclosure");
                if (disclosure) disclosure.open = true;
                return;
            }

            if (event.target.closest("#leave-submit")) {
                void submitLeaveRequest();
                return;
            }

        });

        body.addEventListener("input", (event) => {
            if (event.target && ["leave-search-input"].includes(event.target.id)) {
                updateLeaveSummary();
            }
        });

        body.addEventListener("change", (event) => {
            if (event.target?.id === "leave-selection") {
                syncLeaveSelection();
                if (document.getElementById("leave-duration")?.value === "Half Day" || document.getElementById("leave-duration")?.value === "Whole Day") {
                    const fromInput = document.getElementById("leave-from-date");
                    const toInput = document.getElementById("leave-to-date");
                    if (fromInput && toInput && fromInput.value) {
                        toInput.value = fromInput.value;
                    }
                }
                updateLeaveSummary();
                refreshLeaveCalendar();
            }
        });

        body.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && document.getElementById("leave-request-detail-overlay")) {
                closeLeaveRequestDetails();
            }
        });

        const calendar = document.querySelector("#leave-calendar-pane .leave-calendar");
        if (calendar) {
            loadLeaveCalendarMarkers(new Date(
                Number(calendar.dataset.calendarYear || new Date().getFullYear()),
                Number(calendar.dataset.calendarMonth || new Date().getMonth()),
                1
            ));
        }
    }

    function syncOvertimeAttachmentsPayload() {
        const hidden = document.getElementById("overtime-attachment-data");
        if (!hidden) {
            return;
        }
        const payload = {};
        Object.entries(overtimeAttachmentsByType).forEach(([typeKey, entry]) => {
            if (entry?.dataUrl) {
                payload[typeKey] = {
                    name: entry.name,
                    size: entry.size,
                    dataUrl: entry.dataUrl
                };
            }
        });
        hidden.value = Object.keys(payload).length ? JSON.stringify(payload) : "";
    }

    function refreshOvertimeListAttachmentMarks(scope = document) {
        scope.querySelectorAll(".overtime-list-item-wrap").forEach((wrap) => {
            const typeKey = wrap.dataset.overtimeType || "";
            const hasAttachment = Boolean(overtimeAttachmentsByType[typeKey]);
            wrap.classList.toggle("has-attachment", hasAttachment);
            const check = wrap.querySelector(".overtime-list-check");
            if (check) {
                check.setAttribute("aria-hidden", hasAttachment ? "false" : "true");
            }
        });
        syncOvertimeAttachmentsPayload();
    }

    async function handleOvertimeAttachmentUpload(file, typeKey) {
        const message = document.getElementById("overtime-form-message");
        const otType = String(typeKey || "").trim();
        if (!otType) {
            throw new Error("Pumili muna ng OT type.");
        }
        const blob = await compressOvertimeAttachment(file);
        const dataUrl = await blobToDataUrl(blob);
        const previous = overtimeAttachmentsByType[otType];
        if (previous?.previewUrl) {
            URL.revokeObjectURL(previous.previewUrl);
        }
        const previewUrl = URL.createObjectURL(blob);
        const baseName = String(file.name || "ot-attachment").replace(/\.[^.]+$/i, "");
        overtimeAttachmentsByType[otType] = {
            blob,
            dataUrl,
            previewUrl,
            name: `${baseName}.jpg`,
            size: blob.size
        };
        refreshOvertimeListAttachmentMarks();
        if (message) {
            message.textContent = `Na-upload ang file para sa ${otType}.`;
        }
    }

    async function submitOvertimeRequest() {
        const message = document.getElementById("overtime-form-message");
        const saveBtn = document.getElementById("overtime-submit");
        const dateValue = document.getElementById("overtime-date")?.value || "";
        const fromValue = document.getElementById("overtime-time-from")?.value || "";
        const toValue = document.getElementById("overtime-time-to")?.value || "";
        const hours = Number(document.getElementById("overtime-hours")?.value || "0");
        const task = (document.getElementById("overtime-purpose")?.value || "").trim();
        const resultValue = (document.getElementById("overtime-result")?.value || "").trim();
        const memorandumTo = (document.getElementById("overtime-memorandum-to")?.textContent || "").trim();
        const purpose = [
            memorandumTo ? `MEMORANDUM TO: ${memorandumTo}` : "",
            `TASK: ${task}`,
            resultValue ? `RESULT: ${resultValue}` : ""
        ].filter(Boolean).join("\n");
        const usercode = (employee.usercode || session.usercode || "").trim().toUpperCase();

        if (!message) {
            return;
        }
        if (!task) {
            message.textContent = "Ilagay muna ang task bago mag-save.";
            document.getElementById("overtime-purpose")?.focus();
            return;
        }
        const schedules = !overtimeEditingNumber && overtimeSelectedTimePresets.size
            ? Array.from(overtimeSelectedTimePresets.values())
            : [{ date_value: dateValue, time_from: fromValue, time_to: toValue, hours }];
        if (schedules.some((item) => !item.date_value || !item.time_from || !item.time_to)) {
            message.textContent = "Buksan muna ang schedule popup at i-confirm ang date at time.";
            setOvertimeScheduleModalOpen(true);
            document.getElementById("overtime-date")?.focus();
            return;
        }
        if (schedules.some((item) => Number(item.hours || 0) <= 0)) {
            message.textContent = "Maglagay ng valid na oras (Time To dapat mas huli sa Time From).";
            return;
        }

        const commonPayload = {
            ot_number: overtimeEditingNumber,
            usercode,
            area: document.getElementById("overtime-area")?.textContent?.trim() || "",
            department: document.getElementById("overtime-department")?.textContent?.trim() || "",
            attachment_type: document.getElementById("overtime-type")?.value || OVERTIME_DEFAULT_ATTACHMENT,
            purpose,
            attachments_json: document.getElementById("overtime-attachment-data")?.value || ""
        };

        if (saveBtn) {
            saveBtn.disabled = true;
        }
        message.textContent = overtimeEditingNumber
            ? "Updating overtime request..."
            : `Saving ${schedules.length} overtime request${schedules.length === 1 ? "" : "s"}...`;

        try {
            const action = overtimeEditingNumber ? "update" : "create";
            const saved = [];
            for (const schedule of schedules) {
                const payload = {
                    ...commonPayload,
                    date: schedule.date_value,
                    time_from: schedule.time_from,
                    time_to: schedule.time_to,
                    hours: Number(schedule.hours || 0)
                };
                const response = await fetch(`${OVERTIME_API}?action=${action}`, {
                    method: "POST",
                    credentials: "include",
                    headers: getOvertimeAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify(payload)
                });
                const result = await response.json().catch(() => ({
                    ok: false,
                    message: "Invalid overtime server response."
                }));
                if (!response.ok || !result.ok) {
                    const prefix = saved.length ? `${saved.length} request${saved.length === 1 ? " was" : "s were"} saved. ` : "";
                    throw new Error(prefix + (result.message || "Unable to save overtime request."));
                }
                saved.push(result);
                if (schedule.key) overtimeSelectedTimePresets.delete(schedule.key);
            }

            message.textContent = schedules.length > 1
                ? `${schedules.length} overtime requests saved with the same task.`
                : (saved[0]?.message || "Overtime request saved.");
            document.getElementById("overtime-purpose").value = "";
            const resultInput = document.getElementById("overtime-result");
            if (resultInput) resultInput.value = "";
            clearOvertimeAttachmentsStore();
            refreshOvertimeListAttachmentMarks();
            setOvertimeEditMode(null);
            updateOvertimeMultiSelectionUi();
            updateOvertimeScheduleSummary();
            notifyApprovalDeskRefresh("ot", {
                ot_number: saved[0]?.ot_number || "",
                count: saved.length
            });
            await loadOvertimeList(1, true);
            await loadOvertimeTimePresets(true);
            setOvertimeListOverlayOpen(true);
        } catch (error) {
            message.textContent = error?.message || "Unable to save overtime request.";
            renderOvertimeTimePresets(overtimeTimePresets);
            updateOvertimeMultiSelectionUi();
            updateOvertimeScheduleSummary();
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        }
    }

    async function removeOvertimeRequest(item, triggerButton = null) {
        // [FLOW] GABAY: Pending OT lang ang tinatanggal; kapag may approval na, server ang magba-block.
        const message = document.getElementById("overtime-form-message");
        const otNumber = String(item?.ot_number || "").trim();
        if (!otNumber) {
            return;
        }

        if (triggerButton) {
            triggerButton.disabled = true;
        }
        if (message) {
            message.textContent = `Removing ${otNumber}...`;
        }

        try {
            const response = await fetch(`${OVERTIME_API}?action=remove`, {
                method: "POST",
                credentials: "include",
                headers: getOvertimeAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ ot_number: otNumber })
            });
            const result = await response.json().catch(() => ({
                ok: false,
                message: "Invalid overtime server response."
            }));

            if (!response.ok || !result.ok) {
                throw new Error(result.message || "Unable to remove overtime request.");
            }

            if (overtimeEditingNumber === otNumber) {
                setOvertimeEditMode(null);
            }
            await loadOvertimeList(overtimeListPage, true);
            await loadOvertimeTimePresets(true);
            notifyApprovalDeskRefresh("ot", {
                ot_number: otNumber,
                action: "remove"
            });
            if (message) {
                message.textContent = result.message || "Overtime request removed.";
            }
        } catch (error) {
            if (message) {
                message.textContent = error?.message || "Unable to remove overtime request.";
            }
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
            }
        }
    }

    function bindOvertimeRequestForm(body) {
        if (body.dataset.overtimeBound === "1") {
            return;
        }
        body.dataset.overtimeBound = "1";

        body.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && document.getElementById("overtime-team-memo-overlay")?.classList.contains("is-open")) {
                setOvertimeTeamMemoOpen(false);
            }
        });

        body.addEventListener("input", (event) => {
            if (event.target?.id === "overtime-team-memo-search") {
                renderOvertimeMemoEmployees(event.target.value);
                return;
            }
            if (["overtime-date", "overtime-time-from", "overtime-time-to", "overtime-hours"].includes(event.target?.id)) {
                highlightOvertimeTimePreset("");
                syncOvertimeHours();
                updateOvertimeScheduleSummary();
                if (event.target.id === "overtime-date") {
                    overtimeDtrPresetPage = 1;
                    renderOvertimeTimePresets(overtimeTimePresets);
                }
            }
        });

        body.addEventListener("change", async (event) => {
            if (event.target?.id === "overtime-team-memo-area") {
                renderOvertimeMemoEmployees(document.getElementById("overtime-team-memo-search")?.value || "");
                return;
            }
            if (event.target?.id === "overtime-team-memo-department") {
                event.target.disabled = true;
                try {
                    await loadOvertimeMemoEmployees(event.target.value);
                } catch (error) {
                    const message = document.getElementById("overtime-team-memo-message");
                    if (message) message.textContent = error?.message || "Unable to load the selected department.";
                } finally {
                    event.target.disabled = false;
                }
                return;
            }
            if (event.target?.id === "overtime-date") {
                await loadOvertimeTimePresets(true);
                return;
            }
            if (!event.target?.classList?.contains("overtime-type-file-input")) {
                return;
            }
            const file = event.target.files?.[0];
            const wrap = event.target.closest(".overtime-list-item-wrap");
            const typeKey = wrap?.dataset?.overtimeType || "";
            if (!file) {
                return;
            }
            try {
                await handleOvertimeAttachmentUpload(file, typeKey);
            } catch (error) {
                const message = document.getElementById("overtime-form-message");
                if (message) {
                    message.textContent = error?.message || "Hindi ma-upload ang larawan.";
                }
                event.target.value = "";
            }
        });

        body.addEventListener("click", (event) => {
            if (event.target.closest("#overtime-team-memo-open")) {
                event.preventDefault();
                void openOvertimeTeamMemo();
                return;
            }

            if (event.target.closest("#overtime-team-memo-close") || event.target.closest("#overtime-team-memo-backdrop")) {
                event.preventDefault();
                setOvertimeTeamMemoOpen(false);
                return;
            }

            const memoEmployee = event.target.closest("[data-memo-employee-code]");
            if (memoEmployee) {
                event.preventDefault();
                const code = String(memoEmployee.dataset.memoEmployeeCode || "").trim().toUpperCase();
                if (overtimeMemoSelectedCodes.has(code)) overtimeMemoSelectedCodes.delete(code);
                else overtimeMemoSelectedCodes.add(code);
                renderOvertimeMemoEmployees(document.getElementById("overtime-team-memo-search")?.value || "");
                return;
            }

            if (event.target.closest("#overtime-team-memo-select-all")) {
                event.preventDefault();
                const allSelected = overtimeMemoVisibleCodes.length > 0 && overtimeMemoVisibleCodes.every((code) => overtimeMemoSelectedCodes.has(code));
                overtimeMemoVisibleCodes.forEach((code) => {
                    if (allSelected) overtimeMemoSelectedCodes.delete(code);
                    else overtimeMemoSelectedCodes.add(code);
                });
                renderOvertimeMemoEmployees(document.getElementById("overtime-team-memo-search")?.value || "");
                return;
            }

            if (event.target.closest("#overtime-team-memo-save")) {
                event.preventDefault();
                void submitOvertimeTeamMemo();
                return;
            }

            const scheduleOpenBtn = event.target.closest("#overtime-open-schedule");
            if (scheduleOpenBtn) {
                // [EVENT] GABAY: Naka-modal ang date/oras para ma-confirm bago mag-save ng OT.
                event.preventDefault();
                setOvertimeScheduleModalOpen(true);
                updateOvertimeScheduleSummary();
                return;
            }

            if (event.target.closest("#overtime-close-schedule") || event.target.closest("#overtime-schedule-backdrop")) {
                // [EVENT] GABAY: Sarado ang schedule popup kapag tapos na mag-check ng time at date.
                event.preventDefault();
                setOvertimeScheduleModalOpen(false);
                return;
            }

            const multiSelect = event.target.closest("[data-ot-multi-select]");
            if (multiSelect) {
                event.preventDefault();
                event.stopPropagation();
                toggleOvertimeMultiPreset(multiSelect.closest(".overtime-time-preset-btn"));
                return;
            }

            const presetBtn = event.target.closest(".overtime-time-preset-btn");
            if (presetBtn) {
                applyOvertimeTimePreset({
                    date_value: presetBtn.dataset.dateValue || "",
                    time_from: presetBtn.dataset.timeFrom || "",
                    time_to: presetBtn.dataset.timeTo || "",
                    hours: Number(presetBtn.dataset.hours || 0),
                    time_label: presetBtn.querySelector(".overtime-time-preset-label")?.textContent || ""
                });
                return;
            }

            if (event.target.closest(".overtime-list-upload")) {
                return;
            }

            const typeButton = event.target.closest(".overtime-list-item");
            if (typeButton) {
                const wrap = typeButton.closest(".overtime-list-item-wrap");
                if (!wrap) {
                    return;
                }
                const typeInput = document.getElementById("overtime-type");
                const selectedType = wrap.dataset.overtimeType || OVERTIME_DEFAULT_ATTACHMENT;
                if (typeInput) {
                    typeInput.value = selectedType;
                }
                body.querySelectorAll(".overtime-list-item-wrap").forEach((node) => {
                    const isActive = node === wrap;
                    node.classList.toggle("active", isActive);
                    const button = node.querySelector(".overtime-list-item");
                    if (button) {
                        button.setAttribute("aria-pressed", isActive ? "true" : "false");
                    }
                });
                return;
            }

            if (event.target.closest("#overtime-submit")) {
                void submitOvertimeRequest();
            }
        });

        refreshOvertimeListAttachmentMarks(body);
        syncOvertimeHours();
        setOvertimeScheduleModalOpen(false);
        updateOvertimeScheduleSummary();
        bindOvertimeListOverlay(body);
        bindOvertimeListPager(body);
        bindOvertimeListCardCollapse(body);
    }

    function showEpassDetail(item) {
        const target = document.getElementById("epass-detail-panel");
        if (!target) {
            return;
        }

        if (!item) {
            target.innerHTML = `
                <div class="epass-detail-empty">
                    <i class="fa fa-hand-pointer-o"></i>
                    <span>Select an EPASS request to view details.</span>
                </div>
            `;
            return;
        }

        const people = Array.isArray(item.granted_to) && item.granted_to.length ? item.granted_to : ["No names listed"];
        target.innerHTML = `
            <div class="epass-detail-card">
                <div class="epass-detail-top">
                    <span class="form-chip ${epassStatusClass(item.status)}">${escapeHtml(item.status_label || "Pending")}</span>
                    <strong>${escapeHtml(item.epassnumber || "-")}</strong>
                </div>
                <div class="form-detail-list">
                    ${renderDetailRows([
                        { label: "Date", value: item.date },
                        { label: "Department", value: item.department },
                        { label: "Destination", value: item.destination },
                        { label: "Purpose", value: item.purpose },
                        { label: "Approved By", value: item.approver_name || item.approved_by || "-" }
                    ])}
                </div>
                <div class="epass-detail-people">
                    <span><i class="fa fa-users"></i> Included</span>
                    ${people.map((name) => `<div>${escapeHtml(name)}</div>`).join("")}
                </div>
            </div>
        `;
    }

    function clearEpassForm() {
        const destination = document.getElementById("epass-destination");
        const purpose = document.getElementById("epass-purpose");
        const search = document.getElementById("epass-search-input");
        if (destination) destination.value = "";
        if (purpose) purpose.value = "";
        if (search) search.value = "";
        setRequestApproverSelection("epass", {});
        renderEpassSearchResults([]);
        syncEpassRequestSummary();
    }

    async function startNewEpassOrTravelRequest(formKey) {
        const isEpass = formKey === "epass";
        const prefix = isEpass ? "epass" : "travel";
        const today = todayInputValue();
        const destination = document.getElementById(`${prefix}-destination`);
        const purpose = document.getElementById(`${prefix}-purpose`);
        const search = document.getElementById(`${prefix}-search-input`);
        const date = document.getElementById(`${prefix}-date`);
        const dateLabel = document.getElementById(`${prefix}-date-label`);
        const submit = document.getElementById(`${prefix}-submit`);
        const newRequest = document.getElementById(`${prefix}-new-request`);
        const message = document.getElementById(`${prefix}-form-message`);

        if (isEpass) {
            epassEditingNumber = "";
            requestNumberPreviewState.epass = "";
            epassPeople = [];
            setFuelSelectionSuppressed("epass", false);
            ensureDefaultEpassPeople();
            savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
            renderEpassPeople();
            syncEpassRequestSummary();
            document.querySelectorAll("[data-epass-list-index].is-selected").forEach((row) => row.classList.remove("is-selected"));
        } else {
            travelEditingNumber = "";
            travelPeople = [];
            travelDates = [today];
            setFuelSelectionSuppressed("travel", false);
            savePeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY, travelPeople);
            renderTravelPeople();
            renderTravelDates();
            syncTravelEmployeeDirectorySelectionState();
            document.querySelectorAll("[data-travel-list-index].active").forEach((row) => row.classList.remove("active"));
        }

        if (destination) destination.value = "Catbalogan Field Office";
        if (purpose) purpose.value = "Site inspection and submission of office records.";
        if (search) search.value = "";
        if (isEpass) {
            if (date) date.value = today;
            if (dateLabel) dateLabel.textContent = displayDate(today);
            calendarView.epass = null;
            renderEpassDateSummary();
            renderCalendar("epass");
        } else {
            calendarView.travel = null;
            renderCalendar("travel");
        }
        if (submit) submit.textContent = "SAVE";
        if (newRequest) newRequest.hidden = true;
        if (message) message.textContent = `${employee.area || session.area || "Main Office"} origin | ready to save`;
        setRequestApproverSelection(formKey, {});

        applyPrefillFromFuelContext(formKey);
        if (isEpass) {
            renderEpassSearchResults([]);
            await loadRequestNumberPreview("epass");
        }
        search?.focus();
    }

    function renderEpassLatestDetails(item) {
        if (!item) {
            return '<div class="form-empty-state">No EPASS request found for this employee.</div>';
        }

        const grantedTo = Array.isArray(item.granted_to) && item.granted_to.length
            ? item.granted_to
            : [item.requester_name || item.usercode || "Employee"];
        const approver = item.approver_name
            ? `${item.approver_name} (${item.approved_by || "-"})`
            : (item.approved_by || "-");

        return `
            <div class="form-modal-grid epass-latest-grid">
                <section class="form-detail-card">
                    <h3>Request Header</h3>
                    <div class="form-detail-list">
                        ${renderDetailRows([
                            { label: "EPASS Number", value: item.epassnumber },
                            { label: "Date", value: item.date },
                            { label: "Department", value: item.department },
                            { label: "Destination", value: item.destination }
                        ])}
                    </div>
                </section>
                <section class="form-detail-card">
                    <h3>Approval Details</h3>
                    <div class="form-detail-list">
                        ${renderDetailRows([
                            { label: "Requested By", value: `${item.requester_name || "Employee"} (${item.usercode || "-"})` },
                            { label: "Approved By", value: approver },
                            { label: "Approval Status", value: item.status_label },
                            { label: "Raw Status", value: item.status }
                        ])}
                    </div>
                </section>
                <section class="form-detail-card wide">
                    <h3>Granted To</h3>
                    <div class="names-stack">
                        ${grantedTo.map((name) => `<div class="name-pill">${escapeHtml(name)}</div>`).join("")}
                    </div>
                </section>
                <section class="form-detail-card wide">
                    <h3>Purpose</h3>
                    <div class="form-detail-list">
                        ${renderDetailRows([{ label: "Purpose", value: item.purpose }])}
                    </div>
                    <div class="form-chip-row">
                        <span class="form-chip ${epassStatusClass(item.status)}">${escapeHtml(item.status_label || "Pending")}</span>
                    </div>
                </section>
            </div>
        `;
    }

    function renderEpassDetails(item) {
        if (!item) {
            return `
                <section class="form-detail-card wide">
                    <h3>EPASS</h3>
                    <div class="form-empty-state">No EPASS request found for this employee.</div>
                </section>
            `;
        }

        const grantedTo = Array.isArray(item.granted_to) && item.granted_to.length
            ? item.granted_to
            : [item.requester_name || item.usercode || "Employee"];
        const approver = item.approver_name
            ? `${item.approver_name} (${item.approved_by || "-"})`
            : (item.approved_by || "-");

        return `
            <div class="form-modal-grid">
                <section class="form-detail-card">
                    <h3>Request Header</h3>
                    <div class="form-detail-list">
                        ${renderDetailRows([
                            { label: "EPASS Number", value: item.epassnumber },
                            { label: "Date", value: item.date },
                            { label: "Department", value: item.department },
                            { label: "Destination", value: item.destination }
                        ])}
                    </div>
                </section>
                <section class="form-detail-card">
                    <h3>Approval Details</h3>
                    <div class="form-detail-list">
                        ${renderDetailRows([
                            { label: "Requested By", value: `${item.requester_name || "Employee"} (${item.usercode || "-"})` },
                            { label: "Approved By", value: approver },
                            { label: "Approval Status", value: item.status_label },
                            { label: "Raw Status", value: item.status }
                        ])}
                    </div>
                </section>
                <section class="form-detail-card wide">
                    <h3>Granted To</h3>
                    <div class="names-stack">
                        ${grantedTo.map((name) => `<div class="name-pill">${escapeHtml(name)}</div>`).join("")}
                    </div>
                </section>
                <section class="form-detail-card wide">
                    <h3>Purpose</h3>
                    <div class="form-detail-list">
                        ${renderDetailRows([
                            { label: "Purpose", value: item.purpose }
                        ])}
                    </div>
                    <div class="form-chip-row">
                        <span class="form-chip ${epassStatusClass(item.status)}">${escapeHtml(item.status_label || "Pending")}</span>
                        ${item.approved_by ? `<span class="form-chip">Approved code: ${escapeHtml(item.approved_by)}</span>` : ""}
                    </div>
                </section>
            </div>
        `;
    }

    async function loadEpassDetails(body) {
        const usercode = (employee.usercode || session.usercode || "").trim().toUpperCase();
        const target = document.getElementById("epass-detail-panel");
        if (!usercode) {
            if (target) {
                target.innerHTML = renderEpassDetails(null);
            }
            return;
        }

        if (target) {
            target.innerHTML = '<div class="form-empty-state">Loading latest request...</div>';
        }

        try {
            const params = new URLSearchParams({ action: "latest", usercode });
            const response = await fetch(`${EPASS_API}?${params.toString()}`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({
                ok: false,
                message: "Invalid EPASS server response."
            }));

            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load EPASS request.");
            }

            if (target) {
                target.innerHTML = renderEpassDetails(payload.item || null);
            }
        } catch (error) {
            console.error(error);
            if (target) {
                target.innerHTML = '<div class="form-empty-state">Unable to load latest EPASS request.</div>';
            }
        }
    }

    async function loadEpassList() {
        const target = document.getElementById("epass-list-body");
        const profile = await getCurrentSessionProfile();
        const candidateIds = getEpassHistoryIdentifiers(profile);
        const cacheKey = candidateIds[0] || "";
        if (!target || !cacheKey) {
            if (target) {
                target.innerHTML = `
                    <div class="epass-list-empty">
                        <i class="fa fa-id-card-o"></i>
                        <span>No EPASS requests yet.</span>
                    </div>
                `;
            }
            return;
        }

        target.innerHTML = '<div class="epass-list-empty">Loading EPASS list...</div>';
        const cacheName = "employees_profile_epass_list";
        const cached = getCachedValue(cacheName, cacheKey, 6 * 60 * 60 * 1000);
        if (cached) {
            renderEpassList(cached);
        }

        const extractItems = (payload = {}) => payload.items || payload.records || payload.rows || payload.data || (payload.item ? [payload.item] : []) || [];
        const loadFromEndpoint = async (identifier) => {
            const params = new URLSearchParams({
                action: "list",
                usercode: identifier,
                bioUID: identifier,
                user_id: identifier,
                employee_id: identifier
            });
            return fetchJsonWithSessionRetry(
                `${EPASS_API}?${params.toString()}`,
                {
                    cache: "no-store",
                    credentials: "include",
                    headers: getAuthHeaders()
                },
                "Invalid EPASS server response."
            );
        };

        let lastError = null;
        for (const identifier of candidateIds) {
            try {
                const result = await loadFromEndpoint(identifier);
                const items = extractItems(result.payload);
                if (!items.length && (!result.response.ok || !result.payload.ok)) {
                    lastError = new Error(result.payload.message || "Unable to load EPASS list.");
                    continue;
                }
                if (!items.length) {
                    lastError = new Error("No EPASS requests found for this employee.");
                    continue;
                }

                setCachedValue(cacheName, cacheKey, items);
                renderEpassList(items);
                showEpassDetail(items[0] || null);
                return;
            } catch (error) {
                lastError = error;
            }
        }

        if (cached && cached.length) {
            renderEpassList(cached);
            showEpassDetail(cached[0] || null);
            return;
        }

        if (target) {
            target.innerHTML = `
                <div class="epass-list-empty">
                    <i class="fa fa-id-card-o"></i>
                    <span>${escapeHtml(lastError?.message || "No EPASS requests yet.")}</span>
                </div>
            `;
        }
    }

    // EDIT GUIDE: Dito kumukuha ng preview number ang modal bago mag-save ang user.
    async function loadRequestNumberPreview(formKey) {
        const key = String(formKey || "").trim();
        if (key !== "epass") {
            return;
        }
        const badge = document.querySelector('[data-request-number-badge="epass"]');
        const target = document.getElementById("epass-request-number");
        if (!badge || !target) {
            return;
        }

        badge.dataset.state = "loading";
        target.textContent = "-";

        try {
            const response = await fetch(`${EPASS_API}?action=next_number`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({
                ok: false,
                message: "Invalid request number response."
            }));
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load request number.");
            }
            const value = String(payload.epassnumber || "");
            requestNumberPreviewState.epass = value;
            target.textContent = value || "-";
            badge.dataset.state = value ? "ready" : "empty";
            badge.classList.remove("is-fresh");
            void badge.offsetWidth;
            badge.classList.add("is-fresh");
            syncEpassRequestSummary();
            window.setTimeout(() => badge.classList.remove("is-fresh"), 1200);
        } catch (error) {
            requestNumberPreviewState.epass = "";
            target.textContent = "-";
            badge.dataset.state = "error";
            console.error(error);
        }
    }

    function requestApproverDefaultKey(formKey) {
        const owner = String(employee.usercode || session.usercode || session.accountnumber || "account").trim().toUpperCase();
        return `samelcii_default_${formKey}_approver_${owner}`;
    }

    function readRequestApproverDefault(formKey) {
        try {
            const person = JSON.parse(localStorage.getItem(requestApproverDefaultKey(formKey)) || "null");
            return person && person.usercode ? person : null;
        } catch (_error) {
            return null;
        }
    }

    function writeRequestApproverDefault(formKey, person = null) {
        const key = requestApproverDefaultKey(formKey);
        if (!person?.usercode) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify({
            usercode: String(person.usercode || "").trim(),
            name: String(person.name || person.usercode || "").trim(),
            position: String(person.position || "").trim(),
            department: String(person.department || "Eligible approver").trim(),
            area: String(person.area || "").trim(),
            profile_photo_url: String(person.profile_photo_url || "").trim()
        }));
    }

    function currentRequestApproverDepartment(formKey) {
        const ids = formKey === "epass"
            ? ["epass-department"]
            : (formKey === "travel" ? ["travel-department-select", "travel-department"] : []);
        for (const id of ids) {
            const value = String(document.getElementById(id)?.value || "").trim();
            if (value) return value;
        }
        return String(employee.department || session.department || "").trim();
    }

    function normalizeRequestApproverDepartment(value) {
        const department = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
        const aliases = [
            ["OGM", /\bOGM\b|OFFICE OF THE GENERAL MANAGER/],
            ["CPD", /\b(CPD|CORPLAN)\b|CORPORATE PLANN/],
            ["FSD", /\bFSD\b|FINANCE SERVICES/],
            ["ISD", /\bISD\b|INSTITUTIONAL SERVICES/],
            ["TSD", /\bTSD\b|TECHNICAL SERVICES/],
            ["IAD", /\bIAD\b|INTERNAL AUDIT/],
            ["HRAD", /\bHRAD\b|HUMAN RESOURCE/],
            ["ESD", /\bESD\b|ENGINEERING SERVICES/],
            ["ADMIN", /\bADMIN\b|ADMINISTRATIVE DEPARTMENT/],
            ["BILLING", /\bBILLING\b/],
            ["ITS", /\bITS\b/],
            ["IT", /\bIT\b|INFORMATION TECHNOLOGY/]
        ];
        return aliases.find(([, pattern]) => pattern.test(department))?.[0] || department;
    }

    function requestApproverDepartmentMatches(formKey, person) {
        const expected = normalizeRequestApproverDepartment(currentRequestApproverDepartment(formKey));
        const actual = normalizeRequestApproverDepartment(person?.department);
        return Boolean(expected && actual && expected === actual);
    }

    function isDepartmentHeadApprover(person) {
        const position = String(person?.position || "").trim().toUpperCase();
        if (!position || /\b(ASSISTANT|ASST|DEPUTY)\b/.test(position)) return false;
        return /(DEPARTMENT\s+(HEAD|MANAGER)|DIVISION\s+HEAD|GENERAL\s+MANAGER)/.test(position)
            || /(^|[^A-Z])(HEAD|MANAGER)([^A-Z]|$)/.test(position);
    }

    function isGeneralManagerApprover(person) {
        return /\bGENERAL\s+MANAGER\b/.test(String(person?.position || "").trim().toUpperCase());
    }

    // [FEATURE] Same admin-only gate the Leave module already uses for its General Manager
    // stage (leaveApprovalCanChangeGeneralManager) — only privilege-10 users can reassign who
    // stands in as GM for a Travel request. The server enforces this too (routes/travel.js).
    function canChangeTravelGeneralManager() {
        return String(session.privilage || employee.privilage || "")
            .split(/[^0-9]+/)
            .filter(Boolean)
            .includes("10");
    }

    function renderTravelApprovalRoute(departmentHead = null, context = "manual") {
        const target = document.getElementById("travel-approver-selected");
        if (!target) return;
        const generalManager = requestApproverState.travel?.generalManager || null;
        // [FEATURE] GM is changeable only for privilege-10 users (canChangeTravelGeneralManager) —
        // everyone else keeps seeing the automatically-resolved GM, same as before.
        const gmChangeable = canChangeTravelGeneralManager();
        const people = [
            { person: departmentHead, label: "Department Head", changeable: true, stage: "department_head" },
            { person: generalManager, label: "General Manager", changeable: gmChangeable, stage: "general_manager" }
        ];
        target.hidden = false;
        target.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
            ${people.map(({ person, label, changeable, stage }, index) => `
                <div class="request-approver-selected-card${changeable ? " is-changeable" : ""}" data-change-travel-stage="${changeable ? stage : ""}" style="min-width:0;${changeable ? "cursor:pointer;" : ""}"${changeable ? ` title="Click to choose ${escapeHtml(label)}"` : ' title="General Manager is assigned automatically"'}>
                    <span style="position:relative;">
                        ${person ? renderEmployeeAvatar(person, "request-approver-avatar") : `<span class="request-approver-avatar" style="display:grid;place-items:center;background:#edf2f8;color:#7d8798;">${index + 1}</span>`}
                        <b style="position:absolute;right:-4px;bottom:-3px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#1769d2;color:#fff;font-size:10px;">${index + 1}</b>
                    </span>
                    <span class="request-approver-copy">
                        <strong>${escapeHtml(person?.name || (index === 0 && context === "auto" ? "Finding Department Head..." : "Not configured"))}</strong>
                        <span>${escapeHtml(label)}${person?.position ? ` &middot; ${escapeHtml(person.position)}` : ""}</span>
                    </span>
                </div>`).join("")}
        </div>`;
    }

    function renderSelectedRequestApprover(formKey, person = null, context = "manual") {
        if (formKey === "travel") {
            renderTravelApprovalRoute(person, context);
            return;
        }
        const target = document.getElementById(`${formKey}-approver-selected`);
        if (!target) return;
        if (!person?.usercode) {
            target.hidden = context === "manual";
            if (target.hidden) {
                target.innerHTML = "";
                return;
            }
            target.innerHTML = `<div class="request-approver-selected-empty">${escapeHtml(context === "auto" ? "Finding the automatic approver..." : "Search and select an approver to see the profile here.")}</div>`;
            return;
        }
        target.hidden = false;
        const savedDefault = readRequestApproverDefault(formKey);
        const isDefault = String(savedDefault?.usercode || "").toUpperCase() === String(person.usercode || "").toUpperCase();
        const isSingleLeavePicker = formKey === "leave";
        const label = isSingleLeavePicker ? (isDefault ? "Default approver" : "Current approver") : (isDefault ? "Default approver" : (context === "auto" ? "Automatic approver" : "Selected approver"));
        const action = isDefault
            ? `<button class="request-approver-default-btn" type="button" data-clear-request-approver-default>Clear default</button>`
            : `<button class="request-approver-default-btn" type="button" data-set-request-approver-default="${escapeHtml(person.usercode)}">Set as default</button>`;
        // ponytail: epass card is always click-to-change (like leave/travel already were) — the
        // auto-assigned approver used to be inert until the mode dropdown was flipped manually.
        const isChangeable = context === "manual" || isSingleLeavePicker || formKey === "epass";
        target.innerHTML = `
            <div class="request-approver-selected-card${isDefault ? " is-default" : ""}${isChangeable ? " is-changeable" : ""}"${isChangeable ? ' title="Click to choose approver"' : ""}>
                ${renderEmployeeAvatar(person, "request-approver-avatar")}
                <span class="request-approver-copy">
                    <strong>${escapeHtml(person.name || person.usercode)}</strong>
                    <span>${escapeHtml(person.usercode)}${person.position ? ` &middot; ${escapeHtml(person.position)}` : ""}${person.department ? ` &middot; ${escapeHtml(person.department)}` : ""}${person.area ? ` &middot; ${escapeHtml(person.area)}` : ""}</span>
                </span>
                <span class="request-approver-selected-actions">
                    <span class="request-approver-selected-badge">${escapeHtml(label)}</span>
                    ${action}
                </span>
            </div>`;
    }

    function renderLeaveApprovalRoute(approvers = [], missingStages = []) {
        const target = document.getElementById("leave-approver-selected");
        if (!target) return;
        const byStage = new Map((Array.isArray(approvers) ? approvers : []).map((person) => [String(person.stage || ""), person]));
        const missing = new Set(Array.isArray(missingStages) ? missingStages : []);
        const stages = [
            ["department_head", "Department Head"],
            ["administrative_chief", "OIC - Administrative Chief"],
            ["general_manager", "General Manager"]
        ];
        target.hidden = false;
        target.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
                ${stages.map(([stage, label], index) => {
                    const person = byStage.get(stage) || null;
                    const canChange = stage !== "general_manager" || leaveApprovalCanChangeGeneralManager;
                    if (!person) {
                        return `
                            <div class="request-approver-selected-card${canChange ? " is-changeable" : ""}" data-change-leave-stage="${canChange ? escapeHtml(stage) : ""}" style="min-width:0;border-color:#efb3b3;background:#fff7f7;${canChange ? "cursor:pointer;" : ""}">
                                <span style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#b42318;color:#fff;font-weight:900;">${index + 1}</span>
                                <span class="request-approver-copy">
                                    <strong>${escapeHtml(label)}</strong>
                                    <span>${escapeHtml(missing.has(label) ? "Not configured" : "Approver unavailable")}</span>
                                </span>
                                <small style="font-weight:800;color:${canChange ? "#1769d2" : "#7d8798"};">${canChange ? "Change" : "Admin only"}</small>
                            </div>`;
                    }
                    return `
                        <div class="request-approver-selected-card${canChange ? " is-changeable" : ""}" data-change-leave-stage="${canChange ? escapeHtml(stage) : ""}" style="min-width:0;${canChange ? "cursor:pointer;" : ""}"${canChange ? ` title="Change ${escapeHtml(label)} signatory"` : ' title="Only administrators can change the General Manager signatory"'}>
                            <span style="position:relative;">
                                ${renderEmployeeAvatar(person, "request-approver-avatar")}
                                <b style="position:absolute;right:-4px;bottom:-3px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#1769d2;color:#fff;font-size:10px;">${index + 1}</b>
                            </span>
                            <span class="request-approver-copy">
                                <strong>${escapeHtml(person.name || person.usercode || label)}</strong>
                                <span>${escapeHtml(label)}${person.position ? ` - ${escapeHtml(person.position)}` : ""}</span>
                            </span>
                            <small style="font-weight:800;color:${canChange ? "#1769d2" : "#7d8798"};">${canChange ? "Change" : "Admin only"}</small>
                        </div>`;
                }).join("")}
            </div>`;
    }

    async function loadLeaveApprovalRoute() {
        leaveApprovalRouteReady = false;
        leaveApprovalRouteMessage = "Loading the three-stage Leave approval route...";
        leaveApprovalRoutePeople = [];
        leaveApprovalRouteOverrides = {};
        leaveApprovalCanChangeGeneralManager = false;
        renderLeaveApprovalRoute();
        updateLeaveSummary();
        try {
            const response = await fetch(`${LEAVE_API}?action=approver`, {
                cache: "no-store",
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false }));
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load the Leave approval route.");
            }
            const missing = Array.isArray(payload.missing_stages) ? payload.missing_stages : [];
            leaveApprovalRoutePeople = Array.isArray(payload.approvers) ? payload.approvers : [];
            leaveApprovalCanChangeGeneralManager = payload.can_change_general_manager === true;
            leaveApprovalRouteReady = payload.route_ready === true && missing.length === 0;
            leaveApprovalRouteMessage = leaveApprovalRouteReady
                ? "Approval route ready: Department Head -> OIC - Administrative Chief -> General Manager."
                : `Complete the Leave approval route first. Missing: ${missing.join(", ") || "required signatories"}.`;
            renderLeaveApprovalRoute(leaveApprovalRoutePeople, missing);
        } catch (error) {
            leaveApprovalRouteReady = false;
            leaveApprovalRouteMessage = error.message || "Unable to load the Leave approval route.";
            renderLeaveApprovalRoute();
        }
        updateLeaveSummary();
    }

    function leaveApprovalStageLabel(stage) {
        return {
            department_head: "Department Head",
            administrative_chief: "OIC - Administrative Chief",
            general_manager: "General Manager"
        }[stage] || "Leave approver";
    }

    async function loadLeaveRouteCandidates(query = "") {
        const results = document.getElementById("leave-route-results");
        if (!results || !leaveApprovalEditingStage) return;
        results.innerHTML = "<small>Loading eligible approvers...</small>";
        const params = new URLSearchParams({
            action: "approver_options",
            q: String(query || "").trim(),
            limit: "30"
        });
        try {
            const response = await fetch(`${LEAVE_API}?${params.toString()}`, {
                cache: "no-store",
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false, items: [] }));
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load eligible approvers.");
            }
            requestApproverState.leave.people.clear();
            const people = (Array.isArray(payload.items) ? payload.items : []).filter((person) => {
                const code = String(person.usercode || "").trim();
                if (code) requestApproverState.leave.people.set(code.toUpperCase(), person);
                return Boolean(code);
            });
            results.innerHTML = people.length ? people.map((person) => `
                <button type="button" class="request-approver-result" data-leave-route-code="${escapeHtml(person.usercode || "")}" style="width:100%;">
                    ${renderEmployeeAvatar(person, "request-approver-avatar")}
                    <span class="request-approver-copy">
                        <strong>${escapeHtml(person.name || person.usercode || "Approver")}</strong>
                        <span>${escapeHtml(person.usercode || "")}${person.position ? ` - ${escapeHtml(person.position)}` : ""}</span>
                    </span>
                </button>`).join("") : "<small>No eligible approvers found.</small>";
        } catch (error) {
            results.innerHTML = `<small>${escapeHtml(error.message || "Unable to load eligible approvers.")}</small>`;
        }
    }

    function bindLeaveApprovalRouteEditor() {
        const route = document.getElementById("leave-approver-selected");
        const editor = document.getElementById("leave-route-editor");
        const search = document.getElementById("leave-route-search");
        const results = document.getElementById("leave-route-results");
        if (!route || !editor || !search || !results || editor.dataset.bound === "1") return;
        editor.dataset.bound = "1";
        let searchTimer = null;
        route.addEventListener("click", (event) => {
            const card = event.target.closest("[data-change-leave-stage]");
            const stage = String(card?.dataset.changeLeaveStage || "");
            if (!stage || (stage === "general_manager" && !leaveApprovalCanChangeGeneralManager)) return;
            leaveApprovalEditingStage = stage;
            const label = document.getElementById("leave-route-editor-label");
            if (label) label.textContent = `Change ${leaveApprovalStageLabel(stage)} signatory`;
            editor.hidden = false;
            search.value = "";
            search.focus();
            void loadLeaveRouteCandidates("");
        });
        search.addEventListener("input", () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => void loadLeaveRouteCandidates(search.value), 220);
        });
        results.addEventListener("click", (event) => {
            const option = event.target.closest("[data-leave-route-code]");
            const code = String(option?.dataset.leaveRouteCode || "").toUpperCase();
            const person = requestApproverState.leave.people.get(code);
            const stage = leaveApprovalEditingStage;
            if (!person || !stage || (stage === "general_manager" && !leaveApprovalCanChangeGeneralManager)) return;
            const selected = { ...person, stage, stage_label: leaveApprovalStageLabel(stage) };
            leaveApprovalRoutePeople = leaveApprovalRoutePeople.filter((item) => String(item.stage || "") !== stage);
            leaveApprovalRoutePeople.push(selected);
            leaveApprovalRouteOverrides[stage] = String(person.usercode || "").trim();
            leaveApprovalRouteReady = ["department_head", "administrative_chief", "general_manager"]
                .every((requiredStage) => leaveApprovalRoutePeople.some((item) => item.stage === requiredStage));
            leaveApprovalRouteMessage = leaveApprovalRouteReady
                ? "Approval route ready: Department Head -> OIC - Administrative Chief -> General Manager."
                : "Choose all required Leave signatories.";
            editor.hidden = true;
            leaveApprovalEditingStage = "";
            renderLeaveApprovalRoute(leaveApprovalRoutePeople);
            updateLeaveSummary();
        });
        document.addEventListener("click", (event) => {
            if (editor.hidden) return;
            if (event.target.closest("#leave-route-editor") || event.target.closest("[data-change-leave-stage]")) return;
            editor.hidden = true;
            leaveApprovalEditingStage = "";
        });
    }

    async function loadAutomaticRequestApprover(formKey) {
        const state = requestApproverState[formKey];
        const usercode = document.getElementById(`${formKey}-approver-usercode`);
        if (!state || !usercode) return;
        const savedDefault = readRequestApproverDefault(formKey);
        if (savedDefault && formKey !== "travel") {
            state.autoPerson = savedDefault;
            usercode.value = savedDefault.usercode;
            renderSelectedRequestApprover(formKey, savedDefault, "default");
            return;
        }
        usercode.value = "";
        renderSelectedRequestApprover(formKey, null, "auto");
        try {
            const people = await loadRequestApprovers(formKey, "", false);
            // [FIX] Don't clobber a manually-picked GM (canChangeTravelGeneralManager) every time
            // this re-runs (e.g. the department dropdown changes) — only auto-resolve when no
            // manual pick is in effect yet.
            if (formKey === "travel" && !state.generalManagerIsManual) {
                state.generalManager = people.find(isGeneralManagerApprover) || null;
            }
            const person = savedDefault || people.find((item) => requestApproverDepartmentMatches(formKey, item) && isDepartmentHeadApprover(item) && !isGeneralManagerApprover(item))
                || people.find((item) => requestApproverDepartmentMatches(formKey, item) && !isGeneralManagerApprover(item))
                || people.find((item) => isDepartmentHeadApprover(item) && !isGeneralManagerApprover(item))
                || people[0]
                || null;
            state.autoPerson = person || null;
            // [FIX] The early-return above skips Travel so its General Manager can still be
            // auto-resolved from `people` below — but that left this hidden field stuck at "" even
            // when `person` resolved to a saved default, so the save-time DOM read (non-"auto"
            // callers) saw no approver at all. Keep it in sync with what's actually displayed.
            if (person?.usercode) usercode.value = String(person.usercode);
            renderSelectedRequestApprover(formKey, person, "auto");
        } catch (_error) {
            state.autoPerson = null;
            renderSelectedRequestApprover(formKey, null, "manual");
        }
    }

    function syncRequestApproverMode(formKey) {
        const manual = document.getElementById(`${formKey}-approver-mode`)?.value === "manual";
        const searchField = document.getElementById(`${formKey}-approver-search-field`);
        const results = document.getElementById(`${formKey}-approver-results`);
        if (!manual) {
            if (searchField) searchField.hidden = true;
            const search = document.getElementById(`${formKey}-approver-search`);
            const usercode = document.getElementById(`${formKey}-approver-usercode`);
            if (search) search.value = "";
            if (usercode) usercode.value = "";
            if (results) results.hidden = true;
            void loadAutomaticRequestApprover(formKey);
            return;
        }
        const selectedPerson = requestApproverState[formKey]?.selectedPerson || null;
        if (searchField) searchField.hidden = Boolean(selectedPerson);
        renderSelectedRequestApprover(formKey, selectedPerson, "manual");
    }

    function renderRequestApproverResults(formKey, people = [], message = "") {
        const state = requestApproverState[formKey];
        const results = document.getElementById(`${formKey}-approver-results`);
        const selectedCode = String(document.getElementById(`${formKey}-approver-usercode`)?.value || "").trim().toUpperCase();
        if (!state || !results) return;
        // ponytail: used to hard-filter travel results to dept+title matches only, which silently
        // hid legitimate approvers whose title didn't literally say "Head"/"Manager" or who belong
        // to a different department than the requester. Now it only prioritizes likely matches —
        // manual search still surfaces everyone eligible, same as epass/leave.
        const visiblePeople = formKey === "travel"
            ? [...people].sort((left, right) => {
                const leftMatch = requestApproverDepartmentMatches(formKey, left) && isDepartmentHeadApprover(left) && !isGeneralManagerApprover(left) ? 0 : 1;
                const rightMatch = requestApproverDepartmentMatches(formKey, right) && isDepartmentHeadApprover(right) && !isGeneralManagerApprover(right) ? 0 : 1;
                return leftMatch - rightMatch;
            })
            : people;
        if (!visiblePeople.length) {
            results.innerHTML = `<div class="request-approver-empty">${escapeHtml(message || "No eligible approvers found.")}</div>`;
            results.hidden = false;
            return;
        }
        results.innerHTML = visiblePeople.map((person) => {
            const code = String(person.usercode || "").trim();
            const name = String(person.name || code).trim();
            const department = [person.position, person.department].filter(Boolean).join(" / ") || "Eligible approver";
            const area = String(person.area || "").trim();
            const selected = selectedCode === code.toUpperCase();
            return `
                <button class="request-approver-result${selected ? " is-selected" : ""}" type="button" data-request-approver-code="${escapeHtml(code)}">
                    ${renderEmployeeAvatar({ name, profile_photo_url: person.profile_photo_url || "" }, "request-approver-avatar")}
                    <span class="request-approver-copy">
                        <strong>${escapeHtml(name)}</strong>
                        <span>${escapeHtml(code)}${department ? ` · ${escapeHtml(department)}` : ""}${area ? ` · ${escapeHtml(area)}` : ""}</span>
                    </span>
                    <span class="request-approver-check" aria-hidden="true">✓</span>
                </button>`;
        }).join("");
        results.hidden = false;
    }

    async function loadRequestApprovers(formKey, query = "", showResults = true) {
        const state = requestApproverState[formKey];
        if (!state) return [];
        if (showResults) renderRequestApproverResults(formKey, [], "Loading eligible approvers...");
        const params = new URLSearchParams({
            action: "search_employee",
            approvers_only: "1",
            q: String(query || "").trim(),
            limit: "100"
        });
        const response = await fetch(`${AUTH_API}?${params.toString()}`, {
            credentials: "include",
            headers: getAuthHeaders()
        });
        const payload = await response.json().catch(() => ({ items: [] }));
        if (!response.ok || !payload.ok) {
            if (showResults) renderRequestApproverResults(formKey, [], payload.message || "Unable to load approvers.");
            return [];
        }
        state.people.clear();
        const people = (Array.isArray(payload.items) ? payload.items : []).filter((person) => {
            const code = String(person.usercode || "").trim();
            if (!code) return false;
            state.people.set(code.toUpperCase(), person);
            return true;
        });
        if (formKey === "travel") {
            state.generalManager = people.find(isGeneralManagerApprover) || state.generalManager || null;
        }
        const selectedCode = String(document.getElementById(`${formKey}-approver-usercode`)?.value || "").trim().toUpperCase();
        if (selectedCode && state.people.has(selectedCode)) {
            state.selectedPerson = state.people.get(selectedCode);
            renderSelectedRequestApprover(formKey, state.selectedPerson, "manual");
        }
        if (showResults) renderRequestApproverResults(formKey, people);
        return people;
    }

    function selectRequestApprover(formKey, code) {
        const state = requestApproverState[formKey];
        const search = document.getElementById(`${formKey}-approver-search`);
        const usercode = document.getElementById(`${formKey}-approver-usercode`);
        const person = state?.people.get(String(code || "").trim().toUpperCase());
        if (!state || !search || !usercode || !person) return;
        const searchField = document.getElementById(`${formKey}-approver-search-field`);
        const results = document.getElementById(`${formKey}-approver-results`);
        // [FEATURE] Travel's General Manager slot shares this same search/results UI as the
        // Department Head slot; travelApprovalEditingStage says which one the picked person
        // actually goes into.
        if (formKey === "travel" && travelApprovalEditingStage === "general_manager") {
            state.generalManager = person;
            state.generalManagerIsManual = true;
            search.value = "";
            usercode.value = "";
            renderSelectedRequestApprover(formKey, state.selectedPerson, "manual");
            if (searchField) searchField.hidden = true;
            if (results) results.hidden = true;
            travelApprovalEditingStage = "department_head";
            return;
        }
        state.selectedPerson = person;
        usercode.value = String(person.usercode || "").trim();
        search.value = `${person.name || person.usercode} (${person.usercode})`;
        renderSelectedRequestApprover(formKey, person, "manual");
        if (formKey === "travel") {
            // [FEATURE] Picking a Department Head here sticks as this requester's default for
            // future Travel requests (loadAutomaticRequestApprover reads it back) — Travel had no
            // "Set as default" button like EPASS/Leave, so without this every new/auto-mode
            // request silently reverted to the department's resolved default (e.g. Alena) and the
            // user had to re-search the same person every time.
            writeRequestApproverDefault("travel", person);
        }
        if (searchField) searchField.hidden = true;
        if (results) results.hidden = true;
    }

    function bindRequestApprover(formKey) {
        const mode = document.getElementById(`${formKey}-approver-mode`);
        if (formKey === "leave") {
            if (!mode || mode.dataset.bound === "1") return;
            mode.dataset.bound = "1";
            bindLeaveApprovalRouteEditor();
            void loadLeaveApprovalRoute();
            return;
        }
        const search = document.getElementById(`${formKey}-approver-search`);
        const results = document.getElementById(`${formKey}-approver-results`);
        const selected = document.getElementById(`${formKey}-approver-selected`);
        if (!mode || !search || mode.dataset.bound === "1") return;
        mode.dataset.bound = "1";
        mode.addEventListener("change", () => {
            syncRequestApproverMode(formKey);
            if (mode.value === "manual") void loadRequestApprovers(formKey, "");
        });
        search.addEventListener("focus", () => void loadRequestApprovers(formKey, search.value));
        search.addEventListener("input", () => {
            const usercode = document.getElementById(`${formKey}-approver-usercode`);
            if (usercode) usercode.value = "";
            // [FIX] While picking the GM slot, typing must not blank out the Department Head card
            // underneath — the two slots are independent even though they share this search box.
            if (!(formKey === "travel" && travelApprovalEditingStage === "general_manager")) {
                requestApproverState[formKey].selectedPerson = null;
                renderSelectedRequestApprover(formKey, null, "manual");
            }
            window.clearTimeout(requestApproverState[formKey].timer);
            requestApproverState[formKey].timer = window.setTimeout(() => void loadRequestApprovers(formKey, search.value), 220);
        });
        results?.addEventListener("click", (event) => {
            const option = event.target.closest("[data-request-approver-code]");
            if (option) selectRequestApprover(formKey, option.getAttribute("data-request-approver-code") || "");
        });
        selected?.addEventListener("click", (event) => {
            const setButton = event.target.closest("[data-set-request-approver-default]");
            const clearButton = event.target.closest("[data-clear-request-approver-default]");
            if (setButton) {
                const code = String(setButton.getAttribute("data-set-request-approver-default") || "").toUpperCase();
                const state = requestApproverState[formKey];
                const person = state?.selectedPerson || state?.autoPerson || state?.people.get(code);
                if (person?.usercode) {
                    writeRequestApproverDefault(formKey, person);
                    renderSelectedRequestApprover(formKey, person, mode.value === "auto" ? "default" : "manual");
                }
            }
            if (clearButton) {
                writeRequestApproverDefault(formKey, null);
                if (mode.value === "auto") void loadAutomaticRequestApprover(formKey);
                else renderSelectedRequestApprover(formKey, requestApproverState[formKey]?.selectedPerson || null, "manual");
            }
            const stageCard = formKey === "travel" ? event.target.closest("[data-change-travel-stage]") : null;
            const travelStage = String(stageCard?.dataset.changeTravelStage || "");
            if (formKey === "travel" && stageCard && travelStage) {
                if (travelStage === "general_manager" && !canChangeTravelGeneralManager()) return;
                // [FEATURE] Editing the GM slot must NOT flip the Department Head mode dropdown to
                // "manual" — the two slots are independent even though they share this search UI.
                travelApprovalEditingStage = travelStage;
                if (travelStage === "department_head") mode.value = "manual";
                const searchField = document.getElementById(`${formKey}-approver-search-field`);
                if (searchField) searchField.hidden = false;
                selected.hidden = true;
                search.value = "";
                search.focus();
                return;
            }
            if (!setButton && !clearButton && (mode.value === "manual" || formKey === "leave" || formKey === "epass") && event.target.closest(".request-approver-selected-card.is-changeable")) {
                if (formKey === "leave" || formKey === "epass") mode.value = "manual";
                const searchField = document.getElementById(`${formKey}-approver-search-field`);
                if (searchField) searchField.hidden = false;
                selected.hidden = true;
                search.value = "";
                search.focus();
            }
        });
        document.addEventListener("click", (event) => {
            if (!event.target.closest(`#${formKey}-approver-manual`) && results) results.hidden = true;
        });
        const departmentIds = formKey === "epass"
            ? ["epass-department"]
            : (formKey === "travel" ? ["travel-department-select", "travel-department"] : []);
        departmentIds.forEach((id) => document.getElementById(id)?.addEventListener("change", () => {
            if (mode.value === "auto") void loadAutomaticRequestApprover(formKey);
        }));
        syncRequestApproverMode(formKey);
    }

    function setRequestApproverSelection(formKey, item = {}) {
        if (formKey === "leave") {
            const assignedRoute = Array.isArray(item.approval_route) ? item.approval_route : [];
            if (assignedRoute.length) {
                leaveApprovalRoutePeople = assignedRoute;
                leaveApprovalRouteOverrides = {};
                leaveApprovalCanChangeGeneralManager = String(session.privilage || employee.privilage || "")
                    .split(/[^0-9]+/)
                    .filter(Boolean)
                    .includes("10");
                leaveApprovalRouteReady = ["department_head", "administrative_chief", "general_manager"]
                    .every((stage) => assignedRoute.some((person) => person.stage === stage));
                leaveApprovalRouteMessage = leaveApprovalRouteReady
                    ? "Approval route ready: Department Head -> OIC - Administrative Chief -> General Manager."
                    : "This request is missing one or more assigned signatories.";
                renderLeaveApprovalRoute(assignedRoute);
                updateLeaveSummary();
                return;
            }
            void loadLeaveApprovalRoute();
            return;
        }
        // [FIX] Travel's list API never had an `assigned_approver_usercode` field (that only
        // exists on Leave) — the fallback code below always read it as empty, so editing a
        // pending Travel request silently forced "auto" mode and re-resolved the department's
        // default Department Head (e.g. Alena) instead of showing who was actually saved on this
        // request. Travel's list now returns department_head_usercode/general_manager_usercode
        // (see getTravelList in travelService.js) — use those instead.
        if (formKey === "travel") {
            const state = requestApproverState.travel;
            const mode = document.getElementById("travel-approver-mode");
            const search = document.getElementById("travel-approver-search");
            const usercode = document.getElementById("travel-approver-usercode");
            if (!mode || !search || !usercode || !state) return;
            const gmCode = String(item.general_manager_usercode || "").trim();
            if (gmCode) {
                state.generalManager = {
                    usercode: gmCode,
                    name: String(item.general_manager_name || "").trim() || gmCode,
                    position: String(item.general_manager_position || "").trim()
                };
                state.generalManagerIsManual = true;
            }
            const dhCode = String(item.department_head_usercode || "").trim();
            if (!dhCode) {
                mode.value = "auto";
                search.value = "";
                usercode.value = "";
                state.selectedPerson = null;
                void loadAutomaticRequestApprover("travel");
                return;
            }
            const departmentHead = {
                usercode: dhCode,
                name: String(item.department_head_name || "").trim() || dhCode,
                position: String(item.department_head_position || "").trim()
            };
            mode.value = "manual";
            search.value = "";
            usercode.value = dhCode;
            state.selectedPerson = departmentHead;
            state.people.set(dhCode.toUpperCase(), departmentHead);
            renderSelectedRequestApprover("travel", departmentHead, "manual");
            return;
        }
        const code = String(item.assigned_approver_usercode || "").trim();
        const name = String(item.assigned_approver_name || "").trim();
        const mode = document.getElementById(`${formKey}-approver-mode`);
        const search = document.getElementById(`${formKey}-approver-search`);
        const usercode = document.getElementById(`${formKey}-approver-usercode`);
        if (!mode || !search || !usercode) return;
        mode.value = code ? "manual" : "auto";
        search.value = code ? `${name || code} (${code})` : "";
        usercode.value = code;
        if (code) {
            const person = { usercode: code, name: name || code, department: "Assigned approver", area: "", profile_photo_url: "" };
            requestApproverState[formKey].selectedPerson = person;
            requestApproverState[formKey].people.set(code.toUpperCase(), person);
            renderSelectedRequestApprover(formKey, person, "manual");
            void loadRequestApprovers(formKey, code);
        } else {
            requestApproverState[formKey].selectedPerson = null;
        }
        syncRequestApproverMode(formKey);
    }

    function bindEpassRequestForm(body) {
        bindRequestApprover("epass");
        ensureDefaultEpassPeople();
        renderEpassPeople();
        renderEpassDateSummary();
        renderCalendar("epass");
        void loadEpassEmployeeDirectory(
            epassEmployeeDirectoryPage || 1,
            false,
            currentEpassDirectoryDepartment(),
            currentEpassDirectoryQuery()
        ).catch(() => {});
        void loadEpassList();
        void loadEpassDetails();
        syncEpassRequestSummary();

        if (body.dataset.epassBound === "1") {
            return;
        }
        body.dataset.epassBound = "1";

        body.addEventListener("click", async (event) => {
            if (event.target.closest("#epass-new-request")) {
                await startNewEpassOrTravelRequest("epass");
                return;
            }

            if (event.target.closest("[data-clear-epass-date]")) {
                const input = document.getElementById("epass-date");
                if (input) {
                    input.value = "";
                }
                renderEpassDateSummary();
                renderCalendar("epass");
                return;
            }

            const openEpassCalendar = event.target.closest('[data-open-calendar-dialog="epass"]');
            if (openEpassCalendar) {
                renderCalendar("epass");
                document.getElementById("epass-calendar-dialog")?.showModal();
                return;
            }

            if (event.target.closest("#epass-calendar-dialog [data-close-calendar-dialog]")) {
                document.getElementById("epass-calendar-dialog")?.close();
                return;
            }

            const epassCalendarDay = event.target.closest("[data-calendar-day]");
            if (epassCalendarDay && epassCalendarDay.getAttribute("data-calendar-form") === "epass") {
                toggleCalendarDate("epass", epassCalendarDay.getAttribute("data-calendar-day"));
                return;
            }

            const epassCalendarPrev = event.target.closest("[data-calendar-prev]");
            if (epassCalendarPrev && epassCalendarPrev.getAttribute("data-calendar-prev") === "epass") {
                shiftCalendarMonth("epass", -1);
                return;
            }

            const epassCalendarNext = event.target.closest("[data-calendar-next]");
            if (epassCalendarNext && epassCalendarNext.getAttribute("data-calendar-next") === "epass") {
                shiftCalendarMonth("epass", 1);
                return;
            }

            if (event.target.closest("#epass-directory-refresh")) {
                await loadEpassEmployeeDirectory(
                    1,
                    true,
                    currentEpassDirectoryDepartment(),
                    currentEpassDirectoryQuery()
                );
                return;
            }

            const historyToggle = event.target.closest("#epass-history-toggle");
            if (historyToggle) {
                epassHistoryCollapsed = !epassHistoryCollapsed;
                syncEpassHistoryPanel();
                return;
            }

            const historyPinToggle = event.target.closest("#epass-history-pin-toggle");
            if (historyPinToggle) {
                epassHistoryCollapsed = false;
                syncEpassHistoryPanel();
                return;
            }

            const expandButton = event.target.closest("[data-epass-list-expand]");
            if (expandButton) {
                const index = Number(expandButton.getAttribute("data-epass-list-expand") || -1);
                if (Number.isInteger(index) && index >= 0) {
                    if (epassExpandedRows.has(index)) {
                        epassExpandedRows.delete(index);
                    } else {
                        epassExpandedRows.add(index);
                    }
                    renderEpassList(epassListItems);
                }
                return;
            }

            const printButton = event.target.closest("[data-epass-print-index]");
            if (printButton) {
                const index = Number(printButton.getAttribute("data-epass-print-index") || -1);
                const item = epassListItems[index];
                if (item) {
                    printEpassRequest(item);
                }
                return;
            }

            const searchResult = event.target.closest("[data-epass-search-usercode]");
            if (searchResult) {
                addEpassPerson({
                    name: searchResult.getAttribute("data-epass-search-name") || "",
                    usercode: searchResult.getAttribute("data-epass-search-usercode") || "",
                    profile_photo_url: searchResult.getAttribute("data-epass-search-photo") || ""
                });
                const searchInput = document.getElementById("epass-search-input");
                if (searchInput) searchInput.value = "";
                renderEpassSearchResults([]);
                syncEpassRequestSummary();
                return;
            }

            const listRow = event.target.closest("[data-epass-list-index]");
            if (listRow) {
                const index = Number(listRow.getAttribute("data-epass-list-index") || -1);
                const item = epassListItems[index];
                if (item) {
                    document.querySelectorAll("[data-epass-list-index].is-selected").forEach((row) => row.classList.remove("is-selected"));
                    listRow.classList.add("is-selected");
                    if (!fillEpassFormForEdit(item)) {
                        showEpassDetail(item);
                    }
                }
                return;
            }

            const directoryResult = event.target.closest("[data-epass-directory-usercode]");
            if (directoryResult) {
                addEpassPerson({
                    name: directoryResult.getAttribute("data-epass-directory-name") || "",
                    usercode: directoryResult.getAttribute("data-epass-directory-usercode") || "",
                    profile_photo_url: directoryResult.getAttribute("data-epass-directory-photo") || ""
                });
                syncEpassRequestSummary();
                return;
            }

            const removeButton = event.target.closest("[data-remove-epass-person]");
            if (removeButton) {
                removeEpassPersonByUsercode(removeButton.getAttribute("data-remove-epass-person") || "");
                syncEpassRequestSummary();
                return;
            }

            if (event.target.closest("#epass-directory-prev")) {
                const nextPage = Math.max(1, epassEmployeeDirectoryPage - 1);
                if (nextPage !== epassEmployeeDirectoryPage) {
                    await loadEpassEmployeeDirectory(
                        nextPage,
                        true,
                        currentEpassDirectoryDepartment(),
                        currentEpassDirectoryQuery()
                    );
                }
                return;
            }

            if (event.target.closest("#epass-directory-next")) {
                const nextPage = Math.min(epassEmployeeDirectoryTotalPages, epassEmployeeDirectoryPage + 1);
                if (nextPage !== epassEmployeeDirectoryPage) {
                    await loadEpassEmployeeDirectory(
                        nextPage,
                        true,
                        currentEpassDirectoryDepartment(),
                        currentEpassDirectoryQuery()
                    );
                }
                return;
            }

            if (event.target.closest("#epass-submit")) {
                await saveFuelEmbedRequest("epass");
            }
        });

        body.addEventListener("input", (event) => {
            if (event.target && event.target.id === "epass-search-input") {
                window.clearTimeout(epassSearchTimer);
                const value = event.target.value;
                epassSearchTimer = window.setTimeout(() => {
                    void searchEpassEmployees(value);
                    void loadEpassEmployeeDirectory(
                        1,
                        true,
                        currentEpassDirectoryDepartment(),
                        value
                    ).catch(() => {});
                }, 220);
            }
            if (event.target && event.target.id === "epass-destination") {
                const value = event.target.value;
                event.target.value = value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
            }
            syncEpassRequestSummary();
        });

        body.addEventListener("change", (event) => {
            if (event.target && event.target.id === "epass-date") {
                const label = document.getElementById("epass-date-label");
                if (label) {
                    label.textContent = event.target.value ? displayDate(event.target.value) : "Date";
                }
                syncEpassRequestSummary();
            }
            if (event.target && event.target.id === "epass-department") {
                syncEpassRequestSummary();
                void loadEpassEmployeeDirectory(
                    1,
                    true,
                    event.target.value || "",
                    currentEpassDirectoryQuery()
                ).catch(() => {});
            }
        });
    }

    function currentTravelPeople() {
        ensureDefaultTravelPeople();
        return travelPeople.slice();
    }

    function travelRequestPeople(item = {}) {
        const names = Array.isArray(item.granted_to) ? item.granted_to : [];
        const usercodes = Array.isArray(item.requester_usercodes) ? item.requester_usercodes : [];
        const photos = Array.isArray(item.requester_photo_urls) ? item.requester_photo_urls : [];
        const total = Math.max(names.length, usercodes.length, photos.length);
        const people = [];

        for (let index = 0; index < total; index += 1) {
            const person = names[index] && typeof names[index] === "object" ? names[index] : {};
            const name = String(person.name || names[index] || "").trim();
            const usercode = String(person.usercode || usercodes[index] || "").trim().toUpperCase();
            if (!name || !usercode) {
                continue;
            }
            const legacyUserId = Number(usercode.match(/(\d+)$/)?.[1] || 0);
            people.push({
                name,
                usercode,
                profile_photo_url: String(
                    person.profile_photo_url
                    || photos[index]
                    || (legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "")
                ).trim()
            });
        }
        return people;
    }

    function fillTravelFormForEdit(item) {
        if (!item || epassStatusClass(item.status) !== "pending") {
            return false;
        }

        const travelNumber = String(item.to_number || "").trim();
        if (!travelNumber) {
            return false;
        }

        const department = document.getElementById("travel-department-select");
        const hiddenDepartment = document.getElementById("travel-department");
        const destination = document.getElementById("travel-destination");
        const purpose = document.getElementById("travel-purpose");
        const submit = document.getElementById("travel-submit");
        const newRequest = document.getElementById("travel-new-request");
        const message = document.getElementById("travel-form-message");
        const dateValue = epassDateInputValue(item.date);

        travelEditingNumber = travelNumber;
        setRequestApproverSelection("travel", item);
        if (department) {
            const wanted = resolveEpassDepartmentFilter(item.department).toUpperCase();
            const option = Array.from(department.options).find((entry) => (
                String(entry.value || "").toUpperCase() === String(item.department || "").toUpperCase()
                || String(entry.textContent || "").trim().toUpperCase() === wanted
            ));
            if (option) department.value = option.value;
        }
        if (hiddenDepartment) hiddenDepartment.value = department?.value || String(item.department || "");
        if (destination) destination.value = String(item.destination || "");
        if (purpose) purpose.value = String(item.purpose || "");
        if (submit) submit.textContent = "UPDATE";
        if (newRequest) newRequest.hidden = false;
        if (message) message.textContent = `Editing ${travelNumber}. Save changes while this request is pending.`;

        travelDates = Array.isArray(item.dates) && item.dates.length ? item.dates.slice() : (dateValue ? [dateValue] : []);
        calendarView.travel = null;
        renderTravelDates();
        renderCalendar("travel");

        travelPeople = travelRequestPeople(item);
        savePeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY, travelPeople);
        renderTravelPeople();
        syncTravelEmployeeDirectorySelectionState();
        document.getElementById("travel-destination")?.focus();
        return true;
    }

    function renderTravelList(items) {
        const target = document.getElementById("travel-list-body");
        if (!target) {
            return;
        }
        travelListItems = items || [];

        if (!travelListItems.length) {
            target.innerHTML = `
                <div class="epass-list-empty">
                    <i class="fa fa-car"></i>
                    <span>No travel orders yet.</span>
                </div>
            `;
            return;
        }

        target.innerHTML = travelListItems.map((item, index) => {
            const people = Array.isArray(item.granted_to)
                ? item.granted_to.map((person) => typeof person === "string" ? person : person?.name || "").filter(Boolean).join(", ")
                : "";
            const statusClass = epassStatusClass(item.status);
            return `
                <div class="epass-list-row epass-list-card epass-history-entry travel-history-entry status-${statusClass}" data-travel-list-index="${index}" data-travel-editable="${statusClass === "pending" ? "true" : "false"}" role="button" tabindex="0" title="${statusClass === "pending" ? "Click to edit this pending Travel request" : "Approved requests cannot be edited"}" style="cursor:${statusClass === "pending" ? "pointer" : "default"};">
                    <div class="epass-list-card-top epass-history-entry-top">
                        <div class="epass-list-icon epass-history-entry-icon"><i class="fa fa-plane"></i></div>
                        <div class="epass-list-main epass-history-entry-main">
                            <strong>${escapeHtml(item.to_number || "-")}</strong>
                            <span>${escapeHtml(item.destination || "-")}</span>
                            <small>${escapeHtml(people || item.purpose || "No employees listed")}</small>
                        </div>
                        <div class="epass-list-side epass-history-entry-side">
                            <span>${escapeHtml(item.date || "-")}</span>
                            <em class="${statusClass}">${escapeHtml(item.status_label || "Pending")}</em>
                        </div>
                        ${statusClass === "pending" ? `
                            <button type="button" data-travel-edit-index="${index}" aria-label="Edit ${escapeHtml(item.to_number || "pending Travel request")}" title="Edit pending Travel request" style="width:36px;height:36px;display:grid;place-items:center;flex:0 0 36px;padding:0;border:1px solid #f3c84b;border-radius:10px;background:#fff;color:#9a6700;cursor:pointer;">
                                <i class="fa fa-pencil" aria-hidden="true"></i>
                            </button>
                        ` : ""}
                        ${statusClass === "approved" ? `
                            <button type="button" data-travel-print-index="${index}" aria-label="Print ${escapeHtml(item.to_number || "approved Travel Order")}" title="Print approved Travel Order" style="width:36px;height:36px;display:grid;place-items:center;flex:0 0 36px;padding:0;border:1px solid rgba(22,163,74,.28);border-radius:10px;background:#ecfdf3;color:#15803d;cursor:pointer;">
                                <i class="fa fa-print" aria-hidden="true"></i>
                            </button>
                        ` : ""}
                    </div>
                </div>
            `;
        }).join("");
    }

    async function loadTravelList() {
        const target = document.getElementById("travel-list-body");
        const usercode = (employee.usercode || session.usercode || "").trim().toUpperCase();
        if (!target || !usercode) {
            return;
        }

        target.innerHTML = '<div class="epass-list-empty">Loading travel orders...</div>';
        const cacheName = "employees_profile_travel_list";
        const cached = getCachedValue(cacheName, usercode, 6 * 60 * 60 * 1000);
        if (cached) {
            renderTravelList(cached);
        }

        const loadFromEndpoint = async (apiBase) => {
            const params = new URLSearchParams({ action: "list", usercode });
            const response = await fetch(`${apiBase}?${params.toString()}`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({
                ok: false,
                message: "Invalid travel server response."
            }));
            return { response, payload };
        };

        try {
            const { response, payload } = await loadFromEndpoint(TRAVEL_API);
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Unable to load travel orders.");
            }

            const items = payload.items || [];
            setCachedValue(cacheName, usercode, items);
            renderTravelList(items);
        } catch (error) {
            if (!cached) {
                target.innerHTML = `<div class="epass-list-empty">${escapeHtml(error.message || "Unable to load travel orders.")}</div>`;
            }
        }
    }

    function bindTravelRequestForm(body) {
        bindRequestApprover("travel");
        ensureDefaultTravelPeople();
        renderTravelPeople();
        ensureDefaultTravelDates();
        renderTravelDates();
        renderCalendar("travel");
        void loadTravelEmployeeDirectory(
            travelEmployeeDirectoryPage || 1,
            false,
            document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
            document.getElementById("travel-search-input")?.value || ""
        ).catch(() => {});
        if (body.dataset.travelBound === "1") {
            return;
        }
        body.dataset.travelBound = "1";

        body.addEventListener("click", async (event) => {
            if (event.target.closest("#travel-new-request")) {
                await startNewEpassOrTravelRequest("travel");
                return;
            }

            const removeButton = event.target.closest("[data-remove-travel-person]");
            if (removeButton) {
                const index = Number(removeButton.getAttribute("data-remove-travel-person"));
                travelPeople.splice(index, 1);
                renderTravelPeople();
                syncTravelEmployeeDirectorySelectionState();
                return;
            }

            const removeDateButton = event.target.closest("[data-remove-travel-date]");
            if (removeDateButton) {
                toggleCalendarDate("travel", removeDateButton.getAttribute("data-remove-travel-date"));
                return;
            }

            const openTravelCalendar = event.target.closest('[data-open-calendar-dialog="travel"]');
            if (openTravelCalendar) {
                renderCalendar("travel");
                document.getElementById("travel-calendar-dialog")?.showModal();
                return;
            }

            if (event.target.closest("#travel-calendar-dialog [data-close-calendar-dialog]")) {
                document.getElementById("travel-calendar-dialog")?.close();
                return;
            }

            const calendarDay = event.target.closest("[data-calendar-day]");
            if (calendarDay && calendarDay.getAttribute("data-calendar-form") === "travel") {
                toggleCalendarDate("travel", calendarDay.getAttribute("data-calendar-day"));
                return;
            }

            const calendarPrev = event.target.closest("[data-calendar-prev]");
            if (calendarPrev && calendarPrev.getAttribute("data-calendar-prev") === "travel") {
                shiftCalendarMonth("travel", -1);
                return;
            }

            const calendarNext = event.target.closest("[data-calendar-next]");
            if (calendarNext && calendarNext.getAttribute("data-calendar-next") === "travel") {
                shiftCalendarMonth("travel", 1);
                return;
            }

            if (event.target.closest(".travel-reference-sheet .epass-list-icon-btn")) {
                const searchInput = document.getElementById("travel-search-input");
                if (searchInput) {
                    searchInput.value = "";
                }
                void loadTravelEmployeeDirectory(
                    1,
                    true,
                    document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
                    ""
                ).catch(() => {});
                return;
            }

            if (event.target.closest("#travel-directory-retry")) {
                void loadTravelEmployeeDirectory(
                    1,
                    true,
                    document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
                    document.getElementById("travel-search-input")?.value || ""
                ).catch(() => {});
                return;
            }

            const searchResult = event.target.closest("[data-travel-directory-usercode]");
            if (searchResult) {
                addTravelPerson({
                    name: searchResult.getAttribute("data-travel-directory-name") || "",
                    usercode: searchResult.getAttribute("data-travel-directory-usercode") || "",
                    profile_photo_url: searchResult.getAttribute("data-travel-directory-photo") || ""
                });
                const searchInput = document.getElementById("travel-search-input");
                if (searchInput) searchInput.value = "";
                return;
            }

            if (event.target.closest("#travel-directory-prev")) {
                const nextPage = Math.max(1, travelEmployeeDirectoryPage - 1);
                if (nextPage !== travelEmployeeDirectoryPage) {
                    await loadTravelEmployeeDirectory(
                        nextPage,
                        true,
                        document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
                        document.getElementById("travel-search-input")?.value || ""
                    );
                }
                return;
            }

            if (event.target.closest("#travel-directory-next")) {
                const nextPage = Math.min(travelEmployeeDirectoryTotalPages, travelEmployeeDirectoryPage + 1);
                if (nextPage !== travelEmployeeDirectoryPage) {
                    await loadTravelEmployeeDirectory(
                        nextPage,
                        true,
                        document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
                        document.getElementById("travel-search-input")?.value || ""
                    );
                }
                return;
            }

            const editButton = event.target.closest("[data-travel-edit-index]");
            if (editButton) {
                event.preventDefault();
                event.stopPropagation();
                const item = travelListItems[Number(editButton.getAttribute("data-travel-edit-index") || -1)];
                if (item) {
                    document.querySelectorAll("[data-travel-list-index].active").forEach((row) => row.classList.remove("active"));
                    editButton.closest("[data-travel-list-index]")?.classList.add("active");
                    fillTravelFormForEdit(item);
                }
                return;
            }

            const printButton = event.target.closest("[data-travel-print-index]");
            if (printButton) {
                event.preventDefault();
                event.stopPropagation();
                const item = travelListItems[Number(printButton.getAttribute("data-travel-print-index") || -1)];
                if (item) printTravelRequest(item);
                return;
            }

            const listRow = event.target.closest("[data-travel-list-index]");
            if (listRow) {
                document.querySelectorAll("[data-travel-list-index].active").forEach((row) => row.classList.remove("active"));
                listRow.classList.add("active");
                const item = travelListItems[Number(listRow.getAttribute("data-travel-list-index") || -1)];
                if (item) fillTravelFormForEdit(item);
                return;
            }

            if (event.target.closest("#travel-submit")) {
                await saveFuelEmbedRequest("travel");
            }
        });

        body.addEventListener("input", (event) => {
            if (event.target && event.target.id === "travel-search-input") {
                window.clearTimeout(epassSearchTimer);
                epassSearchTimer = window.setTimeout(() => {
                    void loadTravelEmployeeDirectory(
                        1,
                        true,
                        document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "",
                        event.target.value
                    ).catch(() => {});
                }, 220);
            }
            if (event.target && event.target.id === "travel-destination") {
                const value = event.target.value;
                event.target.value = value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
            }
        });

        body.addEventListener("change", (event) => {
            if (event.target && event.target.id === "travel-department-select") {
                const hiddenDepartment = document.getElementById("travel-department");
                if (hiddenDepartment) {
                    hiddenDepartment.value = event.target.value || "";
                }
                void loadTravelEmployeeDirectory(
                    1,
                    true,
                    event.target.value || "",
                    document.getElementById("travel-search-input")?.value || ""
                ).catch(() => {});
            }
        });
    }

    function openFormModal(formKey) {
        if ((formKey === "epass" || formKey === "travel") && isFuelChoiceLocked(formKey)) {
            syncFuelChoiceButtons();
            return;
        }

        const modal = document.getElementById("profile-form-modal");
        const title = document.getElementById("profile-form-title");
        const tag = document.getElementById("profile-form-tag");
        const body = document.getElementById("profile-form-body");
        if (!modal || !title || !tag || !body) {
            return;
        }

        const forms = {
            // GABAY: ALC tab now shows the flat daily points sheet sourced from DTR attendance.
            dtr: {
                tag: "ALC",
                title: "Accrued Leave Credits",
                html: `
                    <section class="dtr-leave-sheet" aria-label="Accrued leave credits">
                        <div class="dtr-leave-root" id="dtr-leave-root">
                            <div class="dtr-leave-shell alc-dashboard">
                                <div class="alc-loading-state">
                                    <span class="alc-loading-state__mark"><i class="fa fa-line-chart" aria-hidden="true"></i></span>
                                    <div><strong>Preparing your ALC dashboard</strong><p>Calculating attendance-based leave credits…</p></div>
                                </div>
                            </div>
                        </div>
                    </section>
                `
            },
            epass: {
                tag: "Employee Pass",
                title: "EPASS Request Details",
                html: renderEpassRequestForm()
            },
            leave: {
                tag: "Leave Application",
                title: "Leave Request",
                html: renderLeaveRequestForm()
            },
            overtime: {
                tag: "OT",
                title: "Overtime Request",
                html: renderOvertimeRequestForm()
            },
            travel: {
                tag: "Travel Order",
                title: "Travel Request Details",
                html: renderTravelRequestForm()
            }
        };

        const currentForm = forms[formKey];
        if (!currentForm) {
            return;
        }

        activeFormKey = formKey;
        tag.textContent = currentForm.tag;
        title.textContent = currentForm.title;
        body.innerHTML = currentForm.html;
        if (formKey === "epass" || formKey === "travel") {
            syncFuelPeopleDrafts(formKey);
        }
        modal.classList.toggle("epass-mode", formKey === "epass");
        modal.classList.toggle("dtr-mode", formKey === "dtr");
        modal.classList.toggle("leave-mode", formKey === "leave");
        modal.classList.toggle("overtime-mode", formKey === "overtime");
        modal.classList.toggle("travel-mode", formKey === "travel");
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");

        if (formKey === "epass") {
            bindEpassRequestForm(body);
            void loadRequestNumberPreview("epass");
            applyPrefillFromFuelContext("epass");
        } else if (formKey === "leave") {
            bindLeaveRequestForm(body);
        } else if (formKey === "overtime") {
            bindOvertimeRequestForm(body);
            overtimeListPage = 1;
            overtimeActiveTimePresetKey = "";
            loadOvertimeList(1, true);
            void loadOvertimeTimePresets(true);
            setOvertimeListOverlayOpen(false);
            setOvertimeScheduleModalOpen(false);
            updateOvertimeScheduleSummary();
        } else if (formKey === "dtr") {
            renderDtrLeaveCompute();
        } else if (formKey === "travel") {
            bindTravelRequestForm(body);
            loadTravelList();
            applyPrefillFromFuelContext("travel");
        }
        syncFuelChoiceButtons();
    }

    let fuelEmbedContext = {
        farCode: "",
        epassNumber: "",
        usercode: "",
        employeeName: "",
        purpose: "",
        date: "",
        department: "",
        destination: ""
    };

    function readFuelEmbedContext() {
        try {
            const params = new URLSearchParams(window.location.search);
            fuelEmbedContext = {
                farCode: params.get("fuelFarCode") || "",
                epassNumber: params.get("fuelEpassNumber") || "",
                usercode: String(params.get("fuelUserCode") || "").trim().toUpperCase(),
                employeeName: params.get("fuelEmployeeName") || "",
                purpose: params.get("fuelPurpose") || "",
                date: params.get("fuelDate") || "",
                department: params.get("fuelDepartment") || "",
                destination: params.get("fuelDestination") || ""
            };
        } catch (_error) {
            fuelEmbedContext = {
                farCode: "",
                epassNumber: "",
                usercode: "",
                employeeName: "",
                purpose: "",
                date: "",
                department: "",
                destination: ""
            };
        }
    }

    function notifyFuelParent(type, detail = {}) {
        if (window.parent === window) {
            return;
        }
        try {
            window.parent.postMessage({ type, ...detail }, window.location.origin);
        } catch (_error) {
            /* noop */
        }
    }

    function notifyApprovalDeskRefresh(section, detail = {}) {
        // [EDIT GUIDE] ITO ANG PAMPAGISING SA Approval Desk para mag-refresh ang pending counts pagkatapos ng save.
        notifyFuelParent("samelcii-approval-refresh", {
            section,
            ...detail
        });
    }
    function syncEpassPurposeLabel() {
        const purpose = document.getElementById("epass-purpose");
        const wrap = purpose?.closest(".epass-reference-purpose");
        if (wrap) {
            wrap.classList.toggle("has-value", String(purpose?.value || "").trim() !== "");
        }
    }

    function setFuelEmbedNote(messageEl, farCode) {
        if (!messageEl || !farCode) {
            return;
        }
        messageEl.textContent = "";
        messageEl.classList.remove("fuel-embed-note");
    }

    async function loadSavedFuelEpassPeople(epassNumber) {
        const number = String(epassNumber || "").trim();
        if (!number) {
            return [];
        }

        try {
            const params = new URLSearchParams({
                action: "by_number",
                epassnumber: number
            });
            const response = await fetch(`${EPASS_API}?${params.toString()}`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({ ok: false }));
            if (!response.ok || !payload.ok || !payload.item) {
                return [];
            }

            const names = Array.isArray(payload.item.requester_names) ? payload.item.requester_names : [];
            const usercodes = Array.isArray(payload.item.requester_usercodes) ? payload.item.requester_usercodes : [];
            const photos = Array.isArray(payload.item.requester_photo_urls) ? payload.item.requester_photo_urls : [];
            const total = Math.max(names.length, usercodes.length, photos.length);
            const people = [];

            for (let index = 0; index < total; index += 1) {
                const name = String(names[index] || "").trim();
                const usercode = String(usercodes[index] || "").trim().toUpperCase();
                if (!name || !usercode) {
                    continue;
                }
                people.push({
                    name,
                    usercode,
                    profile_photo_url: String(photos[index] || "").trim()
                });
            }

            return people;
        } catch (_error) {
            return [];
        }
    }

    async function saveFuelEmbedRequest(formKey, options = {}) {
        const closeAfterSave = Boolean(options.closeAfterSave);
        const isEpass = formKey === "epass";
        const isTravel = formKey === "travel";
        if (!isEpass && !isTravel) {
            return false;
        }

        const endpoint = isEpass ? EPASS_API : TRAVEL_API;
        const message = document.getElementById(isEpass ? "epass-form-message" : "travel-form-message");
        const submit = document.getElementById(isEpass ? "epass-submit" : "travel-submit");
        const farCode = String(fuelEmbedContext.farCode || "").trim();
        const people = getFuelPeopleForForm(formKey);
        const clearRequiredHighlights = () => {
            document.querySelectorAll(".is-required-missing").forEach((node) => node.classList.remove("is-required-missing"));
        };
        const showRequiredMessage = (fieldId = "") => {
            if (message) message.textContent = "";
            if (fieldId) {
                const field = document.getElementById(fieldId);
                field?.classList.add("is-required-missing");
                field?.focus();
            }
            return false;
        };

        if (!people.length) {
            return showRequiredMessage(isEpass ? "epass-search-input" : "travel-search-input");
        }

        const editingEpassNumber = isEpass ? String(epassEditingNumber || "").trim() : "";
        const editingTravelNumber = isTravel ? String(travelEditingNumber || "").trim() : "";
        const departmentValue = isEpass
            ? String(document.getElementById("epass-department")?.value || "").trim()
            : String(document.getElementById("travel-department-select")?.value || document.getElementById("travel-department")?.value || "").trim();
        const destinationValue = String(document.getElementById(isEpass ? "epass-destination" : "travel-destination")?.value || "").trim();
        const dateValue = isEpass ? String(document.getElementById("epass-date")?.value || "").trim() : "";
        const datesValue = isTravel ? travelDates.slice() : [];
        const purposeValue = String(document.getElementById(isEpass ? "epass-purpose" : "travel-purpose")?.value || "").trim();
        if (!departmentValue) {
            return showRequiredMessage(isEpass ? "epass-department" : "travel-department-select");
        }
        if (isEpass && !dateValue) {
            return showRequiredMessage("epass-date");
        }
        if (isTravel && !datesValue.length) {
            return showRequiredMessage("travel-calendar");
        }
        if (!destinationValue) {
            return showRequiredMessage(isEpass ? "epass-destination" : "travel-destination");
        }
        if (!purposeValue) {
            return showRequiredMessage(isEpass ? "epass-purpose" : "travel-purpose");
        }
        const selectedApproverMode = document.getElementById(`${formKey}-approver-mode`)?.value || "auto";
        const savedDefaultApprover = selectedApproverMode === "auto" ? readRequestApproverDefault(formKey) : null;
        const displayedAutoApprover = selectedApproverMode === "auto" ? requestApproverState[formKey]?.autoPerson : null;
        const approverMode = savedDefaultApprover?.usercode ? "manual" : selectedApproverMode;
        const approverUsercode = savedDefaultApprover?.usercode
            ? String(savedDefaultApprover.usercode)
            : (document.getElementById(`${formKey}-approver-usercode`)?.value || (displayedAutoApprover?.usercode ? String(displayedAutoApprover.usercode) : ""));
        if (!approverUsercode) {
            return showRequiredMessage(`${formKey}-approver-search`);
        }
        clearRequiredHighlights();
        const payload = isEpass ? {
            people,
            epassnumber: editingEpassNumber,
            department: departmentValue,
            destination: destinationValue,
            date: dateValue,
            purpose: purposeValue,
            fuelFarCode: farCode,
            approver_mode: approverMode,
            approver_usercode: approverUsercode
        } : {
            people,
            to_number: editingTravelNumber,
            department: departmentValue,
            travel_type: document.getElementById("travel-type")?.value || "",
            destination: destinationValue,
            date: datesValue[0] || "",
            dates: datesValue,
            purpose: purposeValue,
            fuelFarCode: farCode,
            approver_mode: approverMode,
            approver_usercode: approverUsercode,
            // [FEATURE] Only sent when a privilege-10 user actually picked a stand-in GM this
            // session — the server re-checks the caller's privilege independently either way.
            general_manager_usercode: requestApproverState.travel?.generalManagerIsManual
                ? String(requestApproverState.travel.generalManager?.usercode || "")
                : ""
        };

        if (message) {
            message.textContent = isEpass ? "Saving EPASS request..." : "Saving travel order...";
        }
        if (submit) {
            submit.disabled = true;
        }

        const saveViaEndpoint = async (apiBase) => {
            const action = (isEpass && editingEpassNumber) || (isTravel && editingTravelNumber) ? "update" : "create";
            const response = await fetch(`${apiBase}?action=${action}`, {
                method: "POST",
                credentials: "include",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({
                ok: false,
                message: isEpass ? "Invalid EPASS server response." : "Invalid travel server response."
            }));
            return { response, result };
        };

        try {
            const { response, result } = await saveViaEndpoint(endpoint);

            if (!response.ok || !result.ok) {
                throw new Error(result.message || (isEpass ? "Unable to save EPASS request." : "Unable to save travel order."));
            }

            if (message) {
                const savedNumber = result.epassnumber || result.epass_number || result.to_number || "";
                message.textContent = savedNumber ? `Saved ${savedNumber}.` : (isEpass ? "Saved EPASS request." : "Saved travel order.");
            }
            if (isEpass) {
                epassEditingNumber = "";
                if (submit) submit.textContent = "SAVE";
                const newRequest = document.getElementById("epass-new-request");
                if (newRequest) newRequest.hidden = true;
                await loadRequestNumberPreview("epass");
                const savedEpassNumber = result.epassnumber || result.epass_number || "";
                if (fuelEmbedContext.farCode && savedEpassNumber) {
                    try {
                        const linkResponse = await fetch(`${EPASS_API}?action=link-fuel`, {
                            method: "POST",
                            credentials: "include",
                            headers: getAuthHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({
                                epass_number: savedEpassNumber,
                                far_code: fuelEmbedContext.farCode
                            })
                        });
                        const linkPayload = await linkResponse.json().catch(() => ({ ok: false }));
                        if (!linkResponse.ok || !linkPayload.ok) {
                            throw new Error(linkPayload.message || "Unable to link EPASS to Fuel request.");
                        }
                    } catch (linkError) {
                        if (message) {
                            message.textContent = linkError.message || "Saved EPASS, but linking failed.";
                        }
                    }
                }
                if (fuelEmbedContext.farCode) {
                    notifyFuelParent("samelcii-fuel-epass-saved", {
                        farCode: fuelEmbedContext.farCode,
                        epassnumber: savedEpassNumber
                    });
                }
                setFuelChoiceLocked("epass", false);
                setFuelChoiceLocked("travel", true);
                notifyApprovalDeskRefresh("epass", {
                    epassnumber: savedEpassNumber
                });
                clearEpassForm();
                const epassCacheKey = getEpassHistoryIdentifiers()[0] || "";
                if (epassCacheKey && savedEpassNumber) {
                    const savedRecord = {
                        epassnumber: savedEpassNumber,
                        department: payload.department || "",
                        destination: payload.destination || "",
                        date: payload.date || "",
                        purpose: payload.purpose || "",
                        status: result.status || 1,
                        status_label: result.status_label || "Pending",
                        requester_names: people.map((person) => person.name || "").filter(Boolean),
                        requester_usercodes: people.map((person) => person.usercode || "").filter(Boolean),
                        requester_photo_urls: people.map((person) => person.profile_photo_url || "")
                    };
                    const cachedItems = getCachedValue("employees_profile_epass_list", epassCacheKey, 6 * 60 * 60 * 1000) || [];
                    const nextItems = [savedRecord, ...cachedItems.filter((item) => String(item?.epassnumber || "").trim().toUpperCase() !== savedEpassNumber.trim().toUpperCase())];
                    setCachedValue("employees_profile_epass_list", epassCacheKey, nextItems);
                }
                epassHistoryCollapsed = false;
                await loadEpassList();
            } else {
                travelEditingNumber = "";
                travelDates = [todayInputValue()];
                calendarView.travel = null;
                renderTravelDates();
                renderCalendar("travel");
                if (submit) submit.textContent = "SAVE";
                const newRequest = document.getElementById("travel-new-request");
                if (newRequest) newRequest.hidden = true;
                if (fuelEmbedContext.farCode) {
                    notifyFuelParent("samelcii-fuel-travel-saved", {
                        farCode: fuelEmbedContext.farCode,
                        to_number: result.to_number || ""
                    });
                }
                setFuelChoiceLocked("travel", false);
                setFuelChoiceLocked("epass", true);
                notifyApprovalDeskRefresh("travel", {
                    to_number: result.to_number || ""
                });
                setCachedValue("employees_profile_travel_list", (employee.usercode || session.usercode || "").trim().toUpperCase(), []);
                await loadTravelList();
            }
            savePeopleDraft(EPASS_PEOPLE_DRAFT_KEY, epassPeople);
            savePeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY, travelPeople);
            setFuelSelectionSuppressed(formKey, false);
            syncFuelChoiceButtons();

            if (closeAfterSave) {
                finalizeCloseFormModal();
            }
            return true;
        } catch (error) {
            if (message) {
                message.textContent = error.message || (isEpass ? "Save failed." : "Save failed.");
            }
            return false;
        } finally {
            if (submit) {
                submit.disabled = false;
            }
        }
    }

    function renderFuelEmbedSelectedSummary() {
        const target = document.getElementById("fuel-epass-selected-summary");
        if (!target) {
            return;
        }

        const people = Array.isArray(epassPeople) ? epassPeople : [];
        if (!people.length) {
            target.innerHTML = `
                <div class="fuel-epass-selected-empty">
                    <strong>No employee selected yet.</strong>
                    <span>Pick the employee for this Fuel EPASS.</span>
                </div>
            `;
            return;
        }

        target.innerHTML = `
            <div class="fuel-epass-selected-head">
                <strong>Selected employee${people.length === 1 ? "" : "s"}</strong>
                <span>${people.length} linked to this Fuel EPASS</span>
            </div>
            <div class="fuel-epass-selected-list">
                ${people.map((person) => {
                    // ponytail: legacy S2 code suffix matches user Id; the avatar keeps initials if the endpoint fails.
                    const legacyUserId = Number(String(person.usercode || "").match(/(\d+)$/)?.[1] || 0);
                    const personWithPhoto = {
                        ...person,
                        profile_photo_url: person.profile_photo_url || (legacyUserId > 0 ? `${AUTH_API}/profile-photo?user_id=${legacyUserId}` : "")
                    };
                    return `
                        <div class="fuel-epass-selected-chip">
                            ${renderEmployeeAvatar(personWithPhoto, "fuel-epass-selected-avatar")}
                            <span class="fuel-epass-selected-meta">
                                <strong>${escapeHtml(person.name || "Employee")}</strong>
                                <small>${escapeHtml(person.usercode || "")}</small>
                            </span>
                            <button type="button" class="fuel-epass-selected-remove" data-remove-epass-person="${escapeHtml(person.usercode || "")}" aria-label="Remove ${escapeHtml(person.name || "employee")}">&times;</button>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function applyPrefillFromFuelContext(formKey) {
        if (!fuelEmbedContext.farCode) {
            return;
        }

        if (formKey === "epass") {
            const restore = async () => {
                if (isFuelSelectionSuppressed("epass")) {
                    return;
                }
                const savedPeople = await loadSavedFuelEpassPeople(fuelEmbedContext.epassNumber || fuelEmbedContext.farCode);
                if (savedPeople.length) {
                    epassPeople = clonePeopleList(savedPeople);
                } else if (!epassPeople.length && fuelEmbedContext.usercode && fuelEmbedContext.employeeName) {
                    epassPeople = [{
                        name: fuelEmbedContext.employeeName,
                        usercode: fuelEmbedContext.usercode
                    }];
                }
                renderEpassPeople();
                renderFuelEmbedSelectedSummary();
            };
            void restore();
            const destination = document.getElementById("epass-destination");
            const purpose = document.getElementById("epass-purpose");
            const date = document.getElementById("epass-date");
            const dateLabel = document.getElementById("epass-date-label");
            const department = document.getElementById("epass-department");
            if (destination && fuelEmbedContext.destination) destination.value = fuelEmbedContext.destination;
            if (purpose && fuelEmbedContext.purpose) {
                purpose.value = fuelEmbedContext.purpose;
                syncEpassPurposeLabel();
            }
            if (date && fuelEmbedContext.date) {
                date.value = fuelEmbedContext.date;
                if (dateLabel) dateLabel.textContent = fuelEmbedContext.date;
                calendarView.epass = null;
                renderEpassDateSummary();
                renderCalendar("epass");
            }
            if (department && fuelEmbedContext.department) {
                department.value = fuelEmbedContext.department;
            }
            setFuelEmbedNote(document.getElementById("epass-form-message"), fuelEmbedContext.farCode);
            syncEpassRequestSummary();
            return;
        }

        if (formKey === "travel") {
            if (!isFuelSelectionSuppressed("travel")) {
                if (String(fuelEmbedContext.farCode || "").trim()) {
                    renderTravelPeople();
                } else {
                    const savedPeople = loadPeopleDraft(TRAVEL_PEOPLE_DRAFT_KEY);
                    if (!travelPeople.length && savedPeople.length) {
                        travelPeople = clonePeopleList(savedPeople);
                        renderTravelPeople();
                    } else if (!travelPeople.length) {
                        renderTravelPeople();
                    }
                }
            }
            const destination = document.getElementById("travel-destination");
            const purpose = document.getElementById("travel-purpose");
            const department = document.getElementById("travel-department");
            if (destination && fuelEmbedContext.destination) destination.value = fuelEmbedContext.destination;
            if (purpose && fuelEmbedContext.purpose) purpose.value = fuelEmbedContext.purpose;
            if (fuelEmbedContext.date) {
                travelDates = [fuelEmbedContext.date];
                calendarView.travel = null;
                renderTravelDates();
                renderCalendar("travel");
            }
            if (department && fuelEmbedContext.department) {
                department.value = fuelEmbedContext.department;
            }
            setFuelEmbedNote(document.getElementById("travel-form-message"), fuelEmbedContext.farCode);
        }
    }

    function finalizeCloseFormModal() {
        const modal = document.getElementById("profile-form-modal");
        if (!modal) {
            return;
        }
        setOvertimeListOverlayOpen(false);
        const wasEmbedFuel = document.body.classList.contains("profile-embed-fuel")
            || document.body.classList.contains("profile-embed-travel");
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
        if (wasEmbedFuel && window.parent !== window) {
            notifyFuelParent("samelcii-fuel-embed-close");
        }
        document.body.classList.remove("profile-embed-travel");
        document.body.classList.remove("profile-embed-epass");
        document.body.classList.remove("profile-embed-fuel");
        activeFormKey = "";
    }

    async function closeFormModal() {
        const shouldAutoSave = document.body.classList.contains("profile-embed-fuel")
            && !fuelEmbedAutoSaveInProgress
            && (activeFormKey === "epass" || activeFormKey === "travel");

        if (shouldAutoSave) {
            fuelEmbedAutoSaveInProgress = true;
            try {
                const handled = await saveFuelEmbedRequest(activeFormKey, { closeAfterSave: false });
                if (!handled) {
                    return;
                }
            } finally {
                fuelEmbedAutoSaveInProgress = false;
            }
        }

        finalizeCloseFormModal();
    }

    // GABAY: EPASS at Travel iisa na ang quick button â€” ito ang active state at picker.
    function setActiveQuickAction(formKey) {
        document.querySelectorAll(".quick-action-btn").forEach((item) => item.classList.remove("active"));
        let resolved = document.querySelector(`.quick-action-btn[data-form="${formKey}"]`);
        if (formKey === "epass" || formKey === "travel") {
            resolved = document.querySelector('.quick-action-btn[data-form="epass-travel"]');
        }
        if (resolved) {
            resolved.classList.add("active");
        }
    }

    document.addEventListener("input", (event) => {
        event.target?.classList?.remove("is-required-missing");
    });
    document.addEventListener("change", (event) => {
        event.target?.classList?.remove("is-required-missing");
    });

    function openEpassTravelPicker() {
        const picker = document.getElementById("epass-travel-picker-modal");
        if (!picker) {
            return;
        }
        syncFuelChoiceButtons();
        picker.classList.add("active");
        picker.setAttribute("aria-hidden", "false");
    }

    function closeEpassTravelPicker() {
        const picker = document.getElementById("epass-travel-picker-modal");
        if (!picker) {
            return;
        }
        picker.classList.remove("active");
        picker.setAttribute("aria-hidden", "true");
    }

    function normalizeProfileLayout(value = {}) {
        const allowedPanels = ["profile", "attendance", "accountability", "leave"];
        const uniqueAllowed = (items, allowed) => [...new Set(Array.isArray(items) ? items : [])]
            .filter((item) => allowed.includes(item));
        const order = uniqueAllowed(value.order, PROFILE_LAYOUT_DEFAULT.order);
        const sideOrder = uniqueAllowed(value.sideOrder, PROFILE_LAYOUT_DEFAULT.sideOrder);
        const density = ["compact", "comfortable", "spacious"].includes(value.density)
            ? value.density
            : PROFILE_LAYOUT_DEFAULT.density;
        return {
            order: order.length === PROFILE_LAYOUT_DEFAULT.order.length ? order : [...PROFILE_LAYOUT_DEFAULT.order],
            sideOrder: sideOrder.length === PROFILE_LAYOUT_DEFAULT.sideOrder.length ? sideOrder : [...PROFILE_LAYOUT_DEFAULT.sideOrder],
            left: Math.min(520, Math.max(220, Number(value.left) || PROFILE_LAYOUT_DEFAULT.left)),
            right: Math.min(460, Math.max(220, Number(value.right) || PROFILE_LAYOUT_DEFAULT.right)),
            sideSplit: Math.min(78, Math.max(28, Number(value.sideSplit) || PROFILE_LAYOUT_DEFAULT.sideSplit)),
            hidden: uniqueAllowed(value.hidden, allowedPanels),
            collapsed: uniqueAllowed(value.collapsed, allowedPanels),
            density
        };
    }

    const profileLayoutSelfCheck = normalizeProfileLayout({ left: 1, density: "invalid", hidden: ["leave", "unknown"] });
    console.assert(
        profileLayoutSelfCheck.left === 220
        && profileLayoutSelfCheck.density === "comfortable"
        && profileLayoutSelfCheck.hidden.length === 1,
        "Profile layout validation failed."
    );

    function readProfileLayout() {
        try {
            return normalizeProfileLayout(JSON.parse(localStorage.getItem(PROFILE_LAYOUT_STORAGE_KEY) || "{}"));
        } catch (_error) {
            return normalizeProfileLayout();
        }
    }

    function saveProfileLayout(layout) {
        try {
            localStorage.setItem(PROFILE_LAYOUT_STORAGE_KEY, JSON.stringify(normalizeProfileLayout(layout)));
            return true;
        } catch (_error) {
            return false;
        }
    }

    function applyProfileLayout(layout) {
        const grid = document.getElementById("profile-custom-layout");
        const module = grid?.closest(".profile-module");
        const side = grid?.querySelector(".side-shell");
        if (!grid || !module || !side) return;

        const labels = {
            profile: "Profile",
            attendance: "Attendance",
            accountability: "IT Accountability",
            leave: "Leave Points"
        };
        const mainWidgets = {
            profile: grid.querySelector(':scope > [data-layout-widget="profile"]'),
            attendance: grid.querySelector(':scope > [data-layout-widget="attendance"]'),
            side
        };
        const sideWidgets = {
            accountability: side.querySelector('[data-side-widget="accountability"]'),
            leave: side.querySelector('[data-side-widget="leave"]')
        };

        Object.entries({ ...mainWidgets, ...sideWidgets }).forEach(([key, widget]) => {
            if (!widget || key === "side") return;
            widget.dataset.layoutLabel = labels[key];
            widget.hidden = layout.hidden.includes(key);
            widget.classList.toggle("is-panel-collapsed", layout.collapsed.includes(key));
        });

        layout.sideOrder.forEach((key) => {
            if (sideWidgets[key]) side.appendChild(sideWidgets[key]);
        });

        const hasVisibleSidePanel = layout.sideOrder.some((key) => !layout.hidden.includes(key));
        side.hidden = !hasVisibleSidePanel;
        side.classList.remove("is-panel-collapsed");
        const visibleMain = layout.order.filter((key) => key !== "side"
            ? !layout.hidden.includes(key)
            : hasVisibleSidePanel);
        visibleMain.forEach((key, index) => {
            const widget = mainWidgets[key];
            if (widget) widget.style.gridColumn = `${index + 1} / ${index + 2}`;
        });

        grid.dataset.visibleColumns = String(visibleMain.length);
        grid.style.setProperty("--profile-layout-left", `${layout.left}px`);
        grid.style.setProperty("--profile-layout-right", `${layout.right}px`);
        side.style.setProperty("--profile-side-top", `${layout.sideSplit}%`);
        side.style.gridTemplateRows = layout.sideOrder.filter((key) => !layout.hidden.includes(key)).length === 1
            ? "minmax(0, 1fr)"
            : "";

        const leftResizer = grid.querySelector('[data-layout-resize="left"]');
        const rightResizer = grid.querySelector('[data-layout-resize="right"]');
        const sideResizer = grid.querySelector('[data-layout-resize="sideSplit"]');
        if (leftResizer) leftResizer.hidden = visibleMain.length < 2;
        if (rightResizer) rightResizer.hidden = visibleMain.length < 3;
        if (sideResizer) {
            sideResizer.hidden = layout.sideOrder.filter((key) => !layout.hidden.includes(key) && !layout.collapsed.includes(key)).length < 2;
        }

        module.classList.remove("profile-layout-density-compact", "profile-layout-density-comfortable", "profile-layout-density-spacious");
        module.classList.add(`profile-layout-density-${layout.density}`);
    }

    function initializeProfileLayout() {
        const grid = document.getElementById("profile-custom-layout");
        const customize = document.getElementById("profile-layout-customize");
        const reset = document.getElementById("profile-layout-reset");
        const settings = document.getElementById("profile-layout-settings");
        const settingsToggle = document.getElementById("profile-layout-settings-toggle");
        const settingsClose = document.getElementById("profile-layout-settings-close");
        const density = document.getElementById("profile-layout-density");
        const status = document.getElementById("profile-layout-settings-status");
        const exportButton = document.getElementById("profile-layout-export");
        const importButton = document.getElementById("profile-layout-import");
        const importFile = document.getElementById("profile-layout-import-file");
        if (!grid || !customize || !reset || !settings || !settingsToggle) return;

        let layout = readProfileLayout();
        let dragged = null;
        let dragScope = "";

        const showStatus = (message, isError = false) => {
            if (!status) return;
            status.textContent = message;
            status.style.color = isError ? "#b4232d" : "";
        };
        const syncSettings = () => {
            if (density) density.value = layout.density;
            settings.querySelectorAll("[data-layout-visible]").forEach((control) => {
                control.checked = !layout.hidden.includes(control.dataset.layoutVisible);
            });
            settings.querySelectorAll("[data-layout-collapsed]").forEach((control) => {
                control.checked = layout.collapsed.includes(control.dataset.layoutCollapsed);
            });
        };
        const commitLayout = (message = "Saved locally.") => {
            layout = normalizeProfileLayout(layout);
            applyProfileLayout(layout);
            syncSettings();
            const saved = saveProfileLayout(layout);
            showStatus(saved ? message : "Browser storage is unavailable.", !saved);
        };
        const setSettingsOpen = (open) => {
            settings.hidden = !open;
            settingsToggle.setAttribute("aria-expanded", String(open));
        };
        const setCustomizing = (enabled) => {
            grid.classList.toggle("is-customizing", enabled);
            customize.setAttribute("aria-pressed", String(enabled));
            customize.querySelector("span").textContent = enabled ? "Done customizing" : "Customize layout";
            reset.hidden = !enabled;
            grid.querySelectorAll("[data-layout-drag]").forEach((handle) => {
                handle.draggable = enabled;
            });
        };

        applyProfileLayout(layout);
        syncSettings();

        settingsToggle.addEventListener("click", () => setSettingsOpen(settings.hidden));
        settingsClose?.addEventListener("click", () => setSettingsOpen(false));
        customize.addEventListener("click", () => setCustomizing(!grid.classList.contains("is-customizing")));

        reset.addEventListener("click", () => {
            layout = normalizeProfileLayout();
            localStorage.removeItem(PROFILE_LAYOUT_STORAGE_KEY);
            applyProfileLayout(layout);
            syncSettings();
            showStatus("Default layout restored.");
        });

        density?.addEventListener("change", () => {
            layout.density = density.value;
            commitLayout("Display density saved.");
        });

        settings.querySelectorAll("[data-layout-visible]").forEach((control) => {
            control.addEventListener("change", () => {
                const key = control.dataset.layoutVisible;
                layout.hidden = control.checked
                    ? layout.hidden.filter((item) => item !== key)
                    : [...new Set([...layout.hidden, key])];
                commitLayout(`${control.checked ? "Shown" : "Hidden"} locally.`);
            });
        });

        settings.querySelectorAll("[data-layout-collapsed]").forEach((control) => {
            control.addEventListener("change", () => {
                const key = control.dataset.layoutCollapsed;
                layout.collapsed = control.checked
                    ? [...new Set([...layout.collapsed, key])]
                    : layout.collapsed.filter((item) => item !== key);
                commitLayout(`${control.checked ? "Collapsed" : "Expanded"} locally.`);
            });
        });

        settings.querySelectorAll("[data-layout-panel-reset]").forEach((button) => {
            button.addEventListener("click", () => {
                const key = button.dataset.layoutPanelReset;
                layout.hidden = layout.hidden.filter((item) => item !== key);
                layout.collapsed = layout.collapsed.filter((item) => item !== key);
                commitLayout(`${key} panel reset.`);
            });
        });

        exportButton?.addEventListener("click", () => {
            const payload = JSON.stringify({ version: 2, settings: normalizeProfileLayout(layout) }, null, 2);
            const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "samelcii-profile-layout.json";
            link.click();
            URL.revokeObjectURL(url);
            showStatus("Layout settings exported.");
        });

        importButton?.addEventListener("click", () => importFile?.click());
        importFile?.addEventListener("change", async () => {
            const file = importFile.files?.[0];
            importFile.value = "";
            if (!file) return;
            if (file.size > 64 * 1024) {
                showStatus("Settings file is too large.", true);
                return;
            }
            try {
                const parsed = JSON.parse(await file.text());
                layout = normalizeProfileLayout(parsed.settings || parsed);
                commitLayout("Layout settings imported.");
            } catch (_error) {
                showStatus("Invalid layout settings file.", true);
            }
        });

        grid.querySelectorAll("[data-layout-drag]").forEach((handle) => {
            handle.addEventListener("dragstart", (event) => {
                if (!grid.classList.contains("is-customizing")) {
                    event.preventDefault();
                    return;
                }
                dragScope = handle.dataset.layoutDrag;
                dragged = dragScope === "main"
                    ? handle.closest("[data-layout-widget]")
                    : handle.closest("[data-side-widget]");
                if (!dragged) return;
                dragged.classList.add("is-layout-dragging");
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", dragScope);
            });
            handle.addEventListener("dragend", () => {
                dragged?.classList.remove("is-layout-dragging");
                grid.querySelectorAll(".is-layout-drop-target").forEach((item) => item.classList.remove("is-layout-drop-target"));
                dragged = null;
                dragScope = "";
            });
        });

        grid.addEventListener("dragover", (event) => {
            if (!dragged) return;
            const target = dragScope === "main"
                ? event.target.closest("[data-layout-widget]")
                : event.target.closest("[data-side-widget]");
            if (!target || target === dragged || !grid.contains(target)) return;
            event.preventDefault();
            grid.querySelectorAll(".is-layout-drop-target").forEach((item) => item.classList.remove("is-layout-drop-target"));
            target.classList.add("is-layout-drop-target");
        });

        grid.addEventListener("drop", (event) => {
            if (!dragged) return;
            const attribute = dragScope === "main" ? "layoutWidget" : "sideWidget";
            const selector = dragScope === "main" ? "[data-layout-widget]" : "[data-side-widget]";
            const target = event.target.closest(selector);
            if (!target || target === dragged || !grid.contains(target)) return;
            event.preventDefault();
            const listName = dragScope === "main" ? "order" : "sideOrder";
            const from = layout[listName].indexOf(dragged.dataset[attribute]);
            const to = layout[listName].indexOf(target.dataset[attribute]);
            if (from < 0 || to < 0) return;
            [layout[listName][from], layout[listName][to]] = [layout[listName][to], layout[listName][from]];
            commitLayout("Panel order saved.");
        });

        grid.querySelectorAll('[data-layout-resize="left"], [data-layout-resize="right"]').forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                if (!grid.classList.contains("is-customizing") || window.innerWidth <= 1180) return;
                event.preventDefault();
                const side = handle.dataset.layoutResize;
                const startX = event.clientX;
                const startValue = layout[side];
                const direction = side === "left" ? 1 : -1;
                grid.classList.add("is-resizing");
                handle.setPointerCapture(event.pointerId);

                const move = (moveEvent) => {
                    const limit = side === "left" ? 520 : 460;
                    const maximum = Math.max(220, Math.min(limit, grid.clientWidth - 520));
                    layout[side] = Math.round(Math.min(maximum, Math.max(220, startValue + ((moveEvent.clientX - startX) * direction))));
                    applyProfileLayout(layout);
                };
                const finish = () => {
                    grid.classList.remove("is-resizing");
                    handle.removeEventListener("pointermove", move);
                    handle.removeEventListener("pointerup", finish);
                    handle.removeEventListener("pointercancel", finish);
                    commitLayout("Column width saved.");
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", finish);
                handle.addEventListener("pointercancel", finish);
            });
        });

        const sideResize = grid.querySelector('[data-layout-resize="sideSplit"]');
        sideResize?.addEventListener("pointerdown", (event) => {
            if (!grid.classList.contains("is-customizing") || sideResize.hidden) return;
            event.preventDefault();
            const sideShell = sideResize.closest(".side-shell");
            const startY = event.clientY;
            const startValue = layout.sideSplit;
            const height = Math.max(1, sideShell.clientHeight);
            grid.classList.add("is-resizing-side");
            sideResize.setPointerCapture(event.pointerId);
            const move = (moveEvent) => {
                layout.sideSplit = Math.min(78, Math.max(28, startValue + (((moveEvent.clientY - startY) / height) * 100)));
                applyProfileLayout(layout);
            };
            const finish = () => {
                grid.classList.remove("is-resizing-side");
                sideResize.removeEventListener("pointermove", move);
                sideResize.removeEventListener("pointerup", finish);
                sideResize.removeEventListener("pointercancel", finish);
                commitLayout("Side panel height saved.");
            };
            sideResize.addEventListener("pointermove", move);
            sideResize.addEventListener("pointerup", finish);
            sideResize.addEventListener("pointercancel", finish);
        });
    }

    initializeProfileLayout();
    setText("profile-clock", formatNow());
    setText("employee-name", employee.name || session.name || session.username || "SAMELCO II Employee");
    setText("employee-role", "User");
    setText("employee-position", session.position || employee.position || "Department Staff");
    setText("employee-email", session.emailadd || employee.email || `${(session.username || "employee").toLowerCase()}@samelcoii.com`);
    setText("employee-phone", session.mobile_number || employee.contact || employee.phone || "(+63) 917 255 5843");
    setText("employee-id", employee.usercode || session.usercode || "S2-0000");
    setText("employee-department", employee.department || session.department || "Administration");
    setText("employee-assignment", employee.area || session.area || "Main Office");
    setProfileAvatar();
    loadMyAccountabilityBorrowed();
    setText("employee-hire-date", employee.hiredate || "August 28, 2013");
    setText("employee-tenure", "7 years, 1 month");
    setText("employee-birthdate", employee.birthdate || "12/12/95");
    setText("employee-address", employee.address || "Paranas, Samar");
    setText("employee-street2", employee.street2 || "N/A");
    setText("employee-city", employee.city || "Paranas");
    setText("employee-province", employee.province || "Samar");

    const avatarChangeButton = document.getElementById("profile-avatar-change");
    const avatarInput = document.getElementById("profile-avatar-input");
    const avatarCropStage = document.getElementById("avatar-crop-stage");
    const avatarCropZoom = document.getElementById("avatar-crop-zoom");
    const avatarCropSave = document.getElementById("avatar-crop-save");
    const avatarCropCancel = document.getElementById("avatar-crop-cancel");
    const avatarCropClose = document.getElementById("avatar-crop-close");
    if (avatarChangeButton && avatarInput) {
        avatarChangeButton.addEventListener("click", () => avatarInput.click());
        avatarInput.addEventListener("change", async () => {
            const file = avatarInput.files && avatarInput.files[0];
            if (!file) {
                return;
            }

            try {
                await openAvatarCropModal(file);
            } catch (error) {
                window.alert(error.message || "Profile photo could not be updated.");
            } finally {
                avatarInput.value = "";
            }
        });
    }
    if (avatarCropStage) {
        avatarCropStage.addEventListener("pointerdown", (event) => {
            if (!avatarCropState) {
                return;
            }
            avatarCropState.dragging = true;
            avatarCropState.dragStartX = event.clientX;
            avatarCropState.dragStartY = event.clientY;
            avatarCropState.startX = avatarCropState.x;
            avatarCropState.startY = avatarCropState.y;
            avatarCropStage.setPointerCapture(event.pointerId);
        });
        avatarCropStage.addEventListener("pointermove", (event) => {
            if (!avatarCropState?.dragging) {
                return;
            }
            avatarCropState.x = avatarCropState.startX + event.clientX - avatarCropState.dragStartX;
            avatarCropState.y = avatarCropState.startY + event.clientY - avatarCropState.dragStartY;
            clampAvatarCrop();
            renderAvatarCrop();
        });
        avatarCropStage.addEventListener("pointerup", () => {
            if (avatarCropState) {
                avatarCropState.dragging = false;
            }
        });
    }
    if (avatarCropZoom) {
        avatarCropZoom.addEventListener("input", () => {
            if (!avatarCropState) {
                return;
            }
            avatarCropState.zoom = Number(avatarCropZoom.value || 1);
            clampAvatarCrop();
            renderAvatarCrop();
        });
    }
    [avatarCropCancel, avatarCropClose].forEach((button) => {
        if (button) {
            button.addEventListener("click", closeAvatarCropModal);
        }
    });
    if (avatarCropSave) {
        avatarCropSave.addEventListener("click", async () => {
            avatarCropSave.disabled = true;
            avatarCropSave.textContent = "Saving...";
            try {
                await uploadProfilePhoto();
                closeAvatarCropModal();
            } catch (error) {
                window.alert(error.message || "Profile photo could not be updated.");
            } finally {
                avatarCropSave.disabled = false;
                avatarCropSave.textContent = "Save Photo";
            }
        });
    }

    const editProfileModal = document.getElementById("edit-profile-modal");
    const editProfileOpen = document.getElementById("profile-edit-open");
    const editProfileClose = document.getElementById("edit-profile-close");
    const editProfileCancel = document.getElementById("edit-profile-cancel");
    const editProfileForm = document.getElementById("edit-profile-form");
    const editProfileMobile = document.getElementById("edit-profile-mobile");
    const editProfileEmail = document.getElementById("edit-profile-email");
    const editProfileMessage = document.getElementById("edit-profile-message");
    const editProfileSave = document.getElementById("edit-profile-save");

    function closeEditProfileModal() {
        if (!editProfileModal) return;
        editProfileModal.classList.remove("active");
        editProfileModal.setAttribute("aria-hidden", "true");
    }

    function openEditProfileModal() {
        if (!editProfileModal) return;
        if (editProfileMobile) editProfileMobile.value = session.mobile_number || employee.contact || employee.phone || "";
        if (editProfileEmail) editProfileEmail.value = session.emailadd || employee.email || "";
        if (editProfileMessage) editProfileMessage.hidden = true;
        editProfileModal.classList.add("active");
        editProfileModal.setAttribute("aria-hidden", "false");
        editProfileMobile?.focus();
    }

    if (editProfileOpen) editProfileOpen.addEventListener("click", openEditProfileModal);
    [editProfileClose, editProfileCancel].forEach((button) => {
        if (button) button.addEventListener("click", closeEditProfileModal);
    });
    if (editProfileModal) {
        editProfileModal.addEventListener("click", (event) => {
            if (event.target === editProfileModal) closeEditProfileModal();
        });
    }

    if (editProfileForm) {
        editProfileForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!editProfileSave || !editProfileMessage) return;
            editProfileSave.disabled = true;
            editProfileSave.textContent = "Saving...";
            editProfileMessage.hidden = true;
            try {
                const response = await fetch(`${AUTH_API}/update-profile`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                    body: JSON.stringify({
                        mobile_number: editProfileMobile ? editProfileMobile.value.trim() : "",
                        email: editProfileEmail ? editProfileEmail.value.trim() : "",
                    }),
                });
                const payload = await response.json().catch(() => ({ ok: false, message: "Invalid response." }));
                if (!response.ok || !payload.ok) {
                    throw new Error(payload.message || "Profile could not be updated.");
                }

                session.mobile_number = payload.user?.mobile_number || "";
                session.emailadd = payload.user?.emailadd || "";
                employee.mobile_number = session.mobile_number;
                employee.emailadd = session.emailadd;
                localStorage.setItem("samelcii_session", JSON.stringify(session));
                const updatedUsers = users.map((item) => {
                    const sameUser = Number(item.id || item.Id || 0) === Number(session.id || 0) ||
                        String(item.usercode || "").toLowerCase() === String(session.usercode || "").toLowerCase();
                    return sameUser ? { ...item, mobile_number: session.mobile_number, emailadd: session.emailadd } : item;
                });
                localStorage.setItem("samelcii_users", JSON.stringify(updatedUsers));

                setText("employee-email", session.emailadd || `${(session.username || "employee").toLowerCase()}@samelcoii.com`);
                setText("employee-phone", session.mobile_number || "(+63) 917 255 5843");

                editProfileMessage.textContent = "Saved.";
                editProfileMessage.className = "edit-profile-message is-success";
                editProfileMessage.hidden = false;
                setTimeout(closeEditProfileModal, 700);
            } catch (error) {
                editProfileMessage.textContent = error.message || "Profile could not be updated.";
                editProfileMessage.className = "edit-profile-message is-error";
                editProfileMessage.hidden = false;
            } finally {
                editProfileSave.disabled = false;
                editProfileSave.textContent = "Save";
            }
        });
    }

    populateDtrMonthControls();
    renderDtrSheet();

    // GABAY: default view lang sa fresh load; manual click ang magbubukas ng forms.
    setActiveQuickAction("dtr");

    ["dtr-month-select", "dtr-year-select"].forEach((id) => {
        const control = document.getElementById(id);
        if (control) {
            control.addEventListener("change", () => {
                renderDtrSheet();
            });
        }
    });

    document.querySelectorAll(".quick-action-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const form = button.getAttribute("data-form");
            setActiveQuickAction(form === "epass-travel" ? "epass-travel" : form);
            if (form === "epass-travel") {
                closeFormModal();
                syncFuelChoiceButtons();
                const available = getAvailableFuelChoice();
                if (available === "epass" || available === "travel") {
                    openFormModal(available);
                    return;
                }
                openEpassTravelPicker();
                return;
            }
            closeEpassTravelPicker();
            openFormModal(form);
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            const overtimeOverlay = document.getElementById("overtime-list-overlay");
            if (overtimeOverlay && overtimeOverlay.classList.contains("is-open")) {
                setOvertimeListOverlayOpen(false);
                return;
            }
            const picker = document.getElementById("epass-travel-picker-modal");
            if (picker && picker.classList.contains("active")) {
                closeEpassTravelPicker();
                return;
            }
            closeFormModal();
            closeAvatarCropModal();
            closeEditProfileModal();
        }
    });

    const avatarCropModal = document.getElementById("avatar-crop-modal");
    if (avatarCropModal) {
        avatarCropModal.addEventListener("click", (event) => {
            if (event.target === avatarCropModal) {
                closeAvatarCropModal();
            }
        });
    }

    const closeBtn = document.getElementById("profile-form-close");
    if (closeBtn) {
        closeBtn.addEventListener("click", closeFormModal);
    }

    const epassTravelPicker = document.getElementById("epass-travel-picker-modal");
    if (epassTravelPicker) {
        epassTravelPicker.addEventListener("click", (event) => {
            if (event.target === epassTravelPicker) {
                closeEpassTravelPicker();
            }
        });
    }
    const epassTravelPickerClose = document.getElementById("epass-travel-picker-close");
    if (epassTravelPickerClose) {
        epassTravelPickerClose.addEventListener("click", closeEpassTravelPicker);
    }
    // GABAY: `?embedTravel=1` / `?embedEpass=1` â€” Fuel module iframe; parehong EPASS/Travel form sa Employee Profile.
    function applyEmbedFromFuelQuery() {
        readFuelEmbedContext();
        let embedEpass = false;
        let embedTravel = false;
        try {
            const params = new URLSearchParams(window.location.search);
            embedEpass = params.get("embedEpass") === "1";
            embedTravel = params.get("embedTravel") === "1";
        } catch (_error) {
            embedEpass = false;
            embedTravel = false;
        }
        if (!embedEpass && !embedTravel) {
            return;
        }
        document.body.classList.add("profile-embed-fuel");
        if (embedEpass) {
            document.body.classList.add("profile-embed-epass");
            epassHistoryCollapsed = false;
            setActiveQuickAction("epass");
            openFormModal("epass");
            return;
        }
        document.body.classList.add("profile-embed-travel");
        setActiveQuickAction("travel");
        openFormModal("travel");
    }

    applyEmbedFromFuelQuery();

    // GABAY: `?tab=epass|leave|travel` — standalone sidebar entries (Epass/Leave/Travel) na hindi
    // dumaan sa Fuel iframe embed; sinusundan lang ang openFormModal() na existing na, walang bagong flow.
    function applyStandaloneTabFromQuery() {
        if (document.body.classList.contains("profile-embed-fuel")) {
            return; // ponytail: Fuel embed query already handled the modal open above; avoid double-trigger.
        }
        let tab = "";
        try {
            tab = String(new URLSearchParams(window.location.search).get("tab") || "").trim().toLowerCase();
        } catch (_error) {
            tab = "";
        }
        if (tab !== "epass" && tab !== "leave" && tab !== "travel") {
            return;
        }
        setActiveQuickAction(tab);
        openFormModal(tab);
    }

    applyStandaloneTabFromQuery();

    document.querySelectorAll(".epass-travel-choice").forEach((choice) => {
        choice.addEventListener("click", () => {
            const pick = choice.getAttribute("data-pick");
            closeEpassTravelPicker();
            if (pick === "epass" || pick === "travel") {
                setActiveQuickAction(pick);
                openFormModal(pick);
            }
        });
    });

    // GABAY: Dashboard Fuel list â€” TRAVEL tile ay nagpo-postMessage dito para buksan ang Travel form.
    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) {
            return;
        }
        const payload = event.data;
        if (!payload || typeof payload !== "object") {
            return;
        }
        const profileFormOpens = {
            "samelcii-open-travel": "travel",
            "samelcii-open-leave": "leave",
            "samelcii-open-overtime": "overtime"
        };
        const openForm = profileFormOpens[payload.type];
        if (openForm) {
            closeEpassTravelPicker();
            setActiveQuickAction(openForm);
            openFormModal(openForm);
        }
    });
})();
