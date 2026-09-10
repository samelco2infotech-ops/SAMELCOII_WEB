// Mobile Node/JWT login flow for approvers.
// EDIT GUIDE: Mobile approval login uses the shared Node API client.
// HUWAG BAGUHIN: Remembered login stores username only, never the password.
// Tagalog: Node token lang ang login.
(function () {
    /* SECTION: Setup */
    const SESSION_KEY = "samelcii_session";
    const REMEMBER_KEY = "samelcii_remember";
    window.SAMELCII_API_BASE = APIClient.CONFIG.API_BASE;
    window.SAMELCII_MEDIA_BASE = APIClient.CONFIG.NODE_API_BASE.replace(/\/api$/, "");
    const params = new URLSearchParams(window.location.search);
    const nextUrl = params.get("next") || "../../pages/modules/mobile-approvals/index.html";
    const sessionRaw = localStorage.getItem(SESSION_KEY);
    let session = {};

    try {
        session = sessionRaw ? JSON.parse(sessionRaw) : {};
    } catch (_error) {
        session = {};
        localStorage.removeItem(SESSION_KEY);
    }

    function setMessage(target, text, type = "") {
        if (!target) {
            return;
        }
        target.textContent = text || "";
        target.className = "message";
        if (type) {
            target.classList.add(type);
        }
    }

    function createSession(user) {
        const employeeAccountNumber = user.accountnumber || user.usercode || "";
        localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
                id: user.id || user.Id || "",
                usercode: user.usercode,
                accountnumber: employeeAccountNumber,
                username: user.username,
                name: user.name || user.username,
                position: user.position || "",
                department: user.department || "",
                privilage: user.privilage || "",
                mobile_number: user.mobile_number || "",
                VL: user.VL || 0,
                SL: user.SL || 0,
                OL: user.OL || 0,
                VLbal: user.VLbal || 0,
                SLbal: user.SLbal || 0,
                OLbal: user.OLbal || 0,
                employmentdate: user.employmentdate || "",
                bioUID: user.bioUID || "",
                privilagemenu: user.privilagemenu || "",
                address: user.address || "",
                emailadd: user.emailadd || "",
                area: user.area || "",
                basic: user.basic || "",
                profile_photo_url: user.profile_photo_url || "",
                loginAt: new Date().toISOString()
            })
        );
    }

    async function loginWithDatabase(username, password) {
        return APIClient.login(username, password);
    }

    function canUseApprovals(user) {
        const raw = String(user.privilage || "");
        return raw.split("-").some((part) => {
            const n = Number(String(part).trim());
            return Number.isFinite(n) && n >= 6 && n <= 10;
        });
    }

    if (sessionRaw && APIClient.isAuthenticated()) {
        APIClient.getCurrentUser().then((freshUser) => {
            if (freshUser && canUseApprovals(freshUser)) {
                window.location.href = nextUrl;
            }
        }).catch(() => {
            APIClient.clearAuth();
        });
    }

    /* SECTION: UI hooks */
    const form = document.getElementById("mobile-login-form");
    const usernameInput = document.getElementById("mobile-login-username");
    const passwordInput = document.getElementById("mobile-login-password");
    const message = document.getElementById("mobile-login-message");

    document.querySelectorAll(".eye-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = document.getElementById(btn.getAttribute("data-target") || "");
            if (!target) {
                return;
            }
            const isHidden = target.type === "password";
            target.type = isHidden ? "text" : "password";
            btn.textContent = isHidden ? "Hide" : "Show";
        });
    });

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            setMessage(message, "Checking login...", "");

            const username = String(usernameInput?.value || "").trim();
            const password = String(passwordInput?.value || "");

            if (!username || !password) {
                setMessage(message, "Please enter username and password.", "error");
                return;
            }

            try {
                const user = await loginWithDatabase(username, password);
                if (!canUseApprovals(user)) {
                    setMessage(message, "This account is not allowed to use Mobile Approvals.", "error");
                    return;
                }
                createSession(user);
                localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username }));
                setMessage(message, "Login success. Opening approvals...", "success");
                window.location.href = nextUrl;
            } catch (error) {
                setMessage(message, error.message || "Invalid username or password.", "error");
            }
        });
    }

    /* SECTION: Remembered Credentials */
    try {
        const remembered = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
        if (remembered && remembered.username) {
            if (usernameInput) usernameInput.value = remembered.username;
            localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: remembered.username }));
        }
    } catch (_error) {
        localStorage.removeItem(REMEMBER_KEY);
    }

    /* SECTION: File fallback */
    if (window.location.protocol === "file:") {
        window.location.href = `${SERVER_BASE}/pages/auth/mobile.html`;
    }
})();
