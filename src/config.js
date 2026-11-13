require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret,
  frontendUrl: process.env.FRONTEND_URL || '',
  cookieName: 'nx_token',
  cookieSecure: isProd,
  judge0Url: (process.env.JUDGE0_API_URL || '').replace(/\/$/, ''),
  judge0Key: process.env.JUDGE0_API_KEY || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  syncHours: Number(process.env.SYNC_HOURS) || 6,
  tzOffsetMin: Number(process.env.INSTITUTION_TZ_OFFSET_MIN ?? 330), // IST = UTC+5:30; one timezone for every streak/calendar
};
