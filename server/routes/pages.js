// Page router: serves server-side HTML shells for every screen.
const express = require('express');
const path = require('path');
const router = express.Router();

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const INDEX = path.join(PUBLIC, 'index.html');

// Public landing
router.get('/', (_req, res) => res.sendFile(INDEX));
router.get('/index.html', (_req, res) => res.sendFile(INDEX));

// Auth pages
router.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'login.html')));
router.get('/apply', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'apply.html')));
router.get('/logout', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'logout.html')));

// App pages
router.get('/app', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'dashboard.html')));
router.get('/app/dashboard', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'dashboard.html')));
router.get('/app/pathway', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'pathway.html')));
router.get('/app/lesson/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'lesson.html')));
router.get('/app/workbook', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'workbook.html')));
router.get('/app/poe', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'poe.html')));
router.get('/app/poe/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'app', 'poe-item.html')));

// Admin
router.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'dashboard.html')));
router.get('/admin/users', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'users.html')));
router.get('/admin/course-builder', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'course-builder.html')));
router.get('/admin/curriculum-mapping', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'curriculum-mapping.html')));
router.get('/admin/poe-templates', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'poe-templates.html')));
router.get('/admin/reports', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'reports.html')));
router.get('/admin/audit', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'admin', 'audit.html')));

// Facilitator / Assessor / Moderator / Supervisor / Finance
router.get('/facilitator', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'facilitator', 'dashboard.html')));
router.get('/facilitator/cohort/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'facilitator', 'cohort.html')));
router.get('/facilitator/learner/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'facilitator', 'learner.html')));

router.get('/assessor', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'assessor', 'dashboard.html')));
router.get('/assessor/review/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'assessor', 'review.html')));

router.get('/moderator', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'moderator', 'dashboard.html')));
router.get('/moderator/review/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'moderator', 'review.html')));

router.get('/supervisor', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'supervisor', 'dashboard.html')));
router.get('/supervisor/learner/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'supervisor', 'learner.html')));

router.get('/finance', (_req, res) => res.sendFile(path.join(PUBLIC, 'pages', 'finance', 'dashboard.html')));

module.exports = router;
