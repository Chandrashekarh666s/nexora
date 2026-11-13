const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const config = require('./config');
const { errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1); // Render/Vercel-style proxies, so rate limits see real client IPs

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        // 'unsafe-inline' is needed while page scripts/styles are inline. See README known limitations.
        // jsdelivr is allowed ONLY for the Monaco editor in the Coding Arena.
        'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        'font-src': ['https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        'img-src': ["'self'", 'data:'],
        'worker-src': ["'self'", 'blob:'],
        'connect-src': ["'self'", 'https://cdn.jsdelivr.net'],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
  }));
  if (config.frontendUrl) app.use('/api', cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 100000 : 900,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down', uptimeSeconds: Math.round(process.uptime()) });
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/public', require('./routes/public'));
  app.use('/api/students', require('./routes/students'));
  app.use('/api/manage', require('./routes/manage'));
  app.use('/api/problems', require('./routes/problems'));
  app.use('/api/submissions', require('./routes/submissions'));
  app.use('/api/me', require('./routes/me'));
  app.use('/api/leaderboard', require('./routes/leaderboard'));
  app.use('/api/analytics', require('./routes/analytics'));
  app.use('/api/interventions', require('./routes/interventions'));
  app.use('/api/integrations', require('./routes/integrations'));
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
