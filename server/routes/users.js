const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireCap, requireRole, audit } = require('../middleware/auth');
const { uid, now, pick } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireCap('users.read'), (req, res) => {
  const { role, status, q } = req.query;
  let sql = `SELECT id,email,full_name,role,status,payment_status,cohort_id,phone,last_login,created_at FROM users WHERE 1=1`;
  const params = [];
  if (role) { sql += ' AND role = ?'; params.push(role); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (q) { sql += ' AND (full_name LIKE ? OR email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json({ users: db.prepare(sql).all(...params) });
});

router.post('/', requireCap('users.write'), (req, res) => {
  const { email, full_name, role, phone, id_number, cohort_id, password } = req.body || {};
  if (!email || !full_name || !role) return res.status(400).json({ error: 'missing_fields' });
  if (db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email)) return res.status(409).json({ error: 'email_in_use' });
  const id = uid();
  const pwd = password || 'ChangeMe123!';
  db.prepare(`INSERT INTO users (id,email,password_hash,full_name,role,phone,id_number,status,payment_status,cohort_id,avatar_color)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, email, bcrypt.hashSync(pwd, 10), full_name, role,
    phone || null, id_number || null, 'active', 'active',
    cohort_id || null, '#1F5132'
  );
  audit({ user_id: id, role, action: 'user_created', new_status: 'active', related_learner: id, ip: req.ip, comment: `Created by ${req.user.email}` });
  res.json({ ok: true, id, default_password: pwd });
});

router.patch('/:id', requireCap('users.write'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const allowed = ['full_name','phone','id_number','cohort_id','role','avatar_color'];
  const updates = [];
  const params = [];
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = ?`); params.push(req.body[k]); }
  if (!updates.length) return res.json({ ok: true });
  params.push(u.id);
  db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id = ?`).run(...params);
  audit({ user_id: req.user.id, role: req.user.role, action: 'user_updated', related_learner: u.id, ip: req.ip, comment: updates.join(',') });
  res.json({ ok: true });
});

router.post('/:id/status', requireCap('users.write'), (req, res) => {
  const { status, payment_status, comment } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const old = { status: u.status, payment_status: u.payment_status };
  db.prepare('UPDATE users SET status = COALESCE(?,status), payment_status = COALESCE(?,payment_status) WHERE id = ?')
    .run(status || null, payment_status || null, u.id);
  audit({ user_id: req.user.id, role: req.user.role, action: 'user_status_changed',
    old_status: `${old.status}/${old.payment_status}`,
    new_status: `${status || u.status}/${payment_status || u.payment_status}`,
    related_learner: u.id, comment, ip: req.ip });
  res.json({ ok: true });
});

router.post('/:id/reset-password', requireCap('users.write'), (req, res) => {
  const { new_password } = req.body || {};
  const pwd = new_password || 'ChangeMe123!';
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pwd, 10), req.params.id);
  audit({ user_id: req.user.id, role: req.user.role, action: 'password_reset', related_learner: req.params.id, ip: req.ip });
  res.json({ ok: true, new_password: pwd });
});

router.get('/cohorts/options', (_req, res) => {
  const rows = db.prepare('SELECT id,name FROM cohorts ORDER BY name').all();
  res.json({ cohorts: rows });
});

module.exports = router;
