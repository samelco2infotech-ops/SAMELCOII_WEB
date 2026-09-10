const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.resolve(
  process.env.SAMELCII_SQLITE_PATH ||
  path.join(process.env.SAMELCII_SQLITE_DIR || DEFAULT_DB_DIR, 'cache.db')
);
const DB_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;

const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('SQLite connection failed:', err);
        reject(err);
        return;
      }

      console.log('✓ SQLite cache database connected');

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create tables
        db.serialize(() => {
          // Reports cache table
          db.run(`
            CREATE TABLE IF NOT EXISTS report_cache (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              report_type TEXT NOT NULL UNIQUE,
              data TEXT NOT NULL,
              format TEXT DEFAULT 'json',
              cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              expires_at DATETIME,
              version INTEGER DEFAULT 1
            )
          `);

          // DTR cache
          db.run(`
            CREATE TABLE IF NOT EXISTS dtr_cache (
              id INTEGER PRIMARY KEY,
              usercode TEXT,
              work_date DATE,
              data TEXT,
              cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Travel orders cache
          db.run(`
            CREATE TABLE IF NOT EXISTS travel_cache (
              id INTEGER PRIMARY KEY,
              to_number TEXT UNIQUE,
              data TEXT,
              cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Fuel cache
          db.run(`
            CREATE TABLE IF NOT EXISTS fuel_cache (
              id INTEGER PRIMARY KEY,
              usercode TEXT,
              data TEXT,
              cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Pending queue for offline changes
          db.run(`
            CREATE TABLE IF NOT EXISTS pending_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              action TEXT NOT NULL,
              endpoint TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              synced INTEGER DEFAULT 0,
              synced_at DATETIME
            )
          `);

          // Sync metadata
          db.run(`
            CREATE TABLE IF NOT EXISTS sync_metadata (
              key TEXT PRIMARY KEY,
              value TEXT,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          console.log('✓ SQLite tables initialized');
          resolve();
        });
      });
    });
  });
};

const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else {
          console.log('✓ SQLite cache database closed');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
};

module.exports = {
  initializeDatabase,
  runQuery,
  getQuery,
  allQuery,
  closeDatabase,
  DB_PATH,
};
