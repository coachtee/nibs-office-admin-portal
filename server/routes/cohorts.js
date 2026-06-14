const express = require('express');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json({ cohorts: db.prepare('SELECT * FROM cohorts ORDER BY created_at DESC').all() });
});

router.post('/', requireCap('cohorts.*'), (req, res) => {
  const { name, course_id, facilitator_id, start_date, end_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const id = uid();
  db.prepare(`INSERT INTO cohorts (id,name,course_id,facilitator_id,start_date,end_date) VALUES (?,?,?,?,?,?)`)
    .run(id, name, course_id || null, facilitator_id || null, start_date || null, end_date || null);
  audit({ user_id: req.user.id, role: req.user.role, action: 'cohort_created', new_status: 'active', comment: name, ip: req.ip });
  res.json({ ok: true, id });
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cohorts WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const learners = db.prepare(`SELECT id,full_name,email,status,payment_status,last_login FROM users WHERE cohort_id = ? AND role = 'learner' ORDER BY full_name`).all(req.params.id);
  const facilitator = c.facilitator_id ? db.prepare('SELECT id,full_name,email FROM users WHERE id = ?').get(c.facilitator_id) : null;
  res.json({ cohort: c, learners, facilitator });
});

module.exports = router;
