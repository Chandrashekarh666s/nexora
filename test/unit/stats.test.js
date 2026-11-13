process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../../src/lib/stats');
const lc = require('../../src/lib/leetcode');
const gh = require('../../src/lib/github');
const NOW = new Date('2026-11-11T10:00:00Z');
const probs = new Map([['p1', { difficulty: 'EASY', topic: 'Arrays', targetSeconds: 600 }], ['p2', { difficulty: 'HARD', topic: 'DP', targetSeconds: 600 }]]);
const sub = (o) => ({ problemId: 'p1', verdict: 'ACCEPTED', passed: 3, total: 3, elapsedSec: 300, systemFailure: false, createdAt: '2026-11-11T05:00:00Z', ...o });

test('points are difficulty-weighted per UNIQUE accepted problem (no farming)', () => {
  const r = stats.compute([sub({}), sub({ createdAt: '2026-11-11T06:00:00Z' }), sub({ problemId: 'p2' })], probs, NOW);
  assert.equal(r.points, 60); assert.equal(r.solved.total, 2); assert.equal(r.solved.HARD, 1);
});
test('system failures never count as student failures', () => {
  const r = stats.compute([sub({}), sub({ verdict: 'INTERNAL_ERROR', systemFailure: true, passed: 0 })], probs, NOW);
  assert.equal(r.submissions, 1); assert.equal(r.acceptanceRate, 100);
});
test('streak counts consecutive IST days ending today or yesterday', () => {
  const days = new Set(['2026-11-11', '2026-11-10', '2026-11-09', '2026-11-07']);
  assert.equal(stats.streakOf(days, NOW), 3); assert.equal(stats.streakOf(new Set(['2026-11-10']), NOW), 1); assert.equal(stats.streakOf(new Set(['2026-11-08']), NOW), 0);
  assert.equal(stats.dayKey('2026-11-10T20:00:00Z'), '2026-11-11'); // 20:00 UTC is already the next day in IST
});
test('crown pillars come from real records and mastery needs all three', () => {
  const week = ['09', '10', '11'].map((d) => sub({ problemId: 'p1', createdAt: `2026-11-${d}T05:00:00Z` }));
  assert.ok(stats.compute(week, probs, NOW).crown.fill < 100);
  const six = Array.from({ length: 7 }, (_, i) => sub({ problemId: 'p1', createdAt: `2026-11-${String(11 - i).padStart(2, '0')}T05:00:00Z` }));
  const r = stats.compute(six, probs, NOW); assert.equal(r.streak, 7); assert.equal(r.crown.mastery, true); assert.equal(r.crown.fill, 100);
  const bad = stats.compute([...six, sub({ verdict: 'WRONG_ANSWER', passed: 0 }), sub({ verdict: 'WRONG_ANSWER', passed: 0 })], probs, NOW); assert.ok(bad.crown.fill < 100); // drains
});
test('LeetCode and GitHub parsers handle real-shaped and broken payloads', () => {
  const ok = lc.parse({ data: { matchedUser: { username: 'u', submitStats: { acSubmissionNum: [{ difficulty: 'All', count: 10 }, { difficulty: 'Easy', count: 6 }, { difficulty: 'Medium', count: 3 }, { difficulty: 'Hard', count: 1 }] }, userCalendar: { streak: 2, submissionCalendar: '{"1762819200":3,"1762905600":1}' } } } });
  assert.deepEqual([ok.status, ok.total, ok.easy, ok.medium, ok.hard, ok.activeDays.length], ['OK', 10, 6, 3, 1, 2]);
  assert.equal(lc.parse({ data: { matchedUser: null } }).status, 'NOT_FOUND'); assert.equal(lc.parse(null).status, 'NOT_FOUND');
  const ev = gh.parseEvents([{ type: 'PushEvent', created_at: '2026-11-10T08:00:00Z' }, { type: 'PushEvent', created_at: '2026-11-10T09:00:00Z' }, { type: 'WatchEvent', created_at: '2026-11-10T09:00:00Z' }, { type: 'PushEvent', created_at: '2025-01-01T00:00:00Z' }], NOW);
  assert.deepEqual([ev.pushes90d, ev.activeDays], [2, ['2026-11-10']]); assert.deepEqual(gh.parseEvents('garbage').activeDays, []);
});
