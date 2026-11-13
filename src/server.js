const config = require('./config');
const mongoose = require('mongoose');
const { createApp } = require('./app');
const User = require('./models/User');
const AuditLog = require('./models/AuditLog');
const Invite = require('./models/Invite');
const Assignment = require('./models/Assignment');
const Problem = require('./models/Problem');
const Submission = require('./models/Submission');
const Attempt = require('./models/Attempt');
const Intervention = require('./models/Intervention');
const sync = require('./lib/sync');

async function main() {
  if (!config.mongoUri) throw new Error('Missing required environment variable: MONGODB_URI');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected.');
  // Build indexes (including the unique USN/email indexes) before accepting traffic.
  await Promise.all([User, AuditLog, Invite, Assignment, Problem, Submission, Attempt, Intervention].map((m) => m.init()));

  const server = createApp().listen(config.port, () => {
    console.log(`NEXORA running on http://localhost:${config.port}`);
  });

  sync.start(); // automatic LeetCode/GitHub refresh

  const stop = (signal) => {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => { await mongoose.disconnect(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
