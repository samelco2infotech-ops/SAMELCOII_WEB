const db = require('../config/database');
const { FUEL_STATUS, FUEL_STATUS_LABELS } = require('../config/constants');
const { getDateString, startOfMonth, endOfMonth } = require('../utils/dateTime');

const getStatusLabel = (status) => {
  const s = String(status || '2');
  return FUEL_STATUS_LABELS[s] || 'Pending';
};

const privilegeNumbers = (value) => String(value || '')
  .split(/\s*-\s*/)
  .map((part) => Number.parseInt(part, 10))
  .filter(Number.isFinite);

const canManageFuelApprovals = (user = {}) =>
  privilegeNumbers(user.privilage).some((value) => value >= 5 && value <= 10);

const canViewOrganizationFuel = (user = {}) =>
  privilegeNumbers(user.privilage).some((value) => value >= 6 && value <= 10);

const parseApproverCodes = (raw, fallback = '') => {
  let values = [];
  if (Array.isArray(raw)) values = raw;
  else if (String(raw || '').trim()) {
    try {
      const decoded = JSON.parse(raw);
      values = Array.isArray(decoded) ? decoded : String(raw).split(',');
    } catch (_error) {
      values = String(raw).split(',');
    }
  }
  if (!values.length && fallback) values = [fallback];
  return [...new Set(values.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))].slice(0, 3);
};

const resolveFuelApprovers = async (codes, department, requesterUsercode) => {
  const requested = parseApproverCodes(codes);
  if (requested.length) {
    const rows = await db.queryAll(
      `SELECT usercode,name,position,department FROM usertb
       WHERE UPPER(TRIM(usercode)) IN (?)
         AND COALESCE(privilage,'') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'`,
      [requested]
    );
    const byCode = new Map(rows.map((row) => [String(row.usercode).trim().toUpperCase(), row]));
    return requested.map((code) => byCode.get(code)).filter(Boolean);
  }
  const configured = await db.queryOne(
    `SELECT u.usercode,u.name,u.position,u.department
     FROM signatory_groups sg
     LEFT JOIN signatory_group_members sgm
       ON sgm.group_id=sg.id AND UPPER(TRIM(sgm.usercode))=UPPER(TRIM(?))
     JOIN usertb u ON u.usercode=sg.signatory_usercode
     WHERE sg.module_key='fuel'
       AND COALESCE(u.privilage,'') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'
       AND (sgm.id IS NOT NULL OR UPPER(TRIM(COALESCE(sg.department,'')))=UPPER(TRIM(?))
            OR TRIM(COALESCE(sg.department,''))='')
     ORDER BY CASE WHEN sgm.id IS NOT NULL THEN 0 WHEN TRIM(COALESCE(sg.department,''))<>'' THEN 1 ELSE 2 END,sg.id
     LIMIT 1`,
    [requesterUsercode, department]
  ).catch(() => null);
  if (configured) return [configured];
  const fallback = await db.queryOne(
    `SELECT usercode,name,position,department FROM usertb
     WHERE COALESCE(privilage,'') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'
       AND UPPER(TRIM(usercode))<>UPPER(TRIM(?))
     ORDER BY CASE WHEN UPPER(TRIM(COALESCE(department,'')))=UPPER(TRIM(?)) THEN 0 ELSE 1 END,name LIMIT 1`,
    [requesterUsercode, department]
  );
  return fallback ? [fallback] : [];
};

const assignFuelApprovers = async (connection, farCode, approvers, assignedBy, mode) => {
  await connection.execute("DELETE FROM request_approvers WHERE module='fuel' AND request_number=?", [farCode]);
  await connection.execute('DELETE FROM fuel_request_approvers WHERE request_number=?', [farCode]);
  if (!approvers.length) return;
  await connection.execute(
    `INSERT INTO request_approvers
       (module,request_number,stage,approver_usercode,assigned_by,assignment_mode,assigned_at)
     VALUES ('fuel',?,'department_head',?,?,?,NOW())`,
    [farCode, approvers[0].usercode, assignedBy, mode]
  );
  for (const approver of approvers.slice(1, 3)) {
    await connection.execute(
      `INSERT INTO fuel_request_approvers
       (request_number,approver_usercode,assigned_by,assignment_mode,assigned_at)
       VALUES (?,?,?,?,NOW())`,
      [farCode, approver.usercode, assignedBy, mode]
    );
  }
};

const fuelRequestIsAssignedTo = async (farCode, usercode) => Boolean(await db.queryOne(
  `SELECT 1 found FROM (
     SELECT request_number,approver_usercode FROM request_approvers WHERE module='fuel'
     UNION ALL SELECT request_number,approver_usercode FROM fuel_request_approvers
   ) assigned
   WHERE request_number=? AND UPPER(TRIM(approver_usercode))=UPPER(TRIM(?)) LIMIT 1`,
  [farCode, usercode]
));

const generateFarCode = async (departmentAbbr) => {
  const today = getDateString(new Date()).replaceAll('-', '');
  // [HUWAG] Four digits ang minimum, hindi maximum; tuloy ang sequence sa 10000 pataas.
  const rows = await db.queryAll(
    `SELECT FARCode FROM fuelallocation_history
     WHERE FARCode REGEXP '^[0-9]{8}[A-Za-z]+[0-9]{4,}$'
     ORDER BY Id DESC LIMIT 10000`
  );
  let next = 1;
  for (const row of rows) {
    const match = String(row.FARCode || '').match(/^\d{8}[A-Za-z]+(\d{4,})$/);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return `${today}${String(departmentAbbr || '').toUpperCase()}${String(next).padStart(4, '0')}`;
};

const normalizeFuelRequest = (payload = {}) => {
  const request = {
    farCode: String(payload.farCode || '').trim(),
    usercode: String(payload.usercode || '').trim().toUpperCase(),
    requestedItem: String(payload.requestedItem || '').trim(),
    amount: Number(payload.amount || payload.liters || 0),
    vehicle: String(payload.vehicle || '').trim().toUpperCase(),
    purpose: String(payload.purpose || '').trim(),
    destination: String(payload.destination || '').trim(),
    prevTravel: String(payload.prevTravel || '').trim(),
    secondRequesterName: String(payload.secondRequesterName || '').trim(),
    prevRequestDate: String(payload.prevRequestDate || '').trim(),
    presRequestDate: String(payload.presRequestDate || '').trim() || getDateString(new Date()),
    fuelstation: String(payload.fuelstation || '').trim(),
    approverMode: String(payload.approver_mode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto',
    approverCodes: parseApproverCodes(payload.approver_usercodes, payload.approver_usercode),
  };
  if (!request.usercode || !request.requestedItem || request.requestedItem === '- - - - -'
    || !Number.isFinite(request.amount) || request.amount <= 0 || !request.vehicle
    || !request.purpose || !request.destination || !request.prevTravel || !request.fuelstation
    || ['- - - -', '- - - - -'].includes(request.fuelstation)) {
    throw Object.assign(new Error('Please complete all required fuel request fields.'), { statusCode: 422 });
  }
  if (request.approverMode === 'manual' && !request.approverCodes.length) {
    throw Object.assign(new Error('Select at least one approver.'), { statusCode: 422 });
  }
  return request;
};

const getAssignedVehicleForUser = async (usercode) => {
  let vehicle = await db.queryOne(
    `SELECT UnitPlateNumber, model, vehiclemake, type
     FROM vehicletb
     WHERE LOWER(registered_driver) = LOWER(?)
     LIMIT 1`,
    [usercode]
  );

  if (!vehicle) {
    vehicle = await db.queryOne(
      `SELECT UnitPlateNumber, model, vehiclemake, type
       FROM vehicletb
       WHERE LOWER(registered_driver) LIKE LOWER(?)
       LIMIT 1`,
      [`%${usercode}%`]
    );
  }

  return vehicle || null;
};

const getVehiclesUsedToday = async () => {
  const today = getDateString(new Date());
  const vehicles = await db.queryAll(
    `SELECT DISTINCT unit_id, COUNT(*) as count
     FROM fuelallocation_history
     WHERE DATE(PresRequestDate) = ?
     GROUP BY unit_id`,
    [today]
  );

  return vehicles;
};

// Resolve a department's short code (ABREVATION) from its full name, matching the PHP getDepartmentAbbr logic.
const getDepartmentAbbr = async (departmentName) => {
  const name = String(departmentName || '').trim();
  if (name === '') return '';
  const row = await db.queryOne(
    'SELECT COALESCE(ABREVATION, NAME) AS abbr FROM departmenttb WHERE NAME = ? LIMIT 1',
    [name]
  );
  return String(row?.abbr || name).trim().toUpperCase();
};

const getDepartmentFuelStats = async (department, year, month) => {
  // fuelallocation_history has no department column; the department key lives inside FARCode (e.g. "...CORPLAN...").
  const deptKey = await getDepartmentAbbr(department);
  if (deptKey === '') {
    return { monthly_quota: 0, remaining_month: 0, issued_month: 0, department_abbr: '' };
  }

  const dateFrom = getDateString(startOfMonth(year, month));
  const dateTo = getDateString(endOfMonth(year, month));

  const limitRow = await db.queryOne(
    `SELECT COALESCE(monthly_quota, 0) AS monthly_quota, COALESCE(fuel, 0) AS pool_remaining
     FROM fuelallocation_limit
     WHERE Department = ?
     LIMIT 1`,
    [deptKey]
  );
  const monthlyQuota = Number(limitRow?.monthly_quota || 0);
  const poolRemaining = Number(limitRow?.pool_remaining || 0);

  const issuedRow = await db.queryOne(
    `SELECT SUM(COALESCE(fh.PresRequest, 0)) AS liters
     FROM fuelallocation_history fh
     WHERE fh.status = ?
       AND fh.FARCode IS NOT NULL AND TRIM(fh.FARCode) <> ''
       AND fh.FARCode LIKE ?
       AND DATE(COALESCE(fh.PresRequestDate, fh.PrevRequestDate)) BETWEEN ? AND ?`,
    [FUEL_STATUS.APPROVED, `%${deptKey}%`, dateFrom, dateTo]
  );
  const issuedMonth = Number(issuedRow?.liters || 0);
  const remainingMonth = poolRemaining > 0 ? poolRemaining : Math.max(0, monthlyQuota - issuedMonth);

  return {
    monthly_quota: Math.round(monthlyQuota * 100) / 100,
    remaining_month: Math.round(remainingMonth * 100) / 100,
    issued_month: Math.round(issuedMonth * 100) / 100,
    department_abbr: deptKey,
  };
};

const getFuelBalance = async (usercode, year, month) => {
  const start = startOfMonth(year, month);
  const end = endOfMonth(year, month);
  const dateFrom = getDateString(start);
  const dateTo = getDateString(end);

  const user = await db.queryOne(
    'SELECT department FROM usertb WHERE usercode = ?',
    [usercode]
  );

  if (!user) return null;

  const history = await db.queryAll(
    `SELECT PresRequest, status
     FROM fuelallocation_history
     WHERE usercode = ? AND DATE(PresRequestDate) >= ? AND DATE(PresRequestDate) <= ?
     ORDER BY PresRequestDate ASC`,
    [usercode, dateFrom, dateTo]
  );

  let totalRequested = 0;
  for (const record of history) {
    if (record.status === FUEL_STATUS.APPROVED) {
      totalRequested += record.PresRequest || 0;
    }
  }

  const deptStats = await getDepartmentFuelStats(user.department, year, month);

  return {
    usercode,
    department: user.department,
    month: `${year}-${String(month).padStart(2, '0')}`,
    ...deptStats,
    user_requested_this_month: totalRequested,
  };
};

const getFuelHistory = async (usercode, year, month, limit = 50) => {
  const start = startOfMonth(year, month);
  const end = endOfMonth(year, month);
  const dateFrom = getDateString(start);
  const dateTo = getDateString(end);

  const history = await db.queryAll(
    `SELECT FARCode, usercode, PresRequest, status, unit_id, epassID, PresRequestDate, PrevRequestDate
     FROM fuelallocation_history
     WHERE usercode = ? AND DATE(PresRequestDate) >= ? AND DATE(PresRequestDate) <= ?
     ORDER BY PresRequestDate DESC
     LIMIT ?`,
    [usercode, dateFrom, dateTo, limit]
  );

  return history.map(h => ({
    ...h,
    status_label: getStatusLabel(h.status),
  }));
};

const createFuelRequest = async (usercode, liters) => {
  const year = new Date().getFullYear();
  const yearSuffix = String(year).slice(2);
  const prefix = `FAR${yearSuffix}`;

  const result = await db.queryOne(
    `SELECT MAX(CAST(SUBSTRING(FARCode, 6, 5) AS UNSIGNED)) as latest
     FROM fuelallocation_history
     WHERE FARCode LIKE ?`,
    [`${prefix}%`]
  );

  const latest = parseInt(result?.latest || 0, 10);
  const nextSeq = String(latest + 1).padStart(5, '0');
  const farCode = `${prefix}${nextSeq}`;

  const insertResult = await db.execute(
    `INSERT INTO fuelallocation_history
       (FARCode,usercode,Requested_item,PresRequest,status,PresRequestDate,note,accountused)
     VALUES (?,?,'DIESEL',?,?,NOW(),'New Request',?)`,
    [farCode, usercode, liters, FUEL_STATUS.PENDING, usercode]
  );

  return insertResult.affectedRows > 0 ? farCode : null;
};

const approveFuelRequest = async (farCode) => {
  const result = await db.execute(
    'UPDATE fuelallocation_history SET status = ? WHERE FARCode = ?',
    [FUEL_STATUS.APPROVED, farCode]
  );

  return result.affectedRows > 0;
};

const rejectFuelRequest = async (farCode) => {
  const result = await db.execute(
    'UPDATE fuelallocation_history SET status = ? WHERE FARCode = ?',
    [FUEL_STATUS.REJECTED, farCode]
  );

  return result.affectedRows > 0;
};

const ensureFuelSchema = async () => {
  try {
    const exists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['fuelallocation_history', 'epassID']
    );

    if (!exists) {
      await db.execute('ALTER TABLE fuelallocation_history ADD COLUMN epassID VARCHAR(64) NULL');
      console.log('✓ Added epassID column to fuelallocation_history');
    }

    const destinationExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['fuelallocation_history', 'Destination']
    );

    if (!destinationExists) {
      await db.execute('ALTER TABLE fuelallocation_history ADD COLUMN Destination VARCHAR(255) NULL');
      console.log('✓ Added Destination column to fuelallocation_history');
    }

    const secondRequesterExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['fuelallocation_history', 'second_requester_name']
    );

    if (!secondRequesterExists) {
      await db.execute('ALTER TABLE fuelallocation_history ADD COLUMN second_requester_name VARCHAR(255) NULL');
      console.log('✓ Added second_requester_name column to fuelallocation_history');
    }
  } catch (error) {
    console.error('Error ensuring fuel schema:', error.message);
  }
};

module.exports = {
  getStatusLabel,
  privilegeNumbers,
  canManageFuelApprovals,
  canViewOrganizationFuel,
  parseApproverCodes,
  resolveFuelApprovers,
  assignFuelApprovers,
  fuelRequestIsAssignedTo,
  generateFarCode,
  normalizeFuelRequest,
  getAssignedVehicleForUser,
  getVehiclesUsedToday,
  getDepartmentFuelStats,
  getFuelBalance,
  getFuelHistory,
  createFuelRequest,
  approveFuelRequest,
  rejectFuelRequest,
  ensureFuelSchema,
};
