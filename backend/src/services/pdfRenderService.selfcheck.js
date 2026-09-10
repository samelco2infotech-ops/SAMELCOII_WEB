const assert = require('assert');
const service = require('./pdfRenderService');

assert.strictEqual(typeof service.renderDtrPdf, 'function');
assert.strictEqual(typeof service.findExecutablePath, 'function');

// renderDtrPdf must reject bad input before ever touching a browser (no Chrome needed for this check).
assert.rejects(() => service.renderDtrPdf({ html: '', baseHref: 'http://x/' }), /Missing html/);
assert.rejects(() => service.renderDtrPdf({ html: '<p>x</p>', baseHref: '' }), /Missing baseHref/);

console.log('PDF render service self-check passed.');
