/**
 * SAM report rows — Node port of aiReportRows() from api/ai_history.php.
 *
 * PARIDAD ANG LAYUNIN: dapat pareho ang ibinabalik nito sa PHP para sa parehong tanong.
 * Kaya:
 *   - Pareho ang column aliases (ang mga ito ang nagiging header ng PDF/Excel).
 *   - Pareho ang ORDER BY at LIMIT.
 *   - Pareho ang privilege rule: privilege 6-10 = lahat ng empleyado; 1-5 = sarili lang.
 *
 * PAGKAKAIBA SA PHP: ang PDO ay gumagamit ng named params (:date_from) samantalang ang
 * mysql2 dito ay positional (?). Kaya nakasunod ang params array sa pagkakasunod ng "?".
 */

const db = require('../../config/database');
const { hasFullDataAccess } = require('./guards');
// Tunay na port ng aiExtractReportKeywords/aiBuildKeywordFilter — hati sa keywords.js dahil
// ginagamit din ito ng dtrFlex.js. Dapat iisa lang ang stop-word list.
const { extractReportKeywords, buildKeywordFilter } = require('./keywords');

const ROW_LIMIT = 100000;

// ── Short-TTL result cache ──────────────────────────────────────────────────
// ponytail: kapag paulit-ulit hinihiling ang PAREHONG ulat (parehong module,
// petsa, format, at "sino nagtatanong" — sarili lang vs buong kumpanya) sa
// loob ng ilang minuto, ibinabalik na lang ang naunang resulta sa halip na
// mag-query ulit sa database. In-memory lang (walang bagong dependency,
// nawawala kapag na-restart). Kisame: pwedeng luma nang hanggang CACHE_TTL_MS
// ang report kung may bagong fuel/leave/atbp. na na-file sa parehong window —
// katanggap-tanggap para sa isang chat report tool, hindi ito live dashboard.
// Upgrade path: mag-invalidate mismo sa samActions.js kapag may successful
// write, sa halip na umasa lang sa oras, kung maging totoong reklamo ito.
const CACHE_TTL_MS = 5 * 60 * 1000;
const rowsCache = new Map();

function cacheKey({ user = {}, scope, dateFrom, dateTo, message = '' }) {
  const who = hasFullDataAccess(user) ? 'ALL' : String(user.usercode || '').toUpperCase();
  const kw = extractReportKeywords(message).sort().join(',');
  return `${scope}|${dateFrom}|${dateTo}|${who}|${kw}`;
}

/** Para sa mga selfcheck/test lang — sigurado ang bawat test run ay hindi maaapektuhan ng lumang cache. */
function clearReportRowsCache() {
  rowsCache.clear();
}

/** Katulad ng aiCleanText(): pinuputol at nililinis ang mahabang teksto. */
function cleanText(value, max = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Sinusubukan ang bawat pangalan ng table hanggang may makitang may laman (billing/soa/membership). */
async function firstTableWithRows(candidates, label) {
  for (const table of candidates) {
    try {
      const rows = await db.queryAll(`SELECT * FROM \`${table}\` ORDER BY Id DESC LIMIT ${ROW_LIMIT}`);
      if (rows && rows.length) return rows;
    } catch {
      // susunod na kandidato
    }
  }
  return [{
    Report: label,
    Status: 'Table not found',
    Note: `Contact IT to verify the ${label.toLowerCase()} module table name.`,
  }];
}

/**
 * Pangunahing tagakuha ng rows.
 * @returns {Promise<Array<Object>>} rows na may column aliases na gagamitin ng PDF/Excel
 */
async function fetchReportRows({ user = {}, scope, dateFrom, dateTo, message = '' }) {
  const isAdmin = hasFullDataAccess(user);
  const usercode = String(user.usercode || '').trim().toUpperCase();
  const bioUid = String(user.bioUID || '').trim();
  const keywords = extractReportKeywords(message);

  try {
    if (scope === 'employees') {
      if (!isAdmin) {
        return [{
          'Employee No.': usercode,
          Name: user.name || '',
          Position: user.position || '',
          Department: user.department || '',
          Area: user.area || '',
        }];
      }
      const params = [];
      const kw = buildKeywordFilter(keywords, ['department', 'position', 'name', 'area', 'usercode'], params);
      return db.queryAll(
        `SELECT usercode AS \`Employee No.\`, name AS \`Name\`, position AS \`Position\`,
                department AS \`Department\`, area AS \`Area\`,
                mobile_number AS \`Contact\`, emailadd AS \`Email\`,
                address AS \`Address\`, employmentdate AS \`Date Hired\`
         FROM \`usertb\`
         WHERE COALESCE(username, "") != "__samelco_ai__"
           ${kw}
         ORDER BY name ASC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    // Pinagsasama ang lahat ng modyul sa iisang normalized na hugis.
    if (scope === 'all_data') {
      const all = [];
      const profiles = await reportRows({ user, scope: 'employees', dateFrom, dateTo });
      for (const row of profiles) {
        all.push({
          Section: 'Profile',
          'Employee No.': row['Employee No.'] || '',
          Employee: row.Name || row.Employee || '',
          Date: '',
          Reference: row.Position || '',
          Status: row.Department || '',
          Details: `Area: ${row.Area || '-'} | Email: ${row.Email || '-'}`,
        });
      }
      const parts = { dtr: 'DTR', fuel: 'Fuel', epass: 'EPASS', leave: 'Leave', travel: 'Travel' };
      for (const [partScope, section] of Object.entries(parts)) {
        const rows = await reportRows({ user, scope: partScope, dateFrom, dateTo });
        for (const row of rows) {
          all.push({
            Section: section,
            'Employee No.': row['Employee No.'] || '',
            Employee: row.Employee || row.Name || '',
            Date: row.Date || row.From || row['Request Date'] || '',
            Reference: row['FAR Code'] || row['EPASS No.'] || row['Tracking No.'] || row['TO No.'] || row.Day || '',
            Status: row.Status || '',
            Details: cleanText([
              row.Department, row['First In'], row['Last Out'], row.Item,
              row.Liters, row.Destination, row.Purpose, row.Remarks,
            ].filter((v) => String(v ?? '').trim() !== '').join(' | ')),
          });
        }
      }
      return all.slice(0, ROW_LIMIT);
    }

    if (scope === 'leave') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = '(l.empID = ? OR l.NAME = ?)';
        params.push(usercode, String(user.name || ''));
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['l.division', 'l.NAME', 'l.Position', 'l.remarks', 'l.empID'], params);
      return db.queryAll(
        `SELECT l.trackingNo AS \`Tracking No.\`, l.empID AS \`Employee No.\`, l.NAME AS \`Employee\`,
                l.Position AS \`Position\`, l.division AS \`Department\`, l.numofdays AS \`Days\`,
                l.datafrom AS \`From\`, l.dateto AS \`To\`, l.datecreated AS \`Date Created\`,
                l.Status AS \`Status\`, l.remarks AS \`Remarks\`
         FROM \`tbleave\` l
         WHERE ${where}
           AND COALESCE(l.datecreated, l.datafrom, l.dateto) BETWEEN ? AND ?
           ${kw}
         ORDER BY COALESCE(l.datecreated, l.datafrom, l.dateto) DESC, l.Id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'travel') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = 't.usercode = ?';
        params.push(usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['t.department', 't.destination', 't.purpose', 't.grantedto1', 'u.name'], params);
      return db.queryAll(
        `SELECT t.to_number AS \`TO No.\`, t.usercode AS \`Employee No.\`, COALESCE(u.name, t.grantedto1, t.usercode) AS \`Employee\`,
                t.department AS \`Department\`, t.destination AS \`Destination\`, t.date AS \`Date\`,
                t.timedepart AS \`Depart\`, t.timearriveval AS \`Arrive\`, t.purpose AS \`Purpose\`, t.status AS \`Status\`
         FROM \`traveltb\` t
         LEFT JOIN \`usertb\` u ON u.usercode = t.usercode
         WHERE ${where}
           AND DATE(t.date) BETWEEN ? AND ?
           ${kw}
         ORDER BY t.date DESC, t.Id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'it_joborder') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = 'j.usercode = ?';
        params.push(usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(
        keywords,
        ['j.equipmentdescription', 'j.problemsencountered', 'j.work_details', 'u.department', 'u.name', 'j.usercode'],
        params
      );
      return db.queryAll(
        `SELECT j.jobordernum AS \`Job Order\`, j.usercode AS \`Employee No.\`, COALESCE(u.name, j.username, j.usercode) AS \`Employee\`,
                j.equipmentid AS \`Equipment ID\`, j.equipmentdescription AS \`Equipment\`,
                j.problemsencountered AS \`Problem\`, j.work_details AS \`Work Details\`,
                j.requestDate AS \`Request Date\`, j.completedDate AS \`Completed Date\`, j.status AS \`Status\`
         FROM \`it_joborder\` j
         LEFT JOIN \`usertb\` u ON u.usercode = j.usercode
         WHERE ${where}
           AND COALESCE(j.requestDate, j.completedDate) BETWEEN ? AND ?
           ${kw}
         ORDER BY COALESCE(j.requestDate, j.completedDate) DESC, j.id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'materials') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = 'mh.userid = ?';
        params.push(usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['mh.description', 'mh.materialcode', 'mh.serial', 'mh.remarks'], params);
      return db.queryAll(
        `SELECT mh.materialcode AS \`Material Code\`, mh.description AS \`Description\`, mh.serial AS \`Serial\`,
                mh.inqty AS \`In Qty\`, mh.outqty AS \`Out Qty\`, mh.date AS \`Date\`,
                mh.userid AS \`Employee No.\`, COALESCE(u.name, mh.userid) AS \`Employee\`, mh.remarks AS \`Remarks\`
         FROM \`material_history\` mh
         LEFT JOIN \`usertb\` u ON u.usercode = mh.userid
         WHERE ${where}
           AND DATE(mh.date) BETWEEN ? AND ?
           ${kw}
         ORDER BY mh.date DESC, mh.Id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'status_report') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = 'sr.usercode = ?';
        params.push(usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['sr.unitinfo', 'sr.recommendation', 'sr.testresult', 'u.department', 'u.name'], params);
      return db.queryAll(
        `SELECT sr.acnumber AS \`AC No.\`, sr.usercode AS \`Employee No.\`, COALESCE(u.name, sr.name, sr.usercode) AS \`Employee\`,
                sr.unitinfo AS \`Unit Info\`, sr.itemno AS \`Item No.\`, sr.testresult AS \`Test Result\`,
                sr.flag_status AS \`Status\`, sr.checkby AS \`Checked By\`, sr.approvedby AS \`Approved By\`,
                sr.date_report AS \`Date\`, sr.recommendation AS \`Recommendation\`
         FROM \`statusreport\` sr
         LEFT JOIN \`usertb\` u ON u.usercode = sr.usercode
         WHERE ${where}
           AND DATE(sr.date_report) BETWEEN ? AND ?
           ${kw}
         ORDER BY sr.date_report DESC, sr.Id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'turnover') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = 'tr.usercode = ?';
        params.push(usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['tr.itemname', 'tr.statuscon', 'u.department', 'u.name'], params);
      return db.queryAll(
        `SELECT tr.acnumber AS \`AC No.\`, tr.usercode AS \`Employee No.\`, COALESCE(u.name, tr.usersname, tr.usercode) AS \`Employee\`,
                tr.itemnumber AS \`Item No.\`, tr.itemname AS \`Item\`, tr.statusid AS \`Status ID\`,
                tr.statuscon AS \`Condition\`, tr.turnoverdate AS \`Turnover Date\`,
                tr.recievedby AS \`Received By\`, tr.approvedby AS \`Approved By\`
         FROM \`turnoverreport\` tr
         LEFT JOIN \`usertb\` u ON u.usercode = tr.usercode
         WHERE ${where}
           AND DATE(tr.turnoverdate) BETWEEN ? AND ?
           ${kw}
         ORDER BY tr.turnoverdate DESC, tr.Id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'fuel') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        // Dalawang beses ang usercode dito: accountused OR usercode.
        where = '(fh.accountused = ? OR fh.usercode = ?)';
        params.push(usercode, usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(
        keywords,
        ['fh.Purpose', 'fh.Requested_item', 'fh.unit_id', 'fh.fuelstation', 'u.department', 'fh.usercode', 'fh.accountused'],
        params
      );
      return db.queryAll(
        `SELECT fh.FARCode AS \`FAR Code\`, fh.usercode AS \`Employee No.\`, COALESCE(u.name, fh.usercode) AS \`Employee\`,
                fh.Requested_item AS \`Item\`, fh.PresRequest AS \`Liters\`, fh.Balance AS \`Balance\`,
                fh.PresRequestDate AS \`Date\`, fh.unit_id AS \`Vehicle\`, fh.fuelstation AS \`Station\`,
                fh.Purpose AS \`Purpose\`, fh.status AS \`Status\`
         FROM \`fuelallocation_history\` fh
         LEFT JOIN \`usertb\` u ON u.usercode = fh.usercode
         WHERE fh.status <> 4
           AND ${where}
           AND DATE(fh.PresRequestDate) BETWEEN ? AND ?
           ${kw}
         ORDER BY fh.PresRequestDate DESC, fh.id DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'epass') {
      const params = [];
      let where = '1=1';
      if (!isAdmin) {
        where = 'e.usercode = ?';
        params.push(usercode);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['e.department', 'e.destination', 'e.purpose', 'e.grantedto1'], params);
      return db.queryAll(
        `SELECT e.epassnumber AS \`EPASS No.\`, e.usercode AS \`Employee No.\`, COALESCE(u.name, e.grantedto1, e.usercode) AS \`Employee\`,
                MAX(e.department) AS \`Department\`, MAX(e.destination) AS \`Destination\`,
                MAX(e.\`date\`) AS \`Date\`, MAX(e.purpose) AS \`Purpose\`, MAX(e.status) AS \`Status\`
         FROM \`epasstb\` e
         LEFT JOIN \`usertb\` u ON u.usercode = e.usercode
         WHERE e.epassnumber IS NOT NULL
           AND TRIM(e.epassnumber) <> ""
           AND ${where}
           AND DATE(e.\`date\`) BETWEEN ? AND ?
           ${kw}
         GROUP BY e.epassnumber, e.usercode, COALESCE(u.name, e.grantedto1, e.usercode)
         ORDER BY MAX(e.Id) DESC
         LIMIT ${ROW_LIMIT}`,
        params
      );
    }

    if (scope === 'dtr' || scope === 'dtr_late') {
      // Walang bioUID = walang biometric record na maiuugnay.
      if (!isAdmin && bioUid === '') return [];
      const params = [];
      let where = 'u.bioUID IS NOT NULL AND TRIM(u.bioUID) <> ""';
      if (!isAdmin) {
        where = 'CAST(c.USERID AS CHAR) = ?';
        params.push(bioUid);
      }
      params.push(dateFrom, dateTo);
      const kw = buildKeywordFilter(keywords, ['u.department', 'u.name', 'u.usercode'], params);
      // dtr_late = pumasok nang lampas 8:00 AM.
      const having = scope === 'dtr_late' ? 'HAVING first_in_time > "08:00:00"' : '';
      const rows = await db.queryAll(
        `SELECT u.usercode AS \`Employee No.\`, u.name AS \`Employee\`, u.department AS \`Department\`,
                DATE(c.CHECKTIME) AS \`Date\`, DAYNAME(c.CHECKTIME) AS \`Day\`,
                MIN(TIME(c.CHECKTIME)) AS first_in_time,
                TIME_FORMAT(MIN(c.CHECKTIME), "%h:%i %p") AS \`First In\`,
                TIME_FORMAT(MAX(c.CHECKTIME), "%h:%i %p") AS \`Last Out\`,
                COUNT(*) AS \`Logs\`,
                GROUP_CONCAT(DISTINCT COALESCE(c.Area, "") ORDER BY c.Area SEPARATOR ", ") AS \`Area\`
         FROM \`checkinout\` c
         INNER JOIN \`usertb\` u ON CAST(c.USERID AS CHAR) = TRIM(u.bioUID)
         WHERE ${where}
           AND DATE(c.CHECKTIME) BETWEEN ? AND ?
           ${kw}
         GROUP BY u.usercode, u.name, u.department, DATE(c.CHECKTIME), DAYNAME(c.CHECKTIME)
         ${having}
         ORDER BY DATE(c.CHECKTIME) DESC, u.name ASC
         LIMIT ${ROW_LIMIT}`,
        params
      );
      // Tulad ng PHP: hindi ipinapakita ang panloob na sorting column.
      return rows.map(({ first_in_time, ...rest }) => rest);
    }

    if (scope === 'billing') {
      return firstTableWithRows(['billingtb', 'billing', 'billing_records', 'billstb'], 'Billing');
    }
    if (scope === 'soa') {
      return firstTableWithRows(['soatb', 'soa', 'soa_records', 'statement_of_account', 'soamaster'], 'SOA');
    }
    if (scope === 'membership') {
      return firstTableWithRows(['membertb', 'membership', 'members', 'consumertb', 'consumer', 'member_records'], 'Membership');
    }
  } catch {
    return [];
  }

  // Walang tugmang scope = buod: ilang record bawat modyul.
  const sections = [];
  for (const part of ['employees', 'dtr_late', 'fuel', 'epass', 'leave', 'travel', 'it_joborder',
    'materials', 'status_report', 'turnover', 'billing', 'soa', 'membership']) {
    const rows = await reportRows({ user, scope: part, dateFrom, dateTo });
    sections.push({
      Report: part.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      Records: rows.length,
      Period: `${dateFrom} to ${dateTo}`,
    });
  }
  return sections;
}

/** Cached entry point — see the "Short-TTL result cache" block above. */
async function reportRows(args) {
  const key = cacheKey(args);
  const hit = rowsCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const rows = await fetchReportRows(args);
  rowsCache.set(key, { rows, at: Date.now() });
  return rows;
}

module.exports = { reportRows, cleanText, clearReportRowsCache };
