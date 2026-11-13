// Failure intelligence + submission audit, from real records only. System failures are counted separately and NEVER blamed on students.
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const Attempt = require('../models/Attempt');
const Intervention = require('../models/Intervention');
const { ROLES } = require('../lib/rbac');
const stats = require('../lib/stats');
const { studentFilter } = require('../lib/scope');
const { loadProbs, topicBreakdown } = require('../lib/probs');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth(), requireRole(ROLES.STUDENT_COORDINATOR, ROLES.FACULTY_COORDINATOR));
const DAY = 86400000;

router.get('/overview', wrap(async (req, res) => {
  const students = await User.find(await studentFilter(req.user)).select('fullName identifier semester section').lean();
  const ids = students.map((s) => s._id), probs = await loadProbs();
  const subs = ids.length ? await Submission.find({ studentId: { $in: ids } }).select('-code').lean() : [];
  const by = {}; for (const s of subs) (by[s.studentId] || (by[s.studentId] = [])).push(s);
  const now = Date.now(), week = new Date(now - 7 * DAY), verdicts = {}; let systemFailures = 0;
  for (const s of subs) { if (s.systemFailure) { systemFailures++; continue; } verdicts[s.verdict] = (verdicts[s.verdict] || 0) + 1; }
  const real = subs.filter((s) => !s.systemFailure), acc = real.filter((s) => s.verdict === 'ACCEPTED').length;
  const inactive = [], repeated = [], sections = {};
  for (const u of students) {
    const m = by[u._id] || [], rm = m.filter((s) => !s.systemFailure), last = rm.length ? rm.reduce((a, s) => (s.createdAt > a ? s.createdAt : a), new Date(0)) : null;
    if (!last || last < week) inactive.push({ id: String(u._id), name: u.fullName, identifier: u.identifier, section: `${u.semester}${u.section}`, lastSubmissionAt: last });
    const per = {}; for (const s of rm) { const k = String(s.problemId); (per[k] || (per[k] = { fails: 0, ok: false })); if (s.verdict === 'ACCEPTED') per[k].ok = true; else per[k].fails++; }
    const stuck = Object.entries(per).filter(([, v]) => !v.ok && v.fails >= 3);
    if (stuck.length) repeated.push({ id: String(u._id), name: u.fullName, identifier: u.identifier, problems: stuck.map(([k, v]) => ({ title: (probs.get(k) || {}).title, fails: v.fails })) });
    const key = `${u.semester}${u.section}`, sec = sections[key] || (sections[key] = { section: key, students: 0, active7d: 0, subs: 0, accepted: 0 });
    sec.students++; if (last && last >= week) sec.active7d++; sec.subs += rm.length; sec.accepted += rm.filter((s) => s.verdict === 'ACCEPTED').length;
  }
  const topics = topicBreakdown(real, probs).filter((t) => t.attempts >= 3).slice(0, 5);
  const ints = await Intervention.find({ studentId: { $in: ids } }).lean(), measured = [];
  for (const i of ints) { // acceptance rate 14 days before vs after. Association only, not proof of cause.
    const m = (by[i.studentId] || []).filter((s) => !s.systemFailure), t = new Date(i.createdAt).getTime();
    const rate = (a, b) => { const x = m.filter((s) => s.createdAt >= a && s.createdAt < b); return x.length ? x.filter((s) => s.verdict === 'ACCEPTED').length / x.length : null; };
    const before = rate(new Date(t - 14 * DAY), new Date(t)), after = rate(new Date(t), new Date(t + 14 * DAY));
    if (before !== null && after !== null && t + 14 * DAY < now) measured.push(after - before);
  }
  res.json({ data: { totals: { students: students.length, active7d: students.length - inactive.length, submissions: real.length, acceptanceRate: real.length ? Math.round(1000 * acc / real.length) / 10 : 0, systemFailures },
    verdicts, inactive: inactive.slice(0, 50), repeatedFailures: repeated.slice(0, 50), weakTopics: topics,
    sections: Object.values(sections).map((s) => ({ ...s, acceptanceRate: s.subs ? Math.round(1000 * s.accepted / s.subs) / 10 : 0 })),
    interventions: { total: ints.length, measured: measured.length, avgAcceptanceChange: measured.length ? Math.round(1000 * measured.reduce((a, b) => a + b, 0) / measured.length) / 10 : null, note: 'Change in acceptance rate 14 days before vs after. This shows association, not cause.' } } });
}));

// Uploaded vs Not uploaded for one problem, limited to the actor's scope.
router.get('/problem/:id/audit', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'INVALID_ID', 'Invalid id.');
  const p = await Problem.findById(req.params.id).lean(); if (!p) throw new AppError(404, 'NOT_FOUND', 'Problem not found.');
  const students = await User.find({ $and: [await studentFilter(req.user), p.targetSemester ? { semester: p.targetSemester } : {}] }).select('fullName identifier semester section').lean();
  const ids = students.map((s) => s._id);
  const [subs, opens] = await Promise.all([Submission.find({ problemId: p._id, studentId: { $in: ids } }).select('-code').sort({ createdAt: -1 }).lean(), Attempt.find({ problemId: p._id, studentId: { $in: ids } }).lean()]);
  const sub = {}; for (const s of subs) (sub[s.studentId] || (sub[s.studentId] = [])).push(s);
  const opened = new Set(opens.map((o) => String(o.studentId))), passed = p.deadline && new Date(p.deadline) < new Date();
  const uploaded = [], notUploaded = [];
  for (const u of students) {
    const base = { id: String(u._id), name: u.fullName, identifier: u.identifier, semester: u.semester, section: u.section }, m = sub[u._id] || [], real = m.filter((s) => !s.systemFailure);
    if (real.length) { const l = real[0]; uploaded.push({ ...base, submissionId: String(l._id), submittedAt: l.createdAt, verdict: l.verdict, score: `${l.passed}/${l.total}`, attempts: real.length, late: !!(p.deadline && l.createdAt > p.deadline) }); continue; }
    let status = passed ? 'DEADLINE_MISSED' : opened.has(String(u._id)) ? 'PENDING' : 'NOT_ATTEMPTED';
    if (m.length) status = 'TECHNICAL_FAILURE'; // only system failures on record: not the student's fault
    notUploaded.push({ ...base, status, deadline: p.deadline });
  }
  res.json({ data: { problem: { id: String(p._id), title: p.title, deadline: p.deadline }, uploaded, notUploaded } });
}));
module.exports = router;
