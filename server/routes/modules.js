const express = require('express');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/by-course/:courseId', (req, res) => {
  const rows = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index, code').all(req.params.courseId);
  res.json({ modules: rows });
});

router.get('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  const lessons = db.prepare('SELECT id,title,summary,order_index,status,duration_minutes FROM lessons WHERE module_id = ? ORDER BY order_index').all(req.params.id);
  const curriculum = m.curriculum_element_id ? db.prepare('SELECT * FROM curriculum_elements WHERE id = ?').get(m.curriculum_element_id) : null;
  res.json({ module: m, lessons, curriculum });
});

router.post('/', requireCap('modules.*'), (req, res) => {
  const { course_id, type, code, title, description, nqf_level, credits, order_index, curriculum_element_id } = req.body || {};
  if (!course_id || !type || !code || !title) return res.status(400).json({ error: 'missing_fields' });
  const id = uid();
  db.prepare(`INSERT INTO modules (id,course_id,curriculum_element_id,type,code,title,description,nqf_level,credits,order_index,status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, course_id, curriculum_element_id || null, type, code, title,
    description || null, nqf_level || null, credits || null,
    order_index || 0, 'draft'
  );
  audit({ user_id: req.user.id, role: req.user.role, action: 'module_created', new_status: 'draft', comment: `${code} ${title}`, related_module: id, ip: req.ip });
  res.json({ ok: true, id });
});

router.patch('/:id', requireCap('modules.*'), (req, res) => {
  const allowed = ['title','description','nqf_level','credits','order_index','status','curriculum_element_id'];
  const u = [], p = [];
  for (const k of allowed) if (k in req.body) { u.push(`${k} = ?`); p.push(req.body[k]); }
  if (!u.length) return res.json({ ok: true });
  p.push(req.params.id);
  db.prepare(`UPDATE modules SET ${u.join(',')} WHERE id = ?`).run(...p);
  audit({ user_id: req.user.id, role: req.user.role, action: 'module_updated', related_module: req.params.id, ip: req.ip, comment: u.join(',') });
  res.json({ ok: true });
});

router.post('/reorder', requireCap('modules.*'), (req, res) => {
  const { order } = req.body || {}; // [{id, order_index}]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'invalid' });
  const stmt = db.prepare('UPDATE modules SET order_index = ? WHERE id = ?');
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(r.order_index, r.id); });
  tx(order);
  audit({ user_id: req.user.id, role: req.user.role, action: 'modules_reordered', comment: `${order.length} modules`, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
