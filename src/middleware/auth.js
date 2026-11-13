const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { AppError } = require('./errors');
const { audit } = require('../lib/audit');

const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };

// The token carries only the user id and a token version. Role and status are always read from the database.
function sign(user, remember) {
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: remember ? '30d' : '12h',
  });
}
function setCookie(res, token, remember) {
  res.cookie(config.cookieName, token, remember ? { ...cookieBase, maxAge: 30 * 24 * 3600 * 1000 } : cookieBase);
}
function clearCookie(res) { res.clearCookie(config.cookieName, cookieBase); }

function requireAuth(opts = {}) {
  return async (req, res, next) => {
    try {
      const token = req.cookies && req.cookies[config.cookieName];
      if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      let payload;
      try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); }
      catch { throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.'); }
      const user = await User.findById(payload.sub);
      if (!user || user.tokenVersion !== payload.tv) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
      }
      if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active.');
      req.user = { id: user._id.toString(), role: user.role, doc: user };
      if (user.mustChangePassword && !opts.allowPasswordChange) {
        throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password to continue.');
      }
      next();
    } catch (e) { next(e); }
  };
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      await audit(req, 'FORBIDDEN_ACCESS', { meta: { path: req.originalUrl, needed: roles } });
      return next(new AppError(403, 'FORBIDDEN', 'You do not have access to this resource.'));
    }
    next();
  };
}

module.exports = { sign, setCookie, clearCookie, requireAuth, requireRole };
