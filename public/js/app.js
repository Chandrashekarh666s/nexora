/* NEXORA dashboard. One page, three roles. The server enforces every permission; hiding a tab here is only convenience. */
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, stops = [], tz = 330, tt;
const R = { STUDENT: 'Student', STUDENT_COORDINATOR: 'Student coordinator', FACULTY_COORDINATOR: 'Faculty coordinator' };
const isFac = () => me.role === 'FACULTY_COORDINATOR', isCo = () => me.role === 'STUDENT_COORDINATOR', isStaff = () => isFac() || isCo(), codes = () => me.role !== 'FACULTY_COORDINATOR';

async function api(p, o) {
  o = o || {}; let r, d = null;
  try { r = await fetch('/api' + p, { credentials: 'same-origin', method: o.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: o.body === undefined ? undefined : JSON.stringify(o.body) }); } catch (e) { throw new Error('Cannot reach the server.'); }
  try { d = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) {
    if (r.status === 401) { location.href = '/'; }
    if (d && d.error && d.error.code === 'PASSWORD_CHANGE_REQUIRED') { location.reload(); }
    const e = d && d.error; const err = new Error(e ? e.message + (e.fields ? ' ' + Object.values(e.fields).join(' ') : '') : 'Request failed.'); err.code = e && e.code; throw err;
  }
  return d.data;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3200); }
const fail = (e) => toast(e.message || 'Something went wrong.');
const when = (d) => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const dkey = (d) => new Date(new Date(d).getTime() + tz * 60000).toISOString().slice(0, 10);
const addD = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const card = (v, l) => `<div class="card stat"><b>${E(v)}</b><span>${E(l)}</span></div>`;
const VER = { ACCEPTED: ['Accepted', 'ok'], WRONG_ANSWER: ['Wrong answer', 'bad'], COMPILATION_ERROR: ['Compilation error', 'bad'], RUNTIME_ERROR: ['Runtime error', 'bad'], TIME_LIMIT_EXCEEDED: ['Time limit exceeded', 'warn'], MEMORY_LIMIT_EXCEEDED: ['Memory limit exceeded', 'warn'], INTERNAL_ERROR: ['System error (not your fault)', 'mut'] };
const ver = (v) => `<span class="${(VER[v] || ['', ''])[1]}">${E((VER[v] || [v])[0])}</span>`;
function table(head, rows, empty) { if (!rows.length) return `<div class="wrap"><div class="empty">${E(empty || 'Nothing here yet.')}</div></div>`; return `<div class="wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`; }
const tr = (cells, attr) => `<tr ${attr || ''} ${attr ? 'class="clk"' : ''}>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
function modal(title, html) { $('#dt').textContent = title; $('#db').innerHTML = html; const d = $('#dlg'); if (!d.open) d.showModal(); return $('#db'); }
$('#dx').onclick = () => $('#dlg').close(); $('#dlg').addEventListener('click', (e) => { if (e.target === $('#dlg')) $('#dlg').close(); });
$('#out').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ } location.href = '/'; };

// ---- activity heat-map: 52 weeks / 30 days / weekly / monthly. Only accepted submissions count; logins never do. ----
function activity(act) {
  const days = act.days, ext = act.external || {}, today = dkey(new Date());
  const box = document.createElement('div');
  function grid(map, col) {
    const start = addD(today, -(52 * 7 - 1) - ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7 - 6 + 6) % 7); let x = 0, s = '';
    const max = Math.max(1, ...Object.values(map));
    for (let w = 0; w < 53; w++) for (let d = 0; d < 7; d++) { const k = addD(start, w * 7 + d); if (k > today) continue; const n = map[k] || 0, o = n ? 0.25 + 0.75 * Math.min(1, n / Math.max(3, max)) : 0.07;
      s += `<rect x="${w * 13}" y="${d * 13}" width="11" height="11" fill="${col}" fill-opacity="${o.toFixed(2)}"><title>${k}: ${n}</title></rect>`; }
    return `<svg class="hm" viewBox="0 0 ${53 * 13} 91" width="100%">${s}</svg>`;
  }
  const sums = (n, size) => { const out = []; for (let i = n - 1; i >= 0; i--) { const to = addD(today, -i * size), from = addD(to, -(size - 1)); let c = 0; for (const k in days) if (k >= from && k <= to) c += days[k]; out.push([to, c]); } return out; };
  const colsHtml = (a) => { const m = Math.max(1, ...a.map((x) => x[1])); return `<div class="cols" style="margin-top:22px">${a.map((x) => `<div style="height:${Math.max(3, 90 * x[1] / m)}px" title="${x[0]}: ${x[1]}"><small>${x[1] || ''}</small></div>`).join('')}</div>`; };
  function show(v) {
    const total = Object.values(days).reduce((a, b) => a + b, 0), body = v === '52w' ? grid(days, '#ffc933') : v === '30d' ? colsHtml(sums(30, 1)) : v === 'weekly' ? colsHtml(sums(12, 7)) : colsHtml(sums(12, 30));
    box.innerHTML = `<div class="bar"><div class="chips">${[['52w', '52 weeks'], ['30d', '30 days'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map((x) => `<button class="btn sm ${x[0] === v ? 'on' : ''}" data-v="${x[0]}">${x[1]}</button>`).join('')}</div><span class="note">${total} accepted solution${total === 1 ? '' : 's'} in the last year · IST days</span></div>${body}` +
      ((ext.github || []).length || (ext.leetcode || []).length ? `<p class="note" style="margin-top:12px">External, unverified public activity (not counted in scores): ${(ext.github || []).length ? 'GitHub active on ' + ext.github.length + ' day(s) in 90 days. ' : ''}${(ext.leetcode || []).length ? 'LeetCode active on ' + ext.leetcode.length + ' recent day(s).' : ''}</p>` : '');
    box.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => show(b.dataset.v)));
  }
  show('52w'); return box;
}
function crownCard(c, id) {
  const p = c.pillars, bar = (n, v, w) => `<div><span><b style="font-weight:500;color:var(--tx)">${n}</b><span>${Math.round(v * 100)}% · weight ${w}</span></span><div class="pb"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
  return `<div class="card"><h3>Your crown</h3><div class="crownbox"><div data-crown="${id}" style="width:150px"></div><div class="pil"><div style="font:600 30px 'Space Grotesk'">${c.fill}%<small class="mut" style="font:400 13px Inter"> ${c.mastery ? 'Mastery' : 'filled'}</small></div>${bar('Correctness', p.correctness, '40%')}${bar('Timeliness', p.timeliness, '35%')}${bar('Consistency', p.consistency, '25%')}</div></div><p class="note" style="margin:12px 0 0">It fills from your real results and drains if accuracy or speed slips. 100% needs all three to be high at once.</p></div>`;
}

// ================= PAGES =================
const PAGES = {};
PAGES.home = async (v) => {
  const [d, act] = await Promise.all([api('/me/dashboard'), api('/me/activity')]); tz = act.timezoneOffsetMin;
  const s = d.stats, mx = Math.max(1, ...d.weeks.map((w) => w.accepted));
  v.innerHTML = `<h1 class="t">Welcome, ${E(me.fullName.split(' ')[0])}</h1><p class="lead">${R[me.role]} · ${E(me.identifier)} · Semester ${me.semester} · Section ${E(me.section)}</p>
  <div class="grid g4">${card(s.solved.total, 'Problems solved')}${card(s.points, 'Points')}${card(s.acceptanceRate + '%', `Acceptance (${s.accepted}/${s.submissions})`)}${card(s.streak + ' day' + (s.streak === 1 ? '' : 's'), 'Current streak')}</div>
  <div class="grid g2">${crownCard(d.crown, 'me')}<div class="card"><h3>Solved by difficulty</h3>${['EASY', 'MEDIUM', 'HARD'].map((k) => `<p style="margin:6px 0"><span class="${k}">${k}</span> <b style="float:right">${s.distribution[k]}</b></p>`).join('')}<h3 style="margin-top:18px">Accepted per week</h3><div class="cols">${d.weeks.map((w) => `<div style="height:${Math.max(3, 90 * w.accepted / mx)}px" title="${w.from} → ${w.to}"><small>${w.accepted || ''}</small></div>`).join('')}</div></div></div>
  <div class="card" style="margin-bottom:14px"><h3>Activity</h3><div id="act"></div></div>
  <div class="grid g2"><div><h3 style="margin:0 0 10px">Topic performance</h3>${table(['Topic', 'Attempts', 'Accepted', 'Rate'], d.topics.map((t) => tr([E(t.topic), t.attempts, t.accepted, t.rate + '%'])), 'Solve problems to see topic performance.')}</div>
  <div><h3 style="margin:0 0 10px">Results so far</h3>${table(['Verdict', 'Count'], Object.entries(d.verdicts).map(([k, n]) => tr([ver(k), n])), 'No submissions yet.')}${s.systemFailures ? `<p class="note">${s.systemFailures} attempt(s) failed because of a system error and are not counted against you.</p>` : ''}</div></div>
  <h3 style="margin:6px 0 10px">Recent submissions</h3>${table(['Problem', 'Verdict', 'Tests', 'Language', 'When'], d.recent.map((r) => tr([E(r.problem), ver(r.verdict), `${r.passed}/${r.total}`, E(r.language), when(r.at)], `data-sub="${r.id}"`)), 'No submissions yet. Open Practice and solve your first problem.')}
  ${d.runtimeTrend.length ? `<p class="note">Runtime and memory are shown only as reported by the execution provider. They are not a measure of code quality.</p>` : ''}`;
  $('#act').appendChild(activity(act)); LeaderboardCrown.render('me', d.crown.pillars ? { pillars: d.crown.pillars } : d.crown);
  v.querySelectorAll('[data-sub]').forEach((e) => (e.onclick = () => showCode(e.dataset.sub)));
};
async function showCode(id) { try { const { submission: s } = await api('/submissions/' + id); modal(`${s.problem} · ${s.language}`, `<p>${ver(s.verdict)} · ${s.passed}/${s.total} tests · ${s.runtimeMs == null ? 'runtime n/a' : s.runtimeMs + ' ms'} · attempt ${s.attempt} · ${when(s.at)}</p><pre class="code">${E(s.code)}</pre>`); } catch (e) { fail(e); } }

PAGES.practice = async (v) => {
  const d = await api('/problems'); let f = 'ALL';
  const draw = () => { v.querySelector('#pl').innerHTML = table(['Problem', 'Difficulty', 'Topic', 'Deadline', 'Status'], d.items.filter((p) => f === 'ALL' || p.status === f).map((p) => tr([E(p.title), `<span class="${p.difficulty}">${p.difficulty}</span>`, E(p.topic), p.deadline ? when(p.deadline) : '—', p.status === 'SOLVED' ? '<span class="ok">Solved</span>' : p.status === 'ATTEMPTED' ? '<span class="warn">Attempted</span>' : '<span class="mut">New</span>'], `data-p="${p.id}"`)), 'No problems are published for you yet.'); v.querySelectorAll('[data-p]').forEach((e) => (e.onclick = () => (location.href = '/arena.html?id=' + e.dataset.p))); };
  v.innerHTML = `<h1 class="t">Practice</h1><p class="lead">Published problems for your semester. Open one to enter the Coding Arena.</p><div class="bar"><div class="chips">${['ALL', 'NEW', 'ATTEMPTED', 'SOLVED'].map((x) => `<button class="btn sm ${x === 'ALL' ? 'on' : ''}" data-f="${x}">${x[0] + x.slice(1).toLowerCase()}</button>`).join('')}</div></div><div id="pl"></div>`;
  v.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { f = b.dataset.f; v.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); draw(); })); draw();
};

PAGES.leaderboard = async (v) => {
  let period = 'week', data;
  const load = async () => { data = await api('/leaderboard?period=' + period); draw(); };
  function draw() {
    const hs = data.houses, pw = data.programmerOfWeek, pm = data.programmerOfMonth;
    v.innerHTML = `<h1 class="t">Leaderboard</h1><p class="lead">Points come only from verified accepted solutions: unique problems, weighted by difficulty. Updates automatically.</p>
    <div class="bar"><div class="chips">${[['week', 'This week'], ['month', 'This month'], ['semester', 'Semester'], ['all', 'All time']].map((x) => `<button class="btn sm ${x[0] === period ? 'on' : ''}" data-pe="${x[0]}">${x[1]}</button>`).join('')}</div><span class="note">Programmer of the Week: <b>${pw ? E(pw.name) : '—'}</b> · of the Month: <b>${pm ? E(pm.name) : '—'}</b></span></div>
    <div class="card" style="margin-bottom:14px"><h3>House Cup (${period === 'all' ? 'all time' : period})</h3><div class="hs">${hs.map((h) => `<div><b>${h.points}</b>${E(h.house)}<div class="note">${h.members} member${h.members === 1 ? '' : 's'}</div></div>`).join('')}</div></div>
    ${data.items.length ? data.items.map((r) => `<div class="lb ${r.id === me.id ? 'me' : ''} ${r.crown.mastery ? 'm' : ''}"><b class="mut">${r.rank}</b><div data-crown="${r.id}" style="width:50px"></div><div><b>${E(r.name)}</b>${r.id === me.id ? ' <span class="pill">you</span>' : ''}<div class="note">${r.house ? E(r.house) + ' · ' : ''}${r.solved} solved · ${r.streak}-day streak</div></div><div class="hh note">${r.crown.fill}% crown</div><div class="pts">${r.points}<div class="note" style="font:400 12px Inter">points</div></div></div>`).join('') : '<div class="card empty">No students yet.</div>'}
    ${data.me && !data.items.find((r) => r.id === data.me.id) ? `<p class="note">Your rank: ${data.me.rank} · ${data.me.points} points</p>` : ''}<p class="note">Crown = Correctness 40% + Timeliness 35% + Consistency 25%. Generated ${when(data.generatedAt)}.</p>`;
    v.querySelectorAll('[data-pe]').forEach((b) => (b.onclick = () => { period = b.dataset.pe; load().catch(fail); }));
    data.items.forEach((r) => LeaderboardCrown.render(r.id, { pillars: r.crown.pillars }));
  }
  await load();
  const iv = setInterval(() => { load().catch(() => {}); }, 30000); stops.push(() => clearInterval(iv)); // live: gold rises and drains with real data
};

PAGES.connect = async (v) => {
  const d = await api('/integrations'), i = d.integrations || {}, lc = i.leetcode, gh = i.github;
  const st = (x) => !x ? '' : x.status === 'OK' ? `<span class="ok">Synced ${when(x.syncedAt)}</span>` : `<span class="warn">${E(x.status)}</span>`;
  v.innerHTML = `<h1 class="t">Connect profiles</h1><p class="lead">Link your public usernames once. NEXORA refreshes them automatically every few hours. This is self-reported data: shown as unverified and never used for points, ranks or your crown. Your own Coding Arena results are the verified record.</p>
  <div class="grid g2"><div class="card"><h3>LeetCode</h3><form id="lcf" class="inline"><label>Public username<input name="u" value="${E(d.leetcodeUsername || '')}" placeholder="e.g. lee215" style="width:100%"></label><button class="btn p sm" type="submit">Save &amp; sync</button></form>${lc && lc.status === 'OK' ? `<p style="margin:12px 0 0">Solved <b>${lc.total}</b> (E ${lc.easy} · M ${lc.medium} · H ${lc.hard}) · streak ${lc.streak}</p>` : ''}<p class="note">${st(lc)}${lc && lc.status !== 'OK' ? ' LeetCode has no official API, so this can be temporarily unavailable.' : ''}</p></div>
  <div class="card"><h3>GitHub</h3><form id="ghf"><label>Public username<input name="u" value="${E(d.githubUsername || '')}" placeholder="e.g. octocat" style="width:100%"></label><button class="btn p sm" type="submit">Save &amp; sync</button></form>${gh && gh.status === 'OK' ? `<p style="margin:12px 0 0"><b>${gh.publicRepos}</b> public repos · <b>${gh.followers}</b> followers · ${gh.pushes90d == null ? '' : gh.pushes90d + ' pushes in 90 days'}</p>` : ''}<p class="note">${st(gh)} Only public data is read.</p></div></div>`;
  const hook = (id, key) => ($(id).onsubmit = async (e) => { e.preventDefault(); try { await api('/integrations/link', { method: 'POST', body: { [key]: e.target.u.value.trim() || null } }); toast('Saved and synced'); PAGES.connect(v); } catch (x) { fail(x); } });
  hook('#lcf', 'leetcode'); hook('#ghf', 'github');
};

// ---------- staff: students ----------
let sq = { q: '', semester: '', section: '', page: 1 };
PAGES.students = async (v) => {
  const qs = () => '?' + new URLSearchParams(Object.fromEntries(Object.entries(sq).filter(([, x]) => x !== ''))).toString();
  v.innerHTML = `<h1 class="t">${isFac() ? 'Students' : 'My students'}</h1><p class="lead">${isFac() ? 'Every student and student coordinator in the institution.' : 'Students in the sections faculty assigned to you. You cannot see anyone else.'}</p>
  <div class="bar"><div class="r"><input id="q" placeholder="Search name, USN, email" value="${E(sq.q)}"><select id="sem"><option value="">All sem</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${+sq.semester === n ? 'selected' : ''}>${n}</option>`).join('')}</select><input id="sec" placeholder="Sec" style="width:70px" value="${E(sq.section)}"></div><span id="cnt" class="note"></span></div><div id="tb"></div><div class="bar"><button class="btn sm" id="pv">Previous</button><button class="btn sm" id="nx">Next</button></div>`;
  let timer; const go = () => { sq.q = $('#q').value.trim(); sq.semester = $('#sem').value; sq.section = $('#sec').value.trim().toUpperCase(); sq.page = 1; draw(); };
  $('#q').oninput = $('#sec').oninput = () => { clearTimeout(timer); timer = setTimeout(go, 300); }; $('#sem').onchange = go;
  async function draw() {
    const d = await api('/students' + qs() + (qs().length > 1 ? '&' : '?') + 'limit=15'); $('#cnt').textContent = d.total + ' student' + (d.total === 1 ? '' : 's');
    $('#tb').innerHTML = table(['Name', isFac() ? 'USN / ID' : 'USN', 'Sem / Sec', 'Role', 'Solved', 'Submissions', 'Last submission', 'Status'], d.items.map((u) => tr([E(u.fullName), E(u.identifier), `${u.semester}/${E(u.section)}`, u.role === 'STUDENT' ? 'Student' : 'Coordinator', u.solved, u.submissions, u.lastSubmissionAt ? when(u.lastSubmissionAt) : '<span class="mut">never</span>', u.status === 'ACTIVE' ? '<span class="ok">Active</span>' : `<span class="bad">${E(u.status)}</span>`], `data-s="${u.id}"`)), 'No students in your scope' + (isCo() ? '. Ask faculty to assign you a section.' : '.'));
    $('#tb').querySelectorAll('[data-s]').forEach((e) => (e.onclick = () => showStudent(e.dataset.s)));
    $('#pv').disabled = sq.page <= 1; $('#nx').disabled = sq.page * d.limit >= d.total; $('#pv').onclick = () => { sq.page--; draw().catch(fail); }; $('#nx').onclick = () => { sq.page++; draw().catch(fail); };
  }
  await draw();
};
async function showStudent(id) {
  try {
    const [d, act, ints] = await Promise.all([api('/students/' + id), api('/me/activity?studentId=' + id), api('/interventions?studentId=' + id)]), u = d.user, s = d.stats, ext = u.integrations || {};
    const b = modal(`${u.fullName} · ${u.identifier}`, `<p class="lead" style="margin:0 0 12px">Semester ${u.semester} · Section ${E(u.section)} · ${E(u.email)} · last login ${when(u.lastLoginAt)}</p>
    <div class="grid g4">${card(s.solved.total, 'Solved')}${card(s.points, 'Points')}${card(s.acceptanceRate + '%', 'Acceptance')}${card(s.streak, 'Streak (days)')}</div>
    <div class="grid g2"><div class="card"><h3>Crown ${s.crown.fill}%</h3><div class="crownbox"><div data-crown="sx" style="width:110px"></div><div class="pil">${['correctness', 'timeliness', 'consistency'].map((k) => `<div><span><b style="font-weight:500;color:var(--tx)">${k}</b><span>${Math.round(s.crown.pillars[k] * 100)}%</span></span><div class="pb"><i style="width:${Math.round(s.crown.pillars[k] * 100)}%"></i></div></div>`).join('')}</div></div></div>
    <div class="card"><h3>House &amp; profiles</h3><select id="hs"><option value="">No house</option>${['Turing', 'Ada', 'Hopper', 'Linus'].map((h) => `<option ${u.house === h ? 'selected' : ''}>${h}</option>`).join('')}</select> <button class="btn sm" id="hsb">Assign</button><p class="note" style="margin-top:12px">${u.leetcodeUsername ? 'LeetCode: ' + E(u.leetcodeUsername) + (ext.leetcode && ext.leetcode.status === 'OK' ? ` (${ext.leetcode.total} solved, unverified)` : '') : 'No LeetCode linked.'}<br>${u.githubUsername ? 'GitHub: ' + E(u.githubUsername) + (ext.github && ext.github.status === 'OK' ? ` (${ext.github.publicRepos} repos, unverified)` : '') : 'No GitHub linked.'}</p></div></div>
    <div class="card" style="margin-bottom:14px"><h3>Activity</h3><div id="sact"></div></div>
    <h3 style="margin:0 0 8px">Weak topics first</h3>${table(['Topic', 'Attempts', 'Accepted', 'Rate'], d.topics.map((t) => tr([E(t.topic), t.attempts, t.accepted, t.rate + '%'])), 'No attempts yet.')}
    <h3 style="margin:0 0 8px">Recent submissions (click to read the code)</h3>${table(['Problem', 'Verdict', 'Tests', 'Lang', 'When'], d.recent.map((r) => tr([E(r.problem), ver(r.verdict), `${r.passed}/${r.total}`, E(r.language), when(r.at)], `data-sub="${r.id}"`)), 'No submissions.')}
    <h3 style="margin:0 0 8px">Interventions</h3>${table(['When', 'By', 'Note', 'Status', 'Acceptance 14d before → after'], ints.items.map((i) => tr([when(i.createdAt), E(i.by), E(i.note), E(i.status), `${i.acceptancePctBefore14d ?? '—'}% → ${i.acceptancePctAfter14d ?? '—'}%`])), 'None recorded.')}
    <form id="iv"><label>Record an intervention<textarea name="note" rows="2" placeholder="What is the student struggling with, and what will you do?"></textarea></label><button class="btn p sm" type="submit">Save note</button></form><p class="note">Before/after shows association only, not proof of cause.</p>`);
    $('#sact', b).appendChild(activity(act)); LeaderboardCrown.render('sx', { pillars: s.crown.pillars });
    b.querySelectorAll('[data-sub]').forEach((e) => (e.onclick = () => showCode(e.dataset.sub)));
    $('#hsb', b).onclick = async () => { try { await api('/students/' + id + '/house', { method: 'PATCH', body: { house: $('#hs', b).value || null } }); toast('House updated'); } catch (e) { fail(e); } };
    $('#iv', b).onsubmit = async (e) => { e.preventDefault(); try { await api('/interventions', { method: 'POST', body: { studentId: id, note: e.target.note.value } }); toast('Recorded'); showStudent(id); } catch (x) { fail(x); } };
  } catch (e) { fail(e); }
}

// ---------- staff: problems ----------
PAGES.problems = async (v) => {
  const d = await api('/problems/manage/list');
  v.innerHTML = `<h1 class="t">Problems</h1><p class="lead">Draft, preview and publish. Hidden tests grade submissions and are never shown to students. Every publish is audit-logged.</p><div class="bar"><span></span><button class="btn p sm" id="np">New problem</button></div>` +
    table(['Title', 'Level', 'Topic', 'Status', 'Deadline', 'Tests', 'By', ''], d.items.map((p) => tr([E(p.title), `<span class="${p.difficulty}">${p.difficulty}</span>`, E(p.topic), p.status === 'PUBLISHED' ? '<span class="ok">Published</span>' : '<span class="warn">Draft</span>', p.deadline ? when(p.deadline) : '—', p.tests, E(p.createdBy || ''), (p.mine || isFac()) ? `<button class="btn sm" data-ed="${p.id}">Edit</button> ` + (p.status === 'DRAFT' ? `<button class="btn p sm" data-pub="${p.id}">Publish</button>` : isFac() ? `<button class="btn sm" data-un="${p.id}">Unpublish</button>` : '') : ''])), 'No problems yet. Create the first one.');
  $('#np').onclick = () => editProblem(null, () => PAGES.problems(v));
  v.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editProblem(b.dataset.ed, () => PAGES.problems(v))));
  v.querySelectorAll('[data-pub]').forEach((b) => (b.onclick = () => { const m = modal('Publish problem', `<form id="pf"><label>Deadline (optional, your local time)<input type="datetime-local" name="dl"></label><p class="note">Students of the targeted semester will see it immediately.</p><button class="btn p" type="submit">Publish now</button></form>`); $('#pf', m).onsubmit = async (e) => { e.preventDefault(); try { await api('/problems/' + b.dataset.pub + '/publish', { method: 'POST', body: { deadline: e.target.dl.value ? new Date(e.target.dl.value).toISOString() : null } }); $('#dlg').close(); toast('Published'); PAGES.problems(v); } catch (x) { fail(x); } }; }));
  v.querySelectorAll('[data-un]').forEach((b) => (b.onclick = async () => { try { await api('/problems/' + b.dataset.un + '/unpublish', { method: 'POST' }); toast('Unpublished'); PAGES.problems(v); } catch (x) { fail(x); } }));
};
async function editProblem(id, done) {
  const p = id ? (await api('/problems/' + id + '/manage')).problem : { title: '', statement: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'EASY', subject: '', topic: 'General', targetSemester: null, targetSeconds: 1800, tests: [{ input: '', expected: '', hidden: false }], examples: [] };
  const row = (t) => `<div class="tr2" style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;margin-bottom:6px"><textarea rows="2" placeholder="input" data-k="input">${E(t.input)}</textarea><textarea rows="2" placeholder="expected output" data-k="expected">${E(t.expected)}</textarea><label class="chk" style="margin:0"><input type="checkbox" data-k="hidden" ${t.hidden ? 'checked' : ''}> hidden</label><button type="button" class="btn sm" data-rm>×</button></div>`;
  const b = modal(id ? 'Edit problem' : 'New problem', `<form id="pf"><div class="two"><label>Title<input name="title" value="${E(p.title)}"></label><label>Topic<input name="topic" value="${E(p.topic)}"></label></div>
  <label>Statement<textarea name="statement" rows="5">${E(p.statement)}</textarea></label><div class="two"><label>Input format<textarea name="inputFormat" rows="2">${E(p.inputFormat)}</textarea></label><label>Output format<textarea name="outputFormat" rows="2">${E(p.outputFormat)}</textarea></label></div>
  <label>Constraints<textarea name="constraints" rows="2">${E(p.constraints)}</textarea></label><div class="two"><label>Difficulty<select name="difficulty">${['EASY', 'MEDIUM', 'HARD'].map((x) => `<option ${p.difficulty === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Subject<input name="subject" value="${E(p.subject)}"></label></div>
  <div class="two"><label>Target semester (blank = all)<input name="targetSemester" type="number" min="1" max="8" value="${p.targetSemester || ''}"></label><label>Expected time (minutes, for Timeliness)<input name="mins" type="number" min="1" max="240" value="${Math.round(p.targetSeconds / 60)}"></label></div>
  <label>Example (shown to students)<div class="two"><textarea name="exin" rows="2" placeholder="input">${E((p.examples[0] || {}).input || '')}</textarea><textarea name="exout" rows="2" placeholder="output">${E((p.examples[0] || {}).output || '')}</textarea></div></label>
  <h3 style="margin:8px 0">Test cases (at least one public)</h3><div id="tests">${p.tests.map(row).join('')}</div><button type="button" class="btn sm" id="at">Add test</button><p class="err" id="pe"></p><button class="btn p" type="submit">Save as draft</button></form>`);
  const wire = () => b.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => { x.parentElement.remove(); }));
  wire(); $('#at', b).onclick = () => { $('#tests', b).insertAdjacentHTML('beforeend', row({ input: '', expected: '', hidden: true })); wire(); };
  $('#pf', b).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, tests = [...b.querySelectorAll('.tr2')].map((r) => ({ input: r.querySelector('[data-k=input]').value, expected: r.querySelector('[data-k=expected]').value, hidden: r.querySelector('[data-k=hidden]').checked })).filter((t) => t.expected.trim() !== '');
    const body = { title: f.title.value, statement: f.statement.value, inputFormat: f.inputFormat.value, outputFormat: f.outputFormat.value, constraints: f.constraints.value, difficulty: f.difficulty.value, subject: f.subject.value, topic: f.topic.value || 'General', targetSemester: f.targetSemester.value ? +f.targetSemester.value : null, targetSeconds: Math.max(1, +f.mins.value || 30) * 60, examples: f.exin.value || f.exout.value ? [{ input: f.exin.value, output: f.exout.value, explanation: '' }] : [], tests };
    try { await api(id ? '/problems/' + id : '/problems', { method: id ? 'PATCH' : 'POST', body }); $('#dlg').close(); toast('Saved'); done(); } catch (x) { $('#pe', b).textContent = x.message; }
  };
}

// ---------- staff: insights + audit ----------
PAGES.insights = async (v) => {
  const d = await api('/analytics/overview'), t = d.totals;
  v.innerHTML = `<h1 class="t">${isFac() ? 'Institution overview' : 'Section insights'}</h1><p class="lead">Built from real submissions. Execution-service failures are shown separately and never blamed on students.</p>
  <div class="grid g4">${card(t.students, 'Students in scope')}${card(t.active7d, 'Active in 7 days')}${card(t.submissions, 'Graded submissions')}${card(t.acceptanceRate + '%', 'Acceptance rate')}${card(t.systemFailures, 'System failures (excluded)')}</div>
  <div class="grid g2"><div><h3 style="margin:0 0 8px">Failure categories</h3>${table(['Verdict', 'Count'], Object.entries(d.verdicts).filter(([k]) => k !== 'ACCEPTED').map(([k, n]) => tr([ver(k), n])), 'No failures recorded.')}<h3 style="margin:0 0 8px">Weakest topics</h3>${table(['Topic', 'Attempts', 'Rate'], d.weakTopics.map((x) => tr([E(x.topic), x.attempts, x.rate + '%'])), 'Needs at least 3 attempts per topic.')}</div>
  <div><h3 style="margin:0 0 8px">Sections</h3>${table(['Section', 'Students', 'Active 7d', 'Acceptance'], d.sections.map((s) => tr([E(s.section), s.students, s.active7d, s.acceptanceRate + '%'])), 'No sections in scope.')}<h3 style="margin:0 0 8px">Interventions</h3><div class="card"><b>${d.interventions.total}</b> recorded · ${d.interventions.measured} with 14-day follow-up data${d.interventions.avgAcceptanceChange == null ? '' : ` · average acceptance change <b>${d.interventions.avgAcceptanceChange}</b> points`}<p class="note">${E(d.interventions.note)}</p></div></div></div>
  <h3 style="margin:0 0 8px">Inactive for 7+ days</h3>${table(['Student', 'USN', 'Section', 'Last submission'], d.inactive.map((s) => tr([E(s.name), E(s.identifier), E(s.section), s.lastSubmissionAt ? when(s.lastSubmissionAt) : '<span class="mut">never</span>'], `data-s="${s.id}"`)), 'Everyone submitted this week.')}
  <h3 style="margin:0 0 8px">Repeated failures (3+ failed attempts, never solved)</h3>${table(['Student', 'USN', 'Stuck on'], d.repeatedFailures.map((s) => tr([E(s.name), E(s.identifier), s.problems.map((p) => E(p.title) + ' (' + p.fails + ')').join(', ')], `data-s="${s.id}"`)), 'No repeated failures.')}`;
  v.querySelectorAll('[data-s]').forEach((e) => (e.onclick = () => showStudent(e.dataset.s)));
};
PAGES.audit = async (v) => {
  const ps = (await api('/problems/manage/list')).items.filter((p) => p.status === 'PUBLISHED');
  v.innerHTML = `<h1 class="t">Submission audit</h1><p class="lead">Who uploaded, who did not, and why. Click a student to inspect.</p><div class="bar"><select id="ap" style="min-width:260px"><option value="">Choose a published problem</option>${ps.map((p) => `<option value="${p.id}">${E(p.title)}</option>`).join('')}</select></div><div id="ar"></div>`;
  $('#ap').onchange = async (e) => { if (!e.target.value) return; try { const a = await api('/analytics/problem/' + e.target.value + '/audit');
    const S = { NOT_ATTEMPTED: ['Not attempted', 'bad'], DEADLINE_MISSED: ['Deadline missed', 'bad'], PENDING: ['Pending', 'warn'], TECHNICAL_FAILURE: ['Technical execution failure', 'mut'] };
    $('#ar').innerHTML = `<h3 style="margin:0 0 8px">Uploaded (${a.uploaded.length})</h3>` + table(['Student', 'USN', 'Sem/Sec', 'Submitted', 'Status', 'Score', 'Attempts', ''], a.uploaded.map((u) => tr([E(u.name), E(u.identifier), `${u.semester}/${E(u.section)}`, when(u.submittedAt), ver(u.verdict), u.score, u.attempts, u.late ? '<span class="warn">late</span>' : ''], `data-sub="${u.submissionId}"`)), 'Nobody has submitted.') +
      `<h3 style="margin:0 0 8px">Not uploaded (${a.notUploaded.length})</h3>` + table(['Student', 'USN', 'Sem/Sec', 'Task', 'Deadline', 'Status'], a.notUploaded.map((u) => tr([E(u.name), E(u.identifier), `${u.semester}/${E(u.section)}`, E(a.problem.title), u.deadline ? when(u.deadline) : '—', `<span class="${S[u.status][1]}">${S[u.status][0]}</span>`], `data-s="${u.id}"`)), 'Everyone has submitted.') + '<p class="note">Excused absence is not tracked yet.</p>';
    $('#ar').querySelectorAll('[data-sub]').forEach((x) => (x.onclick = () => showCode(x.dataset.sub))); $('#ar').querySelectorAll('[data-s]').forEach((x) => (x.onclick = () => showStudent(x.dataset.s))); } catch (x) { fail(x); } };
};

// ---------- faculty: team, accounts, logs ----------
PAGES.team = async (v) => {
  const [co, as, inv] = await Promise.all([api('/manage/coordinators'), api('/manage/assignments'), api('/manage/invites')]);
  v.innerHTML = `<h1 class="t">Team &amp; access</h1><p class="lead">Coordinators and faculty can only be created from an invite you issue. Assign sections to control what each coordinator can see.</p>
  <h3 style="margin:0 0 8px">Student coordinators</h3>${table(['Name', 'ID', 'Sections', 'Students', 'Problems (made/published)', 'Interventions (30d)', 'Actions (30d)', 'Last login', ''], co.items.map((c) => tr([E(c.name), E(c.identifier), E(c.sections.join(', ') || '—'), c.students, `${c.problemsCreated}/${c.problemsPublished}`, c.interventions30d, c.actions30d, c.lastLoginAt ? when(c.lastLoginAt) : 'never', `<button class="btn sm" data-rc="${c.id}">Revoke</button> <button class="btn sm" data-pw="${c.id}">Reset pw</button> <button class="btn sm" data-su="${c.id}|${c.status}">${c.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>`])), 'No coordinators yet. Create an invite below.')}
  <div class="grid g2"><div><h3 style="margin:0 0 8px">Section assignments</h3><form id="af" class="bar"><select name="c" required><option value="">Coordinator</option>${co.items.filter((c) => c.status === 'ACTIVE').map((c) => `<option value="${c.id}">${E(c.name)}</option>`).join('')}</select><select name="sem">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option>${n}</option>`).join('')}</select><input name="sec" placeholder="Sec" style="width:70px" required><button class="btn p sm" type="submit">Assign</button></form>${table(['Coordinator', 'Section', 'Students', ''], as.items.map((a) => tr([E(a.coordinator ? a.coordinator.name : '?'), `${a.semester}${E(a.section)}`, a.students, `<button class="btn sm" data-ua="${a.id}">Remove</button>`])), 'No assignments yet.')}</div>
  <div><h3 style="margin:0 0 8px">Invites</h3><form id="if" class="bar"><select name="role"><option value="coordinator">Student coordinator</option><option value="faculty">Faculty coordinator</option></select><input name="note" placeholder="Note (who is this for)"><button class="btn p sm" type="submit">Create invite</button></form>${table(['Role', 'Note', 'Status', 'Expires', ''], inv.items.map((i) => tr([i.role === 'FACULTY_COORDINATOR' ? 'Faculty' : 'Coordinator', E(i.note), i.status === 'USED' ? `<span class="ok">Used by ${E(i.usedBy ? i.usedBy.name : '')}</span>` : E(i.status), when(i.expiresAt), i.status === 'ACTIVE' ? `<button class="btn sm" data-ri="${i.id}">Revoke</button>` : ''])), 'No invites yet.')}</div></div>
  <h3 style="margin:6px 0 8px">Find any account</h3><div class="bar"><input id="uq" placeholder="Search name, ID, email" style="min-width:260px"></div><div id="ul"></div>`;
  const re = () => PAGES.team(v), act = (fn) => async (...a) => { try { await fn(...a); } catch (x) { fail(x); } };
  v.querySelectorAll('[data-rc]').forEach((b) => (b.onclick = act(async () => { if (confirm('Revoke coordinator privileges? They become a normal student and lose all section access.')) { await api('/manage/users/' + b.dataset.rc + '/revoke-coordinator', { method: 'POST' }); toast('Revoked'); re(); } })));
  v.querySelectorAll('[data-su]').forEach((b) => (b.onclick = act(async () => { const [id, st] = b.dataset.su.split('|'); await api('/manage/users/' + id, { method: 'PATCH', body: { status: st === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } }); re(); })));
  const pw = (id) => act(async () => { if (!confirm('Generate a temporary password? The user must change it at next login.')) return; const r = await api('/manage/users/' + id + '/reset-password', { method: 'POST' }); modal('Temporary password', `<p>Give this to the user privately. It is shown once.</p><pre class="code">${E(r.temporaryPassword)}</pre>`); })();
  v.querySelectorAll('[data-pw]').forEach((b) => (b.onclick = () => pw(b.dataset.pw)));
  v.querySelectorAll('[data-ua]').forEach((b) => (b.onclick = act(async () => { await api('/manage/assignments/' + b.dataset.ua, { method: 'DELETE' }); re(); })));
  v.querySelectorAll('[data-ri]').forEach((b) => (b.onclick = act(async () => { await api('/manage/invites/' + b.dataset.ri, { method: 'DELETE' }); re(); })));
  $('#af').onsubmit = act(async (e) => { e.preventDefault(); await api('/manage/assignments', { method: 'POST', body: { coordinatorId: e.target.c.value, semester: +e.target.sem.value, section: e.target.sec.value } }); toast('Assigned'); re(); });
  $('#if').onsubmit = act(async (e) => { e.preventDefault(); const r = await api('/manage/invites', { method: 'POST', body: { role: e.target.role.value, note: e.target.note.value } }); modal('Invite code', `<p>Send this code privately. It works once, for the <b>${E(r.role === 'FACULTY_COORDINATOR' ? 'faculty' : 'student coordinator')}</b> role, until ${when(r.expiresAt)}. It is shown only now.</p><pre class="code" style="font-size:20px">${E(r.code)}</pre><p class="note">They enter it on the landing page under Join the Club.</p>`); $('#dlg').addEventListener('close', re, { once: true }); });
  let t2; const find = act(async () => { const q = $('#uq').value.trim(); if (!q) { $('#ul').innerHTML = ''; return; } const d = await api('/manage/users?limit=10&q=' + encodeURIComponent(q));
    $('#ul').innerHTML = table(['Name', 'ID', 'Email', 'Role', 'Status', ''], d.items.map((u) => tr([E(u.fullName), E(u.identifier), E(u.email), E(R[u.role]), E(u.status), u.id === me.id || u.role === 'FACULTY_COORDINATOR' ? '' : `<button class="btn sm" data-x="s|${u.id}|${u.status}">${u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button> <button class="btn sm" data-x="p|${u.id}">Reset pw</button>`])), 'No match.');
    $('#ul').querySelectorAll('[data-x]').forEach((b) => (b.onclick = act(async () => { const [k, id, st] = b.dataset.x.split('|'); if (k === 'p') return pw(id); await api('/manage/users/' + id, { method: 'PATCH', body: { status: st === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } }); find(); }))); });
  $('#uq').oninput = () => { clearTimeout(t2); t2 = setTimeout(find, 300); };
};
PAGES.logs = async (v) => {
  let page = 1, action = '';
  v.innerHTML = `<h1 class="t">Audit log</h1><p class="lead">Every privileged action and every security event, newest first.</p><div class="bar"><select id="la"><option value="">All actions</option>${['LOGIN_FAILED', 'LOGIN_LOCKED', 'FORBIDDEN_ACCESS', 'PRIVILEGE_ESCALATION_ATTEMPT', 'INVITE_CREATED', 'INVITE_REJECTED', 'REGISTER_WITH_INVITE', 'SECTION_ASSIGNED', 'SECTION_UNASSIGNED', 'PROBLEM_PUBLISHED', 'SUBMISSION_CODE_VIEWED', 'PRIVILEGE_REVOKED', 'ACCOUNT_SUSPENDED', 'PASSWORD_RESET_BY_FACULTY', 'INTERVENTION_RECORDED'].map((a) => `<option>${a}</option>`).join('')}</select><span><button class="btn sm" id="lp">Newer</button> <button class="btn sm" id="ln">Older</button></span></div><div id="lg"></div>`;
  const draw = async () => { const d = await api('/manage/audit-logs?page=' + page + (action ? '&action=' + action : '')); $('#lg').innerHTML = table(['When', 'Action', 'By', 'Target', 'IP', 'Details'], d.items.map((l) => tr([when(l.at), E(l.action), E(l.actor || '—'), E(l.target || '—'), E(l.ip || ''), `<span class="note">${E(JSON.stringify(l.meta || {})).slice(0, 80)}</span>`])), 'No events.'); $('#lp').disabled = page <= 1; $('#ln').disabled = page * 30 >= d.total; };
  $('#la').onchange = (e) => { action = e.target.value; page = 1; draw().catch(fail); }; $('#lp').onclick = () => { page--; draw().catch(fail); }; $('#ln').onclick = () => { page++; draw().catch(fail); }; await draw();
};

// ================= BOOT =================
function forcePassword(v) {
  $('#nav').innerHTML = ''; v.innerHTML = `<div class="card" style="max-width:440px;margin:40px auto"><h3>Choose a new password</h3><p class="note">Your account was issued with a temporary password. Set your own to continue.</p><form id="cp"><label>Current (temporary) password<input name="c" type="password" autocomplete="current-password"></label><label>New password (10+ characters, a letter and a number)<input name="n" type="password" autocomplete="new-password"></label><p class="err" id="ce"></p><button class="btn p" type="submit">Change password</button></form></div>`;
  $('#cp').onsubmit = async (e) => { e.preventDefault(); try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: e.target.c.value, newPassword: e.target.n.value } }); location.reload(); } catch (x) { $('#ce').textContent = x.message; } };
}
const TABS = () => isFac() ? [['insights', 'Overview'], ['students', 'Students'], ['problems', 'Problems'], ['audit', 'Audit'], ['team', 'Team'], ['leaderboard', 'Leaderboard'], ['logs', 'Logs']]
  : [['home', 'Home'], ['practice', 'Practice'], ['leaderboard', 'Leaderboard'], ['connect', 'Connect']].concat(isCo() ? [['students', 'My students'], ['problems', 'Problems'], ['insights', 'Insights'], ['audit', 'Audit']] : []);
async function route() {
  stops.forEach((f) => f()); stops = []; const tabs = TABS(), name = location.hash.slice(1), cur = tabs.find((t) => t[0] === name) ? name : tabs[0][0], v = $('#view');
  $('#nav').innerHTML = tabs.map((t) => `<a href="#${t[0]}" class="${t[0] === cur ? 'on' : ''}">${t[1]}</a>`).join(''); v.innerHTML = '<div class="empty">Loading…</div>';
  try { await PAGES[cur](v); } catch (e) { v.innerHTML = `<div class="card"><h3>Could not load this page</h3><p class="bad">${E(e.message)}</p></div>`; }
}
(async () => {
  try { const d = await api('/auth/me'); me = d.user; } catch (e) { return; }
  $('#nm').textContent = me.fullName; $('#badge').textContent = R[me.role]; document.title = 'NEXORA · ' + R[me.role];
  if (me.mustChangePassword) return forcePassword($('#view'));
  addEventListener('hashchange', route); route();
})();
})();
