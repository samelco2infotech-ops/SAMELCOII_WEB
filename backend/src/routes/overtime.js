const express = require('express');
const db = require('../config/database');
const dtrService = require('../services/dtrService');

const router = express.Router();
const pad2 = (value) => String(value).padStart(2, '0');
const upper = (value) => String(value ?? '').trim().toUpperCase();
const text = (value) => String(value ?? '').trim();
const privilegeTokens = (user) => new Set(`${user?.privilage ?? ''},${user?.privilagemenu ?? ''}`
  .split(/[^0-9]+/).filter(Boolean));
const canCreateTeamMemo = (user) => privilegeTokens(user).has('6');
const validMemoDate = (value) => {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day ? raw : '';
};
const validMemoTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text(value)) ? text(value) : '';
const validMemoDepartment = (value) => {
  const department = text(value);
  return department && department.length <= 120 && !/[\x00-\x1F\x7F]/.test(department) ? department : '';
};
const normalizeTeamMemoInput = (payload = {}) => {
  const purpose = text(payload.purpose);
  const date = validMemoDate(payload.date);
  const department = validMemoDepartment(payload.department);
  const rawFrom = text(payload.time_from); const rawTo = text(payload.time_to);
  const timeFrom = validMemoTime(rawFrom); const timeTo = validMemoTime(rawTo);
  const rawEmployeeCodes = (Array.isArray(payload.employee_codes) ? payload.employee_codes : []).map(upper);
  if (rawEmployeeCodes.some((code) => !/^[A-Z0-9_-]{1,32}$/.test(code))) return { error: 'The employee selection contains an invalid employee code.' };
  const employeeCodes = [...new Set(rawEmployeeCodes)];
  if (!department) return { error: 'Choose a valid department.' };
  if (!date) return { error: 'Choose a valid overtime date.' };
  if (!purpose || purpose.length > 2000) return { error: 'Purpose is required and must be 2,000 characters or fewer.' };
  if (!employeeCodes.length || employeeCodes.length > 50) return { error: 'Choose 1 to 50 assigned employees.' };
  if ((rawFrom || rawTo) && (!timeFrom || !timeTo)) return { error: 'Enter both valid start and end times, or leave both blank.' };
  let hours = 0;
  if (timeFrom && timeTo) {
    const [fromHour, fromMinute] = timeFrom.split(':').map(Number);
    const [toHour, toMinute] = timeTo.split(':').map(Number);
    let minutes = (toHour * 60 + toMinute) - (fromHour * 60 + fromMinute);
    if (minutes <= 0) minutes += 24 * 60;
    if (minutes <= 0 || minutes >= 24 * 60) return { error: 'The optional time range must be shorter than 24 hours.' };
    hours = Number((minutes / 60).toFixed(2));
  }
  return { date, department, purpose, employeeCodes, timeFrom, timeTo, hours };
};

let schemaReady;
const ensureOvertimeTable = async () => {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await db.execute(`CREATE TABLE IF NOT EXISTS overtimetb (
      Id INT AUTO_INCREMENT PRIMARY KEY,
      ot_number VARCHAR(32) NOT NULL,
      usercode VARCHAR(32) NOT NULL,
      area VARCHAR(120) NOT NULL DEFAULT '',
      department VARCHAR(120) NOT NULL DEFAULT '',
      attachment_type VARCHAR(180) NOT NULL DEFAULT '',
      request_date DATE NOT NULL,
      time_from VARCHAR(8) NOT NULL DEFAULT '',
      time_to VARCHAR(8) NOT NULL DEFAULT '',
      hours DECIMAL(5,2) NOT NULL DEFAULT 0,
      purpose TEXT NOT NULL,
      attachments_json MEDIUMTEXT NULL,
      status TINYINT NOT NULL DEFAULT 1,
      supervisor_status TINYINT NOT NULL DEFAULT 0,
      supervisor_assigned VARCHAR(32) NULL,
      supervisor_approved VARCHAR(32) NULL,
      supervisor_remarks TEXT NULL,
      dept_head_status TINYINT NOT NULL DEFAULT 0,
      dept_head_assigned VARCHAR(32) NULL,
      dept_head_approved VARCHAR(32) NULL,
      dept_head_remarks TEXT NULL,
      gm_status TINYINT NOT NULL DEFAULT 0,
      gm_assigned VARCHAR(32) NULL,
      gm_approved VARCHAR(32) NULL,
      gm_remarks TEXT NULL,
      requires_gm TINYINT NOT NULL DEFAULT 0,
      accomplishment_status TINYINT NOT NULL DEFAULT 0,
      memo_created_by VARCHAR(32) NULL,
      ot_approved VARCHAR(32) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ot_usercode (usercode), INDEX idx_ot_number (ot_number), INDEX idx_ot_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const definitions = {
      supervisor_status: 'TINYINT NOT NULL DEFAULT 0', supervisor_assigned: 'VARCHAR(32) NULL',
      supervisor_approved: 'VARCHAR(32) NULL', supervisor_remarks: 'TEXT NULL',
      dept_head_status: 'TINYINT NOT NULL DEFAULT 0', dept_head_assigned: 'VARCHAR(32) NULL',
      dept_head_approved: 'VARCHAR(32) NULL', dept_head_remarks: 'TEXT NULL',
      gm_status: 'TINYINT NOT NULL DEFAULT 0', gm_assigned: 'VARCHAR(32) NULL',
      gm_approved: 'VARCHAR(32) NULL', gm_remarks: 'TEXT NULL',
      requires_gm: 'TINYINT NOT NULL DEFAULT 0', accomplishment_status: 'TINYINT NOT NULL DEFAULT 0',
      memo_created_by: 'VARCHAR(32) NULL',
    };
    const columns = await db.queryAll('SHOW COLUMNS FROM overtimetb');
    const present = new Set(columns.map((row) => row.Field));
    for (const [column, definition] of Object.entries(definitions)) {
      if (!present.has(column)) await db.execute(`ALTER TABLE overtimetb ADD COLUMN \`${column}\` ${definition}`);
    }
    await db.execute(`UPDATE overtimetb
      SET supervisor_status = dept_head_status, supervisor_approved = dept_head_approved,
          supervisor_remarks = dept_head_remarks
      WHERE supervisor_status = 0 AND dept_head_status IN (1, 2)
        AND (supervisor_approved IS NULL OR TRIM(supervisor_approved) = '')`);
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
};

const normalizeDate = (value) => {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};
const dateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};
const formatDate = (value) => {
  const normalized = dateValue(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const normalizeTime = (value) => {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) return `${pad2(Number(match[1]))}:${match[2]}`;
  const date = new Date(`1970-01-01 ${raw}`);
  return raw && !Number.isNaN(date.getTime()) ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : '';
};
const formatTime = (value) => {
  const normalized = normalizeTime(value);
  if (!normalized) return text(value);
  const [hour, minute] = normalized.split(':').map(Number);
  return `${hour % 12 || 12}:${pad2(minute)} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const statusLabel = (value) => Number(value) === 2 ? 'Approved' : Number(value) === 3 ? 'Rejected' : 'Pending';
const pendingEditable = (row) => Number(row.status || 1) === 1
  && (Number(row.supervisor_status || 0) === 0
    || (Number(row.supervisor_status) === 1 && text(row.supervisor_remarks) === 'Auto-skipped: supervisor and department head are the same signatory.'))
  && Number(row.dept_head_status || 0) === 0 && Number(row.gm_status || 0) === 0;
const hasAccomplishment = (json, type) => {
  try { const decoded = JSON.parse(text(json)); return !!(type && decoded && decoded[type]); } catch (_error) { return false; }
};
const roleMeta = (role) => ({ 1: { key: 'dept_head' }, 2: { key: 'supervisor' }, 3: { key: 'gm' } }[Number(role)] || { key: '' });

const configuredApprover = async (moduleKey, employeeCode) => {
  if (!moduleKey || !employeeCode) return '';
  try {
    const row = await db.queryOne(`SELECT sg.signatory_usercode
      FROM signatory_group_members m JOIN signatory_groups sg ON sg.id = m.group_id
      WHERE sg.module_key = ? AND UPPER(TRIM(m.usercode)) = UPPER(TRIM(?))
      ORDER BY sg.id LIMIT 1`, [moduleKey, employeeCode]);
    return upper(row?.signatory_usercode);
  } catch (_error) { return ''; }
};
const approverDetails = async (usercode) => {
  if (!usercode) return {};
  const row = await db.queryOne(`SELECT usercode,
    COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(username), ''), usercode) name,
    COALESCE(NULLIF(TRIM(position), ''), '') position,
    COALESCE(NULLIF(TRIM(department), ''), '') department,
    COALESCE(NULLIF(TRIM(profile_photo_url), ''), '') profile_photo_url
    FROM usertb WHERE UPPER(TRIM(usercode)) = UPPER(TRIM(?)) LIMIT 1`, [usercode]);
  return row ? { ...row, usercode: upper(row.usercode), profile_photo_url: Buffer.isBuffer(row.profile_photo_url) ? row.profile_photo_url.toString() : text(row.profile_photo_url) } : {};
};
const fallbackRoleApprover = async (role) => {
  const row = await db.queryOne('SELECT usercode FROM usertb WHERE COALESCE(OT, 0) = ? ORDER BY Id LIMIT 1', [role]);
  return upper(row?.usercode);
};
const stageAssignee = async (row, stage) => {
  const direct = upper(row[`${stage}_assigned`]);
  if (direct) return direct;
  const moduleKey = stage === 'dept_head' ? 'overtime_department_head' : `overtime_${stage}`;
  let code = await configuredApprover(moduleKey, upper(row.usercode));
  if (!code && stage === 'dept_head') code = await configuredApprover('overtime', upper(row.usercode));
  if (!code) code = await fallbackRoleApprover(stage === 'supervisor' ? 2 : stage === 'dept_head' ? 1 : 3);
  return code;
};
const configuredStage = async (row, approverCode, pendingOnly = true) => {
  const stages = ['supervisor', 'dept_head', 'gm'];
  for (const stage of stages) {
    if (stage === 'gm' && Number(row.requires_gm || 0) !== 1) continue;
    if (await stageAssignee(row, stage) !== approverCode) continue;
    if (!pendingOnly) return stage;
    if (stage === 'supervisor' && Number(row.supervisor_status || 0) === 0) return stage;
    if (stage === 'dept_head' && Number(row.supervisor_status) === 1 && Number(row.dept_head_status || 0) === 0) return stage;
    if (stage === 'gm' && Number(row.dept_head_status) === 1 && Number(row.gm_status || 0) === 0) return stage;
  }
  return '';
};
const hasConfiguredAssignments = async (code) => {
  try {
    const row = await db.queryOne(`SELECT 1 found FROM signatory_groups
      WHERE module_key IN ('overtime','overtime_supervisor','overtime_department_head','overtime_gm')
        AND UPPER(TRIM(signatory_usercode)) = UPPER(TRIM(?)) LIMIT 1`, [code]);
    if (row) return true;
  } catch (_error) { /* older schema */ }
  const direct = await db.queryOne(`SELECT 1 found FROM overtimetb WHERE
    UPPER(TRIM(COALESCE(supervisor_assigned,''))) = UPPER(TRIM(?)) OR
    UPPER(TRIM(COALESCE(dept_head_assigned,''))) = UPPER(TRIM(?)) OR
    UPPER(TRIM(COALESCE(gm_assigned,''))) = UPPER(TRIM(?)) LIMIT 1`, [code, code, code]);
  return !!direct;
};
const sessionRole = async (user) => {
  const supplied = [1, 2, 3].includes(Number(user?.OT)) ? Number(user.OT) : 0;
  if (supplied) return supplied;
  const row = await db.queryOne('SELECT COALESCE(OT, 0) OT FROM usertb WHERE UPPER(TRIM(usercode)) = UPPER(TRIM(?)) LIMIT 1', [upper(user?.usercode)]);
  return [1, 2, 3].includes(Number(row?.OT)) ? Number(row.OT) : 0;
};
const canManage = async (user) => (await sessionRole(user)) !== 0 || await hasConfiguredAssignments(upper(user?.usercode));

const monitorSteps = async (row) => {
  const overall = Number(row.status || 1);
  const definitions = [
    { key: 'supervisor', step: 1, label: 'Supervisor Approval', fallback: 'Supervisor' },
    { key: 'dept_head', step: 2, label: 'Department Head Approval', fallback: 'Department Head' },
  ];
  if (Number(row.requires_gm) === 1) definitions.push({ key: 'gm', step: 3, label: 'GM Approval', fallback: 'General Manager' });
  const output = [];
  for (const definition of definitions) {
    const code = await stageAssignee(row, definition.key);
    const person = await approverDetails(code);
    const currentStatus = Number(row[`${definition.key}_status`] || 0);
    let state = currentStatus === 1 ? 'approved' : currentStatus === 2 ? 'rejected' : 'pending';
    if (definition.key === 'dept_head' && Number(row.supervisor_status) !== 1 && state === 'pending') state = 'blocked';
    if (definition.key === 'gm' && Number(row.dept_head_status) !== 1 && state === 'pending') state = 'blocked';
    if (overall === 3 && state === 'pending' && definition.key === 'supervisor') state = 'rejected';
    const remarks = text(row[`${definition.key}_remarks`]);
    const detail = [person.name && `${person.name}${person.position ? ` | ${person.position}` : ''}`,
      state === 'rejected' && remarks ? `Reason: ${remarks}` : '', state === 'blocked' ? 'Waiting for prior approval' : ''].filter(Boolean).join(' | ');
    output.push({ key: definition.key, assigned_usercode: code, can_reassign: overall !== 3,
      step: definition.step, label: definition.label, sublabel: person.department || definition.fallback,
      approver: person.name || '', photo_url: person.profile_photo_url || '', state,
      state_label: state === 'approved' ? 'Approved' : state === 'rejected' ? 'Rejected' : state === 'blocked' ? 'Waiting' : 'Pending', detail });
  }
  return output;
};

const requiresGm = async (usercode, requestDate, hours, exclude = '') => {
  const [year, month, day] = requestDate.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (Number(hours) > 4 || weekday === 0 || weekday === 6) return 1;
  try {
    const holiday = await db.queryOne('SELECT COUNT(*) total FROM philippine_holidays WHERE holiday_date = ?', [requestDate]);
    if (Number(holiday?.total) > 0) return 1;
  } catch (_error) { /* holiday table is optional */ }
  const adjacent = await db.queryOne(`SELECT COUNT(*) total FROM overtimetb
    WHERE UPPER(TRIM(usercode)) = UPPER(TRIM(?)) AND status <> 3 AND ot_number <> ?
      AND request_date IN (DATE_SUB(?, INTERVAL 1 DAY), DATE_ADD(?, INTERVAL 1 DAY))`, [usercode, exclude, requestDate, requestDate]);
  return Number(adjacent?.total) > 0 ? 1 : 0;
};
const nextOtNumber = async (connection) => {
  const prefix = `S2O${String(new Date().getFullYear()).slice(-2)}`;
  const [rows] = await connection.query('SELECT MAX(CAST(SUBSTRING(ot_number, 6, 5) AS UNSIGNED)) n FROM overtimetb WHERE ot_number LIKE ?', [`${prefix}%`]);
  return prefix + String(Number(rows[0]?.n || 0) + 1).padStart(5, '0');
};

router.all('/', async (req, res, next) => {
  try {
    await ensureOvertimeTable();
    const action = text(req.query.action || req.body?.action).toLowerCase();
    const owner = upper(req.user?.usercode);

    if (action === 'memo_departments' || action === 'memo_employees' || action === 'create_team_memo') {
      const creator = await db.queryOne(`SELECT usercode,privilage,privilagemenu,
        COALESCE(NULLIF(TRIM(department),''),'') department, COALESCE(NULLIF(TRIM(area),''),'') area
        FROM usertb WHERE UPPER(TRIM(usercode))=UPPER(TRIM(?)) LIMIT 1`, [owner]);
      if (!creator || !canCreateTeamMemo(creator)) return res.status(403).json({ ok: false, message: 'Team OT memos are restricted to privilege 6 department heads.' });
      const creatorDepartment = text(creator.department);

      if (action === 'memo_departments') {
        // ponytail: reuses dtrService's already-battle-tested department list — real departmenttb
        // rows (deduped, noise blocked) plus the cross-department role groups (MR/Collector,
        // Disconnector, Security Guard, Substation Tender, Basey/Villareal/Catbalogan) that DTR
        // already had to invent because those roles/areas don't live cleanly under one department.
        const options = await dtrService.departmentFilterOptions();
        const departments = options.map((row) => text(row.name)).filter(Boolean);
        return res.json({ ok: true, departments, selected_department: departments.includes(creatorDepartment) ? creatorDepartment : (departments[0] || '') });
      }

      if (action === 'memo_employees') {
        const department = validMemoDepartment(req.query.department || creatorDepartment);
        if (!department) return res.status(422).json({ ok: false, message: 'Choose a valid department.' });
        const query = text(req.query.q).slice(0, 80).toLowerCase();
        const rows = await dtrService.employeesByDepartment(department);
        const items = rows
          .filter((row) => upper(row.usercode) !== owner)
          .filter((row) => !query || [row.name, row.usercode, row.position]
            .some((value) => String(value || '').toLowerCase().includes(query)))
          .map((row) => ({
            usercode: upper(row.usercode),
            name: text(row.name) || text(row.usercode),
            position: text(row.position) || 'Employee',
            department: text(row.department),
            area: text(row.area) || 'Main',
            profile_photo_url: Buffer.isBuffer(row.profile_photo_url) ? row.profile_photo_url.toString() : text(row.profile_photo_url)
          }))
          .slice(0, 200);
        return res.json({ ok: true, department, items });
      }

      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const memo = normalizeTeamMemoInput(req.body || {});
      if (memo.error) return res.status(422).json({ ok: false, message: memo.error });
      // ponytail: memo.department is just "which list the head was browsing" (a real department, or a
      // cross-department group like MR/Collector or Catbalogan) — not a hard filter. Each assigned
      // employee keeps their own actual department/area below, so the memo can mix people picked from
      // several different browses (e.g. Catbalogan collectors + Basey collectors) into one OT batch.
      const placeholders = memo.employeeCodes.map(() => '?').join(',');
      const assigned = await db.queryAll(`SELECT usercode,
        COALESCE(NULLIF(TRIM(area),''),?) area, COALESCE(NULLIF(TRIM(department),''),'') department
        FROM usertb WHERE UPPER(TRIM(usercode)) IN (${placeholders})`, [text(creator.area), ...memo.employeeCodes]);
      if (assigned.length !== memo.employeeCodes.length) return res.status(422).json({ ok: false, message: 'One or more selected employees were not found.' });

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const created = [];
        for (const person of assigned) {
          const employeeCode = upper(person.usercode);
          const supervisor = await configuredApprover('overtime_supervisor', employeeCode);
          let departmentHead = await configuredApprover('overtime_department_head', employeeCode);
          if (!departmentHead) departmentHead = await configuredApprover('overtime', employeeCode);
          if (!departmentHead) departmentHead = owner;
          const skip = !!supervisor && supervisor === departmentHead;
          const requiresGeneralManager = await requiresGm(employeeCode, memo.date, memo.hours);
          const otNumber = await nextOtNumber(connection);
          await connection.execute(`INSERT INTO overtimetb (ot_number,usercode,area,department,attachment_type,request_date,time_from,time_to,hours,purpose,
            attachments_json,status,supervisor_status,supervisor_assigned,supervisor_approved,supervisor_remarks,dept_head_status,dept_head_assigned,
            gm_status,requires_gm,accomplishment_status,memo_created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,NULL,1,?,?,?,?,0,?,0,?,0,?)`, [otNumber, employeeCode, text(person.area), text(person.department),
            'Department Head OT Memo', memo.date, memo.timeFrom, memo.timeTo, memo.hours, `TASK: ${memo.purpose}`,
            skip ? 1 : 0, supervisor || null, skip ? supervisor : null,
            skip ? 'Auto-skipped: supervisor and department head are the same signatory.' : null,
            departmentHead, requiresGeneralManager, owner]);
          created.push({ usercode: employeeCode, ot_number: otNumber });
        }
        await connection.commit();
        return res.json({ ok: true, message: `Team OT memo assigned to ${created.length} employee${created.length === 1 ? '' : 's'}.`, items: created });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    }

    if (action === 'approver_options' || action === 'assign_approver') {
      const stage = text(req.query.stage);
      if (!['supervisor', 'dept_head', 'gm'].includes(stage) || !owner) return res.status(422).json({ ok: false, message: 'Invalid approval stage.' });
      const eligibility = stage === 'supervisor'
        ? `TRIM(COALESCE(u.privilage,'')) REGEXP '(^|[^0-9])5([^0-9]|$)'`
        : stage === 'dept_head'
          ? `EXISTS (SELECT 1 FROM departmenttb d WHERE TRIM(COALESCE(u.name,'')) <> '' AND
              (UPPER(TRIM(d.HeadsorOic)) = UPPER(TRIM(u.name)) OR LOCATE(UPPER(TRIM(u.name)), UPPER(TRIM(d.HeadsorOic))) > 0))`
          : `(COALESCE(u.OT,0) = 3 OR EXISTS (SELECT 1 FROM signatory_groups g
              WHERE UPPER(TRIM(g.signatory_usercode)) = UPPER(TRIM(u.usercode)) AND g.module_key = 'overtime_gm'))`;
      if (action === 'approver_options') {
        const items = await db.queryAll(`SELECT DISTINCT u.usercode,
          COALESCE(NULLIF(TRIM(u.name),''),NULLIF(TRIM(u.username),''),u.usercode) name,
          COALESCE(NULLIF(TRIM(u.position),''),'') position, COALESCE(NULLIF(TRIM(u.department),''),'') department,
          COALESCE(NULLIF(TRIM(u.profile_photo_url),''),'') profile_photo_url
          FROM usertb u WHERE UPPER(TRIM(u.usercode)) <> UPPER(TRIM(?)) AND ${eligibility}
          ORDER BY name LIMIT 30`, [owner]);
        return res.json({ ok: true, items: items.map((row) => ({ ...row, usercode: upper(row.usercode), profile_photo_url: Buffer.isBuffer(row.profile_photo_url) ? row.profile_photo_url.toString() : text(row.profile_photo_url) })) });
      }
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const otNumber = upper(req.body?.ot_number);
      const approver = upper(req.body?.approver_usercode);
      if (!otNumber || !approver || approver === owner) return res.status(422).json({ ok: false, message: 'Choose a valid approver.' });
      const eligible = await db.queryOne(`SELECT 1 found FROM usertb u WHERE UPPER(TRIM(u.usercode)) = UPPER(TRIM(?)) AND ${eligibility} LIMIT 1`, [approver]);
      if (!eligible) return res.status(422).json({ ok: false, message: 'That employee is not eligible for this approval stage.' });
      const sets = {
        supervisor: `supervisor_assigned=?, supervisor_status=0, supervisor_approved=NULL, supervisor_remarks=NULL,
          dept_head_status=0, dept_head_approved=NULL, dept_head_remarks=NULL, gm_status=0, gm_approved=NULL, gm_remarks=NULL, ot_approved=NULL, status=1`,
        dept_head: `dept_head_assigned=?, dept_head_status=0, dept_head_approved=NULL, dept_head_remarks=NULL,
          gm_status=0, gm_approved=NULL, gm_remarks=NULL, ot_approved=NULL, status=1`,
        gm: `gm_assigned=?, gm_status=0, gm_approved=NULL, gm_remarks=NULL, ot_approved=NULL, status=1`,
      };
      const result = await db.execute(`UPDATE overtimetb SET ${sets[stage]} WHERE ot_number=? AND UPPER(TRIM(usercode))=UPPER(TRIM(?)) AND status IN (1,2)`, [approver, otNumber, owner]);
      return result.affectedRows === 1
        ? res.json({ ok: true, message: 'Approver changed and approval restarted from this stage.' })
        : res.status(409).json({ ok: false, message: 'Rejected requests cannot change approvers.' });
    }

    if (action === 'pending_dept') {
      if (!await canManage(req.user)) return res.json({ ok: true, items: [], total: 0, message: 'No pending overtime approvals available for this account.' });
      const includeAll = text(req.query.all) === '1';
      const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 20));
      const role = await sessionRole(req.user);
      const configured = await hasConfiguredAssignments(owner);
      const params = [];
      const where = [includeAll ? 'o.status IN (1,2,3)' : 'o.status=1'];
      if (configured) {
        where.push(`(UPPER(TRIM(COALESCE(o.supervisor_assigned,'')))=UPPER(TRIM(?)) OR
          UPPER(TRIM(COALESCE(o.dept_head_assigned,'')))=UPPER(TRIM(?)) OR UPPER(TRIM(COALESCE(o.gm_assigned,'')))=UPPER(TRIM(?)) OR
          EXISTS (SELECT 1 FROM signatory_group_members m JOIN signatory_groups g ON g.id=m.group_id
            WHERE UPPER(TRIM(m.usercode))=UPPER(TRIM(o.usercode)) AND UPPER(TRIM(g.signatory_usercode))=UPPER(TRIM(?))
              AND g.module_key IN ('overtime','overtime_supervisor','overtime_department_head','overtime_gm')))`);
        params.push(owner, owner, owner, owner);
      } else if (!includeAll) {
        where.push(role === 2 ? 'o.supervisor_status=0' : role === 1 ? 'o.supervisor_status=1 AND o.dept_head_status=0' : role === 3 ? 'o.supervisor_status=1 AND o.dept_head_status=1 AND o.gm_status=0' : '1=0');
      } else if (![1, 2, 3].includes(role)) where.push('1=0');
      const department = text(req.query.department || req.query.filterDept);
      if (department) { where.push('o.department LIKE ?'); params.push(`%${department}%`); }
      for (const [key, sql] of [['year','YEAR(o.request_date)=?'],['month','MONTH(o.request_date)=?'],['day','DAY(o.request_date)=?']]) {
        const value = Number(req.query[key] || 0); if (value > 0) { where.push(sql); params.push(value); }
      }
      // ponytail: resolve the current configured stage in JS; 100 rows is the approval-desk ceiling.
      const queryLimit = configured && !includeAll ? 100 : limit;
      const rows = await db.queryAll(`SELECT o.*, requester.profile_photo_url requester_photo_url, requester.name requester_name
        FROM overtimetb o LEFT JOIN usertb requester ON requester.usercode=o.usercode
        WHERE ${where.join(' AND ')} ORDER BY o.Id DESC LIMIT ?`, [...params, queryLimit]);
      const items = [];
      for (const row of rows) {
        const stage = configured ? await configuredStage(row, owner, !includeAll) : roleMeta(role).key;
        if (configured && !includeAll && !stage) continue;
        items.push({ ot_number: row.ot_number || '', usercode: row.usercode || '', requester_name: row.requester_name || '',
          requester_photo_url: Buffer.isBuffer(row.requester_photo_url) ? row.requester_photo_url.toString() : text(row.requester_photo_url),
          date: formatDate(row.request_date), attachment_type: row.attachment_type || '', time_from: formatTime(row.time_from),
          time_to: formatTime(row.time_to), hours: Number(row.hours || 0), purpose: row.purpose || '', department: row.department || '',
          area: row.area || '', status: Number(row.status || 1), reviewed_status: stage ? Number(row[`${stage}_status`] || 0) : 0,
          approval_stage: stage, requires_gm: Number(row.requires_gm || 0) });
        if (items.length >= limit) break;
      }
      return res.json({ ok: true, items, total: items.length });
    }

    if (action === 'update_dept_status') {
      if (!await canManage(req.user)) return res.status(403).json({ ok: false, message: 'Approval access is restricted to approvers.' });
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const otNumber = upper(req.body?.ot_number); const nextStatus = Number(req.body?.status); const remarks = text(req.body?.remarks);
      if (!otNumber || ![1, 2].includes(nextStatus)) return res.status(422).json({ ok: false, message: 'Invalid overtime approval request.' });
      if (nextStatus === 2 && !remarks) return res.status(422).json({ ok: false, message: 'Please add a rejection remark before rejecting overtime.' });
      const request = await db.queryOne(`SELECT usercode,status,supervisor_status,supervisor_assigned,dept_head_status,dept_head_assigned,
        gm_status,gm_assigned,requires_gm FROM overtimetb WHERE ot_number=? LIMIT 1`, [otNumber]);
      if (!request) return res.status(404).json({ ok: false, message: 'Overtime request was not found.' });
      if (upper(request.usercode) === owner) return res.status(403).json({ ok: false, message: 'You cannot approve your own overtime request.' });
      const pendingStage = await configuredStage(request, owner, true);
      const role = await sessionRole(req.user);
      const ownedStage = await hasConfiguredAssignments(owner) ? await configuredStage(request, owner, false) : roleMeta(role).key;
      if (!pendingStage && !ownedStage && !role) return res.status(403).json({ ok: false, message: 'Approval access is restricted to OT approvers.' });
      const stage = pendingStage || ownedStage;
      if (!['supervisor', 'dept_head', 'gm'].includes(stage)) return res.status(409).json({ ok: false, message: 'This overtime request is no longer pending your approval stage.' });
      const currentStageStatus = Number(request[`${stage}_status`] || 0);
      const statusColumn = `${stage}_status`; const approvedColumn = `${stage}_approved`; const remarksColumn = `${stage}_remarks`;
      let setSql = `${statusColumn}=?, ${approvedColumn}=?, ${remarksColumn}=?`;
      let overall = Number(request.status || 1); let overallApprover = null;
      if (nextStatus === 2) {
        overall = 3; overallApprover = owner;
        if (stage === 'supervisor') setSql += ', dept_head_status=0,dept_head_approved=NULL,dept_head_remarks=NULL,gm_status=0,gm_approved=NULL,gm_remarks=NULL';
        if (stage === 'dept_head') setSql += ', gm_status=0,gm_approved=NULL,gm_remarks=NULL';
      } else if (stage === 'gm' || (stage === 'dept_head' && Number(request.requires_gm) !== 1)) {
        overall = 2; overallApprover = owner;
      } else overall = 1;
      if (nextStatus === 1 && stage === 'dept_head' && Number(request.requires_gm) === 1 && !await configuredApprover('overtime_gm', upper(request.usercode))) {
        return res.status(422).json({ ok: false, message: 'Assign an OT General Manager signatory before approving this exceptional request.' });
      }
      setSql += ', status=?, ot_approved=?';
      const allowed = (nextStatus === 1 && currentStageStatus === 2) ? 'status=3 AND ' + statusColumn + '=2'
        : (nextStatus === 2 && currentStageStatus === 1) ? `status IN (1,2) AND ${statusColumn}=1`
          : `status=1 AND ${statusColumn}=0`;
      const result = await db.execute(`UPDATE overtimetb SET ${setSql} WHERE ot_number=? AND ${allowed}`,
        [nextStatus, owner, nextStatus === 2 ? remarks : null, overall, overallApprover, otNumber]);
      if (!result.affectedRows) return res.status(409).json({ ok: false, message: 'This overtime request is no longer pending your approval stage.' });
      return res.json({ ok: true, message: nextStatus === 2 ? (currentStageStatus === 1 ? 'Approved overtime request rejected.' : 'Overtime request rejected.')
        : currentStageStatus === 2 ? (overall === 2 ? 'Rejected overtime request approved again.' : 'Overtime stage approved again and sent to the next approver.')
          : stage === 'supervisor' ? 'Supervisor approval saved.' : stage === 'dept_head' && Number(request.requires_gm) === 1 ? 'Department Head approved. Waiting for General Manager.' : 'Overtime request approved.' });
    }

    if (action === 'list') {
      const usercode = upper(req.query.usercode || owner);
      if (!usercode) return res.status(422).json({ ok: false, message: 'Missing employee number.' });
      if (usercode !== owner && !await canManage(req.user)) return res.status(403).json({ ok: false, message: 'You can view only your own overtime requests.' });
      const limit = Math.max(1, Math.min(10, Number(req.query.limit) || 10));
      const count = await db.queryOne('SELECT COUNT(*) total FROM overtimetb WHERE usercode=?', [usercode]);
      const total = Number(count?.total || 0); const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.min(Math.max(1, Number(req.query.page) || 1), totalPages); const offset = (page - 1) * limit;
      const rows = await db.queryAll(`SELECT o.*, supervisor.name supervisor_approver_name, dept.name dept_head_approver_name,
        gm.name gm_approver_name, approver.name approver_name FROM overtimetb o
        LEFT JOIN usertb supervisor ON supervisor.usercode=o.supervisor_approved
        LEFT JOIN usertb dept ON dept.usercode=o.dept_head_approved LEFT JOIN usertb gm ON gm.usercode=o.gm_approved
        LEFT JOIN usertb approver ON approver.usercode=o.ot_approved WHERE o.usercode=? ORDER BY o.Id DESC LIMIT ? OFFSET ?`, [usercode, limit, offset]);
      const items = [];
      for (const row of rows) items.push({ ot_number: row.ot_number || '', date: formatDate(row.request_date), date_value: dateValue(row.request_date),
        attachment_type: row.attachment_type || '', time_from: formatTime(row.time_from), time_to: formatTime(row.time_to),
        time_from_value: normalizeTime(row.time_from), time_to_value: normalizeTime(row.time_to), hours: Number(row.hours || 0),
        purpose: row.purpose || '', attachments_json: row.attachments_json || '', area: row.area || '', department: row.department || '',
        status: row.status || '', status_label: statusLabel(row.status), can_update: pendingEditable(row), can_remove: pendingEditable(row),
        approver_name: row.approver_name || '', supervisor_approver_name: row.supervisor_approver_name || '',
        dept_head_approver_name: row.dept_head_approver_name || '', gm_approver_name: row.gm_approver_name || '',
        supervisor_status: Number(row.supervisor_status || 0), supervisor_remarks: row.supervisor_remarks || '',
        dept_head_status: Number(row.dept_head_status || 0), dept_head_remarks: row.dept_head_remarks || '',
        gm_status: Number(row.gm_status || 0), gm_remarks: row.gm_remarks || '', requires_gm: Number(row.requires_gm || 0),
        accomplishment_status: Number(row.accomplishment_status || 0), monitor_steps: await monitorSteps(row) });
      return res.json({ ok: true, items, page, limit, total, total_pages: totalPages });
    }

    if (action === 'time_presets') {
      const usercode = upper(req.query.usercode || owner);
      if (!usercode) return res.status(422).json({ ok: false, message: 'Missing employee number.' });
      const rows = await db.queryAll(`SELECT o.time_from,o.time_to,o.hours,o.status,o.ot_number,o.created_at last_used,stats.use_count
        FROM overtimetb o JOIN (SELECT time_from,time_to,hours,MAX(created_at) latest FROM overtimetb
          WHERE usercode=? AND time_from<>'' AND time_to<>'' AND created_at>=DATE_SUB(NOW(),INTERVAL 15 DAY) GROUP BY time_from,time_to,hours) x
          ON o.usercode=? AND o.time_from=x.time_from AND o.time_to=x.time_to AND o.hours=x.hours AND o.created_at=x.latest
        JOIN (SELECT time_from,time_to,hours,COUNT(*) use_count FROM overtimetb WHERE usercode=? AND time_from<>'' AND time_to<>''
          AND created_at>=DATE_SUB(NOW(),INTERVAL 15 DAY) GROUP BY time_from,time_to,hours) stats
          ON stats.time_from=o.time_from AND stats.time_to=o.time_to AND stats.hours=o.hours ORDER BY o.created_at DESC LIMIT 12`, [usercode, usercode, usercode]);
      const presets = rows.map((row) => { const from = normalizeTime(row.time_from); const to = normalizeTime(row.time_to); const status = Number(row.status || 1);
        return { time_from: from, time_to: to, hours: Number(row.hours || 0), time_label: `${formatTime(from)} – ${formatTime(to)}`,
          use_count: Number(row.use_count || 0), status, status_label: statusLabel(status), status_tone: status === 2 ? 'approved' : status === 3 ? 'rejected' : 'pending',
          ot_number: text(row.ot_number), last_used: formatDate(row.last_used), note: `Overtime used${row.ot_number ? ` · ${row.ot_number}` : ''} · ${status === 2 ? 'Approved' : status === 3 ? 'Rejected' : 'Waiting for approval'}` }; });
      return res.json({ ok: true, presets, days_visible: 15 });
    }

    if (action === 'create' || action === 'update') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const payload = req.body || {}; const usercode = owner; const requestDate = normalizeDate(payload.date);
      const hours = Number(payload.hours || 0); const purpose = text(payload.purpose);
      if (!usercode || !requestDate || !purpose || hours <= 0) return res.status(422).json({ ok: false, message: 'Please complete date, time, hours, and purpose.' });
      const supervisor = await configuredApprover('overtime_supervisor', usercode);
      let departmentHead = await configuredApprover('overtime_department_head', usercode);
      if (!departmentHead) departmentHead = await configuredApprover('overtime', usercode);
      const skip = !!supervisor && supervisor === departmentHead;
      const values = [text(payload.area), text(payload.department), text(payload.attachment_type), requestDate, text(payload.time_from), text(payload.time_to),
        hours, purpose, text(payload.attachments_json) || null, hasAccomplishment(payload.attachments_json, payload.attachment_type) ? 1 : 0];
      if (action === 'update') {
        const otNumber = upper(payload.ot_number); if (!otNumber) return res.status(422).json({ ok: false, message: 'Missing overtime request number.' });
        const current = await db.queryOne('SELECT status,supervisor_status,supervisor_remarks,dept_head_status,gm_status FROM overtimetb WHERE ot_number=? AND usercode=? LIMIT 1', [otNumber, usercode]);
        if (!current) return res.status(404).json({ ok: false, message: 'Overtime request not found.' });
        if (!pendingEditable(current)) return res.status(409).json({ ok: false, message: 'This overtime request is already approved or rejected and can no longer be edited.' });
        const gm = await requiresGm(usercode, requestDate, hours, otNumber);
        await db.execute(`UPDATE overtimetb SET area=?,department=?,attachment_type=?,request_date=?,time_from=?,time_to=?,hours=?,purpose=?,attachments_json=?,
          accomplishment_status=?,requires_gm=?,status=1,supervisor_status=?,supervisor_approved=?,supervisor_remarks=?,dept_head_status=0,dept_head_approved=NULL,
          dept_head_remarks=NULL,gm_status=0,gm_approved=NULL,gm_remarks=NULL,ot_approved=NULL WHERE ot_number=? AND usercode=? AND status=1`,
          [...values, gm, skip ? 1 : 0, skip ? supervisor : null, skip ? 'Auto-skipped: supervisor and department head are the same signatory.' : null, otNumber, usercode]);
        return res.json({ ok: true, message: 'Overtime request updated.', ot_number: otNumber });
      }
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction(); const otNumber = await nextOtNumber(connection); const gm = await requiresGm(usercode, requestDate, hours);
        await connection.execute(`INSERT INTO overtimetb (ot_number,usercode,area,department,attachment_type,request_date,time_from,time_to,hours,purpose,
          attachments_json,status,supervisor_status,supervisor_approved,supervisor_remarks,dept_head_status,gm_status,requires_gm,accomplishment_status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,0,0,?,?)`, [otNumber, usercode, ...values.slice(0, 9), skip ? 1 : 0, skip ? supervisor : null,
          skip ? 'Auto-skipped: supervisor and department head are the same signatory.' : null, gm, values[9]]);
        await connection.commit(); return res.json({ ok: true, message: 'Overtime request saved.', ot_number: otNumber });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    }

    if (action === 'remove') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
      const otNumber = upper(req.body?.ot_number); if (!otNumber || !owner) return res.status(422).json({ ok: false, message: 'Missing overtime request number.' });
      const current = await db.queryOne('SELECT status,supervisor_status,supervisor_remarks,dept_head_status,gm_status FROM overtimetb WHERE ot_number=? AND usercode=? LIMIT 1', [otNumber, owner]);
      if (!current) return res.status(404).json({ ok: false, message: 'Overtime request not found.' });
      if (!pendingEditable(current)) return res.status(409).json({ ok: false, message: 'This overtime request is already approved or rejected and can no longer be removed.' });
      const result = await db.execute(`DELETE FROM overtimetb WHERE ot_number=? AND usercode=? AND status=1 AND
        (supervisor_status=0 OR (supervisor_status=1 AND supervisor_remarks='Auto-skipped: supervisor and department head are the same signatory.'))
        AND dept_head_status=0 AND gm_status=0`, [otNumber, owner]);
      return result.affectedRows ? res.json({ ok: true, message: 'Overtime request removed.', ot_number: otNumber })
        : res.status(409).json({ ok: false, message: 'This overtime request is already approved or rejected and can no longer be removed.' });
    }

    return res.status(400).json({ ok: false, message: 'Invalid action.' });
  } catch (error) { next(error); }
});

router.memoHelpers = { privilegeTokens, canCreateTeamMemo, validMemoDate, validMemoTime, validMemoDepartment, normalizeTeamMemoInput };
module.exports = router;
