/**
 * Purpose: Secured complaint queue, workflow, consumer lookup, map, and monitor API.
 * EDIT GUIDE: Keep browser compatibility actions until every client uses REST paths.
 * HUWAG BAGUHIN: Identity comes only from the verified JWT in req.user.
 */
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const database = require('../config/database');
const membershipService = require('../services/membershipService');
const {
  successResponse,
  createdResponse,
  badRequestResponse,
  notFoundResponse,
  conflictResponse,
  forbiddenResponse,
  unprocessableEntityResponse,
} = require('../utils/response');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const CONSUMER_DATABASES = ['dbsamelco_catbalogan', 'dbsamelco', 'dbsamelco_basey', 'dbsamelco_villareal'];
const MARKER_COLORS = new Set([
  '#10b981', '#3b82f6', '#f97316', '#ef4444', '#8b5cf6', '#6b7280',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#ec4899', '#f43f5e',
  '#f59e0b', '#eab308', '#84cc16', '#059669', '#475569', '#92400e',
]);

const normalizeComplaint = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const cleanLegacy = (value) => {
  const normalized = normalizeComplaint(value);
  return !normalized || normalized.toUpperCase() === 'NULL' || normalized === '<NULL>' ? '' : normalized;
};
const positiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const boundedLimit = (value, maximum, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, parsed)) : fallback;
};
const searchLimit = (value) => boundedLimit(value, 3, 3);
const listLimit = (value) => boundedLimit(value, 10, 10);
const mapFloat = (value, minimum, maximum) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
};
const markerColor = (value) => {
  const color = cleanLegacy(value).toLowerCase();
  return MARKER_COLORS.has(color) ? color : '#10b981';
};
const actorFor = (user = {}) => {
  const userCode = cleanLegacy(user.usercode ?? user.username ?? user.id ?? user.Id);
  const name = cleanLegacy(user.name ?? user.fullname ?? user.display_name ?? user.username ?? userCode);
  return { userCode, name: name || userCode };
};
const isAdminIdentity = (identity = {}) => {
  const text = [identity.role, identity.user_role, identity.usertype, identity.position, identity.username, identity.usercode]
    .map(cleanLegacy).join(' ').toLowerCase();
  return /(^|[^a-z])admin(istrator)?([^a-z]|$)/.test(text);
};
const leaseActive = (row = {}) => cleanLegacy(row.OwnerUserCode) !== ''
  && new Date(row.LeaseExpiresAt || 0).getTime() > Date.now();
const statusFromLegacy = (row = {}) => {
  if (cleanLegacy(row.Status).toUpperCase() === 'ACCOMPLISHED' || row.AccomplishedDateTime) return 'Done';
  if (Object.prototype.hasOwnProperty.call(row, 'WorkflowCompID')) {
    if (leaseActive(row)) return 'In Progress';
    if (row.ReceivedDateTime) return 'Pending';
  }
  if (cleanLegacy(row.ReceivedBy)) return 'In Progress';
  if (row.ExecRecDateTime) return 'Released';
  if (row.ReceivedDateTime) return 'Pending';
  return 'New';
};
const referenceFor = (row = {}) => {
  const stored = cleanLegacy(row.ReferenceCode);
  if (stored) return stored;
  const date = row.ReportedDateTime ? new Date(row.ReportedDateTime) : null;
  const day = date && !Number.isNaN(date.getTime())
    ? `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    : 'LEGACY';
  return `CMP-${day}-${String(row.CompID || 0).padStart(4, '0')}`;
};
const serializeComplaint = (row = {}) => {
  const account = cleanLegacy(row.AccountNumber);
  const activeLease = leaseActive(row);
  const status = statusFromLegacy(row);
  const handler = activeLease
    ? cleanLegacy(row.OwnerName) || cleanLegacy(row.ReceivedBy)
    : status === 'Done' ? cleanLegacy(row.ReceivedBy) : '';
  return {
    databaseId: Number(row.CompID) || 0,
    id: referenceFor(row),
    shortCode: cleanLegacy(row.ShortCode),
    account,
    consumer: cleanLegacy(row.ManualName) || (account ? `Account ${account}` : 'Unnamed consumer'),
    address: cleanLegacy(row.ManualAddress),
    reportedAt: row.ReportedDateTime || row.ReceivedDateTime || null,
    typeId: Number(row.TypeID) || null,
    type: cleanLegacy(row.Complaints) || 'Unspecified complaint',
    departmentId: Number(row.DeptID) || null,
    reported: cleanLegacy(row.ReportedBy),
    via: cleanLegacy(row.ReportedVia),
    location: cleanLegacy(row.Location),
    complaintArea: cleanLegacy(row.AreaCode),
    contact: cleanLegacy(row.ContactNumber),
    description: cleanLegacy(row.ComplaintRemarks),
    handlerUserCode: activeLease ? cleanLegacy(row.OwnerUserCode) : '',
    handler: handler || 'Unassigned',
    createdBy: cleanLegacy(row.EncodedByName),
    department: cleanLegacy(row.Attention) || (row.DeptID ? `Department ${Number(row.DeptID)}` : 'Unassigned'),
    actionTaken: cleanLegacy(row.ActionTaken),
    priority: ['High', 'Normal'].includes(row.WorkflowPriority) ? row.WorkflowPriority : 'Normal',
    leaseExpiresAt: activeLease ? row.LeaseExpiresAt : null,
    lastActivityAt: row.LastActivityAt || null,
    workflowEnabled: Object.prototype.hasOwnProperty.call(row, 'WorkflowCompID'),
    status,
    receivedAt: row.ReceivedDateTime || null,
    releasedAt: row.ExecRecDateTime || null,
    accomplishedAt: row.AccomplishedDateTime || null,
  };
};
const complaintSelect = (workflow = false, hasEncodedBy = false) => `SELECT c.CompID, c.ReferenceCode, c.AccountNumber, c.ManualName, c.ManualAddress,
  c.ReportedDateTime, c.TypeID, t.Complaints, c.DeptID, c.ReportedBy, c.ReportedVia,
  c.Location, c.AreaCode, c.ContactNumber, c.ComplaintRemarks, c.ReceivedDateTime,
  c.ExecRecDateTime, c.AccomplishedDateTime, c.ActionTaken, c.Status, c.Attention, c.ReceivedBy
  ${hasEncodedBy ? ', c.EncodedByName' : ", NULL AS EncodedByName"}
  ${workflow ? ', w.CompID AS WorkflowCompID, w.Priority AS WorkflowPriority, w.OwnerUserCode, w.OwnerName, w.LastActivityAt, w.LeaseExpiresAt' : ''}
  FROM complaint.complaints c
  LEFT JOIN complaint.complaintstype t ON t.TypeID = c.TypeID
  ${workflow ? 'LEFT JOIN complaint.complaint_workflow w ON w.CompID = c.CompID' : ''}`;
const serializeConsumer = (row = {}, sourceDb = '') => {
  const status = cleanLegacy(row.connectionStatus);
  return {
    accountNumber: cleanLegacy(row.accountNumber), fullName: cleanLegacy(row.fullName),
    address: cleanLegacy(row.address), meterNumber: cleanLegacy(row.meterNumber),
    contactNo: cleanLegacy(row.contactNo), areaCode: cleanLegacy(row.areaCode),
    bookCode: cleanLegacy(row.bookCode), status: status === 'A' ? 'Active' : status,
    poleNumber: cleanLegacy(row.poleNumber), feederNumber: cleanLegacy(row.feederNumber), sourceDb,
  };
};
const houseSelect = (hasMarkerColor = true) => `SELECT house_id, house_code, account_number, occupant_name, owner_name,
  house_number, street, purok_sitio, barangay, municipality, province, latitude, longitude,
  ${hasMarkerColor ? 'marker_color' : "'#10b981' AS marker_color"}, occupancy_type, connection_type, status, remarks FROM system_map_db.houses_tb`;
const serializeHouse = (row = {}) => ({
  id: Number(row.house_id) || 0, code: cleanLegacy(row.house_code), account: cleanLegacy(row.account_number),
  occupant: cleanLegacy(row.occupant_name), owner: cleanLegacy(row.owner_name), houseNumber: cleanLegacy(row.house_number),
  street: cleanLegacy(row.street), purokSitio: cleanLegacy(row.purok_sitio), barangay: cleanLegacy(row.barangay),
  municipality: cleanLegacy(row.municipality), province: cleanLegacy(row.province),
  latitude: Number(row.latitude) || 0, longitude: Number(row.longitude) || 0,
  markerColor: markerColor(row.marker_color), occupancyType: cleanLegacy(row.occupancy_type),
  connectionType: cleanLegacy(row.connection_type), status: cleanLegacy(row.status) || 'ACTIVE', remarks: cleanLegacy(row.remarks),
});
const houseCode = (account) => {
  const clean = String(account).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'UNKNOWN';
  return `ACC-${clean}-${crypto.createHash('sha256').update(String(account)).digest('hex').slice(0, 8).toUpperCase()}`;
};
// Short, easy-to-read/say complaint code (3 letters + 3 digits) shown on the printed slip,
// separate from the ReferenceCode (CMP-YYYYMMDD-####) used for search/tracking.
const SHORT_CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generateShortCode = () => {
  let code = '';
  for (let i = 0; i < 3; i += 1) code += SHORT_CODE_LETTERS[crypto.randomInt(SHORT_CODE_LETTERS.length)];
  for (let i = 0; i < 3; i += 1) code += String(crypto.randomInt(10));
  return code;
};
// ponytail: pre-check-then-insert has a race window under concurrent creates; the UNIQUE index
// on ShortCode is the real backstop. With a ~17.5M-code space and low creation volume, a
// collision here is very unlikely — if it ever fires as a DB error, the fix is to catch
// ER_DUP_ENTRY around the insert and retry with a fresh reserveUniqueShortCode() call.
const reserveUniqueShortCode = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateShortCode();
    const existing = await database.queryOne('SELECT CompID FROM complaint.complaints WHERE ShortCode=?', [candidate]);
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique complaint code. Try again.');
};
// Runs `attempt`; if it fails with a unique-key collision, retries up to `maxRetries` times,
// then runs `fallback` (which must be collision-proof on its own) instead of giving up.
const retryOnDupEntry = async (attempt, fallback, maxRetries = 2) => {
  for (let tries = 0; ; tries += 1) {
    try { return await attempt(); }
    catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      if (tries >= maxRetries) return fallback();
    }
  }
};
const fieldValues = (body = {}) => ({
  account: cleanLegacy(body.account), consumer: cleanLegacy(body.consumer), address: cleanLegacy(body.address),
  reported: cleanLegacy(body.reported), via: cleanLegacy(body.via), location: cleanLegacy(body.location),
  area: cleanLegacy(body.area), contact: cleanLegacy(body.contact), description: cleanLegacy(body.complaintRemarks ?? body.description),
  actionTaken: cleanLegacy(body.actionTaken), department: cleanLegacy(body.department), handler: cleanLegacy(body.handler),
  preparedBy: cleanLegacy(body.preparedBy),
});
const COMPLAINT_AREAS = ['MAIN', 'CATBALOGAN', 'VILLAREAL', 'BASEY'];
const invalidLength = (values) => {
  const limits = { account: 20, consumer: 500, address: 500, reported: 100, via: 100, location: 500, area: 10, contact: 100, description: 500, actionTaken: 500, department: 500, handler: 200, preparedBy: 200 };
  return Object.entries(limits).find(([field, limit]) => String(values[field] || '').length > limit);
};

let workflowCache = { value: null, checkedAt: 0 };
let markerColumnCache = { value: null, checkedAt: 0 };
const workflowAvailable = async () => {
  if (workflowCache.value !== null && Date.now() - workflowCache.checkedAt < 30000) return workflowCache.value;
  const row = await database.queryOne(`SELECT COUNT(*) total FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='complaint' AND TABLE_NAME IN ('complaint_workflow','complaint_activity','complaint_notifications')`);
  workflowCache = { value: Number(row?.total) === 3, checkedAt: Date.now() };
  return workflowCache.value;
};
const markerColumnAvailable = async () => {
  if (markerColumnCache.value !== null && Date.now() - markerColumnCache.checkedAt < 30000) return markerColumnCache.value;
  const row = await database.queryOne(`SELECT COUNT(*) total FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='system_map_db' AND TABLE_NAME='houses_tb' AND COLUMN_NAME='marker_color'`);
  markerColumnCache = { value: Number(row?.total) === 1, checkedAt: Date.now() };
  return markerColumnCache.value;
};
let encodedByColumnCache = { value: null, checkedAt: 0 };
// Records who actually encoded the complaint (for print's "Prepared By"), separate from
// ReportedBy which is the complainant. Falls back to false until complaints_prepared_by.sql runs.
const encodedByColumnAvailable = async () => {
  if (encodedByColumnCache.value !== null && Date.now() - encodedByColumnCache.checkedAt < 30000) return encodedByColumnCache.value;
  const row = await database.queryOne(`SELECT COUNT(*) total FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='complaint' AND TABLE_NAME='complaints' AND COLUMN_NAME='EncodedByName'`);
  encodedByColumnCache = { value: Number(row?.total) === 1, checkedAt: Date.now() };
  return encodedByColumnCache.value;
};
const requireWorkflow = async (res) => {
  if (await workflowAvailable()) return true;
  unprocessableEntityResponse(res, 'Run database/complaints_hybrid_upgrade.sql first.');
  return false;
};
const isAdmin = async (user) => {
  if (isAdminIdentity(user)) return true;
  const actor = actorFor(user);
  if (!actor.userCode) return false;
  const row = await database.queryOne('SELECT position, department FROM it_program.usertb WHERE usercode = ? LIMIT 1', [actor.userCode]);
  return isAdminIdentity(row || {});
};
const addActivity = async (connection, complaintId, actor, action, details) => {
  await connection.execute(`INSERT INTO complaint.complaint_activity
    (CompID, ActorUserCode, ActorName, ActionType, Details, CreatedAt) VALUES (?, ?, ?, ?, ?, NOW())`,
  [complaintId, actor.userCode || null, actor.name || null, action, String(details).slice(0, 500)]);
};

async function consumerSnapshots(accounts) {
  const unique = [...new Set(accounts.map(cleanLegacy).filter(Boolean))];
  if (!unique.length) return {};
  const placeholders = unique.map(() => '?').join(',');
  const snapshots = {};
  for (const source of CONSUMER_DATABASES) {
    const rows = await database.queryAll(`SELECT COALESCE(AccountNumber,'') accountNumber, COALESCE(Name,'') fullName,
      COALESCE(Address,'') address, COALESCE(Serial,'') meterNumber, COALESCE(conctac_no,'') contactNo,
      COALESCE(Area,'') areaCode, COALESCE(Book,'') bookCode, COALESCE(ConnStatus,'') connectionStatus,
      COALESCE(PoleNumber,'') poleNumber, COALESCE(FeederNumber,'') feederNumber
      FROM \`${source}\`.master WHERE AccountNumber IN (${placeholders})`, unique);
    for (const row of rows) if (!snapshots[cleanLegacy(row.accountNumber)]) snapshots[cleanLegacy(row.accountNumber)] = serializeConsumer(row, source);
  }
  return snapshots;
}
async function houseSnapshots(accounts) {
  const unique = [...new Set(accounts.map(cleanLegacy).filter(Boolean))];
  if (!unique.length) return {};
  const rows = await database.queryAll(`${houseSelect(await markerColumnAvailable())} WHERE account_number IN (${unique.map(() => '?').join(',')})
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY CASE WHEN UPPER(COALESCE(status,''))='ACTIVE' THEN 0 ELSE 1 END, house_id`, unique);
  const houses = {};
  for (const row of rows) if (!houses[cleanLegacy(row.account_number)]) houses[cleanLegacy(row.account_number)] = serializeHouse(row);
  return houses;
}

async function handleTypes(req, res) {
  const q = normalizeComplaint(req.query.q);
  const fields = { reportedBy: 'ReportedBy', reportedVia: 'ReportedVia', location: 'Location', area: 'AreaCode' };
  const field = cleanLegacy(req.query.field);
  if (field && !fields[field]) return unprocessableEntityResponse(res, 'Invalid complaint suggestion field.');
  if (q.length > (field ? 500 : 300)) return unprocessableEntityResponse(res, 'Complaint search is too long.');
  const limit = searchLimit(req.query.limit);
  if (field) {
    const column = fields[field];
    const items = await database.queryAll(`SELECT MIN(CompID) id, TRIM(${column}) value, COUNT(*) usageCount
      FROM complaint.complaints WHERE ${column} IS NOT NULL AND TRIM(${column})<>'' AND UPPER(TRIM(${column}))<>'NULL'
      AND (?='' OR LOCATE(LOWER(?),LOWER(${column}))>0) GROUP BY TRIM(${column})
      ORDER BY CASE WHEN LOWER(TRIM(${column}))=LOWER(?) THEN 0 WHEN LOCATE(LOWER(?),LOWER(TRIM(${column})))=1 THEN 1 ELSE 2 END,
      usageCount DESC, CHAR_LENGTH(${column}), ${column} LIMIT ?`, [q, q, q, q, limit]);
    return successResponse(res, { items, field });
  }
  const items = await database.queryAll(`SELECT MIN(TypeID) id, TRIM(Complaints) complaints, MIN(DeptID) departmentId
    FROM complaint.complaintstype WHERE Complaints IS NOT NULL AND TRIM(Complaints)<>''
    AND (?='' OR LOCATE(LOWER(?),LOWER(Complaints))>0) GROUP BY TRIM(Complaints)
    ORDER BY CASE WHEN LOWER(TRIM(Complaints))=LOWER(?) THEN 0 WHEN LOCATE(LOWER(?),LOWER(TRIM(Complaints)))=1 THEN 1 ELSE 2 END,
    LOCATE(LOWER(?),LOWER(Complaints)), CHAR_LENGTH(Complaints), Complaints LIMIT ?`, [q, q, q, q, q, limit]);
  return successResponse(res, { items });
}
async function handleTypeSave(req, res) {
  const complaints = normalizeComplaint(req.body?.complaints);
  const departmentId = positiveInt(req.body?.departmentId) || null;
  if (complaints.length < 2 || complaints.length > 300) return unprocessableEntityResponse(res, 'Complaint type must contain 2 to 300 characters.');
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT TypeID id, Complaints complaints, DeptID departmentId
      FROM complaint.complaintstype WHERE LOWER(TRIM(Complaints))=LOWER(?) LIMIT 1 FOR UPDATE`, [complaints]);
    if (rows[0]) { await connection.commit(); return successResponse(res, { item: rows[0], created: false }); }
    // ponytail: legacy table has no normalized unique key; transaction serializes the duplicate scan.
    const [insert] = await connection.execute('INSERT INTO complaint.complaintstype (Complaints,DeptID) VALUES (?,?)', [complaints, departmentId]);
    await connection.commit();
    return createdResponse(res, { item: { id: insert.insertId, complaints, departmentId }, created: true });
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
}

// ponytail: finds a complaint by its ID regardless of which day/month the queue is filtered
// to — the queue's date scope would otherwise hide anything not in the currently selected period.
async function handleComplaintLookup(req, res) {
  const raw = cleanLegacy(req.query.q);
  if (!raw) return unprocessableEntityResponse(res, 'Enter a complaint ID to search.');
  if (raw.length > 40) return unprocessableEntityResponse(res, 'Search text is too long.');
  const digits = raw.replace(/\D+/g, '');
  const workflow = await workflowAvailable();
  const row = await database.queryOne(`${complaintSelect(workflow, await encodedByColumnAvailable())}
    WHERE UPPER(c.ReferenceCode)=UPPER(?) OR c.CompID=? LIMIT 1`,
  [raw, digits ? Number(digits) : 0]);
  if (!row) return notFoundResponse(res, 'No complaint matches that ID.');
  const item = serializeComplaint(row);
  const consumers = await consumerSnapshots([row.AccountNumber]);
  const houses = await houseSnapshots([row.AccountNumber]);
  const consumer = consumers[item.account];
  if (consumer) Object.assign(item, {
    consumer: consumer.fullName || item.consumer, address: consumer.address || item.address,
    meterNumber: consumer.meterNumber, contact: item.contact || consumer.contactNo,
    areaCode: consumer.areaCode, bookCode: consumer.bookCode, poleNumber: consumer.poleNumber,
    feederNumber: consumer.feederNumber, consumerSource: consumer.sourceDb, accountStatus: consumer.status,
  });
  if (houses[item.account]) item.mapHouse = houses[item.account];
  return successResponse(res, { item });
}
// ponytail: limang pinakamalapit na tugma lang ang ibinabalik para mabilis ang popup;
// kapag kailangan ng full search page, gumawa ng hiwalay na paginated endpoint.
async function handleComplaintSearch(req, res) {
  const q = cleanLegacy(req.query.q);
  const status = cleanLegacy(req.query.status).toUpperCase();
  if (!['', 'DONE'].includes(status)) return unprocessableEntityResponse(res, 'Invalid complaint status filter.');
  if (q.length < 2 && status !== 'DONE') return unprocessableEntityResponse(res, 'Enter at least 2 characters to search.');
  if (q.length > 80) return unprocessableEntityResponse(res, 'Search text is too long.');
  const like = `%${q}%`;
  const digits = q.replace(/\D+/g, '');
  const workflow = await workflowAvailable();
  const matchSql = q ? `(UPPER(COALESCE(c.ReferenceCode,'')) LIKE UPPER(?) OR CAST(c.CompID AS CHAR) LIKE ?
      OR COALESCE(c.AccountNumber,'') LIKE ? OR COALESCE(c.ManualName,'') LIKE ?
      OR COALESCE(c.ManualAddress,'') LIKE ? OR COALESCE(t.Complaints,'') LIKE ?
      OR COALESCE(c.Location,'') LIKE ? OR COALESCE(c.AreaCode,'') LIKE ? OR COALESCE(c.ReportedBy,'') LIKE ?)` : '1=1';
  const statusSql = status === 'DONE'
    ? `(UPPER(TRIM(COALESCE(c.Status,'')))='ACCOMPLISHED' OR c.AccomplishedDateTime IS NOT NULL)` : '1=1';
  const rankSql = q ? `CASE
      WHEN UPPER(COALESCE(c.ReferenceCode,''))=UPPER(?) OR c.CompID=? THEN 0
      WHEN UPPER(COALESCE(c.ReferenceCode,'')) LIKE UPPER(?) THEN 1
      WHEN COALESCE(c.AccountNumber,'') LIKE ? THEN 2
      WHEN COALESCE(c.ManualName,'') LIKE ? THEN 3 ELSE 4 END,` : '';
  const params = q ? [like, like, like, like, like, like, like, like, like, q, digits ? Number(digits) : 0, like, like, like] : [];
  const rows = await database.queryAll(`${complaintSelect(workflow, await encodedByColumnAvailable())}
    WHERE ${matchSql} AND ${statusSql} ORDER BY ${rankSql}
      COALESCE(c.ReportedDateTime,c.ReceivedDateTime,c.AccomplishedDateTime,'1900-01-01') DESC,c.CompID DESC LIMIT 5`,
  params);
  const items = rows.map(serializeComplaint);
  const consumers = await consumerSnapshots(rows.map((row) => row.AccountNumber));
  for (const item of items) {
    const consumer = consumers[item.account];
    if (consumer) Object.assign(item, {
      consumer: consumer.fullName || item.consumer, address: consumer.address || item.address,
      meterNumber: consumer.meterNumber, contact: item.contact || consumer.contactNo,
      areaCode: consumer.areaCode, bookCode: consumer.bookCode, poleNumber: consumer.poleNumber,
      feederNumber: consumer.feederNumber, consumerSource: consumer.sourceDb, accountStatus: consumer.status,
    });
  }
  return successResponse(res, { items, limit: 5, status: status || 'ALL' });
}
// ponytail: only counts complaints that already have AreaCode saved — legacy rows created before
// this field existed won't appear until someone opens and re-saves them with an area picked.
async function handleAreaCounts(req, res) {
  const rows = await database.queryAll(`SELECT TRIM(AreaCode) area, COUNT(*) pending
    FROM complaint.complaints
    WHERE AreaCode IS NOT NULL AND TRIM(AreaCode)<>'' AND UPPER(TRIM(AreaCode))<>'NULL' AND COALESCE(Status,'')<>'ACCOMPLISHED'
    GROUP BY TRIM(AreaCode) ORDER BY pending DESC, area ASC LIMIT 100`);
  return successResponse(res, { items: rows.map((row) => ({ area: cleanLegacy(row.area), pending: Number(row.pending) || 0 })) });
}
async function handleList(req, res) {
  const workflow = await workflowAvailable();
  const limit = listLimit(req.query.limit);
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const scope = req.query.scope === 'month' ? 'month' : 'day';
  const period = normalizeComplaint(req.query[scope]);
  const pattern = scope === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  if (period && !pattern.test(period)) return unprocessableEntityResponse(res, `Invalid complaint ${scope}.`);
  const dateExpr = 'COALESCE(c.ReportedDateTime,c.ReceivedDateTime,c.AccomplishedDateTime)';
  const periodSql = scope === 'month' ? `DATE_FORMAT(${dateExpr},'%Y-%m')=?` : `DATE(${dateExpr})=?`;
  const now = new Date();
  const currentPeriod = scope === 'month' ? now.toISOString().slice(0, 7) : now.toISOString().slice(0, 10);
  const periodValue = period || currentPeriod;
  const where = `(c.TypeID IS NOT NULL OR (c.ManualName IS NOT NULL AND UPPER(TRIM(c.ManualName))<>'NULL')
    OR (c.ReportedBy IS NOT NULL AND UPPER(TRIM(c.ReportedBy))<>'NULL')) AND ${periodSql}`;
  const count = await database.queryOne(`SELECT COUNT(*) total FROM complaint.complaints c WHERE ${where}`, [periodValue]);
  const rows = await database.queryAll(`${complaintSelect(workflow, await encodedByColumnAvailable())} WHERE ${where}
    ORDER BY ${workflow ? "CASE WHEN w.Priority='High' THEN 0 ELSE 1 END," : ''}
    COALESCE(c.ReportedDateTime,c.ReceivedDateTime,c.AccomplishedDateTime,'1900-01-01') DESC,c.CompID DESC LIMIT ? OFFSET ?`,
  [periodValue, limit, offset]);
  const items = rows.map(serializeComplaint);
  const consumers = await consumerSnapshots(rows.map((row) => row.AccountNumber));
  const houses = await houseSnapshots(rows.map((row) => row.AccountNumber));
  for (const item of items) {
    const consumer = consumers[item.account];
    if (consumer) Object.assign(item, {
      consumer: consumer.fullName || item.consumer, address: consumer.address || item.address,
      meterNumber: consumer.meterNumber, contact: item.contact || consumer.contactNo,
      areaCode: consumer.areaCode, bookCode: consumer.bookCode, poleNumber: consumer.poleNumber,
      feederNumber: consumer.feederNumber, consumerSource: consumer.sourceDb, accountStatus: consumer.status,
    });
    if (houses[item.account]) item.mapHouse = houses[item.account];
  }
  const total = Number(count?.total) || 0;
  return successResponse(res, { items, total, limit, offset, page: Math.floor(offset / limit) + 1,
    totalPages: Math.max(1, Math.ceil(total / limit)), scope, period: periodValue, workflowEnabled: workflow });
}

// For print signoff blocks (e.g. "Approved By: ISD Manager") that need whoever currently holds a
// position, not a name hardcoded into the page — so a staffing change doesn't leave a stale name
// printed on every complaint.
async function handlePositionEmployee(req, res) {
  const q = normalizeComplaint(req.query.position);
  if (!q) return unprocessableEntityResponse(res, 'Position is required.');
  const item = await database.queryOne(`SELECT usercode,name,position,department
    FROM it_program.usertb WHERE position LIKE ? ORDER BY name LIMIT 1`, [`%${q}%`]);
  return successResponse(res, { item: item ? {
    usercode: cleanLegacy(item.usercode), name: cleanLegacy(item.name),
    position: cleanLegacy(item.position), department: cleanLegacy(item.department),
  } : null });
}
async function handleEmployeeSearch(req, res) {
  const q = normalizeComplaint(req.query.q);
  const limit = Math.min(500, Math.max(1, positiveInt(req.query.limit, 30)));
  if (q.length > 80) return unprocessableEntityResponse(res, 'Employee search is too long.');
  const like = `%${q}%`;
  const items = await database.queryAll(`SELECT Id id, COALESCE(usercode,'') usercode, COALESCE(name,'') name,
    COALESCE(position,'') position, COALESCE(department,'') department, COALESCE(area,'') area,
    COALESCE(profile_photo_url,'') storedPhoto,
    CASE WHEN profile_photo_blob IS NULL OR OCTET_LENGTH(profile_photo_blob)=0 THEN 0 ELSE 1 END hasPhoto
    FROM it_program.usertb WHERE usercode IS NOT NULL AND (?='' OR usercode LIKE ? OR name LIKE ?) ORDER BY name LIMIT ?`, [q, like, like, limit]);
  return successResponse(res, { items: items.map((row) => ({
    id: Number(row.id), usercode: cleanLegacy(row.usercode), name: cleanLegacy(row.name), position: cleanLegacy(row.position),
    department: cleanLegacy(row.department), area: cleanLegacy(row.area),
    profile_photo_url: Number(row.hasPhoto) === 1 ? `/api/complaints?action=employee_photo&id=${Number(row.id)}` : cleanLegacy(row.storedPhoto),
  })) });
}
async function handleEmployeePhoto(req, res) {
  const id = positiveInt(req.query.id);
  const photo = await database.queryOne('SELECT profile_photo_blob AS photoBlob, profile_photo_mime AS photoMime FROM it_program.usertb WHERE Id=? LIMIT 1', [id]);
  if (!photo?.photoBlob) return notFoundResponse(res, 'Employee photo not found.');
  const mime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(cleanLegacy(photo.photoMime)) ? cleanLegacy(photo.photoMime) : 'image/jpeg';
  res.set({ 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
  return res.send(photo.photoBlob);
}
async function handleActivity(req, res) {
  if (!await requireWorkflow(res)) return;
  const items = await database.queryAll(`SELECT ActivityID id, ActorUserCode actorUserCode, ActorName actorName,
    ActionType actionType, Details details, CreatedAt createdAt FROM complaint.complaint_activity
    WHERE CompID=? ORDER BY CreatedAt DESC,ActivityID DESC LIMIT 50`, [positiveInt(req.query.id)]);
  return successResponse(res, { items });
}
async function handleNotifications(req, res) {
  if (!await requireWorkflow(res)) return;
  const actor = actorFor(req.user);
  const items = await database.queryAll(`SELECT NotificationID id,CompID complaintId,SenderName senderName,
    NotificationType type,Message message,IsRead isRead,CreatedAt createdAt FROM complaint.complaint_notifications
    WHERE RecipientUserCode=? ORDER BY CreatedAt DESC,NotificationID DESC LIMIT 40`, [actor.userCode]);
  return successResponse(res, { items, unread: items.filter((item) => !Number(item.isRead)).length });
}
async function handleNotificationRead(req, res) {
  if (!await requireWorkflow(res)) return;
  const actor = actorFor(req.user); const id = positiveInt(req.body?.id);
  const params = [actor.userCode]; let suffix = '';
  if (id) { suffix = ' AND NotificationID=?'; params.push(id); }
  await database.execute(`UPDATE complaint.complaint_notifications SET IsRead=1,ReadAt=NOW() WHERE RecipientUserCode=?${suffix}`, params);
  return successResponse(res);
}

async function handleWorkflow(req, res) {
  if (!await requireWorkflow(res)) return;
  const id = positiveInt(req.body?.id); const operation = cleanLegacy(req.body?.operation).toLowerCase();
  const allowed = ['claim', 'heartbeat', 'transfer', 'release', 'complete', 'remark', 'priority'];
  if (!id || !allowed.includes(operation)) return unprocessableEntityResponse(res, 'Invalid complaint workflow action.');
  const actor = actorFor(req.user); const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT IGNORE INTO complaint.complaint_workflow (CompID,Priority) VALUES (?,?)', [id, 'Normal']);
    const [rows] = await connection.execute(`SELECT w.*,c.Status,c.AccomplishedDateTime FROM complaint.complaint_workflow w
      JOIN complaint.complaints c ON c.CompID=w.CompID WHERE w.CompID=? FOR UPDATE`, [id]);
    const row = rows[0];
    if (!row) { await connection.rollback(); return notFoundResponse(res, 'Complaint record not found.'); }
    const active = leaseActive(row); const mine = active && cleanLegacy(row.OwnerUserCode) === actor.userCode;
    const done = cleanLegacy(row.Status).toUpperCase() === 'ACCOMPLISHED' || row.AccomplishedDateTime;
    if (done && operation !== 'priority') { await connection.rollback(); return conflictResponse(res, 'Completed complaints cannot be reassigned.'); }
    if (operation === 'claim') {
      if (active && !mine) { await connection.rollback(); return conflictResponse(res, `${cleanLegacy(row.OwnerName) || 'Another employee'} is already handling this complaint.`); }
      await connection.execute(`UPDATE complaint.complaint_workflow SET OwnerUserCode=?,OwnerName=?,LastActivityAt=NOW(),
        LeaseExpiresAt=DATE_ADD(NOW(),INTERVAL 10 MINUTE),Version=Version+1 WHERE CompID=?`, [actor.userCode, actor.name, id]);
      await connection.execute(`UPDATE complaint.complaints SET ReceivedBy=?,AssignedUsercode=?,ReceivedDateTime=COALESCE(ReceivedDateTime,NOW()),
        Status='NOT ACCOMPLISH' WHERE CompID=?`, [actor.name, actor.userCode, id]);
      await addActivity(connection, id, actor, 'CLAIMED', `${actor.name} started handling the complaint`);
    } else if (operation === 'heartbeat') {
      if (!mine) { await connection.rollback(); return conflictResponse(res, 'Complaint ownership has expired or changed.'); }
      await connection.execute('UPDATE complaint.complaint_workflow SET LastActivityAt=NOW(),LeaseExpiresAt=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE CompID=?', [id]);
    } else if (operation === 'priority') {
      const priority = req.body?.priority === 'High' ? 'High' : 'Normal';
      await connection.execute('UPDATE complaint.complaint_workflow SET Priority=?,Version=Version+1 WHERE CompID=?', [priority, id]);
      await addActivity(connection, id, actor, 'PRIORITY', `Priority changed to ${priority}`);
    } else {
      if (!mine) { await connection.rollback(); return conflictResponse(res, 'Only the active owner can perform this action.'); }
      if (operation === 'transfer') {
        const recipientCode = cleanLegacy(req.body?.recipientUserCode);
        const [employees] = await connection.execute('SELECT usercode,name FROM it_program.usertb WHERE usercode=? LIMIT 1', [recipientCode]);
        if (!employees[0]) { await connection.rollback(); return unprocessableEntityResponse(res, 'Choose a valid employee.'); }
        const recipientName = cleanLegacy(employees[0].name) || recipientCode;
        await connection.execute(`UPDATE complaint.complaint_workflow SET OwnerUserCode=?,OwnerName=?,LastActivityAt=NOW(),
          LeaseExpiresAt=DATE_ADD(NOW(),INTERVAL 10 MINUTE),Version=Version+1 WHERE CompID=?`, [recipientCode, recipientName, id]);
        await connection.execute(`UPDATE complaint.complaints SET ReceivedBy=?,AssignedUsercode=?,ReceivedDateTime=COALESCE(ReceivedDateTime,NOW()),
          Status='NOT ACCOMPLISH' WHERE CompID=?`, [recipientName, recipientCode, id]);
        await connection.execute(`INSERT INTO complaint.complaint_notifications
          (CompID,RecipientUserCode,RecipientName,SenderUserCode,SenderName,NotificationType,Message) VALUES (?,?,?,?,?,?,?)`,
        [id, recipientCode, recipientName, actor.userCode, actor.name, 'TRANSFER', `${actor.name} transferred complaint #${id} to you.`]);
        await addActivity(connection, id, actor, 'TRANSFERRED', `Transferred to ${recipientName}`);
      } else if (operation === 'release') {
        await connection.execute('UPDATE complaint.complaint_workflow SET OwnerUserCode=NULL,OwnerName=NULL,LastActivityAt=NOW(),LeaseExpiresAt=NULL,Version=Version+1 WHERE CompID=?', [id]);
        await connection.execute(`UPDATE complaint.complaints SET ReceivedBy=NULL,AssignedUsercode=NULL,ReceivedDateTime=COALESCE(ReceivedDateTime,NOW()),Status='NOT ACCOMPLISH' WHERE CompID=?`, [id]);
        await connection.execute('DELETE FROM complaint.personnel_location WHERE complaint_id=?', [id]);
        await addActivity(connection, id, actor, 'RELEASED', 'Released back to the pending queue');
      } else if (operation === 'complete') {
        await connection.execute('UPDATE complaint.complaint_workflow SET OwnerUserCode=NULL,OwnerName=NULL,LastActivityAt=NOW(),LeaseExpiresAt=NULL,Version=Version+1 WHERE CompID=?', [id]);
        await connection.execute("UPDATE complaint.complaints SET Status='ACCOMPLISHED',AccomplishedDateTime=NOW(),ReceivedBy=?,AssignedUsercode=NULL WHERE CompID=?", [actor.name, id]);
        await connection.execute('DELETE FROM complaint.personnel_location WHERE complaint_id=?', [id]);
        await addActivity(connection, id, actor, 'COMPLETED', 'Complaint marked as done');
      } else if (operation === 'remark') {
        const remark = cleanLegacy(req.body?.remark);
        if (!remark || remark.length > 500) { await connection.rollback(); return unprocessableEntityResponse(res, 'Remark must contain 1 to 500 characters.'); }
        await connection.execute('UPDATE complaint.complaints SET ActionTaken=? WHERE CompID=?', [remark, id]);
        await connection.execute('UPDATE complaint.complaint_workflow SET LastActivityAt=NOW(),LeaseExpiresAt=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE CompID=?', [id]);
        await addActivity(connection, id, actor, 'REMARK', remark);
      }
    }
    await connection.commit();
    const item = await database.queryOne(`${complaintSelect(true, await encodedByColumnAvailable())} WHERE c.CompID=?`, [id]);
    return successResponse(res, { item: serializeComplaint(item || {}) });
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
}

// ponytail: area/book centroid is a same-neighborhood average of already-mapped houses, not a
// geocoder — good enough to land the map near the right barangay so the handler pans a short
// distance instead of the whole coop territory; a real geocoding service would replace this.
async function areaBookCenter(areaCode, bookCode, sourceDb) {
  if (!areaCode || !bookCode || !CONSUMER_DATABASES.includes(sourceDb)) return null;
  const row = await database.queryOne(`SELECT AVG(h.latitude) latitude, AVG(h.longitude) longitude, COUNT(*) sampleCount
    FROM system_map_db.houses_tb h JOIN \`${sourceDb}\`.master c ON TRIM(h.account_number)=TRIM(c.AccountNumber)
    WHERE c.Area=? AND c.Book=? AND h.latitude IS NOT NULL AND h.longitude IS NOT NULL`, [areaCode, bookCode]);
  const latitude = mapFloat(row?.latitude, -90, 90); const longitude = mapFloat(row?.longitude, -180, 180);
  return latitude !== null && longitude !== null && Number(row.sampleCount) > 0
    ? { latitude, longitude, sampleCount: Number(row.sampleCount) } : null;
}
async function handleHouseFocus(req, res) {
  const account = cleanLegacy(req.query.account); const q = cleanLegacy(req.query.q);
  const areaCode = cleanLegacy(req.query.areaCode); const bookCode = cleanLegacy(req.query.bookCode); const sourceDb = cleanLegacy(req.query.sourceDb);
  if (account.length > 50 || q.length > 180 || areaCode.length > 20 || bookCode.length > 20) return unprocessableEntityResponse(res, 'House map search is too long.');
  const conditions = []; const params = [];
  if (account) { conditions.push("TRIM(COALESCE(account_number,''))=?"); params.push(account); }
  if (!account) {
    const stop = new Set(['the', 'and', 'brgy', 'barangay', 'samar', 'province', 'philippines']);
    const tokens = [...new Set(q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter((token) => token.length >= 3 && !stop.has(token)))].slice(0, 5);
    if (tokens.length) {
      const text = `LOWER(CONCAT_WS(' ',COALESCE(house_number,''),COALESCE(street,''),COALESCE(purok_sitio,''),
        COALESCE(barangay,''),COALESCE(municipality,''),COALESCE(province,''),COALESCE(occupant_name,''),COALESCE(owner_name,'')))`;
      conditions.push(`(${tokens.map(() => `${text} LIKE ?`).join(' AND ')})`); params.push(...tokens.map((token) => `%${token}%`));
    }
  }
  const row = conditions.length ? await database.queryOne(`${houseSelect(await markerColumnAvailable())} WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND (${conditions.join(' OR ')})
    ORDER BY CASE WHEN UPPER(COALESCE(status,''))='ACTIVE' THEN 0 ELSE 1 END,house_id LIMIT 1`, params) : null;
  if (row) return successResponse(res, { focus: serializeHouse(row), areaCenter: null });
  const areaCenter = await areaBookCenter(areaCode, bookCode, sourceDb);
  return successResponse(res, { focus: null, areaCenter });
}
function mapBounds(req) {
  const north = mapFloat(req.query.north, -90, 90); const south = mapFloat(req.query.south, -90, 90);
  const east = mapFloat(req.query.east, -180, 180); const west = mapFloat(req.query.west, -180, 180);
  if (north === null || south === null || east === null || west === null || north <= south || east <= west) return null;
  return { north, south, east, west };
}
async function queryHousePoints(bounds, limit) {
  const rows = await database.queryAll(`${houseSelect(await markerColumnAvailable())} WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY house_id LIMIT ?`,
    [bounds.south, bounds.north, bounds.west, bounds.east, limit + 1]);
  const truncated = rows.length > limit; if (truncated) rows.pop();
  return { items: rows.map(serializeHouse), returned: rows.length, truncated };
}
// ponytail: meters are view-only here — read from meters_tb/houses_tb as already entered
// elsewhere; this map never creates or edits a meter row.
async function queryMeterPoints(bounds, limit) {
  const rows = await database.queryAll(`SELECT m.meter_id meterId, m.meter_number meterNumber, m.serial_number serialNumber,
    m.meter_type meterType, m.meter_condition meterCondition, m.status status, m.latitude latitude, m.longitude longitude,
    h.account_number accountNumber, h.occupant_name occupantName
    FROM system_map_db.meters_tb m LEFT JOIN system_map_db.houses_tb h ON h.house_id=m.house_id
    WHERE m.latitude BETWEEN ? AND ? AND m.longitude BETWEEN ? AND ? ORDER BY m.meter_id LIMIT ?`,
  [bounds.south, bounds.north, bounds.west, bounds.east, limit + 1]);
  const truncated = rows.length > limit; if (truncated) rows.pop();
  const items = rows.map((row) => ({ meterId: Number(row.meterId), meterNumber: cleanLegacy(row.meterNumber), serialNumber: cleanLegacy(row.serialNumber),
    meterType: cleanLegacy(row.meterType), meterCondition: cleanLegacy(row.meterCondition), status: cleanLegacy(row.status) || 'ACTIVE',
    latitude: mapFloat(row.latitude, -90, 90), longitude: mapFloat(row.longitude, -180, 180),
    accountNumber: cleanLegacy(row.accountNumber), occupantName: cleanLegacy(row.occupantName) }));
  return { items, returned: items.length, truncated };
}
async function handleHousePoints(req, res) {
  const bounds = mapBounds(req); if (!bounds) return unprocessableEntityResponse(res, 'Valid visible map bounds are required.');
  const limit = Math.min(750, Math.max(50, positiveInt(req.query.limit, 500)));
  const result = await queryHousePoints(bounds, limit);
  return successResponse(res, { ...result, limit });
}
async function handleHouseMeters(req, res) {
  const bounds = mapBounds(req); if (!bounds) return unprocessableEntityResponse(res, 'Valid visible map bounds are required.');
  const limit = Math.min(750, Math.max(50, positiveInt(req.query.limit, 500)));
  const result = await queryMeterPoints(bounds, limit);
  return successResponse(res, { ...result, limit });
}
// ponytail: single round trip for the map's move handler instead of two parallel fetches —
// houses and meters were the two things panning always needed together.
async function handleHouseDots(req, res) {
  const bounds = mapBounds(req); if (!bounds) return unprocessableEntityResponse(res, 'Valid visible map bounds are required.');
  const limit = Math.min(750, Math.max(50, positiveInt(req.query.limit, 500)));
  const [houses, meters] = await Promise.all([queryHousePoints(bounds, limit), queryMeterPoints(bounds, limit)]);
  return successResponse(res, { houses, meters, limit });
}
// ponytail: reuses Membership's own upload folder (uploads/member_map/<account>) — a captured
// top/street view is a property of the consumer's house, not of one complaint, so both modules
// sharing the same account-keyed folder is intentional, not accidental overlap.
async function handleMapCaptureStore(req, res) {
  const account = cleanLegacy(req.body?.account);
  const filename = cleanLegacy(req.body?.filename);
  const kind = cleanLegacy(req.body?.kind) === 'top' ? 'top' : 'street';
  if (!account) return unprocessableEntityResponse(res, 'Select a consumer account before saving a capture.');
  if (!filename || !req.file?.buffer) return unprocessableEntityResponse(res, 'Capture image is missing.');
  const result = await membershipService.saveStreetViewCapture({ account, filename, fileBuffer: req.file.buffer, kind });
  return successResponse(res, result);
}
async function handleHouseSave(req, res) {
  const account = cleanLegacy(req.body?.account); const occupant = cleanLegacy(req.body?.occupant); const address = cleanLegacy(req.body?.address);
  const latitude = mapFloat(req.body?.latitude, -90, 90); const longitude = mapFloat(req.body?.longitude, -180, 180);
  const color = markerColor(req.body?.markerColor);
  if (!account) return unprocessableEntityResponse(res, 'Select a consumer account before saving GPS.');
  if (account.length > 50 || occupant.length > 150 || address.length > 500) return unprocessableEntityResponse(res, 'House GPS details are too long.');
  if (latitude === null || longitude === null) return unprocessableEntityResponse(res, 'Click a valid house location on the map.');
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const hasMarkerColor = await markerColumnAvailable();
    const [rows] = await connection.execute(`${houseSelect(hasMarkerColor)} WHERE TRIM(COALESCE(account_number,''))=?
      ORDER BY CASE WHEN UPPER(COALESCE(status,''))='ACTIVE' THEN 0 ELSE 1 END,house_id LIMIT 1 FOR UPDATE`, [account]);
    let id; let created = false; const street = address.slice(0, 150);
    if (rows[0]) {
      id = Number(rows[0].house_id);
      await connection.execute(`UPDATE system_map_db.houses_tb SET latitude=?,longitude=?${hasMarkerColor ? ',marker_color=?' : ''},
        occupant_name=CASE WHEN TRIM(COALESCE(occupant_name,''))='' THEN ? ELSE occupant_name END,
        street=CASE WHEN TRIM(COALESCE(street,''))='' THEN ? ELSE street END,updated_at=NOW() WHERE house_id=?`,
      [latitude, longitude, ...(hasMarkerColor ? [color] : []), occupant, street, id]);
    } else {
      const [insert] = await connection.execute(`INSERT INTO system_map_db.houses_tb
        (house_code,account_number,occupant_name,street,latitude,longitude${hasMarkerColor ? ',marker_color' : ''},status,remarks,created_at,updated_at)
        VALUES (?,?,?,?,?,?${hasMarkerColor ? ',?' : ''},'ACTIVE','GPS captured from Complaints map',NOW(),NOW())`,
      [houseCode(account), account, occupant, street, latitude, longitude, ...(hasMarkerColor ? [color] : [])]);
      id = insert.insertId; created = true;
    }
    const [saved] = await connection.execute(`${houseSelect(hasMarkerColor)} WHERE house_id=? LIMIT 1`, [id]);
    await connection.commit(); return successResponse(res, { item: serializeHouse(saved[0] || {}), created });
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
}

async function handleConsumerSearch(req, res) {
  const q = cleanLegacy(req.query.search);
  if (q.length < 2 || q.length > 120) return unprocessableEntityResponse(res, 'Enter 2 to 120 characters of a consumer name or account number.');
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5); const selects = []; const params = [];
  for (const source of CONSUMER_DATABASES) {
    params.push(source, q, q, q, q, ...tokens.map((token) => `%${token}%`));
    selects.push(`SELECT COALESCE(AccountNumber,'') accountNumber,COALESCE(Name,'') fullName,COALESCE(Address,'') address,
      COALESCE(Serial,'') meterNumber,COALESCE(conctac_no,'') contactNo,COALESCE(Area,'') areaCode,COALESCE(Book,'') bookCode,
      COALESCE(ConnStatus,'') connectionStatus,COALESCE(PoleNumber,'') poleNumber,COALESCE(FeederNumber,'') feederNumber,? sourceDb,
      CASE WHEN LOWER(TRIM(COALESCE(AccountNumber,'')))=LOWER(?) OR LOWER(TRIM(COALESCE(Name,'')))=LOWER(?) THEN 0
      WHEN LOWER(TRIM(COALESCE(AccountNumber,''))) LIKE CONCAT(LOWER(?),'%') OR LOWER(TRIM(COALESCE(Name,''))) LIKE CONCAT(LOWER(?),'%') THEN 1 ELSE 2 END matchRank
      FROM \`${source}\`.master WHERE (COALESCE(AccountNumber,'')<>'' OR COALESCE(Name,'')<>'')
      ${tokens.map(() => "AND LOWER(CONCAT_WS(' ',COALESCE(Name,''),COALESCE(AccountNumber,''))) LIKE ?").join(' ')}`);
  }
  const rows = await database.queryAll(`SELECT * FROM (${selects.join(' UNION ALL ')}) matches
    ORDER BY matchRank,CHAR_LENGTH(fullName),fullName,accountNumber LIMIT 12`, params);
  const seen = new Set(); const items = [];
  for (const row of rows) {
    const item = serializeConsumer(row, cleanLegacy(row.sourceDb)); const key = `${item.accountNumber}|${item.fullName}`.toLowerCase();
    if (seen.has(key)) continue; seen.add(key); items.push(item); if (items.length === 3) break;
  }
  return successResponse(res, { items, total: items.length, limit: 3 });
}
async function handleConsumerDetail(req, res) {
  const account = cleanLegacy(req.query.account); const source = cleanLegacy(req.query.sourceDb);
  if (!account || !CONSUMER_DATABASES.includes(source)) return unprocessableEntityResponse(res, 'Consumer account and source database are required.');
  const row = await database.queryOne(`SELECT COALESCE(AccountNumber,'') accountNumber,COALESCE(Name,'') fullName,
    COALESCE(Address,'') address,COALESCE(Serial,'') meterNumber,COALESCE(conctac_no,'') contactNo,
    COALESCE(Area,'') areaCode,COALESCE(Book,'') bookCode,COALESCE(ConnStatus,'') connectionStatus,
    COALESCE(PoleNumber,'') poleNumber,COALESCE(FeederNumber,'') feederNumber FROM \`${source}\`.master WHERE AccountNumber=? LIMIT 1`, [account]);
  if (!row) return notFoundResponse(res, 'Consumer not found.');
  return successResponse(res, { record: serializeConsumer(row, source) });
}

// ponytail: the insert, ReferenceCode numbering, and workflow row are one transaction now.
// Before this, a failure between the insert and the ReferenceCode UPDATE left an orphaned
// NULL-reference row behind while the frontend saw a request failure and the draft stayed
// active for retry — which is exactly how duplicate rows piled up for the same complainant,
// seconds apart, all with ReferenceCode NULL. A DB-level failure now rolls back cleanly instead
// of leaving a half-written row for the next retry to pile on top of.
async function handleCreate(req, res) {
  const values = fieldValues(req.body); const invalid = invalidLength(values);
  if (invalid) return unprocessableEntityResponse(res, `${invalid[0]} must not exceed ${invalid[1]} characters.`);
  const typeId = positiveInt(req.body?.typeId); const priority = req.body?.priority === 'High' ? 'High' : 'Normal';
  if (!values.consumer || !values.address) return unprocessableEntityResponse(res, 'Consumer name and service address are required.');
  if (!COMPLAINT_AREAS.includes(values.area.toUpperCase())) return unprocessableEntityResponse(res, 'Choose a valid area.');
  if (!typeId) return unprocessableEntityResponse(res, 'Choose a valid complaint type.');
  const type = await database.queryOne('SELECT TypeID,DeptID FROM complaint.complaintstype WHERE TypeID=?', [typeId]);
  if (!type) return unprocessableEntityResponse(res, 'Complaint type no longer exists.');
  const workflow = await workflowAvailable();
  const hasEncodedBy = await encodedByColumnAvailable();
  const encoder = actorFor(req.user);
  // preparedBy lets whoever's actually typing this in credit a different staff member (e.g.
  // encoding on someone else's behalf) — the usercode column still records the real logged-in
  // actor for audit purposes; only the printed name can be overridden.
  const preparedByName = values.preparedBy || encoder.name;
  // ponytail: ShortCode insertion is disabled until database/complaints_short_code.sql is
  // actually applied to this DB (pending explicit go-ahead — the column doesn't exist yet).
  // Re-enable by uncommenting the line below and restoring ShortCode/shortCode in the INSERT.
  // const shortCode = await reserveUniqueShortCode();
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [insert] = await connection.execute(`INSERT INTO complaint.complaints
      (AccountNumber,ManualName,ManualAddress,ReportedDateTime,TypeID,DeptID,ReportedBy,ReportedVia,Location,AreaCode,ContactNumber,ComplaintRemarks,Status,Attention${hasEncodedBy ? ',EncodedByUserCode,EncodedByName' : ''})
      VALUES (?,?,?,NOW(),?,?,?,?,?,?,?,?,'NOT ACCOMPLISH',?${hasEncodedBy ? ',?,?' : ''})`,
    [values.account || null, values.consumer, values.address, type.TypeID, type.DeptID || null, values.reported || values.consumer,
      values.via || null, values.location || null, values.area || null, values.contact || null, values.description || null, values.department || null,
      ...(hasEncodedBy ? [encoder.userCode || null, preparedByName || null] : [])]);
    // Reference numbering resets to 1 each day (CMP-YYYYMMDD-1, -2, ...) instead of continuing
    // the legacy CompID sequence — matches the paper logbook convention this replaces.
    // ponytail: MySQL forbids updating a table while selecting from it in the same statement
    // (ER_UPDATE_TABLE_USED); wrapping the inner scan as a derived table sidesteps that.
    // ponytail: the COUNT(*) above races when two complaints are saved for the same day at
    // nearly the same moment (any two staff, any area) — both can compute the same day-number
    // before either commits, collide against uk_complaints_reference_code, and the entire save
    // aborts with a false "Duplicate entry" even though the complaint itself isn't a duplicate.
    // retryOnDupEntry absorbs that (the colliding save has usually committed by the next
    // attempt); once attempts are exhausted it falls back to a CompID-suffixed code, which is
    // guaranteed unique since CompID is the table's own primary key and always far larger than
    // a day's complaint count.
    await retryOnDupEntry(
      () => connection.execute(`UPDATE complaint.complaints c SET c.ReferenceCode=CONCAT('CMP-',DATE_FORMAT(c.ReportedDateTime,'%Y%m%d'),'-',
        (SELECT COUNT(*) FROM (SELECT CompID, ReportedDateTime FROM complaint.complaints) c2 WHERE DATE(c2.ReportedDateTime)=DATE(c.ReportedDateTime) AND c2.CompID<=c.CompID))
        WHERE c.CompID=?`, [insert.insertId]),
      () => connection.execute(`UPDATE complaint.complaints c SET c.ReferenceCode=CONCAT('CMP-',DATE_FORMAT(c.ReportedDateTime,'%Y%m%d'),'-',c.CompID) WHERE c.CompID=?`, [insert.insertId]),
    );
    if (workflow) {
      await connection.execute('INSERT INTO complaint.complaint_workflow (CompID,Priority) VALUES (?,?) ON DUPLICATE KEY UPDATE Priority=VALUES(Priority)', [insert.insertId, priority]);
      await addActivity(connection, insert.insertId, encoder, 'CREATED', 'New complaint encoded');
    }
    await connection.commit();
    const row = await database.queryOne(`${complaintSelect(workflow, hasEncodedBy)} WHERE c.CompID=?`, [insert.insertId]);
    return createdResponse(res, { item: serializeComplaint(row || {}) });
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
}
async function handleUpdate(req, res, explicitId = 0) {
  const id = explicitId || positiveInt(req.query.id); if (!id) return unprocessableEntityResponse(res, 'Invalid complaint record.');
  const values = fieldValues(req.body); const invalid = invalidLength(values);
  if (invalid) return unprocessableEntityResponse(res, `${invalid[0]} must not exceed ${invalid[1]} characters.`);
  // Type is optional on update — old clients don't send it, legacy rows may have a null TypeID,
  // and either case must not clobber TypeID/DeptID or block an otherwise-unrelated edit. The
  // frontend already validates the typed text via type_save before ever reaching here, so a
  // missing/invalid typeId at this point just means "leave the type alone," not an error.
  const typeId = positiveInt(req.body?.typeId) || null;
  const type = typeId ? await database.queryOne('SELECT TypeID,DeptID FROM complaint.complaintstype WHERE TypeID=?', [typeId]) : null;
  const existing = await database.queryOne('SELECT CompID,Status FROM complaint.complaints WHERE CompID=?', [id]);
  if (!existing) return notFoundResponse(res, 'Complaint record not found.');
  if (statusFromLegacy(existing) === 'Done') return conflictResponse(res, 'This complaint is Done and read-only.');
  const workflow = await workflowAvailable(); const actor = actorFor(req.user);
  // ponytail: only block the edit when someone else actively holds it (mirrors isLocked() on the
  // frontend) — a New/Pending complaint nobody has claimed yet must stay editable without forcing
  // Take Over first, same as the frontend's canEdit rule.
  if (workflow) {
    const owner = await database.queryOne('SELECT OwnerUserCode,LeaseExpiresAt FROM complaint.complaint_workflow WHERE CompID=? LIMIT 1', [id]);
    const activeLease = Boolean(owner && leaseActive(owner));
    if (activeLease && cleanLegacy(owner.OwnerUserCode) !== actor.userCode) return conflictResponse(res, 'Locked by another handler — take ownership before updating this complaint.');
  }
  const allowed = ['New', 'Pending', 'In Progress', 'Released', 'Done']; const status = allowed.includes(req.body?.status) ? req.body.status : 'New';
  const hasEncodedBy = await encodedByColumnAvailable();
  await database.execute(`UPDATE complaint.complaints SET AccountNumber=?,ManualName=?,ManualAddress=?,ReportedBy=?,ReportedVia=?,
    Location=?,AreaCode=?,ContactNumber=?,ComplaintRemarks=?,ActionTaken=?,Attention=?,ReceivedBy=?,
    TypeID=COALESCE(?,TypeID),DeptID=COALESCE(?,DeptID)${hasEncodedBy ? ',EncodedByName=COALESCE(?,EncodedByName)' : ''},
    ReceivedDateTime=CASE WHEN ? IN ('Pending','In Progress') THEN COALESCE(ReceivedDateTime,NOW()) ELSE ReceivedDateTime END,
    ExecRecDateTime=CASE WHEN ? IN ('Released','In Progress') THEN COALESCE(ExecRecDateTime,NOW()) ELSE ExecRecDateTime END,
    AccomplishedDateTime=CASE WHEN ?='Done' THEN COALESCE(AccomplishedDateTime,NOW()) ELSE NULL END,
    Status=CASE WHEN ?='Done' THEN 'ACCOMPLISHED' ELSE 'NOT ACCOMPLISH' END WHERE CompID=?`,
  [values.account || null, values.consumer || null, values.address || null, values.reported || null, values.via || null,
    values.location || null, values.area || null, values.contact || null, values.description || null, values.actionTaken || null, values.department || null,
    values.handler && values.handler !== 'Unassigned' ? values.handler : null, type?.TypeID || null, type?.DeptID || null,
    ...(hasEncodedBy ? [values.preparedBy || null] : []), status, status, status, status, id]);
  if (workflow) await database.execute('INSERT INTO complaint.complaint_workflow (CompID,Priority) VALUES (?,?) ON DUPLICATE KEY UPDATE Priority=VALUES(Priority)', [id, req.body?.priority === 'High' ? 'High' : 'Normal']);
  const row = await database.queryOne(`${complaintSelect(workflow, hasEncodedBy)} WHERE c.CompID=?`, [id]); return successResponse(res, { item: serializeComplaint(row || {}) });
}
// ponytail: same lock rule as update — anyone can delete a New/Pending/unclaimed complaint (e.g.
// to clean up an accidental duplicate), but not one someone else is actively handling.
async function handleDelete(req, res) {
  const id = positiveInt(req.body?.id ?? req.query.id); if (!id) return unprocessableEntityResponse(res, 'Invalid complaint record.');
  const existing = await database.queryOne('SELECT CompID FROM complaint.complaints WHERE CompID=?', [id]);
  if (!existing) return notFoundResponse(res, 'Complaint record not found.');
  const workflow = await workflowAvailable(); const actor = actorFor(req.user);
  if (workflow) {
    const owner = await database.queryOne('SELECT OwnerUserCode,LeaseExpiresAt FROM complaint.complaint_workflow WHERE CompID=? LIMIT 1', [id]);
    const activeLease = Boolean(owner && leaseActive(owner));
    if (activeLease && cleanLegacy(owner.OwnerUserCode) !== actor.userCode) return conflictResponse(res, 'Locked by another handler — take ownership before deleting this complaint.');
  }
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM complaint.complaint_notifications WHERE CompID=?', [id]);
    await connection.execute('DELETE FROM complaint.complaint_activity WHERE CompID=?', [id]);
    await connection.execute('DELETE FROM complaint.complaint_workflow WHERE CompID=?', [id]);
    await connection.execute('DELETE FROM complaint.complaints WHERE CompID=?', [id]);
    await connection.commit();
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  return successResponse(res, { deleted: true, id });
}
async function handleMonitorAccess(req, res) { return successResponse(res, { allowed: await isAdmin(req.user) }); }
async function handleMonitorSnapshot(req, res) {
  if (!await isAdmin(req.user)) return forbiddenResponse(res, 'Administrator access is required for the complaint monitor.');
  if (!await requireWorkflow(res)) return;
  const hasMarkerColor = await markerColumnAvailable();
  const rows = await database.queryAll(`SELECT c.CompID,c.AccountNumber,c.ManualName,c.ManualAddress,c.ReportedDateTime,c.TypeID,t.Complaints,
    c.DeptID,c.ReportedBy,c.ReportedVia,c.Location,c.ContactNumber,c.ComplaintRemarks,c.ReceivedDateTime,c.ExecRecDateTime,
    c.AccomplishedDateTime,c.ActionTaken,c.Status,c.Attention,c.ReceivedBy,c.AssignedUsercode,c.Latitude ComplaintLatitude,c.Longitude ComplaintLongitude,
    w.CompID WorkflowCompID,w.Priority WorkflowPriority,w.OwnerUserCode,w.OwnerName,w.LastActivityAt,w.LeaseExpiresAt,
    h.latitude HouseLatitude,h.longitude HouseLongitude,${hasMarkerColor ? 'h.marker_color' : "'#10b981'"} HouseMarkerColor
    FROM complaint.complaints c LEFT JOIN complaint.complaintstype t ON t.TypeID=c.TypeID
    LEFT JOIN complaint.complaint_workflow w ON w.CompID=c.CompID LEFT JOIN system_map_db.houses_tb h ON h.house_id=(
      SELECT h2.house_id FROM system_map_db.houses_tb h2 WHERE TRIM(COALESCE(h2.account_number,''))=TRIM(COALESCE(c.AccountNumber,''))
      AND h2.latitude IS NOT NULL AND h2.longitude IS NOT NULL ORDER BY CASE WHEN UPPER(COALESCE(h2.status,''))='ACTIVE' THEN 0 ELSE 1 END,h2.house_id LIMIT 1)
    ORDER BY CASE WHEN c.AccomplishedDateTime IS NULL AND UPPER(COALESCE(c.Status,''))<>'ACCOMPLISHED' THEN 0 ELSE 1 END,c.ReportedDateTime DESC,c.CompID DESC LIMIT 10000`);
  const stats = { total: 0, active: 0, high: 0, done: 0, mapped: 0 };
  const items = rows.map((row) => {
    const record = serializeComplaint(row); const latitude = mapFloat(row.ComplaintLatitude, -90, 90) ?? mapFloat(row.HouseLatitude, -90, 90);
    const longitude = mapFloat(row.ComplaintLongitude, -180, 180) ?? mapFloat(row.HouseLongitude, -180, 180); const active = record.status !== 'Done';
    stats.total += 1; stats[active ? 'active' : 'done'] += 1; if (active && record.priority === 'High') stats.high += 1; if (latitude !== null && longitude !== null) stats.mapped += 1;
    return { databaseId: record.databaseId, id: record.id, consumer: record.consumer, account: record.account, type: record.type,
      location: record.location || record.address, department: record.department,
      handler: record.handler !== 'Unassigned' ? record.handler : cleanLegacy(row.OwnerName) || cleanLegacy(row.ReceivedBy) || 'Unassigned',
      handlerUserCode: cleanLegacy(row.OwnerUserCode ?? row.AssignedUsercode), priority: record.priority, status: record.status,
      reportedAt: record.reportedAt, lastActivityAt: record.lastActivityAt, latitude, longitude,
      markerColor: markerColor(row.HouseMarkerColor), active };
  });
  const positions = await database.queryAll(`SELECT p.usercode UserCode,p.complaint_id CompID,p.latitude Latitude,p.longitude Longitude,p.updated_at UpdatedAt,
    COALESCE(NULLIF(u.name,''),p.usercode) EmployeeName FROM complaint.personnel_location p
    LEFT JOIN it_program.usertb u ON u.usercode=p.usercode WHERE p.updated_at>=DATE_SUB(NOW(),INTERVAL 2 MINUTE) ORDER BY p.updated_at DESC`);
  return successResponse(res, { items, positions: positions.map((row) => ({ userCode: cleanLegacy(row.UserCode), name: cleanLegacy(row.EmployeeName),
    complaintId: Number(row.CompID) || 0, latitude: Number(row.Latitude), longitude: Number(row.Longitude),
    accuracy: null, updatedAt: row.UpdatedAt })), stats,
  generatedAt: new Date().toISOString(), truncated: items.length >= 10000 });
}

// ponytail: complaint.departments (the real lookup table) is empty in this DB, so there is no
// authoritative DeptID->name source. Only 14 (CORPLAN) and 5 (ESD) are confirmed by matching
// their complaint-type lists against the paper report; everything else prints as "Department N"
// until SAMELCO confirms the rest — do not guess the others, a wrong label on a submitted report
// is worse than a numbered placeholder.
const DEPARTMENT_LABELS = { 14: 'CORPLAN', 5: 'ESD' };
const departmentLabel = (deptId) => DEPARTMENT_LABELS[deptId] || (deptId ? `Department ${deptId}` : 'Unassigned');
const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const reportAreaFilter = (req) => {
  const area = normalizeComplaint(req.query.area).toUpperCase();
  if (!area || area === 'ALL') return '';
  if (!COMPLAINT_AREAS.includes(area)) return undefined;
  return area;
};
async function handleReportSummary(req, res) {
  const from = normalizeComplaint(req.query.from); const to = normalizeComplaint(req.query.to);
  if (!REPORT_DATE_PATTERN.test(from) || !REPORT_DATE_PATTERN.test(to)) return unprocessableEntityResponse(res, 'Valid from/to dates are required.');
  const area = reportAreaFilter(req); if (area === undefined) return unprocessableEntityResponse(res, 'Invalid area filter.');
  const userCode = normalizeComplaint(req.query.user);
  const conditions = ['DATE(c.ReportedDateTime) BETWEEN ? AND ?']; const params = [from, to];
  if (area) { conditions.push('UPPER(TRIM(c.AreaCode))=?'); params.push(area); }
  if (userCode && userCode !== 'ALL') { conditions.push('c.EncodedByUserCode=?'); params.push(userCode); }
  // statusGroup mirrors statusFromLegacy's first check (Status='ACCOMPLISHED' or a completion
  // date recorded) — good enough for a DONE/PENDING split without needing the workflow join this
  // report doesn't otherwise use.
  const rows = await database.queryAll(`SELECT t.DeptID deptId, t.Complaints type, UPPER(TRIM(COALESCE(c.AreaCode,''))) area,
    CASE WHEN UPPER(COALESCE(c.Status,''))='ACCOMPLISHED' OR c.AccomplishedDateTime IS NOT NULL THEN 'DONE' ELSE 'PENDING' END statusGroup, COUNT(*) n
    FROM complaint.complaints c JOIN complaint.complaintstype t ON t.TypeID=c.TypeID
    WHERE ${conditions.join(' AND ')} GROUP BY t.DeptID, t.Complaints, area, statusGroup ORDER BY t.DeptID, t.Complaints`, params);
  // One row per Department+Complaint+Area+Status combination that actually occurred — a flat,
  // formal table instead of a sparse Area-by-column matrix mostly full of zeros.
  const items = rows.map((row) => ({
    deptId: row.deptId, department: departmentLabel(row.deptId), type: cleanLegacy(row.type),
    area: COMPLAINT_AREAS.includes(row.area) ? row.area : 'UNSPECIFIED',
    status: row.statusGroup === 'DONE' ? 'Completed' : 'Pending', count: Number(row.n) || 0,
  })).sort((a, b) => (a.deptId || 0) - (b.deptId || 0) || a.type.localeCompare(b.type) || a.area.localeCompare(b.area) || a.status.localeCompare(b.status));
  let grand = 0; let pendingGrand = 0; let doneGrand = 0;
  for (const item of items) { grand += item.count; if (item.status === 'Completed') doneGrand += item.count; else pendingGrand += item.count; }
  return successResponse(res, { period: { from, to }, items, grand, pendingGrand, doneGrand });
}
async function handleReportDetail(req, res) {
  const from = normalizeComplaint(req.query.from); const to = normalizeComplaint(req.query.to);
  if (!REPORT_DATE_PATTERN.test(from) || !REPORT_DATE_PATTERN.test(to)) return unprocessableEntityResponse(res, 'Valid from/to dates are required.');
  const area = reportAreaFilter(req); if (area === undefined) return unprocessableEntityResponse(res, 'Invalid area filter.');
  const userCode = normalizeComplaint(req.query.user);
  const statusFilter = normalizeComplaint(req.query.status).toUpperCase();
  const workflow = await workflowAvailable(); const hasEncodedBy = await encodedByColumnAvailable();
  const conditions = ['DATE(c.ReportedDateTime) BETWEEN ? AND ?']; const params = [from, to];
  if (area) { conditions.push('UPPER(TRIM(c.AreaCode))=?'); params.push(area); }
  if (userCode && userCode !== 'ALL') { conditions.push('c.EncodedByUserCode=?'); params.push(userCode); }
  const rows = await database.queryAll(`${complaintSelect(workflow, hasEncodedBy)} WHERE ${conditions.join(' AND ')}
    ORDER BY c.ReportedDateTime DESC, c.CompID DESC LIMIT 2000`, params);
  let items = rows.map(serializeComplaint);
  if (statusFilter === 'PENDING') items = items.filter((item) => item.status !== 'Done');
  else if (statusFilter === 'DONE') items = items.filter((item) => item.status === 'Done');
  return successResponse(res, { period: { from, to }, items, total: items.length,
    pending: items.filter((item) => item.status !== 'Done').length, done: items.filter((item) => item.status === 'Done').length });
}
// ponytail: aggregates in JS off the same row set as report_detail rather than a second set of
// GROUP BY queries — simplest thing that's correct, and the 5000-row cap keeps a bad date range
// from ever loading the whole complaints table. If a report period regularly blows past 5000
// complaints, move this to SQL GROUP BY per chart instead.
async function handleReportDashboard(req, res) {
  const from = normalizeComplaint(req.query.from); const to = normalizeComplaint(req.query.to);
  if (!REPORT_DATE_PATTERN.test(from) || !REPORT_DATE_PATTERN.test(to)) return unprocessableEntityResponse(res, 'Valid from/to dates are required.');
  const area = reportAreaFilter(req); if (area === undefined) return unprocessableEntityResponse(res, 'Invalid area filter.');
  const userCode = normalizeComplaint(req.query.user);
  const workflow = await workflowAvailable(); const hasEncodedBy = await encodedByColumnAvailable();
  const conditions = ['DATE(c.ReportedDateTime) BETWEEN ? AND ?']; const params = [from, to];
  if (area) { conditions.push('UPPER(TRIM(c.AreaCode))=?'); params.push(area); }
  if (userCode && userCode !== 'ALL') { conditions.push('c.EncodedByUserCode=?'); params.push(userCode); }
  const rows = await database.queryAll(`${complaintSelect(workflow, hasEncodedBy)} WHERE ${conditions.join(' AND ')}
    ORDER BY c.ReportedDateTime DESC, c.CompID DESC LIMIT 5000`, params);
  const items = rows.map(serializeComplaint);
  const tally = (list, keyFn) => { const map = new Map(); for (const item of list) { const key = keyFn(item) || 'Unspecified'; map.set(key, (map.get(key) || 0) + 1); } return [...map.entries()].map(([label, count]) => ({ label, count })); };
  const statusOrder = ['New', 'Pending', 'In Progress', 'Released', 'Done'];
  const statusBreakdown = tally(items, (item) => item.status).sort((a, b) => statusOrder.indexOf(a.label) - statusOrder.indexOf(b.label));
  const areaBreakdown = tally(items, (item) => COMPLAINT_AREAS.includes(item.complaintArea) ? item.complaintArea : 'UNSPECIFIED').sort((a, b) => b.count - a.count);
  const departmentBreakdown = tally(items, (item) => item.department).sort((a, b) => b.count - a.count);
  const preparedByBreakdown = tally(items, (item) => item.createdBy).sort((a, b) => b.count - a.count);
  const topTypes = tally(items, (item) => item.type).sort((a, b) => b.count - a.count).slice(0, 8);
  const trend = tally(items, (item) => (item.reportedAt ? String(item.reportedAt).slice(0, 10) : null)).sort((a, b) => a.label.localeCompare(b.label));
  // [HYBRID] Trimmed rows behind the charts — the dashboard already loaded every complaint in
  // range to build the tallies above, so the list view reuses that same set instead of a second
  // query; the reports screen filters/sorts this client-side instead of round-tripping per click.
  const listItems = items.map((item) => ({
    id: item.id, databaseId: item.databaseId, type: item.type, consumer: item.consumer, address: item.address,
    department: item.department, area: COMPLAINT_AREAS.includes(item.complaintArea) ? item.complaintArea : 'UNSPECIFIED',
    status: item.status, preparedBy: item.createdBy || 'Unspecified', reportedAt: item.reportedAt,
  }));
  return successResponse(res, { period: { from, to }, total: items.length,
    done: items.filter((item) => item.status === 'Done').length, statusBreakdown, areaBreakdown, departmentBreakdown, preparedByBreakdown, topTypes, trend, listItems,
    truncated: rows.length >= 5000 });
}
async function handleReportEncoders(req, res) {
  if (!await encodedByColumnAvailable()) return successResponse(res, { items: [] });
  const rows = await database.queryAll(`SELECT DISTINCT EncodedByUserCode usercode, EncodedByName name FROM complaint.complaints
    WHERE EncodedByName IS NOT NULL AND TRIM(EncodedByName)<>'' ORDER BY EncodedByName LIMIT 200`);
  return successResponse(res, { items: rows.map((row) => ({ usercode: cleanLegacy(row.usercode), name: cleanLegacy(row.name) })) });
}

const getActions = {
  list: handleList, complaint_lookup: handleComplaintLookup, complaint_search: handleComplaintSearch, area_counts: handleAreaCounts, types: handleTypes, search_employee: handleEmployeeSearch, position_employee: handlePositionEmployee, employee_photo: handleEmployeePhoto,
  activity: handleActivity, notifications: handleNotifications, consumer_search: handleConsumerSearch,
  consumer_detail: handleConsumerDetail, house_map_focus: handleHouseFocus, house_map_points: handleHousePoints, house_map_meters: handleHouseMeters, house_map_dots: handleHouseDots,
  monitor_access: handleMonitorAccess, monitor_snapshot: handleMonitorSnapshot,
  report_summary: handleReportSummary, report_detail: handleReportDetail, report_dashboard: handleReportDashboard, report_encoders: handleReportEncoders,
};
const postActions = {
  create: handleCreate, update: handleUpdate, delete: handleDelete, type_save: handleTypeSave, workflow: handleWorkflow,
  notification_read: handleNotificationRead, house_map_save: handleHouseSave, map_capture_store: handleMapCaptureStore,
};
const dispatch = (actions, fallback) => async (req, res, next) => {
  try { return await (actions[cleanLegacy(req.query.action).toLowerCase()] || fallback)(req, res); } catch (error) { return next(error); }
};

router.get('/types', dispatch({}, handleTypes));
router.post('/types', dispatch({}, handleTypeSave));
router.get('/', dispatch(getActions, handleList));
router.post('/', upload.single('file'), dispatch(postActions, handleCreate));
router.patch('/:id', async (req, res, next) => { try { return await handleUpdate(req, res, positiveInt(req.params.id)); } catch (error) { return next(error); } });

module.exports = router;
module.exports._selfcheck = { normalizeComplaint, cleanLegacy, searchLimit, listLimit, mapFloat, markerColor, actorFor,
  isAdminIdentity, statusFromLegacy, referenceFor, serializeComplaint, serializeConsumer, serializeHouse, houseCode, invalidLength,
  complaintSelect, retryOnDupEntry };
