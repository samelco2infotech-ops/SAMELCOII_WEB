/**
 * SAM Server Status — read-only ops view for admins: is the pm2-managed SAM
 * backend actually running, and can it reach Ollama? No new dependency — pm2
 * and Ollama are both already installed; this just surfaces `pm2 jlist` and a
 * quick `/api/tags` ping as JSON for the dashboard page to render.
 *
 * Privilege 6-10 only (department head/manager/admin) — process info and the
 * Ollama host address are internal ops detail, not for every employee.
 */
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const db = require('../config/database');
const config = require('../config/env');
const { hasFullDataAccess } = require('../services/ai/guards');

function run(cmd, timeoutMs = 8000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

/** Pure — testable without a real pm2 install. Returns [] on empty/malformed input, never throws. */
function parsePm2Output(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw).map((p) => ({
      name: p.name,
      status: p.pm2_env?.status || 'unknown',
      restarts: p.pm2_env?.restart_time ?? 0,
      uptimeMs: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
      memoryMb: p.monit?.memory ? Math.round(p.monit.memory / 1024 / 1024) : 0,
      cpuPercent: p.monit?.cpu ?? 0,
    }));
  } catch {
    return [];
  }
}

router.get('/', async (req, res) => {
  try {
    const me = await db.queryOne(
      'SELECT privilage FROM usertb WHERE Id = ? LIMIT 1',
      [req.user?.id]
    );
    if (!hasFullDataAccess(me || {})) {
      return res.status(403).json({ ok: false, message: 'Privilege 6-10 required.' });
    }

    const [pm2Raw, ollamaOk] = await Promise.all([
      run('pm2 jlist'),
      fetch(`${String(config.ai.ollama.baseUrl).replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) })
        .then((r) => r.ok).catch(() => false),
    ]);

    const processes = parsePm2Output(pm2Raw);

    return res.json({
      ok: true,
      pm2Available: pm2Raw !== null,
      processes,
      ollamaReachable: ollamaOk,
      ollamaUrl: config.ai.ollama.baseUrl,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

router._selfcheck = { parsePm2Output };
module.exports = router;
