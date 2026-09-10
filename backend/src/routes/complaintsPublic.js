/**
 * Purpose: Public, unauthenticated complaint tracker for consumers — look up a complaint
 * by its exact Reference No. or list complaints under an exact Contact No. Read-only.
 * HUWAG BAGUHIN: Only whitelisted, consumer-safe fields ever leave this file — never
 * spread a raw serializeComplaint() result into a response here.
 */
const express = require('express');
const database = require('../config/database');
const { successResponse, badRequestResponse, notFoundResponse } = require('../utils/response');
const { _selfcheck } = require('./complaints');
const { complaintSelect, serializeComplaint } = _selfcheck;

const router = express.Router();

// ponytail: single shared in-memory limiter (no Redis/deps). Ceiling: resets on process
// restart and doesn't share state across multiple app instances — fine for a single-box
// deployment; move to a shared store (Redis) if this ever runs behind a load balancer.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map();
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  if (entry.count >= RATE_LIMIT) {
    return res.status(429).json({ ok: false, message: 'Too many searches. Please try again later.' });
  }
  entry.count += 1;
  return next();
};
router.use(rateLimit);

const REF_PATTERN = /^CMP-\d{8}-\d+$/i;
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
// ContactNumber sometimes holds more than one number for the same consumer, separated by "/",
// ",", or a space (e.g. "09771429815/09451770875") — split on any non-digit run so a search for
// either individual number matches, instead of requiring the whole stored string to match.
const splitContactNumbers = (raw) => String(raw || '').split(/\D+/).filter(Boolean);

const publicItem = (row) => {
  const full = serializeComplaint(row);
  return {
    id: full.id,
    // Legacy rows have no ReferenceCode in the DB — full.id is a derived, display-only
    // fallback (e.g. "CMP-20260807-9439") that can't be looked back up by that string. Expose
    // the real row id so a "view details" click can round-trip reliably either way (see
    // lookupByRef's numeric-CompID branch below). Not sensitive — just an internal counter.
    databaseId: full.databaseId,
    type: full.type,
    status: full.status,
    requestedAt: full.reportedAt,
    description: full.description,
    address: full.address,
  };
};

async function lookupByRef(res, ref) {
  const isNumericId = /^\d+$/.test(ref);
  if (!isNumericId && !REF_PATTERN.test(ref)) {
    return badRequestResponse(res, 'Enter the full reference number, e.g. CMP-20260810-0001.');
  }
  const row = isNumericId
    ? await database.queryOne(`${complaintSelect(false, false)} WHERE c.CompID=? LIMIT 1`, [Number(ref)])
    : await database.queryOne(`${complaintSelect(false, false)} WHERE UPPER(c.ReferenceCode)=UPPER(?) LIMIT 1`, [ref]);
  if (!row) return notFoundResponse(res, 'No complaint found with that reference number.');
  const activities = await database.queryAll(
    `SELECT ActionType actionType, Details details, CreatedAt createdAt
     FROM complaint.complaint_activity WHERE CompID=? ORDER BY CreatedAt DESC LIMIT 50`,
    [row.CompID]
  );
  return successResponse(res, { item: publicItem(row), activities });
}

async function lookupByContact(res, contact, page) {
  const digits = digitsOnly(contact);
  if (digits.length < 7) {
    return badRequestResponse(res, 'Enter a valid contact number.');
  }
  // Narrow with a LIKE first (cheap, uses the stored value as-is), then confirm in JS that the
  // searched number is one of the individual numbers in that field — not just a digit substring
  // that happens to appear (which LIKE alone could false-positive on).
  const candidates = await database.queryAll(
    `${complaintSelect(false, false)} WHERE c.ContactNumber LIKE CONCAT('%',?,'%') ORDER BY c.ReceivedDateTime DESC`,
    [digits]
  );
  const matches = candidates.filter((row) => splitContactNumbers(row.ContactNumber).includes(digits));
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = 10;
  const total = matches.length;
  const pageRows = matches.slice((pageNum - 1) * pageSize, (pageNum - 1) * pageSize + pageSize);
  return successResponse(res, {
    items: pageRows.map(publicItem),
    total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

router.get('/', async (req, res, next) => {
  try {
    const { ref, contact, page } = req.query;
    if (ref) return await lookupByRef(res, String(ref).trim());
    if (contact) return await lookupByContact(res, String(contact).trim(), page);
    return badRequestResponse(res, 'Provide a ref or contact query parameter.');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
