/**
 * Flexible DTR reports for SAM.
 *
 * Attendance is based on the same computed DTR rows used by the DTR module. Starting
 * with the complete employee roster is important: employees without punches must be
 * included and marked ABSENT instead of disappearing from the report.
 */

const { hasFullDataAccess, requestsBlockedWrite } = require('./guards');
const { dtrFilterKeywords } = require('./keywords');
const dtrService = require('../dtrService');
const db = require('../../config/database');

// Kept as a compatibility export for callers/tests that referenced the former SQL cutoff.
const ONTIME_CUTOFF = '08:00:00';
const ROW_LIMIT = 100000;

function wantsDtrQuery(message = '') {
  const lower = String(message).toLowerCase();
  if (requestsBlockedWrite(lower)) return false;
  const hasDtr = ['dtr', 'attendance', 'time in', 'timein', 'time-in', 'timed in', 'clock in', 'biometric', 'tardy', 'tardiness']
    .some((keyword) => lower.includes(keyword));
  const hasStatus = ['late', 'on time', 'ontime', 'morning', 'present', 'absent', 'undertime', 'maaga', 'huli']
    .some((keyword) => lower.includes(keyword));
  const asksForPeople = ['who', 'sino', 'kinsa'].some((keyword) => lower.includes(keyword));
  return hasDtr || (hasStatus && asksForPeople);
}

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

/** Accepts ISO dates and natural lists such as "July 6, 13, 20 and 27, 2026". */
function extractDtrDates(message = '') {
  const text = String(message);
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  const dates = new Set();

  for (const match of text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) dates.add(match[1]);

  const monthAlternation = Object.keys(MONTHS).join('|');
  const pattern = new RegExp(`\\b(${monthAlternation})\\b[\\s.,]*([0-9]{1,2}(?:\\s*(?:,|&|and)\\s*[0-9]{1,2})*)`, 'gi');
  for (const set of text.matchAll(pattern)) {
    const month = MONTHS[set[1].toLowerCase()];
    for (const dayMatch of String(set[2]).matchAll(/[0-9]{1,2}/g)) {
      const day = Number(dayMatch[0]);
      if (day < 1 || day > 31) continue;
      dates.add(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }
  return [...dates].sort().slice(0, 40);
}

/** Returns one requested status, or all when the message names multiple statuses. */
function dtrStatusFilter(message = '') {
  const lower = String(message).toLowerCase();
  const late = ['late', 'tardy', 'tardiness', 'huli'].some((keyword) => lower.includes(keyword));
  const present = ['on time', 'ontime', 'present', 'morning', 'not late', 'maaga', 'early']
    .some((keyword) => lower.includes(keyword));
  const absent = lower.includes('absent');
  if ([late, present, absent].filter(Boolean).length > 1) return 'all';
  if (late) return 'late';
  if (absent) return 'absent';
  if (present) return 'ontime';
  return 'all';
}

function hasPunch(row = {}) {
  return ['morning_in', 'morning_out', 'afternoon_in', 'afternoon_out', 'ot_in', 'ot_out']
    .some((field) => String(row[field] || '').trim() !== '');
}

/** Pure classifier retained for the runnable parity check. */
function classifyAttendanceRow(row = {}) {
  if (!hasPunch(row)) return 'ABSENT';
  return Number(row.late_min || 0) > 0 ? 'LATE' : 'PRESENT';
}

function attendanceRow(employee, item, date) {
  return {
    'Employee No.': employee.usercode || item.usercode || '',
    Employee: employee.name || item.name || '',
    Position: employee.position || item.position || '',
    Department: employee.department || item.department || '',
    Date: date,
    Day: item.day_name || new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    'AM IN': item.morning_in || '',
    'AM OUT': item.morning_out || '',
    'PM IN': item.afternoon_in || '',
    'PM OUT': item.afternoon_out || '',
    'OT IN': item.ot_in || '',
    'OT OUT': item.ot_out || '',
    'Late (Min)': Number(item.late_min || 0),
    Status: classifyAttendanceRow(item),
  };
}

const STATUS_ORDER = { LATE: 1, ABSENT: 2, PRESENT: 3 };

function sortAttendanceRows(rows) {
  return rows.sort((a, b) => String(a.Date).localeCompare(String(b.Date))
    || String(a.Department).localeCompare(String(b.Department))
    || (STATUS_ORDER[a.Status] || 9) - (STATUS_ORDER[b.Status] || 9)
    || String(a.Employee).localeCompare(String(b.Employee)));
}

function dateList(from, to) {
  const result = [];
  let date = from;
  while (date <= to && result.length < 366) {
    result.push(date);
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return result;
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function displayTime(checktime) {
  if (!checktime) return '';
  const text = String(checktime);
  const hour = Number(text.slice(11, 13));
  return `${hour % 12 || 12}:${text.slice(14, 16)}`;
}

async function biometricRows(employees, from, to) {
  const output = new Array(employees.length);
  let next = 0;
  async function run() {
    while (next < employees.length) {
      const index = next++;
      const id = String(employees[index].bioUID || '').trim();
      output[index] = id ? await db.queryAll(
        `SELECT CAST(USERID AS CHAR) user_id, DATE_FORMAT(CHECKTIME,'%Y-%m-%d %H:%i:%s') checktime,
                CHECKTYPE, inout_mode, inout_small, COALESCE(Area,'') area
         FROM checkinout
         WHERE USERID=? AND CHECKTIME>=? AND CHECKTIME<? ORDER BY CHECKTIME`,
        [id, from, nextDate(to)]
      ) : [];
    }
  }
  // ponytail: ten workers match the existing main DB pool ceiling; no extra dependency or pool.
  await Promise.all(Array.from({ length: Math.min(10, employees.length) }, run));
  return output.flat();
}

async function dtrFlexRows({ user = {}, dates = [], from, to, statusFilter = 'all', message = '' }) {
  const isAdmin = hasFullDataAccess(user);
  const bioUid = String(user.bioUID || '').trim();
  if (!isAdmin && bioUid === '') return [];

  const requestedDates = dates.length ? [...dates].sort() : dateList(from, to);
  if (!requestedDates.length) return [];
  const rangeFrom = requestedDates[0];
  const rangeTo = requestedDates[requestedDates.length - 1];

  let employees = await dtrService.employeesByDepartment('ALL');
  if (!isAdmin) employees = employees.filter((employee) => String(employee.bioUID || '').trim() === bioUid);

  // Numeric date fragments must not become employee/department search keywords.
  const keywords = dtrFilterKeywords(message).filter((word) => !/^\d+$/.test(word));
  if (keywords.length) {
    employees = employees.filter((employee) => {
      const haystack = [employee.usercode, employee.name, employee.department, employee.position, employee.area]
        .map((value) => String(value || '').toLowerCase()).join(' ');
      return keywords.every((keyword) => haystack.includes(String(keyword).toLowerCase()));
    });
  }

  // Start at the first day of the month so the DTR module's 60-minute monthly late
  // allowance is consumed in the same order before classifying the requested dates.
  const calculationFrom = `${rangeFrom.slice(0, 7)}-01`;
  const raw = await biometricRows(employees, calculationFrom, rangeTo);
  const byEmployeeDate = new Map();
  for (const source of raw) {
    const type = dtrService.normalizePunchType(source);
    const date = source.checktime.slice(0, 10);
    const key = `${source.user_id}|${date}`;
    const punch = { checktime: source.checktime, type: type || String(source.CHECKTYPE || 'RAW'), area: source.area || '' };
    if (!byEmployeeDate.has(key)) byEmployeeDate.set(key, []);
    byEmployeeDate.get(key).push(punch);
  }

  const requested = new Set(requestedDates);
  const batches = employees.map((employee) => {
    let lateAllowance = 60;
    const output = [];
    for (const date of dateList(calculationFrom, rangeTo)) {
      const punches = byEmployeeDate.get(`${String(employee.bioUID).trim()}|${date}`) || [];
      const picked = dtrService.pickOfficeDayPunches(date, punches);
      let selected = [picked.amIn, picked.amOut, picked.pmIn, picked.pmOut, picked.otIn, picked.otOut];
      // Some old biometric rows have no usable I/O marker. Presence must still be retained.
      if (punches.length && !selected.some(Boolean)) selected = [punches[0], null, null, punches.at(-1), null, null];
      const metrics = dtrService.attendanceMetrics({
        date, position: employee.position, punches: selected,
        worked: picked.worked, otMinutes: picked.otMinutes, lateAllowance,
      });
      lateAllowance = Math.max(0, lateAllowance - Number(metrics.late_allowance_used || 0));
      if (!requested.has(date)) continue;
      const item = {
        work_date: date,
        day_name: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        morning_in: displayTime(selected[0]?.checktime), morning_out: displayTime(selected[1]?.checktime),
        afternoon_in: displayTime(selected[2]?.checktime), afternoon_out: displayTime(selected[3]?.checktime),
        ot_in: displayTime(selected[4]?.checktime), ot_out: displayTime(selected[5]?.checktime),
        late_min: metrics.late_min,
      };
      output.push(attendanceRow(employee, item, date));
    }
    return output;
  });

  const statusName = statusFilter === 'ontime' ? 'PRESENT' : String(statusFilter).toUpperCase();
  const rows = batches.flat()
    .filter((row) => statusFilter === 'all' || row.Status === statusName)
    .slice(0, ROW_LIMIT);
  return sortAttendanceRows(rows);
}

module.exports = {
  wantsDtrQuery, extractDtrDates, dtrStatusFilter, dtrFlexRows,
  classifyAttendanceRow, sortAttendanceRows, ONTIME_CUTOFF,
};
