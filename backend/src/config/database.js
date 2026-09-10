/**
 * Purpose: Shared MySQL pools for application, DTR audit, and SAM read-only access.
 * EDIT GUIDE: Configure credentials through backend/.env; never hardcode live passwords.
 * HUWAG BAGUHIN: DTR audit writes must use getDtrAuditConnection(), not the main pool.
 * Tagalog: Hiwalay ang correction at print audit para hindi mahalo sa normal transactions.
 */
const mysql = require('mysql2/promise');
const config = require('./env');

let pool = null;
let consumerPool = null;
let readPool = null;
let dtrAuditPool = null;

const createPool = async () => {
  if (pool) return pool;

  try {
    pool = mysql.createPool(config.db);
    console.log('✓ Database pool created');
    return pool;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    throw error;
  }
};

/** Separate pool for SAM's read-only query agent (SELECT-only DB user). */
const createReadPool = async () => {
  if (readPool) return readPool;
  // isDedicated is our own flag, not a mysql2 option — keep it out of the pool config.
  const { isDedicated, ...poolConfig } = config.dbRead;
  readPool = mysql.createPool(poolConfig);
  if (!isDedicated) {
    console.warn('⚠ SAM read pool is using fallback (full-privilege) creds — set DB_RO_USER to a SELECT-only user in production.');
  }
  return readPool;
};

const createConsumerPool = async () => {
  if (consumerPool) return consumerPool;
  consumerPool = mysql.createPool(config.dbConsumer);
  return consumerPool;
};

const createDtrAuditPool = async () => {
  if (dtrAuditPool) return dtrAuditPool;
  dtrAuditPool = mysql.createPool(config.dbDtrAudit);
  return dtrAuditPool;
};

/**
 * Run a read-only query for the query agent. Cross-database SELECTs are allowed
 * (it_program + messenger) since the agent qualifies tables; writes are impossible
 * when DB_RO_USER is a SELECT-only grant. Callers MUST pass guard-approved SQL.
 */
const readQuery = async (sql, params = []) => {
  if (!readPool) await createReadPool();
  const connection = await readPool.getConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows;
  } finally {
    connection.release();
  }
};

const getConnection = async () => {
  if (!pool) {
    await createPool();
  }
  return pool.getConnection();
};

const getConsumerConnection = async () => {
  if (!consumerPool) await createConsumerPool();
  return consumerPool.getConnection();
};

const getDtrAuditConnection = async () => {
  if (!dtrAuditPool) {
    await createDtrAuditPool();
  }
  return dtrAuditPool.getConnection();
};

const queryOne = async (sql, params = []) => {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows[0] || null;
  } finally {
    connection.release();
  }
};

const queryAll = async (sql, params = []) => {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows;
  } finally {
    connection.release();
  }
};

const consumerQueryOne = async (sql, params = []) => {
  const connection = await getConsumerConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows[0] || null;
  } finally {
    connection.release();
  }
};

const consumerQueryAll = async (sql, params = []) => {
  const connection = await getConsumerConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows;
  } finally {
    connection.release();
  }
};

const execute = async (sql, params = []) => {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(sql, params);
    return result;
  } finally {
    connection.release();
  }
};

const beginTransaction = async (connection) => {
  await connection.beginTransaction();
};

const commit = async (connection) => {
  await connection.commit();
};

const rollback = async (connection) => {
  await connection.rollback();
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ Database pool closed');
  }
  if (consumerPool) {
    await consumerPool.end();
    consumerPool = null;
  }
  if (readPool) {
    await readPool.end();
    readPool = null;
  }
  if (dtrAuditPool) {
    await dtrAuditPool.end();
    dtrAuditPool = null;
  }
};

module.exports = {
  createPool,
  createConsumerPool,
  createReadPool,
  createDtrAuditPool,
  readQuery,
  getConnection,
  getConsumerConnection,
  getDtrAuditConnection,
  queryOne,
  queryAll,
  consumerQueryOne,
  consumerQueryAll,
  execute,
  beginTransaction,
  commit,
  rollback,
  closePool,
  pool: () => pool,
};
