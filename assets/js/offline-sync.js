/**
 * offline-sync.js
 * Drop this script in any page to get:
 *   - Automatic online/offline detection
 *   - Pending badge showing how many writes are queued
 *   - Auto-flush when connection is restored
 *   - Auto-pull (cache refresh) on page focus after reconnect
 *
 * Usage:
 *   <script src="/SAMELCII_WEB_SYSTEM/assets/js/offline-sync.js"></script>
 *
 * API path is auto-detected from the script src. Override with:
 *   window.SAMELCII_OFFLINE_API = '/custom/path/api/offline';
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────

  function getAuthHeaders(extraHeaders) {
    var headers = extraHeaders ? Object.assign({}, extraHeaders) : {};
    try {
      var token = localStorage.getItem('samelcii_token');
      if (token) {
        if (token.split('.').length === 3) {
          headers.Authorization = 'Bearer ' + token;
        } else {
          localStorage.removeItem('samelcii_token');
        }
      }
    } catch (e) {}
    return headers;
  }

  // Derive the offline API from the active Node server, or use the override.
  var BASE = (function () {
    if (window.SAMELCII_OFFLINE_API) return window.SAMELCII_OFFLINE_API;
    var apiBase = window.SAMELCII_NODE_API_BASE || (window.APIClient && window.APIClient.CONFIG && window.APIClient.CONFIG.NODE_API_BASE);
    if (apiBase) return String(apiBase).replace(/\/$/, '') + '/offline';
    var protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return protocol + '//' + (window.location.hostname || '127.0.0.1') + ':3000/api/offline';
  }());

  var SYNC_URL   = BASE + '/sync';
  var QUEUE_URL  = BASE + '/add-to-queue';
  var PENDING_URL = BASE + '/pending-queue';

  // How often to re-check connection and flush queue (ms)
  var CHECK_INTERVAL = 30000; // 30 seconds

  // ── State ───────────────────────────────────────────────────────────────────

  var isOnline       = navigator.onLine;
  var serverOnline   = true;
  var pendingCount   = 0;
  var badgeEl        = null;
  var syncing        = false;
  var lastSyncTime   = null;
  // HUWAG BAGUHIN: Iisang visible badge lang sa top page para hindi dumoble kapag nasa dashboard iframe ang module.
  var canShowBadge   = (function () {
    try { return window.self === window.top; } catch (e) { return false; }
  }());

  function publishStatus() {
    window.SAMELCII_SYNC_STATUS = {
      browserOnline: !!isOnline,
      serverOnline: !!serverOnline,
      pendingCount: Number(pendingCount || 0),
      syncing: !!syncing,
      lastSyncTime: lastSyncTime
    };
  }

  // ── Badge UI ─────────────────────────────────────────────────────────────────

  function createBadge() {
    if (!canShowBadge) return;
    if (badgeEl) return;
    // HUWAG BAGUHIN: Reuse existing badge if the helper was loaded twice in the same page.
    badgeEl = document.getElementById('samelcii-offline-badge');
    if (badgeEl) return;
    badgeEl = document.createElement('div');
    badgeEl.id = 'samelcii-offline-badge';
    Object.assign(badgeEl.style, {
      position:     'fixed',
      bottom:       '12px',
      right:        '12px',
      zIndex:       '99999',
      padding:      '6px 14px',
      borderRadius: '20px',
      fontSize:     '12px',
      fontFamily:   'sans-serif',
      cursor:       'pointer',
      display:      'none',
      boxShadow:    '0 2px 8px rgba(0,0,0,.25)',
      transition:   'opacity .3s',
    });
    badgeEl.title = 'Click to sync now';
    badgeEl.addEventListener('click', function () { triggerSync(true); });
    document.body.appendChild(badgeEl);
  }

  function updateBadge() {
    if (!badgeEl) createBadge();
    if (!canShowBadge || !badgeEl) {
      publishStatus();
      return;
    }
    if (!isOnline) {
      badgeEl.style.display      = 'block';
      badgeEl.style.background   = '#d32f2f';
      badgeEl.style.color        = '#fff';
      badgeEl.innerHTML          = '&#9888; Offline' + (pendingCount > 0 ? ' &bull; ' + pendingCount + ' pending' : '');
    } else if (pendingCount > 0) {
      // HUWAG BAGUHIN: Tahimik lang ang online sync para hindi matakpan ang form/table habang may pending queue.
      badgeEl.style.display      = 'none';
    } else {
      badgeEl.style.display      = 'none';
    }
    publishStatus();
  }

  // ── Fetch with offline fallback ───────────────────────────────────────────────

  /**
   * Wrapper around fetch() for POST writes.
   * When offline or server unreachable, queues the request locally.
   *
   * @param {string} endpoint  e.g. 'http://localhost:3000/api/fuel'
   * @param {Object} body      key/value pairs for the POST body
   * @param {Object} [opts]    extra fetch options
   * @returns {Promise<Response|{_queued:true}>}
   */
  window.samelciiPost = function (endpoint, body, opts) {
    if (!isOnline || !serverOnline) {
      return queueWrite(endpoint, 'POST', body).then(function (id) {
        return { _queued: true, queued_id: id };
      });
    }

    var formData = new URLSearchParams(body).toString();
    return fetch(endpoint, Object.assign({
      method:  'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body:    formData,
    }, opts || {}))
      .then(function (res) {
        if (!res.ok) {
          // HUWAG BAGUHIN: Validation errors should go back to the form.
          // I-queue lang ang real server failures (5xx) para hindi magmukhang offline ang user.
          if (res.status >= 500) {
            return queueWrite(endpoint, 'POST', body).then(function (id) {
              return { _queued: true, queued_id: id };
            });
          }
          return res;
        }
        return res;
      })
      .catch(function () {
        // Network failure — queue it
        return queueWrite(endpoint, 'POST', body).then(function (id) {
          return { _queued: true, queued_id: id };
        });
      });
  };

  // ── Queue a pending write ─────────────────────────────────────────────────────

  function resolveEndpoint(endpoint) {
    try { return new URL(endpoint, window.location.href).pathname; } catch (e) { return endpoint; }
  }

  function queueWrite(endpoint, method, payload) {
    var absEndpoint = resolveEndpoint(endpoint);
    return fetch(QUEUE_URL, {
      method:  'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body:    new URLSearchParams({
        action:       method,
        endpoint:     absEndpoint,
        data:         JSON.stringify({ method: method, payload: payload }),
      }).toString(),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        pendingCount++;
        updateBadge();
        return j.queued_id || 0;
      })
      .catch(function () {
        // If even the queue call fails (server completely down), store in localStorage
        var localQueue = localQueueLoad();
        localQueue.push({ endpoint: endpoint, method: method, payload: payload, ts: Date.now() });
        localQueueSave(localQueue);
        pendingCount++;
        updateBadge();
        return 0;
      });
  }

  // ── LocalStorage fallback queue (when the Node API itself is down) ───────────

  var LS_KEY = 'samelcii_offline_queue';

  function localQueueLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }

  function localQueueSave(q) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(q)); } catch (e) {}
  }

  function localQueueFlush() {
    var q = localQueueLoad();
    if (!q.length) return Promise.resolve();
    var chain = Promise.resolve();
    var remaining = [];
    q.forEach(function (entry) {
      chain = chain.then(function () {
        return fetch(QUEUE_URL, {
          method:  'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
          body:    new URLSearchParams({
            action:       entry.method,
            endpoint:     resolveEndpoint(entry.endpoint),
            data:         JSON.stringify({ method: entry.method, payload: entry.payload }),
          }).toString(),
        }).catch(function () { remaining.push(entry); });
      });
    });
    return chain.then(function () { localQueueSave(remaining); });
  }

  // ── Sync trigger ──────────────────────────────────────────────────────────────

  function triggerSync(force) {
    if (syncing && !force) return;
    if (!isOnline || !serverOnline) return;
    syncing = true;
    publishStatus();

    // First push any device-only items into the signed-in user's Node queue.
    localQueueFlush().then(function () {
      return fetch(SYNC_URL, {
        method: 'POST',
        headers: getAuthHeaders()
      });
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('Offline sync unavailable.');
        }
        return r.json();
      })
      .then(function (j) {
        lastSyncTime = new Date();
        pendingCount = 0;
        updateBadge();
        // Dispatch event so modules can refresh their UI
        document.dispatchEvent(new CustomEvent('samelcii:synced', { detail: j }));
      })
      .catch(function () {})
      .finally(function () { syncing = false; publishStatus(); });
  }

  function refreshPendingCount() {
    fetch(PENDING_URL, {
      headers: getAuthHeaders()
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('Offline queue unavailable.');
        }
        return r.json();
      })
      .then(function (j) {
        isOnline     = navigator.onLine;
        serverOnline = true;
        pendingCount = j && typeof j.count === 'number' ? j.count : (j && typeof j.pending_count === 'number' ? j.pending_count : 0);
        updateBadge();
      })
      .catch(function () {
        isOnline = navigator.onLine;
        serverOnline = false;
        updateBadge();
      });
  }

  // ── Online / offline events ───────────────────────────────────────────────────

  window.addEventListener('online', function () {
    isOnline = true;
    serverOnline = true;
    updateBadge();
    refreshPendingCount();
    triggerSync(true);
  });

  window.addEventListener('offline', function () {
    isOnline = false;
    updateBadge();
  });

  // Re-sync when user switches back to this tab
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && isOnline) {
      refreshPendingCount();
      triggerSync(false);
    }
  });

  // ── Periodic background check ─────────────────────────────────────────────────

  function tick() {
    if (isOnline) {
      refreshPendingCount();
      if (pendingCount > 0) triggerSync(false);
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────

  function boot() {
    createBadge();
    publishStatus();
    refreshPendingCount();
    // Kick an initial sync on page load
    if (isOnline) triggerSync(false);
    setInterval(tick, CHECK_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());

// ── Service Worker registration ────────────────────────────────────────────────
(function () {
  if (!('serviceWorker' in navigator)) return;
  // Derive sw.js path from the script's own src (assets/js/ -> app root)
  var scripts = document.querySelectorAll('script[src*="offline-sync.js"]');
  if (!scripts.length) return;
  var scriptSrc = scripts[scripts.length - 1].getAttribute('src');
  var swUrl = scriptSrc.replace(/\/assets\/js\/offline-sync\.js.*$/, '/sw.js');
  var swScope = scriptSrc.replace(/\/assets\/js\/offline-sync\.js.*$/, '/');

  // ponytail: a `?v=` query used to be baked into swUrl itself so each deploy could force a
  // fresh worker. That backfired — every bumped version registered as a DIFFERENT scriptURL,
  // so the browser kept it as a brand new registration and never touched the old one. Orphaned
  // registrations at earlier ?v= values stayed active (still controlling pages) indefinitely,
  // with no code path left that could ever reach them again to update or remove them — which is
  // exactly the stale-cache bug this was meant to prevent. `updateViaCache: 'none'` plus the
  // explicit `.update()` call below already force a real network check of sw.js's own bytes on
  // every load, so no query-string versioning is needed; the bare, unversioned URL keeps this a
  // single registration forever, and any previously-orphaned versioned registration is cleaned
  // up explicitly so it stops controlling pages instead of being left to run forever.
  if (navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(function (registration) {
        var activeUrl = registration.active && registration.active.scriptURL;
        if (activeUrl && activeUrl !== new URL(swUrl, location.href).href) {
          registration.unregister();
        }
      });
    }).catch(function () {});
  }

  navigator.serviceWorker.register(swUrl, {
    scope: swScope,
    updateViaCache: 'none'
  }).then(function (registration) {
    return registration.update();
  }).catch(function () {});
}());

// ── IndexedDB cache (window.samelciiDB) ────────────────────────────────────────
// Stores data on the device so the app works when the server is completely unreachable.
// Usage:
//   samelciiDB.saveHistory(usercode, page, rows)
//   samelciiDB.getHistory(usercode, page)   → Promise<rows[]|null>
//   samelciiDB.saveEmployee(usercode, data)
//   samelciiDB.getEmployee(usercode)         → Promise<object|null>
(function () {
  var DB_NAME    = 'samelcii_idb';
  var DB_VERSION = 1;
  var dbPromise  = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('fuel_history'))
          db.createObjectStore('fuel_history');
        if (!db.objectStoreNames.contains('fuel_employee'))
          db.createObjectStore('fuel_employee');
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror   = function ()  { reject(); };
    });
    return dbPromise;
  }

  function idbSet(storeName, key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx   = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        store.put(value, key);
        tx.oncomplete = resolve;
        tx.onerror    = resolve; // fail silently
      });
    }).catch(function () {});
  }

  function idbGet(storeName, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx    = db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        var req   = store.get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  window.samelciiDB = {
    saveHistory:  function (usercode, page, rows) {
      return idbSet('fuel_history', (usercode || '__all__') + ':' + page, rows);
    },
    getHistory:   function (usercode, page) {
      return idbGet('fuel_history', (usercode || '__all__') + ':' + page);
    },
    saveEmployee: function (usercode, data) {
      return idbSet('fuel_employee', usercode, data);
    },
    getEmployee:  function (usercode) {
      return idbGet('fuel_employee', usercode);
    },
  };
}());
