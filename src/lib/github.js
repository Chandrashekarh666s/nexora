// GitHub REST API (official). PUBLIC data only. A token with NO scopes just raises the rate limit.
const config = require('../config');
const H = () => ({ Accept: 'application/vnd.github+json', 'User-Agent': 'NEXORA-club-sync', ...(config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {}) });

function parseEvents(events, now = new Date()) {
  const cutoff = now.getTime() - 90 * 86400000, days = new Set(); let pushes = 0;
  for (const e of Array.isArray(events) ? events : []) {
    if (e.type !== 'PushEvent' || new Date(e.created_at).getTime() < cutoff) continue;
    pushes++; days.add(new Date(e.created_at).toISOString().slice(0, 10));
  }
  return { pushes90d: pushes, activeDays: [...days].sort() };
}
async function fetchProfile(username) {
  try {
    const u = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers: H(), signal: AbortSignal.timeout(8000) });
    if (u.status === 404) return { status: 'NOT_FOUND' };
    if (u.status === 403 || u.status === 429) return { status: 'RATE_LIMITED' };
    if (!u.ok) return { status: 'UNAVAILABLE', http: u.status };
    const p = await u.json();
    const ev = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`, { headers: H(), signal: AbortSignal.timeout(8000) });
    return { status: 'OK', login: p.login, publicRepos: p.public_repos, followers: p.followers, ...(ev.ok ? parseEvents(await ev.json()) : { pushes90d: null, activeDays: [] }) };
  } catch { return { status: 'UNAVAILABLE' }; }
}
module.exports = { fetchProfile, parseEvents };
