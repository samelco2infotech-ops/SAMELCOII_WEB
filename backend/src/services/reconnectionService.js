/**
 * Purpose: Server-side persistence for ISD Reconnection Order requests — replaces the frontend's
 * old localStorage-only save (single-browser, no shared team visibility, lost on cache clear).
 * EDIT GUIDE: The whole form (pages/modules/reconnections/index.html) is serialized client-side
 * via FormData and saved here as one JSON blob (fields_json) — this is a brand-new Node-native
 * table, not a port of a legacy PHP schema, so there's no fixed wide-column layout to match. A
 * handful of columns (reconn_id, account_number, consumer_name, order_date, status) are pulled out
 * of that blob for search/sort/status filtering; fields_json stays the single source of truth for
 * restoring the full form, including the dynamic "Others" charge rows (otherFee2, otherFee3, ...)
 * which have no fixed count and would be awkward as real columns.
 * HUWAG BAGUHIN: table lives in the `membership` database (by request), not the connection's
 * default `it_program` — same cross-database pattern as membershipService.js's membershipTable().
 * The connection pool itself still points at it_program; `db.database`.`table` syntax is what
 * reaches into `membership` from there, so the connected user needs privileges on both.
 * HUWAG BAGUHIN: deleteRequest() refuses to delete a Completed request — this must be enforced
 * here, not just in the browser, since the frontend's disabled button can be bypassed (devtools,
 * a stale render, a direct API call).
 * HUWAG BAGUHIN: saveRequest() also upserts Reconnection fee / Sealing lead into the EXISTING
 * `membership`.`mempayments` ledger (by request — see syncMempayments), keyed by accountnumber,
 * same table membershipService.saveFees() already writes to for the Fees screen. Only those six
 * columns are touched; every other mempayments column (Membership Fee, Service Fee, etc.) is left
 * exactly as the Membership screen set it.
 */
const crypto = require('crypto');
const db = require('../config/database');

const RECONNECTIONS_DB = 'membership';
const sqlId = (name) => `\`${String(name).replace(/`/g, '``')}\``;
const table = (name) => `${sqlId(RECONNECTIONS_DB)}.${sqlId(name)}`;

const clean = (value) => String(value ?? '').trim();

const parseAmount = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

// Reconnection fee and Sealing lead get real columns (ReconFee/ReconFeeDate/ReconFeeOR,
// SealingLed/SealingLedDate/SealingLedOR) — same naming convention as mempayments — so they're
// directly queryable/reportable without parsing fields_json. "Others" stays JSON-only (see file
// header): it's an unbounded, dynamically-added list (+ Add another charge), so it doesn't fit a
// fixed column pair the way these two fixed, always-present charges do.
const EXTRA_COLUMNS = [
  ['ReconFee', 'DECIMAL(11,2) NULL'],
  ['ReconFeeDate', 'DATE NULL'],
  ['ReconFeeOR', 'VARCHAR(30) NULL'],
  ['SealingLed', 'DECIMAL(11,2) NULL'],
  ['SealingLedDate', 'DATE NULL'],
  ['SealingLedOR', 'VARCHAR(30) NULL'],
];

// mempayments is the cooperative's existing shared payment ledger (already used by the Membership
// Fees screen, keyed by accountnumber — no unique index on that column, hence the manual
// SELECT-then-branch upsert below instead of ON DUPLICATE KEY). SealingLed/SealingLedDate/
// SealingLedOR already exist there; ReconFee/ReconFeeDate/ReconFeeOR are new, added on demand.
const MEMPAYMENTS_EXTRA_COLUMNS = [
  ['ReconFee', 'DOUBLE(12,2) NULL'],
  ['ReconFeeDate', 'DATETIME NULL'],
  ['ReconFeeOR', 'VARCHAR(50) NULL'],
];
let mempaymentsSchemaEnsured = false;
const ensureMempaymentsSchema = async () => {
  if (mempaymentsSchemaEnsured) return;
  const existingColumns = await db.queryAll(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [RECONNECTIONS_DB, 'mempayments']
  );
  const existingNames = new Set(existingColumns.map((row) => row.COLUMN_NAME));
  for (const [name, definition] of MEMPAYMENTS_EXTRA_COLUMNS) {
    if (!existingNames.has(name)) {
      await db.execute(`ALTER TABLE ${table('mempayments')} ADD COLUMN ${sqlId(name)} ${definition}`);
    }
  }
  mempaymentsSchemaEnsured = true;
};

// Mirrors membershipService.saveFees()'s own upsert-by-accountnumber pattern — only touches the
// Reconnection/Sealing columns, never anything else already on that consumer's mempayments row
// (Membership Fee, Service Fee, etc. stay exactly as the Membership screen left them).
const syncMempayments = async (fields) => {
  const accountNumber = clean(fields.accountNumber);
  if (!accountNumber) return;
  await ensureMempaymentsSchema();

  // ponytail: ReconFee already existed on this table (not created by this file) as
  // NOT NULL DEFAULT 0.00, matching TotalAmount's convention — so it gets 0 instead of null when
  // no amount is set, unlike SealingLed (nullable here, matches the rest of mempayments' amount
  // columns).
  const values = {
    ReconFee: parseAmount(fields.reconnectionFee) ?? 0,
    ReconFeeDate: parseDate(fields.reconnectionOrDate),
    ReconFeeOR: clean(fields.reconnectionOr) || null,
    SealingLed: parseAmount(fields.sealingLead),
    SealingLedDate: parseDate(fields.sealingOrDate),
    SealingLedOR: clean(fields.sealingOr) || null,
  };
  const columns = Object.keys(values);

  const existing = await db.queryOne(
    `SELECT ApplyID FROM ${table('mempayments')} WHERE accountnumber = ? LIMIT 1`,
    [accountNumber]
  );
  if (existing) {
    const setSql = columns.map((col) => `${sqlId(col)} = ?`).join(', ');
    await db.execute(
      `UPDATE ${table('mempayments')} SET ${setSql} WHERE accountnumber = ?`,
      [...columns.map((col) => values[col]), accountNumber]
    );
  } else {
    const insertColumns = ['accountnumber', ...columns];
    const placeholders = insertColumns.map(() => '?').join(', ');
    await db.execute(
      `INSERT INTO ${table('mempayments')} (${insertColumns.map(sqlId).join(', ')}) VALUES (${placeholders})`,
      [accountNumber, ...columns.map((col) => values[col])]
    );
  }
};

// ponytail: schemaEnsured caches this past the first call per process — CREATE TABLE IF NOT
// EXISTS is cheap to repeat, but the information_schema lookup below (for the ALTER-if-missing
// columns) isn't worth paying on every single save/list/delete call.
let schemaEnsured = false;
const ensureSchema = async () => {
  if (schemaEnsured) return;
  // ponytail: only one auto-updating TIMESTAMP column per table on the prod MySQL 5.5 server (same
  // constraint dtrService.ensureAuditSchema documents) — created_at is that column; updated_at is
  // plain DATETIME and must be supplied explicitly on every save.
  await db.execute(`CREATE TABLE IF NOT EXISTS ${table('reconnection_requests')} (
    id VARCHAR(64) NOT NULL,
    reconn_id VARCHAR(50) NULL,
    account_number VARCHAR(50) NULL,
    consumer_name VARCHAR(255) NULL,
    order_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    fields_json LONGTEXT NOT NULL,
    created_by VARCHAR(40) NULL,
    updated_by VARCHAR(40) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_reconnection_reconn_id (reconn_id),
    KEY idx_reconnection_account (account_number),
    KEY idx_reconnection_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const existingColumns = await db.queryAll(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [RECONNECTIONS_DB, 'reconnection_requests']
  );
  const existingNames = new Set(existingColumns.map((row) => row.COLUMN_NAME));
  for (const [name, definition] of EXTRA_COLUMNS) {
    if (!existingNames.has(name)) {
      await db.execute(`ALTER TABLE ${table('reconnection_requests')} ADD COLUMN ${sqlId(name)} ${definition}`);
    }
  }
  schemaEnsured = true;
};

// Mirrors requestStatus(fields) on the frontend exactly — recomputed here (not trusted from the
// client) so status can't be spoofed into "Completed" to dodge the no-delete rule, or into
// "Pending" to hide a paid job from a report.
// "Completed" means the teller has collected payment (both required OR numbers are filled in) —
// that's what "ready to print" means for this form, not whether the lineman has done the field
// work yet (reconnectedAt/reconnectedBy get filled in later, after printing).
const deriveStatus = (fields) => (clean(fields.reconnectionOr) && clean(fields.sealingOr) ? 'Completed' : 'Pending');

const parseDate = (value) => {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const rowToRecord = (row) => {
  let fields = {};
  try {
    fields = JSON.parse(row.fields_json || '{}');
  } catch {
    fields = {};
  }
  return {
    id: row.id,
    savedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date(row.created_at).toISOString(),
    status: row.status,
    fields,
  };
};

// Reconnection ID format is "RC" + a zero-padded 5-digit running sequence (e.g. "RC00001"), one
// sequence for the whole table — no office/year segmentation. Scans the real table (not the capped
// 500-row listRequests()) so an older, less-recently-touched record can't be missed and cause a
// duplicate ID.
// ponytail: read-then-insert, not a DB sequence/lock — two saves in the same second could
// theoretically get the same number. Fine at this module's actual concurrency (one or two ISD
// staff, not a queue of simultaneous submitters); upgrade path is a UNIQUE KEY on (reconn_id) plus
// a retry loop if that ever becomes a real collision risk.
const RECONN_ID_PATTERN = /^RC(\d+)$/i;
const nextReconnId = async () => {
  await ensureSchema();
  const rows = await db.queryAll(`SELECT reconn_id FROM ${table('reconnection_requests')} WHERE reconn_id LIKE 'RC%'`);
  let maxSeq = 0;
  rows.forEach((row) => {
    const match = RECONN_ID_PATTERN.exec(clean(row.reconn_id));
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  });
  return `RC${String(maxSeq + 1).padStart(5, '0')}`;
};

// No pagination/search params — the frontend already does search + client-side pagination over
// the full list (it did before, against localStorage), so this just swaps the data source without
// touching that UI logic. Capped at 500 most-recently-touched requests, which comfortably covers
// this module's real scale (a single cooperative's reconnection queue, not a multi-tenant system).
const listRequests = async () => {
  await ensureSchema();
  const rows = await db.queryAll(
    `SELECT id, status, fields_json, created_at, updated_at
     FROM ${table('reconnection_requests')}
     ORDER BY COALESCE(updated_at, created_at) DESC
     LIMIT 500`
  );
  return rows.map(rowToRecord);
};

const getRequest = async (id) => {
  await ensureSchema();
  const target = clean(id);
  if (!target) throw Object.assign(new Error('Request ID is required.'), { status: 400 });
  const row = await db.queryOne(
    `SELECT id, status, fields_json, created_at, updated_at FROM ${table('reconnection_requests')} WHERE id = ? LIMIT 1`,
    [target]
  );
  if (!row) throw Object.assign(new Error('Reconnection request was not found.'), { status: 404 });
  return rowToRecord(row);
};

const saveRequest = async ({ id, fields, actor }) => {
  await ensureSchema();
  if (!fields || typeof fields !== 'object') {
    throw Object.assign(new Error('Fields are required.'), { status: 400 });
  }
  const target = clean(id) || crypto.randomUUID();
  const status = deriveStatus(fields);
  const actorUsercode = clean(actor?.usercode || actor?.username) || 'SYSTEM';
  const fieldsJson = JSON.stringify(fields);

  await db.execute(
    `INSERT INTO ${table('reconnection_requests')}
       (id, reconn_id, account_number, consumer_name, order_date, status, fields_json,
        ReconFee, ReconFeeDate, ReconFeeOR, SealingLed, SealingLedDate, SealingLedOR,
        created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       reconn_id = VALUES(reconn_id), account_number = VALUES(account_number), consumer_name = VALUES(consumer_name),
       order_date = VALUES(order_date), status = VALUES(status), fields_json = VALUES(fields_json),
       ReconFee = VALUES(ReconFee), ReconFeeDate = VALUES(ReconFeeDate), ReconFeeOR = VALUES(ReconFeeOR),
       SealingLed = VALUES(SealingLed), SealingLedDate = VALUES(SealingLedDate), SealingLedOR = VALUES(SealingLedOR),
       updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
    [
      target,
      clean(fields.reconnId) || null,
      clean(fields.accountNumber) || null,
      clean(fields.consumerName) || null,
      parseDate(fields.orderDate),
      status,
      fieldsJson,
      parseAmount(fields.reconnectionFee),
      parseDate(fields.reconnectionOrDate),
      clean(fields.reconnectionOr) || null,
      parseAmount(fields.sealingLead),
      parseDate(fields.sealingOrDate),
      clean(fields.sealingOr) || null,
      actorUsercode,
      actorUsercode,
    ]
  );

  await syncMempayments(fields);

  return getRequest(target);
};

const deleteRequest = async (id) => {
  await ensureSchema();
  const target = clean(id);
  if (!target) throw Object.assign(new Error('Request ID is required.'), { status: 400 });
  const row = await db.queryOne(`SELECT status FROM ${table('reconnection_requests')} WHERE id = ? LIMIT 1`, [target]);
  if (!row) throw Object.assign(new Error('Reconnection request was not found.'), { status: 404 });
  if (row.status === 'Completed') {
    throw Object.assign(new Error('Completed requests cannot be deleted.'), { status: 409 });
  }
  await db.execute(`DELETE FROM ${table('reconnection_requests')} WHERE id = ?`, [target]);
  return { deleted: true };
};

module.exports = {
  ensureSchema,
  deriveStatus,
  nextReconnId,
  listRequests,
  getRequest,
  saveRequest,
  deleteRequest,
  syncMempayments,
};
