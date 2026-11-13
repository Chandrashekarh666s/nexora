// End-to-end checks for invites, coordinator scoping, the Coding Arena, scoring, crown, audit, integrations.
// The "Judge0" here is a TEST DOUBLE (a tiny local HTTP server). It proves OUR pipeline, not Judge0 itself.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
const http = require('http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');

let app, fake, dbh, User, F, C1, C2;
const PW = 'Orbit-Maple-42';
const jobs = {};
function startFakeJudge0() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'POST') {
          const j = JSON.parse(body), src = Buffer.from(j.source_code, 'base64').toString(), stdin = Buffer.from(j.stdin || '', 'base64').toString();
          if (src.includes('DOWN')) { res.statusCode = 500; return res.end('{}'); }
          const t = String(Math.random()); let out = { status: { id: 3 }, time: '0.012', memory: 2048 };
          const b = (s) => Buffer.from(s).toString('base64');
          if (src.includes('DOUBLE')) out.stdout = b(String(Number(stdin) * 2) + '\n');
          else if (src.includes('WRONG')) out.stdout = b('0\n');
          else if (src.includes('BOOM')) out = { status: { id: 11 }, stderr: b('segfault'), time: '0.01', memory: 1000 };
          else if (src.includes('SLOW')) out = { status: { id: 5 }, time: '3.0', memory: 1000 };
          else if (src.includes('CERR')) out = { status: { id: 6 }, compile_output: b('syntax error') };
          jobs[t] = out; res.statusCode = 201; return res.end(JSON.stringify({ token: t }));
        }
        res.end(JSON.stringify(jobs[req.url.split('/')[2].split('?')[0]] || { status: { id: 13 } }));
      });
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}
before(async () => {
  fake = await startFakeJudge0();
  process.env.JUDGE0_API_URL = `http://127.0.0.1:${fake.address().port}`;
  if (process.env.MONGODB_TEST_URI) dbh = { uri: process.env.MONGODB_TEST_URI, stop: async () => {} };
  else { const { MongoMemoryServer } = require('mongodb-memory-server'); const m = await MongoMemoryServer.create(); dbh = { uri: m.getUri(), stop: () => m.stop() }; }
  await mongoose.connect(dbh.uri); await mongoose.connection.dropDatabase();
  User = require('../../src/models/User');
  for (const m of ['Invite', 'Assignment', 'Problem', 'Submission', 'Attempt', 'Intervention', 'AuditLog']) await require(`../../src/models/${m}`).init();
  await User.init();
  app = require('../../src/app').createApp();
  F = await User.create({ fullName: 'Prof Rao', identifier: 'FAC001', email: 'rao@x.edu', passwordHash: await bcrypt.hash(PW, 12), role: 'FACULTY_COORDINATOR' });
});
after(async () => { await mongoose.disconnect(); await dbh.stop(); fake.close(); });

const agent = () => request.agent(app);
const login = async (a, id) => { const r = await a.post('/api/auth/login').send({ identifier: id, password: PW }); assert.equal(r.status, 200, JSON.stringify(r.body)); return a; };
const reg = (a, n, extra = {}) => a.post('/api/auth/register').send({ fullName: 'Stu ' + n, usn: 'CSE24' + String(n).padStart(3, '0'), email: `stu${n}@x.edu`, semester: 3, section: 'A', password: PW, terms: true, ...extra });
const ids = {};

test('faculty issues invites; coordinator and faculty accounts are created ONLY by redeeming them (single-use, role-bound)', async () => {
  const fac = await login(agent(), 'FAC001');
  const inv = await fac.post('/api/manage/invites').send({ role: 'coordinator', note: 'sem3 A' }); assert.equal(inv.status, 201);
  const code = inv.body.data.code, a = agent();
  const wrongRole = await reg(a, 90, { role: 'faculty', inviteCode: code }); assert.equal(wrongRole.status, 403);
  const ok = await reg(a, 1, { role: 'coordinator', inviteCode: code, semester: 5, section: 'B' }); assert.equal(ok.status, 201); assert.equal(ok.body.data.user.role, 'STUDENT_COORDINATOR'); ids.c1 = ok.body.data.user.id;
  const again = await reg(agent(), 91, { role: 'coordinator', inviteCode: code }); assert.equal(again.status, 403); // already used
  const inv2 = await fac.post('/api/manage/invites').send({ role: 'faculty' });
  const f2 = await reg(agent(), 2, { role: 'faculty', inviteCode: inv2.body.data.code, semester: undefined, section: undefined }); assert.equal(f2.status, 201); assert.equal(f2.body.data.user.role, 'FACULTY_COORDINATOR');
  const stu = await agent().post('/api/auth/register').send({ fullName: 'Student X', usn: 'CSE24100', email: 'x100@x.edu', semester: 3, section: 'A', password: PW, terms: true }); assert.equal(stu.status, 201);
  const nope = await agent().get('/api/manage/invites'); assert.equal(nope.status, 401);
  const asStudent = await login(agent(), 'CSE24100'); assert.equal((await asStudent.get('/api/manage/invites')).status, 403);
  const asCoord = await login(agent(), 'CSE24001'); assert.equal((await asCoord.post('/api/manage/invites').send({ role: 'faculty' })).status, 403);
});

test('coordinator sees ONLY assigned sections; cannot read other sections (IDOR); faculty sees all', async () => {
  const fac = await login(agent(), 'FAC001');
  for (let i = 10; i < 13; i++) { const r = await reg(agent(), i, { section: 'A' }); ids['a' + i] = r.body.data.user.id; }
  const rb = await reg(agent(), 20, { section: 'B' }); ids.b20 = rb.body.data.user.id;
  const co = await login(agent(), 'CSE24001');
  assert.equal((await co.get('/api/students')).body.data.total, 0); // unassigned coordinator sees nobody
  assert.equal((await co.get('/api/students/' + ids.a10)).status, 403);
  const as = await fac.post('/api/manage/assignments').send({ coordinatorId: ids.c1, semester: 3, section: 'A' }); assert.equal(as.status, 201);
  const list = (await co.get('/api/students')).body.data; assert.equal(list.total, 4); // 3 + X (all sem3 A students)
  assert.ok(list.items.every((u) => u.section === 'A' && u.semester === 3));
  assert.equal((await co.get('/api/students/' + ids.a10)).status, 200);
  assert.equal((await co.get('/api/students/' + ids.b20)).status, 403);
  assert.equal((await co.get('/api/submissions?studentId=' + ids.b20)).status, 403);
  assert.equal((await co.get('/api/manage/coordinators')).status, 403);
  assert.ok((await fac.get('/api/students')).body.data.total >= 6);
  assert.ok((await fac.get('/api/manage/assignments')).body.data.items.length === 1);
});

let prob;
test('problems: coordinator drafts and publishes, students never see hidden tests', async () => {
  const co = await login(agent(), 'CSE24001');
  const mk = (title) => ({ title, statement: 'Print double the number.', difficulty: 'EASY', topic: 'Math', targetSeconds: 600, examples: [{ input: '2', output: '4' }],
    tests: [{ input: '2', expected: '4' }, { input: '5', expected: '10' }, { input: '50', expected: '100', hidden: true }] });
  const p = await co.post('/api/problems').send(mk('Double it')); assert.equal(p.status, 201); prob = p.body.data.problem.id;
  const s = await login(agent(), 'CSE24010');
  assert.equal((await s.get('/api/problems/' + prob)).status, 404); // draft is invisible
  assert.equal((await co.post('/api/problems/' + prob + '/publish').send({})).status, 200);
  const g = await s.get('/api/problems/' + prob); assert.equal(g.status, 200);
  const txt = JSON.stringify(g.body); assert.ok(!txt.includes('"100"') && !txt.includes('"hidden":true')); assert.equal(g.body.data.problem.hiddenTestCount, 1); assert.equal(g.body.data.problem.samples.length, 2);
  assert.equal((await s.post('/api/problems').send(mk('x'))).status, 403);
  assert.equal((await s.get('/api/problems/manage/list')).status, 403);
});

test('Run vs Submit: run stores nothing; submit grades ALL tests, stores, verdicts mapped; hidden data never returned', async () => {
  const s = await login(agent(), 'CSE24010'), url = '/api/problems/' + prob;
  const run = await s.post(url + '/run').send({ language: 'python', code: '# DOUBLE' }); assert.equal(run.status, 200);
  assert.equal(run.body.data.verdict, 'ACCEPTED'); assert.equal(run.body.data.total, 2); assert.equal(run.body.data.awarded, 0);
  assert.equal(await require('../../src/models/Submission').countDocuments({}), 0);
  const wa = await s.post(url + '/submit').send({ language: 'python', code: '# WRONG' }); assert.equal(wa.body.data.submission.verdict, 'WRONG_ANSWER'); assert.equal(wa.body.data.submission.attempt, 1);
  assert.equal((await s.post(url + '/submit').send({ language: 'c', code: '// CERR' })).body.data.submission.verdict, 'COMPILATION_ERROR');
  assert.equal((await s.post(url + '/submit').send({ language: 'c', code: '// BOOM' })).body.data.submission.verdict, 'RUNTIME_ERROR');
  assert.equal((await s.post(url + '/submit').send({ language: 'c', code: '// SLOW' })).body.data.submission.verdict, 'TIME_LIMIT_EXCEEDED');
  const down = await s.post(url + '/submit').send({ language: 'c', code: '// DOWN' }); assert.equal(down.body.data.submission.verdict, 'INTERNAL_ERROR'); assert.match(down.body.data.submission.note, /does not count against you/);
  const ok = await s.post(url + '/submit').send({ language: 'python', code: '# DOUBLE' }); assert.equal(ok.status, 201);
  assert.equal(ok.body.data.submission.verdict, 'ACCEPTED'); assert.equal(ok.body.data.submission.passed, 3); assert.equal(ok.body.data.submission.total, 3); assert.equal(ok.body.data.submission.attempt, 6);
  assert.ok(!JSON.stringify(ok.body).includes('"100"'));
  assert.equal((await s.post(url + '/submit').send({ language: 'brainfuck', code: 'x' })).status, 400);
  assert.equal((await s.post(url + '/submit').send({ language: 'c', code: 'x'.repeat(20001) })).status, 400);
});

test('dashboard, leaderboard and crown use real records; INTERNAL_ERROR is excluded from student stats', async () => {
  const s = await login(agent(), 'CSE24010'), d = (await s.get('/api/me/dashboard')).body.data;
  assert.equal(d.stats.solved.total, 1); assert.equal(d.stats.points, 10); assert.equal(d.stats.systemFailures, 1); assert.equal(d.stats.submissions, 5);
  assert.equal(d.verdicts.INTERNAL_ERROR, undefined); assert.ok(d.crown.fill > 0 && d.crown.fill <= 99);
  const lb = (await s.get('/api/leaderboard?period=week')).body.data;
  assert.equal(lb.items[0].name, 'Stu 10'); assert.equal(lb.items[0].points, 10); assert.equal(lb.programmerOfWeek.name, 'Stu 10'); assert.equal(lb.houses.length, 4);
  const resub = await s.post('/api/problems/' + prob + '/submit').send({ language: 'python', code: '# DOUBLE' }); assert.equal(resub.status, 201);
  assert.equal((await s.get('/api/leaderboard?period=all')).body.data.items[0].points, 10); // re-solving earns nothing: no farming
  const act = (await s.get('/api/me/activity')).body.data; assert.equal(Object.values(act.days).reduce((a, b) => a + b, 0), 2);
});

test('code inspection: owner, assigned coordinator and faculty yes; other student / other-section coordinator no; staff views are audited', async () => {
  const Sub = require('../../src/models/Submission'), sub = await Sub.findOne({ verdict: 'ACCEPTED' });
  const owner = await login(agent(), 'CSE24010'); assert.equal((await owner.get('/api/submissions/' + sub.id)).body.data.submission.code, '# DOUBLE');
  assert.equal((await (await login(agent(), 'CSE24011')).get('/api/submissions/' + sub.id)).status, 403);
  assert.equal((await (await login(agent(), 'CSE24001')).get('/api/submissions/' + sub.id)).status, 200);
  assert.equal((await (await login(agent(), 'FAC001')).get('/api/submissions/' + sub.id)).status, 200);
  assert.ok(await require('../../src/models/AuditLog').findOne({ action: 'SUBMISSION_CODE_VIEWED' }));
  const outsider = await User.create({ fullName: 'Co2', identifier: 'CSE24777', email: 'co2@x.edu', passwordHash: await bcrypt.hash(PW, 12), role: 'STUDENT_COORDINATOR', semester: 5, section: 'C' });
  assert.equal((await (await login(agent(), 'CSE24777')).get('/api/submissions/' + sub.id)).status, 403);
  assert.equal((await (await login(agent(), 'CSE24777')).get('/api/analytics/problem/' + prob + '/audit')).body.data.uploaded.length, 0);
});

test('Uploaded / Not uploaded audit separates PENDING, NOT_ATTEMPTED, DEADLINE_MISSED, TECHNICAL_FAILURE', async () => {
  const co = await login(agent(), 'CSE24001'), s11 = await login(agent(), 'CSE24011'), s12 = await login(agent(), 'CSE24012');
  await s11.get('/api/problems/' + prob); // opened, never submitted
  await s12.get('/api/problems/' + prob); await s12.post('/api/problems/' + prob + '/submit').send({ language: 'c', code: '// DOWN' }); // only a system failure
  let a = (await co.get('/api/analytics/problem/' + prob + '/audit')).body.data; const st = (n) => (a.notUploaded.find((x) => x.name === n) || {}).status;
  assert.equal(a.uploaded.length, 1); assert.equal(st('Stu 11'), 'PENDING'); assert.equal(st('Student X'), 'NOT_ATTEMPTED'); assert.equal(st('Stu 12'), 'TECHNICAL_FAILURE');
  const P = require('../../src/models/Problem'); await P.updateOne({ _id: prob }, { $set: { deadline: new Date(Date.now() - 3600000) } });
  a = (await co.get('/api/analytics/problem/' + prob + '/audit')).body.data; assert.equal(st('Stu 11'), 'DEADLINE_MISSED');
  const ov = (await co.get('/api/analytics/overview')).body.data; assert.equal(ov.totals.students, 4); assert.ok(ov.totals.systemFailures >= 2); assert.ok(ov.inactive.length >= 3);
});

test('interventions are scoped, recorded and listed; faculty suspends, resets password, revokes; audit log records it', async () => {
  const co = await login(agent(), 'CSE24001'), fac = await login(agent(), 'FAC001');
  assert.equal((await co.post('/api/interventions').send({ studentId: ids.a11, note: 'Stuck on loops' })).status, 201);
  assert.equal((await co.post('/api/interventions').send({ studentId: ids.b20, note: 'nope' })).status, 403);
  assert.equal((await co.get('/api/interventions?studentId=' + ids.a11)).body.data.items.length, 1);
  assert.equal((await fac.patch('/api/manage/users/' + ids.a12).send({ status: 'SUSPENDED' })).status, 200);
  assert.equal((await agent().post('/api/auth/login').send({ identifier: 'CSE24012', password: PW })).status, 403);
  await fac.patch('/api/manage/users/' + ids.a12).send({ status: 'ACTIVE' });
  const rp = await fac.post('/api/manage/users/' + ids.a12 + '/reset-password'); assert.match(rp.body.data.temporaryPassword, /^Nx/);
  const t = agent(), l = await t.post('/api/auth/login').send({ identifier: 'CSE24012', password: rp.body.data.temporaryPassword }); assert.equal(l.status, 200); assert.equal(l.body.data.mustChangePassword, true);
  assert.equal((await t.get('/api/me/dashboard')).status, 403); // forced change first
  assert.equal((await fac.patch('/api/manage/users/' + ids.a11).send({ house: 'Ada' })).status, 200);
  assert.equal((await co.patch('/api/students/' + ids.a10 + '/house').send({ house: 'Turing' })).status, 200);
  assert.equal((await co.patch('/api/students/' + ids.b20 + '/house').send({ house: 'Turing' })).status, 403);
  assert.equal((await fac.post('/api/manage/users/' + ids.c1 + '/revoke-coordinator')).body.data.user.role, 'STUDENT');
  assert.equal((await co.get('/api/students')).status, 401); // coordinator session killed immediately
  const logs = (await fac.get('/api/manage/audit-logs?limit=100')).body.data.items.map((l) => l.action);
  for (const a of ['INVITE_CREATED', 'REGISTER_WITH_INVITE', 'SECTION_ASSIGNED', 'PROBLEM_PUBLISHED', 'ACCOUNT_SUSPENDED', 'PASSWORD_RESET_BY_FACULTY', 'PRIVILEGE_REVOKED', 'INTERVENTION_RECORDED']) assert.ok(logs.includes(a), a);
});

test('integrations: link validates names; unreachable providers degrade to a status, never an error page', async () => {
  const s = await login(agent(), 'CSE24010');
  assert.equal((await s.post('/api/integrations/link').send({ github: 'bad name!' })).status, 400);
  const r = await s.post('/api/integrations/link').send({ github: 'octocat', leetcode: 'someone' }); assert.equal(r.status, 200);
  assert.ok(['OK', 'UNAVAILABLE', 'RATE_LIMITED', 'NOT_FOUND'].includes(r.body.data.integrations.github.status));
  assert.ok(['OK', 'UNAVAILABLE', 'NOT_FOUND'].includes(r.body.data.integrations.leetcode.status));
});
