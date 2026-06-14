const express = require('express');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid, now, asJson } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/questions', (req, res) => {
  const { module_id } = req.query;
  let sql = 'SELECT * FROM workbook_questions';
  const p = [];
  if (module_id) { sql += ' WHERE module_id = ?'; p.push(module_id); }
  sql += ' ORDER BY order_index';
  res.json({ questions: db.prepare(sql).all(...p) });
});

router.post('/questions', requireCap('workbook.*'), (req, res) => {
  const { module_id, lesson_id, curriculum_element_id, code, prompt, helper, answer_type, is_required, order_index } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'missing_prompt' });
  const id = uid();
  db.prepare(`INSERT INTO workbook_questions (id,module_id,lesson_id,curriculum_element_id,code,prompt,helper,answer_type,is_required,order_index)
              VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, module_id || null, lesson_id || null, curriculum_element_id || null,
    code || null, prompt, helper || null, answer_type || 'long_text',
    is_required === false ? 0 : 1, order_index || 0
  );
  audit({ user_id: req.user.id, role: req.user.role, action: 'workbook_question_created', comment: prompt.slice(0,60), ip: req.ip });
  res.json({ ok: true, id });
});

// My answers
router.get('/answers', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  const rows = db.prepare(`
    SELECT wa.*, wq.prompt, wq.helper, wq.code, wq.answer_type, wq.module_id, wq.curriculum_element_id
    FROM workbook_answers wa JOIN workbook_questions wq ON wa.question_id = wq.id
    WHERE wa.user_id = ? ORDER BY wq.order_index
  `).all(req.user.id);
  res.json({ answers: rows });
});

router.get('/answers/:questionId', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  const a = db.prepare('SELECT * FROM workbook_answers WHERE user_id = ? AND question_id = ? ORDER BY attempt DESC LIMIT 1').get(req.user.id, req.params.questionId);
  res.json({ answer: a || null });
});

router.post('/answers', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  if (req.user.status === 'pending_payment') return res.status(402).json({ error: 'payment_required' });
  const { question_id, answer_text, status } = req.body || {};
  if (!question_id) return res.status(400).json({ error: 'missing_question' });
  const existing = db.prepare('SELECT * FROM workbook_answers WHERE user_id = ? AND question_id = ? ORDER BY attempt DESC LIMIT 1').get(req.user.id, question_id);
  if (existing) {
    // save current as version
    db.prepare(`INSERT INTO workbook_versions (id,answer_id,version,answer_text,changed_by,comment) VALUES (?,?,?,?,?,?)`)
      .run(uid(), existing.id, existing.attempt, existing.answer_text, req.user.id, 'New draft');
    if (status === 'submitted') {
      const attempt = existing.attempt + 1;
      const id = uid();
      db.prepare(`INSERT INTO workbook_answers (id,user_id,question_id,answer_text,status,attempt,submitted_at) VALUES (?,?,?,?,?,?,?)`)
        .run(id, req.user.id, question_id, answer_text || '', 'submitted', attempt, now());
      audit({ user_id: req.user.id, role: 'learner', action: 'workbook_submitted', new_status: 'submitted', ip: req.ip, comment: `attempt ${attempt}` });
      return res.json({ ok: true, id, attempt, status: 'submitted' });
    } else {
      db.prepare('UPDATE workbook_answers SET answer_text = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(answer_text || '', 'draft', existing.id);
      audit({ user_id: req.user.id, role: 'learner', action: 'workbook_draft_saved', ip: req.ip });
      return res.json({ ok: true, id: existing.id, status: 'draft' });
    }
  } else {
    const id = uid();
    db.prepare(`INSERT INTO workbook_answers (id,user_id,question_id,answer_text,status,attempt,submitted_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, req.user.id, question_id, answer_text || '', status === 'submitted' ? 'submitted' : 'draft', 1, status === 'submitted' ? now() : null);
    if (status === 'submitted') audit({ user_id: req.user.id, role: 'learner', action: 'workbook_submitted', new_status: 'submitted', ip: req.ip });
    else audit({ user_id: req.user.id, role: 'learner', action: 'workbook_draft_saved', ip: req.ip });
    res.json({ ok: true, id, attempt: 1, status: status === 'submitted' ? 'submitted' : 'draft' });
  }
});

router.get('/versions/:answerId', (req, res) => {
  if (!['admin','super_admin','assessor','facilitator'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  res.json({ versions: db.prepare('SELECT * FROM workbook_versions WHERE answer_id = ? ORDER BY version DESC').all(req.params.answerId) });
});

module.exports = router;
