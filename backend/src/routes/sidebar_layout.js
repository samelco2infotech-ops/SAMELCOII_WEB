const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const { successResponse, badRequestResponse } = require('../utils/response');

const DATA_FILE = path.resolve(__dirname, '../data/sidebar-layout.json');

const readLayout = async () => {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { layout: null, updated_at: null };
  }
};

const writeLayout = async (payload) => {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
};

router.all('/', async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();
    if (!action) {
      return next();
    }

    if (action === 'get') {
      return successResponse(res, { data: await readLayout() });
    }

    if (action === 'save') {
      const layout = req.body?.layout ?? req.body ?? null;
      const payload = { layout, updated_at: new Date().toISOString() };
      await writeLayout(payload);
      return successResponse(res, { message: 'Sidebar layout saved.', data: payload });
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
