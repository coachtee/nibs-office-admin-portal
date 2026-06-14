// Assessor — full curriculum criteria view
const express = require('express');
const db = require('../db');
const { requireAuth, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/queue', (req, res) => {
  if (!['assessor','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const items = db.prepare(`
    SELECT ps.id AS submission_id, ps.user_id, ps.item_id, ps.status, ps.attempt, ps.updated_at,
           pi.title AS item_title, pi.code AS item_code,
           pi.eisa_focus_area, pi.linked_modules, pi.linked_iacs, pi.assessor_checklist,
           u.full_name, u.cohort_id
    FROM poe_submissions ps
    JOIN poe_items pi ON ps.item_id = pi.id
    JOIN users u ON ps.user_id = u.id
    WHERE ps.status IN ('accepted','submitted','resubmitted','needs_correction','not_yet_competent')
    ORDER BY ps.updated_at DESC
  `).all();
  res.json({ items });
});

router.get('/submission/:id', (req, res) => {
  if (!['assessor','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const sub = db.prepare('SELECT * FROM poe_submissions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  const item = db.prepare('SELECT * FROM poe_items WHERE id = ?').get(sub.item_id);
  const section = db.prepare('SELECT * FROM poe_sections WHERE id = ?').get(item.section_id);
  // Curriculum context
  const wm = section.curriculum_element_id ? db.prepare('SELECT * FROM curriculum_elements WHERE id = ?').get(section.curriculum_element_id) : null;
  const module = wm ? db.prepare('SELECT * FROM modules WHERE curriculum_element_id = ?').get(wm.id) : null;
  const fields = db.prepare('SELECT * FROM poe_fields WHERE item_id = ? ORDER BY order_index').all(item.id);
  const files = db.prepare('SELECT * FROM poe_files WHERE submission_id = ?').all(sub.id);
  const learner = db.prepare('SELECT id,full_name,email,cohort_id FROM users WHERE id = ?').get(sub.user_id);
  const history = db.prepare('SELECT * FROM poe_submission_versions WHERE submission_id = ? ORDER BY version DESC').all(sub.id);
  const reviews = db.prepare('SELECT * FROM assessor_reviews WHERE context_id = ? ORDER BY created_at DESC').all(sub.id);
  const facilitatorFb = db.prepare(`SELECT * FROM facilitator_feedback WHERE user_id = ? AND context_id = ? ORDER BY created_at DESC`).all(sub.user_id, sub.id);
  // IAC list (linked via poe_mappings)
  const iacs = db.prepare(`
    SELECT ce.* FROM poe_mappings pm
    JOIN curriculum_elements ce ON pm.curriculum_element_id = ce.id
    WHERE pm.poe_item_id = ? AND ce.type = 'internal_assessment_criterion'
  `).all(item.id);
  // Linked modules
  let linkedMods = [];
  try { linkedMods = JSON.parse(item.linked_modules || '[]'); } catch {}
  const linkedModuleDetails = linkedMods.length
    ? db.prepare(`SELECT * FROM curriculum_elements WHERE id IN (${linkedMods.map(()=>'?').join(',')})`).all(...linkedMods)
    : [];
  // Topics in the linked module
  const topics = linkedModuleDetails.length
    ? db.prepare(`SELECT * FROM curriculum_elements WHERE parent_id = ? AND type = 'topic' ORDER BY order_index`).all(linkedModuleDetails[0].id)
    : [];
  res.json({
    submission: sub, item, section, fields, files, learner, history, reviews,
    curriculum: { wm, module, iacs, linkedModuleDetails, topics, eisa_focus_area: item.eisa_focus_area },
    facilitator_feedback: facilitatorFb,
  });
});

router.post('/decide', (req, res) => {
  if (!['assessor','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { submission_id, decision, feedback, criteria, iacs_checked, signoff_name, signoff_role, signed_off } = req.body || {};
  if (!submission_id || !decision) return res.status(400).json({ error: 'missing_fields' });
  const sub = db.prepare('SELECT * FROM poe_submissions WHERE id = ?').get(submission_id);
  if (!sub) return res.status(404).json({ error: 'not_found' });

  const id = uid();
  const newSubStatus = decision === 'competent' ? 'competent'
    : decision === 'not_yet_competent' ? 'not_yet_competent'
    : decision === 'needs_correction' ? 'needs_correction'
    : 'reassessment_required';

  db.prepare(`INSERT INTO assessor_reviews (id,user_id,assessor_id,context_type,context_id,decision,feedback,criteria_json,signoff_name,signoff_role,signed_off)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, sub.user_id, req.user.id, 'poe', submission_id, decision, feedback || null,
    JSON.stringify(criteria || []), signoff_name || req.user.full_name, signoff_role || 'Assessor', signed_off ? 1 : 0
  );
  db.prepare('UPDATE poe_submissions SET status = ? WHERE id = ?').run(newSubStatus, submission_id);

  // Persist assessment_mappings: which IACs were checked
  if (Array.isArray(iacs_checked) && iacs_checked.length) {
    for (const iacId of iacs_checked) {
      const cid = uid();
      db.prepare(`INSERT INTO assessment_mappings (id,poe_item_id,curriculum_element_id,checklist_item) VALUES (?,?,?,?)`)
        .run(cid, sub.item_id, iacId, 'IAC checked at ' + new Date().toISOString());
    }
  }

  audit({ user_id: req.user.id, role: req.user.role, action: 'assessor_decision', old_status: sub.status, new_status: newSubStatus,
    related_learner: sub.user_id, related_poe_item: sub.item_id, ip: req.ip, comment: decision });

  if (newSubStatus === 'competent') {
    const sample = Math.random() < 0.25;
    if (sample) {
      db.prepare("UPDATE poe_submissions SET status = 'selected_for_moderation' WHERE id = ?").run(submission_id);
      audit({ user_id: req.user.id, role: req.user.role, action: 'poe_selected_for_moderation', related_learner: sub.user_id, related_poe_item: sub.item_id, new_status: 'selected_for_moderation', ip: req.ip });
    }
  }
  res.json({ ok: true, id, new_status: newSubStatus });
});

module.exports = router;
