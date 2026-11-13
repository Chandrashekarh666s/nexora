const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateStudentCrown: crown, timeliness } = require('../../public/js/crown-core');

test('100% only when consistent AND correct AND on time', () => {
  const m = crown({ pillars: { correctness: 1, timeliness: 1, consistency: 1 } }); assert.equal(m.fill, 100); assert.equal(m.mastery, true);
  assert.equal(crown({ pillars: { correctness: 1, timeliness: 1, consistency: 0.5 } }).mastery, false); // inconsistent
  assert.equal(crown({ pillars: { correctness: 1, timeliness: 0.4, consistency: 1 } }).mastery, false); // slow
  assert.equal(crown({ pillars: { correctness: 0.7, timeliness: 1, consistency: 1 } }).mastery, false); // inaccurate
  assert.ok(crown({ pillars: { correctness: 1, timeliness: 1, consistency: 0.88 } }).fill <= 99);
});
test('weights 40/35/25 and the "slow or inconsistent = 60-75%" example', () => {
  assert.equal(crown({ pillars: { correctness: 1, timeliness: 0, consistency: 0 } }).fill, 40);
  assert.equal(crown({ pillars: { correctness: 0, timeliness: 1, consistency: 0 } }).fill, 35);
  assert.equal(crown({ pillars: { correctness: 0, timeliness: 0, consistency: 1 } }).fill, 25);
  const f = crown({ testsPassed: 10, testsTotal: 10, timeUsedSec: 3200, timeTargetSec: 1800, streakDays: 3 }).fill;
  assert.ok(f >= 60 && f <= 75, String(f));
});
test('gold drains when later performance is worse; garbage input is safe', () => {
  const hi = crown({ pillars: { correctness: 1, timeliness: 1, consistency: 1 } }).fill, lo = crown({ pillars: { correctness: 0.5, timeliness: 0.4, consistency: 0.3 } }).fill;
  assert.ok(lo < hi); assert.equal(crown().fill, 0); assert.equal(crown({ testsTotal: 'x', streakDays: NaN }).fill, 0);
  assert.equal(timeliness(600, 600), 1); assert.equal(timeliness(1800, 600), 0); assert.ok(timeliness(900, 600) > 0 && timeliness(900, 600) < 1);
});
