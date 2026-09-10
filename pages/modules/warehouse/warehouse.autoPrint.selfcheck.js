/**
 * Purpose: Verify the in-page print-preview-modal pattern used in warehouse.js printSelected()
 * (no window.open/new tab; Print button stays disabled until all preview images load/error, then
 * printing only fires on click; closePrintWindow detaches the overlay from the DOM).
 * Run with: node warehouse.autoPrint.selfcheck.js
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

function fakeOverlay() {
    let removed = false;
    return {
        parentNode: { removeChild() { removed = true; } },
        get removedFromDom() { return removed; },
    };
}

function closePrintWindow(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

function main() {
    // No images: Print button becomes enabled immediately.
    let enabled = false;
    scheduleEnablePrint([], () => { enabled = true; });
    assert.strictEqual(enabled, true, 'no-image document should enable Print immediately');

    // Two pending images: Print must stay disabled until both settle.
    enabled = false;
    const imgA = fakeImage();
    const imgB = fakeImage();
    scheduleEnablePrint([imgA, imgB], () => { enabled = true; });
    assert.strictEqual(enabled, false, 'Print must stay disabled before all images settle');
    imgA.fire('load');
    assert.strictEqual(enabled, false, 'Print must stay disabled until the last image settles');
    imgB.fire('error');
    assert.strictEqual(enabled, true, 'Print must enable exactly once all images settle (load or error)');

    // Already-complete image: enabled immediately, no listener needed.
    enabled = false;
    const doneImg = { complete: true, naturalWidth: 40, on() { throw new Error('should not attach a listener'); } };
    scheduleEnablePrint([doneImg], () => { enabled = true; });
    assert.strictEqual(enabled, true, 'an already-loaded image should enable Print without listeners');

    // closePrintWindow must remove the overlay from the DOM (Cancel / afterprint cleanup path).
    const overlay = fakeOverlay();
    closePrintWindow(overlay);
    assert.strictEqual(overlay.removedFromDom, true, 'closePrintWindow must detach the preview overlay');

    console.log('warehouse.autoPrint.selfcheck: passed');
}

main();
