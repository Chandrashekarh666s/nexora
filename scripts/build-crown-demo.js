// Builds public/crown-leaderboard.html: ONE self-contained file (core + component + demo leaderboard). Run: npm run build:crown
const fs = require('fs'), path = require('path'), r = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const rows = [['Aarav Mehta', 'Turing', 'master', { correctness: 1, timeliness: 1, consistency: 1 }], ['Diya Nair', 'Ada', 'b', { correctness: 0.88, timeliness: 0.7, consistency: 0.5 }], ['Rohan Gowda', 'Hopper', 'c', { correctness: 0.65, timeliness: 0.4, consistency: 0.2 }], ['Isha Rao', 'Linus', 'd', { correctness: 0.3, timeliness: 0.1, consistency: 0.1 }]];
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXORA Crown Leaderboard</title>
<style>:root{--bg:#0b0c0f;--s:#13151a;--bd:rgba(255,255,255,.09);--tx:#f2f3f5;--t2:#a2a7b0;--gold:#f4ae1e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 Inter,system-ui,sans-serif;padding:32px 16px}
.w{max-width:760px;margin:0 auto}h1{font:600 26px 'Space Grotesk',Inter,sans-serif;margin:0 0 4px}.sub{color:var(--t2);margin:0 0 20px}
.row{display:grid;grid-template-columns:34px 76px 1fr auto;gap:16px;align-items:center;padding:14px 18px;border:1px solid var(--bd);border-radius:16px;background:var(--s);margin-bottom:10px;transition:border-color .6s,box-shadow .6s}
.row.m{border-color:rgba(244,174,30,.55);box-shadow:0 0 36px rgba(244,174,30,.14)}.rk{color:var(--t2);font-weight:600}.nm b{display:block}.nm small{color:var(--t2)}
.bars{display:flex;gap:6px;margin-top:6px}.bars i{display:block;height:4px;width:46px;border-radius:2px;background:rgba(255,255,255,.08);position:relative;overflow:hidden}.bars i:after{content:"";position:absolute;inset:0;width:var(--v);background:var(--gold);transition:width 1.2s}
.pct{font:600 22px 'Space Grotesk',sans-serif;text-align:right}.pct small{display:block;font:400 12px Inter;color:var(--t2)}.note{margin-top:18px;color:var(--t2);font-size:13px}code{color:var(--gold)}</style></head><body><div class="w">
<h1>Leaderboard</h1><p class="sub">Every crown is driven only by live performance data. The gold rises and drains as results change. (Demo feed: sample students.)</p>
<div id="list"></div>
<p class="note">Plug in your backend: <code>LeaderboardCrown.render(studentId, { pillars: { correctness, timeliness, consistency } })</code> on any element with <code>data-crown="studentId"</code>, or give raw numbers <code>{ testsPassed, testsTotal, timeUsedSec, timeTargetSec, streakDays }</code>. 100% needs Consistency + Correctness + Timeliness together.</p></div>
<script>${r('crown-core.js')}</script><script>${r('crown.js')}</script>
<script>
var S=${JSON.stringify(rows.map((x, i) => ({ id: 's' + i, name: x[0], house: x[1], p: x[3] })))};
function paint(){var list=document.getElementById('list');if(!list.children.length){list.innerHTML=S.map(function(s,i){return '<div class="row" id="r-'+s.id+'"><div class="rk">'+(i+1)+'</div><div data-crown="'+s.id+'" style="width:76px"></div><div class="nm"><b>'+s.name+'</b><small>'+s.house+' house</small><div class="bars"><i id="c-'+s.id+'"></i><i id="t-'+s.id+'"></i><i id="s-'+s.id+'"></i></div></div><div class="pct" id="p-'+s.id+'"></div></div>'}).join('')}
S.forEach(function(s){var m=LeaderboardCrown.render(s.id,{pillars:s.p});document.getElementById('p-'+s.id).innerHTML=m.fill+'%<small>'+(m.mastery?'Mastery':'crown fill')+'</small>';
 document.getElementById('r-'+s.id).classList.toggle('m',m.mastery);['c','t','s'].forEach(function(k,j){document.getElementById(k+'-'+s.id).style.setProperty('--v',Math.round(100*[s.p.correctness,s.p.timeliness,s.p.consistency][j])+'%')})})}
paint();
// Sample data feed, standing in for your backend: results change over time, so the crowns fill and drain by themselves.
var script=[function(){S[0].p.timeliness=.55},function(){S[1].p={correctness:.96,timeliness:.92,consistency:.95}},function(){S[0].p.timeliness=1;S[2].p.consistency=.5},function(){S[1].p.correctness=.7;S[3].p={correctness:.6,timeliness:.5,consistency:.4}},function(){S[3].p={correctness:.3,timeliness:.1,consistency:.1};S[1].p={correctness:.88,timeliness:.7,consistency:.5};S[2].p.consistency=.2}],k=0;
setInterval(function(){script[k++%script.length]();paint()},6000);
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, '..', 'public', 'crown-leaderboard.html'), html); console.log('wrote public/crown-leaderboard.html', html.length, 'bytes');
