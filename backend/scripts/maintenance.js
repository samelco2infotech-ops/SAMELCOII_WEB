#!/usr/bin/env node
/**
 * Node-only replacement for the retired PHP migration and data-repair scripts.
 * Read commands run directly; every database write requires an explicit --apply.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('../src/config/database');
const { sam } = require('../src/services/ai/samDb');
const { brainNormalize, ensureBrainTable } = require('../src/services/ai/brain');

const root = path.resolve(__dirname, '../..');
const command = process.argv[2] || 'help';
const apply = process.argv.includes('--apply');
const writeCommands = new Set(['migrate', 'profile-defaults', 'profile-blobs', 'memid-backfill', 'sam-seed']);
// cleanup-reports handles its own --apply gate (dry-run preview by default,
// deletes only with --apply) — not in writeCommands so the preview always works.
const memidTables = [
  ['dbsamelco', 'master'], ['dbsamelco', 'master_bi'], ['dbsamelco', 'master_bm'],
  ['dbsamelco_basey', 'master'], ['dbsamelco_basey', 'master_bi'], ['dbsamelco_basey', 'master_bm'],
  ['dbsamelco_catbalogan', 'master'], ['dbsamelco_catbalogan', 'master_bi'], ['dbsamelco_catbalogan', 'master_bm'],
  ['dbsamelco_villareal', 'master'], ['dbsamelco_villareal', 'master_bi'], ['dbsamelco_villareal', 'master_bm'],
];

const photoEndpoint = (id, stamp = Date.now()) =>
  `/api/auth/profile-photo?user_id=${id}&v=${Math.max(1, Number(stamp) || Date.now())}`;

function requireApply() {
  if (writeCommands.has(command) && !apply) {
    throw new Error(`${command} changes database data/schema. Re-run with --apply after reviewing the target.`);
  }
}

async function migrate() {
  const sql = fs.readFileSync(path.join(root, 'database/migrations/001_link_fuel_epass_travel.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((part) => part.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const statement of statements) await db.queryAll(statement);
  console.log(`Applied ${statements.length} migration statements.`);
}

async function profileDefaults() {
  const rows = await db.queryAll(
    `SELECT Id FROM usertb
     WHERE (profile_photo_blob IS NULL OR OCTET_LENGTH(profile_photo_blob)=0)
       AND (profile_photo_url IS NULL OR OCTET_LENGTH(profile_photo_url)=0)`
  );
  let migrated = 0;
  for (const row of rows) {
    const id = Number(row.Id);
    const file = path.join(root, 'assets/images', id % 2 === 0 ? 'avatar-male.jpg' : 'avatar-female.jpg');
    if (!id || !fs.existsSync(file)) continue;
    const stamp = new Date();
    await db.execute(
      `UPDATE usertb SET profile_photo_url=?,profile_photo_blob=?,profile_photo_mime='image/jpeg',
       profile_photo_updated_at=? WHERE Id=?`,
      [photoEndpoint(id, stamp.getTime()), fs.readFileSync(file), stamp, id]
    );
    migrated++;
  }
  console.log(JSON.stringify({ ok: true, migrated, skipped: rows.length - migrated }, null, 2));
}

function uploadPath(rawUrl) {
  const value = String(rawUrl || '').trim().replace(/\\/g, '/');
  const index = value.indexOf('/uploads/');
  if (index < 0) return '';
  const candidate = path.resolve(root, `.${value.slice(index)}`);
  const uploads = path.resolve(root, 'uploads');
  return candidate.startsWith(`${uploads}${path.sep}`) && fs.existsSync(candidate) ? candidate : '';
}

async function profileBlobs() {
  const rows = await db.queryAll(
    `SELECT Id,profile_photo_url FROM usertb
     WHERE profile_photo_url IS NOT NULL AND OCTET_LENGTH(profile_photo_url)>0
       AND (profile_photo_blob IS NULL OR OCTET_LENGTH(profile_photo_blob)=0)`
  );
  let migrated = 0;
  for (const row of rows) {
    const file = uploadPath(row.profile_photo_url);
    if (!file) continue;
    const ext = path.extname(file).toLowerCase();
    const mime = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext];
    if (!mime) continue;
    const id = Number(row.Id);
    const modified = fs.statSync(file).mtime;
    await db.execute(
      `UPDATE usertb SET profile_photo_url=?,profile_photo_blob=?,profile_photo_mime=?,
       profile_photo_updated_at=? WHERE Id=?`,
      [photoEndpoint(id, modified.getTime()), fs.readFileSync(file), mime, modified, id]
    );
    migrated++;
  }
  console.log(JSON.stringify({ ok: true, migrated, skipped: rows.length - migrated }, null, 2));
}

async function memidCounts() {
  for (const [schema, table] of memidTables) {
    const row = await db.queryOne(
      `SELECT COUNT(*) count FROM \`${schema}\`.\`${table}\` WHERE MEMID IS NULL OR MEMID='' OR MEMID='0'`
    );
    console.log(`${schema}.${table}=${Number(row?.count) || 0}`);
  }
}

async function memidList() {
  for (const [schema, table] of memidTables) {
    const rows = await db.queryAll(
      `SELECT Code,MEMID FROM \`${schema}\`.\`${table}\`
       WHERE MEMID IS NULL OR MEMID='' OR MEMID='0' ORDER BY Code LIMIT 50`
    );
    if (!rows.length) continue;
    console.log(`-- ${schema}.${table}`);
    for (const row of rows) console.log(`${row.Code} => ${JSON.stringify(row.MEMID)}`);
  }
}

function parseBackfill(sql) {
  const blocks = [];
  const pattern = /UPDATE `([^`]+)`\.`([^`]+)` SET `MEMID` = CASE `Code`\s+([\s\S]*?)ELSE `MEMID` END\s+WHERE `Code` IN \(([^)]+)\);/g;
  for (const match of sql.matchAll(pattern)) {
    const map = new Map();
    for (const item of match[3].matchAll(/WHEN\s+(\d+)\s+THEN\s+'((?:''|[^'])*)'/g)) {
      map.set(Number(item[1]), item[2].replace(/''/g, "'"));
    }
    const codes = match[4].split(',').map(Number).filter((code) => Number.isInteger(code) && map.has(code));
    blocks.push({ schema: match[1], table: match[2], map, codes });
  }
  return blocks;
}

async function memidBackfill() {
  const arg = process.argv.slice(3).find((value) => value !== '--apply');
  const file = path.resolve(arg || path.join(root, 'database/backups/memid_backfill_backup_20260603.sql'));
  if (!fs.existsSync(file)) throw new Error(`Backup SQL not found: ${file}`);
  const blocks = parseBackfill(fs.readFileSync(file, 'utf8'));
  if (!blocks.length) throw new Error('No valid MEMID update blocks found.');
  let targeted = 0;
  for (const block of blocks) {
    assert.ok(memidTables.some(([schema, table]) => schema === block.schema && table === block.table), 'Unexpected table in backup');
    for (let index = 0; index < block.codes.length; index += 100) {
      const codes = block.codes.slice(index, index + 100);
      const cases = codes.map(() => 'WHEN ? THEN ?').join(' ');
      const params = codes.flatMap((code) => [code, block.map.get(code)]).concat(codes);
      await db.execute(
        `UPDATE \`${block.schema}\`.\`${block.table}\` SET MEMID=CASE Code ${cases} ELSE MEMID END
         WHERE Code IN (${codes.map(() => '?').join(',')})`,
        params
      );
      targeted += codes.length;
    }
  }
  console.log(`MEMID backfill complete. Rows targeted: ${targeted}`);
}

async function status() {
  const brain = await db.queryOne(`SELECT COUNT(*) count FROM ${sam('sam_brain')}`);
  console.log(JSON.stringify({ node: process.version, os: `${os.platform()} ${os.release()}`, sam_brain: Number(brain?.count) || 0 }, null, 2));
}

async function samSeed() {
  await ensureBrainTable();
  const faqs = [
    ['attendance', 'Open the DTR module to view your time-in, time-out, late, and absent records. Report an incorrect or missing punch to HR.', ['how to check my dtr', 'how to view my attendance', 'paano makita ang dtr ko']],
    ['leave', 'Open the Leave form in Employee Profile, choose the leave type and dates, then submit it through the assigned approval flow.', ['how to request leave', 'how to file leave', 'paano mag file ng leave']],
    ['leave', 'Your VL, SL, and special leave credits are shown in the Employee Profile leave form. Contact HR if a posted balance is incorrect.', ['check my leave balance', 'what is my vl balance', 'leave credits']],
    ['fuel', 'Open the Fuel module, complete the vehicle and trip details, then submit the request to its assigned approver.', ['how to request fuel', 'fuel allocation request', 'paano mag request ng fuel']],
    ['travel', 'Open the EPASS or Travel form, enter the schedule, destination, purpose, and employees, then submit it for approval.', ['how to request epass', 'how to file travel order', 'create gate pass']],
    ['it', 'Open IT Equipment and file a job order for computer, printer, network, account, or equipment problems.', ['report an it problem', 'computer is not working', 'file it job order']],
    ['warehouse', 'Open Warehouse and submit a material requisition. Approved releases and returns are recorded under the responsible employee.', ['request materials', 'request warehouse supplies', 'return equipment']],
    ['profile', 'Open Employee Profile to update allowed fields and your photo. Ask HR to change locked official information.', ['update my profile', 'change profile photo', 'change employee information']],
    ['messenger', 'Open Messenger for internal individual or group chat, file sharing, and available voice/video call controls.', ['how to use messenger', 'send a message', 'start group chat']],
    ['process', 'Tell SAM the report type and period, such as DTR this month or Fuel for May. SAM can prepare the supported report format.', ['generate a report', 'export report', 'make excel report']],
    ['general', 'SAM is the SAMELCO II assistant for employee records, DTR, leave, fuel, EPASS, travel, IT, warehouse, approvals, and reports.', ['what can sam do', 'help me sam', 'what are your features']],
    ['general', 'SAMELCO II is Samar II Electric Cooperative, serving member-consumers in its franchise area in Samar.', ['what is samelco ii', 'about samelco 2', 'ano ang samelco ii']],
  ];
  const prefixes = ['', 'please ', 'sam, ', 'hi sam, ', 'pwede ', 'paki '];
  let seeded = 0;
  for (const [category, answer, questions] of faqs) {
    for (const base of questions) {
      for (const prefix of prefixes) {
        const question = `${prefix}${base}`.trim();
        const normalized = brainNormalize(question);
        const hash = crypto.createHash('sha1').update(normalized).digest('hex');
        await db.execute(
          `INSERT INTO ${sam('sam_brain')}
             (question,answer,search_text,category,asked_by_id,asked_by_name,source,question_hash,updated_at)
           VALUES (?,?,?,?,0,'SEED','seed',?,NOW())
           ON DUPLICATE KEY UPDATE answer=VALUES(answer),search_text=VALUES(search_text),
             category=VALUES(category),source='seed'`,
          [question, answer, normalized, category, hash]
        );
        seeded++;
      }
    }
  }
  const total = await db.queryOne(`SELECT COUNT(*) count FROM ${sam('sam_brain')}`);
  console.log(JSON.stringify({ ok: true, seeded, brain_total: Number(total?.count) || 0 }, null, 2));
}

/**
 * Deletes SAM-generated report files (uploads/messenger/sam_*) older than
 * --days=N (default 30). Dry-run by default — pass --apply to actually delete.
 * Nothing expires these today, so they accumulate on disk indefinitely.
 */
function cleanupReports() {
  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const parsedDays = Number(daysArg?.split('=')[1]);
  const maxAgeDays = Math.max(0, Number.isFinite(parsedDays) ? parsedDays : 30);
  const dir = path.join(root, 'uploads/messenger');
  if (!fs.existsSync(dir)) {
    console.log(JSON.stringify({ ok: true, note: 'uploads/messenger does not exist yet', deleted: 0 }, null, 2));
    return;
  }

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const candidates = fs.readdirSync(dir)
    .filter((name) => name.startsWith('sam_'))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, full, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .filter((f) => f.mtimeMs < cutoff);

  const totalBytes = candidates.reduce((sum, f) => sum + f.size, 0);

  if (!apply) {
    console.log(JSON.stringify({
      ok: true, dryRun: true, olderThanDays: maxAgeDays, wouldDelete: candidates.length, totalBytes,
      note: 'Re-run with --apply to actually delete these files.',
    }, null, 2));
    return;
  }

  for (const f of candidates) fs.unlinkSync(f.full);
  console.log(JSON.stringify({ ok: true, olderThanDays: maxAgeDays, deleted: candidates.length, totalBytes }, null, 2));
}

function diagnostics() {
  const version = (name) => {
    try { return execFileSync(name, ['--version'], { encoding: 'utf8' }).trim(); } catch { return 'not installed'; }
  };
  console.log(JSON.stringify({ node: process.version, npm: version('npm'), n8n: version('n8n'), os: `${os.platform()} ${os.release()}` }, null, 2));
}

const commands = {
  migrate, 'profile-defaults': profileDefaults, 'profile-blobs': profileBlobs,
  'memid-counts': memidCounts, 'memid-list': memidList, 'memid-backfill': memidBackfill,
  'sam-seed': samSeed, status, diagnostics, 'cleanup-reports': cleanupReports,
};

(async () => {
  if (command === 'help' || !commands[command]) {
    console.log('Usage: npm run maintenance -- <migrate|profile-defaults|profile-blobs|memid-counts|memid-list|memid-backfill|sam-seed|status|diagnostics|cleanup-reports> [path] [--days=N] [--apply]');
    process.exitCode = command === 'help' ? 0 : 1;
    return;
  }
  requireApply();
  await commands[command]();
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.closePool());
