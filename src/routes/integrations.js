// Link a public LeetCode / GitHub username once; the server then refreshes it automatically (see lib/sync.js).
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const User = require('../models/User');
const { ROLES } = require('../lib/rbac');
const { audit } = require('../lib/audit');
const { syncUser } = require('../lib/sync');
const { AppError, wrap } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth(), requireRole(ROLES.STUDENT, ROLES.STUDENT_COORDINATOR));
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,38})$/;
const limiter = rateLimit({ windowMs: 60000, limit: config.isTest ? 100000 : 6, keyGenerator: (req) => 'u' + req.user.id, message: { error: { code: 'RATE_LIMITED', message: 'Try again in a minute.' } } });

router.get('/', (req, res) => res.json({ data: { leetcodeUsername: req.user.doc.leetcodeUsername, githubUsername: req.user.doc.githubUsername, integrations: req.user.doc.integrations || {},
  note: 'Self-reported public data. Shown as unverified and never used for scores or rankings.' } }));
router.post('/link', limiter, wrap(async (req, res) => {
  const d = z.object({ leetcode: z.string().trim().regex(NAME, 'Letters, digits, - and _ only.').nullable().optional(), github: z.string().trim().regex(NAME, 'Letters, digits and - only.').nullable().optional() }).strict().parse(req.body || {});
  const u = await User.findById(req.user.id);
  if ('leetcode' in d) u.leetcodeUsername = d.leetcode || null;
  if ('github' in d) u.githubUsername = d.github || null;
  await u.save(); await audit(req, 'INTEGRATION_LINKED', { meta: { leetcode: !!u.leetcodeUsername, github: !!u.githubUsername } });
  const out = await syncUser(u); // first sync immediately; afterwards it is automatic
  res.json({ data: { leetcodeUsername: u.leetcodeUsername, githubUsername: u.githubUsername, integrations: out } });
}));
router.post('/sync', limiter, wrap(async (req, res) => {
  const u = await User.findById(req.user.id);
  if (!u.leetcodeUsername && !u.githubUsername) throw new AppError(400, 'NOTHING_LINKED', 'Link a username first.');
  res.json({ data: { integrations: await syncUser(u) } });
}));
module.exports = router;
