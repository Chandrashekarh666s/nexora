const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const stats = require('./stats');
async function loadProbs() {
  const ps = await Problem.find({}, 'difficulty topic targetSeconds title').lean();
  return new Map(ps.map((p) => [String(p._id), { difficulty: p.difficulty, topic: p.topic, targetSeconds: p.targetSeconds, title: p.title }]));
}
const NOCODE = '-code';
async function studentStats(studentId, probs) {
  probs = probs || await loadProbs();
  const subs = await Submission.find({ studentId }).select(NOCODE).lean();
  return { subs, probs, ...stats.compute(subs, probs) };
}
// topic-wise accepted/total from real submissions
function topicBreakdown(subs, probs) {
  const t = {};
  for (const s of subs) { if (s.systemFailure) continue; const p = probs.get(String(s.problemId)); if (!p) continue; const x = t[p.topic] || (t[p.topic] = { topic: p.topic, attempts: 0, accepted: 0 }); x.attempts++; if (s.verdict === 'ACCEPTED') x.accepted++; }
  return Object.values(t).map((x) => ({ ...x, rate: Math.round(1000 * x.accepted / x.attempts) / 10 })).sort((a, b) => a.rate - b.rate);
}
module.exports = { loadProbs, studentStats, topicBreakdown };
