const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const { ROLES } = require('../lib/rbac');
const { audit } = require('../lib/audit');
const { studentFilter, visibleStudent } = require('../lib/scope');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const STAFF = [ROLES.STUDENT_COORDINATOR, ROLES.FACULTY_COORDINATOR];
const q = z.object({ studentId: z.string().optional(), problemId: z.string().optional(), verdict: z.string().max(30).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });

// Students: only their own. Staff: only students inside their scope. Never includes source code (see /:id).
router.get('/', requireAuth(), wrap(async (req, res) => {
  const d = q.parse(req.query); const f = {};
  for (const k of ['studentId', 'problemId']) if (d[k] && !mongoose.isValidObjectId(d[k])) throw new AppError(400, 'INVALID_ID', 'Invalid id.');
  if (STAFF.includes(req.user.role) && d.studentId && d.studentId !== req.user.id) {
    if (!(await visibleStudent(req.user, d.studentId))) { await audit(req, 'FORBIDDEN_ACCESS', { targetId: d.studentId, meta: { path: req.originalUrl } }); throw new AppError(403, 'FORBIDDEN', 'You do not have access to this student.'); }
    f.studentId = d.studentId;
  } else if (STAFF.includes(req.user.role) && !d.studentId && req.query.scope === 'all') {
    f.studentId = { $in: (await User.find(await studentFilter(req.user)).select('_id').lean()).map((u) => u._id) };
  } else f.studentId = req.user.id;
  if (d.problemId) f.problemId = d.problemId; if (d.verdict) f.verdict = d.verdict;
  const [items, total] = await Promise.all([Submission.find(f).select('-code').sort({ createdAt: -1 }).skip((d.page - 1) * d.limit).limit(d.limit).populate('problemId', 'title difficulty').populate('studentId', 'fullName identifier semester section').lean(), Submission.countDocuments(f)]);
  res.json({ data: { items: items.map((s) => ({ id: String(s._id), problem: s.problemId && s.problemId.title, difficulty: s.problemId && s.problemId.difficulty, student: s.studentId && { id: String(s.studentId._id), name: s.studentId.fullName, identifier: s.studentId.identifier, semester: s.studentId.semester, section: s.studentId.section },
    language: s.language, verdict: s.verdict, passed: s.passed, total: s.total, runtimeMs: s.runtimeMs, memoryKb: s.memoryKb, attempt: s.attempt, systemFailure: s.systemFailure, at: s.createdAt })), page: d.page, total } });
}));

router.get('/:id', requireAuth(), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'INVALID_ID', 'Invalid id.');
  const s = await Submission.findById(req.params.id).populate('problemId', 'title difficulty').lean();
  let ok = !!s && String(s.studentId) === req.user.id;
  if (s && !ok && STAFF.includes(req.user.role)) ok = !!(await visibleStudent(req.user, s.studentId));
  if (!s || !ok) { await audit(req, 'FORBIDDEN_ACCESS', { meta: { path: req.originalUrl } }); throw new AppError(403, 'FORBIDDEN', 'You do not have access to this submission.'); }
  if (String(s.studentId) !== req.user.id) await audit(req, 'SUBMISSION_CODE_VIEWED', { targetId: s.studentId, meta: { submission: String(s._id) } });
  res.json({ data: { submission: { id: String(s._id), problem: s.problemId && s.problemId.title, language: s.language, code: s.code, verdict: s.verdict, passed: s.passed, total: s.total, runtimeMs: s.runtimeMs, memoryKb: s.memoryKb, attempt: s.attempt, elapsedSec: s.elapsedSec, systemFailure: s.systemFailure, at: s.createdAt } } });
}));
module.exports = router;
