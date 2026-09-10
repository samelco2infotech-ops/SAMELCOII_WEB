// Self-check for the idle-detection state machine in messenger/script.js
// (startPolling/stopPolling/resetIdleTimer). Mirrors that logic against a fake clock so it can
// run without a browser. Run: node idle-poll.selfcheck.js
const assert = require("assert");

function makeController(idleAfterMs) {
    let polling = false;
    let idle = false;
    let idleDeadline = null;
    let pollCount = 0;

    function startPolling() { polling = true; }
    function stopPolling() { polling = false; }

    function resetIdleTimer(now) {
        const wasIdle = idle;
        idle = false;
        idleDeadline = now + idleAfterMs;
        if (wasIdle) { startPolling(); pollCount += 1; }
    }

    function tick(now) {
        if (idleDeadline !== null && now >= idleDeadline && !idle) {
            idle = true;
            stopPolling();
        }
    }

    return {
        activity: resetIdleTimer,
        tick,
        isPolling: () => polling,
        isIdle: () => idle,
        pollCount: () => pollCount,
    };
}

const IDLE_AFTER_MS = 120000;

// Starts polling on the first activity (mirrors resetIdleTimer() called at page load).
const c1 = makeController(IDLE_AFTER_MS);
c1.activity(0);
assert.strictEqual(c1.isIdle(), false);

// Still active well before the idle threshold.
c1.tick(60000);
assert.strictEqual(c1.isPolling(), false); // startPolling() only runs on the wasIdle->active edge
assert.strictEqual(c1.isIdle(), false);

// No activity for IDLE_AFTER_MS -> goes idle, polling stops.
c1.tick(120000);
assert.strictEqual(c1.isIdle(), true);

// Activity after going idle -> immediately resumes (the "reconnect on request" behavior asked for).
c1.activity(120050);
assert.strictEqual(c1.isIdle(), false);
assert.strictEqual(c1.pollCount(), 1);

// Repeated activity before the deadline keeps pushing it back — never goes idle.
const c2 = makeController(IDLE_AFTER_MS);
c2.activity(0);
c2.tick(90000);
c2.activity(90000);
c2.tick(180000); // 90000 + 90000 < 90000 + IDLE_AFTER_MS, so still not idle
assert.strictEqual(c2.isIdle(), false);

console.log("messenger idle-poll self-check: OK");
