/**
 * Purpose: Convert an already-rendered HTML fragment (DTR print pages, real data already filled
 * in by the browser) into a real PDF file, server-side, via an existing local Chrome/Edge install
 * driven through puppeteer-core (no bundled Chromium download).
 * EDIT GUIDE: This replaces a client-side html2canvas+jsPDF pipeline that kept failing to measure/
 * position the multi-page CSS-grid print layout in its offscreen clone (0×0 canvas, blank pages,
 * mispositioned fragments — three separate failure modes across three fix attempts). Loading the
 * SAME html the browser already renders correctly into a real headless browser page sidesteps that
 * class of bug entirely — it's real browser layout, not a screenshot library's best-effort clone.
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// ponytail: puppeteer-core needs SOME Chrome/Edge binary on the machine — checking a short list of
// default Windows install locations (plus an env override) avoids bundling/downloading Chromium
// (~170MB) just for this one feature. Ceiling: only covers the common default install paths: if
// Chrome/Edge is installed somewhere non-standard, set CHROME_PATH in backend/.env.
const CANDIDATE_EXECUTABLES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const findExecutablePath = () => {
  const found = CANDIDATE_EXECUTABLES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    fail(500, 'No Chrome or Edge installation found on the server for PDF rendering. '
      + 'Set CHROME_PATH in backend/.env to a chrome.exe / msedge.exe path.');
  }
  return found;
};

// ponytail: one shared browser process, not one per request — launching Chrome takes ~1-2s; reusing
// it keeps repeat exports fast. Reset on launch failure so the NEXT request retries fresh instead of
// re-awaiting a dead promise forever (same "stuck forever" bug already fixed once on the client side
// for the old PDF pipeline's asset loader).
let browserPromise = null;
const getBrowser = () => {
  if (browserPromise) return browserPromise;
  browserPromise = puppeteer.launch({
    executablePath: findExecutablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  browserPromise.catch(() => { browserPromise = null; });
  return browserPromise;
};

// html: the .dtr-print-root fragment's outerHTML — already has real employee/DTR data filled in by
// the browser (buildEmployeePrintModels/renderPrintCard), we just need to lay it out and print it.
// baseHref: the DTR page's own URL, so the fragment's relative asset paths (stylesheet, logo image)
// resolve exactly as they do in the browser, without the caller having to rewrite every URL.
const renderDtrPdf = async ({ html, baseHref }) => {
  const htmlText = String(html || '').trim();
  if (!htmlText) fail(400, 'Missing html.');
  if (!baseHref) fail(400, 'Missing baseHref.');

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const document = `<!doctype html><html><head><meta charset="utf-8">`
      + `<base href="${baseHref.replace(/"/g, '&quot;')}">`
      + `</head><body class="dtr-batch-printing">${htmlText}</body></html>`;
    // ponytail: same batch-print CSS class (body.dtr-batch-printing) the "Print All"/on-screen
    // preview already use for exact Legal-paper sizing — one layout definition, not a second one
    // just for this path.
    await page.setContent(document, { waitUntil: 'networkidle0', timeout: 20000 });
    return await page.pdf({
      format: 'legal',
      landscape: true,
      printBackground: true,
      margin: { top: '0.1in', bottom: '0.1in', left: '0.1in', right: '0.1in' },
    });
  } finally {
    await page.close();
  }
};

module.exports = { renderDtrPdf, findExecutablePath };
