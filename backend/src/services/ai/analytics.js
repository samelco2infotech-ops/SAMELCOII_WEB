/**
 * SAM analytics — Node port ng:
 *   aiFuelAnalyticsReply, aiDtrAnalyticsReply, aiEpassAnalyticsReply, aiLeaveAnalyticsReply,
 *   aiHistoryWants, aiRequireAdminAnalytics, aiAnalyticsDateRange.
 *
 * Ito ang sumasagot sa mga tanong na "sinong department ang pinakamataas ang fuel?",
 * "sino ang pinakamadalas ma-late?" — buod, hindi listahan.
 *
 * PRIVILEGE: 6-10 lang ang pinapayagan; kung hindi, ibinabalik ang parehong "Restricted:"
 * na teksto ng PHP (kaya huwag baguhin ang wording — nakikita ito ng user).
 *
 * Bawat function ay nagbabalik ng string (sagot) o null (hindi ito ang tamang handler) —
 * pareho sa PHP, para masunod ng caller ang parehong pagkakasunod-sunod.
 */

const db = require('../../config/database');
const { hasFullDataAccess } = require('./guards');
const { reportDateRange } = require('./reportRouter');

/** aiHistoryWants(): totoo kung nasa mensahe ang alinman sa keywords. */
function wants(message, keywords) {
  const lower = String(message || '').toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/** Ang PHP (float)/(int) cast: "30.00" -> 30, "" -> 0. */
const f = (v) => Number(v || 0);
const i = (v) => parseInt(v || 0, 10) || 0;

/** aiRequireAdminAnalytics(): null kung pwede; kung hindi, ang mensaheng "Restricted:". */
function requireAdmin(user, label) {
  if (hasFullDataAccess(user)) return null;
  return `**Restricted:** ${label} analytics for all employees is available only to privilege 6 to 10 users.\nAction: I can check your own records only.`;
}

/** Petsa para sa fuel: may sariling shortcut ang "last month/today/yesterday" bago mag-fallback. */
function fuelDateRange(message) {
  const lower = String(message || '').toLowerCase();
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const now = new Date();
  if (lower.includes('last month')) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return [fmt(first), fmt(last)];
  }
  if (lower.includes('today')) {
    return [fmt(now), fmt(now)];
  }
  if (lower.includes('yesterday')) {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return [fmt(y), fmt(y)];
  }
  return reportDateRange(message);
}

async function fuelAnalyticsReply(user, message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.includes('fuel')) return null;
  if (!wants(lower, ['highest', 'high', 'most', 'top', 'consume', 'consumed', 'requested', 'compute', 'department'])) return null;

  if (!hasFullDataAccess(user)) {
    return '**Restricted:** Fuel analytics for all departments is available only to privilege 6 to 10 users.\nAction: I can check your own fuel records only.';
  }

  const [from, to] = fuelDateRange(message);
  let rows;
  try {
    rows = await db.queryAll(
      `SELECT COALESCE(NULLIF(u.department, ""), "Unassigned") AS department,
              COUNT(*) AS request_count,
              SUM(COALESCE(fh.PresRequest, 0)) AS total_liters,
              SUM(CASE WHEN fh.status = 1 THEN COALESCE(fh.PresRequest, 0) ELSE 0 END) AS approved_liters
       FROM \`fuelallocation_history\` fh
       LEFT JOIN \`usertb\` u
          ON u.usercode = COALESCE(NULLIF(fh.accountused, ""), fh.usercode)
       WHERE fh.status <> 4
         AND DATE(fh.PresRequestDate) BETWEEN ? AND ?
       GROUP BY COALESCE(NULLIF(u.department, ""), "Unassigned")
       HAVING total_liters > 0
       ORDER BY total_liters DESC, request_count DESC
       LIMIT 5`,
      [from, to]
    );
  } catch {
    return '**Fuel analytics:** I could not compute this because the fuel records table is unavailable.';
  }

  if (!rows.length) return `**Fuel analytics:** No fuel requests found from ${from} to ${to}.`;

  const top = rows[0];
  const lines = [
    `**Fuel analytics:** Highest requested fuel department from ${from} to ${to}`,
    `Top: ${top.department} - ${f(top.total_liters)}L requested across ${i(top.request_count)} request(s).`,
  ];
  if (f(top.approved_liters) > 0) {
    lines.push(`Approved liters in top department: ${f(top.approved_liters)}L.`);
  }
  lines.push('');
  lines.push('Top departments:');
  rows.forEach((row, idx) => {
    lines.push(`${idx + 1}. ${row.department} - ${f(row.total_liters)}L | ${i(row.request_count)} request(s)`);
  });
  return lines.join('\n');
}

async function dtrAnalyticsReply(user, message) {
  const lower = String(message || '').toLowerCase();
  if (!wants(lower, ['dtr', 'late', 'attendance', 'absent', 'missing punch'])) return null;
  if (!wants(lower, ['highest', 'most', 'top', 'who', 'department', 'employee', 'count', 'summary', 'compute'])) return null;

  const restricted = requireAdmin(user, 'DTR');
  if (restricted !== null) return restricted;

  const [from, to] = reportDateRange(message);
  // "sino/employee" = per-empleyado; kung wala, per-department.
  const byEmployee = wants(lower, ['employee', 'who']);
  let rows;
  try {
    const inner =
      `SELECT USERID, DATE(CHECKTIME) AS work_date, MIN(TIME(CHECKTIME)) AS first_in
       FROM \`checkinout\`
       WHERE DATE(CHECKTIME) BETWEEN ? AND ?
       GROUP BY USERID, DATE(CHECKTIME)
       HAVING first_in > "08:00:00"`;
    rows = byEmployee
      ? await db.queryAll(
        `SELECT u.name AS label, u.department AS department, COUNT(*) AS late_days
         FROM ( ${inner} ) d
         INNER JOIN \`usertb\` u ON CAST(d.USERID AS CHAR) = TRIM(u.bioUID)
         GROUP BY u.name, u.department
         ORDER BY late_days DESC, u.name ASC
         LIMIT 5`, [from, to])
      : await db.queryAll(
        `SELECT COALESCE(NULLIF(u.department, ""), "Unassigned") AS label, COUNT(*) AS late_days
         FROM ( ${inner} ) d
         INNER JOIN \`usertb\` u ON CAST(d.USERID AS CHAR) = TRIM(u.bioUID)
         GROUP BY COALESCE(NULLIF(u.department, ""), "Unassigned")
         ORDER BY late_days DESC, label ASC
         LIMIT 5`, [from, to]);
  } catch {
    return '**DTR analytics:** I could not compute this because DTR records are unavailable.';
  }

  if (!rows.length) return `**DTR analytics:** No late DTR records found from ${from} to ${to}.`;

  const subject = byEmployee ? 'employees with most late days' : 'departments with most late days';
  const lines = [`**DTR analytics:** Top ${subject} from ${from} to ${to}`];
  rows.forEach((row, idx) => {
    const extra = byEmployee && row.department ? ` | ${row.department}` : '';
    lines.push(`${idx + 1}. ${row.label} - ${i(row.late_days)} late day(s)${extra}`);
  });
  return lines.join('\n');
}

async function epassAnalyticsReply(user, message) {
  const lower = String(message || '').toLowerCase();
  if (!wants(lower, ['epass', 'e-pass', 'travel'])) return null;
  if (!wants(lower, ['pending', 'highest', 'most', 'top', 'department', 'summary', 'compute'])) return null;

  const restricted = requireAdmin(user, 'EPASS');
  if (restricted !== null) return restricted;

  const [from, to] = reportDateRange(message);
  let rows;
  try {
    rows = await db.queryAll(
      `SELECT COALESCE(NULLIF(department, ""), "Unassigned") AS department,
              COUNT(DISTINCT epassnumber) AS request_count,
              SUM(CASE WHEN status = 1 OR LOWER(CAST(status AS CHAR)) LIKE "%pending%" THEN 1 ELSE 0 END) AS pending_count
       FROM \`epasstb\`
       WHERE epassnumber IS NOT NULL
         AND TRIM(epassnumber) <> ""
         AND DATE(\`date\`) BETWEEN ? AND ?
       GROUP BY COALESCE(NULLIF(department, ""), "Unassigned")
       ORDER BY pending_count DESC, request_count DESC
       LIMIT 5`,
      [from, to]
    );
  } catch {
    return '**EPASS analytics:** I could not compute this because EPASS records are unavailable.';
  }

  if (!rows.length) return `**EPASS analytics:** No EPASS records found from ${from} to ${to}.`;

  const lines = [`**EPASS analytics:** Top departments by pending EPASS from ${from} to ${to}`];
  rows.forEach((row, idx) => {
    lines.push(`${idx + 1}. ${row.department} - ${i(row.pending_count)} pending | ${i(row.request_count)} total`);
  });
  return lines.join('\n');
}

async function leaveAnalyticsReply(user, message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.includes('leave')) return null;
  if (!wants(lower, ['pending', 'highest', 'most', 'top', 'department', 'summary', 'compute'])) return null;

  const restricted = requireAdmin(user, 'Leave');
  if (restricted !== null) return restricted;

  const [from, to] = reportDateRange(message);
  let rows;
  try {
    rows = await db.queryAll(
      `SELECT COALESCE(NULLIF(division, ""), "Unassigned") AS department,
              COUNT(*) AS leave_count,
              SUM(COALESCE(numofdays, 0)) AS total_days,
              SUM(CASE WHEN Status = "1" OR LOWER(CAST(Status AS CHAR)) LIKE "%pending%" THEN 1 ELSE 0 END) AS pending_count
       FROM \`tbleave\`
       WHERE COALESCE(datecreated, datafrom, dateto) BETWEEN ? AND ?
       GROUP BY COALESCE(NULLIF(division, ""), "Unassigned")
       ORDER BY total_days DESC, leave_count DESC
       LIMIT 5`,
      [from, to]
    );
  } catch {
    return '**Leave analytics:** I could not compute this because leave records are unavailable.';
  }

  if (!rows.length) return `**Leave analytics:** No leave records found from ${from} to ${to}.`;

  const lines = [`**Leave analytics:** Top departments by leave days from ${from} to ${to}`];
  rows.forEach((row, idx) => {
    lines.push(`${idx + 1}. ${row.department} - ${f(row.total_days)} day(s) | ${i(row.leave_count)} request(s) | ${i(row.pending_count)} pending`);
  });
  return lines.join('\n');
}

/**
 * Anomaly detection — flags individual fuel requests well above normal, instead
 * of just ranking departments. Ported from the PHP-era roadmap's anomaly
 * detectors (never carried over to the Node engine before now). Only fuel is
 * done; DTR-lateness/EPASS-backlog/warehouse-outflow anomalies are the same
 * shape and can follow the same pattern later.
 */
async function fuelAnomalyReply(user, message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.includes('fuel')) return null;
  if (!wants(lower, ['anomaly', 'anomalies', 'unusual', 'suspicious', 'outlier', 'flag', 'flagged', 'warning', 'risk'])) return null;

  const restricted = requireAdmin(user, 'Fuel anomaly');
  if (restricted) return restricted;

  const [from, to] = fuelDateRange(message);
  let avgRow;
  let rows;
  try {
    avgRow = await db.queryOne(
      `SELECT AVG(COALESCE(PresRequest, 0)) AS avg_liters
       FROM \`fuelallocation_history\`
       WHERE status <> 4 AND DATE(PresRequestDate) BETWEEN ? AND ?`,
      [from, to]
    );
    const avg = f(avgRow?.avg_liters);
    // ponytail: fixed 2x-average threshold with a 50L floor so a handful of
    // requests can't make "average" trivially low and flag everything as an
    // outlier. Upgrade path: real stddev-based scoring once there's enough
    // volume to make that meaningfully different from this simpler rule.
    const threshold = Math.max(avg * 2, 50);
    rows = await db.queryAll(
      `SELECT fh.PresRequest AS liters, fh.PresRequestDate AS request_date,
              COALESCE(u.name, fh.usercode) AS employee,
              COALESCE(NULLIF(u.department, ''), 'Unassigned') AS department
       FROM \`fuelallocation_history\` fh
       LEFT JOIN \`usertb\` u ON u.usercode = COALESCE(NULLIF(fh.accountused, ''), fh.usercode)
       WHERE fh.status <> 4 AND DATE(fh.PresRequestDate) BETWEEN ? AND ?
         AND COALESCE(fh.PresRequest, 0) >= ?
       ORDER BY fh.PresRequest DESC
       LIMIT 10`,
      [from, to, threshold]
    );
  } catch {
    return '**Fuel anomaly check:** I could not compute this because the fuel records table is unavailable.';
  }

  const avgLiters = f(avgRow?.avg_liters).toFixed(1);
  if (!rows.length) {
    return `**Fuel anomaly check:** No unusually large fuel requests found from ${from} to ${to} (average request: ${avgLiters}L).`;
  }

  const lines = [
    `**Fuel anomaly check:** ${rows.length} request(s) well above the ${avgLiters}L average from ${from} to ${to}`,
    '',
  ];
  // Local-date parts, not toISOString() — a DB DATE column read back as a JS
  // Date can shift a day under UTC conversion; getFullYear/Month/Date stay local.
  const isoDate = (v) => {
    if (!(v instanceof Date)) return String(v).slice(0, 10);
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  };
  rows.forEach((row, idx) => {
    lines.push(`${idx + 1}. ${row.employee} (${row.department}) — ${f(row.liters)}L on ${isoDate(row.request_date)}`);
  });
  lines.push('');
  lines.push('Action: Review these requests before approval — the amount is significantly higher than typical.');
  return lines.join('\n');
}

/** Sinusubukan ang apat ayon sa pagkakasunod ng PHP; una ang tumugon, iyon ang sagot. */
async function analyticsReply(user, message) {
  for (const fn of [fuelAnalyticsReply, fuelAnomalyReply, dtrAnalyticsReply, epassAnalyticsReply, leaveAnalyticsReply]) {
    const reply = await fn(user, message);
    if (reply !== null && reply !== undefined) return reply;
  }
  return null;
}

module.exports = {
  fuelAnalyticsReply, fuelAnomalyReply, dtrAnalyticsReply, epassAnalyticsReply, leaveAnalyticsReply,
  analyticsReply, wants, requireAdmin,
};
