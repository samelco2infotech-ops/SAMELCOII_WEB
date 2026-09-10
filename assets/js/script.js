// Node/JWT login page flow.
// EDIT GUIDE: Authentication is provided only by APIClient and the Node auth API.
// HUWAG BAGUHIN: Saved accounts may store signed session tokens, never passwords.
// Tagalog: Node token lang ang mabilis na login; server pa rin ang nagbe-verify.
const container = document.querySelector(".container");
const registerBtn = document.querySelector(".register-btn");
const loginBtn = document.querySelector(".login-btn");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const employeeInput = document.querySelector("#register-usercode");
const employeeList = document.querySelector("#employee-list");
const loginMessage = document.querySelector("#login-message");
const registerMessage = document.querySelector("#register-message");
const rememberMeInput = document.querySelector("#remember-me");
const forgotPasswordLink = document.querySelector("#forgot-password-link");
const forgotPanel = document.querySelector("#forgot-panel");
const forgotIdentifierInput = document.querySelector("#forgot-identifier");
const forgotNewPasswordInput = document.querySelector("#forgot-new-password");
const forgotConfirmPasswordInput = document.querySelector("#forgot-confirm-password");
const forgotSaveBtn = document.querySelector("#forgot-save-btn");
const forgotCancelBtn = document.querySelector("#forgot-cancel-btn");
const savedAccountsPanel = document.querySelector("#saved-accounts-panel");
const savedAccountList = document.querySelector("#saved-account-list");
const manualLoginPanel = document.querySelector("#manual-login-panel");
const useAnotherAccountBtn = document.querySelector("#use-another-account");
const backToSavedAccountsBtn = document.querySelector("#back-to-saved-accounts");
const REMEMBER_KEY = "samelcii_remember";
const SESSION_KEY = "samelcii_session";
const SAVED_ACCOUNTS_KEY = "samelcii_saved_accounts_v1";
const AUTH_URL = new URL("../auth/index.html", window.location.href).href;

function tokenExpiresAt(token) {
    try {
        const encoded = String(token || "").split(".")[1];
        if (!encoded) return 0;
        const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
        return Number(payload.exp || 0) * 1000;
    } catch (_error) {
        return 0;
    }
}

function savedAccountKey(account = {}) {
    return String(account.id || account.username || "").trim().toLowerCase();
}

function isUsableSavedAccount(account) {
    return Boolean(savedAccountKey(account)
        && account.username
        && String(account.token || "").split(".").length === 3
        && tokenExpiresAt(account.token) > Date.now());
}

function writeSavedAccounts(accounts) {
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readSavedAccounts() {
    let parsed = [];
    try {
        parsed = JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]");
    } catch (_error) {
        parsed = [];
    }

    const accounts = (Array.isArray(parsed) ? parsed : [])
        .filter(isUsableSavedAccount)
        .sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0));

    if (accounts.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
        writeSavedAccounts(accounts);
    }
    return accounts;
}

function accountAvatar(account) {
    if (account.profilePhoto) return APIClient.resolveMediaUrl(account.profilePhoto);
    const id = Number(account.id || 0);
    const filename = id > 0 && id % 2 === 0 ? "avatar-male.jpg" : "avatar-female.jpg";
    return new URL(`../../assets/images/${filename}?v=20260615-avatar-small-v2`, window.location.href).href;
}

function forgetSavedAccount(key) {
    const accounts = readSavedAccounts().filter((account) => savedAccountKey(account) !== key);
    writeSavedAccounts(accounts);
    return accounts;
}

function saveAccount(user, token) {
    const account = {
        id: Number(user.id || 0),
        username: String(user.username || "").trim(),
        name: String(user.name || user.username || "User").trim(),
        position: String(user.position || "").trim(),
        profilePhoto: String(user.profile_photo_url || "").trim(),
        token: String(token || ""),
        savedAt: Date.now()
    };
    if (!isUsableSavedAccount(account)) return;

    const key = savedAccountKey(account);
    writeSavedAccounts([account, ...readSavedAccounts().filter((item) => savedAccountKey(item) !== key)]);
}

function setAccountMode(showSaved) {
    const hasSavedAccounts = readSavedAccounts().length > 0;
    const useSavedView = Boolean(showSaved && hasSavedAccounts);
    if (container) container.classList.toggle("saved-account-mode", useSavedView);
    if (savedAccountsPanel) savedAccountsPanel.hidden = !useSavedView;
    if (manualLoginPanel) manualLoginPanel.hidden = useSavedView;
    if (backToSavedAccountsBtn) backToSavedAccountsBtn.hidden = !hasSavedAccounts;
    if (!useSavedView) {
        const usernameInput = document.querySelector("#login-username");
        if (usernameInput) usernameInput.focus();
    }
}

function setSavedAccountsBusy(isBusy) {
    if (!savedAccountList) return;
    savedAccountList.querySelectorAll("button").forEach((button) => {
        button.disabled = isBusy;
    });
}

async function fastLogin(account) {
    setSavedAccountsBusy(true);
    setMessage(loginMessage, `Signing in as ${account.name || account.username}...`, "");
    try {
        const response = await fetch(`${APIClient.CONFIG.AUTH_BASE}/me`, {
            method: "GET",
            headers: { Authorization: `Bearer ${account.token}` },
            credentials: "include",
            cache: "no-store"
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.user) {
            if (response.status === 401) {
                forgetSavedAccount(savedAccountKey(account));
                renderSavedAccounts(false);
                const usernameInput = document.querySelector("#login-username");
                if (usernameInput) usernameInput.value = account.username;
                throw new Error("Saved login expired. Please enter your password again.");
            }
            throw new Error(payload.message || "Unable to verify this saved account.");
        }

        APIClient.setAuth(account.token, payload.user);
        storeLegacySession(payload.user);
        saveAccount(payload.user, account.token);
        setMessage(loginMessage, "Login success. Redirecting...", "success");
        setTimeout(() => PageProtection.redirectAfterLogin(), 300);
    } catch (error) {
        setMessage(loginMessage, error.message || "Saved account login failed.", "error");
        setSavedAccountsBusy(false);
    }
}

function renderSavedAccounts(showSaved = true) {
    if (!savedAccountList) return;
    const accounts = readSavedAccounts();
    savedAccountList.replaceChildren();

    accounts.forEach((account) => {
        const key = savedAccountKey(account);
        const row = document.createElement("div");
        row.className = "saved-account-row";
        row.setAttribute("role", "listitem");

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = "saved-account-select";
        selectButton.setAttribute("aria-label", `Sign in as ${account.name || account.username}`);

        const avatar = document.createElement("img");
        avatar.className = "saved-account-avatar";
        avatar.src = accountAvatar(account);
        avatar.alt = "";
        avatar.addEventListener("error", () => {
            avatar.src = accountAvatar({ id: account.id });
        }, { once: true });

        const copy = document.createElement("span");
        copy.className = "saved-account-copy";
        const name = document.createElement("span");
        name.className = "saved-account-name";
        name.textContent = account.name || account.username;
        const username = document.createElement("span");
        username.className = "saved-account-username";
        username.textContent = account.position ? `${account.username} · ${account.position}` : account.username;
        copy.append(name, username);

        const arrow = document.createElement("i");
        arrow.className = "fa fa-chevron-right saved-account-arrow";
        arrow.setAttribute("aria-hidden", "true");
        selectButton.append(avatar, copy, arrow);
        selectButton.addEventListener("click", () => fastLogin(account));

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "saved-account-remove";
        removeButton.setAttribute("aria-label", `Remove ${account.name || account.username} from this device`);
        removeButton.title = "Remove account";
        removeButton.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        removeButton.addEventListener("click", () => {
            forgetSavedAccount(key);
            renderSavedAccounts(true);
            setMessage(loginMessage, "Account removed from this device.", "success");
        });

        row.append(selectButton, removeButton);
        savedAccountList.append(row);
    });

    setAccountMode(showSaved && accounts.length > 0);
}

function storeLegacySession(user) {
    const allowedFields = [
        "id", "usercode", "accountnumber", "name", "position", "department", "OT",
        "privilage", "username", "mobile_number", "VL", "SL", "OL", "VLbal",
        "SLbal", "OLbal", "employmentdate", "bioUID", "privilagemenu", "address",
        "emailadd", "area", "basic", "profile_photo_url"
    ];
    const session = Object.fromEntries(allowedFields
        .filter((field) => Object.prototype.hasOwnProperty.call(user || {}, field))
        .map((field) => [field, user[field]]));
    const serialized = JSON.stringify(session);

    try {
        localStorage.setItem(SESSION_KEY, serialized);
        return;
    } catch (error) {
        if (!error || error.name !== "QuotaExceededError") throw error;
    }

    // ponytail: browser-local read caches are disposable; offline queues and user drafts are intentionally preserved.
    Object.keys(localStorage)
        .filter((key) => key.startsWith("samelcii_cache_"))
        .forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(SESSION_KEY);

    try {
        localStorage.setItem(SESSION_KEY, serialized);
    } catch (error) {
        if (!error || error.name !== "QuotaExceededError") throw error;
        // The JWT remains authoritative; avoid keeping two browser copies of the same user record.
        localStorage.removeItem("samelcii_user");
        localStorage.setItem(SESSION_KEY, serialized);
    }
}

// Redirect if accessed via file://
if (window.location.protocol === "file:") {
    window.location.href = AUTH_URL;
}

/**
 * Login using JWT API
 */
async function loginWithDatabase(username, password) {
    const user = await APIClient.login(username, password);
    localStorage.removeItem("samelcii_legacy_login");
    storeLegacySession(user);
    return user;
}

/**
 * Register using JWT API
 */
async function registerWithDatabase(usercode, username, password) {
    const result = await APIClient.register(usercode, username, password);
    return { message: result.message || "Registration successful." };
}

/**
 * Reset password using JWT API
 */
/**
 * Populate employee list from search
 */
async function populateEmployeeList(query) {
    if (!employeeList) {
        return;
    }
    const q = query.trim().toLowerCase();
    employeeList.innerHTML = "";

    if (q.length < 2) {
        return;
    }

    try {
        const matches = await APIClient.searchEmployees(q);
        matches.forEach((item) => {
            const option = document.createElement("option");
            option.value = item.usercode;
            option.label = `${item.usercode} - ${item.name || item.department || ""}`;
            employeeList.appendChild(option);
        });
    } catch (_error) {
        employeeList.innerHTML = "";
    }
}

if (container && registerBtn && loginBtn) {
    registerBtn.addEventListener("click", () => {
        container.classList.add("active");
    });

    loginBtn.addEventListener("click", () => {
        container.classList.remove("active");
        renderSavedAccounts(true);
    });
}

function bindPasswordToggles() {
    const passwordToggles = document.querySelectorAll(".toggle-password");
    passwordToggles.forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const targetId = toggle.getAttribute("data-target");
            const targetInput = targetId ? document.getElementById(targetId) : null;
            if (!targetInput) {
                return;
            }
            const isHidden = targetInput.type === "password";
            targetInput.type = isHidden ? "text" : "password";
            toggle.classList.remove("fa-eye", "fa-eye-slash");
            toggle.classList.add(isHidden ? "fa-eye-slash" : "fa-eye");
        });
    });
}

bindPasswordToggles();

if (useAnotherAccountBtn) {
    useAnotherAccountBtn.addEventListener("click", () => {
        setMessage(loginMessage, "", "");
        setAccountMode(false);
    });
}

if (backToSavedAccountsBtn) {
    backToSavedAccountsBtn.addEventListener("click", () => {
        setMessage(loginMessage, "", "");
        renderSavedAccounts(true);
    });
}

renderSavedAccounts(true);

if (loginForm && rememberMeInput) {
    try {
        const remembered = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
        if (remembered && remembered.username) {
            const loginUsernameInput = document.querySelector("#login-username");
            if (loginUsernameInput) {
                loginUsernameInput.value = remembered.username;
                rememberMeInput.checked = true;
                localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: remembered.username }));
            }
        }
    } catch (_error) {
        localStorage.removeItem(REMEMBER_KEY);
    }
}

function hideForgotPanel() {
    if (!forgotPanel) {
        return;
    }
    forgotPanel.classList.remove("active");
    if (forgotIdentifierInput) {
        forgotIdentifierInput.value = "";
    }
    if (forgotNewPasswordInput) {
        forgotNewPasswordInput.value = "";
        forgotNewPasswordInput.type = "password";
    }
    if (forgotConfirmPasswordInput) {
        forgotConfirmPasswordInput.value = "";
        forgotConfirmPasswordInput.type = "password";
    }
    document.querySelectorAll('.toggle-password[data-target="forgot-new-password"], .toggle-password[data-target="forgot-confirm-password"]').forEach((el) => {
        el.classList.remove("fa-eye-slash");
        el.classList.add("fa-eye");
    });
}

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", () => {
        hideForgotPanel();
        setMessage(loginMessage, "For password recovery, please contact an administrator.", "error");
    });
}

if (forgotCancelBtn) {
    forgotCancelBtn.addEventListener("click", () => {
        hideForgotPanel();
        setMessage(loginMessage, "", "");
    });
}

if (forgotSaveBtn) {
    forgotSaveBtn.addEventListener("click", async () => {
        hideForgotPanel();
        setMessage(loginMessage, "For password recovery, please contact an administrator.", "error");
    });
}

function setMessage(target, text, type) {
    if (!target) {
        return;
    }
    target.textContent = text;
    target.className = "form-message";
    if (type) {
        target.classList.add(type);
    }
}

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(loginMessage, "Checking login...", "");

        const username = document.querySelector("#login-username").value.trim();
        const password = document.querySelector("#login-password").value;

        let user;
        try {
            user = await loginWithDatabase(username, password);
            // Token is automatically stored in localStorage by APIClient.login()
        } catch (error) {
            setMessage(loginMessage, error.message || "Invalid username or password.", "error");
            return;
        }

        if (rememberMeInput && rememberMeInput.checked) {
            localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username }));
            saveAccount(user, APIClient.getToken());
        } else {
            localStorage.removeItem(REMEMBER_KEY);
            forgetSavedAccount(savedAccountKey({ id: user.id, username: user.username || username }));
        }
        setMessage(loginMessage, "Login success. Redirecting...", "success");

        // Use PageProtection redirect utility
        setTimeout(() => {
            PageProtection.redirectAfterLogin();
        }, 500);
    });
}

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(registerMessage, "", "");

        const usercode = document.querySelector("#register-usercode").value.trim();
        const username = document.querySelector("#register-username").value.trim();
        const password = document.querySelector("#register-password").value;
        const confirmPassword = document.querySelector("#register-confirm-password").value;

        if (!usercode || !username || !password || !confirmPassword) {
            setMessage(registerMessage, "Please complete all fields.", "error");
            return;
        }

        if (password !== confirmPassword) {
            setMessage(registerMessage, "Passwords do not match.", "error");
            return;
        }
        if (password.length < 8) {
            setMessage(registerMessage, "Password must be at least 8 characters.", "error");
            return;
        }

        try {
            const payload = await registerWithDatabase(usercode, username, password);
            setMessage(registerMessage, payload.message || "Registration successful. Please login.", "success");
            registerForm.reset();
            container.classList.remove("active");
            if (employeeList) {
                employeeList.innerHTML = "";
            }
        } catch (error) {
            setMessage(registerMessage, error.message || "Registration failed.", "error");
        }
    });
}

let searchTimer = null;
if (employeeInput && employeeList) {
    employeeInput.addEventListener("input", () => {
        const q = employeeInput.value.trim();

        if (searchTimer) {
            clearTimeout(searchTimer);
        }

        if (q.length < 2) {
            employeeList.innerHTML = "";
            return;
        }

        searchTimer = setTimeout(() => {
            populateEmployeeList(q);
        }, 250);
    });
}
