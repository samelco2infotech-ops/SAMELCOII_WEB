/**
 * Check for getBookLabel: canonical books_raw.json first, live tblarea DB fallback second.
 * Verifies the print-preview address label resolves even for a book that was opened after the
 * last books_raw.json export (area 009 / book 054 was the real case that printed as raw "09/54"
 * on a Job Order instead of a name — see [FIX 2] on getBookLabel).
 * Run from backend/: node src/services/membershipService.bookLabel.selfcheck.js
 */
const assert = require('assert');
const db = require('../config/database');
const { getBookLabel } = require('./membershipService');

async function main() {
    // Real case (account 04200852): area 004 / book 020 is "JOSE ROÑO" in books_raw.json.
    const label = await getBookLabel('004', '020');
    assert.strictEqual(label, 'JOSE ROÑO', 'resolves the canonical name for a known area/book pair');

    // Unpadded input must normalize the same way (area "4", book "20").
    const labelUnpadded = await getBookLabel('4', '20');
    assert.strictEqual(labelUnpadded, 'JOSE ROÑO', 'pads area/book codes before lookup');

    // Real case (account 09540007): area 009 / book 054 is absent from books_raw.json but exists
    // in the live tblarea table — must resolve via the DB fallback, not revert to "".
    const dbFallback = await getBookLabel('009', '054');
    assert.ok(dbFallback, 'falls back to the live tblarea row when books_raw.json lacks the pair');

    // Unknown pair must not throw — returns an empty label so the frontend falls back gracefully.
    const unknown = await getBookLabel('999', '999');
    assert.strictEqual(unknown, '', 'unknown area/book pair returns an empty label, not an error');

    // Missing area or book must not throw either.
    const missing = await getBookLabel('', '020');
    assert.strictEqual(missing, '', 'missing area returns an empty label');

    console.log('OK — membershipService book-label self-check passed');
}

main().then(() => db.closePool()).then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
