// IT equipment shell ito; dito hawakan ang panel flow base sa ?tab= mula sa dashboard sidebar.
(function () {
    var tabs = document.querySelectorAll(".ite-tab");
    var panels = document.querySelectorAll(".ite-panel");
    var allowedTabs = ["accountability", "job-order", "status-report", "turn-over", "inventory"];

    function getInitialTab() {
        var params = new URLSearchParams(window.location.search);
        var tab = (params.get("tab") || "").trim();
        if (allowedTabs.indexOf(tab) !== -1) return tab;
        return "accountability";
    }

    function activateTab(id) {
        tabs.forEach(function (btn) {
            var sel = btn.getAttribute("data-tab") === id;
            btn.setAttribute("aria-selected", sel ? "true" : "false");
            btn.tabIndex = sel ? 0 : -1;
        });
        panels.forEach(function (p) {
            var active = p.id === "ite-panel-" + id;
            p.classList.toggle("is-active", active);
            p.setAttribute("aria-hidden", active ? "false" : "true");
            if (active) p.removeAttribute("hidden");
            else p.setAttribute("hidden", "");
        });
    }

    tabs.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-tab");
            if (id) activateTab(id);
        });
    });

    document.addEventListener("keydown", function (e) {
        if (!e.target || !e.target.classList || !e.target.classList.contains("ite-tab")) return;
        var keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (keys.indexOf(e.key) === -1) return;
        var list = Array.prototype.slice.call(tabs);
        var i = list.indexOf(e.target);
        if (i < 0) return;
        e.preventDefault();
        var next = i;
        if (e.key === "ArrowLeft") next = (i + list.length - 1) % list.length;
        if (e.key === "ArrowRight") next = (i + 1) % list.length;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = list.length - 1;
        list[next].focus();
        var nid = list[next].getAttribute("data-tab");
        if (nid) activateTab(nid);
    });

    activateTab(getInitialTab());
})();
