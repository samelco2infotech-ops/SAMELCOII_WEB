/**
 * Purpose: Node implementation of biometric DTR computation and immutable audit records.
 * EDIT GUIDE: Keep punch-selection rules aligned with api/dtr.php until Phase 7 removes PHP.
 * HUWAG BAGUHIN: Never update biometric punches; corrections are append-only audit rows.
 * Tagalog: Ang checkinout ang source; hiwalay at may audit trail ang manual correction.
 */
const crypto = require('crypto');
const db = require('../config/database');

const CORRECTION_FIELDS = ['morning_in', 'morning_out', 'afternoon_in', 'afternoon_out', 'ot_in', 'ot_out'];

// ponytail: privilege check copies the "token 6-10 can manage" convention already used by
// travelService.userCanManageApprovals / leaveService.canApprove / holidayService.canManage — no new permission scheme.
const canManageCorrections = (user) => `${user?.privilage ?? ''},${user?.privilagemenu ?? ''}`
  .split(/[^0-9]+/)
  .filter(Boolean)
  .some((token) => Number(token) >= 6 && Number(token) <= 10);

const PRINT_FIELDS = [
  'usercode', 'name', 'department', 'area', 'work_date', 'special_label',
  ...CORRECTION_FIELDS, 'worked_minutes', 'undertime_minutes', 'late_minutes',
  'daily_pay', 'per_hour', 'per_minute', 'ot_minutes', 'late_count', 'correction_ids',
];

const dateOnly = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return sqlDateTime(value).slice(0, 10);
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};
const validDate = (value) => {
  const text = dateOnly(value);
  if (!text) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
};
const addDays = (value, days) => {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayName = (value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const sqlDateTime = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const epoch = (value) => new Date(String(value).replace(' ', 'T')).getTime();
const minutesOfDay = (value) => {
  const text = sqlDateTime(value);
  return Number(text.slice(11, 13)) * 60 + Number(text.slice(14, 16));
};
const formatTime = (value) => {
  if (!value) return '';
  const minute = minutesOfDay(value);
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')}`;
};
const positionToken = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Single source of truth for "does this job title even count as a shift position" — shared by
// buildMonthlyRaw (which also needs the actual overnight-punch check before trusting it for
// Maintenance) and monthlyFinal/detectShiftWorker below (which must answer the question even when
// every requested day is already frozen in dtr_final and buildMonthlyRaw never runs).
const shiftPositionKind = (position) => {
  const token = positionToken(position);
  if (token.includes('SECURITYGUARD') || token.includes('SUBSTATIONTENDER')) return 'other';
  if (token.includes('MAINTENANCE')) return 'maintenance';
  return null;
};

const normalizePunchType = (row) => {
  const type = String(row.CHECKTYPE ?? '').trim();
  const small = String(row.inout_small ?? '').trim();
  const mode = String(row.inout_mode ?? '').trim();
  const upper = type.toUpperCase();
  if (upper === 'IN' || upper === 'I') return type === 'i' ? 'i' : 'I';
  if (upper === 'OUT' || upper === 'O') return type === 'o' ? 'o' : 'O';
  if (!type) {
    if (/^[IiOo]$/.test(small)) return small;
    if (small === '0') return 'I';
    if (small === '1') return 'O';
  }
  if (upper === 'UNK' && small.toUpperCase() === 'U') {
    if (mode === '4') return 'I';
    if (mode === '5') return 'O';
  }
  return '';
};

const firstPunch = (rows, types, from, to) => rows.find((p) =>
  types.includes(p.type) && minutesOfDay(p.checktime) >= from && minutesOfDay(p.checktime) <= to) || null;
const lastPunch = (rows, types, from, to, before = null) => rows.reduce((best, p) => {
  const minute = minutesOfDay(p.checktime);
  if (!types.includes(p.type) || minute < from || minute > to || (before && epoch(p.checktime) >= epoch(before))) return best;
  return p;
}, null);
const nearestOut = (input, outputs, target) => {
  if (!outputs.length) return null;
  if (input) {
    const candidates = outputs
      .map((p) => ({ p, hours: (epoch(p.checktime) - epoch(input.checktime)) / 3600000 }))
      .filter((x) => x.hours >= 4 && x.hours <= 12)
      .sort((a, b) => Math.abs(a.hours - 8) - Math.abs(b.hours - 8));
    if (candidates[0]) return candidates[0].p;
  }
  return [...outputs].sort((a, b) => Math.abs(epoch(a.checktime) - epoch(target)) - Math.abs(epoch(b.checktime) - epoch(target)))[0];
};
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
const hasTimes = (row) => CORRECTION_FIELDS.some((field) => Boolean(row?.[field]));
const perDayRate = (basic) => Math.round((((Number(basic) || 0) * 12) / 365) * 100) / 100;

const attendanceMetrics = ({
  date, position = '', basic = 0, punches = [], worked = 0, otMinutes = 0, lateAllowance = 0, schedule,
}) => {
  const { amStart, amEnd, pmStart, pmEnd } = schedule || DEFAULT_SCHEDULE;
  const [amIn, amOut, pmIn, pmOut, otIn, otOut] = punches;
  const future = date > dateOnly(new Date());
  const any = punches.some(Boolean);
  const shift = /MAINTENANCE|SECURITYGUARD|SUBSTATIONTENDER|SSTENDER/.test(positionToken(position));
  // ponytail: office/regular staff are Mon-Fri, confirmed by HR 2026-09-09 — a blank weekday is a
  // real no-show and must charge undertime, not silently read as a rest day (was: `!any` for
  // everyone, so e.g. S2-013's weekday no-punch days waived undertime same as an actual Saturday,
  // undercounting her absences). Shift/area staff (guard, maintenance, substation tender) keep the
  // old `!any` rule — their rest days genuinely aren't always Sat/Sun and there's still no
  // per-employee rest-day schedule to consult. Ceiling for shift staff unchanged; upgrade path
  // unchanged: a real per-employee rest-day schedule (new column/table + UI) would let this stop
  // guessing entirely. Matches applyCorrections' non-shift undertime recompute below, which already
  // used calendar Sat/Sun and never had this bug.
  const weekend = shift ? !any : [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const perDay = perDayRate(basic);
  const perHour = Math.round((perDay / 8) * 100) / 100;
  const perMinute = Math.round((perHour / 60) * 100) / 100;
  const cappedWorked = Math.max(0, Math.min(480, Math.round(Number(worked) || 0)));
  let undertime = 0;
  let late = 0;
  let lateCount = 0;
  let allowanceUsed = 0;

  if (!weekend && !future) {
    if (shift) {
      undertime = Math.max(0, 480 - cappedWorked);
    } else {
      const time = (punch) => punch ? minutesOfDay(punch.checktime) : null;
      const amInMinute = time(amIn);
      let amOutMinute = time(amOut);
      let pmInMinute = time(pmIn);
      const pmOutMinute = time(pmOut);
      if (amOutMinute === null && (pmInMinute !== null || pmOutMinute !== null)) amOutMinute = amEnd;
      if (pmInMinute === null && (amInMinute !== null || amOutMinute !== null)) pmInMinute = pmStart;
      if (amOutMinute !== null && Math.abs(amEnd - amOutMinute) <= 2) amOutMinute = amEnd;
      if (pmInMinute !== null && Math.abs(pmInMinute - pmStart) <= 2) pmInMinute = pmStart;

      const lateAm = amInMinute === null ? 240 : Math.min(240, Math.max(0, amInMinute - amStart));
      const latePm = pmInMinute === null ? 240 : Math.min(240, Math.max(0, pmInMinute - pmStart));
      const utAm = amOutMinute === null ? 240 : Math.min(240, Math.max(0, amEnd - amOutMinute));
      const utPm = pmOutMinute === null ? 240 : Math.min(240, Math.max(0, pmEnd - pmOutMinute));
      const rawLate = lateAm + latePm;
      allowanceUsed = Math.min(Math.max(0, Number(lateAllowance) || 0), rawLate);
      late = Math.max(0, rawLate - allowanceUsed);
      lateCount = Number(lateAm > 0) + Number(latePm > 0);
      undertime = Math.min(480, utAm + utPm);
    }
  }

  const chargeMinutes = Math.min(480, undertime + late);
  const dailyPay = (weekend || future) && !any
    ? 0
    : Math.round(Math.max(0, perDay - chargeMinutes * perMinute) * 100) / 100;
  let resolvedOtMinutes = Math.max(0, Math.round(Number(otMinutes) || 0));
  if (!resolvedOtMinutes && otIn && otOut && epoch(otOut.checktime) > epoch(otIn.checktime)) {
    resolvedOtMinutes = Math.round((epoch(otOut.checktime) - epoch(otIn.checktime)) / 60000);
  }

  return {
    worked_minutes: cappedWorked,
    undertime_min: undertime,
    late_min: late,
    late_count: lateCount,
    daily_pay: dailyPay,
    per_day: perDay,
    per_hour: perHour,
    per_minute: perMinute,
    ot_minutes: resolvedOtMinutes,
    late_allowance_used: allowanceUsed,
  };
};

const computedRow = (date, employee, punches, metrics) => {
  const [amIn, amOut, pmIn, pmOut, otIn, otOut] = punches;
  return {
    usercode: employee.usercode, name: employee.name, position: employee.position,
    department: employee.department, area: employee.area || '', bioUID: employee.bioUID, work_date: date, day_name: dayName(date),
    morning_in: formatTime(amIn?.checktime), morning_out: formatTime(amOut?.checktime),
    afternoon_in: formatTime(pmIn?.checktime), afternoon_out: formatTime(pmOut?.checktime),
    ot_in: formatTime(otIn?.checktime), ot_out: formatTime(otOut?.checktime),
    morning_in_area: amIn?.area || '', morning_out_area: amOut?.area || '',
    afternoon_in_area: pmIn?.area || '', afternoon_out_area: pmOut?.area || '',
    ot_in_area: otIn?.area || '', ot_out_area: otOut?.area || '',
    worked_minutes: metrics.worked_minutes,
    undertime_min: metrics.undertime_min,
    late_min: metrics.late_min,
    late_count: metrics.late_count,
    daily_pay: metrics.daily_pay,
    per_hour: metrics.per_hour,
    per_minute: metrics.per_minute,
    ot_minutes: metrics.ot_minutes,
  };
};

const ensureAuditSchema = async (connection) => {
  await connection.query(`CREATE TABLE IF NOT EXISTS dtr_corrections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(40) NOT NULL, work_date DATE NOT NULL,
    field_name VARCHAR(32) NOT NULL, original_value VARCHAR(8) NOT NULL DEFAULT '',
    proposed_value VARCHAR(8) NOT NULL DEFAULT '', category VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', requested_by VARCHAR(40) NOT NULL, reviewed_by VARCHAR(40) NULL,
    reviewer_note VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL, reviewed_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_dtr_correction_employee_date (usercode, work_date),
    KEY idx_dtr_correction_review (status, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // ponytail: only one auto-updating TIMESTAMP column is allowed per table on MySQL 5.5 (the prod
  // server's actual version) — created_at is that column; updated_at/printed_at are plain DATETIME
  // and MUST be supplied explicitly by the application (see submitCorrection/createPrintSnapshot).
  await connection.query(`CREATE TABLE IF NOT EXISTS dtr_print_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, snapshot_uuid CHAR(36) NOT NULL, date_from DATE NOT NULL,
    date_to DATE NOT NULL, usercodes_json LONGTEXT NOT NULL, rows_json LONGTEXT NOT NULL,
    correction_ids_json LONGTEXT NOT NULL, row_count INT UNSIGNED NOT NULL, previous_hash CHAR(64) NOT NULL DEFAULT '',
    snapshot_hash CHAR(64) NOT NULL, printed_by VARCHAR(40) NOT NULL, printed_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
    UNIQUE KEY uq_dtr_print_snapshot_uuid (snapshot_uuid), KEY idx_dtr_print_employee_period (date_from, date_to),
    KEY idx_dtr_print_user (printed_by, printed_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Daily DTR snapshot. uq_dtr_final_employee_date is the freeze mechanism: a first write is
  // always INSERT IGNORE. A later write only ever replaces an existing row when insertFinalRows
  // finds it strictly more complete AND its work_date sits outside every LOCKED/APPROVED/RELEASED
  // payroll run — see the comment there. Otherwise a dtr_corrections entry (applied at read time)
  // is the only thing that can change what a consumer sees.
  await connection.query(`CREATE TABLE IF NOT EXISTS dtr_final (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(40) NOT NULL, work_date DATE NOT NULL,
    name VARCHAR(120) NULL, department VARCHAR(120) NULL, area VARCHAR(60) NULL, special_label VARCHAR(120) NULL,
    morning_in VARCHAR(8) NULL, morning_out VARCHAR(8) NULL, afternoon_in VARCHAR(8) NULL, afternoon_out VARCHAR(8) NULL,
    ot_in VARCHAR(8) NULL, ot_out VARCHAR(8) NULL, worked_minutes INT NULL, undertime_min INT NULL, late_min INT NULL,
    daily_pay DECIMAL(10,2) NULL, per_hour DECIMAL(10,2) NULL, per_minute DECIMAL(10,4) NULL, ot_minutes INT NULL,
    late_count INT NULL, finalized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
    UNIQUE KEY uq_dtr_final_employee_date (usercode, work_date),
    KEY idx_dtr_final_date (work_date)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Per-employee schedule override for the AM/PM shift windows the DTR punch-picker and
  // late/undertime math both key off. effective_from lets a schedule change apply going forward
  // without rewriting the accuracy of days that already happened under the old schedule — a day's
  // schedule is whichever row has the latest effective_from <= that work_date. No row for an
  // employee/date means the standard 8-12/1-5 template applies, same as before this table existed.
  await connection.query(`CREATE TABLE IF NOT EXISTS employee_dtr_schedule (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(40) NOT NULL,
    am_start VARCHAR(5) NULL, am_end VARCHAR(5) NULL, pm_start VARCHAR(5) NULL, pm_end VARCHAR(5) NULL,
    effective_from DATE NOT NULL, created_by VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
    KEY idx_employee_dtr_schedule_lookup (usercode, effective_from)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Per-EMPLOYEE DTR signatory (approver) — replaces guessing a signatory from a shared
  // department/area group, which kept picking the wrong person whenever an employee's literal
  // department and their area-based print grouping both had someone assigned (see
  // employeeApprover() priority bug on the frontend). One row per employee; `active=0` instead of
  // deleting so a resigned approver's history isn't lost, but they stop showing on prints.
  await connection.query(`CREATE TABLE IF NOT EXISTS dtr_employee_signatory (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usercode VARCHAR(40) NOT NULL,
    department VARCHAR(120) NULL, area VARCHAR(60) NULL, approver_usercode VARCHAR(40) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1, assigned_by VARCHAR(40) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL,
    PRIMARY KEY (id), UNIQUE KEY uq_dtr_employee_signatory_usercode (usercode),
    KEY idx_dtr_employee_signatory_approver (approver_usercode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

// Ported from SAMELCOII_ITS_DTR_FORM.cs LoadAllDepartments()/GetEmployeesByDepartment() (desktop DTR reference).
// ponytail: departments() queries departmenttb (matching this web app's existing convention, see signatoryService.js)
// rather than the desktop app's `SELECT DISTINCT department FROM usertb` — the desktop source and web schema can
// diverge in department spelling; upgrade path is to diff the two sources if department options ever look wrong.
const BLOCKED_DEPARTMENTS = new Set([
  'CORPLAN', 'SUBSTAION', 'SUBSTATION', 'CATBALOGAN SC', 'SERVER CENTER', 'SOLAR SUBSTATION', 'CASUAL/EMERGENCY',
  // ponytail: stray departmenttb rows that aren't real departments (position/branch-office names
  // that ended up in the department table) — cluttered the filter dropdown, requested removal.
  'BASEY AREA ENGINEER', 'BOARD SECRETARY', 'BASEY SERVICE CENTER', 'CATBALOGAN SERVICE CENTER',
  'VILLAREAL SERVICE CENTER', 'FINANCE COLLECTOR DISCONNECTOR',
]);
const APPENDED_DEPARTMENTS = [
  'Security Guard', 'Substation Tender', 'Basey', 'Villareal', 'Catbalogan',
  'Basey TSD', 'Villareal TSD', 'Catbalogan TSD', 'MR/Collector', 'Disconnector',
];

const departments = () => db.queryAll(
  `SELECT COALESCE(NULLIF(TRIM(d.NAME),''),d.ABREVATION,CONCAT('Department ',d.Id)) name,
   COALESCE(NULLIF(TRIM(d.ABREVATION),''),'') abbreviation
   FROM departmenttb d ORDER BY name`);

const departmentFilterOptions = async () => {
  const rows = await departments();
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const name = String(row.name || '').trim();
    if (!name || BLOCKED_DEPARTMENTS.has(name.toUpperCase()) || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());
    items.push({ name, abbreviation: row.abbreviation || '' });
  }
  for (const name of APPENDED_DEPARTMENTS) {
    if (seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());
    items.push({ name, abbreviation: '' });
  }
  return items;
};

// Branch order and matching rules mirror GetEmployeesByDepartment() (SAMELCOII_ITS_DTR_FORM.cs ~line 1188) exactly.
const classifyDepartmentFilter = (department) => {
  const dep = String(department ?? '').trim();
  const upper = dep.toUpperCase();
  if (!dep || upper === 'ALL' || upper === '__ALL__') return { branch: 'all', dep };
  if (upper === 'SECURITY GUARD') return { branch: 'securityGuard', dep };
  if (upper === 'SUBSTATION TENDER') return { branch: 'substationTender', dep };
  if (upper === 'MR/COLLECTOR' || upper === 'MR COLLECTOR') return { branch: 'mrCollector', dep };
  if (upper === 'DISCONNECTOR') return { branch: 'disconnector', dep };
  if (/ TSD$/i.test(dep)) return { branch: 'areaTsd', dep, area: dep.slice(0, -4).trim() };
  if (['BASEY', 'VILLAREAL', 'CATBALOGAN'].includes(upper)) return { branch: 'area', dep };
  return { branch: 'department', dep };
};

const ROSTER_FIELDS = "bioUID,usercode,name,department,position,COALESCE(area,'') area,"
  + "COALESCE(profile_photo_url,'') profile_photo_url,COALESCE(privilage,'') privilage,COALESCE(privilagemenu,'') privilagemenu";
const SUBSTATION_TENDER_MATCH = `(
  UPPER(REPLACE(COALESCE(position,''),' ','')) IN ('SUBSTATIONTENDER','SSTENDER')
  OR (UPPER(REPLACE(COALESCE(position,''),' ','')) LIKE '%SUBST%' AND UPPER(REPLACE(COALESCE(position,''),' ','')) LIKE '%TENDER%')
)`;
const MR_COLLECTOR_MATCH = "REPLACE(UPPER(COALESCE(position,'')),' ','') IN ('MR/COLLECTOR','MRCOLLECTOR')";
const SPECIAL_POSITION_EXCLUSIONS = `
  AND position <> 'Security Guard'
  AND NOT ${SUBSTATION_TENDER_MATCH}
  AND NOT (${MR_COLLECTOR_MATCH})
  AND UPPER(COALESCE(position,'')) <> 'DISCONNECTOR'`;

const employeesByDepartment = (department) => {
  const { branch, dep, area } = classifyDepartmentFilter(department);
  switch (branch) {
    case 'all':
      return db.queryAll(`SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0 ORDER BY name ASC`);
    case 'securityGuard':
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0 AND position = ? ORDER BY name ASC`, ['Security Guard']);
    case 'substationTender':
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0 AND ${SUBSTATION_TENDER_MATCH} ORDER BY name ASC`);
    case 'mrCollector':
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0 AND ${MR_COLLECTOR_MATCH} ORDER BY name ASC`);
    case 'disconnector':
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0 AND UPPER(COALESCE(position,'')) = 'DISCONNECTOR' ORDER BY name ASC`);
    case 'areaTsd':
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0
         AND UPPER(TRIM(COALESCE(NULLIF(area,''),''))) = UPPER(?)
         AND (UPPER(COALESCE(department,'')) = 'TSD' OR UPPER(COALESCE(department,'')) LIKE '%TECHNICAL SERVICES DEPARTMENT%')
         ORDER BY name ASC`, [area]);
    case 'area':
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE bioUID != 0
         AND UPPER(TRIM(COALESCE(NULLIF(area,''),''))) = UPPER(?)
         AND UPPER(COALESCE(department,'')) <> 'TSD'
         AND UPPER(COALESCE(department,'')) NOT LIKE '%TECHNICAL SERVICES DEPARTMENT%'
         ${SPECIAL_POSITION_EXCLUSIONS}
         ORDER BY name ASC`, [dep]);
    default:
      return db.queryAll(
        `SELECT ${ROSTER_FIELDS} FROM usertb WHERE department = ? AND bioUID != 0
         AND UPPER(TRIM(COALESCE(NULLIF(area,''),'MAIN'))) = 'MAIN'
         ${SPECIAL_POSITION_EXCLUSIONS}
         ORDER BY name ASC`, [dep]);
  }
};

// Approvers don't need their own DTR tracked — an executive typically has bioUID=0 (no time-clock
// enrollment) — so the searchable "who can be picked as an approver" list must not inherit the
// bioUID filter that employeesByDepartment() applies for "who needs a DTR printed."
const signatoryCandidates = () => db.queryAll(`SELECT ${ROSTER_FIELDS} FROM usertb ORDER BY name ASC`);

const getEmployeeInfo = (usercode) => db.queryOne(
  `SELECT usercode,name,position,department,bioUID,employmentdate,basic,VLbal,SLbal,OLbal,area
   FROM usertb WHERE usercode=? OR bioUID=? LIMIT 1`, [usercode, usercode]);

// Ported from SAMELCOII_ITS_DTR_FORM.cs TruncateWords/LeaveShortOrTrim (desktop DTR reference).
const truncateWords = (value, maxWords = 8, maxChars = 36) => {
  const full = String(value || '').trim().replace(/\s+/g, ' ');
  if (!full) return '';
  const words = full.split(' ');
  const byWords = words.length <= maxWords ? full : words.slice(0, maxWords).join(' ');
  const final = byWords.length > maxChars ? byWords.slice(0, maxChars).trimEnd() : byWords;
  return final === full ? final : `${final}...`;
};

const LEAVE_SHORT_LABELS = [
  [/SICK/i, 'Sick Leave'], [/VAC/i, 'Vecation Leave'], [/EMER/i, 'Emergency Leave'],
  [/OFFICIAL/i, 'OB'], [/SPECIAL/i, 'SPL'], [/BIRTH/i, 'Birth Day'], [/MEDICAL/i, 'ML'],
  [/PATERNITY/i, 'PL'], [/UNION/i, 'UL'], [/FIESTA/i, 'FL'], [/LWOP|WITHOUT/i, 'LWOP'],
];
const leaveShortOrTrim = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return 'LV';
  const mapped = LEAVE_SHORT_LABELS.find(([pattern]) => pattern.test(text));
  return mapped ? mapped[1] : truncateWords(text, 8);
};

// HOLIDAY > EPASS > TRAVEL > LEAVE priority, matching the desktop DTR form's special-day map.
// ponytail: office_event is stamped fresh here, live off philippine_holidays — it is NOT a column
// on dtr_final, so a day frozen before this shipped (or before its Office Event holiday row
// existed) reads back without the brown flag once dtrService serves it from the frozen cache
// (see the `SELECT * FROM dtr_final` read path). Cosmetic only — pay/undertime were never touched
// by this flag. Upgrade path if it matters later: add an office_event column to dtr_final and
// backfill it the same way FINAL_COLUMNS/insertFinalRows already freeze special_label.
const specialDaysByDate = async (employee, from, to) => {
  const special = {};
  const officeEvents = new Map();
  for (const row of await db.queryAll(
    'SELECT holiday_date d, holiday_name, holiday_type FROM philippine_holidays WHERE holiday_date BETWEEN ? AND ?', [from, to])) {
    const date = dateOnly(row.d);
    // An Office Event is a normal work day with an office order/memo, not a paid day off — people
    // still punch in/out on it. Keep it OUT of `special` so it never collapses the row or waives
    // undertime/late/pay below; officeEvents only drives a visual brown flag on the DTR table.
    if (row.holiday_type === 'Office Event') {
      officeEvents.set(date, String(row.holiday_name || 'Office Event').toUpperCase());
      continue;
    }
    // Regular holidays print as the generic "HOLIDAY"; a Special Non-Working holiday (a specific
    // named occasion, e.g. a local "SAMAR DAY") prints its actual name instead, per request.
    special[date] = row.holiday_type === 'Regular' ? 'HOLIDAY' : String(row.holiday_name || 'HOLIDAY').toUpperCase();
  }
  const keys = [...new Set([employee.usercode, employee.bioUID].map((v) => String(v || '').trim()).filter(Boolean))];
  if (!keys.length) return { special, officeEvents };
  const placeholders = keys.map(() => '?').join(',');
  for (const row of await db.queryAll(
    `SELECT DATE(\`date\`) d FROM epasstb WHERE DATE(\`date\`) BETWEEN ? AND ? AND usercode IN (${placeholders})`,
    [from, to, ...keys])) {
    const date = dateOnly(row.d);
    if (!special[date]) special[date] = 'EPASS';
  }
  // Only a fully-approved Travel Order (status=2) counts — same rule as LEAVE below: pending or
  // rejected must not mark the day as excused on the DTR. A Travel Order can span several days
  // (date..date_to), so every day in that range is marked, not just the start date — mirrors the
  // LEAVE loop below.
  for (const row of await db.queryAll(
    `SELECT \`date\` d, date_to FROM traveltb
     WHERE status=2 AND usercode IN (${placeholders})
       AND DATE(\`date\`) <= ? AND DATE(COALESCE(date_to,\`date\`)) >= ?`,
    [...keys, to, from])) {
    let date = dateOnly(row.d) < from ? from : dateOnly(row.d);
    const end0 = dateOnly(row.date_to || row.d);
    const end = end0 > to ? to : end0;
    while (date <= end) {
      if (!special[date]) special[date] = 'TRAVEL';
      date = addDays(date, 1);
    }
  }
  // [FIX] Only show a day as on-leave once EVERY stage has actually approved it (Department Head,
  // OIC-Administrative Chief, and — where required — General Manager). A still-pending or
  // rejected request must not mark the day as excused on the DTR.
  for (const row of await db.queryAll(
    `SELECT datafrom, dateto, leave_record FROM tbleave
     WHERE empId IN (${placeholders}) AND dateto >= ? AND datafrom <= ?
       AND TRIM(COALESCE(DP_approved,''))='1' AND TRIM(COALESCE(HR_approved,''))='1'
       AND UPPER(TRIM(COALESCE(Status,'')))='APPROVED'`,
    [...keys, from, to])) {
    const label = leaveShortOrTrim(row.leave_record);
    let date = dateOnly(row.datafrom) < from ? from : dateOnly(row.datafrom);
    const end = dateOnly(row.dateto) > to ? to : dateOnly(row.dateto);
    while (date <= end) {
      if (!special[date]) special[date] = label;
      date = addDays(date, 1);
    }
  }
  return { special, officeEvents };
};

// Live, read-only lookup used to relabel already-frozen dtr_final rows on the print screen — a
// day frozen before the EPASS label was simplified to plain "EPASS" still has the old destination
// text baked into dtr_final.special_label (freezing is a cache; it never rewrites old data on its
// own). Rather than editing dtr_final rows, the frontend cross-checks against this live epasstb
// read and overrides the DISPLAYED text only, for any date this returns, leaving stored data as-is.
const epassDates = async (usercode, from, to) => {
  const employee = await getEmployeeInfo(usercode);
  if (!employee) return [];
  const keys = [...new Set([employee.usercode, employee.bioUID].map((v) => String(v || '').trim()).filter(Boolean))];
  if (!keys.length) return [];
  const placeholders = keys.map(() => '?').join(',');
  const rows = await db.queryAll(
    `SELECT DISTINCT DATE(\`date\`) d FROM epasstb WHERE DATE(\`date\`) BETWEEN ? AND ? AND usercode IN (${placeholders})`,
    [from, to, ...keys]);
  return rows.map((row) => dateOnly(row.d));
};

const applyCorrections = async (computed, usercode, from, to) => {
  let connection;
  try {
    connection = await db.getDtrAuditConnection();
    await ensureAuditSchema(connection);
    const [rows] = await connection.query(
      `SELECT c.* FROM dtr_corrections c INNER JOIN (
         SELECT work_date,field_name,MAX(id) latest_id FROM dtr_corrections
         WHERE usercode=? AND work_date BETWEEN ? AND ? AND status='approved' GROUP BY work_date,field_name
       ) latest ON latest.latest_id=c.id ORDER BY c.work_date,c.id`, [usercode.toUpperCase(), from, to]);
    const byDate = Object.fromEntries(computed.items.map((item) => [dateOnly(item.work_date), item]));
    for (const correction of rows) {
      const date = dateOnly(correction.work_date);
      if (!CORRECTION_FIELDS.includes(correction.field_name)) continue;
      if (!byDate[date]) {
        const emptyPunches = [null, null, null, null, null, null];
        byDate[date] = computedRow(date, computed.employee, emptyPunches, attendanceMetrics({
          date, position: computed.employee?.position, basic: computed.employee?.basic, punches: emptyPunches,
        }));
        byDate[date].shift = computed.shift;
      }
      const row = byDate[date];
      row[`biometric_${correction.field_name}`] = row[correction.field_name] || '';
      row[correction.field_name] = formatTime(`${date} ${correction.proposed_value || '00:00'}:00`);
      if (!correction.proposed_value) row[correction.field_name] = '';
      row.corrections ||= {};
      row.corrections[correction.field_name] = {
        id: correction.id, category: correction.category, reason: correction.reason, status: 'approved',
        original_value: correction.original_value, proposed_value: correction.proposed_value,
        reviewed_by: correction.reviewed_by,
      };
      // ponytail: corrections used to always recompute undertime with the office-hours formula
      // (sum of morning+afternoon, calendar-weekend-only rest day), the same one attendanceMetrics
      // uses for regular staff. Shift workers (Maintenance/Security Guard/Substation Tender) don't
      // follow that: attendanceMetrics computes their undertime from the LONGEST of the 3 shift
      // pairs (worked = max, not sum) and their rest day is "no punch at all", not Sat/Sun. A guard
      // whose whole shift lives in ot_in/ot_out (Shift 3) got charged a flat 480 undertime here even
      // after a correct correction, because this block never looked past morning/afternoon. Also,
      // Shift 3 crosses midnight (e.g. IN 7:50 PM, OUT 4:00 AM) — clockMinutes' generic "afternoon"
      // +12 heuristic turned that 4:00 AM into 4:00 PM, making the shift look 0 minutes long. Fixed
      // by branching on position and, for shift workers, treating ot_out as next-day (+1440).
      const isShiftEmployee = /MAINTENANCE|SECURITYGUARD|SUBSTATIONTENDER|SSTENDER/
        .test(positionToken(computed.employee?.position || ''));
      let worked;
      if (isShiftEmployee) {
        const otOutMin = (() => { const m = clockMinutes(row.ot_out, false); return m === null ? null : m + 1440; })();
        const pairs = [
          [clockMinutes(row.morning_in, false), clockMinutes(row.morning_out, false)],
          [clockMinutes(row.afternoon_in, true), clockMinutes(row.afternoon_out, true)],
          [clockMinutes(row.ot_in, true), otOutMin],
        ];
        worked = pairs.reduce((max, [start, end]) => Math.max(max,
          start !== null && end !== null && end > start ? Math.min(480, end - start) : 0), 0);
      } else {
        worked = [['morning_in', 'morning_out'], ['afternoon_in', 'afternoon_out']]
          .reduce((sum, [a, b]) => {
            const start = clockMinutes(row[a], a.startsWith('afternoon'));
            const end = clockMinutes(row[b], b.startsWith('afternoon'));
            return sum + (start !== null && end !== null && end > start ? Math.min(240, end - start) : 0);
          }, 0);
      }
      row.undertime_min = row.special_label ? 0 : isShiftEmployee
        ? (hasTimes(row) ? Math.max(0, 480 - worked) : 0)
        : ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || !hasTimes(row) ? 0 : Math.max(0, 480 - worked));
      const oi = clockMinutes(row.ot_in, true);
      const oo = isShiftEmployee
        ? (() => { const m = clockMinutes(row.ot_out, false); return m === null ? null : m + 1440; })()
        : clockMinutes(row.ot_out, true);
      row.ot_minutes = oi !== null && oo !== null && oo > oi ? oo - oi : 0;
      if (row.special_label) row.daily_pay = hasTimes(row) ? perDayRate(computed.employee?.basic) : Number(row.daily_pay || 0);
    }
    computed.items = Object.values(byDate).sort((a, b) => a.work_date.localeCompare(b.work_date));
  } catch {
    computed.correction_warning = 'Local DTR corrections are temporarily unavailable.';
  } finally {
    connection?.release();
  }
  return computed;
};

const clockMinutes = (value, afternoon = false) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  let hour = Number(match[1]);
  if (afternoon && hour < 12) hour += 12;
  return hour * 60 + Number(match[2]);
};

// Standard office template — identical to the numbers this file used before per-employee
// schedules existed, so an employee with no override row computes exactly as before.
const DEFAULT_SCHEDULE = { amStart: 480, amEnd: 720, pmStart: 780, pmEnd: 1020 };

const scheduleTimeToMinutes = (value, fallback) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
};

// Row shape: { am_start, am_end, pm_start, pm_end } as 'HH:MM' strings, any of which may be
// null/missing — each falls back to the standard template independently.
const toScheduleMinutes = (row) => (!row ? DEFAULT_SCHEDULE : {
  amStart: scheduleTimeToMinutes(row.am_start, DEFAULT_SCHEDULE.amStart),
  amEnd: scheduleTimeToMinutes(row.am_end, DEFAULT_SCHEDULE.amEnd),
  pmStart: scheduleTimeToMinutes(row.pm_start, DEFAULT_SCHEDULE.pmStart),
  pmEnd: scheduleTimeToMinutes(row.pm_end, DEFAULT_SCHEDULE.pmEnd),
});

// All override rows for one employee, oldest first — cheap to fetch once per employee and pick
// in-memory per day, instead of one query per day per employee.
const scheduleRowsFor = async (usercode) => db.queryAll(
  `SELECT am_start, am_end, pm_start, pm_end, effective_from FROM employee_dtr_schedule
   WHERE usercode=? ORDER BY effective_from`, [String(usercode).toUpperCase()]);

// Whichever row has the latest effective_from <= date — a schedule change only ever applies
// forward, so a day's own effective schedule at the time never changes after the fact.
const scheduleRowForDate = (rows, date) => {
  let match = null;
  for (const row of rows) {
    if (dateOnly(row.effective_from) <= date) match = row; else break;
  }
  return match;
};

// Non-shift (regular office) day: picks AM-IN/OUT, PM-IN/OUT, OT-IN/OUT out of a day's punches.
// Windows are offsets from the employee's schedule anchors (amStart/amEnd/pmStart/pmEnd) instead
// of fixed clock times, so an employee whose real shift starts earlier or later than the standard
// 8-12/1-5 template doesn't have real punches silently dropped for falling outside the window.
const pickOfficeDayPunches = (date, today, schedule = DEFAULT_SCHEDULE) => {
  const { amStart, amEnd, pmStart, pmEnd } = schedule;
  const amIn = firstPunch(today, ['I'], amStart - 240, amStart + 239);
  const recovered = firstPunch(today, ['O'], amStart - 240, amStart + 179);
  const resolvedAmIn = (!amIn || minutesOfDay(amIn.checktime) >= amStart + 210) && recovered ? recovered : amIn;
  let amOut = lastPunch(today, ['O'], amStart + 150, amStart + 360);
  // ponytail: no fixed noon floor here — lunch-break returns routinely punch back in before the
  // PM start, and a floor pinned at pmStart silently dropped those, leaving PM-IN blank even
  // though the employee clearly returned. "After amOut" is the only ordering guarantee needed.
  let pmCandidates = today.filter((p) => p.type === 'I' && minutesOfDay(p.checktime) <= pmEnd - 60
    && (!resolvedAmIn || epoch(p.checktime) > epoch(resolvedAmIn.checktime))
    && (!amOut || epoch(p.checktime) >= epoch(amOut.checktime)));
  // ponytail: the device requires pressing an OUT button before scanning — employees routinely
  // forget to switch it before lunch, so the "out" punch lands as another IN instead. If there's
  // no real OUT punch but 2+ IN punches sit in the midday window, assume the earlier one was
  // meant as the lunch-out. Ceiling: only fires with 2+ candidates, so a single ambiguous IN still
  // resolves as PM-IN with AM-out left blank (today's prior behavior), same as before this change.
  if (!amOut && pmCandidates.length >= 2) {
    [amOut, ...pmCandidates] = pmCandidates;
  }
  const pmIn = pmCandidates[0] || firstPunch(today.filter((p) => !amOut || epoch(p.checktime) > epoch(amOut.checktime)), ['O'], pmStart - 60, pmStart + 90);
  const explicitIn = firstPunch(today, ['i'], 0, 1439);
  const explicitOut = lastPunch(today, ['o'], 0, 1439);
  const fallbackIn = firstPunch(today, ['I'], pmEnd, 1439);
  const fallbackOut = lastPunch(today, ['O'], pmEnd, 1439);
  let pmOut; let otIn; let otOut;
  if (explicitIn && explicitOut && epoch(explicitOut.checktime) > epoch(explicitIn.checktime)) {
    pmOut = lastPunch(today, ['O'], pmEnd - 120, pmEnd + 90); otIn = explicitIn; otOut = explicitOut;
  } else {
    const fallbackPair = fallbackIn && fallbackOut && epoch(fallbackOut.checktime) > epoch(fallbackIn.checktime);
    pmOut = fallbackPair ? lastPunch(today, ['O'], pmEnd - 120, 1439, fallbackIn.checktime) : lastPunch(today, ['O'], pmEnd, 1439);
    pmOut ||= lastPunch(today, ['O'], pmEnd - 120, 1439);
    if (fallbackPair) { otIn = fallbackIn; otOut = fallbackOut; }
  }
  const base = epoch(`${date} 00:00:00`);
  let worked = 0;
  if (resolvedAmIn && amOut) worked += overlap((epoch(resolvedAmIn.checktime) - base) / 60000, (epoch(amOut.checktime) - base) / 60000, amStart, amEnd);
  if (pmIn && pmOut) worked += overlap((epoch(pmIn.checktime) - base) / 60000, (epoch(pmOut.checktime) - base) / 60000, pmStart, pmEnd);
  const otMinutes = otIn && otOut && epoch(otOut.checktime) > epoch(otIn.checktime) ? (epoch(otOut.checktime) - epoch(otIn.checktime)) / 60000 : 0;
  return { amIn: resolvedAmIn, amOut, pmIn, pmOut, otIn, otOut, worked, otMinutes };
};

// Punch-derived rows only — no dtr_corrections overlay. This is what gets frozen into dtr_final,
// so a later change to correction data (or to this computation) can never retroactively rewrite history.
const buildMonthlyRaw = async (usercode, from, to) => {
  const employee = await getEmployeeInfo(usercode);
  if (!employee) return { employee: null, items: [] };
  const links = [...new Set([employee.bioUID, employee.usercode]
    .map((v) => String(v || '').trim()).filter((v) => /^\d+$/.test(v)))];
  if (!links.length) return { employee, items: [] };
  const token = positionToken(employee.position);
  const kind = shiftPositionKind(employee.position);
  const maintenancePosition = kind === 'maintenance';
  const otherShiftPosition = kind === 'other';
  // ponytail: "Maintenance" covers two real schedules — some genuinely rotate through the 12AM-8AM/
  // 8AM-4PM/4PM-12AM shifts, others just work a regular single in/out day like office staff, despite
  // sharing the same position title. Query the wider (shift-safe) punch window either way, then
  // decide per-employee from their ACTUAL punches (any clock-in from 8 PM to 5 AM = a real
  // midnight-crossing shift happened) rather than trusting the job title alone.
  const queryFrom = maintenancePosition || otherShiftPosition ? addDays(from, -1) : from;
  const queryTo = maintenancePosition || otherShiftPosition ? addDays(to, 2) : addDays(to, 1);
  const placeholders = links.map(() => '?').join(',');
  const punches = await db.queryAll(
    `SELECT USERID,CHECKTIME,CHECKTYPE,inout_mode,inout_small,COALESCE(Area,'') area
     FROM checkinout WHERE USERID IN (${placeholders}) AND CHECKTIME>=? AND CHECKTIME<?
     ORDER BY CHECKTIME`, [...links, queryFrom, queryTo]);
  const byDay = {};
  const rawByDay = {};
  for (const source of punches) {
    const checktime = sqlDateTime(source.CHECKTIME).slice(0, 16) + ':00';
    const date = checktime.slice(0, 10);
    const type = normalizePunchType(source);
    const punch = { checktime, type: type || String(source.CHECKTYPE || 'RAW').toUpperCase(), area: source.area || '' };
    (rawByDay[date] ||= []).push(punch);
    if (type) (byDay[date] ||= []).push(punch);
  }
  const overnightIn = (p) => p.type === 'I' && (minutesOfDay(p.checktime) >= 1200 || minutesOfDay(p.checktime) < 300);
  const shiftPatternDetected = maintenancePosition
    && Object.values(byDay).some((dayPunches) => dayPunches.some(overnightIn));
  const shiftWorker = otherShiftPosition || shiftPatternDetected;
  const { special, officeEvents } = await specialDaysByDate(employee, from, to);
  const scheduleRows = shiftWorker ? [] : await scheduleRowsFor(employee.usercode);
  const items = [];
  let lateAllowanceRemaining = 60;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const today = byDay[date] || [];
    const schedule = toScheduleMinutes(scheduleRowForDate(scheduleRows, date));
    let amIn; let amOut; let pmIn; let pmOut; let otIn; let otOut; let worked = 0; let otMinutes = 0;
    if (shiftWorker) {
      const all = [...(byDay[addDays(date, -1)] || []), ...today, ...(byDay[addDays(date, 1)] || [])]
        .sort((a, b) => epoch(a.checktime) - epoch(b.checktime));
      const maintenanceSchedule = kind === 'maintenance';
      // Maintenance's real 3-shift rotation is 12AM-8AM / 8AM-4PM / 4PM-12AM (per HR) — this used
      // to be [360, 840, 1320] (6AM/2PM/10PM start), which doesn't match, so a punch near midnight
      // (e.g. an 11:43 PM Shift-1 clock-in) got classified into the 10PM-6AM window and printed
      // under "SHIFT 3" instead of "SHIFT 1". Security Guard/Substation Tender keep their own
      // [420, 900, 1380] (7AM/3PM/11PM) starts — no report of those being wrong.
      const starts = maintenanceSchedule ? [0, 480, 960] : [420, 900, 1380];
      // Maintenance Shift 1 (12AM-8AM) spans midnight — its clock-IN lands late on the PREVIOUS
      // calendar day (e.g. 11:43 PM). Confirmed with HR: the shift is attributed to the day it
      // ENDS/where most of its hours fall (e.g. an 11:43 PM Monday IN -> 8:05 AM Tuesday OUT
      // shift prints under Tuesday), not the day it started — so this stays anchored at `date`
      // itself (no date+1 shift), same as every other shift here.
      const pick = (startOffset, endOffset, inLookback = 120, outEarlyBuffer = 120) => {
        const base = epoch(`${date} 00:00:00`);
        const input = all.find((p) => ['I', 'i'].includes(p.type)
          && epoch(p.checktime) >= base + (startOffset - inLookback) * 60000
          && epoch(p.checktime) <= base + (startOffset + 180) * 60000);
        const outs = all.filter((p) => ['O', 'o'].includes(p.type)
          && epoch(p.checktime) >= base + (endOffset - outEarlyBuffer) * 60000
          && epoch(p.checktime) <= base + (endOffset + 240) * 60000);
        return [input || null, nearestOut(input, outs, new Date(base + endOffset * 60000))];
      };
      // ponytail: Shift 1's IN can come in as early as ~7-9 PM the night before (not just the
      // 10 PM-ish norm) — a 2-hour lookback (the default every other shift uses) missed those,
      // leaving the IN blank while the OUT still matched (e.g. an 8:56 PM clock-in showing no IN
      // at all on a day that clearly had one). Widened to 5 hours for Shift 1 specifically; other
      // shifts keep the default since no early-IN gap was reported for them.
      [amIn, amOut] = pick(starts[0], starts[0] + 480, maintenanceSchedule ? 300 : 120);
      [pmIn, pmOut] = pick(starts[1], starts[1] + 480);
      // ponytail: Security Guard/Substation Tender Shift 3 (11 PM-7 AM) used the default 2-hour
      // in/out buffers, so a guard whose real shift runs ~3 hours earlier (confirmed: multiple
      // guards clocking IN 18:55-20:42, e.g. Limpiado's consistent ~7:50 PM-4:00 AM) fell in the
      // gap between Shift 2's IN window (closes 6 PM) and Shift 3's (opened 9 PM) on the IN side,
      // and matched nothing on the OUT side either (OUT window opened 5 AM, real out was ~4 AM) —
      // the whole night read as unworked. Widened both sides the same 5-hour buffer already used
      // for Maintenance Shift 1's IN, for the same reason.
      [otIn, otOut] = pick(starts[2], starts[2] + 480, 300, 300);
      const shiftMinutes = [[amIn, amOut], [pmIn, pmOut], [otIn, otOut]].map(([input, output]) =>
        input && output && epoch(output.checktime) > epoch(input.checktime)
          ? Math.min(480, (epoch(output.checktime) - epoch(input.checktime)) / 60000)
          : 0);
      worked = Math.max(...shiftMinutes);
      otMinutes = shiftMinutes[2];
    } else {
      ({ amIn, amOut, pmIn, pmOut, otIn, otOut, worked, otMinutes } = pickOfficeDayPunches(date, today, schedule));
    }
    const selected = [amIn, amOut, pmIn, pmOut, otIn, otOut];
    const metrics = attendanceMetrics({
      date, position: employee.position, basic: employee.basic, punches: selected,
      worked, otMinutes, lateAllowance: lateAllowanceRemaining, schedule,
    });
    // ponytail: skip the deduction on a special day (holiday/EPASS/travel/leave) — since the
    // `weekend` fix above now runs the real Mon-Fri undertime/late math on those weekdays too
    // (needed so an actual absence still gets caught), an unpunched holiday would otherwise
    // compute a full 480min "late" and burn the whole monthly allowance on a day that's waived
    // anyway, starving every later real-lateness day in the same loop of allowance it should have had.
    if (!special[date]) lateAllowanceRemaining = Math.max(0, lateAllowanceRemaining - metrics.late_allowance_used);
    const row = computedRow(date, employee, selected, metrics);
    // Real per-employee determination (title + actual overnight punches this range), not the
    // frontend's title-only guess — see shiftPositionKind and the print header bug it fixes.
    row.shift = shiftWorker;
    row.biometric_punches = (rawByDay[date] || []).map((p) => ({
      time: p.checktime.slice(11, 16), display_time: `${formatTime(p.checktime)} ${minutesOfDay(p.checktime) >= 720 ? 'PM' : 'AM'}`,
      type: p.type.toUpperCase(), area: p.area,
    }));
    if (officeEvents.has(date)) {
      row.office_event = true;
      row.office_event_label = officeEvents.get(date);
    }
    if (special[date]) {
      row.special_label = special[date];
      // ponytail: undertime/late only used to waive when there was NO punch at all that day
      // (pure holiday/leave). A field crew member on an EPASS travel/duty assignment (destination
      // shown as the special_label, e.g. "AREA I Catbalogan") still punches in/out, but their real
      // work is out in the field all day, not the fixed AM/PM office window — so a partial punch
      // pair still got charged undertime as if they'd shown up late/left early from a desk job.
      // Per HR: field duty on an approved EPASS should never be charged undertime regardless of
      // how the punches happen to line up with the office schedule. Daily pay is bumped to a full
      // day (rather than left at whatever attendanceMetrics computed against the stale, now-waived
      // undertime) only when they actually punched at least once — a special day with zero punches
      // keeps the existing $0 (unpaid) treatment: forced to a clean 0, not whatever attendanceMetrics
      // computed, since a special weekday (e.g. a Regular Holiday) now runs the real Mon-Fri
      // undertime/late math ahead of this override (see the `weekend` fix above) and can leave a
      // sub-peso rounding remainder (chargeMinutes*perMinute rarely lands on perDay exactly) instead
      // of an exact 0.00.
      row.undertime_min = 0;
      row.late_min = 0;
      row.late_count = 0;
      row.daily_pay = selected.some(Boolean) ? metrics.per_day : 0;
    }
    items.push(row);
  }
  return { employee, items, shift: shiftWorker };
};

const buildMonthlyComputed = async (usercode, from, to) => {
  const raw = await buildMonthlyRaw(usercode, from, to);
  if (!raw.employee) return raw;
  return applyCorrections(raw, String(raw.employee.usercode), from, to);
};

const normalizeScheduleTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]); const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// All schedule override rows for one employee, newest effective_from first — for an admin screen
// to review/edit history, distinct from scheduleRowsFor's oldest-first shape used by the picker.
const scheduleHistory = async (usercode) => {
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [rows] = await connection.query(
      `SELECT id, am_start, am_end, pm_start, pm_end, effective_from, created_by, created_at
       FROM employee_dtr_schedule WHERE usercode=? ORDER BY effective_from DESC`, [String(usercode).toUpperCase()]);
    return rows.map((row) => ({ ...row, effective_from: dateOnly(row.effective_from) }));
  } finally { connection.release(); }
};

const saveSchedule = async (input, actor) => {
  const usercode = String(input.usercode || '').trim().toUpperCase();
  const effectiveFrom = dateOnly(input.effective_from || '');
  if (!usercode) throw Object.assign(new Error('Employee is required.'), { status: 400 });
  if (!validDate(effectiveFrom)) throw Object.assign(new Error('A valid effective date is required.'), { status: 400 });
  const employee = await getEmployeeInfo(usercode);
  if (!employee) throw Object.assign(new Error('Employee was not found.'), { status: 404 });
  const fields = ['am_start', 'am_end', 'pm_start', 'pm_end'];
  const values = fields.map((field) => {
    const value = normalizeScheduleTime(input[field]);
    if (input[field] && !value) throw Object.assign(new Error(`Invalid ${field.replace('_', ' ')} time.`), { status: 400 });
    return value;
  });
  const actorUsercode = String(actor?.usercode || actor?.username || 'ADMIN').trim().toUpperCase() || 'ADMIN';
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO employee_dtr_schedule (usercode, am_start, am_end, pm_start, pm_end, effective_from, created_by)
       VALUES (?,?,?,?,?,?,?)`, [usercode, ...values, effectiveFrom, actorUsercode]);
    return { id: result.insertId };
  } finally { connection.release(); }
};

const deleteSchedule = async (id) => {
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [result] = await connection.execute('DELETE FROM employee_dtr_schedule WHERE id=?', [Number(id) || 0]);
    return { deleted: result.affectedRows > 0 };
  } finally { connection.release(); }
};

// Per-EMPLOYEE DTR signatory (approver) — see dtr_employee_signatory in ensureAuditSchema for why
// this replaces guessing from a shared department/area group.
const getEmployeeSignatory = async (usercode) => {
  const code = String(usercode || '').trim().toUpperCase();
  if (!code) return null;
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [[row]] = await connection.query(
      `SELECT s.id, s.usercode, s.department, s.area, s.approver_usercode, s.active,
       COALESCE(NULLIF(u.name,''),u.username,s.approver_usercode) approver_name,
       COALESCE(u.position,'') approver_title
       FROM dtr_employee_signatory s LEFT JOIN usertb u ON u.usercode=s.approver_usercode
       WHERE s.usercode=? LIMIT 1`, [code]);
    return row || null;
  } finally { connection.release(); }
};

// Bulk load of every ACTIVE per-employee signatory — one query at print time instead of one per
// employee.
const listActiveEmployeeSignatories = async () => {
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [rows] = await connection.query(
      `SELECT s.usercode, s.approver_usercode,
       COALESCE(NULLIF(u.name,''),u.username,s.approver_usercode) approver_name,
       COALESCE(u.position,'') approver_title
       FROM dtr_employee_signatory s LEFT JOIN usertb u ON u.usercode=s.approver_usercode
       WHERE s.active=1`);
    return rows;
  } finally { connection.release(); }
};

const setEmployeeSignatory = async (input, actor) => {
  const usercode = String(input.usercode || '').trim().toUpperCase();
  const approverUsercode = String(input.approver_usercode || '').trim().toUpperCase();
  if (!usercode) throw Object.assign(new Error('Employee is required.'), { status: 400 });
  if (!approverUsercode) throw Object.assign(new Error('Choose an approver.'), { status: 400 });
  const employee = await getEmployeeInfo(usercode);
  if (!employee) throw Object.assign(new Error('Employee was not found.'), { status: 404 });
  const approver = await getEmployeeInfo(approverUsercode);
  if (!approver) throw Object.assign(new Error('Approver was not found.'), { status: 404 });
  const actorUsercode = String(actor?.usercode || actor?.username || 'ADMIN').trim().toUpperCase() || 'ADMIN';
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    await connection.execute(
      `INSERT INTO dtr_employee_signatory (usercode, department, area, approver_usercode, active, assigned_by, updated_at)
       VALUES (?,?,?,?,1,?,NOW())
       ON DUPLICATE KEY UPDATE department=VALUES(department), area=VALUES(area),
       approver_usercode=VALUES(approver_usercode), active=1, assigned_by=VALUES(assigned_by), updated_at=NOW()`,
      [usercode, employee.department || '', employee.area || '', approverUsercode, actorUsercode]);
    return { usercode, approver_usercode: approverUsercode };
  } finally { connection.release(); }
};

// Bulk version of setEmployeeSignatory — one approver applied to many employees at once (e.g.
// everyone checked in the print picker), so assigning a whole department doesn't require doing it
// one person at a time.
const setEmployeeSignatoryBulk = async (input, actor) => {
  const usercodes = [...new Set((Array.isArray(input.usercodes) ? input.usercodes : [])
    .map((code) => String(code || '').trim().toUpperCase()).filter(Boolean))];
  const approverUsercode = String(input.approver_usercode || '').trim().toUpperCase();
  if (!usercodes.length) throw Object.assign(new Error('Choose at least one employee.'), { status: 400 });
  if (!approverUsercode) throw Object.assign(new Error('Choose an approver.'), { status: 400 });
  const approver = await getEmployeeInfo(approverUsercode);
  if (!approver) throw Object.assign(new Error('Approver was not found.'), { status: 404 });
  const actorUsercode = String(actor?.usercode || actor?.username || 'ADMIN').trim().toUpperCase() || 'ADMIN';
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    let updated = 0;
    for (const usercode of usercodes) {
      const employee = await getEmployeeInfo(usercode);
      if (!employee) continue;
      await connection.execute(
        `INSERT INTO dtr_employee_signatory (usercode, department, area, approver_usercode, active, assigned_by, updated_at)
         VALUES (?,?,?,?,1,?,NOW())
         ON DUPLICATE KEY UPDATE department=VALUES(department), area=VALUES(area),
         approver_usercode=VALUES(approver_usercode), active=1, assigned_by=VALUES(assigned_by), updated_at=NOW()`,
        [usercode, employee.department || '', employee.area || '', approverUsercode, actorUsercode]);
      updated += 1;
    }
    return { updated, approver_usercode: approverUsercode };
  } finally { connection.release(); }
};

// Soft-remove — active=0, not DELETE, so history survives (e.g. an approver who resigned) but the
// name stops appearing on prints, per request.
const removeEmployeeSignatory = async (usercode) => {
  const code = String(usercode || '').trim().toUpperCase();
  if (!code) throw Object.assign(new Error('Employee is required.'), { status: 400 });
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [result] = await connection.execute(
      'UPDATE dtr_employee_signatory SET active=0, updated_at=NOW() WHERE usercode=?', [code]);
    return { removed: result.affectedRows > 0 };
  } finally { connection.release(); }
};

// Print signatory for shift workers (Maintenance/Security/Substation Tender) — one signatory
// company-wide regardless of which branch area the employee is deployed to: ESD Manager for
// Engineering/Substation staff, TSD Manager for Technical Services. Looked up live from usertb
// (not hardcoded) so it always reflects whoever currently holds that position.
const areaApprover = async (_area, department) => {
  const deptToken = positionToken(department);
  const managerPosition = deptToken.includes('TECHNICAL') ? 'TSD Manager' : 'ESD Manager';
  const manager = await db.queryOne('SELECT name, position FROM usertb WHERE position=? LIMIT 1', [managerPosition]);
  return manager ? { name: manager.name, title: manager.position } : null;
};

// Every raw checkinout punch for a single day, regardless of finalized/frozen status — for
// showing what actually got scanned (e.g. an early-out-and-return the 6-slot AM/PM/OT picker
// collapsed away) without recomputing or touching the frozen dtr_final row.
const dayPunches = async (usercode, date) => {
  const raw = await buildMonthlyRaw(usercode, date, date);
  return raw.items[0]?.biometric_punches || [];
};

const FINAL_COLUMNS = [
  'usercode', 'work_date', 'name', 'department', 'area', 'special_label',
  'morning_in', 'morning_out', 'afternoon_in', 'afternoon_out', 'ot_in', 'ot_out',
  'worked_minutes', 'undertime_min', 'late_min', 'daily_pay', 'per_hour', 'per_minute', 'ot_minutes', 'late_count',
];

// Active-employee enumeration mirrors employeesByDepartment('all') above (usertb WHERE bioUID != 0).
const activeEmployeeCodes = async () => {
  const rows = await db.queryAll(
    "SELECT usercode FROM usertb WHERE bioUID != 0 AND usercode IS NOT NULL AND TRIM(usercode)<>''");
  return rows.map((row) => String(row.usercode));
};

// A remote-site biometric device can sync its punches to `checkinout` days after the punch itself,
// while this job freezes "yesterday" every night — the freeze used to win that race and lock in a
// blank/partial day forever (INSERT IGNORE never revisits an existing row). Payroll periods that
// are already LOCKED/APPROVED/RELEASED must still never move under a run that was already paid out,
// so only a work_date outside every such period is eligible to be upgraded once more data arrives.
const protectedDateRanges = async (from, to) => {
  try {
    return await db.queryAll(
      `SELECT cutoff_start, cutoff_end FROM payroll_runs
       WHERE status IN ('LOCKED','APPROVED','RELEASED') AND cutoff_end>=? AND cutoff_start<=?`, [from, to]);
  } catch (error) {
    // payroll_runs is created by a separate migration; a deployment that hasn't run it yet has no
    // payroll runs to protect, so nothing is locked — safe to fall through and allow upgrades.
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
};

const dateIsPayrollLocked = (date, ranges) => ranges.some(
  (r) => dateOnly(r.cutoff_start) <= date && date <= dateOnly(r.cutoff_end));

const filledFieldCount = (row) => CORRECTION_FIELDS.filter((field) => row?.[field]).length;

// INSERT IGNORE is the first-time freeze: a brand new (usercode, work_date) is written once. If the
// row already exists, it's only ever REPLACED — never for a locked payroll period, and only when the
// freshly computed punches fill in strictly more of the six time fields than what's stored (an
// upgrade, never a downgrade) — so a device that finally syncs its late punches gets picked up
// instead of staying wrong forever, while genuinely complete or already-paid days stay untouched.
const insertFinalRows = async (connection, items, lockedRanges = []) => {
  let inserted = 0;
  let upgraded = 0;
  for (const item of items) {
    const workDate = dateOnly(item.work_date);
    const values = [
      item.usercode, workDate, item.name || '', item.department || '', item.area || '', item.special_label || '',
      item.morning_in || '', item.morning_out || '', item.afternoon_in || '', item.afternoon_out || '', item.ot_in || '', item.ot_out || '',
      item.worked_minutes ?? 0, item.undertime_min ?? 0, item.late_min ?? 0, item.daily_pay ?? 0, item.per_hour ?? 0, item.per_minute ?? 0,
      item.ot_minutes ?? 0, item.late_count ?? 0,
    ];
    const [result] = await connection.execute(
      `INSERT IGNORE INTO dtr_final (${FINAL_COLUMNS.join(',')}) VALUES (${FINAL_COLUMNS.map(() => '?').join(',')})`, values);
    if (result.affectedRows) { inserted += 1; continue; }

    if (dateIsPayrollLocked(workDate, lockedRanges)) continue;
    const [existingRows] = await connection.query(
      'SELECT morning_in,morning_out,afternoon_in,afternoon_out,ot_in,ot_out,special_label FROM dtr_final WHERE usercode=? AND work_date=? LIMIT 1',
      [item.usercode, workDate]);
    const existing = existingRows[0];
    if (!existing) continue;
    // A holiday added to philippine_holidays *after* a day was frozen has zero time-punch fields
    // either way (same as before), so the punch-count upgrade check below never re-triggers and
    // the day stays permanently blank instead of showing HOLIDAY. Treat a fresh, different
    // special_label (HOLIDAY/EPASS/LEAVE) as its own upgrade reason, independent of punch fields.
    const specialLabelUpgrade = Boolean(item.special_label) && item.special_label !== (existing.special_label || '');
    if (filledFieldCount(item) <= filledFieldCount(existing) && !specialLabelUpgrade) continue;

    const updateColumns = FINAL_COLUMNS.filter((column) => column !== 'usercode' && column !== 'work_date');
    await connection.execute(
      `UPDATE dtr_final SET ${updateColumns.map((column) => `${column}=?`).join(',')}, finalized_at=finalized_at
       WHERE usercode=? AND work_date=?`,
      [...updateColumns.map((column) => values[FINAL_COLUMNS.indexOf(column)]), item.usercode, workDate]);
    upgraded += 1;
  }
  return { inserted, upgraded };
};

// Freeze one employee's one day. Safe to call repeatedly — a complete or payroll-locked day is a
// no-op; an incomplete, still-open day gets upgraded if fresher punches filled it in more (see insertFinalRows).
const finalizeDay = async (usercode, date) => {
  const raw = await buildMonthlyRaw(usercode, date, date);
  if (!raw.employee) return { inserted: 0, upgraded: 0 };
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const lockedRanges = await protectedDateRanges(date, date);
    return await insertFinalRows(connection, raw.items, lockedRanges);
  } finally { connection.release(); }
};

// Runs `worker` over `items` with at most `limit` in flight at once — plain Promise.all has no
// concurrency cap (floods the DB pool), a sequential for-of has none in flight (slow). Each of
// `limit` runners just keeps pulling the next index until the queue is empty.
const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

// Freeze every active employee's rows across [from, to]. Never finalizes today or a future date —
// a day's punches aren't settled until the day is over, so "today" is never safe to freeze.
const finalizeRange = async (from, to) => {
  const cutoff = addDays(dateOnly(new Date()), -1);
  const safeTo = to > cutoff ? cutoff : to;
  if (safeTo < from) return { employees: 0, rows_inserted: 0, date_from: from, date_to: safeTo };
  const codes = await activeEmployeeCodes();
  // ponytail: this used to be a sequential for-of over all 324 employees — one DB round-trip
  // queue at a time — which took ~60s on a full roster (fire-and-forget from the client on every
  // DTR page open, but the server still stalls other requests while it churns). Reading is now
  // parallelized (cap 8, under the 10-connection pool limit); the actual INSERT IGNORE writes stay
  // sequential on one connection afterward since mysql2 connections can't run concurrent queries —
  // writes are cheap compared to the SELECT-heavy read side, so that part was never the bottleneck.
  const rawResults = await mapWithConcurrency(codes, 8, (usercode) => buildMonthlyRaw(usercode, from, safeTo));
  let rowsInserted = 0;
  let rowsUpgraded = 0;
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const lockedRanges = await protectedDateRanges(from, safeTo);
    for (const raw of rawResults) {
      if (!raw.employee) continue;
      const { inserted, upgraded } = await insertFinalRows(connection, raw.items, lockedRanges);
      rowsInserted += inserted;
      rowsUpgraded += upgraded;
    }
  } finally { connection.release(); }
  return {
    employees: codes.length, rows_inserted: rowsInserted, rows_upgraded: rowsUpgraded, date_from: from, date_to: safeTo,
  };
};

// Standalone version of buildMonthlyRaw's shift-worker check, for monthlyFinal below: when every
// requested day is already frozen in dtr_final, buildMonthlyRaw never runs, so there's no in-memory
// punch list to read the real determination off of. Queries just enough of checkinout to answer the
// same question (title says Maintenance AND an actual overnight IN exists somewhere in range).
const detectShiftWorker = async (employee, from, to) => {
  const kind = shiftPositionKind(employee.position);
  if (kind === 'other') return true;
  if (kind !== 'maintenance') return false;
  const links = [...new Set([employee.bioUID, employee.usercode]
    .map((v) => String(v || '').trim()).filter((v) => /^\d+$/.test(v)))];
  if (!links.length) return false;
  const placeholders = links.map(() => '?').join(',');
  const punches = await db.queryAll(
    `SELECT CHECKTIME,CHECKTYPE,inout_mode,inout_small FROM checkinout
     WHERE USERID IN (${placeholders}) AND CHECKTIME>=? AND CHECKTIME<?`,
    [...links, addDays(from, -1), addDays(to, 2)]);
  return punches.some((source) => {
    if (normalizePunchType(source) !== 'I') return false;
    const minute = minutesOfDay(sqlDateTime(source.CHECKTIME));
    return minute >= 1200 || minute < 300;
  });
};

// Read path for consumers that want the frozen table: dtr_final rows where they exist, live
// buildMonthlyRaw fallback for any date not yet frozen (e.g. today, or before the job ever ran),
// each row flagged `finalized`, then the SAME corrections overlay as the live path on top of both.
const monthlyFinal = async (usercode, from, to) => {
  const employee = await getEmployeeInfo(usercode);
  if (!employee) return { employee: null, items: [] };
  const shiftWorker = await detectShiftWorker(employee, from, to);
  const connection = await db.getDtrAuditConnection();
  let finalRows;
  try {
    await ensureAuditSchema(connection);
    [finalRows] = await connection.query(
      'SELECT * FROM dtr_final WHERE usercode=? AND work_date BETWEEN ? AND ? ORDER BY work_date',
      [String(employee.usercode).toUpperCase(), from, to]);
  } finally { connection.release(); }

  const byDate = new Map();
  for (const row of finalRows) {
    const date = dateOnly(row.work_date);
    byDate.set(date, {
      usercode: row.usercode, name: row.name, position: employee.position, department: row.department,
      area: row.area || '', bioUID: employee.bioUID, work_date: date, day_name: dayName(date),
      ...(row.special_label ? { special_label: row.special_label } : {}),
      morning_in: row.morning_in || '', morning_out: row.morning_out || '',
      afternoon_in: row.afternoon_in || '', afternoon_out: row.afternoon_out || '',
      ot_in: row.ot_in || '', ot_out: row.ot_out || '',
      worked_minutes: row.worked_minutes, undertime_min: row.undertime_min, late_min: row.late_min,
      late_count: row.late_count, daily_pay: Number(row.daily_pay), per_hour: Number(row.per_hour),
      per_minute: Number(row.per_minute), ot_minutes: row.ot_minutes,
      finalized: true,
    });
  }
  const missing = [];
  for (let date = from; date <= to; date = addDays(date, 1)) if (!byDate.has(date)) missing.push(date);
  if (missing.length) {
    const live = await buildMonthlyRaw(usercode, missing[0], missing[missing.length - 1]);
    for (const item of live.items) {
      const date = dateOnly(item.work_date);
      if (byDate.has(date)) continue;
      byDate.set(date, { ...item, finalized: false });
    }
  }
  const items = [...byDate.values()]
    .map((item) => ({ ...item, shift: shiftWorker }))
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  return applyCorrections({ employee, items, shift: shiftWorker }, String(employee.usercode), from, to);
};

const leaveSummary = (computed, from, to) => {
  const employee = computed.employee || {};
  const byDate = Object.fromEntries(computed.items.map((row) => [row.work_date, row]));
  const specialLabels = new Map(computed.items.filter((row) => row.special_label).map((row) => [row.work_date, row.special_label]));
  let workingDays = 0; let presentDays = 0; let undertime = 0; let overtime = 0;
  for (const row of computed.items) {
    if (hasTimes(row)) presentDays += 1;
    undertime += Number(row.undertime_min || 0); overtime += Number(row.ot_minutes || 0);
  }
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !specialLabels.has(date)) workingDays += 1;
  }
  const ratio = workingDays ? Math.min(1, presentDays / workingDays) : 0;
  const monthly = Number(from.slice(5, 7)) === 12 ? 1.685 : 1.665;
  const daily = workingDays ? Number((monthly / workingDays).toFixed(4)) : 0;
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const row = byDate[date]; const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    const special = specialLabels.get(date) || ''; const present = hasTimes(row);
    let status = special ? special : weekend ? 'WEEKEND' : present ? 'PRESENT' : 'ABSENT';
    if (special && present) status = `${special} DUTY`; else if (weekend && present) status = 'WEEKEND DUTY';
    days.push({ day: Number(date.slice(8)), date, day_name: dayName(date), status,
      points: !special && !weekend && present ? Number(daily.toFixed(2)) : 0,
      undertime_minutes: Number(row?.undertime_min || 0), overtime_minutes: Number(row?.ot_minutes || 0),
      is_working_day: !special && !weekend, has_time: present });
  }
  const earned = Number((monthly * ratio).toFixed(3));
  return { date_from: from, date_to: to, working_days: workingDays, present_days: presentDays,
    absent_days: Math.max(0, workingDays - presentDays), attendance_ratio: Number((ratio * 100).toFixed(1)),
    monthly_credit_rate: monthly, daily_credit_rate: daily, earned_vl: earned, earned_sl: earned,
    projected_vl: Number((Number(employee.VLbal || 0) + earned).toFixed(3)),
    projected_sl: Number((Number(employee.SLbal || 0) + earned).toFixed(3)),
    current_vl: Number(Number(employee.VLbal || 0).toFixed(3)), current_sl: Number(Number(employee.SLbal || 0).toFixed(3)),
    undertime_minutes: undertime, overtime_minutes: overtime, days,
    employee: Object.fromEntries(['usercode', 'name', 'position', 'department', 'area', 'employmentdate', 'basic', 'VLbal', 'SLbal', 'OLbal'].map((k) => [k, employee[k] ?? ''])) };
};

const myCorrections = async (usercode, from, to) => {
  let connection;
  try {
    connection = await db.getDtrAuditConnection();
    await ensureAuditSchema(connection);
    const [items] = await connection.query(
      `SELECT id,usercode,work_date,field_name,original_value,proposed_value,category,reason,status,
       requested_by,reviewed_by,reviewer_note,created_at,updated_at,reviewed_at
       FROM dtr_corrections WHERE usercode=? AND work_date BETWEEN ? AND ? AND status='approved'
       ORDER BY work_date,id DESC`, [usercode, from, to]);
    // mysql2 hands work_date back as a JS Date (see dateOnly() above) — left raw, it serializes to a
    // full ISO datetime over JSON, which breaks the correction dialog's <input type=date> and turns
    // "reopen the day I just corrected" into "reopen today" once new Date(...) can't parse it.
    return items.map((item) => ({ ...item, work_date: dateOnly(item.work_date) }));
  } catch (error) {
    // ponytail: Corrections are optional while the isolated audit DB is offline; reconnect is the upgrade path.
    if (['ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) return [];
    throw error;
  } finally { connection?.release(); }
};

const normalizeCorrectionTime = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

const submitCorrection = async (actingUser, payload) => {
  if (!canManageCorrections(actingUser)) {
    throw Object.assign(new Error('DTR corrections are restricted to HR/Payroll/Department Head.'), { status: 403 });
  }
  const actingUsercode = String(actingUser?.usercode ?? actingUser?.username ?? '').trim().toUpperCase();
  const targetUsercode = String(payload.usercode ?? '').trim().toUpperCase() || actingUsercode;
  const target = await getEmployeeInfo(targetUsercode);
  if (!target) throw Object.assign(new Error('Employee not found.'), { status: 404 });

  const workDate = dateOnly(payload.work_date);
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (!validDate(workDate) || workDate > dateOnly(new Date().toISOString()) || workDate < addDays(dateOnly(new Date().toISOString()), -731)
      || !changes.length || changes.length > 7) throw Object.assign(new Error('Please provide valid DTR move or hide changes.'), { status: 422 });
  const current = (await buildMonthlyComputed(targetUsercode, workDate, workDate)).items[0] || {};
  const unique = new Map();
  for (const change of changes) {
    const field = String(change.field_name || '');
    const proposed = normalizeCorrectionTime(change.proposed_value);
    if (!CORRECTION_FIELDS.includes(field) || proposed === null) throw Object.assign(new Error('Invalid DTR field or time value.'), { status: 422 });
    unique.set(field, { field, proposed, original: String(current[`biometric_${field}`] ?? current[field] ?? '') });
  }
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection); await connection.beginTransaction();
    for (const change of unique.values()) {
      await connection.execute(
        `INSERT INTO dtr_corrections (usercode,work_date,field_name,original_value,proposed_value,category,reason,
         status,requested_by,reviewed_by,reviewed_at,updated_at) VALUES (?,?,?,?,?,'manual','Direct manual DTR assignment',
         'approved',?,?,NOW(),NOW())`, [targetUsercode, workDate, change.field, change.original, change.proposed, actingUsercode, actingUsercode]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

const normalizePrintRows = (rows) => {
  // ponytail: 50k covers roughly 1,600 monthly DTRs; move snapshots to streamed storage if the roster outgrows this.
  if (!Array.isArray(rows) || !rows.length || rows.length > 50000) throw Object.assign(new Error('The print snapshot must contain 1 to 50000 rows.'), { status: 422 });
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Object.assign(new Error('Invalid DTR print row.'), { status: 422 });
    const item = {};
    for (const field of PRINT_FIELDS) {
      if (field === 'correction_ids') item[field] = [...new Set((Array.isArray(row[field]) ? row[field] : []).map(Number).filter((id) => id > 0))];
      else item[field] = row[field] == null || ['string', 'number', 'boolean'].includes(typeof row[field]) ? String(row[field] ?? '') : '';
    }
    item.work_date = dateOnly(item.work_date);
    if (!item.usercode || !validDate(item.work_date)) throw Object.assign(new Error('Every print row requires an employee code and valid date.'), { status: 422 });
    return item;
  });
};
const canonicalSnapshot = (s) => JSON.stringify({
  snapshot_uuid: s.snapshot_uuid, date_from: dateOnly(s.date_from), date_to: dateOnly(s.date_to),
  usercodes: s.usercodes, rows: s.rows, correction_ids: s.correction_ids,
  printed_by: s.printed_by, printed_at: sqlDateTime(s.printed_at),
});
const checksum = (previous, canonical) => crypto.createHash('sha256').update(`${previous}\n${canonical}`).digest('hex');

const createPrintSnapshotOnce = async (payload, printer) => {
  const from = dateOnly(payload.date_from); const to = dateOnly(payload.date_to); const rows = normalizePrintRows(payload.rows);
  if (!validDate(from) || !validDate(to) || from > to || rows.some((row) => row.work_date < from || row.work_date > to)) {
    throw Object.assign(new Error('Invalid print date range or row.'), { status: 422 });
  }
  const usercodes = [...new Set(rows.map((r) => r.usercode.toUpperCase()))].sort();
  const correctionIds = [...new Set(rows.flatMap((r) => r.correction_ids).map(Number))].sort((a, b) => a - b);
  const snapshot = { snapshot_uuid: crypto.randomUUID(), date_from: from, date_to: to, usercodes, rows,
    correction_ids: correctionIds, printed_by: printer.toUpperCase(), printed_at: sqlDateTime() };
  const connection = await db.getDtrAuditConnection();
  let locked = false;
  let transactionStarted = false;
  try {
    await ensureAuditSchema(connection);
    const [[lock]] = await connection.query("SELECT GET_LOCK('samelcii_dtr_print_chain',5) locked");
    if (Number(lock.locked) !== 1) throw Object.assign(new Error('Print audit is busy. Please try again.'), { status: 503 });
    locked = true; await connection.beginTransaction(); transactionStarted = true;
    const [[last]] = await connection.query('SELECT snapshot_hash FROM dtr_print_snapshots ORDER BY id DESC LIMIT 1');
    const previous = last?.snapshot_hash || ''; const hash = checksum(previous, canonicalSnapshot(snapshot));
    const [result] = await connection.execute(
      `INSERT INTO dtr_print_snapshots (snapshot_uuid,date_from,date_to,usercodes_json,rows_json,correction_ids_json,
       row_count,previous_hash,snapshot_hash,printed_by,printed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [snapshot.snapshot_uuid, from, to, JSON.stringify(usercodes), JSON.stringify(rows), JSON.stringify(correctionIds),
        rows.length, previous, hash, snapshot.printed_by, snapshot.printed_at]);
    await connection.commit(); transactionStarted = false;
    return { snapshot_uuid: snapshot.snapshot_uuid, audit_id: `DTR-${String(result.insertId).padStart(8, '0')}`,
      checksum: hash, checksum_short: hash.slice(0, 12).toUpperCase(), printed_by: snapshot.printed_by,
      printed_at: snapshot.printed_at, row_count: rows.length };
  } catch (error) { if (transactionStarted) await connection.rollback(); throw error; }
  finally { if (locked) await connection.query("SELECT RELEASE_LOCK('samelcii_dtr_print_chain')"); connection.release(); }
};

// ponytail: MySQL deadlocks (ER_LOCK_DEADLOCK) between overlapping print/PDF-export requests are
// expected to happen occasionally under the hash-chain's serialized writes — MySQL's own guidance
// is "the application should retry the transaction", not treat it as a hard failure. A handful of
// quick retries turns a transient collision into a normal (if slightly slower) success instead of
// a 500 the user has to notice and retry themselves.
const createPrintSnapshot = async (payload, printer) => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await createPrintSnapshotOnce(payload, printer);
    } catch (error) {
      if (error.code !== 'ER_LOCK_DEADLOCK' || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  return undefined; // unreachable — loop always returns or throws
};

const getPrintSnapshot = async (uuid, requester, privilege) => {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)) {
    throw Object.assign(new Error('Invalid print snapshot ID.'), { status: 422 });
  }
  const connection = await db.getDtrAuditConnection();
  try {
    await ensureAuditSchema(connection);
    const [[row]] = await connection.query('SELECT * FROM dtr_print_snapshots WHERE snapshot_uuid=? LIMIT 1', [uuid]);
    if (!row) throw Object.assign(new Error('Print snapshot not found.'), { status: 404 });
    if (requester.toUpperCase() !== String(row.printed_by).toUpperCase() && Number(privilege) < 6) {
      throw Object.assign(new Error('Print snapshot access denied.'), { status: 403 });
    }
    const snapshot = { snapshot_uuid: row.snapshot_uuid, date_from: dateOnly(row.date_from), date_to: dateOnly(row.date_to),
      usercodes: JSON.parse(row.usercodes_json), rows: JSON.parse(row.rows_json), correction_ids: JSON.parse(row.correction_ids_json),
      printed_by: row.printed_by, printed_at: sqlDateTime(row.printed_at) };
    const expected = checksum(row.previous_hash || '', canonicalSnapshot(snapshot));
    return { ...snapshot, audit_id: `DTR-${String(row.id).padStart(8, '0')}`, checksum: row.snapshot_hash,
      checksum_short: String(row.snapshot_hash).slice(0, 12).toUpperCase(),
      checksum_verified: expected.length === String(row.snapshot_hash).length
        && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(row.snapshot_hash))),
      previous_checksum: row.previous_hash || '' };
  } finally { connection.release(); }
};

const records = async ({ position = 'Maintenance', usercode = '', from, to, includeWeekends = true }) => {
  if (position.toLowerCase() === 'maintenance') {
    const where = ["u.bioUID IS NOT NULL", "TRIM(u.bioUID)<>''", 'c.CHECKTIME>=?', 'c.CHECKTIME<DATE_ADD(?,INTERVAL 1 DAY)', 'u.position=?'];
    const params = [addDays(from, -1), addDays(to, 1), position];
    if (usercode) { where.push('u.usercode=?'); params.push(usercode); }
    if (!includeWeekends) where.push('DAYOFWEEK(c.CHECKTIME) NOT IN (1,7)');
    const source = await db.queryAll(
      `SELECT u.usercode,u.name,u.position,u.department,u.bioUID,c.CHECKTIME,c.CHECKTYPE,c.inout_mode,
       c.inout_small,COALESCE(c.Area,'') Area FROM usertb u JOIN checkinout c
       ON c.USERID=CAST(NULLIF(TRIM(u.bioUID),'') AS UNSIGNED) WHERE ${where.join(' AND ')}
       ORDER BY u.usercode,c.CHECKTIME`, params);
    const byUser = new Map();
    for (const row of source) {
      if (!byUser.has(row.usercode)) byUser.set(row.usercode, []);
      byUser.get(row.usercode).push(row);
    }
    const result = [];
    const emit = (employee, input, output) => {
      const date = dateOnly(input?.CHECKTIME || output?.CHECKTIME);
      if (!date || date < from || date > to) return;
      const areasUsed = [...new Set([input?.Area, output?.Area].filter(Boolean))];
      result.push({
        usercode: employee.usercode, name: employee.name, position: employee.position,
        department: employee.department, bioUID: employee.bioUID, work_date: date, day_name: dayName(date),
        first_in: input?.CHECKTIME || null, last_out: output?.CHECKTIME || null,
        log_count: Number(Boolean(input)) + Number(Boolean(output)),
        punches: `${input ? `${sqlDateTime(input.CHECKTIME).slice(11)} IN` : ''} ${output ? `${sqlDateTime(output.CHECKTIME).slice(11)} OUT` : ''}`.trim(),
        areas: areasUsed.join(', '),
        duty_type: input && output && dateOnly(input.CHECKTIME) !== dateOnly(output.CHECKTIME) ? 'Overnight' : 'Regular',
      });
    };
    for (const rows of byUser.values()) {
      let open = null;
      for (const row of rows) {
        const type = normalizePunchType(row).toUpperCase();
        if (type === 'I') {
          if (open) emit(rows[0], open, null);
          open = row;
        } else if (type === 'O' && open && epoch(row.CHECKTIME) >= epoch(open.CHECKTIME)) {
          emit(rows[0], open, row); open = null;
        }
      }
      if (open) emit(rows[0], open, null);
    }
    return result.sort((a, b) => b.work_date.localeCompare(a.work_date) || a.name.localeCompare(b.name)).slice(0, 500);
  }
  const where = ["u.bioUID IS NOT NULL", "TRIM(u.bioUID)<>''", 'c.CHECKTIME>=?', 'c.CHECKTIME<DATE_ADD(?,INTERVAL 1 DAY)'];
  const params = [from, to];
  if (position) { where.push('u.position=?'); params.push(position); }
  if (usercode) { where.push('u.usercode=?'); params.push(usercode); }
  if (!includeWeekends) where.push('DAYOFWEEK(c.CHECKTIME) NOT IN (1,7)');
  return db.queryAll(
    `SELECT u.usercode,u.name,u.position,u.department,u.bioUID,DATE(c.CHECKTIME) work_date,
     DAYNAME(c.CHECKTIME) day_name,MIN(c.CHECKTIME) first_in,MAX(c.CHECKTIME) last_out,COUNT(*) log_count,
     GROUP_CONCAT(DISTINCT DATE_FORMAT(c.CHECKTIME,'%H:%i:%s') ORDER BY c.CHECKTIME SEPARATOR ', ') punches,
     GROUP_CONCAT(DISTINCT COALESCE(c.Area,'') ORDER BY c.Area SEPARATOR ', ') areas,'Regular' duty_type
     FROM usertb u JOIN checkinout c ON c.USERID=CAST(NULLIF(TRIM(u.bioUID),'') AS UNSIGNED)
     WHERE ${where.join(' AND ')} GROUP BY u.usercode,u.name,u.position,u.department,u.bioUID,DATE(c.CHECKTIME),DAYNAME(c.CHECKTIME)
     ORDER BY work_date DESC,u.name LIMIT 500`, params);
};

module.exports = {
  CORRECTION_FIELDS, validDate, normalizePunchType, normalizeCorrectionTime, normalizePrintRows, checksum, attendanceMetrics,
  truncateWords, leaveShortOrTrim, shiftPositionKind, detectShiftWorker,
  getEmployeeInfo, buildMonthlyComputed, dayPunches, pickOfficeDayPunches, leaveSummary, myCorrections, submitCorrection, canManageCorrections,
  createPrintSnapshot, getPrintSnapshot, records,
  departmentFilterOptions, employeesByDepartment, classifyDepartmentFilter, signatoryCandidates, epassDates,
  finalizeDay, finalizeRange, monthlyFinal, activeEmployeeCodes, ensureAuditSchema,
  scheduleHistory, saveSchedule, deleteSchedule, areaApprover,
  getEmployeeSignatory, listActiveEmployeeSignatories, setEmployeeSignatory, setEmployeeSignatoryBulk, removeEmployeeSignatory,
  positions: () => db.queryAll("SELECT DISTINCT position FROM usertb WHERE position IS NOT NULL AND TRIM(position)<>'' ORDER BY position"),
};
