const express = require('express');
const router = express.Router();
const db = require('../config/database');
const travelService = require('../services/travelService');
const { successResponse, badRequestResponse, forbiddenResponse, notFoundResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/validation');

// [FEATURE] Only privilege-10 users may reassign who the General Manager approver is for a
// specific Travel request — everyone else's general_manager_usercode is dropped silently (same
// admin-only gate the Leave module already uses for its GM stage).
const canReassignGeneralManager = (user) => String(user?.privilage || '')
  .split(/[^0-9]+/)
  .filter(Boolean)
  .includes('10');

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    if (!action) {
      return next();
    }

    if (action === 'update_status') {
      const { to_number, status } = req.body || {};
      const nextStatus = parseInt(status, 10);
      if (!to_number || ![2, 3].includes(nextStatus)) {
        return badRequestResponse(res, 'Invalid travel status update.');
      }
      if (!travelService.userCanManageApprovals(req.user)) {
        return forbiddenResponse(res, 'You do not have permission to update travel approvals.');
      }
      if (!await travelService.requestIsAssignedTo(to_number, req.user.usercode)) {
        return forbiddenResponse(res, 'This Travel request is assigned to another approver.');
      }
      const travel = await travelService.getTravelByNumber(to_number);
      if (!travel) {
        return notFoundResponse(res, 'Travel order not found.');
      }
      const result = nextStatus === 2
        ? await travelService.approveTravel(to_number, req.user.usercode)
        : await travelService.rejectTravel(to_number, req.user.usercode, '');
      return successResponse(res, {
        ok: !!result.updated,
        message: nextStatus === 3
          ? 'Travel order rejected.'
          : (result.final ? 'Travel order approved by the General Manager.' : 'Department Head approval recorded. Forwarded to the General Manager.'),
        approval_stage: result.approval_stage,
        next_stage: result.next_stage,
        status: result.final && nextStatus === 2 ? 2 : (nextStatus === 3 ? 3 : 1),
      });
    }

    if (action === 'cancel_by_fuel_farcode') {
      const fuelFarCode = String(req.body?.fuelFarCode || req.body?.fuel_farcode || '').trim();
      if (!fuelFarCode) {
        return badRequestResponse(res, 'Missing fuel FAR code.');
      }
      const removed = await travelService.cancelTravelByFuelFarCode(fuelFarCode);
      if (!removed) {
        return badRequestResponse(res, 'Unable to remove travel order.');
      }
      return successResponse(res, {
        message: 'Travel order removed.',
      });
    }

    if (action === 'by_fuel_farcode' || action === 'by_number') {
      const farCode = String(req.query.farCode || req.body?.farCode || '').trim();
      const requestedNumber = String(req.query.to_number || req.body?.to_number || '').trim();
      if (action === 'by_fuel_farcode' && !farCode) return res.status(422).json({ ok: false, message: 'Missing FAR code.' });
      if (action === 'by_number' && !requestedNumber) return res.status(422).json({ ok: false, message: 'Missing travel order number.' });
      const numberRow = action === 'by_fuel_farcode'
        ? await db.queryOne('SELECT to_number FROM traveltb WHERE fuel_farcode=? ORDER BY Id DESC LIMIT 1', [farCode])
        : { to_number: requestedNumber };
      if (!numberRow?.to_number) return successResponse(res, { item: null });
      const people = await db.queryAll(
        `SELECT t.Id AS row_id,t.usercode,
                COALESCE(NULLIF(TRIM(t.grantedto1),''),NULLIF(TRIM(u.name),''),t.usercode) AS name,
                COALESCE(u.profile_photo_url,'') AS photo_url
         FROM traveltb t LEFT JOIN usertb u ON u.usercode=t.usercode
         WHERE t.to_number=? ORDER BY t.Id`,
        [numberRow.to_number]
      );
      const signatoryRow = await db.queryOne(
        `SELECT
           (SELECT dh.name FROM request_approvers ra_dh
            JOIN usertb dh ON UPPER(TRIM(dh.usercode))=UPPER(TRIM(ra_dh.approver_usercode))
            WHERE ra_dh.module='travel' AND ra_dh.request_number=? AND ra_dh.stage='department_head' LIMIT 1) AS department_head_name,
           (SELECT dh.position FROM request_approvers ra_dh
            JOIN usertb dh ON UPPER(TRIM(dh.usercode))=UPPER(TRIM(ra_dh.approver_usercode))
            WHERE ra_dh.module='travel' AND ra_dh.request_number=? AND ra_dh.stage='department_head' LIMIT 1) AS department_head_position,
           (SELECT gm.name FROM request_approvers ra_gm
            JOIN usertb gm ON UPPER(TRIM(gm.usercode))=UPPER(TRIM(ra_gm.approver_usercode))
            WHERE ra_gm.module='travel' AND ra_gm.request_number=? AND ra_gm.stage='general_manager' LIMIT 1) AS general_manager_name,
           (SELECT gm.position FROM request_approvers ra_gm
            JOIN usertb gm ON UPPER(TRIM(gm.usercode))=UPPER(TRIM(ra_gm.approver_usercode))
            WHERE ra_gm.module='travel' AND ra_gm.request_number=? AND ra_gm.stage='general_manager' LIMIT 1) AS general_manager_position`,
        [numberRow.to_number, numberRow.to_number, numberRow.to_number, numberRow.to_number]
      );
      return successResponse(res, {
        item: {
          to_number: numberRow.to_number,
          people: people.map((person) => ({
            ...person,
            photo_url: Buffer.isBuffer(person.photo_url) ? person.photo_url.toString() : String(person.photo_url || ''),
          })),
          print_signatories: travelService.travelPrintSignatories(signatoryRow || {}),
        },
      });
    }

    if (action === 'remove_person') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      if (!travelService.userCanManageApprovals(req.user)) return forbiddenResponse(res, 'Removing an employee is restricted to approvers.');
      const toNumber = String(req.body?.to_number || '').trim();
      const rowId = Number.parseInt(req.body?.row_id, 10);
      if (!toNumber || rowId <= 0) return res.status(422).json({ ok: false, message: 'Missing travel order number or employee.' });
      if (!await travelService.requestIsAssignedTo(toNumber, req.user.usercode)) {
        return forbiddenResponse(res, 'This Travel request is assigned to another approver.');
      }
      const count = await db.queryOne('SELECT COUNT(*) total FROM traveltb WHERE to_number=?', [toNumber]);
      if (Number(count?.total || 0) <= 1) return res.status(409).json({ ok: false, message: 'This is the last employee on the travel order. Reject the request instead.' });
      const removed = await travelService.archiveAndRemovePerson(toNumber, rowId, req.user.usercode);
      if (!removed) return notFoundResponse(res, 'That employee is not on this travel order.');
      const people = await db.queryAll(
        `SELECT t.Id AS row_id,t.usercode,
                COALESCE(NULLIF(TRIM(t.grantedto1),''),NULLIF(TRIM(u.name),''),t.usercode) AS name,
                COALESCE(u.profile_photo_url,'') AS photo_url
         FROM traveltb t LEFT JOIN usertb u ON u.usercode=t.usercode
         WHERE t.to_number=? ORDER BY t.Id`,
        [toNumber]
      );
      return successResponse(res, { item: { to_number: toNumber, people } });
    }

    if (action === 'update') {
      const toNumber = String(req.body?.to_number || '').trim();
      const updated = await travelService.updateTravel(req.user.usercode, toNumber, {
        ...req.body,
        general_manager_usercode: canReassignGeneralManager(req.user) ? req.body?.general_manager_usercode : '',
      });
      return successResponse(res, {
        message: 'Pending Travel request updated.',
        to_number: updated,
        status: 1,
        status_label: 'Pending',
      });
    }

    const PATH_ALIASES = { list: '/list', pending: '/pending', all: '/all', create: '/create' };
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

// GET /api/travel/list?usercode=X
router.get('/list', async (req, res, next) => {
  try {
    const { usercode } = req.query;
    const userToFetch = sanitizeString(usercode) || req.user.usercode;
    if (userToFetch.toUpperCase() !== String(req.user?.usercode || '').toUpperCase()
      && !travelService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You can view only your own travel requests.');
    }

    const travels = await travelService.getTravelList(userToFetch);
    return successResponse(res, { items: travels, travels, total: travels.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/travel/pending - For approvers
router.get('/pending', async (req, res, next) => {
  try {
    if (!travelService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You do not have permission to manage travel approvals.');
    }

    const { year, month, day, department, q } = req.query;
    const filters = {
      year: year ? parseInt(year, 10) : null,
      month: month ? parseInt(month, 10) : null,
      day: day ? parseInt(day, 10) : null,
      department: department ? String(department).toUpperCase() : null,
      q: sanitizeString(q),
      approverUsercode: req.user.usercode,
    };

    const travels = await travelService.getPendingApprovals(filters);
    return successResponse(res, { items: travels, travels, total: travels.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/travel/all - Get all travel orders (with status filters)
router.get('/all', async (req, res, next) => {
  try {
    if (!travelService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You do not have permission to manage travel approvals.');
    }
    const { year, month, day, department, q, status } = req.query;
    const filters = {
      year: year ? parseInt(year, 10) : null,
      month: month ? parseInt(month, 10) : null,
      day: day ? parseInt(day, 10) : null,
      department: department ? String(department).toUpperCase() : null,
      q: sanitizeString(q),
      status: status ? parseInt(status, 10) : null,
      allStatuses: true,
      approverUsercode: req.user.usercode,
    };

    const travels = await travelService.getPendingApprovals(filters, 500);
    return successResponse(res, { items: travels, travels, total: travels.length });
  } catch (error) {
    next(error);
  }
});

// POST /api/travel/create
router.post('/create', async (req, res, next) => {
  try {
    const { department, destination, purpose, date, dates, people, fuelFarCode, fuel_farcode } = req.body;

    const hasFuelPayload = Array.isArray(people) && people.length > 0;
    if (!hasFuelPayload && (!department || !destination || !purpose || !date)) {
      return badRequestResponse(res, 'Missing required fields: department, destination, purpose, date.');
    }

    const toNumber = await travelService.createTravel(req.user.usercode, hasFuelPayload ? {
      department,
      destination,
      purpose,
      date,
      dates,
      people,
      fuel_farcode: fuelFarCode || fuel_farcode || '',
      approver_mode: req.body.approver_mode,
      approver_usercode: req.body.approver_usercode,
      general_manager_usercode: canReassignGeneralManager(req.user) ? req.body.general_manager_usercode : '',
    } : {
      department,
      destination,
      purpose,
      date,
    });

    if (!toNumber) {
      return badRequestResponse(res, 'Failed to create travel order.');
    }

    return successResponse(res, {
      message: 'Travel order created successfully.',
      to_number: toNumber,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/travel/approve?to_number=X
router.post('/approve', async (req, res, next) => {
  try {
    const { to_number } = req.query;

    if (!to_number) {
      return badRequestResponse(res, 'Missing to_number parameter.');
    }

    if (!travelService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You do not have permission to approve travel orders.');
    }

    const travel = await travelService.getTravelByNumber(to_number);
    if (!travel) {
      return notFoundResponse(res, 'Travel order not found.');
    }

    if (!await travelService.requestIsAssignedTo(to_number, req.user.usercode)) {
      return forbiddenResponse(res, 'This Travel request belongs to the next assigned signatory.');
    }
    const result = await travelService.approveTravel(to_number, req.user.usercode);

    if (!result.updated) {
      return badRequestResponse(res, 'Failed to approve travel order.');
    }

    return successResponse(res, {
      message: result.final
        ? 'Travel order approved by the General Manager.'
        : 'Department Head approval recorded. Forwarded to the General Manager.',
      to_number,
      approval_stage: result.approval_stage,
      next_stage: result.next_stage,
      status: result.final ? 2 : 1,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/travel/reject?to_number=X
router.post('/reject', async (req, res, next) => {
  try {
    const { to_number } = req.query;
    const { reason } = req.body;

    if (!to_number) {
      return badRequestResponse(res, 'Missing to_number parameter.');
    }

    if (!travelService.userCanManageApprovals(req.user)) {
      return forbiddenResponse(res, 'You do not have permission to reject travel orders.');
    }

    const travel = await travelService.getTravelByNumber(to_number);
    if (!travel) {
      return notFoundResponse(res, 'Travel order not found.');
    }

    if (!await travelService.requestIsAssignedTo(to_number, req.user.usercode)) {
      return forbiddenResponse(res, 'This Travel request belongs to the next assigned signatory.');
    }
    const result = await travelService.rejectTravel(to_number, req.user.usercode, reason || '');

    if (!result.updated) {
      return badRequestResponse(res, 'Failed to reject travel order.');
    }

    return successResponse(res, {
      message: 'Travel order rejected successfully.',
      to_number,
      approval_stage: result.approval_stage,
      next_stage: null,
      status: 3,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
