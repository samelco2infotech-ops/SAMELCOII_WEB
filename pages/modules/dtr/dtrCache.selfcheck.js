// Run: node dtrCache.selfcheck.js
// Mirrors the TTL decision in readPersistedRows()/writePersistedRows() (script.js) — the fix for
// "DTR shows stale rows on every fresh load until 'Update data' is clicked". Keep this in sync if
// that logic changes.
const assert = require('assert');
const DTR_CACHE_TTL_MS = 15 * 60 * 1000;

function decide(rawEntry, now) {
  if (!rawEntry) return null;
  const parsed = JSON.parse(rawEntry);
  if (!parsed || Array.isArray(parsed) || !Array.isArray(parsed.items)) return null;
  if (now - Number(parsed.savedAt || 0) > DTR_CACHE_TTL_MS) return null;
  return parsed.items;
}

const items = [{ work_date: '2026-09-22', special_label: 'TRAVEL' }];
const savedAt = 1000000;

// Fresh entry, read immediately: cache hit.
assert.deepStrictEqual(decide(JSON.stringify({ items, savedAt }), savedAt), items);

// Fresh entry, read just under the TTL: still a hit.
assert.deepStrictEqual(decide(JSON.stringify({ items, savedAt }), savedAt + DTR_CACHE_TTL_MS - 1), items);

// Entry older than the TTL: expired, forces a refetch.
assert.strictEqual(decide(JSON.stringify({ items, savedAt }), savedAt + DTR_CACHE_TTL_MS + 1), null);

// Pre-TTL bare-array format (every entry already in someone's browser today): treated as expired,
// not trusted at an unknown age — this is what makes today's already-stale caches self-heal.
assert.strictEqual(decide(JSON.stringify(items), savedAt), null);

// No entry at all.
assert.strictEqual(decide(null, savedAt), null);

console.log('dtrCache.selfcheck: OK');
