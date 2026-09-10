const db = require('../config/database');
const { DEPARTMENTS } = require('../config/constants');

const getDepartmentName = (abbreviation) => {
  const abbr = String(abbreviation || '').toUpperCase().trim();
  return DEPARTMENTS[abbr] || abbreviation;
};

const getStatusLabel = (status) => {
  const s = String(status || '1');
  if (s === '2') return 'Approved';
  if (s === '3') return 'Rejected';
  return 'Pending';
};

const splitGroupList = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/\s*\|\|\s*/).filter(p => p.trim() !== '');
  return parts.map(p => p.trim());
};

const getFirstGroupValue = (values) => {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed !== '') return trimmed;
  }
  return '';
};

const normalizeFuelPeople = (people = []) => {
  const seen = new Set();
  const result = [];
  for (const person of (Array.isArray(people) ? people : [])) {
    const name = String(person?.name || '').trim();
    const usercode = String(person?.usercode || '').trim().toUpperCase();
    if (!name || !usercode || seen.has(usercode)) continue;
    seen.add(usercode);
    result.push({ name, usercode });
  }
  return result;
};

const normalizeDateValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const privilegeNumbers = (value) => String(value || '')
  .split(/\s*-\s*/)
  .map((part) => Number.parseInt(part, 10))
  .filter(Number.isFinite);

const userCanManageApprovals = (user = {}) =>
  privilegeNumbers(user.privilage).some((value) => value >= 6 && value <= 10);

const resolveRequestApprover = async (requestedCode, department, requesterUsercode, moduleKey = 'epass') => {
  const code = String(requestedCode || '').trim().toUpperCase();
  const params = [];
  let requestedSql = '';
  if (code) {
    requestedSql = 'AND UPPER(TRIM(u.usercode)) = ?';
    params.push(code);
  }
  const configured = !code ? await db.queryOne(
    `SELECT u.usercode, u.name, u.position, u.department
     FROM signatory_groups sg
     LEFT JOIN signatory_group_members sgm
       ON sgm.group_id = sg.id AND UPPER(TRIM(sgm.usercode)) = UPPER(TRIM(?))
     JOIN usertb u ON u.usercode = sg.signatory_usercode
     WHERE sg.module_key = ?
       AND COALESCE(u.privilage, '') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'
       AND (sgm.id IS NOT NULL OR UPPER(TRIM(COALESCE(sg.department, ''))) = UPPER(TRIM(?))
            OR TRIM(COALESCE(sg.department, '')) = '')
     ORDER BY CASE WHEN sgm.id IS NOT NULL THEN 0 WHEN TRIM(COALESCE(sg.department, '')) <> '' THEN 1 ELSE 2 END, sg.id
     LIMIT 1`,
    [requesterUsercode, moduleKey, department]
  ).catch(() => null) : null;
  if (configured) return configured;
  return db.queryOne(
    `SELECT u.usercode, u.name, u.position, u.department
     FROM usertb u
     WHERE u.usercode IS NOT NULL AND TRIM(u.usercode) <> ''
       AND COALESCE(u.privilage, '') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'
       ${requestedSql}
     ORDER BY CASE WHEN UPPER(TRIM(COALESCE(u.department, ''))) = UPPER(TRIM(?)) THEN 0 ELSE 1 END,
              CASE WHEN UPPER(TRIM(COALESCE(u.position, ''))) REGEXP '(DEPARTMENT[[:space:]]+(HEAD|MANAGER)|DIVISION[[:space:]]+HEAD|GENERAL[[:space:]]+MANAGER)' THEN 0 ELSE 1 END,
              u.name
     LIMIT 1`,
    [...params, department]
  );
};

const assignRequestApprover = async (connection, requestNumber, approver, assignedBy, mode = 'auto') => {
  await connection.execute(
    `INSERT INTO request_approvers
       (module, request_number, stage, approver_usercode, assigned_by, assignment_mode, assigned_at)
     VALUES ('epass', ?, 'department_head', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE approver_usercode=VALUES(approver_usercode), assigned_by=VALUES(assigned_by),
       assignment_mode=VALUES(assignment_mode), assigned_at=NOW()`,
    [requestNumber, approver.usercode, assignedBy, mode === 'manual' ? 'manual' : 'auto']
  );
  await connection.execute(
    'UPDATE epasstb SET epass_approved=? WHERE epassnumber=?',
    [approver.usercode, requestNumber]
  );
};

const requestIsAssignedTo = async (requestNumber, usercode) => {
  const row = await db.queryOne(
    `SELECT 1 found FROM request_approvers
     WHERE module='epass' AND request_number=? AND UPPER(TRIM(approver_usercode))=UPPER(TRIM(?))
     LIMIT 1`,
    [requestNumber, usercode]
  );
  return Boolean(row);
};

const generateEpassNumber = async () => {
  const year = new Date().getFullYear();
  const yearSuffix = String(year).slice(2);
  const prefix = `S2Y${yearSuffix}`;

  // The suffix starts at position 6 and intentionally has no fixed length, so the sequence
  // continues past 99999 instead of wrapping or reusing an existing EPASS number.
  const result = await db.queryOne(
    `SELECT MAX(CAST(SUBSTRING(epassnumber, 6) AS UNSIGNED)) as latest
     FROM epasstb
     WHERE epassnumber LIKE ?`,
    [`${prefix}%`]
  );

  const latest = parseInt(result?.latest || 0, 10);
  const nextSeq = String(latest + 1).padStart(5, '0');

  return `${prefix}${nextSeq}`;
};

const ensureEpassSchema = async () => {
  try {
    const fuelFarCodeExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['epasstb', 'fuel_farcode']
    );

    if (!fuelFarCodeExists) {
      await db.execute('ALTER TABLE epasstb ADD COLUMN fuel_farcode VARCHAR(64) NULL');
      await db.execute('ALTER TABLE epasstb ADD INDEX idx_epass_fuel_farcode (fuel_farcode)');
      console.log('Added fuel_farcode column to epasstb');
    }

    const approverExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['epasstb', 'epass_approved']
    );

    if (!approverExists) {
      await db.execute('ALTER TABLE epasstb ADD COLUMN epass_approved VARCHAR(64) NULL');
      console.log('Added epass_approved column to epasstb');
    }

    await db.execute(
      `UPDATE epasstb e
       JOIN request_approvers ra
         ON ra.module='epass' AND ra.stage='department_head' AND ra.request_number=e.epassnumber
       SET e.epass_approved=ra.approver_usercode
       WHERE e.epass_approved IS NULL OR TRIM(e.epass_approved)=''`
    );
  } catch (error) {
    console.error('Error ensuring epass schema:', error.message);
  }
};

const getEpassList = async (usercode, limit = 50) => {
  // [FIX] Only selected epassnumber/usercode/department/status/weight/passenger/fuel_farcode —
  // destination, purpose, and the other employees in the group were never returned, so the
  // Request History panel and print view always showed "-" for them. Group by epassnumber and
  // pull the full group's names, matching the pattern the PHP endpoints already use.
  // ponytail: same dedupe-before-GROUP_CONCAT fix as the other epass list/print queries —
  // duplicate (epassnumber, usercode) rows in epasstb were inflating "N employees linked"
  // in this exact panel (e.g. showing 77 for a request with a handful of real people).
  const passes = await db.queryAll(
    `SELECT d.epassnumber,
            MAX(d.department) AS department,
            MAX(d.destination) AS destination,
            MAX(d.purpose) AS purpose,
            MAX(d.status) AS status,
            MAX(d.weight) AS weight,
            MAX(d.passenger) AS passenger,
            MAX(d.date) AS date,
            MAX(d.fuel_farcode) AS fuel_farcode,
            MAX(d.epass_approved) AS approved_by,
            GROUP_CONCAT(NULLIF(TRIM(d.grantedto1), '') ORDER BY d.Id SEPARATOR '||') AS granted_to,
            GROUP_CONCAT(NULLIF(TRIM(u.name), '') ORDER BY d.Id SEPARATOR '||') AS requester_names,
            GROUP_CONCAT(NULLIF(TRIM(d.usercode), '') ORDER BY d.Id SEPARATOR '||') AS requester_usercodes
     FROM (
       SELECT MIN(Id) AS Id, epassnumber, usercode,
              MAX(department) AS department, MAX(destination) AS destination, MAX(purpose) AS purpose,
              MAX(status) AS status, MAX(weight) AS weight, MAX(passenger) AS passenger,
              MAX(\`date\`) AS \`date\`, MAX(fuel_farcode) AS fuel_farcode, MAX(epass_approved) AS epass_approved,
              MAX(grantedto1) AS grantedto1
         FROM epasstb
        WHERE epassnumber IN (SELECT DISTINCT epassnumber FROM epasstb WHERE usercode = ?)
        GROUP BY epassnumber, usercode
     ) d
     LEFT JOIN usertb u ON u.usercode = d.usercode
     GROUP BY d.epassnumber
     ORDER BY MAX(d.date) DESC, MAX(d.Id) DESC
     LIMIT ?`,
    [usercode, limit]
  );

  return passes.map(p => ({
    ...p,
    date_issued: p.date,
    status_label: getStatusLabel(p.status),
    department_name: getDepartmentName(p.department),
    passenger_list: splitGroupList(p.passenger),
    granted_to: splitGroupList(p.granted_to),
    requester_names: splitGroupList(p.requester_names),
    requester_usercodes: splitGroupList(p.requester_usercodes),
  }));
};

const getEpassByNumber = async (epassNumber) => {
  return db.queryOne(
    'SELECT * FROM epasstb WHERE epassnumber = ?',
    [epassNumber]
  );
};

const createEpass = async (usercode, epassData) => {
  const people = normalizeFuelPeople(epassData?.people || []);
  const destination = String(epassData?.destination || '').trim();
  const purpose = String(epassData?.purpose || '').trim();
  const requestDate = normalizeDateValue(epassData?.date || '');
  const department = String(epassData?.department || '').trim();
  const fuelFarCode = String(epassData?.fuel_farcode || epassData?.fuelFarCode || '').trim();

  if (people.length > 0) {
    if (!destination || !purpose || !requestDate || !department) {
      throw Object.assign(new Error('Please complete the employees, department, destination, date, and purpose.'), { statusCode: 422 });
    }
    const approverMode = String(epassData?.approver_mode || 'auto').toLowerCase();
    const requestedApprover = String(epassData?.approver_usercode || '').trim().toUpperCase();
    if (approverMode === 'manual' && !requestedApprover) {
      throw Object.assign(new Error('Select an approver or use Auto assign.'), { statusCode: 422 });
    }
    const approver = await resolveRequestApprover(
      requestedApprover, department, people[0].usercode, fuelFarCode ? 'fuel_epass' : 'epass'
    );
    if (!approver) {
      throw Object.assign(new Error('No eligible EPASS approver was found.'), { statusCode: 422 });
    }
    await ensureEpassSchema();
    // ponytail: only reuse+overwrite an existing epasstb record for this fuel request while it's
    // still PENDING (status=1) — that's "still editing my draft." Once it's Approved/Rejected it's
    // a closed record; a later save for the same fuel_farcode (e.g. re-requesting) must mint a new
    // epassnumber instead of deleting and rewriting the already-approved one. Previously this reused
    // ANY status, so every save kept merging into (and overwriting the people on) the same approved
    // record — "S2Y2610000, 93 employees linked" instead of separate requests each with their own number.
    const existingPending = fuelFarCode
      ? await db.queryOne(
          'SELECT epassnumber FROM epasstb WHERE fuel_farcode = ? AND status = 1 ORDER BY Id DESC LIMIT 1',
          [fuelFarCode]
        )
      : null;
    const reusingPending = Boolean(existingPending?.epassnumber);
    const epassNumber = reusingPending ? String(existingPending.epassnumber).trim() : await generateEpassNumber();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (fuelFarCode && reusingPending) {
        await connection.execute('DELETE FROM epasstb WHERE fuel_farcode = ?', [fuelFarCode]);
      }
      for (const person of people) {
        await connection.execute(
          `INSERT INTO epasstb (grantedto1, usercode, department, destination, \`date\`, purpose, status, epassnumber, fuel_farcode)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            person.name,
            person.usercode,
            department,
            destination,
            requestDate || new Date().toISOString().slice(0, 10),
            purpose,
            epassNumber,
            fuelFarCode || null,
          ]
        );
      }
      await assignRequestApprover(connection, epassNumber, approver, usercode, approverMode);
      if (fuelFarCode) {
        await connection.execute(
          'UPDATE fuelallocation_history SET epassID=? WHERE FARCode=?',
          [epassNumber, fuelFarCode]
        );
      }
      await connection.commit();
      return epassNumber;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  const epassNumber = await generateEpassNumber();
  const { weight, passenger, fuel_farcode } = epassData;

  const result = await db.execute(
    `INSERT INTO epasstb (epassnumber, usercode, department, weight, passenger, fuel_farcode, status, date)
     VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE())`,
    [epassNumber, usercode, department, weight, passenger, fuel_farcode || null]
  );

  return result.affectedRows > 0 ? epassNumber : null;
};

const updateEpass = async (owner, epassNumber, epassData) => {
  const people = normalizeFuelPeople(epassData?.people);
  const department = String(epassData?.department || '').trim();
  const destination = String(epassData?.destination || '').trim();
  const purpose = String(epassData?.purpose || '').trim();
  const requestDate = normalizeDateValue(epassData?.date);
  if (!epassNumber || !people.length || !department || !destination || !purpose || !requestDate) {
    throw Object.assign(new Error('Please complete the EPASS number, employees, department, destination, date, and purpose.'), { statusCode: 422 });
  }
  const rows = await db.queryAll('SELECT status,usercode,fuel_farcode FROM epasstb WHERE epassnumber=?', [epassNumber]);
  if (!rows.length) throw Object.assign(new Error('EPASS request not found.'), { statusCode: 404 });
  if (rows.some((row) => Number(row.status) !== 1)) throw Object.assign(new Error('Only pending EPASS requests can be edited.'), { statusCode: 409 });
  if (!rows.some((row) => String(row.usercode).trim().toUpperCase() === String(owner).trim().toUpperCase())) {
    throw Object.assign(new Error('You can only edit your own pending EPASS requests.'), { statusCode: 403 });
  }
  const fuelFarCode = rows.map((row) => String(row.fuel_farcode || '').trim()).find(Boolean) || '';
  const approverMode = String(epassData?.approver_mode || 'auto').toLowerCase();
  const requestedApprover = String(epassData?.approver_usercode || '').trim().toUpperCase();
  const approver = await resolveRequestApprover(requestedApprover, department, people[0].usercode, fuelFarCode ? 'fuel_epass' : 'epass');
  if (!approver) throw Object.assign(new Error('No eligible EPASS approver was found.'), { statusCode: 422 });
  await ensureEpassSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM epasstb WHERE epassnumber=?', [epassNumber]);
    for (const person of people) {
      await connection.execute(
        `INSERT INTO epasstb (grantedto1,usercode,department,destination,\`date\`,purpose,status,epassnumber,fuel_farcode)
         VALUES (?,?,?,?,?,?,1,?,?)`,
        [person.name, person.usercode, department, destination, requestDate, purpose, epassNumber, fuelFarCode || null]
      );
    }
    await assignRequestApprover(connection, epassNumber, approver, owner, approverMode);
    await connection.commit();
    return epassNumber;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const cancelEpassByFuelFarCode = async (farCode) => {
  const fuelFarCode = String(farCode || '').trim();
  if (!fuelFarCode) {
    return false;
  }

  await ensureEpassSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM epasstb WHERE fuel_farcode = ?', [fuelFarCode]);
    await connection.execute(
      'UPDATE fuelallocation_history SET epassID = NULL WHERE FARCode = ?',
      [fuelFarCode]
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const linkEpassToFuel = async (epassNumber, farCode) => {
  if (!epassNumber || !farCode) return false;

  // ponytail: same "don't merge unrelated requests" guard as createEpass — without this, the
  // same epassnumber could be attached to any number of unrelated fuel requests with a single
  // UPDATE, so every one of those requests' prints/history would show the *combined* people
  // list instead of just its own. Only block on a genuinely different, already-linked far code;
  // re-linking the same far code (idempotent retry) is fine.
  const conflict = await db.queryOne(
    `SELECT FARCode FROM fuelallocation_history
      WHERE epassID = ? AND FARCode <> ? LIMIT 1`,
    [epassNumber, farCode]
  );
  if (conflict) {
    throw Object.assign(
      new Error(`EPASS ${epassNumber} is already linked to fuel request ${conflict.FARCode}. Use a different EPASS or create a new one.`),
      { statusCode: 409 }
    );
  }

  const result = await db.execute(
    `UPDATE fuelallocation_history
     SET epassID = ?
     WHERE FARCode = ? AND (epassID IS NULL OR TRIM(epassID) = '')`,
    [epassNumber, farCode]
  );

  return result.affectedRows > 0;
};

const approveEpass = async (epassNumber) => {
  const result = await db.execute(
    `UPDATE epasstb e
     LEFT JOIN request_approvers ra
       ON ra.module = 'epass' AND ra.request_number = e.epassnumber
     SET e.status = 2,
         e.epass_approved = COALESCE(NULLIF(TRIM(ra.approver_usercode), ''), e.epass_approved)
     WHERE e.epassnumber = ?`,
    [epassNumber]
  );

  return result.affectedRows > 0;
};

const rejectEpass = async (epassNumber) => {
  const result = await db.execute(
    'UPDATE epasstb SET status = 3 WHERE epassnumber = ?',
    [epassNumber]
  );

  return result.affectedRows > 0;
};

const archiveAndRemovePerson = async (epassNumber, rowId, removedBy) => {
  const connection = await db.getConnection();
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'epasstb_removed'");
    if (!tables.length) {
      await connection.query('CREATE TABLE epasstb_removed LIKE epasstb');
      await connection.query(
        'ALTER TABLE epasstb_removed ADD COLUMN removed_by VARCHAR(32) NULL, ADD COLUMN removed_at DATETIME NULL'
      );
    }
    // ponytail: archive mirrors epasstb column order; schema drift safely fails before DELETE.
    await connection.beginTransaction();
    const [archived] = await connection.execute(
      `INSERT INTO epasstb_removed
       SELECT e.*, ?, NOW() FROM epasstb e WHERE e.Id=? AND e.epassnumber=?`,
      [String(removedBy || '').trim().toUpperCase(), rowId, epassNumber]
    );
    if (!archived.affectedRows) {
      await connection.rollback();
      return false;
    }
    const [removed] = await connection.execute(
      'DELETE FROM epasstb WHERE Id=? AND epassnumber=?',
      [rowId, epassNumber]
    );
    if (!removed.affectedRows) {
      await connection.rollback();
      return false;
    }
    await connection.commit();
    return true;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getDepartmentName,
  getStatusLabel,
  splitGroupList,
  getFirstGroupValue,
  privilegeNumbers,
  userCanManageApprovals,
  resolveRequestApprover,
  requestIsAssignedTo,
  generateEpassNumber,
  ensureEpassSchema,
  getEpassList,
  getEpassByNumber,
  createEpass,
  updateEpass,
  linkEpassToFuel,
  cancelEpassByFuelFarCode,
  approveEpass,
  rejectEpass,
  archiveAndRemovePerson,
};
