const express = require('express');
const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { ROLES } = require('../lib/rbac');
const stats = require('../lib/stats');
const { loadProbs, studentStats, topicBreakdown } = require('../lib/probs');
const { visibleStudent } = require('../lib/scope');
const { audit } = require('../lib/audit');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const CODERS = [ROLES.STUDENT, ROLES.STUDENT_COORDINATOR];

router.get('/dashboard', requireAuth(), requireRole(...CODERS), wrap(async (req, res) => {
  const st = await studentStats(req.user.id), subs = st.subs;
  const verdicts = {}; let system = 0;
  for (const s of subs) { if (s.systemFailure) { system++; continue; } verdicts[s.verdict] = (verdicts[s.verdict] || 0) + 1; }
  const weeks = []; // accepted per week, last 8 weeks (IST days)
  const today = stats.dayKey(new Date());
  for (let w = 7; w >= 0; w--) { const to = stats.addDays(today, -7 * w), from = stats.addDays(to, -6); weeks.push({ from, to, accepted: subs.filter((s) => { const k = stats.dayKey(s.createdAt); return s.verdict === 'ACCEPTED' && k >= from && k <= to; }).length }); }
  const trend = subs.filter((s) => s.verdict === 'ACCEPTED' && s.runtimeMs != null).sort((a, b) => a.createdAt - b.createdAt).slice(-10).map((s) => ({ at: s.createdAt, runtimeMs: s.runtimeMs, memoryKb: s.memoryKb }));
  const recent = [...subs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10).map((s) => ({ id: String(s._id), problem: (st.probs.get(String(s.problemId)) || {}).title, verdict: s.verdict, passed: s.passed, total: s.total, language: s.language, at: s.createdAt, systemFailure: s.systemFailure }));
  const easy = { ...st.solved }; delete easy.total;
  res.json({ data: { user: req.user.doc.toPublic(), stats: { solved: st.solved, distribution: easy, points: st.points, submissions: st.submissions, accepted: st.accepted, acceptanceRate: st.acceptanceRate, streak: st.streak, systemFailures: system },
    crown: st.crown, verdicts, topics: topicBreakdown(subs, st.probs), weeks, runtimeTrend: trend, recent, integrations: req.user.doc.integrations || {} } });
}));

// Real accepted-submission days (institution timezone) + clearly separate EXTERNAL public activity. Logins never count.
router.get('/activity', requireAuth(), wrap(async (req, res) => {
  let sid = req.user.id, user = req.user.doc;
  if (req.query.studentId && req.query.studentId !== req.user.id) {
    if (!mongoose.isValidObjectId(req.query.studentId)) throw new AppError(400, 'INVALID_ID', 'Invalid id.');
    user = await visibleStudent(req.user, req.query.studentId);
    if (!user) { await audit(req, 'FORBIDDEN_ACCESS', { targetId: req.query.studentId, meta: { path: req.originalUrl } }); throw new AppError(403, 'FORBIDDEN', 'You do not have access to this student.'); }
    sid = user.id;
  }
  const since = new Date(Date.now() - 372 * 86400000);
  const subs = await Submission.find({ studentId: sid, verdict: 'ACCEPTED', createdAt: { $gte: since } }).select('createdAt').lean();
  const days = {}; for (const s of subs) { const k = stats.dayKey(s.createdAt); days[k] = (days[k] || 0) + 1; }
  const i = user.integrations || {};
  res.json({ data: { timezoneOffsetMin: require('../config').tzOffsetMin, days, external: { github: (i.github && i.github.activeDays) || [], leetcode: (i.leetcode && i.leetcode.activeDays) || [] } } });
}));
module.exports = router;
