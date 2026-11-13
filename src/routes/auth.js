const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const crypto = require('crypto');
const config = require('../config');
const Invite = require('../models/Invite');
const User = require('../models/User');
const { ROLES } = require('../lib/rbac');
const policy = require('../lib/policy');
const { audit } = require('../lib/audit');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, sign, setCookie, clearCookie } = require('../middleware/auth');

const router = express.Router();
const BCRYPT_COST = 12;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
// Compared against when the user does not exist, so response time does not reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('nexora-dummy-password-1', BCRYPT_COST);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 100000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
});

const sha = (v) => crypto.createHash('sha256').update(String(v).trim().toUpperCase()).digest('hex');
const ROLE_MAP = { student: ROLES.STUDENT, coordinator: ROLES.STUDENT_COORDINATOR, faculty: ROLES.FACULTY_COORDINATOR };

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  usn: z.string().trim().transform(policy.normalizeUsn)
    .refine((v) => policy.USN_RE.test(v), 'Enter a valid USN or employee ID (6-20 letters and digits).'),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['student', 'coordinator', 'faculty']).default('student'),
  inviteCode: z.string().trim().max(40).optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
  section: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, 'Use 1-3 letters or digits.').optional(),
  password: z.string().max(200),
  terms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue.' }) }),
}).strict();

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional(),
}).strict();

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().max(200),
}).strict();

// Fields a client must never be able to set. Sending any of them is logged as a security event.
// Fields a client must never be able to set. Sending any of them is logged as a security event.
// `role` IS accepted, but only as a request: privileged roles are granted solely by redeeming a faculty-issued invite.
const FORBIDDEN_REGISTER_FIELDS = ['status', 'mustChangePassword', 'tokenVersion', 'profile', 'house'];

router.post('/register', authLimiter, wrap(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const attempted = FORBIDDEN_REGISTER_FIELDS.filter((k) => k in body);
  if (attempted.length) {
    await audit(req, 'PRIVILEGE_ESCALATION_ATTEMPT', { meta: { fields: attempted } });
    throw new AppError(400, 'UNEXPECTED_FIELDS', 'This request contains fields that are not allowed.');
  }
  const d = registerSchema.parse(body);
  const role = ROLE_MAP[d.role];
  if (role !== ROLES.FACULTY_COORDINATOR && (!d.semester || !d.section)) {
    throw new AppError(400, 'VALIDATION', 'Check the highlighted fields.', { semester: 'Select your semester and section.' });
  }
  const problems = policy.passwordProblems(d.password, { identifier: d.usn, email: d.email });
  if (problems.length) throw new AppError(400, 'WEAK_PASSWORD', problems[0], { password: problems.join(' ') });

  let invite = null;
  if (role !== ROLES.STUDENT) {
    const bad = async () => { await audit(req, 'INVITE_REJECTED', { meta: { role: d.role } }); return new AppError(403, 'INVALID_INVITE', 'This invite code is invalid, expired, already used, or for a different role.', { inviteCode: 'Ask your faculty coordinator for a new code.' }); };
    if (!d.inviteCode) throw await bad();
    // Atomic: only one request can ever consume a code.
    invite = await Invite.findOneAndUpdate({ codeHash: sha(d.inviteCode), role, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
    if (!invite) throw await bad();
  }
  const passwordHash = await bcrypt.hash(d.password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({
      fullName: d.fullName, identifier: d.usn, email: d.email, passwordHash, role,
      ...(role === ROLES.FACULTY_COORDINATOR ? {} : { semester: d.semester, section: d.section }),
    });
  } catch (e) { // e.g. duplicate USN: give the invite back
    if (invite) await Invite.updateOne({ _id: invite._id }, { $set: { usedAt: null } });
    throw e;
  }
  if (invite) await Invite.updateOne({ _id: invite._id }, { $set: { usedBy: user._id } });
  await audit(req, invite ? 'REGISTER_WITH_INVITE' : 'REGISTER', { actor: { id: user.id, role: user.role }, targetId: user.id, meta: invite ? { invite: String(invite._id), role } : {} });
  setCookie(res, sign(user, false), false);
  res.status(201).json({ data: { user: user.toPublic() } });
}));

router.post('/login', authLimiter, wrap(async (req, res) => {
  const d = loginSchema.parse(req.body || {});
  const user = await User.findOne({
    $or: [{ identifier: d.identifier.toUpperCase() }, { email: d.identifier.toLowerCase() }],
  }).select('+passwordHash');

  const passwordOk = await bcrypt.compare(d.password, user ? user.passwordHash : DUMMY_HASH);
  const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect USN/email or password.');

  if (!user) {
    await audit(req, 'LOGIN_FAILED', { meta: { reason: 'unknown_user' } });
    throw invalid();
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    await audit(req, 'LOGIN_LOCKED', { targetId: user.id });
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
  }
  if (!passwordOk) {
    await User.updateOne({ _id: user._id }, { $inc: { failedLoginCount: 1 } }); // atomic increment
    const updated = await User.findById(user._id).select('failedLoginCount');
    if (updated.failedLoginCount >= MAX_FAILED) {
      await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockUntil: new Date(Date.now() + LOCK_MS) } });
    }
    await audit(req, 'LOGIN_FAILED', { targetId: user.id, meta: { reason: 'bad_password' } });
    throw invalid();
  }
  if (user.status !== 'ACTIVE') {
    await audit(req, 'LOGIN_BLOCKED', { targetId: user.id, meta: { status: user.status } });
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active. Contact your faculty coordinator.');
  }

  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockUntil: null, lastLoginAt: new Date() } });
  const remember = d.remember === true;
  setCookie(res, sign(user, remember), remember);
  await audit(req, 'LOGIN_SUCCESS', { actor: { id: user.id, role: user.role }, targetId: user.id });
  res.json({ data: { user: user.toPublic(), mustChangePassword: user.mustChangePassword } });
}));

router.post('/logout', (req, res) => {
  clearCookie(res);
  res.json({ data: { ok: true } });
});

router.get('/me', requireAuth({ allowPasswordChange: true }), (req, res) => {
  res.json({ data: { user: req.user.doc.toPublic() } });
});

router.post('/change-password', requireAuth({ allowPasswordChange: true }), authLimiter, wrap(async (req, res) => {
  const d = changeSchema.parse(req.body || {});
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await bcrypt.compare(d.currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect.', { currentPassword: 'Incorrect password.' });
  }
  const problems = policy.passwordProblems(d.newPassword, { identifier: user.identifier, email: user.email });
  if (problems.length) throw new AppError(400, 'WEAK_PASSWORD', problems[0], { newPassword: problems.join(' ') });
  if (await bcrypt.compare(d.newPassword, user.passwordHash)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'Choose a password you have not used before.', { newPassword: 'Same as current password.' });
  }
  user.passwordHash = await bcrypt.hash(d.newPassword, BCRYPT_COST);
  user.mustChangePassword = false;
  user.tokenVersion += 1; // signs out every other session
  await user.save();
  setCookie(res, sign(user, false), false);
  await audit(req, 'PASSWORD_CHANGED', { targetId: user.id });
  res.json({ data: { user: user.toPublic() } });
}));

module.exports = router;
