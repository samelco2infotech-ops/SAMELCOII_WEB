/**
 * Purpose: CRUD over the existing `philippine_holidays` table (id, holiday_name, holiday_date,
 * holiday_type, atc, day_portion) — already consumed read-only by dtrService/overtime/userHistory.
 * EDIT GUIDE: day_portion is a label only (WHOLE/AM/PM) — it does not affect DTR/Overtime, which
 * still treat any row's holiday_date as a full holiday. Wiring half-day into attendance math is a
 * separate, deliberately out-of-scope change.
 */
const db = require('../config/database');

const HOLIDAY_TYPES = ['Regular', 'Special Non-Working', 'Office Event'];
const DAY_PORTIONS = ['WHOLE', 'AM', 'PM'];
const text = (value) => String(value ?? '').trim();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// ponytail: privilege check copies the "token 6-10 can manage" convention already used by
// travelService.userCanManageApprovals / leaveService.canApprove — no new permission scheme.
const canManage = (user) => `${user?.privilage ?? ''},${user?.privilagemenu ?? ''}`
  .split(/[^0-9]+/)
  .filter(Boolean)
  .some((token) => Number(token) >= 6 && Number(token) <= 10);

const validDate = (value) => {
  const date = text(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
  if (!date) return '';
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : '';
};

const list = async (input = {}) => {
  const year = Number(input.year);
  const from = validDate(input.from);
  const to = validDate(input.to);
  const where = [];
  const params = [];
  if (Number.isInteger(year) && year > 0) {
    where.push('YEAR(holiday_date) = ?');
    params.push(year);
  }
  if (from) { where.push('holiday_date >= ?'); params.push(from); }
  if (to) { where.push('holiday_date <= ?'); params.push(to); }
  // DATE_FORMAT forces a plain 'YYYY-MM-DD' string out of MySQL — without it, mysql2 hands back a
  // JS Date object that Express serializes in UTC, which rolls the date back a day on this server
  // (Asia/Singapore, UTC+8): stored 2026-01-01 becomes "2025-12-31T16:00:00.000Z" over the wire.
  const sql = `SELECT id, holiday_name, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, holiday_type, atc, day_portion FROM philippine_holidays
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY holiday_date ASC`;
  const rows = await db.queryAll(sql, params);
  return { items: rows };
};

const validatePayload = (input) => {
  const holidayName = text(input.holiday_name);
  const holidayDate = validDate(input.holiday_date);
  const holidayType = text(input.holiday_type);
  const dayPortion = input.day_portion === undefined || input.day_portion === '' ? 'WHOLE' : text(input.day_portion).toUpperCase();
  const atc = input.atc === undefined || input.atc === '' ? 1 : Number(input.atc);
  if (!holidayName) fail(400, 'Holiday name is required.');
  if (!holidayDate) fail(400, 'A valid holiday date (YYYY-MM-DD) is required.');
  if (!HOLIDAY_TYPES.includes(holidayType)) fail(400, `Holiday type must be one of: ${HOLIDAY_TYPES.join(', ')}.`);
  if (!DAY_PORTIONS.includes(dayPortion)) fail(400, `day_portion must be one of: ${DAY_PORTIONS.join(', ')}.`);
  if (!Number.isInteger(atc) || (atc !== 0 && atc !== 1)) fail(400, 'atc must be 0 or 1.');
  return { holidayName, holidayDate, holidayType, dayPortion, atc };
};

const add = async (user, input) => {
  if (!canManage(user)) fail(403, 'You do not have permission to manage holidays.');
  const { holidayName, holidayDate, holidayType, dayPortion, atc } = validatePayload(input);
  const result = await db.execute(
    'INSERT INTO philippine_holidays (holiday_name, holiday_date, holiday_type, atc, day_portion) VALUES (?, ?, ?, ?, ?)',
    [holidayName, holidayDate, holidayType, atc, dayPortion]
  );
  return { id: result.insertId };
};

const update = async (user, input) => {
  if (!canManage(user)) fail(403, 'You do not have permission to manage holidays.');
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Invalid holiday id.');
  const { holidayName, holidayDate, holidayType, dayPortion, atc } = validatePayload(input);
  const result = await db.execute(
    'UPDATE philippine_holidays SET holiday_name = ?, holiday_date = ?, holiday_type = ?, atc = ?, day_portion = ? WHERE id = ?',
    [holidayName, holidayDate, holidayType, atc, dayPortion, id]
  );
  if (!result.affectedRows) fail(404, 'Holiday not found.');
  return { id };
};

const remove = async (user, input) => {
  if (!canManage(user)) fail(403, 'You do not have permission to manage holidays.');
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Invalid holiday id.');
  const result = await db.execute('DELETE FROM philippine_holidays WHERE id = ?', [id]);
  if (!result.affectedRows) fail(404, 'Holiday not found.');
  return { id };
};

module.exports = { list, add, update, remove, canManage };
