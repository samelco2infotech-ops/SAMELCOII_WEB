/**
 * Self-check for the Leave/Travel/Epass/Holiday sidebar wiring + Holiday CRUD.
 * Run: node scripts/hrad-modules.selfcheck.js
 * - Confirms sidebar-layout.json has non-empty src for all four HRAD items and that
 *   each src resolves to a real file on disk (relative to pages/dashboard/, same as the iframe).
 * - Confirms every employees-profile/index.html?v= reference across sidebar-layout.json and
 *   dashboard/index.html shares one cache-buster (the exact bug this task was warned about).
 * - Exercises holidayService add/list/update/delete against the real DB directly.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..'); // backend/scripts -> backend -> project root
const DASHBOARD_DIR = path.join(ROOT, 'pages', 'dashboard');

async function main() {
  // --- 1. sidebar-layout.json: Leave/Travel/Epass/Holiday have non-empty src pointing at real files ---
  const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'src', 'data', 'sidebar-layout.json'), 'utf8'));
  const hrad = layout.layout.schema.find((n) => n.label === 'HRAD');
  assert.ok(hrad, 'HRAD group exists in sidebar-layout.json');
  const wanted = ['Leave', 'Travel', 'Epass', 'Holiday'];
  const bySrcVersion = new Set();
  for (const label of wanted) {
    const item = hrad.children.find((c) => c.label === label);
    assert.ok(item, `${label} entry exists under HRAD`);
    assert.ok(item.src && item.src.trim(), `${label} has a non-empty src`);
    const filePart = item.src.split('?')[0];
    const resolved = path.resolve(DASHBOARD_DIR, filePart);
    assert.ok(fs.existsSync(resolved), `${label} src resolves to a real file: ${resolved}`);
    const version = (item.src.match(/[?&]v=([^&]+)/) || [])[1];
    if (item.src.includes('employees-profile/index.html')) bySrcVersion.add(version);
  }
  assert.strictEqual(bySrcVersion.size, 1, `Leave/Travel/Epass share one employees-profile cache-buster, got: ${[...bySrcVersion]}`);

  // --- 2. Every employees-profile/index.html?v= reference (sidebar-layout.json + dashboard/index.html) matches ---
  const [expectedVersion] = bySrcVersion;
  const dashboardHtml = fs.readFileSync(path.join(DASHBOARD_DIR, 'index.html'), 'utf8');
  const rawLayout = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'data', 'sidebar-layout.json'), 'utf8');
  const allVersions = new Set();
  for (const src of [dashboardHtml, rawLayout]) {
    const matches = src.matchAll(/employees-profile\/index\.html\?v=([^"&\s]+)/g);
    for (const m of matches) allVersions.add(m[1]);
  }
  assert.strictEqual(allVersions.size, 1, `every employees-profile/index.html?v= reference matches, got: ${[...allVersions]}`);
  assert.strictEqual([...allVersions][0], expectedVersion, 'dashboard/index.html version matches sidebar-layout.json version');

  console.log(`OK (1/2) — sidebar wiring: Leave/Travel/Epass/Holiday src present, files exist, cache-buster v=${expectedVersion} consistent everywhere.`);

  // --- 3. Holiday CRUD against the real DB via holidayService directly (no HTTP/auth needed) ---
  const db = require(path.join(ROOT, 'backend', 'src', 'config', 'database'));
  const holidayService = require(path.join(ROOT, 'backend', 'src', 'services', 'holidayService'));
  const managerUser = { privilage: '10', privilagemenu: '' };
  const plainUser = { privilage: '1', privilagemenu: '' };
  const testName = 'ZZTEST Self-check Holiday';
  let createdId = null;
  try {
    // A non-privileged user must be rejected (write actions are gated).
    await assert.rejects(
      holidayService.add(plainUser, { holiday_name: testName, holiday_date: '2031-06-12', holiday_type: 'Regular' }),
      (err) => err.status === 403,
      'non-privileged user is rejected with 403'
    );

    const added = await holidayService.add(managerUser, { holiday_name: testName, holiday_date: '2031-06-12', holiday_type: 'Regular', atc: 1 });
    assert.ok(Number.isInteger(added.id) && added.id > 0, 'add() returns a new numeric id');
    createdId = added.id;

    const { items } = await holidayService.list({ year: 2031 });
    const found = items.find((i) => i.id === createdId);
    assert.ok(found, 'newly added holiday appears in list({year:2031})');
    assert.strictEqual(found.holiday_name, testName, 'listed holiday_name matches what was added');
    assert.strictEqual(found.holiday_type, 'Regular', 'listed holiday_type matches what was added');

    const updated = await holidayService.update(managerUser, { id: createdId, holiday_name: testName, holiday_date: '2031-06-13', holiday_type: 'Special Non-Working', atc: 0 });
    assert.strictEqual(updated.id, createdId, 'update() returns same id');
    const { items: afterUpdate } = await holidayService.list({ year: 2031 });
    const foundUpdated = afterUpdate.find((i) => i.id === createdId);
    assert.strictEqual(foundUpdated.holiday_type, 'Special Non-Working', 'update() persisted the new holiday_type');
    assert.strictEqual(Number(foundUpdated.atc), 0, 'update() persisted atc=0');

    await holidayService.remove(managerUser, { id: createdId });
    const { items: afterDelete } = await holidayService.list({ year: 2031 });
    assert.ok(!afterDelete.find((i) => i.id === createdId), 'delete() removed the row');
    createdId = null;

    console.log('OK (2/2) — holidayService add/list/update/delete round-trip against the real DB, including the 403 write-gate.');
  } finally {
    if (createdId) {
      try { await holidayService.remove(managerUser, { id: createdId }); } catch (_e) { /* best-effort cleanup */ }
    }
    await db.closePool();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
});
