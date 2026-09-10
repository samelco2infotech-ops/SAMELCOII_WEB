const express = require('express');
const router = express.Router();
const db = require('../config/database');
const fuelService = require('../services/fuelService');
const epassService = require('../services/epassService');
const { successResponse, badRequestResponse, forbiddenResponse, notFoundResponse } = require('../utils/response');
const { sanitizeString, toInt } = require('../utils/validation');

const getUserRow = async (usercode) => {
  return db.queryOne(
    `SELECT Id, usercode, name, position, department, area, emailadd, address, mobile_number, profile_photo_url,
            COALESCE(privilage, '') AS privilage,
            COALESCE(VLbal, 0) AS VLbal,
            COALESCE(SLbal, 0) AS SLbal,
            COALESCE(OLbal, 0) AS OLbal
     FROM usertb
     WHERE usercode = ?
     LIMIT 1`,
    [usercode]
  );
};

const getDepartmentAbbr = async (usercode) => {
  const row = await db.queryOne(
    `SELECT COALESCE(d.ABREVATION, u.department, '') AS abbr
     FROM usertb u
     LEFT JOIN departmenttb d ON u.department = d.NAME
     WHERE u.usercode = ?
     LIMIT 1`,
    [usercode]
  );
  return String(row?.abbr || '').trim().toUpperCase();
};

// ponytail: reading currentStatus before the transaction and deducting balance with no lock let
// two concurrent approve clicks on the same FARCode (double-click, two tabs, two approvers) both
// pass the check and both deduct, silently doubling the balance hit. Folding the status check
// into the UPDATE's own WHERE as an atomic compare-and-swap (same pattern as overtime.js) fixes
// it: MySQL's row lock on UPDATE serializes concurrent attempts, so only the transaction that
// actually flips the status gets affectedRows>0 and is allowed to touch the balance — a second,
// now-stale attempt affects 0 rows and skips the deduction instead of double-applying it.
// Must run inside a transaction already begun by the caller (connection.beginTransaction()).
const applyFuelStatusTransition = async (connection, { status, currentStatus, farCode, amount, departmentAbbr, actorUsercode, usercode }) => {
  let transitioned = false;
  if (status === 1 && [2, 3].includes(currentStatus)) {
    // ponytail: used to require fuel>=amount / balance>=amount and block approval otherwise.
    // Approvers now need to be able to approve past a depleted allocation — the balance is a
    // running report of usage, not a hard spending cap — so it's allowed to go negative.
    const [swap] = await connection.execute(
      'UPDATE fuelallocation_history SET status=?,approvedby=? WHERE FARCode=? AND status IN (2,3)',
      [status, actorUsercode, farCode]
    );
    transitioned = swap.affectedRows > 0;
    if (transitioned) {
      const [deptResult] = await connection.execute(
        'UPDATE fuelallocation_limit SET fuel=fuel-? WHERE Department=? LIMIT 1',
        [amount, departmentAbbr]
      );
      const [userResult] = await connection.execute(
        'UPDATE fuelallocation_history SET balance=balance-? WHERE usercode=? AND status=4 ORDER BY Id DESC LIMIT 1',
        [amount, usercode]
      );
      if (!deptResult.affectedRows || !userResult.affectedRows) {
        throw Object.assign(new Error('Department or employee fuel account is not configured.'), { statusCode: 422 });
      }
    }
  } else if (status === 3 && currentStatus === 1) {
    const [swap] = await connection.execute(
      'UPDATE fuelallocation_history SET status=?,approvedby=? WHERE FARCode=? AND status=1',
      [status, actorUsercode, farCode]
    );
    transitioned = swap.affectedRows > 0;
    if (transitioned) {
      await connection.execute('UPDATE fuelallocation_limit SET fuel=fuel+? WHERE Department=? LIMIT 1', [amount, departmentAbbr]);
      await connection.execute(
        'UPDATE fuelallocation_history SET balance=balance+? WHERE usercode=? AND status=4 ORDER BY Id DESC LIMIT 1',
        [amount, usercode]
      );
    }
  }
  if (!transitioned) {
    // No balance-affecting transition matched (already settled by a concurrent request, or this
    // status change carries no fund adjustment) — still record the requested status, matching
    // the original unconditional behavior for that case.
    await connection.execute(
      'UPDATE fuelallocation_history SET status=?,approvedby=? WHERE FARCode=? AND status<>4',
      [status, actorUsercode, farCode]
    );
  }
  return transitioned;
};

const getRequestUsercode = (req) => sanitizeString(req.query?.usercode || req.body?.usercode || req.user?.usercode || '');

const getVehicleAssignments = async (plate) => {
  return db.queryAll(
    `SELECT fva.usercode,
            COALESCE(NULLIF(TRIM(u.name), ''), fva.usercode) AS employee_name,
            COALESCE(u.department, '') AS department,
            COALESCE(u.area, '') AS area,
            fva.active,
            fva.assigned_by,
            COALESCE(NULLIF(TRIM(ab.name), ''), fva.assigned_by, '') AS assigned_by_name,
            fva.assigned_at
     FROM fuel_vehicle_assignments fva
     LEFT JOIN usertb u ON u.usercode = fva.usercode
     LEFT JOIN usertb ab ON ab.usercode = fva.assigned_by
     WHERE UPPER(TRIM(fva.UnitPlateNumber)) = ?
     ORDER BY fva.active DESC, fva.assigned_at DESC, employee_name ASC`,
    [String(plate || '').trim().toUpperCase()]
  );
};

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    if (!action) {
      return next();
    }
    await fuelService.ensureFuelSchema();

    if (action === 'employee') {
      const usercode = getRequestUsercode(req);
      if (!usercode) {
        return badRequestResponse(res, 'Missing usercode parameter.');
      }
      if (usercode.toUpperCase() !== String(req.user?.usercode || '').toUpperCase()
        && !fuelService.canViewOrganizationFuel(req.user)) {
        return forbiddenResponse(res, 'You can view only your own fuel account.');
      }
      const user = await getUserRow(usercode);
      if (!user) {
        return notFoundResponse(res, 'Employee not found.');
      }
      const balanceRow = await db.queryOne(
        'SELECT COALESCE(balance,0) balance FROM fuelallocation_history WHERE usercode=? AND status=4 ORDER BY Id DESC LIMIT 1',
        [usercode]
      );
      const departmentAbbr = await getDepartmentAbbr(usercode);
      const departmentStats = await fuelService.getDepartmentFuelStats(departmentAbbr, new Date().getFullYear(), new Date().getMonth() + 1);
      const assignedVehicle = await fuelService.getAssignedVehicleForUser(usercode);
      const latestRow = await db.queryOne(
        `SELECT FARCode,Requested_item,Purpose,unit_id,PresRequest,PresRequestDate,PrevRequestDate,PrevTravel,COALESCE(Destination,'') AS Destination,fuelstation
         FROM fuelallocation_history WHERE usercode=? ORDER BY COALESCE(PresRequestDate,PrevRequestDate) DESC,Id DESC LIMIT 1`,
        [usercode]
      );
      // [FIX] "Prev. Travel" prefill was reading the latest row's OWN PrevTravel column — the
      // travel that request itself was recommending as "previous" when IT was created, one
      // generation stale. What the next request actually needs is where that latest request went,
      // i.e. its Destination; PrevTravel only survives as a fallback for rows saved before the
      // Destination column existed.
      const latest = latestRow ? {
        farCode: latestRow.FARCode || '',
        requestedItem: latestRow.Requested_item || '',
        purpose: latestRow.Purpose || '',
        vehicle: latestRow.unit_id || '',
        prevAlloc: latestRow.PresRequest || '',
        previousTravelDate: latestRow.PresRequestDate || latestRow.PrevRequestDate || '',
        prevTravel: latestRow.Destination || latestRow.PrevTravel || '',
        fuelstation: latestRow.fuelstation || '',
      } : {};
      return successResponse(res, {
        data: {
          user,
          balance: Number(balanceRow?.balance || 0),
          department: user.department || '',
          department_abbr: departmentAbbr,
          department_balance: departmentStats.remaining_month,
          department_monthly_quota: departmentStats.monthly_quota,
          department_remaining_month: departmentStats.remaining_month,
          department_issued_month: departmentStats.issued_month,
          area: user.area || '',
          assigned_vehicle: assignedVehicle?.UnitPlateNumber || assignedVehicle?.plate || '',
          latest,
          canApprove: fuelService.canManageFuelApprovals(req.user),
        },
      });
    }

    if (action === 'department_fuel') {
      const department = sanitizeString(req.query.department || req.body?.department || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!department) return badRequestResponse(res, 'Missing department.');
      const stats = await fuelService.getDepartmentFuelStats(department, new Date().getFullYear(), new Date().getMonth() + 1);
      return successResponse(res, {
        department_abbr: stats.department_abbr,
        department_balance: stats.remaining_month,
        department_monthly_quota: stats.monthly_quota,
        department_remaining_month: stats.remaining_month,
        department_issued_month: stats.issued_month,
      });
    }

    if (action === 'vehicles') {
      const q = sanitizeString(req.query.q || '').toUpperCase();
      const limit = Math.max(1, Math.min(200, Number.parseInt(req.query.limit, 10) || (q ? 10 : 25)));
      const likePrefix = `${q}%`;
      const like = `%${q}%`;
      const rows = await db.queryAll(
        `SELECT vehiclecode,COALESCE(model,'') model,COALESCE(vehiclemake,'') vehiclemake,
                COALESCE(UnitPlateNumber,'') UnitPlateNumber,Vblob,COALESCE(registered_driver,'') registered_driver,
                COALESCE(Area_Department,'') Area_Department,COALESCE(type,'') type,COALESCE(status,'') status
         FROM vehicletb
         WHERE (?='' OR COALESCE(UnitPlateNumber,'') LIKE ? OR COALESCE(vehiclecode,'') LIKE ?
           OR COALESCE(model,'') LIKE ? OR COALESCE(vehiclemake,'') LIKE ?
           OR COALESCE(registered_driver,'') LIKE ? OR COALESCE(Area_Department,'') LIKE ?)
         ORDER BY UnitPlateNumber LIMIT ?`,
        [q, likePrefix, likePrefix, like, like, like, like, limit]
      );
      const used = new Map((await fuelService.getVehiclesUsedToday()).map((row) => [String(row.unit_id || '').trim().toUpperCase(), row]));
      return successResponse(res, {
        items: rows.map((row) => {
          const usage = used.get(String(row.UnitPlateNumber || row.vehiclecode || '').trim().toUpperCase());
          return {
            ...row,
            Vblob: Buffer.isBuffer(row.Vblob) ? row.Vblob.toString('base64') : '',
            used_today: usage ? 1 : 0,
            used_today_count: Number(usage?.count || 0),
          };
        }),
      });
    }

    if (action === 'mark_print') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const farCode = sanitizeString(req.body?.farCode || '');
      if (!farCode) return badRequestResponse(res, 'Missing FAR code.');
      await db.execute(`CREATE TABLE IF NOT EXISTS fuel_print_log (
        farcode VARCHAR(64) NOT NULL PRIMARY KEY,print_count INT NOT NULL DEFAULT 0,
        first_printed_at DATETIME NULL,last_printed_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      const result = await db.execute(
        `INSERT INTO fuel_print_log (farcode,print_count,first_printed_at,last_printed_at)
         VALUES (?,1,NOW(),NOW()) ON DUPLICATE KEY UPDATE print_count=print_count+1,last_printed_at=NOW()`,
        [farCode]
      );
      return successResponse(res, { printed_before: result.affectedRows !== 1 });
    }

    if (action === 'vehicle_assignments') {
      const plate = sanitizeString(req.query.plate || req.body?.plate || '');
      if (!plate) {
        return badRequestResponse(res, 'Missing plate parameter.');
      }
      return successResponse(res, { items: await getVehicleAssignments(plate) });
    }

    if (action === 'assign_vehicle') {
      const plate = sanitizeString(req.body?.plate || req.query.plate || '').toUpperCase();
      const usercode = sanitizeString(req.body?.usercode || req.query.usercode || '').toUpperCase();
      if (!plate || !usercode) {
        return badRequestResponse(res, 'Enter a valid employee number and vehicle plate.');
      }
      const user = await getUserRow(usercode);
      if (!user) {
        return notFoundResponse(res, 'Employee number not found.');
      }
      const vehicle = await db.queryOne(
        `SELECT 1 FROM vehicletb
         WHERE UPPER(TRIM(UnitPlateNumber)) = ?
            OR UPPER(TRIM(vehiclecode)) = ?
         LIMIT 1`,
        [plate, plate]
      );
      if (!vehicle) {
        return notFoundResponse(res, 'Vehicle plate not found.');
      }
      await db.execute(
        `INSERT INTO fuel_vehicle_assignments (usercode, UnitPlateNumber, active, assigned_by, assigned_at)
         VALUES (?, ?, 1, ?, NOW())
         ON DUPLICATE KEY UPDATE active = VALUES(active), assigned_by = VALUES(assigned_by), assigned_at = VALUES(assigned_at)`,
        [usercode, plate, req.user?.usercode || usercode]
      );
      return successResponse(res, {
        message: 'Vehicle assigned to employee.',
        plate,
        items: await getVehicleAssignments(plate),
      });
    }

    if (action === 'unassign_vehicle') {
      const plate = sanitizeString(req.body?.plate || req.query.plate || '').toUpperCase();
      const usercode = sanitizeString(req.body?.usercode || req.query.usercode || '').toUpperCase();
      if (!plate || !usercode) {
        return badRequestResponse(res, 'Enter a valid employee number and vehicle plate.');
      }
      await db.execute(
        'DELETE FROM fuel_vehicle_assignments WHERE UPPER(TRIM(usercode)) = ? AND UPPER(TRIM(UnitPlateNumber)) = ? LIMIT 1',
        [usercode, plate]
      );
      return successResponse(res, {
        message: 'Vehicle assignment removed.',
        plate,
        items: await getVehicleAssignments(plate),
      });
    }

    if (action === 'assign_balance') {
      const targetUsercode = sanitizeString(req.body?.usercode || req.query.usercode || '').toUpperCase();
      const balance = Number(req.body?.balance ?? req.query.balance ?? -1);
      if (!targetUsercode || !Number.isFinite(balance) || balance < 0) {
        return badRequestResponse(res, 'Enter a valid employee number and fuel balance.');
      }
      const user = await getUserRow(targetUsercode);
      if (!user) {
        return notFoundResponse(res, 'Employee number not found.');
      }
      const chargeDepartment = sanitizeString(req.body?.charge_department || req.query.charge_department || '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '') || await getDepartmentAbbr(req.user.usercode);
      if (!chargeDepartment) return badRequestResponse(res, 'Choose the department paying this fuel.');
      const existing = await db.queryOne(
        `SELECT Id,COALESCE(balance,0) balance FROM fuelallocation_history
         WHERE usercode = ? AND status = 4
         ORDER BY Id DESC
         LIMIT 1`,
        [targetUsercode]
      );
      const currentBalance = Number(existing?.balance || 0);
      const delta = Math.round((balance - currentBalance) * 100) / 100;
      // ponytail: fuelallocation_limit.fuel can drift from the quota-minus-issued figure shown on
      // screen (e.g. never seeded, or issuances tracked outside this column). Re-derive "remaining"
      // from the same function the UI reads so the charge check matches what the user sees, then
      // write the absolute result back — self-healing the column instead of trusting its old value.
      const nowYear = new Date().getFullYear();
      const nowMonth = new Date().getMonth() + 1;
      const deptStatsBefore = await fuelService.getDepartmentFuelStats(chargeDepartment, nowYear, nowMonth);
      if (delta > 0 && delta > deptStatsBefore.remaining_month) {
        throw Object.assign(new Error('Selected department has no enough fuel balance.'), { statusCode: 422 });
      }
      const newRemaining = Math.round((deptStatsBefore.remaining_month - delta) * 100) / 100;
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [synced] = await connection.execute(
          'UPDATE fuelallocation_limit SET fuel=? WHERE Department=?',
          [newRemaining, chargeDepartment]
        );
        if (!synced.affectedRows) throw Object.assign(new Error('Department fuel allocation not configured.'), { statusCode: 422 });
        if (existing) {
          await connection.execute(
            `UPDATE fuelallocation_history SET balance=?,PrevRequest=?,
             note=CONCAT('Balance set by ',?,' / charge dept ',?,' / change ',?,'L on ',DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i'))
             WHERE Id=?`,
            [balance, balance, req.user.usercode, chargeDepartment, delta, existing.Id]
          );
        } else {
          await connection.execute(
            `INSERT INTO fuelallocation_history
             (usercode,Requested_item,PresRequest,Balance,PrevRequest,PrevRequestDate,PresRequestDate,unit_id,
              Purpose,PrevTravel,status,note,accountused,fuelstation)
             VALUES (?,'DIESEL',0,?,?,CURDATE(),CURDATE(),'','AUTO SEED FOR NEW EMPLOYEE','',4,'Balance set by Node',?,'')`,
            [targetUsercode, balance, balance, req.user.usercode]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      const stats = await fuelService.getDepartmentFuelStats(chargeDepartment, new Date().getFullYear(), new Date().getMonth() + 1);
      return successResponse(res, {
        message: 'Fuel balance assigned and charged to department.',
        usercode: targetUsercode,
        balance,
        charge_department: chargeDepartment,
        department_abbr: chargeDepartment,
        department_balance: stats.remaining_month,
        department_monthly_quota: stats.monthly_quota,
        department_remaining_month: stats.remaining_month,
        department_issued_month: stats.issued_month,
      });
    }

    if (action === 'update_status') {
      const farCode = sanitizeString(req.body?.farCode || req.query.farCode || '');
      const status = parseInt(req.body?.status ?? req.query.status ?? 0, 10);
      if (!farCode || ![1, 3].includes(status)) {
        return badRequestResponse(res, 'Invalid request update.');
      }
      if (!fuelService.canManageFuelApprovals(req.user)) {
        return forbiddenResponse(res, 'Approval access is restricted to approvers.');
      }
      if (!await fuelService.fuelRequestIsAssignedTo(farCode, req.user.usercode)) {
        return forbiddenResponse(res, 'This fuel request is assigned to another approver.');
      }
      const row = await db.queryOne(
        `SELECT fh.FARCode,fh.usercode,fh.PresRequest,fh.status,fh.epassID,u.department
         FROM fuelallocation_history fh LEFT JOIN usertb u ON u.usercode=fh.usercode
         WHERE fh.FARCode=? LIMIT 1`,
        [farCode]
      );
      if (!row) {
        return notFoundResponse(res, 'Fuel request not found.');
      }
      const linkedEpass = String(row.epassID || '').trim()
        || String((await db.queryOne('SELECT epassnumber FROM epasstb WHERE fuel_farcode=? ORDER BY Id DESC LIMIT 1', [farCode]))?.epassnumber || '');
      // [HUWAG] EPASS ang authoritative link; Travel ay fallback lamang kapag walang EPASS.
      const linkedTravel = linkedEpass
        ? null
        : await db.queryOne('SELECT to_number FROM traveltb WHERE fuel_farcode=? ORDER BY Id DESC LIMIT 1', [farCode]);
      if (status === 1 && !linkedEpass && !linkedTravel?.to_number) {
        return res.status(422).json({ ok: false, message: 'Create a Fuel EPASS or Travel Order for this FAR before approval.' });
      }
      const currentStatus = Number(row.status || 0);
      const amount = Number(row.PresRequest || 0);
      const departmentAbbr = await getDepartmentAbbr(row.usercode);
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await applyFuelStatusTransition(connection, {
          status, currentStatus, farCode, amount, departmentAbbr,
          actorUsercode: req.user.usercode, usercode: row.usercode,
        });
        if (linkedEpass) await connection.execute('UPDATE epasstb SET status=?,epass_approved=? WHERE epassnumber=?', [status === 1 ? 2 : 3, req.user.usercode, linkedEpass]);
        if (linkedTravel?.to_number) await connection.execute('UPDATE traveltb SET status=?,to_approved=? WHERE to_number=?', [status === 1 ? 2 : 3, req.user.usercode, linkedTravel.to_number]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return successResponse(res, {
        message: status === 1 ? 'Fuel request approved.' : 'Fuel request rejected.',
      });
    }

    if (action === 'create_fuel_epass') {
      const farCode = sanitizeString(req.body?.farCode || req.query.farCode || '');
      const requestId = toInt(req.body?.requestId || req.query.requestId);
      const destination = sanitizeString(req.body?.destination || req.query.destination || '');
      const purpose = sanitizeString(req.body?.purpose || req.query.purpose || '');
      const requestDate = sanitizeString(req.body?.date || req.query.date || '') || new Date().toISOString().slice(0, 10);
      const department = sanitizeString(req.body?.department || req.query.department || '');
      if (!farCode) {
        return badRequestResponse(res, 'Missing FAR code.');
      }
      const usercode = req.user?.usercode || getRequestUsercode(req);
      if (!usercode) {
        return badRequestResponse(res, 'Missing login user.');
      }
      if (requestId) {
        const target = await db.queryOne(
          'SELECT Id,status FROM fuelallocation_history WHERE Id=? AND FARCode=? LIMIT 1',
          [requestId, farCode]
        );
        if (!target) return notFoundResponse(res, 'Fuel request not found.');
        if (Number(target.status) !== 2) {
          return res.status(422).json({ ok: false, message: 'Only pending fuel requests can change EPASS or Travel.' });
        }
      }
      let people = req.body?.people;
      if (typeof people === 'string') {
        try { people = JSON.parse(people); } catch (_error) { people = []; }
      }
      if ((!Array.isArray(people) || !people.length) && sanitizeString(req.body?.epassNumber || '')) {
        await epassService.cancelEpassByFuelFarCode(farCode);
        return successResponse(res, { message: 'Fuel EPASS removed.', epassnumber: '' });
      }
      const created = await epassService.createEpass(usercode, {
        people,
        department,
        destination,
        date: requestDate,
        purpose,
        fuel_farcode: farCode,
        approver_mode: 'auto',
      });
      if (!created) {
        return badRequestResponse(res, 'Failed to create gate pass.');
      }
      // [HUWAG] RequestId ang target kapag may duplicate FAR; FAR fallback ay para sa lumang client lang.
      await db.execute(
        requestId
          ? 'UPDATE fuelallocation_history SET epassID = ? WHERE Id = ? AND FARCode = ? AND status = 2 LIMIT 1'
          : 'UPDATE fuelallocation_history SET epassID = ? WHERE FARCode = ? AND status = 2 ORDER BY Id DESC LIMIT 1',
        requestId ? [created, requestId, farCode] : [created, farCode]
      );
      return successResponse(res, {
        message: 'Fuel EPASS saved.',
        epassnumber: created,
        farCode,
        requestDate,
      });
    }

    if (action === 'request' || action === 'update_request') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const request = fuelService.normalizeFuelRequest(req.body || {});
      const requestId = toInt(req.body?.requestId);
      const actor = String(req.user?.usercode || '').trim().toUpperCase();
      if (request.usercode !== actor && !fuelService.canViewOrganizationFuel(req.user)) {
        return forbiddenResponse(res, 'You can create or edit only your own fuel request.');
      }
      const user = await getUserRow(request.usercode);
      if (!user) return notFoundResponse(res, 'Employee number not found.');
      const vehicle = await db.queryOne(
        'SELECT 1 found FROM vehicletb WHERE UPPER(TRIM(UnitPlateNumber))=? OR UPPER(TRIM(vehiclecode))=? LIMIT 1',
        [request.vehicle, request.vehicle]
      );
      if (!vehicle) return res.status(422).json({ ok: false, message: 'The vehicle is not registered.' });
      const approvers = await fuelService.resolveFuelApprovers(request.approverCodes, user.department, request.usercode);
      if (request.approverMode === 'manual' && approvers.length !== request.approverCodes.length) {
        return res.status(422).json({ ok: false, message: 'One selected approver is not eligible.' });
      }
      if (!approvers.length) return res.status(422).json({ ok: false, message: 'No eligible fuel approver was found.' });
      const balanceRow = await db.queryOne(
        'SELECT COALESCE(balance,0) balance FROM fuelallocation_history WHERE usercode=? AND status=4 ORDER BY Id DESC LIMIT 1',
        [request.usercode]
      );
      const balance = Number(balanceRow?.balance || 0);
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        let farCode = request.farCode;
        if (action === 'update_request') {
          // [HUWAG] Id ang tunay na identity; maaaring maraming legacy row ang may parehong FARCode.
          const [existingRows] = await connection.execute(
            requestId
              ? 'SELECT Id,FARCode,usercode,accountused,status FROM fuelallocation_history WHERE Id=? LIMIT 1 FOR UPDATE'
              : 'SELECT Id,FARCode,usercode,accountused,status FROM fuelallocation_history WHERE FARCode=? AND status=2 ORDER BY Id DESC LIMIT 1 FOR UPDATE',
            [requestId || farCode]
          );
          const existing = existingRows[0];
          if (!existing) throw Object.assign(new Error('Fuel request not found.'), { statusCode: 404 });
          farCode = String(existing.FARCode || farCode).trim();
          if (Number(existing.status) !== 2) throw Object.assign(new Error('Only pending fuel requests can be edited.'), { statusCode: 422 });
          if (![String(existing.usercode).toUpperCase(), String(existing.accountused).toUpperCase()].includes(actor)
            && !fuelService.canViewOrganizationFuel(req.user)) {
            throw Object.assign(new Error('You can edit only your own pending fuel request.'), { statusCode: 403 });
          }
          if (String(existing.usercode).toUpperCase() !== request.usercode) {
            throw Object.assign(new Error('Employee number cannot be changed while editing a request.'), { statusCode: 422 });
          }
          await connection.execute(
            `UPDATE fuelallocation_history SET Requested_item=?,PresRequest=?,Balance=?,PrevRequest=?,
             PrevRequestDate=?,PresRequestDate=?,unit_id=?,Purpose=?,PrevTravel=?,Destination=?,second_requester_name=?,note='Updated Pending Request',fuelstation=?
             WHERE Id=? AND status=2 LIMIT 1`,
            [request.requestedItem, request.amount, balance, balance, request.prevRequestDate || new Date().toISOString().slice(0, 10),
              request.presRequestDate, request.vehicle, request.purpose, request.prevTravel, request.destination,
              request.secondRequesterName || null, request.fuelstation, existing.Id]
          );
        } else {
          const departmentAbbr = await getDepartmentAbbr(request.usercode);
          if (!departmentAbbr) throw Object.assign(new Error('Department abbreviation not found for this employee.'), { statusCode: 422 });
          farCode = await fuelService.generateFarCode(departmentAbbr);
          await connection.execute(
            `INSERT INTO fuelallocation_history
             (usercode,FARCode,Requested_item,PresRequest,Balance,PrevRequest,PrevRequestDate,PresRequestDate,
              unit_id,Purpose,PrevTravel,Destination,second_requester_name,status,note,accountused,fuelstation)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,2,'New Request',?,?)`,
            [request.usercode, farCode, request.requestedItem, request.amount, balance, balance,
              request.prevRequestDate || new Date().toISOString().slice(0, 10), request.presRequestDate, request.vehicle,
              request.purpose, request.prevTravel, request.destination, request.secondRequesterName || null, actor, request.fuelstation]
          );
        }
        await fuelService.assignFuelApprovers(connection, farCode, approvers, actor, request.approverMode);
        await connection.commit();
        return successResponse(res, {
          message: action === 'update_request' ? 'Pending fuel request updated.' : 'Fuel request saved and sent for approval.',
          farCode,
          balance,
          approver: { usercode: approvers[0].usercode, name: approvers[0].name },
          approvers: approvers.map(({ usercode, name }) => ({ usercode, name })),
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }

    if (action === 'history') {
      const actor = String(req.user?.usercode || '').trim().toUpperCase();
      const wantsAll = String(req.query.all || '') === '1';
      const orgWide = wantsAll && String(req.query.orgwide || '') === '1' && fuelService.canViewOrganizationFuel(req.user);
      const requestedUser = sanitizeString(req.query.usercode || '').toUpperCase();
      const conditions = ['fh.status<>4', "fh.FARCode IS NOT NULL", "TRIM(fh.FARCode)<>''"];
      const params = [];
      if (orgWide) {
        // Organization-wide report is intentionally limited below.
      } else if (wantsAll && fuelService.canManageFuelApprovals(req.user)) {
        // ponytail: was scoped to assignment_mode='manual' only, which is set exclusively when the
        // requester hand-picks their approver. Most requests are auto-routed (assignment_mode=
        // 'auto') to whichever approver the system resolves — including this one — so that filter
        // silently hid nearly every request this approver ever actually decided on, once it aged
        // out of the client-side same-session cache (approving something live still shows it).
        // Matching on approver_usercode alone (any mode) shows the approver's full real history.
        conditions.push(`(
          EXISTS (
            SELECT 1
            FROM request_approvers assigned
            WHERE assigned.module='fuel'
              AND assigned.request_number=fh.FARCode
              AND assigned.approver_usercode=?
          )
          OR EXISTS (
            SELECT 1
            FROM fuel_request_approvers assigned
            WHERE assigned.request_number=fh.FARCode
              AND assigned.approver_usercode=?
          )
        )`);
        params.push(actor, actor);
      } else {
        conditions.push('UPPER(TRIM(fh.usercode))=UPPER(TRIM(?))');
        params.push(requestedUser === actor || fuelService.canViewOrganizationFuel(req.user) ? (requestedUser || actor) : actor);
      }
      const status = Number.parseInt(req.query.status, 10);
      if ([1, 2, 3].includes(status)) { conditions.push('fh.status=?'); params.push(status); }
      const filterYear = Number.parseInt(req.query.year, 10);
      const filterMonth = Number.parseInt(req.query.month, 10);
      const filterDay = Number.parseInt(req.query.day, 10);
      if (filterYear > 0) {
        const hasMonth = filterMonth >= 1 && filterMonth <= 12;
        const hasDay = hasMonth && filterDay >= 1 && filterDay <= 31;
        const month = hasMonth ? filterMonth : 1;
        const day = hasDay ? filterDay : 1;
        const start = new Date(Date.UTC(filterYear, month - 1, day));
        const exactDate = start.getUTCFullYear() === filterYear
          && start.getUTCMonth() === month - 1
          && start.getUTCDate() === day;
        if (exactDate) {
          const end = new Date(start);
          if (hasDay) end.setUTCDate(end.getUTCDate() + 1);
          else if (hasMonth) end.setUTCMonth(end.getUTCMonth() + 1);
          else end.setUTCFullYear(end.getUTCFullYear() + 1);
          const sqlDate = (value) => value.toISOString().slice(0, 10);
          conditions.push('fh.PresRequestDate>=? AND fh.PresRequestDate<?');
          params.push(sqlDate(start), sqlDate(end));
        }
      } else {
        // ponytail: legacy month/day-only filters remain functional; normal UI requests always include a year.
        if (filterMonth >= 1 && filterMonth <= 12) { conditions.push('MONTH(fh.PresRequestDate)=?'); params.push(filterMonth); }
        if (filterDay >= 1 && filterDay <= 31) { conditions.push('DAY(fh.PresRequestDate)=?'); params.push(filterDay); }
      }
      const q = sanitizeString(req.query.q || '');
      if (q) {
        conditions.push('(UPPER(fh.FARCode) LIKE ? OR UPPER(u.name) LIKE ? OR UPPER(fh.Purpose) LIKE ?)');
        const like = `%${q.toUpperCase()}%`; params.push(like, like, like);
      }
      const filterDept = sanitizeString(req.query.filterDept || '');
      if (filterDept) { conditions.push('(UPPER(u.department) LIKE ? OR UPPER(d.ABREVATION)=UPPER(?))'); params.push(`%${filterDept.toUpperCase()}%`, filterDept); }
      const filterArea = sanitizeString(req.query.filterArea || '');
      if (filterArea) { conditions.push('UPPER(u.area) LIKE ?'); params.push(`%${filterArea.toUpperCase()}%`); }
      const limit = Math.max(1, Math.min(100, toInt(req.query.limit) || 50));
      const requestedPage = Math.max(1, toInt(req.query.page) || 1);
      const fromSql = `FROM fuelallocation_history fh
        LEFT JOIN usertb u ON u.usercode=fh.usercode
        LEFT JOIN departmenttb d ON d.NAME=u.department
        LEFT JOIN usertb approver ON approver.usercode=fh.approvedby
        WHERE ${conditions.join(' AND ')}`;
      const totalRow = await db.queryOne(`SELECT COUNT(*) AS total ${fromSql}`, params);
      const total = Number(totalRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * limit;
      // ponytail perf fix: Balance/TravelNumber/AssignedApprovers used to be correlated subqueries
      // run once PER ROW (up to `limit`=100 rows for an org-wide/broad view) — MySQL was doing up to
      // ~300 extra lookups per page load, which is what made this endpoint take 700ms-1s. Fetching
      // the base rows first, then resolving those three per distinct usercode/FARCode in 3 flat
      // queries afterward, produces the exact same values but scales with distinct keys on the page
      // (usually far fewer than `limit`) instead of with row count.
      const rows = await db.queryAll(
        `SELECT fh.Id AS RequestId,fh.FARCode,fh.usercode AS UserCode,COALESCE(u.name,fh.usercode) AS EmployeeName,
                COALESCE(u.position,'') AS EmployeePosition,
                COALESCE(u.department,'') AS EmployeeDepartmentName,COALESCE(d.ABREVATION,'') AS EmployeeDeptAbbr,
                COALESCE(u.area,'') AS EmployeeArea,COALESCE(u.profile_photo_url,'') AS EmployeePhotoUrl,
                fh.Requested_item AS ReqItem,fh.PresRequest AS ReqAmt,
                fh.Balance AS RowBalance,
                fh.unit_id AS Vehicle,
                fh.Purpose,fh.PrevTravel,COALESCE(fh.Destination,'') AS Destination,
                COALESCE(fh.second_requester_name,'') AS SecondRequesterName,
                DATE_FORMAT(fh.PresRequestDate,'%Y-%m-%d') AS PresRequestDate,
                fh.fuelstation AS FuelStation,fh.status AS Status,
                CASE fh.status WHEN 1 THEN 'Approved' WHEN 3 THEN 'Rejected' ELSE 'Pending' END AS StatusLabel,
                COALESCE(fh.epassID,'') AS EPASSNumber,
                COALESCE(fh.epassID,'') AS epassID,
                COALESCE(fh.approvedby,'') AS ApprovedByUserCode,
                COALESCE(approver.name,'') AS ApprovedByName
         ${fromSql}
         ORDER BY fh.Id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const usercodes = [...new Set(rows.map((row) => row.UserCode).filter(Boolean))];
      const farCodes = [...new Set(rows.map((row) => row.FARCode).filter(Boolean))];

      const latestBalanceByUsercode = new Map();
      if (usercodes.length) {
        const placeholders = usercodes.map(() => '?').join(',');
        const balanceRows = await db.queryAll(
          `SELECT b.usercode, b.balance
           FROM fuelallocation_history b
           INNER JOIN (
             SELECT usercode, MAX(Id) AS maxId FROM fuelallocation_history
             WHERE status=4 AND usercode IN (${placeholders}) GROUP BY usercode
           ) latest ON latest.usercode=b.usercode AND latest.maxId=b.Id`,
          usercodes
        );
        balanceRows.forEach((row) => latestBalanceByUsercode.set(row.usercode, row.balance));
      }

      const travelNumberByFarCode = new Map();
      if (farCodes.length) {
        const placeholders = farCodes.map(() => '?').join(',');
        const travelRows = await db.queryAll(
          `SELECT fuel_farcode, MAX(to_number) AS to_number FROM traveltb
           WHERE fuel_farcode IN (${placeholders}) GROUP BY fuel_farcode`,
          farCodes
        );
        travelRows.forEach((row) => travelNumberByFarCode.set(row.fuel_farcode, row.to_number));
      }

      const approversByFarCode = new Map();
      if (farCodes.length) {
        const placeholders = farCodes.map(() => '?').join(',');
        const approverRows = await db.queryAll(
          `SELECT assigned.request_number, au.usercode, au.name
           FROM (
             SELECT request_number, approver_usercode FROM request_approvers WHERE module='fuel' AND request_number IN (${placeholders})
             UNION ALL
             SELECT request_number, approver_usercode FROM fuel_request_approvers WHERE request_number IN (${placeholders})
           ) assigned
           JOIN usertb au ON au.usercode=assigned.approver_usercode`,
          [...farCodes, ...farCodes]
        );
        approverRows.forEach((row) => {
          const list = approversByFarCode.get(row.request_number) || [];
          list.push(`${row.usercode}:::${row.name}`);
          approversByFarCode.set(row.request_number, list);
        });
      }

      const items = rows.map((row) => {
        const { RowBalance, ...rest } = row;
        return {
          ...rest,
          Balance: latestBalanceByUsercode.has(row.UserCode) ? latestBalanceByUsercode.get(row.UserCode) : RowBalance,
          TravelNumber: String(row.epassID || '').trim() ? '' : String(travelNumberByFarCode.get(row.FARCode) || ''),
          AssignedApprovers: (approversByFarCode.get(row.FARCode) || []).join('||'),
          EmployeePhotoUrl: Buffer.isBuffer(row.EmployeePhotoUrl) ? row.EmployeePhotoUrl.toString() : String(row.EmployeePhotoUrl || ''),
        };
      });
      return successResponse(res, {
        items,
        history: items,
        total,
        page,
        totalPages,
      });
    }

    if (action === 'fuel_balance_trend' || action === 'analytics') {
      const year = toInt(req.query.year || req.body?.year) || new Date().getFullYear();
      const organizationWide = String(req.query.orgwide || '') === '1' && fuelService.canViewOrganizationFuel(req.user);
      const scopeSql = organizationWide ? '' : ' AND fh.usercode=?';
      const scopeParams = organizationWide ? [year] : [year, req.user.usercode];
      const rows = await db.queryAll(
        `SELECT COALESCE(NULLIF(TRIM(d.ABREVATION),''),NULLIF(TRIM(u.department),''),'Unknown') AS department,
                COALESCE(SUM(fh.PresRequest),0) AS liters
         FROM fuelallocation_history fh
         LEFT JOIN usertb u ON u.usercode=fh.usercode
         LEFT JOIN departmenttb d ON d.NAME=u.department
         WHERE YEAR(fh.PresRequestDate)=? AND fh.status=1${scopeSql}
         GROUP BY COALESCE(NULLIF(TRIM(d.ABREVATION),''),NULLIF(TRIM(u.department),''),'Unknown')
         ORDER BY liters DESC`,
        scopeParams
      );
      const areaRows = await db.queryAll(
        `SELECT COALESCE(NULLIF(TRIM(u.area),''),'Unknown') AS area,COALESCE(SUM(fh.PresRequest),0) AS liters
         FROM fuelallocation_history fh LEFT JOIN usertb u ON u.usercode=fh.usercode
         WHERE YEAR(fh.PresRequestDate)=? AND fh.status=1${scopeSql}
         GROUP BY COALESCE(NULLIF(TRIM(u.area),''),'Unknown') ORDER BY liters DESC`,
        scopeParams
      );
      return successResponse(res, {
        year,
        departments: rows.map((row) => ({
          department: row.department || 'Unknown',
          annualQuota: Number(row.liters || 0),
          issuedYtd: Number(row.liters || 0),
          pctRemaining: 50,
        })),
        byDepartment: rows,
        byArea: areaRows,
        timeline: [],
        timelineCompare: [],
        prevLabel: '',
        currLabel: '',
        prevTotal: 0,
        currTotal: 0,
        organizationWide,
        liveUpdatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    }

    const PATH_ALIASES = { balance: '/balance', history: '/history', request: '/request', vehicles: '/vehicles-today' };
    if (PATH_ALIASES[action]) {
      const qIndex = req.url.indexOf('?');
      req.url = PATH_ALIASES[action] + (qIndex >= 0 ? req.url.slice(qIndex) : '');
      return next();
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
});

// GET /api/fuel/balance?usercode=X&year=2026&month=6
router.get('/balance', async (req, res, next) => {
  try {
    const { usercode, year, month } = req.query;
    const userToFetch = sanitizeString(usercode) || req.user?.usercode || '';
    if (!userToFetch) {
      return badRequestResponse(res, 'Missing usercode parameter.');
    }
    if (userToFetch.toUpperCase() !== String(req.user?.usercode || '').toUpperCase()
      && !fuelService.canViewOrganizationFuel(req.user)) {
      return forbiddenResponse(res, 'You can view only your own fuel account.');
    }
    const targetYear = toInt(year) || new Date().getFullYear();
    const targetMonth = toInt(month) || new Date().getMonth() + 1;

    const balance = await fuelService.getFuelBalance(userToFetch, targetYear, targetMonth);

    if (!balance) {
      return badRequestResponse(res, 'Employee not found.');
    }

    return successResponse(res, { balance });
  } catch (error) {
    next(error);
  }
});

// GET /api/fuel/history?usercode=X&year=2026&month=6
router.get('/history', async (req, res, next) => {
  try {
    const { usercode, year, month } = req.query;
    const userToFetch = sanitizeString(usercode) || req.user?.usercode || '';
    if (!userToFetch) {
      return badRequestResponse(res, 'Missing usercode parameter.');
    }
    if (userToFetch.toUpperCase() !== String(req.user?.usercode || '').toUpperCase()
      && !fuelService.canViewOrganizationFuel(req.user)) {
      return forbiddenResponse(res, 'You can view only your own fuel account.');
    }
    const targetYear = toInt(year) || new Date().getFullYear();
    const targetMonth = toInt(month) || new Date().getMonth() + 1;

    const history = await fuelService.getFuelHistory(userToFetch, targetYear, targetMonth);
    return successResponse(res, { history, total: history.length });
  } catch (error) {
    next(error);
  }
});

// POST /api/fuel/request
router.post('/request', async (req, res, next) => {
  try {
    const { liters } = req.body;
    const litersAmount = toInt(liters);

    if (litersAmount <= 0) {
      return badRequestResponse(res, 'Liters must be a positive number.');
    }

    const requester = req.user?.usercode || getRequestUsercode(req);
    if (!requester) {
      return badRequestResponse(res, 'Missing login user.');
    }

    const farCode = await fuelService.createFuelRequest(requester, litersAmount);

    if (!farCode) {
      return badRequestResponse(res, 'Failed to create fuel request.');
    }

    return successResponse(res, {
      message: 'Fuel request created successfully.',
      far_code: farCode,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/fuel/department-quota?department=OGM&year=2026&month=6
router.get('/department-quota', async (req, res, next) => {
  try {
    const { department, year, month } = req.query;

    if (!department) {
      return badRequestResponse(res, 'Missing department parameter.');
    }

    const targetYear = toInt(year) || new Date().getFullYear();
    const targetMonth = toInt(month) || new Date().getMonth() + 1;

    const stats = await fuelService.getDepartmentFuelStats(department, targetYear, targetMonth);
    return successResponse(res, { department, ...stats });
  } catch (error) {
    next(error);
  }
});

// GET /api/fuel/vehicles-today
router.get('/vehicles-today', async (req, res, next) => {
  try {
    const vehicles = await fuelService.getVehiclesUsedToday();
    return successResponse(res, { vehicles, total: vehicles.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports._selfcheck = { applyFuelStatusTransition };
