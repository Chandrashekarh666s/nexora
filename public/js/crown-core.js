/* Crown maths. Pure functions, no DOM. The SAME file runs in the browser and on the server,
   so the crown a student sees is exactly what the backend calculated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.CrownCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var WEIGHTS = { correctness: 0.40, timeliness: 0.35, consistency: 0.25 };
  var MASTERY = { correctness: 0.95, timeliness: 0.90, consistency: 0.90 }; // every pillar must be high for 100%
  var clamp = function (x) { x = +x; return isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; };

  // 1.0 when finished within the target time, falling linearly to 0 at 3x the target.
  function timeliness(usedSec, targetSec) {
    if (!(targetSec > 0) || !(usedSec >= 0)) return 0;
    var r = usedSec / targetSec;
    return r <= 1 ? 1 : clamp(1 - (r - 1) / 2);
  }

  /* updateStudentCrown(studentData) -> { fill: 0..100, mastery, pillars, raw }
     studentData accepts EITHER ready pillars (0..1):  { pillars: { correctness, timeliness, consistency } }
     OR raw numbers: { testsPassed, testsTotal, timeUsedSec, timeTargetSec, streakDays, streakTarget }.
       Correctness 40%  = tests passed / tests total
       Timeliness  35%  = speed against the expected time
       Consistency 25%  = current daily streak / streak target (default 7 days)
     Below mastery the fill is capped at 99, so 100% (and the victory state) can only be earned by being
     consistent AND correct AND on time. When later results are worse, the numbers drop and the gold drains. */
  function updateStudentCrown(d) {
    d = d || {}; var p = d.pillars || {};
    var c = p.correctness != null ? clamp(p.correctness) : (d.testsTotal > 0 ? clamp(d.testsPassed / d.testsTotal) : 0);
    var t = p.timeliness != null ? clamp(p.timeliness) : timeliness(d.timeUsedSec, d.timeTargetSec);
    var s = p.consistency != null ? clamp(p.consistency) : clamp((d.streakDays || 0) / (d.streakTarget || 7));
    var raw = WEIGHTS.correctness * c + WEIGHTS.timeliness * t + WEIGHTS.consistency * s;
    var mastery = c >= MASTERY.correctness && t >= MASTERY.timeliness && s >= MASTERY.consistency;
    return { fill: mastery ? 100 : Math.min(99, Math.round(raw * 100)), mastery: mastery, pillars: { correctness: c, timeliness: t, consistency: s }, raw: raw };
  }
  return { updateStudentCrown: updateStudentCrown, timeliness: timeliness, WEIGHTS: WEIGHTS, MASTERY: MASTERY };
});
