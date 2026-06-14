const express = require('express');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  const courses = db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
    (SELECT COUNT(*) FROM enrolments e WHERE e.course_id = c.id) AS enrolled
    FROM courses c ORDER BY c.created_at DESC`).all();
  res.json({ courses });
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index, code').all(req.params.id);
  res.json({ course: c, modules });
});

router.post('/', requireCap('courses.write'), (req, res) => {
  const { code, title, subtitle, description, qualification_type, saqa_id, nqf_level, total_credits, curriculum_document_id, cover_color } = req.body || {};
  if (!code || !title) return res.status(400).json({ error: 'missing_fields' });
  if (db.prepare('SELECT id FROM courses WHERE code = ?').get(code)) return res.status(409).json({ error: 'code_in_use' });
  const id = uid();
  db.prepare(`INSERT INTO courses (id,code,title,subtitle,description,qualification_type,saqa_id,nqf_level,total_credits,curriculum_document_id,cover_color,status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, code, title, subtitle || null, description || null,
    qualification_type || 'Occupational Certificate',
    saqa_id || null, nqf_level || null, total_credits || null,
    curriculum_document_id || null, cover_color || '#1F5132', 'draft'
  );
  audit({ user_id: req.user.id, role: req.user.role, action: 'course_created', new_status: 'draft', comment: title, ip: req.ip });
  res.json({ ok: true, id });
});

router.patch('/:id', requireCap('courses.write'), (req, res) => {
  const allowed = ['title','subtitle','description','nqf_level','total_credits','cover_color','status','curriculum_document_id','saqa_id'];
  const u = [];
  const p = [];
  for (const k of allowed) if (k in req.body) { u.push(`${k} = ?`); p.push(req.body[k]); }
  if (!u.length) return res.json({ ok: true });
  p.push(req.params.id);
  db.prepare(`UPDATE courses SET ${u.join(',')} WHERE id = ?`).run(...p);
  audit({ user_id: req.user.id, role: req.user.role, action: 'course_updated', related_module: req.params.id, ip: req.ip, comment: u.join(',') });
  res.json({ ok: true });
});

module.exports = router;
