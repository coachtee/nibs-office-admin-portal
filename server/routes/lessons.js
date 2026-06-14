const express = require('express');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

// ===== Topic Content (AI-enriched learner blocks) =====
// GET /api/lessons/topic-content/:curriculumElementId
// Returns the enriched learner blocks for a curriculum element (topic /
// practical_activity / work_experience_item), if any. Public to any
// authenticated user; learners see only `published` or `approved` content,
// while staff see drafts.
router.get('/topic-content/:elementId', (req, res) => {
  const role = (req.user && req.user.role) || 'learner';
  const row = db.prepare('SELECT * FROM topic_content WHERE curriculum_element_id = ?').get(req.params.elementId);
  if (!row) return res.status(404).json({ error: 'no_content' });
  // Hide drafts from learners
  if (role === 'learner' && row.review_status === 'draft_ai') {
    return res.status(403).json({ error: 'not_published' });
  }
  // Parse JSON columns
  function safeParse(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }
  res.json({
    curriculum_element_id: row.curriculum_element_id,
    why_it_matters: row.why_it_matters,
    plain_english: row.plain_english,
    sa_example: row.sa_example,
    scenario: row.scenario,
    step_by_step: row.step_by_step,
    common_mistakes: row.common_mistakes,
    learn_by_doing: row.learn_by_doing,
    workbook_questions: safeParse(row.workbook_questions_json),
    quiz: safeParse(row.quiz_json),
    poe_link: row.poe_link,
    assessor_checklist: row.assessor_checklist,
    moderator_checklist: row.moderator_checklist,
    references: safeParse(row.references_json),
    up_to_date_note: row.up_to_date_note,
    review_status: row.review_status,
  });
});

// Staff: list all topic content rows (for content review screen)
router.get('/topic-content', (req, res) => {
  const role = (req.user && req.user.role) || 'learner';
  if (!['superadmin', 'admin', 'coursemanager', 'facilitator'].includes(role)) {
    return res.status(403).json({ error: 'staff_only' });
  }
  const rows = db.prepare(`
    SELECT tc.id, tc.curriculum_element_id, tc.review_status, tc.up_to_date_note, tc.updated_at,
           ce.type, ce.code, ce.title, ce.description
    FROM topic_content tc
    JOIN curriculum_elements ce ON ce.id = tc.curriculum_element_id
    ORDER BY ce.code
  `).all();
  res.json({ items: rows });
});

// Staff: update review_status (draft_ai | needs_sme_review | reviewed | approved | published | archived)
router.patch('/topic-content/:id', (req, res) => {
  const role = (req.user && req.user.role) || 'learner';
  if (!['superadmin', 'admin', 'coursemanager', 'facilitator'].includes(role)) {
    return res.status(403).json({ error: 'staff_only' });
  }
  const allowed = ['review_status', 'notes'];
  const u = [], p = [];
  for (const k of allowed) if (k in req.body) { u.push(`${k} = ?`); p.push(req.body[k]); }
  if (!u.length) return res.json({ ok: true });
  u.push('reviewed_by = ?'); p.push(req.user.id);
  u.push('reviewed_at = ?'); p.push(new Date().toISOString());
  u.push('updated_at = ?'); p.push(new Date().toISOString());
  p.push(req.params.id);
  db.prepare(`UPDATE topic_content SET ${u.join(',')} WHERE id = ?`).run(...p);
  audit({ user_id: req.user.id, role, action: 'topic_content_reviewed', new_status: req.body.review_status, related_module: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'not_found' });
  let key_terms = []; try { key_terms = JSON.parse(l.key_terms || '[]'); } catch {}
  const resources = db.prepare('SELECT id,title,kind,file_path,url,mime_type FROM resources WHERE lesson_id = ?').all(req.params.id);
  const progress = req.user ? db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(req.user.id, req.params.id) : null;
  res.json({ lesson: { ...l, key_terms }, resources, progress });
});

router.post('/', requireCap('lessons.*'), (req, res) => {
  const { module_id, title, summary, content, video_url, image_url, duration_minutes, key_terms, sa_scenario, workbook_activity_id, practical_task_id, poe_item_id, order_index } = req.body || {};
  if (!module_id || !title) return res.status(400).json({ error: 'missing_fields' });
  const id = uid();
  db.prepare(`INSERT INTO lessons (id,module_id,title,summary,content,video_url,image_url,duration_minutes,key_terms,sa_scenario,workbook_activity_id,practical_task_id,poe_item_id,order_index,status,version)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, module_id, title, summary || null, content || null,
    video_url || null, image_url || null, duration_minutes || 15,
    JSON.stringify(key_terms || []), sa_scenario || null,
    workbook_activity_id || null, practical_task_id || null, poe_item_id || null,
    order_index || 0, 'draft', 1
  );
  audit({ user_id: req.user.id, role: req.user.role, action: 'lesson_created', new_status: 'draft', comment: title, related_module: module_id, ip: req.ip });
  res.json({ ok: true, id });
});

router.patch('/:id', requireCap('lessons.*'), (req, res) => {
  const allowed = ['title','summary','content','video_url','image_url','duration_minutes','sa_scenario','order_index','status'];
  const u = [], p = [];
  for (const k of allowed) if (k in req.body) { u.push(`${k} = ?`); p.push(req.body[k]); }
  if ('key_terms' in req.body) { u.push('key_terms = ?'); p.push(JSON.stringify(req.body.key_terms || [])); }
  if (!u.length) return res.json({ ok: true });
  p.push(req.params.id);
  db.prepare(`UPDATE lessons SET ${u.join(',')}, version = version + 1 WHERE id = ?`).run(...p);
  audit({ user_id: req.user.id, role: req.user.role, action: 'lesson_updated', related_module: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

// Mark lesson progress (learner)
router.post('/:id/progress', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  const { status, last_position } = req.body || {};
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  if (req.user.status === 'pending_payment') return res.status(402).json({ error: 'payment_required' });
  const existing = db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(req.user.id, req.params.id);
  if (existing) {
    db.prepare('UPDATE lesson_progress SET status = COALESCE(?,status), last_position = COALESCE(?,last_position), updated_at = datetime(\'now\'), completed_at = CASE WHEN ? = \'completed\' THEN datetime(\'now\') ELSE completed_at END WHERE id = ?')
      .run(status || null, last_position != null ? last_position : null, status || existing.status, existing.id);
  } else {
    db.prepare(`INSERT INTO lesson_progress (id,user_id,lesson_id,status,last_position,completed_at) VALUES (?,?,?,?,?,?)`)
      .run(uid(), req.user.id, req.params.id, status || 'in_progress', last_position || 0, status === 'completed' ? new Date().toISOString() : null);
  }
  if (status === 'completed') audit({ user_id: req.user.id, role: 'learner', action: 'lesson_completed', related_module: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
