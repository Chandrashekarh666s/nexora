// Trusted provisioning of the first faculty account. Faculty cannot be created through the public API.
const config = require('../src/config');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const policy = require('../src/lib/policy');
const { ROLES } = require('../src/lib/rbac');

(async () => {
  const { FACULTY_NAME: name, FACULTY_IDENTIFIER: id, FACULTY_EMAIL: email, FACULTY_INITIAL_PASSWORD: pw } = process.env;
  if (!name || !id || !email || !pw) throw new Error('Set FACULTY_NAME, FACULTY_IDENTIFIER, FACULTY_EMAIL and FACULTY_INITIAL_PASSWORD in .env');
  if (!config.mongoUri) throw new Error('Set MONGODB_URI in .env');
  const problems = policy.passwordProblems(pw, { identifier: id, email });
  if (problems.length) throw new Error('Initial password rejected: ' + problems.join(' '));

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await User.init();
  const exists = await User.findOne({ $or: [{ identifier: policy.normalizeUsn(id) }, { email: policy.normalizeEmail(email) }] });
  if (exists) {
    console.log('A user with this identifier or email already exists. Nothing changed.');
  } else {
    const user = await User.create({
      fullName: name, identifier: policy.normalizeUsn(id), email: policy.normalizeEmail(email),
      passwordHash: await bcrypt.hash(pw, 12), role: ROLES.FACULTY_COORDINATOR, mustChangePassword: true,
    });
    await AuditLog.create({ action: 'PROVISION_FACULTY', targetId: user._id, meta: { via: 'seed-script' } });
    console.log('Faculty account created. Sign in, then change the password when prompted. Remove FACULTY_* from .env.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
