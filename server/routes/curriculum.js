// Curriculum routes — official 334102002 structure.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `curr-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// List documents
router.get('/documents', (_req, res) => {
  res.json({ documents: db.prepare('SELECT * FROM curriculum_documents ORDER BY created_at DESC').all() });
});

// Upload curriculum document — extract text, set status 'extracted', queue for review
router.post('/documents', requireCap('curriculum.*'), upload.single('file'), (req, res) => {
  const { title, version, source, document_kind, notes } = req.body || {};
  if (!title) return res.status(400).json({ error: 'missing_title' });
  const id = uid();
  // Extract text from PDF if possible
  let extracted_text = null;
  let extraction_status = 'pending';
  if (req.file && req.file.mimetype === 'application/pdf') {
    try {
      const { execSync } = require('child_process');
      const txt = execSync(`pdftotext -layout "${req.file.path}" -`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      extracted_text = txt.toString();
      extraction_status = 'extracted';
    } catch (e) { extraction_status = 'failed'; }
  }
  db.prepare(`INSERT INTO curriculum_documents (id,title,version,source,document_kind,file_path,original_filename,extracted_text,extraction_status,upload_status,uploaded_by,notes)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, title, version || '1.0', source || 'Uploaded by admin', document_kind || 'curriculum',
    req.file ? `/uploads/${req.file.filename}` : null,
    req.file ? req.file.originalname : null,
    extracted_text, extraction_status, 'extracted', req.user.id, notes || null
  );
  audit({ user_id: req.user.id, role: req.user.role, action: 'curriculum_document_uploaded', new_status: 'extracted', comment: title, ip: req.ip });
  res.json({ ok: true, id, extraction_status, has_text: !!extracted_text });
});

// Update document status: needs_review -> reviewed -> approved -> published -> archived
router.post('/documents/:id/status', requireCap('curriculum.*'), (req, res) => {
  const { upload_status, notes } = req.body || {};
  const allowed = ['extracted','needs_review','reviewed','approved','published','archived'];
  if (!allowed.includes(upload_status)) return res.status(400).json({ error: 'invalid_status' });
  const doc = db.prepare('SELECT * FROM curriculum_documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE curriculum_documents SET upload_status = ?, notes = COALESCE(?, notes) WHERE id = ?').run(upload_status, notes, req.params.id);
  audit({ user_id: req.user.id, role: req.user.role, action: 'curriculum_document_status', related_module: req.params.id, old_status: doc.upload_status, new_status: upload_status, ip: req.ip });
  res.json({ ok: true });
});

// Sections
router.get('/sections', (req, res) => {
  const { document_id } = req.query;
  let sql = 'SELECT * FROM curriculum_sections';
  const p = [];
  if (document_id) { sql += ' WHERE document_id = ?'; p.push(document_id); }
  sql += ' ORDER BY order_index';
  res.json({ sections: db.prepare(sql).all(...p) });
});

// Curriculum elements (with optional filters)
router.get('/elements', (req, res) => {
  const { document_id, type, parent_id, code, status, search, eisa_focus_area } = req.query;
  let sql = 'SELECT * FROM curriculum_elements WHERE 1=1';
  const p = [];
  if (document_id) { sql += ' AND document_id = ?'; p.push(document_id); }
  if (type) { sql += ' AND type = ?'; p.push(type); }
  if (parent_id) { sql += ' AND parent_id = ?'; p.push(parent_id); }
  if (code) { sql += ' AND code = ?'; p.push(code); }
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (eisa_focus_area) { sql += ' AND eisa_focus_area = ?'; p.push(eisa_focus_area); }
  if (search) { sql += ' AND (title LIKE ? OR code LIKE ? OR body LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY type, order_index, code';
  res.json({ elements: db.prepare(sql).all(...p) });
});

// Single element + its children + mappings
router.get('/elements/:id', (req, res) => {
  const el = db.prepare('SELECT * FROM curriculum_elements WHERE id = ?').get(req.params.id);
  if (!el) return res.status(404).json({ error: 'not_found' });
  const children = db.prepare('SELECT id, type, code, title, status, nqf_level, credits, weight_percent, order_index FROM curriculum_elements WHERE parent_id = ? ORDER BY order_index, code').all(req.params.id);
  const iacs = db.prepare(`SELECT * FROM curriculum_elements WHERE type='internal_assessment_criterion' AND id IN (
    SELECT to_element_id FROM curriculum_mappings WHERE from_element_id = ? AND relation LIKE 'iac_of_%'
  )`).all(req.params.id);
  res.json({ element: el, children, iacs });
});

// Update / correct an extracted element
router.patch('/elements/:id', requireCap('curriculum.*'), (req, res) => {
  const allowed = ['title','description','body','code','nqf_level','credits','weight_percent','order_index','status','eisa_focus_area'];
  const u = [], p = [];
  for (const k of allowed) if (k in req.body) { u.push(`${k} = ?`); p.push(req.body[k]); }
  if (!u.length) return res.json({ ok: true });
  p.push(req.params.id);
  db.prepare(`UPDATE curriculum_elements SET ${u.join(',')} WHERE id = ?`).run(...p);
  audit({ user_id: req.user.id, role: req.user.role, action: 'curriculum_element_updated', related_module: req.params.id, ip: req.ip, comment: u.join(',') });
  res.json({ ok: true });
});

// Mapping matrix — joins modules to official curriculum structure
router.get('/matrix', (req, res) => {
  const { course_id } = req.query;
  const course = course_id
    ? db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id)
    : db.prepare('SELECT * FROM courses ORDER BY created_at LIMIT 1').get();
  if (!course) return res.json({ course: null, rows: [] });
  const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index, code').all(course.id);
  const rows = modules.map(m => {
    const elem = m.curriculum_element_id ? db.prepare('SELECT * FROM curriculum_elements WHERE id = ?').get(m.curriculum_element_id) : null;
    const lessons = db.prepare('SELECT id, title FROM lessons WHERE module_id = ?').all(m.id);
    const topics = elem ? db.prepare("SELECT id, code, title, weight_percent FROM curriculum_elements WHERE parent_id = ? AND type = 'topic' ORDER BY order_index").all(elem.id) : [];
    const iacs = elem ? db.prepare("SELECT id, code, title FROM curriculum_elements WHERE type = 'internal_assessment_criterion' AND id IN (SELECT from_element_id FROM curriculum_mappings WHERE to_element_id IN (SELECT id FROM curriculum_elements WHERE parent_id = ? AND type = 'topic'))").all(elem.id) : [];
    const poeItems = m.type === 'work_experience' ? db.prepare(`
      SELECT pi.id, pi.code, pi.title FROM poe_items pi
      JOIN poe_sections ps ON pi.section_id = ps.id
      WHERE ps.curriculum_element_id = ?
    `).all(m.curriculum_element_id || '') : [];
    return {
      module_code: m.code, module_title: m.title, module_type: m.type,
      nqf: m.nqf_level, credits: m.credits,
      topics: topics.map(t => ({ code: t.code, title: t.title, weight: t.weight_percent })),
      topic_count: topics.length,
      iac_count: iacs.length,
      lessons_count: lessons.length,
      poe_items: poeItems.map(p => ({ code: p.code, title: p.title })),
      status: elem ? elem.status : 'draft',
    };
  });
  res.json({ course, rows });
});

// Full mapping tree (for the matrix page UI)
router.get('/tree', (req, res) => {
  const { document_id } = req.query;
  const doc = document_id
    ? db.prepare('SELECT * FROM curriculum_documents WHERE id = ?').get(document_id)
    : db.prepare("SELECT * FROM curriculum_documents WHERE document_kind = 'curriculum' ORDER BY created_at DESC LIMIT 1").get();
  if (!doc) return res.json({ document: null, sections: [] });
  const sections = db.prepare('SELECT * FROM curriculum_sections WHERE document_id = ? ORDER BY order_index').all(doc.id);
  const out = sections.map(s => {
    const modules = db.prepare(`SELECT * FROM curriculum_elements WHERE section_id = ? AND type IN ('knowledge_module','practical_skill_module','work_experience_module') ORDER BY order_index`).all(s.id);
    return {
      ...s,
      modules: modules.map(m => {
        const topics = db.prepare(`SELECT * FROM curriculum_elements WHERE parent_id = ? AND type = 'topic' ORDER BY order_index`).all(m.id);
        const iacs = db.prepare(`SELECT * FROM curriculum_elements WHERE parent_id = ? AND type = 'internal_assessment_criterion' ORDER BY order_index`).all(m.id);
        const items = db.prepare(`SELECT * FROM curriculum_elements WHERE parent_id = ? AND type IN ('practical_skill_item','work_experience_item') ORDER BY order_index`).all(m.id);
        return {
          ...m,
          topics: topics.map(t => ({
            ...t,
            topic_elements: db.prepare(`SELECT * FROM curriculum_elements WHERE parent_id = ? AND type = 'topic_element' ORDER BY order_index`).all(t.id),
            iacs: db.prepare(`SELECT * FROM curriculum_elements WHERE id IN (SELECT to_element_id FROM curriculum_mappings WHERE from_element_id = (SELECT id FROM curriculum_elements WHERE code = ? AND parent_id = ?) AND relation = 'iac_of_topic')`).all(t.code, m.id),
          })),
          iacs,
          items: items.map(it => ({
            ...it,
            activities: db.prepare(`SELECT * FROM curriculum_elements WHERE parent_id = ? AND type IN ('practical_activity','work_activity','supporting_evidence') ORDER BY order_index`).all(it.id),
          })),
        };
      }),
    };
  });
  res.json({ document: doc, sections: out });
});

module.exports = router;
