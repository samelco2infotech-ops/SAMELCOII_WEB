/**
 * Purpose: Authenticated Node signatory lookup and privilege-10 administration.
 * EDIT GUIDE: Read actions stay available to logged-in users; mutations require token 10.
 * HUWAG BAGUHIN: Do not use a numeric >= check for admin; legacy privilege is token-based.
 * Tagalog: Tanging may privilege token 10 ang puwedeng magpalit ng signatory.
 */
const express = require('express');
const service = require('../services/signatoryService');
const { successResponse, errorResponse, badRequestResponse, forbiddenResponse } = require('../utils/response');

const router = express.Router();
const text = (value) => String(value ?? '').trim();
const tokens = (user) => new Set(`${user?.privilage ?? ''},${user?.privilagemenu ?? ''}`
  .split(/[\s,;|]+/).map((v) => v.trim()).filter(Boolean));
// [FIX] 'bootstrap' was previously listed here, silently 403ing non-admin users out of the plain
// employee search — it powers the Warehouse withdrawn-employee picker and the print-preview
// signatory picker, both meant for any logged-in user, not just privilege-10 admins. It's a read
// action per this file's own EDIT GUIDE above; only the actual mutations stay admin-gated.
const adminActions = new Set([
  'transfer_employee', 'create_group', 'change_group_signatory',
  'assign_member', 'change_member', 'remove_member', 'remove_group',
]);

router.all('/', async (req, res, next) => {
  // [FIX] Express sets an ETag on every JSON response by default. bootstrap's results depend on
  // the live 'q' search term, so a browser that previously cached an empty/stale result for one
  // exact query string was replaying that stale body via a 304 instead of ever re-searching —
  // this was masking the actual bug fix above for any query already tried once. Search results
  // must never be cached.
  res.set('Cache-Control', 'no-store');
  try {
    const action = text(req.body?.action || req.query.action || 'bootstrap').toLowerCase();
    const input = req.method === 'GET' ? req.query : { ...req.query, ...req.body };
    if (adminActions.has(action) && !tokens(req.user).has('10')) return forbiddenResponse(res);
    if (adminActions.has(action) && action !== 'bootstrap' && req.method !== 'POST') {
      return errorResponse(res, 'Method not allowed.', 405);
    }
    switch (action) {
      case 'agma_signatories': {
        const signatures = await service.departmentSignatures(true);
        return successResponse(res, { total: signatures.length, signatures });
      }
      case 'department_signatures': {
        const signatures = await service.departmentSignatures();
        return successResponse(res, { total: signatures.length, signatures });
      }
      case 'get':
        return successResponse(res, await service.get(
          text(input.module), text(input.department), text(input.usercode).toUpperCase()));
      case 'bootstrap':
        return successResponse(res, await service.bootstrap({
          q: text(input.q), department: text(input.department), area: text(input.area),
        }));
      case 'transfer_employee':
        await service.transferEmployee({
          usercode: text(input.usercode).toUpperCase(), department: text(input.department), area: text(input.area),
        }, text(req.user.usercode));
        return successResponse(res, { message: 'Employee department and area updated.' });
      case 'create_group':
        await service.createGroup({
          module_key: text(input.module_key), signatory_usercode: text(input.signatory_usercode).toUpperCase(),
          department: text(input.department),
        }, text(req.user.usercode));
        return successResponse(res, { message: 'Signatory group saved.' });
      case 'change_group_signatory':
        await service.changeGroupSignatory({
          group_id: Number(input.group_id), signatory_usercode: text(input.signatory_usercode).toUpperCase(),
          department: text(input.department),
        }, text(req.user.usercode));
        return successResponse(res, { message: 'Signatory changed.' });
      case 'assign_member':
      case 'change_member':
        await service.assignMember({
          group_id: Number(input.group_id), usercode: text(input.usercode).toUpperCase(), member_id: Number(input.member_id),
        }, text(req.user.usercode), action === 'change_member');
        return successResponse(res, { message: 'Employee assignment saved.' });
      case 'remove_member':
      case 'remove_group':
        await service.remove(action, Number(input.id));
        return successResponse(res, { message: 'Record removed.' });
      default:
        return badRequestResponse(res, 'Invalid action.');
    }
  } catch (error) {
    if (error.status) return errorResponse(res, error.message, error.status);
    next(error);
  }
});

module.exports = router;
