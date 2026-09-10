// Shared module guard ito; dito ayusin ang session at header flow.
(function () {
    function redirectToAuth() {
        const path = String(window.location.pathname || "");
        if (path.indexOf("/pages/modules/mobile-approvals/") !== -1) {
            const nextUrl = encodeURIComponent("../../pages/modules/mobile-approvals/index.html");
            window.location.href = `../../auth/mobile.html?next=${nextUrl}`;
            return;
        }
        window.location.href = "../../auth/index.html";
    }

    const sessionRaw = localStorage.getItem("samelcii_session");
    if (!sessionRaw) {
        redirectToAuth();
        return;
    }

    let session;
    try {
        session = JSON.parse(sessionRaw);
    } catch (_error) {
        localStorage.removeItem("samelcii_session");
        redirectToAuth();
        return;
    }

    const who = document.getElementById("logged-user");
    if (who) {
        who.textContent = session.username || "-";
    }
})();
