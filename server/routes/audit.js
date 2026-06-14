const express = require('express');
const db = require('../db');
const { requireAuth, requireCap } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireCap('audit.*'), (req, res) => {
  const { user_id, action, role, q, limit } = req.query;
  let sql = `SELECT a.*, u.full_name, u.email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
  const p = [];
  if (user_id) { sql += ' AND a.user_id = ?'; p.push(user_id); }
  if (action) { sql += ' AND a.action = ?'; p.push(action); }
  if (role) { sql += ' AND a.role = ?'; p.push(role); }
  if (q) { sql += ' AND (a.comment LIKE ? OR a.related_learner LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY a.created_at DESC LIMIT ?';
  p.push(Number(limit) || 200);
  res.json({ rows: db.prepare(sql).all(...p) });
});

module.exports = router;
