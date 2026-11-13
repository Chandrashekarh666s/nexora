// Automatic refresh of linked LeetCode/GitHub profiles. Runs by itself on a timer; students link a username once.
const User = require('../models/User');
const config = require('../config');
const lc = require('./leetcode');
const gh = require('./github');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncUser(user) {
  const out = { ...(user.integrations || {}) }, now = new Date();
  if (user.leetcodeUsername) { const r = await lc.fetchProfile(user.leetcodeUsername); out.leetcode = r.status === 'OK' || !out.leetcode ? { ...r, syncedAt: now } : { ...out.leetcode, status: r.status, checkedAt: now }; }
  if (user.githubUsername) { const r = await gh.fetchProfile(user.githubUsername); out.github = r.status === 'OK' || !out.github ? { ...r, syncedAt: now } : { ...out.github, status: r.status, checkedAt: now }; }
  if (!user.leetcodeUsername) delete out.leetcode;
  if (!user.githubUsername) delete out.github;
  await User.updateOne({ _id: user._id }, { $set: { integrations: out } });
  return out;
}
async function syncDue() {
  const cutoff = new Date(Date.now() - config.syncHours * 3600000);
  const users = await User.find({ $or: [{ leetcodeUsername: { $ne: null } }, { githubUsername: { $ne: null } }] });
  let n = 0;
  for (const u of users) {
    const i = u.integrations || {};
    const stamp = (x) => (x && (x.syncedAt || x.checkedAt)) ? new Date(x.syncedAt || x.checkedAt) : new Date(0);
    const due = (u.leetcodeUsername && stamp(i.leetcode) < cutoff) || (u.githubUsername && stamp(i.github) < cutoff);
    if (!due) continue;
    await syncUser(u); n++; await sleep(1500); // gentle: ~40 users/minute at most
  }
  return n;
}
function start() {
  const tick = () => syncDue().catch((e) => console.error('sync failed:', e.message));
  setTimeout(tick, 15000).unref();
  setInterval(tick, 30 * 60000).unref();
}
module.exports = { syncUser, syncDue, start };
