/**
 * Node-only PDF structure regression check retained after PHP retirement.
 * Run: node src/services/ai/reportPdf.parity.js
 */
const assert = require('assert');
const { reportPdfContent } = require('./reportFiles');

for (const sample of [
  { title: 'Empty Report', rows: [] },
  { title: 'Fuel Report', rows: [{ FAR: 'F-1', Employee: 'Test User', Liters: 2 }] },
  { title: 'Large Report', rows: Array.from({ length: 120 }, (_, i) => ({ Row: i + 1, Status: 'OK' })) },
]) {
  const pdf = reportPdfContent(sample.title, sample.rows);
  const text = pdf.toString('latin1');
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 100);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('\nxref\n'));
  assert.ok(text.endsWith('%%EOF'));
}

console.log('reportPdf Node regression: PASS');
