const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Intervention = require('../models/Intervention');
const { ROLES } = require('../lib/rbac');
const { audit } = require('../lib/audit');
const { studentFilter, visibleStudent } = require('../lib/scope');
const { loadProbs, studentStats, topicBreakdown } = require('../lib/probs');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const STAFF = [ROLES.STUDENT_COORDINATOR, ROLES.FACULTY_COORDINATOR];
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(64).optional(), semester: z.coerce.number().int().min(1).max(8).optional(), section: z.string().trim().toUpperCase().max(3).optional(),
});

// Faculty: every student and student coordinator. Coordinator: ONLY students of assigned sections (an unassigned coordinator sees nobody).
router.get('/', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => {
  const { page, limit, q, semester, section } = listQuery.parse(req.query);
  const and = [await studentFilter(req.user)];
  if (semester) and.push({ semester }); if (section) and.push({ section });
  if (q) { const rx = new RegExp(escapeRx(q), 'i'); and.push({ $or: [{ fullName: rx }, { identifier: rx }, { email: rx }] }); }
  const filter = { $and: and };
  const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
  const ids = items.map((u) => u._id);
  const subs = ids.length ? await Submission.find({ studentId: { $in: ids } }).select('studentId verdict problemId systemFailure createdAt').lean() : [];
  const by = {}; for (const s of subs) (by[s.studentId] || (by[s.studentId] = [])).push(s);
  res.json({ data: { items: items.map((u) => { const m = by[u._id] || []; const ok = new Set(m.filter((s) => s.verdict === 'ACCEPTED').map((s) => String(s.problemId)));
    return { ...u.toPublic(), solved: ok.size, submissions: m.length, lastSubmissionAt: m.length ? m.reduce((a, s) => (s.createdAt > a ? s.createdAt : a), new Date(0)) : null }; }), page, limit, total } });
}));

// Authorization first, lookup second. Students/coordinators get the same 403 for "not yours" and "does not exist".
router.get('/:id', requireAuth(), wrap(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'INVALID_ID', 'Invalid student id.');
  const self = String(req.user.id) === id;
  let user = null;
  if (self) user = await User.findById(id);
  else if (STAFF.includes(req.user.role)) user = await visibleStudent(req.user, id);
  if (!user) {
    await audit(req, 'FORBIDDEN_ACCESS', { targetId: id, meta: { path: req.originalUrl } });
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this profile.');
  }
  const st = await studentStats(user._id);
  const recent = st.subs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 15).map((s) => ({ id: String(s._id), problem: (st.probs.get(String(s.problemId)) || {}).title, verdict: s.verdict, passed: s.passed, total: s.total, language: s.language, at: s.createdAt, systemFailure: s.systemFailure }));
  const interventions = await Intervention.find({ studentId: user._id }).sort({ createdAt: -1 }).limit(20).lean();
  res.json({ data: { user: user.toPublic(), stats: { solved: st.solved, points: st.points, submissions: st.submissions, acceptanceRate: st.acceptanceRate, streak: st.streak, crown: st.crown }, topics: topicBreakdown(st.subs, st.probs), recent,
    interventions: self ? [] : interventions.map((i) => ({ id: String(i._id), note: i.note, status: i.status, followUpDate: i.followUpDate, createdAt: i.createdAt })) } });
}));

router.patch('/:id/house', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => {
  const d = z.object({ house: z.enum(['Turing', 'Ada', 'Hopper', 'Linus']).nullable() }).strict().parse(req.body || {});
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'INVALID_ID', 'Invalid student id.');
  const u = await visibleStudent(req.user, req.params.id);
  if (!u) { await audit(req, 'FORBIDDEN_ACCESS', { targetId: req.params.id, meta: { path: req.originalUrl } }); throw new AppError(403, 'FORBIDDEN', 'You do not have access to this profile.'); }
  u.profile = { ...(u.profile || {}), house: d.house }; await u.save();
  await audit(req, 'HOUSE_ASSIGNED', { targetId: u.id, meta: { house: d.house } });
  res.json({ data: { user: u.toPublic() } });
}));
module.exports = router;
