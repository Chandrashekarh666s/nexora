// Pure statistics from real submission records (no I/O, so it is unit-tested).
const config = require('../config');
const { updateStudentCrown, timeliness } = require('../../public/js/crown-core');

const WEIGHT = { EASY: 10, MEDIUM: 25, HARD: 50 }; // difficulty-weighted points per UNIQUE accepted problem
const dayKey = (d) => new Date(new Date(d).getTime() + config.tzOffsetMin * 60000).toISOString().slice(0, 10);
const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// Consecutive days with at least one accepted submission, ending today or yesterday.
function streakOf(daySet, now = new Date()) {
  let k = dayKey(now); if (!daySet.has(k)) k = addDays(k, -1);
  let n = 0; while (daySet.has(k)) { n++; k = addDays(k, -1); }
  return n;
}

// subs: submission-like { problemId, verdict, passed, total, elapsedSec, systemFailure, createdAt }
// probs: Map(problemId -> { difficulty, topic, targetSeconds })
function compute(subs, probs, now = new Date()) {
  const real = subs.filter((s) => !s.systemFailure).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const accepted = real.filter((s) => s.verdict === 'ACCEPTED');
  const first = new Map(); // first accepted submission per problem -> unique solves
  for (const s of accepted) if (!first.has(String(s.problemId))) first.set(String(s.problemId), s);
  const solved = { EASY: 0, MEDIUM: 0, HARD: 0, total: 0 }; let points = 0;
  for (const [pid, s] of first) { const p = probs.get(pid); if (!p) continue; solved[p.difficulty]++; solved.total++; points += WEIGHT[p.difficulty]; }
  const last = real.slice(-20);
  const pass = last.reduce((a, s) => a + (s.passed || 0), 0), tot = last.reduce((a, s) => a + (s.total || 0), 0);
  const lastAcc = accepted.slice(-20);
  const tl = lastAcc.length ? lastAcc.reduce((a, s) => a + timeliness(s.elapsedSec, (probs.get(String(s.problemId)) || {}).targetSeconds), 0) / lastAcc.length : 0;
  const streak = streakOf(new Set(accepted.map((s) => dayKey(s.createdAt))), now);
  const crown = updateStudentCrown({ pillars: { correctness: tot ? pass / tot : 0, timeliness: tl, consistency: Math.min(streak, 7) / 7 } });
  return { solved, points, submissions: real.length, accepted: accepted.length, acceptanceRate: real.length ? Math.round(1000 * accepted.length / real.length) / 10 : 0, streak, crown, firstAccepted: first };
}

// Points limited to a time window (unique problems whose FIRST accepted submission falls in the window).
function pointsSince(firstAccepted, probs, since) {
  let pts = 0, n = 0;
  for (const [pid, s] of firstAccepted) { if (since && new Date(s.createdAt) < since) continue; const p = probs.get(pid); if (p) { pts += WEIGHT[p.difficulty]; n++; } }
  return { points: pts, solved: n };
}
module.exports = { WEIGHT, dayKey, addDays, streakOf, compute, pointsSince };
