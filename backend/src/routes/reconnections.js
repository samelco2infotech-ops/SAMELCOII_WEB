/**
 * Purpose: Node routes for ISD Reconnection Order requests — list/save/delete, backed by
 * reconnectionService.js. Mounted with verifyToken in app.js, same as every other module route.
 * EDIT GUIDE: action-based single endpoint, same convention as dtr.js/membership.js.
 */
const express = require('express');
const service = require('../services/reconnectionService');
const { successResponse, badRequestResponse, errorResponse } = require('../utils/response');

const router = express.Router();

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    const input = req.method === 'GET' ? req.query : (req.body || {});

    switch (action) {
      case 'list': {
        const items = await service.listRequests();
        return successResponse(res, { items });
      }
      case 'next_id': {
        const reconnId = await service.nextReconnId();
        return successResponse(res, { reconnId });
      }
      case 'detail': {
        const id = String(input.id || '').trim();
        if (!id) return badRequestResponse(res, 'Request ID is required.');
        const item = await service.getRequest(id);
        return successResponse(res, { item });
      }
      case 'save': {
        if (req.method !== 'POST') return badRequestResponse(res, 'Method not allowed.');
        const item = await service.saveRequest({
          id: input.id,
          fields: input.fields || {},
          actor: req.user,
        });
        return successResponse(res, { item, message: 'Reconnection request saved.' });
      }
      case 'delete': {
        if (req.method !== 'POST') return badRequestResponse(res, 'Method not allowed.');
        const id = String(input.id || '').trim();
        if (!id) return badRequestResponse(res, 'Request ID is required.');
        await service.deleteRequest(id);
        return successResponse(res, { message: 'Reconnection request deleted.' });
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
