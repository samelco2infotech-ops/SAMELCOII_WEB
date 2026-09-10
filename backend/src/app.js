/**
 * Purpose: Configure the Express application, API routes, uploads, and CORS boundary.
 * EDIT GUIDE: Add production browser origins through APP_ALLOWED_ORIGINS.
 * HUWAG BAGUHIN: Never restore wildcard IPv4 or .local origin access.
 * Tagalog: Eksaktong pinayagang website lang ang maaaring tumawag sa Node API.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { verifyToken } = require('./middleware/auth');

const app = express();

const normalizeOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return '';
  }
};

const isAllowedLocalOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  let parsed;
  try {
    parsed = new URL(origin);
  } catch (_error) {
    return false;
  }

  const normalizedOrigin = parsed.origin;
  const configuredOrigins = String(process.env.APP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .map(normalizeOrigin)
    .filter(Boolean);
  const productionOrigins = [
    'http://192.168.1.99',
    'https://192.168.1.99',
  ];

  if ([...configuredOrigins, ...productionOrigins].includes(normalizedOrigin)) {
    return true;
  }

  const hostname = String(parsed.hostname || '').toLowerCase();
  return config.server.nodeEnv !== 'production'
    && ['localhost', '127.0.0.1', '::1'].includes(hostname);
};

const normalizeLegacyProfilePhotoUrl = (value, apiOrigin) => {
  const raw = Buffer.isBuffer(value) ? value.toString('utf8').trim() : (typeof value === 'string' ? value.trim() : '');
  if (!raw) return value;

  try {
    const parsed = new URL(raw, apiOrigin);
    const action = String(parsed.searchParams.get('action') || '').toLowerCase();
    const legacyPhoto = /\/api\/auth(?:\.php)?$/i.test(parsed.pathname) && action === 'profile_photo';
    const nodePhoto = /\/api\/auth\/profile-photo$/i.test(parsed.pathname);
    if (!legacyPhoto && !nodePhoto) return value;

    const userId = parsed.searchParams.get('user_id') || parsed.searchParams.get('id') || '';
    if (!/^\d+$/.test(userId) || Number(userId) <= 0) return value;

    const version = parsed.searchParams.get('v');
    return `${apiOrigin}/api/auth/profile-photo?user_id=${encodeURIComponent(userId)}${version ? `&v=${encodeURIComponent(version)}` : ''}`;
  } catch (_error) {
    return value;
  }
};

const normalizeLegacyProfilePhotoUrls = (value, apiOrigin, seen = new WeakSet()) => {
  const direct = normalizeLegacyProfilePhotoUrl(value, apiOrigin);
  if (direct !== value) return direct;
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeLegacyProfilePhotoUrls(item, apiOrigin, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeLegacyProfilePhotoUrls(item, apiOrigin, seen)])
  );
};

// Middleware
// ponytail: raised from Express's 100kb default — DTR's server-side PDF render posts the fully
// rendered print HTML (many employee cards × up to 31 day-rows each), which routinely exceeds that.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
// ponytail: plain stdout request log (method, path, status, ms) — no logging
// dependency, just enough to see what actually hit the server after the fact.
// Ceiling: not structured/greppable-by-field; swap for pino if volume grows.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedLocalOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS origin not allowed.'));
    },
    credentials: true,
  })
);
// ponytail: normalize legacy photo endpoints once for every JSON API response.
// Ceiling: streamed/binary responses bypass res.json and remain untouched.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  const apiOrigin = `${req.protocol}://${req.get('host')}`;
  res.json = (payload) => originalJson(normalizeLegacyProfilePhotoUrls(payload, apiOrigin));
  next();
});

const uploadsRoot = path.resolve(__dirname, '../../uploads');
const legacyUploadsRoot = path.resolve('C:/xampp/htdocs/SAMELCII_WEB_SYSTEM/SAMELCII_WEB_SYSTEM/uploads');
const missingUploadImage = path.resolve(__dirname, '../../assets/images/LOGO.png');

// Serve uploads directory from the project root so stored image paths match what the DB already has.
app.use('/uploads', express.static(uploadsRoot));
app.use('/uploads', express.static(legacyUploadsRoot));
app.use('/SAMELCII_WEB_SYSTEM/uploads', express.static(uploadsRoot));
app.use('/SAMELCII_WEB_SYSTEM/uploads', express.static(legacyUploadsRoot));
// ponytail: old DB image paths can outlive their files; use one neutral fallback.
// Ceiling: this covers raster images only. Restore the original upload to recover its real content.
app.get(/^\/(?:SAMELCII_WEB_SYSTEM\/)?uploads\/.*\.(?:jpe?g|png|webp)$/i, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(missingUploadImage);
});

// Routes
// Public routes (no auth required)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public/complaints', require('./routes/complaintsPublic'));

// Protected routes (auth required)
app.use('/api/dtr', verifyToken, require('./routes/dtr'));
app.use('/api/travel', verifyToken, require('./routes/travel'));
app.use('/api/fuel', verifyToken, require('./routes/fuel'));
app.use('/api/epass', verifyToken, require('./routes/epass'));
// HUWAG BAGUHIN: Messenger, SAM, at Membership must receive identity only from verified JWT claims.
app.use('/api/messenger', verifyToken, require('./routes/messenger'));
app.use('/api/sam', verifyToken, require('./routes/sam'));
app.use('/api/sam-server-status', verifyToken, require('./routes/samServerStatus'));
app.use('/api/membership', verifyToken, require('./routes/membership'));
app.use('/api/it-equipment', verifyToken, require('./routes/it_equipment'));
app.use('/api/warehouse', verifyToken, require('./routes/warehouse'));
app.use('/api/sidebar_layout', verifyToken, require('./routes/sidebar_layout'));
app.use('/api/menu_permissions', verifyToken, require('./routes/menu_permissions'));
app.use('/api/overtime', verifyToken, require('./routes/overtime'));
// HUWAG BAGUHIN: Payroll reuses the dashboard JWT and applies its own privilege-10 gate.
app.use('/api/payroll', verifyToken, require('./routes/payroll'));
app.use('/api/leave', verifyToken, require('./routes/leave'));
app.use('/api/holiday', verifyToken, require('./routes/holiday'));
app.use('/api/holiday_recommendations', verifyToken, require('./routes/holiday_recommendations'));
app.use('/api/me', verifyToken, require('./routes/me')); // employee self-service (my DTR/leave/fuel)
app.use('/api/signatory', verifyToken, require('./routes/signatory'));
app.use('/api/ai-chat', verifyToken, require('./routes/ai_chat'));
app.use('/api/complaints', verifyToken, require('./routes/complaints'));
app.use('/api/reconnections', verifyToken, require('./routes/reconnections'));

// Offline caching routes (auth required)
app.use('/api/offline', verifyToken, require('./routes/offline'));

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

app.locals.normalizeLegacyProfilePhotoUrls = normalizeLegacyProfilePhotoUrls;
module.exports = app;
