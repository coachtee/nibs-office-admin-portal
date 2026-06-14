const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/learners', (_req, res) => {
  res.json({ learners: db.prepare(`SELECT id,full_name,email,payment_status,status,cohort_id,phone,created_at FROM users WHERE role='learner' ORDER BY created_at DESC`).all() });
});

router.get('/payments', (_req, res) => {
  res.json({ payments: db.prepare(`
    SELECT p.*, u.full_name, u.email FROM payments p JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC LIMIT 500
  `).all() });
});

router.post('/payment', (req, res) => {
  if (!['finance','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { user_id, amount_cents, method, reference, status } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'missing_user' });
  const id = uid();
  db.prepare(`INSERT INTO payments (id,user_id,amount_cents,currency,method,reference,status) VALUES (?,?,?,?,?,?,?)`)
    .run(id, user_id, amount_cents || 0, 'ZAR', method || 'eft', reference || null, status || 'paid');
  if (status === 'paid') {
    db.prepare("UPDATE users SET payment_status = 'active', status = 'active' WHERE id = ?").run(user_id);
    audit({ user_id: req.user.id, role: req.user.role, action: 'payment_marked_paid', related_learner: user_id, new_status: 'active', ip: req.ip });
  }
  res.json({ ok: true, id });
});

router.post('/access', (req, res) => {
  if (!['finance','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { user_id, status } = req.body || {};
  if (!user_id || !status) return res.status(400).json({ error: 'missing_fields' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE users SET status = ?, payment_status = ? WHERE id = ?').run(status, status, user_id);
  audit({ user_id: req.user.id, role: req.user.role, action: 'access_status_changed', old_status: u.status, new_status: status, related_learner: user_id, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
