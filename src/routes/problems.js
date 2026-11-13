const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const Attempt = require('../models/Attempt');
const { ROLES } = require('../lib/rbac');
const judge = require('../lib/judge0');
const { audit } = require('../lib/audit');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const STAFF = [ROLES.STUDENT_COORDINATOR, ROLES.FACULTY_COORDINATOR];
const CODERS = [ROLES.STUDENT, ROLES.STUDENT_COORDINATOR]; // coordinators are students too
const isFac = (u) => u.role === ROLES.FACULTY_COORDINATOR;
const oid = (id) => { if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'INVALID_ID', 'Invalid id.'); return id; };

const body = z.object({
  title: z.string().trim().min(3).max(120), statement: z.string().trim().min(10).max(8000),
  inputFormat: z.string().max(2000).default(''), outputFormat: z.string().max(2000).default(''), constraints: z.string().max(2000).default(''),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']), subject: z.string().trim().max(60).default(''), topic: z.string().trim().min(1).max(60).default('General'),
  examples: z.array(z.object({ input: z.string().max(2000), output: z.string().max(2000), explanation: z.string().max(1000).default('') })).max(5).default([]),
  tests: z.array(z.object({ input: z.string().max(10000).default(''), expected: z.string().max(10000), hidden: z.boolean().default(false) })).min(1).max(30)
    .refine((t) => t.some((x) => !x.hidden), 'Add at least one public sample test.'),
  targetSemester: z.coerce.number().int().min(1).max(8).nullable().default(null), targetSeconds: z.coerce.number().int().min(60).max(14400).default(1800),
}).strict();

const submitLimiter = rateLimit({ windowMs: 60000, limit: config.isTest ? 100000 : 10, keyGenerator: (req) => 'u' + req.user.id, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Slow down: at most 10 runs/submits per minute.' } } });

// ---- staff: manage ----
router.get('/manage/list', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => {
  const f = isFac(req.user) ? {} : { $or: [{ createdBy: req.user.id }, { status: 'PUBLISHED' }] };
  const ps = await Problem.find(f).sort({ createdAt: -1 }).limit(200).populate('createdBy', 'fullName').lean();
  res.json({ data: { items: ps.map((p) => ({ id: String(p._id), title: p.title, difficulty: p.difficulty, topic: p.topic, status: p.status, deadline: p.deadline, createdBy: p.createdBy && p.createdBy.fullName, mine: String(p.createdBy && p.createdBy._id) === req.user.id, tests: p.tests.length })) } });
}));
router.post('/', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => {
  const p = await Problem.create({ ...body.parse(req.body || {}), createdBy: req.user.id });
  await audit(req, 'PROBLEM_CREATED', { meta: { problem: p.id } });
  res.status(201).json({ data: { problem: p.toStaff() } });
}));
async function ownedProblem(req) {
  const p = await Problem.findById(oid(req.params.id));
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Problem not found.');
  if (!isFac(req.user) && String(p.createdBy) !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'You can only change your own problems.');
  return p;
}
router.get('/:id/manage', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => res.json({ data: { problem: (await ownedProblem(req)).toStaff() } })));
router.patch('/:id', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => {
  const p = await ownedProblem(req);
  if (p.status === 'PUBLISHED' && !isFac(req.user)) throw new AppError(403, 'FORBIDDEN', 'Published problems can only be edited by faculty.');
  Object.assign(p, body.parse(req.body || {})); await p.save();
  await audit(req, 'PROBLEM_EDITED', { meta: { problem: p.id } });
  res.json({ data: { problem: p.toStaff() } });
}));
router.post('/:id/publish', requireAuth(), requireRole(...STAFF), wrap(async (req, res) => {
  const d = z.object({ deadline: z.coerce.date().nullable().optional() }).strict().parse(req.body || {});
  const p = await ownedProblem(req);
  p.status = 'PUBLISHED'; p.publishedBy = req.user.id; p.publishedAt = new Date(); if (d.deadline !== undefined) p.deadline = d.deadline; await p.save();
  await audit(req, 'PROBLEM_PUBLISHED', { meta: { problem: p.id, deadline: p.deadline } });
  res.json({ data: { problem: p.toStaff() } });
}));
router.post('/:id/unpublish', requireAuth(), requireRole(ROLES.FACULTY_COORDINATOR), wrap(async (req, res) => {
  const p = await Problem.findByIdAndUpdate(oid(req.params.id), { $set: { status: 'DRAFT' } }, { new: true });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Problem not found.');
  await audit(req, 'PROBLEM_UNPUBLISHED', { meta: { problem: p.id } });
  res.json({ data: { problem: p.toStaff() } });
}));

// ---- students (and coordinators acting as students) ----
router.get('/', requireAuth(), requireRole(...CODERS), wrap(async (req, res) => {
  const me = req.user.doc, f = { status: 'PUBLISHED', $or: [{ targetSemester: null }, { targetSemester: me.semester }] };
  const ps = await Problem.find(f).sort({ publishedAt: -1 }).limit(200).lean();
  const subs = await Submission.find({ studentId: me._id, problemId: { $in: ps.map((p) => p._id) } }).select('problemId verdict systemFailure').lean();
  const st = {}; for (const s of subs) { if (s.systemFailure) continue; const k = String(s.problemId); st[k] = st[k] === 'SOLVED' || s.verdict === 'ACCEPTED' ? 'SOLVED' : 'ATTEMPTED'; }
  res.json({ data: { items: ps.map((p) => ({ id: String(p._id), title: p.title, difficulty: p.difficulty, topic: p.topic, subject: p.subject, deadline: p.deadline, publishedAt: p.publishedAt, status: st[String(p._id)] || 'NEW' })) } });
}));
router.get('/:id', requireAuth(), requireRole(...CODERS), wrap(async (req, res) => {
  const p = await Problem.findOne({ _id: oid(req.params.id), status: 'PUBLISHED', $or: [{ targetSemester: null }, { targetSemester: req.user.doc.semester }] });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Problem not found.');
  await Attempt.updateOne({ studentId: req.user.id, problemId: p._id }, { $setOnInsert: { openedAt: new Date() } }, { upsert: true }); // server-side clock for Timeliness
  const mine = await Submission.find({ studentId: req.user.id, problemId: p._id }).sort({ createdAt: -1 }).limit(20).select('-code').lean();
  res.json({ data: { problem: p.toStudent(), execution: judge.configured() ? 'READY' : 'NOT_CONFIGURED',
    history: mine.map((s) => ({ id: String(s._id), verdict: s.verdict, passed: s.passed, total: s.total, language: s.language, runtimeMs: s.runtimeMs, memoryKb: s.memoryKb, attempt: s.attempt, at: s.createdAt })) } });
}));

const codeBody = z.object({ language: z.enum(['c', 'cpp', 'java', 'python', 'javascript']), code: z.string().min(1).max(20000), customInput: z.string().max(5000).optional() }).strict();
function needJudge() { if (!judge.configured()) throw new AppError(503, 'EXECUTION_NOT_CONFIGURED', 'Code execution is not configured on this server (JUDGE0_API_URL is empty). Nothing was run.'); }
async function publishedFor(req) {
  const p = await Problem.findOne({ _id: oid(req.params.id), status: 'PUBLISHED', $or: [{ targetSemester: null }, { targetSemester: req.user.doc.semester }] });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Problem not found.'); return p;
}

// RUN: public samples (or your own custom input). Stores nothing, awards nothing, never marks anything solved.
router.post('/:id/run', requireAuth(), requireRole(...CODERS), submitLimiter, wrap(async (req, res) => {
  const d = codeBody.parse(req.body || {}); needJudge(); const p = await publishedFor(req);
  if (d.customInput !== undefined) {
    const r = await judge.execute({ language: d.language, code: d.code, stdin: d.customInput });
    return res.json({ data: { mode: 'custom', status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', runtimeMs: r.timeMs, memoryKb: r.memoryKb } });
  }
  const samples = p.tests.filter((t) => !t.hidden);
  const g = await judge.grade({ language: d.language, code: d.code, tests: samples });
  res.json({ data: { mode: 'samples', verdict: g.verdict, passed: g.passed, total: g.total, awarded: 0, results: g.results.map((r, i) => ({ input: samples[i].input, expected: samples[i].expected, actual: r.stdout || '', status: r.status, stderr: (r.stderr || '').slice(0, 1500), runtimeMs: r.timeMs, memoryKb: r.memoryKb })) } });
}));

// SUBMIT: full suite including hidden tests. Stored. Hidden inputs/outputs are never returned.
router.post('/:id/submit', requireAuth(), requireRole(...CODERS), submitLimiter, wrap(async (req, res) => {
  const d = codeBody.omit({ customInput: true }).parse(req.body || {}); needJudge(); const p = await publishedFor(req);
  const g = await judge.grade({ language: d.language, code: d.code, tests: p.tests });
  const [prior, opened] = await Promise.all([Submission.countDocuments({ studentId: req.user.id, problemId: p._id }), Attempt.findOne({ studentId: req.user.id, problemId: p._id })]);
  const elapsedSec = opened ? Math.max(0, Math.round((Date.now() - opened.openedAt.getTime()) / 1000)) : null;
  const sub = await Submission.create({ studentId: req.user.id, problemId: p._id, language: d.language, code: d.code, verdict: g.verdict, passed: g.passed, total: g.total,
    runtimeMs: g.runtimeMs, memoryKb: g.memoryKb, attempt: prior + 1, elapsedSec, failedTestIndex: g.failedTestIndex, systemFailure: g.systemFailure });
  const late = p.deadline && sub.createdAt > p.deadline;
  res.status(201).json({ data: { submission: { id: sub.id, verdict: sub.verdict, passed: sub.passed, total: sub.total, runtimeMs: sub.runtimeMs, memoryKb: sub.memoryKb, attempt: sub.attempt, late: !!late,
    failedTest: sub.failedTestIndex === null ? null : (p.tests[sub.failedTestIndex].hidden ? { hidden: true, position: sub.failedTestIndex + 1 } : { hidden: false, position: sub.failedTestIndex + 1 }),
    note: g.systemFailure ? 'The execution service failed. This attempt does not count against you.' : undefined } } });
}));
module.exports = router;
