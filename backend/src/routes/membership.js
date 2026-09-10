// Membership HTTP route: preserves the legacy action-based browser contract while serving it from Node.js.
// EDIT GUIDE: add a new action here only after its validated database operation exists in membershipService.js.
const express = require('express');
const multer = require('multer');
const membershipService = require('../services/membershipService');
const {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  conflictResponse,
  notFoundResponse,
} = require('../utils/response');
const { sanitizeString, toInt } = require('../utils/validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const buildStreetViewPlaceholderSvg = (lat, lng, width, height) => {
  const safeLat = String(lat ?? '');
  const safeLng = String(lng ?? '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#eff6ff"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="16" y="16" width="${Math.max(0, width - 32)}" height="${Math.max(0, height - 32)}" rx="20" fill="#ffffff" fill-opacity="0.72" stroke="#60a5fa" stroke-width="2"/>
  <text x="50%" y="45%" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#1d4ed8">Street View Preview</text>
  <text x="50%" y="56%" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#0f172a">Lat: ${safeLat} | Lng: ${safeLng}</text>
</svg>`;
};

const getBody = (req) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }

  try {
    return req.body ? JSON.parse(String(req.body)) : {};
  } catch {
    return {};
  }
};

router.get('/list', async (req, res, next) => {
  try {
    // HUWAG BAGUHIN: signed JWT usercode lamang ang puwedeng mag-scope ng employee status.
    const usercode = sanitizeString(req.user?.usercode) || '';
    const records = await membershipService.getMemberList({ search: '', page: 1, limit: 50, usercode });
    return successResponse(res, { records: records.items, total: records.total, pagination: records.pagination });
  } catch (error) {
    next(error);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const usercode = sanitizeString(req.user?.usercode) || '';
    const status = usercode ? await membershipService.getMemberDetail(usercode) : null;
    return successResponse(res, { status });
  } catch (error) {
    next(error);
  }
});

router.all('/', upload.single('file'), async (req, res, next) => {
  try {
    const action = String(req.query.action || '').trim().toLowerCase();

    if (!action) {
      return badRequestResponse(res, 'Invalid action.');
    }

    if (action === 'areas') {
      return successResponse(res, { items: await membershipService.getAreas() });
    }

    if (action === 'electricians') {
      return successResponse(res, { items: await membershipService.getElectricians() });
    }

    if (action === 'electrician_add') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      if (!req.user) {
        return unauthorizedResponse(res, 'Please login before adding an electrician.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const name = sanitizeString(payload.name);
      if (name.length < 3 || name.length > 255 || /[\u0000-\u001F\u007F]/.test(name)) {
        return badRequestResponse(res, 'Enter a valid electrician name between 3 and 255 characters.');
      }
      const saved = await membershipService.addElectrician(name);
      if (!saved.created) {
        return conflictResponse(res, 'That electrician is already listed.', { item: saved });
      }
      return successResponse(res, { message: 'Electrician added.', item: saved }, 201);
    }

    if (action === 'books') {
      const area = sanitizeString(req.query.area);
      if (!area) {
        return badRequestResponse(res, 'Area is required.');
      }
      const items = await membershipService.getBooks(area);
      return successResponse(res, { items, areaCode: String(area).replace(/\D+/g, '').padStart(3, '0').slice(-3) });
    }

    if (action === 'book_label') {
      const area = sanitizeString(req.query.area);
      const book = sanitizeString(req.query.book);
      const label = await membershipService.getBookLabel(area, book);
      return successResponse(res, { label });
    }

    if (action === 'last_memid') {
      const last = await membershipService.getLastMasterMemberId();
      return successResponse(res, {
        memberId: last.memberId,
        numeric: last.numeric,
        sourceDb: last.sourceDb,
        sourceTable: last.sourceTable,
      });
    }

    if (action === 'find_memid') {
      const memberId = sanitizeString(req.query.memberId || req.query.MEMID);
      if (!memberId) {
        return badRequestResponse(res, 'MEMID is required.');
      }
      const items = await membershipService.findMasterMemberId(memberId);
      return successResponse(res, {
        memberId,
        found: items.length > 0,
        count: items.length,
        items,
      });
    }

    if (action === 'generate') {
      const area = sanitizeString(req.query.area);
      const book = sanitizeString(req.query.book);
      const accountNumber = await membershipService.generateMemberAccount(area, book);
      const memberId = await membershipService.generateMemberId(area, book);
      return successResponse(res, { accountNumber, memberId });
    }

    if (action === 'agma_list') {
      const result = await membershipService.getAgmaRows({
        accountNumber: sanitizeString(req.query.accountNumber),
        memberId: sanitizeString(req.query.memberId),
        area: sanitizeString(req.query.area),
        book: sanitizeString(req.query.book),
        classification: sanitizeString(req.query.classification),
        limit: toInt(req.query.limit, 10),
        page: toInt(req.query.page, 1),
      });
      return successResponse(res, result);
    }

    if (action === 'consumer_search') {
      const search = sanitizeString(req.query.search);
      if (search.length < 2 || search.length > 120) {
        return badRequestResponse(res, 'Enter 2 to 120 characters of a consumer name or account number.');
      }
      const items = await membershipService.searchMasterConsumers({
        search,
        limit: Math.min(3, toInt(req.query.limit, 3)),
      });
      return successResponse(res, { items, total: items.length, limit: 3 });
    }

    if (action === 'consumer_detail') {
      const account = sanitizeString(req.query.account);
      const sourceDb = sanitizeString(req.query.sourceDb);
      if (!account || !sourceDb) {
        return badRequestResponse(res, 'Consumer account and source database are required.');
      }
      const record = await membershipService.getMasterConsumerDetail({ account, sourceDb });
      if (!record) return notFoundResponse(res, 'Consumer not found.');
      return successResponse(res, { record });
    }

    if (action === 'member_list') {
      const statusRaw = String(req.query.status || 'ALL').toUpperCase();
      const allMonths = statusRaw === 'ALL_MONTHS_PENDING' || String(req.query.all_months) === '1';
      const statusFilter = (statusRaw === 'UNFINISHED' || statusRaw === 'ALL_MONTHS_PENDING')
        ? 'PENDING'
        : (statusRaw === 'FINISHED' ? 'DONE' : 'ALL');
      const result = await membershipService.getMemberList({
        search: sanitizeString(req.query.search),
        area: sanitizeString(req.query.area),
        book: sanitizeString(req.query.book),
        month: allMonths ? 0 : toInt(req.query.month, 0),
        year: allMonths ? 0 : toInt(req.query.year, 0),
        day: toInt(req.query.day, 0),
        statusFilter,
        page: toInt(req.query.page, 1),
        limit: toInt(req.query.limit, 50),
      });
      return successResponse(res, result);
    }

    if (action === 'streetview_capture') {
      const lat = sanitizeString(req.query.lat);
      const lng = sanitizeString(req.query.lng);
      const width = Math.max(1, Math.min(640, toInt(req.query.width, 640)));
      const height = Math.max(1, Math.min(640, toInt(req.query.height, 640)));
      if (!lat || !lng) {
        return badRequestResponse(res, 'Valid latitude and longitude are required.');
      }
      return res
        .status(200)
        .type('image/svg+xml; charset=UTF-8')
        .send(buildStreetViewPlaceholderSvg(lat, lng, width, height));
    }

    if (action === 'streetview_store') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const result = await membershipService.saveStreetViewCapture({
        account: req.body?.account,
        filename: req.body?.filename,
        kind: req.body?.kind || 'street',
        fileBuffer: req.file?.buffer,
      });
      return successResponse(res, result);
    }

    if (action === 'member_detail') {
      const account = sanitizeString(req.query.account);
      if (!account) {
        return badRequestResponse(res, 'Account is required.');
      }
      const record = await membershipService.getMemberDetail(account);
      if (!record) {
        return notFoundResponse(res, 'Member not found.');
      }
      return successResponse(res, { record });
    }

    if (action === 'member_delete') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const account = sanitizeString(payload.account);
      if (!account) {
        return badRequestResponse(res, 'Account is required.');
      }
      await membershipService.deleteMember(account);
      return successResponse(res, { message: 'Member removed from list.' });
    }

    if (action === 'map_get') {
      const account = sanitizeString(req.query.account);
      if (!account) {
        return badRequestResponse(res, 'Account is required.');
      }
      const record = await membershipService.getMap(account);
      return successResponse(res, {
        record: record || {
          latitudeH: '',
          longitudeH: '',
          locationimage: '',
          nearest_landmark: '',
        },
      });
    }

    if (action === 'map_points') {
      const result = await membershipService.mapPoints({
        north: req.query.north,
        south: req.query.south,
        east: req.query.east,
        west: req.query.west,
      });
      return successResponse(res, result);
    }

    if (action === 'map_save') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      await membershipService.saveMap({
        account: payload.account,
        lat: payload.lat,
        lng: payload.lng,
        landmark: payload.landmark,
        streetImage: payload.streetImage,
      });
      return successResponse(res, { message: 'Map landmark saved.' });
    }

    if (action === 'profile_photo_store') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const result = await membershipService.saveProfilePhoto({
        account: req.body?.account,
        fullName: req.body?.fullName,
        filename: req.body?.filename,
        fileBuffer: req.file?.buffer,
      });
      return successResponse(res, result);
    }

    if (action === 'save_agma') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const result = await membershipService.saveAgma({
        ...payload,
        addedBy: sanitizeString(req.user?.usercode || req.user?.username || ''),
      });
      return successResponse(res, result);
    }

    if (action === 'fees_detail') {
      const account = sanitizeString(req.query.account || req.query.memberId || req.query.accountNumber);
      if (!account) {
        return badRequestResponse(res, 'Account is required.');
      }
      const detail = await membershipService.getFees(account);
      return successResponse(res, detail);
    }

    if (action === 'save_fees') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      await membershipService.saveFees({
        memberId: payload.account || payload.accountNumber || payload.memberId,
        fees: payload.fees || {},
      });
      return successResponse(res, { message: 'Fees saved.' });
    }

    if (action === 'pending_payments') {
      const items = await membershipService.listPendingPayments();
      return successResponse(res, { items });
    }

    if (action === 'mark_fees_paid') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const account = sanitizeString(payload.accountNumber || payload.account);
      await membershipService.markFeesPaid(account);
      return successResponse(res, { message: 'Marked as paid.' });
    }

    if (action === 'update') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const updated = await membershipService.updateMembership(payload);
      return successResponse(res, {
        message: 'Membership updated.',
        accountNumber: updated.accountNumber,
        memberId: updated.memberId,
      });
    }

    if (action === 'create') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const created = await membershipService.createMembership(payload, req.user?.usercode || req.user?.username || '');
      return successResponse(res, {
        message: 'Membership saved.',
        accountNumber: created.accountNumber,
        memberId: created.memberId,
      });
    }

    if (action === 'job_orders') {
      const result = await membershipService.getJobOrders({
        year: toInt(req.query.year, new Date().getFullYear()),
        month: toInt(req.query.month, new Date().getMonth() + 1),
        status: sanitizeString(req.query.status || 'ALL'),
        search: sanitizeString(req.query.search),
        area: sanitizeString(req.query.area),
        limit: toInt(req.query.limit, 10),
        page: toInt(req.query.page, 1),
      });
      return successResponse(res, result);
    }

    if (action === 'job_order_detail') {
      const account = sanitizeString(req.query.account);
      if (!account) {
        return badRequestResponse(res, 'Account is required.');
      }
      const detail = await membershipService.getJobOrderDetail(account);
      return successResponse(res, detail);
    }

    if (action === 'mark_job_order_released') {
      if (req.method !== 'POST') {
        return badRequestResponse(res, 'Method not allowed.');
      }
      const payload = req.body && Object.keys(req.body).length > 0 ? req.body : getBody(req);
      const account = sanitizeString(payload.account || payload.accountNumber);
      const release = await membershipService.markJobOrderReleased(
        account,
        req.user?.usercode || req.user?.username || ''
      );
      return successResponse(res, {
        message: 'Order released. Waiting for the completed form to return for Energized confirmation.',
        release,
      });
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
