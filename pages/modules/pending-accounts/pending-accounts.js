// Pending Accounts module — admin approval queue for self-registration (see auth.js
// /pending-registrations, /approve-registration, /reject-registration). Privilege 10 only.
(function () {
    var API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/auth`;
    var bodyEl = document.getElementById("pending-body");
    var messageEl = document.getElementById("pending-message");
    var refreshBtn = document.getElementById("refresh-btn");

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function authHeaders() {
        var headers = {};
        var token = localStorage.getItem("samelcii_token");
        if (token && token.split(".").length === 3) headers.Authorization = "Bearer " + token;
        return headers;
    }

    function setMessage(text, isError) {
        messageEl.textContent = text || "";
        messageEl.className = "message" + (isError ? " error" : text ? " success" : "");
    }

    function renderRows(items) {
        if (!items.length) {
            bodyEl.innerHTML = '<tr><td colspan="6">No pending registrations.</td></tr>';
            return;
        }
        bodyEl.innerHTML = items.map(function (item) {
            var usercode = escHtml(item.usercode);
            return "<tr>" +
                "<td>" + usercode + "</td>" +
                "<td>" + escHtml(item.name) + "</td>" +
                "<td>" + escHtml(item.position) + "</td>" +
                "<td>" + escHtml(item.department) + "</td>" +
                "<td>" + escHtml(item.username) + "</td>" +
                '<td><button type="button" class="btn" data-action="approve" data-usercode="' + usercode + '">Approve</button> ' +
                '<button type="button" class="btn secondary" data-action="reject" data-usercode="' + usercode + '">Reject</button></td>' +
                "</tr>";
        }).join("");
    }

    function load() {
        setMessage("");
        bodyEl.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
        fetch(API + "/pending-registrations", { credentials: "same-origin", headers: authHeaders() })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok || !result.data.ok) {
                    bodyEl.innerHTML = '<tr><td colspan="6">Could not load pending accounts.</td></tr>';
                    setMessage((result.data && result.data.message) || "Could not load pending accounts.", true);
                    return;
                }
                renderRows(result.data.items || []);
            })
            .catch(function () {
                bodyEl.innerHTML = '<tr><td colspan="6">Network error.</td></tr>';
                setMessage("Network error — could not reach the server.", true);
            });
    }

    function act(action, usercode, button) {
        button.disabled = true;
        fetch(API + "/" + action + "-registration", {
            method: "POST",
            credentials: "same-origin",
            headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
            body: JSON.stringify({ usercode: usercode }),
        })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok || !result.data.ok) {
                    setMessage((result.data && result.data.message) || "Action failed.", true);
                    button.disabled = false;
                    return;
                }
                setMessage(result.data.message || "Done.");
                load();
            })
            .catch(function () {
                setMessage("Network error — could not reach the server.", true);
                button.disabled = false;
            });
    }

    bodyEl.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-action]");
        if (!button) return;
        var action = button.getAttribute("data-action");
        var usercode = button.getAttribute("data-usercode");
        if (action === "reject" && !window.confirm("Reject this registration? The employee will need to register again.")) {
            return;
        }
        act(action, usercode, button);
    });

    refreshBtn.addEventListener("click", load);
    load();
})();
