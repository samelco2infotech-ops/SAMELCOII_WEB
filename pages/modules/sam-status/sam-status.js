// SAM Server Status module — read-only ops view (pm2 process + Ollama reachability).
(function () {
    var API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/sam-server-status`;
    var REFRESH_MS = 15000;
    var cardsEl = document.getElementById("sst-cards");
    var checkedAtEl = document.getElementById("sst-checked-at");
    var refreshBtn = document.getElementById("sst-refresh-btn");
    var timer = null;

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function getAuthHeaders() {
        var headers = {};
        var token = localStorage.getItem("samelcii_token");
        if (token && token.split(".").length === 3) headers.Authorization = "Bearer " + token;
        return headers;
    }

    function fmtUptime(ms) {
        if (!ms || ms <= 0) return "—";
        var s = Math.floor(ms / 1000);
        var d = Math.floor(s / 86400); s -= d * 86400;
        var h = Math.floor(s / 3600); s -= h * 3600;
        var m = Math.floor(s / 60);
        var parts = [];
        if (d) parts.push(d + "d");
        if (h) parts.push(h + "h");
        parts.push(m + "m");
        return parts.join(" ");
    }

    function statusClass(status) {
        var s = String(status || "unknown").toLowerCase();
        if (s === "online") return "online";
        if (s === "stopped" || s === "errored") return s;
        return "unknown";
    }

    function render(data) {
        checkedAtEl.textContent = "Checked " + new Date(data.checkedAt).toLocaleTimeString();

        var cards = [];

        if (!data.pm2Available) {
            cards.push(
                '<div class="sst-card"><p class="sst-card-title">pm2</p>' +
                '<p class="sst-card-value"><span class="sst-badge offline">Unreachable</span></p>' +
                '<p class="sst-card-sub">pm2 command not found or timed out on the server host.</p></div>'
            );
        } else if (!data.processes.length) {
            cards.push(
                '<div class="sst-card"><p class="sst-card-title">pm2</p>' +
                '<p class="sst-card-value"><span class="sst-badge unknown">No processes</span></p>' +
                '<p class="sst-card-sub">pm2 is running but manages nothing yet.</p></div>'
            );
        } else {
            data.processes.forEach(function (p) {
                cards.push(
                    '<div class="sst-card"><p class="sst-card-title">' + escHtml(p.name) + '</p>' +
                    '<p class="sst-card-value"><span class="sst-badge ' + statusClass(p.status) + '">' + escHtml(p.status) + '</span></p>' +
                    '<p class="sst-card-sub">Uptime: ' + fmtUptime(p.uptimeMs) + ' · Restarts: ' + p.restarts + '<br/>' +
                    'Memory: ' + p.memoryMb + ' MB · CPU: ' + p.cpuPercent + '%</p></div>'
                );
            });
        }

        cards.push(
            '<div class="sst-card"><p class="sst-card-title">Ollama (' + escHtml(data.ollamaUrl) + ')</p>' +
            '<p class="sst-card-value"><span class="sst-badge ' + (data.ollamaReachable ? "online" : "offline") + '">' +
            (data.ollamaReachable ? "Reachable" : "Unreachable") + '</span></p>' +
            '<p class="sst-card-sub">Local AI model server used by SAM.</p></div>'
        );

        cardsEl.innerHTML = cards.join("");
    }

    function renderError(message) {
        cardsEl.innerHTML = '<div class="sst-error"><i class="fa fa-exclamation-triangle" aria-hidden="true"></i> ' + escHtml(message) + '</div>';
    }

    function load() {
        fetch(API, { headers: getAuthHeaders() })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok || !result.data.ok) {
                    renderError((result.data && result.data.message) || "Could not load SAM server status.");
                    return;
                }
                render(result.data);
            })
            .catch(function () { renderError("Network error — could not reach the status endpoint."); });
    }

    refreshBtn.addEventListener("click", load);
    load();
    timer = setInterval(load, REFRESH_MS);
    window.addEventListener("beforeunload", function () { clearInterval(timer); });
})();
