const express = require('express');
const router = express.Router();
const offlineCache = require('../services/offlineCacheService');
const config = require('../config/env');
const { successResponse, badRequestResponse } = require('../utils/response');

const getRequestUsercode = (req) => String(req.query?.usercode || req.body?.usercode || req.user?.usercode || '').trim();

// GET /api/offline/cache-status - Check cache status
router.get('/cache-status', async (req, res, next) => {
  try {
    const stats = await offlineCache.getCacheStats(req.user.usercode);
    return successResponse(res, stats);
  } catch (error) {
    next(error);
  }
});

// POST /api/offline/clear-cache - Clear specific cache
router.post('/clear-cache', async (req, res, next) => {
  try {
    const { report_type } = req.body;

    if (!report_type) {
      return badRequestResponse(res, 'Missing report_type parameter.');
    }

    const cleared = await offlineCache.clearCache(report_type);

    return successResponse(res, {
      message: cleared ? 'Cache cleared successfully.' : 'Failed to clear cache.',
      report_type,
      cleared,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/offline/clear-all - Clear all caches
router.post('/clear-all', async (req, res, next) => {
  try {
    const cleared = await offlineCache.clearAllCache();

    return successResponse(res, {
      message: cleared ? 'All caches cleared successfully.' : 'Failed to clear caches.',
      cleared,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/offline/dtr-report - Get cached DTR report
router.get('/dtr-report', async (req, res, next) => {
  try {
    const { usercode, year, month } = req.query;
    const targetUsercode = String(usercode || req.user?.usercode || '').trim();
    if (!targetUsercode) {
      return badRequestResponse(res, 'Missing usercode parameter.');
    }
    const targetYear = parseInt(year, 10) || new Date().getFullYear();
    const targetMonth = parseInt(month, 10) || new Date().getMonth() + 1;

    const report = await offlineCache.cacheDTRReport(targetUsercode, targetYear, targetMonth);

    return successResponse(res, { report });
  } catch (error) {
    next(error);
  }
});

// GET /api/offline/travel-report - Get cached travel report
router.get('/travel-report', async (req, res, next) => {
  try {
    const { usercode } = req.query;
    const targetUsercode = String(usercode || req.user?.usercode || '').trim();
    if (!targetUsercode) {
      return badRequestResponse(res, 'Missing usercode parameter.');
    }

    const report = await offlineCache.cacheTravelReport(targetUsercode);

    return successResponse(res, { report });
  } catch (error) {
    next(error);
  }
});

// GET /api/offline/fuel-report - Get cached fuel report
router.get('/fuel-report', async (req, res, next) => {
  try {
    const { usercode, year, month } = req.query;
    const targetUsercode = String(usercode || req.user?.usercode || '').trim();
    if (!targetUsercode) {
      return badRequestResponse(res, 'Missing usercode parameter.');
    }
    const targetYear = year ? parseInt(year, 10) : null;
    const targetMonth = month ? parseInt(month, 10) : null;

    const report = await offlineCache.cacheFuelReport(targetUsercode, targetYear, targetMonth);

    return successResponse(res, { report });
  } catch (error) {
    next(error);
  }
});

// GET /api/offline/employee-directory - Get cached employee directory
router.get('/employee-directory', async (req, res, next) => {
  try {
    const report = await offlineCache.cacheEmployeeDirectory();

    return successResponse(res, { report });
  } catch (error) {
    next(error);
  }
});

// GET /api/offline/pending-queue - Get pending offline changes
router.get('/pending-queue', async (req, res, next) => {
  try {
    const queue = await offlineCache.getPendingQueue(req.user.usercode);

    return successResponse(res, {
      pending: queue,
      count: queue.length,
      message: queue.length === 0 ? 'No pending changes.' : `${queue.length} pending change(s).`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/offline/sync - Sync pending changes to server
router.post('/sync', async (req, res, next) => {
  try {
    const queue = await offlineCache.getPendingQueue(req.user.usercode);

    if (queue.length === 0) {
      return successResponse(res, {
        message: 'No pending changes to sync.',
        synced: 0,
      });
    }

    let synced = 0;
    let failed = 0;
    const allowedPrefixes = [
      '/api/dtr', '/api/travel', '/api/fuel', '/api/epass', '/api/membership',
      '/api/it-equipment', '/api/warehouse', '/api/sidebar_layout',
      '/api/overtime', '/api/leave', '/api/signatory',
    ];
    const authorization = String(req.headers.authorization || '');
    for (const item of queue) {
      try {
        const internalOrigin = `http://127.0.0.1:${config.server.port}`;
        const target = new URL(String(item.endpoint || ''), internalOrigin);
        if (target.origin !== internalOrigin
          || !allowedPrefixes.some((prefix) => target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))) {
          throw new Error('Queued endpoint is not allowed.');
        }
        let queued = JSON.parse(item.data || '{}');
        if (typeof queued === 'string') queued = JSON.parse(queued || '{}');
        const method = String(queued.method || item.action || 'POST').toUpperCase();
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          throw new Error('Queued method is not allowed.');
        }
        const response = await fetch(target, {
          method,
          headers: {
            Authorization: authorization,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(queued.payload || {}),
        });
        if (!response.ok) throw new Error(`Replay failed (${response.status}).`);
        await offlineCache.markAsSynced(item.id);
        synced++;
      } catch (error) {
        console.error(`Failed to sync queue item ${item.id}:`, error.message);
        failed++;
      }
    }

    return successResponse(res, {
      message: `${synced} pending change(s) synced successfully.`,
      synced,
      failed,
      total: queue.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/offline/add-to-queue - Add offline change to queue
router.post('/add-to-queue', async (req, res, next) => {
  try {
    const { action, endpoint, data } = req.body;

    if (!action || !endpoint || !data) {
      return badRequestResponse(res, 'Missing action, endpoint, or data.');
    }

    const queuedId = await offlineCache.addToQueue(req.user.usercode, action, endpoint, data);

    return successResponse(res, {
      message: queuedId ? 'Added to queue.' : 'Failed to add to queue.',
      action,
      endpoint,
      queued_id: queuedId || 0,
      added: Boolean(queuedId),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
