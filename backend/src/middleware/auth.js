/**
 * Purpose: Verify signed Node API identities and enforce privilege checks.
 * EDIT GUIDE: Accept only signed JWTs from the Bearer header or HttpOnly login cookie.
 * HUWAG BAGUHIN: Never trust identity or privilege data supplied as plain JSON headers.
 * Tagalog: Signed token lang ang patunay ng login; bawal ang gawa-gawang session header.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { unauthorizedResponse, forbiddenResponse } = require('../utils/response');

const cookieToken = (req) => {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.find((cookie) => cookie.trim().startsWith('samelcii_token='));
  return entry ? decodeURIComponent(entry.trim().slice('samelcii_token='.length)) : '';
};

const verifyToken = (req, res, next) => {
  try {
    const authorization = String(req.headers.authorization || '').trim();
    const match = authorization.match(/^Bearer\s+(\S+)$/i);
    const token = match?.[1] || cookieToken(req);

    if (!token) {
      return unauthorizedResponse(res, 'No token provided.');
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return unauthorizedResponse(res, 'Token expired.');
    }
    return unauthorizedResponse(res, 'Invalid token.');
  }
};

const requireLogin = (req, res, next) => {
  if (!req.user) {
    return unauthorizedResponse(res);
  }
  next();
};

const requirePrivilege = (minPrivilege) => {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorizedResponse(res);
    }

    const privilege = Number.parseInt(req.user.privilage, 10);
    if (!Number.isInteger(privilege) || privilege < minPrivilege) {
      return forbiddenResponse(res);
    }

    next();
  };
};

const generateToken = (user) => {
  return jwt.sign(user, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

module.exports = {
  verifyToken,
  requireLogin,
  requirePrivilege,
  generateToken,
};
