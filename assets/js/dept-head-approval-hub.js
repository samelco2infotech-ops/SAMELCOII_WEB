"use strict";

function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return e; }; var t, e = {}, r = Object.prototype, n = r.hasOwnProperty, o = Object.defineProperty || function (t, e, r) { t[e] = r.value; }, i = "function" == typeof Symbol ? Symbol : {}, a = i.iterator || "@@iterator", c = i.asyncIterator || "@@asyncIterator", u = i.toStringTag || "@@toStringTag"; function define(t, e, r) { return Object.defineProperty(t, e, { value: r, enumerable: !0, configurable: !0, writable: !0 }), t[e]; } try { define({}, ""); } catch (t) { define = function define(t, e, r) { return t[e] = r; }; } function wrap(t, e, r, n) { var i = e && e.prototype instanceof Generator ? e : Generator, a = Object.create(i.prototype), c = new Context(n || []); return o(a, "_invoke", { value: makeInvokeMethod(t, r, c) }), a; } function tryCatch(t, e, r) { try { return { type: "normal", arg: t.call(e, r) }; } catch (t) { return { type: "throw", arg: t }; } } e.wrap = wrap; var h = "suspendedStart", l = "suspendedYield", f = "executing", s = "completed", y = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var p = {}; define(p, a, function () { return this; }); var d = Object.getPrototypeOf, v = d && d(d(values([]))); v && v !== r && n.call(v, a) && (p = v); var g = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(p); function defineIteratorMethods(t) { ["next", "throw", "return"].forEach(function (e) { define(t, e, function (t) { return this._invoke(e, t); }); }); } function AsyncIterator(t, e) { function invoke(r, o, i, a) { var c = tryCatch(t[r], t, o); if ("throw" !== c.type) { var u = c.arg, h = u.value; return h && "object" == typeof h && n.call(h, "__await") ? e.resolve(h.__await).then(function (t) { invoke("next", t, i, a); }, function (t) { invoke("throw", t, i, a); }) : e.resolve(h).then(function (t) { u.value = t, i(u); }, function (t) { return invoke("throw", t, i, a); }); } a(c.arg); } var r; o(this, "_invoke", { value: function value(t, n) { function callInvokeWithMethodAndArg() { return new e(function (e, r) { invoke(t, n, e, r); }); } return r = r ? r.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(e, r, n) { var o = h; return function (i, a) { if (o === f) throw Error("Generator is already running"); if (o === s) { if ("throw" === i) throw a; return { value: t, done: !0 }; } for (n.method = i, n.arg = a;;) { var c = n.delegate; if (c) { var u = maybeInvokeDelegate(c, n); if (u) { if (u === y) continue; return u; } } if ("next" === n.method) n.sent = n._sent = n.arg;else if ("throw" === n.method) { if (o === h) throw o = s, n.arg; n.dispatchException(n.arg); } else "return" === n.method && n.abrupt("return", n.arg); o = f; var p = tryCatch(e, r, n); if ("normal" === p.type) { if (o = n.done ? s : l, p.arg === y) continue; return { value: p.arg, done: n.done }; } "throw" === p.type && (o = s, n.method = "throw", n.arg = p.arg); } }; } function maybeInvokeDelegate(e, r) { var n = r.method, o = e.iterator[n]; if (o === t) return r.delegate = null, "throw" === n && e.iterator.return && (r.method = "return", r.arg = t, maybeInvokeDelegate(e, r), "throw" === r.method) || "return" !== n && (r.method = "throw", r.arg = new TypeError("The iterator does not provide a '" + n + "' method")), y; var i = tryCatch(o, e.iterator, r.arg); if ("throw" === i.type) return r.method = "throw", r.arg = i.arg, r.delegate = null, y; var a = i.arg; return a ? a.done ? (r[e.resultName] = a.value, r.next = e.nextLoc, "return" !== r.method && (r.method = "next", r.arg = t), r.delegate = null, y) : a : (r.method = "throw", r.arg = new TypeError("iterator result is not an object"), r.delegate = null, y); } function pushTryEntry(t) { var e = { tryLoc: t[0] }; 1 in t && (e.catchLoc = t[1]), 2 in t && (e.finallyLoc = t[2], e.afterLoc = t[3]), this.tryEntries.push(e); } function resetTryEntry(t) { var e = t.completion || {}; e.type = "normal", delete e.arg, t.completion = e; } function Context(t) { this.tryEntries = [{ tryLoc: "root" }], t.forEach(pushTryEntry, this), this.reset(!0); } function values(e) { if (e || "" === e) { var r = e[a]; if (r) return r.call(e); if ("function" == typeof e.next) return e; if (!isNaN(e.length)) { var o = -1, i = function next() { for (; ++o < e.length;) if (n.call(e, o)) return next.value = e[o], next.done = !1, next; return next.value = t, next.done = !0, next; }; return i.next = i; } } throw new TypeError(typeof e + " is not iterable"); } return GeneratorFunction.prototype = GeneratorFunctionPrototype, o(g, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), o(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, u, "GeneratorFunction"), e.isGeneratorFunction = function (t) { var e = "function" == typeof t && t.constructor; return !!e && (e === GeneratorFunction || "GeneratorFunction" === (e.displayName || e.name)); }, e.mark = function (t) { return Object.setPrototypeOf ? Object.setPrototypeOf(t, GeneratorFunctionPrototype) : (t.__proto__ = GeneratorFunctionPrototype, define(t, u, "GeneratorFunction")), t.prototype = Object.create(g), t; }, e.awrap = function (t) { return { __await: t }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, c, function () { return this; }), e.AsyncIterator = AsyncIterator, e.async = function (t, r, n, o, i) { void 0 === i && (i = Promise); var a = new AsyncIterator(wrap(t, r, n, o), i); return e.isGeneratorFunction(r) ? a : a.next().then(function (t) { return t.done ? t.value : a.next(); }); }, defineIteratorMethods(g), define(g, u, "Generator"), define(g, a, function () { return this; }), define(g, "toString", function () { return "[object Generator]"; }), e.keys = function (t) { var e = Object(t), r = []; for (var n in e) r.push(n); return r.reverse(), function next() { for (; r.length;) { var t = r.pop(); if (t in e) return next.value = t, next.done = !1, next; } return next.done = !0, next; }; }, e.values = values, Context.prototype = { constructor: Context, reset: function reset(e) { if (this.prev = 0, this.next = 0, this.sent = this._sent = t, this.done = !1, this.delegate = null, this.method = "next", this.arg = t, this.tryEntries.forEach(resetTryEntry), !e) for (var r in this) "t" === r.charAt(0) && n.call(this, r) && !isNaN(+r.slice(1)) && (this[r] = t); }, stop: function stop() { this.done = !0; var t = this.tryEntries[0].completion; if ("throw" === t.type) throw t.arg; return this.rval; }, dispatchException: function dispatchException(e) { if (this.done) throw e; var r = this; function handle(n, o) { return a.type = "throw", a.arg = e, r.next = n, o && (r.method = "next", r.arg = t), !!o; } for (var o = this.tryEntries.length - 1; o >= 0; --o) { var i = this.tryEntries[o], a = i.completion; if ("root" === i.tryLoc) return handle("end"); if (i.tryLoc <= this.prev) { var c = n.call(i, "catchLoc"), u = n.call(i, "finallyLoc"); if (c && u) { if (this.prev < i.catchLoc) return handle(i.catchLoc, !0); if (this.prev < i.finallyLoc) return handle(i.finallyLoc); } else if (c) { if (this.prev < i.catchLoc) return handle(i.catchLoc, !0); } else { if (!u) throw Error("try statement without catch or finally"); if (this.prev < i.finallyLoc) return handle(i.finallyLoc); } } } }, abrupt: function abrupt(t, e) { for (var r = this.tryEntries.length - 1; r >= 0; --r) { var o = this.tryEntries[r]; if (o.tryLoc <= this.prev && n.call(o, "finallyLoc") && this.prev < o.finallyLoc) { var i = o; break; } } i && ("break" === t || "continue" === t) && i.tryLoc <= e && e <= i.finallyLoc && (i = null); var a = i ? i.completion : {}; return a.type = t, a.arg = e, i ? (this.method = "next", this.next = i.finallyLoc, y) : this.complete(a); }, complete: function complete(t, e) { if ("throw" === t.type) throw t.arg; return "break" === t.type || "continue" === t.type ? this.next = t.arg : "return" === t.type ? (this.rval = this.arg = t.arg, this.method = "return", this.next = "end") : "normal" === t.type && e && (this.next = e), y; }, finish: function finish(t) { for (var e = this.tryEntries.length - 1; e >= 0; --e) { var r = this.tryEntries[e]; if (r.finallyLoc === t) return this.complete(r.completion, r.afterLoc), resetTryEntry(r), y; } }, catch: function _catch(t) { for (var e = this.tryEntries.length - 1; e >= 0; --e) { var r = this.tryEntries[e]; if (r.tryLoc === t) { var n = r.completion; if ("throw" === n.type) { var o = n.arg; resetTryEntry(r); } return o; } } throw Error("illegal catch attempt"); }, delegateYield: function delegateYield(e, r, n) { return this.delegate = { iterator: values(e), resultName: r, nextLoc: n }, "next" === this.method && (this.arg = t), y; } }, e; }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
* SAMELCII - Department Head floating approval hub (dashboard).
* GABAY: Draggable FAB; full-screen left list + right detail view para Fuel, EPASS, Travel, Leave, OT.
*/
(function initDeptHeadApprovalHub(global) {
  var SESSION_KEY = "samelcii_session";
  var FAB_POS_KEY = "dept_head_approval_fab_pos";
  var AREA_PIN_KEY = "dept_head_approval_pinned_areas";
  var LAST_SECTION_KEY = "dept_head_approval_last_section";
  var NOTIFICATION_SOUND_KEY = "dept_head_approval_notification_muted";
  var NOTIFICATION_HISTORY_PREFIX = "dept_head_approval_notification_history:";
  var APP_BASE = ((_window$location, _window$location2) => {
    var origin = ((_window$location = window.location) === null || _window$location === void 0 ? void 0 : _window$location.origin) || `${window.location.protocol || 'http:'}//${window.location.hostname || 'localhost'}`;
    var pathname = String(((_window$location2 = window.location) === null || _window$location2 === void 0 ? void 0 : _window$location2.pathname) || '');
    var marker = '/SAMELCII_WEB_SYSTEM';
    var markerIndex = pathname.indexOf(marker);
    var appBase = markerIndex >= 0 ? pathname.slice(0, markerIndex + marker.length) : '/SAMELCII_WEB_SYSTEM';
    return `${origin}${appBase}`;
  })();
  var NODE_API_BASE = String(window.SAMELCII_NODE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/+$/, "");
  var API = {
    fuel: `${NODE_API_BASE}/fuel`,
    epass: `${NODE_API_BASE}/epass`,
    travel: `${NODE_API_BASE}/travel`,
    leave: `${NODE_API_BASE}/leave`,
    overtime: `${NODE_API_BASE}/overtime`,
    signatory: `${NODE_API_BASE}/signatory`
  };
  var FUEL_EPASS_LINK_PREFIX = "samelcii_fuel_epass_link_";
  function getAuthHeaders(extraHeaders = {}) {
    var headers = _objectSpread({}, extraHeaders);
    var token = localStorage.getItem("samelcii_token");
    if (token) {
      if (token.split(".").length === 3) {
        headers.Authorization = `Bearer ${token}`;
      } else {
        localStorage.removeItem("samelcii_token");
      }
    }
    var sessionRaw = localStorage.getItem(SESSION_KEY);
    if (sessionRaw) {
      headers["X-SAMELCII-SESSION"] = sessionRaw;
    }
    return headers;
  }
  function getOvertimeAuthHeaders(extraHeaders = {}) {
    return getAuthHeaders(extraHeaders);
  }
  function fetchJsonWithSessionRetry(_x) {
    return _fetchJsonWithSessionRetry.apply(this, arguments);
  } // [EDIT] Default Approval Desk tab; palitan lang ito kung ibang queue ang dapat unang bumukas.
  function _fetchJsonWithSessionRetry() {
    _fetchJsonWithSessionRetry = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee(url, options = {}, fallbackMessage = "Invalid server response.") {
      var _window$APIClient2;
      var response, payload;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return fetch(url, options);
          case 2:
            response = _context.sent;
            _context.next = 5;
            return response.json().catch(() => ({
              ok: false,
              message: fallbackMessage
            }));
          case 5:
            payload = _context.sent;
            if (response.status === 401 && typeof ((_window$APIClient2 = window.APIClient) === null || _window$APIClient2 === void 0 ? void 0 : _window$APIClient2.handleSessionExpired) === "function") {
              window.APIClient.handleSessionExpired((payload === null || payload === void 0 ? void 0 : payload.message) || "Session expired. Please login again.");
            }
            return _context.abrupt("return", {
              response,
              payload
            });
          case 8:
          case "end":
            return _context.stop();
        }
      }, _callee);
    }));
    return _fetchJsonWithSessionRetry.apply(this, arguments);
  }
  var DEFAULT_SECTION = "ot";
  function readPinnedAreaKeys() {
    try {
      var saved = JSON.parse(global.localStorage.getItem(AREA_PIN_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved.map(String).filter(Boolean) : []);
    } catch (_error) {
      return new Set();
    }
  }
  var SECTIONS = [{
    key: "fuel",
    label: "Fuel",
    icon: "fa-tint",
    detailClass: "dept-head-approval-detail__type--fuel"
  }, {
    key: "epass",
    label: "EPASS",
    icon: "fa-id-card-o",
    detailClass: "dept-head-approval-detail__type--epass"
  }, {
    key: "travel",
    label: "Travel",
    icon: "fa-car",
    detailClass: "dept-head-approval-detail__type--travel"
  }, {
    key: "leave",
    label: "Leave",
    icon: "fa-calendar-check-o",
    detailClass: "dept-head-approval-detail__type--leave"
  }, {
    key: "ot",
    label: "Overtime",
    icon: "fa-hourglass-half",
    detailClass: "dept-head-approval-detail__type--ot"
  }];
  function readLastSection() {
    try {
      var saved = String(global.localStorage.getItem(LAST_SECTION_KEY) || "").trim();
      return SECTIONS.some(section => section.key === saved) ? saved : DEFAULT_SECTION;
    } catch (_error) {
      return DEFAULT_SECTION;
    }
  }
  function saveLastSection(sectionKey) {
    try {
      global.localStorage.setItem(LAST_SECTION_KEY, sectionKey);
    } catch (_error) {
      // ponytail: the active tab still remains correct for this session without storage.
    }
  }
  function readNotificationSoundMuted() {
    try {
      return global.localStorage.getItem(NOTIFICATION_SOUND_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }
  function notificationHistoryStorageKey() {
    var session = readSession();
    var usercode = String((session === null || session === void 0 ? void 0 : session.usercode) || (session === null || session === void 0 ? void 0 : session.accountnumber) || "guest").trim().toUpperCase();
    return NOTIFICATION_HISTORY_PREFIX + usercode;
  }
  function readNotificationHistory() {
    try {
      var saved = JSON.parse(global.localStorage.getItem(notificationHistoryStorageKey()) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.slice(0, 10).map(entry => ({
        key: String((entry === null || entry === void 0 ? void 0 : entry.key) || ""),
        section: String((entry === null || entry === void 0 ? void 0 : entry.section) || ""),
        id: String((entry === null || entry === void 0 ? void 0 : entry.id) || ""),
        title: String((entry === null || entry === void 0 ? void 0 : entry.title) || "Approval request"),
        requester: String((entry === null || entry === void 0 ? void 0 : entry.requester) || "New request received"),
        requestDate: String((entry === null || entry === void 0 ? void 0 : entry.requestDate) || ""),
        receivedAt: Number(entry === null || entry === void 0 ? void 0 : entry.receivedAt) || Date.now(),
        read: Boolean(entry === null || entry === void 0 ? void 0 : entry.read)
      })).filter(entry => entry.key && SECTIONS.some(section => section.key === entry.section));
    } catch (_error) {
      return [];
    }
  }
  function saveNotificationHistory() {
    try {
      global.localStorage.setItem(notificationHistoryStorageKey(), JSON.stringify(state.notificationHistory.slice(0, 10)));
    } catch (_error) {
      // ponytail: in-memory history pa rin ang fallback kapag puno o disabled ang storage.
    }
  }
  var FAST_QUEUE_CACHE_PREFIX = "samelcii_fast_approval_queue_v2:";
  function fastQueueCacheKey(section, params) {
    var session = readSession();
    var usercode = String((session === null || session === void 0 ? void 0 : session.usercode) || (session === null || session === void 0 ? void 0 : session.accountnumber) || "").trim().toUpperCase();
    return `${FAST_QUEUE_CACHE_PREFIX}${section}:${usercode}:${state.departmentFilter || "all"}:${params.toString()}`;
  }
  function readFastQueueCache(key) {
    try {
      var cached = JSON.parse(global.localStorage.getItem(key) || "null");
      if (!cached || !Array.isArray(cached.items)) return [];
      return cached.items;
    } catch (_error) {
      return [];
    }
  }
  function writeFastQueueCache(key, items) {
    try {
      global.localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        items: Array.isArray(items) ? items.slice(0, 80) : []
      }));
    } catch (_error) {
      // ponytail: cache is only a speed boost; live API still owns truth.
    }
  }
  function primeFastQueueCache(section, params) {
    var key = fastQueueCacheKey(section, params);
    var items = readFastQueueCache(key);
    if (items.length && !state.queues[section].length) {
      state.queues[section] = items;
      ensureQueueOrder(section, items);
      renderHub();
      return {
        key,
        used: true
      };
    }
    return {
      key,
      used: false
    };
  }
  var state = {
    open: false,
    loading: false,
    activeSection: readLastSection(),
    selected: null,
    queues: {
      fuel: [],
      epass: [],
      travel: [],
      leave: [],
      ot: []
    },
    queueErrors: {
      fuel: "",
      epass: "",
      travel: "",
      leave: "",
      ot: ""
    },
    reviewed: {
      fuel: {},
      epass: {},
      travel: {},
      leave: {},
      ot: {}
    },
    queueOrder: {
      fuel: {},
      epass: {},
      travel: {},
      leave: {},
      ot: {}
    },
    dateMode: "day",
    selectedDate: "",
    searchTerm: "",
    departmentFilter: "",
    expandedAreas: new Set(),
    pinnedAreas: readPinnedAreaKeys(),
    drag: null,
    decisionsInFlight: new Set(),
    pollTimer: null,
    fabPulseTimer: null,
    notificationTimers: new Map(),
    audioContext: null,
    soundMuted: readNotificationSoundMuted(),
    notificationHistory: readNotificationHistory(),
    historyOpen: false,
    pendingSnapshots: {
      fuel: null,
      epass: null,
      travel: null,
      leave: null,
      ot: null
    },
    lastClosedPollAt: 0,
    lastPendingCount: null,
    apiOffline: false
  };
  var root = null;
  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_error) {
      return {};
    }
  }
  function canApprove(session) {
    var raw = String((session === null || session === void 0 ? void 0 : session.privilage) || "");
    return raw.split("-").some(part => {
      var value = Number(String(part).trim());
      return Number.isFinite(value) && value >= 6 && value <= 10;
    });
  }
  function isConfiguredOvertimeApprover(_x2) {
    return _isConfiguredOvertimeApprover.apply(this, arguments);
  }
  function _isConfiguredOvertimeApprover() {
    _isConfiguredOvertimeApprover = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee2(session) {
      var usercode, _yield$fetchJsonWithS, response, payload;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            usercode = String((session === null || session === void 0 ? void 0 : session.usercode) || "").trim().toUpperCase();
            if (usercode) {
              _context2.next = 3;
              break;
            }
            return _context2.abrupt("return", false);
          case 3:
            _context2.prev = 3;
            _context2.next = 6;
            return fetchJsonWithSessionRetry(`${API.signatory}?action=get&module=overtime_gm`, {
              credentials: "same-origin",
              cache: "no-store",
              headers: getAuthHeaders()
            }, "Unable to verify OT approval access.");
          case 6:
            _yield$fetchJsonWithS = _context2.sent;
            response = _yield$fetchJsonWithS.response;
            payload = _yield$fetchJsonWithS.payload;
            return _context2.abrupt("return", response.ok && payload.ok && Array.isArray(payload.signatories) && payload.signatories.some(row => String((row === null || row === void 0 ? void 0 : row.usercode) || "").trim().toUpperCase() === usercode));
          case 12:
            _context2.prev = 12;
            _context2.t0 = _context2["catch"](3);
            return _context2.abrupt("return", false);
          case 15:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [[3, 12]]);
    }));
    return _isConfiguredOvertimeApprover.apply(this, arguments);
  }
  function overtimeStageLabel(value) {
    var stage = String(value || "").trim().toLowerCase();
    if (stage === "supervisor") return "Supervisor approval";
    if (stage === "dept_head") return "Department Head approval";
    if (stage === "gm") return "General Manager approval";
    return "OT approval";
  }
  function normalizeText(value) {
    return String(value !== null && value !== void 0 ? value : "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }
  function formatMonthValue(date) {
    return [date.getFullYear(), padDatePart(date.getMonth() + 1)].join("-");
  }
  function formatDayValue(date) {
    return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join("-");
  }
  function currentMonthValue() {
    return formatMonthValue(new Date());
  }
  function currentDayValue() {
    return formatDayValue(new Date());
  }
  function normalizeSelectedDate(value) {
    var raw = String(value !== null && value !== void 0 ? value : "").trim();
    var monthMode = state.dateMode === "month";
    var fallback = monthMode ? currentMonthValue() : currentDayValue();
    if (!raw) {
      return fallback;
    }
    var parts = raw.split("-").map(part => Number.parseInt(part, 10));
    var expectedParts = monthMode ? 2 : 3;
    if (parts.length !== expectedParts || parts.some(part => Number.isNaN(part) || part <= 0)) {
      return fallback;
    }
    var day = monthMode ? 1 : parts[2];
    var date = new Date(parts[0], parts[1] - 1, day);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || !monthMode && date.getDate() !== day) {
      return fallback;
    }
    return monthMode ? formatMonthValue(date) : formatDayValue(date);
  }
  function selectedDateParts() {
    var raw = String(state.selectedDate || "").trim();
    if (!raw) {
      return null;
    }
    var normalized = normalizeSelectedDate(raw);
    var parts = normalized.split("-").map(part => Number.parseInt(part, 10));
    return {
      value: normalized,
      year: parts[0] || 0,
      month: parts[1] || 0,
      day: state.dateMode === "day" ? parts[2] || 0 : 0
    };
  }

  // [EDIT GUIDE] Leave/OT ay laging "whole month" kahit "Per day" ang pinili sa ibang seksyon —
  // ang mga request na ito ay bihirang ma-file sa mismong araw na tinitingnan, kaya palaging
  // walang lumalabas kapag day-filtered. Fuel/EPASS/Travel lang ang sumusunod sa Per day mode.
  function applySelectedDateParams(params, sectionKey) {
    var parts = selectedDateParts();
    if (!parts) {
      // [EDIT GUIDE] Kapag blank ang date, lahat ng pending ang lalabas.
      return;
    }
    if (!parts.year || !parts.month) {
      return;
    }
    params.set("year", String(parts.year));
    params.set("month", String(parts.month));
    var alwaysWholeMonth = sectionKey === "leave" || sectionKey === "ot";
    if (!alwaysWholeMonth && state.dateMode === "day" && parts.day) {
      params.set("day", String(parts.day));
    }
  }
  function resetDateScopedState() {
    state.selected = null;
    state.reviewed = {
      fuel: {},
      epass: {},
      travel: {},
      leave: {},
      ot: {}
    };
    state.queueOrder = {
      fuel: {},
      epass: {},
      travel: {},
      leave: {},
      ot: {}
    };
    // Kapag nagpalit ng period, gawing bagong baseline ang result para hindi mapagkamalang bagong request ang history.
    state.pendingSnapshots = {
      fuel: null,
      epass: null,
      travel: null,
      leave: null,
      ot: null
    };
  }
  function shiftSelectedPeriod(amount) {
    var _root;
    var parts = selectedDateParts();
    var base = parts ? new Date(parts.year, parts.month - 1, parts.day || 1) : new Date();
    if (state.dateMode === "month") {
      base.setMonth(base.getMonth() + amount);
      state.selectedDate = formatMonthValue(base);
    } else {
      base.setDate(base.getDate() + amount);
      state.selectedDate = formatDayValue(base);
    }
    resetDateScopedState();
    var input = (_root = root) === null || _root === void 0 ? void 0 : _root.querySelector("#dept-head-approval-date");
    if (input) {
      input.value = state.selectedDate;
    }
    void refreshQueues();
  }
  var hubCalendarView = null;
  function renderHubCalendarTrigger() {
    var _root2;
    var label = (_root2 = root) === null || _root2 === void 0 ? void 0 : _root2.querySelector("#dept-head-approval-date-trigger-label");
    if (!label) {
      return;
    }
    var parts = selectedDateParts();
    if (!parts || !parts.year) {
      label.textContent = "Pick a date";
      return;
    }
    if (state.dateMode === "month") {
      var monthNamesFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      label.textContent = `${monthNamesFull[parts.month - 1] || ""} ${parts.year}`;
      return;
    }
    if (!parts.day) {
      label.textContent = "Pick a date";
      return;
    }
    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    label.textContent = `${monthNames[parts.month - 1] || ""} ${parts.day}, ${parts.year}`;
  }
  function shiftHubCalendarMonth(delta) {
    if (!hubCalendarView) {
      var now = new Date();
      hubCalendarView = {
        year: now.getFullYear(),
        month: now.getMonth()
      };
    }
    if (state.dateMode === "month") {
      hubCalendarView = {
        year: hubCalendarView.year + delta,
        month: hubCalendarView.month
      };
      renderHubCalendar();
      return;
    }
    var _hubCalendarView = hubCalendarView,
      year = _hubCalendarView.year,
      month = _hubCalendarView.month;
    month += delta;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    hubCalendarView = {
      year,
      month
    };
    renderHubCalendar();
  }
  function renderHubCalendar() {
    var _root3;
    var target = (_root3 = root) === null || _root3 === void 0 ? void 0 : _root3.querySelector("#dept-head-approval-calendar");
    if (!target) {
      return;
    }
    var parts = selectedDateParts();
    if (!hubCalendarView) {
      if (parts && parts.year && parts.month) {
        hubCalendarView = {
          year: parts.year,
          month: parts.month - 1
        };
      } else {
        var now = new Date();
        hubCalendarView = {
          year: now.getFullYear(),
          month: now.getMonth()
        };
      }
    }
    if (state.dateMode === "month") {
      renderHubMonthGrid(target, parts);
      return;
    }
    var _hubCalendarView2 = hubCalendarView,
      year = _hubCalendarView2.year,
      month = _hubCalendarView2.month;
    var selectedIso = parts && parts.year && parts.day ? parts.value : "";
    var todayIso = formatDayValue(new Date());
    var firstWeekday = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var cellsHtml = "";
    for (var i = 0; i < firstWeekday; i += 1) {
      cellsHtml += '<button type="button" class="travel-calendar-day is-blank" disabled tabindex="-1"></button>';
    }
    for (var day = 1; day <= daysInMonth; day += 1) {
      var iso = `${year}-${padDatePart(month + 1)}-${padDatePart(day)}`;
      var classes = ["travel-calendar-day"];
      if (iso === selectedIso) {
        classes.push("is-selected");
      } else if (iso === todayIso) {
        classes.push("is-today");
      }
      cellsHtml += `<button type="button" class="${classes.join(" ")}" data-hub-calendar-day="${iso}">${day}</button>`;
    }
    target.innerHTML = `
            <div class="travel-calendar-head">
                <button type="button" class="travel-calendar-nav" data-hub-calendar-prev aria-label="Previous month">&#10094;</button>
                <strong>${monthNames[month]} ${year}</strong>
                <button type="button" class="travel-calendar-nav" data-hub-calendar-next aria-label="Next month">&#10095;</button>
            </div>
            <div class="travel-calendar-weekdays">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            <div class="travel-calendar-grid">${cellsHtml}</div>
        `;
  }
  function renderHubMonthGrid(target, parts) {
    var year = hubCalendarView.year;
    var selectedYm = parts && parts.year ? `${parts.year}-${padDatePart(parts.month)}` : "";
    var todayYm = formatMonthValue(new Date());
    var monthAbbrev = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var cellsHtml = "";
    for (var m = 0; m < 12; m += 1) {
      var ym = `${year}-${padDatePart(m + 1)}`;
      var classes = ["travel-calendar-month"];
      if (ym === selectedYm) {
        classes.push("is-selected");
      } else if (ym === todayYm) {
        classes.push("is-today");
      }
      cellsHtml += `<button type="button" class="${classes.join(" ")}" data-hub-calendar-month="${ym}">${monthAbbrev[m]}</button>`;
    }
    target.innerHTML = `
            <div class="travel-calendar-head">
                <button type="button" class="travel-calendar-nav" data-hub-calendar-prev aria-label="Previous year">&#10094;</button>
                <strong>${year}</strong>
                <button type="button" class="travel-calendar-nav" data-hub-calendar-next aria-label="Next year">&#10095;</button>
            </div>
            <div class="travel-calendar-month-grid">${cellsHtml}</div>
        `;
  }
  function getDepartmentFilter(session) {
    // [HUWAG BAGUHIN] Department lang ang base ng approver scope; huwag i-assume sa position title.
    return String((session === null || session === void 0 ? void 0 : session.department) || (session === null || session === void 0 ? void 0 : session.dept) || (session === null || session === void 0 ? void 0 : session.division) || (session === null || session === void 0 ? void 0 : session.area) || "").trim();
  }
  function departmentMatches(itemDepartment, filter) {
    var left = normalizeText(itemDepartment);
    var right = normalizeText(filter);
    if (!right) {
      return true;
    }
    if (!left) {
      return false;
    }
    return left.includes(right) || right.includes(left);
  }
  function escapeHtml(value) {
    return String(value !== null && value !== void 0 ? value : "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function sectionMeta(key) {
    return SECTIONS.find(section => section.key === key) || SECTIONS[0];
  }
  function isReviewed(sectionKey, id) {
    var _state$reviewed$secti;
    return Boolean((_state$reviewed$secti = state.reviewed[sectionKey]) === null || _state$reviewed$secti === void 0 ? void 0 : _state$reviewed$secti[id]);
  }
  function totalPending() {
    return SECTIONS.reduce((sum, section) => sum + sectionPendingCount(section.key), 0);
  }

  // Ang queue ay naglalaman na ng lahat ng estado; PENDING lang ang binibilang sa tab badge
  // para manatiling ibig sabihin nito ay "kailangan pa ng aksyon".
  function sectionPendingCount(key) {
    return queueItems(key).filter(item => requestReviewState(key, item).tone === "pending").length;
  }
  function selectionKey(sectionKey, id) {
    return sectionKey + ":" + id;
  }
  function updateFabBadge() {
    var _root4, _root5;
    var badge = (_root4 = root) === null || _root4 === void 0 ? void 0 : _root4.querySelector(".dept-head-approval-fab__badge");
    var fab = (_root5 = root) === null || _root5 === void 0 ? void 0 : _root5.querySelector(".dept-head-approval-fab");
    if (!badge) {
      return;
    }
    var count = totalPending();
    var previous = state.lastPendingCount;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.dataset.count = String(count);
    badge.classList.toggle("has-pending", count > 0);
    fab === null || fab === void 0 || fab.classList.toggle("has-pending", count > 0);
    if (fab) {
      if (state.fabPulseTimer) {
        global.clearTimeout(state.fabPulseTimer);
        state.fabPulseTimer = null;
      }
      if (count === 0) {
        fab.classList.remove("is-alerting");
        badge.classList.remove("is-alerting");
      } else if (Number.isFinite(previous) && count > previous) {
        fab.classList.add("is-alerting");
        badge.classList.add("is-alerting");
        state.fabPulseTimer = global.setTimeout(() => {
          fab.classList.remove("is-alerting");
          badge.classList.remove("is-alerting");
          state.fabPulseTimer = null;
        }, 3000);
      }
    }
    state.lastPendingCount = count;
  }
  function requestId(sectionKey, item) {
    if (sectionKey === "fuel") {
      return String(item.FARCode || "").trim();
    }
    if (sectionKey === "epass") {
      return String(item.epassnumber || "").trim();
    }
    if (sectionKey === "ot") {
      return String(item.ot_number || "").trim();
    }
    if (sectionKey === "leave") {
      return String(item.leave_id || "").trim();
    }
    return String(item.to_number || "").trim();
  }
  function requestTitle(sectionKey, item) {
    if (sectionKey === "leave") {
      return String(item.tracking_no || item.leave_id || "").trim();
    }
    return requestId(sectionKey, item);
  }

  // BUONG pangalan sa card (dating pinaikli ng shortenDisplayName kaya "Melben I." lang);
  // ang CSS na ang bahala sa ellipsis kapag sobrang haba.
  function requestCardLabel(sectionKey, item) {
    if (sectionKey === "epass") {
      var people = requestEpassPeople(item);
      if (people.length) {
        return people[0];
      }
      return requestEpassGroupSummary(item);
    }
    var base = requestRequester(sectionKey, item);
    if (base) {
      return String(base.split("|")[0] || "").trim();
    }
    return String(item.requester_name || item.EmployeeName || item.usercode || item.UserCode || requestId(sectionKey, item) || "").trim();
  }
  function shortenDisplayName(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    var words = raw.split(/\s+/).filter(Boolean);
    if (words.length <= 2) {
      return raw;
    }
    return `${words[0]} ${words[1]}`;
  }
  function formatRequestDate(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    var date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return raw;
    }
    // [HUWAG BAGUHIN] MySQL dates arrive as UTC; approval dates must display in Philippine time.
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: "Asia/Manila"
    }).format(date);
  }
  console.assert(formatRequestDate("2026-07-30T16:00:00.000Z") === "Jul 31, 2026", "Approval Desk Philippine date conversion failed.");
  function requestDate(sectionKey, item) {
    if (sectionKey === "fuel") {
      return formatRequestDate(item.PresRequestDate || item.request_date || item.date);
    }
    if (sectionKey === "ot") {
      return formatRequestDate(item.date);
    }
    if (sectionKey === "leave") {
      return formatRequestDate(item.date || item.request_date);
    }
    return formatRequestDate(item.date || item.request_date);
  }
  function findAddedKeys(previousKeys, currentKeys) {
    return currentKeys.filter(key => !previousKeys.has(key));
  }
  console.assert(findAddedKeys(new Set(["fuel:FAR-1"]), ["fuel:FAR-1", "fuel:FAR-2"]).join() === "fuel:FAR-2", "Approval Desk new-request detection failed.");
  function mergeNotificationHistory(current, additions) {
    var newKeys = new Set(additions.map(entry => entry.key));
    return [...additions, ...current.filter(entry => !newKeys.has(entry.key))].slice(0, 10);
  }
  console.assert(mergeNotificationHistory([{
    key: "fuel:1"
  }], [{
    key: "fuel:1"
  }, {
    key: "ot:2"
  }]).length === 2, "Approval Desk notification history merge failed.");
  function unreadNotificationCount() {
    return state.notificationHistory.filter(entry => !entry.read).length;
  }
  function syncNotificationHistoryCounters() {
    var _root6;
    var count = unreadNotificationCount();
    (_root6 = root) === null || _root6 === void 0 || _root6.querySelectorAll("[data-notification-history-count]").forEach(badge => {
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.dataset.count = String(count);
      badge.hidden = count === 0;
    });
  }
  function renderNotificationHistory() {
    var _root7;
    var panel = (_root7 = root) === null || _root7 === void 0 ? void 0 : _root7.querySelector(".dept-head-approval-history");
    var list = panel === null || panel === void 0 ? void 0 : panel.querySelector(".dept-head-approval-history__list");
    if (!panel || !list) {
      syncNotificationHistoryCounters();
      return;
    }
    panel.hidden = !state.historyOpen;
    panel.setAttribute("aria-hidden", state.historyOpen ? "false" : "true");
    list.innerHTML = state.notificationHistory.length ? state.notificationHistory.map(entry => {
      var meta = sectionMeta(entry.section);
      var received = new Date(entry.receivedAt);
      var receivedLabel = Number.isNaN(received.getTime()) ? "Just now" : received.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
      return '<button type="button" class="dept-head-approval-history__item' + (entry.read ? '' : ' is-unread') + '" data-history-request data-section="' + escapeHtml(entry.section) + '" data-id="' + escapeHtml(entry.id) + '">' + '<span class="dept-head-approval-history__item-icon"><i class="fa ' + escapeHtml(meta.icon) + '" aria-hidden="true"></i></span>' + '<span class="dept-head-approval-history__item-copy"><b>' + escapeHtml(entry.title) + '</b><span>' + escapeHtml(entry.requester) + '</span><small>' + escapeHtml(entry.requestDate || receivedLabel) + ' · ' + escapeHtml(receivedLabel) + '</small></span>' + (entry.read ? '' : '<i class="dept-head-approval-history__unread-dot" aria-label="Unread"></i>') + '</button>';
    }).join("") : '<div class="dept-head-approval-history__empty"><i class="fa fa-bell-o" aria-hidden="true"></i><strong>No new notifications</strong><span>New approval requests will appear here.</span></div>';
    syncNotificationHistoryCounters();
  }
  function recordNotificationHistory(entries) {
    var receivedAt = Date.now();
    var additions = entries.slice().reverse().map(entry => ({
      key: selectionKey(entry.section, entry.id),
      section: entry.section,
      id: entry.id,
      title: `${sectionMeta(entry.section).label} · ${requestTitle(entry.section, entry.item) || entry.id}`,
      requester: requestCardLabel(entry.section, entry.item) || "New request received",
      requestDate: requestDate(entry.section, entry.item),
      receivedAt,
      read: false
    }));
    state.notificationHistory = mergeNotificationHistory(state.notificationHistory, additions);
    saveNotificationHistory();
    renderNotificationHistory();
  }
  function markNotificationHistoryRead(section, id) {
    var key = selectionKey(section, id);
    var changed = false;
    state.notificationHistory = state.notificationHistory.map(entry => {
      if (entry.key !== key || entry.read) return entry;
      changed = true;
      return _objectSpread(_objectSpread({}, entry), {}, {
        read: true
      });
    });
    if (changed) saveNotificationHistory();
    renderNotificationHistory();
  }
  function markAllNotificationHistoryRead() {
    if (!unreadNotificationCount()) return;
    state.notificationHistory = state.notificationHistory.map(entry => _objectSpread(_objectSpread({}, entry), {}, {
      read: true
    }));
    saveNotificationHistory();
    renderNotificationHistory();
  }
  function notificationStackOpacity(index, total) {
    return [0.48, 0.72, 1][Math.max(0, 3 - total + index)] || 1;
  }
  console.assert(notificationStackOpacity(0, 3) === 0.48 && notificationStackOpacity(1, 2) === 0.72, "Approval Desk notification stack opacity failed.");
  function updateNotificationStack() {
    var _root8;
    var tray = (_root8 = root) === null || _root8 === void 0 ? void 0 : _root8.querySelector(".dept-head-approval-notification-tray");
    if (!tray) return;
    var cards = Array.from(tray.querySelectorAll(".dept-head-approval-notification"));
    while (cards.length > 3) {
      var oldest = cards.shift();
      var timer = state.notificationTimers.get(oldest);
      if (timer) global.clearTimeout(timer);
      state.notificationTimers.delete(oldest);
      oldest === null || oldest === void 0 || oldest.remove();
    }
    cards.forEach((card, index) => {
      card.style.setProperty("--notification-opacity", String(notificationStackOpacity(index, cards.length)));
      card.style.setProperty("--notification-scale", String(0.96 + (index + 1) * (0.04 / cards.length)));
    });
  }
  function hideNewRequestNotification(notice) {
    if (!notice) return;
    var timer = state.notificationTimers.get(notice);
    if (timer) global.clearTimeout(timer);
    state.notificationTimers.delete(notice);
    notice.classList.remove("is-visible");
    global.setTimeout(() => {
      if (!notice.classList.contains("is-visible")) {
        notice.remove();
        updateNotificationStack();
      }
    }, 260);
  }
  function pauseNotificationHide(notice) {
    var timer = state.notificationTimers.get(notice);
    if (timer) global.clearTimeout(timer);
    state.notificationTimers.delete(notice);
  }
  function scheduleNotificationHide(notice) {
    if (!notice) return;
    pauseNotificationHide(notice);
    state.notificationTimers.set(notice, global.setTimeout(() => hideNewRequestNotification(notice), 9000));
  }
  function syncNotificationSoundButton() {
    var _root9;
    var label = state.soundMuted ? "Turn notification sound on" : "Mute notification sound";
    (_root9 = root) === null || _root9 === void 0 || _root9.querySelectorAll("[data-notification-sound]").forEach(button => {
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", state.soundMuted ? "true" : "false");
      var icon = button.querySelector("i");
      if (icon) icon.className = state.soundMuted ? "fa fa-volume-off" : "fa fa-volume-up";
    });
  }
  function unlockNotificationAudio() {
    if (state.soundMuted) return;
    var AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!state.audioContext || state.audioContext.state === "closed") state.audioContext = new AudioContext();
    } catch (_error) {
      return;
    }
    if (state.audioContext.state === "suspended") {
      void state.audioContext.resume().catch(() => {});
    }
  }
  function playNotificationChime() {
    if (state.soundMuted || !state.audioContext) return;
    var context = state.audioContext;
    var play = () => {
      var start = context.currentTime;
      [659.25, 880].forEach((frequency, index) => {
        var oscillator = context.createOscillator();
        var gain = context.createGain();
        var noteStart = start + index * 0.13;
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.26, noteStart + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.24);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.26);
      });
    };
    if (context.state === "suspended") {
      void context.resume().then(play).catch(() => {});
    } else {
      play();
    }
  }
  function setNotificationSoundMuted(muted, playConfirmation = true) {
    state.soundMuted = Boolean(muted);
    try {
      global.localStorage.setItem(NOTIFICATION_SOUND_KEY, state.soundMuted ? "1" : "0");
    } catch (_error) {
      // ponytail: gagana pa rin ang mute sa kasalukuyang page kahit hindi available ang storage.
    }
    syncNotificationSoundButton();
    if (!state.soundMuted) {
      unlockNotificationAudio();
      if (playConfirmation) playNotificationChime();
    }
  }
  function showNewRequestNotification(entries) {
    var _root10;
    var tray = (_root10 = root) === null || _root10 === void 0 ? void 0 : _root10.querySelector(".dept-head-approval-notification-tray");
    if (!tray || !entries.length) return;
    entries.forEach(entry => {
      var meta = sectionMeta(entry.section);
      var photo = entry.isTest ? "" : requestAvatarPhotoUrl(entry.section, entry.item);
      var initials = entry.isTest ? '<i class="fa fa-bell" aria-hidden="true"></i>' : escapeHtml(requestAvatarLabel(entry.section, entry.item));
      var notice = document.createElement("article");
      notice.className = "dept-head-approval-notification";
      notice.dataset.section = entry.section;
      notice.dataset.id = entry.id;
      notice.setAttribute("aria-label", entry.isTest ? "Test notification" : "New approval request");
      notice.innerHTML = '<span class="dept-head-approval-notification__avatar' + (photo ? ' has-photo' : '') + '">' + (photo ? '<img src="' + escapeHtml(photo) + '" alt="" />' : '') + '<b>' + initials + '</b></span>' + '<div class="dept-head-approval-notification__body">' + '<span>' + escapeHtml(entry.isTest ? "Test notification" : "New " + meta.label + " request") + '</span>' + '<strong>' + escapeHtml(entry.isTest ? "Approval Desk sound test" : requestTitle(entry.section, entry.item) || entry.id) + '</strong>' + '<p>' + escapeHtml(entry.isTest ? "If you see this card, the slide alert is working." : requestCardLabel(entry.section, entry.item) || "New request received") + '</p>' + '<small>' + escapeHtml(entry.isTest ? "Listen for the two-note chime" : `${requestDate(entry.section, entry.item) || "Today"} · Pending`) + '</small>' + '<div class="dept-head-approval-notification__actions">' + '<button type="button" data-notification-open><i class="fa fa-external-link" aria-hidden="true"></i> Open Approval Desk</button>' + '<button type="button" class="dept-head-approval-notification__sound" data-notification-sound><i class="fa fa-volume-up" aria-hidden="true"></i></button>' + '</div></div>' + '<button type="button" class="dept-head-approval-notification__close" data-notification-close aria-label="Dismiss notification"><i class="fa fa-times" aria-hidden="true"></i></button>';
      tray.appendChild(notice);
      updateNotificationStack();
      global.requestAnimationFrame(() => notice.classList.add("is-visible"));
      scheduleNotificationHide(notice);
    });
    syncNotificationSoundButton();
    playNotificationChime();
  }
  function testNewRequestNotification() {
    if (state.soundMuted) setNotificationSoundMuted(false, false);
    unlockNotificationAudio();
    showNewRequestNotification([{
      section: state.activeSection || DEFAULT_SECTION,
      id: "",
      item: {},
      isTest: true
    }]);
  }
  function syncNewRequestNotifications(successfulSectionKeys) {
    var additions = [];
    successfulSectionKeys.forEach(sectionKey => {
      var entries = queueItems(sectionKey).filter(item => requestReviewState(sectionKey, item).tone === "pending").map(item => ({
        section: sectionKey,
        id: requestId(sectionKey, item),
        item
      })).filter(entry => entry.id);
      var currentKeys = entries.map(entry => selectionKey(entry.section, entry.id));
      var previousKeys = state.pendingSnapshots[sectionKey];
      if (previousKeys instanceof Set) {
        var addedKeys = new Set(findAddedKeys(previousKeys, currentKeys));
        additions.push(...entries.filter(entry => addedKeys.has(selectionKey(entry.section, entry.id))));
      }
      state.pendingSnapshots[sectionKey] = new Set(currentKeys);
    });
    if (additions.length) {
      recordNotificationHistory(additions);
      showNewRequestNotification(additions);
    }
  }
  function loadFuelEpassLink(farCode) {
    try {
      var key = FUEL_EPASS_LINK_PREFIX + String(farCode || "").trim().toUpperCase();
      if (key === FUEL_EPASS_LINK_PREFIX) {
        return "";
      }
      return String(global.sessionStorage.getItem(key) || global.localStorage.getItem(key) || "").trim();
    } catch (_error) {
      return "";
    }
  }
  function getFuelEpassNumber(item) {
    var _ref, _ref2, _ref3, _ref4, _ref5, _ref6, _ref7, _item$FuelEpassNumber;
    return String((_ref = (_ref2 = (_ref3 = (_ref4 = (_ref5 = (_ref6 = (_ref7 = (_item$FuelEpassNumber = item === null || item === void 0 ? void 0 : item.FuelEpassNumber) !== null && _item$FuelEpassNumber !== void 0 ? _item$FuelEpassNumber : item === null || item === void 0 ? void 0 : item.fuelEpassNumber) !== null && _ref7 !== void 0 ? _ref7 : item === null || item === void 0 ? void 0 : item.fuel_epass_number) !== null && _ref6 !== void 0 ? _ref6 : item === null || item === void 0 ? void 0 : item.epassnumber) !== null && _ref5 !== void 0 ? _ref5 : item === null || item === void 0 ? void 0 : item.epass_number) !== null && _ref4 !== void 0 ? _ref4 : item === null || item === void 0 ? void 0 : item.epassID) !== null && _ref3 !== void 0 ? _ref3 : item === null || item === void 0 ? void 0 : item.epass_id) !== null && _ref2 !== void 0 ? _ref2 : loadFuelEpassLink((item === null || item === void 0 ? void 0 : item.FARCode) || (item === null || item === void 0 ? void 0 : item.farCode) || (item === null || item === void 0 ? void 0 : item.far_code))) !== null && _ref !== void 0 ? _ref : "").trim();
  }

  // [UI] Sa EPASS, maraming employee ang puwedeng nasa iisang request number; dito natin binubuo ang name summary.
  function requestDelimitedList(value) {
    if (Array.isArray(value)) {
      return value.map(entry => {
        if (entry && typeof entry === "object") {
          return String(entry.value || entry.name || entry.usercode || entry.label || "").trim();
        }
        return String(entry || "").trim();
      }).filter(entry => entry && entry !== "[object Object]");
    }
    var raw = String(value || "").trim();
    if (!raw || raw === "[object Object]") {
      return [];
    }
    return raw.split(/\s*\|\|\s*/g).map(entry => String(entry || "").trim()).filter(entry => entry && entry !== "[object Object]");
  }
  function requestPhotoList(value) {
    if (Array.isArray(value)) {
      return value.map(entry => {
        if (entry && typeof entry === "object") {
          return String(entry.profile_photo_url || entry.photo_url || entry.profilePhotoUrl || entry.url || entry.src || "").trim();
        }
        return String(entry || "").trim();
      }).filter(entry => entry && entry !== "[object Object]");
    }
    if (value && typeof value === "object") {
      return requestPhotoList([value]);
    }
    var raw = String(value || "").trim();
    if (!raw || raw === "[object Object]") return [];
    if (/^[\[{]/.test(raw)) {
      try {
        return requestPhotoList(JSON.parse(raw));
      } catch (_error) {
        // Continue with legacy ||-delimited values.
      }
    }
    return raw.split(/\s*\|\|\s*/g).map(entry => entry.trim()).filter(entry => entry && entry !== "[object Object]");
  }
  var requestPhotoListSelfCheck = requestPhotoList([{
    profile_photo_url: "/api/auth/profile-photo?user_id=245"
  }, {
    photo_url: "/uploads/profile-photos/example.jpg"
  }]);
  console.assert(requestPhotoListSelfCheck.length === 2 && !requestPhotoListSelfCheck.includes("[object Object]"), "Approval Desk photo normalization failed.");
  function requestEpassPeople(item) {
    // [HUWAG BAGUHIN] EPASS group detail dapat galing sa buong epassnumber group, hindi sa unang row lang.
    var seen = new Set();
    var values = [...requestDelimitedList(item.granted_to), ...requestDelimitedList(item.requester_names), ...requestDelimitedList(item.requester_name), ...requestDelimitedList(item.EmployeeName)];
    return values.filter(value => {
      var key = normalizeText(value);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  function requestEpassPeopleWithPositions(_x3) {
    return _requestEpassPeopleWithPositions.apply(this, arguments);
  } // Shared by requestPrintApproverProfile (single-stage sections) and requestTravelSignatoryProfile
  // (travel's two-stage Recommended By / Approved By print block).
  function _requestEpassPeopleWithPositions() {
    _requestEpassPeopleWithPositions = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee4(item) {
      var names, usercodes, fallbackPosition, profiles;
      return _regeneratorRuntime().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            names = requestEpassPeople(item).slice(0, 20);
            usercodes = requestDelimitedList(item.requester_usercodes).slice(0, 20);
            fallbackPosition = String(item.EmployeePosition || item.position || "").trim();
            _context4.next = 5;
            return Promise.all(usercodes.map(/*#__PURE__*/function () {
              var _ref13 = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee3(usercode) {
                var url, _yield$fetchJsonWithS2, response, payload;
                return _regeneratorRuntime().wrap(function _callee3$(_context3) {
                  while (1) switch (_context3.prev = _context3.next) {
                    case 0:
                      _context3.prev = 0;
                      url = `${NODE_API_BASE}/auth?action=search_employee&q=${encodeURIComponent(usercode)}&limit=10`;
                      _context3.next = 4;
                      return fetchJsonWithSessionRetry(url, {
                        headers: getAuthHeaders()
                      }, "Unable to load employee position.");
                    case 4:
                      _yield$fetchJsonWithS2 = _context3.sent;
                      response = _yield$fetchJsonWithS2.response;
                      payload = _yield$fetchJsonWithS2.payload;
                      if (!(!response.ok || !(payload !== null && payload !== void 0 && payload.ok) || !Array.isArray(payload.items))) {
                        _context3.next = 9;
                        break;
                      }
                      return _context3.abrupt("return", null);
                    case 9:
                      return _context3.abrupt("return", payload.items.find(profile => normalizeText(profile.usercode) === normalizeText(usercode)) || null);
                    case 12:
                      _context3.prev = 12;
                      _context3.t0 = _context3["catch"](0);
                      return _context3.abrupt("return", null);
                    case 15:
                    case "end":
                      return _context3.stop();
                  }
                }, _callee3, null, [[0, 12]]);
              }));
              return function (_x30) {
                return _ref13.apply(this, arguments);
              };
            }()));
          case 5:
            profiles = _context4.sent;
            return _context4.abrupt("return", names.map((name, index) => {
              var _profiles$index, _profiles$index2, _profiles$index3;
              return {
                name,
                usercode: String(((_profiles$index = profiles[index]) === null || _profiles$index === void 0 ? void 0 : _profiles$index.usercode) || usercodes[index] || "").trim(),
                position: String(((_profiles$index2 = profiles[index]) === null || _profiles$index2 === void 0 ? void 0 : _profiles$index2.position) || (names.length === 1 ? fallbackPosition : "")).trim(),
                photo_url: String(((_profiles$index3 = profiles[index]) === null || _profiles$index3 === void 0 ? void 0 : _profiles$index3.profile_photo_url) || "").trim()
              };
            }));
          case 7:
          case "end":
            return _context4.stop();
        }
      }, _callee4);
    }));
    return _requestEpassPeopleWithPositions.apply(this, arguments);
  }
  function resolveSignatoryPrintProfile(_x4) {
    return _resolveSignatoryPrintProfile.apply(this, arguments);
  }
  function _resolveSignatoryPrintProfile() {
    _resolveSignatoryPrintProfile = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee5({
      usercode,
      name,
      position,
      department,
      moduleKey,
      fallbackLabel
    }) {
      var cleanUsercode, savedName, fallback, query, profileResult, url, _yield$fetchJsonWithS3, response, payload, profile, params, _yield$fetchJsonWithS4, _response, _payload;
      return _regeneratorRuntime().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            cleanUsercode = String(usercode || "").trim();
            savedName = String(name || "").trim();
            fallback = {
              name: savedName || cleanUsercode || fallbackLabel,
              position: String(position || fallbackLabel).trim(),
              signatureImage: ""
            };
            query = cleanUsercode || savedName;
            profileResult = fallback;
            _context5.prev = 5;
            if (!query) {
              _context5.next = 14;
              break;
            }
            url = `${NODE_API_BASE}/auth?action=search_employee&q=${encodeURIComponent(query)}&limit=10`;
            _context5.next = 10;
            return fetchJsonWithSessionRetry(url, {
              headers: getAuthHeaders()
            }, "Unable to load approver position.");
          case 10:
            _yield$fetchJsonWithS3 = _context5.sent;
            response = _yield$fetchJsonWithS3.response;
            payload = _yield$fetchJsonWithS3.payload;
            if (response.ok && payload !== null && payload !== void 0 && payload.ok && Array.isArray(payload.items)) {
              profile = payload.items.find(entry => cleanUsercode && normalizeText(entry.usercode) === normalizeText(cleanUsercode) || savedName && normalizeText(entry.name) === normalizeText(savedName));
              if (profile) {
                profileResult = _objectSpread(_objectSpread({}, fallback), {}, {
                  name: String(profile.name || fallback.name).trim(),
                  position: String(profile.position || fallback.position).trim()
                });
              }
            }
          case 14:
            _context5.next = 19;
            break;
          case 16:
            _context5.prev = 16;
            _context5.t0 = _context5["catch"](5);
            profileResult = fallback;
          case 19:
            _context5.prev = 19;
            params = new URLSearchParams({
              action: "get",
              module: moduleKey,
              department: String(department || "").trim()
            });
            if (cleanUsercode) params.set("usercode", cleanUsercode);
            _context5.next = 24;
            return fetchJsonWithSessionRetry(`${API.signatory}?${params.toString()}`, {
              headers: getAuthHeaders()
            }, "Unable to load approver signature.");
          case 24:
            _yield$fetchJsonWithS4 = _context5.sent;
            _response = _yield$fetchJsonWithS4.response;
            _payload = _yield$fetchJsonWithS4.payload;
            if (!(_response.ok && _payload !== null && _payload !== void 0 && _payload.ok && _payload.signatory)) {
              _context5.next = 29;
              break;
            }
            return _context5.abrupt("return", _objectSpread(_objectSpread({}, profileResult), {}, {
              signatureImage: String(_payload.signatory.signatureImage || "").trim()
            }));
          case 29:
            _context5.next = 33;
            break;
          case 31:
            _context5.prev = 31;
            _context5.t1 = _context5["catch"](19);
          case 33:
            return _context5.abrupt("return", profileResult);
          case 34:
          case "end":
            return _context5.stop();
        }
      }, _callee5, null, [[5, 16], [19, 31]]);
    }));
    return _resolveSignatoryPrintProfile.apply(this, arguments);
  }
  function requestPrintApproverProfile(_x5, _x6) {
    return _requestPrintApproverProfile.apply(this, arguments);
  } // [FIX] Travel has two signatories (Department Head recommends, General Manager approves);
  // the old single-profile print only ever showed a "Department Head" placeholder for travel
  // because the item never carried a usable approver usercode/name for that lookup.
  function _requestPrintApproverProfile() {
    _requestPrintApproverProfile = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee6(sectionKey, item) {
      return _regeneratorRuntime().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            return _context6.abrupt("return", resolveSignatoryPrintProfile({
              usercode: item.assigned_approver_usercode || item.approver_usercode || item.department_head_usercode || item.approved_by,
              name: item.assigned_approver_name || item.approver_name || item.approved_by_name,
              position: item.approver_position,
              department: item.department || item.employee_department,
              moduleKey: sectionKey === "ot" ? "overtime" : sectionKey,
              fallbackLabel: "Department Head"
            }));
          case 1:
          case "end":
            return _context6.stop();
        }
      }, _callee6);
    }));
    return _requestPrintApproverProfile.apply(this, arguments);
  }
  function requestTravelSignatoryProfile(_x7, _x8) {
    return _requestTravelSignatoryProfile.apply(this, arguments);
  } // [UI] Ang fuel row ay may numero lang ng EPASS/Travel; ang mga sakay ay nasa group mismo ng bawat isa.
  // GABAY: pareho ang hugis ng dalawang endpoint (`by_number` → item.people) kaya iisang daan lang ito;
  // ang pagkakaiba ay ang pangalan ng parameter at ang label na ipinapakita.
  function _requestTravelSignatoryProfile() {
    _requestTravelSignatoryProfile = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee7(item, stage) {
      var isDeptHead;
      return _regeneratorRuntime().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            isDeptHead = stage === "department_head";
            return _context7.abrupt("return", resolveSignatoryPrintProfile({
              usercode: isDeptHead ? item.department_head_usercode : item.general_manager_usercode,
              name: isDeptHead ? item.department_head_name : item.general_manager_name,
              position: isDeptHead ? item.department_head_position : item.general_manager_position,
              department: isDeptHead ? item.department : "",
              moduleKey: "travel",
              fallbackLabel: isDeptHead ? "Department Head" : "General Manager"
            }));
          case 2:
          case "end":
            return _context7.stop();
        }
      }, _callee7);
    }));
    return _requestTravelSignatoryProfile.apply(this, arguments);
  }
  var FUEL_LINK_KINDS = {
    epass: {
      label: "EPASS",
      api: () => API.epass,
      param: "epassnumber",
      noun: "EPASS employees",
      // Ang epassnumber ay nasa fuel row na mismo.
      lookup: (farCode, number) => "?action=by_number&epassnumber=" + encodeURIComponent(number),
      numberOf: (item, number) => number
    },
    travel: {
      label: "TRAVEL",
      api: () => API.travel,
      param: "to_number",
      noun: "travel order employees",
      // Walang travel number ang fuel row; ang FAR code ang hanapan sa traveltb.fuel_farcode.
      lookup: farCode => "?action=by_fuel_farcode&farCode=" + encodeURIComponent(farCode),
      numberOf: item => String((item === null || item === void 0 ? void 0 : item.to_number) || "").trim()
    }
  };

  // ponytail: cache lang habang bukas ang desk; walang TTL — kapag na-edit ang EPASS/Travel, kailangan ng refresh.
  var fuelLinkPeopleCache = new Map();

  // Nagbabalik ng { number, people }. Walang laman ang people kapag walang naka-link na EPASS/Travel.
  function fetchFuelLinkPeople(_x9, _x10, _x11) {
    return _fetchFuelLinkPeople.apply(this, arguments);
  } // [HUWAG] Kapag may EPASS, iyon ang authoritative fuel link; huwag isabay ang stale Travel.
  function _fetchFuelLinkPeople() {
    _fetchFuelLinkPeople = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee8(kind, farCode, number) {
      var config, key, _yield$fetchJsonWithS5, response, payload, item, people, result;
      return _regeneratorRuntime().wrap(function _callee8$(_context8) {
        while (1) switch (_context8.prev = _context8.next) {
          case 0:
            config = FUEL_LINK_KINDS[kind];
            if (config) {
              _context8.next = 3;
              break;
            }
            return _context8.abrupt("return", {
              number: "",
              people: []
            });
          case 3:
            key = kind + ":" + String(number || farCode || "").trim().toUpperCase();
            if (!key.endsWith(":")) {
              _context8.next = 6;
              break;
            }
            return _context8.abrupt("return", {
              number: "",
              people: []
            });
          case 6:
            if (!fuelLinkPeopleCache.has(key)) {
              _context8.next = 8;
              break;
            }
            return _context8.abrupt("return", fuelLinkPeopleCache.get(key));
          case 8:
            _context8.next = 10;
            return fetchJsonWithSessionRetry(config.api() + config.lookup(String(farCode || "").trim(), String(number || "").trim().toUpperCase()), {
              credentials: "same-origin",
              headers: getAuthHeaders()
            }, "Unable to load " + config.noun + ".");
          case 10:
            _yield$fetchJsonWithS5 = _context8.sent;
            response = _yield$fetchJsonWithS5.response;
            payload = _yield$fetchJsonWithS5.payload;
            if (!(!response.ok || !(payload !== null && payload !== void 0 && payload.ok))) {
              _context8.next = 15;
              break;
            }
            throw new Error((payload === null || payload === void 0 ? void 0 : payload.message) || "Unable to load " + config.noun + ".");
          case 15:
            // item === null ang sagot kapag walang naka-link; hindi ito error.
            item = payload.item; // `people` carries one row per employee; the older name-only list is the fallback for any
            // deployment whose EPASS API predates fetchEpassPeople().
            people = !item ? [] : Array.isArray(item.people) && item.people.length ? item.people : requestEpassPeople(item).map(name => ({
              name,
              usercode: "",
              photo_url: ""
            }));
            result = {
              number: item ? config.numberOf(item, number) : "",
              people
            };
            fuelLinkPeopleCache.set(key, result);
            return _context8.abrupt("return", result);
          case 20:
          case "end":
            return _context8.stop();
        }
      }, _callee8);
    }));
    return _fetchFuelLinkPeople.apply(this, arguments);
  }
  function fuelLinkTagContent(hasEpass, hasTravel, travelChecked) {
    if (hasEpass) {
      return {
        text: "FUEL + EPASS",
        warn: false
      };
    }
    if (hasTravel) {
      return {
        text: "FUEL + TRAVEL",
        warn: false
      };
    }
    if (travelChecked) {
      return {
        text: "No EPASS or Travel linked to this fuel request",
        warn: true
      };
    }
    return {
      text: "FUEL",
      warn: false
    };
  }
  console.assert(fuelLinkTagContent(true, true, true).text === "FUEL + EPASS", "Fuel EPASS must take priority over Travel.");

  // Bina-block ang Approve ng fuel hangga't walang kumpirmadong EPASS o Travel na kawing.
  function gateFuelApprove(blocked) {
    var gate = document.querySelector("[data-fuel-approve-gate]");
    if (!gate) {
      return;
    }
    var approve = gate.querySelector('[data-action="approve"]');
    if (approve) {
      approve.disabled = blocked;
      approve.title = blocked ? "Create a Fuel EPASS or Travel Order before approving." : "Approve request";
    }
    var note = gate.querySelector("[data-fuel-approve-note]");
    if (note) {
      note.hidden = !blocked;
    }
  }

  // Ina-update ang badge sa hero mula sa mga data-attribute nito (async ang travel).
  function applyFuelLinkTag(tag) {
    var hasEpass = tag.getAttribute("data-has-epass") === "1";
    var hasTravel = tag.getAttribute("data-has-travel") === "1";
    var content = fuelLinkTagContent(hasEpass, hasTravel, tag.getAttribute("data-travel-checked") === "1");
    tag.textContent = content.text;
    tag.classList.toggle("is-warning", content.warn);
    gateFuelApprove(!(hasEpass || hasTravel));
  }
  function setFuelLinkTag(kind, present) {
    var tag = document.querySelector("[data-fuel-linktag]");
    if (!tag) {
      return;
    }
    tag.setAttribute("data-has-" + kind, present ? "1" : "0");
    if (kind === "travel") {
      tag.setAttribute("data-travel-checked", "1");
    }
    applyFuelLinkTag(tag);
  }
  function personInitials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return "?";
    }
    return parts.slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();
  }

  // [UI] Isang malaking profile chip. `interactive` — may X ba (approver lang, at hindi sa clone
  // ng marquee para walang doble-dobleng kontrol).
  function renderRiderChip(person, kind, number, label, allowRemove, interactive) {
    var name = String(person.name || person.usercode || "Unknown employee");
    var photo = resolvePhotoUrl(person.photo_url);
    var meta = [name, person.usercode].filter(Boolean).join(" · ");
    var removable = interactive && allowRemove && Number(person.row_id) > 0;
    var removeLabel = "Remove " + name + " from this " + label;
    return '<span class="dept-head-fuel-profile__rider" title="' + escapeHtml(meta) + '">' + '<span class="dept-head-fuel-profile__rider-avatar' + (photo ? " has-photo" : "") + '" aria-hidden="true">' + (photo ? '<img src="' + escapeHtml(photo) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" />' : escapeHtml(personInitials(name))) + '</span>' + '<span class="dept-head-fuel-profile__rider-copy">' + '<strong class="dept-head-fuel-profile__rider-name">' + escapeHtml(name) + '</strong>' + (person.usercode ? '<small class="dept-head-fuel-profile__rider-code">' + escapeHtml(person.usercode) + '</small>' : "") + '</span>' + (removable ? '<button type="button" class="dept-head-fuel-profile__rider-remove"' + ' data-remove-rider="' + escapeHtml(String(person.row_id)) + '"' + ' data-rider-kind="' + escapeHtml(kind) + '"' + ' data-rider-number="' + escapeHtml(String(number)) + '"' + ' data-rider-name="' + escapeHtml(name) + '"' + ' title="' + escapeHtml(removeLabel) + '"' + ' aria-label="' + escapeHtml(removeLabel) + '">&times;</button>' : "") + '</span>';
  }

  // [UI] Tuloy-tuloy na sliding loop: dalawang magkaparehong grupo, ang track ay gumagalaw ng -50%
  // kaya walang putol ang pag-ulit. Ang clone (pangalawang grupo) ay aria-hidden at walang X.
  function renderFuelLinkPeople(people, kind, number) {
    var _FUEL_LINK_KINDS$kind;
    var label = ((_FUEL_LINK_KINDS$kind = FUEL_LINK_KINDS[kind]) === null || _FUEL_LINK_KINDS$kind === void 0 ? void 0 : _FUEL_LINK_KINDS$kind.label) || "EPASS";
    var allowRemove = canApprove(readSession()) && people.length > 1;
    var group = interactive => people.map(person => renderRiderChip(person, kind, number, label, allowRemove, interactive)).join("");
    // A single employee does not need the duplicated track used by the looping marquee.
    if (people.length === 1) {
      return '<div class="dept-head-fuel-profile__people-single">' + group(true) + '</div>';
    }
    // Dalawang magkaparehong grupo para seamless ang wrap habang ini-scroll (auto o drag).
    return '<div class="dept-head-fuel-profile__marquee" data-rider-marquee>' + '<div class="dept-head-fuel-profile__track">' + '<div class="dept-head-fuel-profile__track-group">' + group(true) + '</div>' + '<div class="dept-head-fuel-profile__track-group" aria-hidden="true">' + group(false) + '</div>' + '</div>' + '</div>';
  }

  // Grab-to-drag + banayad na auto-glide. Ang scrollLeft ang gumagalaw (hindi CSS transform) para
  // pareho ang gumana sa drag at auto, at seamless ang wrap gamit ang pangalawang grupo.
  var riderMarqueeRafs = new Set();
  function stopAllRiderMarquees() {
    riderMarqueeRafs.forEach(id => cancelAnimationFrame(id));
    riderMarqueeRafs.clear();
  }
  function initRiderMarquee(marquee) {
    var track = marquee.querySelector(".dept-head-fuel-profile__track");
    var firstGroup = track && track.firstElementChild;
    if (!track || !firstGroup) {
      return;
    }
    var groupWidth = () => firstGroup.getBoundingClientRect().width;

    // Panatilihin ang scrollLeft sa loob ng [0, groupWidth) — dito nagmumula ang seamless loop.
    var wrap = () => {
      var g = groupWidth();
      if (g <= 0) {
        return;
      }
      if (marquee.scrollLeft >= g) {
        marquee.scrollLeft -= g;
      } else if (marquee.scrollLeft < 0) {
        marquee.scrollLeft += g;
      }
    };
    var dragging = false;
    var moved = false;
    var startX = 0;
    var startScroll = 0;

    // ponytail: manual drag is enough; a permanent animation loop made the desk costly while idle.
    marquee.addEventListener("pointerdown", event => {
      // Hayaan ang X na gumana nang normal — huwag magsimula ng drag doon.
      if (event.target.closest("[data-remove-rider]")) {
        return;
      }
      event.preventDefault();
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScroll = marquee.scrollLeft;
      marquee.setPointerCapture(event.pointerId);
      marquee.classList.add("is-dragging");
    });
    marquee.addEventListener("pointermove", event => {
      if (!dragging) {
        return;
      }
      var dx = event.clientX - startX;
      if (Math.abs(dx) > 3) {
        moved = true;
      }
      marquee.scrollLeft = startScroll - dx;
      wrap();
    });
    var endDrag = event => {
      if (!dragging) {
        return;
      }
      dragging = false;
      marquee.classList.remove("is-dragging");
      try {
        marquee.releasePointerCapture(event.pointerId);
      } catch (_ignore) {}
    };
    marquee.addEventListener("pointerup", endDrag);
    marquee.addEventListener("pointercancel", endDrag);
    // Kapag nag-drag, huwag pansinin ang click (hindi sinasadyang matanggal ang isang tao).
    marquee.addEventListener("click", event => {
      if (moved) {
        event.stopPropagation();
        event.preventDefault();
        moved = false;
      }
    }, true);
  }
  function removeFuelLinkRider(_x12) {
    return _removeFuelLinkRider.apply(this, arguments);
  } // Fills the placeholder left by the fuel detail render. The FAR-code guard stops a slow response
  // from painting names onto a different request the approver has already clicked to.
  function _removeFuelLinkRider() {
    _removeFuelLinkRider = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee9(button) {
      var rowId, kind, number, name, config, body, _yield$fetchJsonWithS6, response, payload, section, farCode;
      return _regeneratorRuntime().wrap(function _callee9$(_context9) {
        while (1) switch (_context9.prev = _context9.next) {
          case 0:
            rowId = button.getAttribute("data-remove-rider");
            kind = button.getAttribute("data-rider-kind") || "epass";
            number = button.getAttribute("data-rider-number");
            name = button.getAttribute("data-rider-name") || "this employee";
            config = FUEL_LINK_KINDS[kind];
            if (config) {
              _context9.next = 7;
              break;
            }
            return _context9.abrupt("return");
          case 7:
            if (window.confirm(`Remove ${name} from ${config.label} ${number}?\n\nIt will no longer include them.`)) {
              _context9.next = 9;
              break;
            }
            return _context9.abrupt("return");
          case 9:
            body = new URLSearchParams();
            body.append(config.param, number);
            body.append("row_id", rowId);
            button.disabled = true;
            _context9.prev = 13;
            _context9.next = 16;
            return fetchJsonWithSessionRetry(config.api() + "?action=remove_person", {
              method: "POST",
              body,
              credentials: "same-origin",
              headers: getAuthHeaders()
            }, "Unable to remove the employee.");
          case 16:
            _yield$fetchJsonWithS6 = _context9.sent;
            response = _yield$fetchJsonWithS6.response;
            payload = _yield$fetchJsonWithS6.payload;
            if (!(!response.ok || !(payload !== null && payload !== void 0 && payload.ok))) {
              _context9.next = 21;
              break;
            }
            throw new Error((payload === null || payload === void 0 ? void 0 : payload.message) || "Unable to remove the employee.");
          case 21:
            section = button.closest("[data-fuel-link-people]");
            farCode = (section === null || section === void 0 ? void 0 : section.getAttribute("data-fuel-link-far")) || "";
            fuelLinkPeopleCache.delete(kind + ":" + String(number).trim().toUpperCase());
            fuelLinkPeopleCache.delete(kind + ":" + String(farCode).trim().toUpperCase());
            _context9.next = 27;
            return fillFuelLinkPeople(kind, farCode, number);
          case 27:
            _context9.next = 33;
            break;
          case 29:
            _context9.prev = 29;
            _context9.t0 = _context9["catch"](13);
            button.disabled = false;
            window.alert(_context9.t0.message);
          case 33:
          case "end":
            return _context9.stop();
        }
      }, _callee9, null, [[13, 29]]);
    }));
    return _removeFuelLinkRider.apply(this, arguments);
  }
  function fillFuelLinkPeople(_x13, _x14, _x15) {
    return _fillFuelLinkPeople.apply(this, arguments);
  } // [UI] Maikling group summary para sa EPASS list at header — readable kahit mahaba ang pangalan ng buong grupo.
  function _fillFuelLinkPeople() {
    _fillFuelLinkPeople = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee10(kind, farCode, number) {
      var _FUEL_LINK_KINDS$kind2;
      var expectedFar, selector, stillCurrent, label, _yield$fetchFuelLinkP, resolved, people, target, bodyEl, marquee, _target;
      return _regeneratorRuntime().wrap(function _callee10$(_context10) {
        while (1) switch (_context10.prev = _context10.next) {
          case 0:
            expectedFar = String(farCode || "").trim().toUpperCase();
            selector = '[data-fuel-link-people="' + kind + '"]';
            stillCurrent = () => {
              var current = document.querySelector(selector);
              return current && current.getAttribute("data-fuel-link-far") === expectedFar ? current : null;
            };
            if (stillCurrent()) {
              _context10.next = 5;
              break;
            }
            return _context10.abrupt("return");
          case 5:
            label = ((_FUEL_LINK_KINDS$kind2 = FUEL_LINK_KINDS[kind]) === null || _FUEL_LINK_KINDS$kind2 === void 0 ? void 0 : _FUEL_LINK_KINDS$kind2.label) || "EPASS";
            _context10.prev = 6;
            _context10.next = 9;
            return fetchFuelLinkPeople(kind, expectedFar, number);
          case 9:
            _yield$fetchFuelLinkP = _context10.sent;
            resolved = _yield$fetchFuelLinkP.number;
            people = _yield$fetchFuelLinkP.people;
            target = stillCurrent();
            if (target) {
              _context10.next = 15;
              break;
            }
            return _context10.abrupt("return");
          case 15:
            if (!(!people.length && !resolved)) {
              _context10.next = 19;
              break;
            }
            target.remove();
            if (kind === "travel") {
              setFuelLinkTag("travel", false);
            }
            return _context10.abrupt("return");
          case 19:
            if (kind === "travel") {
              setFuelLinkTag("travel", Boolean(resolved));
            }
            target.setAttribute("data-fuel-link-number", resolved);
            target.querySelector("[data-fuel-link-people-title]").textContent = "Employees on " + label + (resolved ? " " + resolved : "");
            bodyEl = target.querySelector("[data-fuel-link-people-body]");
            bodyEl.innerHTML = people.length ? renderFuelLinkPeople(people, kind, resolved) : '<span class="dept-head-fuel-profile__people-empty">No employee named on this ' + escapeHtml(label) + "</span>";
            marquee = bodyEl.querySelector("[data-rider-marquee]");
            if (marquee) {
              initRiderMarquee(marquee);
            }
            target.querySelector("[data-fuel-link-people-count]").textContent = people.length ? people.length + " employee" + (people.length === 1 ? "" : "s") : "";
            _context10.next = 33;
            break;
          case 29:
            _context10.prev = 29;
            _context10.t0 = _context10["catch"](6);
            _target = stillCurrent();
            if (_target) {
              _target.querySelector("[data-fuel-link-people-body]").innerHTML = '<span class="dept-head-fuel-profile__people-empty">' + escapeHtml(_context10.t0.message) + "</span>";
            }
          case 33:
          case "end":
            return _context10.stop();
        }
      }, _callee10, null, [[6, 29]]);
    }));
    return _fillFuelLinkPeople.apply(this, arguments);
  }
  function requestEpassGroupSummary(item, limit = 3) {
    var people = requestEpassPeople(item);
    if (!people.length) {
      return "EMPLOYEES";
    }
    if (people.length === 1) {
      return `EMPLOYEES: ${people[0]}`;
    }
    var summary = people.slice(0, limit).join(", ");
    return `EMPLOYEES: ${summary}` + (people.length > limit ? " +" + (people.length - limit) + " more" : "");
  }

  // [UI] Ipinapakita ang grouped EPASS names bilang chips para madaling ma-scan ang buong kasama.
  function renderPeopleChips(people) {
    return (people || []).map(person => '<span class="dept-head-approval-detail__person">' + escapeHtml(person) + "</span>").join("");
  }
  function renderEpassIncludedPeople(item) {
    var names = requestEpassPeople(item);
    var usercodes = requestDelimitedList(item.requester_usercodes);
    var photos = requestPhotoList(item.requester_photo_urls);
    if (!names.length) {
      return '<span class="dept-head-fuel-profile__people-empty">No employees listed on this EPASS.</span>';
    }
    return names.map((name, index) => {
      var photo = resolvePhotoUrl(photos[index] || "");
      var usercode = String(usercodes[index] || "").trim();
      return '<article class="dept-head-fuel-profile__rider" style="width:100%;min-width:0;margin:0;border-radius:16px;background:#f8fbff;">' + '<span class="dept-head-fuel-profile__rider-avatar' + (photo ? ' has-photo' : '') + '" aria-hidden="true">' + (photo ? '<img src="' + escapeHtml(photo) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" />' : escapeHtml(personInitials(name))) + '</span>' + '<span class="dept-head-fuel-profile__rider-copy">' + '<strong class="dept-head-fuel-profile__rider-name">' + escapeHtml(name) + '</strong>' + '<small class="dept-head-fuel-profile__rider-code">' + escapeHtml(usercode || "Employee number unavailable") + '</small>' + '</span>' + '</article>';
    }).join("");
  }

  // [UI] Ginagamit ang count chip para malinaw kung ilang tao ang kasama sa isang EPASS group.
  function requestEpassCountLabel(item) {
    var count = requestEpassPeople(item).length;
    return `${count || 1} employee${count === 1 ? "" : "s"}`;
  }

  // [UI] Pang-badge lang ito sa EPASS card; gusto natin simpleng bilang, hindi mahabang label.
  function requestEpassCountValue(item) {
    var count = requestEpassPeople(item).length;
    return String(count || 1);
  }

  // [UI] Lahat ng queue card may count badge sa avatar; EPASS lang ang tunay na group count.
  function requestCardCountValue(sectionKey, item) {
    if (sectionKey === "epass") {
      return requestEpassCountValue(item);
    }
    return "1";
  }
  function requestRequester(sectionKey, item) {
    if (sectionKey === "epass") {
      return requestEpassGroupSummary(item);
    }
    return [item.requester_name || item.EmployeeName, item.usercode || item.UserCode].map(value => String(value || "").trim()).filter(Boolean).join(" | ");
  }

  // [UI] Iba-iba ang anyo ng naka-imbak na photo path kaya dito lang isinasalin papuntang totoong URL.
  function resolvePhotoUrl(raw) {
    var _window$APIClient;
    if (Array.isArray(raw)) {
      raw = requestPhotoList(raw)[0] || "";
    } else if (raw && typeof raw === "object") {
      raw = raw.profile_photo_url || raw.photo_url || raw.profilePhotoUrl || raw.url || raw.src || "";
    }
    raw = String(raw || "").trim();
    if (!raw || raw === "[object Object]") {
      return "";
    }
    if (typeof ((_window$APIClient = window.APIClient) === null || _window$APIClient === void 0 ? void 0 : _window$APIClient.resolveMediaUrl) === "function") {
      return window.APIClient.resolveMediaUrl(raw);
    }
    try {
      var parsed = new URL(raw, window.location.href);
      if (/\/api\/auth(?:\.php)?$/i.test(parsed.pathname) && String(parsed.searchParams.get("action") || "").toLowerCase() === "profile_photo") {
        var userId = parsed.searchParams.get("user_id") || parsed.searchParams.get("id") || "";
        var version = parsed.searchParams.get("v");
        if (/^\d+$/.test(userId) && Number(userId) > 0) {
          return `${NODE_API_BASE}/auth/profile-photo?user_id=${encodeURIComponent(userId)}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
        }
        // [HUWAG BAGUHIN] Legacy usercode-only photos require a PHP session; use initials instead of causing a 401.
        return "";
      }
    } catch (_error) {
      // Continue with the local fallback resolver.
    }
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) {
      return raw;
    }
    if (/^\/SAMELCII_WEB_SYSTEM\//i.test(raw)) {
      return `${APP_BASE}/${raw.replace(/^\/SAMELCII_WEB_SYSTEM\/+/i, "")}`;
    }
    if (raw.startsWith("/")) {
      return `${window.location.origin}${raw}`;
    }
    var clean = raw.replace(/^\/+/, "");
    var appPath = new URL(APP_BASE).pathname.replace(/^\/+|\/+$/g, "");
    if (clean === appPath || clean.startsWith(`${appPath}/`)) {
      return `${window.location.origin}/${clean}`;
    }
    clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, "");
    clean = clean.replace(/^uploads\//i, "uploads/");
    return `${APP_BASE}/${clean.replace(/^(\.\.\/)+/, "")}`;
  }

  // [UI] Kinukuha ang photo URL ng requester para sa profile avatar sa list; kung wala, may initials fallback.
  function requestAvatarPhotoUrl(sectionKey, item) {
    return resolvePhotoUrl(requestPhotoList(item.requester_photo_urls || item.requester_photo_url || item.EmployeePhotoUrl || item.profile_photo_url || item.profilePhotoUrl || "")[0] || "");
  }

  // [UI] Gumagawa ng maikling initials para sa profile avatar card kapag walang naka-upload na photo.
  function requestAvatarLabel(sectionKey, item) {
    if (sectionKey === "epass") {
      var people = requestEpassPeople(item);
      if (people.length) {
        var firstName = String(people[0] || "").trim();
        if (firstName) {
          var _parts = firstName.split(/\s+/).filter(Boolean);
          var _initials = _parts.slice(0, 2).map(part => part.charAt(0)).join("");
          return (_initials || firstName.charAt(0) || "E").toUpperCase();
        }
        return "EP";
      }
      return "EMP";
    }
    var baseName = String(item.requester_name || item.EmployeeName || item.usercode || item.UserCode || "").trim();
    if (!baseName) {
      return "??";
    }
    var parts = baseName.split(/\s+/).filter(Boolean);
    var initials = parts.slice(0, 2).map(part => part.charAt(0)).join("");
    return (initials || baseName.charAt(0) || "?").toUpperCase();
  }
  function requestShortMeta(sectionKey, item) {
    if (sectionKey === "epass") {
      return String(item.destination || item.department || "").trim();
    }
    if (sectionKey === "fuel") {
      return [item.Vehicle, item.ReqAmt ? item.ReqAmt + " L" : ""].filter(Boolean).join(" | ");
    }
    if (sectionKey === "ot") {
      return [overtimeStageLabel(item.approval_stage), item.time_from, item.time_to].filter(Boolean).join(" | ");
    }
    if (sectionKey === "leave") {
      return [item.leave_type, item.date_range, item.days ? item.days + " day(s)" : ""].filter(Boolean).join(" | ");
    }
    return String(item.destination || item.department || "").trim();
  }

  // [UI] Ito ang pinanggalingan ng request para malinaw kung Fuel form ba o Employees Profile ang source.
  function requestSourceLabel(sectionKey) {
    if (sectionKey === "fuel") {
      return "Fuel Form";
    }
    if (sectionKey === "epass" || sectionKey === "travel") {
      return "Employees Profile";
    }
    if (sectionKey === "leave") {
      return "Employees Profile";
    }
    return "Employees Profile";
  }
  function reviewStatusValue(sectionKey, item) {
    var _item$reviewed_status, _item$status2;
    var reviewed = String((_item$reviewed_status = item === null || item === void 0 ? void 0 : item.reviewed_status) !== null && _item$reviewed_status !== void 0 ? _item$reviewed_status : "").trim();
    if (reviewed !== "") {
      return reviewed;
    }
    if (sectionKey === "ot") {
      var _item$status;
      var status = String((_item$status = item === null || item === void 0 ? void 0 : item.status) !== null && _item$status !== void 0 ? _item$status : "").trim();
      return status === "2" || status === "3" ? status : "";
    }
    if (sectionKey === "leave") {
      var _ref8, _item$DP_approved;
      return String((_ref8 = (_item$DP_approved = item === null || item === void 0 ? void 0 : item.DP_approved) !== null && _item$DP_approved !== void 0 ? _item$DP_approved : item === null || item === void 0 ? void 0 : item.status) !== null && _ref8 !== void 0 ? _ref8 : "").trim();
    }
    if (sectionKey === "fuel") {
      var _ref9, _item$Status;
      return String((_ref9 = (_item$Status = item === null || item === void 0 ? void 0 : item.Status) !== null && _item$Status !== void 0 ? _item$Status : item === null || item === void 0 ? void 0 : item.status) !== null && _ref9 !== void 0 ? _ref9 : "").trim();
    }
    return String((_item$status2 = item === null || item === void 0 ? void 0 : item.status) !== null && _item$status2 !== void 0 ? _item$status2 : "").trim();
  }

  // [LOGIC] Iba-iba ang approval field bawat module; dito naka-base ang badge at status chip.
  function requestReviewState(sectionKey, item) {
    var raw = reviewStatusValue(sectionKey, item);
    if (sectionKey === "fuel") {
      if (raw === "1") {
        return {
          label: "Approved",
          tone: "approved",
          icon: "fa-check"
        };
      }
      if (raw === "3") {
        return {
          label: "Rejected",
          tone: "rejected",
          icon: "fa-times"
        };
      }
      return {
        label: "Pending",
        tone: "pending",
        icon: "fa-clock-o"
      };
    }
    if (sectionKey === "ot") {
      var _item$reviewed_status2, _item$status3;
      var reviewed = String((_item$reviewed_status2 = item === null || item === void 0 ? void 0 : item.reviewed_status) !== null && _item$reviewed_status2 !== void 0 ? _item$reviewed_status2 : "").trim();
      if (reviewed === "1") {
        return {
          label: "Approved",
          tone: "approved",
          icon: "fa-check"
        };
      }
      if (reviewed === "2") {
        return {
          label: "Rejected",
          tone: "rejected",
          icon: "fa-times"
        };
      }
      var status = String((_item$status3 = item === null || item === void 0 ? void 0 : item.status) !== null && _item$status3 !== void 0 ? _item$status3 : "").trim();
      if (status === "2") {
        return {
          label: "Approved",
          tone: "approved",
          icon: "fa-check"
        };
      }
      if (status === "3") {
        return {
          label: "Rejected",
          tone: "rejected",
          icon: "fa-times"
        };
      }
      if (raw === "1") {
        return {
          label: "Approved",
          tone: "approved",
          icon: "fa-check"
        };
      }
      if (raw === "2") {
        return {
          label: "Rejected",
          tone: "rejected",
          icon: "fa-times"
        };
      }
      return {
        label: "Pending",
        tone: "pending",
        icon: "fa-clock-o"
      };
    }
    if (raw === "2") {
      return {
        label: "Approved",
        tone: "approved",
        icon: "fa-check"
      };
    }
    if (raw === "3") {
      return {
        label: "Rejected",
        tone: "rejected",
        icon: "fa-times"
      };
    }
    return {
      label: "Pending",
      tone: "pending",
      icon: "fa-clock-o"
    };
  }
  function queueItems(sectionKey) {
    var seen = new Set();
    var pending = (state.queues[sectionKey] || []).filter(item => {
      var id = requestId(sectionKey, item);
      if (!id || seen.has(id) || isReviewed(sectionKey, id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
    var reviewed = Object.values(state.reviewed[sectionKey] || {});
    var combined = pending.slice();
    reviewed.forEach(item => {
      var id = requestId(sectionKey, item);
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      combined.push(item);
    });
    return combined;
  }
  function shouldApplyDepartmentFilter(sectionKey) {
    // Every queue request already sends the department to the Node API. Filtering the returned
    // rows again hides valid items when one endpoint returns an abbreviation and another returns
    // the full department name.
    return false;
  }
  function filteredQueueItems(sectionKey) {
    var term = normalizeText(state.searchTerm);
    return queueItems(sectionKey).filter(item => {
      if (shouldApplyDepartmentFilter(sectionKey) && !departmentMatches(item.department || item.EmployeeDepartmentName || item.EmployeeDeptAbbr || "", state.departmentFilter)) {
        return false;
      }
      if (!term) {
        return true;
      }
      var haystack = [requestId(sectionKey, item), requestTitle(sectionKey, item), requestDate(sectionKey, item), requestRequester(sectionKey, item), requestShortMeta(sectionKey, item), item.department, item.EmployeeDepartmentName, item.EmployeeDeptAbbr, item.destination, item.purpose, item.area, requestReviewState(sectionKey, item).label].map(normalizeText).join("|");
      return haystack.includes(term);
    });
  }
  function ensureQueueOrder(sectionKey, items) {
    var orderMap = state.queueOrder[sectionKey];
    var base = Date.now() * 1000;
    var seq = 0;
    items.forEach(item => {
      var id = requestId(sectionKey, item);
      if (!id || Object.prototype.hasOwnProperty.call(orderMap, id)) {
        return;
      }
      orderMap[id] = base + seq;
      seq += 1;
    });
  }
  function sortByQueueOrder(sectionKey, items) {
    return items.slice().sort((left, right) => {
      var leftOrder = state.queueOrder[sectionKey][requestId(sectionKey, left)] || 0;
      var rightOrder = state.queueOrder[sectionKey][requestId(sectionKey, right)] || 0;
      return rightOrder - leftOrder;
    });
  }
  function findItem(sectionKey, id) {
    return queueItems(sectionKey).find(row => requestId(sectionKey, row) === id) || null;
  }
  function detailRows(sectionKey, item) {
    var rows = [];
    if (sectionKey === "fuel") {
      rows.push({
        label: "Request Date",
        value: requestDate(sectionKey, item)
      });
      rows.push({
        label: "FAR Code",
        value: item.FARCode
      });
      rows.push({
        label: "Request Source",
        value: requestSourceLabel(sectionKey)
      });
      rows.push({
        label: "Employee",
        value: requestRequester(sectionKey, item)
      });
      rows.push({
        label: "Department",
        value: [item.EmployeeDeptAbbr, item.EmployeeDepartmentName].filter(Boolean).join(" | ")
      });
      rows.push({
        label: "Vehicle",
        value: item.Vehicle
      });
      rows.push({
        label: "Liters Requested",
        value: item.ReqAmt
      });
      rows.push({
        label: "Fuel Station",
        value: item.fuelstation
      });
      rows.push({
        label: "Destination",
        value: item.Destination,
        wide: true
      });
      rows.push({
        label: "Purpose",
        value: item.Purpose,
        wide: true
      });
      var linkedEpass = getFuelEpassNumber(item);
      if (linkedEpass) {
        rows.push({
          label: "EPASS Link",
          value: linkedEpass
        });
      } else {
        rows.push({
          label: "Travel Link",
          value: item.TravelNumber || item.travel_number || item.to_number || "Not linked yet"
        });
      }
      rows.push({
        label: "Approved By",
        value: item.ApprovedByName || item.ApprovedBy
      });
      rows.push({
        label: "Balance",
        value: item.Balance
      });
      rows.push({
        label: "Status",
        value: requestReviewState(sectionKey, item).label
      });
    } else if (sectionKey === "epass") {
      var people = requestEpassPeople(item);
      rows.push({
        label: "Request Date",
        value: requestDate(sectionKey, item)
      });
      rows.push({
        label: "EPASS Number",
        value: item.epassnumber
      });
      rows.push({
        label: "Request Source",
        value: requestSourceLabel(sectionKey)
      });
      rows.push({
        label: "Included Employees",
        value: people.length ? people : [requestEpassGroupSummary(item)],
        wide: true,
        kind: "people"
      });
      rows.push({
        label: "Department",
        value: item.department
      });
      rows.push({
        label: "Destination",
        value: item.destination
      });
      rows.push({
        label: "Purpose",
        value: item.purpose,
        wide: true
      });
      rows.push({
        label: "Approver",
        value: item.approver_name || item.approved_by
      });
      rows.push({
        label: "Status",
        value: requestReviewState(sectionKey, item).label
      });
    } else if (sectionKey === "travel") {
      rows.push({
        label: "Request Date",
        value: requestDate(sectionKey, item)
      });
      rows.push({
        label: "Travel Order No.",
        value: item.to_number
      });
      rows.push({
        label: "Request Source",
        value: requestSourceLabel(sectionKey)
      });
      rows.push({
        label: "Requester",
        value: requestRequester(sectionKey, item)
      });
      rows.push({
        label: "Department",
        value: item.department
      });
      rows.push({
        label: "Destination",
        value: item.destination
      });
      rows.push({
        label: "Purpose",
        value: item.purpose,
        wide: true
      });
      rows.push({
        label: "Fuel Link",
        value: item.fuel_farcode || "Not linked yet"
      });
      rows.push({
        label: "Approver",
        value: item.approver_name || item.approved_by
      });
      rows.push({
        label: "Status",
        value: requestReviewState(sectionKey, item).label
      });
    } else if (sectionKey === "leave") {
      rows.push({
        label: "Date Filed",
        value: requestDate(sectionKey, item)
      });
      rows.push({
        label: "Tracking No.",
        value: item.tracking_no
      });
      rows.push({
        label: "Requester",
        value: requestRequester(sectionKey, item)
      });
      rows.push({
        label: "Department",
        value: item.department
      });
      rows.push({
        label: "Leave Type",
        value: item.leave_type
      });
      rows.push({
        label: "Date Range",
        value: item.date_range
      });
      rows.push({
        label: "Days",
        value: item.days
      });
      rows.push({
        label: "Purpose",
        value: item.purpose,
        wide: true
      });
      rows.push({
        label: "Approver",
        value: item.approver_name || item.approved_by
      });
      rows.push({
        label: "Status",
        value: requestReviewState(sectionKey, item).label
      });
    } else {
      rows.push({
        label: "OT Date",
        value: requestDate(sectionKey, item)
      });
      rows.push({
        label: "OT Number",
        value: item.ot_number
      });
      rows.push({
        label: "Requester",
        value: requestRequester(sectionKey, item)
      });
      rows.push({
        label: "Department",
        value: item.department
      });
      rows.push({
        label: "Area",
        value: item.area
      });
      rows.push({
        label: "Attachment Type",
        value: item.attachment_type
      });
      rows.push({
        label: "Time From",
        value: item.time_from
      });
      rows.push({
        label: "Time To",
        value: item.time_to
      });
      rows.push({
        label: "Hours",
        value: item.hours
      });
      rows.push({
        label: "Current Stage",
        value: overtimeStageLabel(item.approval_stage)
      });
      rows.push({
        label: "GM Review",
        value: Number(item.requires_gm) === 1 ? "Required for this exceptional OT" : "Not required"
      });
      rows.push({
        label: "Purpose",
        value: item.purpose,
        wide: true
      });
      rows.push({
        label: "Status",
        value: requestReviewState(sectionKey, item).label === "Pending" ? "Pending OT approval" : requestReviewState(sectionKey, item).label
      });
    }
    return rows.filter(row => {
      var _row$value;
      if (Array.isArray(row.value)) {
        return row.value.some(entry => String(entry !== null && entry !== void 0 ? entry : "").trim() !== "");
      }
      return String((_row$value = row.value) !== null && _row$value !== void 0 ? _row$value : "").trim() !== "";
    });
  }

  // Shared "how many copies" dialog for any quarter-page print (EPASS, Travel, ...).
  // [FIX] also offers an e-signature toggle when the approver actually has a signature on
  // file (per requestPrintApproverProfile), so the printer can choose a blank signature line
  // instead of the stored image for this print run.
  // [FIX] printing used to open a real new browser window (global.open), which conflicts with
  // the desktop print-capture app the user runs alongside Chrome. A hidden iframe gives the
  // print job the same isolated document/CSS a popup window gave it, without ever opening a
  // second window — printFrameWindow() below is the single place every print path gets one from.
  function printFrameWindow() {
    var frame = document.getElementById("dept-head-print-frame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "dept-head-print-frame";
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;";
      document.body.appendChild(frame);
    }
    return frame.contentWindow;
  }

  // [FIX] Copies and the "include e-signature" choice now always persist automatically — no
  // more manual "remember" checkbox the user had to remember to tick every single print.
  function choosePrintCopies({
    storageKey,
    titleWord,
    hintText,
    fallbackDefault = 4,
    hasSignatureOnFile = false
  }) {
    var savedCopies = Number(global.localStorage.getItem(storageKey));
    var defaultCopies = Number.isInteger(savedCopies) && savedCopies >= 1 && savedCopies <= 4 ? savedCopies : fallbackDefault;
    var esigStorageKey = `${storageKey}_esig`;
    var defaultIncludeSignature = global.localStorage.getItem(esigStorageKey) !== "0";
    return new Promise(resolve => {
      var dialog = document.createElement("dialog");
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
                    <div class="epass-print-choice__head"><div><small>PRINT LAYOUT</small><h2 id="epass-print-choice-title">How many ${titleWord} copies?</h2></div><button class="epass-print-choice__close" type="button" aria-label="Cancel print">&times;</button></div>
                    <p class="epass-print-choice__hint">${hintText}</p>
                    <div class="epass-print-choice__quantity">
                        <button class="epass-print-choice__step" type="button" data-step="-1" aria-label="Decrease copies">&minus;</button>
                        <label class="epass-print-choice__value"><input type="number" min="1" max="4" step="1" value="${defaultCopies}" data-copy-count aria-label="Number of copies"><span>COPIES (MAXIMUM 4)</span></label>
                        <button class="epass-print-choice__step" type="button" data-step="1" aria-label="Increase copies">+</button>
                    </div>
                    ${hasSignatureOnFile ? `<label class="epass-print-choice__remember"><input type="checkbox" data-esig${defaultIncludeSignature ? " checked" : ""}> Include e-signature image</label>` : ''}
                    <button class="epass-print-choice__print" type="button" data-print-epass>PRINT ${titleWord.toUpperCase()}</button>
                </div>`;
      var finish = value => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finish(null);
      });
      dialog.addEventListener("click", event => {
        var _dialog$querySelector;
        if (event.target.closest(".epass-print-choice__close")) {
          finish(null);
          return;
        }
        var countInput = dialog.querySelector("[data-copy-count]");
        var stepButton = event.target.closest("[data-step]");
        if (stepButton) {
          countInput.value = String(Math.min(4, Math.max(1, Number(countInput.value || defaultCopies) + Number(stepButton.dataset.step))));
          return;
        }
        if (!event.target.closest("[data-print-epass]")) {
          return;
        }
        var copies = Math.min(4, Math.max(1, Math.round(Number(countInput.value) || defaultCopies)));
        countInput.value = String(copies);
        var printWindow = printFrameWindow();
        global.localStorage.setItem(storageKey, String(copies));
        var includeSignature = hasSignatureOnFile ? !!((_dialog$querySelector = dialog.querySelector("[data-esig]")) !== null && _dialog$querySelector !== void 0 && _dialog$querySelector.checked) : false;
        if (hasSignatureOnFile) {
          global.localStorage.setItem(esigStorageKey, includeSignature ? "1" : "0");
        }
        finish({
          copies,
          printWindow,
          includeSignature
        });
      });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }
  function chooseEpassPrintCopies(hasSignatureOnFile) {
    return choosePrintCopies({
      storageKey: "samelcii_epass_print_copies",
      titleWord: "EPASS",
      hintText: "Enter 1 to 4 copies. Every copy keeps the same quarter-page size.",
      hasSignatureOnFile
    });
  }

  // [DESIGN] Copied 1:1 from the Employee Profile module's Travel print dialog
  // (pages/modules/employees-profile/script.js chooseTravelPrintCopies) — red theme, class
  // "travel-print-choice" — instead of the shared blue "epass-print-choice" dialog, so the
  // pre-print form looks the same in both places. Only the e-signature checkbox is Approval-Desk
  // only, since this is the one place that actually has a signature image to offer.
  // [FIX] Same auto-remember behavior as choosePrintCopies (EPASS): no manual checkbox needed
  // to persist copies / e-signature choice.
  function chooseTravelPrintCopies(hasSignatureOnFile) {
    var storageKey = "samelcii_travel_print_copies";
    var savedCopies = Number(global.localStorage.getItem(storageKey));
    var defaultCopies = Number.isInteger(savedCopies) && savedCopies >= 1 && savedCopies <= 4 ? savedCopies : 4;
    var esigStorageKey = `${storageKey}_esig`;
    var defaultIncludeSignature = global.localStorage.getItem(esigStorageKey) !== "0";
    return new Promise(resolve => {
      var dialog = document.createElement("dialog");
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
                    ${hasSignatureOnFile ? `<label class="travel-print-choice__remember"><input type="checkbox" data-esig${defaultIncludeSignature ? " checked" : ""}> Include e-signature image</label>` : ''}
                    <button class="travel-print-choice__print" type="button" data-print-travel>PRINT TRAVEL ORDER</button>
                </div>`;
      var finish = value => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finish(null);
      });
      dialog.addEventListener("click", event => {
        var _dialog$querySelector2;
        if (event.target.closest(".travel-print-choice__close")) {
          finish(null);
          return;
        }
        var countInput = dialog.querySelector("[data-copy-count]");
        var stepButton = event.target.closest("[data-step]");
        if (stepButton) {
          countInput.value = String(Math.min(4, Math.max(1, Number(countInput.value || defaultCopies) + Number(stepButton.dataset.step))));
          return;
        }
        if (!event.target.closest("[data-print-travel]")) {
          return;
        }
        var copies = Math.min(4, Math.max(1, Math.round(Number(countInput.value) || defaultCopies)));
        countInput.value = String(copies);
        var printWindow = printFrameWindow();
        global.localStorage.setItem(storageKey, String(copies));
        var includeSignature = hasSignatureOnFile ? !!((_dialog$querySelector2 = dialog.querySelector("[data-esig]")) !== null && _dialog$querySelector2 !== void 0 && _dialog$querySelector2.checked) : false;
        if (hasSignatureOnFile) {
          global.localStorage.setItem(esigStorageKey, includeSignature ? "1" : "0");
        }
        finish({
          copies,
          printWindow,
          includeSignature
        });
      });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }
  function resolveFuelPrintActions() {
    return _resolveFuelPrintActions.apply(this, arguments);
  }
  function _resolveFuelPrintActions() {
    _resolveFuelPrintActions = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee11() {
      var _global$FuelActions, _activeFrameWindow$Fu, _sameOriginFrameWindo, _ownerWindow$FuelActi;
      var sameOriginFrameWindow, activeFrameWindow, helperFrame, ownerWindow;
      return _regeneratorRuntime().wrap(function _callee11$(_context11) {
        while (1) switch (_context11.prev = _context11.next) {
          case 0:
            if (!(typeof ((_global$FuelActions = global.FuelActions) === null || _global$FuelActions === void 0 ? void 0 : _global$FuelActions.printRequest) === "function")) {
              _context11.next = 2;
              break;
            }
            return _context11.abrupt("return", {
              actions: global.FuelActions,
              ownerWindow: global
            });
          case 2:
            sameOriginFrameWindow = frame => {
              try {
                var _frameWindow$location;
                var frameWindow = frame === null || frame === void 0 ? void 0 : frame.contentWindow;
                return (frameWindow === null || frameWindow === void 0 || (_frameWindow$location = frameWindow.location) === null || _frameWindow$location === void 0 ? void 0 : _frameWindow$location.origin) === global.location.origin ? frameWindow : null;
              } catch (_error) {
                return null;
              }
            };
            activeFrameWindow = sameOriginFrameWindow(document.getElementById("module-frame"));
            if (!(typeof (activeFrameWindow === null || activeFrameWindow === void 0 || (_activeFrameWindow$Fu = activeFrameWindow.FuelActions) === null || _activeFrameWindow$Fu === void 0 ? void 0 : _activeFrameWindow$Fu.printRequest) === "function")) {
              _context11.next = 6;
              break;
            }
            return _context11.abrupt("return", {
              actions: activeFrameWindow.FuelActions,
              ownerWindow: activeFrameWindow
            });
          case 6:
            helperFrame = document.getElementById("dept-head-fuel-print-frame");
            if (!helperFrame) {
              helperFrame = document.createElement("iframe");
              helperFrame.id = "dept-head-fuel-print-frame";
              helperFrame.hidden = true;
              helperFrame.setAttribute("aria-hidden", "true");
              helperFrame.src = `${APP_BASE}/pages/modules/fuel/index.html`;
              document.body.appendChild(helperFrame);
            }
            if (!(typeof ((_sameOriginFrameWindo = sameOriginFrameWindow(helperFrame)) === null || _sameOriginFrameWindo === void 0 || (_sameOriginFrameWindo = _sameOriginFrameWindo.FuelActions) === null || _sameOriginFrameWindo === void 0 ? void 0 : _sameOriginFrameWindo.printRequest) !== "function")) {
              _context11.next = 11;
              break;
            }
            _context11.next = 11;
            return new Promise((resolve, reject) => {
              var startedAt = Date.now();
              var checkPrinter = () => {
                var _sameOriginFrameWindo2;
                if (typeof ((_sameOriginFrameWindo2 = sameOriginFrameWindow(helperFrame)) === null || _sameOriginFrameWindo2 === void 0 || (_sameOriginFrameWindo2 = _sameOriginFrameWindo2.FuelActions) === null || _sameOriginFrameWindo2 === void 0 ? void 0 : _sameOriginFrameWindo2.printRequest) === "function") {
                  resolve();
                  return;
                }
                if (Date.now() - startedAt >= 15000) {
                  reject(new Error("Fuel printer did not load."));
                  return;
                }
                global.setTimeout(checkPrinter, 50);
              };
              checkPrinter();
            });
          case 11:
            ownerWindow = sameOriginFrameWindow(helperFrame);
            return _context11.abrupt("return", typeof (ownerWindow === null || ownerWindow === void 0 || (_ownerWindow$FuelActi = ownerWindow.FuelActions) === null || _ownerWindow$FuelActi === void 0 ? void 0 : _ownerWindow$FuelActi.printRequest) === "function" ? {
              actions: ownerWindow.FuelActions,
              ownerWindow
            } : null);
          case 13:
          case "end":
            return _context11.stop();
        }
      }, _callee11);
    }));
    return _resolveFuelPrintActions.apply(this, arguments);
  }
  function printApprovedRequest(_x16, _x17) {
    return _printApprovedRequest.apply(this, arguments);
  }
  function _printApprovedRequest() {
    _printApprovedRequest = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee12(sectionKey, item) {
      var _printWindow, printer, session, fuelEpassNumber, printItem, originalOpen, timeoutId, _document$getElementB, section, id, rows, isEpass, isTravel, logoUrl, recommendedProfile, approverProfile, hasSignatureOnFile, epassPrintChoice, travelPrintChoice, epassCopyCount, travelCopyCount, printWindow, rowHtml, includeSignature, approverSignatureHtml, recommendedSignatureHtml, genericCopyHtml, grantedPeople, showGrantedPositions, grantedPeopleHtml, epassCopyHtml, travelPeople, travelRidersHtml, travelApprovalCol, travelCopyHtml, copyHtml, copiesHtml;
      return _regeneratorRuntime().wrap(function _callee12$(_context12) {
        while (1) switch (_context12.prev = _context12.next) {
          case 0:
            if (!(!item || requestReviewState(sectionKey, item).tone !== "approved")) {
              _context12.next = 2;
              break;
            }
            return _context12.abrupt("return");
          case 2:
            if (!(sectionKey === "fuel")) {
              _context12.next = 34;
              break;
            }
            _printWindow = printFrameWindow();
            _printWindow.document.write("<html><head><title>Preparing Fuel print…</title></head><body style='font-family:sans-serif;padding:24px'>Preparing Fuel print…</body></html>");
            _printWindow.document.close();
            _context12.prev = 6;
            _context12.next = 9;
            return resolveFuelPrintActions();
          case 9:
            printer = _context12.sent;
            if (printer) {
              _context12.next = 12;
              break;
            }
            throw new Error("Fuel page printer is unavailable.");
          case 12:
            session = readSession();
            fuelEpassNumber = getFuelEpassNumber(item);
            printItem = _objectSpread(_objectSpread({}, item), {}, {
              Status: item.Status || item.status || "Approved",
              FuelEpassNumber: fuelEpassNumber,
              TravelNumber: fuelEpassNumber ? "" : item.TravelNumber || item.travel_number || item.to_number || "",
              ApprovedByUserCode: item.ApprovedByUserCode || item.ApprovedBy || item.approved_by_usercode || item.approved_by || session.usercode || "",
              ApprovedByName: item.ApprovedByName || item.approved_by_name || session.name || session.fullname || session.username || "",
              ApprovedByPosition: item.ApprovedByPosition || item.approved_by_position || session.position || ""
            });
            if (!(typeof printer.actions.canPrintRequest === "function" && !printer.actions.canPrintRequest(printItem))) {
              _context12.next = 17;
              break;
            }
            throw new Error("Fuel print is available only after the request is approved.");
          case 17:
            originalOpen = printer.ownerWindow.open;
            printer.ownerWindow.open = () => _printWindow;
            _context12.prev = 19;
            _context12.next = 22;
            return Promise.race([Promise.resolve(printer.actions.printRequest(printItem)), new Promise((_, reject) => {
              timeoutId = global.setTimeout(() => reject(new Error("Fuel print preparation timed out. Please try again.")), 12000);
            })]).finally(() => global.clearTimeout(timeoutId));
          case 22:
            _context12.prev = 22;
            printer.ownerWindow.open = originalOpen;
            return _context12.finish(22);
          case 25:
            if (!/Preparing (?:Fuel )?print/i.test(_printWindow.document.title)) {
              _context12.next = 27;
              break;
            }
            throw new Error("Fuel printer did not finish preparing the document.");
          case 27:
            _context12.next = 33;
            break;
          case 29:
            _context12.prev = 29;
            _context12.t0 = _context12["catch"](6);
            (_document$getElementB = document.getElementById("dept-head-print-frame")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
            global.alert((_context12.t0 === null || _context12.t0 === void 0 ? void 0 : _context12.t0.message) || "Unable to load the Fuel page print design.");
          case 33:
            return _context12.abrupt("return");
          case 34:
            section = sectionMeta(sectionKey);
            id = requestId(sectionKey, item);
            rows = detailRows(sectionKey, item);
            isEpass = sectionKey === "epass";
            isTravel = sectionKey === "travel";
            logoUrl = `${APP_BASE}/assets/images/samelco-3d.png`; // Fetched before the copies dialog so the e-signature toggle only appears when the
            // approver actually has a signature saved in the database.
            // Travel has two signatories (Recommended By = Department Head, Approved By = General
            // Manager); the copies dialog's signature toggle keys off the final (GM) signature.
            if (!(isTravel && item.department_head_usercode)) {
              _context12.next = 46;
              break;
            }
            _context12.next = 43;
            return requestTravelSignatoryProfile(item, "department_head");
          case 43:
            _context12.t1 = _context12.sent;
            _context12.next = 47;
            break;
          case 46:
            _context12.t1 = null;
          case 47:
            recommendedProfile = _context12.t1;
            if (!isTravel) {
              _context12.next = 54;
              break;
            }
            _context12.next = 51;
            return requestTravelSignatoryProfile(item, "general_manager");
          case 51:
            _context12.t2 = _context12.sent;
            _context12.next = 57;
            break;
          case 54:
            _context12.next = 56;
            return requestPrintApproverProfile(sectionKey, item);
          case 56:
            _context12.t2 = _context12.sent;
          case 57:
            approverProfile = _context12.t2;
            hasSignatureOnFile = !!(approverProfile !== null && approverProfile !== void 0 && approverProfile.signatureImage);
            if (!isEpass) {
              _context12.next = 65;
              break;
            }
            _context12.next = 62;
            return chooseEpassPrintCopies(hasSignatureOnFile);
          case 62:
            _context12.t3 = _context12.sent;
            _context12.next = 66;
            break;
          case 65:
            _context12.t3 = null;
          case 66:
            epassPrintChoice = _context12.t3;
            if (!(isEpass && !epassPrintChoice)) {
              _context12.next = 69;
              break;
            }
            return _context12.abrupt("return");
          case 69:
            if (!isTravel) {
              _context12.next = 75;
              break;
            }
            _context12.next = 72;
            return chooseTravelPrintCopies(hasSignatureOnFile);
          case 72:
            _context12.t4 = _context12.sent;
            _context12.next = 76;
            break;
          case 75:
            _context12.t4 = null;
          case 76:
            travelPrintChoice = _context12.t4;
            if (!(isTravel && !travelPrintChoice)) {
              _context12.next = 79;
              break;
            }
            return _context12.abrupt("return");
          case 79:
            epassCopyCount = (epassPrintChoice === null || epassPrintChoice === void 0 ? void 0 : epassPrintChoice.copies) || 1;
            travelCopyCount = (travelPrintChoice === null || travelPrintChoice === void 0 ? void 0 : travelPrintChoice.copies) || 1;
            printWindow = (epassPrintChoice === null || epassPrintChoice === void 0 ? void 0 : epassPrintChoice.printWindow) || (travelPrintChoice === null || travelPrintChoice === void 0 ? void 0 : travelPrintChoice.printWindow) || printFrameWindow();
            rowHtml = rows.map(row => '<section class="field' + (row.wide ? ' field--wide' : '') + '">' + '<small>' + escapeHtml(row.label) + '</small>' + '<strong>' + escapeHtml(Array.isArray(row.value) ? row.value.join(", ") : row.value || "-") + '</strong>' + '</section>').join(""); // Generic (leave/OT) prints have no copies dialog, so they keep showing the signature
            // whenever one is on file; EPASS/Travel respect the dialog's "include e-signature" choice.
            includeSignature = isEpass ? epassPrintChoice.includeSignature : isTravel ? travelPrintChoice.includeSignature : true;
            approverSignatureHtml = hasSignatureOnFile && includeSignature ? '<img class="approved-by__signature" src="' + escapeHtml(approverProfile.signatureImage) + '" alt="">' : '<span class="approved-by__signature" aria-hidden="true"></span>';
            recommendedSignatureHtml = recommendedProfile !== null && recommendedProfile !== void 0 && recommendedProfile.signatureImage && includeSignature ? '<img class="travel-sign__signature" src="' + escapeHtml(recommendedProfile.signatureImage) + '" alt="">' : '<span class="travel-sign__signature" aria-hidden="true"></span>';
            genericCopyHtml = '<article class="copy"><header class="head">' + '<img class="logo" src="' + escapeHtml(logoUrl) + '" alt="SAMELCII logo">' + '<div class="title"><p class="eyebrow">Department Head Approval Desk</p><h1>' + escapeHtml(section.label + " Request") + '</h1><p>Request No. <strong>' + escapeHtml(id || "-") + '</strong></p></div>' + '<span class="approved">APPROVED</span></header><div class="grid">' + rowHtml + '</div><section class="generic-approved-by">' + approverSignatureHtml + '<small>APPROVED BY</small><b>' + escapeHtml(String((approverProfile === null || approverProfile === void 0 ? void 0 : approverProfile.name) || "Department Head").toUpperCase()) + '</b><em>' + escapeHtml(String((approverProfile === null || approverProfile === void 0 ? void 0 : approverProfile.position) || "Department Head").toUpperCase()) + '</em></section><footer class="foot">Printed ' + escapeHtml(new Date().toLocaleString()) + '</footer></article>';
            if (!isEpass) {
              _context12.next = 93;
              break;
            }
            _context12.next = 90;
            return requestEpassPeopleWithPositions(item);
          case 90:
            _context12.t5 = _context12.sent;
            _context12.next = 94;
            break;
          case 93:
            _context12.t5 = [];
          case 94:
            grantedPeople = _context12.t5;
            // Photos only fit cleanly in the roomier <=4-rider layout; the dense many-rider grid stays text-only.
            showGrantedPositions = grantedPeople.length <= 4; // [EDIT] No avatar circle at all by request — just the name/position text.
            grantedPeopleHtml = grantedPeople.length ? grantedPeople.map(person => '<div class="granted-person"><span class="granted-person__text"><b>' + escapeHtml(String(person.name || "").toUpperCase()) + '</b>' + (showGrantedPositions ? '<small>' + escapeHtml(person.position || "Position not recorded") + '</small>' : '') + '</span></div>').join("") : '<div class="granted-person"><span class="granted-person__text"><b>No employee listed</b><small>Position not recorded</small></span></div>';
            epassCopyHtml = '<article class="copy epass-copy"><header class="epass-head">' + '<img class="epass-logo" src="' + escapeHtml(logoUrl) + '" alt="SAMELCII logo">' + '<div class="epass-org"><strong>SAMAR II ELECTRIC COOPERATIVE, INC.</strong><span>Paranas, Samar</span><h1>EMPLOYEES PASS</h1></div>' + '<div class="epass-number"><small>EPASS NO.</small><b>' + escapeHtml(item.epassnumber || id || "-") + '</b><span>APPROVED</span></div>' + '</header><section class="epass-facts">' + '<div><small>DATE</small><strong>' + escapeHtml(requestDate(sectionKey, item) || "-") + '</strong></div>' + '<div><small>DEPARTMENT</small><strong>' + escapeHtml(item.department || "-") + '</strong></div>' + '<div><small>DESTINATION</small><strong>' + escapeHtml(item.destination || "-") + '</strong></div>' + '</section><section class="epass-purpose"><small>PURPOSE</small><strong>' + escapeHtml(item.purpose || "-") + '</strong></section>' + '<section class="granted-section"><div class="granted-head"><strong>GRANTED TO</strong><span>' + grantedPeople.length + ' employee' + (grantedPeople.length === 1 ? '' : 's') + '</span></div><div class="granted-grid' + (grantedPeople.length <= 4 ? ' granted-grid--few' : '') + '">' + grantedPeopleHtml + '</div></section><section class="approved-by">' + approverSignatureHtml + '<small>APPROVED BY</small><b>' + escapeHtml(String((approverProfile === null || approverProfile === void 0 ? void 0 : approverProfile.name) || item.approver_name || item.approved_by || "Department Head").toUpperCase()) + '</b><em>' + escapeHtml(String((approverProfile === null || approverProfile === void 0 ? void 0 : approverProfile.position) || "Department Head").toUpperCase()) + '</em></section>' + '<footer class="foot">Printed ' + escapeHtml(new Date().toLocaleString()) + '</footer></article>'; // [DESIGN] Quarter-page card, 2x2 per sheet — matching EPASS's print layout exactly
            // (same .copy/.epass-head/.epass-facts/.granted-section structure) instead of the
            // full-page memorandum, per explicit request to keep Travel's print compact like EPASS.
            travelPeople = isTravel ? requestEpassPeople(item) : [];
            travelRidersHtml = (travelPeople.length ? travelPeople : ["No employees listed"]).map(name => '<div class="granted-person"><span class="granted-person__text"><b>' + escapeHtml(name.toUpperCase()) + '</b></span></div>').join(""); // [FIX] Proper signature-block convention: label, then a blank line reserved for the
            // physical signature, then the printed NAME sitting on that line, then position below —
            // left-aligned, no colored background. The previous compact version (right-aligned, pink
            // tint, no signing line) wasn't how a real signature block is laid out.
            travelApprovalCol = (label, profile, fallbackLabel) => '<div class="travel-approvals__col">' + '<small>' + escapeHtml(label) + '</small>' + '<b>' + escapeHtml(String((profile === null || profile === void 0 ? void 0 : profile.name) || fallbackLabel).toUpperCase()) + '</b>' + '<em>' + escapeHtml(String((profile === null || profile === void 0 ? void 0 : profile.position) || fallbackLabel).toUpperCase()) + '</em>' + '</div>';
            travelCopyHtml = '<article class="copy travel-copy"><header class="epass-head">' + '<img class="epass-logo" src="' + escapeHtml(logoUrl) + '" alt="SAMELCII logo">' + '<div class="epass-org"><strong>SAMAR II ELECTRIC COOPERATIVE, INC.</strong><span>Paranas, Samar</span><h1>TRAVEL ORDER</h1></div>' + '<div class="epass-number"><small>ORDER NO.</small><b>' + escapeHtml(item.to_number || id || "-") + '</b><span>APPROVED</span></div>' + '</header><section class="epass-facts">' + '<div><small>DATE</small><strong>' + escapeHtml(requestDate(sectionKey, item) || "-") + '</strong></div>' + '<div><small>DEPARTMENT</small><strong>' + escapeHtml(item.department || "-") + '</strong></div>' + '<div><small>DESTINATION</small><strong>' + escapeHtml(item.destination || "-") + '</strong></div>' + '</section><section class="epass-purpose"><small>PURPOSE</small><strong>' + escapeHtml(item.purpose || "-") + '</strong></section>' + '<p class="travel-terms">All expenses to be incurred in connection with your official travel shall be charged against the proper funds of this cooperative subject to the usual accounting and auditing regulations.</p>' + '<section class="granted-section"><div class="granted-head"><strong>TRAVELLING EMPLOYEE' + (travelPeople.length === 1 ? "" : "S") + '</strong><span>' + (travelPeople.length || 1) + ' employee' + (travelPeople.length === 1 ? '' : 's') + '</span></div><div class="granted-grid granted-grid--few">' + travelRidersHtml + '</div></section>'
            // [FEATURE] A department head traveling can't recommend their own trip — no
            // department_head_usercode was ever assigned for this request (see travelService.js
            // createTravel), so skip that signature column entirely instead of printing a blank one.
            + '<section class="travel-approvals' + (item.department_head_usercode ? '' : ' travel-approvals--single') + '">' + (item.department_head_usercode ? travelApprovalCol("RECOMMENDED BY", recommendedProfile, "Department Head") : '') + travelApprovalCol("APPROVED BY", approverProfile, "General Manager") + '</section>' + '<footer class="foot">Printed ' + escapeHtml(new Date().toLocaleString()) + '</footer></article>';
            copyHtml = isEpass ? epassCopyHtml : isTravel ? travelCopyHtml : genericCopyHtml;
            copiesHtml = isEpass ? copyHtml.repeat(epassCopyCount) : isTravel ? copyHtml.repeat(travelCopyCount) : copyHtml;
            printWindow.document.write('<!doctype html><html><head><meta charset="utf-8">' + '<title>' + escapeHtml(section.label + " " + id) + '</title>' + '<style>' + '@page{size:A4 portrait;margin:.25in}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}body{margin:0;padding:10mm;font-family:Arial,sans-serif;color:#1f2937;background:#e5e7eb}' + '.page{max-width:197.3mm;margin:auto;background:#fff}.page--epass{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));align-content:start;gap:4mm;width:197.3mm;height:284.3mm}.page--count-1 .epass-copy:first-child,.page--count-3 .epass-copy:last-child{grid-column:1/-1;justify-self:center;width:calc((100% - 4mm)/2)}' + '.copy{position:relative;min-width:0;overflow:hidden;padding:4.5mm;border:1px solid #d1d5db;border-top:3px solid #b91c1c;border-radius:2.5mm;background:linear-gradient(180deg,#fff 0%,#fff 76%,#fffaf0 100%)}.copy:after{content:"";position:absolute;right:0;top:0;width:18mm;height:3px;background:#fbbf24}.page:not(.page--epass):not(.page--travel) .copy{padding:10mm;border-radius:0}' + '.head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:2.5mm;padding-bottom:3mm;border-bottom:1px solid #e5e7eb}.logo{width:10.5mm;height:13mm;object-fit:contain}' + '.title{min-width:0}.title p{margin:1mm 0 0;color:#4b5563;font-size:7px}.eyebrow{margin:0!important;color:#9f1239!important;font-size:6px!important;font-weight:900;letter-spacing:.1em;text-transform:uppercase}' + 'h1{margin:.6mm 0 0;color:#111827;font-size:13px;line-height:1.05}.approved{padding:1.5mm 2mm;border:1px solid #86efac;border-radius:999px;background:#f0fdf4;color:#15803d;font-size:6px;font-weight:900;letter-spacing:.04em}' + '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2mm 3mm;margin-top:2.5mm}.field{display:grid;align-content:start;gap:.65mm;min-width:0;padding:1mm 0;border:0;border-radius:0;background:transparent}.field--wide{grid-column:1/-1}' + '.field small{color:#9f1239;font-size:5.7px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.field strong{overflow-wrap:anywhere;color:#111827;font-size:7.3px;line-height:1.22;white-space:pre-wrap}' + '.generic-approved-by{display:grid;justify-items:end;gap:.5mm;margin-top:auto;padding-top:3mm}.generic-approved-by small{color:#9f1239;font-size:8px;font-weight:900;letter-spacing:.05em}.generic-approved-by b{font-size:11px;text-align:right}.generic-approved-by em{color:#4b5563;font-size:8px;font-weight:800;font-style:normal;text-align:right}' + '.foot{margin-top:2.3mm;padding-top:1.3mm;border-top:1px solid #e5e7eb;color:#6b7280;font-size:5.2px;text-align:right}' + '.epass-copy{display:flex;flex-direction:column;padding:4.5mm}.epass-head{display:grid;grid-template-columns:12mm minmax(0,1fr) auto;align-items:start;gap:2.4mm;padding-bottom:2.5mm;border-bottom:1.5px solid #b91c1c}.epass-logo{width:11mm;height:15mm;object-fit:contain}.epass-org{display:grid;gap:.3mm;text-align:center}.epass-org>strong{font-size:11.5px;line-height:1.08}.epass-org>span{font-size:9px;font-weight:700}.epass-org h1{margin:.65mm 0 0;color:#991b1b;font-size:17px;letter-spacing:.025em}.epass-number{display:grid;justify-items:end;gap:.45mm}.epass-number small{color:#6b7280;font-size:8px;font-weight:900}.epass-number b{font-size:10px}.epass-number span{padding:.9mm 1.4mm;border-radius:999px;background:#dcfce7;color:#166534;font-size:7.5px;font-weight:900}' + '.epass-facts{display:grid;grid-template-columns:.75fr 1.1fr 1.15fr;gap:2mm;padding:2.5mm 0;border-bottom:1px solid #e5e7eb}.epass-facts>div,.epass-purpose{display:grid;align-content:start;gap:.55mm;min-width:0}.epass-facts small,.epass-purpose small{color:#9f1239;font-size:8.3px;font-weight:900;letter-spacing:.04em}.epass-facts strong,.epass-purpose strong{overflow-wrap:anywhere;font-size:10.5px;line-height:1.2}.epass-purpose{min-height:13mm;padding:2.1mm 0 2.4mm;border-bottom:1px solid #e5e7eb}' + '.granted-section{display:grid;align-content:start;gap:1.4mm;padding-top:2mm}.granted-head{display:flex;align-items:center;justify-content:space-between;gap:2mm;color:#991b1b}.granted-head strong{font-size:8.5px;letter-spacing:.04em}.granted-head span{font-size:7.6px;font-weight:800}.granted-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:5.6mm;gap:.55mm 2.4mm}.granted-grid--few{grid-template-columns:1fr;grid-auto-rows:minmax(14mm,auto);gap:1.5mm}.granted-person{display:flex;align-items:center;gap:1.6mm;min-width:0;padding:.4mm 0;border:0;background:transparent}.granted-grid--few .granted-person{padding:1.2mm 0}.granted-person__avatar{flex:none;display:grid;place-items:center;width:9mm;height:9mm;border-radius:50%;overflow:hidden;background:#fee2e2;color:#991b1b;font:800 7px/1 Arial,sans-serif;text-transform:uppercase}.granted-person__avatar.has-photo{background:#e5e7eb}.granted-person__avatar img{width:100%;height:100%;object-fit:cover}.granted-person__text{display:grid;align-content:center;gap:.2mm;min-width:0}.granted-person b{overflow:hidden;font-size:9px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}.granted-person small{overflow:hidden;color:#4b5563;font-size:6.8px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}' + '.approved-by{display:flex;flex-direction:column;gap:.4mm;margin-top:auto;padding-top:1mm}.approved-by__signature{display:block;width:42mm;height:7mm;object-fit:contain;margin:0 auto}.approved-by small{display:block;text-align:left;color:#9f1239;font-size:7.2px;font-weight:900;letter-spacing:.045em}.approved-by b{display:block;text-align:center;font-size:9px;text-transform:uppercase}.approved-by em{display:block;text-align:center;color:#4b5563;font-size:6.8px;font-weight:800;font-style:normal;text-transform:uppercase}.epass-copy .foot{margin-top:1.1mm;padding-top:.7mm;font-size:7px}' + '.page:not(.page--epass) h1{font-size:24px}.page:not(.page--epass) .logo{width:18mm;height:22mm}.page:not(.page--epass) .field strong{font-size:12px}.page:not(.page--epass) .field small{font-size:9px}' + '.page--travel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));align-content:start;gap:4mm;width:197.3mm;height:284.3mm}.page--travel-count-1 .travel-copy:first-child,.page--travel-count-3 .travel-copy:last-child{grid-column:1/-1;justify-self:center;width:calc((100% - 4mm)/2)}' + '.travel-copy{display:flex;flex-direction:column;padding:4.5mm}' + '.travel-approvals{display:flex;justify-content:space-between;gap:3mm;margin-top:auto;padding-top:1mm}' + '.travel-approvals--single{justify-content:center}' + '.travel-approvals--single .travel-approvals__col{flex:0 0 auto;min-width:32mm}' + '.travel-approvals__col{display:flex;flex-direction:column;gap:.3mm;flex:1;min-width:0}' + '.travel-approvals__col small{display:block;text-align:left;color:#9f1239;font-size:6.4px;font-weight:900;letter-spacing:.04em;margin-bottom:8mm}' + '.travel-approvals__col b{display:block;text-align:center;font-size:8px;text-transform:uppercase;margin-top:.8mm}' + '.travel-approvals__col em{display:block;text-align:center;color:#4b5563;font-size:6.4px;font-weight:700;font-style:normal;text-transform:uppercase}' + '.travel-terms{margin:1.2mm 0 0;color:#111827;font-size:8px;line-height:1.4;text-align:justify}' + '@media print{html,body{width:100%;margin:0;padding:0;background:#fff}.page{max-width:none;margin:0}.page--epass,.page--travel{position:absolute;top:0;left:0;width:100%!important;max-width:none!important;height:calc(297mm - .5in);margin:0!important}.copy{break-inside:avoid;page-break-inside:avoid}}' + '</style></head><body><main class="page' + (isEpass ? ' page--epass page--count-' + epassCopyCount : '') + (isTravel ? ' page--travel page--travel-count-' + travelCopyCount : '') + '">' + copiesHtml + '</main><script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});<\/script></body></html>');
            printWindow.document.close();
          case 106:
          case "end":
            return _context12.stop();
        }
      }, _callee12, null, [[6, 29], [19,, 22, 25]]);
    }));
    return _printApprovedRequest.apply(this, arguments);
  }
  function ensureSelection() {
    var _state$selected;
    var items = sortByQueueOrder(state.activeSection, filteredQueueItems(state.activeSection));
    if (!items.length) {
      state.selected = null;
      return;
    }
    if (((_state$selected = state.selected) === null || _state$selected === void 0 ? void 0 : _state$selected.section) === state.activeSection) {
      var stillExists = items.some(row => requestId(state.activeSection, row) === state.selected.id);
      if (stillExists) {
        return;
      }
    }
    var first = items[0];
    state.selected = {
      section: state.activeSection,
      id: requestId(state.activeSection, first)
    };
  }
  function renderTabs() {
    var _root11;
    var tabs = (_root11 = root) === null || _root11 === void 0 ? void 0 : _root11.querySelector(".dept-head-approval-tabs");
    if (!tabs) {
      return;
    }
    tabs.innerHTML = SECTIONS.map(section => {
      var count = sectionPendingCount(section.key);
      return '<button type="button" class="dept-head-approval-tab' + (state.activeSection === section.key ? " is-active" : "") + '" data-section="' + section.key + '">' + '<span><i class="fa ' + section.icon + '" aria-hidden="true"></i> ' + escapeHtml(section.label) + "</span>" + '<span class="dept-head-approval-tab__count' + (count ? " has-pending" : "") + '">' + count + "</span>" + "</button>";
    }).join("");
  }
  function requestAssignedArea(item) {
    var area = String((item === null || item === void 0 ? void 0 : item.Area) || (item === null || item === void 0 ? void 0 : item.EmployeeArea) || (item === null || item === void 0 ? void 0 : item.area) || (item === null || item === void 0 ? void 0 : item.requester_area) || (item === null || item === void 0 ? void 0 : item.assigned_area) || "").trim();
    return area ? area.toUpperCase() : "Unassigned Area";
  }
  function currentLeaveStage(item) {
    var _ref10, _item$dp_approved, _ref11, _item$hr_approved, _ref12, _item$approved_by;
    var dept = String((_ref10 = (_item$dp_approved = item === null || item === void 0 ? void 0 : item.dp_approved) !== null && _item$dp_approved !== void 0 ? _item$dp_approved : item === null || item === void 0 ? void 0 : item.DP_approved) !== null && _ref10 !== void 0 ? _ref10 : "").trim();
    var admin = String((_ref11 = (_item$hr_approved = item === null || item === void 0 ? void 0 : item.hr_approved) !== null && _item$hr_approved !== void 0 ? _item$hr_approved : item === null || item === void 0 ? void 0 : item.HR_approved) !== null && _ref11 !== void 0 ? _ref11 : "").trim();
    var status = String((_ref12 = (_item$approved_by = item === null || item === void 0 ? void 0 : item.approved_by) !== null && _item$approved_by !== void 0 ? _item$approved_by : item === null || item === void 0 ? void 0 : item.Status) !== null && _ref12 !== void 0 ? _ref12 : "").trim().toUpperCase();
    if (dept === "3" || admin === "3" || status === "REJECTED" || status === "APPROVED") {
      return "";
    }
    if (!dept || dept === "0") return "department_head";
    if (dept === "1" && (!admin || admin === "0")) return "administrative_chief";
    if (dept === "1" && admin === "1") return "general_manager";
    return "";
  }
  function leaveApprovalStageIsReady(item) {
    var session = readSession();
    var usercode = String((session === null || session === void 0 ? void 0 : session.usercode) || "").trim().toUpperCase();
    var stage = currentLeaveStage(item);
    return Boolean(stage && usercode && (Array.isArray(item === null || item === void 0 ? void 0 : item.approval_route) ? item.approval_route : []).some(person => String((person === null || person === void 0 ? void 0 : person.stage) || "").trim() === stage && String((person === null || person === void 0 ? void 0 : person.usercode) || "").trim().toUpperCase() === usercode));
  }

  // [FIX] Travel is multi-stage (department_head -> general_manager); traveltb.to_approved always
  // holds the usercode currently responsible (see travelService.assignRequestApprover/approveTravel).
  // Without this check, a Department Head still saw Approve/Reject as active after their own stage
  // was done and the request moved on to the GM, and clicking it 403'd server-side.
  function travelApprovalStageIsReady(item) {
    var session = readSession();
    var usercode = String((session === null || session === void 0 ? void 0 : session.usercode) || "").trim().toUpperCase();
    var responsible = String((item === null || item === void 0 ? void 0 : item.to_approved) || "").trim().toUpperCase();
    return Boolean(usercode && responsible && usercode === responsible);
  }
  function renderLeaveApprovalRoute(item) {
    var route = Array.isArray(item === null || item === void 0 ? void 0 : item.approval_route) ? item.approval_route : [];
    if (!route.length) {
      return '<span class="dept-head-fuel-profile__people-empty">No approval route configured.</span>';
    }
    var activeStage = currentLeaveStage(item);
    return route.map(person => {
      var status = (person === null || person === void 0 ? void 0 : person.approval_status) || {};
      var tone = String(status.tone || (person.stage === activeStage ? "pending" : "waiting")).trim();
      var label = String(status.label || (person.stage === activeStage ? "Pending" : "Waiting")).trim();
      var photo = resolvePhotoUrl(person.profile_photo_url || person.photo_url || "");
      var initials = String(person.name || person.usercode || "?").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
      var stageLabel = person.stage_label || person.stage || "Approver";
      var tooltip = [stageLabel, person.name || person.usercode || "Unassigned", label].filter(Boolean).join(" — ");
      return '<article class="leave-approval-route-card leave-approval-route-card--' + escapeHtml(tone) + '" title="' + escapeHtml(tooltip) + '">' + '<span class="leave-approval-route-card__avatar' + (photo ? ' has-photo' : '') + '">' + (photo ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(tooltip) + '" loading="lazy" decoding="async" fetchpriority="low" />' : '') + '<b>' + escapeHtml(initials || "?") + '</b>' + (tone === "approved" ? '<i class="leave-approval-route-card__check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 11.5L13 4.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></i>' : '') + '</span>' + '<small class="leave-approval-route-card__name">' + escapeHtml(person.name || person.usercode || "Unassigned") + '</small>' + '</article>';
    }).join("");
  }
  function groupQueueItemsByArea(items) {
    var groups = new Map();
    items.forEach(item => {
      var area = requestAssignedArea(item);
      if (!groups.has(area)) {
        groups.set(area, []);
      }
      groups.get(area).push(item);
    });
    return Array.from(groups, ([area, areaItems]) => ({
      area,
      items: areaItems.slice().sort((left, right) => {
        var leftName = requestCardLabel(state.activeSection, left) || requestRequester(state.activeSection, left) || requestId(state.activeSection, left);
        var rightName = requestCardLabel(state.activeSection, right) || requestRequester(state.activeSection, right) || requestId(state.activeSection, right);
        return String(leftName).localeCompare(String(rightName), undefined, {
          sensitivity: "base",
          numeric: true
        });
      })
    })).sort((left, right) => {
      var leftPinned = state.pinnedAreas.has(areaStateKey(left.area));
      var rightPinned = state.pinnedAreas.has(areaStateKey(right.area));
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      if (left.area === "Unassigned Area") return 1;
      if (right.area === "Unassigned Area") return -1;
      return left.area.localeCompare(right.area, undefined, {
        sensitivity: "base"
      });
    });
  }
  function areaStateKey(area) {
    return normalizeText(area) || "unassigned-area";
  }
  function areaExpansionKey(areaKey) {
    return `${state.activeSection}::${areaKey}`;
  }
  function savePinnedAreaKeys() {
    try {
      global.localStorage.setItem(AREA_PIN_KEY, JSON.stringify(Array.from(state.pinnedAreas)));
    } catch (_error) {
      // ponytail: pinning still works for this session when browser storage is unavailable.
    }
  }
  function renderList() {
    var _root12;
    var list = (_root12 = root) === null || _root12 === void 0 ? void 0 : _root12.querySelector(".dept-head-approval-list");
    if (!list) {
      return;
    }
    var items = sortByQueueOrder(state.activeSection, filteredQueueItems(state.activeSection));
    var section = sectionMeta(state.activeSection);
    if (!items.length) {
      var queueError = String(state.queueErrors[state.activeSection] || "").trim();
      if (queueError) {
        list.innerHTML = '<div class="dept-head-approval-empty">Unable to load ' + escapeHtml(section.label) + ' requests.<br><small>' + escapeHtml(queueError) + '</small></div>';
        return;
      }
      var emptyText = state.searchTerm ? "No matching " : "No pending ";
      list.innerHTML = '<div class="dept-head-approval-empty">' + emptyText + escapeHtml(section.label) + (state.searchTerm ? " requests.<br>Clear the search to see all items." : " requests.<br>Select another section on the left.") + '</div>';
      return;
    }
    var renderItem = item => {
      var _state$selected2, _state$selected3;
      var id = requestId(state.activeSection, item);
      var selected = ((_state$selected2 = state.selected) === null || _state$selected2 === void 0 ? void 0 : _state$selected2.section) === state.activeSection && ((_state$selected3 = state.selected) === null || _state$selected3 === void 0 ? void 0 : _state$selected3.id) === id;
      var review = requestReviewState(state.activeSection, item);
      var avatarPhotoUrl = requestAvatarPhotoUrl(state.activeSection, item);
      var isFuel = state.activeSection === "fuel";
      var isEpass = state.activeSection === "epass";
      var printControl = review.tone === "approved" ? '<span class="dept-head-approval-icon-btn" role="button" tabindex="0" data-print-request title="Print approved request" aria-label="Print approved request" style="display:grid;width:30px;height:30px;place-items:center;flex:0 0 30px;border:1px solid #86efac;border-radius:9px;background:#f0fdf4;color:#15803d;"><i class="fa fa-print" aria-hidden="true"></i></span>' : '';
      return '<button type="button" class="dept-head-approval-list-item' + " dept-head-approval-list-item--profile" + (isFuel ? " dept-head-approval-list-item--fuel" : "") + (isEpass ? " dept-head-approval-list-item--epass" : "") + (selected ? " is-selected" : "")
      // Kulay ayon sa estado (pending/approved/rejected) — tingnan ang .is-tone--* sa CSS.
      + " is-tone--" + escapeHtml(review.tone) + (review.tone !== "pending" ? " is-reviewed is-reviewed--" + review.tone : "") + '" data-section="' + escapeHtml(state.activeSection) + '" data-id="' + escapeHtml(id) + '">' + '<div class="dept-head-approval-list-item__avatar' + (avatarPhotoUrl ? ' has-photo' : ' has-fallback') + '" aria-hidden="true">' + (avatarPhotoUrl ? '<img class="dept-head-approval-list-item__avatar-image" src="' + escapeHtml(avatarPhotoUrl) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" />' : '') + '<span class="dept-head-approval-list-item__avatar-text">' + escapeHtml(requestAvatarLabel(state.activeSection, item)) + '</span>' + '<span class="dept-head-approval-list-item__count-badge" aria-hidden="true">' + escapeHtml(requestCardCountValue(state.activeSection, item)) + '</span>' + '</div>' + '<div class="dept-head-approval-list-item__profile-copy">' + '<div class="dept-head-approval-list-item__top">' + '<span class="dept-head-approval-list-item__date">' + escapeHtml(requestDate(state.activeSection, item) || "-") + "</span>" + "<strong>" + escapeHtml(requestCardLabel(state.activeSection, item) || requestId(state.activeSection, item) || "-") + "</strong>" + "</div>" + '<div class="dept-head-approval-list-item__meta">' + escapeHtml(isEpass ? requestShortMeta(state.activeSection, item) || "Tap to view details" : requestShortMeta(state.activeSection, item) || "Tap to view full details") + '</div>' + '</div>' + '<div style="display:flex;align-items:center;justify-self:end;align-self:end;gap:6px;">' + '<div class="dept-head-approval-list-item__status dept-head-approval-list-item__status--' + escapeHtml(review.tone) + '"><i class="fa ' + escapeHtml(review.icon) + '" aria-hidden="true"></i> ' + escapeHtml(review.label) + '</div>' + printControl + '</div>' + "</button>";
    };

    // ponytail: background polling (every 15s) called renderHub() -> renderList(), and
    // reassigning innerHTML resets scrollTop to 0 — losing your place mid-review on every
    // poll. Save/restore it across the rebuild since there's no cheap way to diff-patch
    // this string-built list.
    var preservedScrollTop = list.scrollTop;
    list.innerHTML = groupQueueItemsByArea(items).map(group => {
      var areaKey = areaStateKey(group.area);
      var pinned = state.pinnedAreas.has(areaKey);
      var open = pinned || state.expandedAreas.has(areaExpansionKey(areaKey));
      return '<section class="dept-head-approval-area-group' + (open ? ' is-open' : '') + (pinned ? ' is-pinned' : '') + '">' + '<div class="dept-head-approval-area-group__head">' + '<button type="button" class="dept-head-approval-area-group__toggle" data-area-toggle data-area-key="' + escapeHtml(areaKey) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + '<span class="dept-head-approval-area-group__pin"><i class="fa fa-map-marker" aria-hidden="true"></i></span>' + '<strong>' + escapeHtml(group.area) + '</strong>' + '<span class="dept-head-approval-area-group__count" aria-label="' + group.items.length + ' request' + (group.items.length === 1 ? '' : 's') + '" title="' + group.items.length + ' request' + (group.items.length === 1 ? '' : 's') + '">' + group.items.length + '</span>' + '<i class="fa fa-chevron-down dept-head-approval-area-group__chevron" aria-hidden="true"></i>' + '</button>' + '<button type="button" class="dept-head-approval-area-group__pin-btn' + (pinned ? ' is-active' : '') + '" data-area-pin data-area-key="' + escapeHtml(areaKey) + '" aria-pressed="' + (pinned ? 'true' : 'false') + '" title="' + (pinned ? 'Unpin this Area' : 'Pin this Area open') + '">' + '<i class="fa fa-thumb-tack" aria-hidden="true"></i><span class="sr-only">' + (pinned ? 'Unpin' : 'Pin') + ' ' + escapeHtml(group.area) + '</span>' + '</button>' + '</div>' + '<div class="dept-head-approval-area-group__items"' + (open ? '' : ' hidden') + '>' + group.items.map(renderItem).join("") + '</div>' + '</section>';
    }).join("");
    list.scrollTop = preservedScrollTop;
  }
  function renderDetail() {
    var _root13;
    var detail = (_root13 = root) === null || _root13 === void 0 ? void 0 : _root13.querySelector(".dept-head-approval-detail");
    if (!detail) {
      return;
    }
    // Itigil ang mga lumang marquee loop bago palitan ang laman (iwas naka-detach na rAF).
    stopAllRiderMarquees();
    if (!state.selected) {
      detail.className = "dept-head-approval-detail";
      detail.innerHTML = '<div class="dept-head-approval-detail__placeholder">' + '<i class="fa fa-hand-pointer-o" aria-hidden="true"></i>' + "<strong>Select a request</strong>" + "<span>Choose an item on the left to view all details and approve or reject.</span>" + "</div>";
      return;
    }
    var sectionKey = state.selected.section;
    var id = state.selected.id;
    var item = findItem(sectionKey, id);
    var section = sectionMeta(sectionKey);
    if (!item) {
      detail.className = "dept-head-approval-detail";
      detail.innerHTML = '<div class="dept-head-approval-detail__placeholder">' + "<strong>Request not found</strong>" + "<span>Refresh the queue and try again.</span>" + "</div>";
      return;
    }
    var review = requestReviewState(sectionKey, item);
    // [UI] Fuel detail panel gets a richer layout hook so the main request facts read like a premium summary card.
    // Lahat ng seksyon ay gumagamit na ng profile layout, kaya laging kasama ang `--fuel`
    // (dito nakatali ang mga CSS variable at grid ng disenyong iyon).
    // [FIX] Travel gets its own accent modifier (red, matching the printed Travel Order) on
    // top of the shared `--fuel` layout class — same per-module CSS-variable pattern already
    // used for Fuel's blue, just pointed at a different color for this one section.
    var detailClass = "dept-head-approval-detail dept-head-approval-detail--fuel" + (sectionKey === "travel" ? " dept-head-approval-detail--travel-accent" : "");
    var detailBodyClass = sectionKey === "fuel" ? "dept-head-approval-detail__body dept-head-approval-detail__body--fuel" : "dept-head-approval-detail__body";
    var detailActionsClass = sectionKey === "fuel" ? "dept-head-approval-detail__actions dept-head-approval-detail__actions--fuel" : "dept-head-approval-detail__actions";
    var detailSubtitle = sectionKey === "epass" ? [requestEpassCountLabel(item), item.department, item.destination].filter(Boolean).join(" | ") : requestRequester(sectionKey, item) || "No requester listed";
    var requesterPhoto = requestAvatarPhotoUrl(sectionKey, item);
    var requesterName = String(item.requester_name || item.EmployeeName || detailSubtitle || "Employee").trim();
    var requesterCode = String(item.usercode || item.UserCode || "").trim();
    var requesterDepartment = [item.EmployeeDeptAbbr, item.EmployeeDepartmentName || item.department].filter(Boolean).join(" | ");
    var requesterPosition = String(item.EmployeePosition || item.position || "Employee").trim();
    var requesterArea = String(item.Area || item.area || "Not provided").trim();
    var fuelRequesterButton = sectionKey === "fuel" ? '<button type="button" class="dept-head-approval-detail__requester" data-requester-profile aria-expanded="false">' + '<span class="dept-head-approval-detail__requester-avatar' + (requesterPhoto ? ' has-photo' : '') + '">' + (requesterPhoto ? '<img src="' + escapeHtml(requesterPhoto) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" />' : '') + '<span>' + escapeHtml(requestAvatarLabel(sectionKey, item)) + '</span>' + '</span>' + '<span class="dept-head-approval-detail__requester-copy"><strong>' + escapeHtml(requesterName) + '</strong><small>' + escapeHtml([requesterCode, requesterPosition].filter(Boolean).join(" · ")) + '</small><em>' + escapeHtml([requesterDepartment, requesterArea].filter(Boolean).join(" · ")) + '</em></span>' + '<span class="dept-head-approval-detail__requester-hint">View profile <i class="fa fa-chevron-right" aria-hidden="true"></i></span>' + '</button>' : '<span>' + escapeHtml(detailSubtitle) + '</span>';
    var fuelRequesterProfile = sectionKey === "fuel" ? '<aside class="dept-head-approval-requester-profile" data-requester-profile-panel hidden aria-label="Requester profile">' + '<button type="button" class="dept-head-approval-requester-profile__close" data-requester-profile-close aria-label="Close requester profile"><i class="fa fa-times" aria-hidden="true"></i></button>' + '<div class="dept-head-approval-requester-profile__hero">' + '<div class="dept-head-approval-requester-profile__avatar' + (requesterPhoto ? ' has-photo' : '') + '">' + (requesterPhoto ? '<img src="' + escapeHtml(requesterPhoto) + '" alt="Profile photo of ' + escapeHtml(requesterName) + '" loading="lazy" decoding="async" fetchpriority="low" />' : '') + '<span>' + escapeHtml(requestAvatarLabel(sectionKey, item)) + '</span>' + '</div>' + '<div class="dept-head-approval-requester-profile__identity">' + '<small>Employee requester</small>' + '<strong>' + escapeHtml(requesterName) + '</strong>' + '<span>' + escapeHtml(requesterPosition) + '</span>' + '<div class="dept-head-approval-requester-profile__chips">' + '<em><i class="fa fa-id-badge" aria-hidden="true"></i> ' + escapeHtml(requesterCode || "No employee number") + '</em>' + '<em><i class="fa fa-map-marker" aria-hidden="true"></i> ' + escapeHtml(requesterArea) + '</em>' + '</div>' + '</div>' + '<div class="dept-head-approval-requester-profile__owner"><i class="fa fa-user-circle" aria-hidden="true"></i><strong>Request owner</strong><span>' + escapeHtml(review.label) + '</span></div>' + '</div>' + '<div class="dept-head-approval-requester-profile__tabs"><span class="is-active">Profile summary</span><span>Current ' + escapeHtml(section.label) + ' request</span></div>' + '<dl class="dept-head-approval-requester-profile__facts">' + '<div><dt>Position</dt><dd>' + escapeHtml(requesterPosition) + '</dd></div>' + '<div><dt>Department</dt><dd>' + escapeHtml(requesterDepartment || "Not provided") + '</dd></div>' + '<div><dt>Request number</dt><dd>' + escapeHtml(requestTitle(sectionKey, item) || id || "-") + '</dd></div>' + '<div><dt>Request date</dt><dd>' + escapeHtml(requestDate(sectionKey, item) || "-") + '</dd></div>' + '</dl>' + '</aside>' : '';
    detail.className = detailClass;
    var rows = detailRows(sectionKey, item);
    var rowsByLabel = new Map(rows.map(row => [row.label, row]));
    var formatDetailRow = row => {
      if (!row) {
        return "";
      }
      if (row.kind === "people") {
        return '<div class="dept-head-approval-detail__row dept-head-approval-detail__row--wide dept-head-approval-detail__row--people">' + "<span>" + escapeHtml(row.label) + "</span>" + '<div class="dept-head-approval-detail__people">' + renderPeopleChips(row.value) + "</div>" + "</div>";
      }
      return '<div class="dept-head-approval-detail__row' + (row.wide ? " dept-head-approval-detail__row--wide" : "") + '"><span>' + escapeHtml(row.label) + "</span><strong>" + escapeHtml(row.value) + "</strong></div>";
    };
    var detailPrintControl = review.tone === "approved" ? '<button type="button" data-print-request data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '" title="Print approved request" aria-label="Print approved request" style="display:inline-flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 12px;border:1px solid #4ade80;border-radius:999px;background:linear-gradient(135deg,#ecfdf5,#bbf7d0);color:#047857;font-size:11px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 8px 20px rgba(22,163,74,.16);"><i class="fa fa-print" aria-hidden="true"></i><span>Print</span></button>' : '';

    // [LOGIC] Parehong reversible ang approved at rejected para maitama agad ang maling desisyon.
    var completedDecisionActions = () => '<div class="dept-head-approval-detail__actions dept-head-approval-detail__actions--done">' + '<span class="dept-head-approval-detail__done"><i class="fa ' + escapeHtml(review.icon) + '" aria-hidden="true"></i> ' + escapeHtml(review.label) + '</span>' + (review.tone === "approved" ? '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--reject" data-action="reject" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '">Reject</button>' : '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--approve" data-action="approve" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '">Approve</button>') + '</div>';

    // [UI] OT lang ang may workbench layout para mas malinaw ang summary at decision flow.
    if (sectionKey === "ot") {
      var _rowsByLabel$get, _rowsByLabel$get2;
      var otSummary = [rowsByLabel.get("OT Date"), rowsByLabel.get("Hours"), rowsByLabel.get("Time From") && rowsByLabel.get("Time To") ? {
        label: "Time Window",
        value: [(_rowsByLabel$get = rowsByLabel.get("Time From")) === null || _rowsByLabel$get === void 0 ? void 0 : _rowsByLabel$get.value, (_rowsByLabel$get2 = rowsByLabel.get("Time To")) === null || _rowsByLabel$get2 === void 0 ? void 0 : _rowsByLabel$get2.value].filter(Boolean).join(" - ")
      } : null, rowsByLabel.get("Area")].filter(Boolean);
      var otRows = [rowsByLabel.get("Requester"), rowsByLabel.get("Department"), rowsByLabel.get("Attachment Type"), rowsByLabel.get("Current Stage"), rowsByLabel.get("GM Review"), rowsByLabel.get("OT Number")].filter(Boolean);
      var otPurpose = rowsByLabel.get("Purpose");
      var otStatus = rowsByLabel.get("Status");
      var summaryHtml = otSummary.map(row => '<div class="dept-head-approval-detail__ot-card">' + "<span>" + escapeHtml(row.label) + "</span>" + "<strong>" + escapeHtml(row.value) + "</strong>" + "</div>").join("");
      var otGridHtml = otRows.map(formatDetailRow).join("");
      detail.innerHTML = '<header class="dept-head-approval-detail__head dept-head-approval-detail__head--ot">' + '<div class="dept-head-approval-detail__title dept-head-approval-detail__title--ot">' + '<span class="dept-head-approval-detail__type ' + section.detailClass + '">' + '<i class="fa ' + section.icon + '" aria-hidden="true"></i> ' + escapeHtml(section.label) + "</span>" + "<strong>" + escapeHtml(requestTitle(sectionKey, item) || id || "-") + "</strong>" + '<span>' + escapeHtml(detailSubtitle) + '</span>' + '<small class="dept-head-approval-detail__ot-note">' + escapeHtml(overtimeStageLabel(item.approval_stage)) + (Number(item.requires_gm) === 1 ? " · Exceptional OT requires GM review" : "") + '</small>' + "</div>" + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">' + detailPrintControl + '<span class="dept-head-approval-detail__status dept-head-approval-detail__status--' + escapeHtml(review.tone) + '">' + escapeHtml(review.label) + '</span>' + '</div>' + "</header>" + '<div class="' + detailBodyClass + ' dept-head-approval-detail__body--ot">' + '<div class="dept-head-approval-detail__ot-summary">' + summaryHtml + "</div>" + '<div class="dept-head-approval-detail__ot-grid">' + otGridHtml + "</div>" + (otPurpose ? '<section class="dept-head-approval-detail__ot-purpose">' + '<span>Purpose</span>' + '<strong>' + escapeHtml(otPurpose.value) + '</strong>' + "</section>" : "") + (otStatus ? '<section class="dept-head-approval-detail__ot-status">' + '<span>Review note</span>' + '<strong>' + escapeHtml(otStatus.value) + '</strong>' + '<small>' + escapeHtml(review.tone === "pending" ? `Ready for ${overtimeStageLabel(item.approval_stage).toLowerCase()}.` : "Decision already recorded.") + '</small>' + "</section>" : "") + "</div>" + (review.tone === "pending" ? '<div class="' + detailActionsClass + '">' + '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--approve" data-action="approve" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '">Approve</button>' + '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--reject" data-action="reject" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '">Reject</button>' + "</div>" : completedDecisionActions());
      return;
    }

    // Iisang disenyo (profile hero + about + facts) para sa LAHAT ng seksyon; ang pagkakaiba
    // ay ang malaking bilang sa hero at kung anong detalye ang ipinapakita bawat modyul.
    {
      var fuelValue = (label, fallback = "-") => {
        var _rowsByLabel$get3;
        return String(((_rowsByLabel$get3 = rowsByLabel.get(label)) === null || _rowsByLabel$get3 === void 0 ? void 0 : _rowsByLabel$get3.value) || fallback);
      };
      var requestedFuel = String(item.ReqItem || item.Requested_item || item.requested_item || "Fuel").trim();
      var isFuel = sectionKey === "fuel";
      var fuelFact = (label, value, wide = false) => '<div class="dept-head-fuel-profile__fact' + (wide ? ' dept-head-fuel-profile__fact--wide' : '') + (label === "Balance" ? ' dept-head-fuel-profile__fact--balance' : '') + (label === "Destination" ? ' dept-head-fuel-profile__fact--destination' : '') + '">' + '<span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || "-") + '</strong></div>';
      // Per-section: kicker, malaking bilang sa hero, at kung aling rows ang nasa hero na
      // (hindi na uulitin sa facts grid).
      var profile = (() => {
        if (isFuel) {
          return {
            kicker: "Fuel request",
            num: fuelValue("Liters Requested", "0"),
            unit: "Liters",
            caption: requestedFuel,
            skip: ["Purpose", "Status", "Employee", "Liters Requested", "Request Date", "FAR Code"]
          };
        }
        // HUWAG lagyan ng malaking bilang ang hindi-fuel na seksyon: ang hugis na patak ay
        // metapora ng gasolina, kaya mali ang tingin kapag "1 EMPLOYEE" ang nasa loob.
        // Status pill na lang ang ipinapakita nila; nasa facts grid pa rin ang mga detalye.
        if (sectionKey === "epass") {
          return {
            kicker: "Employees pass",
            num: "",
            unit: "",
            caption: "",
            skip: ["Purpose", "Status", "Request Date", "EPASS Number", "Included Employees"]
          };
        }
        if (sectionKey === "travel") {
          return {
            kicker: "Travel order",
            num: "",
            unit: "",
            caption: "",
            skip: ["Purpose", "Status", "Requester", "Request Date", "Travel Order No."]
          };
        }
        if (sectionKey === "leave") {
          return {
            kicker: "Leave request",
            num: "",
            unit: "",
            caption: "",
            skip: ["Purpose", "Status", "Requester", "Date Filed", "Tracking No."]
          };
        }
        return {
          kicker: "Overtime request",
          num: "",
          unit: "",
          caption: "",
          skip: ["Purpose", "Status", "Requester", "OT Date", "OT Number"]
        };
      })();
      // Facts grid: lahat ng natitirang rows (ang "people" rows ay ginagawang chips).
      var profileFacts = rows.filter(row => !profile.skip.includes(row.label)).map(row => {
        var _row$value2;
        var value = Array.isArray(row.value) ? row.value.join(", ") : String((_row$value2 = row.value) !== null && _row$value2 !== void 0 ? _row$value2 : "");
        return fuelFact(row.label, value, Boolean(row.wide));
      }).join("");
      var epassPeople = sectionKey === "epass" ? requestEpassPeople(item) : [];
      var epassPeopleSection = sectionKey === "epass" ? '<section class="dept-head-fuel-profile__people" style="grid-column:1/-1;padding:16px 0 0;">' + '<header><span>Employees included in this EPASS</span><small>' + epassPeople.length + ' employee' + (epassPeople.length === 1 ? '' : 's') + '</small></header>' + '<div class="dept-head-fuel-profile__people-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">' + renderEpassIncludedPeople(item) + '</div>' + '</section>' : '';
      var leaveApprovalReady = sectionKey !== "leave" || leaveApprovalStageIsReady(item);
      var travelApprovalReady = sectionKey !== "travel" || travelApprovalStageIsReady(item);
      var leaveApproversSection = sectionKey === "leave" ? '<section class="dept-head-fuel-profile__people dept-head-fuel-profile__people--leave-route" style="grid-column:1/-1;padding:16px 0 0;">' + '<header><span>Leave approval route</span><small>Approve in order</small></header>' + '<div class="leave-approval-route">' + renderLeaveApprovalRoute(item) + '</div>' + '</section>' : '';
      // Sino ang sakay sa authoritative EPASS/Travel link; EPASS muna bago Travel fallback.
      var linkedEpass = getFuelEpassNumber(item);
      var fuelFarCode = String(item.FARCode || item.farCode || item.far_code || "").trim();
      var linkSection = (kind, number, title) => '<section class="dept-head-fuel-profile__people"' + ' data-fuel-link-people="' + escapeHtml(kind) + '"' + ' data-fuel-link-far="' + escapeHtml(fuelFarCode.toUpperCase()) + '"' + ' data-fuel-link-number="' + escapeHtml(String(number || "").toUpperCase()) + '">' + '<header>' + '<span data-fuel-link-people-title>' + escapeHtml(title) + '</span>' + '<small data-fuel-link-people-count></small>' + '</header>' + '<div class="dept-head-fuel-profile__people-body" data-fuel-link-people-body>' + '<span class="dept-head-fuel-profile__people-empty">Loading employees…</span>' + '</div>' + '</section>';
      var fuelLinkPeople = linkedEpass ? linkSection("epass", linkedEpass, "Employees on EPASS " + linkedEpass) : fuelFarCode ? linkSection("travel", "", "Employees on TRAVEL") : "";
      detail.innerHTML = '<header class="dept-head-fuel-profile__hero">' + '<button type="button" class="dept-head-fuel-profile__person" data-requester-profile aria-expanded="false">' + '<span class="dept-head-fuel-profile__portrait' + (requesterPhoto ? ' has-photo' : '') + '">' + (requesterPhoto ? '<img src="' + escapeHtml(requesterPhoto) + '" alt="Profile photo of ' + escapeHtml(requesterName) + '" loading="lazy" decoding="async" fetchpriority="low" />' : '') + '<span>' + escapeHtml(requestAvatarLabel(sectionKey, item)) + '</span>' + '</span>' + '<span class="dept-head-fuel-profile__person-copy">' + '<small>Request submitted by</small>' + '<strong>' + escapeHtml(requesterName) + '</strong>' + '<em>' + escapeHtml(requesterPosition) + '</em>' + '<span><i class="fa fa-id-badge" aria-hidden="true"></i> ' + escapeHtml(requesterCode || "No employee number") + '</span>' + '<span><i class="fa fa-map-marker" aria-hidden="true"></i> ' + escapeHtml(requesterArea) + '</span>' + '</span>' + '</button>' + '<div class="dept-head-fuel-profile__request">' + '<span><i class="fa ' + escapeHtml(section.icon) + '" aria-hidden="true"></i> ' + escapeHtml(profile.kicker) + '</span>' + '<strong>' + escapeHtml(requestTitle(sectionKey, item) || id || "-") + '</strong>' + '<small>Filed ' + escapeHtml(requestDate(sectionKey, item) || "-") + '</small>'
      // Anong klaseng request (FUEL + EPASS/TRAVEL) — sa fuel lang ito may saysay.
      + (isFuel ? (() => {
        var travelChecked = Boolean(linkedEpass) || !fuelFarCode;
        var content = fuelLinkTagContent(Boolean(linkedEpass), false, travelChecked);
        return '<span class="dept-head-fuel-profile__linktag' + (content.warn ? " is-warning" : "") + '" data-fuel-linktag' + ' data-has-epass="' + (linkedEpass ? "1" : "0") + '"' + ' data-has-travel="0"' + ' data-travel-checked="' + (travelChecked ? "1" : "0") + '">' + escapeHtml(content.text) + '</span>';
      })() : "") + detailPrintControl + '</div>' + '<div class="dept-head-fuel-profile__meter dept-head-fuel-profile__meter--' + escapeHtml(review.tone) + '">' + '<i class="fa ' + escapeHtml(section.icon) + '" aria-hidden="true"></i>' + '<small>' + escapeHtml(review.label) + '</small>' + (profile.num ? '<strong>' + escapeHtml(profile.num) + '</strong><span>' + escapeHtml(profile.unit) + '</span>' : "") + (profile.caption ? '<em>' + escapeHtml(profile.caption) + '</em>' : "") + '</div>' + '</header>' + fuelRequesterProfile + '<div class="dept-head-fuel-profile__content">' + '<section class="dept-head-fuel-profile__about">' + '<span>About this request</span>' + '<strong>' + escapeHtml(fuelValue("Purpose", "No purpose provided")) + '</strong>' + '</section>' + '<section class="dept-head-fuel-profile__facts">' + profileFacts + '</section>' + epassPeopleSection + leaveApproversSection + (isFuel ? fuelLinkPeople : "") + '</div>' + (review.tone === "pending"
      // Sa FUEL lang may gate: bawal aprubahan kapag walang EPASS/Travel (i-eenforce din ng
      // Node Fuel API). Ang ibang modyul ay normal na Approve/Reject.
      ? '<div class="dept-head-approval-detail__actions dept-head-approval-detail__actions--fuel dept-head-fuel-profile__actions"' + (isFuel ? ' data-fuel-approve-gate' : '') + '>' + '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--approve" data-action="approve" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '"' + (isFuel && !linkedEpass ? ' disabled title="Create a Fuel EPASS or Travel Order before approving."' : "") + (sectionKey === "leave" && !leaveApprovalReady ? ' disabled title="This Leave approval must follow the assigned approval order."' : "") + (sectionKey === "travel" && !travelApprovalReady ? ' disabled title="This Travel request has moved to the next assigned signatory."' : "") + '>Approve</button>' + '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--reject" data-action="reject" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '"' + (sectionKey === "travel" && !travelApprovalReady ? ' disabled title="This Travel request has moved to the next assigned signatory."' : "") + '>Reject</button>' + (isFuel ? '<p class="dept-head-fuel-profile__approve-note" data-fuel-approve-note' + (linkedEpass ? ' hidden' : '') + '>Link a Fuel EPASS or Travel Order before this request can be approved.</p>' : "") + '</div>' : completedDecisionActions());
      if (isFuel && linkedEpass) {
        void fillFuelLinkPeople("epass", fuelFarCode, linkedEpass);
      }
      if (isFuel && !linkedEpass && fuelFarCode) {
        void fillFuelLinkPeople("travel", fuelFarCode, "");
      }
      return;
    }
    detail.innerHTML = '<header class="dept-head-approval-detail__head">' + '<div class="dept-head-approval-detail__title">' + '<span class="dept-head-approval-detail__type ' + section.detailClass + '">' + '<i class="fa ' + section.icon + '" aria-hidden="true"></i> ' + escapeHtml(section.label) + "</span>" + "<strong>" + escapeHtml(requestTitle(sectionKey, item) || id || "-") + "</strong>" + fuelRequesterButton + "</div>" + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">' + detailPrintControl + '<span class="dept-head-approval-detail__status dept-head-approval-detail__status--' + escapeHtml(review.tone) + '">' + escapeHtml(review.label) + '</span>' + '</div>' + "</header>" + fuelRequesterProfile + '<div class="' + detailBodyClass + '">' + '<div class="dept-head-approval-detail__grid">' + rows.map(formatDetailRow).join("") + "</div>" + "</div>" + (review.tone === "pending" ? '<div class="' + detailActionsClass + '">' + '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--approve" data-action="approve" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '">Approve</button>' + '<button type="button" class="dept-head-approval-detail__btn dept-head-approval-detail__btn--reject" data-action="reject" data-section="' + escapeHtml(sectionKey) + '" data-id="' + escapeHtml(id) + '">Reject</button>' + "</div>" : completedDecisionActions());
  }
  function renderHub() {
    renderTabs();
    ensureSelection();
    renderList();
    renderDetail();
    updateFabBadge();
    renderNotificationHistory();
  }
  function loadFuelQueue() {
    return _loadFuelQueue.apply(this, arguments);
  }
  function _loadFuelQueue() {
    _loadFuelQueue = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee15() {
      var params, cacheKey, cachedItems, usedCache, fetchPages, pendingParams;
      return _regeneratorRuntime().wrap(function _callee15$(_context15) {
        while (1) switch (_context15.prev = _context15.next) {
          case 0:
            // The Node Fuel API scopes this queue to the signed-in assigned approver.
            params = new URLSearchParams({
              action: "history",
              all: "1",
              orgwide: "0",
              limit: "100"
            });
            applySelectedDateParams(params);
            cacheKey = fastQueueCacheKey("fuel", params);
            cachedItems = readFastQueueCache(cacheKey);
            usedCache = false;
            if (cachedItems.length && !state.queues.fuel.length) {
              state.queues.fuel = cachedItems;
              ensureQueueOrder("fuel", state.queues.fuel);
              usedCache = true;
              renderHub();
            }
            fetchPages = /*#__PURE__*/function () {
              var _ref14 = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee14(requestParams) {
                var _yield$fetchJsonWithS7, response, payload, items, totalPages, pageResults;
                return _regeneratorRuntime().wrap(function _callee14$(_context14) {
                  while (1) switch (_context14.prev = _context14.next) {
                    case 0:
                      _context14.next = 2;
                      return fetchJsonWithSessionRetry(API.fuel + "?" + requestParams.toString(), {
                        credentials: "same-origin",
                        headers: getAuthHeaders()
                      }, "Invalid fuel queue response.");
                    case 2:
                      _yield$fetchJsonWithS7 = _context14.sent;
                      response = _yield$fetchJsonWithS7.response;
                      payload = _yield$fetchJsonWithS7.payload;
                      if (!(!response.ok || !payload.ok)) {
                        _context14.next = 7;
                        break;
                      }
                      throw new Error(payload.message || "Unable to load Fuel requests.");
                    case 7:
                      items = Array.isArray(payload.items) ? payload.items.slice() : [];
                      totalPages = Math.max(1, Number(payload.totalPages || 1));
                      if (!(totalPages <= 1)) {
                        _context14.next = 11;
                        break;
                      }
                      return _context14.abrupt("return", items);
                    case 11:
                      _context14.next = 13;
                      return Promise.all(Array.from({
                        length: totalPages - 1
                      }, (_, index) => index + 2).map(/*#__PURE__*/function () {
                        var _ref15 = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee13(page) {
                          var pageParams, _yield$fetchJsonWithS8, pageResponse, pagePayload;
                          return _regeneratorRuntime().wrap(function _callee13$(_context13) {
                            while (1) switch (_context13.prev = _context13.next) {
                              case 0:
                                pageParams = new URLSearchParams(requestParams);
                                pageParams.set("page", String(page));
                                _context13.next = 4;
                                return fetchJsonWithSessionRetry(API.fuel + "?" + pageParams.toString(), {
                                  credentials: "same-origin",
                                  headers: getAuthHeaders()
                                }, "Invalid fuel queue response.");
                              case 4:
                                _yield$fetchJsonWithS8 = _context13.sent;
                                pageResponse = _yield$fetchJsonWithS8.response;
                                pagePayload = _yield$fetchJsonWithS8.payload;
                                if (!(!pageResponse.ok || !pagePayload.ok)) {
                                  _context13.next = 9;
                                  break;
                                }
                                throw new Error(pagePayload.message || "Unable to load all Fuel requests.");
                              case 9:
                                return _context13.abrupt("return", Array.isArray(pagePayload.items) ? pagePayload.items : []);
                              case 10:
                              case "end":
                                return _context13.stop();
                            }
                          }, _callee13);
                        }));
                        return function (_x32) {
                          return _ref15.apply(this, arguments);
                        };
                      }()));
                    case 13:
                      pageResults = _context14.sent;
                      pageResults.forEach(pageItems => items.push(...pageItems));
                      return _context14.abrupt("return", items);
                    case 16:
                    case "end":
                      return _context14.stop();
                  }
                }, _callee14);
              }));
              return function fetchPages(_x31) {
                return _ref14.apply(this, arguments);
              };
            }();
            if (usedCache) {
              _context15.next = 20;
              break;
            }
            pendingParams = new URLSearchParams(params);
            pendingParams.set("status", "2");
            _context15.prev = 10;
            _context15.next = 13;
            return fetchPages(pendingParams);
          case 13:
            state.queues.fuel = _context15.sent;
            ensureQueueOrder("fuel", state.queues.fuel);
            // Show actionable requests immediately while reviewed history finishes in the background.
            renderHub();
            _context15.next = 20;
            break;
          case 18:
            _context15.prev = 18;
            _context15.t0 = _context15["catch"](10);
          case 20:
            _context15.prev = 20;
            _context15.next = 23;
            return fetchPages(params);
          case 23:
            state.queues.fuel = _context15.sent;
            _context15.next = 31;
            break;
          case 26:
            _context15.prev = 26;
            _context15.t1 = _context15["catch"](20);
            if (!(usedCache || state.queues.fuel.length)) {
              _context15.next = 30;
              break;
            }
            return _context15.abrupt("return");
          case 30:
            throw _context15.t1;
          case 31:
            writeFastQueueCache(cacheKey, state.queues.fuel);
            ensureQueueOrder("fuel", state.queues.fuel);
          case 33:
          case "end":
            return _context15.stop();
        }
      }, _callee15, null, [[10, 18], [20, 26]]);
    }));
    return _loadFuelQueue.apply(this, arguments);
  }
  function loadCachedQueue(_x18, _x19, _x20, _x21, _x22) {
    return _loadCachedQueue.apply(this, arguments);
  }
  function _loadCachedQueue() {
    _loadCachedQueue = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee16(section, url, params, options, fallbackMessage) {
      var cached, response, payload, _yield$fetchJsonWithS9;
      return _regeneratorRuntime().wrap(function _callee16$(_context16) {
        while (1) switch (_context16.prev = _context16.next) {
          case 0:
            cached = primeFastQueueCache(section, params);
            _context16.prev = 1;
            _context16.next = 4;
            return fetchJsonWithSessionRetry(url + "?" + params.toString(), options, fallbackMessage);
          case 4:
            _yield$fetchJsonWithS9 = _context16.sent;
            response = _yield$fetchJsonWithS9.response;
            payload = _yield$fetchJsonWithS9.payload;
            _context16.next = 14;
            break;
          case 9:
            _context16.prev = 9;
            _context16.t0 = _context16["catch"](1);
            if (!cached.used) {
              _context16.next = 13;
              break;
            }
            return _context16.abrupt("return");
          case 13:
            throw _context16.t0;
          case 14:
            if (!(!response.ok || !payload.ok)) {
              _context16.next = 18;
              break;
            }
            if (!cached.used) {
              _context16.next = 17;
              break;
            }
            return _context16.abrupt("return");
          case 17:
            throw new Error(payload.message || fallbackMessage);
          case 18:
            state.queues[section] = Array.isArray(payload.items) ? payload.items : [];
            writeFastQueueCache(cached.key, state.queues[section]);
            ensureQueueOrder(section, state.queues[section]);
          case 21:
          case "end":
            return _context16.stop();
        }
      }, _callee16, null, [[1, 9]]);
    }));
    return _loadCachedQueue.apply(this, arguments);
  }
  function loadEpassQueue() {
    return _loadEpassQueue.apply(this, arguments);
  }
  function _loadEpassQueue() {
    _loadEpassQueue = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee17() {
      var params;
      return _regeneratorRuntime().wrap(function _callee17$(_context17) {
        while (1) switch (_context17.prev = _context17.next) {
          case 0:
            // [HUWAG BAGUHIN] Selected approver ang scope ng EPASS; puwedeng ibang department ang requester.
            params = new URLSearchParams({
              action: "all",
              limit: "100"
            });
            applySelectedDateParams(params);
            _context17.next = 4;
            return loadCachedQueue("epass", API.epass, params, {
              credentials: "same-origin",
              headers: getAuthHeaders()
            }, "Invalid EPASS queue response.");
          case 4:
          case "end":
            return _context17.stop();
        }
      }, _callee17);
    }));
    return _loadEpassQueue.apply(this, arguments);
  }
  function loadTravelQueue() {
    return _loadTravelQueue.apply(this, arguments);
  }
  function _loadTravelQueue() {
    _loadTravelQueue = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee18() {
      var params;
      return _regeneratorRuntime().wrap(function _callee18$(_context18) {
        while (1) switch (_context18.prev = _context18.next) {
          case 0:
            // [HUWAG BAGUHIN] Selected approver ang scope ng Travel; puwedeng ibang department ang requester.
            params = new URLSearchParams({
              action: "all",
              limit: "100"
            });
            applySelectedDateParams(params);
            _context18.next = 4;
            return loadCachedQueue("travel", API.travel, params, {
              credentials: "same-origin",
              headers: getAuthHeaders()
            }, "Invalid travel queue response.");
          case 4:
          case "end":
            return _context18.stop();
        }
      }, _callee18);
    }));
    return _loadTravelQueue.apply(this, arguments);
  }
  function loadLeaveQueue() {
    return _loadLeaveQueue.apply(this, arguments);
  }
  function _loadLeaveQueue() {
    _loadLeaveQueue = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee19() {
      var params;
      return _regeneratorRuntime().wrap(function _callee19$(_context19) {
        while (1) switch (_context19.prev = _context19.next) {
          case 0:
            // HUWAG BAGUHIN: Leave action uses leave_id/Id dahil may lumang duplicate trackingNo records.
            // [FIX] Don't filter by the approver's OWN department — request_approvers (via the
            // server-side EXISTS check) already scopes results to exactly what's assigned to this
            // approver. A manually-picked signatory can legitimately be from a different department
            // than the requester, and the department filter was hiding those correctly-assigned items.
            params = new URLSearchParams({
              action: "all",
              limit: "100"
            });
            applySelectedDateParams(params, "leave");
            _context19.next = 4;
            return loadCachedQueue("leave", API.leave, params, {
              credentials: "same-origin",
              cache: "no-store",
              headers: getAuthHeaders()
            }, "Invalid leave queue response.");
          case 4:
          case "end":
            return _context19.stop();
        }
      }, _callee19);
    }));
    return _loadLeaveQueue.apply(this, arguments);
  }
  function loadOvertimeQueue() {
    return _loadOvertimeQueue.apply(this, arguments);
  }
  function _loadOvertimeQueue() {
    _loadOvertimeQueue = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee20() {
      var params;
      return _regeneratorRuntime().wrap(function _callee20$(_context20) {
        while (1) switch (_context20.prev = _context20.next) {
          case 0:
            // [LOGIC] Kasama ang completed OT para may Reject button din pagkatapos ma-approve.
            // [FIX] Same reasoning as loadLeaveQueue — don't filter by the approver's own department.
            params = new URLSearchParams({
              action: "pending_dept",
              all: "1",
              limit: "30"
            });
            applySelectedDateParams(params, "ot");
            _context20.next = 4;
            return loadCachedQueue("ot", API.overtime, params, {
              credentials: "same-origin",
              cache: "no-store",
              headers: getOvertimeAuthHeaders()
            }, "Invalid overtime queue response.");
          case 4:
          case "end":
            return _context20.stop();
        }
      }, _callee20);
    }));
    return _loadOvertimeQueue.apply(this, arguments);
  }
  function refreshQueues() {
    return _refreshQueues.apply(this, arguments);
  }
  function _refreshQueues() {
    _refreshQueues = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee21(forceProbe = false) {
      var _root23;
      var status, availabilityCheck, apiAvailable, loaders, results, failures, successfulSections;
      return _regeneratorRuntime().wrap(function _callee21$(_context21) {
        while (1) switch (_context21.prev = _context21.next) {
          case 0:
            if (!state.loading) {
              _context21.next = 2;
              break;
            }
            return _context21.abrupt("return");
          case 2:
            state.loading = true;
            status = (_root23 = root) === null || _root23 === void 0 ? void 0 : _root23.querySelector(".dept-head-approval-panel__status");
            if (status) {
              status.textContent = "Loading approval queues...";
            }
            _context21.prev = 5;
            availabilityCheck = global.SAMELCII_CAN_REACH_NODE_API;
            _context21.t0 = typeof availabilityCheck !== "function";
            if (_context21.t0) {
              _context21.next = 12;
              break;
            }
            _context21.next = 11;
            return availabilityCheck(forceProbe);
          case 11:
            _context21.t0 = _context21.sent;
          case 12:
            apiAvailable = _context21.t0;
            if (apiAvailable) {
              _context21.next = 19;
              break;
            }
            state.apiOffline = true;
            Object.keys(state.queueErrors).forEach(key => {
              state.queueErrors[key] = "Approval service temporarily unavailable.";
            });
            renderHub();
            if (status) {
              status.textContent = "Approval service unavailable. Use Refresh to try again.";
            }
            return _context21.abrupt("return");
          case 19:
            state.apiOffline = false;
            loaders = [{
              key: "fuel",
              label: "Fuel",
              run: loadFuelQueue
            }, {
              key: "epass",
              label: "EPASS",
              run: loadEpassQueue
            }, {
              key: "travel",
              label: "Travel",
              run: loadTravelQueue
            }, {
              key: "leave",
              label: "Leave",
              run: loadLeaveQueue
            }, {
              key: "ot",
              label: "Overtime",
              run: loadOvertimeQueue
            }];
            _context21.next = 23;
            return Promise.allSettled(loaders.map(({
              key,
              label,
              run
            }) => Promise.resolve().then(run).then(() => {
              state.queueErrors[key] = "";
              renderHub();
              if (status && key === state.activeSection) {
                status.textContent = `${label} ready. Updating other queues...`;
              }
            })));
          case 23:
            results = _context21.sent;
            failures = [];
            successfulSections = [];
            results.forEach((entry, index) => {
              var _entry$reason;
              var section = loaders[index];
              if (entry.status !== "rejected") {
                if (section) successfulSections.push(section.key);
                return;
              }
              if (section) state.queueErrors[section.key] = ((_entry$reason = entry.reason) === null || _entry$reason === void 0 ? void 0 : _entry$reason.message) || "Request failed.";
              failures.push(section ? section.label : "Queue");
            });
            syncNewRequestNotifications(successfulSections);
            renderHub();
            if (status) {
              if (failures.length) {
                status.textContent = `Updated. ${failures.join(", ")} queue${failures.length === 1 ? " is" : "s are"} unavailable.`;
              } else {
                status.textContent = "Updated " + new Date().toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit"
                });
              }
            }
            _context21.next = 35;
            break;
          case 32:
            _context21.prev = 32;
            _context21.t1 = _context21["catch"](5);
            if (status) {
              status.textContent = (_context21.t1 === null || _context21.t1 === void 0 ? void 0 : _context21.t1.message) || "Unable to refresh queues.";
            }
          case 35:
            _context21.prev = 35;
            state.loading = false;
            return _context21.finish(35);
          case 38:
          case "end":
            return _context21.stop();
        }
      }, _callee21, null, [[5, 32, 35, 38]]);
    }));
    return _refreshQueues.apply(this, arguments);
  }
  function updateStatus(_x23, _x24, _x25, _x26) {
    return _updateStatus.apply(this, arguments);
  }
  function _updateStatus() {
    _updateStatus = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee22(sectionKey, id, nextStatus, item) {
      var _formData, fuelEpassNumber, _response2, _payload2, requestBody, remarks, _response3, responsePayload, _formData2, _response4, _payload3, api, field, formData, response, payload;
      return _regeneratorRuntime().wrap(function _callee22$(_context22) {
        while (1) switch (_context22.prev = _context22.next) {
          case 0:
            if (!(sectionKey === "fuel")) {
              _context22.next = 15;
              break;
            }
            // Backend ang authority sa balance at puwedeng mag-negative ayon sa Fuel workflow.
            _formData = new URLSearchParams();
            _formData.append("farCode", id);
            _formData.append("status", String(nextStatus));
            fuelEpassNumber = getFuelEpassNumber(item);
            if (fuelEpassNumber) {
              _formData.append("fuelEpassNumber", fuelEpassNumber);
            }
            _context22.next = 8;
            return fetch(API.fuel + "?action=update_status", {
              method: "POST",
              credentials: "same-origin",
              headers: getAuthHeaders({
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
              }),
              body: _formData.toString()
            });
          case 8:
            _response2 = _context22.sent;
            _context22.next = 11;
            return _response2.json().catch(() => ({
              ok: false
            }));
          case 11:
            _payload2 = _context22.sent;
            if (!(!_response2.ok || !_payload2.ok)) {
              _context22.next = 14;
              break;
            }
            throw new Error(_payload2.message || "Fuel approval failed.");
          case 14:
            return _context22.abrupt("return", _payload2);
          case 15:
            if (!(sectionKey === "ot")) {
              _context22.next = 31;
              break;
            }
            requestBody = {
              ot_number: id,
              status: nextStatus
            };
            if (!(nextStatus === 2)) {
              _context22.next = 22;
              break;
            }
            remarks = String(global.prompt("Reason for rejection", (item === null || item === void 0 ? void 0 : item.dept_head_remarks) || "") || "").trim();
            if (remarks) {
              _context22.next = 21;
              break;
            }
            throw new Error("Please add a rejection remark before rejecting overtime.");
          case 21:
            requestBody.remarks = remarks;
          case 22:
            _context22.next = 24;
            return fetch(API.overtime + "?action=update_dept_status", {
              method: "POST",
              credentials: "same-origin",
              headers: getOvertimeAuthHeaders({
                "Content-Type": "application/json"
              }),
              body: JSON.stringify(requestBody)
            });
          case 24:
            _response3 = _context22.sent;
            _context22.next = 27;
            return _response3.json().catch(() => ({
              ok: false
            }));
          case 27:
            responsePayload = _context22.sent;
            if (!(!_response3.ok || !responsePayload.ok)) {
              _context22.next = 30;
              break;
            }
            throw new Error(responsePayload.message || "Overtime approval failed.");
          case 30:
            return _context22.abrupt("return");
          case 31:
            if (!(sectionKey === "leave")) {
              _context22.next = 42;
              break;
            }
            _formData2 = new URLSearchParams({
              leave_id: id,
              status: String(nextStatus)
            });
            _context22.next = 35;
            return fetch(API.leave + "?action=update_status", {
              method: "POST",
              credentials: "same-origin",
              headers: getAuthHeaders({
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
              }),
              body: _formData2.toString()
            });
          case 35:
            _response4 = _context22.sent;
            _context22.next = 38;
            return _response4.json().catch(() => ({
              ok: false
            }));
          case 38:
            _payload3 = _context22.sent;
            if (!(!_response4.ok || !_payload3.ok)) {
              _context22.next = 41;
              break;
            }
            throw new Error(_payload3.message || "Leave approval failed.");
          case 41:
            return _context22.abrupt("return");
          case 42:
            api = sectionKey === "epass" ? API.epass : API.travel;
            field = sectionKey === "epass" ? "epassnumber" : "to_number";
            formData = new URLSearchParams();
            formData.append(field, id);
            formData.append("status", String(nextStatus));
            _context22.next = 49;
            return fetch(api + "?action=update_status", {
              method: "POST",
              credentials: "same-origin",
              headers: getAuthHeaders(),
              body: formData
            });
          case 49:
            response = _context22.sent;
            _context22.next = 52;
            return response.json().catch(() => ({
              ok: false
            }));
          case 52:
            payload = _context22.sent;
            if (!(!response.ok || !payload.ok)) {
              _context22.next = 55;
              break;
            }
            throw new Error(payload.message || "Approval update failed.");
          case 55:
          case "end":
            return _context22.stop();
        }
      }, _callee22);
    }));
    return _updateStatus.apply(this, arguments);
  }
  function animateRejectedListItem(sectionKey, id) {
    var _root14;
    var card = Array.from(((_root14 = root) === null || _root14 === void 0 ? void 0 : _root14.querySelectorAll(".dept-head-approval-list-item")) || []).find(node => node.dataset.section === sectionKey && node.dataset.id === id);
    if (!card) {
      return Promise.resolve();
    }
    card.classList.add("is-rejecting");
    card.setAttribute("aria-hidden", "true");
    return new Promise(resolve => {
      var finished = false;
      var finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      card.addEventListener("animationend", finish, {
        once: true
      });
      global.setTimeout(finish, 450);
    });
  }
  function handleDecision(_x27, _x28, _x29) {
    return _handleDecision.apply(this, arguments);
  }
  function _handleDecision() {
    _handleDecision = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee23(sectionKey, id, actionName) {
      var _root24;
      var item, decisionKey, decisionButtons, previousDisabled, approveStatus, rejectStatus, nextStatus, payload, reviewBucket, persistedItem, _payload$status, session, queue;
      return _regeneratorRuntime().wrap(function _callee23$(_context23) {
        while (1) switch (_context23.prev = _context23.next) {
          case 0:
            item = findItem(sectionKey, id);
            if (item) {
              _context23.next = 3;
              break;
            }
            return _context23.abrupt("return");
          case 3:
            decisionKey = `${sectionKey}:${id}`;
            if (!state.decisionsInFlight.has(decisionKey)) {
              _context23.next = 6;
              break;
            }
            return _context23.abrupt("return");
          case 6:
            state.decisionsInFlight.add(decisionKey);
            // [HUWAG] Isang request lang habang pending; pinipigilan nito ang dobleng approve/reject POST.
            decisionButtons = Array.from(((_root24 = root) === null || _root24 === void 0 ? void 0 : _root24.querySelectorAll('[data-action][data-section][data-id]')) || []).filter(button => button.dataset.section === sectionKey && button.dataset.id === id);
            previousDisabled = decisionButtons.map(button => button.disabled);
            decisionButtons.forEach(button => {
              button.disabled = true;
            });
            approveStatus = sectionKey === "fuel" ? 1 : sectionKey === "ot" ? 1 : 2;
            rejectStatus = sectionKey === "fuel" ? 3 : sectionKey === "ot" ? 2 : 3;
            nextStatus = actionName === "approve" ? approveStatus : rejectStatus;
            _context23.prev = 13;
            _context23.next = 16;
            return updateStatus(sectionKey, id, nextStatus, item);
          case 16:
            payload = _context23.sent;
            if (!(actionName === "reject")) {
              _context23.next = 20;
              break;
            }
            _context23.next = 20;
            return animateRejectedListItem(sectionKey, id);
          case 20:
            reviewBucket = state.reviewed[sectionKey] || (state.reviewed[sectionKey] = {});
            persistedItem = _objectSpread(_objectSpread({}, item), {}, {
              reviewed_status: nextStatus
            });
            if (sectionKey === "fuel") {
              persistedItem.Status = String((_payload$status = payload === null || payload === void 0 ? void 0 : payload.status) !== null && _payload$status !== void 0 ? _payload$status : nextStatus);
              if (actionName === "approve") {
                session = readSession();
                persistedItem.ApprovedByUserCode = String((payload === null || payload === void 0 ? void 0 : payload.approvedByUserCode) || session.usercode || item.ApprovedByUserCode || "").trim();
                persistedItem.ApprovedByName = String((payload === null || payload === void 0 ? void 0 : payload.approvedByName) || session.name || session.fullname || session.username || item.ApprovedByName || persistedItem.ApprovedByUserCode).trim();
                persistedItem.ApprovedByPosition = String((payload === null || payload === void 0 ? void 0 : payload.approvedByPosition) || session.position || item.ApprovedByPosition || "").trim();
              }
              if (payload !== null && payload !== void 0 && payload.fuelEpassNumber) {
                persistedItem.FuelEpassNumber = payload.fuelEpassNumber;
                persistedItem.epassID = payload.fuelEpassNumber;
              }
            }
            reviewBucket[id] = persistedItem;
            queue = state.queues[sectionKey] || [];
            state.queues[sectionKey] = queue.map(row => requestId(sectionKey, row) === id ? _objectSpread(_objectSpread({}, row), persistedItem) : row);
            renderHub();
            void refreshQueues();
            _context23.next = 33;
            break;
          case 30:
            _context23.prev = 30;
            _context23.t0 = _context23["catch"](13);
            global.alert((_context23.t0 === null || _context23.t0 === void 0 ? void 0 : _context23.t0.message) || "Approval update failed.");
          case 33:
            _context23.prev = 33;
            state.decisionsInFlight.delete(decisionKey);
            decisionButtons.forEach((button, index) => {
              if (button.isConnected) {
                button.disabled = previousDisabled[index];
              }
            });
            return _context23.finish(33);
          case 37:
          case "end":
            return _context23.stop();
        }
      }, _callee23, null, [[13, 30, 33, 37]]);
    }));
    return _handleDecision.apply(this, arguments);
  }
  function setPanelOpen(open) {
    var _root15, _root16, _root17;
    state.open = open;
    var panel = (_root15 = root) === null || _root15 === void 0 ? void 0 : _root15.querySelector(".dept-head-approval-panel");
    var backdrop = (_root16 = root) === null || _root16 === void 0 ? void 0 : _root16.querySelector(".dept-head-approval-backdrop");
    if (panel) {
      panel.classList.toggle("is-open", open);
      panel.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (backdrop) {
      backdrop.classList.toggle("is-open", open);
    }
    (_root17 = root) === null || _root17 === void 0 || _root17.classList.toggle("is-active", open);
    if (!open && panel) {
      var _root18;
      state.historyOpen = false;
      (_root18 = root) === null || _root18 === void 0 || (_root18 = _root18.querySelector("[data-notification-history-toggle]")) === null || _root18 === void 0 || _root18.setAttribute("aria-expanded", "false");
      panel.classList.remove("is-fullscreen");
      if (document.fullscreenElement === panel && typeof document.exitFullscreen === "function") {
        void document.exitFullscreen();
      }
    }
    if (open) {
      state.selected = null;
      void refreshQueues();
    }
  }
  function syncFullscreenButton() {
    var _root19, _root20;
    var panel = (_root19 = root) === null || _root19 === void 0 ? void 0 : _root19.querySelector(".dept-head-approval-panel");
    var button = (_root20 = root) === null || _root20 === void 0 ? void 0 : _root20.querySelector("[data-hub-fullscreen]");
    if (!panel || !button) {
      return;
    }
    var active = document.fullscreenElement === panel || panel.classList.contains("is-fullscreen");
    button.setAttribute("aria-label", active ? "Exit full screen" : "Full screen");
    button.setAttribute("title", active ? "Exit full screen" : "Full screen");
    button.setAttribute("aria-pressed", active ? "true" : "false");
    var icon = button.querySelector("i");
    if (icon) {
      icon.className = active ? "fa fa-compress" : "fa fa-expand";
    }
  }
  function togglePanelFullscreen() {
    return _togglePanelFullscreen.apply(this, arguments);
  }
  function _togglePanelFullscreen() {
    _togglePanelFullscreen = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee24() {
      var _root25;
      var panel;
      return _regeneratorRuntime().wrap(function _callee24$(_context24) {
        while (1) switch (_context24.prev = _context24.next) {
          case 0:
            panel = (_root25 = root) === null || _root25 === void 0 ? void 0 : _root25.querySelector(".dept-head-approval-panel");
            if (panel) {
              _context24.next = 3;
              break;
            }
            return _context24.abrupt("return");
          case 3:
            if (!(document.fullscreenElement === panel)) {
              _context24.next = 7;
              break;
            }
            _context24.next = 6;
            return document.exitFullscreen();
          case 6:
            return _context24.abrupt("return");
          case 7:
            if (!panel.classList.contains("is-fullscreen")) {
              _context24.next = 11;
              break;
            }
            panel.classList.remove("is-fullscreen");
            syncFullscreenButton();
            return _context24.abrupt("return");
          case 11:
            if (!(typeof panel.requestFullscreen === "function")) {
              _context24.next = 20;
              break;
            }
            _context24.prev = 12;
            _context24.next = 15;
            return panel.requestFullscreen();
          case 15:
            return _context24.abrupt("return");
          case 18:
            _context24.prev = 18;
            _context24.t0 = _context24["catch"](12);
          case 20:
            panel.classList.add("is-fullscreen");
            syncFullscreenButton();
          case 22:
          case "end":
            return _context24.stop();
        }
      }, _callee24, null, [[12, 18]]);
    }));
    return _togglePanelFullscreen.apply(this, arguments);
  }
  function loadFabPosition(fab) {
    try {
      var raw = localStorage.getItem(FAB_POS_KEY);
      if (!raw) {
        return;
      }
      var pos = JSON.parse(raw);
      if (Number.isFinite(pos === null || pos === void 0 ? void 0 : pos.left) && Number.isFinite(pos === null || pos === void 0 ? void 0 : pos.top)) {
        fab.style.left = pos.left + "px";
        fab.style.top = pos.top + "px";
        fab.style.right = "auto";
        fab.style.bottom = "auto";
      }
    } catch (_error) {
      /* noop */
    }
  }
  function saveFabPosition(fab) {
    var rect = fab.getBoundingClientRect();
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    }));
  }
  function clampFabPosition(fab, left, top) {
    var width = fab.offsetWidth || 58;
    var height = fab.offsetHeight || 58;
    var maxLeft = Math.max(8, global.innerWidth - width - 8);
    var maxTop = Math.max(8, global.innerHeight - height - 8);
    return {
      left: Math.min(Math.max(8, left), maxLeft),
      top: Math.min(Math.max(8, top), maxTop)
    };
  }
  function bindDrag(fab) {
    var onPointerDown = event => {
      var _fab$setPointerCaptur;
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      var rect = fab.getBoundingClientRect();
      state.drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false
      };
      (_fab$setPointerCaptur = fab.setPointerCapture) === null || _fab$setPointerCaptur === void 0 || _fab$setPointerCaptur.call(fab, event.pointerId);
      fab.classList.add("is-dragging");
      event.preventDefault();
    };
    var onPointerMove = event => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }
      var next = clampFabPosition(fab, event.clientX - state.drag.offsetX, event.clientY - state.drag.offsetY);
      fab.style.left = next.left + "px";
      fab.style.top = next.top + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
      state.drag.moved = true;
    };
    var onPointerUp = event => {
      var _fab$releasePointerCa;
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }
      fab.classList.remove("is-dragging");
      (_fab$releasePointerCa = fab.releasePointerCapture) === null || _fab$releasePointerCa === void 0 || _fab$releasePointerCa.call(fab, event.pointerId);
      saveFabPosition(fab);
      var wasDrag = state.drag.moved;
      state.drag = null;
      if (!wasDrag) {
        setPanelOpen(!state.open);
      }
    };
    fab.addEventListener("pointerdown", onPointerDown);
    global.addEventListener("pointermove", onPointerMove);
    global.addEventListener("pointerup", onPointerUp);
    global.addEventListener("pointercancel", onPointerUp);
  }
  function buildUi(targetRoot) {
    // [UI] Nasa header ang section tabs para mabilis lumipat ng queue habang maluwag pa rin ang listahan.
    targetRoot.innerHTML = '<div class="dept-head-approval-backdrop" aria-hidden="true"></div>' + '<button type="button" class="dept-head-approval-fab" id="dept-head-approval-fab" aria-label="Open approval desk" title="Approval desk">' + '<i class="fa fa-check-circle" aria-hidden="true"></i>' + '<span class="dept-head-approval-fab__badge" data-count="0">0</span>' + '<span class="dept-head-approval-fab__unread" data-notification-history-count data-count="0" aria-label="Unread notifications" hidden>0</span>' + "</button>" + '<div class="dept-head-approval-notification-tray" role="region" aria-label="New approval requests" aria-live="polite"></div>' + '<section class="dept-head-approval-panel" aria-hidden="true" role="dialog" aria-labelledby="dept-head-approval-title">' + '<header class="dept-head-approval-panel__head">' + '<div class="dept-head-approval-panel__head-copy">' + "<span>Department Head</span>" + '<strong id="dept-head-approval-title">Approval Desk</strong>' + '<small class="dept-head-approval-panel__status">Ready</small>' + "</div>"
    // Petsa + All Pending + search: nasa header na (hindi na sa sidebar) para nasa itaas lahat.
    + '<div class="dept-head-approval-sidebar__filters">' + '<div class="dept-head-approval-date-row" id="dept-head-approval-date-row" data-date-mode="day">' + '<label class="dept-head-approval-date" for="dept-head-approval-date">' + '<span>Request date</span>' + '<input type="hidden" id="dept-head-approval-date" class="dept-head-approval-date-native" aria-label="Request date" />' + '</label>' + '<button type="button" class="dept-head-approval-date-trigger" id="dept-head-approval-date-trigger" aria-label="Choose request date">' + '<span>Request date</span>' + '<b id="dept-head-approval-date-trigger-label">-</b>' + '</button>' + '<dialog id="dept-head-approval-calendar-dialog" class="calendar-popup">' + '<div class="calendar-popup-head"><strong>Select Request Date</strong>' + '<button type="button" class="calendar-popup-close" data-close-hub-calendar aria-label="Close">&times;</button></div>' + '<div id="dept-head-approval-calendar" class="travel-calendar" aria-label="Request date calendar"></div>' + '</dialog>' + '<select class="dept-head-approval-date-all" id="dept-head-approval-date-mode" aria-label="Request period">' + '<option value="day">Per day</option>' + '<option value="month">Whole month</option>' + '</select>' + '</div>' + '<div class="dept-head-approval-sidebar__search">' + '<input type="search" class="dept-head-approval-search" id="dept-head-approval-search" placeholder="Search employee or request" aria-label="Search employee or request" />' + '</div>' + '</div>' + '<div class="dept-head-approval-panel__head-actions">' + '<button type="button" class="dept-head-approval-icon-btn dept-head-approval-history-toggle" data-notification-history-toggle aria-label="Notification history" title="Notification history" aria-expanded="false"><i class="fa fa-bell"></i><span data-notification-history-count data-count="0" hidden>0</span></button>' + '<button type="button" class="dept-head-approval-icon-btn" data-hub-fullscreen aria-label="Full screen" title="Full screen" aria-pressed="false"><i class="fa fa-expand"></i></button>' + '<button type="button" class="dept-head-approval-icon-btn" data-hub-refresh aria-label="Refresh"><i class="fa fa-refresh"></i></button>' + '<button type="button" class="dept-head-approval-icon-btn" data-hub-close aria-label="Close"><i class="fa fa-times"></i></button>' + "</div>" + "</header>" + '<aside class="dept-head-approval-history" aria-label="Notification history" aria-hidden="true" hidden>' + '<header><div><strong>Notifications</strong><small>Last 10 new requests</small></div>' + '<div><button type="button" data-notification-test><i class="fa fa-volume-up" aria-hidden="true"></i> Test sound</button><button type="button" data-history-mark-all>Mark all read</button><button type="button" data-history-close aria-label="Close notification history"><i class="fa fa-times"></i></button></div></header>' + '<div class="dept-head-approval-history__list"></div>' + '</aside>'
    // Ang tabs ay direktang anak na ng panel (hindi na sa loob ng header) para magamit
    // bilang buong-taas na dark rail sa kaliwa — tingnan ang COMMAND RAIL sa CSS.
    + '<nav class="dept-head-approval-tabs dept-head-approval-panel__rail" aria-label="Approval sections"></nav>' + '<div class="dept-head-approval-panel__split">' + '<aside class="dept-head-approval-sidebar">' + '<div class="dept-head-approval-list" aria-label="Pending requests"></div>' + "</aside>" + '<main class="dept-head-approval-detail" aria-label="Request details"></main>' + "</div></section>";
  }
  function bindEvents() {
    var _root$querySelector, _root$querySelector2, _root$querySelector3, _root$querySelector4, _root$querySelector5, _root$querySelector7, _root$querySelector11, _root$querySelector12, _root$querySelector13, _root$querySelector14;
    var fab = root.querySelector(".dept-head-approval-fab");
    var backdrop = root.querySelector(".dept-head-approval-backdrop");
    bindDrag(fab);
    loadFabPosition(fab);
    backdrop === null || backdrop === void 0 || backdrop.addEventListener("click", () => setPanelOpen(false));
    root.addEventListener("error", event => {
      var _image$parentElement;
      var image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.closest(".dept-head-approval-detail__requester-avatar, .dept-head-approval-requester-profile__avatar, .dept-head-fuel-profile__portrait, .dept-head-approval-notification__avatar")) {
        return;
      }
      image.hidden = true;
      (_image$parentElement = image.parentElement) === null || _image$parentElement === void 0 || _image$parentElement.classList.remove("has-photo");
    }, true);
    (_root$querySelector = root.querySelector("[data-hub-close]")) === null || _root$querySelector === void 0 || _root$querySelector.addEventListener("click", () => setPanelOpen(false));
    (_root$querySelector2 = root.querySelector("[data-hub-refresh]")) === null || _root$querySelector2 === void 0 || _root$querySelector2.addEventListener("click", () => {
      void refreshQueues(true);
    });
    (_root$querySelector3 = root.querySelector("[data-hub-fullscreen]")) === null || _root$querySelector3 === void 0 || _root$querySelector3.addEventListener("click", () => {
      void togglePanelFullscreen();
    });
    var historyPanel = root.querySelector(".dept-head-approval-history");
    var historyToggle = root.querySelector("[data-notification-history-toggle]");
    historyToggle === null || historyToggle === void 0 || historyToggle.addEventListener("click", () => {
      state.historyOpen = !state.historyOpen;
      historyToggle.setAttribute("aria-expanded", String(state.historyOpen));
      renderNotificationHistory();
    });
    historyPanel === null || historyPanel === void 0 || historyPanel.addEventListener("click", event => {
      if (event.target.closest("[data-history-close]")) {
        state.historyOpen = false;
        historyToggle === null || historyToggle === void 0 || historyToggle.setAttribute("aria-expanded", "false");
        renderNotificationHistory();
        return;
      }
      if (event.target.closest("[data-history-mark-all]")) {
        markAllNotificationHistoryRead();
        return;
      }
      if (event.target.closest("[data-notification-test]")) {
        testNewRequestNotification();
        return;
      }
      var requestButton = event.target.closest("[data-history-request]");
      if (!requestButton) return;
      var section = requestButton.dataset.section || DEFAULT_SECTION;
      var id = requestButton.dataset.id || "";
      markNotificationHistoryRead(section, id);
      state.activeSection = section;
      saveLastSection(section);
      state.selected = id ? {
        section,
        id
      } : null;
      state.historyOpen = false;
      historyToggle === null || historyToggle === void 0 || historyToggle.setAttribute("aria-expanded", "false");
      renderHub();
    });
    var notificationTray = root.querySelector(".dept-head-approval-notification-tray");
    notificationTray === null || notificationTray === void 0 || notificationTray.addEventListener("click", event => {
      var notification = event.target.closest(".dept-head-approval-notification");
      if (!notification) return;
      if (event.target.closest("[data-notification-close]")) {
        hideNewRequestNotification(notification);
        return;
      }
      if (event.target.closest("[data-notification-sound]")) {
        setNotificationSoundMuted(!state.soundMuted);
        return;
      }
      if (!event.target.closest("[data-notification-open]")) return;
      var section = notification.dataset.section || DEFAULT_SECTION;
      var id = notification.dataset.id || "";
      state.activeSection = section;
      saveLastSection(section);
      setPanelOpen(true);
      state.selected = id ? {
        section,
        id
      } : null;
      markNotificationHistoryRead(section, id);
      renderHub();
      hideNewRequestNotification(notification);
    });
    notificationTray === null || notificationTray === void 0 || notificationTray.addEventListener("pointerover", event => {
      var notification = event.target.closest(".dept-head-approval-notification");
      if (notification && !notification.contains(event.relatedTarget)) pauseNotificationHide(notification);
    });
    notificationTray === null || notificationTray === void 0 || notificationTray.addEventListener("pointerout", event => {
      var notification = event.target.closest(".dept-head-approval-notification");
      if (notification && !notification.contains(event.relatedTarget)) scheduleNotificationHide(notification);
    });
    notificationTray === null || notificationTray === void 0 || notificationTray.addEventListener("focusin", event => {
      pauseNotificationHide(event.target.closest(".dept-head-approval-notification"));
    });
    notificationTray === null || notificationTray === void 0 || notificationTray.addEventListener("focusout", event => {
      var notification = event.target.closest(".dept-head-approval-notification");
      global.setTimeout(() => {
        if (notification && !notification.contains(document.activeElement)) scheduleNotificationHide(notification);
      }, 0);
    });
    document.addEventListener("fullscreenchange", syncFullscreenButton);
    (_root$querySelector4 = root.querySelector("#dept-head-approval-date-mode")) === null || _root$querySelector4 === void 0 || _root$querySelector4.addEventListener("change", event => {
      var _event$target;
      state.dateMode = ((_event$target = event.target) === null || _event$target === void 0 ? void 0 : _event$target.value) === "month" ? "month" : "day";
      state.selectedDate = state.dateMode === "month" ? currentMonthValue() : currentDayValue();
      resetDateScopedState();
      var dateInput = root.querySelector("#dept-head-approval-date");
      if (dateInput) {
        dateInput.setAttribute("aria-label", state.dateMode === "month" ? "Request month" : "Request date");
        dateInput.value = state.selectedDate;
      }
      var dateRow = root.querySelector("#dept-head-approval-date-row");
      if (dateRow) {
        dateRow.setAttribute("data-date-mode", state.dateMode);
      }
      var dialogTitle = root.querySelector("#dept-head-approval-calendar-dialog .calendar-popup-head strong");
      if (dialogTitle) {
        dialogTitle.textContent = state.dateMode === "month" ? "Select Request Month" : "Select Request Date";
      }
      hubCalendarView = null;
      renderHubCalendarTrigger();
      void refreshQueues();
    });
    (_root$querySelector5 = root.querySelector("#dept-head-approval-search")) === null || _root$querySelector5 === void 0 || _root$querySelector5.addEventListener("input", event => {
      var _event$target2;
      state.searchTerm = String(((_event$target2 = event.target) === null || _event$target2 === void 0 ? void 0 : _event$target2.value) || "");
      renderList();
    });
    var dateInput = root.querySelector("#dept-head-approval-date");
    if (dateInput) {
      dateInput.addEventListener("change", event => {
        var _event$target3;
        var nextValue = String(((_event$target3 = event.target) === null || _event$target3 === void 0 ? void 0 : _event$target3.value) || "").trim();
        state.selectedDate = nextValue ? normalizeSelectedDate(nextValue) : "";
        resetDateScopedState();
        dateInput.value = state.selectedDate;
        renderHubCalendarTrigger();
        void refreshQueues();
      });
      // [HUWAG] Wheel steps one day or one month, matching the selected period mode.
      dateInput.addEventListener("wheel", event => {
        event.preventDefault();
        shiftSelectedPeriod(event.deltaY < 0 ? -1 : 1);
        renderHubCalendarTrigger();
      }, {
        passive: false
      });
    }
    var calendarTrigger = root.querySelector("#dept-head-approval-date-trigger");
    if (calendarTrigger) {
      calendarTrigger.addEventListener("click", () => {
        var _root$querySelector6;
        renderHubCalendar();
        (_root$querySelector6 = root.querySelector("#dept-head-approval-calendar-dialog")) === null || _root$querySelector6 === void 0 || _root$querySelector6.showModal();
      });
    }
    (_root$querySelector7 = root.querySelector("#dept-head-approval-calendar-dialog")) === null || _root$querySelector7 === void 0 || _root$querySelector7.addEventListener("click", event => {
      if (event.target.closest("[data-close-hub-calendar]")) {
        var _root$querySelector8;
        (_root$querySelector8 = root.querySelector("#dept-head-approval-calendar-dialog")) === null || _root$querySelector8 === void 0 || _root$querySelector8.close();
        return;
      }
      var dayButton = event.target.closest("[data-hub-calendar-day]");
      if (dayButton) {
        var _root$querySelector9;
        var iso = dayButton.getAttribute("data-hub-calendar-day");
        state.selectedDate = normalizeSelectedDate(iso);
        resetDateScopedState();
        var input = root.querySelector("#dept-head-approval-date");
        if (input) {
          input.value = state.selectedDate;
        }
        renderHubCalendarTrigger();
        renderHubCalendar();
        void refreshQueues();
        (_root$querySelector9 = root.querySelector("#dept-head-approval-calendar-dialog")) === null || _root$querySelector9 === void 0 || _root$querySelector9.close();
        return;
      }
      var monthButton = event.target.closest("[data-hub-calendar-month]");
      if (monthButton) {
        var _root$querySelector10;
        var ym = monthButton.getAttribute("data-hub-calendar-month");
        state.selectedDate = normalizeSelectedDate(ym);
        resetDateScopedState();
        var _input = root.querySelector("#dept-head-approval-date");
        if (_input) {
          _input.value = state.selectedDate;
        }
        renderHubCalendarTrigger();
        renderHubCalendar();
        void refreshQueues();
        (_root$querySelector10 = root.querySelector("#dept-head-approval-calendar-dialog")) === null || _root$querySelector10 === void 0 || _root$querySelector10.close();
        return;
      }
      if (event.target.closest("[data-hub-calendar-prev]")) {
        shiftHubCalendarMonth(-1);
        return;
      }
      if (event.target.closest("[data-hub-calendar-next]")) {
        shiftHubCalendarMonth(1);
      }
    });
    (_root$querySelector11 = root.querySelector(".dept-head-approval-tabs")) === null || _root$querySelector11 === void 0 || _root$querySelector11.addEventListener("click", event => {
      var tab = event.target.closest(".dept-head-approval-tab");
      if (!tab) {
        return;
      }
      state.activeSection = tab.dataset.section || DEFAULT_SECTION;
      saveLastSection(state.activeSection);
      state.selected = null;
      renderHub();
    });
    (_root$querySelector12 = root.querySelector(".dept-head-approval-list")) === null || _root$querySelector12 === void 0 || _root$querySelector12.addEventListener("click", event => {
      var areaPin = event.target.closest("[data-area-pin]");
      if (areaPin) {
        var areaKey = String(areaPin.dataset.areaKey || "").trim();
        if (state.pinnedAreas.has(areaKey)) {
          state.pinnedAreas.delete(areaKey);
        } else if (areaKey) {
          state.pinnedAreas.add(areaKey);
        }
        savePinnedAreaKeys();
        renderList();
        return;
      }
      var areaToggle = event.target.closest("[data-area-toggle]");
      if (areaToggle) {
        var _areaKey = String(areaToggle.dataset.areaKey || "").trim();
        var expansionKey = areaExpansionKey(_areaKey);
        if (!state.pinnedAreas.has(_areaKey)) {
          if (state.expandedAreas.has(expansionKey)) {
            state.expandedAreas.delete(expansionKey);
          } else {
            state.expandedAreas.add(expansionKey);
          }
        }
        renderList();
        return;
      }
      var printBtn = event.target.closest("[data-print-request]");
      if (printBtn) {
        var _state$selected4, _state$selected5, _state$selected6;
        event.preventDefault();
        event.stopPropagation();
        var _itemBtn = printBtn.closest(".dept-head-approval-list-item");
        var sectionKey = printBtn.dataset.section || (_itemBtn === null || _itemBtn === void 0 ? void 0 : _itemBtn.dataset.section) || ((_state$selected4 = state.selected) === null || _state$selected4 === void 0 ? void 0 : _state$selected4.section) || state.activeSection;
        var itemId = printBtn.dataset.id || (_itemBtn === null || _itemBtn === void 0 ? void 0 : _itemBtn.dataset.id) || (((_state$selected5 = state.selected) === null || _state$selected5 === void 0 ? void 0 : _state$selected5.section) === sectionKey ? (_state$selected6 = state.selected) === null || _state$selected6 === void 0 ? void 0 : _state$selected6.id : "");
        var item = findItem(sectionKey, itemId);
        printApprovedRequest(sectionKey, item);
        return;
      }
      var itemBtn = event.target.closest(".dept-head-approval-list-item");
      if (!itemBtn) {
        return;
      }
      state.selected = {
        section: itemBtn.dataset.section || state.activeSection,
        id: itemBtn.dataset.id || ""
      };
      renderList();
      renderDetail();
    });
    (_root$querySelector13 = root.querySelector(".dept-head-approval-list")) === null || _root$querySelector13 === void 0 || _root$querySelector13.addEventListener("keydown", event => {
      var printBtn = event.target.closest("[data-print-request]");
      if (printBtn && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        printBtn.click();
      }
    });
    (_root$querySelector14 = root.querySelector(".dept-head-approval-detail")) === null || _root$querySelector14 === void 0 || _root$querySelector14.addEventListener("click", event => {
      var printBtn = event.target.closest("[data-print-request]");
      if (printBtn) {
        var _state$selected7, _state$selected8, _state$selected9;
        event.preventDefault();
        event.stopPropagation();
        var _sectionKey = printBtn.dataset.section || ((_state$selected7 = state.selected) === null || _state$selected7 === void 0 ? void 0 : _state$selected7.section) || state.activeSection;
        var itemId = printBtn.dataset.id || (((_state$selected8 = state.selected) === null || _state$selected8 === void 0 ? void 0 : _state$selected8.section) === _sectionKey ? (_state$selected9 = state.selected) === null || _state$selected9 === void 0 ? void 0 : _state$selected9.id : "");
        var item = findItem(_sectionKey, itemId);
        printApprovedRequest(_sectionKey, item);
        return;
      }
      var riderRemove = event.target.closest("[data-remove-rider]");
      if (riderRemove) {
        void removeFuelLinkRider(riderRemove);
        return;
      }
      var profileToggle = event.target.closest("[data-requester-profile]");
      var profileClose = event.target.closest("[data-requester-profile-close]");
      if (profileToggle || profileClose) {
        var panel = root.querySelector("[data-requester-profile-panel]");
        var toggle = root.querySelector("[data-requester-profile]");
        if (panel) {
          var shouldOpen = profileToggle ? panel.hidden : false;
          panel.hidden = !shouldOpen;
          toggle === null || toggle === void 0 || toggle.setAttribute("aria-expanded", String(shouldOpen));
        }
        return;
      }
      var actionBtn = event.target.closest("[data-action]");
      if (!actionBtn) {
        return;
      }
      var sectionKey = actionBtn.dataset.section || "";
      var id = actionBtn.dataset.id || "";
      var actionName = actionBtn.dataset.action || "";
      if (sectionKey && id && actionName) {
        void handleDecision(sectionKey, id, actionName);
      }
    });
    global.addEventListener("keydown", event => {
      if (event.key === "F1") {
        var _root21;
        event.preventDefault();
        event.stopPropagation();
        setPanelOpen(true);
        var panel = (_root21 = root) === null || _root21 === void 0 ? void 0 : _root21.querySelector(".dept-head-approval-panel");
        panel === null || panel === void 0 || panel.setAttribute("tabindex", "-1");
        panel === null || panel === void 0 || panel.focus({
          preventScroll: true
        });
        return;
      }
      if (event.key === "Escape" && state.open) {
        var _root22;
        var _panel = (_root22 = root) === null || _root22 === void 0 ? void 0 : _root22.querySelector(".dept-head-approval-panel");
        if (document.fullscreenElement === _panel) {
          return;
        }
        if (_panel !== null && _panel !== void 0 && _panel.classList.contains("is-fullscreen")) {
          _panel.classList.remove("is-fullscreen");
          syncFullscreenButton();
          return;
        }
        setPanelOpen(false);
      }
    });
  }
  function ensureRejectSlideStyles() {
    if (document.getElementById("dept-head-approval-reject-slide-style")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "dept-head-approval-reject-slide-style";
    style.textContent = `
            .dept-head-approval-list-item.is-reviewed--rejected {
                transform: translateX(26px);
                width: calc(100% - 26px);
            }
            .dept-head-approval-list-item.is-rejecting {
                pointer-events: none;
                transform: translateX(26px);
                width: calc(100% - 26px);
            }
        `;
    document.head.appendChild(style);
  }
  function ensureNewRequestNotificationStyles() {
    if (document.getElementById("dept-head-approval-notification-style")) return;
    var style = document.createElement("style");
    style.id = "dept-head-approval-notification-style";
    style.textContent = `
            #dept-head-approval-root .dept-head-approval-notification-tray {
                position: fixed; right: 22px; bottom: 94px; z-index: 4;
                display: flex; flex-direction: column; gap: 10px;
                width: min(390px, calc(100vw - 28px)); pointer-events: none;
            }
            #dept-head-approval-root .dept-head-approval-notification {
                position: relative; display: grid; grid-template-columns: 48px minmax(0, 1fr) 32px; gap: 12px;
                width: 100%; padding: 15px; border: 1px solid #e2e8f0; border-radius: 16px;
                background: #fff; color: #172033; pointer-events: auto;
                box-shadow: 0 20px 48px rgba(15, 23, 42, .22) !important;
                opacity: 0; transform: translateX(calc(100% + 32px)) scale(var(--notification-scale, 1));
                transform-origin: right bottom;
                transition: opacity .24s ease, transform .24s ease !important;
            }
            #dept-head-approval-root .dept-head-approval-notification.is-visible {
                opacity: var(--notification-opacity, 1); transform: translateX(0) scale(var(--notification-scale, 1));
            }
            #dept-head-approval-root .dept-head-approval-notification__avatar {
                position: relative; display: grid; width: 48px; height: 48px; place-items: center;
                overflow: hidden; border: 2px solid #fff; border-radius: 50%;
                background: #e8eef8; color: #334155; font-size: 13px; font-weight: 900;
                box-shadow: 0 0 0 1px #d7e0ec !important;
            }
            #dept-head-approval-root .dept-head-approval-notification__avatar img {
                position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
            }
            #dept-head-approval-root .dept-head-approval-notification__avatar.has-photo b { visibility: hidden; }
            #dept-head-approval-root .dept-head-approval-notification__avatar b {
                display: grid; width: 100%; height: 100%; place-items: center;
            }
            #dept-head-approval-root .dept-head-approval-notification__body { min-width: 0; }
            #dept-head-approval-root .dept-head-approval-notification__body > span {
                display: block; margin-bottom: 3px; color: #2563eb;
                font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
            }
            #dept-head-approval-root .dept-head-approval-notification__body > strong {
                display: block; overflow: hidden; color: #172033; font-size: 14px;
                line-height: 1.35; text-overflow: ellipsis; white-space: nowrap;
            }
            #dept-head-approval-root .dept-head-approval-notification__body > p {
                margin: 5px 0 2px; overflow: hidden; color: #475569; font-size: 12px;
                text-overflow: ellipsis; white-space: nowrap;
            }
            #dept-head-approval-root .dept-head-approval-notification__body > small {
                color: #64748b; font-size: 11px; font-weight: 700;
            }
            #dept-head-approval-root .dept-head-approval-notification__actions {
                display: flex; align-items: center; gap: 7px; margin-top: 11px;
            }
            #dept-head-approval-root .dept-head-approval-notification__actions button {
                min-height: 34px; border: 0; border-radius: 9px; cursor: pointer;
            }
            #dept-head-approval-root [data-notification-open] {
                display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                padding: 0 12px; background: #2563eb; color: #fff; font-size: 11px; font-weight: 800;
            }
            #dept-head-approval-root .dept-head-approval-notification__sound {
                width: 36px; padding: 0; background: #eff6ff; color: #1d4ed8;
            }
            #dept-head-approval-root .dept-head-approval-notification__close {
                display: grid; width: 32px; height: 32px; padding: 0; place-items: center;
                border: 0; border-radius: 9px; background: transparent; color: #64748b; cursor: pointer;
            }
            #dept-head-approval-root .dept-head-approval-notification button:focus-visible {
                outline: 3px solid rgba(37, 99, 235, .3); outline-offset: 2px;
            }
            #dept-head-approval-root .dept-head-approval-fab__unread {
                position: absolute; left: -7px; bottom: -7px; z-index: 3;
                min-width: 22px; height: 22px; padding: 0 6px; border: 2px solid #fff;
                border-radius: 999px; background: #2563eb; color: #fff;
                font-size: 10px; font-weight: 900; line-height: 18px; text-align: center;
            }
            #dept-head-approval-root .dept-head-approval-fab__unread[hidden],
            #dept-head-approval-root .dept-head-approval-history[hidden],
            #dept-head-approval-root .dept-head-approval-history-toggle span[hidden] { display: none !important; }
            #dept-head-approval-root .dept-head-approval-history-toggle { position: relative; overflow: visible; }
            #dept-head-approval-root .dept-head-approval-history-toggle span {
                position: absolute; right: -7px; top: -7px; min-width: 19px; height: 19px;
                padding: 0 5px; border: 2px solid #fff; border-radius: 999px;
                background: #2563eb; color: #fff; font-size: 9px; font-weight: 900; line-height: 15px;
            }
            #dept-head-approval-root .dept-head-approval-history {
                position: absolute; right: 16px; top: 76px; z-index: 12;
                width: min(380px, calc(100% - 32px)); max-height: min(520px, calc(100% - 94px));
                overflow: hidden; border: 1px solid #dbe4f0; border-radius: 16px;
                background: #fff; color: #172033; pointer-events: auto;
                box-shadow: 0 22px 54px rgba(15, 23, 42, .24) !important;
            }
            #dept-head-approval-root .dept-head-approval-history > header {
                display: flex; align-items: center; justify-content: space-between; gap: 12px;
                padding: 14px 14px 12px; border-bottom: 1px solid #e5e7eb; background: #f8fafc;
            }
            #dept-head-approval-root .dept-head-approval-history > header > div:first-child { display: grid; gap: 2px; }
            #dept-head-approval-root .dept-head-approval-history > header strong { font-size: 14px; }
            #dept-head-approval-root .dept-head-approval-history > header small { color: #64748b; font-size: 10px; }
            #dept-head-approval-root .dept-head-approval-history > header > div:last-child { display: flex; align-items: center; gap: 5px; }
            #dept-head-approval-root .dept-head-approval-history > header button {
                min-height: 30px; padding: 0 9px; border: 0; border-radius: 8px;
                background: #eaf2ff; color: #1d4ed8; font-size: 10px; font-weight: 800; cursor: pointer;
            }
            #dept-head-approval-root .dept-head-approval-history > header [data-history-close] { width: 30px; padding: 0; }
            #dept-head-approval-root .dept-head-approval-history__list {
                max-height: 440px; overflow: auto; overscroll-behavior: contain;
            }
            #dept-head-approval-root .dept-head-approval-history__item {
                position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr) 10px;
                gap: 10px; width: 100%; padding: 12px 14px; border: 0; border-bottom: 1px solid #eef2f7;
                background: #fff; color: #172033; text-align: left; cursor: pointer;
            }
            #dept-head-approval-root .dept-head-approval-history__item.is-unread { background: #eff6ff; }
            #dept-head-approval-root .dept-head-approval-history__item-icon {
                display: grid; width: 36px; height: 36px; place-items: center;
                border-radius: 10px; background: #dbeafe; color: #1d4ed8;
            }
            #dept-head-approval-root .dept-head-approval-history__item-copy { display: grid; min-width: 0; gap: 3px; }
            #dept-head-approval-root .dept-head-approval-history__item-copy b,
            #dept-head-approval-root .dept-head-approval-history__item-copy span {
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            #dept-head-approval-root .dept-head-approval-history__item-copy b { font-size: 11px; }
            #dept-head-approval-root .dept-head-approval-history__item-copy span { color: #475569; font-size: 11px; }
            #dept-head-approval-root .dept-head-approval-history__item-copy small { color: #64748b; font-size: 9px; }
            #dept-head-approval-root .dept-head-approval-history__unread-dot {
                align-self: center; width: 8px; height: 8px; border-radius: 50%; background: #2563eb;
            }
            #dept-head-approval-root .dept-head-approval-history__empty {
                display: grid; justify-items: center; gap: 7px; padding: 42px 20px; color: #64748b; text-align: center;
            }
            #dept-head-approval-root .dept-head-approval-history__empty i { font-size: 25px; }
            #dept-head-approval-root .dept-head-approval-history__empty strong { color: #334155; font-size: 12px; }
            #dept-head-approval-root .dept-head-approval-history__empty span { font-size: 10px; }
            @media (max-width: 520px) {
                #dept-head-approval-root .dept-head-approval-notification-tray {
                    right: 14px; bottom: 84px; width: calc(100vw - 28px); gap: 8px;
                }
                #dept-head-approval-root .dept-head-approval-notification {
                    grid-template-columns: 42px minmax(0, 1fr) 30px; gap: 10px; padding: 13px;
                }
                #dept-head-approval-root .dept-head-approval-notification__avatar { width: 42px; height: 42px; }
                #dept-head-approval-root .dept-head-approval-history {
                    left: 10px; right: 10px; top: 70px; width: auto; max-height: calc(100% - 80px);
                }
                #dept-head-approval-root .dept-head-approval-history__list { max-height: calc(100vh - 190px); }
            }
            @media (prefers-reduced-motion: reduce) {
                #dept-head-approval-root .dept-head-approval-notification {
                    transform: scale(var(--notification-scale, 1)); transition: opacity .01ms linear !important;
                }
            }
        `;
    document.head.appendChild(style);
  }
  function mount() {
    return _mount.apply(this, arguments);
  }
  function _mount() {
    _mount = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee25() {
      var session, dateInput, dateMode, dateRow;
      return _regeneratorRuntime().wrap(function _callee25$(_context25) {
        while (1) switch (_context25.prev = _context25.next) {
          case 0:
            session = readSession();
            _context25.t0 = !canApprove(session);
            if (!_context25.t0) {
              _context25.next = 6;
              break;
            }
            _context25.next = 5;
            return isConfiguredOvertimeApprover(session);
          case 5:
            _context25.t0 = !_context25.sent;
          case 6:
            if (!_context25.t0) {
              _context25.next = 8;
              break;
            }
            return _context25.abrupt("return");
          case 8:
            // Default to today; users can explicitly switch to the whole-month queue.
            state.dateMode = "day";
            state.selectedDate = currentDayValue();
            state.departmentFilter = getDepartmentFilter(session);
            root = document.getElementById("dept-head-approval-root");
            if (root) {
              _context25.next = 14;
              break;
            }
            return _context25.abrupt("return");
          case 14:
            root.hidden = false;
            root.setAttribute("aria-hidden", "false");
            ensureRejectSlideStyles();
            ensureNewRequestNotificationStyles();
            buildUi(root);
            dateInput = root.querySelector("#dept-head-approval-date");
            if (dateInput) {
              dateInput.value = state.selectedDate;
            }
            dateMode = root.querySelector("#dept-head-approval-date-mode");
            if (dateMode) {
              dateMode.value = state.dateMode;
            }
            dateRow = root.querySelector("#dept-head-approval-date-row");
            if (dateRow) {
              dateRow.setAttribute("data-date-mode", state.dateMode);
            }
            hubCalendarView = null;
            renderHubCalendarTrigger();
            bindEvents();
            renderHub();
            // Kailangang may unang user gesture bago payagan ng browser ang notification sound.
            global.addEventListener("pointerdown", unlockNotificationAudio, {
              once: true,
              capture: true
            });
            global.addEventListener("keydown", unlockNotificationAudio, {
              once: true,
              capture: true
            });
            state.lastClosedPollAt = Date.now();
            void refreshQueues();
            // Preload once in the background so the first approved Fuel print opens without waiting for its helper page.
            global.setTimeout(() => {
              void resolveFuelPrintActions().catch(() => {});
            }, 0);
            // ponytail: 30s lang kapag sarado para may alert nang hindi dinodoble ang API load ng bukas na desk.
            if (state.pollTimer) {
              global.clearInterval(state.pollTimer);
            }
            state.pollTimer = global.setInterval(() => {
              if (document.hidden || state.loading) return;
              if (state.open) {
                void refreshQueues();
                return;
              }
              if (Date.now() - state.lastClosedPollAt >= 30000) {
                state.lastClosedPollAt = Date.now();
                void refreshQueues();
              }
            }, 15000);
            document.addEventListener("visibilitychange", () => {
              if (!document.hidden && !state.open && !state.loading && Date.now() - state.lastClosedPollAt >= 30000) {
                state.lastClosedPollAt = Date.now();
                void refreshQueues();
              }
            });
            global.addEventListener("samelcii-approval-refresh", () => {
              if (!document.hidden) void refreshQueues();
            });
            global.addEventListener("samelcii-fuel-history-refresh", () => {
              if (!document.hidden) void refreshQueues();
            });
            global.addEventListener("message", event => {
              var _event$data;
              var type = String((event === null || event === void 0 || (_event$data = event.data) === null || _event$data === void 0 ? void 0 : _event$data.type) || "");
              if (!document.hidden && (type === "samelcii-approval-refresh" || type === "samelcii-fuel-history-refresh" || type === "samelcii-fuel-epass-saved" || type === "samelcii-fuel-travel-saved" || type === "samelcii-fuel-overtime-saved")) {
                void refreshQueues();
              }
            });
          case 40:
          case "end":
            return _context25.stop();
        }
      }, _callee25);
    }));
    return _mount.apply(this, arguments);
  }
  global.SamelciiDeptHeadApprovalHub = {
    mount,
    refresh: refreshQueues
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})(window);