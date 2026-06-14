// Moderator — full curriculum + assessor decision view
const express = require('express');
const db = require('../db');
const { requireAuth, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/queue', (req, res) => {
  if (!['moderator','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const items = db.prepare(`
    SELECT ps.id AS submission_id, ps.user_id, ps.status, ps.updated_at,
           pi.title AS item_title, pi.code AS item_code, pi.eisa_focus_area,
           u.full_name, u.cohort_id,
           ar.id AS assessor_review_id, ar.decision AS assessor_decision, ar.feedback AS assessor_feedback,
           ar.signoff_name AS assessor_name
    FROM poe_submissions ps
    JOIN poe_items pi ON ps.item_id = pi.id
    JOIN users u ON ps.user_id = u.id
    LEFT JOIN assessor_reviews ar ON ar.context_id = ps.id AND ar.decision = 'competent'
    WHERE ps.status IN ('selected_for_moderation','moderation_in_progress')
    ORDER BY ps.updated_at DESC
  `).all();
  res.json({ items });
});

router.get('/review/:submissionId', (req, res) => {
  if (!['moderator','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const sub = db.prepare('SELECT * FROM poe_submissions WHERE id = ?').get(req.params.submissionId);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  const item = db.prepare('SELECT * FROM poe_items WHERE id = ?').get(sub.item_id);
  const section = db.prepare('SELECT * FROM poe_sections WHERE id = ?').get(item.section_id);
  const wm = section.curriculum_element_id ? db.prepare('SELECT * FROM curriculum_elements WHERE id = ?').get(section.curriculum_element_id) : null;
  const fields = db.prepare('SELECT * FROM poe_fields WHERE item_id = ? ORDER BY order_index').all(item.id);
  const files = db.prepare('SELECT * FROM poe_files WHERE submission_id = ?').all(sub.id);
  const learner = db.prepare('SELECT id,full_name,email,cohort_id FROM users WHERE id = ?').get(sub.user_id);
  const assessor = db.prepare('SELECT * FROM assessor_reviews WHERE context_id = ? ORDER BY created_at DESC LIMIT 1').get(sub.id);
  const assessorDecisions = db.prepare('SELECT * FROM assessor_reviews WHERE context_id = ? ORDER BY created_at DESC').all(sub.id);
  const history = db.prepare('SELECT * FROM moderator_reviews WHERE user_id = ? ORDER BY created_at DESC').all(sub.user_id);
  const iacs = db.prepare(`
    SELECT ce.* FROM poe_mappings pm
    JOIN curriculum_elements ce ON pm.curriculum_element_id = ce.id
    WHERE pm.poe_item_id = ? AND ce.type = 'internal_assessment_criterion'
  `).all(item.id);
  let linkedMods = [];
  try { linkedMods = JSON.parse(item.linked_modules || '[]'); } catch {}
  const linkedModuleDetails = linkedMods.length
    ? db.prepare(`SELECT * FROM curriculum_elements WHERE id IN (${linkedMods.map(()=>'?').join(',')})`).all(...linkedMods)
    : [];
  res.json({
    submission: sub, item, section, fields, files, learner,
    assessor, assessorDecisions, history,
    curriculum: { wm, linkedModuleDetails, iacs, eisa_focus_area: item.eisa_focus_area },
  });
});

router.post('/decide', (req, res) => {
  if (!['moderator','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { submission_id, decision, findings, criteria_checked, signoff_name, signoff_role, signed_off } = req.body || {};
  if (!submission_id || !decision) return res.status(400).json({ error: 'missing_fields' });
  const sub = db.prepare('SELECT * FROM poe_submissions WHERE id = ?').get(submission_id);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  const reviewerRow = db.prepare('SELECT * FROM assessor_reviews WHERE context_id = ? ORDER BY created_at DESC LIMIT 1').get(submission_id);

  const id = uid();
  db.prepare(`INSERT INTO moderator_reviews (id,user_id,moderator_id,assessor_review_id,decision,findings,signoff_name,signoff_role,signed_off)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, sub.user_id, req.user.id, reviewerRow ? reviewerRow.id : null, decision, findings || null,
    signoff_name || req.user.full_name, signoff_role || 'Moderator', signed_off ? 1 : 0
  );
  const newSubStatus = decision === 'approved' ? 'final_approved'
    : decision === 'reassessment_required' ? 'reassessment_required'
    : 'moderation_approved';
  db.prepare('UPDATE poe_submissions SET status = ? WHERE id = ?').run(newSubStatus, submission_id);

  if (Array.isArray(criteria_checked) && criteria_checked.length) {
    for (const iacId of criteria_checked) {
      const cid = uid();
      db.prepare(`INSERT INTO moderation_mappings (id,poe_item_id,curriculum_element_id,checklist_item) VALUES (?,?,?,?)`)
        .run(cid, sub.item_id, iacId, 'Moderator verified at ' + new Date().toISOString());
    }
  }

  audit({ user_id: req.user.id, role: req.user.role, action: 'moderator_decision', old_status: sub.status, new_status: newSubStatus,
    related_learner: sub.user_id, related_poe_item: sub.item_id, ip: req.ip, comment: decision });

  res.json({ ok: true, id, new_status: newSubStatus });
});

module.exports = router;
