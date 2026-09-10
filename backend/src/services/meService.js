/**
 * Employee self-service ("my stuff") — roadmap #1 (my DTR), #11 (leave balance), #21 (fuel).
 *
 * One aggregate so an employee's dashboard reads all their own data in a single call
 * instead of hitting /dtr, /leave and /fuel separately. Everything is scoped to the caller's
 * own usercode — read-only, no cross-employee access.
 */
const db = require('../config/database');
const dtrService = require('./dtrService');
const fuelService = require('./fuelService');
const { getDateString, startOfMonth, endOfMonth } = require('../utils/dateTime');

// Office shift: 08:00 in, 17:00 out. The server runs Manila local time, so a JS Date's
// getHours()/getMinutes() already read local wall-clock — same convention as dtrService.
const EXPECTED_START_MIN = 8 * 60;   // 08:00
const EXPECTED_END_MIN = 17 * 60;    // 17:00

// ponytail: fixed 08:00/17:00, zero grace — the platform has no per-dept shift config yet.
// Upgrade path = roadmap #7 (shift templates) + #8 (per-department grace) feeding this.
const localMinutes = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
};

// Attendance here lives in dtr_timeinout (this DB has no dtr_punches), keyed by the
// biometric UID (userID = usertb.bioUID), storing AM/PM in/out datetimes per day.
const buildDtrMonth = async (bioUID, year, month) => {
  const empty = {
    month: `${year}-${String(month).padStart(2, '0')}`,
    days_with_records: 0, late_days: 0, total_late_min: 0,
    early_out_days: 0, total_early_out_min: 0,
  };
  if (bioUID === null || bioUID === undefined || bioUID === '') return empty;

  const from = getDateString(startOfMonth(year, month));
  const to = getDateString(endOfMonth(year, month));
  const rows = await db.queryAll(
    `SELECT timeinAM, timeoutPM
     FROM dtr_timeinout
     WHERE userID = ? AND \`date\` BETWEEN ? AND ?`,
    [bioUID, from, to]
  );

  let lateDays = 0, lateMin = 0, earlyOutDays = 0, earlyOutMin = 0;
  for (const r of rows) {
    const inMin = localMinutes(r.timeinAM);
    if (inMin !== null && inMin > EXPECTED_START_MIN) { lateDays += 1; lateMin += inMin - EXPECTED_START_MIN; }
    const outMin = localMinutes(r.timeoutPM);
    if (outMin !== null && outMin < EXPECTED_END_MIN) { earlyOutDays += 1; earlyOutMin += EXPECTED_END_MIN - outMin; }
  }

  return {
    ...empty,
    days_with_records: rows.length,
    late_days: lateDays, total_late_min: lateMin,
    early_out_days: earlyOutDays, total_early_out_min: earlyOutMin,
  };
};

const getLeaveBalance = async (usercode) => {
  const row = await db.queryOne(
    `SELECT COALESCE(VLbal, 0) AS vacation_leave,
            COALESCE(SLbal, 0) AS sick_leave,
            COALESCE(OLbal, 0) AS other_leave
     FROM usertb WHERE usercode = ? LIMIT 1`,
    [usercode]
  );
  return row || { vacation_leave: 0, sick_leave: 0, other_leave: 0 };
};

const buildMySummary = async (usercode) => {
  const employee = await dtrService.getEmployeeInfo(usercode);
  if (!employee) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dtr, leave, fuelBalance, fuelRecent] = await Promise.all([
    buildDtrMonth(employee.bioUID, year, month),
    getLeaveBalance(usercode),
    fuelService.getFuelBalance(usercode, year, month),
    fuelService.getFuelHistory(usercode, year, month, 5),
  ]);

  return {
    employee: {
      usercode: employee.usercode,
      name: employee.name,
      position: employee.position,
      department: employee.department,
    },
    dtr,
    leave,
    fuel: {
      requested_this_month: fuelBalance?.user_requested_this_month ?? 0,
      recent_requests: fuelRecent,
    },
  };
};

module.exports = { buildMySummary, buildDtrMonth, getLeaveBalance };
