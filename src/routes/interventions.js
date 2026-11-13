const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const Intervention = require('../models/Intervention');
const Submission = require('../models/Submission');
const { ROLES } = require('../lib/rbac');
const { audit } = require('../lib/audit');
const { visibleStudent } = require('../lib/scope');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth(), requireRole(ROLES.STUDENT_COORDINATOR, ROLES.FACULTY_COORDINATOR));
const oid = (id) => { if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'INVALID_ID', 'Invalid id.'); return id; };
async function scoped(req, id) {
  const u = await visibleStudent(req.user, oid(id));
  if (!u) { await audit(req, 'FORBIDDEN_ACCESS', { targetId: id, meta: { path: req.originalUrl } }); throw new AppError(403, 'FORBIDDEN', 'You do not have access to this student.'); }
  return u;
}
router.post('/', wrap(async (req, res) => {
  const d = z.object({ studentId: z.string(), note: z.string().trim().min(3).max(1000), problemId: z.string().nullable().optional(), followUpDate: z.coerce.date().nullable().optional() }).strict().parse(req.body || {});
  const u = await scoped(req, d.studentId);
  const i = await Intervention.create({ studentId: u._id, coordinatorId: req.user.id, note: d.note, problemId: d.problemId || null, followUpDate: d.followUpDate || null });
  await audit(req, 'INTERVENTION_RECORDED', { targetId: u.id, meta: { intervention: i.id } });
  res.status(201).json({ data: { id: i.id } });
}));
router.get('/', wrap(async (req, res) => {
  const u = await scoped(req, String(req.query.studentId || ''));
  const items = await Intervention.find({ studentId: u._id }).sort({ createdAt: -1 }).populate('coordinatorId', 'fullName').lean(), subs = await Submission.find({ studentId: u._id, systemFailure: false }).select('verdict createdAt').lean(), DAY = 86400000;
  res.json({ data: { items: items.map((i) => { const t = new Date(i.createdAt).getTime(), rate = (a, b) => { const x = subs.filter((s) => s.createdAt >= a && s.createdAt < b); return x.length ? Math.round(100 * x.filter((s) => s.verdict === 'ACCEPTED').length / x.length) : null; };
    return { id: String(i._id), note: i.note, status: i.status, followUpDate: i.followUpDate, createdAt: i.createdAt, by: i.coordinatorId && i.coordinatorId.fullName, acceptancePctBefore14d: rate(new Date(t - 14 * DAY), new Date(t)), acceptancePctAfter14d: rate(new Date(t), new Date(t + 14 * DAY)) }; }) } });
}));
router.patch('/:id', wrap(async (req, res) => {
  const d = z.object({ status: z.enum(['OPEN', 'FOLLOWED_UP', 'CLOSED']) }).strict().parse(req.body || {});
  const i = await Intervention.findById(oid(req.params.id)); if (!i) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  await scoped(req, String(i.studentId)); i.status = d.status; await i.save(); res.json({ data: { ok: true } });
}));
module.exports = router;
