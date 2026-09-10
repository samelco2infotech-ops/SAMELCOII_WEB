/**
 * Purpose: Database operations and safe public data shaping for Node authentication.
 * EDIT GUIDE: Keep employee search filters aligned with the remaining legacy pickers.
 * HUWAG BAGUHIN: Passwords and private database errors must never enter API responses.
 * Tagalog: Dito kinukuha ang tunay na employee record; hindi pinagkakatiwalaan ang browser cache.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const { generateToken } = require('../middleware/auth');

const ensureUserTableSchema = async () => {
  const columns = [
    { name: 'profile_photo_url', sql: 'ALTER TABLE usertb ADD COLUMN profile_photo_url varchar(255) DEFAULT NULL' },
    { name: 'OT', sql: 'ALTER TABLE usertb ADD COLUMN OT TINYINT NOT NULL DEFAULT 0' },
    { name: 'VL', sql: 'ALTER TABLE usertb ADD COLUMN VL INT NOT NULL DEFAULT 0' },
    { name: 'SL', sql: 'ALTER TABLE usertb ADD COLUMN SL INT NOT NULL DEFAULT 0' },
    { name: 'OL', sql: 'ALTER TABLE usertb ADD COLUMN OL INT NOT NULL DEFAULT 0' },
    { name: 'VLbal', sql: 'ALTER TABLE usertb ADD COLUMN VLbal INT NOT NULL DEFAULT 0' },
    { name: 'SLbal', sql: 'ALTER TABLE usertb ADD COLUMN SLbal INT NOT NULL DEFAULT 0' },
    { name: 'OLbal', sql: 'ALTER TABLE usertb ADD COLUMN OLbal INT NOT NULL DEFAULT 0' },
    { name: 'employmentdate', sql: 'ALTER TABLE usertb ADD COLUMN employmentdate DATE DEFAULT NULL' },
    { name: 'bioUID', sql: 'ALTER TABLE usertb ADD COLUMN bioUID VARCHAR(50) DEFAULT NULL' },
    { name: 'privilagemenu', sql: 'ALTER TABLE usertb ADD COLUMN privilagemenu VARCHAR(255) DEFAULT NULL' },
    { name: 'address', sql: 'ALTER TABLE usertb ADD COLUMN address VARCHAR(255) DEFAULT NULL' },
    { name: 'emailadd', sql: 'ALTER TABLE usertb ADD COLUMN emailadd VARCHAR(255) DEFAULT NULL' },
    { name: 'area', sql: 'ALTER TABLE usertb ADD COLUMN area VARCHAR(120) DEFAULT NULL' },
    { name: 'basic', sql: 'ALTER TABLE usertb ADD COLUMN basic DECIMAL(12,2) DEFAULT NULL' },
    { name: 'mobile_number', sql: 'ALTER TABLE usertb ADD COLUMN mobile_number VARCHAR(50) DEFAULT NULL' },
  ];

  for (const column of columns) {
    try {
      const exists = await db.queryOne(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        ['usertb', column.name]
      );

      if (!exists) {
        await db.execute(column.sql);
        console.log(`✓ Added column: ${column.name}`);
      }
    } catch (error) {
      console.error(`✗ Failed to ensure column ${column.name}:`, error.message);
    }
  }
};

const isPasswordValid = async (incomingPassword, storedPassword) => {
  if (!storedPassword || storedPassword === '') {
    return false;
  }

  try {
    const isBcrypt = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');

    if (isBcrypt) {
      return await bcrypt.compare(incomingPassword, storedPassword);
    }

    const incoming = Buffer.from(String(incomingPassword));
    const stored = Buffer.from(String(storedPassword));
    return incoming.length === stored.length && crypto.timingSafeEqual(incoming, stored);
  } catch (error) {
    console.error('Password validation error:', error.message);
    return false;
  }
};

const profilePhotoUrl = (user) => {
  const userId = Number.parseInt(user.Id, 10) || 0;
  if (Number(user.has_profile_photo_blob || 0) === 1 && userId > 0) {
    const version = user.profile_photo_updated_at
      ? new Date(user.profile_photo_updated_at).getTime()
      : Date.now();
    return `/api/auth/profile-photo?user_id=${userId}&v=${Math.max(1, version || 1)}`;
  }

  const storedUrl = String(user.profile_photo_url || '').trim();
  if (storedUrl && !/[?&]action=profile_photo(?:&|$)/i.test(storedUrl)) {
    return storedUrl;
  }

  return `/SAMELCII_WEB_SYSTEM/assets/images/${userId % 2 === 0 ? 'avatar-male.jpg' : 'avatar-female.jpg'}?v=20260615-avatar-small-v2`;
};

const serializeUser = (user) => {
  const accountNumber = String(user.usercode || '');
  return {
    id: parseInt(user.Id, 10),
    usercode: user.usercode || '',
    accountnumber: accountNumber,
    name: user.name || '',
    position: user.position || '',
    department: user.department || '',
    OT: parseInt(user.OT, 10) || 0,
    privilage: user.privilage || '',
    username: user.username || '',
    mobile_number: user.mobile_number || '',
    VL: parseInt(user.VL, 10) || 0,
    SL: parseInt(user.SL, 10) || 0,
    OL: parseInt(user.OL, 10) || 0,
    VLbal: parseInt(user.VLbal, 10) || 0,
    SLbal: parseInt(user.SLbal, 10) || 0,
    OLbal: parseInt(user.OLbal, 10) || 0,
    employmentdate: user.employmentdate || '',
    bioUID: user.bioUID || '',
    privilagemenu: user.privilagemenu || '',
    address: user.address || '',
    emailadd: user.emailadd || '',
    area: user.area || '',
    basic: user.basic || null,
    profile_photo_url: profilePhotoUrl(user),
  };
};

const getUserByUsername = async (username) => {
  return db.queryOne(
    `SELECT Id, usercode, name, position, department, OT, privilage, username, password,
            mobile_number, VL, SL, OL, VLbal, SLbal, OLbal, employmentdate, bioUID,
            privilagemenu, address, emailadd, area, basic, profile_photo_url,
            profile_photo_updated_at, registration_pending,
            CASE WHEN profile_photo_blob IS NULL OR OCTET_LENGTH(profile_photo_blob) = 0 THEN 0 ELSE 1 END AS has_profile_photo_blob
     FROM usertb
     WHERE LOWER(COALESCE(username, '')) = LOWER(?)
     LIMIT 1`,
    [username]
  );
};

const getUserById = async (userId) => {
  return db.queryOne(
    `SELECT Id, usercode, name, position, department, OT, privilage, username, password,
            mobile_number, VL, SL, OL, VLbal, SLbal, OLbal, employmentdate, bioUID,
            privilagemenu, address, emailadd, area, basic, profile_photo_url,
            profile_photo_updated_at,
            CASE WHEN profile_photo_blob IS NULL OR OCTET_LENGTH(profile_photo_blob) = 0 THEN 0 ELSE 1 END AS has_profile_photo_blob
     FROM usertb
     WHERE Id = ?
     LIMIT 1`,
    [userId]
  );
};

const getUserByUsercode = async (usercode) => {
  try {
    const user = await db.queryOne(
      'SELECT Id, usercode, username FROM usertb WHERE usercode = ? LIMIT 1',
      [usercode]
    );
    return user;
  } catch (error) {
    console.error('getUserByUsercode error:', error.message);
    return null;
  }
};

const checkUsernameExists = async (username) => {
  try {
    const user = await db.queryOne(
      'SELECT Id FROM usertb WHERE LOWER(COALESCE(username, "")) = LOWER(?) LIMIT 1',
      [username]
    );
    return !!user;
  } catch (error) {
    console.error('checkUsernameExists error:', error.message);
    return false;
  }
};

const updateUserPassword = async (userId, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const result = await db.execute(
      'UPDATE usertb SET password = ? WHERE Id = ?',
      [hashedPassword, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('updateUserPassword error:', error.message);
    return false;
  }
};

const updateUserProfilePhoto = async (userId, photoUrl) => {
  try {
    const result = await db.execute(
      'UPDATE usertb SET profile_photo_url = ? WHERE Id = ?',
      [photoUrl, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('updateUserProfilePhoto error:', error.message);
    return false;
  }
};

// ponytail: self-service edit is scoped to contact info only (mobile_number, emailadd) — name,
// position, and department stay HR-of-record fields, changed only via the HR profile PATCH
// (payroll.js `/employees/:usercode/profile`), never here.
const updateUserContactInfo = async (userId, { mobileNumber, email }) => {
  try {
    const result = await db.execute(
      'UPDATE usertb SET mobile_number = ?, emailadd = ? WHERE Id = ?',
      [String(mobileNumber || '').trim(), String(email || '').trim(), userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('updateUserContactInfo error:', error.message);
    return false;
  }
};

// ponytail: registration used to activate the account immediately — anyone who found an
// unregistered employee's usercode via the public search-employee endpoint could register as
// them first and steal the account before its real owner ever signed up. None of the 106 not-
// yet-registered employees have a mobile number, email, or any other private field on file
// (checked live 2026-09-10), so there's no data-driven second factor to verify against — an
// admin approval gate is the only fix that doesn't lock all of them out. New registrations now
// start `registration_pending = 1`; loginResponse (auth.js) refuses to issue a token until an
// admin calls approveRegistration.
const registerUser = async (usercode, username, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const result = await db.execute(
      `UPDATE usertb
       SET username = ?, password = ?, registration_pending = 1
       WHERE Id = ?`,
      [username, hashedPassword, usercode]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('registerUser error:', error.message);
    throw error;
  }
};

const isRegistrationPending = (user) => Number(user?.registration_pending || 0) === 1;

const listPendingRegistrations = async () => {
  return db.queryAll(
    `SELECT Id, usercode, name, position, department, username
     FROM usertb
     WHERE registration_pending = 1
     ORDER BY name`
  );
};

const approveRegistration = async (usercode) => {
  const result = await db.execute(
    `UPDATE usertb SET registration_pending = 0 WHERE usercode = ? AND registration_pending = 1`,
    [usercode]
  );
  return result.affectedRows > 0;
};

// Rejecting clears the registration attempt (not just the pending flag) so the usercode is
// free for a legitimate re-registration — an admin who rejects a suspicious/wrong claim doesn't
// want the impostor's username/password left sitting on the account.
const rejectRegistration = async (usercode) => {
  const result = await db.execute(
    `UPDATE usertb SET username = NULL, password = NULL, registration_pending = 0
     WHERE usercode = ? AND registration_pending = 1`,
    [usercode]
  );
  return result.affectedRows > 0;
};

const departmentAliases = {
  OGM: ['OGM', 'OFFICE OF THE GENERAL MANAGER'],
  CORPLAN: ['CORPLAN', 'CPD', 'CORPORATE PLANNING DEPARTMENT'],
  CPD: ['CPD', 'CORPLAN', 'CORPORATE PLANNING DEPARTMENT'],
  FSD: ['FSD', 'FINANCE SERVICES DEPARTMENT', 'FSD FINANCE SERVICES DEPARTMENT'],
  ISD: ['ISD', 'INSTITUTIONAL SERVICES DEPARTMENT'],
  TSD: ['TSD', 'TECHNICAL SERVICES DEPARTMENT'],
  IAD: ['IAD', 'INTERNAL AUDIT DEPARTMENT'],
  ADMIN: ['ADMIN', 'ADMINISTRATIVE DEPARTMENT'],
  ESD: ['ESD', 'ENGINEERING SERVICES DEPARTMENT'],
  HRAD: ['HRAD'],
  ITS: ['ITS'],
  IT: ['IT'],
  BILLING: ['BILLING'],
};

const areaAliases = {
  CATBALOGAN: ['CATBALOGAN', 'CATBALOGAN SUB'],
  BASEY: ['BASEY'],
  VILLAREAL: ['VILLAREAL'],
};

const searchEmployees = async ({
  query = '',
  department = '',
  approversOnly = false,
  page = 1,
  limit = 30,
} = {}) => {
  const where = ['usercode IS NOT NULL'];
  const params = [];
  const cleanedQuery = String(query || '').trim();
  const cleanedDepartment = String(department || '').trim();

  if (approversOnly) {
    where.push(`COALESCE(privilage, '') REGEXP '(^|[^0-9])(5|6|7|8|9|10)([^0-9]|$)'`);
  }

  if (cleanedQuery) {
    const like = `%${cleanedQuery}%`;
    where.push('(usercode LIKE ? OR name LIKE ?)');
    params.push(like, like);
  }

  if (cleanedDepartment) {
    const key = cleanedDepartment.toUpperCase();
    const field = areaAliases[key] ? 'area' : 'department';
    const terms = areaAliases[key] || departmentAliases[key] || [cleanedDepartment];
    where.push(`(${terms.map(() => `COALESCE(${field}, '') LIKE ?`).join(' OR ')})`);
    params.push(...terms.map((term) => `%${term}%`));
  }

  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 30));
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countRow = await db.queryOne(`SELECT COUNT(*) AS total FROM usertb ${whereSql}`, params);
  const totalItems = Number.parseInt(countRow?.total, 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeLimit));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safeLimit;
  const items = await db.queryAll(
    `SELECT Id, usercode, name, position, department, area, profile_photo_url,
            profile_photo_updated_at,
            CASE WHEN profile_photo_blob IS NULL OR OCTET_LENGTH(profile_photo_blob) = 0 THEN 0 ELSE 1 END AS has_profile_photo_blob
     FROM usertb
     ${whereSql}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    items: items.map((item) => ({
      Id: Number.parseInt(item.Id, 10) || 0,
      usercode: item.usercode || '',
      name: item.name || '',
      position: item.position || '',
      department: item.department || '',
      area: item.area || '',
      profile_photo_url: profilePhotoUrl(item),
    })),
    page: safePage,
    total_pages: totalPages,
    total_items: totalItems,
    limit: safeLimit,
  };
};

const getProfilePhoto = async (userId) => {
  return db.queryOne(
    `SELECT Id, profile_photo_blob, profile_photo_mime, profile_photo_url, profile_photo_updated_at
     FROM usertb
     WHERE Id = ?
     LIMIT 1`,
    [userId]
  );
};

const createLoginToken = (user) => {
  const serialized = serializeUser(user);
  // HUWAG BAGUHIN: Stateless token ito para hindi ma-log out ang lahat kapag nag-restart ang PM2.
  return generateToken(serialized);
};

module.exports = {
  ensureUserTableSchema,
  isPasswordValid,
  serializeUser,
  getUserByUsername,
  getUserById,
  getUserByUsercode,
  checkUsernameExists,
  updateUserPassword,
  updateUserProfilePhoto,
  updateUserContactInfo,
  registerUser,
  isRegistrationPending,
  listPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  searchEmployees,
  getProfilePhoto,
  createLoginToken,
};
