// Membership data service: reads/writes the `membership` schema and only qualifies legacy live consumer databases explicitly.
// EDIT GUIDE: keep Membership-owned table names behind membershipTable() so DB_NAME can remain the shared app database.
const fs = require('fs/promises');
const path = require('path');
const db = require('../config/database');

const LIVE_DATABASES = ['dbsamelco_catbalogan', 'dbsamelco', 'dbsamelco_basey', 'dbsamelco_villareal'];
const LIVE_TABLES = ['master', 'master_bi', 'master_bm', 'master_net'];
const MEMBERSHIP_DB = 'membership';

const ZUMARRAGA_BOOK_OPTIONS = [
  '001 - ZUMARRAGA PROPER',
  '002 - Mualbual BApa',
  '003 - MAputi BApa',
  '004 - Boblaran BApa',
  '005 - MAcalunod BApa',
  '006 - Camayse 1 Bapa',
  '007 - PAngdan BApa',
  '010 - Puro BApa',
  '012 - Lumalantang BApa',
  '013 - Camayse 2 BApa',
  '014 - MAga-an BApa',
  '015 - MArapilit BApa',
  '016 - PAyapay BApa',
  '017 - Botaera 1 BApa',
  '018 - Botaera 2 BApa',
  '019 - Talib BApa',
  '020 - Ibarra BApa',
  '021 - So. Lulugayan BApa',
  '022 - San Isidro BApa 1',
  '023 - Tinaogan BApa',
  '024 - Tubigan BApa',
  '025 - Sugod, Zumarraga',
  '026 - Bioso 1 BApa',
  '027 - Arteche BApa',
  '028 - Alegria BApa',
  '029 - Bioso 2 BApa',
  '030 - San Isidro BApa 2',
  '031 - So. Patingcaras BApa',
  '032 - So. Canlaas, Tinaogan Bapa',
  '035 - 035',
  '036 - 036',
  '037 - SO. SUGOD',
  '038 - MAga-an BApa',
  '039 - TUBIGAN BAPA 2',
  '062 - 062'
];

const AREA_LIST = [
  '001 - CATBALOGAN',
  '002 - JIABONG',
  '003 - MOTIONG',
  '004 - PARANAS',
  '005 - SAN SEBASTIAN',
  '006 - HINABANGAN',
  '007 - CALBIGA',
  '008 - PINABACDAO',
  '009 - VILLAREAL',
  '010 - STA. RITA',
  '011 - TALALORA',
  '012 - BASEY',
  '013 - DARAM',
  '014 - ZUMARRAGA',
  '015 - MARABUT',
  '016 - SAN JOSE DE BUAN',
  '019 - CINCORAMA',
  '020 - BAGONGON',
  '021 - BASIAO',
];

let canonicalBookLabelsCache = null;

const sqlId = (name) => `\`${String(name).replace(/`/g, '``')}\``;
const membershipTable = (name) => `${sqlId(MEMBERSHIP_DB)}.${sqlId(name)}`;

const repairText = (value) =>
  String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/¥/g, 'Ñ')
    .trim();

const repairValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => repairValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairValue(item)]));
  }
  if (typeof value === 'string') {
    return repairText(value);
  }
  return value;
};

const clean = (value) => repairText(value);

const extractDigits = (value) => {
  const digits = String(value ?? '').replace(/\D+/g, '');
  const trimmed = digits.replace(/^0+/, '');
  return trimmed === '' ? '00' : (trimmed.length === 1 ? `0${trimmed}` : trimmed);
};

const pad3 = (value) => String(value ?? '').replace(/\D+/g, '').padStart(3, '0').slice(-3);

const normalizeLabel = (value) =>
  repairText(value)
    .replace(/\s+/g, ' ')
    .trim();

const loadCanonicalBookLabels = async () => {
  if (canonicalBookLabelsCache) return canonicalBookLabelsCache;

  const lookup = new Map();
  try {
    const filePath = path.resolve(__dirname, '../../../json-api/data/membership/books_raw.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const rows = JSON.parse(raw);
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const areaCode = pad3(row?.areaCode || row?.area || row?.Area);
        const bookCode = pad3(row?.bookCode || row?.book || row?.Book);
        const areaName = normalizeLabel(row?.areaName || row?.bookName || row?.name);
        if (areaCode && bookCode && areaName) {
          lookup.set(`${areaCode}|${bookCode}`, areaName);
        }
      }
    }
  } catch {
    // Fall back to live database labels if the cache file is unavailable.
  }

  canonicalBookLabelsCache = lookup;
  return lookup;
};

const resolveBookLabel = async (areaCode, bookCode, fallbackName = '') => {
  const lookup = await loadCanonicalBookLabels();
  const key = `${pad3(areaCode)}|${pad3(bookCode)}`;
  const canonical = lookup.get(key);
  const normalizedFallback = normalizeLabel(fallbackName);

  if (canonical) {
    return canonical;
  }

  return normalizedFallback;
};

const areaInfo = (areaText) => {
  const name = String(areaText ?? '')
    .trim()
    .replace(/^.*-\s*/, '')
    .toUpperCase();

  const areas = {
    CATBALOGAN: { prefix: 'CA', code: '01' },
    JIABONG: { prefix: 'JI', code: '02' },
    MOTIONG: { prefix: 'MO', code: '03' },
    PARANAS: { prefix: 'PA', code: '04' },
    'SAN SEBASTIAN': { prefix: 'SS', code: '05' },
    HINABANGAN: { prefix: 'HI', code: '06' },
    CALBIGA: { prefix: 'CA', code: '07' },
    PINABACDAO: { prefix: 'PI', code: '08' },
    VILLAREAL: { prefix: 'VI', code: '09' },
    'STA. RITA': { prefix: 'ST', code: '10' },
    TALALORA: { prefix: 'TA', code: '11' },
    BASEY: { prefix: 'BA', code: '12' },
    DARAM: { prefix: 'DA', code: '13' },
    ZUMARRAGA: { prefix: 'ZU', code: '14' },
    MARABUT: { prefix: 'MA', code: '15' },
    'SAN JOSE DE BUAN': { prefix: 'SJ', code: '16' },
  };

  if (areas[name]) return areas[name];

  const code = extractDigits(areaText);
  const match = Object.values(areas).find((item) => item.code === code);
  if (match) return match;
  throw new Error('Unknown area selected.');
};

const getLiveDatabases = () => LIVE_DATABASES.slice();
const getLiveTables = () => LIVE_TABLES.slice();

const querySafe = async (sql, params = []) => {
  try {
    return await db.queryAll(sql, params);
  } catch {
    return [];
  }
};

const queryOneSafe = async (sql, params = []) => {
  try {
    return await db.queryOne(sql, params);
  } catch {
    return null;
  }
};

const consumerQuerySafe = async (sql, params = []) => {
  try {
    return await db.consumerQueryAll(sql, params);
  } catch {
    return [];
  }
};

const consumerQueryOneSafe = async (sql, params = []) => {
  try {
    return await db.consumerQueryOne(sql, params);
  } catch {
    return null;
  }
};

const readMembershipExport = async () => {
  try {
    const filePath = path.resolve(__dirname, '../../../json-api/data/membership/members.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? repairValue(parsed) : [];
  } catch {
    return [];
  }
};

const getAreas = async () => AREA_LIST.slice();

// Tagalog: direktang kinukuha rito ang kasalukuyang accredited electricians para hindi na umasa sa lumang PHP endpoint.
const getElectricians = async () => {
  const rows = await querySafe(
    `SELECT DISTINCT TRIM(Electrician) AS name
     FROM ${membershipTable('electrician')}
     WHERE TRIM(COALESCE(Electrician, '')) <> ''
     ORDER BY name ASC`
  );
  return rows.map((row) => clean(row.name)).filter(Boolean);
};

const addElectrician = async (name) => {
  const electrician = clean(name).replace(/\s+/g, ' ').toUpperCase();
  if (electrician.length < 3 || electrician.length > 255 || /[\u0000-\u001F\u007F]/.test(electrician)) {
    throw new Error('Enter a valid electrician name between 3 and 255 characters.');
  }

  // ponytail: one INSERT keeps next-ID assignment and duplicate prevention together.
  // Ceiling: the legacy table has no unique key; add one if concurrent data entry becomes common.
  const result = await db.execute(
    `INSERT INTO ${membershipTable('electrician')} (ElectID, Electrician)
     SELECT sequence.nextId, ?
     FROM (
       SELECT COALESCE(MAX(ElectID), 0) + 1 AS nextId
       FROM ${membershipTable('electrician')}
     ) AS sequence
     WHERE NOT EXISTS (
       SELECT 1
       FROM ${membershipTable('electrician')}
       WHERE UPPER(TRIM(Electrician)) = UPPER(?)
     )`,
    [electrician, electrician]
  );

  if (Number(result?.affectedRows || 0) === 0) {
    return { created: false, name: electrician };
  }

  const saved = await queryOneSafe(
    `SELECT ElectID AS id, TRIM(Electrician) AS name
     FROM ${membershipTable('electrician')}
     WHERE UPPER(TRIM(Electrician)) = UPPER(?)
     ORDER BY ElectID DESC
     LIMIT 1`,
    [electrician]
  );
  return { created: true, id: Number(saved?.id || 0), name: clean(saved?.name || electrician) };
};

// One member's book label — used by getMemberDetail so opening a record doesn't have to
// build the entire area's book list (getBooks) just to display one already-known code.
const resolveSingleBookLabel = async (areaCode, bookCode) => {
  if (!bookCode) return '';
  const canonicalLabels = await loadCanonicalBookLabels();
  const canonical = canonicalLabels.get(`${areaCode}|${bookCode}`);
  if (canonical) return `${bookCode} - ${canonical}`;

  if (areaCode === '014') {
    const match = ZUMARRAGA_BOOK_OPTIONS.find((entry) => entry.startsWith(`${bookCode} - `));
    return match || bookCode;
  }

  const bookDatabases = areaCode === '013' ? ['dbsamelco_catbalogan', 'dbsamelco_villareal'] : getLiveDatabases();
  for (const dbName of bookDatabases) {
    const row = await consumerQueryOneSafe(
      `SELECT TRIM(COALESCE(AreaName, '')) AS bookName
       FROM ${sqlId(dbName)}.${sqlId('tblarea')}
       WHERE LPAD(COALESCE(AreaCode, ''), 3, '0') = ? AND LPAD(COALESCE(AreaBook, ''), 3, '0') = ?
       LIMIT 1`,
      [areaCode, bookCode]
    );
    if (row?.bookName) return `${bookCode} - ${clean(row.bookName)}`;
  }

  return bookCode;
};

const getBooks = async (areaText) => {
  const areaCode = pad3(areaText);
  const bookMap = new Map();
  const canonicalLabels = await loadCanonicalBookLabels();
  const bookDatabases = areaCode === '013'
    ? ['dbsamelco_catbalogan', 'dbsamelco_villareal']
    : getLiveDatabases();

  if (areaCode === '014') {
    return ZUMARRAGA_BOOK_OPTIONS.slice();
  }

  for (const dbName of bookDatabases) {
    const tableBooks = await consumerQuerySafe(
      `SELECT DISTINCT
         LPAD(COALESCE(AreaBook, ''), 3, '0') AS bookCode,
         TRIM(COALESCE(AreaName, '')) AS bookName
       FROM ${sqlId(dbName)}.${sqlId('tblarea')}
       WHERE LPAD(COALESCE(AreaCode, ''), 3, '0') = ?
       ORDER BY bookCode ASC`,
      [areaCode]
    );

    for (const row of tableBooks) {
      const bookCode = clean(row.bookCode);
      if (!bookCode) continue;
      const canonicalName = canonicalLabels.get(`${areaCode}|${bookCode}`);
      const bookName = await resolveBookLabel(areaCode, bookCode, row.bookName);
      if (!bookMap.has(bookCode)) {
        bookMap.set(bookCode, bookName || canonicalName || clean(row.bookName));
      } else if (!bookMap.get(bookCode) && (bookName || canonicalName || clean(row.bookName))) {
        bookMap.set(bookCode, bookName || canonicalName || clean(row.bookName));
      }
    }
  }

  const exportedMembers = await readMembershipExport();
  for (const row of exportedMembers) {
    const rowArea = pad3(row?.area || '');
    if (rowArea !== areaCode) continue;
    const bookCode = pad3(row?.book || '');
    const bookName = await resolveBookLabel(
      rowArea,
      bookCode,
      row?.raw?.AreaName || row?.areaName || row?.bookName || ''
    );
    if (bookCode && !bookMap.has(bookCode)) {
      bookMap.set(bookCode, bookName);
    } else if (bookCode && !bookMap.get(bookCode) && bookName) {
      bookMap.set(bookCode, bookName);
    }
  }

  for (const dbName of bookDatabases) {
    const memberBooks = await consumerQuerySafe(
      `SELECT DISTINCT
         LPAD(COALESCE(Book, ''), 3, '0') AS bookCode
       FROM ${sqlId(dbName)}.${sqlId('membershipdetais')}
       WHERE LPAD(COALESCE(Area, ''), 3, '0') = ?
         AND COALESCE(Book, '') <> ''`,
      [areaCode]
    );

    for (const row of memberBooks) {
      const bookCode = clean(row.bookCode);
      if (bookCode && !bookMap.has(bookCode)) {
        const canonicalName = canonicalLabels.get(`${areaCode}|${bookCode}`) || '';
        bookMap.set(bookCode, canonicalName);
      }
    }
  }

  const items = Array.from(bookMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, name]) => `${code} - ${name || code}`);

  return items;
};

// [FIX] The print-preview address label was derived by fetching the FULL book list for the area
// (getBooks, above) and string-matching a prefix in it. That list is built by joining several
// live DB tables per area/book, and on the real prod database those joins can come back
// incomplete for a given book even though the canonical name exists — the label then silently
// falls back to raw area/book numbers. This looks up one area+book pair directly against the
// canonical JSON file (books_raw.json) via resolveBookLabel, without depending on those joins.
// [FIX 2] books_raw.json is a periodic export and can itself be missing a book that was opened
// since the last export (e.g. area 009 book 054) — resolveBookLabel then returns "", which the
// print template treats as falsy and reverts to raw area/book numbers on the printed Job Order.
// Fall back to the live tblarea row for that exact area+book, the same DB lookup
// resolveSingleBookLabel already uses successfully elsewhere in this file.
const getBookLabel = async (areaText, bookText) => {
  const areaCode = pad3(areaText);
  const bookCode = pad3(bookText);
  if (!areaCode || !bookCode) return '';
  const canonical = await resolveBookLabel(areaCode, bookCode);
  if (canonical) return canonical;

  if (areaCode === '014') {
    const match = ZUMARRAGA_BOOK_OPTIONS.find((entry) => entry.startsWith(`${bookCode} - `));
    return match ? match.slice(match.indexOf('-') + 1).trim() : '';
  }

  const bookDatabases = areaCode === '013' ? ['dbsamelco_catbalogan', 'dbsamelco_villareal'] : getLiveDatabases();
  for (const dbName of bookDatabases) {
    const row = await consumerQueryOneSafe(
      `SELECT TRIM(COALESCE(AreaName, '')) AS bookName
       FROM ${sqlId(dbName)}.${sqlId('tblarea')}
       WHERE LPAD(COALESCE(AreaCode, ''), 3, '0') = ? AND LPAD(COALESCE(AreaBook, ''), 3, '0') = ?
       LIMIT 1`,
      [areaCode, bookCode]
    );
    if (row?.bookName) return clean(row.bookName);
  }

  return '';
};

const getLastMasterMemberId = async () => {
  let best = { memberId: '', numeric: 0, sourceDb: '', sourceTable: '' };

  for (const dbName of getLiveDatabases()) {
    for (const tableName of getLiveTables()) {
      const row = await consumerQueryOneSafe(
        `SELECT MEMID AS memberId
         FROM ${sqlId(dbName)}.${sqlId(tableName)}
         WHERE COALESCE(MEMID, '') <> ''
         ORDER BY CAST(SUBSTRING(MEMID, 4) AS UNSIGNED) DESC, MEMID DESC
         LIMIT 1`
      );
      const memberId = clean(row?.memberId);
      if (!memberId) continue;
      const numeric = parseInt(String(memberId).replace(/\D+/g, ''), 10) || 0;
      if (numeric > best.numeric || (numeric === best.numeric && memberId > best.memberId)) {
        best = { memberId, numeric, sourceDb: dbName, sourceTable: tableName };
      }
    }
  }

  return best;
};

const memberMemberIdExists = async (memberId) => {
  const candidate = clean(memberId);
  if (!candidate) return false;

  const masterCount = await queryOneSafe(
    `SELECT COUNT(*) AS count FROM ${membershipTable('membershipdetais')} WHERE idnumber = ?`,
    [candidate]
  );
  if ((Number(masterCount?.count || 0)) > 0) return true;

  for (const dbName of getLiveDatabases()) {
    for (const tableName of getLiveTables()) {
      const row = await consumerQueryOneSafe(
        `SELECT COUNT(*) AS count
         FROM ${sqlId(dbName)}.${sqlId(tableName)}
         WHERE MEMID = ?`,
        [candidate]
      );
      if ((Number(row?.count || 0)) > 0) return true;
    }
  }

  return false;
};

const memberMaxMemberIdSuffix = async (prefix) => {
  const searchPrefix = clean(prefix);
  let max = 0;

  const masterRow = await queryOneSafe(
    `SELECT IFNULL(MAX(CAST(SUBSTRING(idnumber, LENGTH(?) + 1) AS UNSIGNED)), 0) AS maxSuffix FROM ${membershipTable('membershipdetais')} WHERE idnumber LIKE CONCAT(?, "%")`,
    [searchPrefix, searchPrefix]
  );
  max = Math.max(max, Number(masterRow?.maxSuffix || 0));

  for (const dbName of getLiveDatabases()) {
    for (const tableName of getLiveTables()) {
      const row = await consumerQueryOneSafe(
        `SELECT IFNULL(MAX(CAST(SUBSTRING(MEMID, LENGTH(?) + 1) AS UNSIGNED)), 0) AS maxSuffix
         FROM ${sqlId(dbName)}.${sqlId(tableName)}
         WHERE MEMID LIKE CONCAT(?, "%")`,
        [searchPrefix, searchPrefix]
      );
      max = Math.max(max, Number(row?.maxSuffix || 0));
    }
  }

  return max;
};

const accountNumberExists = async (accountNumber) => {
  const candidate = clean(accountNumber);
  if (!candidate) return false;

  const membershipRow = await db.queryOne(
    `SELECT 1 AS accountExists FROM ${membershipTable('membershipdetais')} WHERE AssignAccountNo = ? LIMIT 1`,
    [candidate]
  );
  if (membershipRow) return true;

  const lookups = getLiveDatabases().flatMap((dbName) => getLiveTables().map(
    (tableName) => `SELECT 1 FROM ${sqlId(dbName)}.${sqlId(tableName)} WHERE AccountNumber = ?`
  ));
  const consumerRow = await db.consumerQueryOne(
    `SELECT EXISTS(${lookups.join('\nUNION ALL\n')}) AS accountExists`,
    lookups.map(() => candidate)
  );
  return Number(consumerRow?.accountExists || 0) > 0;
};

const generateMemberAccount = async (areaText, bookText) => {
  const prefix = `${extractDigits(areaText)}${extractDigits(bookText)}`;
  if (prefix === '0000') {
    throw new Error('Area and book are required.');
  }

  const membershipRow = await db.queryOne(
    `SELECT COALESCE(MAX(CAST(RIGHT(AssignAccountNo, 4) AS UNSIGNED)), 0) AS lastSuffix
     FROM ${membershipTable('membershipdetais')} WHERE AssignAccountNo LIKE CONCAT(?, "%")`,
    [prefix]
  );
  const suffixQueries = getLiveDatabases().flatMap((dbName) => getLiveTables().map(
    (tableName) => `SELECT MAX(CAST(RIGHT(AccountNumber, 4) AS UNSIGNED)) AS lastSuffix FROM ${sqlId(dbName)}.${sqlId(tableName)} WHERE AccountNumber LIKE CONCAT(?, "%")`
  ));
  const consumerRow = await db.consumerQueryOne(
    `SELECT COALESCE(MAX(lastSuffix), 0) AS lastSuffix FROM (${suffixQueries.join('\nUNION ALL\n')}) AS occupied_accounts`,
    suffixQueries.map(() => prefix)
  );

  let next = Math.max(Number(membershipRow?.lastSuffix || 0), Number(consumerRow?.lastSuffix || 0)) + 1;

  // HUWAG BAGUHIN: bawat generated account ay dapat libre sa Membership at apat na consumer master database.
  while (true) {
    const candidate = `${prefix}${String(next).padStart(4, '0')}`;
    if (!(await accountNumberExists(candidate))) {
      return candidate;
    }
    next += 1;
  }
};

const generateMemberId = async (areaText, bookText) => {
  const info = areaInfo(areaText);
  const bookCode = extractDigits(bookText);
  const prefix = `${info.prefix}${info.code}${bookCode}-`;
  let next = (await memberMaxMemberIdSuffix(prefix)) + 1;

  while (true) {
    const candidate = `${prefix}${String(next).padStart(5, '0')}`;
    if (!(await memberMemberIdExists(candidate))) {
      return candidate;
    }
    next += 1;
  }
};

const findMasterMemberId = async (memberId) => {
  const target = clean(memberId);
  if (!target) return [];

  const rows = [];
  for (const dbName of getLiveDatabases()) {
    for (const tableName of getLiveTables()) {
      const result = await consumerQuerySafe(
        `SELECT
           MEMID AS memberId,
           AccountNumber AS accountNumber,
           Name AS fullName,
           Address AS address,
           Area AS area,
           Book AS book,
           RateCode AS rateCode,
           ? AS sourceDb,
           ? AS sourceTable
         FROM ${sqlId(dbName)}.${sqlId(tableName)}
         WHERE MEMID = ?`,
        [dbName, tableName, target]
      );
      for (const row of result) {
        rows.push({
          memberId: clean(row.memberId),
          accountNumber: clean(row.accountNumber),
          fullName: clean(row.fullName),
          address: clean(row.address),
          area: clean(row.area),
          book: clean(row.book),
          rateCode: clean(row.rateCode),
          sourceDb: clean(row.sourceDb),
          sourceTable: clean(row.sourceTable),
        });
      }
    }
  }
  return rows;
};

const getAgmaRows = async ({ accountNumber = '', memberId = '', area = '', book = '', classification = '', limit = 10, page = 1 }) => {
  const areaCode = pad3(area);
  const bookCode = pad3(book);
  const hasAccount = clean(accountNumber) !== '';
  const hasMemberId = clean(memberId) !== '';
  const limitValue = Math.max(1, Math.min(5000, Number(limit) || 10));
  const pageValue = Math.max(1, Number(page) || 1);
  const offset = (pageValue - 1) * limitValue;

  const savedWhere = [];
  const savedParams = [];
  if (hasAccount) {
    savedWhere.push('COALESCE(accountnumber, "") = ?');
    savedParams.push(clean(accountNumber));
  }
  if (hasMemberId) {
    savedWhere.push('COALESCE(code, "") = ?');
    savedParams.push(clean(memberId));
  }
  if (areaCode !== '000') {
    savedWhere.push('(LPAD(COALESCE(area, ""), 3, "0") = ? OR COALESCE(area, "") = ?)');
    savedParams.push(areaCode, clean(area));
  }
  if (bookCode !== '000') {
    savedWhere.push('(LPAD(COALESCE(book, ""), 3, "0") = ? OR COALESCE(book, "") = ?)');
    savedParams.push(bookCode, clean(book));
  }
  if (classification) {
    savedWhere.push('COALESCE(ratecode, "") = ?');
    savedParams.push(clean(classification));
  }

  const localRows = await querySafe(
    `SELECT
       entry,
       COALESCE(code, '') AS code,
       COALESCE(accountnumber, '') AS accountNumber,
       COALESCE(name, '') AS fullName,
       COALESCE(ratecode, '') AS rateCode,
       COALESCE(area, '') AS area,
       COALESCE(book, '') AS book,
       '' AS venue,
       '' AS remarks,
       '' AS addedBy,
       '' AS createdAt
     FROM ${membershipTable('agmalist')}
     ${savedWhere.length ? `WHERE ${savedWhere.join(' AND ')}` : ''}
     ORDER BY entry DESC
     LIMIT ${offset}, ${limitValue}`,
    savedParams
  );

  const items = localRows.map((row) => ({
    accountNumber: clean(row.accountNumber),
    memberId: clean(row.code),
    fullName: clean(row.fullName),
    classification: '',
    area: clean(row.area),
    book: clean(row.book),
    venue: '',
    remarks: '',
    addedBy: '',
    createdAt: '',
    rateCode: clean(row.rateCode),
    sourceDb: MEMBERSHIP_DB,
    sourceTable: 'agmalist',
  }));

  return {
    ok: true,
    items,
    total: items.length,
    pagination: {
      page: pageValue,
      limit: limitValue,
      total: items.length,
      totalPages: 1,
    },
    mode: 'local',
  };
};

// Same branch groupings the Job Order filter already uses (see getJobOrders below) —
// reused here so "MAIN/CATBALOGAN/VILLAREAL/BASEY" means the same thing everywhere.
const AREA_BRANCH_MAP = {
  MAIN: '004',
  CATBALOGAN: '001',
  VILLAREAL: '009',
  BASEY: '012',
};

// membership_workflow.StatusStage tracks the stage already reached (set to 1 on member
// creation, see the INSERT below); the queue should show what's still needed NEXT.
const STAGE_NEXT_LABELS = {
  0: 'Draft',
  1: 'For Fees',
  2: 'For Teller',
  3: 'For Warehouse',
  4: 'For Release',
  5: 'Waiting for Energize',
  6: 'Energized',
};
const stageNextLabel = (statusStage) => STAGE_NEXT_LABELS[Number(statusStage) || 0] || 'Draft';

const getMemberList = async ({
  search = '', area = '', book = '',
  month = 0, year = 0, day = 0,
  statusFilter = 'ALL',
  page = 1, limit = 50,
}) => {
  const pageValue = Math.max(1, Number(page) || 1);
  const limitValue = Math.max(1, Math.min(500, Number(limit) || 50));
  const offset = (pageValue - 1) * limitValue;
  // Soft-deleted rows (status='DELETED', set by deleteMember) must never resurface here.
  const conditions = [`COALESCE(m.status, '') != 'DELETED'`];
  const params = [];

  if (clean(search)) {
    conditions.push('(m.AssignAccountNo LIKE ? OR m.idnumber LIKE ? OR m.LastName LIKE ? OR m.FirstName LIKE ? OR m.MiddleName LIKE ?)');
    const q = `%${clean(search)}%`;
    params.push(q, q, q, q, q);
  }
  const areaCode = AREA_BRANCH_MAP[String(area || '').toUpperCase()] || clean(area);
  if (areaCode) {
    conditions.push('(LPAD(COALESCE(m.Area, ""), 3, "0") = ? OR COALESCE(m.Area, "") = ?)');
    params.push(pad3(areaCode), areaCode);
  }
  if (clean(book)) {
    conditions.push('(LPAD(COALESCE(m.Book, ""), 3, "0") = ? OR COALESCE(m.Book, "") = ?)');
    params.push(pad3(book), clean(book));
  }
  const yearValue = Number(year) || 0;
  const monthValue = Number(month) || 0;
  const dayValue = Number(day) || 0;
  if (yearValue > 0) {
    conditions.push('YEAR(m.DateTimeAdded) = ?');
    params.push(yearValue);
  }
  if (monthValue > 0) {
    conditions.push('MONTH(m.DateTimeAdded) = ?');
    params.push(monthValue);
  }
  if (dayValue > 0) {
    conditions.push('DAY(m.DateTimeAdded) = ?');
    params.push(dayValue);
  }
  const statusValue = String(statusFilter || 'ALL').toUpperCase();
  if (statusValue === 'PENDING') {
    conditions.push('w.ENERGIZED_DT IS NULL');
  } else if (statusValue === 'DONE' || statusValue === 'FINISHED') {
    conditions.push('w.ENERGIZED_DT IS NOT NULL');
  }

  const whereSql = `WHERE ${conditions.join(' AND ')}`;
  const fromSql = `FROM ${membershipTable('membershipdetais')} m
     LEFT JOIN ${membershipTable('membership_workflow')} w ON w.AccountNumber = m.AssignAccountNo
     LEFT JOIN it_program.usertb u ON u.usercode = m.userid`;
  const totalRow = await queryOneSafe(`SELECT COUNT(*) AS total ${fromSql} ${whereSql}`, params);
  const total = Number(totalRow?.total || 0);
  const rows = await querySafe(
    `SELECT
       COALESCE(m.idnumber, '') AS memberId,
       COALESCE(m.AssignAccountNo, '') AS accountNumber,
       COALESCE(m.LastName, '') AS lastName,
       COALESCE(m.FirstName, '') AS firstName,
       COALESCE(m.MiddleName, '') AS middleName,
       COALESCE(m.ExtensionName, '') AS extensionName,
       COALESCE(m.Area, '') AS area,
       COALESCE(m.Book, '') AS book,
       m.DateTimeAdded,
       COALESCE(u.name, '') AS preparedBy,
       COALESCE(w.StatusStage, 0) AS statusStage,
       CASE WHEN w.ENERGIZED_DT IS NOT NULL THEN 'Finished' ELSE 'Unfinished' END AS progressStatus
     ${fromSql}
     ${whereSql}
     ORDER BY m.ApplyID DESC
     LIMIT ${limitValue} OFFSET ${offset}`,
    params
  );

  return {
    ok: true,
    items: rows.map((row) => {
      const fullName = [row.lastName, row.firstName, row.middleName, row.extensionName]
        .map((part) => clean(part))
        .filter(Boolean)
        .join(' ');
      return {
        memberId: clean(row.memberId),
        accountNumber: clean(row.accountNumber),
        fullName,
        area: clean(row.area),
        book: clean(row.book),
        status: clean(row.progressStatus),
        stageLabel: stageNextLabel(row.statusStage),
        recordDate: row.DateTimeAdded ? new Date(row.DateTimeAdded).toLocaleDateString('en-US') : '',
        preparedBy: clean(row.preparedBy),
      };
    }),
    total,
    pagination: {
      page: pageValue,
      limit: limitValue,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitValue)),
    },
  };
};

const searchMasterConsumers = async ({ search = '', limit = 3 }) => {
  const query = clean(search).replace(/\s+/g, ' ');
  if (!query) return [];

  const limitValue = Math.max(1, Math.min(3, Number(limit) || 3));
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const params = [];
  const selects = LIVE_DATABASES.map((dbName) => {
    params.push(dbName, query, query, query, query, ...tokens.map((token) => `%${token}%`));
    return `SELECT
       COALESCE(AccountNumber, '') AS accountNumber,
       COALESCE(Name, '') AS fullName,
       COALESCE(Address, '') AS address,
       COALESCE(Serial, '') AS meterNumber,
       COALESCE(conctac_no, '') AS contactNo,
       COALESCE(Area, '') AS areaCode,
       COALESCE(Book, '') AS bookCode,
       COALESCE(ConnStatus, '') AS connectionStatus,
       COALESCE(PoleNumber, '') AS poleNumber,
       COALESCE(FeederNumber, '') AS feederNumber,
       ? AS sourceDb,
       CASE
         WHEN LOWER(TRIM(COALESCE(AccountNumber, ''))) = LOWER(?)
           OR LOWER(TRIM(COALESCE(Name, ''))) = LOWER(?) THEN 0
         WHEN LOWER(TRIM(COALESCE(AccountNumber, ''))) LIKE CONCAT(LOWER(?), '%')
           OR LOWER(TRIM(COALESCE(Name, ''))) LIKE CONCAT(LOWER(?), '%') THEN 1
         ELSE 2
       END AS matchRank
     FROM ${sqlId(dbName)}.${sqlId('master')}
     WHERE (COALESCE(AccountNumber, '') <> '' OR COALESCE(Name, '') <> '')
       ${tokens.map(() => "AND LOWER(CONCAT_WS(' ', COALESCE(Name, ''), COALESCE(AccountNumber, ''))) LIKE ?").join('\n       ')}`;
  });
  const rows = await consumerQuerySafe(
    `SELECT *
      FROM (${selects.join('\nUNION ALL\n')}) AS matches
      ORDER BY matchRank ASC, CHAR_LENGTH(fullName) ASC, fullName ASC, accountNumber ASC
      LIMIT ${limitValue * LIVE_DATABASES.length}`,
    params
  );

  const seen = new Set();
  return rows.map((row) => ({
    accountNumber: clean(row.accountNumber),
    fullName: clean(row.fullName),
    address: clean(row.address),
    meterNumber: clean(row.meterNumber),
    contactNo: clean(row.contactNo),
    areaCode: clean(row.areaCode),
    bookCode: clean(row.bookCode),
    status: clean(row.connectionStatus) === 'A' ? 'Active' : clean(row.connectionStatus),
    poleNumber: clean(row.poleNumber),
    feederNumber: clean(row.feederNumber),
    sourceDb: clean(row.sourceDb),
  })).filter((row) => {
    const key = `${row.accountNumber.toLowerCase()}|${row.fullName.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limitValue);
};

const getMasterConsumerDetail = async ({ account = '', sourceDb = '' }) => {
  const accountNumber = clean(account);
  const databaseName = LIVE_DATABASES.includes(sourceDb) ? sourceDb : '';
  if (!accountNumber || !databaseName) return null;

  const row = await consumerQueryOneSafe(
    `SELECT
       COALESCE(AccountNumber, '') AS accountNumber,
       COALESCE(Name, '') AS fullName,
       COALESCE(Address, '') AS address,
       COALESCE(Serial, '') AS meterNumber,
       COALESCE(conctac_no, '') AS contactNo,
       COALESCE(Area, '') AS areaCode,
       COALESCE(Book, '') AS bookCode,
       COALESCE(ConnStatus, '') AS connectionStatus,
       COALESCE(PoleNumber, '') AS poleNumber,
       COALESCE(FeederNumber, '') AS feederNumber
     FROM ${sqlId(databaseName)}.${sqlId('master')}
     WHERE AccountNumber = ?
     LIMIT 1`,
    [accountNumber]
  );
  if (!row) return null;

  return {
    accountNumber: clean(row.accountNumber),
    fullName: clean(row.fullName),
    address: clean(row.address),
    meterNumber: clean(row.meterNumber),
    contactNo: clean(row.contactNo),
    areaCode: clean(row.areaCode),
    bookCode: clean(row.bookCode),
    status: clean(row.connectionStatus) === 'A' ? 'Active' : clean(row.connectionStatus),
    poleNumber: clean(row.poleNumber),
    feederNumber: clean(row.feederNumber),
    sourceDb: databaseName,
  };
};

// Area dropdown options are "001 - CATBALOGAN" style labels, not raw codes — resolve
// the stored raw code back to the exact label the <select> expects.
const formatAreaLabel = (code) => {
  const padded = pad3(code);
  return AREA_LIST.find((entry) => entry.startsWith(`${padded} -`)) || '';
};

const getMemberDetail = async (account) => {
  const target = clean(account);
  if (!target) return null;

  const row = await queryOneSafe(
    `SELECT
       COALESCE(idnumber, '') AS memberId,
       COALESCE(AssignAccountNo, '') AS accountNumber,
       COALESCE(LastName, '') AS lastName,
       COALESCE(FirstName, '') AS firstName,
       COALESCE(MiddleName, '') AS middleName,
       COALESCE(ExtensionName, '') AS extensionName,
       COALESCE(Gender, '') AS gender,
       BirthDay,
       COALESCE(CivilOthers, '') AS civilStatus,
       COALESCE(Area, '') AS rawArea,
       COALESCE(HandlingBranch, '') AS branch,
       COALESCE(Book, '') AS rawBook,
       COALESCE(Street, '') AS street,
       COALESCE(IDOthers, '') AS idDescription,
       COALESCE(IDNo, '') AS idNumber,
       COALESCE(Membership, '') AS membershipType,
       COALESCE(Classification, '') AS classification,
       COALESCE(Application, '') AS applicationType,
       COALESCE(ElectID, '') AS electrician,
       COALESCE(RemarksID, '') AS remarks,
       COALESCE(ContactNo, '') AS contactNo,
       COALESCE(EMailAdd, '') AS email,
       COALESCE(TransformerID, '') AS transformerRating,
       COALESCE(Structure, '') AS structure,
       COALESCE(PoleNo, '') AS poleNumber,
       COALESCE(FeederNo, '') AS feederNumber,
       COALESCE(SDWireNo, '') AS serviceDropWire,
       COALESCE(SDWireLength, '') AS serviceDropLength,
       COALESCE(MeterClass, '') AS meterClass,
       COALESCE(Lot, '') AS lot,
       COALESCE(LotOwner, '') AS lotOwner,
       COALESCE(LotRelation, '') AS lotRelation,
       COALESCE(House, '') AS house,
       COALESCE(HouseOwner, '') AS houseOwner,
       COALESCE(HouseRelation, '') AS houseRelation,
       COALESCE(SpouseLastName, '') AS spouseLastName,
       COALESCE(SpouseFirstName, '') AS spouseFirstName,
       COALESCE(SpouseMiddleName, '') AS spouseMiddleName,
       COALESCE(SpouseExtensionName, '') AS spouseExtensionName,
       COALESCE(NearAccount, '') AS nearestAccount,
       COALESCE(nearest_landmark, '') AS nearestLandmark,
       COALESCE(account_type, '') AS meterType
     FROM ${membershipTable('membershipdetais')}
     WHERE AssignAccountNo = ?
     LIMIT 1`,
    [target]
  );
  if (!row) return null;

  const { rawArea, rawBook, BirthDay: birthRaw, ...rest } = row;
  const areaLabel = formatAreaLabel(rawArea);
  const bookPadded = pad3(rawBook);
  const bookLabel = areaLabel ? await resolveSingleBookLabel(pad3(rawArea), bookPadded) : '';
  const birthDate = birthRaw ? new Date(birthRaw) : null;
  const hasBirthDate = birthDate instanceof Date && !Number.isNaN(birthDate.getTime());

  return {
    ...rest,
    area: areaLabel,
    barangay: bookLabel,
    birthYear: hasBirthDate ? String(birthDate.getFullYear()) : '',
    birthMonth: hasBirthDate ? String(birthDate.getMonth() + 1) : '',
    birthDay: hasBirthDate ? String(birthDate.getDate()) : '',
  };
};

const getJobOrders = async ({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  status = 'ALL',
  search = '',
  area = '',
  limit = 10,
  page = 1,
} = {}) => {
  const yearValue = Number(year) || new Date().getFullYear();
  const monthValue = Number(month) || 0;
  const statusValue = String(status || 'ALL').toUpperCase();
  const searchValue = clean(search);
  const areaValue = String(area || '').toUpperCase();
  const limitValue = Math.max(1, Math.min(10, Number(limit) || 10));
  const pageValue = Math.max(1, Number(page) || 1);
  const offset = (pageValue - 1) * limitValue;

  const dateExpr = 'COALESCE(w.CreatedAt, w.ISD_DT, w.SOA_DT, w.PAY_DT, w.METER_DT, w.TSD_DT, w.ENERGIZED_DT)';
  const where = [`YEAR(${dateExpr}) = ?`];
  const params = [yearValue];

  if (monthValue > 0) {
    where.push(`MONTH(${dateExpr}) = ?`);
    params.push(monthValue);
  }

  if (statusValue === 'PENDING') {
    where.push('(COALESCE(w.PrintFlag, 0) <> 3 AND COALESCE(w.StatusStage, 0) < 6)');
  } else if (statusValue === 'APPROVED' || statusValue === 'DONE' || statusValue === 'ENERGIZED') {
    where.push('(w.PrintFlag = 3 OR w.StatusStage >= 6)');
  }

  if (searchValue) {
    where.push('(w.AccountNumber LIKE ? OR CONCAT_WS(" ", m.LastName, m.FirstName, m.MiddleName) LIKE ?)');
    params.push(`%${searchValue}%`, `%${searchValue}%`);
  }

  // HandlingBranch (MAIN/BASEY/VILLAREAL/CATBALOGAN — the 4 processing offices) is a
  // different field than the member's hometown Area/Book. Warehouse's queue already
  // filters on HandlingBranch; Job Order must match it or the two queues disagree.
  if (areaValue && HANDLING_BRANCHES.includes(areaValue)) {
    where.push('UPPER(COALESCE(m.HandlingBranch, "")) = ?');
    params.push(areaValue);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countRow = await queryOneSafe(
    `SELECT COUNT(*) AS total
     FROM ${membershipTable('membership_workflow')} w
     LEFT JOIN ${membershipTable('membershipdetais')} m ON m.AssignAccountNo = w.AccountNumber
     ${whereSql}`,
    params
  );
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limitValue));
  const currentPage = Math.min(pageValue, totalPages);
  const currentOffset = (currentPage - 1) * limitValue;

  const rows = await querySafe(
    `SELECT
       w.AccountNumber,
       COALESCE(w.StatusStage, 0) AS StatusStage,
       COALESCE(w.PrintFlag, 0) AS PrintFlag,
       w.ISD_DT, w.SOA_DT, w.PAY_DT, w.METER_DT, w.TSD_DT, w.ENERGIZED_DT,
       CASE WHEN w.TSD_DT IS NULL THEN NULL
         ELSE TIMESTAMPDIFF(SECOND,w.TSD_DT,COALESCE(w.ENERGIZED_DT,NOW()))
       END AS ReleaseElapsedSeconds,
       COALESCE(m.LastName, '') AS LastName,
       COALESCE(m.FirstName, '') AS FirstName,
       COALESCE(m.MiddleName, '') AS MiddleName,
       COALESCE(m.Area, '') AS Area,
       COALESCE(m.Book, '') AS Book,
       COALESCE(m.Application, '') AS Application,
       (SELECT payment.ApplyID
          FROM ${membershipTable('mempayments')} payment
         WHERE payment.accountnumber = w.AccountNumber
         ORDER BY (COALESCE(payment.status, 0) >= 5) DESC, payment.ApplyID DESC
         LIMIT 1) AS MeterApplyID
     FROM ${membershipTable('membership_workflow')} w
     LEFT JOIN ${membershipTable('membershipdetais')} m ON m.AssignAccountNo = w.AccountNumber
     ${whereSql}
     ORDER BY ${dateExpr} DESC, w.AccountNumber DESC
     LIMIT ${limitValue} OFFSET ${currentOffset}`,
    params
  );

  const items = rows.map((row) => {
    const statusStage = Number(row.StatusStage || 0);
    const printFlag = Number(row.PrintFlag || 0);
    const done = printFlag === 3 || statusStage >= 6;
    const nameParts = [clean(row.LastName), clean(row.FirstName), clean(row.MiddleName)].filter(Boolean);
    const applicant = nameParts.length
      ? `${nameParts.shift()}, ${nameParts.join(' ')}`
      : 'No Name';

    return {
      accountNumber: clean(row.AccountNumber),
      applyId: Number(row.MeterApplyID || 0),
      statusStage,
      printFlag,
      status: done ? 'Approved' : 'Pending',
      applicant,
      application: clean(row.Application),
      area: clean(row.Area),
      book: clean(row.Book),
      releaseElapsedSeconds: row.ReleaseElapsedSeconds === null ? null : Number(row.ReleaseElapsedSeconds),
      releaseStatus: row.ENERGIZED_DT ? 'Energized' : row.TSD_DT ? 'Released' : 'Not released',
      stageDates: {
        ISD: row.ISD_DT || null,
        SOA: row.SOA_DT || null,
        TELLER: row.PAY_DT || null,
        WAREHOUSE: row.METER_DT || null,
        TSD: row.TSD_DT || null,
        ENZ: row.ENERGIZED_DT || null,
        RELEASED: row.TSD_DT || null,
        ENERGIZED: row.ENERGIZED_DT || null,
      },
    };
  });

  return {
    ok: true,
    items,
    pagination: {
      page: currentPage,
      limit: limitValue,
      total,
      totalPages,
    },
  };
};

const deleteMember = async (account) => {
  const target = clean(account);
  if (!target) throw new Error('Account is required.');
  const result = await db.execute(
    `UPDATE ${membershipTable('membershipdetais')} SET status = ? WHERE AssignAccountNo = ?`,
    ['DELETED', target]
  );
  return Number(result?.affectedRows || 0) > 0;
};

const getMap = async (account) => {
  const target = clean(account);
  if (!target) throw new Error('Account is required.');
  return queryOneSafe(
    `SELECT
       COALESCE(g.latitudeH, '') AS latitudeH,
       COALESCE(g.longitudeH, '') AS longitudeH,
       COALESCE(g.locationimage, '') AS locationimage,
       COALESCE(m.nearest_landmark, '') AS nearest_landmark
     FROM ${membershipTable('membershipdetais')} m
     LEFT JOIN ${membershipTable('gistb')} g ON g.accountnumber = m.AssignAccountNo
     WHERE m.AssignAccountNo = ?
     LIMIT 1`,
    [target]
  );
};

const mapPoints = async ({ north, south, east, west } = {}) => {
  const hasBounds = [north, south, east, west].every((value) => value !== undefined && value !== null && value !== '');
  let rows = [];

  if (hasBounds) {
    const n = Number(north);
    const s = Number(south);
    const e = Number(east);
    const w = Number(west);
    const top = Math.max(n, s);
    const bottom = Math.min(n, s);
    const right = Math.max(e, w);
    const left = Math.min(e, w);

    rows = await querySafe(
      `SELECT accountnumber, latitudeH, longitudeH
       FROM ${membershipTable('gistb')}
       WHERE COALESCE(latitudeH, '') <> ''
         AND COALESCE(longitudeH, '') <> ''
         AND CAST(latitudeH AS DECIMAL(12,8)) BETWEEN ? AND ?
         AND CAST(longitudeH AS DECIMAL(12,8)) BETWEEN ? AND ?
       ORDER BY accountnumber ASC
       LIMIT 800`,
      [bottom, top, left, right]
    );
  } else {
    rows = await querySafe(
      `SELECT accountnumber, latitudeH, longitudeH
       FROM ${membershipTable('gistb')}
       WHERE COALESCE(latitudeH, '') <> ''
         AND COALESCE(longitudeH, '') <> ''
       ORDER BY accountnumber ASC
       LIMIT 800`
    );
  }

  return {
    ok: true,
    points: rows
      .map((row) => ({
        account: clean(row.accountnumber),
        lat: clean(row.latitudeH),
        lng: clean(row.longitudeH),
      }))
      .filter((point) => point.lat && point.lng),
  };
};

const saveMap = async ({ account, lat, lng, landmark = '', streetImage = '' }) => {
  const target = clean(account);
  const latitude = clean(lat);
  const longitude = clean(lng);
  const land = clean(landmark);
  const img = clean(streetImage);

  if (!target || !latitude || !longitude) {
    throw new Error('Account, latitude, and longitude are required.');
  }

  const exists = await queryOneSafe(`SELECT COUNT(*) AS total FROM ${membershipTable('gistb')} WHERE accountnumber = ?`, [target]);
  if (Number(exists?.total || 0) > 0) {
    await db.execute(
      `UPDATE ${membershipTable('gistb')}
       SET latitudeH = ?, longitudeH = ?,
           locationimage = CASE WHEN ? = '' THEN locationimage ELSE ? END
       WHERE accountnumber = ?`,
      [latitude, longitude, img, img, target]
    );
  } else {
    await db.execute(
      `INSERT INTO ${membershipTable('gistb')} (accountnumber, latitudeH, longitudeH, locationimage) VALUES (?, ?, ?, ?)`,
      [target, latitude, longitude, img]
    );
  }

  await db.execute(
    `UPDATE ${membershipTable('membershipdetais')} SET nearest_landmark = ? WHERE AssignAccountNo = ?`,
    [land, target]
  );

  return true;
};

const safeFileName = (filename) => {
  const name = String(filename ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return name.replace(/^_+|_+$/g, '');
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const uploadToFolder = async ({ account, filename, fileBuffer, folderName }) => {
  const targetAccount = safeFileName(account || 'NO_ACCOUNT');
  const safeName = safeFileName(filename);
  if (!targetAccount) throw new Error('Account is required.');
  if (!safeName) throw new Error('Invalid filename.');
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) throw new Error('Image file is missing.');

  const root = path.resolve(__dirname, '../../../uploads', folderName, targetAccount);
  await ensureDir(root);
  const targetPath = path.join(root, safeName);
  await fs.writeFile(targetPath, fileBuffer);

  return `uploads/${folderName}/${targetAccount}/${safeName}`;
};

const saveProfilePhoto = async ({ account, fullName = '', filename, fileBuffer }) => {
  const pathUrl = await uploadToFolder({
    account,
    filename,
    fileBuffer,
    folderName: 'member_photos',
  });

  return {
    ok: true,
    message: 'Customer photo saved.',
    account: clean(account),
    fullName: clean(fullName),
    filename: safeFileName(filename),
    path: pathUrl,
  };
};

const saveStreetViewCapture = async ({ account, filename, fileBuffer, kind = 'street' }) => {
  const pathUrl = await uploadToFolder({
    account,
    filename,
    fileBuffer,
    folderName: 'member_map',
  });

  return {
    ok: true,
    message: 'Captured image saved.',
    kind,
    filename: safeFileName(filename),
    path: pathUrl,
  };
};

const saveAgma = async ({ accountNumber, memberId, classification = 'Residential', area, book, venue, remarks = '', lastName, firstName, middleName = '', addedBy = '' }) => {
  const acc = clean(accountNumber);
  const mem = clean(memberId);
  const cls = clean(classification) || 'Residential';
  const areaText = clean(area);
  const bookText = clean(book);
  const ven = clean(venue);
  const note = clean(remarks);
  const ln = clean(lastName);
  const fn = clean(firstName);
  const mn = clean(middleName);
  const by = clean(addedBy);

  if (!acc || !mem) throw new Error('Generate the member ID and account number before saving AGMA.');
  if (!areaText || !bookText) throw new Error('Select area and book before saving AGMA.');
  if (!ln || !fn) throw new Error('Last name and first name are required.');

  await db.execute(
    `INSERT INTO ${membershipTable('membership_agma_records')}
     (AssignAccountNo, idnumber, LastName, FirstName, MiddleName, Classification, Area, Book, Venue, Remarks, AddedBy, DateTimeAdded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [acc, mem, ln, fn, mn, cls, extractDigits(areaText), extractDigits(bookText), ven, note, by]
  );

  return {
    ok: true,
    message: 'AGMA record saved.',
    record: {
      accountNumber: acc,
      memberId: mem,
      classification: cls,
      area: areaText,
      book: bookText,
      venue: ven,
      remarks: note,
    },
  };
};

// The 4 offices that actually process new-connection applications — distinct from the member's
// home-town Area/Book (all 19 AREA_LIST towns, used for account-number/book generation). Warehouse
// sorts its release queue by this field.
const HANDLING_BRANCHES = ['MAIN', 'BASEY', 'VILLAREAL', 'CATBALOGAN'];

const createMembership = async (payload = {}, usercode = '') => {
  const area = clean(payload.area);
  const book = clean(payload.barangay || payload.book || payload.areaBook);
  const accountNumber = clean(payload.accountNumber);
  const memberId = clean(payload.memberId);
  const branch = clean(payload.branch).toUpperCase();

  if (!clean(payload.lastName) || !clean(payload.firstName)) {
    throw new Error('Last name and first name are required.');
  }
  if (!area) {
    throw new Error('Area is required.');
  }
  if (!HANDLING_BRANCHES.includes(branch)) {
    throw new Error('Handling Branch is required (Main, Basey, Villareal, or Catbalogan).');
  }

  let finalAccount = accountNumber;
  let finalMemberId = memberId;
  if (!finalAccount) {
    finalAccount = await generateMemberAccount(area, book);
  }
  if (!finalMemberId) {
    finalMemberId = await generateMemberId(area, book);
  }

  const birthday = (() => {
    const y = Number(payload.birthYear || 0);
    const m = Number(payload.birthMonth || 0);
    const d = Number(payload.birthDay || 0);
    const test = new Date(y, m - 1, d);
    if (!y || !m || !d || Number.isNaN(test.getTime()) || test.getFullYear() !== y || test.getMonth() + 1 !== m || test.getDate() !== d) {
      throw new Error('Invalid birthday.');
    }
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  })();

  if (await accountNumberExists(finalAccount)) {
    throw new Error('Account number already exists. Generate a new member account first.');
  }

  await db.createPool?.();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO ${membershipTable('membershipdetais')}
       (idnumber, AssignAccountNo, LastName, FirstName, MiddleName, ExtensionName,
        Gender, BirthDay, CivilOthers, Area, HandlingBranch, Book, Street, IDOthers, IDNo,
        Membership, Classification, Application, ElectID, RemarksID, ContactNo, EMailAdd,
        TransformerID, Structure, PoleNo, FeederNo, SDWireNo, SDWireLength, MeterClass,
        Lot, LotOwner, LotRelation, House, HouseOwner, HouseRelation,
        SpouseLastName, SpouseFirstName, SpouseMiddleName, SpouseExtensionName,
        NearAccount, nearest_landmark, account_type, DateTimeAdded, AddedBy, userid, status)
       VALUES
       (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 1)`,
      [
        finalMemberId,
        finalAccount,
        clean(payload.lastName),
        clean(payload.firstName),
        clean(payload.middleName),
        clean(payload.extensionName),
        clean(payload.gender),
        birthday,
        clean(payload.civilStatus),
        extractDigits(area),
        branch,
        extractDigits(book),
        clean(payload.street),
        clean(payload.idDescription),
        clean(payload.idNumber),
        clean(payload.membershipType),
        clean(payload.classification),
        clean(payload.applicationType),
        clean(payload.electrician),
        clean(payload.remarks),
        clean(payload.contactNo),
        clean(payload.email),
        clean(payload.transformerRating),
        clean(payload.structure),
        clean(payload.poleNumber),
        clean(payload.feederNumber),
        clean(payload.serviceDropWire),
        clean(payload.serviceDropLength),
        clean(payload.meterClass),
        clean(payload.lot),
        clean(payload.lotOwner),
        clean(payload.lotRelation),
        clean(payload.house),
        clean(payload.houseOwner),
        clean(payload.houseRelation),
        clean(payload.spouseLastName),
        clean(payload.spouseFirstName),
        clean(payload.spouseMiddleName),
        clean(payload.spouseExtensionName),
        clean(payload.nearestAccount),
        clean(payload.nearestLandmark),
        clean(payload.meterType),
        clean(usercode || payload.addedBy || ''),
        clean(usercode || payload.addedBy || ''),
      ]
    );

    await connection.execute(
      `INSERT INTO ${membershipTable('membership_workflow')}
       (AccountNumber, ISD_DT, ISD_DT_userid, StatusStage, PrintFlag)
       VALUES (?, NOW(), ?, 1, 0)`,
      [finalAccount, clean(usercode || payload.addedBy || '')]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { accountNumber: finalAccount, memberId: finalMemberId };
};

// Same field set as createMembership's INSERT, but as an UPDATE against an existing
// account — used when "continue editing" loads a real record instead of a fresh one.
const updateMembership = async (payload = {}) => {
  const accountNumber = clean(payload.accountNumber);
  if (!accountNumber) {
    throw new Error('Account number is required to update.');
  }
  if (!clean(payload.lastName) || !clean(payload.firstName)) {
    throw new Error('Last name and first name are required.');
  }
  const area = clean(payload.area);
  const book = clean(payload.barangay || payload.book || payload.areaBook);
  const branch = clean(payload.branch).toUpperCase();
  if (!area) {
    throw new Error('Area is required.');
  }
  if (!HANDLING_BRANCHES.includes(branch)) {
    throw new Error('Handling Branch is required (Main, Basey, Villareal, or Catbalogan).');
  }

  const birthday = (() => {
    const y = Number(payload.birthYear || 0);
    const m = Number(payload.birthMonth || 0);
    const d = Number(payload.birthDay || 0);
    const test = new Date(y, m - 1, d);
    if (!y || !m || !d || Number.isNaN(test.getTime()) || test.getFullYear() !== y || test.getMonth() + 1 !== m || test.getDate() !== d) {
      throw new Error('Invalid birthday.');
    }
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  })();

  if (!(await accountNumberExists(accountNumber))) {
    throw new Error('Account not found — nothing to update.');
  }

  await db.execute(
    `UPDATE ${membershipTable('membershipdetais')}
     SET LastName = ?, FirstName = ?, MiddleName = ?, ExtensionName = ?,
         Gender = ?, BirthDay = ?, CivilOthers = ?, Area = ?, HandlingBranch = ?, Book = ?, Street = ?, IDOthers = ?, IDNo = ?,
         Membership = ?, Classification = ?, Application = ?, ElectID = ?, RemarksID = ?, ContactNo = ?, EMailAdd = ?,
         TransformerID = ?, Structure = ?, PoleNo = ?, FeederNo = ?, SDWireNo = ?, SDWireLength = ?, MeterClass = ?,
         Lot = ?, LotOwner = ?, LotRelation = ?, House = ?, HouseOwner = ?, HouseRelation = ?,
         SpouseLastName = ?, SpouseFirstName = ?, SpouseMiddleName = ?, SpouseExtensionName = ?,
         NearAccount = ?, nearest_landmark = ?, account_type = ?
     WHERE AssignAccountNo = ?`,
    [
      clean(payload.lastName),
      clean(payload.firstName),
      clean(payload.middleName),
      clean(payload.extensionName),
      clean(payload.gender),
      birthday,
      clean(payload.civilStatus),
      extractDigits(area),
      branch,
      extractDigits(book),
      clean(payload.street),
      clean(payload.idDescription),
      clean(payload.idNumber),
      clean(payload.membershipType),
      clean(payload.classification),
      clean(payload.applicationType),
      clean(payload.electrician),
      clean(payload.remarks),
      clean(payload.contactNo),
      clean(payload.email),
      clean(payload.transformerRating),
      clean(payload.structure),
      clean(payload.poleNumber),
      clean(payload.feederNumber),
      clean(payload.serviceDropWire),
      clean(payload.serviceDropLength),
      clean(payload.meterClass),
      clean(payload.lot),
      clean(payload.lotOwner),
      clean(payload.lotRelation),
      clean(payload.house),
      clean(payload.houseOwner),
      clean(payload.houseRelation),
      clean(payload.spouseLastName),
      clean(payload.spouseFirstName),
      clean(payload.spouseMiddleName),
      clean(payload.spouseExtensionName),
      clean(payload.nearestAccount),
      clean(payload.nearestLandmark),
      clean(payload.meterType),
      accountNumber,
    ]
  );

  return { accountNumber, memberId: clean(payload.memberId) };
};

const FEE_COLUMN_MAP = {
  'Membership Fee': 'MembeshipFee',
  'Membership Fee OR': 'MembeshipFeeOR',
  'Membership Fee Date': 'MembeshipFeeDate',
  'Membership': 'MembeshipFee',
  'S Deposit': 'SDeposit',
  'S Deposit OR': 'SDepositOR',
  'S Deposit Date': 'SDepositDate',
  'Bill Deposit': 'SDeposit',
  'Service Fee': 'ServiceFee',
  'Service Fee OR': 'ServiceFeeOR',
  'Service Fee Date': 'ServiceFeeDate',
  'Inspection Fee': 'InspectionFee',
  'Inspection Fee OR': 'InspectionFeeOR',
  'Inspection Fee Date': 'InspectionFeeDate',
  'Inspection Fees': 'InspectionFee',
  'Meter': 'Meter',
  'Meter OR': 'MeterOR',
  'Meter Date': 'MeterDate',
  'Coop Share': 'CoopShare',
  'Coop Share OR': 'CoopShareOR',
  'Coop Share Date': 'CoopShareDate',
  'Ground Rod': 'GroundRod',
  'Ground Rod OR': 'GroundRodOR',
  'Ground Rod Date': 'GroundRodDate',
  'SD Wire': 'SDWire',
  'SD Wire OR': 'SDWireOR',
  'SD Wire Date': 'SDWireDate',
  'Sedma': 'Sedma',
  'Sedma OR': 'SedmaOR',
  'Sedma Date': 'SedmaDate',
  'SEDMA': 'Sedma',
  'Meter Box': 'MeterBox',
  'Meter Box OR': 'MeterBoxOR',
  'Meter Box Date': 'MeterBoxDate',
  'Meter Base': 'MeterBase',
  'Meter Base OR': 'MeterBaseOR',
  'Meter Base Date': 'MeterBaseDate',
  'Sealing Led': 'SealingLed',
  'Sealing Led OR': 'SealingLedOR',
  'Sealing Led Date': 'SealingLedDate',
  'Transformer': 'Transformer',
  'Advance Rental': 'AdvanceRental',
  'Installation Fee': 'InstallationFee',
  'Cut-out Arrester': 'CutOutArrester',
  'MemID': 'MemID',
  'MemID OR': 'MemIdOR',
  'MemID Date': 'MemIdDate',
  'meterbrand': 'meterbrand',
  'sealnumber': 'sealnumber',
  'meterSerialnumber': 'meterSerialnumber',
  'InitiaReading': 'InitiaReading',
};

// ponytail: 5 fixed Other1..Other5 / Price1..Price5 slots on mempayments — fine for the
// handful of ad-hoc charges (ID fee, freeform "other fees") this form ever needs; if a
// member someday needs more than 5, widen this to a child rows table instead.
const OTHER_FEE_SLOTS = 5;

// The subset of FEE_COLUMN_MAP columns that hold a peso amount (excludes *OR, *Date, and
// metadata columns like MemID/meterbrand that share the map but aren't charges).
const FEE_AMOUNT_COLUMNS = new Set([
  'MembeshipFee', 'SDeposit', 'ServiceFee', 'InspectionFee', 'Meter', 'CoopShare',
  'GroundRod', 'SDWire', 'Sedma', 'MeterBox', 'MeterBase', 'SealingLed', 'Transformer',
  'AdvanceRental', 'InstallationFee', 'CutOutArrester',
]);

// Pure mapping step, split out from saveFees so the total-amount arithmetic can be
// exercised by a self-check without touching the database.
const mapFeesPayload = (fees = {}) => {
  const normalized = {};
  const unmapped = [];
  for (const [rawLabel, value] of Object.entries(fees || {})) {
    const label = rawLabel.replace(/^Other_/, '');
    const amount = clean(value);
    if (FEE_COLUMN_MAP[rawLabel]) {
      normalized[FEE_COLUMN_MAP[rawLabel]] = amount;
      continue;
    }
    if (!amount || Number(amount) === 0) continue;
    unmapped.push({ label, amount });
  }
  // Always touch all 5 slots (not just as many as `unmapped` needs) so a fee that was
  // cleared back to 0 actually clears its old slot instead of leaving stale data behind.
  for (let index = 0; index < OTHER_FEE_SLOTS; index += 1) {
    const slot = index + 1;
    const entry = unmapped[index];
    normalized[`Other${slot}`] = entry ? entry.label : null;
    normalized[`Price${slot}`] = entry ? entry.amount : null;
  }
  // Grand total shown in the Fees modal = every base charge column + every other-fee slot,
  // the same arithmetic the frontend uses for data-fees-grand-total. Computed here (not
  // trusted from the client) so it can't drift from the columns actually being saved.
  const baseTotal = Object.entries(normalized)
    .filter(([col]) => FEE_AMOUNT_COLUMNS.has(col))
    .reduce((sum, [, val]) => sum + Number(val || 0), 0);
  const otherTotal = unmapped.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  normalized.TotalAmount = (baseTotal + otherTotal).toFixed(2);
  return normalized;
};

// The Fees modal saves the "ID" charge into a generic Other/Price slot (see FEE_COLUMN_MAP
// comment above) rather than the historic MemID column, so the print form's ID row must fall
// back to whichever slot was labeled "ID" to show the amount that was actually charged.
// Split out (like mapFeesPayload) so it can be exercised by a self-check without a DB.
const resolveIdFeeAmount = (fees = {}) => {
  if (Number(fees.MemID || 0)) return fees.MemID;
  for (let slot = 1; slot <= OTHER_FEE_SLOTS; slot += 1) {
    if (clean(fees[`Other${slot}`] || '').toUpperCase() === 'ID') {
      return fees[`Price${slot}`];
    }
  }
  return fees.MemID;
};

const saveFees = async ({ memberId, fees = {} }) => {
  const target = clean(memberId);
  if (!target) throw new Error('Member ID is required.');

  const normalized = mapFeesPayload(fees);
  // ponytail: '2' = fees saved, awaiting teller collection (see mempayments.status column
  // comment: "1-2-3 payment-4-5"); markFeesPaid() below moves it to '7' once the teller
  // collects payment. Set on every save, not just the first — if a preparer edits fees after
  // the teller already marked it paid, this puts it back in the queue instead of leaving a
  // stale '7' next to numbers that no longer match what was collected.
  normalized.status = '2';

  const existing = await queryOneSafe(`SELECT COUNT(*) AS total FROM ${membershipTable('mempayments')} WHERE accountnumber = ?`, [target]);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (Number(existing?.total || 0) > 0) {
      const columns = Object.keys(normalized);
      if (columns.length > 0) {
        const setSql = columns.map((col) => `${sqlId(col)} = ?`).join(', ');
        const values = columns.map((col) => normalized[col]);
        await connection.execute(`UPDATE ${membershipTable('mempayments')} SET ${setSql} WHERE accountnumber = ?`, [...values, target]);
      }
    } else {
      const columns = ['accountnumber', ...Object.keys(normalized)];
      const values = [target, ...Object.keys(normalized).map((key) => normalized[key])];
      const placeholders = columns.map(() => '?').join(', ');
      const quotedColumns = columns.map((col) => sqlId(col)).join(', ');
      await connection.execute(`INSERT INTO ${membershipTable('mempayments')} (${quotedColumns}) VALUES (${placeholders})`, values);
    }
    // Fees saved = SOA stage. Without this the Job Order queue keeps showing "Current: ISD"
    // forever even after fees are entered, because mempayments and membership_workflow are
    // separate tables and nothing else here advances the workflow row.
    await connection.execute(
      `UPDATE ${membershipTable('membership_workflow')}
       SET SOA_DT=COALESCE(SOA_DT,NOW()),StatusStage=GREATEST(COALESCE(StatusStage,0),2)
       WHERE AccountNumber=? LIMIT 1`,
      [target]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return true;
};

// Teller queue: mempayments rows saved (status='2') but not yet collected. Joined against
// membershipdetais for a name/area the teller can actually recognize — mempayments itself only
// has the bare accountnumber.
const listPendingPayments = async () => {
  const rows = await querySafe(
    `SELECT
       p.accountnumber AS accountNumber,
       p.TotalAmount AS totalAmount,
       p.datecreted AS dateSaved,
       COALESCE(m.LastName, '') AS lastName,
       COALESCE(m.FirstName, '') AS firstName,
       COALESCE(m.MiddleName, '') AS middleName,
       COALESCE(m.Area, '') AS area
     FROM ${membershipTable('mempayments')} p
     LEFT JOIN ${membershipTable('membershipdetais')} m ON m.AssignAccountNo = p.accountnumber
     WHERE p.status = '2'
     ORDER BY p.datecreted DESC`
  );
  return rows.map((row) => ({
    accountNumber: clean(row.accountNumber),
    fullName: [row.lastName, row.firstName, row.middleName].map(clean).filter(Boolean).join(' '),
    area: clean(row.area),
    totalAmount: Number(row.totalAmount || 0),
    dateSaved: row.dateSaved ? new Date(row.dateSaved).toLocaleString('en-US') : '',
  }));
};

// Teller action: fees collected, OR numbers already entered via saveFees — this only flips the
// queue flag from '2' to '7' so the account drops off listPendingPayments.
const markFeesPaid = async (accountNumber) => {
  const target = clean(accountNumber);
  if (!target) throw new Error('Account is required.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `UPDATE ${membershipTable('mempayments')} SET status = '7' WHERE accountnumber = ?`,
      [target]
    );
    if (!(Number(result?.affectedRows || 0) > 0)) {
      throw new Error('No fee record found for that account.');
    }
    await connection.execute(
      `UPDATE ${membershipTable('membership_workflow')}
       SET PAY_DT=COALESCE(PAY_DT,NOW()),StatusStage=GREATEST(COALESCE(StatusStage,0),3)
       WHERE AccountNumber=? LIMIT 1`,
      [target]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return true;
};

// Reverse of FEE_COLUMN_MAP: real column -> the card label the Fees form shows for it.
// Kept in sync by hand since it's a small, stable set — see FEE_COLUMN_MAP above.
const FEE_COLUMN_LABELS = {
  MembeshipFee: 'Membership',
  SDeposit: 'Bill Deposit',
  ServiceFee: 'Service Fee',
  InspectionFee: 'Inspection Fees',
  Meter: 'Meter',
  CoopShare: 'Coop Share',
  GroundRod: 'Ground Rod',
  SDWire: 'SD Wire',
  Sedma: 'SEDMA',
  MeterBox: 'Meter Box',
  MeterBase: 'Meter Base',
  SealingLed: 'Sealing Led',
  Transformer: 'Transformer',
  AdvanceRental: 'Advance Rental',
  InstallationFee: 'Installation Fee',
  CutOutArrester: 'Cut-out Arrester',
};

const getFees = async (account) => {
  const target = clean(account);
  if (!target) throw new Error('Account is required.');

  const row = await queryOneSafe(
    `SELECT
       MembeshipFee, SDeposit, ServiceFee, InspectionFee, Meter, CoopShare, GroundRod,
       SDWire, Sedma, MeterBox, MeterBase, SealingLed, Transformer, AdvanceRental,
       InstallationFee, CutOutArrester,
       Other1, Price1, Other2, Price2, Other3, Price3, Other4, Price4, Other5, Price5
     FROM ${membershipTable('mempayments')}
     WHERE accountnumber = ?
     LIMIT 1`,
    [target]
  );

  const fees = {};
  const otherFees = [];
  if (row) {
    for (const [column, label] of Object.entries(FEE_COLUMN_LABELS)) {
      fees[label] = Number(row[column] || 0);
    }
    for (let slot = 1; slot <= OTHER_FEE_SLOTS; slot += 1) {
      const label = clean(row[`Other${slot}`] || '');
      const amount = Number(row[`Price${slot}`] || 0);
      if (label && amount) otherFees.push({ label, amount });
    }
  }
  return { fees, otherFees };
};

const getJobOrderDetail = async (account) => {
  const target = clean(account);
  if (!target) throw new Error('Account is required.');

  const record = await queryOneSafe(
    `SELECT
       w.AccountNumber,
       COALESCE(w.StatusStage, 0) AS StatusStage,
       COALESCE(w.PrintFlag, 0) AS PrintFlag,
       w.ISD_DT, w.SOA_DT, w.PAY_DT, w.METER_DT, w.TSD_DT, w.ENERGIZED_DT,
       COALESCE(w.DurationDays,0) AS DurationDays,
       CASE WHEN w.TSD_DT IS NULL THEN NULL
         ELSE TIMESTAMPDIFF(SECOND,w.TSD_DT,COALESCE(w.ENERGIZED_DT,NOW()))
       END AS ReleaseElapsedSeconds,
       COALESCE(m.LastName, '') AS LastName,
       COALESCE(m.FirstName, '') AS FirstName,
       COALESCE(m.MiddleName, '') AS MiddleName,
       COALESCE(m.ExtensionName, '') AS ExtensionName,
       COALESCE(m.SpouseLastName, '') AS SpouseLastName,
       COALESCE(m.SpouseFirstName, '') AS SpouseFirstName,
       COALESCE(m.SpouseMiddleName, '') AS SpouseMiddleName,
       COALESCE(m.Area, '') AS Area,
       COALESCE(m.Book, '') AS Book,
       COALESCE(m.Street, '') AS Street,
       COALESCE(m.Membership, '') AS Membership,
       COALESCE(m.Classification, '') AS Classification,
       COALESCE(m.Application, '') AS Application,
       COALESCE(m.RemarksID, '') AS RemarksID,
       COALESCE(m.ContactNo, '') AS ContactNo,
       COALESCE(released.name, '') AS ReleasedBy,
       COALESCE(released.position, '') AS ReleasedPosition,
       COALESCE(prepared.name, '') AS PreparedBy,
       COALESCE(prepared.position, '') AS PreparedPosition
     FROM ${membershipTable('membership_workflow')} w
     LEFT JOIN ${membershipTable('membershipdetais')} m ON m.AssignAccountNo = w.AccountNumber
     -- [FIX] "Release By" used to be whoever was logged in when they clicked Print in the
     -- Membership Job Order tool (w.TSD_DT_userid) — a different employee from whoever actually
     -- did the Warehouse work, since Warehouse and Membership are staffed separately.
     -- [FIX 2] Tried crediting mempayments.withdrawnby ("Withdrawn/Executed by") next, but that's
     -- a different role: the field technician who physically executed/withdrew the meter, printed
     -- separately as "Executed By". The person who should get "Release By" is whoever encoded the
     -- meter brand/serial/seal/reading in Warehouse and hit Save — that's w.METER_DT_userid,
     -- stamped by saveMeterPayment() in warehouseService.js. Falls back to the old print-click
     -- actor only for older orders saved before Warehouse stamped this.
     LEFT JOIN usertb released ON released.UserCode = COALESCE(NULLIF(w.METER_DT_userid, ''), NULLIF(w.TSD_DT_userid, ''))
     -- [FIX] w.ISD_DT_userid can end up blank (e.g. a duplicate-key retry on membership_workflow
     -- during creation leaves it unset even though membershipdetais.AddedBy/userid — set in the
     -- same createMembership call — did save correctly), which showed as a permanently blank
     -- "Prepared By" on the print with no way to fix it from the app. Fall back to whoever
     -- actually created the record.
     LEFT JOIN usertb prepared ON prepared.UserCode = COALESCE(NULLIF(w.ISD_DT_userid, ''), NULLIF(m.AddedBy, ''), NULLIF(m.userid, ''))
     WHERE w.AccountNumber = ?
     LIMIT 1`,
    [target]
  );

  if (!record) {
    throw new Error('Job order record not found.');
  }

  const fees = await queryOneSafe(
    `SELECT
       fees.ApplyID,
       fees.TotalAmount,
       fees.MembeshipFee, fees.MembeshipFeeOR, fees.MembeshipFeeDate,
       fees.SDeposit, fees.SDepositOR, fees.SDepositDate,
       fees.ServiceFee, fees.ServiceFeeOR, fees.ServiceFeeDate,
       fees.InspectionFee, fees.InspectionFeeOR, fees.InspectionFeeDate,
       fees.Meter, fees.MeterOR, fees.MeterDate,
       fees.CoopShare, fees.CoopShareOR, fees.CoopShareDate,
       fees.GroundRod, fees.GroundRodOR, fees.GroundRodDate,
       fees.SDWire, fees.SDWireOR, fees.SDWireDate,
       fees.Sedma, fees.SedmaOR, fees.SedmaDate,
       fees.MeterBox, fees.MeterBoxOR, fees.MeterBoxDate,
       fees.MeterBase, fees.MeterBaseOR, fees.MeterBaseDate,
       fees.SealingLed, fees.SealingLedOR, fees.SealingLedDate,
       fees.MemID, fees.MemIdOR, fees.MemIdDate,
       fees.Other1, fees.Price1, fees.Other2, fees.Price2, fees.Other3, fees.Price3,
       fees.Other4, fees.Price4, fees.Other5, fees.Price5,
       meter.meterbrand, meter.sealnumber, meter.ercsealnumber,
       meter.meterSerialnumber, meter.InitiaReading, meter.withdrawnby, meter.executedAt,
       COALESCE(withdrawn.name, '') AS withdrawnByName,
       COALESCE(withdrawn.position, '') AS withdrawnByPosition
     FROM ${membershipTable('mempayments')} fees
     LEFT JOIN ${membershipTable('mempayments')} meter ON meter.ApplyID = (
       SELECT saved.ApplyID
       FROM ${membershipTable('mempayments')} saved
       WHERE saved.accountnumber = fees.accountnumber AND saved.status >= 5
       ORDER BY saved.ApplyID DESC
       LIMIT 1
     )
     LEFT JOIN usertb withdrawn ON withdrawn.UserCode = meter.withdrawnby
     WHERE fees.ApplyID = (
       SELECT paid.ApplyID
       FROM ${membershipTable('mempayments')} paid
       WHERE paid.accountnumber = ?
       ORDER BY (COALESCE(paid.TotalAmount, 0) > 0) DESC, paid.ApplyID DESC
       LIMIT 1
     )
     LIMIT 1`,
    [target]
  ) || {};

  if (fees) fees.MemID = resolveIdFeeAmount(fees);

  const signatures = {
    releasedBy: clean(record.ReleasedBy),
    releasedPosition: clean(record.ReleasedPosition),
    preparedBy: clean(record.PreparedBy),
    preparedPosition: clean(record.PreparedPosition),
  };
  return {
    record,
    fees,
    signatures,
    signatories: [
      { label: 'Prepared By', name: signatures.preparedBy, title: signatures.preparedPosition },
    ],
  };
};

const markJobOrderReleased = async (account, usercode) => {
  const target = clean(account);
  const actor = clean(usercode);
  if (!target) throw Object.assign(new Error('Account is required.'), { statusCode: 422 });
  if (!actor) throw Object.assign(new Error('Signed-in employee code is required.'), { statusCode: 401 });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.execute(
      `SELECT status
       FROM ${membershipTable('mempayments')}
       WHERE accountnumber=?
       ORDER BY ApplyID DESC
       LIMIT 1 FOR UPDATE`,
      [target]
    );
    if (!payments.length) throw Object.assign(new Error('No matching payment for the selected account.'), { statusCode: 404 });
    if (Number(payments[0].status) < 5) {
      throw Object.assign(new Error('Save the meter details in Warehouse before confirming print.'), { statusCode: 409 });
    }

    const [result] = await connection.execute(
      `UPDATE ${membershipTable('membership_workflow')}
       SET TSD_DT=COALESCE(TSD_DT,NOW()),TSD_DT_userid=COALESCE(NULLIF(TSD_DT_userid,''),?),
           StatusStage=GREATEST(COALESCE(StatusStage,0),5),PrintFlag=GREATEST(COALESCE(PrintFlag,0),1),UpdatedAt=NOW()
       WHERE AccountNumber=? LIMIT 1`,
      [actor, target]
    );
    if (!result.affectedRows) {
      throw Object.assign(new Error('Release was not recorded because the membership workflow row is missing.'), { statusCode: 409 });
    }

    const [releaseRows] = await connection.execute(
      `SELECT TSD_DT AS releasedAt, ENERGIZED_DT AS energizedAt,
              TIMESTAMPDIFF(SECOND,TSD_DT,COALESCE(ENERGIZED_DT,NOW())) AS releaseElapsedSeconds
       FROM ${membershipTable('membership_workflow')}
       WHERE AccountNumber=? LIMIT 1`,
      [target]
    );
    await connection.commit();
    return releaseRows[0] || {};
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getAreas,
  getElectricians,
  addElectrician,
  getBooks,
  getBookLabel,
  getLastMasterMemberId,
  findMasterMemberId,
  generateMemberAccount,
  generateMemberId,
  getAgmaRows,
  getMemberList,
  searchMasterConsumers,
  getMasterConsumerDetail,
  getMemberDetail,
  getJobOrders,
  deleteMember,
  getMap,
  mapPoints,
  saveMap,
  saveProfilePhoto,
  saveStreetViewCapture,
  saveAgma,
  createMembership,
  updateMembership,
  saveFees,
  mapFeesPayload,
  resolveIdFeeAmount,
  getFees,
  listPendingPayments,
  markFeesPaid,
  getJobOrderDetail,
  markJobOrderReleased,
};
