const express = require('express');
const User = require('../models/User');
const Submission = require('../models/Submission');
const { ROLES } = require('../lib/rbac');
const stats = require('../lib/stats');
const { loadProbs } = require('../lib/probs');
const { wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const HOUSES = ['Turing', 'Ada', 'Hopper', 'Linus'];

function since(period) {
  const now = new Date(), off = require('../config').tzOffsetMin * 60000, local = new Date(now.getTime() + off);
  if (period === 'week') { const dow = (local.getUTCDay() + 6) % 7; local.setUTCHours(0, 0, 0, 0); return new Date(local.getTime() - dow * 86400000 - off); }
  if (period === 'month') { local.setUTCDate(1); local.setUTCHours(0, 0, 0, 0); return new Date(local.getTime() - off); }
  if (period === 'semester') return new Date(now.getTime() - 120 * 86400000);
  return null;
}
// Points = difficulty-weighted UNIQUE accepted problems (EASY 10, MEDIUM 25, HARD 50). Re-solving or re-submitting earns nothing,
// so farming is impossible. Crown = Correctness/Timeliness/Consistency (see public/js/crown-core.js). LeetCode/GitHub never score.
async function board(period) {
  const [users, probs] = await Promise.all([User.find({ role: { $in: [ROLES.STUDENT, ROLES.STUDENT_COORDINATOR] }, status: 'ACTIVE' }).select('fullName identifier profile semester section').lean(), loadProbs()]);
  const subs = await Submission.find({ studentId: { $in: users.map((u) => u._id) } }).select('-code').lean();
  const by = {}; for (const s of subs) (by[s.studentId] || (by[s.studentId] = [])).push(s);
  const from = since(period), rows = users.map((u) => {
    const st = stats.compute(by[u._id] || [], probs), w = stats.pointsSince(st.firstAccepted, probs, from);
    return { id: String(u._id), name: u.fullName, identifier: u.identifier, house: (u.profile && u.profile.house) || null, points: w.points, solved: w.solved, streak: st.streak, crown: { fill: st.crown.fill, mastery: st.crown.mastery, pillars: st.crown.pillars } };
  }).sort((a, b) => b.points - a.points || b.solved - a.solved || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
router.get('/', requireAuth(), wrap(async (req, res) => {
  const period = ['week', 'month', 'semester', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const rows = await board(period), wk = period === 'week' ? rows : await board('week');
  const pow = wk.find((r) => r.points > 0) || null, mo = period === 'month' ? rows : await board('month');
  const houses = HOUSES.map((h) => { const m = rows.filter((r) => r.house === h); return { house: h, points: m.reduce((a, r) => a + r.points, 0), members: m.length }; }).sort((a, b) => b.points - a.points);
  res.json({ data: { period, items: rows.slice(0, 50).map((r) => ({ ...r, identifier: undefined })), me: rows.find((r) => r.id === req.user.id) || null, houses,
    programmerOfWeek: pow && { id: pow.id, name: pow.name, points: pow.points }, programmerOfMonth: (mo.find((r) => r.points > 0) || null) && { id: mo.find((r) => r.points > 0).id, name: mo.find((r) => r.points > 0).name, points: mo.find((r) => r.points > 0).points }, generatedAt: new Date() } });
}));
module.exports = router;
