/**
 * Purpose: Warehouse meter-release queue, fee details, save workflow, and print completion.
 * EDIT GUIDE: FEE_FIELDS mirrors the legacy WinForms grid; workflow writes stay transactional.
 * HUWAG BAGUHIN: print preview is read-only. markMeterPaymentPrinted is the only print-stage write.
 * Tagalog: Hiwalay ang preview sa tunay na print confirmation para hindi maagang umusad ang workflow.
 */
const db = require('../config/database');

const text = (value) => String(value ?? '').trim();
const membershipTable = (name) => `\`membership\`.\`${name}\``;
const CONSUMER_DATABASE_BY_BRANCH = Object.freeze({
  MAIN: 'dbsamelco',
  CATBALOGAN: 'dbsamelco_catbalogan',
  VILLAREAL: 'dbsamelco_villareal',
  BASEY: 'dbsamelco_basey',
});
const CONSUMER_TABLE_BY_TYPE = Object.freeze({
  REGULAR: { tableName: 'master', customerType: 'R' },
  BAPA: { tableName: 'master_bm', customerType: 'B' },
  INDIVIDUAL: { tableName: 'master_bi', customerType: 'I' },
  'NET METER': { tableName: 'master_net', customerType: 'N' },
  'NET METERING': { tableName: 'master_net', customerType: 'N' },
});
const CONSUMER_TABLES = ['master', 'master_bm', 'master_bi', 'master_net'];
const RATE_CODE_BY_CLASSIFICATION = Object.freeze({
  RESIDENTIAL: 'R', COMMERCIAL: 'C', INDUSTRIAL: 'I', 'PUBLIC BUILDING': 'P', 'STREET LIGHT': 'S',
});

const resolveConsumerDestination = (handlingBranch, accountType) => {
  const branch = text(handlingBranch).toUpperCase();
  const type = text(accountType).toUpperCase().replace(/\s+/g, ' ');
  const databaseName = CONSUMER_DATABASE_BY_BRANCH[branch];
  const table = CONSUMER_TABLE_BY_TYPE[type];
  if (!databaseName) throw Object.assign(new Error('Select a valid Handling Branch before Energizing.'), { statusCode: 422 });
  if (!table) throw Object.assign(new Error('Select Regular, BAPA, INDIVIDUAL, or NET METER before Energizing.'), { statusCode: 422 });
  return { databaseName, tableName: table.tableName, customerType: table.customerType };
};

const consumerRateCode = (classification) => {
  const normalized = text(classification).toUpperCase().replace(/\s+/g, ' ');
  const rateCode = RATE_CODE_BY_CLASSIFICATION[normalized];
  if (!rateCode) throw Object.assign(new Error('A valid consumer Classification is required before Energizing.'), { statusCode: 422 });
  return rateCode;
};

const validateEnergizedDate = (value) => {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error('Select a valid Energized date.'), { statusCode: 422 });
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error('Select a valid Energized date.'), { statusCode: 422 });
  }
  return date;
};
const FEE_FIELDS = [
  ['Membership Fee', 'MembeshipFee', 'MembeshipFeeOR', 'MembeshipFeeDate'],
  ['Security Deposit', 'SDeposit', 'SDepositOR', 'SDepositDate'],
  ['Service Fee', 'ServiceFee', 'ServiceFeeOR', 'ServiceFeeDate'],
  ['Inspection Fee', 'InspectionFee', 'InspectionFeeOR', 'InspectionFeeDate'],
  ['Meter', 'Meter', 'MeterOR', 'MeterDate'],
  ['Coop Share', 'CoopShare', 'CoopShareOR', 'CoopShareDate'],
  ['Ground Rod', 'GroundRod', 'GroundRodOR', 'GroundRodDate'],
  ['SD Wire', 'SDWire', 'SDWireOR', 'SDWireDate'],
  ['SEDMA', 'Sedma', 'SedmaOR', 'SedmaDate'],
  ['Meter Box', 'MeterBox', 'MeterBoxOR', 'MeterBoxDate'],
  ['Meter Base', 'MeterBase', 'MeterBaseOR', 'MeterBaseDate'],
  ['Sealing Lead', 'SealingLed', 'SealingLedOR', 'SealingLedDate'],
  ['Transformer', 'Transformer', null, null],
  ['Advance Rental', 'AdvanceRental', null, null],
  ['Installation Fee', 'InstallationFee', null, null],
  ['Cut-out Arrester', 'CutOutArrester', null, null],
  ['ID', 'MemID', 'MemIdOR', 'MemIdDate'],
];

const meterStatusLabel = (status) => {
  const labels = { 0: 'Rejected', 1: 'ISD', 2: 'Fees', 3: 'Warehouse', 4: 'For release', 5: 'Meter saved', 6: 'Completed' };
  return labels[Number(status)] || 'Unknown';
};

const getMeterReadingColumn = async () => {
  const row = await db.queryOne(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA='membership' AND TABLE_NAME='mempayments'
       AND COLUMN_NAME IN ('InitialReading','InitiaReading')
     ORDER BY FIELD(COLUMN_NAME,'InitialReading','InitiaReading') LIMIT 1`
  );
  return row?.COLUMN_NAME || 'InitiaReading';
};

// Warehouse queue branch filter — the 4 offices that process new-connection applications
// (membershipdetais.HandlingBranch), distinct from the member's home-town Area/Book.
const HANDLING_BRANCHES = ['MAIN', 'BASEY', 'VILLAREAL', 'CATBALOGAN'];

const normalizePeriod = (filters = {}) => {
  const now = new Date();
  const month = Number.parseInt(filters.month, 10);
  const year = Number.parseInt(filters.year, 10);
  const branch = text(filters.area).toUpperCase();
  return {
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now.getFullYear(),
    branch: HANDLING_BRANCHES.includes(branch) ? branch : '',
    search: text(filters.search).slice(0, 80),
  };
};

const getMeterPayments = async (filters = {}) => {
  const readingColumn = await getMeterReadingColumn();
  const period = normalizePeriod(filters);
  const rows = await db.queryAll(
    `SELECT m.ApplyID AS id,m.accountnumber AS accountNumber,
            TRIM(CONCAT(COALESCE(d.LastName,''),', ',COALESCE(d.FirstName,''),' ',COALESCE(d.MiddleName,''))) AS fullName,
            COALESCE(TRIM(m.meterbrand),'') AS meterBrand,
            COALESCE(TRIM(m.sealnumber),'') AS sealNumber,
            COALESCE(TRIM(m.ercsealnumber),'') AS ercSealNumber,
            COALESCE(TRIM(m.meterSerialnumber),'') AS meterSerial,
            COALESCE(TRIM(m.\`${readingColumn}\`),'') AS initialReading,
            COALESCE(TRIM(m.userid),'') AS processedBy,
            COALESCE(m.status,0) AS statusCode,
            DATE_FORMAT(m.datecreted,'%Y-%m-%d') AS createdDate,
            w.TSD_DT AS releasedAt,w.ENERGIZED_DT AS energizedAt,
            CASE WHEN w.TSD_DT IS NULL THEN NULL
              ELSE TIMESTAMPDIFF(SECOND,w.TSD_DT,COALESCE(w.ENERGIZED_DT,NOW()))
            END AS releaseElapsedSeconds
     FROM ${membershipTable('mempayments')} m
     LEFT JOIN ${membershipTable('membershipdetais')} d ON m.accountnumber=d.AssignAccountNo
     LEFT JOIN ${membershipTable('membership_workflow')} w ON w.AccountNumber=m.accountnumber
     WHERE YEAR(m.datecreted)=? AND MONTH(m.datecreted)=?
       AND m.accountnumber LIKE ? AND m.status IN (3,4,5,6)
       AND (? = '' OR UPPER(COALESCE(d.HandlingBranch,'')) = ?)
     ORDER BY m.ApplyID DESC LIMIT 500`,
    [period.year, period.month, `${period.search}%`, period.branch, period.branch]
  );
  return rows.map((row) => ({
    ...row,
    releaseElapsedSeconds: row.releaseElapsedSeconds === null ? null : Number(row.releaseElapsedSeconds),
    statusLabel: row.energizedAt ? 'Energized' : row.releasedAt ? 'Released' : meterStatusLabel(row.statusCode),
  }));
};

const validateSelection = (input) => {
  const applyId = Number.parseInt(input?.applyId ?? input?.id, 10);
  const accountNumber = text(input?.accountNumber ?? input?.accountnumber);
  if (!Number.isInteger(applyId) || applyId <= 0) {
    throw Object.assign(new Error('Apply ID is required. Select a row first.'), { statusCode: 422 });
  }
  if (!accountNumber) throw Object.assign(new Error('Account number is required.'), { statusCode: 422 });
  return { applyId, accountNumber };
};

// datetime-local inputs send "2026-08-27T14:30"; MySQL DATETIME wants "2026-08-27 14:30:00".
const toMysqlDatetime = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) throw Object.assign(new Error('Executed date/time is invalid.'), { statusCode: 422 });
  return `${match[1]} ${match[2]}:${match[3] || '00'}`;
};

const validateMeterFields = (input) => {
  const fields = {
    meterBrand: text(input?.meterBrand), sealNumber: text(input?.sealNumber), ercSealNumber: text(input?.ercSealNumber),
    meterSerial: text(input?.meterSerial), initialReading: text(input?.initialReading),
    withdrawnBy: text(input?.withdrawnBy).toUpperCase(),
  };
  Object.entries(fields).forEach(([name, value]) => {
    if (value.length > 100) throw Object.assign(new Error(`${name} must not exceed 100 characters.`), { statusCode: 422 });
  });
  if (fields.initialReading && (!Number.isFinite(Number(fields.initialReading)) || Number(fields.initialReading) < 0)) {
    throw Object.assign(new Error('Initial reading must be a non-negative number.'), { statusCode: 422 });
  }
  fields.executedAt = toMysqlDatetime(input?.executedAt);
  return fields;
};

// Formats a DB datetime value into the "YYYY-MM-DDTHH:MM" a datetime-local input needs, whether
// the driver hands it back as a Date object (normal for a DATETIME column) or as a plain string
// (e.g. if the column ends up typed as text) — either way, this must not throw.
const toDatetimeLocalValue = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${mysqlDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const mysqlDate = (value) => {
  if (!value) return '';
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

// The Fees modal saves the "ID" charge into a generic Other/Price slot (mempayments has no
// dedicated ID-amount column) rather than the legacy MemID column, so the print form's ID row
// must fall back to whichever slot was labeled "ID" to show the amount that was actually charged.
// Kept in sync by hand with membershipService.js's resolveIdFeeAmount.
const resolveIdFeeAmount = (row = {}) => {
  if (Number(row.MemID || 0)) return row.MemID;
  for (let slot = 1; slot <= 5; slot += 1) {
    if (text(row[`Other${slot}`] || '').toUpperCase() === 'ID') {
      return row[`Price${slot}`];
    }
  }
  return row.MemID;
};

const feeItemsFromRow = (row) => FEE_FIELDS.map(([label, amountField, receiptField, dateField]) => ({
  label,
  amount: Number((label === 'ID' ? resolveIdFeeAmount(row) : row?.[amountField]) || 0),
  receipt: receiptField ? text(row?.[receiptField]) : '',
  paidDate: dateField ? mysqlDate(row?.[dateField]) : '',
})).filter((item) => item.amount > 0);

const getMeterPaymentDetails = async (input) => {
  const { applyId, accountNumber } = validateSelection(input);
  const readingColumn = await getMeterReadingColumn();
  const feeColumns = FEE_FIELDS.flatMap(([, amount, receipt, date]) => [amount, receipt, date])
    .filter(Boolean).map((column) => `fees.\`${column}\``).join(',');
  const otherSlotColumns = [1, 2, 3, 4, 5].flatMap((slot) => [`fees.\`Other${slot}\``, `fees.\`Price${slot}\``]).join(',');
  const row = await db.queryOne(
    `SELECT m.ApplyID AS id,m.accountnumber AS accountNumber,fees.TotalAmount AS totalAmount,${otherSlotColumns},
            m.meterbrand AS meterBrand,m.sealnumber AS sealNumber,m.ercsealnumber AS ercSealNumber,
            m.meterSerialnumber AS meterSerial,m.\`${readingColumn}\` AS initialReading,
            m.executedAt AS executedAt,
            m.status AS statusCode,${feeColumns},
            d.LastName,d.FirstName,d.MiddleName,d.ExtensionName,d.Gender,
            DATE_FORMAT(d.Birthday,'%Y-%m-%d') AS birthday,d.Street,d.Membership,
            d.Classification,d.Application,d.RemarksID,d.ApplyID AS memberApplyId,
            COALESCE(released.name,'') AS releasedBy,COALESCE(released.position,'') AS releasedPosition,
            COALESCE(prepared.name,'') AS preparedBy,COALESCE(prepared.position,'') AS preparedPosition,
            COALESCE(prepared.department,'') AS preparedDepartment,
            COALESCE(TRIM(m.withdrawnby),'') AS withdrawnByCode,
            COALESCE(withdrawn.name,'') AS withdrawnByName,COALESCE(withdrawn.position,'') AS withdrawnByPosition,
            COALESCE(w.PrintFlag,0) AS printFlag,w.TSD_DT AS releasedAt,w.ENERGIZED_DT AS energizedAt,
            CASE WHEN w.TSD_DT IS NULL THEN NULL
              ELSE TIMESTAMPDIFF(SECOND,w.TSD_DT,COALESCE(w.ENERGIZED_DT,NOW()))
            END AS releaseElapsedSeconds
     FROM ${membershipTable('mempayments')} m
     LEFT JOIN ${membershipTable('mempayments')} fees ON fees.ApplyID=(
       SELECT paid.ApplyID FROM ${membershipTable('mempayments')} paid
       WHERE paid.accountnumber=m.accountnumber
       ORDER BY (COALESCE(paid.TotalAmount,0)>0) DESC,paid.ApplyID DESC LIMIT 1
     )
     LEFT JOIN ${membershipTable('membershipdetais')} d ON d.AssignAccountNo=m.accountnumber
     LEFT JOIN ${membershipTable('membership_workflow')} w ON w.AccountNumber=m.accountnumber
     LEFT JOIN usertb released ON released.UserCode=w.METER_DT_userid
     -- [FIX] w.ISD_DT_userid can end up blank (e.g. a duplicate-key retry on membership_workflow
     -- during creation) even though membershipdetais.AddedBy/userid saved correctly in the same
     -- create call — fall back to whoever actually created the record.
     LEFT JOIN usertb prepared ON prepared.UserCode=COALESCE(NULLIF(w.ISD_DT_userid,''),NULLIF(d.AddedBy,''),NULLIF(d.userid,''))
     LEFT JOIN usertb withdrawn ON withdrawn.UserCode=m.withdrawnby
     WHERE m.ApplyID=? AND m.accountnumber=? LIMIT 1`,
    [applyId, accountNumber]
  );
  if (!row) throw Object.assign(new Error('No matching payment for the selected account.'), { statusCode: 404 });
  const fullName = [row.LastName && `${row.LastName},`, row.FirstName, row.MiddleName, row.ExtensionName]
    .filter((part) => part && String(part).trim().toUpperCase() !== 'N/A')
    .join(' ');
  return {
    id: row.id,
    accountNumber: row.accountNumber,
    fullName,
    statusCode: row.statusCode,
    statusLabel: row.energizedAt ? 'Energized' : row.releasedAt ? 'Released' : meterStatusLabel(row.statusCode),
    meterBrand: text(row.meterBrand), sealNumber: text(row.sealNumber), ercSealNumber: text(row.ercSealNumber),
    meterSerial: text(row.meterSerial), initialReading: text(row.initialReading),
    executedAt: toDatetimeLocalValue(row.executedAt),
    totalAmount: Number(row.totalAmount || 0),
    feeItems: feeItemsFromRow(row).filter((item) => item.label !== 'ID'),
    printFeeItems: feeItemsFromRow(row),
    member: {
      gender: text(row.Gender), birthday: text(row.birthday), street: text(row.Street),
      membership: text(row.Membership), classification: text(row.Classification),
      application: text(row.Application), remarksId: text(row.RemarksID),
      controlNumber: String((Number(row.memberApplyId) || 0) + 1).padStart(5, '0'),
    },
    signatures: {
      releasedBy: text(row.releasedBy), releasedPosition: text(row.releasedPosition),
      preparedBy: text(row.preparedBy), preparedPosition: text(row.preparedPosition),
      preparedDepartment: text(row.preparedDepartment),
    },
    withdrawnBy: row.withdrawnByCode ? {
      usercode: text(row.withdrawnByCode), name: text(row.withdrawnByName) || text(row.withdrawnByCode),
      position: text(row.withdrawnByPosition),
    } : null,
    printFlag: Number(row.printFlag || 0),
    releasedAt: row.releasedAt || null,
    energizedAt: row.energizedAt || null,
    releaseElapsedSeconds: row.releaseElapsedSeconds === null ? null : Number(row.releaseElapsedSeconds),
  };
};

const saveMeterPayment = async (input, usercode) => {
  const { applyId, accountNumber } = validateSelection(input);
  const fields = validateMeterFields(input);
  if (!text(usercode)) throw Object.assign(new Error('Signed-in employee code is required.'), { statusCode: 401 });
  const readingColumn = await getMeterReadingColumn();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [payment] = await connection.execute(
      `UPDATE ${membershipTable('mempayments')}
       SET meterbrand=?,sealnumber=?,ercsealnumber=?,meterSerialnumber=?,\`${readingColumn}\`=?,withdrawnby=?,executedAt=?,userid=?,status=5
       WHERE ApplyID=? AND accountnumber=? LIMIT 1`,
      [fields.meterBrand, fields.sealNumber, fields.ercSealNumber, fields.meterSerial, fields.initialReading, fields.withdrawnBy || null, fields.executedAt, text(usercode), applyId, accountNumber]
    );
    if (!payment.affectedRows) throw Object.assign(new Error('No matching payment for the selected account.'), { statusCode: 404 });
    const [workflow] = await connection.execute(
      `UPDATE ${membershipTable('membership_workflow')}
       SET METER_DT=NOW(),METER_DT_userid=?,StatusStage=GREATEST(COALESCE(StatusStage,0),4)
       WHERE AccountNumber=? LIMIT 1`,
      [text(usercode), accountNumber]
    );
    if (!workflow.affectedRows) throw Object.assign(new Error('Meter details were not saved because the membership workflow row is missing.'), { statusCode: 409 });
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markMeterPaymentPrinted = async (input, usercode) => {
  const { applyId, accountNumber } = validateSelection(input);
  if (!text(usercode)) throw Object.assign(new Error('Signed-in employee code is required.'), { statusCode: 401 });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.execute(
      `SELECT status FROM ${membershipTable('mempayments')} WHERE ApplyID=? AND accountnumber=? FOR UPDATE`,
      [applyId, accountNumber]
    );
    if (!payments.length) throw Object.assign(new Error('No matching payment for the selected account.'), { statusCode: 404 });
    if (Number(payments[0].status) < 5) throw Object.assign(new Error('Save the meter details before confirming print.'), { statusCode: 409 });
    const [result] = await connection.execute(
      `UPDATE ${membershipTable('membership_workflow')}
       SET TSD_DT=COALESCE(TSD_DT,NOW()),TSD_DT_userid=COALESCE(NULLIF(TSD_DT_userid,''),?),
           StatusStage=GREATEST(COALESCE(StatusStage,0),5),PrintFlag=GREATEST(COALESCE(PrintFlag,0),1),UpdatedAt=NOW()
       WHERE AccountNumber=? LIMIT 1`,
      [text(usercode), accountNumber]
    );
    if (!result.affectedRows) throw Object.assign(new Error('Print was not recorded because the workflow row is missing.'), { statusCode: 409 });
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markMeterPaymentEnergized = async (input, usercode) => {
  const { applyId, accountNumber } = validateSelection(input);
  if (!text(usercode)) throw Object.assign(new Error('Signed-in employee code is required.'), { statusCode: 401 });
  if (!/^\d{8}$/.test(accountNumber)) throw Object.assign(new Error('The account number must contain exactly 8 digits.'), { statusCode: 422 });
  const undo = text(input?.mode).toLowerCase() === 'undo';
  const energizedDate = undo ? '' : validateEnergizedDate(input?.energizedDate);
  const readingColumn = await getMeterReadingColumn();
  const connection = await db.getConnection();
  let consumerConnection = null;
  let lockHeld = false;
  try {
    consumerConnection = await db.getConsumerConnection();
    // ponytail: one short global lock is enough for low-volume Energize writes; replace with a lock table if throughput grows.
    const [locks] = await consumerConnection.execute("SELECT GET_LOCK('membership-energize-master', 10) AS acquired");
    lockHeld = Number(locks[0]?.acquired || 0) === 1;
    if (!lockHeld) throw Object.assign(new Error('Another account is being Energized. Please try again.'), { statusCode: 409 });
    await connection.beginTransaction();
    await consumerConnection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT m.status,m.meterbrand,m.meterSerialnumber,m.\`${readingColumn}\` AS InitialReading,
              d.idnumber,d.LastName,d.FirstName,d.MiddleName,d.ExtensionName,d.Area,d.Book,d.Street,
              d.HandlingBranch,d.account_type,d.Classification,d.TransformerID,d.PoleNo,d.FeederNo,d.ContactNo,
              w.TSD_DT,w.ENERGIZED_DT,
              DATE_FORMAT(w.TSD_DT,'%Y-%m-%d') AS ReleasedDate,
              DATE_FORMAT(w.ENERGIZED_DT,'%Y-%m-%d') AS EnergizedDate,
              DATE_FORMAT(CURDATE(),'%Y-%m-%d') AS Today
       FROM ${membershipTable('mempayments')} m
       LEFT JOIN ${membershipTable('membershipdetais')} d ON d.AssignAccountNo=m.accountnumber
       LEFT JOIN ${membershipTable('membership_workflow')} w ON w.AccountNumber=m.accountnumber
       WHERE m.ApplyID=? AND m.accountnumber=? LIMIT 1 FOR UPDATE`,
      [applyId, accountNumber]
    );
    if (!rows.length) throw Object.assign(new Error('No matching payment for the selected account.'), { statusCode: 404 });
    const source = rows[0];
    if (!source.idnumber) throw Object.assign(new Error('The Membership record for this account is missing.'), { statusCode: 409 });
    if (!source.TSD_DT) throw Object.assign(new Error('Release the order from Warehouse before marking it Energized.'), { statusCode: 409 });
    if (undo && !source.ENERGIZED_DT) throw Object.assign(new Error('This order is not currently Energized.'), { statusCode: 409 });
    if (!undo && source.ENERGIZED_DT) throw Object.assign(new Error('This order is already marked Energized.'), { statusCode: 409 });
    if (!undo && energizedDate < source.ReleasedDate) throw Object.assign(new Error('Energized date cannot be earlier than the Warehouse release date.'), { statusCode: 422 });
    if (!undo && energizedDate > source.Today) throw Object.assign(new Error('Energized date cannot be in the future.'), { statusCode: 422 });

    const destination = resolveConsumerDestination(source.HandlingBranch, source.account_type);
    const area = text(source.Area).replace(/\D/g, '').padStart(3, '0');
    const book = text(source.Book).replace(/\D/g, '').padStart(3, '0');
    if (!area || !book || accountNumber.slice(0, 2) !== area.slice(-2) || accountNumber.slice(2, 4) !== book.slice(-2)) {
      throw Object.assign(new Error('The account number does not match its saved Area and Book.'), { statusCode: 409 });
    }
    const initialReading = Number(source.InitialReading || 0);
    if (!Number.isFinite(initialReading) || initialReading < 0) throw Object.assign(new Error('The saved initial meter reading is invalid.'), { statusCode: 422 });
    const fullName = [source.LastName && `${text(source.LastName)},`, source.FirstName, source.MiddleName, source.ExtensionName]
      .map(text).filter((part) => part && part.toUpperCase() !== 'N/A').join(' ').slice(0, 120);
    if (!fullName) throw Object.assign(new Error('The consumer name is required before Energizing.'), { statusCode: 422 });
    const [auditUsers] = await connection.execute(
      'SELECT Id,name,username FROM usertb WHERE usercode=? LIMIT 1', [text(usercode)]
    );
    const auditUser = auditUsers[0] || {};
    const auditUsername = text(auditUser.name || auditUser.username || usercode).slice(0, 30);

    const [areaRows] = await consumerConnection.execute(
      `SELECT COALESCE(AreaName,'') AS AreaName FROM \`${destination.databaseName}\`.\`tblarea\`
       WHERE LPAD(TRIM(AreaCode),3,'0')=? AND LPAD(TRIM(AreaBook),3,'0')=? LIMIT 1`, [area, book]
    );
    const areaName = text(areaRows[0]?.AreaName);
    const meterSerial = text(source.meterSerialnumber);
    const memberId = text(source.idnumber).replace(/-/g, '');
    const existing = [];
    for (const databaseName of Object.values(CONSUMER_DATABASE_BY_BRANCH)) {
      for (const tableName of CONSUMER_TABLES) {
        const [matches] = await consumerConnection.execute(
          `SELECT AccountNumber,COALESCE(MEMID,'') AS MEMID,COALESCE(Serial,'') AS Serial,Multiplier,
                  COALESCE(TotalBill,0) AS TotalBill,COALESCE(BillMonth,'') AS BillMonth,
                  LastReadingDate,ReconnectionDate,DisconnectionDate,
                  DATE_FORMAT(NewConnectionDate,'%Y-%m-%d') AS NewConnectionDate
           FROM \`${databaseName}\`.\`${tableName}\` WHERE AccountNumber=? LIMIT 1`, [accountNumber]
        );
        if (matches.length) existing.push({ ...matches[0], databaseName, tableName });
      }
    }
    const misplaced = existing.find((item) => item.databaseName !== destination.databaseName || item.tableName !== destination.tableName);
    if (!undo && misplaced) throw Object.assign(new Error(`Account ${accountNumber} already exists in ${misplaced.databaseName}.${misplaced.tableName}.`), { statusCode: 409 });
    const matchingRows = existing.filter((item) => text(item.MEMID) === memberId
      && (!meterSerial || text(item.Serial) === meterSerial.slice(0, 20)));
    const intended = undo ? matchingRows[0] : existing[0];
    if (undo && matchingRows.length !== 1) {
      throw Object.assign(new Error('UNENERGIZE requires exactly one matching consumer row on the billing server.'), { statusCode: 409 });
    }
    if (intended && ((text(intended.MEMID) && text(intended.MEMID) !== memberId)
      || (text(intended.Serial) && meterSerial && text(intended.Serial) !== meterSerial))) {
      throw Object.assign(new Error('The existing live consumer row does not match this Membership record.'), { statusCode: 409 });
    }

    if (undo) {
      const hasBillingActivity = Number(intended.TotalBill || 0) !== 0 || text(intended.BillMonth) !== ''
        || Boolean(intended.LastReadingDate || intended.ReconnectionDate || intended.DisconnectionDate);
      if (hasBillingActivity) {
        throw Object.assign(new Error('Cannot UNENERGIZE because this consumer already has billing or reading activity.'), { statusCode: 409 });
      }
      if (text(intended.NewConnectionDate) !== text(source.EnergizedDate)) {
        throw Object.assign(new Error('Cannot UNENERGIZE because the consumer date no longer matches this Job Order.'), { statusCode: 409 });
      }
      const [removed] = await consumerConnection.execute(
        `DELETE FROM \`${intended.databaseName}\`.\`${intended.tableName}\`
         WHERE AccountNumber=? AND COALESCE(MEMID,'')=? AND COALESCE(Serial,'')=? LIMIT 1`,
        [accountNumber, memberId, meterSerial.slice(0, 20)]
      );
      if (Number(removed.affectedRows || 0) !== 1) {
        throw Object.assign(new Error('The matching consumer row could not be removed safely.'), { statusCode: 409 });
      }
      await connection.execute(
        `UPDATE ${membershipTable('mempayments')} SET status=5 WHERE ApplyID=? AND accountnumber=? LIMIT 1`,
        [applyId, accountNumber]
      );
      const [workflowReset] = await connection.execute(
        `UPDATE ${membershipTable('membership_workflow')}
         SET ENERGIZED_DT=NULL,StatusStage=5,PrintFlag=1,DurationDays=NULL,UpdatedAt=NOW()
         WHERE AccountNumber=? AND ENERGIZED_DT IS NOT NULL LIMIT 1`,
        [accountNumber]
      );
      if (!workflowReset.affectedRows) throw Object.assign(new Error('The workflow could not be returned to Released.'), { statusCode: 409 });
      await consumerConnection.commit();
      await connection.commit();
      return { unenergized: true, destination: `${intended.databaseName}.${intended.tableName}` };
    }

    if (!intended) {
      const address = [text(source.Street), areaName].filter(Boolean).join(', ').slice(0, 100);
      await consumerConnection.execute(
        `INSERT INTO \`${destination.databaseName}\`.\`${destination.tableName}\`
          (Area,Book,Sequence,AccountNumber,Name,Address,RateCode,Transformer,MeterBrand,Serial,Multiplier,
           NewConnectionDate,ConnStatus,AreaName,InitialReading,PoleNumber,FeederNumber,conctac_no,CustType,MEMID)
         VALUES (?,?,?,?,?,?,?,?,?,?,1.00,?,'A',?,?,?,?,?,?,?)`,
        [area, book, accountNumber.slice(4), accountNumber, fullName, address, consumerRateCode(source.Classification),
          text(source.TransformerID).slice(0, 20), text(source.meterbrand).slice(0, 10), meterSerial.slice(0, 20),
          energizedDate, areaName.slice(0, 100), Math.trunc(initialReading), text(source.PoleNo).slice(0, 20),
          text(source.FeederNo).slice(0, 25), text(source.ContactNo).slice(0, 50), destination.customerType, memberId]
      );
    } else {
      await consumerConnection.execute(
        `UPDATE \`${destination.databaseName}\`.\`${destination.tableName}\`
         SET Multiplier=1.00,NewConnectionDate=? WHERE AccountNumber=? LIMIT 1`,
        [energizedDate, accountNumber]
      );
    }

    const [saved] = await consumerConnection.execute(
      `SELECT AccountNumber,Multiplier,DATE_FORMAT(NewConnectionDate,'%Y-%m-%d') AS NewConnectionDate
       FROM \`${destination.databaseName}\`.\`${destination.tableName}\` WHERE AccountNumber=? LIMIT 1`,
      [accountNumber]
    );
    if (!saved.length || Number(saved[0].Multiplier) !== 1 || text(saved[0].NewConnectionDate) !== energizedDate) {
      throw Object.assign(new Error('The consumer row could not be verified with the selected date and Multiplier 1.00.'), { statusCode: 500 });
    }

    await connection.execute(
      `UPDATE ${membershipTable('mempayments')} SET status=6 WHERE ApplyID=? AND accountnumber=? LIMIT 1`,
      [applyId, accountNumber]
    );
    const [workflow] = await connection.execute(
      `UPDATE ${membershipTable('membership_workflow')}
       SET ENERGIZED_DT=GREATEST(TSD_DT,TIMESTAMP(?,CURRENT_TIME())),StatusStage=6,PrintFlag=3,
           DurationDays=TIMESTAMPDIFF(DAY,TSD_DT,GREATEST(TSD_DT,TIMESTAMP(?,CURRENT_TIME()))),UpdatedAt=NOW()
       WHERE AccountNumber=? AND TSD_DT IS NOT NULL AND ENERGIZED_DT IS NULL LIMIT 1`,
      [energizedDate, energizedDate, accountNumber]
    );
    if (!workflow.affectedRows) throw Object.assign(new Error('The workflow could not be marked Energized.'), { statusCode: 409 });
    await consumerConnection.execute(
      `INSERT INTO \`${destination.databaseName}\`.\`billhistory_logs\`
        (log_date,log_time,user_id,username,module,action,particulars,property,description,ipaddress)
       VALUES (CURDATE(),CURTIME(),?,?,'Membership','Energized','New Connection',?,?,NULL)`,
      [auditUser.Id || null, auditUsername, `Account: ${accountNumber} / MEMID: ${memberId}`,
        `Energized ${energizedDate}; saved to ${destination.databaseName}.${destination.tableName}`]
    );
    const [completed] = await connection.execute(
      `SELECT TSD_DT AS releasedAt,ENERGIZED_DT AS energizedAt,
              TIMESTAMPDIFF(SECOND,TSD_DT,ENERGIZED_DT) AS releaseElapsedSeconds
       FROM ${membershipTable('membership_workflow')} WHERE AccountNumber=? LIMIT 1`,
      [accountNumber]
    );
    await consumerConnection.commit();
    await connection.commit();
    return {
      releasedAt: completed[0]?.releasedAt || null,
      energizedAt: completed[0]?.energizedAt || null,
      releaseElapsedSeconds: Number(completed[0]?.releaseElapsedSeconds || 0),
      destination: `${destination.databaseName}.${destination.tableName}`,
      multiplier: 1,
      energizedDate,
    };
  } catch (error) {
    if (consumerConnection) await consumerConnection.rollback();
    await connection.rollback();
    throw error;
  } finally {
    if (lockHeld && consumerConnection) {
      try { await consumerConnection.execute("SELECT RELEASE_LOCK('membership-energize-master')"); } catch (_error) { /* connection close also releases it */ }
    }
    if (consumerConnection) consumerConnection.release();
    connection.release();
  }
};

const updateMeterPaymentStatus = async (input) => {
  const applyId = Number.parseInt(input?.applyId ?? input?.id, 10);
  const status = Number.parseInt(input?.status, 10);
  if (!Number.isInteger(applyId) || applyId <= 0 || ![0, 1, 2, 3, 4, 5, 6].includes(status)) {
    throw Object.assign(new Error('Valid applyId and status (0-6) are required.'), { statusCode: 422 });
  }
  const result = await db.execute(`UPDATE ${membershipTable('mempayments')} SET status=? WHERE ApplyID=? LIMIT 1`, [status, applyId]);
  if (!result.affectedRows) throw Object.assign(new Error('Payment not found for that Apply ID.'), { statusCode: 404 });
  return result.affectedRows;
};

const isMissingOptionalTable = (error) => error?.code === 'ER_NO_SUCH_TABLE';
const optionalRows = async (sql, params) => {
  try { return await db.queryAll(sql, params); } catch (error) {
    // ponytail: generic stock endpoints remain optional until a stock schema is activated.
    if (isMissingOptionalTable(error)) return [];
    throw error;
  }
};
const getStockRecords = async (limit = 100) => optionalRows('SELECT * FROM warehouse_stocktb ORDER BY item_name ASC LIMIT ?', [limit]);
const getStockByItem = async (itemId) => {
  try { return await db.queryOne('SELECT * FROM warehouse_stocktb WHERE item_id = ?', [itemId]); }
  catch (error) { if (isMissingOptionalTable(error)) return null; throw error; }
};
const getTransactionHistory = async (limit = 50) => optionalRows('SELECT * FROM warehouse_transactionstb ORDER BY transaction_date DESC LIMIT ?', [limit]);

module.exports = {
  FEE_FIELDS, meterStatusLabel, normalizePeriod, mysqlDate, feeItemsFromRow, resolveIdFeeAmount, validateMeterFields, validateEnergizedDate, toDatetimeLocalValue, isMissingOptionalTable,
  resolveConsumerDestination, consumerRateCode,
  getMeterPayments, getMeterPaymentDetails, saveMeterPayment, markMeterPaymentPrinted, markMeterPaymentEnergized,
  updateMeterPaymentStatus, getStockRecords, getStockByItem, getTransactionHistory,
};
