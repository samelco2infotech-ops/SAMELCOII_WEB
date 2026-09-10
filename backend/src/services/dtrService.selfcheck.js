const assert = require('assert');
const service = require('./dtrService');

assert.strictEqual(service.normalizePunchType({ CHECKTYPE: 'IN' }), 'I');
assert.strictEqual(service.normalizePunchType({ CHECKTYPE: '', inout_small: '1' }), 'O');
assert.strictEqual(service.normalizePunchType({ CHECKTYPE: 'UNK', inout_small: 'U', inout_mode: '4' }), 'I');
assert.strictEqual(service.normalizeCorrectionTime('7:05'), '07:05');
assert.strictEqual(service.normalizeCorrectionTime('25:00'), null);
assert.strictEqual(service.validDate('2026-02-29'), false);
assert.strictEqual(
  service.checksum('abc', '{"row":1}'),
  'd37bbbbce0436cb46546189418509971ad65e432290d3c7db3d440e104b08fdf'
);
assert.throws(() => service.normalizePrintRows([]), /1 to 50000/);

// canManageCorrections: same "token 6-10" privilege convention as travelService/leaveService/holidayService.
assert.strictEqual(service.canManageCorrections({ privilage: '6' }), true);
assert.strictEqual(service.canManageCorrections({ privilage: '10' }), true);
assert.strictEqual(service.canManageCorrections({ privilage: '1-2-3' }), false);
assert.strictEqual(service.canManageCorrections({ privilage: '', privilagemenu: '' }), false);
assert.strictEqual(service.canManageCorrections({ privilagemenu: '9' }), true);
assert.strictEqual(service.canManageCorrections({}), false);

// shiftPositionKind: single source of truth for whether a job title even counts as a shift
// position. Before this, the print/approver-routing logic on the frontend re-derived "is this a
// shift employee" from title text alone, independent of the backend's real per-employee
// determination — causing a Maintenance-titled employee who doesn't actually work nights to be
// printed under SHIFT 1/2/3 columns holding data that was really computed as a normal AM/PM day.
assert.strictEqual(service.shiftPositionKind('Maintenance'), 'maintenance');
assert.strictEqual(service.shiftPositionKind('Security Guard'), 'other');
assert.strictEqual(service.shiftPositionKind('Substation Tender'), 'other');
assert.strictEqual(service.shiftPositionKind('SS Tender'), 'other');
assert.strictEqual(service.shiftPositionKind('Lineman'), null, 'a title that only sounds field-related is not a shift position');
assert.strictEqual(service.shiftPositionKind(''), null);

// EPASS/LEAVE special-day labels, ported from SAMELCOII_ITS_DTR_FORM.cs.
assert.strictEqual(service.truncateWords('Site inspection Catbalogan Sub', 8), 'Site inspection Catbalogan Sub');
assert.strictEqual(
  service.truncateWords('one two three four five six seven eight nine ten', 8),
  'one two three four five six seven ei...'
);
assert.strictEqual(service.truncateWords(''), '');
assert.strictEqual(service.leaveShortOrTrim('Sick Leave - fever'), 'Sick Leave');
assert.strictEqual(service.leaveShortOrTrim('VACATION'), 'Vecation Leave');
assert.strictEqual(service.leaveShortOrTrim(''), 'LV');
assert.strictEqual(service.leaveShortOrTrim('Attending seminar on cooperative governance and finance'), 'Attending seminar on cooperative gov...');

const punch = (date, time) => ({ checktime: `${date} ${time}:00`, type: 'I', area: 'MAIN' });
const completeOfficeDay = [
  punch('2026-07-27', '08:00'),
  punch('2026-07-27', '12:00'),
  punch('2026-07-27', '13:00'),
  punch('2026-07-27', '17:00'),
  null,
  null,
];
const complete = service.attendanceMetrics({
  date: '2026-07-27', position: 'Accountant', basic: 30000,
  punches: completeOfficeDay, worked: 480, lateAllowance: 60,
});
assert.strictEqual(complete.worked_minutes, 480);
assert.strictEqual(complete.undertime_min, 0);
assert.strictEqual(complete.late_min, 0);

const allowedLate = service.attendanceMetrics({
  date: '2026-07-27', position: 'Accountant',
  punches: [punch('2026-07-27', '08:30'), ...completeOfficeDay.slice(1)],
  worked: 450, lateAllowance: 60,
});
assert.strictEqual(allowedLate.late_min, 0);
assert.strictEqual(allowedLate.late_allowance_used, 30);

const chargedLate = service.attendanceMetrics({
  date: '2026-07-27', position: 'Accountant',
  punches: [punch('2026-07-27', '08:45'), ...completeOfficeDay.slice(1)],
  worked: 435, lateAllowance: 0,
});
assert.strictEqual(chargedLate.late_min, 45);
assert.strictEqual(chargedLate.late_count, 1);

// A day with zero punches is treated as that employee's rest day (no undertime charge), whatever
// weekday it falls on — not just Saturday/Sunday. 2026-07-27 is a Monday: proves this isn't gated
// on calendar weekend, since rest days differ by schedule (e.g. some area staff rest Sun+Mon).
const noPunchDay = service.attendanceMetrics({
  date: '2026-07-27', position: 'Accountant', punches: [], worked: 0, lateAllowance: 60,
});
assert.strictEqual(noPunchDay.undertime_min, 0, 'no punches at all = rest day, not a charged absence');
assert.strictEqual(noPunchDay.late_min, 0);
assert.strictEqual(noPunchDay.daily_pay, 0, 'rest day earns no daily rate');

// Lunch-break return before noon must still land in PM-IN, not get dropped by a >=noon floor.
// Reproduces the real punch pattern user reported for USERID 73 on 2026-07-30.
{
  const rawPunch = (time, type) => ({ checktime: `2026-07-30 ${time}`, type });
  const today = [
    rawPunch('07:34:21', 'I'),
    rawPunch('11:01:25', 'O'),
    rawPunch('11:23:05', 'I'),
    rawPunch('17:00:43', 'O'),
  ];
  const picked = service.pickOfficeDayPunches('2026-07-30', today);
  assert.ok(picked.amIn && picked.amIn.checktime.includes('07:34:21'), 'AM-IN is the morning punch');
  assert.ok(picked.amOut && picked.amOut.checktime.includes('11:01:25'), 'AM-OUT is the lunch-out punch');
  assert.ok(picked.pmIn && picked.pmIn.checktime.includes('11:23:05'), 'PM-IN captures the pre-noon lunch return');
  assert.ok(picked.pmOut && picked.pmOut.checktime.includes('17:00:43'), 'PM-OUT is the end-of-day punch');
  console.log('DTR pre-noon lunch-return self-check passed.');
}

// Per-employee schedule override: an early-shift employee (6am-10am / 11am-3pm) punching right on
// their own schedule must be picked correctly AND come out with ~zero late/undertime — proving the
// picker windows and the late/undertime math both key off the override, not the 8-12/1-5 default.
{
  const rawPunch = (time, type) => ({ checktime: `2026-07-30 ${time}`, type });
  const today = [
    rawPunch('06:05:00', 'I'),
    rawPunch('10:02:00', 'O'),
    rawPunch('11:05:00', 'I'),
    rawPunch('15:03:00', 'O'),
  ];
  const earlySchedule = { amStart: 360, amEnd: 600, pmStart: 660, pmEnd: 900 }; // 6-10 / 11-3
  const picked = service.pickOfficeDayPunches('2026-07-30', today, earlySchedule);
  assert.ok(picked.amIn && picked.amIn.checktime.includes('06:05:00'), 'AM-IN matches the early-shift punch');
  assert.ok(picked.amOut && picked.amOut.checktime.includes('10:02:00'), 'AM-OUT matches the early-shift punch');
  assert.ok(picked.pmIn && picked.pmIn.checktime.includes('11:05:00'), 'PM-IN matches the early-shift punch');
  assert.ok(picked.pmOut && picked.pmOut.checktime.includes('15:03:00'), 'PM-OUT matches the early-shift punch');
  const metrics = service.attendanceMetrics({
    date: '2026-07-30', position: 'Accountant', basic: 30000,
    punches: [picked.amIn, picked.amOut, picked.pmIn, picked.pmOut, null, null],
    worked: picked.worked, lateAllowance: 60, schedule: earlySchedule,
  });
  assert.strictEqual(metrics.late_min, 0, 'on-time against the early schedule, not the 8am default');
  assert.strictEqual(metrics.undertime_min, 0, 'on-time against the early schedule, not the 8am default');
  console.log('DTR per-employee schedule override self-check passed.');
}

// Forgot-to-toggle-OUT exception: employee scans lunch-out without pressing the device's OUT
// button first, so it logs as a second IN instead of an OUT. Reproduces S2-178's actual
// 2026-07-21 punches (IN 07:59, IN 12:03, IN 12:55, OUT 17:16) reported missing AM-OUT/PM-IN.
{
  const rawPunch = (time, type) => ({ checktime: `2026-07-21 ${time}`, type });
  const today = [
    rawPunch('07:59:41', 'I'),
    rawPunch('12:03:26', 'I'),
    rawPunch('12:55:12', 'I'),
    rawPunch('17:16:30', 'O'),
  ];
  const picked = service.pickOfficeDayPunches('2026-07-21', today);
  assert.ok(picked.amOut && picked.amOut.checktime.includes('12:03:26'), 'AM-OUT inferred from the earlier stray IN');
  assert.ok(picked.pmIn && picked.pmIn.checktime.includes('12:55:12'), 'PM-IN is the later stray IN');
  assert.ok(picked.pmOut && picked.pmOut.checktime.includes('17:16:30'), 'PM-OUT unaffected');
  console.log('DTR forgot-to-toggle-OUT self-check passed.');
}

// A single stray IN (no second candidate) must NOT be reinterpreted — stays PM-IN with AM-out
// blank, same as before this change, since one punch alone isn't enough to infer intent.
{
  const rawPunch = (time, type) => ({ checktime: `2026-07-22 ${time}`, type });
  const today = [rawPunch('07:50:00', 'I'), rawPunch('12:10:00', 'I'), rawPunch('17:05:00', 'O')];
  const picked = service.pickOfficeDayPunches('2026-07-22', today);
  assert.strictEqual(picked.amOut, null, 'single stray IN leaves AM-OUT blank, not guessed');
  assert.ok(picked.pmIn && picked.pmIn.checktime.includes('12:10:00'), 'PM-IN still resolves to the lone IN');
  console.log('DTR single-stray-IN (no exception) self-check passed.');
}

// Department filter branch classification, ported from GetEmployeesByDepartment() (SAMELCOII_ITS_DTR_FORM.cs ~line 1188).
assert.strictEqual(service.classifyDepartmentFilter('').branch, 'all');
assert.strictEqual(service.classifyDepartmentFilter('ALL').branch, 'all');
assert.strictEqual(service.classifyDepartmentFilter('Security Guard').branch, 'securityGuard');
assert.strictEqual(service.classifyDepartmentFilter('substation tender').branch, 'substationTender');
assert.strictEqual(service.classifyDepartmentFilter('MR/Collector').branch, 'mrCollector');
assert.strictEqual(service.classifyDepartmentFilter('MR Collector').branch, 'mrCollector');
assert.strictEqual(service.classifyDepartmentFilter('Disconnector').branch, 'disconnector');
const tsd = service.classifyDepartmentFilter('Basey TSD');
assert.strictEqual(tsd.branch, 'areaTsd');
assert.strictEqual(tsd.area, 'Basey');
assert.strictEqual(service.classifyDepartmentFilter('Villareal').branch, 'area');
assert.strictEqual(service.classifyDepartmentFilter('CORPORATE PLANNING DEPARTMENT').branch, 'department');

console.log('DTR service self-check (sync) passed.');

(async () => {
  const db = require('../config/database');

  // detectShiftWorker: the two title-only branches must short-circuit without ever needing a real
  // employee (used by monthlyFinal when every requested day is already frozen, so buildMonthlyRaw
  // never runs to compute this itself).
  assert.strictEqual(
    await service.detectShiftWorker({ position: 'Security Guard' }, '2026-08-01', '2026-08-31'), true,
    'Security Guard is always a shift position, no punch lookup needed');
  assert.strictEqual(
    await service.detectShiftWorker({ position: 'Lineman' }, '2026-08-01', '2026-08-31'), false,
    'a non-shift title short-circuits without a DB check');
  assert.strictEqual(
    await service.detectShiftWorker(
      { position: 'Maintenance', bioUID: '999999999', usercode: 'NOPE999999999' }, '2026-08-01', '2026-08-31'),
    false, 'Maintenance title alone is not enough without a real overnight punch on file');
  console.log('DTR detectShiftWorker self-check passed.');

  // Live DB round-trip: every branch must run without throwing against the real schema.
  const options = await service.departmentFilterOptions();
  assert.ok(Array.isArray(options), 'departmentFilterOptions returns an array');
  const appended = ['Security Guard', 'Substation Tender', 'Basey', 'Villareal', 'Catbalogan',
    'Basey TSD', 'Villareal TSD', 'Catbalogan TSD', 'MR/Collector', 'Disconnector'];
  for (const name of appended) {
    assert.ok(options.some((item) => item.name === name), `pseudo-department "${name}" present`);
  }
  assert.ok(!options.some((item) => item.name.toUpperCase() === 'CORPLAN'), 'blocked department excluded');

  for (const dep of ['', 'Security Guard', 'Substation Tender', 'MR/Collector', 'Disconnector', 'Basey TSD', 'Basey', 'CORPORATE PLANNING DEPARTMENT']) {
    const rows = await service.employeesByDepartment(dep);
    assert.ok(Array.isArray(rows), `employeesByDepartment("${dep}") returns an array`);
  }

  console.log('DTR service self-check (live DB) passed.');

  // dtr_final freeze + corrections overlay. Uses a real (active) employee usercode so
  // buildMonthlyRaw/getEmployeeInfo succeed, but an obviously-fake historical work_date so this
  // never collides with real payroll data. Cleans up after itself either way.
  const sample = await db.queryOne(
    "SELECT usercode FROM usertb WHERE bioUID != 0 AND usercode IS NOT NULL AND TRIM(usercode)<>'' LIMIT 1");
  if (sample) {
    const usercode = sample.usercode;
    const testDate = '2000-01-15'; // fake historical date, not a real payroll period
    const auditConn = await db.getDtrAuditConnection();
    try {
      await service.ensureAuditSchema(auditConn); // guarantee dtr_final/dtr_corrections exist before cleanup queries
      await auditConn.execute('DELETE FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, testDate]);
      await auditConn.execute(
        "DELETE FROM dtr_corrections WHERE usercode=? AND work_date=? AND category='selfcheck'", [usercode, testDate]);

      const first = await service.finalizeDay(usercode, testDate);
      assert.strictEqual(first.inserted, 1, 'finalizeDay inserts a new frozen row');
      const [[row1]] = await auditConn.query(
        'SELECT finalized_at FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, testDate]);
      assert.ok(row1, 'dtr_final row exists after first finalizeDay');

      const second = await service.finalizeDay(usercode, testDate);
      assert.strictEqual(second.inserted, 0, 'finalizeDay is a no-op the second time (freeze holds)');
      const [[{ c: rowCount }]] = await auditConn.query(
        'SELECT COUNT(*) c FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, testDate]);
      assert.strictEqual(rowCount, 1, 'exactly one frozen row after repeated finalizeDay calls');
      const [[row2]] = await auditConn.query(
        'SELECT finalized_at FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, testDate]);
      assert.strictEqual(row1.finalized_at.getTime(), row2.finalized_at.getTime(), 'finalized_at unchanged — frozen row untouched');

      // Corrections overlay still applies on top of a frozen row, via the same applyCorrections path.
      await auditConn.execute(
        `INSERT INTO dtr_corrections (usercode,work_date,field_name,original_value,proposed_value,category,reason,
         status,requested_by,reviewed_by,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
        [usercode, testDate, 'morning_in', '', '07:15', 'selfcheck', 'dtr_final self-check', 'approved', 'SELFCHECK', 'SELFCHECK']);
      const final = await service.monthlyFinal(usercode, testDate, testDate);
      const finalRow = final.items.find((item) => item.work_date === testDate);
      assert.ok(finalRow, 'monthly_final returns the frozen row');
      assert.strictEqual(finalRow.finalized, true, 'row is flagged finalized: true');
      assert.strictEqual(finalRow.morning_in, '7:15', 'corrections overlay applies on top of the frozen dtr_final row');

      console.log('DTR dtr_final freeze/idempotency self-check passed.');
    } finally {
      await auditConn.execute('DELETE FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, testDate]);
      await auditConn.execute(
        "DELETE FROM dtr_corrections WHERE usercode=? AND work_date=? AND category='selfcheck'", [usercode, testDate]);
      auditConn.release();
    }

    // Late-syncing device: a day frozen with only a partial punch set must fill in once the rest
    // of the day's punches finally land in `checkinout` — this is the actual bug that motivated
    // insertFinalRows' upgrade path (a remote-site device syncing PM-out days after AM-in/out).
    const bioRow = await db.queryOne('SELECT bioUID FROM usertb WHERE usercode=? LIMIT 1', [usercode]);
    const upgradeDate = '2000-02-20';
    if (bioRow?.bioUID) {
      const bioUID = bioRow.bioUID;
      const clearCheckinout = () => db.execute(
        'DELETE FROM checkinout WHERE USERID=? AND CHECKTIME BETWEEN ? AND ?',
        [bioUID, `${upgradeDate} 00:00:00`, `${upgradeDate} 23:59:59`]);
      const auditConn2 = await db.getDtrAuditConnection();
      try {
        await auditConn2.execute('DELETE FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, upgradeDate]);
        await clearCheckinout();
        await db.execute(
          'INSERT INTO checkinout (USERID,CHECKTIME,CHECKTYPE,inout_mode,inout_small) VALUES (?,?,?,?,?)',
          [bioUID, `${upgradeDate} 07:55:00`, 'IN', 0, 'I']);

        const partial = await service.finalizeDay(usercode, upgradeDate);
        assert.strictEqual(partial.inserted, 1, 'finalizeDay freezes the partial (AM-in only) day');
        const [[partialRow]] = await auditConn2.query(
          'SELECT morning_in, afternoon_out FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, upgradeDate]);
        assert.ok(partialRow.morning_in, 'partial freeze captured the AM-in punch');
        assert.strictEqual(partialRow.afternoon_out, '', 'partial freeze has no PM-out yet');

        // The device finally syncs the rest of the day's punches.
        await db.execute(
          `INSERT INTO checkinout (USERID,CHECKTIME,CHECKTYPE,inout_mode,inout_small) VALUES
           (?,?,'OUT',1,'O'), (?,?,'IN',0,'I'), (?,?,'OUT',1,'O')`,
          [bioUID, `${upgradeDate} 12:05:00`, bioUID, `${upgradeDate} 12:45:00`, bioUID, `${upgradeDate} 17:10:00`]);

        const upgrade = await service.finalizeDay(usercode, upgradeDate);
        assert.strictEqual(upgrade.inserted, 0, 'second finalizeDay does not re-insert');
        assert.strictEqual(upgrade.upgraded, 1, 'second finalizeDay upgrades the now-more-complete day');
        const [[upgradedRow]] = await auditConn2.query(
          'SELECT morning_in, afternoon_out FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, upgradeDate]);
        assert.ok(upgradedRow.afternoon_out, 'PM-out is filled in once it syncs');

        const noRegress = await service.finalizeDay(usercode, upgradeDate);
        assert.strictEqual(noRegress.upgraded, 0, 'a third call is a no-op — nothing more to upgrade');

        console.log('DTR dtr_final upgrade-on-late-sync self-check passed.');
      } finally {
        await auditConn2.execute('DELETE FROM dtr_final WHERE usercode=? AND work_date=?', [usercode, upgradeDate]);
        await clearCheckinout();
        auditConn2.release();
      }
    }
  } else {
    console.log('DTR dtr_final self-check skipped — no active employee found.');
  }

  // submitCorrection privilege gate: non-privileged caller is rejected (403); a privileged caller
  // may target a DIFFERENT employee's DTR, and the audit columns end up recording WHO acted, not
  // just WHOSE record was touched. Fake historical date, cleans up after itself.
  if (sample) {
    const target = sample.usercode;
    // submitCorrection only accepts dates within the last 731 days, so this can't be an arbitrary
    // fake ancient date like the dtr_final check above; instead scope cleanup to rows tagged with
    // our own marker requested_by='SELFCHECKACTOR' so real corrections on this date are never touched.
    const testDate = new Date(Date.now() - 700 * 86400000).toISOString().slice(0, 10);
    const actor = { usercode: 'SELFCHECKACTOR', privilage: '7' };
    const payload = { usercode: target, work_date: testDate, changes: [{ field_name: 'morning_in', proposed_value: '07:20' }] };
    const auditConn = await db.getDtrAuditConnection();
    try {
      await service.ensureAuditSchema(auditConn);
      await auditConn.execute(
        "DELETE FROM dtr_corrections WHERE usercode=? AND work_date=? AND requested_by='SELFCHECKACTOR'", [target, testDate]);

      await assert.rejects(
        () => service.submitCorrection({ usercode: 'SELFCHECKNONPRIV', privilage: '1' }, payload),
        (err) => err.status === 403,
        'submitCorrection throws 403 for a non-privileged actor');

      await service.submitCorrection(actor, payload);
      const [[row]] = await auditConn.query(
        'SELECT usercode,requested_by,reviewed_by FROM dtr_corrections WHERE usercode=? AND work_date=? ORDER BY id DESC LIMIT 1',
        [target, testDate]);
      assert.ok(row, 'submitCorrection inserts a row for the target employee');
      assert.strictEqual(row.usercode, target, 'usercode column is the TARGET employee');
      assert.strictEqual(row.requested_by, 'SELFCHECKACTOR', 'requested_by is the ACTING privileged user');
      assert.strictEqual(row.reviewed_by, 'SELFCHECKACTOR', 'reviewed_by is the ACTING privileged user');

      console.log('DTR submitCorrection privilege-gate self-check passed.');
    } finally {
      await auditConn.execute(
        "DELETE FROM dtr_corrections WHERE usercode=? AND work_date=? AND requested_by='SELFCHECKACTOR'", [target, testDate]);
      auditConn.release();
    }
  }

  await db.close?.();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
