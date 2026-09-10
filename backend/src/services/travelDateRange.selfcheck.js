// Run: node src/services/travelDateRange.selfcheck.js
// Checks the multi-day Travel Request date range helpers used by createTravel/updateTravel and
// the DTR merge — the fix for "a 2-day approved Travel Order only shows day 1 on the DTR".
const assert = require('assert');
const { normalizeDateRange, expandDateRange } = require('./travelService');

// Two non-consecutive picks (e.g. Aug 22 and Aug 24) still bracket the whole trip, matching how
// tbleave stores a single continuous range.
assert.deepStrictEqual(
  normalizeDateRange(['2026-08-24', '2026-08-22'], ''),
  { dateFrom: '2026-08-22', dateTo: '2026-08-24' }
);

// Single day, no `dates` array (legacy payload / EPASS-style single date field).
assert.deepStrictEqual(normalizeDateRange([], '2026-08-22'), { dateFrom: '2026-08-22', dateTo: '2026-08-22' });

// No usable input at all.
assert.deepStrictEqual(normalizeDateRange([], ''), { dateFrom: '', dateTo: '' });

// Expanding a range reconstructs every day in it, for the edit form's date-chip list.
assert.deepStrictEqual(expandDateRange('2026-08-22', '2026-08-23'), ['2026-08-22', '2026-08-23']);

// A single-day range (date_to === date, or missing) expands to just that one day.
assert.deepStrictEqual(expandDateRange('2026-08-22', '2026-08-22'), ['2026-08-22']);
assert.deepStrictEqual(expandDateRange('2026-08-22', null), ['2026-08-22']);

// No start date -> nothing to expand.
assert.deepStrictEqual(expandDateRange('', ''), []);

console.log('travelDateRange.selfcheck: OK');
