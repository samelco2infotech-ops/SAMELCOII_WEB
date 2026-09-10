// Self-check for the production JWT_SECRET fail-closed guard (env.js). Spawns a fresh `node`
// process per case (env.js validates at require-time, so it can't be re-required in-process
// with different env vars). Run: node src/config/env.selfcheck.js
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const envPath = path.join(__dirname, 'env.js');

// NODE_ENV/JWT_SECRET are set directly as OS env vars on the child process, which dotenv.config()
// never overrides (it only fills in vars that aren't already set) — so these test values win
// regardless of whatever backend/.env actually contains.
function tryLoad(extraEnv) {
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(envPath)})`], {
      env: { ...process.env, ...extraEnv },
      stdio: 'pipe',
    });
    return { threw: false };
  } catch (error) {
    return { threw: true, message: String(error.stderr || error.message) };
  }
}

// The exact placeholder that shipped in backend/.env — must be rejected in production, not
// just accepted because it happens to be 53 characters long.
const placeholderResult = tryLoad({
  NODE_ENV: 'production',
  JWT_SECRET: 'your_super_secret_jwt_key_change_this_in_production',
});
assert.strictEqual(placeholderResult.threw, true, 'placeholder-shaped secret must be rejected in production');

// A differently-worded but still-a-placeholder secret should also be caught by the heuristic,
// not just the one exact string that happened to leak into prod.
const otherPlaceholder = tryLoad({ NODE_ENV: 'production', JWT_SECRET: 'YOUR_SECRET_KEY_HERE_PLEASE_CHANGE' });
assert.strictEqual(otherPlaceholder.threw, true, 'other placeholder-shaped secrets must be rejected too');

// A real random secret must be accepted (the guard shouldn't cry wolf on legitimate values).
const realSecret = tryLoad({
  NODE_ENV: 'production',
  JWT_SECRET: 'f3a1c9e7b2d4568091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
});
assert.strictEqual(realSecret.threw, false, `real secret must be accepted: ${realSecret.message || ''}`);

// Outside production the guard doesn't fire at all — dev machines keep working unauthenticated.
const devMode = tryLoad({ NODE_ENV: 'development', JWT_SECRET: 'change_me' });
assert.strictEqual(devMode.threw, false, 'guard must not fire outside production');

console.log('env.js JWT_SECRET guard self-check: OK');
