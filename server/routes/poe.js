// POE editor — sections per WM, evidence groups, supervisor sign-off
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid, now } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `poe-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB || 15)) * 1024 * 1024 } });

// ===== TEMPLATES =====
router.get('/templates', (_req, res) => {
  res.json({ templates: db.prepare('SELECT * FROM poe_templates ORDER BY created_at DESC').all() });
});

router.post('/templates', requireCap('poe.*'), (req, res) => {
  const { course_id, title, curriculum_document_id } = req.body || {};
  if (!course_id || !title) return res.status(400).json({ error: 'missing_fields' });
  const id = uid();
  db.prepare(`INSERT INTO poe_templates (id,course_id,title,curriculum_document_id,version,status) VALUES (?,?,?,?,?,?)`).run(id, course_id, title, curriculum_document_id || null, 1, 'draft');
  audit({ user_id: req.user.id, role: req.user.role, action: 'poe_template_created', new_status: 'draft', comment: title, ip: req.ip });
  res.json({ ok: true, id });
});

router.post('/templates/:id/publish', requireCap('poe.*'), (req, res) => {
  db.prepare("UPDATE poe_templates SET status = 'published' WHERE id = ?").run(req.params.id);
  audit({ user_id: req.user.id, role: req.user.role, action: 'poe_template_published', related_module: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.get('/templates/:id/full', (req, res) => {
  const t = db.prepare('SELECT * FROM poe_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not_found' });
  const sections = db.prepare('SELECT * FROM poe_sections WHERE template_id = ? ORDER BY order_index').all(req.params.id);
  const sectionIds = sections.map(s => s.id);
  const groups = sectionIds.length
    ? db.prepare(`SELECT * FROM poe_evidence_groups WHERE section_id IN (${sectionIds.map(()=>'?').join(',')}) ORDER BY order_index`).all(...sectionIds)
    : [];
  const items = sectionIds.length
    ? db.prepare(`SELECT * FROM poe_items WHERE section_id IN (${sectionIds.map(()=>'?').join(',')}) ORDER BY order_index`).all(...sectionIds)
    : [];
  const itemIds = items.map(i => i.id);
  const fields = itemIds.length
    ? db.prepare(`SELECT * FROM poe_fields WHERE item_id IN (${itemIds.map(()=>'?').join(',')}) ORDER BY order_index`).all(...itemIds)
    : [];
  res.json({ template: t, sections, groups, items, fields });
});

router.post('/sections', requireCap('poe.*'), (req, res) => {
  const { template_id, curriculum_element_id, code, title, description, linked_eisa_focus_areas, order_index } = req.body || {};
  const id = uid();
  db.prepare(`INSERT INTO poe_sections (id,template_id,curriculum_element_id,code,title,description,linked_eisa_focus_areas,linked_kms,linked_pms,order_index) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, template_id, curriculum_element_id || null, code || null, title, description || null, JSON.stringify(linked_eisa_focus_areas || []), '[]', '[]', order_index || 0);
  audit({ user_id: req.user.id, role: req.user.role, action: 'poe_section_created', comment: title, ip: req.ip });
  res.json({ ok: true, id });
});

router.post('/items', requireCap('poe.*'), (req, res) => {
  const { section_id, evidence_group_id, curriculum_element_id, code, title, instructions, why_required, how_to_prepare, common_mistakes, linked_outcome, linked_modules, linked_iacs, eisa_focus_area, assessor_checklist, moderator_checklist, evidence_kind, requires_supervisor_signoff, order_index } = req.body || {};
  const id = uid();
  db.prepare(`INSERT INTO poe_items (id,section_id,evidence_group_id,curriculum_element_id,code,title,instructions,why_required,how_to_prepare,common_mistakes,linked_outcome,linked_modules,linked_iacs,eisa_focus_area,assessor_checklist,moderator_checklist,evidence_kind,requires_supervisor_signoff,order_index)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, section_id, evidence_group_id || null, curriculum_element_id || null, code || null, title,
    instructions || null, why_required || null, how_to_prepare || null,
    common_mistakes || null, linked_outcome || null,
    JSON.stringify(linked_modules || []), JSON.stringify(linked_iacs || []),
    eisa_focus_area || null,
    assessor_checklist || null, moderator_checklist || null,
    evidence_kind || 'supporting_evidence', requires_supervisor_signoff ? 1 : 0,
    order_index || 0
  );
  // If linked_modules provided, create poe_mappings entries
  const linked = Array.isArray(linked_modules) ? linked_modules : [];
  for (const cmId of linked) {
    db.prepare(`INSERT INTO poe_mappings (id,poe_item_id,curriculum_element_id,relation) VALUES (?,?,?,?)`)
      .run(uid(), id, cmId, 'covers');
  }
  if (Array.isArray(linked_iacs)) {
    for (const iacId of linked_iacs) {
      db.prepare(`INSERT INTO poe_mappings (id,poe_item_id,curriculum_element_id,relation) VALUES (?,?,?,?)`)
        .run(uid(), id, iacId, 'covers');
    }
  }
  audit({ user_id: req.user.id, role: req.user.role, action: 'poe_item_created', comment: title, ip: req.ip, related_poe_item: id });
  res.json({ ok: true, id });
});

router.post('/fields', requireCap('poe.*'), (req, res) => {
  const { item_id, field_type, label, helper, required, options, order_index } = req.body || {};
  if (!item_id || !field_type || !label) return res.status(400).json({ error: 'missing_fields' });
  const id = uid();
  db.prepare(`INSERT INTO poe_fields (id,item_id,field_type,label,helper,required,options_json,order_index) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, item_id, field_type, label, helper || null, required === false ? 0 : 1, options ? JSON.stringify(options) : null, order_index || 0);
  res.json({ ok: true, id });
});

// ===== LEARNER SUBMISSIONS =====
router.get('/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM poe_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  const section = db.prepare('SELECT * FROM poe_sections WHERE id = ?').get(item.section_id);
  const template = section ? db.prepare('SELECT * FROM poe_templates WHERE id = ?').get(section.template_id) : null;
  const fields = db.prepare('SELECT * FROM poe_fields WHERE item_id = ? ORDER BY order_index').all(req.params.id);
  // Curriculum context
  const wm = section && section.curriculum_element_id ? db.prepare('SELECT * FROM curriculum_elements WHERE id = ?').get(section.curriculum_element_id) : null;
  let mySubmission = null, myFiles = [], history = [];
  if (req.user && req.user.role === 'learner') {
    mySubmission = db.prepare('SELECT * FROM poe_submissions WHERE user_id = ? AND item_id = ? ORDER BY attempt DESC LIMIT 1').get(req.user.id, req.params.id);
    if (mySubmission) {
      myFiles = db.prepare('SELECT * FROM poe_files WHERE submission_id = ?').all(mySubmission.id);
      history = db.prepare('SELECT * FROM poe_submission_versions WHERE submission_id = ? ORDER BY version DESC').all(mySubmission.id);
    }
  }
  // Linked IACs
  const iacs = db.prepare(`SELECT * FROM curriculum_elements WHERE id IN (SELECT curriculum_element_id FROM poe_mappings WHERE poe_item_id = ?)`).all(req.params.id);
  res.json({ item, section, template, fields, wm, iacs, mySubmission, myFiles, history });
});

router.get('/my-submissions', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  const subs = db.prepare(`
    SELECT ps.*, pi.title AS item_title, pi.code AS item_code, ps.status,
           s.title AS section_title, s.code AS section_code
    FROM poe_submissions ps
    JOIN poe_items pi ON ps.item_id = pi.id
    JOIN poe_sections s ON pi.section_id = s.id
    WHERE ps.user_id = ?
    ORDER BY ps.updated_at DESC
  `).all(req.user.id);
  res.json({ submissions: subs });
});

router.post('/items/:id/submit', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  if (req.user.status === 'pending_payment') return res.status(402).json({ error: 'payment_required' });
  const { data, declaration_signed, action, supervisor_signed, supervisor_feedback } = req.body || {};
  const status = action === 'submit' ? 'submitted' : 'draft';
  const existing = db.prepare('SELECT * FROM poe_submissions WHERE user_id = ? AND item_id = ? ORDER BY attempt DESC LIMIT 1').get(req.user.id, req.params.id);
  if (existing) {
    db.prepare(`INSERT INTO poe_submission_versions (id,submission_id,version,data_json,changed_by,comment) VALUES (?,?,?,?,?,?)`)
      .run(uid(), existing.id, existing.attempt, existing.data_json, req.user.id, status === 'submitted' ? 'Submission' : 'Draft');
    db.prepare(`UPDATE poe_submissions SET data_json = ?, status = ?, declaration_signed = ?, supervisor_signed = ?, supervisor_feedback = ?, attempt = attempt + (CASE WHEN ? = 'submitted' THEN 1 ELSE 0 END), submitted_at = CASE WHEN ? = 'submitted' THEN datetime('now') ELSE submitted_at END, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(data || {}), status, declaration_signed ? 1 : 0, supervisor_signed ? 1 : 0, supervisor_feedback || null, status, status, existing.id);
    audit({ user_id: req.user.id, role: 'learner', action: status === 'submitted' ? 'poe_submitted' : 'poe_draft_saved', new_status: status, related_poe_item: req.params.id, ip: req.ip });
    return res.json({ ok: true, id: existing.id, status });
  } else {
    const id = uid();
    db.prepare(`INSERT INTO poe_submissions (id,user_id,item_id,attempt,status,data_json,declaration_signed,supervisor_signed,supervisor_feedback,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.user.id, req.params.id, 1, status, JSON.stringify(data || {}), declaration_signed ? 1 : 0, supervisor_signed ? 1 : 0, supervisor_feedback || null, status === 'submitted' ? now() : null);
    audit({ user_id: req.user.id, role: 'learner', action: status === 'submitted' ? 'poe_submitted' : 'poe_draft_saved', new_status: status, related_poe_item: req.params.id, ip: req.ip });
    return res.json({ ok: true, id, status });
  }
});

router.post('/items/:id/upload', upload.array('files', 8), (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  if (req.user.status === 'pending_payment') return res.status(402).json({ error: 'payment_required' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'no_files' });
  const sub = db.prepare('SELECT * FROM poe_submissions WHERE user_id = ? AND item_id = ? ORDER BY attempt DESC LIMIT 1').get(req.user.id, req.params.id);
  const out = [];
  for (const f of req.files) {
    const id = uid();
    db.prepare(`INSERT INTO poe_files (id,submission_id,user_id,item_id,field_id,original_name,stored_name,mime_type,size_bytes) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, sub ? sub.id : null, req.user.id, req.params.id, req.body.field_id || null, f.originalname, f.filename, f.mimetype, f.size);
    out.push({ id, name: f.originalname, url: `/uploads/${f.filename}` });
  }
  audit({ user_id: req.user.id, role: 'learner', action: 'poe_file_uploaded', related_poe_item: req.params.id, ip: req.ip, comment: `${req.files.length} file(s)` });
  res.json({ ok: true, files: out });
});

router.get('/submissions/:id', (req, res) => {
  if (!['admin','super_admin','assessor','moderator','course_manager','facilitator'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const sub = db.prepare('SELECT * FROM poe_submissions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  const item = db.prepare('SELECT * FROM poe_items WHERE id = ?').get(sub.item_id);
  const fields = db.prepare('SELECT * FROM poe_fields WHERE item_id = ? ORDER BY order_index').all(item.id);
  const files = db.prepare('SELECT * FROM poe_files WHERE submission_id = ?').all(sub.id);
  const learner = db.prepare('SELECT id,full_name,email,cohort_id FROM users WHERE id = ?').get(sub.user_id);
  const history = db.prepare('SELECT * FROM poe_submission_versions WHERE submission_id = ? ORDER BY version DESC').all(sub.id);
  const assessorReviews = db.prepare('SELECT * FROM assessor_reviews WHERE user_id = ? AND context_id = ? ORDER BY created_at DESC').all(sub.user_id, sub.id);
  const moderatorReviews = db.prepare('SELECT * FROM moderator_reviews WHERE user_id = ? AND assessor_review_id IS NOT NULL ORDER BY created_at DESC').all(sub.user_id);
  res.json({ submission: sub, item, fields, files, learner, history, assessorReviews, moderatorReviews });
});

module.exports = router;
