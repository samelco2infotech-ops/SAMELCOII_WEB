const express = require('express');
const router = express.Router();
const meService = require('../services/meService');
const { successResponse, notFoundResponse, badRequestResponse } = require('../utils/response');

// GET /api/me/summary — the logged-in employee's own DTR totals, leave balance, and fuel.
// Always scoped to req.user.usercode; there is no usercode override (self-service only).
router.get('/summary', async (req, res, next) => {
  try {
    const usercode = req.user?.usercode;
    if (!usercode) {
      return badRequestResponse(res, 'Missing login user.');
    }
    const summary = await meService.buildMySummary(usercode);
    if (!summary) {
      return notFoundResponse(res, 'Employee record not found.');
    }
    return successResponse(res, summary);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
