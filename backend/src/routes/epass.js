const express = require('express');
const router = express.Router();
const db = require('../config/database');
const epassService = require('../services/epassService');
const { successResponse, badRequestResponse, notFoundResponse, forbiddenResponse, unprocessableEntityResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/validation');

const EPASS_DEPT_MAP = {
  OGM: 'OFFICE OF THE GENERAL MANAGER',
  CORPLAN: 'CORPORATE PLANNING DEPARTMENT',
  FSD: 'FSD FINANCE SERVICES DEPARTMENT',
  ISD: 'INSTITUTIONAL SERVICES DEPARTMENT',
  TSD: 'TECHNICAL SERVICES DEPARTMENT',
  IAD: 'INTERNAL AUDIT DEPARTMENT',
  ADMIN: 'ADMINISTRATIVE DEPARTMENT',
  ESD: 'ENGINEERING SERVICES DEPARTMENT',
};
const EPASS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const epassDepartmentName = (department) => {
  const key = String(department || '').trim().toUpperCase();
  return EPASS_DEPT_MAP[key] || department || '';
};

const epassStatusLabel = (status) => {
  const value = String(status ?? '');
  if (value === '2') return 'Approved';
  if (value === '3') return 'Rejected';
  if (value === '1') return 'Pending';
  return value !== '' ? value : 'Pending';
};

const epassSplitGroupList = (value) =>
  String(value ?? '')
    .split(/\s*\|\|\s*/)
    .map((part) => part.trim())
    .filter((part) => part !== '');

const epassFirstGroupValue = (values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text !== '') return text;
  }
  return '';
};

const EPASS_MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatEpassDate = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${EPASS_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const formatEpassDateLong = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${EPASS_MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const generateEpassNumber = epassService.generateEpassNumber;

const fetchGroupedFuelEpass = async (epassNumber) => {
  // ponytail: dedupe by (epassnumber, usercode) in the derived table `d` BEFORE the GROUP_CONCAT —
  // pre-existing epasstb rows can carry the same usercode more than once (data written before
  // normalizeFuelPeople de-duped on insert), and GROUP_CONCAT over the raw rows would otherwise
  // print that person's name once per duplicate row.
  const row = await db.queryOne(
    `SELECT d.epassnumber,
            MAX(d.department) AS department,
            MAX(d.destination) AS destination,
            MAX(d.request_date) AS request_date,
            MAX(d.purpose) AS purpose,
            MAX(d.status) AS status,
            MAX(d.epass_approved) AS approved_by,
            GROUP_CONCAT(NULLIF(TRIM(d.grantedto1), '') ORDER BY d.Id SEPARATOR '||') AS granted_to,
            GROUP_CONCAT(NULLIF(TRIM(u.name), '') ORDER BY d.Id SEPARATOR '||') AS requester_names,
            GROUP_CONCAT(NULLIF(TRIM(d.usercode), '') ORDER BY d.Id SEPARATOR '||') AS requester_usercodes,
            GROUP_CONCAT(NULLIF(TRIM(u.profile_photo_url), '') ORDER BY d.Id SEPARATOR '||') AS requester_photo_urls,
            MAX(approver.name) AS approver_name
     FROM (
       SELECT MIN(Id) AS Id, epassnumber, usercode,
              MAX(grantedto1) AS grantedto1, MAX(department) AS department, MAX(destination) AS destination,
              MAX(\`date\`) AS request_date, MAX(purpose) AS purpose, MAX(status) AS status,
              MAX(epass_approved) AS epass_approved
         FROM epasstb
        WHERE epassnumber = ?
        GROUP BY epassnumber, usercode
     ) d
     LEFT JOIN usertb u ON u.usercode = d.usercode
     LEFT JOIN usertb approver ON approver.usercode = d.epass_approved
     GROUP BY d.epassnumber
     LIMIT 1`,
    [epassNumber]
  );
  if (!row) return null;

  const grantedTo = epassSplitGroupList(row.granted_to || '');
  const requesterNames = epassSplitGroupList(row.requester_names || '');
  const requesterUsercodes = epassSplitGroupList(row.requester_usercodes || '');
  const requesterPhotoUrls = epassSplitGroupList(row.requester_photo_urls || '');
  const peopleRowsRaw = await db.queryAll(
    `SELECT e.Id AS row_id,e.usercode,
            COALESCE(NULLIF(TRIM(e.grantedto1),''),NULLIF(TRIM(u.name),''),e.usercode) AS name,
            COALESCE(u.profile_photo_url,'') AS photo_url
     FROM epasstb e LEFT JOIN usertb u ON u.usercode=e.usercode
     WHERE e.epassnumber=? ORDER BY e.Id`,
    [epassNumber]
  );
  // ponytail: pre-existing epasstb rows can already carry the same usercode more than once
  // (data written before normalizeFuelPeople de-duped on insert) — collapse here too so old
  // records print correctly without a data-cleanup migration.
  const seenPeople = new Set();
  const peopleRows = peopleRowsRaw.filter((person) => {
    const key = String(person.usercode || '').trim().toUpperCase();
    if (key && seenPeople.has(key)) return false;
    if (key) seenPeople.add(key);
    return true;
  });

  return {
    epassnumber: row.epassnumber || '',
    date: formatEpassDateLong(row.request_date),
    department: epassDepartmentName(row.department || ''),
    destination: row.destination || '',
    purpose: row.purpose || '',
    status: row.status || '',
    status_label: epassStatusLabel(row.status || ''),
    usercode: epassFirstGroupValue(requesterUsercodes) || (row.usercode || ''),
    requester_photo_url: epassFirstGroupValue(requesterPhotoUrls),
    requester_name: epassFirstGroupValue(grantedTo) || epassFirstGroupValue(requesterNames),
    requester_names: requesterNames,
    requester_usercodes: requesterUsercodes,
    requester_photo_urls: requesterPhotoUrls,
    approved_by: row.approved_by || '',
    approver_name: row.approver_name || '',
    granted_to: grantedTo,
    people: peopleRows.map((person) => ({
      ...person,
      photo_url: Buffer.isBuffer(person.photo_url) ? person.photo_url.toString() : String(person.photo_url || ''),
    })),
  };
};

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    if (!action) {
      return next();
    }

    if (action === 'update_status') {
      const { epassnumber, status } = req.body || {};
      const nextStatus = parseInt(status, 10);
      if (!epassnumber || ![2, 3].includes(nextStatus)) {
        return badRequestResponse(res, 'Invalid gate pass status update.');
      }
      if (!epassService.userCanManageApprovals(req.user)) {
        return forbiddenResponse(res, 'You do not have permission to update gate pass approvals.');
      }
      if (!await epassService.requestIsAssignedTo(epassnumber, req.user.usercode)) {
        return forbiddenResponse(res, 'This EPASS request is assigned to another approver.');
      }
      const pass = await epassService.getEpassByNumber(epassnumber);
      if (!pass) {
        return notFoundResponse(res, 'Gate pass not found.');
      }
      const updated = nextStatus === 2
        ? await epassService.approveEpass(epassnumber)
        : await epassService.rejectEpass(epassnumber);
      return successResponse(res, {
        ok: !!updated,
        message: nextStatus === 2 ? 'Gate pass approved.' : 'Gate pass rejected.',
      });
    }

    if (action === 'cancel_by_fuel_farcode') {
      const fuelFarCode = String(req.body?.fuelFarCode || req.body?.fuel_farcode || '').trim();
      if (!fuelFarCode) {
        return badRequestResponse(res, 'Missing fuel FAR code.');
      }
      const removed = await epassService.cancelEpassByFuelFarCode(fuelFarCode);
      if (!removed) {
        return badRequestResponse(res, 'Unable to remove gate pass.');
      }
      return successResponse(res, {
        message: 'Gate pass removed.',
      });
    }

    if (action === 'next_number') {
      return successResponse(res, {
        epassnumber: await generateEpassNumber(),
      });
    }

    if (action === 'by_fuel_farcode') {
      const farCode = String(req.query.farCode || req.body?.farCode || '').trim();
      if (!farCode) return unprocessableEntityResponse(res, 'Missing FAR code.');
      const row = await db.queryOne(
        `SELECT epassnumber FROM epasstb
         WHERE fuel_farcode=? AND epassnumber IS NOT NULL AND TRIM(epassnumber)<>''
         ORDER BY Id DESC LIMIT 1`,
        [farCode]
      );
      return successResponse(res, { item: row ? await fetchGroupedFuelEpass(row.epassnumber) : null });
    }

    if (action === 'remove_person') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      if (!epassService.userCanManageApprovals(req.user)) return forbiddenResponse(res, 'Removing an employee is restricted to approvers.');
      const epassNumber = String(req.body?.epassnumber || '').trim();
      const rowId = Number.parseInt(req.body?.row_id, 10);
      if (!epassNumber || rowId <= 0) return unprocessableEntityResponse(res, 'Missing gate pass number or employee.');
      if (!await epassService.requestIsAssignedTo(epassNumber, req.user.usercode)) {
        return forbiddenResponse(res, 'This EPASS request is assigned to another approver.');
      }
      const count = await db.queryOne('SELECT COUNT(*) total FROM epasstb WHERE epassnumber=?', [epassNumber]);
      if (Number(count?.total || 0) <= 1) return res.status(409).json({ ok: false, message: 'This is the last employee on the gate pass. Reject the request instead.' });
      const removed = await epassService.archiveAndRemovePerson(epassNumber, rowId, req.user.usercode);
      if (!removed) return notFoundResponse(res, 'That employee is not on this gate pass.');
      return successResponse(res, { item: await fetchGroupedFuelEpass(epassNumber) });
    }

    if (action === 'list') {
      const usercode = String(req.query.usercode || req.user?.usercode || '').trim().toUpperCase();
      if (usercode === '') {
        return unprocessableEntityResponse(res, 'Missing employee number.');
      }
      if (usercode !== String(req.user?.usercode || '').trim().toUpperCase()
        && !epassService.userCanManageApprovals(req.user)) {
        return forbiddenResponse(res, 'You can view only your own EPASS requests.');
      }
      const numberRows = await db.queryAll(
        `SELECT DISTINCT epassnumber
         FROM epasstb
         WHERE usercode = ? AND epassnumber IS NOT NULL AND TRIM(epassnumber) <> ''
         ORDER BY Id DESC
         LIMIT 50`,
        [usercode]
      );
      const epassNumbers = numberRows.map((r) => r.epassnumber).filter(Boolean);
      if (epassNumbers.length === 0) {
        return successResponse(res, { items: [] });
      }
      // ponytail: same dedupe-before-GROUP_CONCAT fix as fetchGroupedFuelEpass — pre-existing
      // duplicate (epassnumber, usercode) rows in epasstb were inflating "N employees linked"
      // in the Request History panel (e.g. showing 77 for a request with a handful of real people).
      const rows = await db.queryAll(
        `SELECT d.epassnumber,
                MAX(d.Id) AS sort_id,
                MAX(d.department) AS department,
                MAX(d.destination) AS destination,
                MAX(d.request_date) AS request_date,
                MAX(d.purpose) AS purpose,
                MAX(d.status) AS status,
                MAX(d.epass_approved) AS approved_by,
                GROUP_CONCAT(NULLIF(TRIM(d.grantedto1), '') ORDER BY d.Id SEPARATOR '||') AS granted_to,
                GROUP_CONCAT(NULLIF(TRIM(requester.name), '') ORDER BY d.Id SEPARATOR '||') AS requester_names,
                GROUP_CONCAT(NULLIF(TRIM(d.usercode), '') ORDER BY d.Id SEPARATOR '||') AS requester_usercodes,
                GROUP_CONCAT(NULLIF(TRIM(requester.profile_photo_url), '') ORDER BY d.Id SEPARATOR '||') AS requester_photo_urls,
                MAX(approver.name) AS approver_name
         FROM (
           SELECT MIN(Id) AS Id, epassnumber, usercode,
                  MAX(grantedto1) AS grantedto1, MAX(department) AS department, MAX(destination) AS destination,
                  MAX(\`date\`) AS request_date, MAX(purpose) AS purpose, MAX(status) AS status,
                  MAX(epass_approved) AS epass_approved
             FROM epasstb
            WHERE epassnumber IN (?)
            GROUP BY epassnumber, usercode
         ) d
         LEFT JOIN usertb requester ON requester.usercode = d.usercode
         LEFT JOIN usertb approver ON approver.usercode = d.epass_approved
         GROUP BY d.epassnumber
         ORDER BY sort_id DESC, MAX(d.request_date) DESC
         LIMIT 50`,
        [epassNumbers]
      );
      const items = rows.map((row) => {
        const grantedTo = epassSplitGroupList(row.granted_to || '');
        const requesterNames = epassSplitGroupList(row.requester_names || '');
        const requesterUsercodes = epassSplitGroupList(row.requester_usercodes || '');
        const requesterPhotoUrls = epassSplitGroupList(row.requester_photo_urls || '');
        return {
          epassnumber: row.epassnumber || '',
          date: formatEpassDate(row.request_date),
          department: epassDepartmentName(row.department || ''),
          destination: row.destination || '',
          purpose: row.purpose || '',
          status: row.status || '',
          status_label: epassStatusLabel(row.status || ''),
          approved_by: row.approved_by || '',
          usercode: epassFirstGroupValue(requesterUsercodes),
          requester_photo_url: epassFirstGroupValue(requesterPhotoUrls),
          requester_name: epassFirstGroupValue(grantedTo) || epassFirstGroupValue(requesterNames),
          requester_names: requesterNames,
          requester_usercodes: requesterUsercodes,
          requester_photo_urls: requesterPhotoUrls,
          approver_name: row.approver_name || '',
          granted_to: grantedTo,
        };
      });
      return successResponse(res, { items });
    }

    if (action === 'next_number') {
      return successResponse(res, { epassnumber: await generateEpassNumber() });
    }

    if (action === 'latest') {
      const usercode = String(req.query.usercode || req.user?.usercode || '').trim().toUpperCase();
      if (usercode === '') {
        return unprocessableEntityResponse(res, 'Missing employee number.');
      }
      const latestRow = await db.queryOne(
        `SELECT epassnumber FROM epasstb
         WHERE usercode = ?
         GROUP BY epassnumber
         ORDER BY MAX(\`date\`) DESC, MAX(Id) DESC
         LIMIT 1`,
        [usercode]
      );
      const epassNumber = String(latestRow?.epassnumber || '');
      if (epassNumber === '') {
        return successResponse(res, { item: null });
      }
      const item = await fetchGroupedFuelEpass(epassNumber);
      if (!item) {
        return successResponse(res, { item: null });
      }
      return successResponse(res, {
        item,
      });
    }

    if (action === 'by_number') {
      const epassNumber = String(req.query.epassnumber || req.body?.epassnumber || '').trim();
      if (epassNumber === '') {
        return unprocessableEntityResponse(res, 'Missing gate pass number.');
      }
      const item = await fetchGroupedFuelEpass(epassNumber);
      return successResponse(res, { item });
    }

    if (action === 'update') {
      const epassNumber = String(req.body?.epassnumber || '').trim();
      const updated = await epassService.updateEpass(req.user.usercode, epassNumber, req.body || {});
      return successResponse(res, {
        message: 'Pending EPASS request updated.',
        epassnumber: updated,
        status: 1,
        status_label: 'Pending',
      });
    }

    const PATH_ALIASES = { pending: '/pending', all: '/all', create: '/create', 'link-fuel': '/link-fuel' };
    if (PATH_ALIASES[action]) {
      const qIndex = req.url.indexOf('?');
      req.url = PATH_ALIASES[action] + (qIndex >= 0 ? req.url.slice(qIndex) : '');
      return next();
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
});

// GET /api/epass/list?usercode=X
router.get('/list', async (req, res, next) => {
  try {
    const { usercode } = req.query;
    const userToFetch = sanitizeString(usercode) || req.user.usercode;
    if (userToFetch.toUpperCase() !== String(req.user?.usercode || '').toUpperCase()
      && !epassService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You can view only your own EPASS requests.');
    }

    const passes = await epassService.getEpassList(userToFetch);
    // [FIX] The employees-profile client reads payload.items (same key every other list
    // endpoint in this app uses) but this route only ever sent "passes" — so the Request
    // History panel/print view always saw an empty list from here. Send both for compatibility.
    return successResponse(res, { items: passes, passes, total: passes.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/epass/pending - For approvers
router.get('/pending', async (req, res, next) => {
  try {
    if (!epassService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You do not have permission to manage gate pass approvals.');
    }

    const { year, month, day, department, q, limit } = req.query;
    const filters = [];
    // [PERF] Was: aggregate the ENTIRE epasstb table (every request, every requester, all of
    // history) in the inner subquery, THEN filter by approver/status in the outer query. That
    // full-table GROUP BY ran on every single poll from every open approval desk (every 15-30s,
    // see dept-head-approval-hub.js) and got slower as epasstb grew. Fix: push the status and
    // fuel-link filters into the inner subquery's WHERE (on raw epasstb columns, safe because the
    // existing MAX()/GROUP_CONCAT already assumes duplicate rows for one (epassnumber, usercode)
    // share the same status/fuel_farcode — that's the whole premise of the dedupe fix above) so
    // only the small pending subset gets grouped, matching the filter-before-group pattern
    // travelService.js already uses.
    const params = [1, req.user.usercode, req.user.usercode];
    // ponytail: same dedupe-before-GROUP_CONCAT fix as fetchGroupedFuelEpass/the history list —
    // duplicate (epassnumber, usercode) rows in epasstb were inflating requester_names/usercodes
    // for approvers here too, not just in the employee-facing history view.
    let sql = `
      SELECT d.epassnumber,
             MAX(d.usercode) AS usercode, MAX(d.department) AS department,
             MAX(d.status) AS status, MAX(d.weight) AS weight,
             MAX(d.passenger) AS passenger, MAX(d.date) AS date,
             MAX(d.destination) AS destination, MAX(d.purpose) AS purpose,
             MAX(u.name) AS requester_name, MAX(u.profile_photo_url) AS requester_photo_url,
             MAX(NULLIF(TRIM(u.area), '')) AS area,
             MAX(d.epass_approved) AS approved_by,
             COALESCE(MAX(approver.name), MAX(assigned_ra.approver_usercode)) AS approver_name,
             GROUP_CONCAT(NULLIF(TRIM(d.grantedto1), '') ORDER BY d.Id SEPARATOR '||') AS granted_to,
             GROUP_CONCAT(NULLIF(TRIM(u.name), '') ORDER BY d.Id SEPARATOR '||') AS requester_names,
             GROUP_CONCAT(NULLIF(TRIM(d.usercode), '') ORDER BY d.Id SEPARATOR '||') AS requester_usercodes,
             GROUP_CONCAT(NULLIF(TRIM(u.profile_photo_url), '') ORDER BY d.Id SEPARATOR '||') AS requester_photo_urls
      FROM (
        SELECT MIN(Id) AS Id, epassnumber, usercode,
               MAX(department) AS department, MAX(status) AS status, MAX(weight) AS weight,
               MAX(passenger) AS passenger, MAX(\`date\`) AS \`date\`, MAX(grantedto1) AS grantedto1,
               MAX(destination) AS destination, MAX(purpose) AS purpose,
               MAX(epass_approved) AS epass_approved, MAX(fuel_farcode) AS fuel_farcode
          FROM epasstb
         WHERE status = ? AND (fuel_farcode IS NULL OR TRIM(fuel_farcode) = '')
         GROUP BY epassnumber, usercode
      ) d
      LEFT JOIN usertb u ON d.usercode = u.usercode
      LEFT JOIN request_approvers ra ON ra.module='epass' AND ra.request_number=d.epassnumber
      LEFT JOIN request_approvers assigned_ra ON assigned_ra.module='epass' AND assigned_ra.request_number=d.epassnumber
        AND assigned_ra.stage='department_head'
      LEFT JOIN usertb approver ON approver.usercode = COALESCE(NULLIF(TRIM(d.epass_approved), ''), assigned_ra.approver_usercode)
      WHERE (UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?))
          OR UPPER(TRIM(COALESCE(d.epass_approved, '')))=UPPER(TRIM(?)))
    `;

    if (year) {
      filters.push('YEAR(DATE_ADD(d.date, INTERVAL 8 HOUR)) = ?');
      params.push(parseInt(year, 10));
    }
    if (month) {
      filters.push('MONTH(DATE_ADD(d.date, INTERVAL 8 HOUR)) = ?');
      params.push(parseInt(month, 10));
    }
    if (day) {
      filters.push('DAY(DATE_ADD(d.date, INTERVAL 8 HOUR)) = ?');
      params.push(parseInt(day, 10));
    }
    if (department) {
      filters.push('UPPER(d.department) = ?');
      params.push(String(department).toUpperCase());
    }
    if (q) {
      filters.push('(UPPER(d.epassnumber) LIKE ? OR UPPER(u.name) LIKE ? OR UPPER(d.passenger) LIKE ?)');
      const likeQ = `%${sanitizeString(q)}%`.toUpperCase();
      params.push(likeQ, likeQ, likeQ);
    }

    if (filters.length) {
      sql += ` AND ${filters.join(' AND ')}`;
    }

    sql += ' GROUP BY d.epassnumber ORDER BY MAX(d.date) DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 50);

    const passes = await db.queryAll(sql, params);
    const items = passes.map((pass) => ({
      ...pass,
      status_label: epassService.getStatusLabel(pass.status),
      department_name: epassService.getDepartmentName(pass.department),
      passenger_list: epassService.splitGroupList(pass.passenger),
    }));

    return successResponse(res, { items, total: items.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/epass/all - For approvers or admin views
router.get('/all', async (req, res, next) => {
  try {
    if (!epassService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You do not have permission to manage gate pass approvals.');
    }

    const { year, month, day, department, q, status, limit } = req.query;
    const filters = [];
    // [PERF] Same fix as /pending: push what we can (fuel-link, and status when given) into the
    // inner subquery's WHERE instead of aggregating the whole epasstb history first — see the
    // longer note on /pending above. Status here is optional (dashboard-wide view), so only add
    // it to the inner filter when the caller actually asked for one status.
    const innerFilters = [`(fuel_farcode IS NULL OR TRIM(fuel_farcode) = '')`];
    const innerParams = [];
    if (status) {
      innerFilters.push('status = ?');
      innerParams.push(parseInt(status, 10));
    }
    const params = [...innerParams, req.user.usercode, req.user.usercode];
    // ponytail: same dedupe-before-GROUP_CONCAT fix as fetchGroupedFuelEpass/the history list/pending.
    let sql = `
      SELECT d.epassnumber,
             MAX(d.usercode) AS usercode, MAX(d.department) AS department,
             MAX(d.status) AS status, MAX(d.weight) AS weight,
             MAX(d.passenger) AS passenger, MAX(d.date) AS date,
             MAX(d.destination) AS destination, MAX(d.purpose) AS purpose,
             MAX(u.name) AS requester_name, MAX(u.profile_photo_url) AS requester_photo_url,
             MAX(NULLIF(TRIM(u.area), '')) AS area,
             MAX(d.epass_approved) AS approved_by,
             COALESCE(MAX(approver.name), MAX(assigned_ra.approver_usercode)) AS approver_name,
             GROUP_CONCAT(NULLIF(TRIM(d.grantedto1), '') ORDER BY d.Id SEPARATOR '||') AS granted_to,
             GROUP_CONCAT(NULLIF(TRIM(u.name), '') ORDER BY d.Id SEPARATOR '||') AS requester_names,
             GROUP_CONCAT(NULLIF(TRIM(d.usercode), '') ORDER BY d.Id SEPARATOR '||') AS requester_usercodes,
             GROUP_CONCAT(NULLIF(TRIM(u.profile_photo_url), '') ORDER BY d.Id SEPARATOR '||') AS requester_photo_urls
      FROM (
        SELECT MIN(Id) AS Id, epassnumber, usercode,
               MAX(department) AS department, MAX(status) AS status, MAX(weight) AS weight,
               MAX(passenger) AS passenger, MAX(\`date\`) AS \`date\`, MAX(grantedto1) AS grantedto1,
               MAX(destination) AS destination, MAX(purpose) AS purpose,
               MAX(epass_approved) AS epass_approved, MAX(fuel_farcode) AS fuel_farcode
          FROM epasstb
         WHERE ${innerFilters.join(' AND ')}
         GROUP BY epassnumber, usercode
      ) d
      LEFT JOIN usertb u ON d.usercode = u.usercode
      LEFT JOIN request_approvers ra ON ra.module='epass' AND ra.request_number=d.epassnumber
      LEFT JOIN request_approvers assigned_ra ON assigned_ra.module='epass' AND assigned_ra.request_number=d.epassnumber
        AND assigned_ra.stage='department_head'
      LEFT JOIN usertb approver ON approver.usercode = COALESCE(NULLIF(TRIM(d.epass_approved), ''), assigned_ra.approver_usercode)
      WHERE (UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?))
          OR UPPER(TRIM(COALESCE(d.epass_approved, '')))=UPPER(TRIM(?)))
    `;

    if (year) {
      filters.push('YEAR(DATE_ADD(d.date, INTERVAL 8 HOUR)) = ?');
      params.push(parseInt(year, 10));
    }
    if (month) {
      filters.push('MONTH(DATE_ADD(d.date, INTERVAL 8 HOUR)) = ?');
      params.push(parseInt(month, 10));
    }
    if (day) {
      filters.push('DAY(DATE_ADD(d.date, INTERVAL 8 HOUR)) = ?');
      params.push(parseInt(day, 10));
    }
    if (department) {
      filters.push('UPPER(d.department) = ?');
      params.push(String(department).toUpperCase());
    }
    if (q) {
      filters.push('(UPPER(d.epassnumber) LIKE ? OR UPPER(u.name) LIKE ? OR UPPER(d.passenger) LIKE ?)');
      const likeQ = `%${sanitizeString(q)}%`.toUpperCase();
      params.push(likeQ, likeQ, likeQ);
    }

    if (filters.length) {
      sql += ` AND ${filters.join(' AND ')}`;
    }

    sql += ' GROUP BY d.epassnumber ORDER BY MAX(d.date) DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 100);

    const passes = await db.queryAll(sql, params);
    const items = passes.map((pass) => ({
      ...pass,
      status_label: epassService.getStatusLabel(pass.status),
      department_name: epassService.getDepartmentName(pass.department),
      passenger_list: epassService.splitGroupList(pass.passenger),
    }));

    return successResponse(res, { items, total: items.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/epass/:epassNumber
router.get('/:epassNumber', async (req, res, next) => {
  try {
    const { epassNumber } = req.params;

    const pass = await epassService.getEpassByNumber(epassNumber);
    if (!pass) {
      return notFoundResponse(res, 'Gate pass not found.');
    }

    const result = {
      ...pass,
      status_label: epassService.getStatusLabel(pass.status),
      department_name: epassService.getDepartmentName(pass.department),
      passenger_list: epassService.splitGroupList(pass.passenger),
    };

    return successResponse(res, { pass: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/epass/create
router.post('/create', async (req, res, next) => {
  try {
    const { department, weight, passenger, people, destination, date, purpose, fuelFarCode, fuel_farcode } = req.body;

    const hasFuelPayload = Array.isArray(people) && people.length > 0;
    if (!hasFuelPayload && !department) {
      return badRequestResponse(res, 'Missing required fields: department.');
    }

    const epassNumber = await epassService.createEpass(req.user.usercode, hasFuelPayload ? {
      people,
      department,
      destination,
      date,
      purpose,
      fuel_farcode: fuelFarCode || fuel_farcode || '',
      approver_mode: req.body.approver_mode,
      approver_usercode: req.body.approver_usercode,
    } : {
      department,
      weight: weight || null,
      passenger: passenger || '',
      fuel_farcode: null,
    });

    if (!epassNumber) {
      return badRequestResponse(res, 'Failed to create gate pass.');
    }

    return successResponse(res, {
      message: 'Gate pass created successfully.',
      epass_number: epassNumber,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/epass/link-fuel
router.post('/link-fuel', async (req, res, next) => {
  try {
    const { epass_number, far_code } = req.body;

    if (!epass_number || !far_code) {
      return badRequestResponse(res, 'Missing epass_number or far_code.');
    }

    const pass = await epassService.getEpassByNumber(epass_number);
    if (!pass) {
      return notFoundResponse(res, 'Gate pass not found.');
    }

    const linked = await epassService.linkEpassToFuel(epass_number, far_code);

    return successResponse(res, {
      message: linked ? 'Gate pass linked to fuel request.' : 'Linking failed or already linked.',
      linked,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/epass/:epassNumber/approve
router.post('/:epassNumber/approve', async (req, res, next) => {
  try {
    const { epassNumber } = req.params;

    const pass = await epassService.getEpassByNumber(epassNumber);
    if (!pass) {
      return notFoundResponse(res, 'Gate pass not found.');
    }

    const approved = await epassService.approveEpass(epassNumber);

    if (!approved) {
      return badRequestResponse(res, 'Failed to approve gate pass.');
    }

    return successResponse(res, {
      message: 'Gate pass approved successfully.',
      epass_number: epassNumber,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/epass/:epassNumber/reject
router.post('/:epassNumber/reject', async (req, res, next) => {
  try {
    const { epassNumber } = req.params;

    const pass = await epassService.getEpassByNumber(epassNumber);
    if (!pass) {
      return notFoundResponse(res, 'Gate pass not found.');
    }

    const rejected = await epassService.rejectEpass(epassNumber);

    if (!rejected) {
      return badRequestResponse(res, 'Failed to reject gate pass.');
    }

    return successResponse(res, {
      message: 'Gate pass rejected successfully.',
      epass_number: epassNumber,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
