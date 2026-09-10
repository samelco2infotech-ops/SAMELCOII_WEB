/**
 * Purpose: Verify the print-preview timeout/fallback pattern used in warehouse.js
 * (fetchWithTimeout + "books" lookup failure must not block printing).
 * Run with: node warehouse.printTimeout.selfcheck.js
 */
const assert = require('assert');

function fetchWithTimeout(fetchImpl, url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetchImpl(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function loadWithFallback(fetchImpl) {
    const data = { record: { AccountNumber: '123' } };
    try {
        const response = await fetchWithTimeout(fetchImpl, 'https://example.invalid/books', 50);
        const booksData = await response.json();
        data.addressLabel = booksData.items[0];
    } catch (_err) {
        // Matches warehouse.js: a hung/failed address-label lookup must not break the print flow.
    }
    return data;
}

async function main() {
    // A fetch that never resolves (simulates the observed server hang) must not hang the caller —
    // fetchWithTimeout's abort() should reject it well before the test's own timeout.
    const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const result = await loadWithFallback(hangingFetch);
    assert.strictEqual(result.addressLabel, undefined, 'hung books lookup must fall back without an address label');
    assert.strictEqual(result.record.AccountNumber, '123', 'core job order data must still be returned');

    // A fetch that resolves in time should still populate the label normally.
    const workingFetch = () => Promise.resolve({ json: () => Promise.resolve({ items: ['Street Label'] }) });
    const result2 = await loadWithFallback(workingFetch);
    assert.strictEqual(result2.addressLabel, 'Street Label', 'a fast books lookup should still fill the address label');

    console.log('warehouse.printTimeout.selfcheck: passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
