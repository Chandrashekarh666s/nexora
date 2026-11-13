// Faculty-only administration: invites, section assignments, accounts, houses, audit log.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const Invite = require('../models/Invite');
const Assignment = require('../models/Assignment');
const Problem = require('../models/Problem');
const Intervention = require('../models/Intervention');
const AuditLog = require('../models/AuditLog');
const { ROLES } = require('../lib/rbac');
const { audit } = require('../lib/audit');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireRole(ROLES.FACULTY_COORDINATOR));
const oid = (id) => { if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'INVALID_ID', 'Invalid id.'); return id; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha = (v) => crypto.createHash('sha256').update(String(v).trim().toUpperCase()).digest('hex');

// --- invites: the only way a coordinator or faculty account can come into existence ---
router.post('/invites', wrap(async (req, res) => {
  const d = z.object({ role: z.enum(['coordinator', 'faculty']), note: z.string().trim().max(120).optional(), days: z.coerce.number().int().min(1).max(30).default(7) }).strict().parse(req.body || {});
  const code = 'NX-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const role = d.role === 'faculty' ? ROLES.FACULTY_COORDINATOR : ROLES.STUDENT_COORDINATOR;
  const inv = await Invite.create({ codeHash: sha(code), role, note: d.note || '', createdBy: req.user.id, expiresAt: new Date(Date.now() + d.days * 86400000) });
  await audit(req, 'INVITE_CREATED', { meta: { role, invite: inv.id } });
  res.status(201).json({ data: { code, role, expiresAt: inv.expiresAt, note: 'Shown once. Send it to the person privately.' } });
}));
router.get('/invites', wrap(async (req, res) => {
  const items = await Invite.find().sort({ createdAt: -1 }).limit(50).populate('usedBy', 'fullName identifier').lean();
  res.json({ data: { items: items.map((i) => ({ id: String(i._id), role: i.role, note: i.note, createdAt: i.createdAt, expiresAt: i.expiresAt,
    status: i.usedAt ? 'USED' : i.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE', usedBy: i.usedBy ? { name: i.usedBy.fullName, id: i.usedBy.identifier } : null })) } });
}));
router.delete('/invites/:id', wrap(async (req, res) => {
  await Invite.deleteOne({ _id: oid(req.params.id), usedAt: null });
  await audit(req, 'INVITE_REVOKED', { meta: { invite: req.params.id } });
  res.json({ data: { ok: true } });
}));

// --- coordinator -> section assignments ---
router.get('/assignments', wrap(async (req, res) => {
  const as = await Assignment.find().populate('coordinatorId', 'fullName identifier').lean();
  const out = [];
  for (const a of as) out.push({ id: String(a._id), coordinator: a.coordinatorId ? { id: String(a.coordinatorId._id), name: a.coordinatorId.fullName, identifier: a.coordinatorId.identifier } : null,
    semester: a.semester, section: a.section, students: await User.countDocuments({ role: ROLES.STUDENT, semester: a.semester, section: a.section }) });
  res.json({ data: { items: out } });
}));
router.post('/assignments', wrap(async (req, res) => {
  const d = z.object({ coordinatorId: z.string(), semester: z.coerce.number().int().min(1).max(8), section: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/) }).strict().parse(req.body || {});
  const c = await User.findOne({ _id: oid(d.coordinatorId), role: ROLES.STUDENT_COORDINATOR, status: 'ACTIVE' });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Active student coordinator not found.');
  const a = await Assignment.findOneAndUpdate({ coordinatorId: c._id, semester: d.semester, section: d.section }, { $setOnInsert: { createdBy: req.user.id } }, { upsert: true, new: true });
  await audit(req, 'SECTION_ASSIGNED', { targetId: c.id, meta: { semester: d.semester, section: d.section } });
  res.status(201).json({ data: { id: a.id } });
}));
router.delete('/assignments/:id', wrap(async (req, res) => {
  const a = await Assignment.findByIdAndDelete(oid(req.params.id));
  if (a) await audit(req, 'SECTION_UNASSIGNED', { targetId: a.coordinatorId, meta: { semester: a.semester, section: a.section } });
  res.json({ data: { ok: true } });
}));

// --- coordinator monitoring (activity, not just head-count) ---
router.get('/coordinators', wrap(async (req, res) => {
  const cs = await User.find({ role: ROLES.STUDENT_COORDINATOR }).lean(); const since = new Date(Date.now() - 30 * 86400000), out = [];
  for (const c of cs) {
    const as = await Assignment.find({ coordinatorId: c._id }).lean();
    const students = as.length ? await User.countDocuments({ role: ROLES.STUDENT, $or: as.map((a) => ({ semester: a.semester, section: a.section })) }) : 0;
    const [created, published, interventions, recentInt, audits] = await Promise.all([
      Problem.countDocuments({ createdBy: c._id }), Problem.countDocuments({ publishedBy: c._id }), Intervention.countDocuments({ coordinatorId: c._id }),
      Intervention.countDocuments({ coordinatorId: c._id, createdAt: { $gte: since } }), AuditLog.countDocuments({ actorId: c._id, createdAt: { $gte: since } })]);
    out.push({ id: String(c._id), name: c.fullName, identifier: c.identifier, status: c.status, lastLoginAt: c.lastLoginAt, sections: as.map((a) => `${a.semester}${a.section}`), students,
      problemsCreated: created, problemsPublished: published, interventions, interventions30d: recentInt, actions30d: audits });
  }
  res.json({ data: { items: out } });
}));

// --- accounts ---
router.get('/users', wrap(async (req, res) => {
  const q = z.object({ q: z.string().trim().max(64).optional(), role: z.nativeEnum(ROLES).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
  const f = {}; if (q.role) f.role = q.role;
  if (q.q) { const rx = new RegExp(esc(q.q), 'i'); f.$or = [{ fullName: rx }, { identifier: rx }, { email: rx }]; }
  const [items, total] = await Promise.all([User.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit), User.countDocuments(f)]);
  res.json({ data: { items: items.map((u) => u.toPublic()), page: q.page, limit: q.limit, total } });
}));
async function target(req) {
  const u = await User.findById(oid(req.params.id));
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found.');
  if (u.id === req.user.id) throw new AppError(400, 'SELF_ACTION', 'You cannot do this to your own account.');
  return u;
}
router.patch('/users/:id', wrap(async (req, res) => {
  const d = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), house: z.enum(['Turing', 'Ada', 'Hopper', 'Linus']).nullable().optional() }).strict().parse(req.body || {});
  const u = await target(req);
  if (d.status && d.status !== u.status) { u.status = d.status; if (d.status === 'SUSPENDED') u.tokenVersion += 1; await audit(req, d.status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED', { targetId: u.id }); }
  if ('house' in d) { u.profile = { ...(u.profile || {}), house: d.house }; await audit(req, 'HOUSE_ASSIGNED', { targetId: u.id, meta: { house: d.house } }); }
  await u.save(); res.json({ data: { user: u.toPublic() } });
}));
router.post('/users/:id/reset-password', wrap(async (req, res) => {
  const u = await target(req);
  const temp = 'Nx' + crypto.randomBytes(6).toString('hex') + '7';
  u.passwordHash = await bcrypt.hash(temp, 12); u.mustChangePassword = true; u.tokenVersion += 1; u.failedLoginCount = 0; u.lockUntil = null; await u.save();
  await audit(req, 'PASSWORD_RESET_BY_FACULTY', { targetId: u.id });
  res.json({ data: { temporaryPassword: temp, note: 'Shown once. The user must change it at next login.' } });
}));
router.post('/users/:id/revoke-coordinator', wrap(async (req, res) => {
  const u = await target(req);
  if (u.role !== ROLES.STUDENT_COORDINATOR) throw new AppError(400, 'NOT_COORDINATOR', 'This user is not a student coordinator.');
  u.role = ROLES.STUDENT; u.tokenVersion += 1; await u.save(); await Assignment.deleteMany({ coordinatorId: u._id });
  await audit(req, 'PRIVILEGE_REVOKED', { targetId: u.id });
  res.json({ data: { user: u.toPublic() } });
}));

router.get('/audit-logs', wrap(async (req, res) => {
  const q = z.object({ action: z.string().trim().max(60).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(req.query);
  const f = q.action ? { action: q.action } : {};
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('actorId', 'fullName identifier').populate('targetId', 'fullName identifier').lean(), AuditLog.countDocuments(f)]);
  res.json({ data: { items: items.map((l) => ({ id: String(l._id), action: l.action, at: l.createdAt, actor: l.actorId ? `${l.actorId.fullName} (${l.actorId.identifier})` : null, role: l.actorRole, target: l.targetId ? `${l.targetId.fullName} (${l.targetId.identifier})` : null, ip: l.ip, meta: l.meta })), page: q.page, total } });
}));
module.exports = router;
