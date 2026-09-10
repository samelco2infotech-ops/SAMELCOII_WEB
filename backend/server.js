const app = require('./src/app');
const config = require('./src/config/env');
const db = require('./src/config/database');
const sqlite = require('./src/config/sqlite');
const dtrFinalize = require('./src/jobs/dtrFinalize');

const startServer = async () => {
  try {
    // Initialize MySQL connection pool
    await db.createPool();
    console.log(`✓ Connected to ${config.db.database}@${config.db.host}`);

    // Initialize SQLite cache database
    await sqlite.initializeDatabase();
    console.log(`✓ SQLite cache initialized at ${sqlite.DB_PATH}`);

    // Start Express server
    const PORT = config.server.port;
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Environment: ${config.server.nodeEnv}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ Offline caching: /api/offline/cache-status`);
      dtrFinalize.start();
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error.message);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  console.log('\n✓ Shutting down gracefully...');
  await db.closePool();
  await sqlite.closeDatabase();
  process.exit(0);
});

startServer();
