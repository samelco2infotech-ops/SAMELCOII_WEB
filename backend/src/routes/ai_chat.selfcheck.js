/**
 * Self-check ng /api/ai-chat/chat wiring.
 *
 * Ang ruta ngayon ay dumadaan sa samOrchestrator (may sariling selfcheck ang ruta ng
 * mga handler). Dito, dalawang bagay lang ang sinusubok — ang BAGO sa ruta:
 *   1. buildFile — tunay bang naisusulat ang xlsx/pdf/svg at tama ang magic bytes?
 *      (kung mali ang encoding, sira ang download — kaya sinusuri ang bytes, hindi laki lang)
 *   2. ang handler ba ay kumukuha ng user sa DB at hindi sa token? (privilege gate)
 *
 * PATAKBUHIN: node src/routes/ai_chat.selfcheck.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPORT_DIR = path.resolve(__dirname, '../../uploads/messenger');
const routeSource = fs.readFileSync(path.join(__dirname, 'ai_chat.js'), 'utf8');

// ponytail: hindi na-e-export ang buildFile (panloob sa ruta), kaya tinatawag dito ang
// parehong tatlong builder na ginagamit nito. Kung mababago ang mapping ng format sa
// ruta, hindi ito mahuhuli — i-export ang buildFile kung kailangan ng tunay na pagkakabit.
const reportFiles = require('../services/ai/reportFiles');
const aiChatService = require('../services/aiChatService');

const rows = [{ name: 'Juan Dela Cruz', dept: 'IT', qty: 3 }];
const cases = [
  ['excel', reportFiles.reportXlsxContent, [0x50, 0x4b]], // "PK" — tunay na zip/xlsx
  ['pdf', reportFiles.reportPdfContent, [0x25, 0x50, 0x44, 0x46]], // "%PDF"
  ['image', reportFiles.reportImageContent, null], // SVG — teksto
];

let pass = 0;
let fail = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  OK    ${label}`);
    pass += 1;
  } catch (err) {
    console.log(`  FAIL  ${label} — ${err.message}`);
    fail += 1;
  }
};

for (const [format, builder, magic] of cases) {
  check(`${format}: content has the right magic bytes`, () => {
    const content = builder('Selfcheck Report', rows);
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    assert.ok(buf.length > 0, 'walang laman');
    if (magic) {
      assert.deepStrictEqual([...buf.subarray(0, magic.length)], magic, 'maling magic bytes');
    } else {
      assert.ok(buf.toString('utf8', 0, 200).includes('<svg'), 'hindi svg');
    }
  });
}

check('uploads/messenger is writable', () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const probe = path.join(REPORT_DIR, `.selfcheck_${Date.now()}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
});

check('route reads privilage from the DB, not from the token', () => {
  assert.ok(
    /SELECT \* FROM usertb WHERE usercode/.test(routeSource),
    'walang usertb lookup — mapagkakatiwalaan ang x-samelcii-session ng kliyente'
  );
  assert.ok(routeSource.includes('orchestrator.handleMessage'), 'hindi nakakabit sa orchestrator');
});

check('Node AI config is safe and does not expose provider secrets', () => {
  const config = aiChatService.getAIConfig();
  assert.ok(config.provider, 'walang AI provider');
  assert.strictEqual(Object.hasOwn(config, 'apiKey'), false, 'nakalabas ang API key');
  assert.strictEqual(aiChatService.isMissingOptionalTable({ code: 'ER_NO_SUCH_TABLE' }), true);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
