/**
 * Offline check for validateMeterFields' executedAt normalization (no DB needed).
 * Run from backend/: node src/services/warehouseService.executedAt.selfcheck.js
 */
const assert = require('assert');
const { validateMeterFields, toDatetimeLocalValue } = require('./warehouseService');

const base = { meterBrand: 'X', sealNumber: '1', ercSealNumber: '2', meterSerial: '3', initialReading: '0', withdrawnBy: 'ab' };

// datetime-local input format ("2026-08-27T14:30") -> MySQL DATETIME ("2026-08-27 14:30:00").
const withMinutes = validateMeterFields({ ...base, executedAt: '2026-08-27T14:30' });
assert.strictEqual(withMinutes.executedAt, '2026-08-27 14:30:00', 'normalizes a datetime-local value to MySQL DATETIME');

// Blank/absent stays null so it isn't wrongly stored as a fake timestamp.
const blank = validateMeterFields({ ...base, executedAt: '' });
assert.strictEqual(blank.executedAt, null, 'blank executedAt stays null');
const absent = validateMeterFields({ ...base });
assert.strictEqual(absent.executedAt, null, 'missing executedAt stays null');

// Garbage input must be rejected, not silently stored.
assert.throws(() => validateMeterFields({ ...base, executedAt: 'not-a-date' }), /invalid/i, 'rejects an unparseable executedAt');

// toDatetimeLocalValue must handle whatever the DB driver hands back for the column — a real
// Date object (a proper DATETIME column) or a plain string (if the column ends up typed as text)
// — without throwing, and reject garbage without throwing too.
assert.strictEqual(toDatetimeLocalValue(new Date(2026, 7, 27, 14, 30)), '2026-08-27T14:30', 'formats a Date object');
assert.strictEqual(toDatetimeLocalValue('2026-08-27 14:30:00'), '2026-08-27T14:30', 'formats a MySQL datetime string');
assert.strictEqual(toDatetimeLocalValue(null), '', 'null stays blank');
assert.strictEqual(toDatetimeLocalValue(''), '', 'empty string stays blank');
assert.strictEqual(toDatetimeLocalValue('not-a-date'), '', 'unparseable value degrades to blank instead of throwing');

console.log('OK — warehouseService executedAt self-check passed');
