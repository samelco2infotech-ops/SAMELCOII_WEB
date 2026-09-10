/**
 * Purpose: Node implementation of employee Leave requests and three-stage approvals.
 * EDIT GUIDE: Keep tbleave status transitions compatible with legacy reports.
 * HUWAG BAGUHIN: Approval order is Department Head, Administrative Chief, General Manager.
 * Tagalog: Ang Birthday Leave ay isang buong araw, kahit anong petsa piliin ng empleyado, isang claim bawat taon.
 */
const crypto = require('crypto');
const db = require('../config/database');

const STAGES = [
  ['department_head', 'Department Head'],
  ['administrative_chief', 'OIC - Administrative Chief'],
  ['general_manager', 'General Manager'],
  ['branch_head', 'Branch Head'],
];
const STAGE_LABELS = Object.fromEntries(STAGES);
const CATEGORIES = [
  'Vacation Leave', 'Sick Leave', 'Birthday Leave', 'Official Leave',
  'Emergency Leave', 'Maternity Leave', 'Paternity Leave', 'Other Leave',
];
const DURATIONS = ['Half Day', 'Whole Day', 'Multiple Days'];
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const dateValue = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  }
  return text(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
};
const validDate = (value) => {
  const date = dateValue(value);
  if (!date) return false;
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
};
const displayDate = (value) => {
  const date = dateValue(value);
  if (!date) return '';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
};
const calendarDays = (from, to) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
const privilegeTokens = (user) => new Set(`${user?.privilage ?? ''},${user?.privilagemenu ?? ''}`
  .split(/[^0-9]+/).filter(Boolean));
const canApprove = (user) => [...privilegeTokens(user)].some((token) => Number(token) >= 6 && Number(token) <= 10);
const isAdmin = (user) => privilegeTokens(user).has('10');

const ensureSchema = async (connection) => {
  await connection.query(`CREATE TABLE IF NOT EXISTS request_approvers (
    id INT AUTO_INCREMENT PRIMARY KEY,module VARCHAR(40) NOT NULL,request_number VARCHAR(255) NOT NULL,
    stage VARCHAR(40) NOT NULL DEFAULT 'department_head',approver_usercode VARCHAR(255) NOT NULL,
    assigned_by VARCHAR(255) DEFAULT NULL,assignment_mode VARCHAR(20) NOT NULL DEFAULT 'auto',
    assigned_at DATETIME DEFAULT NULL,UNIQUE KEY uniq_request_approver(module,request_number,stage),
    KEY idx_request_approver_queue(module,stage,approver_usercode)) ENGINE=InnoDB DEFAULT CHARSET=latin1`);
  const [[stage]] = await connection.query(
    `SELECT 1 found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='request_approvers' AND COLUMN_NAME='stage' LIMIT 1`);
  if (!stage) {
    await connection.query(
      "ALTER TABLE request_approvers ADD COLUMN stage VARCHAR(40) NOT NULL DEFAULT 'department_head' AFTER request_number");
  }
  const [indexRows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='request_approvers' AND INDEX_NAME='uniq_request_approver' ORDER BY SEQ_IN_INDEX`);
  const columns = indexRows.map((row) => String(row.COLUMN_NAME).toLowerCase()).join(',');
  if (columns !== 'module,request_number,stage') {
    if (columns) await connection.query('ALTER TABLE request_approvers DROP INDEX uniq_request_approver');
    await connection.query(
      'ALTER TABLE request_approvers ADD UNIQUE KEY uniq_request_approver(module,request_number,stage)');
  }
  const [primaryRows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='request_approvers' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX`);
  const primaryColumns = primaryRows.map((row) => String(row.COLUMN_NAME).toLowerCase()).join(',');
  if (primaryColumns === 'module,request_number') {
    // ponytail: extending the legacy key is the smallest compatible migration; existing modules keep stage=department_head.
    await connection.query(
      'ALTER TABLE request_approvers DROP PRIMARY KEY, ADD PRIMARY KEY(module,request_number,stage)');
  }
};

const statusLabel = (row) => {
  const department = text(row.DP_approved);
  const admin = text(row.HR_approved);
  const status = upper(row.Status);
  if (department === '3' || admin === '3' || status === 'REJECTED') return 'Rejected';
  if (department === '1' && admin === '1' && status === 'APPROVED') return 'Approved';
  if (department === '1' && ['', '0'].includes(admin) && !['', 'PENDING', 'REJECTED'].includes(status)) return 'Approved';
  return 'Pending';
};
const statusCode = (row) => ({ Approved: '2', Rejected: '3', Pending: '1' })[statusLabel(row)];
const requestParts = (storedType, storedDays = 1) => {
  const stored = text(storedType);
  const category = CATEGORIES.find((candidate) => stored.toLowerCase().includes(candidate.toLowerCase()))
    || (CATEGORIES.includes(stored) ? stored : 'Other Leave');
  const duration = DURATIONS.find((candidate) => stored.toLowerCase().includes(candidate.toLowerCase()))
    || (Number(storedDays) > 1 ? 'Multiple Days' : 'Whole Day');
  return { category, duration };
};

const assignedRoute = async (connection, leaveId) => {
  const [rows] = await connection.query(
    `SELECT ra.stage,ra.assignment_mode,u.usercode,u.name,u.position,u.department,u.area,u.profile_photo_url
     FROM request_approvers ra JOIN usertb u ON UPPER(TRIM(u.usercode))=UPPER(TRIM(ra.approver_usercode))
     WHERE ra.module='leave' AND ra.request_number=?
     ORDER BY FIELD(ra.stage,'department_head','administrative_chief','general_manager','branch_head')`, [String(leaveId)]);
  return rows.map((person) => ({
    ...person,
    profile_photo_url: text(person.profile_photo_url),
    area: text(person.area),
    stage_label: STAGE_LABELS[person.stage] || person.stage,
  }));
};

const routeStageStatus = (row, stage) => {
  const dept = text(row.DP_approved);
  const admin = text(row.HR_approved);
  const status = upper(row.Status);
  if ((stage === 'department_head' && dept === '3') || (stage === 'administrative_chief' && admin === '3') || status === 'REJECTED') {
    return { label: 'Rejected', tone: 'rejected' };
  }
  if (stage === 'department_head') return dept === '1' ? { label: 'Approved', tone: 'approved' } : { label: 'Pending', tone: 'pending' };
  if (stage === 'administrative_chief') {
    if (admin === '1') return { label: 'Approved', tone: 'approved' };
    return dept === '1' ? { label: 'Pending', tone: 'pending' } : { label: 'Waiting', tone: 'waiting' };
  }
  if (status === 'APPROVED') return { label: 'Approved', tone: 'approved' };
  return dept === '1' && admin === '1' ? { label: 'Pending', tone: 'pending' } : { label: 'Waiting', tone: 'waiting' };
};

const decorateApprovalRoute = (row, approvalRoute = []) => approvalRoute.map((person) => ({
  ...person,
  approval_status: routeStageStatus(row, person.stage),
}));

const rowToItem = (row, approvalRoute = []) => {
  const fromValue = dateValue(row.datafrom); const toValue = dateValue(row.dateto);
  const parts = requestParts(row.leave_record, row.numofdays);
  const from = displayDate(fromValue); const to = displayDate(toValue);
  const decoratedRoute = decorateApprovalRoute(row, approvalRoute);
  // ponytail: "Approver" must be whoever is currently due to act, not row.Status — that legacy
  // column holds the literal string 'PENDING' until the department-head stage clears, so joining
  // usertb on it (the old approach) always resolved to nobody for the requests approvers most
  // need to see. Read the real assignment out of the route we already fetched from
  // request_approvers instead — it reflects manual "Change signatory" overrides correctly too.
  const currentApprover = decoratedRoute.find((person) => person.approval_status?.tone === 'pending')
    || decoratedRoute[0] || null;
  return {
    leave_id: String(row.Id ?? ''), tracking_no: row.trackingNo || '',
    date: displayDate(row.datecreated), request_date: dateValue(row.datecreated),
    date_from: from, date_to: to, date_from_value: fromValue, date_to_value: toValue,
    date_range: from && to && from !== to ? `${from} to ${to}` : from || to,
    usercode: row.empID || '', requester_name: row.requester_name || row.NAME || '',
    requester_photo_url: text(row.requester_photo_url), area: text(row.requester_area) || text(row.area),
    department: text(row.division) || 'Unassigned department',
    leave_type: parts.category, leave_category: parts.category, leave_duration: parts.duration,
    leave_record: text(row.leave_record), days: parts.duration === 'Half Day' ? 0.5 : Number(row.numofdays || 0),
    purpose: row.remarks || '', status: statusCode(row), status_label: statusLabel(row),
    approved_by: row.Status || '', approver_name: currentApprover?.name || row.approver_name || '',
    assigned_approver_usercode: currentApprover?.usercode || row.assigned_approver_usercode || '',
    assigned_approver_name: currentApprover?.name || row.assigned_approver_name || '',
    assignment_mode: row.assignment_mode || 'auto', dp_approved: row.DP_approved || '',
    hr_approved: row.HR_approved || '', approval_route: decoratedRoute,
  };
};

const eligiblePerson = async (connection, usercode) => {
  if (!usercode) return null;
  const [[person]] = await connection.query(
    `SELECT usercode,name,position,department,profile_photo_url FROM usertb
     WHERE UPPER(TRIM(usercode))=UPPER(TRIM(?))
       AND COALESCE(privilage,'') REGEXP '(^|[^0-9])(6|7|8|9|10)([^0-9]|$)' LIMIT 1`, [usercode]);
  return person ? { ...person, profile_photo_url: text(person.profile_photo_url) } : null;
};

const resolveStage = async (connection, employeeCode, department, stage, requested = '') => {
  if (requested) return eligiblePerson(connection, requested);
  if (stage === 'department_head') {
    // ponytail: signatory_groups (module_key='leave', title='Department Head') is the same
    // admin-configured mapping Fuel/EPASS/Travel/Overtime already trust — check it first.
    // The position-title regex below is only a fallback for departments nobody has configured
    // yet; it's fragile because real titles here are "Corplan Manager"/"ESD Manager"/etc, not
    // literally "Department Manager", so it misses or mismatches several departments.
    const [[configured]] = await connection.query(
      `SELECT u.usercode,u.name,u.position,u.department,u.profile_photo_url
       FROM signatory_groups sg
       JOIN usertb u ON u.usercode = sg.signatory_usercode
       WHERE sg.module_key='leave' AND sg.title='Department Head'
         AND UPPER(TRIM(COALESCE(sg.department,'')))=UPPER(TRIM(?))
       ORDER BY sg.id LIMIT 1`, [department]);
    if (configured) return { ...configured, profile_photo_url: text(configured.profile_photo_url) };
    const [[person]] = await connection.query(
      `SELECT usercode,name,position,department,profile_photo_url FROM usertb
       WHERE usercode IS NOT NULL AND TRIM(usercode)<>''
         AND COALESCE(privilage,'') REGEXP '(^|[^0-9])(6|7|8|9|10)([^0-9]|$)'
         AND UPPER(TRIM(COALESCE(department,'')))=UPPER(TRIM(?))
         AND UPPER(TRIM(COALESCE(position,''))) REGEXP
           '(DEPARTMENT[[:space:]]+(HEAD|MANAGER)|DIVISION[[:space:]]+HEAD|COMPTROLLER|(^|[[:space:]])(CHIEF|MANAGER)([[:space:]]|$))'
         AND UPPER(TRIM(COALESCE(position,''))) NOT REGEXP '(ASSISTANT|ASST|DEPUTY)'
       ORDER BY name LIMIT 1`, [department]);
    return person ? { ...person, profile_photo_url: text(person.profile_photo_url) } : null;
  }
  const pattern = stage === 'administrative_chief'
    ? '(OIC[[:space:]-]*)?ADMINISTRATIVE[[:space:]]+CHIEF'
    : '(OIC[[:space:]-]*)?GENERAL[[:space:]]+MANAGER';
  const [[person]] = await connection.query(
    `SELECT usercode,name,position,department,profile_photo_url FROM usertb
     WHERE usercode IS NOT NULL AND TRIM(usercode)<>''
       AND COALESCE(privilage,'') REGEXP '(^|[^0-9])(6|7|8|9|10)([^0-9]|$)'
       AND UPPER(TRIM(COALESCE(position,''))) REGEXP ?
     ORDER BY CASE WHEN UPPER(TRIM(COALESCE(position,''))) LIKE 'OIC%' THEN 0 ELSE 1 END,name LIMIT 1`,
    [pattern]);
  return person ? { ...person, profile_photo_url: text(person.profile_photo_url) } : null;
};

const resolveBranchHead = async (connection, area, requested = '') => {
  if (requested) return eligiblePerson(connection, requested);
  if (!area) return null;
  const [[person]] = await connection.query(
    `SELECT usercode,name,position,department,profile_photo_url FROM usertb
     WHERE usercode IS NOT NULL AND TRIM(usercode)<>''
       AND COALESCE(privilage,'') REGEXP '(^|[^0-9])(6|7|8|9|10)([^0-9]|$)'
       AND UPPER(TRIM(COALESCE(position,''))) REGEXP '(OIC[[:space:]-]*)?BRANCH[[:space:]]+HEAD'
       AND UPPER(TRIM(COALESCE(area,'')))=UPPER(TRIM(?))
     ORDER BY CASE WHEN UPPER(TRIM(COALESCE(position,''))) LIKE 'OIC%' THEN 0 ELSE 1 END,name LIMIT 1`,
    [area]);
  return person ? { ...person, profile_photo_url: text(person.profile_photo_url) } : null;
};

// ponytail: tag manual right here, at the one place that actually knows a stage was explicitly
// picked (vs auto-resolved) — assignRoute below just persists whatever it's given.
const buildStagePerson = (person, stage, requestedUsercode) => (person
  ? { ...person, stage, stage_label: STAGE_LABELS[stage] || stage, assignment_mode: upper(requestedUsercode) ? 'manual' : 'auto' }
  : null);

// HUWAG BAGUHIN: order of precedence matters — GM-requesting-self is checked before
// Dept-Head/Branch-Head-requesting-self, since a GM could technically also match a department's
// head pattern and must still self-approve, not get routed to "the GM" (itself) via the other path.
const resolveRoute = async (connection, employeeCode, department, area, requested = {}) => {
  const code = upper(employeeCode);
  const gmPerson = await resolveStage(connection, employeeCode, department, 'general_manager', upper(requested.general_manager));
  if (gmPerson && upper(gmPerson.usercode) === code) {
    // General Manager requesting their own leave — nobody above them, they self-approve.
    return { general_manager: buildStagePerson(gmPerson, 'general_manager', requested.general_manager) };
  }

  const deptHeadPerson = await resolveStage(connection, employeeCode, department, 'department_head', upper(requested.department_head));
  const branchHeadPerson = area ? await resolveBranchHead(connection, area, upper(requested.branch_head)) : null;
  const requesterIsDeptHead = deptHeadPerson && upper(deptHeadPerson.usercode) === code;
  const requesterIsBranchHead = branchHeadPerson && upper(branchHeadPerson.usercode) === code;

  if (requesterIsDeptHead || requesterIsBranchHead) {
    // Department Head / Branch Head requesting leave — they can't approve their own department or
    // area, so skip straight to the real General Manager; no Admin Chief stage either.
    return { general_manager: buildStagePerson(gmPerson, 'general_manager', requested.general_manager) };
  }

  const adminChiefPerson = await resolveStage(connection, employeeCode, department, 'administrative_chief', upper(requested.administrative_chief));
  // ponytail: an area employee whose area has no Branch Head configured yet (HR hasn't set that
  // position/area on anyone) falls back to the GM instead of blocking submission.
  const finalStage = branchHeadPerson ? 'branch_head' : 'general_manager';
  const finalPerson = branchHeadPerson || gmPerson;
  return {
    department_head: buildStagePerson(deptHeadPerson, 'department_head', requested.department_head),
    administrative_chief: buildStagePerson(adminChiefPerson, 'administrative_chief', requested.administrative_chief),
    [finalStage]: buildStagePerson(finalPerson, finalStage, finalStage === 'branch_head' ? requested.branch_head : requested.general_manager),
  };
};
const missingStages = (route) => Object.entries(route)
  .filter(([, person]) => !person)
  .map(([stage]) => STAGE_LABELS[stage] || stage);
const assignRoute = async (connection, leaveId, route, assignedBy) => {
  for (const stage of Object.keys(route)) {
    const person = route[stage];
    if (!person) continue;
    await connection.execute(
      `INSERT INTO request_approvers(module,request_number,stage,approver_usercode,assigned_by,assignment_mode,assigned_at)
       VALUES('leave',?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE approver_usercode=VALUES(approver_usercode),
       assigned_by=VALUES(assigned_by),assignment_mode=VALUES(assignment_mode),assigned_at=NOW()`,
      [String(leaveId), stage, upper(person.usercode), assignedBy, person.assignment_mode === 'manual' ? 'manual' : 'auto']);
  }
};

const requestedRoute = (payload, user) => {
  const route = {
    department_head: upper(payload.department_head_usercode),
    administrative_chief: upper(payload.administrative_chief_usercode),
    general_manager: upper(payload.general_manager_usercode),
    branch_head: upper(payload.branch_head_usercode),
  };
  if ((route.general_manager || route.branch_head) && !isAdmin(user)) {
    fail(403, 'Only administrators can change the General Manager or Branch Head signatory.');
  }
  return route;
};

const approver = async (user) => {
  const employeeCode = text(user.usercode);
  if (!employeeCode) fail(422, 'Your account has no employee number.');
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection);
    const [[profile]] = await connection.query('SELECT department,area FROM usertb WHERE usercode=? LIMIT 1', [employeeCode]);
    const route = await resolveRoute(connection, employeeCode, profile?.department || '', profile?.area || '');
    const missing = missingStages(route);
    return {
      approver: Object.values(route).find(Boolean) || null, approvers: Object.values(route).filter(Boolean),
      missing_stages: missing, route_ready: !missing.length, can_change_general_manager: isAdmin(user),
    };
  } finally { connection.release(); }
};

const approverOptions = async (query = '', limit = 30) => {
  const params = []; let filter = '';
  if (query) {
    filter = 'AND (usercode LIKE ? OR name LIKE ? OR position LIKE ?)';
    params.push(...Array(3).fill(`%${query}%`));
  }
  const rows = await db.queryAll(
    `SELECT usercode,name,position,department,area,profile_photo_url FROM usertb
     WHERE usercode IS NOT NULL AND TRIM(usercode)<>''
       AND COALESCE(privilage,'') REGEXP '(^|[^0-9])(6|7|8|9|10)([^0-9]|$)' ${filter}
     ORDER BY name LIMIT ${Math.max(1, Math.min(50, Number(limit) || 30))}`, params);
  return rows.map((person) => ({ ...person, profile_photo_url: text(person.profile_photo_url) }));
};

const history = async (usercode, limit = 50) => {
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection);
    const [rows] = await connection.query(
      `SELECT l.*,requester.profile_photo_url requester_photo_url,requester.name requester_name,
       approver.name approver_name,ra.approver_usercode assigned_approver_usercode,
       assigned.name assigned_approver_name,ra.assignment_mode
       FROM tbleave l LEFT JOIN usertb requester ON requester.usercode=l.empID
       LEFT JOIN usertb approver ON approver.usercode=l.Status
       LEFT JOIN request_approvers ra ON ra.module='leave' AND ra.request_number=CAST(l.Id AS CHAR)
         AND ra.stage='department_head'
       LEFT JOIN usertb assigned ON assigned.usercode=ra.approver_usercode
       WHERE l.empID=? ORDER BY l.Id DESC LIMIT ${Math.max(1, Math.min(100, Number(limit) || 50))}`, [usercode]);
    const items = [];
    for (const row of rows) items.push(rowToItem(row, await assignedRoute(connection, row.Id)));
    return items;
  } finally { connection.release(); }
};

const normalizeRequest = (payload) => {
  let category = text(payload.leave_category || payload.leave_type);
  let duration = text(payload.leave_duration);
  if (!duration) duration = category === 'Half Day Leave' ? 'Half Day' : category === 'Whole Day Leave' ? 'Whole Day' : 'Multiple Days';
  if (['Half Day Leave', 'Whole Day Leave'].includes(category)) category = 'Other Leave';
  const from = text(payload.date_from); const to = text(payload.date_to); const reason = text(payload.reason);
  if (!CATEGORIES.includes(category) || !DURATIONS.includes(duration)) fail(422, 'Select a valid leave category and duration.');
  if (!reason) fail(422, 'Enter the purpose of your leave request.');
  if (reason.length > 1000) fail(422, 'Purpose must be 1,000 characters or fewer.');
  if (!validDate(from) || !validDate(to)) fail(422, 'Select valid leave dates.');
  if (to < from) fail(422, 'End date cannot be earlier than start date.');
  const days = calendarDays(from, to);
  if (days > 366) fail(422, 'Leave date range cannot exceed 366 days.');
  if (['Half Day', 'Whole Day'].includes(duration) && days !== 1) fail(422, `${duration} must use a single date.`);
  return { category, duration, from, to, reason, calendarDays: days,
    requestedDays: duration === 'Half Day' ? 0.5 : duration === 'Whole Day' ? 1 : days };
};

const validateBirthday = async (connection, employeeCode, request, excludeId = 0) => {
  if (request.category !== 'Birthday Leave') return;
  if (request.duration !== 'Whole Day') fail(422, 'Birthday Leave must be one whole day.');
  const params = [employeeCode, Number(request.from.slice(0, 4))];
  let exclude = '';
  if (excludeId) { exclude = 'AND Id<>?'; params.push(excludeId); }
  const [[duplicate]] = await connection.query(
    `SELECT trackingNo FROM tbleave WHERE empID=? AND YEAR(datafrom)=?
     AND UPPER(TRIM(COALESCE(leave_record,''))) LIKE 'BIRTHDAY LEAVE%'
     AND NOT (UPPER(TRIM(COALESCE(Status,'')))='REJECTED' OR TRIM(COALESCE(DP_approved,''))='3')
     ${exclude} LIMIT 1`, params);
  if (duplicate) fail(409, 'Birthday Leave has already been claimed or reserved for this year.');
};

const overlapExists = async (connection, employeeCode, request, excludeId = 0) => {
  const params = [employeeCode];
  let exclude = '';
  if (excludeId) { exclude = 'AND Id<>?'; params.push(excludeId); }
  params.push(request.to, request.from);
  const [[row]] = await connection.query(
    `SELECT trackingNo FROM tbleave WHERE empID=? ${exclude} AND datafrom<=? AND dateto>=?
     AND NOT (UPPER(TRIM(COALESCE(Status,'')))='REJECTED' OR TRIM(COALESCE(DP_approved,''))='3') LIMIT 1`, params);
  return Boolean(row);
};

const saveRequest = async (user, payload, leaveId = 0) => {
  const employeeCode = text(user.usercode);
  if (!employeeCode) fail(422, 'Your account has no employee number.');
  const request = normalizeRequest(payload);
  const overrides = requestedRoute(payload, user);
  const connection = await db.getConnection();
  let transaction = false;
  try {
    await ensureSchema(connection); await connection.beginTransaction(); transaction = true;
    const [[profile]] = await connection.query(
      'SELECT usercode,name,position,department,area FROM usertb WHERE usercode=? LIMIT 1 FOR UPDATE', [employeeCode]);
    if (!profile) fail(404, 'Employee profile was not found.');
    let current = null;
    if (leaveId) {
      [[current]] = await connection.query(
        'SELECT Id,empID,division,DP_approved,HR_approved,Status FROM tbleave WHERE Id=? AND empID=? LIMIT 1 FOR UPDATE',
        [leaveId, employeeCode]);
      if (!current) fail(404, 'Leave request was not found.');
      if (!['', '0'].includes(text(current.DP_approved)) || !['', '0'].includes(text(current.HR_approved))
          || !['', '1', 'PENDING'].includes(upper(current.Status))) {
        fail(409, 'Only pending leave requests can be edited.');
      }
    }
    await validateBirthday(connection, employeeCode, request, leaveId);
    if (await overlapExists(connection, employeeCode, request, leaveId)) fail(409, 'These dates overlap an existing leave request.');
    const route = await resolveRoute(connection, employeeCode, current?.division || profile.department || '', profile.area || '', overrides);
    if (leaveId) {
      for (const person of await assignedRoute(connection, leaveId)) {
        if (!overrides[person.stage]) route[person.stage] = person;
      }
    }
    const missing = missingStages(route);
    if (missing.length) fail(422, `Complete the Leave approval route first. Missing: ${missing.join(', ')}.`);
    const flags = [
      request.category === 'Vacation Leave' ? '1' : null,
      request.category === 'Sick Leave' ? '1' : null,
      request.category === 'Maternity Leave' ? '1' : null,
      !['Vacation Leave', 'Sick Leave', 'Maternity Leave'].includes(request.category) ? '1' : null,
    ];
    const storedDays = Math.max(1, Math.ceil(request.requestedDays));
    const storedType = `${request.category} - ${request.duration}`;
    let tracking = '';
    if (leaveId) {
      const [result] = await connection.execute(
        `UPDATE tbleave SET numofdays=?,datafrom=?,dateto=?,flagVL=?,flagSL=?,flagML=?,flagothersL=?,
         leave_record=?,remarks=? WHERE Id=? AND empID=? AND COALESCE(NULLIF(TRIM(DP_approved),''),'0')='0'
         AND COALESCE(NULLIF(TRIM(HR_approved),''),'0')='0'
         AND UPPER(COALESCE(NULLIF(TRIM(Status),''),'PENDING')) IN ('1','PENDING') LIMIT 1`,
        [storedDays, request.from, request.to, ...flags, storedType, request.reason, leaveId, employeeCode]);
      if (!result.affectedRows) fail(409, 'This leave request is no longer editable.');
    } else {
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      tracking = `LV-${stamp}-${crypto.randomInt(100, 1000)}`;
      // ponytail: a route missing department_head/administrative_chief (Dept Head, Branch Head, or
      // the GM requesting their own leave) has only the final stage to clear — pre-mark the two
      // earlier legacy gates '1' so updateStatus/queue's existing dept/admin-based "whose turn"
      // logic resolves straight to that one assigned approver instead of waiting on stages nobody
      // was ever assigned to act on.
      const singleStage = !route.department_head && !route.administrative_chief;
      const [result] = await connection.execute(
        `INSERT INTO tbleave(trackingNo,empID,NAME,Position,division,numofdays,datafrom,dateto,
         flagVL,flagSL,flagML,flagothersL,leave_record,remarks,DP_approved,HR_approved,Status,datecreated)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',CURDATE())`,
        [tracking, employeeCode, text(profile.name || user.name || employeeCode), text(profile.position),
          text(profile.department), storedDays, request.from, request.to, ...flags, storedType, request.reason,
          singleStage ? '1' : '0', singleStage ? '1' : '0']);
      leaveId = result.insertId;
    }
    await assignRoute(connection, leaveId, route, employeeCode);
    await connection.commit(); transaction = false;
    return { leave_id: String(leaveId), tracking_no: tracking || undefined, requested_days: request.requestedDays,
      status: '1', status_label: 'Pending' };
  } catch (error) {
    if (transaction) await connection.rollback();
    throw error;
  } finally { connection.release(); }
};

const backfillLegacy = async (connection, assignedBy) => {
  // ponytail: this must only touch requests that never got a route assigned in the first place
  // (old records from before this approval-routing system existed). It used to unconditionally
  // re-resolve + overwrite EVERY pending request's route on every call — since queue() (and thus
  // this function) runs on every Approval Desk poll, that silently wiped out manual "Change
  // signatory" overrides (and any auto pick that had since changed) every ~15 seconds.
  // [FIX] A route missing department_head (Dept Head/Branch Head/GM requesting their own leave)
  // legitimately has no 'department_head' row — checking only for that stage made this treat an
  // already-backfilled single-stage request as never-routed on every poll, re-resolving it forever.
  // "any row at all for this request" is the correct "already routed" signal.
  const [rows] = await connection.query(
    `SELECT l.Id,l.empID,l.division,COALESCE(u.area,'') area FROM tbleave l
     LEFT JOIN usertb u ON u.usercode=l.empID
     WHERE COALESCE(NULLIF(TRIM(l.DP_approved),''),'0')='0'
       AND UPPER(COALESCE(NULLIF(TRIM(l.Status),''),'PENDING'))='PENDING'
       AND NOT EXISTS (
         SELECT 1 FROM request_approvers ra
         WHERE ra.module='leave' AND ra.request_number=CAST(l.Id AS CHAR)
       )
     ORDER BY l.Id DESC LIMIT 200`);
  for (const row of rows) {
    const route = await resolveRoute(connection, row.empID || '', row.division || '', row.area || '');
    await assignRoute(connection, row.Id, route, assignedBy);
    if (!route.department_head && !route.administrative_chief) {
      // Same pre-clear saveRequest does for a fresh single-stage route — otherwise DP_approved
      // stays '0' forever and updateStatus keeps waiting on a department_head stage nobody was
      // ever assigned to act on.
      await connection.execute(
        `UPDATE tbleave SET DP_approved='1',HR_approved='1' WHERE Id=? LIMIT 1`, [row.Id]);
    }
  }
};

const queue = async (user, filters, pendingOnly) => {
  if (!canApprove(user)) fail(403, 'Approval access is restricted to approvers.');
  const approverCode = upper(user.usercode);
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection); await backfillLegacy(connection, approverCode);
    const where = ["l.trackingNo IS NOT NULL", "TRIM(l.trackingNo)<>''",
      `EXISTS(SELECT 1 FROM request_approvers ra WHERE ra.module='leave'
       AND ra.request_number=CAST(l.Id AS CHAR) AND UPPER(TRIM(ra.approver_usercode))=UPPER(TRIM(?))
       ${pendingOnly ? `AND ((ra.stage='department_head' AND COALESCE(NULLIF(TRIM(l.DP_approved),''),'0')='0'
       AND UPPER(COALESCE(NULLIF(TRIM(l.Status),''),'PENDING'))='PENDING')
       OR (ra.stage='administrative_chief' AND TRIM(COALESCE(l.DP_approved,''))='1'
       AND COALESCE(NULLIF(TRIM(l.HR_approved),''),'0')='0'
       AND UPPER(COALESCE(NULLIF(TRIM(l.Status),''),'PENDING'))='PENDING')
       OR (ra.stage NOT IN ('department_head','administrative_chief') AND TRIM(COALESCE(l.DP_approved,''))='1'
       AND TRIM(COALESCE(l.HR_approved,''))='1'
       AND UPPER(COALESCE(NULLIF(TRIM(l.Status),''),'PENDING'))='PENDING'))` : ''})`];
    const params = [approverCode];
    if (text(filters.q)) {
      where.push('(l.trackingNo LIKE ? OR l.empID LIKE ? OR l.NAME LIKE ? OR l.division LIKE ? OR l.leave_record LIKE ? OR l.remarks LIKE ?)');
      params.push(...Array(6).fill(`%${text(filters.q)}%`));
    }
    if (text(filters.department || filters.filterDept)) { where.push('l.division LIKE ?'); params.push(`%${text(filters.department || filters.filterDept)}%`); }
    for (const [part, fn] of [['year', 'YEAR'], ['month', 'MONTH'], ['day', 'DAY']]) {
      const value = Number(filters[part] || 0);
      if (value > 0) { where.push(`${fn}(l.datecreated)=?`); params.push(value); }
    }
    const limit = Math.max(1, Math.min(pendingOnly ? 50 : 100, Number(filters.limit) || (pendingOnly ? 20 : 50)));
    const [[count]] = await connection.query(
      `SELECT COUNT(*) total FROM tbleave l WHERE ${where.join(' AND ')}`, params);
    const [rows] = await connection.query(
      `SELECT l.*,requester.profile_photo_url requester_photo_url,requester.name requester_name,
       requester.area requester_area,
       approver.name approver_name FROM tbleave l
       LEFT JOIN usertb requester
         ON CONVERT(requester.usercode USING utf8mb4) COLLATE utf8mb4_unicode_ci
          = CONVERT(l.empID USING utf8mb4) COLLATE utf8mb4_unicode_ci
       LEFT JOIN usertb approver ON approver.usercode=l.Status
       WHERE ${where.join(' AND ')} ORDER BY l.Id DESC LIMIT ${limit}`, params);
    const items = [];
    for (const row of rows) items.push(rowToItem(row, await assignedRoute(connection, row.Id)));
    return { items, total: Number(count.total || 0) };
  } finally { connection.release(); }
};

const updateStatus = async (user, leaveId, decision) => {
  if (!canApprove(user)) fail(403, 'Approval access is restricted to approvers.');
  leaveId = Number(leaveId); decision = Number(decision);
  const approverCode = upper(user.usercode);
  if (!Number.isInteger(leaveId) || leaveId <= 0 || ![2, 3].includes(decision) || !approverCode) {
    fail(422, 'Invalid leave approval request.');
  }
  const connection = await db.getConnection();
  let transaction = false;
  try {
    await ensureSchema(connection); await connection.beginTransaction(); transaction = true;
    const [[current]] = await connection.query(
      'SELECT Id,DP_approved,HR_approved,Status FROM tbleave WHERE Id=? LIMIT 1 FOR UPDATE', [leaveId]);
    if (!current) fail(404, 'Leave request not found.');
    const [assignments] = await connection.query(
      `SELECT stage FROM request_approvers WHERE module='leave' AND request_number=?
       AND UPPER(TRIM(approver_usercode))=UPPER(TRIM(?))`, [String(leaveId), approverCode]);
    const stages = assignments.map((row) => row.stage);
    if (!stages.length) fail(403, 'This leave request is assigned to another signatory.');
    const dept = text(current.DP_approved); const admin = text(current.HR_approved); const status = upper(current.Status);
    if (!['', 'PENDING'].includes(status)) fail(409, 'This leave request already has a final decision.');
    if (dept === '3' || admin === '3') fail(409, 'This leave request has already been rejected.');
    if (!['', '0', '1'].includes(dept) || !['', '0', '1'].includes(admin)) fail(409, 'This leave request has an invalid approval state.');
    // Whatever this request's final stage actually is — 'general_manager' or 'branch_head' — it's
    // whichever assigned stage isn't department_head/administrative_chief. Falls back to
    // 'general_manager' defensively; every route always has exactly one such stage.
    const [[finalStageRow]] = await connection.query(
      `SELECT stage FROM request_approvers WHERE module='leave' AND request_number=?
       AND stage NOT IN ('department_head','administrative_chief') LIMIT 1`, [String(leaveId)]);
    const finalStageKey = finalStageRow?.stage || 'general_manager';
    const stage = ['', '0'].includes(dept) ? 'department_head'
      : ['', '0'].includes(admin) ? 'administrative_chief' : finalStageKey;
    if (!stages.includes(stage)) fail(403, 'This Leave approval belongs to the next assigned signatory.');
    const approved = decision === 2;
    let result;
    if (stage === 'department_head') {
      [result] = await connection.execute(
        `UPDATE tbleave SET DP_approved=?,Status=? WHERE Id=?
         AND COALESCE(NULLIF(TRIM(DP_approved),''),'0')='0'
         AND UPPER(COALESCE(NULLIF(TRIM(Status),''),'PENDING'))='PENDING' LIMIT 1`,
        [approved ? '1' : '3', approved ? 'PENDING' : 'REJECTED', leaveId]);
    } else if (stage === 'administrative_chief') {
      if (dept !== '1') fail(409, 'Department Head approval is required first.');
      [result] = await connection.execute(
        `UPDATE tbleave SET HR_approved=?,Status=? WHERE Id=? AND TRIM(COALESCE(DP_approved,''))='1'
         AND COALESCE(NULLIF(TRIM(HR_approved),''),'0')='0'
         AND UPPER(COALESCE(NULLIF(TRIM(Status),''),'PENDING'))='PENDING' LIMIT 1`,
        [approved ? '1' : '3', approved ? 'PENDING' : 'REJECTED', leaveId]);
    } else {
      if (dept !== '1' || admin !== '1') fail(409, 'Department Head and OIC - Administrative Chief approvals are required first.');
      [result] = await connection.execute(
        `UPDATE tbleave SET Status=? WHERE Id=? AND TRIM(COALESCE(DP_approved,''))='1'
         AND TRIM(COALESCE(HR_approved,''))='1'
         AND UPPER(COALESCE(NULLIF(TRIM(Status),''),'PENDING'))='PENDING' LIMIT 1`,
        [approved ? 'APPROVED' : 'REJECTED', leaveId]);
    }
    if (!result.affectedRows) fail(409, 'This leave request is no longer pending approval.');
    await connection.commit(); transaction = false;
    const label = STAGE_LABELS[stage] || stage;
    const isFinalStage = !['department_head', 'administrative_chief'].includes(stage);
    return { message: approved ? `${label} approval recorded.` : `Leave request rejected by ${label}.`,
      approval_stage: stage, status_label: approved && isFinalStage ? 'Approved' : approved ? 'Pending' : 'Rejected' };
  } catch (error) {
    if (transaction) await connection.rollback();
    throw error;
  } finally { connection.release(); }
};

module.exports = {
  STAGES, CATEGORIES, DURATIONS, validDate, calendarDays, privilegeTokens, canApprove, isAdmin,
  statusLabel, statusCode, requestParts, normalizeRequest, rowToItem, approver, approverOptions,
  history, saveRequest, queue, updateStatus,
};
