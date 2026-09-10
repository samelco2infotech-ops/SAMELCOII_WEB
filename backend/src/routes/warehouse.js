/**
 * Purpose: Authenticated Warehouse API actions.
 * HUWAG BAGUHIN: user code always comes from req.user, never from the request body.
 */
const express = require('express');
const router = express.Router();
const warehouseService = require('../services/warehouseService');
const { successResponse, badRequestResponse, errorResponse } = require('../utils/response');

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    if (!action) return badRequestResponse(res, 'Missing action.');
    if (action === 'list_meter_payments') {
      return successResponse(res, { rows: await warehouseService.getMeterPayments(req.query) });
    }
    if (action === 'get_meter_payment_details') {
      return successResponse(res, { item: await warehouseService.getMeterPaymentDetails(req.query) });
    }
    if (action === 'save_meter_payment') {
      if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
      await warehouseService.saveMeterPayment(req.body, req.user.usercode);
      return successResponse(res, { message: 'Meter details saved.', statusCode: 5, workflowStage: 4 });
    }
    if (action === 'mark_meter_payment_printed') {
      if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
      await warehouseService.markMeterPaymentPrinted(req.body, req.user.usercode);
      return successResponse(res, { message: 'Order released from Warehouse.', workflowStage: 5, printFlag: 1 });
    }
    if (action === 'mark_meter_payment_energized') {
      if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
      const timing = await warehouseService.markMeterPaymentEnergized(req.body, req.user.usercode);
      return successResponse(res, { message: 'Order returned and marked Energized.', workflowStage: 6, printFlag: 3, timing });
    }
    if (action === 'update_meter_payment_status') {
      if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
      const affected = await warehouseService.updateMeterPaymentStatus(req.body);
      return successResponse(res, { message: 'Status updated.', affected });
    }
    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
});

router.get('/stock', async (req, res, next) => {
  try {
    const stock = await warehouseService.getStockRecords();
    return successResponse(res, { stock, total: stock.length });
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const transactions = await warehouseService.getTransactionHistory();
    return successResponse(res, { transactions, total: transactions.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
