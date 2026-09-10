const express = require('express');
const router = express.Router();
const itEquipmentService = require('../services/itEquipmentService');
const { successResponse, badRequestResponse, errorResponse } = require('../utils/response');

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    if (!action) {
      return next();
    }

    if (action === 'my_accountability_borrowed' || action === 'assigned') {
      const forms = await itEquipmentService.getEquipmentAssigned(req.user.usercode);
      return successResponse(res, { ok: true, forms, total: forms.length });
    }

    if (action === 'inventory' || action === 'list_inventory') {
      const inventory = await itEquipmentService.getInventory();
      return successResponse(res, {
        items: inventory,
        inventory,
        total: inventory.length,
        database: 'it_program',
        table: 'materials_it',
      });
    }

    if (action === 'search_users') {
      return successResponse(res, { items: await itEquipmentService.searchUsers(req.query.q) });
    }

    if (action === 'next_accountability_formno') {
      return successResponse(res, { formNo: await itEquipmentService.nextAccountabilityFormNo() });
    }

    if (action === 'list_accountability') {
      return successResponse(res, { rows: await itEquipmentService.listAccountability() });
    }

    if (action === 'get_accountability') {
      return successResponse(res, await itEquipmentService.getAccountability({
        formNo: req.query.formNo || req.query.formno,
        id: req.query.id,
      }));
    }

    if (action === 'save_accountability' || action === 'update_accountability') {
      if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
      const saved = await itEquipmentService.saveAccountability(
        req.body,
        req.user,
        action === 'update_accountability'
      );
      return successResponse(res, {
        message: action === 'update_accountability' ? 'Updated.' : 'Data saved.',
        ...saved,
      });
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
});

router.get('/inventory', async (req, res, next) => {
  try {
    const inventory = await itEquipmentService.getInventory();
    return successResponse(res, {
      items: inventory,
      inventory,
      total: inventory.length,
      database: 'it_program',
      table: 'materials_it',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/assigned', async (req, res, next) => {
  try {
    const equipment = await itEquipmentService.getEquipmentAssigned(req.user.usercode);
    return successResponse(res, { equipment, total: equipment.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
