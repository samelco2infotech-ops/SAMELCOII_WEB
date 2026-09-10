const assert = require('assert');
const { isOwnPopupUrl } = require('./popupPolicy');

const ORIGIN = 'http://192.168.1.99';

// window.open("", "_blank", ...) — the pattern every print-preview flow in the web app uses.
assert.strictEqual(isOwnPopupUrl('about:blank', ORIGIN), true, 'about:blank popup (print preview) is allowed');
assert.strictEqual(isOwnPopupUrl('', ORIGIN), true, 'empty url is allowed');
// Same-origin navigation attempt.
assert.strictEqual(isOwnPopupUrl('http://192.168.1.99/SAMELCII_WEB_SYSTEM/pages/x.html', ORIGIN), true, 'same-origin url is allowed');
// A genuine external link must still be denied (and handed to the OS browser by the caller).
assert.strictEqual(isOwnPopupUrl('https://google.com', ORIGIN), false, 'external origin is denied');
assert.strictEqual(isOwnPopupUrl('not a url', ORIGIN), false, 'unparseable url is denied, not thrown');

console.log('desktop popupPolicy self-check passed.');
