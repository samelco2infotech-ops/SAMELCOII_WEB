const db = require('../config/database');
const { TRAVEL_STATUS, TRAVEL_STATUS_LABELS, DEPARTMENTS } = require('../config/constants');
const { getDateString } = require('../utils/dateTime');

const TRAVEL_APPROVAL_STAGES = ['department_head', 'general_manager'];
const TRAVEL_MEMBER_SCOPE_SQL = `EXISTS (
  SELECT 1 FROM traveltb member
  WHERE member.to_number=t.to_number AND UPPER(TRIM(member.usercode))=UPPER(TRIM(?))
)`;
const normalizeApprovalStage = (stage) => (
  TRAVEL_APPROVAL_STAGES.includes(String(stage || '').trim().toLowerCase())
    ? String(stage).trim().toLowerCase()
    : 'department_head'
);
const travelApprovalTransition = (stage, decision) => {
  const current = normalizeApprovalStage(stage);
  if (Number(decision) === Number(TRAVEL_STATUS.REJECTED)) {
    return { status: TRAVEL_STATUS.REJECTED, final: true, next_stage: null };
  }
  if (Number(decision) !== Number(TRAVEL_STATUS.APPROVED)) {
    throw new Error('Invalid Travel approval decision.');
  }
  return current === 'department_head'
    ? { status: TRAVEL_STATUS.PENDING, final: false, next_stage: 'general_manager' }
    : { status: TRAVEL_STATUS.APPROVED, final: true, next_stage: null };
};

const getDepartmentName = (abbreviation) => {
  const abbr = String(abbreviation || '').toUpperCase().trim();
  return DEPARTMENTS[abbr] || abbreviation || 'ADMINISTRATIVE DEPARTMENT';
};

const normalizeFuelPeople = (people = []) => {
  return (Array.isArray(people) ? people : [])
    .map((person) => ({
      name: String(person?.name || '').trim(),
      usercode: String(person?.usercode || '').trim().toUpperCase(),
    }))
    .filter((person) => person.name && person.usercode);
};

const normalizeDateValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

// A Travel Request can span several days (the calendar UI lets the user pick more than one
// date); traveltb still stores one row per traveler, so the span is kept as a date/date_to
// range on that same row rather than one row per date — mirrors how tbleave (datafrom/dateto)
// already represents multi-day Leave. Only the outer bounds are kept, so an order made of two
// non-consecutive picks (e.g. Aug 22 and Aug 24) is stored — and later shown on the DTR — as a
// continuous range covering the day in between too.
const normalizeDateRange = (datesInput, singleDateInput) => {
  const list = (Array.isArray(datesInput) ? datesInput : [])
    .map((value) => normalizeDateValue(value))
    .filter(Boolean);
  if (!list.length) {
    const single = normalizeDateValue(singleDateInput);
    return single ? { dateFrom: single, dateTo: single } : { dateFrom: '', dateTo: '' };
  }
  list.sort();
  return { dateFrom: list[0], dateTo: list[list.length - 1] };
};

// Rebuilds the individual dates the edit form needs from the stored date/date_to range.
const expandDateRange = (dateFrom, dateTo) => {
  const start = normalizeDateValue(dateFrom);
  if (!start) return [];
  const end = normalizeDateValue(dateTo) || start;
  const dates = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return dates;
};

const getStatusLabel = (status) => {
  const s = String(status || '1');
  return TRAVEL_STATUS_LABELS[s] || 'Pending';
};
// ponytail: boundary is "any non-letter" ([^A-Z]), not just whitespace — same as the frontend's
// isDepartmentHeadApprover() in fuel-actions.js. A position like "MANAGER," or "OIC-HEAD" has a
// comma/hyphen right after the title word, which \s-only boundaries miss, silently rejecting a
// department head the UI already showed as eligible ("No eligible Department Head was found").
const isDepartmentHead = (person) => {
  const position = String(person?.position || '').trim().toUpperCase();
  return Boolean(position)
    && !/\b(ASSISTANT|ASST|DEPUTY|GENERAL\s+MANAGER)\b/.test(position)
    && /(DEPARTMENT\s+(HEAD|MANAGER)|DIVISION\s+HEAD|COMPTROLLER|(^|[^A-Z])CHIEF([^A-Z]|$)|(^|[^A-Z])(HEAD|MANAGER)([^A-Z]|$))/.test(position);
};

// ponytail: surfaces exactly which candidate was rejected and why, in the error text itself —
// there's no server console access from the client side, so this is the only way to see what
// resolveRequestApprover actually picked without a DB query.
const describeApproverMiss = (approver, department) => {
  if (!approver) return ` No privileged (5-10) user was found for department "${department}".`;
  return ` Closest match was ${approver.name || approver.usercode} (${approver.usercode}), position "${approver.position || '(blank)'}", department "${approver.department || '(blank)'}" — that title isn't recognized as a Department Head.`;
};
const travelPrintSignatories = (row = {}) => ([
  {
    stage: 'department_head',
    label: 'Recommending Approval',
    name: String(row.department_head_name || '').trim(),
    position: String(row.department_head_position || 'Department Head').trim(),
  },
  {
    stage: 'general_manager',
    label: 'Approved By',
    name: String(row.general_manager_name || '').trim(),
    position: String(row.general_manager_position || 'General Manager').trim(),
  },
]);

const generateTravelNumber = async () => {
  const year = new Date().getFullYear();
  const yearSuffix = String(year).slice(2);
  const prefix = `S2Y${yearSuffix}`;

  // [FIX] Same off-by-one as epassService.js's generateEpassNumber(): sequence starts at
  // position 6, not 7, or trailing-zero numbers always read back as 0 and the counter stalls.
  const result = await db.queryOne(
    `SELECT MAX(CAST(SUBSTRING(to_number, 6, 5) AS UNSIGNED)) as latest
     FROM traveltb
     WHERE to_number LIKE ?`,
    [`${prefix}%`]
  );

  const latest = parseInt(result?.latest || 0, 10);
  const nextSeq = String(latest + 1).padStart(5, '0');

  return `${prefix}${nextSeq}`;
};

const ensureTravelSchema = async () => {
  try {
    const fuelFarCodeExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['traveltb', 'fuel_farcode']
    );

    if (!fuelFarCodeExists) {
      await db.execute('ALTER TABLE traveltb ADD COLUMN fuel_farcode VARCHAR(64) NULL');
      await db.execute('ALTER TABLE traveltb ADD INDEX idx_travel_fuel_farcode (fuel_farcode)');
      console.log('Added fuel_farcode column to traveltb');
    }

    const dateToExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['traveltb', 'date_to']
    );

    if (!dateToExists) {
      await db.execute('ALTER TABLE traveltb ADD COLUMN date_to DATE NULL');
      console.log('Added date_to column to traveltb');
    }

    const approverExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['traveltb', 'to_approved']
    );

    if (!approverExists) {
      await db.execute('ALTER TABLE traveltb ADD COLUMN to_approved VARCHAR(64) NULL');
      console.log('Added to_approved column to traveltb');
    }

    const approvalStageExists = await db.queryOne(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['traveltb', 'approval_stage']
    );

    if (!approvalStageExists) {
      await db.execute("ALTER TABLE traveltb ADD COLUMN approval_stage VARCHAR(40) NOT NULL DEFAULT 'department_head'");
      console.log('Added approval_stage column to traveltb');
    }

    const approverIndex = await db.queryAll(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='request_approvers' AND INDEX_NAME='uniq_request_approver' ORDER BY SEQ_IN_INDEX`
    );
    const approverIndexColumns = approverIndex.map((row) => String(row.COLUMN_NAME).toLowerCase()).join(',');
    if (approverIndexColumns !== 'module,request_number,stage') {
      if (approverIndexColumns) await db.execute('ALTER TABLE request_approvers DROP INDEX uniq_request_approver');
      await db.execute('ALTER TABLE request_approvers ADD UNIQUE KEY uniq_request_approver(module,request_number,stage)');
    }
    const approverPrimary = await db.queryAll(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='request_approvers' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX`
    );
    const approverPrimaryColumns = approverPrimary.map((row) => String(row.COLUMN_NAME).toLowerCase()).join(',');
    if (approverPrimaryColumns === 'module,request_number') {
      await db.execute(
        'ALTER TABLE request_approvers DROP PRIMARY KEY, ADD PRIMARY KEY(module,request_number,stage)'
      );
    }

    await db.execute(
      `UPDATE traveltb t
       JOIN request_approvers ra
         ON ra.module='travel' AND ra.stage='department_head' AND ra.request_number=t.to_number
       SET t.to_approved=ra.approver_usercode
       WHERE t.to_approved IS NULL OR TRIM(t.to_approved)=''`
    );
  } catch (error) {
    console.error('Error ensuring travel schema:', error.message);
  }
};

const userCanManageApprovals = (user) => {
  const privilage = String(user?.privilage || '');
  const parts = privilage.split(/\s*-\s*/).map(p => parseInt(p.trim(), 10)).filter(p => !Number.isNaN(p));

  return parts.some(p => p >= 6 && p <= 10);
};

const resolveRequestApprover = async (requestedCode, department, requesterUsercode, moduleKey = 'travel') => {
  const code = String(requestedCode || '').trim().toUpperCase();
  const configured = !code ? await db.queryOne(
    `SELECT u.usercode,u.name,u.position,u.department
     FROM signatory_groups sg
     LEFT JOIN signatory_group_members sgm
       ON sgm.group_id=sg.id AND UPPER(TRIM(sgm.usercode))=UPPER(TRIM(?))
     JOIN usertb u ON u.usercode=sg.signatory_usercode
     WHERE sg.module_key=?
       AND COALESCE(u.privilage,'') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'
       AND (sgm.id IS NOT NULL OR UPPER(TRIM(COALESCE(sg.department,'')))=UPPER(TRIM(?))
            OR TRIM(COALESCE(sg.department,''))='')
     ORDER BY CASE WHEN sgm.id IS NOT NULL THEN 0 WHEN TRIM(COALESCE(sg.department,''))<>'' THEN 1 ELSE 2 END,sg.id
     LIMIT 1`,
    [requesterUsercode, moduleKey, department]
  ).catch(() => null) : null;
  if (configured) return { ...configured, trusted: true };
  const fallback = await db.queryOne(
    `SELECT u.usercode,u.name,u.position,u.department FROM usertb u
     WHERE u.usercode IS NOT NULL AND TRIM(u.usercode)<>''
       AND COALESCE(u.privilage,'') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'
       ${code ? 'AND UPPER(TRIM(u.usercode))=?' : ''}
     ORDER BY CASE WHEN UPPER(TRIM(COALESCE(u.department,'')))=UPPER(TRIM(?)) THEN 0 ELSE 1 END,
       CASE WHEN UPPER(TRIM(COALESCE(u.position,''))) REGEXP '(DEPARTMENT[[:space:]]+(HEAD|MANAGER)|DIVISION[[:space:]]+HEAD|GENERAL[[:space:]]+MANAGER)' THEN 0 ELSE 1 END,
       u.name LIMIT 1`,
    code ? [code, department] : [department]
  );
  return fallback && code ? { ...fallback, trusted: true } : fallback;
};

const resolveGeneralManager = async () => db.queryOne(
  `SELECT u.usercode,u.name,u.position,u.department
   FROM usertb u
   WHERE u.usercode IS NOT NULL AND TRIM(u.usercode)<>''
     AND COALESCE(u.privilage,'') REGEXP '(^|[^0-9])(6|7|8|9|10)([^0-9]|$)'
     AND UPPER(TRIM(COALESCE(u.position,''))) REGEXP '(OIC[[:space:]-]*)?GENERAL[[:space:]]+MANAGER'
   ORDER BY CASE WHEN UPPER(TRIM(COALESCE(u.position,''))) LIKE 'OIC%' THEN 0 ELSE 1 END,u.name
   LIMIT 1`
);

// [FEATURE] Lets a privilege-10 user pick who stands in as the General Manager approver for a
// specific Travel request (e.g. a different area's manager filling in) instead of always
// routing to whoever resolveGeneralManager() finds. Only requires manager-level privilege
// (6-10), not the literal "General Manager" title — the caller-privilege gate lives in the route.
const resolveManualGeneralManager = async (usercode) => {
  const code = String(usercode || '').trim().toUpperCase();
  if (!code) return null;
  const person = await db.queryOne(
    'SELECT usercode,name,position,department,privilage FROM usertb WHERE UPPER(TRIM(usercode))=? LIMIT 1',
    [code]
  );
  if (!person || !userCanManageApprovals(person)) return null;
  return { usercode: person.usercode, name: person.name, position: person.position, department: person.department };
};

// [FEATURE] When the traveling employee IS a department head, they can't "recommend" their own
// travel — skip straight to General Manager approval, no Recommended-by stage at all.
const assignRequestApprover = async (connection, requestNumber, departmentHead, generalManager, assignedBy, mode = 'auto', skipDepartmentHead = false) => {
  const stages = skipDepartmentHead
    ? [['general_manager', generalManager, 'auto']]
    : [
        ['department_head', departmentHead, mode === 'manual' ? 'manual' : 'auto'],
        ['general_manager', generalManager, 'auto'],
      ];
  for (const [stage, approver, assignmentMode] of stages) {
    await connection.execute(
      `INSERT INTO request_approvers
         (module,request_number,stage,approver_usercode,assigned_by,assignment_mode,assigned_at)
       VALUES ('travel',?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE approver_usercode=VALUES(approver_usercode),assigned_by=VALUES(assigned_by),
         assignment_mode=VALUES(assignment_mode),assigned_at=NOW()`,
      [requestNumber, stage, approver.usercode, assignedBy, assignmentMode]
    );
  }
  const startingApprover = skipDepartmentHead ? generalManager : departmentHead;
  const startingStage = skipDepartmentHead ? 'general_manager' : 'department_head';
  await connection.execute(
    "UPDATE traveltb SET to_approved=?,approval_stage=? WHERE to_number=?",
    [startingApprover.usercode, startingStage, requestNumber]
  );
};

const requestIsAssignedTo = async (requestNumber, usercode) => {
  await ensureTravelSchema();
  return Boolean(await db.queryOne(
    `SELECT 1 found FROM request_approvers ra
     JOIN traveltb t ON t.to_number=ra.request_number
     WHERE ra.module='travel' AND ra.request_number=? AND t.status=?
       AND ra.stage=COALESCE(NULLIF(TRIM(t.approval_stage),''),'department_head')
       AND UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?)) LIMIT 1`,
    [requestNumber, TRAVEL_STATUS.PENDING, usercode]
  ));
};

const getTravelList = async (usercode, limit = 50) => {
  await ensureTravelSchema();
  const travels = await db.queryAll(
    `SELECT t.to_number, t.usercode, t.department, t.destination, t.date, t.date_to, t.purpose, t.status, t.approval_stage,
            u.name as requester_name, u.profile_photo_url as requester_photo_url,
            MAX(NULLIF(TRIM(u.area), '')) AS area,
            a.name as approver_name,
            (SELECT ra_dh.approver_usercode FROM request_approvers ra_dh
             WHERE ra_dh.module='travel' AND ra_dh.request_number=t.to_number
               AND ra_dh.stage='department_head' LIMIT 1) AS department_head_usercode,
            (SELECT dh.name FROM request_approvers ra_dh
             JOIN usertb dh ON UPPER(TRIM(dh.usercode))=UPPER(TRIM(ra_dh.approver_usercode))
             WHERE ra_dh.module='travel' AND ra_dh.request_number=t.to_number
               AND ra_dh.stage='department_head' LIMIT 1) AS department_head_name,
            (SELECT dh.position FROM request_approvers ra_dh
             JOIN usertb dh ON UPPER(TRIM(dh.usercode))=UPPER(TRIM(ra_dh.approver_usercode))
             WHERE ra_dh.module='travel' AND ra_dh.request_number=t.to_number
               AND ra_dh.stage='department_head' LIMIT 1) AS department_head_position,
            (SELECT ra_gm.approver_usercode FROM request_approvers ra_gm
             WHERE ra_gm.module='travel' AND ra_gm.request_number=t.to_number
               AND ra_gm.stage='general_manager' LIMIT 1) AS general_manager_usercode,
            (SELECT gm.name FROM request_approvers ra_gm
             JOIN usertb gm ON UPPER(TRIM(gm.usercode))=UPPER(TRIM(ra_gm.approver_usercode))
             WHERE ra_gm.module='travel' AND ra_gm.request_number=t.to_number
               AND ra_gm.stage='general_manager' LIMIT 1) AS general_manager_name,
            (SELECT gm.position FROM request_approvers ra_gm
             JOIN usertb gm ON UPPER(TRIM(gm.usercode))=UPPER(TRIM(ra_gm.approver_usercode))
             WHERE ra_gm.module='travel' AND ra_gm.request_number=t.to_number
               AND ra_gm.stage='general_manager' LIMIT 1) AS general_manager_position,
            GROUP_CONCAT(NULLIF(TRIM(t.usercode), '') ORDER BY t.Id SEPARATOR '||') AS requester_usercodes,
            GROUP_CONCAT(NULLIF(TRIM(u.profile_photo_url), '') ORDER BY t.Id SEPARATOR '||') AS requester_photo_urls,
            GROUP_CONCAT(NULLIF(TRIM(t.grantedto1), '') ORDER BY t.Id SEPARATOR '||') AS granted_to
     FROM traveltb t
     LEFT JOIN usertb u ON t.usercode = u.usercode
     LEFT JOIN usertb a ON t.to_approved = a.usercode
     WHERE ${TRAVEL_MEMBER_SCOPE_SQL}
     GROUP BY t.to_number
     ORDER BY t.date DESC
     LIMIT ?`,
    [usercode, limit]
  );

  return travels.map(t => ({
    ...t,
    status_label: getStatusLabel(t.status),
    department_name: getDepartmentName(t.department),
    print_signatories: travelPrintSignatories(t),
    dates: expandDateRange(t.date, t.date_to),
    granted_to: String(t.granted_to || '')
      .split('||')
      .map((value) => String(value).trim())
      .filter(Boolean),
    requester_usercodes: String(t.requester_usercodes || '')
      .split('||')
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean),
    requester_photo_urls: String(t.requester_photo_urls || '')
      .split('||')
      .map((value) => String(value).trim())
      .filter(Boolean),
  }));
};

const getPendingApprovals = async (filters = {}, limit = 50) => {
  await ensureTravelSchema();
  let sql = `
    SELECT t.to_number, t.usercode, t.department, t.destination, t.date, t.purpose, t.status, t.approval_stage, t.to_approved,
           u.name as requester_name, u.profile_photo_url as requester_photo_url,
           MAX(NULLIF(TRIM(u.area), '')) AS area,
           GROUP_CONCAT(NULLIF(TRIM(t.usercode), '') ORDER BY t.Id SEPARATOR '||') AS requester_usercodes,
           GROUP_CONCAT(NULLIF(TRIM(u.profile_photo_url), '') ORDER BY t.Id SEPARATOR '||') AS requester_photo_urls,
           GROUP_CONCAT(NULLIF(TRIM(t.grantedto1), '') ORDER BY t.Id SEPARATOR '||') AS granted_to
    FROM traveltb t
    LEFT JOIN usertb u ON t.usercode = u.usercode
    WHERE (t.fuel_farcode IS NULL OR TRIM(t.fuel_farcode) = '')
  `;
  const params = [];

  if (!filters.allStatuses) {
    sql += ' AND t.status = ?';
    params.push(filters.status || TRAVEL_STATUS.PENDING);
  } else if (filters.status) {
    sql += ' AND t.status = ?';
    params.push(filters.status);
  }

  if (filters.approverUsercode) {
    // ponytail: history mode (allStatuses) must match ANY stage this approver was ever assigned to,
    // not just the current stage — once a Department Head approves and the request advances to
    // General Manager, their own department_head assignment row still exists in request_approvers,
    // but restricting to the CURRENT stage only made it invisible to them the instant it moved on.
    // The strict pending-only query still restricts to the current stage — nothing not yet
    // actionable by them should count as "pending" for this approver.
    const stageCondition = filters.allStatuses
      ? ''
      : " AND ra.stage=COALESCE(NULLIF(TRIM(t.approval_stage),''),'department_head')";
    sql += ` AND (
      EXISTS (
        SELECT 1 FROM request_approvers ra
        WHERE ra.module='travel' AND ra.request_number=t.to_number${stageCondition}
          AND UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?))
      )
      OR UPPER(TRIM(COALESCE(t.to_approved, '')))=UPPER(TRIM(?))
    )`;
    params.push(filters.approverUsercode, filters.approverUsercode);
  }

  if (filters.year && filters.month && filters.day) {
    sql += ' AND YEAR(DATE_ADD(t.date, INTERVAL 8 HOUR)) = ? AND MONTH(DATE_ADD(t.date, INTERVAL 8 HOUR)) = ? AND DAY(DATE_ADD(t.date, INTERVAL 8 HOUR)) = ?';
    params.push(filters.year, filters.month, filters.day);
  } else if (filters.year && filters.month) {
    sql += ' AND YEAR(DATE_ADD(t.date, INTERVAL 8 HOUR)) = ? AND MONTH(DATE_ADD(t.date, INTERVAL 8 HOUR)) = ?';
    params.push(filters.year, filters.month);
  }

  if (filters.department) {
    sql += ' AND UPPER(t.department) = ?';
    params.push(String(filters.department).toUpperCase());
  }

  if (filters.q) {
    sql += ' AND (UPPER(t.destination) LIKE ? OR UPPER(u.name) LIKE ?)';
    const likeQ = `%${filters.q}%`;
    params.push(likeQ, likeQ);
  }

  // ponytail: traveltb has one row per traveler on a request; without this, the MAX()/GROUP_CONCAT()
  // above collapse every matching row across ALL requests into one arbitrary row instead of one row
  // per to_number, silently hiding pending approvals whenever more than one request qualifies.
  sql += ' GROUP BY t.to_number ORDER BY t.date DESC LIMIT ?';
  params.push(limit);

  const travels = await db.queryAll(sql, params);

  // ponytail perf fix: department_head_*/general_manager_* used to be 6 correlated subqueries run
  // PER ROW (up to `limit`=500 here) — up to ~3000 extra lookups per page load, the same pattern
  // that made /api/fuel?action=history slow. One batch query for the distinct to_numbers on this
  // page, grouped by (to_number, stage) in JS, produces the same values (each stage has at most one
  // assigned approver per request in practice, so "first match" reproduces the old bare LIMIT 1 with
  // no ORDER BY) while scaling with distinct requests instead of row count.
  const toNumbers = [...new Set(travels.map((t) => t.to_number).filter(Boolean))];
  const approverByToNumberAndStage = new Map();
  if (toNumbers.length) {
    const placeholders = toNumbers.map(() => '?').join(',');
    const approverRows = await db.queryAll(
      `SELECT ra.request_number, ra.stage, ra.approver_usercode, au.name, au.position
       FROM request_approvers ra
       LEFT JOIN usertb au ON UPPER(TRIM(au.usercode))=UPPER(TRIM(ra.approver_usercode))
       WHERE ra.module='travel' AND ra.request_number IN (${placeholders})
         AND ra.stage IN ('department_head','general_manager')`,
      toNumbers
    );
    approverRows.forEach((row) => {
      const key = `${row.request_number}::${row.stage}`;
      if (!approverByToNumberAndStage.has(key)) approverByToNumberAndStage.set(key, row);
    });
  }

  return travels.map(t => {
    const dh = approverByToNumberAndStage.get(`${t.to_number}::department_head`);
    const gm = approverByToNumberAndStage.get(`${t.to_number}::general_manager`);
    return {
      ...t,
      department_head_usercode: dh?.approver_usercode || null,
      department_head_name: dh?.name || null,
      department_head_position: dh?.position || null,
      general_manager_usercode: gm?.approver_usercode || null,
      general_manager_name: gm?.name || null,
      general_manager_position: gm?.position || null,
      status_label: getStatusLabel(t.status),
      department_name: getDepartmentName(t.department),
      granted_to: String(t.granted_to || '')
        .split('||')
        .map((value) => String(value).trim())
        .filter(Boolean),
      requester_usercodes: String(t.requester_usercodes || '')
        .split('||')
        .map((value) => String(value).trim().toUpperCase())
        .filter(Boolean),
      requester_photo_urls: String(t.requester_photo_urls || '')
        .split('||')
        .map((value) => String(value).trim())
        .filter(Boolean),
    };
  });
};

const getTravelByNumber = async (toNumber) => {
  return db.queryOne(
    'SELECT * FROM traveltb WHERE to_number = ?',
    [toNumber]
  );
};

const createTravel = async (usercode, travelData) => {
  const people = normalizeFuelPeople(travelData?.people || []);
  const department = String(travelData?.department || '').trim();
  const destination = String(travelData?.destination || '').trim();
  const purpose = String(travelData?.purpose || '').trim();
  const { dateFrom: date, dateTo } = normalizeDateRange(travelData?.dates, travelData?.date);
  const fuelFarCode = String(travelData?.fuel_farcode || travelData?.fuelFarCode || '').trim();

  if (people.length > 0) {
    if (!department || !destination || !purpose || !date) {
      throw Object.assign(new Error('Please complete the employee, department, destination, date, and purpose.'), { statusCode: 422 });
    }
    const approverMode = String(travelData?.approver_mode || 'auto').toLowerCase();
    const requestedApprover = String(travelData?.approver_usercode || '').trim().toUpperCase();
    if (approverMode === 'manual' && !requestedApprover) {
      throw Object.assign(new Error('Select an approver or use Auto assign.'), { statusCode: 422 });
    }
    // [FEATURE] A department head traveling can't recommend their own trip — skip that stage
    // and go straight to the General Manager.
    const traveler = await db.queryOne('SELECT usercode,position FROM usertb WHERE usercode=? LIMIT 1', [people[0].usercode]);
    const skipDepartmentHead = isDepartmentHead(traveler);
    const approver = skipDepartmentHead ? null : await resolveRequestApprover(
      requestedApprover, department, people[0].usercode, fuelFarCode ? 'fuel_travel' : 'travel'
    );
    if (!skipDepartmentHead && (!approver || (!approver.trusted && !isDepartmentHead(approver)))) {
      throw Object.assign(new Error(`No eligible Department Head was found for Travel.${describeApproverMiss(approver, department)}`), { statusCode: 422 });
    }
    // [FEATURE] general_manager_usercode only ever arrives here already gated to privilege-10
    // callers by the route — see routes/travel.js.
    const generalManagerOverride = travelData?.general_manager_usercode
      ? await resolveManualGeneralManager(travelData.general_manager_usercode)
      : null;
    if (travelData?.general_manager_usercode && !generalManagerOverride) {
      throw Object.assign(new Error('Selected employee cannot serve as the General Manager approver.'), { statusCode: 422 });
    }
    const generalManager = generalManagerOverride || await resolveGeneralManager();
    if (!generalManager) throw Object.assign(new Error('No General Manager signatory is configured for Travel.'), { statusCode: 422 });
    await ensureTravelSchema();
    const existing = fuelFarCode
      ? await db.queryOne(
          'SELECT to_number FROM traveltb WHERE fuel_farcode = ? ORDER BY Id DESC LIMIT 1',
          [fuelFarCode]
        )
      : null;
    const toNumber = String(existing?.to_number || '').trim() || await generateTravelNumber();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (fuelFarCode) {
        await connection.execute('DELETE FROM traveltb WHERE fuel_farcode = ?', [fuelFarCode]);
      }
      for (const person of people) {
        await connection.execute(
          `INSERT INTO traveltb (grantedto1, usercode, department, destination, \`date\`, date_to, purpose, status, to_number, fuel_farcode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            person.name,
            person.usercode,
            department,
            destination,
            date || new Date().toISOString().slice(0, 10),
            dateTo || date || new Date().toISOString().slice(0, 10),
            purpose,
            TRAVEL_STATUS.PENDING,
            toNumber,
            fuelFarCode || null,
          ]
        );
      }
      await assignRequestApprover(connection, toNumber, approver, generalManager, usercode, approverMode, skipDepartmentHead);
      await connection.commit();
      return toNumber;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  const toNumber = await generateTravelNumber();
  const { department: legacyDepartment, destination: legacyDestination, purpose: legacyPurpose, date: legacyDate } = travelData;

  const result = await db.execute(
    `INSERT INTO traveltb (to_number, usercode, department, destination, purpose, date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [toNumber, usercode, legacyDepartment, legacyDestination, legacyPurpose, legacyDate, TRAVEL_STATUS.PENDING]
  );

  return result.affectedRows > 0 ? toNumber : null;
};

const updateTravel = async (owner, toNumber, travelData) => {
  const people = normalizeFuelPeople(travelData?.people);
  const department = String(travelData?.department || '').trim();
  const destination = String(travelData?.destination || '').trim();
  const purpose = String(travelData?.purpose || '').trim();
  const { dateFrom: date, dateTo } = normalizeDateRange(travelData?.dates, travelData?.date);
  if (!toNumber || !people.length || !department || !destination || !purpose || !date) {
    throw Object.assign(new Error('Please complete the Travel number, employees, department, destination, date, and purpose.'), { statusCode: 422 });
  }
  const rows = await db.queryAll('SELECT status,usercode,fuel_farcode,link_id FROM traveltb WHERE to_number=?', [toNumber]);
  if (!rows.length) throw Object.assign(new Error('Travel request not found.'), { statusCode: 404 });
  if (rows.some((row) => Number(row.status) !== 1)) throw Object.assign(new Error('Only pending Travel requests can be edited.'), { statusCode: 409 });
  if (!rows.some((row) => String(row.usercode).trim().toUpperCase() === String(owner).trim().toUpperCase())) {
    throw Object.assign(new Error('You can only edit your own pending Travel requests.'), { statusCode: 403 });
  }
  const fuelFarCode = rows.map((row) => String(row.fuel_farcode || '').trim()).find(Boolean) || '';
  const linkId = rows.map((row) => String(row.link_id || '').trim()).find(Boolean) || '';
  const approverMode = String(travelData?.approver_mode || 'auto').toLowerCase();
  const requestedApprover = String(travelData?.approver_usercode || '').trim().toUpperCase();
  // [FEATURE] Same self-recommend skip as createTravel — see the comment there.
  const traveler = await db.queryOne('SELECT usercode,position FROM usertb WHERE usercode=? LIMIT 1', [people[0].usercode]);
  const skipDepartmentHead = isDepartmentHead(traveler);
  const approver = skipDepartmentHead ? null : await resolveRequestApprover(requestedApprover, department, people[0].usercode, fuelFarCode ? 'fuel_travel' : 'travel');
  if (!skipDepartmentHead && (!approver || (!approver.trusted && !isDepartmentHead(approver)))) {
    throw Object.assign(new Error(`No eligible Department Head was found for Travel.${describeApproverMiss(approver, department)}`), { statusCode: 422 });
  }
  // [FEATURE] Same manual GM override as createTravel — see the comment there.
  const generalManagerOverride = travelData?.general_manager_usercode
    ? await resolveManualGeneralManager(travelData.general_manager_usercode)
    : null;
  if (travelData?.general_manager_usercode && !generalManagerOverride) {
    throw Object.assign(new Error('Selected employee cannot serve as the General Manager approver.'), { statusCode: 422 });
  }
  const generalManager = generalManagerOverride || await resolveGeneralManager();
  if (!generalManager) throw Object.assign(new Error('No General Manager signatory is configured for Travel.'), { statusCode: 422 });
  await ensureTravelSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM traveltb WHERE to_number=?', [toNumber]);
    for (const person of people) {
      await connection.execute(
        `INSERT INTO traveltb (grantedto1,usercode,department,destination,\`date\`,date_to,purpose,status,to_number,fuel_farcode,link_id)
         VALUES (?,?,?,?,?,?,?,1,?,?,?)`,
        [person.name, person.usercode, department, destination, date, dateTo || date, purpose, toNumber, fuelFarCode || null, linkId || null]
      );
    }
    await assignRequestApprover(connection, toNumber, approver, generalManager, owner, approverMode, skipDepartmentHead);
    await connection.commit();
    return toNumber;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const cancelTravelByFuelFarCode = async (farCode) => {
  const fuelFarCode = String(farCode || '').trim();
  if (!fuelFarCode) {
    return false;
  }

  await ensureTravelSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM traveltb WHERE fuel_farcode = ?', [fuelFarCode]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const approveTravel = async (toNumber, approverId) => {
  await ensureTravelSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT status,approval_stage,department,usercode FROM traveltb WHERE to_number=? FOR UPDATE',
      [toNumber]
    );
    if (!rows.length) throw Object.assign(new Error('Travel order not found.'), { statusCode: 404 });
    if (rows.some((row) => Number(row.status) !== Number(TRAVEL_STATUS.PENDING))) {
      throw Object.assign(new Error('This Travel request already has a final decision.'), { statusCode: 409 });
    }
    const stage = normalizeApprovalStage(rows[0].approval_stage);
    const [assignments] = await connection.query(
      `SELECT stage,approver_usercode FROM request_approvers
       WHERE module='travel' AND request_number=?`,
      [toNumber]
    );
    const assigned = assignments.find((row) => row.stage === stage);
    if (!assigned || String(assigned.approver_usercode || '').trim().toUpperCase() !== String(approverId || '').trim().toUpperCase()) {
      throw Object.assign(new Error('This Travel approval belongs to the next assigned signatory.'), { statusCode: 403 });
    }

    if (stage === 'department_head') {
      const transition = travelApprovalTransition(stage, TRAVEL_STATUS.APPROVED);
      let generalManager = assignments.find((row) => row.stage === 'general_manager') || null;
      if (!generalManager) {
        generalManager = await resolveGeneralManager();
        if (!generalManager) throw Object.assign(new Error('No General Manager signatory is configured for Travel.'), { statusCode: 422 });
        await connection.execute(
          `INSERT INTO request_approvers
             (module,request_number,stage,approver_usercode,assigned_by,assignment_mode,assigned_at)
           VALUES('travel',?,'general_manager',?,?, 'auto',NOW())
           ON DUPLICATE KEY UPDATE approver_usercode=VALUES(approver_usercode),assigned_at=NOW()`,
          [toNumber, generalManager.usercode, approverId]
        );
      }
      const result = await connection.execute(
        "UPDATE traveltb SET approval_stage='general_manager',to_approved=? WHERE to_number=? AND status=?",
        [generalManager.approver_usercode || generalManager.usercode, toNumber, TRAVEL_STATUS.PENDING]
      );
      await connection.commit();
      return { updated: result[0].affectedRows > 0, final: transition.final, approval_stage: stage, next_stage: transition.next_stage };
    }

    const transition = travelApprovalTransition(stage, TRAVEL_STATUS.APPROVED);
    const result = await connection.execute(
      "UPDATE traveltb SET status=?,approval_stage='general_manager',to_approved=? WHERE to_number=? AND status=?",
      [TRAVEL_STATUS.APPROVED, approverId, toNumber, TRAVEL_STATUS.PENDING]
    );
    await connection.commit();
    return { updated: result[0].affectedRows > 0, final: transition.final, approval_stage: stage, next_stage: transition.next_stage };
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
};

const rejectTravel = async (toNumber, approverId, reason) => {
  await ensureTravelSchema();
  const current = await db.queryOne(
    `SELECT t.status,COALESCE(NULLIF(TRIM(t.approval_stage),''),'department_head') approval_stage
     FROM traveltb t WHERE t.to_number=? LIMIT 1`,
    [toNumber]
  );
  if (!current) throw Object.assign(new Error('Travel order not found.'), { statusCode: 404 });
  if (Number(current.status) !== Number(TRAVEL_STATUS.PENDING)) {
    throw Object.assign(new Error('This Travel request already has a final decision.'), { statusCode: 409 });
  }
  const assigned = await db.queryOne(
    `SELECT 1 found FROM request_approvers WHERE module='travel' AND request_number=? AND stage=?
       AND UPPER(TRIM(approver_usercode))=UPPER(TRIM(?)) LIMIT 1`,
    [toNumber, normalizeApprovalStage(current.approval_stage), approverId]
  );
  if (!assigned) throw Object.assign(new Error('This Travel approval belongs to the next assigned signatory.'), { statusCode: 403 });
  const result = await db.execute(
    'UPDATE traveltb SET status=?,to_approved=?,remarks=? WHERE to_number=? AND status=?',
    [TRAVEL_STATUS.REJECTED, approverId, reason, toNumber, TRAVEL_STATUS.PENDING]
  );
  return { updated: result.affectedRows > 0, final: true, approval_stage: normalizeApprovalStage(current.approval_stage), next_stage: null };
};

const archiveAndRemovePerson = async (toNumber, rowId, removedBy) => {
  const connection = await db.getConnection();
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'traveltb_removed'");
    if (!tables.length) {
      await connection.query('CREATE TABLE traveltb_removed LIKE traveltb');
      await connection.query(
        'ALTER TABLE traveltb_removed ADD COLUMN removed_by VARCHAR(32) NULL, ADD COLUMN removed_at DATETIME NULL'
      );
    }
    // ponytail: archive mirrors traveltb column order; schema drift safely fails before DELETE.
    await connection.beginTransaction();
    const [archived] = await connection.execute(
      `INSERT INTO traveltb_removed
       SELECT t.*, ?, NOW() FROM traveltb t WHERE t.Id=? AND t.to_number=?`,
      [String(removedBy || '').trim().toUpperCase(), rowId, toNumber]
    );
    if (!archived.affectedRows) {
      await connection.rollback();
      return false;
    }
    const [removed] = await connection.execute(
      'DELETE FROM traveltb WHERE Id=? AND to_number=?',
      [rowId, toNumber]
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
  TRAVEL_APPROVAL_STAGES,
  TRAVEL_MEMBER_SCOPE_SQL,
  normalizeDateRange,
  expandDateRange,
  normalizeApprovalStage,
  travelApprovalTransition,
  isDepartmentHead,
  travelPrintSignatories,
  getDepartmentName,
  getStatusLabel,
  generateTravelNumber,
  ensureTravelSchema,
  userCanManageApprovals,
  resolveRequestApprover,
  resolveGeneralManager,
  resolveManualGeneralManager,
  assignRequestApprover,
  requestIsAssignedTo,
  getTravelList,
  getPendingApprovals,
  getTravelByNumber,
  createTravel,
  updateTravel,
  cancelTravelByFuelFarCode,
  approveTravel,
  rejectTravel,
  archiveAndRemovePerson,
};
