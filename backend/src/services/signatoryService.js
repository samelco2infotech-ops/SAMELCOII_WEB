/**
 * Purpose: Node signatory routing and admin assignment management.
 * EDIT GUIDE: Module routing priority is member, department, then global.
 * HUWAG BAGUHIN: All mutation callers must pass an identity already authorized for privilege token 10.
 * Tagalog: Isang active default signatory lang bawat employee sa bawat module.
 */
const db = require('../config/database');

const MODULES = [
  ['epass', 'E-Pass'], ['travel', 'Travel Order'], ['leave', 'Leave'], ['fuel', 'Fuel'],
  ['fuel_epass', 'Fuel E-Pass'], ['fuel_travel', 'Fuel Travel'], ['overtime', 'Overtime'],
  ['overtime_supervisor', 'Overtime Supervisor'], ['overtime_department_head', 'Overtime Department Head'],
  ['overtime_gm', 'Overtime General Manager'], ['dtr', 'DTR'], ['membership', 'Membership'],
  ['warehouse', 'Warehouse'], ['it_equipment', 'IT Equipment'], ['soa', 'SOA'],
  ['billing', 'Billing'], ['forms', 'Forms'],
].map(([key, label]) => ({ key, label }));
const MODULE_KEYS = new Set(MODULES.map((item) => item.key));

const ensureSchema = async (connection) => {
  await connection.query(`CREATE TABLE IF NOT EXISTS signatory_groups (
    id INT NOT NULL AUTO_INCREMENT, module_key VARCHAR(40) NOT NULL,
    signatory_usercode VARCHAR(40) NOT NULL, title VARCHAR(120) NULL,
    department VARCHAR(120) NULL, assigned_by VARCHAR(40) NULL,
    created_at DATETIME NULL, updated_at DATETIME NULL, PRIMARY KEY(id),
    UNIQUE KEY uniq_module_signatory(module_key,signatory_usercode),
    KEY idx_module_key(module_key),KEY idx_signatory_usercode(signatory_usercode)) ENGINE=InnoDB DEFAULT CHARSET=latin1`);
  await connection.query(`CREATE TABLE IF NOT EXISTS signatory_group_members (
    id INT NOT NULL AUTO_INCREMENT, group_id INT NOT NULL,
    usercode VARCHAR(40) NOT NULL, assigned_by VARCHAR(40) NULL,
    created_at DATETIME NULL, updated_at DATETIME NULL, PRIMARY KEY(id),
    UNIQUE KEY uniq_group_user(group_id,usercode),KEY idx_group_id(group_id),
    KEY idx_usercode(usercode)) ENGINE=InnoDB DEFAULT CHARSET=latin1`);
};

const imageMime = (blob) => {
  const b = Buffer.isBuffer(blob) ? blob : Buffer.from(blob || '');
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.subarray(0, 6).toString() === 'GIF87a' || b.subarray(0, 6).toString() === 'GIF89a') return 'image/gif';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.subarray(0, 256).toString().trimStart().startsWith('<svg')) return 'image/svg+xml';
  return 'image/png';
};
const dataUri = (blob) => {
  if (!blob || !Buffer.from(blob).length) return '';
  const bytes = Buffer.from(blob);
  return `data:${imageMime(bytes)};base64,${bytes.toString('base64')}`;
};

const departments = () => db.queryAll(
  `SELECT d.Id id,COALESCE(NULLIF(TRIM(d.NAME),''),d.ABREVATION,CONCAT('Department ',d.Id)) name,
   COALESCE(NULLIF(TRIM(d.ABREVATION),''),'') abbreviation,
   COALESCE(NULLIF(TRIM(d.HeadsorOic),''),'') head,
   COALESCE(NULLIF(TRIM(d.positions),''),'') position,
   COUNT(u.usercode) employee_count
   FROM departmenttb d LEFT JOIN usertb u ON UPPER(TRIM(u.department)) IN
   (UPPER(TRIM(d.NAME)),UPPER(TRIM(d.ABREVATION)))
   GROUP BY d.Id,d.NAME,d.ABREVATION,d.HeadsorOic,d.positions ORDER BY name`);
const areas = () => db.queryAll(
  `SELECT DISTINCT TRIM(area) name FROM usertb WHERE area IS NOT NULL AND TRIM(area)<>'' ORDER BY name`);

const departmentSignatures = async (agmaOnly = false) => {
  const rows = await db.queryAll(
    `SELECT d.Id id,COALESCE(NULLIF(TRIM(d.NAME),''),d.ABREVATION,CONCAT('Department ',d.Id)) name,
     COALESCE(NULLIF(TRIM(d.ABREVATION),''),'') abbreviation,
     COALESCE(NULLIF(TRIM(d.HeadsorOic),''),'') head,
     COALESCE(NULLIF(TRIM(d.positions),''),'') position,d.SignatureImage signature_image
     FROM departmenttb d ORDER BY d.Id`);
  return rows.filter((row) => !agmaOnly || ['ITS', 'ISD', 'IAD', 'OGM'].includes(String(row.abbreviation).toUpperCase()))
    .map((row) => {
      const signature = dataUri(row.signature_image);
      return { id: Number(row.id), name: agmaOnly ? row.head || row.name : row.name, abbreviation: row.abbreviation,
        head: row.head || row.name, position: row.position, SignatureImage: signature, signatureImage: signature };
    });
};

// Strips common titles/degree suffixes so "Engr. Ricky L. Langi" (departmenttb.HeadsorOic, free
// text) can be matched against "Ricky L. Langi" (usertb.name) well enough for a first-time guess.
const coreName = (value) => String(value || '')
  .replace(/^(engr|dr|mr|mrs|ms|atty)\.?\s+/i, '')
  .replace(/,?\s*(cpa|jr\.?|sr\.?|iii|ii)\s*$/i, '')
  .trim();

const seedOneDepartment = async (connection, moduleKey, deptName, deptAbbr, head) => {
  const name = coreName(head);
  if (!name) return;
  const [[existing]] = await connection.query(
    `SELECT id FROM signatory_groups WHERE module_key=? AND UPPER(TRIM(department)) IN (UPPER(TRIM(?)),UPPER(TRIM(?))) LIMIT 1`,
    [moduleKey, deptName, deptAbbr]);
  if (existing) return;
  const [[person]] = await connection.query(
    `SELECT usercode, position FROM usertb WHERE TRIM(name) LIKE CONCAT('%', ?, '%') LIMIT 1`, [name]);
  if (!person) return;
  await connection.execute(
    `INSERT IGNORE INTO signatory_groups (module_key, signatory_usercode, title, department, assigned_by, created_at, updated_at)
     VALUES (?,?,?,?,'AUTO',NOW(),NOW())`, [moduleKey, person.usercode, person.position || '', deptName]);
};

// One-time bootstrap: if a department has never had a signatory group set for this module, seed
// one from departmenttb.HeadsorOic (the "who is department head" field already on record) so
// day-one prints aren't blank. Only ever runs once per department — after the INSERT, the row
// exists, so an admin's later manual reassignment is never overwritten by this again.
// No `department` filter (DTR's normal "give me everything" call) seeds every department that's
// still missing one in a single pass; a specific department seeds just that one.
const autoSeedDepartmentSignatory = async (connection, moduleKey, department) => {
  if (department) {
    const [[dept]] = await connection.query(
      `SELECT NAME name, ABREVATION abbreviation, COALESCE(NULLIF(TRIM(HeadsorOic),''),'') head FROM departmenttb
       WHERE UPPER(TRIM(NAME))=UPPER(TRIM(?)) OR UPPER(TRIM(ABREVATION))=UPPER(TRIM(?)) LIMIT 1`,
      [department, department]);
    if (dept) await seedOneDepartment(connection, moduleKey, dept.name, dept.abbreviation, dept.head);
    return;
  }
  const [depts] = await connection.query(
    `SELECT NAME name, ABREVATION abbreviation, COALESCE(NULLIF(TRIM(HeadsorOic),''),'') head FROM departmenttb`);
  for (const dept of depts) {
    await seedOneDepartment(connection, moduleKey, dept.name, dept.abbreviation, dept.head);
  }
};

const get = async (moduleKey, department, usercode) => {
  if (!MODULE_KEYS.has(moduleKey)) throw Object.assign(new Error('Unknown module.'), { status: 400 });
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection);
    if (moduleKey === 'dtr') await autoSeedDepartmentSignatory(connection, moduleKey, department);
    const params = [usercode, moduleKey];
    let condition = '';
    if (department) {
      condition = `AND (${usercode ? 'sgm.id IS NOT NULL OR ' : ''}
        UPPER(TRIM(COALESCE(sg.department,'')))=UPPER(TRIM(?))
        OR UPPER(TRIM(COALESCE(u.department,'')))=UPPER(TRIM(?))
        OR TRIM(COALESCE(sg.department,''))='')`;
      params.push(department, department);
    } else if (usercode) condition = "AND (sgm.id IS NOT NULL OR TRIM(COALESCE(sg.department,''))='')";
    const [rows] = await connection.query(
      `SELECT sg.id group_id,sg.signatory_usercode,COALESCE(NULLIF(u.name,''),u.username,sg.signatory_usercode) signatory_name,
       COALESCE(NULLIF(sg.title,''),u.position,'') title,
       COALESCE(NULLIF(sg.department,''),u.department,'') department,dep.SignatureImage signature_image,
       COALESCE(u.profile_photo_url,'') profile_photo_url
       FROM signatory_groups sg
       LEFT JOIN signatory_group_members sgm ON sgm.group_id=sg.id
         AND UPPER(TRIM(sgm.usercode))=UPPER(TRIM(?))
       LEFT JOIN usertb u ON u.usercode=sg.signatory_usercode
       LEFT JOIN departmenttb dep ON
         UPPER(TRIM(dep.NAME))=UPPER(TRIM(COALESCE(NULLIF(sg.department,''),u.department,'')))
         OR UPPER(TRIM(dep.ABREVATION))=UPPER(TRIM(COALESCE(NULLIF(sg.department,''),u.department,'')))
       WHERE sg.module_key=? ${condition}
       ORDER BY CASE WHEN sgm.id IS NOT NULL THEN 0 WHEN TRIM(COALESCE(sg.department,''))<>'' THEN 1 ELSE 2 END,sg.id
       LIMIT ${department || usercode ? 10 : 200}`,
      params);
    const signatories = rows.map((row) => ({ groupId: row.group_id, usercode: row.signatory_usercode, name: row.signatory_name,
      title: row.title, department: row.department, signatureImage: dataUri(row.signature_image),
      profilePhotoUrl: Buffer.isBuffer(row.profile_photo_url) ? row.profile_photo_url.toString('utf8') : (row.profile_photo_url || '') }));
    return { module: moduleKey, department, usercode, signatory: signatories[0] || null, signatories };
  } finally { connection.release(); }
};

const bootstrap = async ({ q = '', department = '', area = '' }) => {
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection);
    const deptRows = await departments(); const areaRows = await areas();
    const allDepartments = String(department).trim().toUpperCase() === '__ALL__';
    const dept = allDepartments ? null : deptRows.find((d) => [d.name, d.abbreviation].some((v) => String(v).trim() === department));
    // [FIX] bioUID<>'' required biometric-device enrollment for every search, silently excluding
    // any employee (e.g. officers who sign documents) who isn't enrolled in that device — nothing
    // to do with whether they're a valid person to search for by name.
    const where = ["COALESCE(usercode,'')<>''"]; const params = [];
    if (q) { where.push('(usercode LIKE ? OR name LIKE ? OR department LIKE ? OR area LIKE ? OR position LIKE ?)'); params.push(...Array(5).fill(`%${q}%`)); }
    if (dept) { where.push('TRIM(department) IN (?,?)'); params.push(dept.name, dept.abbreviation); }
    if (area) { where.push("UPPER(TRIM(COALESCE(area,'')))=UPPER(TRIM(?))"); params.push(area); }
    const loadEmployees = Boolean(allDepartments || dept || q.length >= 2);
    let employees = [];
    if (loadEmployees) {
      const [rows] = await connection.query(
        `SELECT usercode,COALESCE(NULLIF(name,''),username,usercode) name,COALESCE(position,'') position,
         COALESCE(department,'') department,COALESCE(area,'') area,COALESCE(profile_photo_url,'') profile_photo_url
         FROM usertb WHERE ${where.join(' AND ')} ORDER BY name LIMIT ${allDepartments ? 1000 : (dept ? 300 : 80)}`, params);
      employees = rows;
    }
    const [groups] = await connection.query(
      `SELECT sg.id,sg.module_key,sg.signatory_usercode,
       COALESCE(NULLIF(u.name,''),u.username,sg.signatory_usercode) signatory_name,
       COALESCE(NULLIF(sg.title,''),u.position,'') title,
       COALESCE(NULLIF(sg.department,''),u.department,'') department,COALESCE(u.area,'') area,
       COALESCE(u.profile_photo_url,'') profile_photo_url FROM signatory_groups sg
       LEFT JOIN usertb u ON u.usercode=sg.signatory_usercode ORDER BY sg.module_key,signatory_name`);
    const [members] = await connection.query(
      `SELECT sgm.id,sgm.group_id,sgm.usercode,COALESCE(NULLIF(u.name,''),u.username,sgm.usercode) name,
       COALESCE(u.position,'') position,COALESCE(u.department,'') department,COALESCE(u.area,'') area,
       COALESCE(u.profile_photo_url,'') profile_photo_url FROM signatory_group_members sgm
       LEFT JOIN usertb u ON u.usercode=sgm.usercode ORDER BY name`);
    return { modules: MODULES, departments: deptRows, areas: areaRows, employees,
      employee_load_hint: loadEmployees ? '' : 'Type at least 2 letters in search or choose a department to load employees.',
      groups, members };
  } finally { connection.release(); }
};

const requirePerson = async (connection, usercode, message = 'Employee not found.') => {
  const [[person]] = await connection.query(
    'SELECT usercode,position,department FROM usertb WHERE usercode=? LIMIT 1', [usercode]);
  if (!person) throw Object.assign(new Error(message), { status: 404 });
  return person;
};

const transferEmployee = async ({ usercode, department, area }, assignedBy) => {
  if (!usercode || !department || !area) throw Object.assign(new Error('Choose employee, department, and area.'), { status: 422 });
  const validDepartments = await departments(); const validAreas = await areas();
  if (!validDepartments.some((d) => d.name === department)) throw Object.assign(new Error('Choose a valid department.'), { status: 422 });
  if (!validAreas.some((a) => a.name === area)) throw Object.assign(new Error('Choose a valid area.'), { status: 422 });
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection); await requirePerson(connection, usercode); await connection.beginTransaction();
    await connection.execute('UPDATE usertb SET department=?,area=? WHERE usercode=? LIMIT 1', [department, area, usercode]);
    await connection.execute('UPDATE signatory_groups SET department=?,assigned_by=?,updated_at=NOW() WHERE signatory_usercode=?',
      [department, assignedBy, usercode]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

// department override: callers that already know the exact department "slot" they're filling
// (e.g. DTR's area-based pseudo-departments — "Catbalogan" means "match by area, excluding
// shift-worker positions", which is NOT the picked employee's own literal department field) pass
// it explicitly. Without it, falls back to the signatory's own department, same as before.
const createGroup = async ({ module_key: moduleKey, signatory_usercode: usercode, department }, assignedBy) => {
  if (!MODULE_KEYS.has(moduleKey) || !usercode) throw Object.assign(new Error('Choose a valid module and signatory.'), { status: 422 });
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection); const person = await requirePerson(connection, usercode, 'Signatory employee not found.');
    await connection.execute(
      `INSERT INTO signatory_groups(module_key,signatory_usercode,title,department,assigned_by) VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE title=VALUES(title),department=VALUES(department),assigned_by=VALUES(assigned_by),updated_at=NOW()`,
      [moduleKey, usercode, person.position || '', department || person.department || '', assignedBy]);
  } finally { connection.release(); }
};

const changeGroupSignatory = async ({ group_id: groupId, signatory_usercode: usercode, department }, assignedBy) => {
  if (Number(groupId) <= 0 || !usercode) throw Object.assign(new Error('Choose a valid group and replacement signatory.'), { status: 422 });
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection); const person = await requirePerson(connection, usercode, 'Replacement signatory not found.');
    const [[group]] = await connection.query('SELECT id,module_key,department FROM signatory_groups WHERE id=?', [groupId]);
    if (!group) throw Object.assign(new Error('Signatory group was not found.'), { status: 404 });
    const [[duplicate]] = await connection.query(
      'SELECT id FROM signatory_groups WHERE module_key=? AND signatory_usercode=? AND id<>? LIMIT 1',
      [group.module_key, usercode, groupId]);
    if (duplicate) throw Object.assign(new Error('That employee is already a signatory for this module.'), { status: 409 });
    await connection.execute(
      `UPDATE signatory_groups SET signatory_usercode=?,title=?,department=?,assigned_by=?,updated_at=NOW()
       WHERE id=? LIMIT 1`, [usercode, person.position || '', department || group.department || '', assignedBy, groupId]);
  } finally { connection.release(); }
};

const assignMember = async ({ group_id: groupId, usercode, member_id: memberId = 0 }, assignedBy, change = false) => {
  if (Number(groupId) <= 0 || !usercode) throw Object.assign(new Error('Choose a valid signatory group and employee.'), { status: 422 });
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection); await requirePerson(connection, usercode);
    const [[group]] = await connection.query('SELECT id,module_key FROM signatory_groups WHERE id=?', [groupId]);
    if (!group) throw Object.assign(new Error('Signatory group was not found.'), { status: 404 });
    await connection.beginTransaction();
    await connection.execute(
      `DELETE sgm FROM signatory_group_members sgm JOIN signatory_groups sg ON sg.id=sgm.group_id
       WHERE UPPER(TRIM(sgm.usercode))=UPPER(TRIM(?)) AND sg.module_key=? AND sgm.group_id<>?`,
      [usercode, group.module_key, groupId]);
    if (change && Number(memberId) > 0) {
      const [[duplicate]] = await connection.query(
        'SELECT id FROM signatory_group_members WHERE group_id=? AND usercode=? AND id<>? LIMIT 1',
        [groupId, usercode, memberId]);
      if (duplicate) throw Object.assign(new Error('That employee is already assigned under this signatory.'), { status: 409 });
      await connection.execute(
        'UPDATE signatory_group_members SET usercode=?,assigned_by=?,updated_at=NOW() WHERE id=? AND group_id=? LIMIT 1',
        [usercode, assignedBy, memberId, groupId]);
    } else {
      await connection.execute(
        `INSERT INTO signatory_group_members(group_id,usercode,assigned_by) VALUES(?,?,?)
         ON DUPLICATE KEY UPDATE assigned_by=VALUES(assigned_by),updated_at=NOW()`, [groupId, usercode, assignedBy]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

const remove = async (action, id) => {
  if (Number(id) <= 0) throw Object.assign(new Error('Missing record.'), { status: 422 });
  const connection = await db.getConnection();
  try {
    await ensureSchema(connection);
    if (action === 'remove_group') {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM signatory_group_members WHERE group_id=?', [id]);
      await connection.execute('DELETE FROM signatory_groups WHERE id=? LIMIT 1', [id]);
      await connection.commit();
    } else await connection.execute('DELETE FROM signatory_group_members WHERE id=? LIMIT 1', [id]);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

module.exports = {
  MODULES, MODULE_KEYS, dataUri, departmentSignatures, get, bootstrap, transferEmployee,
  createGroup, changeGroupSignatory, assignMember, remove,
};
