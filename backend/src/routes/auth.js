/**
 * Purpose: Node authentication, registration, identity, and profile-photo routes.
 * EDIT GUIDE: Password recovery must use a separately approved, expiring recovery proof.
 * HUWAG BAGUHIN: Never reset a password using only a public username or employee number.
 * Tagalog: Naka-disable ang lumang public reset dahil kayang palitan noon ang password ng iba.
 */
const express = require('express');
const authService = require('../services/authService');
const { verifyToken, requirePrivilege } = require('../middleware/auth');
const { uploadProfilePhoto } = require('../middleware/fileUpload');
const { successResponse, badRequestResponse, unauthorizedResponse, forbiddenResponse, notFoundResponse, conflictResponse, unprocessableEntityResponse } = require('../utils/response');
const { sanitizeString, isEmptyString, sanitizeEmail, validateEmail } = require('../utils/validation');

const router = express.Router();
const LOGIN_COOKIE = 'samelcii_token';
const LOGIN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const loginCookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: req.secure,
  path: '/',
  maxAge: LOGIN_COOKIE_MAX_AGE,
});

const clearLoginCookie = (req, res) => res.clearCookie(LOGIN_COOKIE, {
  httpOnly: true,
  sameSite: 'lax',
  secure: req.secure,
  path: '/',
});

const methodAllowed = (req, res, methods) => {
  if (methods.includes(req.method)) {
    return true;
  }
  res.set('Allow', methods.join(', '));
  res.status(405).json({ ok: false, message: 'Method not allowed.' });
  return false;
};

const searchOptions = (query = {}) => ({
  query: sanitizeString(query.q || ''),
  department: sanitizeString(query.department || ''),
  approversOnly: Number.parseInt(query.approvers_only, 10) === 1,
  page: Number.parseInt(query.page, 10) || 1,
  limit: Number.parseInt(query.limit, 10) || 30,
});

const loginResponse = async (req, res) => {
  const { username, password } = req.body || {};
  if (isEmptyString(username) || isEmptyString(password)) {
    return unprocessableEntityResponse(res, 'Missing username or password.');
  }

  const user = await authService.getUserByUsername(username);
  if (!user || !await authService.isPasswordValid(password, user.password)) {
    return unauthorizedResponse(res, 'Invalid username or password.');
  }
  if (authService.isRegistrationPending(user)) {
    return forbiddenResponse(res, 'Your registration is pending admin approval. Please check back later or contact IT.');
  }

  const token = authService.createLoginToken(user);
  res.cookie(LOGIN_COOKIE, token, loginCookieOptions(req));
  return successResponse(res, {
    message: 'Login successful.',
    token,
    user: authService.serializeUser(user),
  });
};

const registerResponse = async (req, res) => {
  const { usercode, username, password } = req.body || {};
  const cleanUsername = sanitizeString(username || '');
  if (isEmptyString(usercode) || isEmptyString(cleanUsername) || isEmptyString(password)) {
    return unprocessableEntityResponse(res, 'Missing required fields.');
  }
  if (cleanUsername.length < 3 || cleanUsername.length > 50 || String(password).length < 8 || String(password).length > 128) {
    return unprocessableEntityResponse(res, 'Username must be 3-50 characters and password must be 8-128 characters.');
  }

  const employee = await authService.getUserByUsercode(sanitizeString(usercode));
  if (!employee) {
    return notFoundResponse(res, 'Employee ID not found.');
  }
  if (!isEmptyString(employee.username)) {
    return conflictResponse(res, 'Employee is already registered.');
  }
  if (await authService.checkUsernameExists(cleanUsername)) {
    return conflictResponse(res, 'Username is already taken.');
  }

  await authService.registerUser(employee.Id, cleanUsername, password);
  return successResponse(res, { message: 'Registration successful.' });
};

const handleAuthAction = async (req, res, next) => {
  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();

    if (!action) {
      return next();
    }

    if (action === 'login') {
      return methodAllowed(req, res, ['POST']) ? await loginResponse(req, res) : undefined;
    }

    if (action === 'register') {
      return methodAllowed(req, res, ['POST']) ? await registerResponse(req, res) : undefined;
    }

    if (action === 'reset_password') {
      return methodAllowed(req, res, ['POST'])
        ? forbiddenResponse(res, 'Public password reset is disabled. Contact an administrator.')
        : undefined;
    }

    if (action === 'search_employee') {
      if (!methodAllowed(req, res, ['GET'])) {
        return undefined;
      }
      return successResponse(res, await authService.searchEmployees(searchOptions(req.query)));
    }

    if (action === 'logout') {
      if (!methodAllowed(req, res, ['POST'])) {
        return undefined;
      }
      return verifyToken(req, res, () => {
        clearLoginCookie(req, res);
        return successResponse(res, { message: 'Logout successful.' });
      });
    }

    if (action === 'me') {
      if (!methodAllowed(req, res, ['GET'])) {
        return undefined;
      }
      return verifyToken(req, res, async () => {
        try {
          const current = await authService.getUserById(req.user.id);
          return current
            ? successResponse(res, { user: authService.serializeUser(current) })
            : unauthorizedResponse(res);
        } catch (error) {
          return next(error);
        }
      });
    }

    return badRequestResponse(res, 'Invalid action.');
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    return await loginResponse(req, res);
  } catch (error) {
    next(error);
  }
});

router.all('/', handleAuthAction);

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    return await registerResponse(req, res);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    return forbiddenResponse(res, 'Public password reset is disabled. Contact an administrator.');
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/search-employee?q=term
router.get('/search-employee', async (req, res, next) => {
  try {
    return successResponse(res, await authService.searchEmployees(searchOptions(req.query)));
  } catch (error) {
    next(error);
  }
});

// GET/HEAD /api/auth/profile-photo?user_id=123
router.get('/profile-photo', async (req, res, next) => {
  try {
    const userId = Number.parseInt(req.query.user_id || req.query.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return notFoundResponse(res);
    }

    const photo = await authService.getProfilePhoto(userId);
    if (!photo) {
      return notFoundResponse(res);
    }

    if (photo.profile_photo_blob?.length) {
      res.set({
        'Content-Type': photo.profile_photo_mime || 'image/jpeg',
        'Content-Length': photo.profile_photo_blob.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      if (photo.profile_photo_updated_at) {
        res.set('Last-Modified', new Date(photo.profile_photo_updated_at).toUTCString());
      }
      return res.send(photo.profile_photo_blob);
    }

    const storedUrl = String(photo.profile_photo_url || '').trim();
    if (storedUrl && !/[?&]action=profile_photo(?:&|$)/i.test(storedUrl)) {
      return res.redirect(302, storedUrl);
    }
    return res.redirect(302, `/SAMELCII_WEB_SYSTEM/assets/images/${userId % 2 === 0 ? 'avatar-male.jpg' : 'avatar-female.jpg'}`);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/upload-profile-photo
router.post('/upload-profile-photo', verifyToken, uploadProfilePhoto, async (req, res, next) => {
  try {
    if (!req.file) {
      return unprocessableEntityResponse(res, 'Choose a profile photo first.');
    }

    const userId = req.user.id;
    if (!userId || userId <= 0) {
      return unauthorizedResponse(res);
    }

    const fileName = req.file.filename;
    const photoUrl = `/uploads/profile-photos/${fileName}`;

    const updated = await authService.updateUserProfilePhoto(userId, photoUrl);

    if (!updated) {
      return notFoundResponse(res, 'Employee account was not found for this profile photo.');
    }

    return successResponse(res, { profile_photo_url: photoUrl });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/update-profile — self-service contact info only (mobile_number, emailadd).
// Name/position/department stay HR-of-record, edited only via payroll.js's HR profile route.
router.post('/update-profile', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    if (!userId || userId <= 0) {
      return unauthorizedResponse(res);
    }

    const mobileNumber = sanitizeString(req.body.mobile_number || '', 20);
    const email = sanitizeEmail(req.body.email || '');
    if (email && !validateEmail(email)) {
      return badRequestResponse(res, 'Enter a valid email address.');
    }

    const updated = await authService.updateUserContactInfo(userId, { mobileNumber, email });
    if (!updated) {
      return notFoundResponse(res, 'Employee account was not found.');
    }

    const user = await authService.getUserById(userId);
    return successResponse(res, { message: 'Profile updated.', user: authService.serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/pending-registrations — admin-only queue for the registration-approval gate.
router.get('/pending-registrations', verifyToken, requirePrivilege(10), async (req, res, next) => {
  try {
    return successResponse(res, { items: await authService.listPendingRegistrations() });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/approve-registration { usercode }
router.post('/approve-registration', verifyToken, requirePrivilege(10), async (req, res, next) => {
  try {
    const usercode = sanitizeString(req.body?.usercode || '');
    if (isEmptyString(usercode)) {
      return unprocessableEntityResponse(res, 'Missing usercode.');
    }
    const approved = await authService.approveRegistration(usercode);
    if (!approved) {
      return notFoundResponse(res, 'No pending registration found for that employee.');
    }
    return successResponse(res, { message: 'Registration approved.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reject-registration { usercode } — clears the attempt so the real employee can
// try again; use this when the claimed registration looks wrong/suspicious.
router.post('/reject-registration', verifyToken, requirePrivilege(10), async (req, res, next) => {
  try {
    const usercode = sanitizeString(req.body?.usercode || '');
    if (isEmptyString(usercode)) {
      return unprocessableEntityResponse(res, 'Missing usercode.');
    }
    const rejected = await authService.rejectRegistration(usercode);
    if (!rejected) {
      return notFoundResponse(res, 'No pending registration found for that employee.');
    }
    return successResponse(res, { message: 'Registration rejected.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', verifyToken, (req, res) => {
  clearLoginCookie(req, res);
  return successResponse(res, { message: 'Logout successful.' });
});

// GET /api/auth/me - Get current user from token
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.id);
    return user
      ? successResponse(res, { user: authService.serializeUser(user) })
      : unauthorizedResponse(res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
