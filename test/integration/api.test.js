// Needs: npm install (downloads a MongoDB binary the first time via mongodb-memory-server).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');

let mongod, app, User, AuditLog;
// MONGODB_TEST_URI lets you test against any MongoDB-compatible server; otherwise an in-memory MongoDB is downloaded.
const startDb = async () => { if (process.env.MONGODB_TEST_URI) return { uri: process.env.MONGODB_TEST_URI, stop: async () => {} }; const { MongoMemoryServer } = require('mongodb-memory-server'); const m = await MongoMemoryServer.create(); return { uri: m.getUri(), stop: () => m.stop() }; };

before(async () => {
  mongod = await startDb();
  await mongoose.connect(mongod.uri);
  await mongoose.connection.dropDatabase();
  User = require('../../src/models/User');
  AuditLog = require('../../src/models/AuditLog');
  await User.init();
  app = require('../../src/app').createApp();
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });

const PASSWORD = 'Orbit-Maple-42';
const studentBody = (n, extra = {}) => ({
  fullName: 'Student ' + n, usn: 'CSE20240' + String(n).padStart(2, '0'), email: `s${n}@example.edu`,
  semester: 3, section: 'A', password: PASSWORD, terms: true, ...extra,
});
async function makeFaculty(n, mustChange = false) {
  return User.create({
    fullName: 'Prof ' + n, identifier: 'FAC00' + n, email: `fac${n}@example.edu`,
    passwordHash: await bcrypt.hash('Faculty-Pass-77', 12), role: 'FACULTY_COORDINATOR', mustChangePassword: mustChange,
  });
}
const login = (agent, identifier, password) => agent.post('/api/auth/login').send({ identifier, password });

test('register creates a STUDENT, hashes the password and starts a session', async () => {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send(studentBody(1));
  assert.equal(r.status, 201);
  assert.equal(r.body.data.user.role, 'STUDENT');
  assert.equal(JSON.stringify(r.body).includes('passwordHash'), false);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.identifier, 'CSE2024001');
  const stored = await User.findOne({ identifier: 'CSE2024001' }).select('+passwordHash');
  assert.notEqual(stored.passwordHash, PASSWORD);
  assert.ok(stored.passwordHash.startsWith('$2'));
});

test('a privileged role without a valid invite is refused; status/house fields are rejected and logged', async () => {
  const a = await request(app).post('/api/auth/register').send(studentBody(40, { role: 'faculty', inviteCode: 'NX-NOTREAL000' }));
  assert.equal(a.status, 403); assert.equal(a.body.error.code, 'INVALID_INVITE');
  assert.equal(await User.countDocuments({ identifier: 'CSE2024040' }), 0);
  const b = await request(app).post('/api/auth/register').send(studentBody(41, { status: 'ACTIVE' }));
  assert.equal(b.status, 400); assert.equal(b.body.error.code, 'UNEXPECTED_FIELDS');
  assert.ok(await AuditLog.findOne({ action: 'PRIVILEGE_ESCALATION_ATTEMPT' }));
});

test('duplicate USN returns 409', async () => {
  const r = await request(app).post('/api/auth/register').send(studentBody(1, { email: 'other@example.edu' }));
  assert.equal(r.status, 409);
});

test('a password containing the USN is rejected', async () => {
  const r = await request(app).post('/api/auth/register').send(studentBody(3, { password: 'xCSE2024003x9' }));
  assert.equal(r.status, 400);
});

test('login: wrong password 401, correct password 200', async () => {
  assert.equal((await login(request(app), 'CSE2024001', 'Wrong-Pass-99')).status, 401);
  const ok = await login(request.agent(app), 'cse2024001', PASSWORD);
  assert.equal(ok.status, 200);
});

test('protected endpoints reject requests without a session', async () => {
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/students')).status, 401);
});

test('IDOR: a student cannot read another student, but can read themselves', async () => {
  const a = request.agent(app);
  const b = request.agent(app);
  const ra = await a.post('/api/auth/register').send(studentBody(4));
  const rb = await b.post('/api/auth/register').send(studentBody(5));
  const idA = ra.body.data.user.id, idB = rb.body.data.user.id;
  assert.equal((await a.get('/api/students/' + idB)).status, 403);
  assert.equal((await a.get('/api/students/' + idA)).status, 200);
  assert.equal((await a.get('/api/students/not-an-id')).status, 400);
  assert.ok(await AuditLog.findOne({ action: 'FORBIDDEN_ACCESS', targetId: idB }));
});

test('faculty can read any student and list students; students cannot list', async () => {
  await makeFaculty(1);
  const f = request.agent(app);
  assert.equal((await login(f, 'FAC001', 'Faculty-Pass-77')).status, 200);
  const list = await f.get('/api/students?limit=2&page=1');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.total >= 3);
  assert.equal(list.body.data.items.length, 2);
  const one = await User.findOne({ identifier: 'CSE2024001' });
  assert.equal((await f.get('/api/students/' + one.id)).status, 200);
  const s = request.agent(app);
  await login(s, 'CSE2024001', PASSWORD);
  assert.equal((await s.get('/api/students')).status, 403);
});

test('mustChangePassword blocks access until the password is changed; old sessions end', async () => {
  await makeFaculty(2, true);
  const f = request.agent(app);
  const old = request.agent(app);
  assert.equal((await login(f, 'FAC002', 'Faculty-Pass-77')).body.data.mustChangePassword, true);
  await login(old, 'FAC002', 'Faculty-Pass-77');
  const blocked = await f.get('/api/students');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await f.get('/api/auth/me')).status, 200);
  const ch = await f.post('/api/auth/change-password').send({ currentPassword: 'Faculty-Pass-77', newPassword: 'New-Faculty-Pass-88' });
  assert.equal(ch.status, 200);
  assert.equal((await f.get('/api/students')).status, 200);
  assert.equal((await old.get('/api/auth/me')).status, 401);
});

test('five wrong passwords lock the account', async () => {
  for (let i = 0; i < 5; i++) await login(request(app), 'CSE2024004', 'Wrong-Pass-99');
  const r = await login(request(app), 'CSE2024004', PASSWORD);
  assert.equal(r.status, 429);
});

test('suspended accounts cannot sign in', async () => {
  await User.updateOne({ identifier: 'CSE2024005' }, { status: 'SUSPENDED' });
  assert.equal((await login(request(app), 'CSE2024005', PASSWORD)).status, 403);
});

test('health and public stats', async () => {
  const h = await request(app).get('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.db, 'up');
  const s = await request(app).get('/api/public/stats');
  assert.equal(s.status, 200);
  assert.equal(typeof s.body.data.registeredStudents, 'number');
  assert.equal(s.body.data.problemsSolved, null);
});
