// NIBS Pathway Portal — Express server
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');

const { init: initDb } = require('./db/init');
initDb();

const { attachUser, audit } = require('./middleware/auth');

// ===== Environment =====
const APP_ENV = process.env.APP_ENV || 'development';
const APP_URL = process.env.APP_URL || 'http://localhost:8088';
const PORT   = parseInt(process.env.APP_PORT || process.env.PORT || '8088', 10);
const PORT_EFFECTIVE = isNaN(PORT) ? 8088 : PORT;
console.log(`[env] APP_ENV=${APP_ENV} APP_URL=${APP_URL} PORT=${PORT_EFFECTIVE}`);

const app = express();

// EJS not used; we serve static pages and JSON APIs.
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(attachUser);

// Audit wrapper
app.use((req, _res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    // audit only meaningful endpoints; not noisy for assets / static
  }
  next();
});

// Static
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use('/static', express.static(PUBLIC_DIR, { maxAge: '1d' }));
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')));

// PWA
app.get('/manifest.webmanifest', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'manifest.webmanifest')));
app.get('/sw.js', (_req, res) => {
  res.set('Service-Worker-Allowed', '/');
  res.sendFile(path.join(PUBLIC_DIR, 'sw.js'));
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/modules', require('./routes/modules'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/curriculum', require('./routes/curriculum'));
app.use('/api/workbook', require('./routes/workbook'));
app.use('/api/poe', require('./routes/poe'));
app.use('/api/facilitator', require('./routes/facilitator'));
app.use('/api/assessor', require('./routes/assessor'));
app.use('/api/moderator', require('./routes/moderator'));
app.use('/api/supervisor', require('./routes/supervisor'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/cohorts', require('./routes/cohorts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/learner', require('./routes/learner'));

// Page routes (server-rendered HTML shim that loads SPA bundles)
const pages = require('./routes/pages');
app.use('/', pages);

// Healthcheck
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 404
app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'pages', '404.html')));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error', message: err.message });
});

app.listen(PORT_EFFECTIVE, '0.0.0.0', () => {
  console.log(`NIBS Pathway Portal running on http://0.0.0.0:${PORT_EFFECTIVE} (APP_ENV=${APP_ENV}, APP_URL=${APP_URL})`);
});
