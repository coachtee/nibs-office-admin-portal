const express = require('express');
const db = require('../db');
const { requireAuth, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/learners', (req, res) => {
  if (req.user.role === 'employer') {
    const rows = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.cohort_id, u.status
      FROM users u
      WHERE u.role = 'learner' AND u.employer_id = ?
      ORDER BY u.full_name
    `).all(req.user.id);
    return res.json({ learners: rows });
  }
  // admin sees all
  res.json({ learners: db.prepare(`SELECT id,full_name,email,cohort_id,status FROM users WHERE role='learner' ORDER BY full_name`).all() });
});

router.get('/learner/:id', (req, res) => {
  if (req.user.role === 'employer') {
    const learner = db.prepare('SELECT * FROM users WHERE id = ? AND employer_id = ?').get(req.params.id, req.user.id);
    if (!learner) return res.status(403).json({ error: 'not_assigned' });
  }
  const learner = db.prepare('SELECT id,full_name,email,cohort_id,status FROM users WHERE id = ? AND role = \'learner\'').get(req.params.id);
  if (!learner) return res.status(404).json({ error: 'not_found' });
  const workplace = db.prepare(`
    SELECT ps.*, pi.title AS item_title, pi.code AS item_code
    FROM poe_submissions ps JOIN poe_items pi ON ps.item_id = pi.id
    WHERE ps.user_id = ? AND pi.code LIKE 'WE-%' ORDER BY ps.updated_at DESC
  `).all(req.params.id);
  const signoffs = db.prepare('SELECT * FROM supervisor_signoffs WHERE user_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ learner, workplace, signoffs });
});

router.post('/signoff', (req, res) => {
  if (!['employer','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { user_id, work_activity_code, feedback, signed_off } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'missing_user' });
  const id = uid();
  db.prepare(`INSERT INTO supervisor_signoffs (id,user_id,supervisor_id,work_activity_code,feedback,signed_off) VALUES (?,?,?,?,?,?)`)
    .run(id, user_id, req.user.id, work_activity_code || null, feedback || null, signed_off ? 1 : 0);
  audit({ user_id: req.user.id, role: req.user.role, action: 'supervisor_signoff', related_learner: user_id, ip: req.ip, new_status: signed_off ? 'signed' : 'pending' });
  res.json({ ok: true, id });
});

module.exports = router;
