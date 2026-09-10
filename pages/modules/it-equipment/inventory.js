// IT inventory module ito; dito ayusin ang search at filters.
(function () {
    var API = `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname || "127.0.0.1"}:3000/api/it-equipment`;
    var DENSITY_STORAGE = "ite_inventory_tile_density";

    var invGrid = document.getElementById("inv-grid");
    var invSearch = document.getElementById("inv-search");
    var invCat = document.getElementById("inv-category");
    var invDensity = document.getElementById("inv-density");
    var invDensityVal = document.getElementById("inv-density-val");
    var invRefresh = document.getElementById("inv-refresh");
    var invAdd = document.getElementById("inv-add-btn");
    var invRelease = document.getElementById("inv-release-btn");
    var invPrint = document.getElementById("inv-print-btn");
    var invEmpty = document.getElementById("inv-empty");
    var invMeta = document.getElementById("inv-meta");
    var invPanel = document.getElementById("ite-inv-panel-root");

    var invVarModal = document.getElementById("inv-variant-modal");

    var invVarClose = document.getElementById("inv-var-close");

    var invVarBackdrop = document.getElementById("inv-var-backdrop");

    var invVarMeta = document.getElementById("inv-var-meta");

    var invVarTbody = document.getElementById("inv-var-tbody");

    var itemsCache = [];
    var selectedIds = {};

    var invHeadUserEl = document.getElementById("ite-inv-user-name");

    function sessionDisplayNameInv() {

        var raw = localStorage.getItem("samelcii_session");
        if (!raw) return "—";
        try {
            var s = JSON.parse(raw);
            return (s.name || s.username || "—").trim() || "—";

        } catch (_e2) {

            return "—";

        }

    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function resolveMediaUrl(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
        var clean = raw.replace(/^\/+/, "");
        clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, "");
        clean = clean.replace(/^uploads\//i, "uploads/");
        var base = window.SAMELCII_MEDIA_BASE || `${window.location.protocol || "http:"}//${window.location.hostname || "localhost"}:3000`;
        return `${base}/${clean}`;
    }

    function getAuthHeaders(extraHeaders) {
        var headers = extraHeaders ? Object.assign({}, extraHeaders) : {};
        var token = localStorage.getItem("samelcii_token");
        if (token) {
            if (token.split(".").length === 3) {
                headers.Authorization = "Bearer " + token;
            } else {
                localStorage.removeItem("samelcii_token");
            }
        }
        return headers;
    }

    function apiFetch(action, options, extraQuery) {
        var url = API + "?action=" + encodeURIComponent(action);
        if (extraQuery && typeof extraQuery === "object") {
            Object.keys(extraQuery).forEach(function (key) {
                var v = extraQuery[key];
                if (v == null) return;
                url += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(String(v));
            });
        }
        var opts = options || {};
        opts.credentials = "same-origin";
        if (!opts.headers) opts.headers = {};
        var authHeaders = getAuthHeaders();
        Object.keys(authHeaders).forEach(function (key) {
            opts.headers[key] = authHeaders[key];
        });
        return fetch(url, opts).then(function (res) {
            return res.text().then(function (text) {
                var data;
                try {
                    data = JSON.parse(text);
                } catch (_e) {
                    throw new Error("Server returned non-JSON (" + res.status + ").");
                }
                if (!res.ok) throw new Error((data && data.message) || res.statusText || "Request failed");
                return data;
            });
        });
    }

    function apiUpload(action, formData) {

        var url = API + "?action=" + encodeURIComponent(action);

        return fetch(url, { method: "POST", credentials: "same-origin", headers: getAuthHeaders(), body: formData }).then(function (res) {

            return res.text().then(function (text) {

                var data;

                try {
                    data = JSON.parse(text);

                } catch (_e) {

                    throw new Error("Server returned non-JSON (" + res.status + ").");

                }

                if (!res.ok) throw new Error((data && data.message) || res.statusText || "Request failed");

                return data;

            });

        });

    }


    function shrinkImageFileIfLarge(file, maxLong) {

        maxLong = maxLong || 520;

        return new Promise(function (resolve) {

            if (!file || !file.type || file.type.indexOf("image/") !== 0) {

                resolve(file);

                return;

            }

            var blobUrl = URL.createObjectURL(file);

            var img = new Image();

            img.onload = function () {

                URL.revokeObjectURL(blobUrl);

                var w = img.naturalWidth;

                var h = img.naturalHeight;

                if (!w || !h || (w <= maxLong && h <= maxLong)) {

                    resolve(file);

                    return;

                }

                var scale = Math.min(maxLong / w, maxLong / h);

                var nw = Math.max(1, Math.round(w * scale));

                var nh = Math.max(1, Math.round(h * scale));

                var c = document.createElement("canvas");

                c.width = nw;

                c.height = nh;

                var ctx = c.getContext("2d");

                if (!ctx) {

                    resolve(file);

                    return;

                }

                ctx.drawImage(img, 0, 0, nw, nh);

                c.toBlob(

                    function (blob) {

                        if (!blob) {

                            resolve(file);

                            return;

                        }

                        var base = file.name.replace(/\.[^.]+$/, "");

                        resolve(new File([blob], (base || "photo") + ".jpg", { type: "image/jpeg" }));

                    },

                    "image/jpeg",

                    0.88

                );

            };


            img.onerror = function () {

                URL.revokeObjectURL(blobUrl);

                resolve(file);

            };


            img.src = blobUrl;


        });

    }


    function uploadInventoryPhoto(rowPk, invTable, file, cardEl, groupIds) {

        shrinkImageFileIfLarge(file, 520).then(function (ready) {

            var fd = new FormData();

            fd.append("inv_table", invTable);

            fd.append("row_pk", String(rowPk));

            fd.append("photo", ready);

            if (groupIds && groupIds.length > 1) {
                fd.append("group_row_pks", JSON.stringify(groupIds));
            }

            if (cardEl) cardEl.classList.add("ite-inv-upload-pending");

            apiUpload("upload_inventory_image", fd)

                .then(function () {

                    if (cardEl) cardEl.classList.remove("ite-inv-upload-pending");

                    loadInventory(false);

                })

                .catch(function (err) {

                    if (cardEl) cardEl.classList.remove("ite-inv-upload-pending");

                    window.alert(err.message || String(err));

                });

        });

    }

    function setGroupSelection(ids, wantOn) {

        (ids || []).forEach(function (gid) {

            if (wantOn) selectedIds[String(gid)] = true;

            else delete selectedIds[String(gid)];

        });

        updateSelectionBadge();

    }

    function syncCardCheckboxFromGroup(cardInput, gids) {

        if (!cardInput || !gids || !gids.length) return;

        cardInput.checked = gids.every(function (gid) {

            return !!selectedIds[String(gid)];

        });

    }

    function closeInvVariantModal() {

        if (!invVarModal) return;

        invVarModal.hidden = true;

        invVarModal.setAttribute("aria-hidden", "true");

    }

    function openInvVariantModal(it) {

        if (!invVarModal || !invVarTbody) return;

        var title = document.getElementById("inv-var-title");

        if (title) title.textContent = "Material variants";

        if (invVarMeta) {


            invVarMeta.textContent =

                (it.category || "—") +

                " · " +

                (it.description || "—") +

                (it.variantCount ? " (" + it.variantCount + " rows)" : "");

        }

        invVarTbody.innerHTML = "";

        (it.variants || []).forEach(function (v) {


            var mc = v.materialCode || v.itemCode || "—";

            var tr = document.createElement("tr");

            tr.innerHTML =

                "<td>" +

                escHtml(mc) +

                '</td><td class="num">' +

                escHtml(v.qty != null ? v.qty : "") +

                '</td><td class="num">' +

                escHtml(v.id) +

                "</td>";

            invVarTbody.appendChild(tr);

        });

        invVarModal.hidden = false;

        invVarModal.setAttribute("aria-hidden", "false");

    }

    function densityToMinPx(step) {
        var n = parseInt(step, 10);

        var map = { 1: 96, 2: 118, 3: 148, 4: 188, 5: 240 };

        return map[n] != null ? map[n] : 148;
    }

    function densityLabel(step) {

        var n = parseInt(step, 10);
        var map = { 1: "Tiny", 2: "Compact", 3: "Normal", 4: "Comfort", 5: "Large" };

        return map[n] != null ? map[n] : "Normal";

    }

    function applyDensity(step) {

        var px = densityToMinPx(step);

        if (invPanel) invPanel.style.setProperty("--ite-inv-min", px + "px");

        if (invDensityVal) invDensityVal.textContent = densityLabel(step);

        try {

            localStorage.setItem(DENSITY_STORAGE, String(step));

        } catch (_e) {

        }

    }

    function initDensityFromStorage() {

        try {

            var s = parseInt(localStorage.getItem(DENSITY_STORAGE) || "3", 10);

            if (s < 1 || s > 5) s = 3;

            if (invDensity) invDensity.value = String(s);

            applyDensity(s);

        } catch (_e) {

            applyDensity(3);

        }

    }

    function uniqueCategories(list) {

        var m = {};
        (list || []).forEach(function (it) {

            var c = String(it.category || "").trim();

            if (c !== "") m[c] = true;

        });
        var out = Object.keys(m);

        out.sort(function (a, b) {

            return a.localeCompare(b);

        });

        return out;

    }

    function refillCategoryFilter(allItems) {

        if (!invCat) return;

        var prev = invCat.value;

        var cats = uniqueCategories(allItems);

        invCat.innerHTML = "";
        var optAllEl = document.createElement("option");
        optAllEl.value = "all";
        optAllEl.textContent = "All categories";
        invCat.appendChild(optAllEl);

        cats.forEach(function (c) {

            var opt = document.createElement("option");
            opt.value = c;

            opt.textContent = c;
            invCat.appendChild(opt);

        });

        if (prev === "all" || cats.indexOf(prev) !== -1) invCat.value = prev;

        else invCat.value = "all";

    }

    function updateSelectionBadge() {

        var n = Object.keys(selectedIds).length;

        if (invRelease) {

            invRelease.disabled = n === 0;

            invRelease.textContent = n ? "Release (" + n + ")" : "Release";

        }

    }

    function renderCards(list) {

        if (!invGrid) return;

        invGrid.innerHTML = "";

        (list || []).forEach(function (it) {

            var id = parseInt(it.id, 10) || 0;

            var gids = [];

            if (it.groupIds && it.groupIds.length) {

                it.groupIds.forEach(function (gid) {

                    var n = parseInt(gid, 10);

                    if (!isNaN(n) && n > 0) gids.push(n);

                });

            }

            if (gids.length === 0 && id > 0) gids.push(id);

            var pid = escHtml(id);

            var isSel =
                gids.length > 0 &&
                gids.every(function (gid) {

                    return !!selectedIds[String(gid)];

                });

            var art = document.createElement("article");
            art.className = "ite-inv-card" + (isSel ? " is-selected" : "");
            art.dataset.id = pid;

            var photo = resolveMediaUrl(it.photoUrl);

            var canUp = !!(it.canUploadPhoto && it.invTable);

            var invTbl = String(it.invTable || "").trim();

            var vCount =
                typeof it.variantCount === "number"
                    ? it.variantCount

                    : it.groupIds && it.groupIds.length
                      ? it.groupIds.length

                      : gids.length;


            var isMulti = !!(it.isGroup && vCount > 1);

            var codeLine = escHtml(it.itemCodesSummary != null ? String(it.itemCodesSummary) : it.itemCode || "—");


            var photoHit = "";

            if (canUp || isMulti) {

                photoHit +=

                    '<div class="ite-inv-card-photo-hit"><div class="ite-inv-photo-actions">' +

                    (isMulti ? '<button type="button" class="ite-inv-view-btn">View</button>' : "") +

                    (canUp
                        ? '<label class="ite-inv-photo-btn">Upload image<input type="file" class="ite-inv-photo-input" accept="image/*" /></label>'
                        : "") +

                    "</div></div>";

            }

            var mediaParts =

                (photo

                    ? '<img class="ite-inv-card-img" src="' + escHtml(photo) + '" alt="" loading="lazy" />' +

                      '<div class="ite-inv-card-ph" hidden aria-hidden="true"></div>'

                    : '<div class="ite-inv-card-ph"></div>') +

                photoHit;


            art.innerHTML =
                '<div class="ite-inv-card-select" title="Select"><input type="checkbox" data-card-id="' +
                pid +
                '" ' +
                (isSel ? "checked" : "") +
                "/></div>" +
                '<div class="ite-inv-card-media">' +
                mediaParts +
                '</div><div class="ite-inv-card-body">' +
                '<span class="ite-inv-card-code">' +
                codeLine +
                '</span><h4 class="ite-inv-card-desc" title="' +
                escHtml(it.description || "") +
                '">' +
                escHtml(it.description || "") +
                '</h4><span class="ite-inv-card-cat">' +
                escHtml(it.category || "—") +
                "</span></div>";

            var cardInput = art.querySelector("input[data-card-id]");

            if (cardInput) {

                cardInput.addEventListener("click", function (ev) {

                    ev.stopPropagation();

                });


                cardInput.addEventListener("change", function () {

                    var want = cardInput.checked;

                    setGroupSelection(gids, want);

                    syncCardCheckboxFromGroup(cardInput, gids);

                    art.classList.toggle("is-selected", cardInput.checked);

                });

            }

            var imgEl = art.querySelector(".ite-inv-card-img");


            if (imgEl)


                imgEl.addEventListener("error", function () {

                    imgEl.style.display = "none";

                    var ph = art.querySelector(".ite-inv-card-ph");

                    if (ph) ph.removeAttribute("hidden");

                });

            var viewBtn = art.querySelector(".ite-inv-view-btn");


            if (viewBtn)


                viewBtn.addEventListener("click", function (ev) {

                    ev.stopPropagation();

                    openInvVariantModal(it);

                });


            var photoInp = art.querySelector(".ite-inv-photo-input");

            if (photoInp && canUp && invTbl) {


                photoInp.addEventListener("click", function (ev) {

                    ev.stopPropagation();

                });


                photoInp.addEventListener("change", function () {


                    var f = photoInp.files && photoInp.files[0];

                    photoInp.value = "";

                    if (!f) return;


                    uploadInventoryPhoto(id, invTbl, f, art, gids);


                });


            }


            art.addEventListener("click", function (e) {

                if (
                    !cardInput ||
                    e.target.closest(".ite-inv-card-select") ||
                    e.target.closest(".ite-inv-card-photo-hit")
                ) {


                    return;

                }



                var allOn = gids.every(function (gid) {


                    return !!selectedIds[String(gid)];

                });


                setGroupSelection(gids, !allOn);

                syncCardCheckboxFromGroup(cardInput, gids);


                art.classList.toggle("is-selected", cardInput.checked);


            });


            syncCardCheckboxFromGroup(cardInput, gids);


            invGrid.appendChild(art);

        });


        if ((!list || list.length === 0) && invEmpty) {

            invEmpty.hidden = false;

        } else if (invEmpty) invEmpty.hidden = true;

    }

    function filterClient(list) {


        var q = invSearch ? invSearch.value.trim().toLowerCase() : "";

        var cat = invCat ? invCat.value : "all";

        return list.filter(function (it) {


            var vBlob = "";

            if (it.variants && it.variants.length)


                it.variants.forEach(function (v) {

                    vBlob += " " + (v.materialCode || v.itemCode || "") + " " + String(v.id || "") + " " + String(v.qty || "");

                });

            var blob = [
                it.materialCodesBlob || "",
                vBlob,
                it.itemCodesSummary || "",
                it.itemCode || "",
                it.description || "",
                it.category || "",
                String(it.id || ""),
            ]
                    .join(" ")
                    .toLowerCase();


            var okq = q === "" || blob.indexOf(q) !== -1;


            var okc = cat === "all" || strcasecmpTrim(it.category, cat);

            return okq && okc;

        });

    }

    function strcasecmpTrim(a, b) {
        return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    }

    function renderGridFiltered() {

        renderCards(filterClient(itemsCache));

    }

    function loadInventory(showAlert) {

        return apiFetch("list_inventory", { method: "GET" })
            .then(function (d) {
                itemsCache = d.items || [];

                refillCategoryFilter(itemsCache);

                renderGridFiltered();

                if (invMeta) {

                    var msg = "";

                    if (d.message) msg = escHtml(d.message);

                    invMeta.innerHTML =
                        '<span>' +
                        (d.database ? "DB <code>" + escHtml(d.database) + "</code> · " : "") +
                        (d.table ? "Table <code>" + escHtml(d.table) + "</code> · " : "") +
                        (itemsCache.length + " lines") +
                        "</span>";

                    if (msg) invMeta.innerHTML += " · <span class=\"ite-inv-muted\">" + msg + "</span>";

                }

                if ((!itemsCache.length && d.table == null && showAlert) && d.message)

                    console.warn("[inventory]", d.message);

            })

            .catch(function (err) {

                window.alert(err.message || String(err));

            });

    }

    function printGrid() {

        var list = filterClient(itemsCache);

        var html =
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>IT inventory</title><style>@media print{body{margin:0}}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:16px;color:#0f172a}h1{font-size:17px;margin:0 0 12px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.c{border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#fafafa}.qty{font-weight:700;font-size:12px;color:#2563eb}.code{font-size:11px;color:#64748b}.dh{font-size:12px;font-weight:600;margin:4px 0;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.cat{font-size:10px;text-transform:uppercase;color:#94a3b8}.vv{font-size:10px;line-height:1.45;color:#475569;margin-top:8px;font-variant-numeric:tabular-nums}</style></head><body><h1>IT equipment inventory — " +
            escHtml(new Date().toLocaleString()) +
            '</h1><div class="g">';

        list.forEach(function (it) {

            var qtyShow = it.qtyTotal != null ? it.qtyTotal : it.qty;

            var codesShow = escHtml(it.itemCodesSummary != null ? it.itemCodesSummary : it.itemCode || "");

            var sub = "";

            if (it.isGroup && it.variants && it.variants.length > 1) {


                sub =

                    '<div class="vv">' +

                    it.variants


                        .map(function (v) {


                            return escHtml(v.materialCode || v.itemCode || "—") + " · qty " + escHtml(v.qty != null ? v.qty : "—");

                        











                        })

                        .join("<br />") +

                    "</div>";

            }













            html +=
                '<div class="c"><div class="qty">Qty ' +
                escHtml(qtyShow) +
                '</div><div class="code">' +
                codesShow +
                '</div><div class="dh">' +
                escHtml(it.description || "") +
                '</div><div class="cat">' +
                escHtml(it.category || "") +
                "</div>" +
                sub +
                "</div>";

        });

        html += '</div></body></html>';
        var w = window.open("", "_blank");

        if (!w) {

            window.alert("Allow pop-ups to print.");

            return;

        }

        w.document.write(html);
        w.document.close();
        setTimeout(function () {
            w.print();
        }, 200);

    }

    initDensityFromStorage();

    updateSelectionBadge();

    if (invHeadUserEl) invHeadUserEl.textContent = sessionDisplayNameInv();

    if (invDensity) {

        invDensity.addEventListener("input", function () {

            applyDensity(invDensity.value);

        });

        invDensity.addEventListener("change", function () {

            applyDensity(invDensity.value);

        });

    }

    if (invSearch) invSearch.addEventListener("input", renderGridFiltered);

    if (invCat)
        invCat.addEventListener("change", function () {

            renderGridFiltered();

        });

    if (invRefresh)
        invRefresh.addEventListener("click", function () {

            selectedIds = {};
            loadInventory(false);

            updateSelectionBadge();

        });

    if (invRelease)
        invRelease.addEventListener("click", function () {

            var ids = Object.keys(selectedIds);
            window.alert(ids.length === 0 ? "Select one or more items first." : "Release flow is not connected here yet.\nSelected ids: " + ids.join(", "));

        });

    if (invAdd)

        invAdd.addEventListener("click", function () {

            window.alert("Add item: connect legacy save/create next. Opening help in console.");

        });

    if (invPrint)

        invPrint.addEventListener("click", printGrid);

    if (invVarClose) invVarClose.addEventListener("click", closeInvVariantModal);

    if (invVarBackdrop) invVarBackdrop.addEventListener("click", closeInvVariantModal);


    loadInventory(false);

})();
