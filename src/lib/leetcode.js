// LeetCode has NO official public API. This uses the same public GraphQL endpoint its website uses.
// It can change or block us at any time, so every failure is reported as a status and nothing else depends on it.
// Data is self-reported by username, displayed as "unverified", and never used for scoring.
const URL_ = 'https://leetcode.com/graphql';
const QUERY = `query u($username:String!){matchedUser(username:$username){username submitStats:submitStatsGlobal{acSubmissionNum{difficulty count}} userCalendar{streak totalActiveDays submissionCalendar}}}`;

function parse(json) {
  const m = json && json.data && json.data.matchedUser;
  if (!m) return { status: 'NOT_FOUND' };
  const by = Object.fromEntries(((m.submitStats && m.submitStats.acSubmissionNum) || []).map((x) => [x.difficulty, x.count]));
  let days = [];
  try { days = Object.keys(JSON.parse((m.userCalendar && m.userCalendar.submissionCalendar) || '{}')).map((t) => new Date(+t * 1000).toISOString().slice(0, 10)); } catch { /* calendar optional */ }
  return { status: 'OK', username: m.username, easy: by.Easy || 0, medium: by.Medium || 0, hard: by.Hard || 0, total: by.All || 0,
    streak: (m.userCalendar && m.userCalendar.streak) || 0, activeDays: [...new Set(days)].sort().slice(-120) };
}
async function fetchProfile(username) {
  try {
    const r = await fetch(URL_, { method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'NEXORA-club-sync/1.0' }, body: JSON.stringify({ query: QUERY, variables: { username } }) });
    if (!r.ok) return { status: 'UNAVAILABLE', http: r.status };
    return parse(await r.json());
  } catch { return { status: 'UNAVAILABLE' }; }
}
module.exports = { fetchProfile, parse };
