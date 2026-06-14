const express = require('express');
const db = require('../db');
const { requireAuth, requireCap } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/dashboard', requireCap('reports.*'), (_req, res) => {
  const counts = {
    learners: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='learner'").get().c,
    active: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='learner' AND status='active'").get().c,
    pending: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='learner' AND status='pending_payment'").get().c,
    poe_drafts: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status='draft'").get().c,
    poe_submitted: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status='submitted'").get().c,
    poe_competent: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status='competent'").get().c,
    poe_not_competent: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status='not_yet_competent'").get().c,
    final_approved: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status='final_approved'").get().c,
    moderation_queue: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status IN ('selected_for_moderation','moderation_in_progress')").get().c,
    assessor_queue: db.prepare("SELECT COUNT(*) AS c FROM poe_submissions WHERE status IN ('accepted','submitted','resubmitted','needs_correction','not_yet_competent')").get().c,
  };
  res.json({ counts });
});

router.get('/learner-progress', requireCap('reports.*'), (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.cohort_id, u.status, u.payment_status,
      (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id AND lp.status='completed') AS lessons_completed,
      (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id) AS lessons_attempted,
      (SELECT COUNT(*) FROM workbook_answers wa WHERE wa.user_id = u.id AND wa.status='submitted') AS wb_submitted,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status='competent') AS poe_competent,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id) AS poe_attempted
    FROM users u WHERE u.role='learner' ORDER BY u.full_name
  `).all();
  res.json({ rows });
});

router.get('/cohort-progress', requireCap('reports.*'), (_req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.start_date, c.end_date,
      (SELECT COUNT(*) FROM users u WHERE u.cohort_id = c.id AND u.role='learner') AS learners,
      (SELECT COUNT(*) FROM users u WHERE u.cohort_id = c.id AND u.role='learner' AND u.status='active') AS active
    FROM cohorts c ORDER BY c.created_at DESC
  `).all();
  res.json({ rows });
});

router.get('/missing-evidence', requireCap('reports.*'), (_req, res) => {
  // Find learners with at least one not_started / draft POE submission
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.email,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status IN ('draft','not_started')) AS drafts,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status IN ('needs_correction','resubmitted')) AS needs_correction
    FROM users u WHERE u.role='learner' ORDER BY drafts DESC
  `).all();
  res.json({ rows });
});

router.get('/at-risk', requireCap('reports.*'), (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.cohort_id, ff.flag_at_risk, ff.feedback, ff.created_at
    FROM facilitator_feedback ff
    JOIN users u ON ff.user_id = u.id
    WHERE ff.flag_at_risk = 1
    ORDER BY ff.created_at DESC
  `).all();
  res.json({ rows });
});

router.get('/poe-completion', requireCap('reports.*'), (_req, res) => {
  const rows = db.prepare(`
    SELECT ps.status, COUNT(*) AS count FROM poe_submissions ps GROUP BY ps.status
  `).all();
  res.json({ rows });
});

router.get('/curriculum-mapping', requireCap('reports.*'), (req, res) => {
  const { course_id } = req.query;
  const course = course_id ? db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id) : db.prepare('SELECT * FROM courses LIMIT 1').get();
  if (!course) return res.json({ rows: [] });
  const rows = db.prepare(`
    SELECT m.code, m.title, m.type, m.nqf_level, m.credits,
      (SELECT COUNT(*) FROM lessons l WHERE l.module_id = m.id) AS lessons,
      (SELECT COUNT(*) FROM poe_items pi WHERE pi.curriculum_element_id = m.curriculum_element_id) AS poe_items
    FROM modules m WHERE m.course_id = ? ORDER BY m.order_index
  `).all(course.id);
  res.json({ course, rows });
});

router.get('/eisa-readiness', requireCap('reports.*'), (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.email,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status='final_approved') AS final_approved,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status IN ('competent','moderation_approved')) AS ready
    FROM users u WHERE u.role='learner' ORDER BY u.full_name
  `).all();
  res.json({ rows });
});

module.exports = router;
