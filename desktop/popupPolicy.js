// Pure decision logic for desktop/main.js's setWindowOpenHandler — split out so it's testable
// without an Electron runtime (require('electron') only resolves inside an actual Electron process).
function isOwnPopupUrl(url, appOrigin) {
  if (url === 'about:blank' || url === '') return true;
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

module.exports = { isOwnPopupUrl };
