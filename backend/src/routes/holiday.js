/**
 * Purpose: Authenticated Node routes for the Philippine Holidays calendar (philippine_holidays).
 * EDIT GUIDE: Identity/privileges must always come from req.user; writes are gated in holidayService.canManage.
 */
const express = require('express');
const service = require('../services/holidayService');
const { successResponse, errorResponse, badRequestResponse } = require('../utils/response');

const router = express.Router();
const text = (value) => String(value ?? '').trim();

router.all('/', async (req, res, next) => {
  try {
    const action = text(req.query.action || req.body?.action).toLowerCase();
    const input = req.method === 'GET' ? req.query : { ...req.query, ...req.body };
    switch (action) {
      case 'list':
        if (req.method !== 'GET') return errorResponse(res, 'Method not allowed.', 405);
        return successResponse(res, await service.list(input));
      case 'add': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        const result = await service.add(req.user, input);
        return successResponse(res, { message: 'Holiday added.', ...result }, 201);
      }
      case 'update': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        const result = await service.update(req.user, input);
        return successResponse(res, { message: 'Holiday updated.', ...result });
      }
      case 'delete': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        const result = await service.remove(req.user, input);
        return successResponse(res, { message: 'Holiday deleted.', ...result });
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
