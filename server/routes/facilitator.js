const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware/auth');
const { uid, now } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

// Cohort view (assigned learners)
router.get('/cohorts', (req, res) => {
  if (req.user.role === 'facilitator') {
    const cohorts = db.prepare('SELECT * FROM cohorts WHERE facilitator_id = ? ORDER BY created_at DESC').all(req.user.id);
    return res.json({ cohorts });
  }
  res.json({ cohorts: db.prepare('SELECT * FROM cohorts ORDER BY created_at DESC').all() });
});

router.get('/learners/:id', (req, res) => {
  const u = db.prepare('SELECT id,full_name,email,status,payment_status,cohort_id,last_login FROM users WHERE id = ? AND role = \'learner\'').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (req.user.role === 'facilitator' && u.cohort_id) {
    const cohort = db.prepare('SELECT * FROM cohorts WHERE id = ?').get(u.cohort_id);
    if (!cohort || cohort.facilitator_id !== req.user.id) return res.status(403).json({ error: 'not_assigned' });
  }
  const lessonProgress = db.prepare(`SELECT lp.*, l.title, l.module_id FROM lesson_progress lp JOIN lessons l ON lp.lesson_id = l.id WHERE lp.user_id = ?`).all(req.params.id);
  const wbAnswers = db.prepare(`SELECT wa.*, wq.prompt, wq.code FROM workbook_answers wa JOIN workbook_questions wq ON wa.question_id = wq.id WHERE wa.user_id = ? ORDER BY wa.updated_at DESC`).all(req.params.id);
  const poeSubs = db.prepare(`SELECT ps.*, pi.title AS item_title, pi.code AS item_code FROM poe_submissions ps JOIN poe_items pi ON ps.item_id = pi.id WHERE ps.user_id = ? ORDER BY ps.updated_at DESC`).all(req.params.id);
  const feedback = db.prepare('SELECT * FROM facilitator_feedback WHERE user_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ learner: u, lessonProgress, wbAnswers, poeSubs, feedback });
});

// Add feedback
router.post('/feedback', (req, res) => {
  if (!['facilitator','admin','super_admin','course_manager'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { user_id, context_type, context_id, feedback, return_for_correction, recommend_for_assessment, flag_at_risk } = req.body || {};
  if (!user_id || !context_type || !context_id || !feedback) return res.status(400).json({ error: 'missing_fields' });
  const id = uid();
  db.prepare(`INSERT INTO facilitator_feedback (id,user_id,facilitator_id,context_type,context_id,feedback,return_for_correction,recommend_for_assessment,flag_at_risk)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, user_id, req.user.id, context_type, context_id, feedback,
    return_for_correction ? 1 : 0, recommend_for_assessment ? 1 : 0, flag_at_risk ? 1 : 0
  );
  if (return_for_correction && context_type === 'poe') {
    db.prepare("UPDATE poe_submissions SET status = 'needs_correction' WHERE id = ?").run(context_id);
    audit({ user_id: req.user.id, role: req.user.role, action: 'poe_returned_for_correction', related_learner: user_id, related_poe_item: context_id, ip: req.ip, new_status: 'needs_correction' });
  } else if (recommend_for_assessment && context_type === 'poe') {
    db.prepare("UPDATE poe_submissions SET status = 'accepted' WHERE id = ?").run(context_id);
    audit({ user_id: req.user.id, role: req.user.role, action: 'poe_recommended_for_assessment', related_learner: user_id, related_poe_item: context_id, ip: req.ip, new_status: 'accepted' });
  }
  if (flag_at_risk) audit({ user_id: req.user.id, role: req.user.role, action: 'learner_flagged_at_risk', related_learner: user_id, ip: req.ip });
  res.json({ ok: true, id });
});

// Attendance
router.post('/attendance', (req, res) => {
  if (!['facilitator','admin','super_admin','course_manager'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { user_id, cohort_id, session_date, status, note } = req.body || {};
  const id = uid();
  db.prepare(`INSERT INTO attendance (id,user_id,cohort_id,session_date,status,note) VALUES (?,?,?,?,?,?)`)
    .run(id, user_id, cohort_id || null, session_date || now().slice(0,10), status || 'present', note || null);
  res.json({ ok: true, id });
});

router.get('/attendance/:cohortId', (req, res) => {
  const rows = db.prepare('SELECT a.*, u.full_name FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.cohort_id = ? ORDER BY a.session_date DESC').all(req.params.cohortId);
  res.json({ attendance: rows });
});

// Class notes
router.post('/class-notes', (req, res) => {
  if (!['facilitator','admin','super_admin','course_manager'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { cohort_id, title, body, attachment } = req.body || {};
  if (!title) return res.status(400).json({ error: 'missing_title' });
  const id = uid();
  db.prepare(`INSERT INTO class_notes (id,cohort_id,facilitator_id,title,body,attachment) VALUES (?,?,?,?,?,?)`)
    .run(id, cohort_id || null, req.user.id, title, body || null, attachment || null);
  res.json({ ok: true, id });
});

router.get('/class-notes/:cohortId', (req, res) => {
  res.json({ notes: db.prepare('SELECT * FROM class_notes WHERE cohort_id = ? ORDER BY created_at DESC').all(req.params.cohortId) });
});

module.exports = router;
