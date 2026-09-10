/**
 * Purpose: Minimal runnable checks for the Node authentication trust boundary.
 * EDIT GUIDE: Run with `node src/middleware/auth.selfcheck.js`.
 * HUWAG BAGUHIN: The forged session-header assertion must remain unauthorized.
 * Tagalog: Tinitiyak nitong hindi makakapagkunwaring user gamit ang simpleng JSON header.
 */
const assert = require('assert');
const { generateToken, verifyToken, requirePrivilege, startSession, endSession } = require('./auth');

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const runMiddleware = (middleware, req) => {
  const res = createResponse();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
};

const forged = runMiddleware(verifyToken, {
  headers: {
    'x-samelcii-session': JSON.stringify({ usercode: 'FAKE', privilage: 10 }),
  },
});
assert.strictEqual(forged.nextCalled, false);
assert.strictEqual(forged.res.statusCode, 401);

const token = generateToken({ id: 1, usercode: 'S2-001', privilage: 6 });
const verifiedRequest = { headers: { authorization: `Bearer ${token}` } };
const verified = runMiddleware(verifyToken, verifiedRequest);
assert.strictEqual(verified.nextCalled, true);
assert.strictEqual(verifiedRequest.user.usercode, 'S2-001');

const malformed = runMiddleware(verifyToken, {
  headers: { authorization: `Basic ${token}` },
});
assert.strictEqual(malformed.res.statusCode, 401);

const invalidPrivilege = runMiddleware(requirePrivilege(6), {
  user: { privilage: 'not-a-number' },
});
assert.strictEqual(invalidPrivilege.res.statusCode, 403);

// [FEATURE] Single active session per account: a second login supersedes the first token.
const sidA = startSession('S2-SINGLE');
const tokenA = generateToken({ id: 2, usercode: 'S2-SINGLE', privilage: 6, sid: sidA });
const firstLogin = runMiddleware(verifyToken, { headers: { authorization: `Bearer ${tokenA}` } });
assert.strictEqual(firstLogin.nextCalled, true);

const sidB = startSession('S2-SINGLE');
const tokenB = generateToken({ id: 2, usercode: 'S2-SINGLE', privilage: 6, sid: sidB });

const staleLogin = runMiddleware(verifyToken, { headers: { authorization: `Bearer ${tokenA}` } });
assert.strictEqual(staleLogin.nextCalled, false);
assert.strictEqual(staleLogin.res.statusCode, 401);

const secondLogin = runMiddleware(verifyToken, { headers: { authorization: `Bearer ${tokenB}` } });
assert.strictEqual(secondLogin.nextCalled, true);

endSession('S2-SINGLE', sidB);
const afterLogout = runMiddleware(verifyToken, { headers: { authorization: `Bearer ${tokenB}` } });
assert.strictEqual(afterLogout.nextCalled, false);

console.log('auth.selfcheck: passed');
