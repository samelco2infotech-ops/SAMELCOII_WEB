/**
 * Purpose: Controls dashboard module assignments and the current user's allowed menu keys.
 * EDIT GUIDE: Add new dashboard modules to MODULES; keep the frontend title-to-key mapping aligned.
 * HUWAG BAGUHIN: Privilege 10 must retain every module key so full-access accounts are never click-blocked.
 * Tagalog: Ang privilege 10 ay awtomatikong may access sa lahat ng dashboard modules.
 */
const assert = require('assert');
const express = require('express');
const db = require('../config/database');
const {
  successResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
} = require('../utils/response');

const router = express.Router();

const DEFAULT_MODULE_KEYS = Object.freeze(['employees', 'fuel', 'messenger']);
const MODULES = Object.freeze([
  { key: 'employees', label: 'Employees', group: 'Default', default: true },
  { key: 'fuel', label: 'Fuel', group: 'Default', default: true },
  { key: 'messenger', label: 'Messenger', group: 'Default', default: true },
  { key: 'warehouse', label: 'Warehouse', group: 'Warehouse' },
  { key: 'dtr', label: 'DTR', group: 'HRAD' },
  { key: 'leave', label: 'Leave', group: 'HRAD' },
  { key: 'travel', label: 'Travel', group: 'HRAD' },
  { key: 'epass', label: 'Epass', group: 'HRAD' },
  { key: 'holiday', label: 'Holiday', group: 'HRAD' },
  { key: 'overtime', label: 'Overtime', group: 'HRAD' },
  { key: 'forms', label: 'Forms', group: 'HRAD' },
  { key: 'membership', label: 'Membership', group: 'ISD' },
  { key: 'new-connections', label: 'New Connections', group: 'ISD' },
  { key: 'reconnections', label: 'Reconnections', group: 'ISD' },
  { key: 'change-meters', label: 'Change Meters', group: 'ISD' },
  { key: 'complaints', label: 'Complaints', group: 'ISD' },
  { key: 'soa', label: 'SOA', group: 'Reports' },
  { key: 'billing', label: 'Billing', group: 'Reports' },
  { key: 'accountability', label: 'Accountability', group: 'IT Equipment' },
  { key: 'turn-over', label: 'Turn over', group: 'IT Equipment' },
  { key: 'job-order', label: 'Job order', group: 'IT Equipment' },
  { key: 'inventory', label: 'Inventory', group: 'IT Equipment' },
  { key: 'status-report', label: 'Status Report', group: 'IT Equipment' },
  { key: 'mobile-approvals', label: 'Mobile Approvals', group: 'Special Features' },
  { key: 'signatory', label: 'Signatory', group: 'Special Features' },
  { key: 'print-form', label: 'Print Form', group: 'Special Features' },
  { key: 'menus', label: 'MENUS', group: 'Special Features', adminOnly: true },
]);
const MODULE_KEYS = new Set(MODULES.map((item) => item.key));
const ASSIGNABLE_KEYS = new Set(MODULES.filter((item) => !item.default && !item.adminOnly).map((item) => item.key));

let schemaPromise;

const ensureSchema = () => {
  if (!schemaPromise) {
    schemaPromise = db.execute(`
      CREATE TABLE IF NOT EXISTS employee_module_permissions (
        usercode VARCHAR(64) NOT NULL,
        module_key VARCHAR(64) NOT NULL,
        assigned_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usercode, module_key),
        KEY idx_employee_module_permissions_module (module_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
};

const privilegeTokens = (user = {}) => (
  `${user.privilage || ''}-${user.privilagemenu || ''}`.split(/[^0-9]+/).filter(Boolean)
);

const isAdmin = (user) => privilegeTokens(user).includes('10');

// [AUTH] Full-access admins receive the whole catalog; regular staff keep defaults plus explicit assignments.
const allowedModulesForUser = (assigned = [], admin = false) => Array.from(new Set(
  admin ? MODULES.map((item) => item.key) : [...DEFAULT_MODULE_KEYS, ...assigned]
));

const cleanUsercode = (value) => String(value || '').trim().slice(0, 64);

const sanitizeModuleKeys = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((key) => ASSIGNABLE_KEYS.has(key))
));

const assignedModules = async (usercode) => {
  const rows = await db.queryAll(
    'SELECT module_key FROM employee_module_permissions WHERE usercode = ? ORDER BY module_key',
    [usercode]
  );
  return rows.map((row) => String(row.module_key || '')).filter((key) => MODULE_KEYS.has(key));
};

const requireAdmin = (req, res) => {
  if (isAdmin(req.user)) return true;
  forbiddenResponse(res, 'Privilege 10 is required to manage employee menus.');
  return false;
};

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || 'my').trim().toLowerCase();
    await ensureSchema();

    if (action === 'my' && req.method === 'GET') {
      const usercode = cleanUsercode(req.user?.usercode);
      const admin = isAdmin(req.user);
      const assigned = usercode ? await assignedModules(usercode) : [];
      const allowed = allowedModulesForUser(assigned, admin);
      return successResponse(res, {
        is_admin: admin,
        default_modules: DEFAULT_MODULE_KEYS,
        assigned_modules: assigned,
        allowed_modules: allowed,
      });
    }

    if (!requireAdmin(req, res)) return undefined;

    if (action === 'catalog' && req.method === 'GET') {
      return successResponse(res, { modules: MODULES });
    }

    if (action === 'employees' && req.method === 'GET') {
      const search = String(req.query.q || '').trim().slice(0, 100);
      const like = `%${search}%`;
      const employees = await db.queryAll(
        `SELECT usercode, name, position, department, privilage
         FROM usertb
         WHERE usercode IS NOT NULL
           AND (? = '' OR usercode LIKE ? OR name LIKE ? OR department LIKE ?)
         ORDER BY name, usercode
         LIMIT 100`,
        [search, like, like, like]
      );
      return successResponse(res, { employees });
    }

    if (action === 'get' && req.method === 'GET') {
      const usercode = cleanUsercode(req.query.usercode);
      if (!usercode) return badRequestResponse(res, 'Employee is required.');
      const employee = await db.queryOne(
        'SELECT usercode, name, position, department, privilage FROM usertb WHERE usercode = ? LIMIT 1',
        [usercode]
      );
      if (!employee) return notFoundResponse(res, 'Employee was not found.');
      return successResponse(res, {
        employee,
        default_modules: DEFAULT_MODULE_KEYS,
        assigned_modules: await assignedModules(usercode),
      });
    }

    if (action === 'save' && req.method === 'POST') {
      const usercode = cleanUsercode(req.body?.usercode);
      if (!usercode) return badRequestResponse(res, 'Employee is required.');
      const employee = await db.queryOne('SELECT usercode FROM usertb WHERE usercode = ? LIMIT 1', [usercode]);
      if (!employee) return notFoundResponse(res, 'Employee was not found.');

      const modules = sanitizeModuleKeys(req.body?.modules);
      const assignedBy = cleanUsercode(req.user?.usercode || req.user?.username || 'ADMIN') || 'ADMIN';
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('DELETE FROM employee_module_permissions WHERE usercode = ?', [usercode]);
        if (modules.length) {
          const placeholders = modules.map(() => '(?, ?, ?)').join(', ');
          const params = modules.flatMap((moduleKey) => [usercode, moduleKey, assignedBy]);
          await connection.execute(
            `INSERT INTO employee_module_permissions (usercode, module_key, assigned_by) VALUES ${placeholders}`,
            params
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      return successResponse(res, {
        message: 'Employee menu assignments saved.',
        usercode,
        assigned_modules: modules,
      });
    }

    return badRequestResponse(res, 'Invalid action or request method.');
  } catch (error) {
    next(error);
  }
});

if (require.main === module) {
  assert.deepStrictEqual(
    sanitizeModuleKeys(['billing', 'BILLING', 'employees', 'menus', 'unknown', 'dtr']),
    ['billing', 'dtr']
  );
  assert.strictEqual(isAdmin({ privilage: '2-6-10' }), true);
  assert.strictEqual(isAdmin({ privilage: '6' }), false);
  assert.deepStrictEqual(allowedModulesForUser([], true), MODULES.map((item) => item.key));
  assert.deepStrictEqual(
    allowedModulesForUser(['billing'], false),
    [...DEFAULT_MODULE_KEYS, 'billing']
  );
  console.log('OK - menu permission validation self-check passed');
}

router.ensureSchema = ensureSchema;
module.exports = router;
