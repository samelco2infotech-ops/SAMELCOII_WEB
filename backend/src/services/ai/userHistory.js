/**
 * SAM user context — Node port ng history/profile na bahagi ng api/ai_history.php:
 *   aiProfileSummary, aiFuelHistory, aiDtrHistory, aiEpassHistory, aiLeaveHistory,
 *   aiRowsToLines, aiHistoryStatusLabel, aiCleanText.
 *
 * Ito ang ipinapakain kay SAM bilang "ano ang alam ko tungkol sa taong kausap ko" bago siya
 * sumagot. Kaya dapat PAREHO ang teksto ng linya sa PHP — kung mag-iiba ang wording, iba rin
 * ang sagot ng LLM kahit pareho ang datos.
 */

const db = require('../../config/database');

/**
 * aiCleanText(): iisang linya, pinutol sa max.
 * MAHALAGA ang eksaktong asal para tumugma sa PHP:
 *   - blangko/NULL  -> "-"  (hindi "")
 *   - mahaba        -> putol sa (max - 3) + "..."  (tatlong tuldok, hindi "…")
 */
function cleanText(value, max = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return '-';
  return text.length > max ? `${text.slice(0, max - 3).replace(/\s+$/, '')}...` : text;
}

/** Ang PHP ay nagpi-print ng NULL bilang "" — ang JS naman ay "null". Dito pinapantay. */
const s = (v) => (v === null || v === undefined ? '' : String(v));

/** aiHistoryStatusLabel(): 1=pending, 2=approved, 3=rejected, 4=balance seed. */
function statusLabel(status) {
  const v = String(status ?? '');
  if (v === '1') return 'pending';
  if (v === '2') return 'approved';
  if (v === '3') return 'rejected';
  if (Number(status) === 4) return 'balance seed';
  return v !== '' ? v : 'unknown';
}

/** aiRowsToLines(): bawat row ay nagiging "- <text>"; nilalaktawan ang blangko. */
function rowsToLines(rows, formatter) {
  const lines = [];
  for (const row of rows) {
    const line = String(formatter(row) ?? '').trim();
    if (line !== '') lines.push(`- ${line}`);
  }
  return lines;
}

/** Petsa bilang YYYY-MM-DD (local, hindi UTC) o "no date". */
function dateOnly(value, fallback = 'no date') {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Petsa+oras na kapareho ng ibinabalik ng PDO para sa CHECKTIME. */
function dateTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function profileSummary(user) {
  if (!user || !Object.keys(user).length) return ['Profile: no user profile found.'];
  return [
    'Profile:',
    `- Name: ${user.name || user.username || 'User'}`,
    `- Employee No.: ${user.usercode || '-'}`,
    `- Position: ${user.position || '-'}`,
    `- Department: ${user.department || '-'}`,
    `- Area: ${user.area || '-'}`,
    `- Email: ${user.emailadd || '-'}`,
  ];
}

async function fuelHistory(usercode, limit = 3) {
  const code = String(usercode || '').trim();
  if (code === '') return ['Fuel: no employee number found for this account.'];
  try {
    const rows = await db.queryAll(
      `SELECT FARCode, Requested_item, PresRequest, Balance, PresRequestDate, Purpose, PrevTravel, status, unit_id, fuelstation
       FROM \`fuelallocation_history\`
       WHERE status <> 4
         AND (accountused = ? OR usercode = ?)
       ORDER BY PresRequestDate DESC, id DESC
       LIMIT ${clamp(limit, 1, 6)}`,
      [code, code]
    );
    if (!rows.length) return ['Fuel: no saved fuel request history found.'];
    return ['Fuel recent history:', ...rowsToLines(rows, (r) =>
      `${dateOnly(r.PresRequestDate)} | ${statusLabel(r.status).toUpperCase()} | ${s(r.Requested_item)} ${s(r.PresRequest)}L | Balance ${s(r.Balance)}L | ${s(r.unit_id)} | ${cleanText(r.Purpose, 80)}`
    )];
  } catch {
    return ['Fuel: history table is unavailable.'];
  }
}

async function dtrHistory(user, limit = 6) {
  const bioUid = String(user?.bioUID || '').trim();
  if (bioUid === '') return ['DTR: no biometric ID is linked to this profile.'];
  try {
    const rows = await db.queryAll(
      `SELECT CHECKTIME, CHECKTYPE, inout_small, inout_mode, COALESCE(Area, "") AS Area
       FROM \`checkinout\`
       WHERE CAST(USERID AS CHAR) = ?
       ORDER BY CHECKTIME DESC
       LIMIT ${clamp(limit, 1, 10)}`,
      [bioUid]
    );
    if (!rows.length) return ['DTR: no recent biometric punch history found.'];
    return ['DTR recent punches:', ...rowsToLines(rows, (r) => {
      const type = String(r.inout_small || r.CHECKTYPE || r.inout_mode || '').trim();
      return `${dateTime(r.CHECKTIME)} | ${type} | ${s(r.Area)}`;
    })];
  } catch {
    return ['DTR: checkinout table is unavailable.'];
  }
}

async function epassHistory(usercode, limit = 3) {
  const code = String(usercode || '').trim();
  if (code === '') return ['EPASS: no employee number found for this account.'];
  try {
    const rows = await db.queryAll(
      `SELECT epassnumber, MAX(department) AS department, MAX(destination) AS destination,
              MAX(\`date\`) AS request_date, MAX(purpose) AS purpose, MAX(status) AS status,
              GROUP_CONCAT(NULLIF(TRIM(grantedto1), "") ORDER BY Id SEPARATOR ", ") AS granted_to
       FROM \`epasstb\`
       WHERE usercode = ?
         AND epassnumber IS NOT NULL
         AND TRIM(epassnumber) <> ""
       GROUP BY epassnumber
       ORDER BY MAX(Id) DESC
       LIMIT ${clamp(limit, 1, 6)}`,
      [code]
    );
    if (!rows.length) return ['EPASS: no saved EPASS request history found.'];
    return ['EPASS recent history:', ...rowsToLines(rows, (r) =>
      `${dateOnly(r.request_date)} | ${statusLabel(r.status).toUpperCase()} | ${s(r.epassnumber)} | ${s(r.destination)} | ${cleanText(r.purpose, 90)}`
    )];
  } catch {
    return ['EPASS: history table is unavailable.'];
  }
}

async function leaveHistory(user) {
  const num = (v) => Number(v || 0);
  const lines = [
    'Leave:',
    `- Balances: VL ${num(user?.VLbal)}, SL ${num(user?.SLbal)}, OL ${num(user?.OLbal)}`,
  ];
  const bioUid = String(user?.bioUID || '').trim();
  if (bioUid === '') {
    lines.push('Leave: no biometric ID is linked, so leave/holiday markers cannot be cross-checked with DTR.');
    return lines;
  }
  try {
    const rows = await db.queryAll(
      `SELECT h.holiday_date, "HOLIDAY" AS label
       FROM \`philippine_holidays\` h
       WHERE h.holiday_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY h.holiday_date DESC
       LIMIT 3`
    );
    if (rows.length) {
      lines.push(...rowsToLines(rows, (r) => `${dateOnly(r.holiday_date)}: ${r.label}`));
    } else {
      lines.push('Leave: no recent leave/calendar markers found.');
    }
  } catch {
    lines.push('Leave: calendar marker table is unavailable.');
  }
  return lines;
}

/** Buong konteksto ng user na isinasama sa prompt (profile + apat na history). */
async function buildUserContext(user) {
  const usercode = String(user?.usercode || '').trim();
  const [fuel, dtr, epass, leave] = await Promise.all([
    fuelHistory(usercode),
    dtrHistory(user),
    epassHistory(usercode),
    leaveHistory(user),
  ]);
  return [...profileSummary(user), '', ...fuel, '', ...dtr, '', ...epass, '', ...leave].join('\n');
}

module.exports = {
  profileSummary, fuelHistory, dtrHistory, epassHistory, leaveHistory,
  buildUserContext, statusLabel, rowsToLines, cleanText,
};
