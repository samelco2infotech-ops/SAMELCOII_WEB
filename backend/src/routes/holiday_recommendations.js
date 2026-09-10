/**
 * Purpose: Admin-curated "quick add" holiday name templates (name/type/coverage, no date) shown
 * as clickable chips on the Holiday Calendar page. File-backed like sidebar_layout.js — not worth
 * a database table for a short, rarely-written list.
 * EDIT GUIDE: Reuses holidayService.canManage for the same privilege gate as holidays themselves.
 */
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { canManage } = require('../services/holidayService');
const { successResponse, badRequestResponse, forbiddenResponse } = require('../utils/response');

const router = express.Router();
const DATA_FILE = path.resolve(__dirname, '../data/holiday-recommendations.json');
const HOLIDAY_TYPES = ['Regular', 'Special Non-Working'];
const DAY_PORTIONS = ['WHOLE', 'AM', 'PM'];
const text = (value) => String(value ?? '').trim();

const readData = async () => {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { templates: Array.isArray(parsed.templates) ? parsed.templates : [], next_id: Number(parsed.next_id) || 1 };
  } catch {
    return { templates: [], next_id: 1 };
  }
};

const writeData = async (data) => {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

router.all('/', async (req, res, next) => {
  try {
    const action = text(req.query.action || req.body?.action).toLowerCase();
    const input = req.method === 'GET' ? req.query : { ...req.query, ...req.body };

    if (action === 'list') {
      if (req.method !== 'GET') return badRequestResponse(res, 'Method not allowed.');
      const { templates } = await readData();
      return successResponse(res, { templates });
    }

    if (action === 'add') {
      if (req.method !== 'POST') return badRequestResponse(res, 'Method not allowed.');
      if (!canManage(req.user)) return forbiddenResponse(res, 'You do not have permission to manage recommended holidays.');
      const name = text(input.name);
      const holidayType = text(input.holiday_type);
      const dayPortion = input.day_portion ? text(input.day_portion).toUpperCase() : 'WHOLE';
      if (!name) return badRequestResponse(res, 'Template name is required.');
      if (!HOLIDAY_TYPES.includes(holidayType)) return badRequestResponse(res, `holiday_type must be one of: ${HOLIDAY_TYPES.join(', ')}.`);
      if (!DAY_PORTIONS.includes(dayPortion)) return badRequestResponse(res, `day_portion must be one of: ${DAY_PORTIONS.join(', ')}.`);
      const data = await readData();
      const template = { id: data.next_id, name, holiday_type: holidayType, day_portion: dayPortion };
      data.templates.unshift(template); // newest-added shows first
      data.next_id += 1;
      await writeData(data);
      return successResponse(res, { message: 'Recommended holiday added.', template }, 201);
    }

    if (action === 'delete') {
      if (req.method !== 'POST') return badRequestResponse(res, 'Method not allowed.');
      if (!canManage(req.user)) return forbiddenResponse(res, 'You do not have permission to manage recommended holidays.');
      const id = Number(input.id);
      if (!Number.isInteger(id) || id <= 0) return badRequestResponse(res, 'Invalid template id.');
      const data = await readData();
      const before = data.templates.length;
      data.templates = data.templates.filter((item) => item.id !== id);
      if (data.templates.length === before) return badRequestResponse(res, 'Template not found.');
      await writeData(data);
      return successResponse(res, { message: 'Recommended holiday removed.', id });
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
