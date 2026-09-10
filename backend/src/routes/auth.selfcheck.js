/**
 * Purpose: Non-mutating HTTP contract checks for Node Auth routes.
 * EDIT GUIDE: Run with `node src/routes/auth.selfcheck.js`.
 * HUWAG BAGUHIN: Tests must never register users or change passwords.
 * Tagalog: Login errors at access checks lang ito; walang binabago sa employee records.
 */
const assert = require('assert');
const app = require('../app');
const authService = require('../services/authService');

// Pure check for the registration-approval gate (no DB): a freshly self-registered row must
// stay blocked from login, and pre-existing rows (registration_pending absent/0/false/'0') must
// not be affected — this is a bit flip that must never accidentally lock out the other ~250
// already-registered employees.
assert.strictEqual(authService.isRegistrationPending({ registration_pending: 1 }), true);
assert.strictEqual(authService.isRegistrationPending({ registration_pending: 0 }), false);
assert.strictEqual(authService.isRegistrationPending({ registration_pending: '0' }), false);
assert.strictEqual(authService.isRegistrationPending({}), false);

const run = async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api/auth`;

    const wrongMethod = await fetch(`${base}?action=login`);
    assert.strictEqual(wrongMethod.status, 405);

    const emptyLogin = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(emptyLogin.status, 422);

    const publicMe = await fetch(`${base}?action=me`);
    assert.strictEqual(publicMe.status, 401);

    const publicReset = await fetch(`${base}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'anyone', password: 'not-used' }),
    });
    assert.strictEqual(publicReset.status, 403);

    // Registration-approval admin queue must never be reachable without a token — this is the
    // gate that closes the account-takeover hole, so an auth bypass here would be as bad as
    // the original bug.
    const pendingList = await fetch(`${base}/pending-registrations`);
    assert.strictEqual(pendingList.status, 401);

    const approveNoAuth = await fetch(`${base}/approve-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usercode: 'anyone' }),
    });
    assert.strictEqual(approveNoAuth.status, 401);

    const rejectNoAuth = await fetch(`${base}/reject-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usercode: 'anyone' }),
    });
    assert.strictEqual(rejectNoAuth.status, 401);

    console.log('auth route selfcheck: passed');
  } finally {
    server.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
