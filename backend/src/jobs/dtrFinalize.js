/**
 * Purpose: Daily automatic dtr_final snapshot job — freezes yesterday's DTR and self-heals recent gaps.
 * EDIT GUIDE: Only call dtrService.finalizeRange/finalizeDay here.
 * HUWAG BAGUHIN: dtrService.insertFinalRows already refuses to touch a row once its payroll period
 * is LOCKED/APPROVED/RELEASED — never bypass that check from here to "fix" a row faster.
 * Tagalog: Tuwing gabi, sinusubukang kumpletuhin muli ang mga araw na kulang pa rin ang datos
 * (hal. dahil huli mag-sync ang biometric device sa field), hangga't hindi pa naisasara ang payroll.
 */
const dtrService = require('../services/dtrService');

const HOUR_MS = 60 * 60 * 1000;
// ponytail: fixed 1:00 AM local server time, no configurable schedule. Upgrade path: env var
// (e.g. DTR_FINALIZE_HOUR) if a second run time or per-deployment schedule is ever needed.
const RUN_HOUR = 1;
// A remote-site device (e.g. Paranas) can sync its punches to `checkinout` well over a week after
// the punch itself — the old 7-day window was well inside that lag, so days kept freezing blank
// before their real punches ever arrived, with no later run wide enough to pick them up. Widened to
// cover a full payroll cutoff (~35 days) since insertFinalRows only ever upgrades an incomplete,
// not-yet-payroll-locked row now — rescanning the same range every night is safe, not repeat-freezing.
const CATCHUP_DAYS = 35;

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const addDaysLocal = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const runDailyFinalize = async () => {
  const yesterday = addDaysLocal(todayLocal(), -1);
  const from = addDaysLocal(yesterday, -(CATCHUP_DAYS - 1));
  const startedAt = Date.now();
  console.log(`[dtrFinalize] run starting for ${from}..${yesterday}`);
  try {
    const result = await dtrService.finalizeRange(from, yesterday);
    console.log(`[dtrFinalize] run finished in ${Date.now() - startedAt}ms — `
      + `employees=${result.employees} rows_inserted=${result.rows_inserted} rows_upgraded=${result.rows_upgraded} `
      + `range=${result.date_from}..${result.date_to}`);
  } catch (error) {
    console.error('[dtrFinalize] run FAILED:', error.message);
  }
};

const msUntilNextRun = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(RUN_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
};

const start = () => {
  const delay = msUntilNextRun();
  console.log(`[dtrFinalize] scheduled — first run in ${Math.round(delay / 60000)}min (${RUN_HOUR}:00 local), then every 24h`);
  setTimeout(() => {
    runDailyFinalize();
    setInterval(runDailyFinalize, 24 * HOUR_MS);
  }, delay);
};

module.exports = { start, runDailyFinalize };
