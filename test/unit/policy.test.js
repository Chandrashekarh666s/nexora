const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../../src/lib/policy');

test('rejects short passwords', () => assert.ok(p.passwordProblems('abc123').length > 0));
test('rejects letters-only passwords', () => assert.ok(p.passwordProblems('abcdefghijkl').length > 0));
test('rejects digits-only passwords', () => assert.ok(p.passwordProblems('1234567890123').length > 0));
test('rejects passwords containing the USN', () =>
  assert.ok(p.passwordProblems('xCSE2024017x9', { identifier: 'cse2024017' }).length > 0));
test('rejects passwords over 72 bytes', () => assert.ok(p.passwordProblems('a1'.repeat(40)).length > 0));
test('accepts a strong password', () =>
  assert.deepEqual(p.passwordProblems('Orbit-Maple-42', { identifier: 'CSE2024017', email: 'a@b.in' }), []));
test('normalizes USN and email', () => {
  assert.equal(p.normalizeUsn(' cse2024017 '), 'CSE2024017');
  assert.equal(p.normalizeEmail(' A@B.IN '), 'a@b.in');
});
test('USN format', () => {
  assert.ok(p.USN_RE.test('CSE2024017'));
  assert.ok(!p.USN_RE.test('abc'));
  assert.ok(!p.USN_RE.test("X'; DROP"));
});
