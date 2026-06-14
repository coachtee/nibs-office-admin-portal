// Learner-facing API: dashboard, pathway, "next to do", official 334102002 structure.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function learnerState(user) {
  return {
    payment_locked: user.status === 'pending_payment' || user.payment_status === 'pending_payment',
    suspended: user.status === 'suspended',
  };
}

router.get('/dashboard', (req, res) => {
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  const state = learnerState(req.user);
  const course = db.prepare('SELECT * FROM courses ORDER BY created_at LIMIT 1').get();
  let course_progress = { lessons_completed: 0, lessons_total: 0, modules_done: 0, modules_total: 0, km_done: 0, pm_done: 0, wm_done: 0, poe_competent: 0, poe_total: 0, final_approved: 0, wm_supervisor_signed: 0, wm_total: 0 };
  let continueRow = null;
  let due_soon = [];
  let needs_correction = [];
  let missing_poe = [];
  let submitted_for_review = [];
  let assessment_readiness = null;
  let recommended_next = null;
  let completed_recently = [];
  let latest_feedback = null;
  let modules_by_type = { knowledge: [], practical_skill: [], work_experience: [] };
  let module_readiness = [];

  if (course && !state.payment_locked) {
    const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index, code').all(course.id);
    course_progress.modules_total = modules.length;
    modules_by_type = {
      knowledge: modules.filter(m => m.type === 'knowledge'),
      practical_skill: modules.filter(m => m.type === 'practical_skill'),
      work_experience: modules.filter(m => m.type === 'work_experience'),
    };
    const lessons = db.prepare('SELECT * FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?)').all(course.id);
    course_progress.lessons_total = lessons.length;
    const prog = db.prepare('SELECT * FROM lesson_progress WHERE user_id = ?').all(req.user.id);
    const progMap = new Map(prog.map(p => [p.lesson_id, p]));
    course_progress.lessons_completed = prog.filter(p => p.status === 'completed').length;

    // Module readiness
    module_readiness = db.prepare('SELECT * FROM module_readiness WHERE user_id = ?').all(req.user.id);
    const mrMap = new Map(module_readiness.map(r => [r.module_id, r]));

    // POE — now based on WM sections
    const poeSections = db.prepare(`SELECT ps.*, ps.curriculum_element_id AS wm_id
      FROM poe_sections ps WHERE ps.template_id = (SELECT id FROM poe_templates WHERE course_id = ? ORDER BY created_at LIMIT 1)`).all(course.id);
    const poeItems = db.prepare(`
      SELECT pi.*, ps.curriculum_element_id AS wm_id, ps.title AS section_title
      FROM poe_items pi JOIN poe_sections ps ON pi.section_id = ps.id
      WHERE ps.template_id = (SELECT id FROM poe_templates WHERE course_id = ? ORDER BY created_at LIMIT 1)
      ORDER BY ps.order_index, pi.order_index
    `).all(course.id);
    course_progress.poe_total = poeItems.length;
    const myPoe = db.prepare('SELECT * FROM poe_submissions WHERE user_id = ?').all(req.user.id);
    const poeByItem = new Map(myPoe.map(p => [p.item_id, p]));
    course_progress.poe_competent = myPoe.filter(p => ['competent','final_approved','moderation_approved'].includes(p.status)).length;
    course_progress.final_approved = myPoe.filter(p => p.status === 'final_approved').length;
    course_progress.wm_supervisor_signed = myPoe.filter(p => p.supervisor_signed).length;
    course_progress.wm_total = poeItems.length;

    // Per-type competence counts
    for (const m of modules) {
      if (m.type === 'knowledge') {
        // knowledge is "done" when all linked lessons are completed
        const mLessons = lessons.filter(l => l.module_id === m.id);
        const allDone = mLessons.length > 0 && mLessons.every(l => progMap.get(l.id)?.status === 'completed');
        if (allDone) course_progress.km_done++;
      } else if (m.type === 'practical_skill') {
        // PM "done" when at least one associated lesson is completed (placeholder)
        const mLessons = lessons.filter(l => l.module_id === m.id);
        const done = mLessons.some(l => progMap.get(l.id)?.status === 'completed');
        if (done) course_progress.pm_done++;
      } else if (m.type === 'work_experience') {
        // WM "done" when associated POE item is competent or final_approved
        const item = poeItems.find(p => p.wm_id === m.curriculum_element_id);
        if (item) {
          const sub = poeByItem.get(item.id);
          if (sub && ['competent','final_approved','moderation_approved'].includes(sub.status)) course_progress.wm_done++;
        }
      }
    }
    course_progress.modules_done = course_progress.km_done + course_progress.pm_done + course_progress.wm_done;

    // Continue where left off
    const inProg = lessons.find(l => progMap.get(l.id)?.status === 'in_progress');
    const next = inProg || lessons.find(l => progMap.get(l.id)?.status !== 'completed') || lessons[0];
    if (next) {
      const mod = modules.find(m => m.id === next.module_id);
      continueRow = {
        kind: 'lesson', id: next.id, title: next.title,
        module_code: mod?.code || '', module_title: mod?.title || '',
        module_type: mod?.type || '',
        progress: progMap.get(next.id)?.status === 'in_progress' ? 30 : 0,
        type: mod?.type === 'knowledge' ? 'Knowledge Module' : mod?.type === 'practical_skill' ? 'Practical Skill Module' : 'Work Experience Module',
        next_action: 'Continue lesson',
      };
    }

    // Recommended next — first POE not yet competent
    const nextPoe = poeItems.find(p => !poeByItem.get(p.id) || ['not_started','draft'].includes(poeByItem.get(p.id).status));
    if (nextPoe) {
      recommended_next = {
        kind: 'poe', id: nextPoe.id, title: nextPoe.title, code: nextPoe.code,
        section: nextPoe.section_title, status: poeByItem.get(nextPoe.id)?.status || 'not_started',
        type: 'POE', next_action: 'Complete POE evidence',
      };
    }

    // Due soon
    due_soon = myPoe
      .filter(p => ['submitted','resubmitted','selected_for_moderation'].includes(p.status))
      .slice(0, 5)
      .map(p => {
        const it = poeItems.find(i => i.id === p.item_id);
        return { id: p.item_id, title: it ? it.title : 'POE', status: p.status, type: 'POE' };
      });

    // Needs correction
    needs_correction = myPoe
      .filter(p => p.status === 'needs_correction')
      .map(p => {
        const it = poeItems.find(i => i.id === p.item_id);
        return { id: p.item_id, title: it ? it.title : 'POE', status: 'Needs correction', type: 'POE' };
      });

    // Missing POE
    missing_poe = poeItems
      .filter(p => !poeByItem.get(p.id) || ['not_started','draft'].includes(poeByItem.get(p.id).status))
      .slice(0, 8)
      .map(p => ({ id: p.id, title: p.title, code: p.code, section: p.section_title, status: 'Not started', type: 'POE' }));

    // Submitted
    submitted_for_review = myPoe
      .filter(p => ['submitted','resubmitted','accepted','selected_for_moderation','moderation_in_progress'].includes(p.status))
      .slice(0, 5)
      .map(p => {
        const it = poeItems.find(i => i.id === p.item_id);
        return { id: p.item_id, title: it ? it.title : 'POE', status: p.status, type: 'POE' };
      });

    // Assessment readiness (EISA)
    const allKM = course_progress.km_done >= course_progress.modules_by_type?.knowledge?.length || modules_by_type.knowledge.length === 0;
    const allPM = course_progress.pm_done >= modules_by_type.practical_skill.length;
    const allWM = course_progress.wm_done >= modules_by_type.work_experience.length;
    if (allKM && allPM && allWM && modules_by_type.work_experience.length > 0) {
      assessment_readiness = { ready: true, message: 'All modules complete and POE evidence signed off. Eligible for EISA.', eisa_focus_areas: [1,2,3,4,5,6,7] };
    } else {
      assessment_readiness = { ready: false, message: `Complete more work to be EISA-ready. KM: ${course_progress.km_done}/${modules_by_type.knowledge.length}, PM: ${course_progress.pm_done}/${modules_by_type.practical_skill.length}, WM: ${course_progress.wm_done}/${modules_by_type.work_experience.length}.` };
    }

    // Completed recently
    completed_recently = prog
      .filter(p => p.status === 'completed' && p.completed_at)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
      .slice(0, 6)
      .map(p => {
        const l = lessons.find(x => x.id === p.lesson_id);
        const m = l ? modules.find(x => x.id === l.module_id) : null;
        return l ? { id: l.id, title: l.title, status: 'Completed', type: m?.type || 'knowledge', module: m?.title || '' } : null;
      })
      .filter(Boolean);

    // Latest feedback
    const fb = db.prepare('SELECT * FROM facilitator_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id);
    if (fb) latest_feedback = { text: fb.feedback, date: fb.created_at, kind: fb.context_type };
  }

  res.json({
    user: req.user,
    state,
    course,
    course_progress,
    modules_by_type,
    module_readiness,
    continue: continueRow,
    due_soon, needs_correction, missing_poe, submitted_for_review,
    recommended_next, assessment_readiness, completed_recently, latest_feedback,
  });
});

router.get('/pathway', (req, res) => {
  if (req.user.role !== 'learner') return res.status(403).json({ error: 'learner_only' });
  const course = db.prepare('SELECT * FROM courses ORDER BY created_at LIMIT 1').get();
  if (!course) return res.json({ tabs: [] });
  const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index, code').all(course.id);
  const byType = {
    knowledge: modules.filter(m => m.type === 'knowledge'),
    practical_skill: modules.filter(m => m.type === 'practical_skill'),
    work_experience: modules.filter(m => m.type === 'work_experience'),
  };
  const poeSections = db.prepare(`SELECT * FROM poe_sections WHERE template_id = (SELECT id FROM poe_templates WHERE course_id = ? ORDER BY created_at LIMIT 1) ORDER BY order_index`).all(course.id);
  const poeItems = db.prepare(`
    SELECT pi.*, ps.title AS section_title, ps.code AS section_code, ps.curriculum_element_id AS wm_id
    FROM poe_items pi JOIN poe_sections ps ON pi.section_id = ps.id
    WHERE ps.template_id = (SELECT id FROM poe_templates WHERE course_id = ? ORDER BY created_at LIMIT 1)
    ORDER BY ps.order_index, pi.order_index
  `).all(course.id);
  // Group items by section
  const sections = poeSections.map(s => ({
    ...s,
    items: poeItems.filter(p => p.section_id === s.id),
  }));
  const tabs = [
    { key: 'knowledge', label: 'Knowledge Modules', items: byType.knowledge, count: byType.knowledge.length, total_credits: byType.knowledge.reduce((s, m) => s + (m.credits || 0), 0) },
    { key: 'practical_skill', label: 'Practical Skill Modules', items: byType.practical_skill, count: byType.practical_skill.length, total_credits: byType.practical_skill.reduce((s, m) => s + (m.credits || 0), 0) },
    { key: 'work_experience', label: 'Work Experience Modules', items: byType.work_experience, count: byType.work_experience.length, total_credits: byType.work_experience.reduce((s, m) => s + (m.credits || 0), 0) },
    { key: 'workbook', label: 'Workbook', items: [], count: 0, summary: 'Linked to each Knowledge and Practical Skill Module' },
    { key: 'poe', label: 'POE', sections, items: poeItems, count: poeItems.length, summary: `${poeSections.length} WM-based sections, each with Work Activities (WAs) and Supporting Evidence (SEs)` },
    { key: 'assessment', label: 'Assessment', items: [], summary: 'Internal assessment against the official IACs of each module.' },
    { key: 'moderation', label: 'Moderation', items: [], summary: 'A sample is sent for moderation. Decisions are logged and added to your POE pack.' },
    { key: 'final', label: 'Final Readiness', items: [], summary: 'EISA readiness — all 36 modules complete, all POE evidence competent and signed off, sample moderated.' },
  ];
  res.json({ course, tabs });
});

module.exports = router;
