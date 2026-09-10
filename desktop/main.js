// SAMELCII desktop shell: loads the shared SAMELCII server and maintains the desktop SQLite cache.
// EDIT GUIDE: Change server-url.txt when the approved server address moves.
// HUWAG BAGUHIN: Keep the environment override so managed PCs can target another approved server.
const electronModule = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { isOwnPopupUrl } = require('./popupPolicy');

const { app, BrowserWindow, ipcMain, shell } = electronModule;

const FALLBACK_APP_URL = 'http://192.168.1.99/SAMELCII_WEB_SYSTEM/pages/auth/index.html';

function normalizeAppUrl(value) {
  const candidate = new URL(value);
  if (!['http:', 'https:'].includes(candidate.protocol) || candidate.username || candidate.password) {
    throw new Error('Only HTTP/HTTPS URLs without embedded credentials are allowed.');
  }
  return candidate.href;
}

function readConfiguredAppUrl() {
  const environmentUrl = process.env.SAMELCII_APP_URL?.trim();
  const configFiles = [
    path.join(path.dirname(process.execPath), 'server-url.txt'),
    path.join(__dirname, 'server-url.txt')
  ];

  const configuredUrl = environmentUrl || configFiles
    .filter((file, index, files) => files.indexOf(file) === index)
    .find((file) => fs.existsSync(file));

  try {
    if (environmentUrl) {
      return normalizeAppUrl(environmentUrl);
    }
    if (configuredUrl) {
      const firstValue = fs.readFileSync(configuredUrl, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
      if (firstValue) {
        return normalizeAppUrl(firstValue);
      }
    }
  } catch (error) {
    console.error('Invalid SAMELCII server address; using the default:', error.message);
  }

  // ponytail: one shared fallback keeps old installations working; use server-url.txt for per-PC routing.
  return FALLBACK_APP_URL;
}

const APP_URL = readConfiguredAppUrl();

function getDesktopDbPath() {
  const dataDir = path.join(app.getPath('userData'), 'samelcii');
  return process.env.SAMELCII_SQLITE_PATH || path.join(dataDir, 'membership.sqlite');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function openDatabase() {
  const DB_PATH = getDesktopDbPath();
  ensureDir(path.dirname(DB_PATH));
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      db.serialize(() => {
        db.run('PRAGMA journal_mode=WAL');
        db.run('PRAGMA foreign_keys=ON');
        db.run(`
          CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL DEFAULT 'POST',
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            synced INTEGER NOT NULL DEFAULT 0,
            synced_at TEXT
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS local_cache (
            cache_key TEXT PRIMARY KEY,
            cache_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        db.run(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('installed_at', datetime('now'))`);
        db.run(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('db_path', ?)`, [DB_PATH], (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(db);
        });
      });
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    backgroundColor: '#eef2f7',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const appOrigin = new URL(APP_URL).origin;

  // Every print-preview flow in the web app (EPASS/Travel, Fuel, Warehouse, Membership,
  // Complaints reports, ...) opens `window.open("", "_blank", ...)`, document.write()s a full
  // printable page into it, then calls window.print() on it. Denying every new window (the old
  // behavior) sent all of those to the OS browser as a blank tab with no content — every popup
  // print flow silently failed in the desktop app. `about:blank`/same-origin popups are this app's
  // own print previews, so let Electron open them as a real child window (window.print() works
  // natively there); only a genuinely different origin (an actual external link) still goes to
  // the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwnPopupUrl(url, appOrigin)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const fallbackHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SAMELCII Desktop</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Segoe UI, Arial, sans-serif;
            background: linear-gradient(135deg, #eef2f7 0%, #f7fafc 100%);
            color: #1f2937;
          }
          .card {
            width: min(680px, calc(100vw - 48px));
            padding: 28px 32px;
            border-radius: 18px;
            background: white;
            box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
            border: 1px solid rgba(148, 163, 184, 0.25);
          }
          h1 {
            margin: 0 0 12px;
            font-size: 28px;
          }
          p {
            margin: 0 0 10px;
            line-height: 1.55;
          }
          code {
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>SAMELCII Desktop is running</h1>
          <p>The wrapper could not reach the web app at <code>${APP_URL}</code>.</p>
          <p>Check the network/VPN and the <code>server-url.txt</code> file beside the desktop EXE.</p>
        </div>
      </body>
    </html>
  `;

  win.loadURL(APP_URL).catch((error) => {
    console.error('Failed to load app URL:', error);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
  });
  return win;
}

let dbHandle = null;

app.whenReady().then(async () => {
  try {
    dbHandle = await openDatabase();
    app.setAppUserModelId('SAMELCII.Desktop');
    createWindow();
  } catch (error) {
    console.error('Failed to initialize desktop SQLite:', error);
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (dbHandle) {
      dbHandle.close(() => app.quit());
      return;
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('desktop:get-info', async () => ({
  appUrl: APP_URL,
  dbPath: getDesktopDbPath()
}));
