/**
 * Purpose: Authenticated Node routes for employee Leave and assigned approval stages.
 * EDIT GUIDE: Identity and privileges must always come from req.user.
 * HUWAG BAGUHIN: update_status accepts tbleave Id only, never duplicate-prone trackingNo.
 * Tagalog: Ang approver ay makakakita at makaka-approve lamang ng request na naka-assign sa kanya.
 */
const express = require('express');
const service = require('../services/leaveService');
const { successResponse, errorResponse, badRequestResponse } = require('../utils/response');

const router = express.Router();
const text = (value) => String(value ?? '').trim();

router.all('/', async (req, res, next) => {
  try {
    const action = text(req.query.action || req.body?.action).toLowerCase();
    const input = req.method === 'GET' ? req.query : { ...req.query, ...req.body };
    switch (action) {
      case 'approver':
        if (req.method !== 'GET') return errorResponse(res, 'Method not allowed.', 405);
        return successResponse(res, await service.approver(req.user));
      case 'approver_options':
        if (req.method !== 'GET') return errorResponse(res, 'Method not allowed.', 405);
        return successResponse(res, { items: await service.approverOptions(text(input.q), input.limit) });
      case 'history': {
        if (req.method !== 'GET') return errorResponse(res, 'Method not allowed.', 405);
        const items = await service.history(text(req.user.usercode), input.limit);
        return successResponse(res, { items, history: items, total: items.length });
      }
      case 'submit': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        const result = await service.saveRequest(req.user, input);
        return successResponse(res, { message: 'Leave request submitted for approval.', ...result }, 201);
      }
      case 'update': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        const leaveId = Number(input.leave_id);
        if (!Number.isInteger(leaveId) || leaveId <= 0) return badRequestResponse(res, 'Invalid leave request.');
        const result = await service.saveRequest(req.user, input, leaveId);
        return successResponse(res, { message: 'Pending leave request updated.', ...result });
      }
      case 'pending':
      case 'all':
        return successResponse(res, await service.queue(req.user, input, action === 'pending'));
      case 'update_status': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        return successResponse(res, await service.updateStatus(req.user, input.leave_id, input.status));
      }
      default:
        return badRequestResponse(res, 'Invalid action.');
    }
  } catch (error) {
    if (error.status) return errorResponse(res, error.message, error.status);
    next(error);
  }
});

module.exports = router;
