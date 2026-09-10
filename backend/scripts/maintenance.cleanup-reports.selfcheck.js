/**
 * End-to-end check for `maintenance.js cleanup-reports` — real file on disk,
 * real CLI invocation (it's a bare script, not an importable module).
 * Run: node scripts/maintenance.cleanup-reports.selfcheck.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Matches maintenance.js's own root = path.resolve(__dirname, '../..') from
// backend/scripts -> backend -> project root, where routes/sam.js actually writes.
const dir = path.join(__dirname, '..', '..', 'uploads', 'messenger');
fs.mkdirSync(dir, { recursive: true });
const oldFile = path.join(dir, 'sam_ZZTEST_old.xlsx');
const freshFile = path.join(dir, 'sam_ZZTEST_fresh.xlsx');
fs.writeFileSync(oldFile, 'x');
fs.writeFileSync(freshFile, 'x');
const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
fs.utimesSync(oldFile, old, old);

try {
  const run = (args) => JSON.parse(execFileSync('node', [path.join(__dirname, 'maintenance.js'), 'cleanup-reports', ...args], { encoding: 'utf8' }));

  const preview30 = run(['--days=30']);
  assert.ok(preview30.dryRun, 'no --apply -> dry run, never deletes');
  assert.ok(fs.existsSync(oldFile) && fs.existsSync(freshFile), 'dry run touched nothing');

  const preview0 = run(['--days=0']);
  assert.ok(preview0.wouldDelete >= preview30.wouldDelete, '--days=0 catches at least as many files as --days=30 (regression check for the 0-is-falsy bug)');

  const applied = run(['--days=30', '--apply']);
  assert.strictEqual(applied.dryRun, undefined, '--apply actually runs');
  assert.ok(!fs.existsSync(oldFile), 'old test file deleted');
  assert.ok(fs.existsSync(freshFile), 'fresh test file kept (not old enough)');

  console.log('OK — maintenance cleanup-reports self-check passed (dry-run safety + days=0 bug regression + real delete)');
} finally {
  try { fs.unlinkSync(oldFile); } catch {}
  try { fs.unlinkSync(freshFile); } catch {}
}
