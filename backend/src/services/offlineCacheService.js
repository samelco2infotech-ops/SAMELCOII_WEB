const sqlite = require('../config/sqlite');
const db = require('../config/database');

/**
 * Cache Reports as JSON in SQLite for fast access
 * No need to load from MySQL every time
 */

// Cache expiry times (in minutes)
const CACHE_TTL = {
  DTR_REPORT: 60,           // 1 hour
  TRAVEL_REPORT: 120,       // 2 hours
  FUEL_REPORT: 120,         // 2 hours
  EMPLOYEE_DIRECTORY: 480,  // 8 hours
  SUMMARY_REPORT: 1440,     // 24 hours
};

let queueSchemaPromise;
const ensureQueueSchema = async () => {
  if (!queueSchemaPromise) {
    queueSchemaPromise = (async () => {
      const columns = await sqlite.allQuery('PRAGMA table_info(pending_queue)');
      if (!columns.some((column) => column.name === 'usercode')) {
        await sqlite.runQuery("ALTER TABLE pending_queue ADD COLUMN usercode TEXT NOT NULL DEFAULT ''");
      }
    })().catch((error) => {
      queueSchemaPromise = null;
      throw error;
    });
  }
  return queueSchemaPromise;
};

/**
 * Get cached report or fetch from database
 */
const getCachedOrFetch = async (reportType, fetchFn) => {
  try {
    // Try to get from cache first
    const cached = await sqlite.getQuery(
      'SELECT data FROM report_cache WHERE report_type = ? AND (expires_at IS NULL OR expires_at > datetime("now"))',
      [reportType]
    );

    if (cached) {
      console.log(`✓ Cache hit: ${reportType}`);
      return JSON.parse(cached.data);
    }

    console.log(`⊘ Cache miss: ${reportType}, fetching from database...`);

    // Fetch from database
    const data = await fetchFn();

    // Store in cache
    const ttl = CACHE_TTL[reportType] || 120;
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    await sqlite.runQuery(
      `INSERT OR REPLACE INTO report_cache (report_type, data, expires_at, version)
       VALUES (?, ?, ?, ?)`,
      [reportType, JSON.stringify(data), expiresAt, 1]
    );

    return data;
  } catch (error) {
    console.error(`Cache error for ${reportType}:`, error.message);
    // Fall back to direct database fetch if cache fails
    return fetchFn();
  }
};

/**
 * Cache DTR Report
 */
const cacheDTRReport = async (usercode, year, month) => {
  const cacheKey = `DTR_${usercode}_${year}_${month}`;

  return getCachedOrFetch(cacheKey, async () => {
    const sql = `
      SELECT usercode, name, position, department, work_date, day_name,
             morning_in, morning_out, afternoon_in, afternoon_out,
             ot_in, ot_out, undertime_min, ot_minutes
      FROM dtr_punches
      WHERE usercode = ? AND YEAR(work_date) = ? AND MONTH(work_date) = ?
      ORDER BY work_date DESC
    `;

    const records = await db.queryAll(sql, [usercode, year, month]);
    return { records, total: records.length, cached_at: new Date().toISOString() };
  });
};

/**
 * Cache Travel Orders Report
 */
const cacheTravelReport = async (usercode = null) => {
  const cacheKey = usercode ? `TRAVEL_${usercode}` : 'TRAVEL_ALL';

  return getCachedOrFetch(cacheKey, async () => {
    let sql = `
      SELECT t.to_number, t.usercode, t.department, t.destination, t.date,
             t.purpose, t.status, u.name, u.profile_photo_url
      FROM traveltb t
      LEFT JOIN usertb u ON t.usercode = u.usercode
    `;

    const params = [];

    if (usercode) {
      sql += ` WHERE t.usercode = ?`;
      params.push(usercode);
    }

    sql += ` ORDER BY t.date DESC LIMIT 500`;

    const travels = await db.queryAll(sql, params);
    return { travels, total: travels.length, cached_at: new Date().toISOString() };
  });
};

/**
 * Cache Fuel Report
 */
const cacheFuelReport = async (usercode = null, year = null, month = null) => {
  const cacheKey = usercode ? `FUEL_${usercode}_${year}_${month}` : 'FUEL_ALL';

  return getCachedOrFetch(cacheKey, async () => {
    let sql = `
      SELECT FARCode, usercode, Department, PresRequest, status,
             unit_id, epassID, PresRequestDate, PrevRequestDate
      FROM fuelallocation_history
    `;

    const params = [];
    const conditions = [];

    if (usercode) {
      conditions.push('usercode = ?');
      params.push(usercode);
    }

    if (year && month) {
      conditions.push('YEAR(PresRequestDate) = ? AND MONTH(PresRequestDate) = ?');
      params.push(year, month);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY PresRequestDate DESC LIMIT 500`;

    const history = await db.queryAll(sql, params);
    return { history, total: history.length, cached_at: new Date().toISOString() };
  });
};

/**
 * Cache Employee Directory
 */
const cacheEmployeeDirectory = async () => {
  return getCachedOrFetch('EMPLOYEE_DIRECTORY', async () => {
    const sql = `
      SELECT usercode, name, position, department, profile_photo_url,
             emailadd, mobile_number, area
      FROM usertb
      WHERE usercode IS NOT NULL
      ORDER BY name ASC
    `;

    const employees = await db.queryAll(sql);
    return { employees, total: employees.length, cached_at: new Date().toISOString() };
  });
};

/**
 * Clear specific cache
 */
const clearCache = async (reportType) => {
  try {
    await sqlite.runQuery(
      'DELETE FROM report_cache WHERE report_type = ?',
      [reportType]
    );
    console.log(`✓ Cache cleared: ${reportType}`);
    return true;
  } catch (error) {
    console.error(`Failed to clear cache: ${error.message}`);
    return false;
  }
};

/**
 * Clear all cache
 */
const clearAllCache = async () => {
  try {
    await sqlite.runQuery('DELETE FROM report_cache');
    await sqlite.runQuery('DELETE FROM dtr_cache');
    await sqlite.runQuery('DELETE FROM travel_cache');
    await sqlite.runQuery('DELETE FROM fuel_cache');
    console.log('✓ All caches cleared');
    return true;
  } catch (error) {
    console.error(`Failed to clear all cache: ${error.message}`);
    return false;
  }
};

/**
 * Get cache stats
 */
const getCacheStats = async (usercode) => {
  try {
    await ensureQueueSchema();
    const reports = await sqlite.allQuery('SELECT report_type, cached_at FROM report_cache');
    const queueCount = await sqlite.getQuery(
      'SELECT COUNT(*) as count FROM pending_queue WHERE synced=0 AND UPPER(TRIM(usercode))=UPPER(TRIM(?))',
      [String(usercode || '').trim()]
    );

    return {
      cached_reports: reports.length,
      reports: reports.map(r => ({ type: r.report_type, cached_at: r.cached_at })),
      pending_queue: queueCount?.count || 0,
      cache_location: require('../config/sqlite').DB_PATH,
    };
  } catch (error) {
    console.error('Cache stats error:', error.message);
    return { error: error.message };
  }
};

/**
 * Add to offline queue (for offline changes)
 */
const addToQueue = async (usercode, action, endpoint, data) => {
  try {
    await ensureQueueSchema();
    const result = await sqlite.runQuery(
      `INSERT INTO pending_queue (usercode, action, endpoint, data)
       VALUES (?, ?, ?, ?)`,
      [String(usercode || '').trim().toUpperCase(), action, endpoint,
        typeof data === 'string' ? data : JSON.stringify(data)]
    );
    console.log(`✓ Added to queue: ${action} ${endpoint}`);
    return result.id;
  } catch (error) {
    console.error('Queue error:', error.message);
    return false;
  }
};

/**
 * Get pending queue items
 */
const getPendingQueue = async (usercode) => {
  try {
    await ensureQueueSchema();
    return await sqlite.allQuery(
      `SELECT id, action, endpoint, data, created_at
       FROM pending_queue
       WHERE synced=0 AND UPPER(TRIM(usercode))=UPPER(TRIM(?))
       ORDER BY created_at ASC`,
      [String(usercode || '').trim()]
    );
  } catch (error) {
    console.error('Get queue error:', error.message);
    return [];
  }
};

/**
 * Mark queue item as synced
 */
const markAsSynced = async (queueId) => {
  try {
    await sqlite.runQuery(
      'UPDATE pending_queue SET synced = 1, synced_at = datetime("now") WHERE id = ?',
      [queueId]
    );
    return true;
  } catch (error) {
    console.error('Mark synced error:', error.message);
    return false;
  }
};

module.exports = {
  getCachedOrFetch,
  cacheDTRReport,
  cacheTravelReport,
  cacheFuelReport,
  cacheEmployeeDirectory,
  clearCache,
  clearAllCache,
  getCacheStats,
  addToQueue,
  getPendingQueue,
  markAsSynced,
  ensureQueueSchema,
};
