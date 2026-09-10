// Phase 7 security self-check: prevents Messenger, SAM, and Membership from regressing to client-controlled identity.
// EDIT GUIDE: add one focused assertion here whenever an approved Phase 7 identity rule changes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const app = read('backend/src/app.js');
const messenger = read('backend/src/routes/messenger.js');
const sam = read('backend/src/routes/sam.js');
const membership = read('backend/src/routes/membership.js');
const messengerClient = read('pages/modules/messenger/script.js');
const membershipClient = read('pages/modules/membership/index.html');

for (const route of ['messenger', 'sam', 'membership']) {
  assert(
    app.includes(`app.use('/api/${route}', verifyToken, require('./routes/${route}'))`),
    `${route} must be mounted behind verifyToken`
  );
}

const messengerIdentityBlock = messenger.slice(
  messenger.indexOf('const getUserId'),
  messenger.indexOf('const fetchUser')
);
// HUWAG BAGUHIN: request body/query values are data, never proof of user identity.
assert(!messengerIdentityBlock.includes('req.body'), 'Messenger identity must not trust request body');
assert(!messengerIdentityBlock.includes('req.query'), 'Messenger identity must not trust query string');
assert(messenger.includes('INNER JOIN conversationparticipants cp'), 'Messenger mutations must check participants');
assert(messenger.includes('You are not authorized to end this call.'), 'Call ending must reject outsiders');

assert(sam.includes('req.user?.id'), 'SAM must use the verified token user');
assert(!sam.includes('req.body.user_id'), 'SAM must ignore client-supplied user_id');
assert(!sam.includes('${err.message}'), 'SAM must not expose internal error details');

assert(!membership.includes('attachOptionalUser'), 'Membership must use the shared JWT middleware');
assert(!membership.toLowerCase().includes('x-samelcii-session'), 'Unsigned session headers must stay disabled');
assert(!membership.includes('payload.addedBy'), 'Membership audit actor must come from the token');

assert(messengerClient.includes('/sam/reply'), 'Messenger must call the protected SAM reply route');
assert(messengerClient.includes('headers: getAuthHeaders()'), 'SAM requests must include JWT headers');
assert(!messengerClient.includes('params.set("user_id"'), 'Messenger must not send identity in the query string');
assert(!messengerClient.includes('body.append("user_id"'), 'Messenger must not send identity in request bodies');
assert(!membershipClient.includes('await fetch(`${MEMBERSHIP_API}'), 'Membership requests must use membershipFetch');
assert(!membershipClient.includes('fetch(`${MEMBERSHIP_API}?action=save_fees'), 'Membership fee save must use membershipFetch');
assert(!membershipClient.includes('X-SAMELCII-Session'), 'Membership client must not send unsigned identity');

console.log('Phase 7 security self-check passed.');
