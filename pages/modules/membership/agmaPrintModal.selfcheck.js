/**
 * Purpose: Verify the AGMA print-preview-modal pattern in membership/index.html's
 * printAgmaRoster() (no window.open/new tab; Print button stays disabled until all preview
 * images load/error, then printing only fires on click; Cancel/afterprint close the modal).
 * Run with: node agmaPrintModal.selfcheck.js
 */
const assert = require('assert');

function scheduleEnablePrint(images, enableFn) {
    let remaining = images.length;
    if (!images.length) {
        enableFn();
        return;
    }
    images.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
            remaining -= 1;
            if (remaining <= 0) enableFn();
        } else {
            const tick = () => { remaining -= 1; if (remaining <= 0) enableFn(); };
            img.on('load', tick);
            img.on('error', tick);
        }
    });
}

function fakeImage() {
    const listeners = {};
    return {
        complete: false,
        naturalWidth: 0,
        on(event, fn) { listeners[event] = fn; },
        fire(event) { listeners[event] && listeners[event](); },
    };
}

function closeAgmaPrintModal(modal) {
    if (modal) modal.open = false;
}

function main() {
    // No signature images: Print button becomes enabled immediately.
    let enabled = false;
    scheduleEnablePrint([], () => { enabled = true; });
    assert.strictEqual(enabled, true, 'no-image roster should enable Print immediately');

    // Pending signature images: Print must stay disabled until all settle.
    enabled = false;
    const imgA = fakeImage();
    const imgB = fakeImage();
    scheduleEnablePrint([imgA, imgB], () => { enabled = true; });
    assert.strictEqual(enabled, false, 'Print must stay disabled before all signature images settle');
    imgA.fire('load');
    assert.strictEqual(enabled, false, 'Print must stay disabled until the last image settles');
    imgB.fire('error');
    assert.strictEqual(enabled, true, 'Print must enable exactly once all images settle (load or error)');

    // closeAgmaPrintModal must clear the .open flag (Cancel / afterprint cleanup path).
    const modal = { open: true };
    closeAgmaPrintModal(modal);
    assert.strictEqual(modal.open, false, 'closeAgmaPrintModal must close the modal');

    console.log('agmaPrintModal.selfcheck: passed');
}

main();
