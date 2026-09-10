// Messenger module ito; dito baguhin ang chat at polling flow.
(function () {
    // FIX: resolve relative to this page so it works under both the /SAMELCII_WEB_SYSTEM/ path (IP access) and the samelcii.local vhost (docroot = app root). Hardcoding /SAMELCII_WEB_SYSTEM 404s under the vhost.
    const PAGE_ROOT = new URL("../../../", window.location.href).toString().replace(/\/$/, "");
    const CURRENT_NODE_API_BASE = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api`;
    const NODE_API_BASE = (typeof window !== "undefined" && window.SAMELCII_NODE_API_BASE)
        || CURRENT_NODE_API_BASE;
    const API = `${NODE_API_BASE}/messenger`;
    const MAX_MESSAGE_CHARS = 1000;
    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    const MESSENGER_POLL_MS = 8000;
    // ponytail: "standby" here means no mouse/keyboard/touch activity, not just a hidden tab —
    // a visible-but-unattended tab (e.g. left open while using a different browser window) was
    // still polling every 8s and reporting itself active forever. 2 minutes idle stops polling
    // entirely; any activity (or the tab becoming visible again) resumes it immediately.
    const IDLE_AFTER_MS = 2 * 60 * 1000;
    const sessionRaw = localStorage.getItem("samelcii_session");
    const session = sessionRaw ? JSON.parse(sessionRaw) : {};
    const currentUserId = Number(session.id || 0);
    const currentUserCode = String(session.usercode || session.accountnumber || "").trim();

    // EDIT GUIDE: override SAMELCII_AI_API only when SAM moves to another approved same-origin route.
    // HUWAG BAGUHIN: SAM and Messenger share the same Node API host.
    const AI_API = (typeof window !== "undefined" && window.SAMELCII_AI_API)
        || `${NODE_API_BASE}/sam/reply`;

    const state = {
        conversations: [],
        activeConversationId: null,
        searchTimer: null,
        localStream: null,
        activeCallId: null,
        lastMessageSignature: "",
        lastConversationSignature: "",
        isPolling: false,
        isIdle: false,
        pollTimer: null,
        idleTimer: null,
        aiUserId: 0,
        thinkingInterval: null,
        messages: [],
        replyTo: null,
        forwardingMessageId: null,
        lastUnreadTotal: null,
        audioContext: null,
        audioUnlocked: false,
        groupMode: false,
        groupMembers: new Map()
    };

    const title = document.getElementById("chat-title");
    const status = document.getElementById("chat-status");
    const roomAvatar = document.getElementById("room-avatar");
    const memberStack = document.getElementById("member-stack");
    const thread = document.getElementById("message-thread");
    const form = document.getElementById("message-form");
    const replyPreview = document.getElementById("reply-preview");
    const input = document.getElementById("message-input");
    const list = document.getElementById("conversation-list");
    const refreshButton = document.getElementById("refresh-conversations");
    const employeeSearch = document.getElementById("employee-search");
    const startChatForm = document.getElementById("start-chat-form");
    const userResults = document.getElementById("user-results");
    const groupCreatePanel = document.getElementById("group-create-panel");
    const groupNameInput = document.getElementById("group-name-input");
    const groupSelection = document.getElementById("group-selection");
    const groupSelectionCount = document.getElementById("group-selection-count");
    const newGroupButton = document.getElementById("new-group-button");
    const createGroupButton = document.getElementById("create-group-button");
    const cancelGroupButton = document.getElementById("cancel-group-button");
    const attachImageButton = document.getElementById("attach-image");
    const imageInput = document.getElementById("image-input");
    const startAudioCallButton = document.getElementById("start-audio-call");
    const startVideoCallButton = document.getElementById("start-video-call");
    const addToGroupButton = document.getElementById("add-to-group-button");
    const callModal = document.getElementById("call-modal");
    const localVideo = document.getElementById("local-video");
    const audioCallIcon = document.getElementById("audio-call-icon");
    const callTitle = document.getElementById("call-title");
    const callStatusMessage = document.getElementById("call-status-message");
    const closeCallButton = document.getElementById("close-call");
    const endCallButton = document.getElementById("end-call");
    const toggleMicButton = document.getElementById("toggle-mic");
    const toggleCameraButton = document.getElementById("toggle-camera");
    const imageModal = document.getElementById("image-modal");
    const previewImage = document.getElementById("preview-image");
    const closeImageModal = document.getElementById("close-image-modal");
    const forwardModal = document.getElementById("forward-modal");
    const forwardList = document.getElementById("forward-list");
    const closeForwardModalButton = document.getElementById("close-forward-modal");

    function initials(value) {
        const words = String(value || "M").trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
            return "M";
        }
        return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
    }

    function formatTime(value) {
        if (!value) {
            return "";
        }
        const date = new Date(String(value).replace(" ", "T"));
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function unreadTotal(conversations = state.conversations) {
        return conversations.reduce((total, conversation) => total + Number(conversation.unread_count || 0), 0);
    }

    function getAudioContext() {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            return null;
        }
        if (!state.audioContext) {
            state.audioContext = new AudioContextCtor();
        }
        return state.audioContext;
    }

    function unlockMessageAudio() {
        const context = getAudioContext();
        if (!context) {
            return;
        }
        if (context.state === "suspended") {
            context.resume().catch(() => {});
        }
        state.audioUnlocked = true;
    }

    function playNewMessageSound() {
        const context = getAudioContext();
        if (!context || !state.audioUnlocked) {
            return;
        }
        if (context.state === "suspended") {
            context.resume().catch(() => {});
        }

        const now = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
        gain.connect(context.destination);

        [
            { frequency: 740, start: 0, duration: 0.13 },
            { frequency: 980, start: 0.15, duration: 0.17 },
        ].forEach((note) => {
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
            oscillator.connect(gain);
            oscillator.start(now + note.start);
            oscillator.stop(now + note.start + note.duration);
        });
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function resolveMediaUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
        let clean = raw.replace(/^\/+/, "");
        while (/^SAMELCII_WEB_SYSTEM\/+/i.test(clean)) {
            clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, "");
        }
        clean = clean.replace(/^uploads\//i, "uploads/");
        // FIX: media is served same-origin by Apache under /SAMELCII_WEB_SYSTEM; don't fall back to the :3000 Node server (CORS/broken images).
        const base = window.SAMELCII_MEDIA_BASE || PAGE_ROOT;
        return `${base}/${clean}`;
    }

    function samLogoUrl() {
        return resolveMediaUrl("uploads/profile-photos/sam-ai-avatar-v2.png?v=20260615-sam-live-v1");
    }

    function defaultAvatarUrl(profile = {}, label = "") {
        const base = window.SAMELCII_MEDIA_BASE || PAGE_ROOT;
        const genderValue = String(profile.gender || profile.sex || "").trim().toLowerCase();
        if (/^(f|female|girl|woman)$/.test(genderValue)) {
            return `${base}/assets/images/avatar-female.jpg`;
        }
        if (/^(m|male|boy|man)$/.test(genderValue)) {
            return `${base}/assets/images/avatar-male.jpg`;
        }
        const idValue = Number(profile.id || profile.user_id || profile.Id || 0);
        if (Number.isFinite(idValue) && idValue > 0) {
            return `${base}/assets/images/${idValue % 2 === 0 ? "avatar-male.jpg" : "avatar-female.jpg"}`;
        }
        const nameValue = String(label || profile.name || "").trim().toLowerCase();
        return `${base}/assets/images/${nameValue.length % 2 === 0 ? "avatar-male.jpg" : "avatar-female.jpg"}`;
    }

    function samProfile(profile = {}) {
        return {
            ...profile,
            name: "SAM",
            usercode: profile.usercode || "__samelco_ai__",
            position: profile.position || "AI Assistant",
            department: profile.department || "SAMELCII System",
            photo_url: samLogoUrl()
        };
    }

    function isSamAiProfile(profile = {}) {
        const usercode = String(profile.usercode || "").trim().toLowerCase();
        const name = String(profile.name || "").trim().toLowerCase();
        const position = String(profile.position || "").trim().toLowerCase();
        return usercode === "__samelco_ai__"
            || (name === "sam" && position === "ai assistant");
    }

    function getAuthHeaders(extraHeaders = {}) {
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
    }

    function messageSnippet(itemOrText, fallback = "Message") {
        const raw = typeof itemOrText === "string"
            ? itemOrText
            : (itemOrText?.MessageText || (Array.isArray(itemOrText?.Attachments) && itemOrText.Attachments.length ? "[Attachment]" : fallback));
        const text = String(raw || fallback)
            .replace(/\[SAM_TABLE\][\s\S]*?\[\/SAM_TABLE\]/g, "[Table report]")
            .replace(/^Download:\s*/gim, "")
            .replace(/\s+/g, " ")
            .trim();
        return text.length > 110 ? `${text.slice(0, 107)}...` : (text || fallback);
    }

    function profileAttrs(profile = {}) {
        const name = profile.name || "";
        const usercode = profile.usercode || "";
        const position = profile.position || "";
        const department = profile.department || "";
        const photoUrl = resolveMediaUrl(profile.photo_url || "") || defaultAvatarUrl(profile, name);
        return `data-profile-name="${escapeHtml(name)}" data-profile-usercode="${escapeHtml(usercode)}" data-profile-position="${escapeHtml(position)}" data-profile-department="${escapeHtml(department)}" data-profile-photo="${escapeHtml(photoUrl)}"`;
    }

    function avatarMarkup(label, photoUrl, className = "avatar gradient-pink", profile = {}, showProfile = true) {
        const safeLabel = escapeHtml(initials(label));
        const resolvedPhotoUrl = resolveMediaUrl(photoUrl || profile.photo_url || "");
        const isSam = isSamAiProfile(profile) || String(label || "").trim().toLowerCase() === "sam";
        const profileData = {
            ...profile,
            name: profile.name || label || "",
            photo_url: isSam ? samLogoUrl() : (resolvedPhotoUrl || defaultAvatarUrl(profile, label))
        };
        const triggerClass = showProfile ? " profile-avatar-trigger" : "";
        const triggerAttrs = showProfile ? ` role="button" tabindex="0" ${profileAttrs(profileData)}` : "";
        const finalPhotoUrl = escapeHtml(isSam ? samLogoUrl() : (resolvedPhotoUrl || defaultAvatarUrl(profileData, label)));
        if (finalPhotoUrl) {
            return `<span class="${className} photo-avatar${isSam ? " sam-avatar-live" : ""}${triggerClass}"${triggerAttrs} style="background-image:url('${finalPhotoUrl}')"><span class="avatar-fallback">${safeLabel}</span><img src="${finalPhotoUrl}" alt="${escapeHtml(label || "Profile photo")}" loading="lazy" onerror="const parent=this.parentElement;if(parent){parent.classList.remove('photo-avatar');parent.style.backgroundImage='none';}this.remove();" /></span>`;
        }
        return `<span class="${className}${triggerClass}"${triggerAttrs}>${safeLabel}</span>`;
    }

    function setAvatarNode(node, label, photoUrl, profile = {}, showProfile = true) {
        if (!node) {
            return;
        }
        const profileData = {
            ...profile,
            name: profile.name || label || "",
            photo_url: resolveMediaUrl(profile.photo_url || photoUrl || "") || defaultAvatarUrl(profile, label)
        };
        const isSam = isSamAiProfile(profileData) || String(label || "").trim().toLowerCase() === "sam";
        node.classList.toggle("profile-avatar-trigger", showProfile);
        node.classList.toggle("sam-avatar-live", isSam);
        if (showProfile) {
            node.setAttribute("role", "button");
            node.tabIndex = 0;
            node.dataset.profileName = profileData.name;
            node.dataset.profileUsercode = profileData.usercode || "";
            node.dataset.profilePosition = profileData.position || "";
            node.dataset.profileDepartment = profileData.department || "";
            node.dataset.profilePhoto = isSam ? samLogoUrl() : (profileData.photo_url || "");
        } else {
            node.removeAttribute("role");
            node.removeAttribute("tabindex");
            delete node.dataset.profileName;
            delete node.dataset.profileUsercode;
            delete node.dataset.profilePosition;
            delete node.dataset.profileDepartment;
            delete node.dataset.profilePhoto;
        }
        const resolvedPhotoUrl = isSam ? samLogoUrl() : (resolveMediaUrl(photoUrl) || defaultAvatarUrl(profileData, label));
        if (resolvedPhotoUrl) {
            node.classList.add("photo-avatar");
            node.style.backgroundImage = `url('${resolvedPhotoUrl.replace(/'/g, "%27")}')`;
            node.innerHTML = `<span class="avatar-fallback">${escapeHtml(initials(label))}</span><img src="${escapeHtml(resolvedPhotoUrl)}" alt="${escapeHtml(label || "Profile photo")}" loading="lazy" onerror="const parent=this.parentElement;if(parent){parent.classList.remove('photo-avatar');parent.style.backgroundImage='none';}this.remove();" />`;
        } else {
            node.classList.remove("photo-avatar");
            node.style.backgroundImage = "none";
            node.textContent = initials(label);
        }
    }

    function getProfileFromAvatar(target) {
        const profile = {
            name: target.dataset.profileName || "Employee",
            usercode: target.dataset.profileUsercode || "",
            position: target.dataset.profilePosition || "",
            department: target.dataset.profileDepartment || "",
            photo_url: target.dataset.profilePhoto || ""
        };
        return isSamAiProfile(profile) ? samProfile(profile) : profile;
    }

    function clearUserResults() {
        if (userResults) {
            userResults.innerHTML = "";
        }
    }

    function updateGroupSelectionUI() {
        if (!groupSelection || !groupSelectionCount) {
            return;
        }

        const members = Array.from(state.groupMembers.values());
        groupSelectionCount.textContent = `${members.length} selected`;
        groupSelection.innerHTML = members.length
            ? members.map((member) => `
                <button type="button" class="group-member-chip" data-user-id="${member.id}">
                    <span>${escapeHtml(member.name || member.usercode || "User")}</span>
                    <i class="fa fa-times"></i>
                </button>
            `).join("")
            : '<div class="empty-state compact">Pick at least two people for the group.</div>';

        if (createGroupButton) {
            createGroupButton.disabled = members.length < 2;
        }
    }

    function setGroupMode(enabled) {
        state.groupMode = Boolean(enabled);
        if (groupCreatePanel) {
            groupCreatePanel.hidden = !state.groupMode;
        }
        if (!state.groupMode) {
            state.groupMembers.clear();
            if (groupNameInput) {
                groupNameInput.value = "";
            }
        }
        updateGroupSelectionUI();
        clearUserResults();
    }

    function toggleGroupMember(member) {
        const id = Number(member?.id || 0);
        if (!id) {
            return;
        }
        if (state.groupMembers.has(id)) {
            state.groupMembers.delete(id);
        } else {
            state.groupMembers.set(id, {
                id,
                name: member.name || member.username || member.usercode || "User",
                usercode: member.usercode || "",
                position: member.position || "",
                department: member.department || "",
                profile_photo_url: member.profile_photo_url || ""
            });
        }
        updateGroupSelectionUI();
    }

    function ensureGroupMember(member) {
        const id = Number(member?.id || 0);
        if (!id || state.groupMembers.has(id)) {
            return;
        }
        toggleGroupMember(member);
    }

    function getActiveConversation() {
        return state.conversations.find((item) => Number(item.id) === Number(state.activeConversationId)) || null;
    }

    function getConversationSeedProfile(conversation) {
        const profiles = Array.isArray(conversation?.profiles) ? conversation.profiles : [];
        return profiles.find((profile) => Number(profile.id) !== currentUserId) || profiles[0] || null;
    }

    function updateAddToGroupButtonState() {
        if (!addToGroupButton) {
            return;
        }
        const conversation = getActiveConversation();
        const seedProfile = getConversationSeedProfile(conversation);
        const enabled = Boolean(conversation && seedProfile && !conversation.is_group && !conversation.is_ai_conversation);
        addToGroupButton.disabled = !enabled;
        addToGroupButton.title = enabled
            ? `Add ${seedProfile.name || seedProfile.usercode || "employee"} to a new group`
            : "Open a direct chat to seed a new group";
    }

    function seedActiveConversationIntoGroup() {
        const conversation = getActiveConversation();
        const seedProfile = getConversationSeedProfile(conversation);
        if (!conversation || !seedProfile || conversation.is_group || conversation.is_ai_conversation) {
            renderEmpty("Open a direct chat with an employee first, then use Add to group.");
            return;
        }

        setGroupMode(true);
        ensureGroupMember(seedProfile);
        employeeSearch.focus();
    }

    function profilePopover() {
        let popover = document.getElementById("messenger-profile-popover");
        if (!popover) {
            popover = document.createElement("div");
            popover.id = "messenger-profile-popover";
            popover.className = "profile-popover";
            document.body.appendChild(popover);
        }
        return popover;
    }

    function showProfilePopover(target) {
        const profile = getProfileFromAvatar(target);
        const isSam = isSamAiProfile(profile);
        const popover = profilePopover();
        popover.innerHTML = `
            <div class="profile-popover-head">
                ${avatarMarkup(profile.name, profile.photo_url, isSam ? "avatar ai-avatar" : "avatar gradient-blue", profile, false)}
                <div>
                    <strong>${escapeHtml(profile.name)}</strong>
                    <span>${escapeHtml(isSam ? "AI Assistant" : (profile.usercode || "No employee ID"))}</span>
                </div>
            </div>
            <div class="profile-popover-info">
                <span>Position</span>
                <strong>${escapeHtml(profile.position || "-")}</strong>
                <span>Department</span>
                <strong>${escapeHtml(profile.department || "-")}</strong>
            </div>
        `;

        const rect = target.getBoundingClientRect();
        const popoverWidth = 280;
        const left = Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, rect.left + rect.width + 10));
        const top = Math.max(10, Math.min(window.innerHeight - 180, rect.top - 8));
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.classList.add("active");
    }

    function hideProfilePopover() {
        const popover = document.getElementById("messenger-profile-popover");
        if (popover) {
            popover.classList.remove("active");
        }
    }

    async function request(action, options) {
        const method = options?.method || "GET";
        const params = new URLSearchParams({ action });

        if (options?.params) {
            Object.entries(options.params).forEach(([key, value]) => params.set(key, String(value)));
        }

        const fetchOptions = { method };
        let url = `${API}?${params.toString()}`;

        if (method === "POST") {
            const body = new FormData();
            body.append("action", action);
            Object.entries(options?.body || {}).forEach(([key, value]) => body.append(key, String(value)));
            fetchOptions.body = body;
            url = API;
        }

        fetchOptions.headers = getAuthHeaders(fetchOptions.headers || {});
        const response = await fetch(url, fetchOptions);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Messenger request failed.");
        }
        return payload;
    }

    async function postForm(action, body) {
        const formData = new FormData();
        formData.append("action", action);
        Object.entries(body || {}).forEach(([key, value]) => formData.append(key, value));

        const response = await fetch(API, {
            method: "POST",
            credentials: "same-origin",
            headers: getAuthHeaders(),
            body: formData
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "Messenger request failed.");
        }
        return payload;
    }

    function renderEmpty(message) {
        thread.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    }

    function inlineMessageHtml(value) {
        return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    function isImportantLine(value) {
        return /^\*{0,2}(important|note|action|warning|login issue|dtr issue|fuel issue|epass issue|leave issue|profile issue):/i.test(value.trim());
    }

    function formatPlainReply(value) {
        const tableHtml = formatSamTableReply(value);
        if (tableHtml) {
            return tableHtml;
        }

        const lines = String(value || "").split(/\n/);
        if (lines.length === 1) {
            const line = lines[0].trim();
            if (/^Download:\s*/i.test(line)) {
                return downloadLinkHtml(line);
            }
            if (isImportantLine(line)) {
                return `<div class="message-highlight">${inlineMessageHtml(line)}</div>`;
            }
            return inlineMessageHtml(value);
        }

        const out = [];
        let bullets = [];
        const flushBullets = () => {
            if (bullets.length) {
                out.push(`<ul class="sam-doc-list">${bullets.join("")}</ul>`);
                bullets = [];
            }
        };
        lines.forEach((line) => {
            const clean = line.trim();
            if (!clean) {
                flushBullets();
                return;
            }
            if (/^Download:\s*/i.test(clean)) {
                flushBullets();
                out.push(downloadLinkHtml(clean));
                return;
            }
            let m;
            if ((m = clean.match(/^###\s+(.*)$/))) {
                flushBullets();
                out.push(`<div class="sam-doc-h sam-doc-h3">${inlineMessageHtml(m[1])}</div>`);
                return;
            }
            if ((m = clean.match(/^##\s+(.*)$/))) {
                flushBullets();
                out.push(`<div class="sam-doc-h sam-doc-h2">${inlineMessageHtml(m[1])}</div>`);
                return;
            }
            if ((m = clean.match(/^#\s+(.*)$/))) {
                flushBullets();
                out.push(`<div class="sam-doc-h sam-doc-h1">${inlineMessageHtml(m[1])}</div>`);
                return;
            }
            if ((m = clean.match(/^[-*•]\s+(.*)$/))) {
                bullets.push(`<li>${inlineMessageHtml(m[1])}</li>`);
                return;
            }
            flushBullets();
            if (isImportantLine(clean)) {
                out.push(`<div class="message-highlight">${inlineMessageHtml(clean)}</div>`);
                return;
            }
            out.push(`<div>${inlineMessageHtml(clean)}</div>`);
        });
        flushBullets();
        return out.join("");
    }

    function formatSamTableReply(value) {
        const text = String(value || "").trim();
        const match = text.match(/^\[SAM_TABLE\]\s*([\s\S]+?)\s*\[\/SAM_TABLE\]$/);
        if (!match) {
            return "";
        }

        let payload;
        try {
            payload = JSON.parse(match[1]);
        } catch (error) {
            return "";
        }

        const columns = Array.isArray(payload.columns) ? payload.columns.slice(0, 6) : [];
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (!columns.length) {
            return "";
        }

        const headerHtml = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
        const bodyHtml = rows.map((row) => {
            const cells = columns.map((column) => {
                const value = row && Object.prototype.hasOwnProperty.call(row, column) ? row[column] : "";
                return `<td>${inlineMessageHtml(value)}</td>`;
            }).join("");
            return `<tr>${cells}</tr>`;
        }).join("");

        return `
            <section class="sam-table-card">
                <div class="sam-table-head">
                    <div>
                        <p>SAM table report</p>
                        <h3>${escapeHtml(payload.title || "Report")}</h3>
                    </div>
                    <span>${escapeHtml(String(payload.total ?? rows.length))} records</span>
                </div>
                <div class="sam-table-wrap">
                    <table>
                        <thead><tr>${headerHtml}</tr></thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>
                </div>
                ${payload.note ? `<p class="sam-table-note">${escapeHtml(payload.note)}</p>` : ""}
            </section>
        `;
    }

    function fileKindMeta(fileName) {
        const ext = String(fileName || "").split(".").pop().toLowerCase();
        switch (ext) {
            case "xls":
                return { label: "Download Excel", icon: "fa-file-excel-o", desc: "Excel report", mime: "application/vnd.ms-excel", ext: ".xls" };
            case "xlsx":
                return { label: "Download Excel", icon: "fa-file-excel-o", desc: "Excel report", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" };
            case "doc":
                return { label: "Download Word", icon: "fa-file-word-o", desc: "Word document", mime: "application/msword", ext: ".doc" };
            case "docx":
                return { label: "Download Word", icon: "fa-file-word-o", desc: "Word document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" };
            case "pdf":
                return { label: "Download PDF", icon: "fa-file-pdf-o", desc: "PDF document", mime: "application/pdf", ext: ".pdf" };
            case "svg":
                return { label: "Download image", icon: "fa-file-image-o", desc: "Image", mime: "image/svg+xml", ext: ".svg" };
            default:
                return { label: "Download file", icon: "fa-file-o", desc: "File", mime: "application/octet-stream", ext: ext ? "." + ext : "" };
        }
    }

    function downloadLinkHtml(line) {
        const url = line.replace(/^Download:\s*/i, "").trim();
        const fileName = decodeURIComponent((url.split("/").pop() || "sam-report.xls").replace(/\+/g, " "));
        const kind = fileKindMeta(fileName);
        return `<a class="file-attachment inline-download" href="${escapeHtml(url)}" data-file-url="${escapeHtml(url)}" data-file-name="${escapeHtml(fileName)}" download="${escapeHtml(fileName)}">
            <i class="fa ${kind.icon}"></i>
            <span><strong>${kind.label}</strong><small>${escapeHtml(fileName)}</small></span>
        </a>`;
    }

    function recordPartClass(value) {
        const lower = String(value || "").toLowerCase();
        if (lower === "approved" || lower.includes("approved")) {
            return "record-pill status-approved";
        }
        if (lower === "rejected" || lower.includes("denied") || lower.includes("failed")) {
            return "record-pill status-rejected";
        }
        if (lower === "pending" || lower.includes("waiting")) {
            return "record-pill status-pending";
        }
        if (lower.includes("issue") || lower.includes("problem") || lower.includes("missing")) {
            return "record-pill status-warning";
        }
        return "";
    }

    function formatRecordReply(value) {
        const text = String(value || "");
        const intro = "Here is what I found from your SAMELCII records:";
        if (!text.startsWith(intro)) {
            return "";
        }

        const blocks = text.slice(intro.length).trim().split(/\n{2,}/).filter(Boolean);
        const sections = blocks.map((block) => {
            const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
            if (!lines.length) {
                return "";
            }

            const title = lines[0].replace(/:$/, "");
            const body = lines.slice(1);
            const rows = body.length ? body : [lines[0]];
            const rowHtml = rows.map((line) => {
                const clean = line.replace(/^-\s*/, "");
                const parts = clean.split("|").map((part) => part.trim()).filter(Boolean);
                if (parts.length > 1) {
                    return `<li>${parts.map((part, index) => {
                        if (index === 0) {
                            return `<strong>${inlineMessageHtml(part)}</strong>`;
                        }
                        const className = recordPartClass(part);
                        return `<span${className ? ` class="${className}"` : ""}>${inlineMessageHtml(part)}</span>`;
                    }).join("")}</li>`;
                }
                const [label, ...rest] = clean.split(":");
                if (rest.length && label.length < 24) {
                    const detail = rest.join(":").trim();
                    const className = recordPartClass(detail);
                    return `<li><strong>${inlineMessageHtml(label.trim())}</strong><span${className ? ` class="${className}"` : ""}>${inlineMessageHtml(detail)}</span></li>`;
                }
                const className = recordPartClass(clean);
                return `<li><span${className ? ` class="${className}"` : ""}>${inlineMessageHtml(clean)}</span></li>`;
            }).join("");

            return `
                <section class="record-section">
                    <h4>${escapeHtml(title)}</h4>
                    <ul>${rowHtml}</ul>
                </section>
            `;
        }).join("");

        return `<div class="record-summary"><p>Here's the record summary I found.</p>${sections}</div>`;
    }

    function messageTextHtml(item, isMine) {
        if (!item.MessageText || item.MessageText === "[Image]") {
            return "";
        }

        const recordHtml = !isMine ? formatRecordReply(item.MessageText) : "";
        const tableHtml = !isMine ? formatSamTableReply(item.MessageText) : "";
        const replyHtml = item.ReplyToMessageID ? `
            <div class="reply-reference">
                <span class="reply-thread-line"></span>
                <div>
                    <strong>${escapeHtml(item.ReplyToSenderName || "Message")}</strong>
                    <span>${escapeHtml(messageSnippet(item.ReplyToText || "Original message"))}</span>
                </div>
            </div>
        ` : "";
        const forwardedHtml = item.ForwardedFromMessageID ? `
            <div class="forwarded-label">
                <i class="fa fa-share"></i>
                <span>Forwarded${item.ForwardedFromSenderName ? ` from ${escapeHtml(item.ForwardedFromSenderName)}` : ""}</span>
            </div>
        ` : "";
        const mainHtml = tableHtml || recordHtml || (isMine ? escapeHtml(item.MessageText) : formatPlainReply(item.MessageText));
        const content = forwardedHtml + replyHtml + `<div class="message-body-content">${mainHtml}</div>`;
        const extraClass = [
            tableHtml ? "table-bubble" : "",
            recordHtml ? "record-bubble" : "",
            item.ReplyToMessageID ? "has-reply" : "",
        ].filter(Boolean).join(" ");
        return `<div class="bubble ${isMine ? "outgoing" : "incoming"}${extraClass ? ` ${extraClass}` : ""}">${content}</div>`;
    }

    function renderReplyPreview() {
        if (!replyPreview) {
            return;
        }
        if (!state.replyTo) {
            replyPreview.hidden = true;
            replyPreview.innerHTML = "";
            return;
        }
        replyPreview.hidden = false;
        replyPreview.innerHTML = `
            <span class="reply-preview-line"></span>
            <div>
                <strong>Replying to ${escapeHtml(state.replyTo.SenderName || "message")}</strong>
                <span>${escapeHtml(messageSnippet(state.replyTo))}</span>
            </div>
            <button type="button" class="clear-reply" aria-label="Cancel reply">&times;</button>
        `;
    }

    function setReplyTo(messageId) {
        const item = state.messages.find((message) => Number(message.MessageID) === Number(messageId));
        if (!item) {
            return;
        }
        state.replyTo = item;
        renderReplyPreview();
        input.focus();
    }

    function clearReplyTo() {
        state.replyTo = null;
        renderReplyPreview();
    }

    function scrollThreadToLatest() {
        if (!thread) {
            return;
        }

        thread.scrollTop = thread.scrollHeight;
        window.requestAnimationFrame(() => {
            thread.scrollTop = thread.scrollHeight;
        });
    }

    function renderConversationList() {
        if (!list) {
            return;
        }

        if (!state.conversations.length) {
            list.innerHTML = '<div class="empty-state compact">No conversations yet. Search an employee to start one.</div>';
            return;
        }

        list.innerHTML = state.conversations.map((item, index) => {
            const active = item.id === state.activeConversationId || (!state.activeConversationId && index === 0);
            const preview = item.last_message || "No messages yet";
            const unread = Number(item.unread_count || 0);
            const isOnline = Boolean(item.is_online);
            const isAi = Boolean(item.is_ai_conversation);
            const profile = isAi
                ? samProfile((item.profiles && item.profiles[0]) || {})
                : ((item.profiles && item.profiles[0]) || { name: item.title, photo_url: item.photo_url });
            const avatarClass = isAi ? "avatar ai-avatar" : "avatar gradient-pink";
            const avatarContent = isAi
                ? avatarMarkup(item.title || "SAM", samLogoUrl(), avatarClass, profile, false)
                : avatarMarkup(item.title, item.photo_url, avatarClass, profile);
            return `
                <div class="conversation ${active ? "active" : ""}${isAi ? " ai-conversation" : ""}" role="button" tabindex="0" data-conversation-id="${item.id}">
                    <span class="avatar-wrap">
                        ${avatarContent}
                        <span class="presence-dot ${isOnline ? "online" : "offline"}" title="${isOnline ? "Online" : "Offline"}"></span>
                    </span>
                    <span class="conversation-copy">
                        <strong>${escapeHtml(item.title)}${isAi ? ' <span class="ai-badge">AI</span>' : ""}</strong>
                        <small>${escapeHtml(preview)}</small>
                    </span>
                    <span class="conversation-meta">
                        <time>${escapeHtml(formatTime(item.last_sent_at))}</time>
                        ${unread ? `<b>${unread > 99 ? "99+" : unread}</b>` : ""}
                        <button class="conversation-delete" type="button" data-delete-conversation-id="${item.id}" aria-label="Delete conversation with ${escapeHtml(item.title)}">
                            <i class="fa fa-trash-o"></i>
                        </button>
                    </span>
                </div>
            `;
        }).join("");

        list.querySelectorAll(".conversation").forEach((button) => {
            button.addEventListener("click", () => openConversation(Number(button.dataset.conversationId)));
            button.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openConversation(Number(button.dataset.conversationId));
                }
            });
        });

        list.querySelectorAll(".conversation-delete").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                deleteConversation(Number(button.dataset.deleteConversationId));
            });
        });
    }

    function renderMessages(items) {
        if (!items.length) {
            state.messages = [];
            renderEmpty("No messages yet. Start the conversation below.");
            return;
        }

        state.messages = items;
        thread.innerHTML = items.map((item) => {
            const isMine = Number(item.SenderID) === currentUserId;
            const name = item.SenderName || "User";
            const photoUrl = isMine ? session.profile_photo_url : item.SenderPhotoUrl;
            const profile = isMine
                ? {
                    name: session.name || session.username || "You",
                    usercode: session.usercode || "",
                    position: session.position || "",
                    department: session.department || "",
                    photo_url: session.profile_photo_url || ""
                }
                : {
                    name,
                    usercode: item.SenderUserCode || "",
                    position: item.SenderPosition || "",
                    department: item.SenderDepartment || "",
                    photo_url: item.SenderPhotoUrl || ""
                };
            const attachments = Array.isArray(item.Attachments) ? item.Attachments : [];
            const attachmentHtml = attachments.map((attachment) => {
                const attachmentUrl = resolveMediaUrl(attachment.URL);
                if (attachment.Type === "image") {
                    return `<button class="image-attachment" type="button" data-image-url="${escapeHtml(attachmentUrl)}" data-image-name="${escapeHtml(attachment.FileName || "Sent image")}">
                        <img src="${escapeHtml(attachmentUrl)}" alt="${escapeHtml(attachment.FileName || "Sent image")}" />
                    </button>`;
                }
                const fileName = attachment.FileName || "Attachment";
                const kind = fileKindMeta(fileName);
                return `<a class="file-attachment" href="${escapeHtml(attachmentUrl)}" data-file-url="${escapeHtml(attachmentUrl)}" data-file-name="${escapeHtml(fileName)}" download="${escapeHtml(fileName)}">
                    <i class="fa ${kind.icon}"></i>
                    <span><strong>${kind.label}</strong><small>${escapeHtml(fileName)}</small></span>
                </a>`;
            }).join("");
            const textHtml = messageTextHtml(item, isMine);
            return `
                <article class="message-row ${isMine ? "outgoing-row" : ""}" data-message-id="${escapeHtml(item.MessageID)}">
                    ${isMine ? "" : avatarMarkup(name, photoUrl, "avatar gradient-mint", profile)}
                    <div class="message-group">
                        <div class="message-meta ${isMine ? "right" : ""}">
                            <strong>${escapeHtml(isMine ? "You" : name)}</strong>
                            <time>${escapeHtml(formatTime(item.SentAt))}</time>
                        </div>
                        <div class="message-actions" aria-label="Message actions">
                            <button class="message-action-reply" type="button" data-message-id="${escapeHtml(item.MessageID)}" title="Reply" aria-label="Reply to message">
                                <i class="fa fa-reply"></i>
                                <span>Reply</span>
                            </button>
                            <button class="message-action-react" type="button" data-message-id="${escapeHtml(item.MessageID)}" title="React" aria-label="React to message">
                                <i class="fa fa-smile-o"></i>
                                <span>React</span>
                            </button>
                            <button class="message-action-forward" type="button" data-message-id="${escapeHtml(item.MessageID)}" title="Forward" aria-label="Forward message">
                                <i class="fa fa-share"></i>
                                <span>Forward</span>
                            </button>
                        </div>
                        ${textHtml}
                        ${attachmentHtml}
                        ${reactionsHtml(item)}
                    </div>
                    ${isMine ? avatarMarkup(session.name || session.username || "You", photoUrl, "avatar gradient-pink", profile, false) : ""}
                </article>
            `;
        }).join("");
        scrollThreadToLatest();

        thread.querySelectorAll(".image-attachment img").forEach((image) => {
            if (image.complete) {
                return;
            }
            image.addEventListener("load", scrollThreadToLatest, { once: true });
            image.addEventListener("error", scrollThreadToLatest, { once: true });
        });
    }

    function messageSignature(items) {
        if (!items.length) {
            return "empty";
        }
        return items.map((item) => {
            const attachments = Array.isArray(item.Attachments) ? item.Attachments.length : 0;
            const reactions = Array.isArray(item.Reactions)
                ? item.Reactions.map((reaction) => `${reaction.Reaction}:${reaction.Count}:${reaction.Mine ? 1 : 0}`).join(",")
                : "";
            return `${item.MessageID}:${item.SentAt}:${attachments}:${item.ReplyToMessageID || 0}:${item.ForwardedFromMessageID || 0}:${reactions}`;
        }).join("|");
    }

    function conversationSignature(items) {
        if (!items.length) {
            return "empty";
        }
        return items.map((item) => [
            item.id,
            item.last_sent_at || "",
            item.unread_count || 0,
            item.is_online ? 1 : 0,
            item.photo_url || ""
        ].join(":")).join("|");
    }

    function isAiConversation(conversationId) {
        const conv = state.conversations.find((c) => Number(c.id) === Number(conversationId));
        return Boolean(conv?.is_ai_conversation);
    }

    function openForwardModal(messageId) {
        state.forwardingMessageId = Number(messageId);
        if (!forwardModal || !forwardList) {
            return;
        }
        const source = state.messages.find((message) => Number(message.MessageID) === Number(messageId));
        const targets = state.conversations.filter((conversation) => Number(conversation.id) !== Number(state.activeConversationId));
        const sourceHtml = source ? `
            <div class="forward-source">
                <span>Forwarding</span>
                <strong>${escapeHtml(source.SenderName || "Message")}</strong>
                <p>${escapeHtml(messageSnippet(source))}</p>
            </div>
        ` : "";
        forwardList.innerHTML = sourceHtml + (targets.length ? targets.map((conversation) => `
            <button class="forward-target" type="button" data-conversation-id="${escapeHtml(conversation.id)}">
                ${avatarMarkup(
                    conversation.title,
                    Boolean(conversation.is_ai_conversation) ? samLogoUrl() : conversation.photo_url,
                    Boolean(conversation.is_ai_conversation) ? "avatar ai-avatar" : "avatar gradient-pink",
                    Boolean(conversation.is_ai_conversation)
                        ? samProfile((conversation.profiles && conversation.profiles[0]) || {})
                        : ((conversation.profiles && conversation.profiles[0]) || {}),
                    false
                )}
                <span>
                    <strong>${escapeHtml(conversation.title || "Conversation")}</strong>
                    <small>${escapeHtml(messageSnippet(conversation.last_message || "No messages yet"))}</small>
                </span>
            </button>
        `).join("") : '<div class="empty-state compact">No other conversations to forward to.</div>');
        forwardModal.setAttribute("aria-hidden", "false");
        forwardModal.classList.add("open");
    }

    function closeForwardModal() {
        state.forwardingMessageId = null;
        if (!forwardModal) {
            return;
        }
        forwardModal.classList.remove("open");
        forwardModal.setAttribute("aria-hidden", "true");
    }

    function reactionsHtml(item) {
        const reactions = Array.isArray(item.Reactions) ? item.Reactions : [];
        if (!reactions.length) {
            return "";
        }
        const labelMap = {
            like: String.fromCodePoint(0x1F44D),
            heart: String.fromCodePoint(0x2764, 0xFE0F),
            laugh: String.fromCodePoint(0x1F602),
            wow: String.fromCodePoint(0x1F62E),
            sad: String.fromCodePoint(0x1F622),
            pray: String.fromCodePoint(0x1F64F)
        };
        return `<div class="message-reactions">${reactions.map((reaction) => {
            const label = labelMap[String(reaction.Reaction || "").trim()] || reaction.Reaction;
            return `
            <button class="${reaction.Mine ? "mine" : ""}" type="button" data-message-id="${escapeHtml(item.MessageID)}" data-reaction="${escapeHtml(reaction.Reaction)}" aria-label="React ${escapeHtml(label)}">
                <span>${escapeHtml(label)}</span><b>${escapeHtml(reaction.Count)}</b>
            </button>
        `;}).join("")}</div>`;
    }

    function closeReactionPicker() {
        document.querySelectorAll(".reaction-picker").forEach((picker) => picker.remove());
    }

    function openReactionPicker(button) {
        closeReactionPicker();
        const picker = document.createElement("div");
        picker.className = "reaction-picker";
        picker.dataset.messageId = button.dataset.messageId || "";
        picker.innerHTML = [0x1F44D, 0x2764, 0x1F602, 0x1F62E, 0x1F622, 0x1F64F].map((code) => {
            const reaction = String.fromCodePoint(code);
            return `<button type="button" data-reaction="${escapeHtml(reaction)}" aria-label="React ${escapeHtml(reaction)}">${escapeHtml(reaction)}</button>`;
        }).join("");
        document.body.appendChild(picker);
        const rect = button.getBoundingClientRect();
        picker.style.left = `${Math.max(10, Math.min(window.innerWidth - 260, rect.left - 100))}px`;
        picker.style.top = `${Math.max(10, rect.top - 54)}px`;
    }

    async function reactToMessage(messageId, reaction) {
        await request("react", {
            body: {
                message_id: messageId,
                reaction
            }
        });
        closeReactionPicker();
        await openConversation(state.activeConversationId, { forceRender: true });
    }

    async function forwardMessage(targetConversationId) {
        if (!state.forwardingMessageId) {
            return;
        }
        await request("forward", {
            body: {
                conversation_id: targetConversationId,
                message_id: state.forwardingMessageId
            }
        });
        closeForwardModal();
        await loadConversations(state.activeConversationId);
    }

    function isReportRequest(text) {
        const lower = text.toLowerCase();
        return /\b(report|excel|generate|gawa|dtr|fuel|epass|leave|travel|attendance|employee|billing|soa|membership|warehouse|material|inventory|job.?order|turnover|status.?report|briefing|summary|download|export|list.?all|show.?all|all.?records|image|picture)\b/.test(lower);
    }

    function showAiTyping(isThinking) {
        const existing = document.getElementById("ai-typing-indicator");
        if (existing) {
            return;
        }
        const el = document.createElement("article");
        el.id = "ai-typing-indicator";
        el.className = "message-row";

        if (isThinking) {
            el.innerHTML = `
                <span class="avatar gradient-cyan photo-avatar" style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
            <img src="${escapeHtml(samLogoUrl())}" alt="SAM" loading="lazy" onerror="const parent=this.parentElement;if(parent){parent.classList.remove('photo-avatar');parent.style.backgroundImage='none';parent.textContent='SAM';}else{this.remove();}" />
                </span>
                <div class="message-group">
                    <div class="message-meta"><strong>SAM</strong></div>
                    <div class="bubble incoming ai-typing-bubble ai-thinking-bubble">
                        <span class="ai-thinking-icon">🧠</span>
                        <span class="ai-thinking-text">SAM is thinking...</span>
                        <span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>
                    </div>
                </div>`;
            thread.appendChild(el);
            scrollThreadToLatest();

            const phases = [
                "🧠 SAM is thinking...",
                "📖 Reading your request...",
                "🔍 Analyzing the database...",
                "⚡ Running the query...",
                "📊 Building your report...",
                "✨ Finalizing the output..."
            ];
            let phaseIndex = 0;
            const textEl = el.querySelector(".ai-thinking-text");
            if (textEl) {
                state.thinkingInterval = window.setInterval(() => {
                    phaseIndex = (phaseIndex + 1) % phases.length;
                    if (textEl) {
                        textEl.style.animation = "none";
                        textEl.offsetHeight;
                        textEl.style.animation = "";
                        textEl.textContent = phases[phaseIndex];
                    }
                }, 1800);
            }
        } else {
            el.innerHTML = `
                <span class="avatar gradient-cyan photo-avatar" style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
            <img src="${escapeHtml(samLogoUrl())}" alt="SAM" loading="lazy" onerror="const parent=this.parentElement;if(parent){parent.classList.remove('photo-avatar');parent.style.backgroundImage='none';parent.textContent='SAM';}else{this.remove();}" />
                </span>
                <div class="message-group">
                    <div class="message-meta"><strong>SAM</strong></div>
                    <div class="bubble incoming ai-typing-bubble">
                        <span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>
                    </div>
                </div>`;
            thread.appendChild(el);
            scrollThreadToLatest();
        }
    }

    function hideAiTyping() {
        if (state.thinkingInterval) {
            clearInterval(state.thinkingInterval);
            state.thinkingInterval = null;
        }
        const el = document.getElementById("ai-typing-indicator");
        if (el) {
            el.remove();
        }
    }

    async function requestAiReply(conversationId) {
        const params = () => new URLSearchParams({
            conversation_id: String(conversationId)
        });

        // Sa protected Node route dumadaan si SAM gamit ang parehong JWT ng Messenger.
        let payload = null;
        try {
            const response = await fetch(AI_API, {
                method: "POST",
                headers: getAuthHeaders(),
                body: params()
            });
            payload = await response.json().catch(() => ({}));
        } catch (_networkError) {
            throw new Error("SAM is offline — the server could not be reached.");
        }

        if (!payload || !payload.ok) {
            throw new Error((payload && payload.message) || "SAM could not respond.");
        }
    }

    async function loadConversations(preferredId) {
        if (!currentUserId) {
            renderEmpty("Please log in again to use Messenger.");
            return;
        }

        try {
            const payload = await request("list");
            if (payload.ai_user_id) {
                state.aiUserId = Number(payload.ai_user_id);
            }
            state.conversations = payload.items || [];
            state.lastUnreadTotal = unreadTotal(state.conversations);
            state.lastConversationSignature = conversationSignature(state.conversations);
            if (state.lastUnreadTotal === null) {
                state.lastUnreadTotal = unreadTotal(state.conversations);
            }

            if (preferredId) {
                state.activeConversationId = Number(preferredId);
            } else if (!state.activeConversationId && state.conversations.length) {
                state.activeConversationId = Number(state.conversations[0].id);
            }

            renderConversationList();

            if (state.activeConversationId) {
                await openConversation(state.activeConversationId, { forceRender: true });
            } else {
            input.disabled = true;
            title.textContent = "Messenger";
            status.textContent = "Search an employee to start a chat";
            setAvatarNode(roomAvatar, "M", "", {}, false);
            memberStack.innerHTML = "";
            updateAddToGroupButtonState();
            renderEmpty("No conversations yet. Search an employee to start one.");
            }
        } catch (error) {
            renderEmpty(error.message);
        }
    }

    async function openConversation(conversationId, options = {}) {
        const conversation = state.conversations.find((item) => Number(item.id) === Number(conversationId));
        if (Number(state.activeConversationId) !== Number(conversationId)) {
            clearReplyTo();
        }
        state.activeConversationId = Number(conversationId);
        renderConversationList();

        if (conversation) {
            title.textContent = conversation.title;
            status.textContent = "Conversation ready";
            const isAi = Boolean(conversation.is_ai_conversation);
            const otherProfile = isAi
                ? samProfile((conversation.profiles && conversation.profiles[0]) || {})
                : ((conversation.profiles && conversation.profiles[0]) || {});
            setAvatarNode(
                roomAvatar,
                conversation.title,
                isAi ? samLogoUrl() : conversation.photo_url,
                otherProfile,
                isAi ? false : Boolean(otherProfile.id)
            );
        }

        updateAddToGroupButtonState();

        input.disabled = false;

        try {
            const payload = await request("messages", { params: { conversation_id: conversationId } });
            const participants = payload.participants || [];
            memberStack.innerHTML = participants.slice(0, 4).map((id) => {
                const label = Number(id) === currentUserId ? initials(session.name || session.username || "You") : "U";
                return `<span class="avatar mini gradient-blue">${escapeHtml(label)}</span>`;
            }).join("");
            const items = payload.items || [];
            const nextSignature = messageSignature(items);
            if (options.forceRender || nextSignature !== state.lastMessageSignature) {
                state.lastMessageSignature = nextSignature;
                renderMessages(items);
            }
            window.parent?.postMessage({ type: "messenger-read" }, "*");
        } catch (error) {
            renderEmpty(error.message);
        }
    }

    async function pollMessenger() {
        if (state.isPolling || !currentUserId || document.hidden || state.isIdle) {
            return;
        }

        state.isPolling = true;
        try {
            const payload = await request("list");
            if (payload.ai_user_id) {
                state.aiUserId = Number(payload.ai_user_id);
            }
            const nextConversations = payload.items || [];
            const nextSignature = conversationSignature(nextConversations);
            const previousUnreadTotal = state.lastUnreadTotal ?? unreadTotal(state.conversations);
            const nextUnreadTotal = unreadTotal(nextConversations);
            if (nextUnreadTotal > previousUnreadTotal) {
                playNewMessageSound();
            }
            state.lastUnreadTotal = nextUnreadTotal;
            if (nextSignature === state.lastConversationSignature) {
                return;
            }

            state.conversations = nextConversations;
            state.lastConversationSignature = nextSignature;
            renderConversationList();

            const activeExists = state.conversations.some((item) => Number(item.id) === Number(state.activeConversationId));
            if (state.activeConversationId && activeExists) {
                await openConversation(state.activeConversationId);
            } else if (state.activeConversationId && !activeExists) {
                state.activeConversationId = null;
                state.lastMessageSignature = "";
                input.disabled = true;
                title.textContent = "Messenger";
                status.textContent = "Search an employee to start a chat";
                setAvatarNode(roomAvatar, "M", "", {}, false);
                memberStack.innerHTML = "";
                renderEmpty("No conversations yet. Search an employee to start one.");
            }
        } catch (_error) {
            // Keep the chat usable if one polling request fails.
        } finally {
            state.isPolling = false;
        }
    }

    function markOffline() {
        if (!currentUserId) {
            return;
        }

        const body = new URLSearchParams({ action: "offline" });

        fetch(API, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            }),
            body,
            keepalive: true
        }).catch(() => {});
    }

    async function sendMessage(text) {
        if (text.length > MAX_MESSAGE_CHARS) {
            renderEmpty(`Message must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
            return;
        }

        const replyToMessageId = state.replyTo ? Number(state.replyTo.MessageID) : 0;
        const sendPayload = await request("send", {
            method: "POST",
            body: {
                conversation_id: state.activeConversationId,
                message: text,
                reply_to_message_id: replyToMessageId
            }
        });
        clearReplyTo();

        let aiFailure = null;
        if (isAiConversation(state.activeConversationId) && !sendPayload.ai_replied) {
            await loadConversations(state.activeConversationId);
            showAiTyping(isReportRequest(text));
            try {
                await requestAiReply(state.activeConversationId);
            } catch (aiErr) {
                // A network-level failure means the backend never saw this request,
                // so no error reply was ever inserted into the conversation — say so
                // here instead of leaving the message with no reply at all.
                aiFailure = aiErr.message || "SAM could not respond.";
            } finally {
                hideAiTyping();
            }
        }

        await loadConversations(state.activeConversationId);

        if (aiFailure) {
            showAiFailureBubble(aiFailure);
        }
    }

    function showAiFailureBubble(message) {
        const thread = document.getElementById("message-thread");
        if (!thread) return;
        const el = document.createElement("div");
        el.className = "message-row incoming";
        el.innerHTML = `
            <span class="avatar gradient-cyan photo-avatar" style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
        <img src="${escapeHtml(samLogoUrl())}" alt="SAM" loading="lazy" onerror="const parent=this.parentElement;if(parent){parent.classList.remove('photo-avatar');parent.style.backgroundImage='none';parent.textContent='SAM';}else{this.remove();}" />
            </span>
            <div class="message-group">
                <div class="message-meta"><strong>SAM</strong></div>
                <div class="bubble incoming">⚠️ ${escapeHtml(message)} Please try sending your message again.</div>
            </div>`;
        thread.appendChild(el);
        scrollThreadToLatest();
    }

    async function deleteConversation(conversationId) {
        const conversation = state.conversations.find((item) => Number(item.id) === Number(conversationId));
        const titleText = conversation?.title || "this conversation";
        const confirmed = window.confirm(`Delete ${titleText} and all messages?`);
        if (!confirmed) {
            return;
        }

        try {
            await request("delete_conversation", {
                method: "POST",
                body: { conversation_id: conversationId }
            });

            if (Number(state.activeConversationId) === Number(conversationId)) {
                state.activeConversationId = null;
            }
            await loadConversations();
            window.parent?.postMessage({ type: "messenger-read" }, "*");
        } catch (error) {
            renderEmpty(error.message);
        }
    }

    async function sendImage(file) {
        if (!state.activeConversationId) {
            renderEmpty("Select a conversation before sending an image.");
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            renderEmpty("Image must be 2MB or smaller.");
            return;
        }
        if (input.value.trim().length > MAX_MESSAGE_CHARS) {
            renderEmpty(`Image caption must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
            return;
        }

        await postForm("send_image", {
            conversation_id: String(state.activeConversationId),
            message: input.value.trim(),
            image: file
        });
        input.value = "";
        await loadConversations(state.activeConversationId);
    }

    function showCallModal(type) {
        callModal.classList.add("active");
        callModal.setAttribute("aria-hidden", "false");
        callTitle.textContent = `${type === "video" ? "Video" : "Voice"} call with ${title.textContent}`;
        callStatusMessage.textContent = "Waiting for device permission...";
        localVideo.style.display = type === "video" ? "block" : "none";
        audioCallIcon.style.display = type === "video" ? "none" : "grid";
        toggleCameraButton.style.display = type === "video" ? "inline-flex" : "none";
    }

    async function startCall(type) {
        if (!state.activeConversationId) {
            renderEmpty("Select a conversation before starting a call.");
            return;
        }

        showCallModal(type);

        try {
            const callPayload = await request("start_call", {
                method: "POST",
                body: {
                    conversation_id: state.activeConversationId,
                    call_type: type
                }
            });
            state.activeCallId = callPayload.call_id;

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera and microphone need HTTPS or localhost in this browser.");
            }

            state.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === "video"
            });
            localVideo.srcObject = state.localStream;
            callStatusMessage.textContent = type === "video"
                ? "Camera and microphone are active."
                : "Microphone is active.";
        } catch (error) {
            if (state.activeCallId) {
                try {
                    await request("end_call", {
                        method: "POST",
                        body: { call_id: state.activeCallId }
                    });
                } catch (_cleanupError) {
                    // If cleanup fails, the UI should still recover locally.
                }
                state.activeCallId = null;
            }
            callStatusMessage.textContent = error.message || "Call could not be started.";
        }
    }

    async function endCall() {
        if (state.localStream) {
            state.localStream.getTracks().forEach((track) => track.stop());
            state.localStream = null;
        }
        localVideo.srcObject = null;

        if (state.activeCallId) {
            try {
                await request("end_call", {
                    method: "POST",
                    body: { call_id: state.activeCallId }
                });
            } catch (_error) {
                // Ending local media is more important than blocking on call log updates.
            }
            state.activeCallId = null;
        }

        callModal.classList.remove("active");
        callModal.setAttribute("aria-hidden", "true");
    }

    async function searchUsers(query) {
        if (!query || query.length < 2) {
            clearUserResults();
            return;
        }

        try {
            const payload = await request("search_users", { params: { q: query } });
            const items = payload.items || [];
            userResults.innerHTML = items.length
                ? items.map((item) => {
                    const itemId = Number(item.id || item.Id || item.ID || 0);
                    return `
                    <div class="user-result ${state.groupMode && state.groupMembers.has(itemId) ? "selected" : ""}" data-user-result-id="${itemId}">
                        <button type="button" class="user-result-main" data-user-id="${itemId}">
                            ${avatarMarkup(item.name || item.username || item.usercode, item.profile_photo_url, "avatar gradient-blue", {
                                name: item.name || item.username || item.usercode,
                                usercode: item.usercode || "",
                                position: item.position || "",
                                department: item.department || "",
                                photo_url: item.profile_photo_url || ""
                            })}
                            <span>
                                <strong>${escapeHtml(item.name || item.username || item.usercode)}</strong>
                                <small>${escapeHtml(item.department || item.usercode || "")}</small>
                            </span>
                        </button>
                        <button type="button" class="user-result-group" data-add-group-user-id="${itemId}">
                            <i class="fa fa-users"></i>
                            <span>${state.groupMembers.has(itemId) ? "Added" : "Add to group"}</span>
                        </button>
                    </div>
                `; }).join("")
                : '<div class="empty-state compact">No employee found</div>';

            userResults.querySelectorAll("button[data-user-id]").forEach((button) => {
                button.addEventListener("click", () => {
                    const selected = items.find((item) => Number(item.id || item.Id || item.ID || 0) === Number(button.dataset.userId));
                    if (state.groupMode) {
                        toggleGroupMember(selected);
                        return;
                    }
                    startConversation(Number(button.dataset.userId));
                });
            });

            userResults.querySelectorAll("button[data-add-group-user-id]").forEach((button) => {
                button.addEventListener("click", (event) => {
                    event.stopPropagation();
                    const selected = items.find((item) => Number(item.id || item.Id || item.ID || 0) === Number(button.dataset.addGroupUserId));
                    if (!selected) {
                        return;
                    }
                    setGroupMode(true);
                    ensureGroupMember(selected);
                    employeeSearch.focus();
                });
            });
        } catch (error) {
            userResults.innerHTML = `<div class="empty-state compact">${escapeHtml(error.message)}</div>`;
        }
    }

    async function startConversation(otherUserId) {
        try {
            const payload = await request("start", {
                method: "POST",
                body: { other_user_id: otherUserId }
            });
            employeeSearch.value = "";
            clearUserResults();
            await loadConversations(Number(payload.conversation_id));
        } catch (error) {
            userResults.innerHTML = `<div class="empty-state compact">${escapeHtml(error.message)}</div>`;
        }
    }

    async function createGroupConversation() {
        const participantIds = Array.from(state.groupMembers.keys()).filter((id) => Number.isFinite(Number(id)) && Number(id) > 0);
        if (participantIds.length < 2) {
            renderEmpty("Pick at least two employees before creating a group.");
            return;
        }

        try {
            const payload = await request("create_group", {
                method: "POST",
                body: {
                    participant_ids: participantIds.join(","),
                    conversation_name: groupNameInput?.value || ""
                }
            });
            setGroupMode(false);
            employeeSearch.value = "";
            clearUserResults();
            await loadConversations(Number(payload.conversation_id));
        } catch (error) {
            renderEmpty(error.message);
        }
    }

    function closeImagePreview() {
        if (!imageModal || !previewImage) {
            return;
        }
        imageModal.classList.remove("active");
        imageModal.setAttribute("aria-hidden", "true");
        previewImage.removeAttribute("src");
    }

    document.querySelectorAll(".chat-tabs button").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".chat-tabs button").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
        });
    });

    if (refreshButton) {
        refreshButton.addEventListener("click", () => loadConversations(state.activeConversationId));
    }

    document.addEventListener("click", (event) => {
        unlockMessageAudio();

        const reactionButton = event.target.closest(".reaction-picker button");
        if (reactionButton) {
            const picker = reactionButton.closest(".reaction-picker");
            const messageId = picker?.dataset.messageId || "";
            reactToMessage(messageId, reactionButton.dataset.reaction).catch((error) => renderEmpty(error.message));
            return;
        }

        if (!event.target.closest(".reaction-picker") && !event.target.closest(".message-action-react")) {
            closeReactionPicker();
        }

        const avatar = event.target.closest(".profile-avatar-trigger");
        if (avatar) {
            event.preventDefault();
            event.stopPropagation();
            showProfilePopover(avatar);
            return;
        }

        if (!event.target.closest("#messenger-profile-popover")) {
            hideProfilePopover();
        }
    }, true);

    document.addEventListener("mouseover", (event) => {
        const avatar = event.target.closest(".profile-avatar-trigger");
        if (avatar) {
            showProfilePopover(avatar);
        }
    });

    document.addEventListener("mouseout", (event) => {
        const avatar = event.target.closest(".profile-avatar-trigger");
        if (avatar && !event.relatedTarget?.closest("#messenger-profile-popover")) {
            hideProfilePopover();
        }
    });

    document.addEventListener("keydown", (event) => {
        unlockMessageAudio();

        const avatar = event.target.closest(".profile-avatar-trigger");
        if (avatar && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            showProfilePopover(avatar);
        }
        if (event.key === "Escape") {
            hideProfilePopover();
        }
    }, true);

    if (employeeSearch) {
        employeeSearch.addEventListener("input", () => {
            clearTimeout(state.searchTimer);
            state.searchTimer = window.setTimeout(() => searchUsers(employeeSearch.value.trim()), 250);
        });
    }

    if (startChatForm) {
        startChatForm.addEventListener("submit", (event) => {
            event.preventDefault();
            searchUsers(employeeSearch.value.trim());
        });
    }

    if (newGroupButton) {
        newGroupButton.addEventListener("click", () => {
            setGroupMode(true);
            employeeSearch.focus();
            searchUsers(employeeSearch.value.trim());
        });
    }

    if (addToGroupButton) {
        addToGroupButton.addEventListener("click", () => {
            seedActiveConversationIntoGroup();
        });
    }

    if (cancelGroupButton) {
        cancelGroupButton.addEventListener("click", () => setGroupMode(false));
    }

    if (createGroupButton) {
        createGroupButton.addEventListener("click", () => {
            createGroupConversation().catch((error) => renderEmpty(error.message));
        });
    }

    if (groupSelection) {
        groupSelection.addEventListener("click", (event) => {
            const chip = event.target.closest(".group-member-chip");
            if (!chip) {
                return;
            }
            const userId = Number(chip.dataset.userId || 0);
            if (!userId) {
                return;
            }
            state.groupMembers.delete(userId);
            updateGroupSelectionUI();
            if (employeeSearch.value.trim().length >= 2) {
                searchUsers(employeeSearch.value.trim());
            }
        });
    }

    if (form && input) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const text = input.value.trim();
            if (!text || !state.activeConversationId) {
                return;
            }

            input.value = "";
            input.disabled = true;
            try {
                await sendMessage(text);
            } catch (error) {
                renderEmpty(error.message);
            } finally {
                input.disabled = false;
                input.focus();
            }
        });
    }

    if (thread && imageModal && previewImage) {
        thread.addEventListener("click", (event) => {
            const replyButton = event.target.closest(".message-action-reply");
            if (replyButton) {
                event.preventDefault();
                setReplyTo(replyButton.dataset.messageId);
                return;
            }

            const forwardButton = event.target.closest(".message-action-forward");
            if (forwardButton) {
                event.preventDefault();
                openForwardModal(forwardButton.dataset.messageId);
                return;
            }

            const reactButton = event.target.closest(".message-action-react");
            if (reactButton) {
                event.preventDefault();
                openReactionPicker(reactButton);
                return;
            }

            const reactionChip = event.target.closest(".message-reactions button");
            if (reactionChip) {
                event.preventDefault();
                reactToMessage(reactionChip.dataset.messageId, reactionChip.dataset.reaction).catch((error) => renderEmpty(error.message));
                return;
            }

            const button = event.target.closest(".image-attachment");
            if (!button) {
                return;
            }

            previewImage.src = button.dataset.imageUrl || "";
            previewImage.alt = button.dataset.imageName || "Image preview";
            imageModal.classList.add("active");
            imageModal.setAttribute("aria-hidden", "false");
        });
    }

    if (replyPreview) {
        replyPreview.addEventListener("click", (event) => {
            if (event.target.closest(".clear-reply")) {
                clearReplyTo();
            }
        });
    }

    if (closeForwardModalButton) {
        closeForwardModalButton.addEventListener("click", closeForwardModal);
    }

    if (forwardModal) {
        forwardModal.addEventListener("click", async (event) => {
            if (event.target === forwardModal) {
                closeForwardModal();
                return;
            }
            const target = event.target.closest(".forward-target");
            if (!target) {
                return;
            }
            target.disabled = true;
            try {
                await forwardMessage(Number(target.dataset.conversationId));
            } catch (error) {
                target.disabled = false;
                renderEmpty(error.message);
            }
        });
    }

    if (thread) {
        thread.addEventListener("click", async (event) => {
            const link = event.target.closest(".file-attachment");
            if (!link || !window.showSaveFilePicker) {
                return;
            }

            event.preventDefault();
            const fileUrl = link.dataset.fileUrl || link.getAttribute("href") || "";
            const fileName = link.dataset.fileName || link.getAttribute("download") || "sam-report.xls";
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error("Download failed.");
                }
                const blob = await response.blob();
                const kind = fileKindMeta(fileName);
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: kind.desc,
                        accept: kind.ext ? { [kind.mime]: [kind.ext] } : undefined
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } catch (error) {
                if (error?.name === "AbortError") {
                    return;
                }
                window.location.href = fileUrl;
            }
        });
    }

    if (closeImageModal) {
        closeImageModal.addEventListener("click", closeImagePreview);
    }

    if (imageModal) {
        imageModal.addEventListener("click", (event) => {
            if (event.target === imageModal) {
                closeImagePreview();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && imageModal?.classList.contains("active")) {
            closeImagePreview();
        }
        if (event.key === "Escape" && forwardModal?.classList.contains("open")) {
            closeForwardModal();
        }
        if (event.key === "Escape" && state.replyTo) {
            clearReplyTo();
        }
    });

    if (attachImageButton && imageInput) {
        attachImageButton.addEventListener("click", () => {
            if (!state.activeConversationId) {
                renderEmpty("Select a conversation before sending an image.");
                return;
            }
            imageInput.click();
        });

        imageInput.addEventListener("change", async () => {
            const file = imageInput.files && imageInput.files[0];
            if (!file) {
                return;
            }

            input.disabled = true;
            try {
                await sendImage(file);
            } catch (error) {
                renderEmpty(error.message);
            } finally {
                imageInput.value = "";
                input.disabled = false;
            }
        });
    }

    if (startAudioCallButton) {
        startAudioCallButton.addEventListener("click", () => startCall("audio"));
    }

    if (startVideoCallButton) {
        startVideoCallButton.addEventListener("click", () => startCall("video"));
    }

    [closeCallButton, endCallButton].forEach((button) => {
        if (button) {
            button.addEventListener("click", endCall);
        }
    });

    if (toggleMicButton) {
        toggleMicButton.addEventListener("click", () => {
            const track = state.localStream?.getAudioTracks()[0];
            if (!track) {
                return;
            }
            track.enabled = !track.enabled;
            toggleMicButton.classList.toggle("muted", !track.enabled);
        });
    }

    if (toggleCameraButton) {
        toggleCameraButton.addEventListener("click", () => {
            const track = state.localStream?.getVideoTracks()[0];
            if (!track) {
                return;
            }
            track.enabled = !track.enabled;
            toggleCameraButton.classList.toggle("muted", !track.enabled);
        });
    }

    function startPolling() {
        if (state.pollTimer) {
            return;
        }
        state.pollTimer = window.setInterval(pollMessenger, MESSENGER_POLL_MS);
    }

    function stopPolling() {
        if (!state.pollTimer) {
            return;
        }
        window.clearInterval(state.pollTimer);
        state.pollTimer = null;
    }

    function resetIdleTimer() {
        const wasIdle = state.isIdle;
        state.isIdle = false;
        window.clearTimeout(state.idleTimer);
        state.idleTimer = window.setTimeout(() => {
            state.isIdle = true;
            stopPolling();
        }, IDLE_AFTER_MS);
        if (wasIdle) {
            startPolling();
            pollMessenger();
        }
    }

    loadConversations();
    startPolling();
    resetIdleTimer();
    ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "wheel"].forEach((eventName) => {
        document.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            resetIdleTimer();
            pollMessenger();
        }
    });
    window.addEventListener("pagehide", markOffline);
})();
