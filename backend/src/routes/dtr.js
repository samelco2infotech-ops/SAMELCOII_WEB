/**
 * Purpose: Authenticated Node routes for all DTR actions formerly served by api/dtr.php.
 * EDIT GUIDE: Add DTR actions in the action switch and keep identity server-derived.
 * HUWAG BAGUHIN: submit_correction is privilege-gated (dtrService.canManageCorrections); it passes the
 * full req.user so the service can record WHO made the change (requested_by/reviewed_by) separately
 * from WHICH employee's DTR (usercode) is being corrected. Only privileged callers (HR/Payroll/Dept
 * Head) may target another employee's usercode — this is intentional for payroll audit correctness.
 * Tagalog: Ang requested_by/reviewed_by ay palaging ang HR/Payroll staff, hindi ang empleyadong
 * kinukorek, para tama ang audit trail.
 */
const express = require('express');
const service = require('../services/dtrService');
const pdfRenderService = require('../services/pdfRenderService');
const { successResponse, errorResponse, badRequestResponse, forbiddenResponse } = require('../utils/response');

const router = express.Router();

// ponytail: a dedicated path, not an `action=` case in the generic switch below — that switch
// requires a date range + resolvable usercode up front (dateRange()/badRequestResponse on missing
// employee), neither of which applies to "turn this already-rendered HTML into a PDF." Also this
// returns a binary PDF, not the JSON envelope every other action uses.
router.post('/render_pdf', async (req, res, next) => {
  try {
    const pdf = await pdfRenderService.renderDtrPdf({
      html: req.body?.html,
      baseHref: req.body?.base_href,
    });
    const filename = String(req.body?.filename || 'DTR').replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (error) {
    if (error.status) return errorResponse(res, error.message, error.status);
    next(error);
  }
});
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const text = (value) => String(value ?? '').trim();
const dateRange = (source) => {
  let from = text(source.date_from) || monthStart();
  let to = text(source.date_to) || today();
  if (!service.validDate(from) || !service.validDate(to)) throw Object.assign(new Error('Invalid date range.'), { status: 422 });
  if (from > to) [from, to] = [to, from];
  return { from, to };
};
const identity = (req) => text(req.user?.usercode || req.user?.username).toUpperCase();

router.all('/', async (req, res, next) => {
  try {
    const action = text(req.query.action || req.body?.action).toLowerCase();
    const input = req.method === 'GET' ? req.query : req.body || {};
    const { from, to } = dateRange(input);
    const requested = text(input.usercode).toUpperCase() || identity(req);
    if (!requested) return badRequestResponse(res, 'Missing employee number.');

    switch (action) {
      case 'my_corrections':
        // `requested` falls back to identity(req) when no usercode is given, so this stays
        // "my own corrections" for a plain employee view — but HR/Payroll correcting a DIFFERENT
        // employee's DTR (see submit_correction's targetUsercode) must get THAT employee's saved
        // corrections back, not their own, or a fresh save never appears after the page re-renders.
        return successResponse(res, { items: await service.myCorrections(requested, from, to) });
      case 'submit_correction':
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        await service.submitCorrection(req.user, input);
        return successResponse(res, { message: 'DTR assignment saved.' });
      case 'create_print_snapshot':
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        return successResponse(res, await service.createPrintSnapshot(input, identity(req)));
      case 'print_snapshot':
        return successResponse(res, { snapshot: await service.getPrintSnapshot(
          text(input.snapshot_uuid), identity(req), req.user?.privilage) });
      case 'monthly_computed': {
        const computed = await service.buildMonthlyComputed(requested, from, to);
        return successResponse(res, { items: computed.items, employee: computed.employee, date_from: from,
          date_to: to, source: 'checkinout', mode: 'monthly_computed',
          ...(computed.correction_warning ? { correction_warning: computed.correction_warning } : {}) });
      }
      case 'monthly_final': {
        const final = await service.monthlyFinal(requested, from, to);
        return successResponse(res, { items: final.items, employee: final.employee, date_from: from,
          date_to: to, source: 'dtr_final', mode: 'monthly_final',
          ...(final.correction_warning ? { correction_warning: final.correction_warning } : {}) });
      }
      case 'day_punches': {
        const date = text(input.date) || from;
        if (!service.validDate(date)) return badRequestResponse(res, 'Invalid date.');
        return successResponse(res, { date, items: await service.dayPunches(requested, date) });
      }
      case 'area_approver':
        return successResponse(res, { approver: await service.areaApprover(text(input.area), text(input.department)) });
      case 'schedule_list':
        return successResponse(res, { items: await service.scheduleHistory(requested) });
      case 'schedule_save': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        if (!service.canManageCorrections(req.user)) return forbiddenResponse(res, 'Privilege 6-10 is required to manage employee schedules.');
        const result = await service.saveSchedule({ ...input, usercode: requested }, req.user);
        return successResponse(res, { message: 'Schedule saved.', ...result });
      }
      case 'schedule_delete': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        if (!service.canManageCorrections(req.user)) return forbiddenResponse(res, 'Privilege 6-10 is required to manage employee schedules.');
        const result = await service.deleteSchedule(input.id);
        return successResponse(res, { message: 'Schedule removed.', ...result });
      }
      case 'employee_signatory_get':
        return successResponse(res, { signatory: await service.getEmployeeSignatory(requested) });
      case 'employee_signatory_list':
        return successResponse(res, { items: await service.listActiveEmployeeSignatories() });
      case 'employee_signatory_set': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        if (!service.canManageCorrections(req.user)) return forbiddenResponse(res, 'Privilege 6-10 is required to assign DTR signatories.');
        const result = await service.setEmployeeSignatory({ ...input, usercode: requested }, req.user);
        return successResponse(res, { message: 'Signatory saved.', ...result });
      }
      case 'employee_signatory_set_bulk': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        if (!service.canManageCorrections(req.user)) return forbiddenResponse(res, 'Privilege 6-10 is required to assign DTR signatories.');
        const result = await service.setEmployeeSignatoryBulk(input, req.user);
        return successResponse(res, { message: `Signatory saved for ${result.updated} employee(s).`, ...result });
      }
      case 'employee_signatory_remove': {
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        if (!service.canManageCorrections(req.user)) return forbiddenResponse(res, 'Privilege 6-10 is required to remove DTR signatories.');
        const result = await service.removeEmployeeSignatory(requested);
        return successResponse(res, { message: 'Signatory removed.', ...result });
      }
      case 'leave_summary': {
        const computed = await service.buildMonthlyComputed(requested, from, to);
        return successResponse(res, { summary: service.leaveSummary(computed, from, to), date_from: from, date_to: to, mode: 'leave_summary' });
      }
      case 'records':
        return successResponse(res, { items: await service.records({
          position: text(input.position) || 'Maintenance', usercode: text(input.usercode).toUpperCase(),
          from, to, includeWeekends: Number(input.include_weekends ?? 1) === 1,
        }), date_from: from, date_to: to, source: 'checkinout' });
      case 'positions':
        return successResponse(res, { items: (await service.positions()).map((row) => row.position) });
      case 'departments':
        return successResponse(res, { items: await service.departmentFilterOptions() });
      case 'roster':
        return successResponse(res, { items: await service.employeesByDepartment(text(input.department)) });
      case 'signatory_candidates':
        // ponytail: separate from 'roster' on purpose — this is "who can be picked as an
        // approver," not "who needs a DTR printed," so it must not carry the bioUID filter
        // that excludes executives who don't punch a time clock (see dtrService.js comment).
        return successResponse(res, { items: await service.signatoryCandidates() });
      case 'epass_dates':
        // Read-only, live check the print screen uses to relabel already-frozen EPASS days as
        // plain "EPASS" without rewriting dtr_final — see dtrService.js comment on epassDates().
        return successResponse(res, { dates: await service.epassDates(requested, from, to) });
      case 'refresh_recent': {
        // ponytail: fired (fire-and-forget, not awaited by the client) whenever the DTR module opens,
        // so completed-but-not-yet-frozen days get into dtr_final without waiting for the 1AM job.
        // finalizeRange already refuses today/future dates and is INSERT IGNORE, so this is always safe
        // to call, cheap (small window), and never touches an already-frozen row.
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        const days = Math.min(14, Math.max(1, Number(input.days) || 3));
        const windowTo = today();
        const windowFrom = (() => {
          const d = new Date(`${windowTo}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() - days);
          return d.toISOString().slice(0, 10);
        })();
        const result = await service.finalizeRange(windowFrom, windowTo);
        return successResponse(res, { message: 'Recent DTR days refreshed.', ...result });
      }
      case 'finalize_period': {
        // ponytail: the nightly job (dtrFinalize.js) only ever catches up a rolling 7-day window,
        // so an older month (e.g. one nobody opened while it was "recent") can sit forever with 0
        // frozen dtr_final rows — every load then live-recomputes every employee from raw punches
        // instead of hitting the cache. This lets an operator explicitly freeze a whole displayed
        // range on demand; finalizeRange is idempotent (INSERT IGNORE) so re-running it is harmless.
        if (req.method !== 'POST') return errorResponse(res, 'Method not allowed.', 405);
        if ((new Date(to) - new Date(from)) / 86400000 > 366) {
          return badRequestResponse(res, 'Range too large — finalize at most one year at a time.');
        }
        const result = await service.finalizeRange(from, to);
        return successResponse(res, { message: 'DTR period finalized.', ...result });
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
