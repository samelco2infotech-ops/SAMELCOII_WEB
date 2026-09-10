/**
 * Purpose: Phase 2 Payroll foundation API using the existing dashboard JWT.
 * EDIT GUIDE: Confirm new rate labels before enabling them in the database.
 * HUWAG BAGUHIN: Payroll access requires privilege 10 and money uses integer cents.
 * Tagalog: Walang pangalawang login; ang kasalukuyang signed dashboard token ang gamit.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const dtrService = require('../services/dtrService');
const { requirePrivilege } = require('../middleware/auth');

const router = express.Router();
const OFFICE_OT_START = '17:01';
const MAX_SEARCH_ROWS = 50;
const REQUIRED_TABLES = [
  'payroll_employee_profiles',
  'payroll_compensation_history',
  'payroll_overtime_rates',
  'payroll_audit_log',
];
const FALLBACK_RATES = [
  { rate_code: 'OFFICE_DAY_OT', label: 'Office day overtime', multiplier: '1.3000', is_enabled: 1, requires_confirmation: 0 },
  { rate_code: 'REGULAR_HOLIDAY_SET_A', label: 'Regular holiday - set A', multiplier: '2.1000', is_enabled: 0, requires_confirmation: 1 },
  { rate_code: 'REST_SPECIAL_SET_A', label: 'Rest / special day - set A', multiplier: '1.4000', is_enabled: 0, requires_confirmation: 1 },
  { rate_code: 'REGULAR_HOLIDAY_SET_B', label: 'Regular holiday - set B', multiplier: '1.4000', is_enabled: 0, requires_confirmation: 1 },
  { rate_code: 'REST_SPECIAL_SET_B', label: 'Rest / special day - set B', multiplier: '1.3500', is_enabled: 0, requires_confirmation: 1 },
];

router.use(requirePrivilege(10));

// ============================================================
// [LOGIC] EXACT MONEY AND ACCEPTED OT WINDOW
// ============================================================
const parseMoneyToCents = (value) => {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Basic pay must be a positive amount with up to two decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (cents <= 0n) throw new Error('Basic pay must be greater than zero.');
  return cents;
};

const parseMultiplierToBasisPoints = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}(?:\.\d{1,4})?$/.test(text)) {
    throw new Error('Multiplier must contain up to four decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const points = BigInt(whole) * 10000n + BigInt((fraction + '0000').slice(0, 4));
  if (points <= 0n || points > 100000n) throw new Error('Multiplier is outside the supported range.');
  return points;
};

const formatCents = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
const formatSignedCents = (value) => (value < 0n ? `-${formatCents(-value)}` : formatCents(value));

const calculateOvertime = ({ basicPay, payableMinutes, multiplier }) => {
  const minutes = Number(payableMinutes);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new Error('Payable overtime must be whole minutes from 0 to 1440.');
  }
  const basicCents = parseMoneyToCents(basicPay);
  const multiplierBasisPoints = parseMultiplierToBasisPoints(multiplier);
  const numerator = basicCents * 12n * BigInt(minutes) * multiplierBasisPoints;
  const denominator = 365n * 8n * 60n * 10000n;
  const amountCents = (numerator + denominator / 2n) / denominator;
  return {
    basicPay: formatCents(basicCents),
    payableMinutes: minutes,
    payableHours: (minutes / 60).toFixed(4),
    multiplier: (Number(multiplierBasisPoints) / 10000).toFixed(4),
    amount: formatCents(amountCents),
    formula: '((basic_pay * 12 / 365) / 8) * payable_hours * multiplier',
  };
};

const timeToMinutes = (value, fieldName) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!match) throw new Error(`${fieldName} must use HH:MM 24-hour time.`);
  return Number(match[1]) * 60 + Number(match[2]);
};

const alignAfter = (value, anchor) => (value <= anchor ? value + 1440 : value);
const alignNearStart = (value, start) => (value < start - 720 ? value + 1440 : value);

const calculatePayableMinutes = ({
  workdayClassification = 'OFFICE_DAY',
  approvedStart,
  approvedEnd,
  actualIn,
  actualOut,
  unpaidBreakMinutes = 0,
}) => {
  if (!approvedStart || !approvedEnd || !actualIn || !actualOut) {
    return { payableMinutes: 0, reason: 'MISSING_REQUIRED_TIME' };
  }
  const approvedStartMinutes = timeToMinutes(approvedStart, 'Approved start');
  const actualInRaw = timeToMinutes(actualIn, 'Actual OT IN');
  const actualInMinutes = alignNearStart(actualInRaw, approvedStartMinutes);
  const approvedEndMinutes = alignAfter(timeToMinutes(approvedEnd, 'Approved end'), approvedStartMinutes);
  const actualOutMinutes = alignAfter(timeToMinutes(actualOut, 'Actual OT OUT'), actualInRaw);
  const threshold = workdayClassification === 'OFFICE_DAY'
    ? timeToMinutes(OFFICE_OT_START, 'Office OT threshold')
    : approvedStartMinutes;
  const acceptedStart = Math.max(threshold, approvedStartMinutes, actualInMinutes);
  const acceptedEnd = Math.min(approvedEndMinutes, actualOutMinutes);
  const breaks = Number(unpaidBreakMinutes);
  if (!Number.isInteger(breaks) || breaks < 0 || breaks > 720) {
    throw new Error('Unpaid break must be whole minutes from 0 to 720.');
  }
  const payableMinutes = Math.max(0, acceptedEnd - acceptedStart - breaks);
  return {
    payableMinutes,
    acceptedStartMinutes: acceptedStart,
    acceptedEndMinutes: acceptedEnd,
    reason: payableMinutes > 0 ? 'PAYABLE' : 'NO_SUPPORTED_INTERVAL',
  };
};

// ============================================================
// [DB] READINESS CHECKS — no automatic schema mutation.
// ============================================================
const payrollSchemaReady = async () => {
  const placeholders = REQUIRED_TABLES.map(() => '?').join(',');
  const row = await db.queryOne(
    `SELECT COUNT(*) table_count
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
    REQUIRED_TABLES
  );
  return Number(row?.table_count || 0) === REQUIRED_TABLES.length;
};

const cleanText = (value, maxLength) => {
  const valueText = String(value ?? '').trim();
  return valueText.length <= maxLength ? valueText : '';
};

const isIsoDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
};

const isLocalDateTime = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  return Boolean(match && isIsoDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59);
};

const parseNonnegativeMoneyToCents = (value) => {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Amount must be zero or greater with up to two decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};

const parsePercentToUnits = (value) => {
  const text = String(value ?? '0').trim();
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(text)) {
    throw new Error('Percentage must use up to four decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const units = BigInt(whole) * 10000n + BigInt((fraction + '0000').slice(0, 4));
  if (units < 0n || units > 1000000n) throw new Error('Percentage must be from 0 to 100.');
  return units;
};

const calculatePercentageAmount = (amount, percentage) => {
  const base = parseNonnegativeMoneyToCents(amount);
  const units = parsePercentToUnits(percentage);
  return formatCents((base * units + 500000n) / 1000000n);
};

const prorateAmount = (amount, factor) => {
  const factorNumber = Number(factor);
  if (!Number.isFinite(factorNumber) || factorNumber < 0 || factorNumber > 1) {
    throw new Error('Proration factor must be from 0 to 1.');
  }
  const factorUnits = BigInt(Math.round(factorNumber * 10000));
  const amountCents = parseNonnegativeMoneyToCents(amount);
  return formatCents((amountCents * factorUnits + 5000n) / 10000n);
};

const componentCode = (value) => cleanText(value, 40).toUpperCase();
const validComponentCode = (value) => /^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(value);
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const hashRegister = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const EMPLOYEE_HR_TABLE = 'payroll_employee_hr_profiles';
const EMPLOYMENT_TYPES = ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CASUAL', 'PROJECT_BASED'];
const EMPLOYMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'RESIGNED', 'RETIRED', 'SUSPENDED'];
const normalizeDigits = (value) => String(value ?? '').replace(/\D/g, '');
const maskIdentifier = (value) => {
  const text = String(value ?? '');
  if (!text) return '';
  const visible = Math.min(4, text.length);
  return `${'•'.repeat(text.length - visible)}${text.slice(-visible)}`;
};
const employeeHrSchemaReady = async () => {
  const row = await db.queryOne(
    'SELECT COUNT(*) table_count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',
    [EMPLOYEE_HR_TABLE]
  );
  return Number(row?.table_count || 0) === 1;
};
const validateEmployeeProfileInput = (body = {}) => {
  const value = {
    name: cleanText(body.name, 255),
    position: cleanText(body.position, 255),
    department: cleanText(body.department, 255),
    bioUID: cleanText(body.bioUID, 255),
    email: cleanText(body.email, 255),
    mobileNumber: cleanText(body.mobileNumber, 20),
    address: cleanText(body.address, 2000),
    area: cleanText(body.area, 255),
    employmentDate: cleanText(body.employmentDate, 10),
    employmentType: cleanText(body.employmentType, 30).toUpperCase(),
    employmentStatus: cleanText(body.employmentStatus || 'ACTIVE', 20).toUpperCase(),
    supervisor: cleanText(body.supervisor, 120),
    tin: normalizeDigits(body.tin),
    sssNumber: normalizeDigits(body.sssNumber),
    philhealthNumber: normalizeDigits(body.philhealthNumber),
    pagibigNumber: normalizeDigits(body.pagibigNumber),
    nationalId: normalizeDigits(body.nationalId),
    payrollId: cleanText(body.payrollId, 40).toUpperCase(),
    bankName: cleanText(body.bankName, 120),
    bankAccountName: cleanText(body.bankAccountName, 120),
    bankAccountNumber: cleanText(body.bankAccountNumber, 40).replace(/[\s-]/g, '').toUpperCase(),
  };
  if (!value.name || !value.position || !value.department || !value.bioUID) {
    return { ok: false, message: 'Employee name, position, department, and biometric ID are required.' };
  }
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return { ok: false, message: 'Enter a valid email address.' };
  if (value.mobileNumber && !/^[0-9+() -]{7,20}$/.test(value.mobileNumber)) return { ok: false, message: 'Enter a valid mobile number.' };
  if (value.employmentDate && !isIsoDate(value.employmentDate)) return { ok: false, message: 'Enter a valid employment date.' };
  if (value.employmentType && !EMPLOYMENT_TYPES.includes(value.employmentType)) return { ok: false, message: 'Select a valid employment type.' };
  if (!EMPLOYMENT_STATUSES.includes(value.employmentStatus)) return { ok: false, message: 'Select a valid employment status.' };
  const idRules = [
    ['TIN', value.tin, /^\d{9,15}$/],
    ['SSS number', value.sssNumber, /^\d{10}$/],
    ['PhilHealth number', value.philhealthNumber, /^\d{12}$/],
    ['Pag-IBIG number', value.pagibigNumber, /^\d{12}$/],
    ['National ID', value.nationalId, /^\d{12,20}$/],
    ['Payroll ID', value.payrollId, /^[A-Z0-9][A-Z0-9_-]{1,39}$/],
    ['Bank account number', value.bankAccountNumber, /^[A-Z0-9]{5,30}$/],
  ];
  const invalid = idRules.find(([, field, pattern]) => field && !pattern.test(field));
  return invalid ? { ok: false, message: `${invalid[0]} has an invalid format.` } : { ok: true, value };
};
const profileIdentifier = (value) => ({ configured: Boolean(value), masked: maskIdentifier(value) });
const shapeEmployeeProfile = (row, audit = []) => ({
  usercode: row.usercode,
  name: row.name || '',
  position: row.position || '',
  department: row.department || '',
  bioUID: row.bioUID || '',
  mobileNumber: row.mobile_number || '',
  address: row.address || '',
  email: row.emailadd || '',
  area: row.area || '',
  employmentDate: row.employmentdate ? String(row.employmentdate).slice(0, 10) : '',
  employmentType: row.employment_type || '',
  employmentStatus: row.employment_status || 'ACTIVE',
  supervisor: row.supervisor || '',
  identifiers: {
    tin: profileIdentifier(row.tin),
    sss: profileIdentifier(row.sss_number),
    philhealth: profileIdentifier(row.philhealth_number),
    pagibig: profileIdentifier(row.pagibig_number),
    nationalId: profileIdentifier(row.national_id),
    payrollId: profileIdentifier(row.payroll_id),
  },
  bank: {
    name: row.bank_name || '',
    accountName: row.bank_account_name || '',
    accountNumber: profileIdentifier(row.bank_account_number),
  },
  audit,
});

const readEmployeeProfile = async (usercode) => {
  const row = await db.queryOne(`SELECT u.usercode,u.name,u.position,u.department,u.bioUID,u.mobile_number,
    u.address,u.emailadd,u.area,u.employmentdate,h.tin,h.sss_number,h.philhealth_number,h.pagibig_number,
    h.national_id,h.payroll_id,h.bank_name,h.bank_account_name,h.bank_account_number,h.employment_type,
    h.employment_status,h.supervisor
    FROM usertb u LEFT JOIN payroll_employee_hr_profiles h ON h.usercode=u.usercode
    WHERE u.usercode=? LIMIT 1`, [usercode]);
  if (!row) return null;
  const auditRows = await db.queryAll(`SELECT actor_usercode,action_type,details_json,created_at FROM payroll_audit_log
    WHERE entity_type='EMPLOYEE_HR_PROFILE' AND entity_key=? ORDER BY id DESC LIMIT 15`, [usercode]);
  const audit = auditRows.map((item) => {
    let details = {};
    try { details = JSON.parse(item.details_json || '{}'); } catch (_error) { details = {}; }
    return { actor: item.actor_usercode, action: item.action_type, changes: details.changes || [], createdAt: item.created_at };
  });
  return shapeEmployeeProfile(row, audit);
};

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'payroll-foundation', phase: 2 });
});

router.get('/foundation', async (_req, res, next) => {
  try {
    const employee = await db.queryOne(
      `SELECT COUNT(*) employees,
              SUM(usercode IS NULL OR TRIM(usercode) = '') missing_usercode,
              SUM(bioUID IS NULL OR TRIM(bioUID) = '') missing_bio,
              SUM(basic IS NOT NULL AND basic > 0) legacy_salary_rows
         FROM usertb`
    );
    const schedule = await db.queryOne(`SELECT
      (SELECT COUNT(*) FROM stschedule)+(SELECT COUNT(*) FROM payroll_employee_schedules) schedules`);
    const schemaReady = await payrollSchemaReady();
    let configuredSalaries = 0;
    let overtimeRates = FALLBACK_RATES;
    if (schemaReady) {
      const salary = await db.queryOne(
        'SELECT COUNT(DISTINCT usercode) configured FROM payroll_compensation_history'
      );
      configuredSalaries = Number(salary?.configured || 0);
      overtimeRates = await db.queryAll(
        `SELECT rate_code, label, multiplier, is_enabled, requires_confirmation
           FROM payroll_overtime_rates
          ORDER BY display_order, rate_code`
      );
    }
    return res.json({
      ok: true,
      schemaReady,
      metrics: {
        employees: Number(employee?.employees || 0),
        missingUsercode: Number(employee?.missing_usercode || 0),
        missingBio: Number(employee?.missing_bio || 0),
        legacySalaryRows: Number(employee?.legacy_salary_rows || 0),
        configuredSalaries,
        schedules: Number(schedule?.schedules || 0),
      },
      overtimeRates,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/employees', async (req, res, next) => {
  try {
    const search = cleanText(req.query?.q, 80);
    const schemaReady = await payrollSchemaReady();
    const like = `%${search}%`;
    const where = search
      ? 'WHERE u.usercode LIKE ? OR u.name LIKE ? OR u.department LIKE ? OR u.position LIKE ?'
      : '';
    const params = search ? [like, like, like, like] : [];
    const joins = schemaReady
      ? `LEFT JOIN payroll_employee_profiles p ON p.usercode = u.usercode
         LEFT JOIN payroll_compensation_history c ON c.id = (
           SELECT c2.id FROM payroll_compensation_history c2
            WHERE c2.usercode = u.usercode AND c2.effective_date <= CURRENT_DATE()
            ORDER BY c2.effective_date DESC, c2.id DESC LIMIT 1
         )`
      : '';
    const configuredFields = schemaReady
      ? 'p.payroll_group, p.pay_basis, COALESCE(c.basic_monthly, u.basic) basic_monthly, c.effective_date,'
      : 'NULL payroll_group, NULL pay_basis, u.basic basic_monthly, NULL effective_date,';
    const rows = await db.queryAll(
      `SELECT u.usercode, u.name, u.position, u.department,
              ${configuredFields}
              CASE
                WHEN u.usercode IS NULL OR TRIM(u.usercode) = '' THEN 'MISSING CODE'
                WHEN ${schemaReady ? 'c.id IS NULL AND (u.basic IS NULL OR u.basic <= 0)' : 'u.basic IS NULL OR u.basic <= 0'} THEN 'NEEDS SALARY'
                ELSE 'READY'
              END readiness
         FROM usertb u
         ${joins}
         ${where}
        ORDER BY u.name
        LIMIT ${MAX_SEARCH_ROWS}`,
      params
    );
    return res.json({ ok: true, items: rows, schemaReady });
  } catch (error) {
    return next(error);
  }
});

router.get('/employees/:usercode/profile', async (req, res, next) => {
  try {
    const usercode = cleanText(req.params.usercode, 191).toUpperCase();
    if (!usercode) return res.status(422).json({ ok: false, message: 'Select a valid employee.' });
    if (!await employeeHrSchemaReady()) return res.status(409).json({ ok: false, message: 'Apply the employee HR profile schema first.' });
    const profile = await readEmployeeProfile(usercode);
    if (!profile) return res.status(404).json({ ok: false, message: 'Employee was not found.' });
    return res.json({ ok: true, profile });
  } catch (error) { return next(error); }
});

router.patch('/employees/:usercode/profile', async (req, res, next) => {
  const usercode = cleanText(req.params.usercode, 191).toUpperCase();
  const validated = validateEmployeeProfileInput(req.body || {});
  if (!usercode || !validated.ok) return res.status(422).json({ ok: false, message: validated.message || 'Select a valid employee.' });

  const value = validated.value;
  const sensitive = [
    ['tin', 'tin', value.tin], ['sss_number', 'sssNumber', value.sssNumber],
    ['philhealth_number', 'philhealthNumber', value.philhealthNumber],
    ['pagibig_number', 'pagibigNumber', value.pagibigNumber], ['national_id', 'nationalId', value.nationalId],
    ['payroll_id', 'payrollId', value.payrollId], ['bank_account_number', 'bankAccountNumber', value.bankAccountNumber],
  ];
  let connection;
  try {
    if (!await employeeHrSchemaReady()) return res.status(409).json({ ok: false, message: 'Apply the employee HR profile schema first.' });
    const before = await db.queryOne(`SELECT u.usercode,u.name,u.position,u.department,u.bioUID,u.mobile_number,
      u.address,u.emailadd,u.area,u.employmentdate,h.* FROM usertb u
      LEFT JOIN payroll_employee_hr_profiles h ON h.usercode=u.usercode WHERE u.usercode=? LIMIT 1`, [usercode]);
    if (!before) return res.status(404).json({ ok: false, message: 'Employee was not found.' });
    const duplicateBio = await db.queryOne('SELECT usercode FROM usertb WHERE bioUID=? AND usercode<>? LIMIT 1', [value.bioUID, usercode]);
    if (duplicateBio) return res.status(409).json({ ok: false, message: 'Biometric ID is already assigned to another employee.' });
    for (const [column, , fieldValue] of sensitive) {
      if (!fieldValue) continue;
      const duplicate = await db.queryOne(`SELECT usercode FROM payroll_employee_hr_profiles WHERE ${column}=? AND usercode<>? LIMIT 1`, [fieldValue, usercode]);
      if (duplicate) return res.status(409).json({ ok: false, message: 'One of the supplied IDs is already assigned to another employee.' });
    }

    const regularChanges = [
      ['name', before.name, value.name], ['position', before.position, value.position],
      ['department', before.department, value.department], ['bioUID', before.bioUID, value.bioUID],
      ['mobileNumber', before.mobile_number, value.mobileNumber], ['address', before.address, value.address],
      ['email', before.emailadd, value.email], ['area', before.area, value.area],
      ['employmentDate', before.employmentdate ? String(before.employmentdate).slice(0, 10) : '', value.employmentDate],
      ['employmentType', before.employment_type, value.employmentType],
      ['employmentStatus', before.employment_status || 'ACTIVE', value.employmentStatus],
      ['supervisor', before.supervisor, value.supervisor], ['bankName', before.bank_name, value.bankName],
      ['bankAccountName', before.bank_account_name, value.bankAccountName],
    ].filter(([, oldValue, newValue]) => String(oldValue || '') !== String(newValue || ''))
      .map(([field, oldValue, newValue]) => ({ field, from: String(oldValue || ''), to: String(newValue || '') }));
    const sensitiveChanges = sensitive.filter(([column, , fieldValue]) => fieldValue && String(before[column] || '') !== fieldValue)
      .map(([column, field, fieldValue]) => ({ field, from: maskIdentifier(before[column]), to: maskIdentifier(fieldValue) }));
    const changes = [...regularChanges, ...sensitiveChanges];
    if (!changes.length) return res.json({ ok: true, message: 'No employee changes were needed.', profile: await readEmployeeProfile(usercode) });

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.execute(`UPDATE usertb SET name=?,position=?,department=?,bioUID=?,mobile_number=?,address=?,emailadd=?,area=?,employmentdate=?
      WHERE usercode=?`, [value.name, value.position, value.department, value.bioUID, value.mobileNumber || null,
      value.address || null, value.email || null, value.area || null, value.employmentDate || null, usercode]);
    await connection.execute(`INSERT INTO payroll_employee_hr_profiles
      (usercode,tin,sss_number,philhealth_number,pagibig_number,national_id,payroll_id,bank_name,bank_account_name,
       bank_account_number,employment_type,employment_status,supervisor,created_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE tin=COALESCE(NULLIF(VALUES(tin),''),tin),
       sss_number=COALESCE(NULLIF(VALUES(sss_number),''),sss_number),
       philhealth_number=COALESCE(NULLIF(VALUES(philhealth_number),''),philhealth_number),
       pagibig_number=COALESCE(NULLIF(VALUES(pagibig_number),''),pagibig_number),
       national_id=COALESCE(NULLIF(VALUES(national_id),''),national_id),payroll_id=COALESCE(NULLIF(VALUES(payroll_id),''),payroll_id),
       bank_name=VALUES(bank_name),bank_account_name=VALUES(bank_account_name),
       bank_account_number=COALESCE(NULLIF(VALUES(bank_account_number),''),bank_account_number),
       employment_type=VALUES(employment_type),employment_status=VALUES(employment_status),supervisor=VALUES(supervisor),
       updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`, [usercode, value.tin || null, value.sssNumber || null,
      value.philhealthNumber || null, value.pagibigNumber || null, value.nationalId || null, value.payrollId || null,
      value.bankName || null, value.bankAccountName || null, value.bankAccountNumber || null, value.employmentType || null,
      value.employmentStatus, value.supervisor || null, req.user.usercode, req.user.usercode]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json) VALUES (?,'UPDATE','EMPLOYEE_HR_PROFILE',?,?)`,
    [req.user.usercode, usercode, JSON.stringify({ changes })]);
    await connection.commit();
    return res.json({ ok: true, message: 'Employee HR details saved.', profile: await readEmployeeProfile(usercode) });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'One of the supplied IDs is already assigned.' });
    return next(error);
  } finally { connection?.release(); }
});

router.post('/compensation', async (req, res, next) => {
  const usercode = cleanText(req.body?.usercode, 255).toUpperCase();
  const payrollGroup = cleanText(req.body?.payrollGroup || 'REGULAR', 40).toUpperCase();
  const payBasis = cleanText(req.body?.payBasis || 'MONTHLY', 20).toUpperCase();
  const effectiveDate = cleanText(req.body?.effectiveDate, 10);
  const reason = cleanText(req.body?.reason, 255);
  if (!usercode || !isIsoDate(effectiveDate) || !reason || !['MONTHLY', 'DAILY', 'HOURLY'].includes(payBasis)) {
    return res.status(422).json({ ok: false, message: 'Complete the employee, date, pay basis, and reason.' });
  }

  let basicPay;
  try {
    basicPay = formatCents(parseMoneyToCents(req.body?.basicPay));
  } catch (error) {
    return res.status(422).json({ ok: false, message: error.message });
  }

  let connection;
  try {
    if (!await payrollSchemaReady()) {
      return res.status(409).json({ ok: false, message: 'Apply the reviewed Phase 2 payroll schema first.' });
    }
    const employee = await db.queryOne('SELECT usercode FROM usertb WHERE usercode = ? LIMIT 1', [usercode]);
    if (!employee) return res.status(404).json({ ok: false, message: 'Employee code was not found.' });

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO payroll_employee_profiles
        (usercode, payroll_group, pay_basis, is_active, created_by, updated_by)
       VALUES (?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE payroll_group=VALUES(payroll_group),
         pay_basis=VALUES(pay_basis), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
      [usercode, payrollGroup, payBasis, req.user.usercode, req.user.usercode]
    );
    const [result] = await connection.execute(
      `INSERT INTO payroll_compensation_history
        (usercode, effective_date, basic_monthly, reason, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [usercode, effectiveDate, basicPay, reason, req.user.usercode]
    );
    await connection.execute(
      `INSERT INTO payroll_audit_log
        (actor_usercode, action_type, entity_type, entity_key, details_json)
       VALUES (?, 'CREATE', 'COMPENSATION', ?, ?)`,
      [
        req.user.usercode,
        String(result.insertId),
        JSON.stringify({ usercode, effectiveDate, payrollGroup, payBasis, reason }),
      ]
    );
    await connection.commit();
    return res.status(201).json({ ok: true, message: 'Compensation history saved.' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A salary entry already exists for that effective date.' });
    }
    return next(error);
  } finally {
    connection?.release();
  }
});

router.post('/calculate/ot', (req, res) => {
  try {
    const window = calculatePayableMinutes(req.body || {});
    const calculation = window.payableMinutes > 0
      ? calculateOvertime({
        basicPay: req.body?.basicPay,
        payableMinutes: window.payableMinutes,
        multiplier: req.body?.multiplier,
      })
      : null;
    return res.json({ ok: true, window, calculation });
  } catch (error) {
    return res.status(422).json({ ok: false, message: error.message });
  }
});

// ============================================================
// [PHASE 4] SALARY IMPORT AND SCHEDULE MASTER
// ============================================================
router.post('/salaries/import', async (req, res, next) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 500) : [];
  const sourceName = cleanText(req.body?.sourceName || 'salary-import.csv', 160);
  if (!rows.length) return res.status(422).json({ ok: false, message: 'No salary rows were supplied.' });
  const accepted = []; const rejected = [];
  for (const [index, row] of rows.entries()) {
    const usercode = cleanText(row.usercode, 64).toUpperCase();
    const effectiveDate = cleanText(row.effectiveDate, 10);
    const reason = cleanText(row.reason || 'Bulk salary import', 255);
    try {
      const basicPay = formatCents(parseMoneyToCents(row.basicPay));
      if (!usercode || !isIsoDate(effectiveDate)) throw new Error('Invalid employee code or effective date.');
      accepted.push({ usercode, effectiveDate, basicPay, reason });
    } catch (error) { rejected.push({ row: index + 2, usercode, message: error.message }); }
  }
  if (rejected.length) return res.status(422).json({ ok: false, message: 'Import validation failed. Nothing was saved.', rejected });
  const known = await db.queryAll(`SELECT usercode FROM usertb WHERE usercode IN (${accepted.map(() => '?').join(',')})`, accepted.map(r => r.usercode));
  const knownSet = new Set(known.map(r => String(r.usercode).toUpperCase()));
  accepted.forEach((row, index) => { if (!knownSet.has(row.usercode)) rejected.push({ row: index + 2, usercode: row.usercode, message: 'Employee not found.' }); });
  if (rejected.length) return res.status(422).json({ ok: false, message: 'Unknown employees found. Nothing was saved.', rejected });
  let connection;
  try {
    connection = await db.getConnection(); await connection.beginTransaction();
    for (const row of accepted) {
      await connection.execute(`INSERT INTO payroll_employee_profiles
        (usercode,payroll_group,pay_basis,is_active,created_by,updated_by) VALUES (?,'REGULAR','MONTHLY',1,?,?)
        ON DUPLICATE KEY UPDATE updated_by=VALUES(updated_by),updated_at=NOW()`, [row.usercode, req.user.usercode, req.user.usercode]);
      await connection.execute(`INSERT INTO payroll_compensation_history
        (usercode,effective_date,basic_monthly,reason,created_by) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE basic_monthly=VALUES(basic_monthly),reason=VALUES(reason),created_by=VALUES(created_by)`,
      [row.usercode,row.effectiveDate,row.basicPay,row.reason,req.user.usercode]);
    }
    await connection.execute(`INSERT INTO payroll_import_batches
      (import_type,source_name,row_count,accepted_count,rejected_count,details_json,created_by)
      VALUES ('SALARY',?,?,?,?,?,?)`,[sourceName,rows.length,accepted.length,0,JSON.stringify({effectiveDates:[...new Set(accepted.map(r=>r.effectiveDate))]}),req.user.usercode]);
    await connection.commit();
    return res.json({ ok:true,message:`Imported ${accepted.length} salary rows.`,acceptedCount:accepted.length });
  } catch(error){if(connection)await connection.rollback();return next(error);} finally{connection?.release();}
});

router.get('/schedules', async (_req,res,next)=>{
  try{
    const templates=await db.queryAll('SELECT * FROM payroll_schedule_templates ORDER BY template_name');
    const assigned=await db.queryOne('SELECT COUNT(DISTINCT usercode) total FROM payroll_employee_schedules WHERE effective_to IS NULL OR effective_to>=CURRENT_DATE()');
    return res.json({ok:true,templates,assignedEmployees:Number(assigned?.total||0)});
  }catch(error){return next(error);}
});

router.post('/schedules/templates', async (req,res,next)=>{
  try{
    const code=cleanText(req.body?.templateCode,40).toUpperCase(); const name=cleanText(req.body?.templateName,120);
    const start=cleanText(req.body?.workStart,5); const end=cleanText(req.body?.workEnd,5);
    const breaks=Number(req.body?.breakMinutes); const days=cleanText(req.body?.workDays||'1,2,3,4,5',40);
    timeToMinutes(start,'Work start'); timeToMinutes(end,'Work end');
    if(!code||!name||!Number.isInteger(breaks)||breaks<0||breaks>240||!/^([1-7],?)+$/.test(days))
      return res.status(422).json({ok:false,message:'Complete a valid schedule template.'});
    await db.execute(`INSERT INTO payroll_schedule_templates
      (template_code,template_name,work_start,work_end,break_minutes,work_days,created_by) VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE template_name=VALUES(template_name),work_start=VALUES(work_start),
      work_end=VALUES(work_end),break_minutes=VALUES(break_minutes),work_days=VALUES(work_days)`,
    [code,name,start,end,breaks,days,req.user.usercode]);
    return res.json({ok:true,message:'Schedule template saved.'});
  }catch(error){return next(error);}
});

router.post('/schedules/assign', async (req,res,next)=>{
  try{
    const codes=[...new Set((Array.isArray(req.body?.usercodes)?req.body.usercodes:[]).map(v=>cleanText(v,64).toUpperCase()).filter(Boolean))].slice(0,500);
    const templateId=Number(req.body?.templateId); const effectiveFrom=cleanText(req.body?.effectiveFrom,10);
    if(!codes.length||!Number.isInteger(templateId)||!isIsoDate(effectiveFrom)) return res.status(422).json({ok:false,message:'Select a template, employees, and effective date.'});
    const template=await db.queryOne('SELECT id FROM payroll_schedule_templates WHERE id=?',[templateId]);
    if(!template)return res.status(404).json({ok:false,message:'Schedule template not found.'});
    for(const usercode of codes) await db.execute(`INSERT INTO payroll_employee_schedules
      (usercode,template_id,effective_from,created_by) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE template_id=VALUES(template_id),created_by=VALUES(created_by)`,
    [usercode,templateId,effectiveFrom,req.user.usercode]);
    return res.json({ok:true,message:`Assigned ${codes.length} employees.`});
  }catch(error){return next(error);}
});

// ============================================================
// [PHASE 5] EARNINGS, DEDUCTIONS, LOANS, AND ADJUSTMENTS
// ============================================================
const PHASE5_TABLES = [
  'payroll_components',
  'payroll_employee_components',
  'payroll_loans',
  'payroll_statutory_rules',
  'payroll_run_adjustments',
];

const phase5Ready = async () => {
  const placeholders = PHASE5_TABLES.map(() => '?').join(',');
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (${placeholders})`, PHASE5_TABLES);
  return Number(row?.total || 0) === PHASE5_TABLES.length;
};

router.get('/phase5/master-data', async (_req, res, next) => {
  try {
    if (!await phase5Ready()) {
      return res.json({ ok: true, schemaReady: false, components: [], assignments: [], loans: [], statutoryRules: [] });
    }
    const [components, assignments, loans, statutoryRules] = await Promise.all([
      db.queryAll(`SELECT id,component_code,component_name,component_type,amount_mode,is_statutory,is_taxable,is_active
        FROM payroll_components ORDER BY component_type,component_name`),
      db.queryAll(`SELECT a.id,a.usercode,a.amount,a.effective_from,a.effective_to,
          c.component_code,c.component_name,c.component_type,c.amount_mode
        FROM payroll_employee_components a JOIN payroll_components c ON c.id=a.component_id
        ORDER BY a.id DESC LIMIT 100`),
      db.queryAll(`SELECT id,usercode,loan_code,lender,original_amount,balance,installment_amount,effective_from,status
        FROM payroll_loans ORDER BY id DESC LIMIT 100`),
      db.queryAll(`SELECT r.id,r.component_id,r.rule_code,r.effective_from,r.effective_to,r.salary_from,r.salary_to,
          r.fixed_amount,r.rate_percent,c.component_code,c.component_name
        FROM payroll_statutory_rules r JOIN payroll_components c ON c.id=r.component_id
        ORDER BY c.component_code,r.effective_from DESC,r.salary_from LIMIT 200`),
    ]);
    return res.json({ ok: true, schemaReady: true, components, assignments, loans, statutoryRules });
  } catch (error) { return next(error); }
});

router.post('/components', async (req, res, next) => {
  try {
    if (!await phase5Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 5 payroll schema first.' });
    const code = componentCode(req.body?.componentCode);
    const name = cleanText(req.body?.componentName, 120);
    const type = cleanText(req.body?.componentType, 20).toUpperCase();
    const amountMode = cleanText(req.body?.amountMode || 'FIXED_PER_RUN', 30).toUpperCase();
    const isStatutory = req.body?.isStatutory ? 1 : 0;
    const isTaxable = req.body?.isTaxable ? 1 : 0;
    if (!validComponentCode(code) || !name || !['EARNING', 'DEDUCTION'].includes(type)
      || !['FIXED_PER_RUN', 'MONTHLY_PRORATED'].includes(amountMode)
      || (isStatutory && type !== 'DEDUCTION')) {
      return res.status(422).json({ ok: false, message: 'Enter a valid component code, name, type, and amount mode.' });
    }
    await db.execute(`INSERT INTO payroll_components
      (component_code,component_name,component_type,amount_mode,is_statutory,is_taxable,created_by)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE component_name=VALUES(component_name),
      component_type=VALUES(component_type),amount_mode=VALUES(amount_mode),is_statutory=VALUES(is_statutory),
      is_taxable=VALUES(is_taxable),is_active=1,updated_at=NOW()`,
    [code, name, type, amountMode, isStatutory, isTaxable, req.user.usercode]);
    return res.json({ ok: true, message: 'Payroll component saved.' });
  } catch (error) { return next(error); }
});

router.post('/components/assign', async (req, res, next) => {
  try {
    if (!await phase5Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 5 payroll schema first.' });
    const usercode = cleanText(req.body?.usercode, 64).toUpperCase();
    const componentId = Number(req.body?.componentId);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    const effectiveTo = cleanText(req.body?.effectiveTo, 10);
    let amount;
    try { amount = formatCents(parseMoneyToCents(req.body?.amount)); }
    catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    if (!usercode || !Number.isInteger(componentId) || !isIsoDate(effectiveFrom)
      || (effectiveTo && (!isIsoDate(effectiveTo) || effectiveTo < effectiveFrom))) {
      return res.status(422).json({ ok: false, message: 'Enter a valid employee, component, amount, and effective period.' });
    }
    const [employee, component] = await Promise.all([
      db.queryOne('SELECT usercode FROM usertb WHERE usercode=? LIMIT 1', [usercode]),
      db.queryOne('SELECT id,is_statutory FROM payroll_components WHERE id=? AND is_active=1 LIMIT 1', [componentId]),
    ]);
    if (!employee) return res.status(404).json({ ok: false, message: 'Employee code was not found.' });
    if (!component) return res.status(404).json({ ok: false, message: 'Payroll component was not found.' });
    if (component.is_statutory) return res.status(422).json({ ok: false, message: 'Statutory components use effective-dated bracket rules.' });
    await db.execute(`INSERT INTO payroll_employee_components
      (usercode,component_id,amount,effective_from,effective_to,created_by) VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE amount=VALUES(amount),effective_to=VALUES(effective_to),created_by=VALUES(created_by)`,
    [usercode, componentId, amount, effectiveFrom, effectiveTo || null, req.user.usercode]);
    return res.json({ ok: true, message: 'Employee component assigned.' });
  } catch (error) { return next(error); }
});

router.post('/loans', async (req, res, next) => {
  try {
    if (!await phase5Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 5 payroll schema first.' });
    const usercode = cleanText(req.body?.usercode, 64).toUpperCase();
    const loanCode = componentCode(req.body?.loanCode);
    const lender = cleanText(req.body?.lender, 120);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    let originalAmount; let installmentAmount;
    try {
      originalAmount = formatCents(parseMoneyToCents(req.body?.originalAmount));
      installmentAmount = formatCents(parseMoneyToCents(req.body?.installmentAmount));
    } catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    if (!usercode || !validComponentCode(loanCode) || !lender || !isIsoDate(effectiveFrom)
      || parseNonnegativeMoneyToCents(installmentAmount) > parseNonnegativeMoneyToCents(originalAmount)) {
      return res.status(422).json({ ok: false, message: 'Enter a valid employee, loan, amounts, and effective date.' });
    }
    const employee = await db.queryOne('SELECT usercode FROM usertb WHERE usercode=? LIMIT 1', [usercode]);
    if (!employee) return res.status(404).json({ ok: false, message: 'Employee code was not found.' });
    await db.execute(`INSERT INTO payroll_loans
      (usercode,loan_code,lender,original_amount,balance,installment_amount,effective_from,created_by)
      VALUES (?,?,?,?,?,?,?,?)`,
    [usercode, loanCode, lender, originalAmount, originalAmount, installmentAmount, effectiveFrom, req.user.usercode]);
    return res.status(201).json({ ok: true, message: 'Employee loan saved.' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'That employee loan code already exists.' });
    return next(error);
  }
});

router.post('/statutory-rules', async (req, res, next) => {
  try {
    if (!await phase5Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 5 payroll schema first.' });
    const componentId = Number(req.body?.componentId);
    const ruleCode = componentCode(req.body?.ruleCode);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    const effectiveTo = cleanText(req.body?.effectiveTo, 10);
    let salaryFrom; let salaryTo; let fixedAmount; let ratePercent;
    try {
      salaryFrom = formatCents(parseNonnegativeMoneyToCents(req.body?.salaryFrom || '0'));
      salaryTo = req.body?.salaryTo === '' || req.body?.salaryTo == null
        ? null : formatCents(parseNonnegativeMoneyToCents(req.body.salaryTo));
      fixedAmount = formatCents(parseNonnegativeMoneyToCents(req.body?.fixedAmount || '0'));
      ratePercent = (Number(parsePercentToUnits(req.body?.ratePercent || '0')) / 10000).toFixed(4);
    } catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    if (!Number.isInteger(componentId) || !validComponentCode(ruleCode) || !isIsoDate(effectiveFrom)
      || (effectiveTo && (!isIsoDate(effectiveTo) || effectiveTo < effectiveFrom))
      || (salaryTo && parseNonnegativeMoneyToCents(salaryTo) < parseNonnegativeMoneyToCents(salaryFrom))
      || (parseNonnegativeMoneyToCents(fixedAmount) === 0n && parsePercentToUnits(ratePercent) === 0n)) {
      return res.status(422).json({ ok: false, message: 'Enter a valid effective bracket with a fixed amount or percentage.' });
    }
    const component = await db.queryOne(`SELECT id FROM payroll_components
      WHERE id=? AND component_type='DEDUCTION' AND is_statutory=1 AND is_active=1 LIMIT 1`, [componentId]);
    if (!component) return res.status(404).json({ ok: false, message: 'Active statutory deduction component was not found.' });
    await db.execute(`INSERT INTO payroll_statutory_rules
      (component_id,rule_code,effective_from,effective_to,salary_from,salary_to,fixed_amount,rate_percent,created_by)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE effective_to=VALUES(effective_to),
      salary_from=VALUES(salary_from),salary_to=VALUES(salary_to),fixed_amount=VALUES(fixed_amount),
      rate_percent=VALUES(rate_percent),created_by=VALUES(created_by)`,
    [componentId, ruleCode, effectiveFrom, effectiveTo || null, salaryFrom, salaryTo, fixedAmount, ratePercent, req.user.usercode]);
    return res.json({ ok: true, message: 'Statutory bracket saved.' });
  } catch (error) { return next(error); }
});

router.post('/runs/:id/adjustments', async (req, res, next) => {
  try {
    if (!await phase5Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 5 payroll schema first.' });
    const runId = Number(req.params.id);
    const usercode = cleanText(req.body?.usercode, 64).toUpperCase();
    const code = componentCode(req.body?.componentCode);
    const type = cleanText(req.body?.componentType, 20).toUpperCase();
    const reason = cleanText(req.body?.reason, 255);
    let amount;
    try { amount = formatCents(parseMoneyToCents(req.body?.amount)); }
    catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    if (!Number.isInteger(runId) || !usercode || !validComponentCode(code)
      || !['EARNING', 'DEDUCTION'].includes(type) || !reason) {
      return res.status(422).json({ ok: false, message: 'Complete the run adjustment and audit reason.' });
    }
    const [run, employee] = await Promise.all([
      db.queryOne('SELECT status FROM payroll_runs WHERE id=? LIMIT 1', [runId]),
      db.queryOne('SELECT usercode FROM usertb WHERE usercode=? LIMIT 1', [usercode]),
    ]);
    if (!run) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (!['DRAFT', 'CALCULATED'].includes(run.status)) {
      return res.status(409).json({ ok: false, message: 'Locked, approved, or released payroll cannot receive adjustments.' });
    }
    if (!employee) return res.status(404).json({ ok: false, message: 'Employee code was not found.' });
    await db.execute(`INSERT INTO payroll_run_adjustments
      (run_id,usercode,component_code,component_type,amount,reason,created_by) VALUES (?,?,?,?,?,?,?)`,
    [runId, usercode, code, type, amount, reason, req.user.usercode]);
    return res.status(201).json({ ok: true, message: 'Run adjustment saved. Recalculate the draft to apply it.' });
  } catch (error) { return next(error); }
});

// ============================================================
// [PHASE 3] DRAFT RUNS — snapshots are recalculable until locked.
// ============================================================
const phase3Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_runs','payroll_run_employees','payroll_run_items','payroll_run_exceptions')`);
  return Number(row?.total || 0) === 4;
};
const cents = (value) => BigInt(Math.round(Number(value || 0) * 100));

// ============================================================
// [PHASE 6] APPROVAL, RELEASE, REGISTER, AND PAYSLIPS
// ============================================================
const phase6Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN ('payroll_run_approvals','payroll_run_releases')`);
  return Number(row?.total || 0) === 2;
};

const phase7Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_disbursement_batches','payroll_disbursement_items','payroll_remittance_batches')`);
  return Number(row?.total || 0) === 3;
};

const phase8Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_account_mappings','payroll_period_closures','payroll_period_journal_lines')`);
  return Number(row?.total || 0) === 3;
};

const phase9Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_parallel_tests','payroll_parallel_test_items','payroll_cutover_signoffs')`);
  return Number(row?.total || 0) === 3;
};

const phase10Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_uat_cycles','payroll_uat_cases','payroll_uat_issues','payroll_go_live_authorizations')`);
  return Number(row?.total || 0) === 4;
};

const phase11Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_production_windows','payroll_operation_checklists','payroll_operation_incidents','payroll_operation_actions')`);
  return Number(row?.total || 0) === 4;
};

const phase12Ready = async () => {
  const row = await db.queryOne(`SELECT COUNT(*) total FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN
    ('payroll_compliance_periods','payroll_compliance_reports','payroll_compliance_report_items','payroll_year_end_records')`);
  return Number(row?.total || 0) === 4;
};

const validStatusTransition = (kind, from, to) => {
  const transitions = kind === 'REMITTANCE'
    ? { PREPARED: ['REMITTED', 'FAILED'], REMITTED: ['CONFIRMED', 'FAILED'] }
    : { PREPARED: ['TRANSMITTED', 'FAILED', 'CANCELLED'], TRANSMITTED: ['CONFIRMED', 'FAILED'] };
  return Boolean(transitions[from]?.includes(to));
};

const buildJournal = async (runId, connection) => {
  const queryAll = async (sql, params) => {
    if (!connection) return db.queryAll(sql, params);
    const [rows] = await connection.execute(sql, params);
    return rows;
  };
  const runRows = await queryAll(`SELECT id,run_code,pay_date,status,net_total FROM payroll_runs WHERE id=? LIMIT 1`, [runId]);
  const run = runRows[0];
  if (!run) return null;
  const groups = await queryAll(`SELECT i.component_code,i.component_type,SUM(i.amount) amount
    FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
    WHERE e.run_id=? GROUP BY i.component_code,i.component_type ORDER BY i.component_type,i.component_code`, [runId]);
  groups.push({ component_code: 'NET_PAY', component_type: 'NET_PAY', amount: run.net_total });
  const mappings = await queryAll(`SELECT * FROM payroll_account_mappings
    WHERE is_active=1 AND effective_from<=? ORDER BY component_code,effective_from DESC,id DESC`, [run.pay_date]);
  const byCode = new Map();
  mappings.forEach((mapping) => {
    if (!byCode.has(mapping.component_code)) byCode.set(mapping.component_code, mapping);
  });
  const missing = [];
  const lines = [];
  let totalDebits = 0n;
  let totalCredits = 0n;
  for (const group of groups) {
    const mapping = byCode.get(group.component_code);
    if (!mapping || mapping.component_type !== group.component_type) {
      missing.push({ componentCode: group.component_code, componentType: group.component_type });
      continue;
    }
    const amount = parseNonnegativeMoneyToCents(group.amount);
    if (amount === 0n) continue;
    const formatted = formatCents(amount);
    lines.push({ componentCode: group.component_code, side: 'DEBIT', accountCode: mapping.debit_account_code,
      accountName: mapping.debit_account_name, debit: formatted, credit: '0.00' });
    lines.push({ componentCode: group.component_code, side: 'CREDIT', accountCode: mapping.credit_account_code,
      accountName: mapping.credit_account_name, debit: '0.00', credit: formatted });
    totalDebits += amount;
    totalCredits += amount;
  }
  return { run, lines, missing, totalDebits: formatCents(totalDebits), totalCredits: formatCents(totalCredits),
    balanced: totalDebits === totalCredits, complete: missing.length === 0 && totalDebits > 0n && totalDebits === totalCredits };
};

const loadJournalView = async (runId) => {
  const closure = await db.queryOne('SELECT * FROM payroll_period_closures WHERE run_id=? LIMIT 1', [runId]);
  if (!closure) return buildJournal(runId);
  const run = await db.queryOne('SELECT id,run_code,pay_date,status,net_total FROM payroll_runs WHERE id=? LIMIT 1', [runId]);
  const stored = await db.queryAll(`SELECT component_code,side,account_code,account_name,debit,credit
    FROM payroll_period_journal_lines WHERE closure_id=? ORDER BY line_no`, [closure.id]);
  const lines = stored.map((line) => ({ componentCode: line.component_code, side: line.side,
    accountCode: line.account_code, accountName: line.account_name,
    debit: formatCents(parseNonnegativeMoneyToCents(line.debit)),
    credit: formatCents(parseNonnegativeMoneyToCents(line.credit)) }));
  const evidenceMatches = hashRegister(lines) === closure.journal_sha256;
  const totalDebits = formatCents(parseNonnegativeMoneyToCents(closure.total_debits));
  const totalCredits = formatCents(parseNonnegativeMoneyToCents(closure.total_credits));
  return { run, lines, missing: [], totalDebits, totalCredits,
    balanced: totalDebits === totalCredits, complete: evidenceMatches && lines.length > 0,
    closed: true, closure, journalSha256: closure.journal_sha256, evidenceMatches };
};

const computeCutoverReadiness = async (testId) => {
  const [employee, salary, schedule, statutoryComponents, statutoryRules] = await Promise.all([
    db.queryOne("SELECT COUNT(*) total FROM usertb WHERE usercode IS NOT NULL AND TRIM(usercode)<>''"),
    db.queryOne('SELECT COUNT(DISTINCT usercode) total FROM payroll_compensation_history'),
    db.queryOne('SELECT COUNT(DISTINCT usercode) total FROM payroll_employee_schedules'),
    db.queryOne("SELECT COUNT(*) total FROM payroll_components WHERE is_active=1 AND is_statutory=1"),
    db.queryOne('SELECT COUNT(*) total FROM payroll_statutory_rules'),
  ]);
  const employeeCount = Number(employee?.total || 0);
  const salaryCount = Number(salary?.total || 0);
  const scheduleCount = Number(schedule?.total || 0);
  const test = Number.isInteger(testId) && testId > 0
    ? await db.queryOne('SELECT * FROM payroll_parallel_tests WHERE id=? LIMIT 1', [testId]) : null;
  const signoffs = test ? await db.queryAll(`SELECT signoff_role,signed_by,signed_at,statement
    FROM payroll_cutover_signoffs WHERE test_id=? ORDER BY signoff_role`, [test.id]) : [];
  let journalReady = false; let paymentReady = false; let closed = false;
  if (test) {
    const journal = await loadJournalView(test.run_id);
    journalReady = Boolean(journal?.complete && journal?.balanced);
    const batch = await db.queryOne(`SELECT * FROM payroll_disbursement_batches WHERE run_id=? LIMIT 1`, [test.run_id]);
    const expected = await db.queryOne(`SELECT COALESCE(SUM(i.amount),0) amount
      FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
      WHERE e.run_id=? AND i.component_type='DEDUCTION'
      AND (i.source_reference LIKE 'LOAN:%' OR i.source_reference LIKE 'STATUTORY_RULE:%')`, [test.run_id]);
    const remittances = await db.queryOne(`SELECT COUNT(*) total,SUM(status<>'CONFIRMED') pending,COALESCE(SUM(amount),0) amount
      FROM payroll_remittance_batches WHERE run_id=?`, [test.run_id]);
    const expectedAmount = parseNonnegativeMoneyToCents(expected?.amount || 0);
    paymentReady = batch?.status === 'CONFIRMED'
      && Number(remittances?.pending || 0) === 0
      && parseNonnegativeMoneyToCents(remittances?.amount || 0) === expectedAmount
      && (expectedAmount === 0n || Number(remittances?.total || 0) > 0);
    closed = Boolean(await db.queryOne('SELECT id FROM payroll_period_closures WHERE run_id=? LIMIT 1', [test.run_id]));
  }
  const gates = {
    salaryCoverage: employeeCount > 0 && salaryCount >= employeeCount,
    scheduleCoverage: employeeCount > 0 && scheduleCount >= employeeCount,
    statutoryConfigured: Number(statutoryComponents?.total || 0) > 0 && Number(statutoryRules?.total || 0) > 0,
    parallelPassed: test?.status === 'PASSED',
    journalReady,
    paymentReconciled: paymentReady,
    periodClosed: closed,
    requiredSignoffs: signoffs.length === 4,
  };
  const baseReady = Object.entries(gates).filter(([key]) => key !== 'requiredSignoffs').every(([, value]) => value);
  return { test, signoffs, employeeCount, salaryCount, scheduleCount, gates, baseReady,
    ready: baseReady && gates.requiredSignoffs };
};

const UAT_CASE_TYPES = ['PAYSLIP', 'ATTENDANCE', 'OVERTIME', 'EARNINGS', 'DEDUCTIONS',
  'ACCOUNTING', 'PAYMENT', 'SECURITY', 'BACKUP_ROLLBACK'];

const computeUatReadiness = async (cycleId) => {
  const cycle = Number.isInteger(cycleId) && cycleId > 0
    ? await db.queryOne(`SELECT c.*,t.test_code,t.run_id,r.run_code
      FROM payroll_uat_cycles c JOIN payroll_parallel_tests t ON t.id=c.test_id
      JOIN payroll_runs r ON r.id=t.run_id WHERE c.id=? LIMIT 1`, [cycleId]) : null;
  const cases = cycle ? await db.queryAll('SELECT * FROM payroll_uat_cases WHERE cycle_id=? ORDER BY case_type,case_code', [cycle.id]) : [];
  const issues = cycle ? await db.queryAll('SELECT * FROM payroll_uat_issues WHERE cycle_id=? ORDER BY status,severity,issue_code', [cycle.id]) : [];
  const authorization = cycle ? await db.queryOne('SELECT * FROM payroll_go_live_authorizations WHERE cycle_id=? LIMIT 1', [cycle.id]) : null;
  const phase9 = cycle ? await computeCutoverReadiness(cycle.test_id) : null;
  const passedTypes = new Set(cases.filter((item) => item.status === 'PASSED').map((item) => item.case_type));
  const gates = {
    phase9Approved: Boolean(phase9?.ready),
    requiredCases: UAT_CASE_TYPES.every((type) => passedTypes.has(type)),
    allCasesPassed: cases.length >= UAT_CASE_TYPES.length && cases.every((item) => item.status === 'PASSED'),
    noOpenIssues: !issues.some((item) => item.status === 'OPEN'),
    rollbackEvidence: cases.some((item) => item.case_type === 'BACKUP_ROLLBACK'
      && item.status === 'PASSED' && cleanText(item.evidence_reference, 255).length >= 3),
    authorizationRecorded: Boolean(authorization),
  };
  const baseReady = Object.entries(gates).filter(([key]) => key !== 'authorizationRecorded').every(([, value]) => value);
  return { cycle, cases, issues, authorization, phase9, requiredCaseTypes: UAT_CASE_TYPES,
    gates, baseReady, ready: baseReady && gates.authorizationRecorded };
};

const PRE_RUN_ITEMS = ['BACKUP_VERIFIED', 'ACCESS_REVIEWED', 'MASTER_DATA_FROZEN', 'RUN_CONTROL_APPROVED'];
const POST_RUN_ITEMS = ['PAYMENT_RECONCILED', 'REPORTS_ARCHIVED', 'PAYSLIPS_RELEASED', 'PERIOD_CLOSED'];

const computeOperationsReadiness = async (windowId) => {
  const window = Number.isInteger(windowId) && windowId > 0
    ? await db.queryOne(`SELECT w.*,a.authorization_code,a.cycle_id,a.scheduled_at,c.cycle_code
      FROM payroll_production_windows w JOIN payroll_go_live_authorizations a ON a.id=w.authorization_id
      JOIN payroll_uat_cycles c ON c.id=a.cycle_id WHERE w.id=? LIMIT 1`, [windowId]) : null;
  const checklists = window ? await db.queryAll(`SELECT * FROM payroll_operation_checklists
    WHERE window_id=? ORDER BY stage,item_code`, [window.id]) : [];
  const incidents = window ? await db.queryAll(`SELECT * FROM payroll_operation_incidents
    WHERE window_id=? ORDER BY status,severity,incident_code`, [window.id]) : [];
  const actions = window ? await db.queryAll(`SELECT * FROM payroll_operation_actions
    WHERE window_id=? ORDER BY status,action_type,action_code`, [window.id]) : [];
  const uat = window ? await computeUatReadiness(window.cycle_id) : null;
  const passed = (stage, code) => checklists.some((item) => item.stage === stage && item.item_code === code
    && item.status === 'PASSED' && cleanText(item.evidence_reference, 255).length >= 3);
  const gates = {
    uatAuthorized: Boolean(uat?.ready),
    preRunChecklist: PRE_RUN_ITEMS.every((code) => passed('PRE_RUN', code)),
    noOpenIncidents: !incidents.some((item) => item.status === 'OPEN'),
    postRunChecklist: POST_RUN_ITEMS.every((code) => passed('POST_RUN', code)),
    noPendingActions: !actions.some((item) => ['REQUESTED', 'APPROVED'].includes(item.status)),
    windowClosed: window?.status === 'CLOSED',
  };
  const activationReady = gates.uatAuthorized && gates.preRunChecklist && gates.noOpenIncidents;
  const closeReady = activationReady && gates.postRunChecklist && gates.noPendingActions;
  return { window, checklists, incidents, actions, uat, requiredPreRunItems: PRE_RUN_ITEMS,
    requiredPostRunItems: POST_RUN_ITEMS, gates, activationReady, closeReady,
    ready: closeReady && gates.windowClosed };
};

const computeComplianceReadiness = async (periodId) => {
  const period = Number.isInteger(periodId) && periodId > 0
    ? await db.queryOne('SELECT * FROM payroll_compliance_periods WHERE id=? LIMIT 1', [periodId]) : null;
  const reports = period ? await db.queryAll(`SELECT r.*,p.run_code,
    (SELECT COUNT(*) FROM payroll_compliance_report_items i WHERE i.report_id=r.id) item_count
    FROM payroll_compliance_reports r LEFT JOIN payroll_runs p ON p.id=r.run_id
    WHERE r.period_id=? ORDER BY r.agency,r.report_type,r.id`, [period.id]) : [];
  const yearEndRecords = period ? await db.queryAll(`SELECT * FROM payroll_year_end_records
    WHERE period_id=? ORDER BY usercode LIMIT 2000`, [period.id]) : [];
  const currentReports = reports.filter((item) => item.status !== 'AMENDED');
  const gates = {
    reportsPrepared: currentReports.length > 0,
    reportsFiled: currentReports.length > 0 && currentReports.every((item) => item.status === 'FILED'),
    yearEndGenerated: period?.period_type !== 'YEAR_END' || yearEndRecords.length > 0,
    yearEndIssued: period?.period_type !== 'YEAR_END'
      || (yearEndRecords.length > 0 && yearEndRecords.every((item) => item.status === 'ISSUED')),
    periodClosed: period?.status === 'CLOSED',
  };
  const closeReady = gates.reportsPrepared && gates.reportsFiled && gates.yearEndGenerated && gates.yearEndIssued;
  return { period, reports, yearEndRecords, gates, closeReady, ready: closeReady && gates.periodClosed };
};

const loadRegister = async (runId, connection) => {
  const queryAll = async (sql, params) => {
    if (!connection) return db.queryAll(sql, params);
    const [rows] = await connection.execute(sql, params);
    return rows;
  };
  const runRows = await queryAll(`SELECT id,run_code,cutoff_start,cutoff_end,pay_date,status,employee_count,
    gross_total,deduction_total,net_total FROM payroll_runs WHERE id=? LIMIT 1`, [runId]);
  const run = runRows[0];
  if (!run) return null;
  const employees = await queryAll(`SELECT id,usercode,employee_name,basic_monthly,basic_pay,overtime_pay,
    gross_pay,deduction_total,net_pay,status FROM payroll_run_employees WHERE run_id=?
    ORDER BY usercode,id`, [runId]);
  const items = await queryAll(`SELECT e.usercode,i.component_code,i.component_type,i.amount,i.source_reference
    FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
    WHERE e.run_id=? ORDER BY e.usercode,i.component_type,i.component_code,i.id`, [runId]);
  return { run, employees, items };
};

const registerEvidence = (register) => {
  const { status: _status, ...immutableRun } = register.run;
  return { run: immutableRun, employees: register.employees, items: register.items };
};

router.get('/phase6/readiness', async (_req, res, next) => {
  try {
    const schemaReady = await phase6Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, approved: 0, released: 0 });
    const [approved, released] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_run_approvals'),
      db.queryOne('SELECT COUNT(*) total FROM payroll_run_releases'),
    ]);
    return res.json({ ok: true, schemaReady: true, approved: Number(approved?.total || 0), released: Number(released?.total || 0) });
  } catch (error) { return next(error); }
});

router.get('/phase7/readiness', async (_req, res, next) => {
  try {
    const schemaReady = await phase7Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, disbursements: 0, confirmed: 0, remittances: 0 });
    const [disbursements, confirmed, remittances] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_disbursement_batches'),
      db.queryOne("SELECT COUNT(*) total FROM payroll_disbursement_batches WHERE status='CONFIRMED'"),
      db.queryOne('SELECT COUNT(*) total FROM payroll_remittance_batches'),
    ]);
    return res.json({ ok: true, schemaReady: true, disbursements: Number(disbursements?.total || 0),
      confirmed: Number(confirmed?.total || 0), remittances: Number(remittances?.total || 0) });
  } catch (error) { return next(error); }
});

router.get('/phase8/readiness', async (_req, res, next) => {
  try {
    const schemaReady = await phase8Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, mappings: 0, closedPeriods: 0 });
    const [mappings, closures] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_account_mappings WHERE is_active=1'),
      db.queryOne('SELECT COUNT(*) total FROM payroll_period_closures'),
    ]);
    return res.json({ ok: true, schemaReady: true, mappings: Number(mappings?.total || 0),
      closedPeriods: Number(closures?.total || 0) });
  } catch (error) { return next(error); }
});

router.get('/phase9/readiness', async (req, res, next) => {
  try {
    const schemaReady = await phase9Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, tests: 0, passedTests: 0, readiness: null });
    const testId = Number(req.query?.testId || 0);
    const [tests, passedTests, readiness] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_parallel_tests'),
      db.queryOne("SELECT COUNT(*) total FROM payroll_parallel_tests WHERE status='PASSED'"),
      computeCutoverReadiness(testId),
    ]);
    return res.json({ ok: true, schemaReady: true, tests: Number(tests?.total || 0),
      passedTests: Number(passedTests?.total || 0), readiness });
  } catch (error) { return next(error); }
});

router.get('/phase10/readiness', async (req, res, next) => {
  try {
    const schemaReady = await phase10Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, cycles: 0, authorized: 0, readiness: null });
    const cycleId = Number(req.query?.cycleId || 0);
    const [cycles, authorized, readiness] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_uat_cycles'),
      db.queryOne('SELECT COUNT(*) total FROM payroll_go_live_authorizations'),
      computeUatReadiness(cycleId),
    ]);
    return res.json({ ok: true, schemaReady: true, cycles: Number(cycles?.total || 0),
      authorized: Number(authorized?.total || 0), readiness });
  } catch (error) { return next(error); }
});

router.get('/phase11/readiness', async (req, res, next) => {
  try {
    const schemaReady = await phase11Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, windows: 0, active: 0, closed: 0, readiness: null });
    const windowId = Number(req.query?.windowId || 0);
    const [windows, active, closed, readiness] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_production_windows'),
      db.queryOne("SELECT COUNT(*) total FROM payroll_production_windows WHERE status='ACTIVE'"),
      db.queryOne("SELECT COUNT(*) total FROM payroll_production_windows WHERE status='CLOSED'"),
      computeOperationsReadiness(windowId),
    ]);
    return res.json({ ok: true, schemaReady: true, windows: Number(windows?.total || 0),
      active: Number(active?.total || 0), closed: Number(closed?.total || 0), readiness });
  } catch (error) { return next(error); }
});

router.get('/phase12/readiness', async (req, res, next) => {
  try {
    const schemaReady = await phase12Ready();
    if (!schemaReady) return res.json({ ok: true, schemaReady: false, periods: 0, filedReports: 0, closedPeriods: 0, readiness: null });
    const periodId = Number(req.query?.periodId || 0);
    const [periods, filedReports, closedPeriods, readiness] = await Promise.all([
      db.queryOne('SELECT COUNT(*) total FROM payroll_compliance_periods'),
      db.queryOne("SELECT COUNT(*) total FROM payroll_compliance_reports WHERE status='FILED'"),
      db.queryOne("SELECT COUNT(*) total FROM payroll_compliance_periods WHERE status='CLOSED'"),
      computeComplianceReadiness(periodId),
    ]);
    return res.json({ ok: true, schemaReady: true, periods: Number(periods?.total || 0),
      filedReports: Number(filedReports?.total || 0), closedPeriods: Number(closedPeriods?.total || 0), readiness });
  } catch (error) { return next(error); }
});

router.get('/runs', async (_req, res, next) => {
  try {
    if (!await phase3Ready()) return res.json({ ok: true, schemaReady: false, items: [] });
    const phase6Available = await phase6Ready();
    const items = phase6Available
      ? await db.queryAll(`SELECT r.id,r.run_code,r.cutoff_start,r.cutoff_end,r.pay_date,r.base_pay_factor,r.status,
          r.employee_count,r.exception_count,r.gross_total,r.deduction_total,r.net_total,r.created_by,r.created_at,
          a.approved_by,a.approved_at,x.release_code,x.released_by,x.released_at
          FROM payroll_runs r LEFT JOIN payroll_run_approvals a ON a.run_id=r.id
          LEFT JOIN payroll_run_releases x ON x.run_id=r.id ORDER BY r.id DESC LIMIT 30`)
      : await db.queryAll(`SELECT id,run_code,cutoff_start,cutoff_end,pay_date,base_pay_factor,status,
          employee_count,exception_count,gross_total,deduction_total,net_total,created_by,created_at
          FROM payroll_runs ORDER BY id DESC LIMIT 30`);
    return res.json({ ok: true, schemaReady: true, items });
  } catch (error) { return next(error); }
});

router.post('/runs', async (req, res, next) => {
  try {
    if (!await phase3Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 3 payroll schema first.' });
    const runCode = cleanText(req.body?.runCode, 40).toUpperCase();
    const cutoffStart = cleanText(req.body?.cutoffStart, 10);
    const cutoffEnd = cleanText(req.body?.cutoffEnd, 10);
    const payDate = cleanText(req.body?.payDate, 10);
    const factor = Number(req.body?.basePayFactor);
    if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(runCode) || !isIsoDate(cutoffStart) || !isIsoDate(cutoffEnd) || !isIsoDate(payDate)
      || cutoffStart > cutoffEnd || !Number.isFinite(factor) || factor <= 0 || factor > 1) {
      return res.status(422).json({ ok: false, message: 'Enter a valid run code, dates, and basic-pay factor from 0.0001 to 1.' });
    }
    const result = await db.execute(`INSERT INTO payroll_runs
      (run_code,cutoff_start,cutoff_end,pay_date,base_pay_factor,created_by)
      VALUES (?,?,?,?,?,?)`, [runCode, cutoffStart, cutoffEnd, payDate, factor.toFixed(4), req.user.usercode]);
    return res.status(201).json({ ok: true, id: result.insertId, message: 'Draft payroll run created.' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'Payroll run code already exists.' });
    return next(error);
  }
});

router.get('/runs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const run = await db.queryOne('SELECT * FROM payroll_runs WHERE id=? LIMIT 1', [id]);
    if (!run) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    const employees = await db.queryAll(`SELECT * FROM payroll_run_employees WHERE run_id=?
      ORDER BY status DESC,employee_name LIMIT 100`, [id]);
    const exceptions = await db.queryAll(`SELECT * FROM payroll_run_exceptions WHERE run_id=?
      ORDER BY severity,id LIMIT 200`, [id]);
    const items = await db.queryAll(`SELECT i.*,e.usercode,e.employee_name
      FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
      WHERE e.run_id=? ORDER BY e.employee_name,i.component_type,i.component_code LIMIT 1000`, [id]);
    const adjustments = await phase5Ready()
      ? db.queryAll('SELECT * FROM payroll_run_adjustments WHERE run_id=? ORDER BY id', [id])
      : [];
    const approval = await phase6Ready()
      ? db.queryOne('SELECT * FROM payroll_run_approvals WHERE run_id=? LIMIT 1', [id]) : null;
    const release = await phase6Ready()
      ? db.queryOne('SELECT * FROM payroll_run_releases WHERE run_id=? LIMIT 1', [id]) : null;
    return res.json({ ok: true, run, employees, exceptions, items, adjustments, approval, release });
  } catch (error) { return next(error); }
});

router.post('/runs/:id/calculate', async (req, res, next) => {
  let connection;
  try {
    const id = Number(req.params.id);
    const run = await db.queryOne('SELECT * FROM payroll_runs WHERE id=? LIMIT 1', [id]);
    if (!run) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (!['DRAFT', 'CALCULATED'].includes(run.status)) {
      return res.status(409).json({ ok: false, message: 'Locked, approved, or released payroll cannot be recalculated.' });
    }
    const schedule = await db.queryOne('SELECT COUNT(*) total FROM payroll_employee_schedules');
    const employees = await db.queryAll(`SELECT u.usercode,u.name,c.basic_monthly
      FROM usertb u LEFT JOIN payroll_compensation_history c ON c.id=(
        SELECT c2.id FROM payroll_compensation_history c2 WHERE c2.usercode=u.usercode
        AND c2.effective_date<=? ORDER BY c2.effective_date DESC,c2.id DESC LIMIT 1)
      WHERE u.usercode IS NOT NULL AND TRIM(u.usercode)<>'' ORDER BY u.name`, [run.cutoff_end]);
    const overtime = await db.queryAll(`SELECT usercode,SUM(hours) hours FROM overtimetb
      WHERE status=2 AND request_date BETWEEN ? AND ? GROUP BY usercode`, [run.cutoff_start, run.cutoff_end]);
    const otByUser = new Map(overtime.map((row) => [String(row.usercode).toUpperCase(), Number(row.hours || 0)]));
    // ponytail: dtr_final.daily_pay already nets out undertime+late minutes at the employee's own
    // per-minute rate (dtrService buildMonthlyRow) — reuse that instead of re-deriving undertime pay
    // from raw minutes here, so this never drifts from what the DTR module itself shows/prints.
    // finalizeRange is idempotent (INSERT IGNORE) and never touches today/future, safe to call every calculate.
    await dtrService.finalizeRange(run.cutoff_start, run.cutoff_end);
    const shortfall = await db.queryAll(`SELECT usercode,SUM(ROUND((per_hour*8)-daily_pay,2)) shortfall
      FROM dtr_final WHERE work_date BETWEEN ? AND ? GROUP BY usercode`, [run.cutoff_start, run.cutoff_end]);
    const undertimeByUser = new Map(shortfall.map((row) => [String(row.usercode).toUpperCase(), Math.max(0, Number(row.shortfall || 0))]));
    const phase5Available = await phase5Ready();
    const components = phase5Available ? await db.queryAll(`SELECT * FROM payroll_components WHERE is_active=1`) : [];
    const assignments = phase5Available ? await db.queryAll(`SELECT a.*,c.component_code,c.component_type,c.amount_mode
      FROM payroll_employee_components a JOIN payroll_components c ON c.id=a.component_id
      WHERE c.is_active=1 AND c.is_statutory=0 AND a.effective_from<=?
      AND (a.effective_to IS NULL OR a.effective_to>=?)`, [run.cutoff_end, run.cutoff_start]) : [];
    const loans = phase5Available ? await db.queryAll(`SELECT * FROM payroll_loans
      WHERE status='ACTIVE' AND balance>0 AND effective_from<=?`, [run.cutoff_end]) : [];
    const statutoryRules = phase5Available ? await db.queryAll(`SELECT r.*,c.component_code
      FROM payroll_statutory_rules r JOIN payroll_components c ON c.id=r.component_id
      WHERE c.is_active=1 AND c.is_statutory=1 AND c.component_type='DEDUCTION'
      AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>=?)
      ORDER BY r.component_id,r.effective_from DESC,r.salary_from DESC`, [run.cutoff_end, run.cutoff_start]) : [];
    const adjustments = phase5Available ? await db.queryAll(
      'SELECT * FROM payroll_run_adjustments WHERE run_id=? ORDER BY id', [id]
    ) : [];
    const groupByUser = (rows) => rows.reduce((map, row) => {
      const key = String(row.usercode || '').toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
      return map;
    }, new Map());
    const assignmentsByUser = groupByUser(assignments);
    const loansByUser = groupByUser(loans);
    const adjustmentsByUser = groupByUser(adjustments);
    const statutoryComponents = components.filter((row) => Number(row.is_statutory) === 1 && row.component_type === 'DEDUCTION');
    connection = await db.getConnection();
    await connection.beginTransaction();
    const old = await connection.query('SELECT id FROM payroll_run_employees WHERE run_id=?', [id]);
    const oldIds = old[0].map((row) => row.id);
    if (oldIds.length) await connection.query('DELETE FROM payroll_run_items WHERE run_employee_id IN (?)', [oldIds]);
    await connection.execute('DELETE FROM payroll_run_employees WHERE run_id=?', [id]);
    await connection.execute('DELETE FROM payroll_run_exceptions WHERE run_id=?', [id]);
    let grossTotal = 0n; let deductionTotal = 0n; let netTotal = 0n; let exceptionCount = 0;
    for (const employee of employees) {
      const issues = [];
      const userKey = String(employee.usercode).toUpperCase();
      if (!employee.basic_monthly) issues.push(['MISSING_SALARY', 'No effective basic salary for this cutoff.']);
      if (Number(schedule?.total || 0) === 0) issues.push(['MISSING_SCHEDULE', 'No work schedule is configured.']);
      const basic = employee.basic_monthly ? cents(Number(employee.basic_monthly) * Number(run.base_pay_factor)) : 0n;
      const otHours = otByUser.get(userKey) || 0;
      const ot = employee.basic_monthly && otHours > 0
        ? cents(calculateOvertime({ basicPay: employee.basic_monthly, payableMinutes: Math.round(otHours * 60), multiplier: '1.30' }).amount)
        : 0n;
      const undertimeAmount = undertimeByUser.get(userKey) || 0;
      const undertime = employee.basic_monthly && undertimeAmount > 0 ? cents(undertimeAmount) : 0n;
      const runItems = [];
      if (basic > 0n) runItems.push({ code: 'BASIC', type: 'EARNING', amount: basic, source: 'COMPENSATION_HISTORY' });
      if (ot > 0n) runItems.push({ code: 'OT', type: 'EARNING', amount: ot, source: 'APPROVED_OVERTIME' });
      if (undertime > 0n) runItems.push({ code: 'UNDERTIME', type: 'DEDUCTION', amount: undertime, source: 'DTR_FINAL' });
      let gross = basic + ot;
      let deductions = undertime;
      for (const assignment of assignmentsByUser.get(userKey) || []) {
        const amount = parseNonnegativeMoneyToCents(assignment.amount_mode === 'MONTHLY_PRORATED'
          ? prorateAmount(assignment.amount, run.base_pay_factor) : assignment.amount);
        if (assignment.component_type === 'EARNING') gross += amount;
        else deductions += amount;
        if (amount > 0n) runItems.push({ code: assignment.component_code, type: assignment.component_type,
          amount, source: `ASSIGNMENT:${assignment.id}` });
      }
      for (const adjustment of adjustmentsByUser.get(userKey) || []) {
        const amount = parseNonnegativeMoneyToCents(adjustment.amount);
        if (adjustment.component_type === 'EARNING') gross += amount;
        else deductions += amount;
        runItems.push({ code: adjustment.component_code, type: adjustment.component_type,
          amount, source: `ADJUSTMENT:${adjustment.id}` });
      }
      for (const component of statutoryComponents) {
        const matchingRule = statutoryRules.find((rule) => Number(rule.component_id) === Number(component.id)
          && parseNonnegativeMoneyToCents(rule.salary_from) <= gross
          && (rule.salary_to == null || parseNonnegativeMoneyToCents(rule.salary_to) >= gross));
        if (!matchingRule) {
          issues.push(['MISSING_STATUTORY_RULE', `No ${component.component_code} bracket matches this employee gross pay.`]);
          continue;
        }
        const fixed = parseNonnegativeMoneyToCents(matchingRule.fixed_amount);
        const percentage = parseNonnegativeMoneyToCents(calculatePercentageAmount(formatCents(gross), matchingRule.rate_percent));
        const amount = fixed + percentage;
        deductions += amount;
        if (amount > 0n) runItems.push({ code: component.component_code, type: 'DEDUCTION', amount,
          source: `STATUTORY_RULE:${matchingRule.id}` });
      }
      for (const loan of loansByUser.get(userKey) || []) {
        const balance = parseNonnegativeMoneyToCents(loan.balance);
        const installment = parseNonnegativeMoneyToCents(loan.installment_amount);
        const amount = balance < installment ? balance : installment;
        deductions += amount;
        if (amount > 0n) runItems.push({ code: `LOAN_${loan.loan_code}`.slice(0, 40), type: 'DEDUCTION', amount,
          source: `LOAN:${loan.id}` });
      }
      let net = gross - deductions;
      if (net < 0n) {
        issues.push(['NEGATIVE_NET_PAY', 'Deductions exceed gross pay. Review assignments, loans, and adjustments.']);
        net = 0n;
      }
      const [insert] = await connection.execute(`INSERT INTO payroll_run_employees
        (run_id,usercode,employee_name,basic_monthly,basic_pay,overtime_pay,gross_pay,deduction_total,net_pay,exception_count,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, employee.usercode, employee.name || employee.usercode,
        employee.basic_monthly || 0, formatCents(basic), formatCents(ot), formatCents(gross), formatCents(deductions), formatCents(net),
        issues.length, issues.length ? 'BLOCKED' : 'READY']);
      for (const item of runItems) await connection.execute(`INSERT INTO payroll_run_items
        (run_employee_id,component_code,component_type,amount,source_reference) VALUES (?,?,?,?,?)`,
      [insert.insertId, item.code, item.type, formatCents(item.amount), item.source]);
      for (const [code, message] of issues) await connection.execute(`INSERT INTO payroll_run_exceptions
        (run_id,usercode,exception_code,severity,message) VALUES (?,?,?,'BLOCKING',?)`,
      [id, employee.usercode, code, message]);
      exceptionCount += issues.length; grossTotal += gross; deductionTotal += deductions; netTotal += net;
    }
    if (!phase5Available || statutoryComponents.length === 0) {
      const code = phase5Available ? 'STATUTORY_NOT_CONFIGURED' : 'PHASE5_SCHEMA_REQUIRED';
      const message = phase5Available
        ? 'Create effective-dated statutory deduction components and brackets before locking payroll.'
        : 'Apply the Phase 5 payroll schema before locking payroll.';
      await connection.execute(`INSERT INTO payroll_run_exceptions
        (run_id,usercode,exception_code,severity,message) VALUES (?,NULL,?,'BLOCKING',?)`, [id, code, message]);
      exceptionCount += 1;
    }
    await connection.execute(`UPDATE payroll_runs SET status='CALCULATED',employee_count=?,exception_count=?,
      gross_total=?,deduction_total=?,net_total=?,updated_at=NOW() WHERE id=?`,
    [employees.length, exceptionCount, formatCents(grossTotal), formatCents(deductionTotal), formatCents(netTotal), id]);
    await connection.commit();
    return res.json({ ok: true, message: 'Phase 5 draft payroll calculated.', employeeCount: employees.length, exceptionCount });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally { connection?.release(); }
});

router.post('/runs/:id/lock', async (req, res, next) => {
  let connection;
  try {
    const id = Number(req.params.id);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [runRows] = await connection.execute('SELECT status FROM payroll_runs WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    const run = runRows[0];
    if (!run) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    }
    const [blockingRows] = await connection.execute(`SELECT COUNT(*) total FROM payroll_run_exceptions
      WHERE run_id=? AND severity='BLOCKING' AND is_resolved=0`, [id]);
    if (run.status !== 'CALCULATED' || Number(blockingRows[0]?.total || 0) > 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Resolve all blocking exceptions before locking payroll.' });
    }
    if (await phase5Ready()) {
      const [loanItems] = await connection.execute(`SELECT i.source_reference,SUM(i.amount) amount
        FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
        WHERE e.run_id=? AND i.source_reference LIKE 'LOAN:%' GROUP BY i.source_reference`, [id]);
      for (const item of loanItems) {
        const loanId = Number(String(item.source_reference).slice(5));
        if (!Number.isInteger(loanId)) continue;
        const amount = formatCents(parseNonnegativeMoneyToCents(item.amount));
        await connection.execute(`UPDATE payroll_loans
          SET status=IF(balance<=?,'PAID','ACTIVE'),balance=GREATEST(0,balance-?),updated_at=NOW()
          WHERE id=? AND status='ACTIVE'`, [amount, amount, loanId]);
      }
    }
    await connection.execute(`UPDATE payroll_runs SET status='LOCKED',updated_at=NOW() WHERE id=?`, [id]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'LOCK','PAYROLL_RUN',?,?)`, [req.user.usercode, String(id), JSON.stringify({ loanBalancesApplied: true })]);
    await connection.commit();
    return res.json({ ok: true, message: 'Payroll run locked.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally { connection?.release(); }
});

router.post('/runs/:id/approve', async (req, res, next) => {
  let connection;
  try {
    if (!await phase6Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 6 payroll schema first.' });
    const id = Number(req.params.id);
    const note = cleanText(req.body?.note, 255);
    if (!Number.isInteger(id) || id < 1 || note.length < 3) {
      return res.status(422).json({ ok: false, message: 'Select a locked run and enter an approval note.' });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [runRows] = await connection.execute('SELECT * FROM payroll_runs WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    const run = runRows[0];
    if (!run) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    }
    if (run.status !== 'LOCKED') {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Only a locked payroll run can be approved.' });
    }
    const [exceptionRows] = await connection.execute(`SELECT COUNT(*) total FROM payroll_run_exceptions
      WHERE run_id=? AND severity='BLOCKING' AND is_resolved=0`, [id]);
    const [summaryRows] = await connection.execute(`SELECT COUNT(*) total,
      SUM(status<>'READY') blocked,SUM(gross_pay) gross,SUM(deduction_total) deductions,SUM(net_pay) net
      FROM payroll_run_employees WHERE run_id=?`, [id]);
    const summary = summaryRows[0];
    const totalsMatch = Number(summary?.total || 0) === Number(run.employee_count)
      && parseNonnegativeMoneyToCents(summary?.gross || 0) === parseNonnegativeMoneyToCents(run.gross_total)
      && parseNonnegativeMoneyToCents(summary?.deductions || 0) === parseNonnegativeMoneyToCents(run.deduction_total)
      && parseNonnegativeMoneyToCents(summary?.net || 0) === parseNonnegativeMoneyToCents(run.net_total);
    if (!summary?.total || Number(summary.blocked || 0) > 0 || Number(exceptionRows[0]?.total || 0) > 0 || !totalsMatch) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Payroll register totals or employee readiness failed approval validation.' });
    }
    await connection.execute(`INSERT INTO payroll_run_approvals
      (run_id,approval_note,approved_by) VALUES (?,?,?)`, [id, note, req.user.usercode]);
    await connection.execute("UPDATE payroll_runs SET status='APPROVED',updated_at=NOW() WHERE id=?", [id]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'APPROVE','PAYROLL_RUN',?,?)`, [req.user.usercode, String(id), JSON.stringify({ note })]);
    await connection.commit();
    return res.json({ ok: true, message: 'Payroll run approved.' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'This payroll run already has an approval.' });
    return next(error);
  } finally { connection?.release(); }
});

router.post('/runs/:id/release', async (req, res, next) => {
  let connection;
  try {
    if (!await phase6Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 6 payroll schema first.' });
    const id = Number(req.params.id);
    const note = cleanText(req.body?.note, 255);
    if (!Number.isInteger(id) || id < 1 || note.length < 3) {
      return res.status(422).json({ ok: false, message: 'Select an approved run and enter a release note.' });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [runRows] = await connection.execute('SELECT * FROM payroll_runs WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    const run = runRows[0];
    if (!run) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    }
    if (run.status !== 'APPROVED') {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Only an approved payroll run can be released.' });
    }
    const register = await loadRegister(id, connection);
    const evidenceHash = hashRegister(registerEvidence(register));
    const releaseCode = `${run.run_code}-REL`;
    await connection.execute(`INSERT INTO payroll_run_releases
      (run_id,release_code,release_note,register_sha256,employee_count,gross_total,deduction_total,net_total,released_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [id, releaseCode, note, evidenceHash, run.employee_count,
      run.gross_total, run.deduction_total, run.net_total, req.user.usercode]);
    await connection.execute("UPDATE payroll_runs SET status='RELEASED',updated_at=NOW() WHERE id=?", [id]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'RELEASE','PAYROLL_RUN',?,?)`, [req.user.usercode, String(id),
      JSON.stringify({ releaseCode, registerSha256: evidenceHash, note })]);
    await connection.commit();
    return res.json({ ok: true, message: 'Payroll released. Payslips and CSV register are now available.', releaseCode });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'This payroll run was already released.' });
    return next(error);
  } finally { connection?.release(); }
});

router.get('/runs/:id/register', async (req, res, next) => {
  try {
    if (!await phase6Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 6 payroll schema first.' });
    const id = Number(req.params.id);
    const register = Number.isInteger(id) ? await loadRegister(id) : null;
    if (!register) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (!['LOCKED', 'APPROVED', 'RELEASED'].includes(register.run.status)) {
      return res.status(409).json({ ok: false, message: 'Lock the payroll run before opening its register.' });
    }
    const [approval, release] = await Promise.all([
      db.queryOne('SELECT * FROM payroll_run_approvals WHERE run_id=? LIMIT 1', [id]),
      db.queryOne('SELECT * FROM payroll_run_releases WHERE run_id=? LIMIT 1', [id]),
    ]);
    return res.json({ ok: true, ...register, approval, release });
  } catch (error) { return next(error); }
});

router.get('/runs/:id/payslips/:usercode', async (req, res, next) => {
  try {
    if (!await phase6Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 6 payroll schema first.' });
    const id = Number(req.params.id);
    const usercode = cleanText(req.params.usercode, 64).toUpperCase();
    const register = Number.isInteger(id) ? await loadRegister(id) : null;
    if (!register) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (register.run.status !== 'RELEASED') {
      return res.status(409).json({ ok: false, message: 'Payslips become available only after payroll release.' });
    }
    const employee = register.employees.find((item) => String(item.usercode).toUpperCase() === usercode);
    if (!employee) return res.status(404).json({ ok: false, message: 'Employee is not included in this payroll run.' });
    const release = await db.queryOne('SELECT release_code,released_at FROM payroll_run_releases WHERE run_id=? LIMIT 1', [id]);
    return res.json({ ok: true, payslip: {
      payslipNo: `${register.run.run_code}-${employee.usercode}`,
      run: register.run,
      employee,
      items: register.items.filter((item) => String(item.usercode).toUpperCase() === usercode),
      release,
    } });
  } catch (error) { return next(error); }
});

router.get('/runs/:id/export.csv', async (req, res, next) => {
  try {
    if (!await phase6Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 6 payroll schema first.' });
    const id = Number(req.params.id);
    const register = Number.isInteger(id) ? await loadRegister(id) : null;
    if (!register) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (register.run.status !== 'RELEASED') {
      return res.status(409).json({ ok: false, message: 'CSV export becomes available only after payroll release.' });
    }
    const header = ['Payslip No','Employee Code','Employee Name','Basic Pay','Overtime Pay','Gross Pay','Deductions','Net Pay'];
    const rows = register.employees.map((employee) => [
      `${register.run.run_code}-${employee.usercode}`, employee.usercode, employee.employee_name,
      employee.basic_pay, employee.overtime_pay, employee.gross_pay, employee.deduction_total, employee.net_pay,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const safeRunCode = String(register.run.run_code).replace(/[^A-Z0-9_-]/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRunCode}-register.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) { return next(error); }
});

router.post('/runs/:id/disbursements', async (req, res, next) => {
  let connection;
  try {
    if (!await phase7Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 7 payroll schema first.' });
    const runId = Number(req.params.id);
    const batchCode = cleanText(req.body?.batchCode, 60).toUpperCase();
    const paymentMethod = cleanText(req.body?.paymentMethod, 30).toUpperCase();
    if (!Number.isInteger(runId) || runId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(batchCode)
      || !['BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER'].includes(paymentMethod)) {
      return res.status(422).json({ ok: false, message: 'Select a released run and enter a valid batch code and payment method.' });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [runRows] = await connection.execute(`SELECT r.id,r.run_code,r.status,r.employee_count,r.net_total,
      x.register_sha256,x.net_total released_net FROM payroll_runs r
      JOIN payroll_run_releases x ON x.run_id=r.id WHERE r.id=? LIMIT 1 FOR UPDATE`, [runId]);
    const run = runRows[0];
    if (!run) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Released payroll run not found.' });
    }
    if (run.status !== 'RELEASED') {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Disbursement can be prepared only from released payroll.' });
    }
    const register = await loadRegister(runId, connection);
    if (hashRegister(registerEvidence(register)) !== run.register_sha256) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Released payroll register evidence no longer matches. Disbursement is blocked.' });
    }
    const employees = register.employees;
    const total = employees.reduce((sum, item) => sum + parseNonnegativeMoneyToCents(item.net_pay), 0n);
    if (!employees.length || employees.length !== Number(run.employee_count)
      || total !== parseNonnegativeMoneyToCents(run.net_total)
      || total !== parseNonnegativeMoneyToCents(run.released_net)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Released payroll and disbursement totals do not match.' });
    }
    const [insert] = await connection.execute(`INSERT INTO payroll_disbursement_batches
      (run_id,batch_code,payment_method,employee_count,total_amount,register_sha256,prepared_by)
      VALUES (?,?,?,?,?,?,?)`, [runId, batchCode, paymentMethod, employees.length, formatCents(total),
      run.register_sha256, req.user.usercode]);
    for (const employee of employees) await connection.execute(`INSERT INTO payroll_disbursement_items
      (batch_id,run_employee_id,usercode,employee_name,amount) VALUES (?,?,?,?,?)`,
    [insert.insertId, employee.id, employee.usercode, employee.employee_name, employee.net_pay]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'PREPARE','PAYROLL_DISBURSEMENT',?,?)`, [req.user.usercode, String(insert.insertId),
      JSON.stringify({ runId, batchCode, paymentMethod, totalAmount: formatCents(total) })]);
    await connection.commit();
    return res.status(201).json({ ok: true, id: insert.insertId,
      message: 'Disbursement batch prepared. No funds were transmitted.' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'This run or batch code already has a disbursement.' });
    return next(error);
  } finally { connection?.release(); }
});

router.post('/disbursements/:id/status', async (req, res, next) => {
  let connection;
  try {
    if (!await phase7Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 7 payroll schema first.' });
    const id = Number(req.params.id);
    const target = cleanText(req.body?.status, 20).toUpperCase();
    const reference = cleanText(req.body?.reference, 120);
    const reason = cleanText(req.body?.reason, 255);
    if (!Number.isInteger(id) || id < 1 || !['TRANSMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED'].includes(target)) {
      return res.status(422).json({ ok: false, message: 'Select a disbursement and valid next status.' });
    }
    if (['TRANSMITTED', 'CONFIRMED'].includes(target) && !reference) {
      return res.status(422).json({ ok: false, message: 'An external payment reference is required.' });
    }
    if (['FAILED', 'CANCELLED'].includes(target) && reason.length < 3) {
      return res.status(422).json({ ok: false, message: 'A failure or cancellation reason is required.' });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [batchRows] = await connection.execute('SELECT * FROM payroll_disbursement_batches WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    const batch = batchRows[0];
    if (!batch) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Disbursement batch not found.' });
    }
    if (!validStatusTransition('DISBURSEMENT', batch.status, target)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: `Disbursement cannot move from ${batch.status} to ${target}.` });
    }
    if (reference) {
      const [duplicateRows] = await connection.execute(`SELECT id FROM payroll_disbursement_batches
        WHERE external_reference=? AND id<>? LIMIT 1`, [reference, id]);
      if (duplicateRows.length) {
        await connection.rollback();
        return res.status(409).json({ ok: false, message: 'That external payment reference is already assigned to another batch.' });
      }
    }
    if (batch.external_reference && reference && batch.external_reference !== reference) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'The confirmation reference must match the transmitted payment reference.' });
    }
    if (target === 'CONFIRMED') {
      const [summaryRows] = await connection.execute(`SELECT COUNT(*) total,SUM(amount) amount
        FROM payroll_disbursement_items WHERE batch_id=?`, [id]);
      const summary = summaryRows[0];
      if (Number(summary?.total || 0) !== Number(batch.employee_count)
        || parseNonnegativeMoneyToCents(summary?.amount || 0) !== parseNonnegativeMoneyToCents(batch.total_amount)) {
        await connection.rollback();
        return res.status(409).json({ ok: false, message: 'Disbursement item totals do not match the prepared batch.' });
      }
      await connection.execute(`UPDATE payroll_disbursement_batches SET status='CONFIRMED',external_reference=?,
        confirmed_by=?,confirmed_at=NOW(),updated_at=NOW() WHERE id=?`, [reference, req.user.usercode, id]);
      await connection.execute(`UPDATE payroll_disbursement_items SET status='CONFIRMED',payment_reference=?,
        failure_reason=NULL,updated_at=NOW() WHERE batch_id=?`, [reference, id]);
    } else if (target === 'TRANSMITTED') {
      await connection.execute(`UPDATE payroll_disbursement_batches SET status='TRANSMITTED',external_reference=?,
        transmitted_by=?,transmitted_at=NOW(),failure_reason=NULL,updated_at=NOW() WHERE id=?`,
      [reference, req.user.usercode, id]);
    } else {
      await connection.execute(`UPDATE payroll_disbursement_batches SET status=?,failure_reason=?,updated_at=NOW()
        WHERE id=?`, [target, reason, id]);
      await connection.execute(`UPDATE payroll_disbursement_items SET status='FAILED',failure_reason=?,updated_at=NOW()
        WHERE batch_id=?`, [reason, id]);
    }
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'STATUS','PAYROLL_DISBURSEMENT',?,?)`, [req.user.usercode, String(id),
      JSON.stringify({ from: batch.status, to: target, reference: reference || null, reason: reason || null })]);
    await connection.commit();
    return res.json({ ok: true, message: `Disbursement marked ${target.toLowerCase()}.` });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally { connection?.release(); }
});

router.post('/runs/:id/remittances/prepare', async (req, res, next) => {
  let connection;
  try {
    if (!await phase7Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 7 payroll schema first.' });
    const runId = Number(req.params.id);
    if (!Number.isInteger(runId) || runId < 1) return res.status(422).json({ ok: false, message: 'Select a released payroll run.' });
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [runRows] = await connection.execute(`SELECT id,status FROM payroll_runs WHERE id=? LIMIT 1 FOR UPDATE`, [runId]);
    if (!runRows[0]) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    }
    if (runRows[0].status !== 'RELEASED') {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Remittances can be prepared only from released payroll.' });
    }
    const [groups] = await connection.execute(`SELECT
      CASE WHEN i.source_reference LIKE 'LOAN:%' THEN 'LOAN' ELSE 'STATUTORY' END remittance_type,
      i.component_code,SUM(i.amount) amount
      FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
      WHERE e.run_id=? AND i.component_type='DEDUCTION'
      AND (i.source_reference LIKE 'LOAN:%' OR i.source_reference LIKE 'STATUTORY_RULE:%')
      GROUP BY remittance_type,i.component_code ORDER BY remittance_type,i.component_code`, [runId]);
    if (!groups.length) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'No statutory or loan deductions are available for remittance.' });
    }
    for (const group of groups) {
      const payee = group.remittance_type === 'LOAN'
        ? `Loan ${String(group.component_code).replace(/^LOAN_/, '')}` : group.component_code;
      await connection.execute(`INSERT INTO payroll_remittance_batches
        (run_id,remittance_type,component_code,payee,amount,created_by) VALUES (?,?,?,?,?,?)`,
      [runId, group.remittance_type, group.component_code, payee, group.amount, req.user.usercode]);
    }
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'PREPARE','PAYROLL_REMITTANCE',?,?)`, [req.user.usercode, String(runId),
      JSON.stringify({ remittanceCount: groups.length })]);
    await connection.commit();
    return res.status(201).json({ ok: true, message: `${groups.length} remittance summaries prepared.` });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'Remittances were already prepared for this run.' });
    return next(error);
  } finally { connection?.release(); }
});

router.post('/remittances/:id/status', async (req, res, next) => {
  let connection;
  try {
    if (!await phase7Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 7 payroll schema first.' });
    const id = Number(req.params.id);
    const target = cleanText(req.body?.status, 20).toUpperCase();
    const reference = cleanText(req.body?.reference, 120);
    const reason = cleanText(req.body?.reason, 255);
    if (!Number.isInteger(id) || id < 1 || !['REMITTED', 'CONFIRMED', 'FAILED'].includes(target)) {
      return res.status(422).json({ ok: false, message: 'Select a remittance and valid next status.' });
    }
    if (['REMITTED', 'CONFIRMED'].includes(target) && !reference) {
      return res.status(422).json({ ok: false, message: 'An external remittance reference is required.' });
    }
    if (target === 'FAILED' && reason.length < 3) {
      return res.status(422).json({ ok: false, message: 'A remittance failure reason is required.' });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM payroll_remittance_batches WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    const remittance = rows[0];
    if (!remittance) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Remittance not found.' });
    }
    if (!validStatusTransition('REMITTANCE', remittance.status, target)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: `Remittance cannot move from ${remittance.status} to ${target}.` });
    }
    if (reference) {
      const [duplicateRows] = await connection.execute(`SELECT id FROM payroll_remittance_batches
        WHERE external_reference=? AND id<>? LIMIT 1`, [reference, id]);
      if (duplicateRows.length) {
        await connection.rollback();
        return res.status(409).json({ ok: false, message: 'That external remittance reference is already in use.' });
      }
    }
    if (remittance.external_reference && reference && remittance.external_reference !== reference) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'The confirmation reference must match the remitted reference.' });
    }
    if (target === 'REMITTED') await connection.execute(`UPDATE payroll_remittance_batches
      SET status='REMITTED',external_reference=?,remitted_by=?,remitted_at=NOW(),failure_reason=NULL,updated_at=NOW()
      WHERE id=?`, [reference, req.user.usercode, id]);
    else if (target === 'CONFIRMED') await connection.execute(`UPDATE payroll_remittance_batches
      SET status='CONFIRMED',external_reference=?,confirmed_by=?,confirmed_at=NOW(),updated_at=NOW()
      WHERE id=?`, [reference, req.user.usercode, id]);
    else await connection.execute(`UPDATE payroll_remittance_batches
      SET status='FAILED',failure_reason=?,updated_at=NOW() WHERE id=?`, [reason, id]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'STATUS','PAYROLL_REMITTANCE',?,?)`, [req.user.usercode, String(id),
      JSON.stringify({ from: remittance.status, to: target, reference: reference || null, reason: reason || null })]);
    await connection.commit();
    return res.json({ ok: true, message: `Remittance marked ${target.toLowerCase()}.` });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally { connection?.release(); }
});

router.get('/runs/:id/reconciliation', async (req, res, next) => {
  try {
    if (!await phase7Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 7 payroll schema first.' });
    const runId = Number(req.params.id);
    const run = Number.isInteger(runId) ? await db.queryOne(`SELECT r.id,r.run_code,r.status,r.employee_count,r.net_total,
      x.release_code,x.register_sha256,x.released_at FROM payroll_runs r
      JOIN payroll_run_releases x ON x.run_id=r.id WHERE r.id=? LIMIT 1`, [runId]) : null;
    if (!run) return res.status(404).json({ ok: false, message: 'Released payroll run not found.' });
    const batch = await db.queryOne('SELECT * FROM payroll_disbursement_batches WHERE run_id=? LIMIT 1', [runId]);
    const items = batch ? await db.queryAll(`SELECT id,usercode,employee_name,amount,status,payment_reference,failure_reason
      FROM payroll_disbursement_items WHERE batch_id=? ORDER BY usercode,id`, [batch.id]) : [];
    const remittances = await db.queryAll(`SELECT * FROM payroll_remittance_batches
      WHERE run_id=? ORDER BY remittance_type,component_code`, [runId]);
    const expectedRow = await db.queryOne(`SELECT COALESCE(SUM(i.amount),0) total
      FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
      WHERE e.run_id=? AND i.component_type='DEDUCTION'
      AND (i.source_reference LIKE 'LOAN:%' OR i.source_reference LIKE 'STATUTORY_RULE:%')`, [runId]);
    const expectedNet = parseNonnegativeMoneyToCents(run.net_total);
    const preparedNet = batch ? parseNonnegativeMoneyToCents(batch.total_amount) : 0n;
    const expectedRemittance = parseNonnegativeMoneyToCents(expectedRow?.total || 0);
    const preparedRemittance = remittances.reduce((sum, item) => sum + parseNonnegativeMoneyToCents(item.amount), 0n);
    const duplicateReference = batch?.external_reference
      ? await db.queryOne(`SELECT COUNT(*) total FROM payroll_disbursement_batches WHERE external_reference=?`, [batch.external_reference])
      : null;
    const register = await loadRegister(runId);
    return res.json({ ok: true, run, batch, items, remittances, reconciliation: {
      disbursementVariance: formatSignedCents(preparedNet - expectedNet),
      remittanceVariance: formatSignedCents(preparedRemittance - expectedRemittance),
      disbursementMatches: Boolean(batch) && preparedNet === expectedNet && items.length === Number(run.employee_count),
      remittanceMatches: preparedRemittance === expectedRemittance,
      duplicatePaymentReference: Number(duplicateReference?.total || 0) > 1,
      registerMatches: hashRegister(registerEvidence(register)) === run.register_sha256,
    } });
  } catch (error) { return next(error); }
});

router.get('/phase8/account-mappings', async (_req, res, next) => {
  try {
    if (!await phase8Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 8 payroll schema first.' });
    const items = await db.queryAll(`SELECT id,component_code,component_type,debit_account_code,debit_account_name,
      credit_account_code,credit_account_name,effective_from,is_active,created_by,created_at
      FROM payroll_account_mappings ORDER BY component_code,effective_from DESC,id DESC LIMIT 300`);
    return res.json({ ok: true, items });
  } catch (error) { return next(error); }
});

router.post('/phase8/account-mappings', async (req, res, next) => {
  try {
    if (!await phase8Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 8 payroll schema first.' });
    const component = componentCode(req.body?.componentCode);
    const type = cleanText(req.body?.componentType, 20).toUpperCase();
    const debitCode = cleanText(req.body?.debitAccountCode, 40).toUpperCase();
    const debitName = cleanText(req.body?.debitAccountName, 120);
    const creditCode = cleanText(req.body?.creditAccountCode, 40).toUpperCase();
    const creditName = cleanText(req.body?.creditAccountName, 120);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    const validAccount = (value) => /^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(value);
    if ((!validComponentCode(component) && component !== 'NET_PAY')
      || !['EARNING', 'DEDUCTION', 'NET_PAY'].includes(type)
      || (component === 'NET_PAY') !== (type === 'NET_PAY')
      || !validAccount(debitCode) || !validAccount(creditCode) || !debitName || !creditName || !isIsoDate(effectiveFrom)) {
      return res.status(422).json({ ok: false, message: 'Complete a valid component, matching type, accounts, and effective date.' });
    }
    await db.execute(`INSERT INTO payroll_account_mappings
      (component_code,component_type,debit_account_code,debit_account_name,credit_account_code,credit_account_name,effective_from,created_by)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE component_type=VALUES(component_type),
      debit_account_code=VALUES(debit_account_code),debit_account_name=VALUES(debit_account_name),
      credit_account_code=VALUES(credit_account_code),credit_account_name=VALUES(credit_account_name),
      is_active=1,created_by=VALUES(created_by),updated_at=NOW()`,
    [component, type, debitCode, debitName, creditCode, creditName, effectiveFrom, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'MAP','PAYROLL_ACCOUNT',?,?)`, [req.user.usercode, `${component}:${effectiveFrom}`,
      JSON.stringify({ type, debitCode, creditCode })]);
    return res.json({ ok: true, message: 'Effective-dated payroll account mapping saved.' });
  } catch (error) { return next(error); }
});

router.get('/runs/:id/phase8/reports', async (req, res, next) => {
  try {
    if (!await phase8Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 8 payroll schema first.' });
    const runId = Number(req.params.id);
    const run = Number.isInteger(runId) ? await db.queryOne(`SELECT * FROM payroll_runs WHERE id=? LIMIT 1`, [runId]) : null;
    if (!run) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (run.status !== 'RELEASED') return res.status(409).json({ ok: false, message: 'Reports are available after payroll release.' });
    const [departments, components, closure] = await Promise.all([
      db.queryAll(`SELECT COALESCE(NULLIF(TRIM(u.department),''),'UNASSIGNED') department,COUNT(*) employees,
        SUM(e.gross_pay) gross,SUM(e.deduction_total) deductions,SUM(e.net_pay) net
        FROM payroll_run_employees e LEFT JOIN usertb u ON u.usercode=e.usercode
        WHERE e.run_id=? GROUP BY department ORDER BY department`, [runId]),
      db.queryAll(`SELECT i.component_code,i.component_type,SUM(i.amount) amount,COUNT(*) employee_rows
        FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
        WHERE e.run_id=? GROUP BY i.component_code,i.component_type ORDER BY i.component_type,i.component_code`, [runId]),
      db.queryOne('SELECT * FROM payroll_period_closures WHERE run_id=? LIMIT 1', [runId]),
    ]);
    return res.json({ ok: true, run, departments, components, closure });
  } catch (error) { return next(error); }
});

router.get('/employees/:usercode/ytd', async (req, res, next) => {
  try {
    const usercode = cleanText(req.params.usercode, 64).toUpperCase();
    const year = Number(req.query?.year || new Date().getUTCFullYear());
    if (!usercode || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(422).json({ ok: false, message: 'Enter a valid employee code and payroll year.' });
    }
    const items = await db.queryAll(`SELECT r.id run_id,r.run_code,r.pay_date,e.employee_name,e.basic_pay,e.overtime_pay,
      e.gross_pay,e.deduction_total,e.net_pay FROM payroll_run_employees e
      JOIN payroll_runs r ON r.id=e.run_id WHERE e.usercode=? AND r.status='RELEASED' AND YEAR(r.pay_date)=?
      ORDER BY r.pay_date,r.id`, [usercode, year]);
    const totals = items.reduce((result, item) => {
      result.gross += parseNonnegativeMoneyToCents(item.gross_pay);
      result.deductions += parseNonnegativeMoneyToCents(item.deduction_total);
      result.net += parseNonnegativeMoneyToCents(item.net_pay);
      return result;
    }, { gross: 0n, deductions: 0n, net: 0n });
    return res.json({ ok: true, usercode, year, items, totals: {
      gross: formatCents(totals.gross), deductions: formatCents(totals.deductions), net: formatCents(totals.net),
    } });
  } catch (error) { return next(error); }
});

router.get('/runs/:id/journal', async (req, res, next) => {
  try {
    if (!await phase8Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 8 payroll schema first.' });
    const runId = Number(req.params.id);
    const journal = Number.isInteger(runId) ? await loadJournalView(runId) : null;
    if (!journal) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (journal.run.status !== 'RELEASED') return res.status(409).json({ ok: false, message: 'Journal preview is available after payroll release.' });
    return res.json({ ok: true, ...journal, journalSha256: journal.journalSha256 || hashRegister(journal.lines) });
  } catch (error) { return next(error); }
});

router.get('/runs/:id/journal.csv', async (req, res, next) => {
  try {
    if (!await phase8Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 8 payroll schema first.' });
    const runId = Number(req.params.id);
    const journal = Number.isInteger(runId) ? await loadJournalView(runId) : null;
    if (!journal) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (journal.run.status !== 'RELEASED') return res.status(409).json({ ok: false, message: 'Journal export is available after payroll release.' });
    if (!journal.complete) return res.status(409).json({ ok: false, message: 'Complete every effective account mapping before journal export.' });
    const header = ['Run Code','Pay Date','Component','Side','Account Code','Account Name','Debit','Credit'];
    const rows = journal.lines.map((line) => [journal.run.run_code,String(journal.run.pay_date).slice(0, 10),line.componentCode,
      line.side,line.accountCode,line.accountName,line.debit,line.credit]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const safeRunCode = String(journal.run.run_code).replace(/[^A-Z0-9_-]/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRunCode}-journal.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) { return next(error); }
});

router.post('/runs/:id/close', async (req, res, next) => {
  let connection;
  try {
    if (!await phase8Ready() || !await phase7Ready()) {
      return res.status(409).json({ ok: false, message: 'Apply the Phase 7 and Phase 8 payroll schemas first.' });
    }
    const runId = Number(req.params.id);
    const note = cleanText(req.body?.note, 255);
    if (!Number.isInteger(runId) || runId < 1 || note.length < 3 || req.body?.confirm !== true) {
      return res.status(422).json({ ok: false, message: 'Select a released run, enter a close note, and confirm the irreversible close.' });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [runRows] = await connection.execute(`SELECT r.*,x.register_sha256 FROM payroll_runs r
      JOIN payroll_run_releases x ON x.run_id=r.id WHERE r.id=? LIMIT 1 FOR UPDATE`, [runId]);
    const run = runRows[0];
    if (!run) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Released payroll run not found.' });
    }
    if (run.status !== 'RELEASED') {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Only released payroll can be closed.' });
    }
    const register = await loadRegister(runId, connection);
    const currentRegisterHash = hashRegister(registerEvidence(register));
    if (currentRegisterHash !== run.register_sha256) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Released register evidence mismatch blocks period closing.' });
    }
    const [batchRows] = await connection.execute(`SELECT * FROM payroll_disbursement_batches WHERE run_id=? LIMIT 1`, [runId]);
    const batch = batchRows[0];
    const [itemRows] = batch ? await connection.execute(`SELECT COUNT(*) total,SUM(status<>'CONFIRMED') pending,SUM(amount) amount
      FROM payroll_disbursement_items WHERE batch_id=?`, [batch.id]) : [[{ total: 0, pending: 0, amount: 0 }]];
    const itemSummary = itemRows[0];
    const disbursementReady = batch?.status === 'CONFIRMED'
      && Number(itemSummary?.total || 0) === Number(run.employee_count)
      && Number(itemSummary?.pending || 0) === 0
      && parseNonnegativeMoneyToCents(itemSummary?.amount || 0) === parseNonnegativeMoneyToCents(run.net_total);
    const [expectedRows] = await connection.execute(`SELECT COALESCE(SUM(i.amount),0) amount
      FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
      WHERE e.run_id=? AND i.component_type='DEDUCTION'
      AND (i.source_reference LIKE 'LOAN:%' OR i.source_reference LIKE 'STATUTORY_RULE:%')`, [runId]);
    const [remittanceRows] = await connection.execute(`SELECT COUNT(*) total,SUM(status<>'CONFIRMED') pending,
      COALESCE(SUM(amount),0) amount FROM payroll_remittance_batches WHERE run_id=?`, [runId]);
    const expectedRemittance = parseNonnegativeMoneyToCents(expectedRows[0]?.amount || 0);
    const remittanceSummary = remittanceRows[0];
    const remittanceReady = Number(remittanceSummary?.pending || 0) === 0
      && parseNonnegativeMoneyToCents(remittanceSummary?.amount || 0) === expectedRemittance
      && (expectedRemittance === 0n || Number(remittanceSummary?.total || 0) > 0);
    const journal = await buildJournal(runId, connection);
    if (!disbursementReady || !remittanceReady || !journal?.complete) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: 'Confirm disbursement, reconcile remittances, and complete account mappings before closing.' });
    }
    const checklist = { registerVerified: true, disbursementConfirmed: true, remittancesReconciled: true,
      journalComplete: true, journalBalanced: journal.balanced };
    const closeCode = `${run.run_code}-CLOSE`;
    const journalSha256 = hashRegister(journal.lines);
    const [closureInsert] = await connection.execute(`INSERT INTO payroll_period_closures
      (run_id,close_code,close_note,register_sha256,journal_sha256,total_debits,total_credits,checklist_json,closed_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [runId, closeCode, note, currentRegisterHash, journalSha256,
      journal.totalDebits, journal.totalCredits, JSON.stringify(checklist), req.user.usercode]);
    for (let index = 0; index < journal.lines.length; index += 1) {
      const line = journal.lines[index];
      await connection.execute(`INSERT INTO payroll_period_journal_lines
        (closure_id,line_no,component_code,side,account_code,account_name,debit,credit)
        VALUES (?,?,?,?,?,?,?,?)`, [closureInsert.insertId, index + 1, line.componentCode, line.side,
        line.accountCode, line.accountName, line.debit, line.credit]);
    }
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'CLOSE','PAYROLL_PERIOD',?,?)`, [req.user.usercode, String(runId),
      JSON.stringify({ closeCode, registerSha256: currentRegisterHash, journalSha256, note })]);
    await connection.commit();
    return res.json({ ok: true, message: 'Payroll period closed. No reopen action is available.', closeCode });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'This payroll period is already closed.' });
    return next(error);
  } finally { connection?.release(); }
});

router.get('/phase9/parallel-tests', async (_req, res, next) => {
  try {
    if (!await phase9Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 9 payroll schema first.' });
    const items = await db.queryAll(`SELECT t.*,r.run_code,r.pay_date,
      (SELECT COUNT(*) FROM payroll_cutover_signoffs s WHERE s.test_id=t.id) signoff_count
      FROM payroll_parallel_tests t JOIN payroll_runs r ON r.id=t.run_id
      ORDER BY t.id DESC LIMIT 50`);
    return res.json({ ok: true, items });
  } catch (error) { return next(error); }
});

router.get('/phase9/parallel-tests/:id', async (req, res, next) => {
  try {
    if (!await phase9Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 9 payroll schema first.' });
    const id = Number(req.params.id);
    const test = Number.isInteger(id) ? await db.queryOne(`SELECT t.*,r.run_code,r.pay_date
      FROM payroll_parallel_tests t JOIN payroll_runs r ON r.id=t.run_id WHERE t.id=? LIMIT 1`, [id]) : null;
    if (!test) return res.status(404).json({ ok: false, message: 'Parallel payroll test not found.' });
    const [items, signoffs] = await Promise.all([
      db.queryAll(`SELECT * FROM payroll_parallel_test_items WHERE test_id=?
        ORDER BY within_tolerance,result,usercode LIMIT 1000`, [id]),
      db.queryAll('SELECT * FROM payroll_cutover_signoffs WHERE test_id=? ORDER BY signoff_role', [id]),
    ]);
    return res.json({ ok: true, test, items, signoffs });
  } catch (error) { return next(error); }
});

router.post('/phase9/parallel-tests', async (req, res, next) => {
  let connection;
  try {
    if (!await phase9Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 9 payroll schema first.' });
    const runId = Number(req.body?.runId);
    const testCode = cleanText(req.body?.testCode, 60).toUpperCase();
    const sourceName = cleanText(req.body?.sourceName, 160);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    let tolerance;
    try { tolerance = parseNonnegativeMoneyToCents(req.body?.tolerance ?? '0'); }
    catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    if (!Number.isInteger(runId) || runId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(testCode)
      || !sourceName || !rows.length || rows.length > 2000) {
      return res.status(422).json({ ok: false, message: 'Select a released run and provide a valid test code and comparison CSV.' });
    }
    const expected = new Map();
    try {
      for (const row of rows) {
        const usercode = cleanText(row?.usercode, 64).toUpperCase();
        if (!usercode || expected.has(usercode)) throw new Error(`Duplicate or missing employee code: ${usercode || 'blank'}.`);
        const gross = parseNonnegativeMoneyToCents(row?.grossPay);
        const deductions = parseNonnegativeMoneyToCents(row?.deductions);
        const net = parseNonnegativeMoneyToCents(row?.netPay);
        if (deductions > gross || gross - deductions !== net) throw new Error(`Manual totals do not reconcile for ${usercode}.`);
        expected.set(usercode, { usercode, gross, deductions, net });
      }
    } catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    const run = await db.queryOne('SELECT id,run_code,status FROM payroll_runs WHERE id=? LIMIT 1', [runId]);
    if (!run) return res.status(404).json({ ok: false, message: 'Payroll run not found.' });
    if (run.status !== 'RELEASED') return res.status(409).json({ ok: false, message: 'Parallel comparison requires a released payroll run.' });
    const systemRows = await db.queryAll(`SELECT usercode,employee_name,gross_pay,deduction_total,net_pay
      FROM payroll_run_employees WHERE run_id=? ORDER BY usercode`, [runId]);
    const system = new Map(systemRows.map((row) => [String(row.usercode).toUpperCase(), row]));
    const codes = [...new Set([...expected.keys(), ...system.keys()])].sort();
    const comparisons = [];
    let grossExpected = 0n; let grossSystem = 0n; let deductionExpected = 0n;
    let deductionSystem = 0n; let netExpected = 0n; let netSystem = 0n; let matchedCount = 0;
    for (const code of codes) {
      const manual = expected.get(code);
      const actual = system.get(code);
      const expectedGross = manual?.gross || 0n;
      const expectedDeductions = manual?.deductions || 0n;
      const expectedNet = manual?.net || 0n;
      const systemGross = actual ? parseNonnegativeMoneyToCents(actual.gross_pay) : 0n;
      const systemDeductions = actual ? parseNonnegativeMoneyToCents(actual.deduction_total) : 0n;
      const systemNet = actual ? parseNonnegativeMoneyToCents(actual.net_pay) : 0n;
      const grossVariance = systemGross - expectedGross;
      const deductionVariance = systemDeductions - expectedDeductions;
      const netVariance = systemNet - expectedNet;
      const absolute = (value) => value < 0n ? -value : value;
      const within = Boolean(manual && actual && absolute(grossVariance) <= tolerance
        && absolute(deductionVariance) <= tolerance && absolute(netVariance) <= tolerance);
      const result = !manual ? 'MISSING_EXPECTED' : !actual ? 'MISSING_SYSTEM' : within ? 'MATCH' : 'VARIANCE';
      if (within) matchedCount += 1;
      comparisons.push({ code, name: actual?.employee_name || null, expectedGross, systemGross, grossVariance,
        expectedDeductions, systemDeductions, deductionVariance, expectedNet, systemNet, netVariance, result, within });
      grossExpected += expectedGross; grossSystem += systemGross;
      deductionExpected += expectedDeductions; deductionSystem += systemDeductions;
      netExpected += expectedNet; netSystem += systemNet;
    }
    const passed = expected.size === system.size && matchedCount === codes.length;
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [insert] = await connection.execute(`INSERT INTO payroll_parallel_tests
      (run_id,test_code,tolerance,status,system_count,expected_count,matched_count,variance_count,
      gross_expected,gross_system,gross_variance,deduction_expected,deduction_system,deduction_variance,
      net_expected,net_system,net_variance,source_name,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [runId, testCode, formatCents(tolerance), passed ? 'PASSED' : 'FAILED',
      system.size, expected.size, matchedCount, codes.length - matchedCount, formatCents(grossExpected), formatCents(grossSystem),
      formatSignedCents(grossSystem - grossExpected), formatCents(deductionExpected), formatCents(deductionSystem),
      formatSignedCents(deductionSystem - deductionExpected), formatCents(netExpected), formatCents(netSystem),
      formatSignedCents(netSystem - netExpected), sourceName, req.user.usercode]);
    for (const item of comparisons) await connection.execute(`INSERT INTO payroll_parallel_test_items
      (test_id,usercode,employee_name,expected_gross,system_gross,gross_variance,expected_deductions,
      system_deductions,deduction_variance,expected_net,system_net,net_variance,result,within_tolerance)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [insert.insertId, item.code, item.name, formatCents(item.expectedGross),
      formatCents(item.systemGross), formatSignedCents(item.grossVariance), formatCents(item.expectedDeductions),
      formatCents(item.systemDeductions), formatSignedCents(item.deductionVariance), formatCents(item.expectedNet),
      formatCents(item.systemNet), formatSignedCents(item.netVariance), item.result, item.within ? 1 : 0]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'COMPARE','PAYROLL_PARALLEL_TEST',?,?)`, [req.user.usercode, String(insert.insertId),
      JSON.stringify({ runId, testCode, status: passed ? 'PASSED' : 'FAILED', tolerance: formatCents(tolerance),
        matchedCount, varianceCount: codes.length - matchedCount })]);
    await connection.commit();
    return res.status(201).json({ ok: true, id: insert.insertId, status: passed ? 'PASSED' : 'FAILED',
      message: passed ? 'Parallel payroll matched within tolerance.' : 'Parallel payroll has blocking variances.' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'Parallel test code already exists.' });
    return next(error);
  } finally { connection?.release(); }
});

router.post('/phase9/parallel-tests/:id/signoffs', async (req, res, next) => {
  try {
    if (!await phase9Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 9 payroll schema first.' });
    const testId = Number(req.params.id);
    const role = cleanText(req.body?.role, 20).toUpperCase();
    const statement = cleanText(req.body?.statement, 255);
    if (!Number.isInteger(testId) || testId < 1 || !['HR', 'PAYROLL', 'FINANCE', 'MANAGEMENT'].includes(role)
      || statement.length < 10 || req.body?.confirm !== true) {
      return res.status(422).json({ ok: false, message: 'Select a role, enter its approval statement, and confirm the sign-off.' });
    }
    const readiness = await computeCutoverReadiness(testId);
    if (!readiness.test) return res.status(404).json({ ok: false, message: 'Parallel payroll test not found.' });
    if (!readiness.baseReady) return res.status(409).json({ ok: false, message: 'All non-sign-off production-readiness gates must pass first.' });
    await db.execute(`INSERT INTO payroll_cutover_signoffs
      (test_id,signoff_role,statement,signed_by) VALUES (?,?,?,?)`, [testId, role, statement, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'SIGNOFF','PAYROLL_CUTOVER',?,?)`, [req.user.usercode, `${testId}:${role}`, JSON.stringify({ role, statement })]);
    return res.json({ ok: true, message: `${role} production-readiness sign-off recorded.` });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'That role already signed this parallel test.' });
    return next(error);
  }
});

router.get('/phase10/cycles', async (_req, res, next) => {
  try {
    if (!await phase10Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 10 payroll schema first.' });
    const items = await db.queryAll(`SELECT c.*,t.test_code,r.run_code,
      (SELECT COUNT(*) FROM payroll_uat_cases x WHERE x.cycle_id=c.id) case_count,
      (SELECT COUNT(*) FROM payroll_uat_cases x WHERE x.cycle_id=c.id AND x.status='PASSED') passed_count,
      (SELECT COUNT(*) FROM payroll_uat_issues i WHERE i.cycle_id=c.id AND i.status='OPEN') open_issue_count,
      (SELECT COUNT(*) FROM payroll_go_live_authorizations a WHERE a.cycle_id=c.id) authorization_count
      FROM payroll_uat_cycles c JOIN payroll_parallel_tests t ON t.id=c.test_id
      JOIN payroll_runs r ON r.id=t.run_id ORDER BY c.id DESC LIMIT 50`);
    return res.json({ ok: true, items });
  } catch (error) { return next(error); }
});

router.get('/phase10/cycles/:id', async (req, res, next) => {
  try {
    if (!await phase10Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 10 payroll schema first.' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(422).json({ ok: false, message: 'Select a valid UAT cycle.' });
    const readiness = await computeUatReadiness(id);
    if (!readiness.cycle) return res.status(404).json({ ok: false, message: 'UAT cycle not found.' });
    return res.json({ ok: true, ...readiness });
  } catch (error) { return next(error); }
});

router.post('/phase10/cycles', async (req, res, next) => {
  try {
    if (!await phase10Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 10 payroll schema first.' });
    const testId = Number(req.body?.testId);
    const cycleCode = cleanText(req.body?.cycleCode, 60).toUpperCase();
    const scopeStatement = cleanText(req.body?.scopeStatement, 255);
    if (!Number.isInteger(testId) || testId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(cycleCode)
      || scopeStatement.length < 10) {
      return res.status(422).json({ ok: false, message: 'Select an approved parallel test and enter a valid UAT code and scope.' });
    }
    const phase9 = await computeCutoverReadiness(testId);
    if (!phase9.test) return res.status(404).json({ ok: false, message: 'Parallel payroll test not found.' });
    if (!phase9.ready) return res.status(409).json({ ok: false, message: 'All Phase 9 cutover gates and signoffs must be complete before UAT starts.' });
    const result = await db.execute(`INSERT INTO payroll_uat_cycles
      (test_id,cycle_code,scope_statement,created_by) VALUES (?,?,?,?)`,
    [testId, cycleCode, scopeStatement, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'CREATE','PAYROLL_UAT_CYCLE',?,?)`, [req.user.usercode, String(result.insertId),
      JSON.stringify({ testId, cycleCode, scopeStatement })]);
    return res.status(201).json({ ok: true, id: result.insertId, message: 'UAT cycle opened.' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'UAT cycle code already exists.' });
    return next(error);
  }
});

router.post('/phase10/cycles/:id/cases', async (req, res, next) => {
  try {
    if (!await phase10Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 10 payroll schema first.' });
    const cycleId = Number(req.params.id);
    const caseCode = cleanText(req.body?.caseCode, 60).toUpperCase();
    const caseType = cleanText(req.body?.caseType, 30).toUpperCase();
    const scenario = cleanText(req.body?.scenario, 255);
    const expectedResult = cleanText(req.body?.expectedResult, 500);
    const actualResult = cleanText(req.body?.actualResult, 500);
    const status = cleanText(req.body?.status, 20).toUpperCase();
    const evidenceReference = cleanText(req.body?.evidenceReference, 255) || null;
    if (!Number.isInteger(cycleId) || cycleId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(caseCode)
      || !UAT_CASE_TYPES.includes(caseType) || scenario.length < 5 || expectedResult.length < 3
      || actualResult.length < 3 || !['PENDING', 'PASSED', 'FAILED', 'BLOCKED'].includes(status)
      || (status === 'PASSED' && !evidenceReference)) {
      return res.status(422).json({ ok: false, message: 'Complete the UAT case, result, status, and passed-case evidence.' });
    }
    const cycle = await db.queryOne(`SELECT c.id,a.id authorization_id FROM payroll_uat_cycles c
      LEFT JOIN payroll_go_live_authorizations a ON a.cycle_id=c.id WHERE c.id=? LIMIT 1`, [cycleId]);
    if (!cycle) return res.status(404).json({ ok: false, message: 'UAT cycle not found.' });
    if (cycle.authorization_id) return res.status(409).json({ ok: false, message: 'Authorized UAT evidence is immutable.' });
    await db.execute(`INSERT INTO payroll_uat_cases
      (cycle_id,case_code,case_type,scenario,expected_result,actual_result,status,evidence_reference,executed_by)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE case_type=VALUES(case_type),scenario=VALUES(scenario),
      expected_result=VALUES(expected_result),actual_result=VALUES(actual_result),status=VALUES(status),
      evidence_reference=VALUES(evidence_reference),executed_by=VALUES(executed_by),executed_at=CURRENT_TIMESTAMP`,
    [cycleId, caseCode, caseType, scenario, expectedResult, actualResult, status, evidenceReference, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'RECORD','PAYROLL_UAT_CASE',?,?)`, [req.user.usercode, `${cycleId}:${caseCode}`,
      JSON.stringify({ caseType, status, evidenceReference })]);
    return res.json({ ok: true, message: `UAT case ${caseCode} recorded as ${status.toLowerCase()}.` });
  } catch (error) { return next(error); }
});

router.post('/phase10/cycles/:id/issues', async (req, res, next) => {
  try {
    if (!await phase10Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 10 payroll schema first.' });
    const cycleId = Number(req.params.id);
    const issueCode = cleanText(req.body?.issueCode, 60).toUpperCase();
    const severity = cleanText(req.body?.severity, 20).toUpperCase();
    const summary = cleanText(req.body?.summary, 255);
    const resolution = cleanText(req.body?.resolution, 500) || null;
    const status = cleanText(req.body?.status, 20).toUpperCase();
    if (!Number.isInteger(cycleId) || cycleId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(issueCode)
      || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) || summary.length < 5
      || !['OPEN', 'RESOLVED', 'ACCEPTED_RISK'].includes(status) || (status !== 'OPEN' && !resolution)) {
      return res.status(422).json({ ok: false, message: 'Complete the issue details and provide a resolution before closing it.' });
    }
    const cycle = await db.queryOne(`SELECT c.id,a.id authorization_id FROM payroll_uat_cycles c
      LEFT JOIN payroll_go_live_authorizations a ON a.cycle_id=c.id WHERE c.id=? LIMIT 1`, [cycleId]);
    if (!cycle) return res.status(404).json({ ok: false, message: 'UAT cycle not found.' });
    if (cycle.authorization_id) return res.status(409).json({ ok: false, message: 'Authorized UAT evidence is immutable.' });
    const resolvedBy = status === 'OPEN' ? null : req.user.usercode;
    await db.execute(`INSERT INTO payroll_uat_issues
      (cycle_id,issue_code,severity,summary,resolution,status,recorded_by,resolved_by,resolved_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE severity=VALUES(severity),summary=VALUES(summary),
      resolution=VALUES(resolution),status=VALUES(status),resolved_by=VALUES(resolved_by),resolved_at=VALUES(resolved_at)`,
    [cycleId, issueCode, severity, summary, resolution, status, req.user.usercode, resolvedBy, resolvedBy ? new Date() : null]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'RECORD','PAYROLL_UAT_ISSUE',?,?)`, [req.user.usercode, `${cycleId}:${issueCode}`,
      JSON.stringify({ severity, status, resolution })]);
    return res.json({ ok: true, message: `UAT issue ${issueCode} recorded as ${status.toLowerCase().replace('_', ' ')}.` });
  } catch (error) { return next(error); }
});

router.post('/phase10/cycles/:id/authorize', async (req, res, next) => {
  let connection;
  try {
    if (!await phase10Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 10 payroll schema first.' });
    const cycleId = Number(req.params.id);
    const authorizationCode = cleanText(req.body?.authorizationCode, 60).toUpperCase();
    const scheduledAt = cleanText(req.body?.scheduledAt, 16);
    const rollbackReference = cleanText(req.body?.rollbackReference, 255);
    const statement = cleanText(req.body?.statement, 500);
    const scheduledMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(scheduledAt);
    const scheduledValid = Boolean(scheduledMatch && isIsoDate(scheduledMatch[1])
      && Number(scheduledMatch[2]) <= 23 && Number(scheduledMatch[3]) <= 59);
    if (!Number.isInteger(cycleId) || cycleId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(authorizationCode)
      || !scheduledValid || rollbackReference.length < 3
      || statement.length < 10 || req.body?.confirm !== true) {
      return res.status(422).json({ ok: false, message: 'Complete the authorization, schedule, rollback reference, statement, and confirmation.' });
    }
    const readiness = await computeUatReadiness(cycleId);
    if (!readiness.cycle) return res.status(404).json({ ok: false, message: 'UAT cycle not found.' });
    if (!readiness.baseReady) return res.status(409).json({ ok: false, message: 'All Phase 10 UAT gates must pass before authorization.' });
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [insert] = await connection.execute(`INSERT INTO payroll_go_live_authorizations
      (cycle_id,authorization_code,scheduled_at,rollback_reference,statement,authorized_by)
      VALUES (?,?,?,?,?,?)`, [cycleId, authorizationCode, scheduledAt.replace('T', ' '), rollbackReference,
      statement, req.user.usercode]);
    await connection.execute("UPDATE payroll_uat_cycles SET status='AUTHORIZED' WHERE id=?", [cycleId]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'AUTHORIZE','PAYROLL_GO_LIVE',?,?)`, [req.user.usercode, String(insert.insertId),
      JSON.stringify({ cycleId, authorizationCode, scheduledAt, rollbackReference, statement })]);
    await connection.commit();
    return res.json({ ok: true, message: 'Controlled go-live authorization recorded. No production switch was executed.' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'This UAT cycle or authorization code is already authorized.' });
    return next(error);
  } finally { connection?.release(); }
});

router.get('/phase11/windows', async (_req, res, next) => {
  try {
    if (!await phase11Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 11 payroll schema first.' });
    const [items, authorizations] = await Promise.all([db.queryAll(`SELECT w.*,a.authorization_code,a.cycle_id,c.cycle_code,
      (SELECT COUNT(*) FROM payroll_operation_incidents i WHERE i.window_id=w.id AND i.status='OPEN') open_incident_count,
      (SELECT COUNT(*) FROM payroll_operation_actions x WHERE x.window_id=w.id AND x.status IN ('REQUESTED','APPROVED')) pending_action_count
      FROM payroll_production_windows w JOIN payroll_go_live_authorizations a ON a.id=w.authorization_id
      JOIN payroll_uat_cycles c ON c.id=a.cycle_id ORDER BY w.id DESC LIMIT 50`),
    db.queryAll(`SELECT a.id,a.authorization_code,a.scheduled_at,c.cycle_code
      FROM payroll_go_live_authorizations a JOIN payroll_uat_cycles c ON c.id=a.cycle_id
      LEFT JOIN payroll_production_windows w ON w.authorization_id=a.id
      WHERE w.id IS NULL ORDER BY a.id DESC LIMIT 50`)]);
    return res.json({ ok: true, items, authorizations });
  } catch (error) { return next(error); }
});

router.post('/phase11/windows', async (req, res, next) => {
  try {
    if (!await phase11Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 11 payroll schema first.' });
    const authorizationId = Number(req.body?.authorizationId);
    const windowCode = cleanText(req.body?.windowCode, 60).toUpperCase();
    const periodStart = cleanText(req.body?.periodStart, 10);
    const periodEnd = cleanText(req.body?.periodEnd, 10);
    const cutoffAt = cleanText(req.body?.cutoffAt, 16);
    if (!Number.isInteger(authorizationId) || authorizationId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(windowCode)
      || !isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd || !isLocalDateTime(cutoffAt)) {
      return res.status(422).json({ ok: false, message: 'Select an authorization and enter a valid production window, period, and cutoff.' });
    }
    const authorization = await db.queryOne('SELECT * FROM payroll_go_live_authorizations WHERE id=? LIMIT 1', [authorizationId]);
    if (!authorization) return res.status(404).json({ ok: false, message: 'Go-live authorization not found.' });
    const uat = await computeUatReadiness(authorization.cycle_id);
    if (!uat.ready) return res.status(409).json({ ok: false, message: 'The linked Phase 10 authorization is no longer fully ready.' });
    const result = await db.execute(`INSERT INTO payroll_production_windows
      (authorization_id,window_code,period_start,period_end,cutoff_at,created_by)
      VALUES (?,?,?,?,?,?)`, [authorizationId, windowCode, periodStart, periodEnd, cutoffAt.replace('T', ' '), req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'CREATE','PAYROLL_PRODUCTION_WINDOW',?,?)`, [req.user.usercode, String(result.insertId),
      JSON.stringify({ authorizationId, windowCode, periodStart, periodEnd, cutoffAt })]);
    return res.status(201).json({ ok: true, id: result.insertId, message: 'Production operations window planned. Nothing was activated externally.' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'That authorization or production window code is already in use.' });
    return next(error);
  }
});

router.post('/phase11/windows/:id/checklists', async (req, res, next) => {
  try {
    if (!await phase11Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 11 payroll schema first.' });
    const windowId = Number(req.params.id);
    const stage = cleanText(req.body?.stage, 20).toUpperCase();
    const itemCode = cleanText(req.body?.itemCode, 60).toUpperCase();
    const itemLabel = cleanText(req.body?.itemLabel, 255);
    const status = cleanText(req.body?.status, 30).toUpperCase();
    const evidenceReference = cleanText(req.body?.evidenceReference, 255) || null;
    const allowedItems = stage === 'PRE_RUN' ? PRE_RUN_ITEMS : stage === 'POST_RUN' ? POST_RUN_ITEMS : [];
    if (!Number.isInteger(windowId) || windowId < 1 || !['PRE_RUN', 'POST_RUN'].includes(stage)
      || !allowedItems.includes(itemCode) || itemLabel.length < 3
      || !['PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE'].includes(status)
      || (status === 'PASSED' && !evidenceReference)) {
      return res.status(422).json({ ok: false, message: 'Complete the checklist item and provide evidence for a passed result.' });
    }
    const window = await db.queryOne('SELECT id,status FROM payroll_production_windows WHERE id=? LIMIT 1', [windowId]);
    if (!window) return res.status(404).json({ ok: false, message: 'Production operations window not found.' });
    if (window.status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Closed production evidence is immutable.' });
    await db.execute(`INSERT INTO payroll_operation_checklists
      (window_id,stage,item_code,item_label,status,evidence_reference,checked_by)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE item_label=VALUES(item_label),status=VALUES(status),
      evidence_reference=VALUES(evidence_reference),checked_by=VALUES(checked_by),checked_at=CURRENT_TIMESTAMP`,
    [windowId, stage, itemCode, itemLabel, status, evidenceReference, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'RECORD','PAYROLL_OPERATION_CHECK',?,?)`, [req.user.usercode, `${windowId}:${stage}:${itemCode}`,
      JSON.stringify({ status, evidenceReference })]);
    return res.json({ ok: true, message: `${stage.replace('_', ' ')} checklist item recorded.` });
  } catch (error) { return next(error); }
});

router.post('/phase11/windows/:id/incidents', async (req, res, next) => {
  try {
    if (!await phase11Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 11 payroll schema first.' });
    const windowId = Number(req.params.id);
    const incidentCode = cleanText(req.body?.incidentCode, 60).toUpperCase();
    const severity = cleanText(req.body?.severity, 20).toUpperCase();
    const summary = cleanText(req.body?.summary, 255);
    const status = cleanText(req.body?.status, 20).toUpperCase();
    const resolution = cleanText(req.body?.resolution, 500) || null;
    if (!Number.isInteger(windowId) || windowId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(incidentCode)
      || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) || summary.length < 5
      || !['OPEN', 'RESOLVED'].includes(status) || (status === 'RESOLVED' && !resolution)) {
      return res.status(422).json({ ok: false, message: 'Complete the incident and provide a resolution before resolving it.' });
    }
    const window = await db.queryOne('SELECT id,status FROM payroll_production_windows WHERE id=? LIMIT 1', [windowId]);
    if (!window) return res.status(404).json({ ok: false, message: 'Production operations window not found.' });
    if (window.status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Closed production evidence is immutable.' });
    const resolver = status === 'RESOLVED' ? req.user.usercode : null;
    await db.execute(`INSERT INTO payroll_operation_incidents
      (window_id,incident_code,severity,summary,status,resolution,recorded_by,resolved_by,resolved_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE severity=VALUES(severity),summary=VALUES(summary),
      status=VALUES(status),resolution=VALUES(resolution),resolved_by=VALUES(resolved_by),resolved_at=VALUES(resolved_at)`,
    [windowId, incidentCode, severity, summary, status, resolution, req.user.usercode, resolver, resolver ? new Date() : null]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'RECORD','PAYROLL_OPERATION_INCIDENT',?,?)`, [req.user.usercode, `${windowId}:${incidentCode}`,
      JSON.stringify({ severity, status, resolution })]);
    return res.json({ ok: true, message: `Production incident ${incidentCode} recorded as ${status.toLowerCase()}.` });
  } catch (error) { return next(error); }
});

router.post('/phase11/windows/:id/actions', async (req, res, next) => {
  try {
    if (!await phase11Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 11 payroll schema first.' });
    const windowId = Number(req.params.id);
    const actionCode = cleanText(req.body?.actionCode, 60).toUpperCase();
    const actionType = cleanText(req.body?.actionType, 20).toUpperCase();
    const reason = cleanText(req.body?.reason, 500);
    const status = cleanText(req.body?.status, 20).toUpperCase();
    const authorityReference = cleanText(req.body?.authorityReference, 255) || null;
    const evidenceReference = cleanText(req.body?.evidenceReference, 255) || null;
    if (!Number.isInteger(windowId) || windowId < 1 || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(actionCode)
      || !['CORRECTION', 'REVERSAL', 'OFF_CYCLE', 'RECOVERY'].includes(actionType) || reason.length < 10
      || !['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'].includes(status)
      || (['APPROVED', 'COMPLETED'].includes(status) && !authorityReference) || (status === 'COMPLETED' && !evidenceReference)) {
      return res.status(422).json({ ok: false, message: 'Complete the operational action, authority, and completion evidence as required.' });
    }
    const window = await db.queryOne('SELECT id,status FROM payroll_production_windows WHERE id=? LIMIT 1', [windowId]);
    if (!window) return res.status(404).json({ ok: false, message: 'Production operations window not found.' });
    if (window.status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Closed production evidence is immutable.' });
    await db.execute(`INSERT INTO payroll_operation_actions
      (window_id,action_code,action_type,reason,status,authority_reference,evidence_reference,recorded_by)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE action_type=VALUES(action_type),reason=VALUES(reason),
      status=VALUES(status),authority_reference=VALUES(authority_reference),evidence_reference=VALUES(evidence_reference),
      recorded_by=VALUES(recorded_by),recorded_at=CURRENT_TIMESTAMP`,
    [windowId, actionCode, actionType, reason, status, authorityReference, evidenceReference, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'RECORD','PAYROLL_OPERATION_ACTION',?,?)`, [req.user.usercode, `${windowId}:${actionCode}`,
      JSON.stringify({ actionType, status, authorityReference, evidenceReference })]);
    return res.json({ ok: true, message: `${actionType.replace('_', ' ')} action recorded as ${status.toLowerCase()}.` });
  } catch (error) { return next(error); }
});

router.post('/phase11/windows/:id/status', async (req, res, next) => {
  try {
    if (!await phase11Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 11 payroll schema first.' });
    const windowId = Number(req.params.id);
    const target = cleanText(req.body?.status, 20).toUpperCase();
    const statement = cleanText(req.body?.statement, 500);
    if (!Number.isInteger(windowId) || windowId < 1 || !['ACTIVE', 'HOLD', 'CLOSED'].includes(target)
      || statement.length < 10 || req.body?.confirm !== true) {
      return res.status(422).json({ ok: false, message: 'Select an operational status, enter the control statement, and confirm it.' });
    }
    const readiness = await computeOperationsReadiness(windowId);
    if (!readiness.window) return res.status(404).json({ ok: false, message: 'Production operations window not found.' });
    const transitions = { PLANNED: ['ACTIVE', 'HOLD'], ACTIVE: ['HOLD', 'CLOSED'], HOLD: ['ACTIVE', 'CLOSED'], CLOSED: [] };
    if (!transitions[readiness.window.status]?.includes(target)) {
      return res.status(409).json({ ok: false, message: `Cannot change ${readiness.window.status} to ${target}.` });
    }
    if (target === 'ACTIVE' && !readiness.activationReady) {
      return res.status(409).json({ ok: false, message: 'Authorization, pre-run checks, and incident gates must pass before recording active status.' });
    }
    if (target === 'CLOSED' && !readiness.closeReady) {
      return res.status(409).json({ ok: false, message: 'Post-run checks, incidents, and operational actions must be complete before closing.' });
    }
    await db.execute('UPDATE payroll_production_windows SET status=?,status_by=?,status_at=CURRENT_TIMESTAMP WHERE id=?',
      [target, req.user.usercode, windowId]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'STATUS','PAYROLL_PRODUCTION_WINDOW',?,?)`, [req.user.usercode, String(windowId),
      JSON.stringify({ from: readiness.window.status, to: target, statement, externalActivation: false })]);
    return res.json({ ok: true, message: `Production operations status recorded as ${target.toLowerCase()}. No external system was activated.` });
  } catch (error) { return next(error); }
});

router.get('/phase12/periods', async (_req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const items = await db.queryAll(`SELECT p.*,
      (SELECT COUNT(*) FROM payroll_compliance_reports r WHERE r.period_id=p.id AND r.status<>'AMENDED') report_count,
      (SELECT COUNT(*) FROM payroll_compliance_reports r WHERE r.period_id=p.id AND r.status='FILED') filed_count,
      (SELECT COUNT(*) FROM payroll_year_end_records y WHERE y.period_id=p.id) year_end_count
      FROM payroll_compliance_periods p ORDER BY p.calendar_year DESC,p.calendar_month DESC,p.id DESC LIMIT 50`);
    return res.json({ ok: true, items });
  } catch (error) { return next(error); }
});

router.post('/phase12/periods', async (req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const periodCode = cleanText(req.body?.periodCode, 60).toUpperCase();
    const periodType = cleanText(req.body?.periodType, 20).toUpperCase();
    const year = Number(req.body?.year);
    const month = periodType === 'MONTHLY' ? Number(req.body?.month) : null;
    const note = cleanText(req.body?.note, 255);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(periodCode) || !['MONTHLY', 'YEAR_END'].includes(periodType)
      || !Number.isInteger(year) || year < 2000 || year > 2100
      || (periodType === 'MONTHLY' && (!Number.isInteger(month) || month < 1 || month > 12)) || note.length < 5) {
      return res.status(422).json({ ok: false, message: 'Enter a valid compliance period code, type, calendar period, and note.' });
    }
    const periodKey = periodType === 'MONTHLY' ? `${year}-${String(month).padStart(2, '0')}` : `${year}-YE`;
    const result = await db.execute(`INSERT INTO payroll_compliance_periods
      (period_code,period_key,period_type,calendar_year,calendar_month,note,created_by)
      VALUES (?,?,?,?,?,?,?)`, [periodCode, periodKey, periodType, year, month, note, req.user.usercode]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'CREATE','PAYROLL_COMPLIANCE_PERIOD',?,?)`, [req.user.usercode, String(result.insertId),
      JSON.stringify({ periodCode, periodKey, periodType, year, month, note })]);
    return res.status(201).json({ ok: true, id: result.insertId, message: 'Compliance period opened.' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'That compliance period already exists.' });
    return next(error);
  }
});

router.post('/phase12/periods/:id/reports', async (req, res, next) => {
  let connection;
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const periodId = Number(req.params.id);
    const runId = Number(req.body?.runId);
    const agency = cleanText(req.body?.agency, 20).toUpperCase();
    const reportType = cleanText(req.body?.reportType, 80).toUpperCase();
    const reportCode = cleanText(req.body?.reportCode, 60).toUpperCase();
    const amendmentOfId = Number(req.body?.amendmentOfId || 0) || null;
    const componentCodes = [...new Set((Array.isArray(req.body?.componentCodes) ? req.body.componentCodes : [])
      .map((value) => cleanText(value, 40).toUpperCase()).filter(Boolean))];
    if (!Number.isInteger(periodId) || periodId < 1 || !Number.isInteger(runId) || runId < 1
      || !['SSS', 'PHILHEALTH', 'PAGIBIG', 'BIR', 'OTHER'].includes(agency) || reportType.length < 3
      || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(reportCode) || componentCodes.length < 1 || componentCodes.length > 20
      || componentCodes.some((code) => !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code))) {
      return res.status(422).json({ ok: false, message: 'Select a period and released run, then provide the agency, report code, and approved statutory component codes.' });
    }
    const [period, run] = await Promise.all([
      db.queryOne('SELECT * FROM payroll_compliance_periods WHERE id=? LIMIT 1', [periodId]),
      db.queryOne('SELECT id,run_code,pay_date,status FROM payroll_runs WHERE id=? LIMIT 1', [runId]),
    ]);
    if (!period) return res.status(404).json({ ok: false, message: 'Compliance period not found.' });
    if (period.status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Closed compliance evidence is immutable.' });
    if (!run || run.status !== 'RELEASED') return res.status(409).json({ ok: false, message: 'Compliance reports require a released payroll run.' });
    const payDate = String(run.pay_date).slice(0, 10);
    if (Number(payDate.slice(0, 4)) !== Number(period.calendar_year)
      || (period.period_type === 'MONTHLY' && Number(payDate.slice(5, 7)) !== Number(period.calendar_month))) {
      return res.status(409).json({ ok: false, message: 'The released run pay date is outside the selected compliance period.' });
    }
    const placeholders = componentCodes.map(() => '?').join(',');
    const configured = await db.queryOne(`SELECT COUNT(DISTINCT component_code) total FROM payroll_components
      WHERE is_active=1 AND is_statutory=1 AND component_code IN (${placeholders})`, componentCodes);
    if (Number(configured?.total || 0) !== componentCodes.length) {
      return res.status(409).json({ ok: false, message: 'Every selected component must be an active approved statutory deduction.' });
    }
    let amendment = null;
    if (amendmentOfId) {
      amendment = await db.queryOne(`SELECT id,status,period_id FROM payroll_compliance_reports WHERE id=? LIMIT 1`, [amendmentOfId]);
      if (!amendment || amendment.status !== 'FILED' || Number(amendment.period_id) !== periodId) {
        return res.status(409).json({ ok: false, message: 'An amendment must reference a filed report in the same period.' });
      }
    }
    const items = await db.queryAll(`SELECT e.usercode,e.employee_name,SUM(i.amount) amount
      FROM payroll_run_items i JOIN payroll_run_employees e ON e.id=i.run_employee_id
      WHERE e.run_id=? AND i.component_type='DEDUCTION' AND i.component_code IN (${placeholders})
      GROUP BY e.usercode,e.employee_name HAVING SUM(i.amount)>0 ORDER BY e.usercode`, [runId, ...componentCodes]);
    if (!items.length) return res.status(409).json({ ok: false, message: 'The released run has no amounts for the selected statutory components.' });
    const normalized = items.map((item) => ({ usercode: item.usercode, employeeName: item.employee_name,
      amount: formatCents(parseNonnegativeMoneyToCents(item.amount)) }));
    const total = normalized.reduce((sum, item) => sum + parseNonnegativeMoneyToCents(item.amount), 0n);
    const sourceSha256 = hashRegister({ runId, componentCodes, items: normalized });
    connection = await db.getConnection(); await connection.beginTransaction();
    const [insert] = await connection.execute(`INSERT INTO payroll_compliance_reports
      (period_id,run_id,agency,report_type,report_code,amendment_of_id,component_codes_json,
      employee_count,total_amount,source_sha256,prepared_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [periodId, runId, agency, reportType, reportCode, amendmentOfId, JSON.stringify(componentCodes),
      normalized.length, formatCents(total), sourceSha256, req.user.usercode]);
    for (const item of normalized) await connection.execute(`INSERT INTO payroll_compliance_report_items
      (report_id,usercode,employee_name,amount) VALUES (?,?,?,?)`,
    [insert.insertId, item.usercode, item.employeeName, item.amount]);
    if (amendment) await connection.execute("UPDATE payroll_compliance_reports SET status='AMENDED',status_by=?,status_at=CURRENT_TIMESTAMP WHERE id=?",
      [req.user.usercode, amendment.id]);
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'PREPARE','PAYROLL_COMPLIANCE_REPORT',?,?)`, [req.user.usercode, String(insert.insertId),
      JSON.stringify({ periodId, runId, agency, reportType, reportCode, amendmentOfId, componentCodes, sourceSha256 })]);
    await connection.commit();
    return res.status(201).json({ ok: true, id: insert.insertId, message: 'Compliance report evidence prepared. No filing was submitted.' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'Compliance report code already exists.' });
    return next(error);
  } finally { connection?.release(); }
});

router.post('/phase12/reports/:id/status', async (req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const reportId = Number(req.params.id);
    const target = cleanText(req.body?.status, 20).toUpperCase();
    const filingReference = cleanText(req.body?.filingReference, 255) || null;
    const filingDate = cleanText(req.body?.filingDate, 10) || null;
    if (!Number.isInteger(reportId) || reportId < 1 || !['VERIFIED', 'FILED'].includes(target)
      || req.body?.confirm !== true || (target === 'FILED' && (!filingReference || !isIsoDate(filingDate)))) {
      return res.status(422).json({ ok: false, message: 'Select a valid report status and provide the confirmed filing reference and date when filed.' });
    }
    const report = await db.queryOne(`SELECT r.*,p.status period_status FROM payroll_compliance_reports r
      JOIN payroll_compliance_periods p ON p.id=r.period_id WHERE r.id=? LIMIT 1`, [reportId]);
    if (!report) return res.status(404).json({ ok: false, message: 'Compliance report not found.' });
    if (report.period_status === 'CLOSED' || report.status === 'AMENDED') return res.status(409).json({ ok: false, message: 'This compliance evidence is immutable.' });
    const transitions = { DRAFT: ['VERIFIED'], VERIFIED: ['FILED'], FILED: [], AMENDED: [] };
    if (!transitions[report.status]?.includes(target)) return res.status(409).json({ ok: false, message: `Cannot change ${report.status} to ${target}.` });
    const items = await db.queryAll('SELECT usercode,employee_name,amount FROM payroll_compliance_report_items WHERE report_id=? ORDER BY usercode', [reportId]);
    const normalized = items.map((item) => ({ usercode: item.usercode, employeeName: item.employee_name,
      amount: formatCents(parseNonnegativeMoneyToCents(item.amount)) }));
    const evidence = hashRegister({ runId: report.run_id, componentCodes: JSON.parse(report.component_codes_json), items: normalized });
    if (evidence !== report.source_sha256) return res.status(409).json({ ok: false, message: 'Stored compliance evidence hash does not match.' });
    await db.execute(`UPDATE payroll_compliance_reports SET status=?,filing_reference=?,filing_date=?,
      status_by=?,status_at=CURRENT_TIMESTAMP WHERE id=?`, [target, filingReference, filingDate, req.user.usercode, reportId]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'STATUS','PAYROLL_COMPLIANCE_REPORT',?,?)`, [req.user.usercode, String(reportId),
      JSON.stringify({ from: report.status, to: target, filingReference, filingDate, externalSubmission: false })]);
    return res.json({ ok: true, message: `Compliance report recorded as ${target.toLowerCase()}. No external filing was submitted.` });
  } catch (error) { return next(error); }
});

router.get('/phase12/reports/:id.csv', async (req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const reportId = Number(req.params.id);
    const report = Number.isInteger(reportId) ? await db.queryOne('SELECT * FROM payroll_compliance_reports WHERE id=? LIMIT 1', [reportId]) : null;
    if (!report) return res.status(404).json({ ok: false, message: 'Compliance report not found.' });
    const items = await db.queryAll('SELECT usercode,employee_name,amount FROM payroll_compliance_report_items WHERE report_id=? ORDER BY usercode', [reportId]);
    const rows = [['report_code', 'agency', 'report_type', 'usercode', 'employee_name', 'amount'],
      ...items.map((item) => [report.report_code, report.agency, report.report_type, item.usercode, item.employee_name, item.amount])];
    res.type('text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${report.report_code}-controlled.csv"`);
    return res.send(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
  } catch (error) { return next(error); }
});

router.post('/phase12/periods/:id/year-end', async (req, res, next) => {
  let connection;
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const periodId = Number(req.params.id);
    const withholdingCodes = [...new Set((Array.isArray(req.body?.withholdingCodes) ? req.body.withholdingCodes : [])
      .map((value) => cleanText(value, 40).toUpperCase()).filter(Boolean))];
    if (!Number.isInteger(periodId) || periodId < 1 || withholdingCodes.length < 1 || withholdingCodes.length > 20
      || withholdingCodes.some((code) => !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code))) {
      return res.status(422).json({ ok: false, message: 'Select a year-end period and approved withholding component codes.' });
    }
    const period = await db.queryOne('SELECT * FROM payroll_compliance_periods WHERE id=? LIMIT 1', [periodId]);
    if (!period) return res.status(404).json({ ok: false, message: 'Compliance period not found.' });
    if (period.period_type !== 'YEAR_END' || period.status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Select an open year-end compliance period.' });
    const placeholders = withholdingCodes.map(() => '?').join(',');
    const configured = await db.queryOne(`SELECT COUNT(DISTINCT component_code) total FROM payroll_components
      WHERE is_active=1 AND is_statutory=1 AND component_code IN (${placeholders})`, withholdingCodes);
    if (Number(configured?.total || 0) !== withholdingCodes.length) return res.status(409).json({ ok: false, message: 'Every withholding code must be an active approved statutory deduction.' });
    const locked = await db.queryOne(`SELECT COUNT(*) total FROM payroll_year_end_records
      WHERE period_id=? AND status<>'DRAFT'`, [periodId]);
    if (Number(locked?.total || 0) > 0) return res.status(409).json({ ok: false, message: 'Verified or issued annual records cannot be regenerated.' });
    const records = await db.queryAll(`SELECT e.usercode,MAX(e.employee_name) employee_name,
      SUM(e.gross_pay) gross_amount,SUM(e.deduction_total) deduction_amount,SUM(COALESCE(w.amount,0)) withholding_amount,
      SUM(e.net_pay) net_amount FROM payroll_run_employees e JOIN payroll_runs r ON r.id=e.run_id
      LEFT JOIN (SELECT run_employee_id,SUM(amount) amount FROM payroll_run_items
        WHERE component_type='DEDUCTION' AND component_code IN (${placeholders}) GROUP BY run_employee_id) w ON w.run_employee_id=e.id
      WHERE r.status='RELEASED' AND YEAR(r.pay_date)=? GROUP BY e.usercode ORDER BY e.usercode`,
    [...withholdingCodes, period.calendar_year]);
    if (!records.length) return res.status(409).json({ ok: false, message: 'No released payroll records exist for the selected year.' });
    connection = await db.getConnection(); await connection.beginTransaction();
    await connection.execute('DELETE FROM payroll_year_end_records WHERE period_id=? AND status=\'DRAFT\'', [periodId]);
    for (const record of records) {
      const normalized = { year: period.calendar_year, withholdingCodes, usercode: record.usercode,
        gross: formatCents(parseNonnegativeMoneyToCents(record.gross_amount)),
        deductions: formatCents(parseNonnegativeMoneyToCents(record.deduction_amount)),
        withholding: formatCents(parseNonnegativeMoneyToCents(record.withholding_amount)),
        net: formatCents(parseNonnegativeMoneyToCents(record.net_amount)) };
      await connection.execute(`INSERT INTO payroll_year_end_records
        (period_id,usercode,employee_name,withholding_codes_json,gross_amount,deduction_amount,withholding_amount,net_amount,source_sha256,generated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [periodId, record.usercode, record.employee_name, JSON.stringify(withholdingCodes), normalized.gross,
        normalized.deductions, normalized.withholding, normalized.net, hashRegister(normalized), req.user.usercode]);
    }
    await connection.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'GENERATE','PAYROLL_YEAR_END',?,?)`, [req.user.usercode, String(periodId),
      JSON.stringify({ year: period.calendar_year, withholdingCodes, employeeCount: records.length })]);
    await connection.commit();
    return res.json({ ok: true, message: `Generated ${records.length} annual payroll records. No official form was filed.` });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally { connection?.release(); }
});

router.post('/phase12/year-end/:id/status', async (req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const recordId = Number(req.params.id);
    const target = cleanText(req.body?.status, 20).toUpperCase();
    const issueReference = cleanText(req.body?.issueReference, 255) || null;
    if (!Number.isInteger(recordId) || recordId < 1 || !['VERIFIED', 'ISSUED'].includes(target)
      || req.body?.confirm !== true || (target === 'ISSUED' && !issueReference)) {
      return res.status(422).json({ ok: false, message: 'Select a valid annual-record status and provide an issuance reference when issued.' });
    }
    const record = await db.queryOne(`SELECT y.*,p.status period_status,p.calendar_year FROM payroll_year_end_records y
      JOIN payroll_compliance_periods p ON p.id=y.period_id WHERE y.id=? LIMIT 1`, [recordId]);
    if (!record) return res.status(404).json({ ok: false, message: 'Annual payroll record not found.' });
    if (record.period_status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Closed annual evidence is immutable.' });
    const transitions = { DRAFT: ['VERIFIED'], VERIFIED: ['ISSUED'], ISSUED: [] };
    if (!transitions[record.status]?.includes(target)) return res.status(409).json({ ok: false, message: `Cannot change ${record.status} to ${target}.` });
    const evidence = hashRegister({ year: record.calendar_year, withholdingCodes: JSON.parse(record.withholding_codes_json),
      usercode: record.usercode, gross: formatCents(parseNonnegativeMoneyToCents(record.gross_amount)),
      deductions: formatCents(parseNonnegativeMoneyToCents(record.deduction_amount)),
      withholding: formatCents(parseNonnegativeMoneyToCents(record.withholding_amount)),
      net: formatCents(parseNonnegativeMoneyToCents(record.net_amount)) });
    if (evidence !== record.source_sha256) return res.status(409).json({ ok: false, message: 'Stored annual payroll evidence hash does not match.' });
    await db.execute(`UPDATE payroll_year_end_records SET status=?,issue_reference=?,status_by=?,status_at=CURRENT_TIMESTAMP
      WHERE id=?`, [target, issueReference, req.user.usercode, recordId]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'STATUS','PAYROLL_YEAR_END_RECORD',?,?)`, [req.user.usercode, String(recordId),
      JSON.stringify({ from: record.status, to: target, issueReference, externalSubmission: false })]);
    return res.json({ ok: true, message: `Annual payroll record marked ${target.toLowerCase()}.` });
  } catch (error) { return next(error); }
});

router.get('/phase12/periods/:id/year-end.csv', async (req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const periodId = Number(req.params.id);
    const period = Number.isInteger(periodId) ? await db.queryOne('SELECT * FROM payroll_compliance_periods WHERE id=? LIMIT 1', [periodId]) : null;
    if (!period || period.period_type !== 'YEAR_END') return res.status(404).json({ ok: false, message: 'Year-end compliance period not found.' });
    const items = await db.queryAll(`SELECT usercode,employee_name,gross_amount,deduction_amount,withholding_amount,net_amount,status,issue_reference
      FROM payroll_year_end_records WHERE period_id=? ORDER BY usercode`, [periodId]);
    const rows = [['year', 'usercode', 'employee_name', 'gross', 'deductions', 'withholding', 'net', 'status', 'issue_reference'],
      ...items.map((item) => [period.calendar_year, item.usercode, item.employee_name, item.gross_amount,
        item.deduction_amount, item.withholding_amount, item.net_amount, item.status, item.issue_reference || ''])];
    res.type('text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${period.period_code}-annual-controlled.csv"`);
    return res.send(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
  } catch (error) { return next(error); }
});

router.post('/phase12/periods/:id/close', async (req, res, next) => {
  try {
    if (!await phase12Ready()) return res.status(409).json({ ok: false, message: 'Apply the Phase 12 payroll schema first.' });
    const periodId = Number(req.params.id);
    const statement = cleanText(req.body?.statement, 500);
    if (!Number.isInteger(periodId) || periodId < 1 || statement.length < 10 || req.body?.confirm !== true) {
      return res.status(422).json({ ok: false, message: 'Select a compliance period, enter the close statement, and confirm the irreversible close.' });
    }
    const readiness = await computeComplianceReadiness(periodId);
    if (!readiness.period) return res.status(404).json({ ok: false, message: 'Compliance period not found.' });
    if (readiness.period.status === 'CLOSED') return res.status(409).json({ ok: false, message: 'Compliance period is already closed.' });
    if (!readiness.closeReady) return res.status(409).json({ ok: false, message: 'All current reports must be filed and required annual records issued before closing.' });
    await db.execute("UPDATE payroll_compliance_periods SET status='CLOSED',closed_by=?,closed_at=CURRENT_TIMESTAMP WHERE id=?",
      [req.user.usercode, periodId]);
    await db.execute(`INSERT INTO payroll_audit_log
      (actor_usercode,action_type,entity_type,entity_key,details_json)
      VALUES (?,'CLOSE','PAYROLL_COMPLIANCE_PERIOD',?,?)`, [req.user.usercode, String(periodId), JSON.stringify({ statement })]);
    return res.json({ ok: true, message: 'Compliance period closed. No filing was submitted by this action.' });
  } catch (error) { return next(error); }
});

router.payrollLogic = { calculateOvertime, calculatePayableMinutes, calculatePercentageAmount, prorateAmount,
  csvCell, hashRegister, validStatusTransition, formatSignedCents };
router.employeeProfileLogic = { normalizeDigits, maskIdentifier, validateEmployeeProfileInput };
module.exports = router;
