const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth, audit } = require('../middleware/auth');
const { uid, now } = require('../utils/helpers');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), user.id);
  const token = signToken(user);
  setAuthCookie(res, token);
  audit({ user_id: user.id, role: user.role, action: 'login', ip: req.ip });
  res.json({ ok: true, user: { id: user.id, full_name: user.full_name, role: user.role, status: user.status, payment_status: user.payment_status } });
});

router.post('/logout', (req, res) => {
  if (req.user) audit({ user_id: req.user.id, role: req.user.role, action: 'logout', ip: req.ip });
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

// Public application: create a learner in pending_payment state
router.post('/apply', (req, res) => {
  const { full_name, email, phone, id_number, cohort_id } = req.body || {};
  if (!full_name || !email) return res.status(400).json({ error: 'missing_fields' });
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
  if (exists) return res.status(409).json({ error: 'email_in_use' });
  const id = uid();
  const password_hash = bcrypt.hashSync('Student123!', 10);
  db.prepare(`INSERT INTO users (id,email,password_hash,full_name,role,phone,id_number,status,payment_status,cohort_id,avatar_color)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, email, password_hash, full_name, 'learner',
    phone || null, id_number || null, 'pending_payment', 'pending_payment',
    cohort_id || null, '#1F5132'
  );
  audit({ user_id: id, role: 'learner', action: 'application_submitted', new_status: 'pending_payment', comment: 'New application via public form', ip: req.ip });
  res.json({ ok: true, id, default_password: 'Student123!' });
});

module.exports = router;
