// Seed: 334102002 official Office Administrator curriculum.
// Pre-seeds users, official modules, official POE structure based on Work Experience Modules.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { init } = require('../db/init');
init();

const db = require('../db');
const { uid } = require('../utils/helpers');
const OFFICIAL = require('./official-curriculum');

function reset() {
  const tables = [
    'class_notes','attendance','pdf_exports','audit_logs','supervisor_signoffs',
    'moderator_mappings','assessment_mappings','moderator_reviews','assessor_reviews',
    'facilitator_feedback','moderation_mappings',
    'poe_files','poe_submission_versions','poe_submissions','poe_fields','poe_items',
    'poe_evidence_groups','poe_sections','poe_templates',
    'poe_mappings','lesson_mappings','module_readiness',
    'workbook_versions','workbook_answers','workbook_questions',
    'lesson_progress','enrolments','resources','lessons','modules',
    'curriculum_mappings','curriculum_elements','curriculum_sections','curriculum_documents',
    'topic_content',
    'courses','cohorts','payments','users'
  ];
  for (const t of tables) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch (e) { console.warn('skip', t, e.message); }
  }
}

function makeUser({ email, name, role, status='active', payment_status='active', cohort_id=null, employer_id=null, password='ChangeMe123!' }) {
  // Allow ADMIN_DEFAULT_PASSWORD / ADMIN_PASSWORD to override the seed default
  // for the admin account (email matches ADMIN_EMAIL). If the env value is the
  // literal placeholder 'change-on-first-login' we still set it (as the temp
  // password) and flag must_change_password=1, so the user is forced to set a
  // real one on first login. Other seeded users keep the legacy default and are
  // not flagged (they are dev/demo only).
  const adminEnvPassword = process.env.ADMIN_DEFAULT_PASSWORD || process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@naleli.co.za';
  let mustChange = 0;
  if (role === 'admin' && email === adminEmail) {
    if (adminEnvPassword) password = adminEnvPassword;
    if (!adminEnvPassword || adminEnvPassword === 'change-on-first-login') {
      mustChange = 1;
    }
  }
  const id = uid();
  db.prepare(`INSERT INTO users (id,email,password_hash,full_name,role,status,payment_status,cohort_id,employer_id,avatar_color,bio,must_change_password,phone,id_number)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, email, bcrypt.hashSync(password, 10), name, role, status, payment_status,
    cohort_id, employer_id, '#1F5132',
    role === 'learner' ? 'Enrolled learner — Occupational Certificate: Office Administrator (334102002).' :
    role === 'facilitator' ? 'Facilitator — Office Administrator qualification.' :
    role === 'assessor' ? 'Registered assessor — 334102002.' :
    role === 'moderator' ? 'Independent moderator — 334102002.' :
    role === 'supervisor' || role === 'employer' ? 'Workplace supervisor.' :
    role === 'finance' ? 'Finance administrator — payments and access.' : 'Administrator',
    mustChange,
    '+27 71 000 0000', '9001010000080'
  );
  return id;
}

function run() {
  reset();

  // Cohort
  const cohortId = uid();
  db.prepare(`INSERT INTO cohorts (id,name,course_id,facilitator_id,start_date,end_date,status) VALUES (?,?,?,?,?,?,?)`)
    .run(cohortId, 'OA-334102002-Cohort-2026-A', null, null, '2026-02-01', '2026-12-15', 'active');

  // Users
  const superadminId = makeUser({ email: 'superadmin@naleli.co.za', name: 'System Owner', role: 'super_admin' });
  const adminId      = makeUser({ email: 'admin@naleli.co.za', name: 'Programme Admin', role: 'admin' });
  const cmId         = makeUser({ email: 'coursemanager@naleli.co.za', name: 'Course Manager', role: 'course_manager' });
  const facId        = makeUser({ email: 'facilitator@naleli.co.za', name: 'Lerato Mokoena', role: 'facilitator' });
  const assId        = makeUser({ email: 'assessor@naleli.co.za', name: 'Thandiwe Naidoo', role: 'assessor' });
  const modId        = makeUser({ email: 'moderator@naleli.co.za', name: 'Sipho Dlamini', role: 'moderator' });
  const finId        = makeUser({ email: 'finance@naleli.co.za', name: 'Finance Officer', role: 'finance' });
  const supId        = makeUser({ email: 'supervisor@naleli.co.za', name: 'Naledi Shongwe', role: 'employer' });

  const learnerId    = makeUser({ email: 'student@naleli.co.za', name: 'Amahle Khumalo', role: 'learner', cohort_id: cohortId, password: 'Student123!' });
  const learner2Id   = makeUser({ email: 'learner2@naleli.co.za', name: 'Jason Petersen', role: 'learner', cohort_id: cohortId, password: 'Student123!' });
  const pendingId    = makeUser({ email: 'pending@naleli.co.za', name: 'Litha Maqungela', role: 'learner', cohort_id: cohortId, status: 'pending_payment', payment_status: 'pending_payment', password: 'Student123!' });

  db.prepare('UPDATE cohorts SET facilitator_id = ? WHERE id = ?').run(facId, cohortId);

  // ===== Curriculum document =====
  const curDocId = uid();
  db.prepare(`INSERT INTO curriculum_documents (id,title,version,source,document_kind,file_path,uploaded_by,extraction_status,upload_status,notes)
              VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    curDocId,
    'QCTO Curriculum Document — Office Administrator (334102002)',
    '1.0',
    'Quality Council for Trades and Occupations (QCTO)',
    'curriculum',
    null,
    adminId,
    'extracted',
    'published',
    'Pre-seeded official curriculum. Replace with the latest official PDF if a newer version is issued.'
  );

  // Also record the other documents as supporting reference / image-only
  const refPdfId = uid();
  db.prepare(`INSERT INTO curriculum_documents (id,title,version,source,document_kind,uploaded_by,extraction_status,upload_status,notes)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    refPdfId,
    'External Assessment Specifications — 334102002',
    '1.0',
    'QCTO',
    'assessment_guide',
    adminId,
    'extracted',
    'published',
    'Pre-seeded from the attached EISA specification document.'
  );

  const imgPdfId = uid();
  db.prepare(`INSERT INTO curriculum_documents (id,title,version,source,document_kind,uploaded_by,extraction_status,upload_status,notes)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    imgPdfId,
    'Supporting Reference — image-only',
    '1.0',
    'QCTO',
    'supporting_reference',
    adminId,
    'failed',
    'archived',
    'Image-only PDF — text extraction not available. Kept as supporting reference; will be re-processed when OCR is added.'
  );

  // ===== Curriculum sections =====
  const sectionId = (code, title, desc, order) => {
    const id = uid();
    db.prepare(`INSERT INTO curriculum_sections (id,document_id,code,title,description,order_index) VALUES (?,?,?,?,?,?)`)
      .run(id, curDocId, code, title, desc, order);
    return id;
  };
  const sec1 = sectionId('SEC-1', 'Section 1: Curriculum Summary', 'Curriculum identity, structure, entry requirements, AQP information.', 1);
  const sec2 = sectionId('SEC-2', 'Section 2: Occupational Profile', 'Occupational purpose, tasks and task details.', 2);
  const sec3A = sectionId('SEC-3A', 'Section 3A: Knowledge Module Specifications', 'Official Knowledge Modules KM-01..KM-15 with topics and IACs.', 3);
  const sec3B = sectionId('SEC-3B', 'Section 3B: Practical Skill Module Specifications', 'Official Practical Skill Modules PM-01..PM-11 with activities and IACs.', 4);
  const sec3C = sectionId('SEC-3C', 'Section 3C: Work Experience Module Specifications', 'Official Work Experience Modules WM-01..WM-10 with work activities and supporting evidence.', 5);
  const sec4 = sectionId('SEC-4', 'Section 4: Statement of Work Experience', 'Official Statement of Work Experience with employer/supervisor details and WAs/SEs.', 6);

  // ===== Occupational tasks =====
  const otIds = {};
  for (const ot of OFFICIAL.occupational_tasks) {
    const id = uid();
    otIds[ot.id] = id;
    db.prepare(`INSERT INTO curriculum_elements (id,document_id,section_id,type,code,title,description,body,nqf_level,eisa_focus_area,status,order_index)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, curDocId, sec2, 'occupational_task', ot.id, ot.title,
      'Occupational task contributing to the qualification purpose.',
      OFFICIAL.occupational_purpose, ot.nqf, ot.eisa_focus_area, 'published', 0
    );
  }

  // Occupational purpose
  const purposeId = uid();
  db.prepare(`INSERT INTO curriculum_elements (id,document_id,section_id,type,code,title,description,body,status)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    purposeId, curDocId, sec2, 'occupational_purpose', 'PURPOSE', 'Occupational Purpose',
    'Why this qualification exists', OFFICIAL.occupational_purpose, 'published'
  );

  // Entry requirements
  const entryId = uid();
  db.prepare(`INSERT INTO curriculum_elements (id,document_id,section_id,type,code,title,description,body,status)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    entryId, curDocId, sec1, 'entry_requirement', 'ENTRY', 'Entry Requirements',
    'Minimum entry requirement to register on the qualification', OFFICIAL.curriculum.entry_requirements, 'published'
  );

  // EISA focus areas
  for (let i = 1; i <= 7; i++) {
    const id = uid();
    db.prepare(`INSERT INTO curriculum_elements (id,document_id,section_id,type,code,title,description,eisa_focus_area,status)
                VALUES (?,?,?,?,?,?,?,?,?)`).run(
      id, curDocId, sec2, 'eisa_focus_area', `EISA-FA-${i}`, `EISA Focus Area ${i}`,
      `External Integrated Summative Assessment focus area ${i}`, i, 'published'
    );
  }

  // ===== Knowledge Modules =====
  const kmIds = {};
  let kmOrder = 0;
  for (const km of OFFICIAL.knowledge_modules) {
    const id = uid();
    kmIds[km.code] = id;
    kmOrder++;
    db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,nqf_level,credits,order_index,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, curDocId, null, sec3A, 'knowledge_module', km.code, km.title,
      'Official Knowledge Module (source: QCTO Curriculum Document 334102002).',
      km.purpose || '', km.nqf, km.credits, kmOrder, 'published'
    );
    // Topics
    let tOrder = 0;
    for (const t of (km.topics || [])) {
      const tid = uid();
      tOrder++;
      db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,weight_percent,order_index,status)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        tid, curDocId, id, sec3A, 'topic', t.code, t.title,
        `Official topic: ${t.title}`,
        (t.elements || []).join(' • '), t.weight || null, tOrder, 'published'
      );
      // Topic elements
      let eOrder = 0;
      for (const el of (t.elements || [])) {
        const eid = uid();
        eOrder++;
        // code derived from element text (KT0101 etc.) if present
        const m = String(el).match(/^(KT\d{4}|PA\d{4}|WA\d{4}|SE\d{4}|IAC\d{4}|WE\d{2})/i);
        const elCode = m ? m[1].toUpperCase() : null;
        db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,order_index,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
          eid, curDocId, tid, sec3A, 'topic_element', elCode, el,
          `Topic element of ${t.code}`,
          '', eOrder, 'published'
        );
      }
      // IACs
      let iOrder = 0;
      for (const iac of (t.iacs || [])) {
        const iid = uid();
        iOrder++;
        const m = String(iac).match(/^(IAC\d{4})/i);
        const code = m ? m[1].toUpperCase() : `IAC-${km.short}-${tOrder}-${iOrder}`;
        db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,weight_percent,order_index,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          iid, curDocId, id, sec3A, 'internal_assessment_criterion', code, iac,
          `IAC of ${t.title} (${t.code})`,
          '', t.weight || null, iOrder, 'published'
        );
        // Map IAC -> topic
        db.prepare(`INSERT INTO curriculum_mappings (id,document_id,from_element_id,to_element_id,relation,weight_percent) VALUES (?,?,?,?,?,?)`)
          .run(uid(), curDocId, iid, tid, 'iac_of_topic', t.weight || null);
      }
    }
  }

  // ===== Practical Skill Modules =====
  const pmIds = {};
  let pmOrder = 0;
  for (const pm of OFFICIAL.practical_skill_modules) {
    const id = uid();
    pmIds[pm.code] = id;
    pmOrder++;
    db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,nqf_level,credits,order_index,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, curDocId, null, sec3B, 'practical_skill_module', pm.code, pm.title,
      'Official Practical Skill Module (source: QCTO Curriculum Document 334102002).',
      pm.purpose || '', pm.nqf, pm.credits, pmOrder, 'published'
    );
    let sOrder = 0;
    for (const s of (pm.skills || [])) {
      const sid = uid();
      sOrder++;
      db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,order_index,status)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        sid, curDocId, id, sec3B, 'practical_skill_item', s.code, s.title,
        `Practical skill group: ${s.title}`, sOrder, 'published'
      );
      let aOrder = 0;
      for (const a of (s.activities || [])) {
        const aid = uid();
        aOrder++;
        const m = String(a).match(/^(PA\d{4})/i);
        const code = m ? m[1].toUpperCase() : null;
        db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,order_index,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          aid, curDocId, sid, sec3B, 'practical_activity', code, a,
          `Practical activity of ${s.code}`, aOrder, 'published'
        );
      }
      let iOrder = 0;
      for (const iac of (s.iacs || [])) {
        const iid = uid();
        iOrder++;
        const m = String(iac).match(/^(IAC\d{4})/i);
        const code = m ? m[1].toUpperCase() : `IAC-${pm.short}-${sOrder}-${iOrder}`;
        db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,order_index,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          iid, curDocId, id, sec3B, 'internal_assessment_criterion', code, iac,
          `IAC of ${s.title} (${s.code})`, iOrder, 'published'
        );
        // map IAC -> practical_skill_item
        db.prepare(`INSERT INTO curriculum_mappings (id,document_id,from_element_id,to_element_id,relation) VALUES (?,?,?,?,?)`)
          .run(uid(), curDocId, iid, sid, 'iac_of_pa');
      }
    }
  }

  // ===== Work Experience Modules =====
  const wmIds = {};
  let wmOrder = 0;
  for (const wm of OFFICIAL.work_experience_modules) {
    const id = uid();
    wmIds[wm.code] = id;
    wmOrder++;
    db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,nqf_level,credits,eisa_focus_area,order_index,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, curDocId, null, sec3C, 'work_experience_module', wm.code, wm.title,
      'Official Work Experience Module (source: QCTO Statement of Work Experience).',
      '', wm.nqf, wm.credits, wm.eisa_focus_area || null, wmOrder, 'published'
    );
    let weOrder = 0;
    for (const we of (wm.work_items || [])) {
      const weid = uid();
      weOrder++;
      db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,body,order_index,status)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        weid, curDocId, id, sec4, 'work_experience_item', we.code, we.title,
        `Work experience item of ${wm.title}`,
        '', weOrder, 'published'
      );
      let aOrder = 0;
      for (const a of (we.activities || [])) {
        const aid = uid();
        aOrder++;
        const m = String(a).match(/^(WA\d{4})/i);
        const code = m ? m[1].toUpperCase() : null;
        db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,order_index,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          aid, curDocId, weid, sec4, 'work_activity', code, a,
          `Work activity of ${we.code}`, aOrder, 'published'
        );
      }
      let sOrder = 0;
      for (const se of (we.supporting_evidence || [])) {
        const sid = uid();
        sOrder++;
        const m = String(se).match(/^(SE\d{4})/i);
        const code = m ? m[1].toUpperCase() : null;
        db.prepare(`INSERT INTO curriculum_elements (id,document_id,parent_id,section_id,type,code,title,description,order_index,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          sid, curDocId, weid, sec4, 'supporting_evidence', code, se,
          `Supporting evidence of ${we.code}`, sOrder, 'published'
        );
      }
    }
  }

  // ===== Course =====
  const courseId = uid();
  db.prepare(`INSERT INTO courses (id,code,title,subtitle,description,qualification_type,saqa_id,nqf_level,total_credits,curriculum_document_id,cover_color,status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    courseId,
    OFFICIAL.curriculum.code,
    `Occupational Certificate: ${OFFICIAL.curriculum.title}`,
    'QCTO-aligned pathway mapped to curriculum 334102002',
    OFFICIAL.occupational_purpose,
    OFFICIAL.curriculum.qualification_type,
    OFFICIAL.curriculum.saqa_id,
    OFFICIAL.curriculum.nqf_level,
    OFFICIAL.curriculum.total_credits,
    curDocId,
    '#1F5132',
    'published'
  );

  // ===== Course modules (linked to curriculum elements) =====
  const moduleRecords = [];
  let order = 1;
  // Knowledge modules
  for (const km of OFFICIAL.knowledge_modules) {
    const id = uid();
    db.prepare(`INSERT INTO modules (id,course_id,curriculum_element_id,type,code,title,description,nqf_level,credits,order_index,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, courseId, kmIds[km.code], 'knowledge', km.code, km.title, 'Official Knowledge Module — mapped to curriculum element.', km.nqf, km.credits, order++, 'published');
    moduleRecords.push({ id, type: 'knowledge', code: km.code, title: km.title, km });
  }
  // Practical skill modules
  for (const pm of OFFICIAL.practical_skill_modules) {
    const id = uid();
    db.prepare(`INSERT INTO modules (id,course_id,curriculum_element_id,type,code,title,description,nqf_level,credits,order_index,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, courseId, pmIds[pm.code], 'practical_skill', pm.code, pm.title, 'Official Practical Skill Module — mapped to curriculum element.', pm.nqf, pm.credits, order++, 'published');
    moduleRecords.push({ id, type: 'practical_skill', code: pm.code, title: pm.title, pm });
  }
  // Work experience modules
  for (const wm of OFFICIAL.work_experience_modules) {
    const id = uid();
    db.prepare(`INSERT INTO modules (id,course_id,curriculum_element_id,type,code,title,description,nqf_level,credits,order_index,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, courseId, wmIds[wm.code], 'work_experience', wm.code, wm.title, 'Official Work Experience Module — mapped to curriculum element.', wm.nqf, wm.credits, order++, 'published');
    moduleRecords.push({ id, type: 'work_experience', code: wm.code, title: wm.title, wm });
  }

  // ===== Lessons — placeholder, draft_support status =====
  for (const m of moduleRecords) {
    const lessonId = uid();
    const sourceOfPurpose = m.km?.purpose || m.pm?.purpose || 'Official module purpose extracted from QCTO 334102002.';
    const saScenario = 'A real or simulated South African office environment. Apply the official module outcomes in a workplace or simulated context until the official learner guide is uploaded.';
    const body = `<p><strong>Official module purpose (from QCTO Curriculum Document 334102002):</strong></p><p>${sourceOfPurpose}</p>
<p><em>Draft support content — must be reviewed against the official learner guide, workbook and facilitator guide when uploaded.</em></p>
<p>Until the official learner guide is uploaded by an administrator, this lesson shows the official module purpose, the linked topics, internal assessment criteria and supporting evidence only. The full teaching content will be filled in once the learner guide and workbook are received.</p>
<p>Use the <a href="/app/poe">Portfolio of Evidence</a> to record evidence that proves the linked outcomes.</p>`;
    db.prepare(`INSERT INTO lessons (id,module_id,curriculum_element_id,title,summary,content,video_url,image_url,duration_minutes,key_terms,sa_scenario,order_index,status,content_status,content_notes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      lessonId, m.id, m.km ? kmIds[m.code] : m.pm ? pmIds[m.code] : wmIds[m.code],
      m.title, m.title, body,
      'https://www.youtube.com/embed/dQw4w9WgXcQ', null, 20,
      JSON.stringify(['QCTO 334102002', 'Draft support content', 'Review against learner guide']),
      saScenario, 1, 'published', 'draft_support', 'Lesson content is scaffold from official module purpose until learner guide is uploaded.'
    );
    // lesson_mappings: this lesson covers the module + the official IAC set
    const allIACs = db.prepare(`SELECT id, code, title, parent_id FROM curriculum_elements WHERE type='internal_assessment_criterion' AND parent_id = ?`).all(m.km ? kmIds[m.code] : m.pm ? pmIds[m.code] : wmIds[m.code]);
    for (const iac of allIACs) {
      db.prepare(`INSERT INTO lesson_mappings (id,lesson_id,curriculum_element_id,mapping_kind,notes) VALUES (?,?,?,?,?)`)
        .run(uid(), lessonId, iac.id, 'covers', 'Lesson is scaffolded against this official IAC; full coverage pending learner guide upload.');
    }
  }

  // ===== Workbook questions — one per official module =====
  for (const m of moduleRecords) {
    const wqId = uid();
    db.prepare(`INSERT INTO workbook_questions (id,module_id,curriculum_element_id,code,prompt,helper,answer_type,is_required,order_index) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(wqId, m.id, m.km ? kmIds[m.code] : m.pm ? pmIds[m.code] : wmIds[m.code],
        'WB-' + m.code,
        `For module ${m.title}: in your own words, summarise the key points of this module and how you would apply them in a South African office. Reference the official module purpose and at least one key term from the curriculum.`,
        'Use 3–6 sentences. Reference the workplace scenario and at least one official IAC.',
        'long_text', 1, 1);
  }

  // ===== POE template — sections per WM =====
  const templateId = uid();
  db.prepare(`INSERT INTO poe_templates (id,course_id,title,curriculum_document_id,version,status) VALUES (?,?,?,?,?,?)`)
    .run(templateId, courseId, OFFICIAL.poe_template.title, curDocId, 1, 'published');

  // Map each official WM to a POE section
  let secIdx = 0;
  for (const wm of OFFICIAL.work_experience_modules) {
    secIdx++;
    const secId = uid();
    db.prepare(`INSERT INTO poe_sections (id,template_id,curriculum_element_id,code,title,description,linked_eisa_focus_areas,linked_kms,linked_pms,order_index)
                VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      secId, templateId, wmIds[wm.code], wm.short, wm.title,
      'Official POE section aligned to Work Experience Module ' + wm.short,
      JSON.stringify(wm.eisa_focus_area ? [wm.eisa_focus_area] : []),
      JSON.stringify([]), JSON.stringify([]), secIdx
    );
    // For each WE item, create an evidence group
    let groupIdx = 0;
    for (const we of wm.work_items) {
      groupIdx++;
      const grpId = uid();
      db.prepare(`INSERT INTO poe_evidence_groups (id,section_id,curriculum_element_id,code,title,description,order_index)
                  VALUES (?,?,?,?,?,?,?)`).run(
        grpId, secId, null, we.code, we.title,
        `Evidence group ${we.code} — ${we.title}`, groupIdx
      );
      // Build a single POE item per group that captures the full WE package
      const itemId = uid();
      const weItemEl = db.prepare(`SELECT id FROM curriculum_elements WHERE code = ? AND document_id = ?`).get(we.code, curDocId);
      const itemTitle = `${wm.short} — ${we.code} — ${we.title}`;
      const instructions = `Complete this POE evidence group for ${wm.short}. Provide: (a) a short description of where and when you did this work, (b) the official work activities you performed, (c) the supporting evidence files you collected, (d) a brief reflection, (e) your supervisor's sign-off.`;
      const whyRequired = `This evidence proves competence for Work Experience Module ${wm.short}: "${wm.title}" against the official QCTO Statement of Work Experience. It contributes to the ${wm.eisa_focus_area ? `EISA Focus Area ${wm.eisa_focus_area}` : 'qualification'}.`;
      const howToPrepare = `1. Read the official work activities (WAs). 2. Collect the official supporting evidence (SEs). 3. Upload scans / screenshots / signed forms. 4. Get your workplace supervisor to sign off.`;
      const commonMistakes = `Unsigned evidence, missing dates, blurry scans, no reflection, supervisor sign-off missing.`;
      const linkedOutcomes = `Occupational tasks linked to ${wm.short}: see QCTO 334102002 Section 2.`;
      const assChecklist = `Confirm: work activities match the official WAs; supporting evidence matches the official SEs; documents are legible and dated; supervisor sign-off present; reflection demonstrates insight.`;
      const modChecklist = `Sample for moderation: confirm assessor checklist above; verify alignment with the official WMs and EISA focus area; spot-check authenticity with workplace supervisor.`;
      const eisaFa = wm.eisa_focus_area || null;
      db.prepare(`INSERT INTO poe_items (id,section_id,evidence_group_id,curriculum_element_id,code,title,instructions,why_required,how_to_prepare,common_mistakes,linked_outcome,linked_modules,linked_iacs,eisa_focus_area,assessor_checklist,moderator_checklist,evidence_kind,requires_supervisor_signoff,order_index)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        itemId, secId, grpId, weItemEl ? weItemEl.id : null, we.code, itemTitle,
        instructions, whyRequired, howToPrepare, commonMistakes, linkedOutcomes,
        JSON.stringify([wmIds[wm.code]]),
        JSON.stringify([]),
        eisaFa,
        assChecklist, modChecklist, 'work_activity', 1, 1
      );
      // Fields
      const fields = [
        ['short_text', 'Where was the work done? (Employer / unit)'],
        ['short_text', 'Period of work (from — to)'],
        ['rich_text', 'Official work activities performed (copy the WAs you actually did)'],
        ['rich_text', 'Workplace supervisor comments'],
        ['file_upload', 'Supporting evidence file 1 (e.g. SE0101)'],
        ['file_upload', 'Supporting evidence file 2'],
        ['file_upload', 'Supporting evidence file 3'],
        ['image_upload', 'Photo or scan'],
        ['reflection', 'What did you learn? What would you do differently?'],
        ['checkbox', 'I declare this evidence is my own work'],
        ['signature', 'Learner signature (type full name)'],
        ['short_text', 'Workplace supervisor name'],
        ['short_text', 'Supervisor contact'],
        ['signature', 'Workplace supervisor sign-off (type full name)'],
        ['date', 'Date of supervisor sign-off'],
      ];
      let fIdx = 0;
      for (const [type, label] of fields) {
        const fid = uid();
        fIdx++;
        db.prepare(`INSERT INTO poe_fields (id,item_id,field_type,label,helper,required,options_json,order_index)
                    VALUES (?,?,?,?,?,?,?,?)`).run(
          fid, itemId, type, label, '', type === 'file_upload' || type === 'image_upload' || type === 'short_text' ? 0 : 1, null, fIdx
        );
      }
    }
  }

  // ===== Enrolments =====
  for (const u of [learnerId, learner2Id, pendingId]) {
    db.prepare(`INSERT INTO enrolments (id,user_id,course_id,cohort_id,status) VALUES (?,?,?,?,?)`)
      .run(uid(), u, courseId, cohortId, 'active');
  }

  // ===== Sample progress for the active learner =====
  const firstFewLessons = db.prepare(`SELECT id, module_id FROM lessons ORDER BY module_id LIMIT 3`).all();
  for (const l of firstFewLessons) {
    db.prepare(`INSERT INTO lesson_progress (id,user_id,lesson_id,status,last_position,completed_at) VALUES (?,?,?,?,?,?)`)
      .run(uid(), learnerId, l.id, 'completed', 100, new Date().toISOString());
  }
  const nextLesson = db.prepare(`SELECT id FROM lessons ORDER BY module_id LIMIT 1 OFFSET 3`).get();
  if (nextLesson) {
    db.prepare(`INSERT INTO lesson_progress (id,user_id,lesson_id,status,last_position) VALUES (?,?,?,?,?)`)
      .run(uid(), learnerId, nextLesson.id, 'in_progress', 40);
  }

  // ===== Sample POE submission =====
  const firstPoEItem = db.prepare(`SELECT id FROM poe_items LIMIT 1`).get();
  if (firstPoEItem) {
    const subId = uid();
    db.prepare(`INSERT INTO poe_submissions (id,user_id,item_id,attempt,status,data_json,declaration_signed,supervisor_signed,supervisor_id,supervisor_signed_at,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(subId, learnerId, firstPoEItem.id, 1, 'submitted',
        JSON.stringify({ where: 'Naledi Shongwe Office', period: '2026-03-01 to 2026-03-15', activities: 'Filing, scheduling, distribution.', reflection: 'I learned how to manage paper and digital records.' }),
        1, 1, supId, new Date().toISOString(), new Date().toISOString());
  }

  // ===== Sample module readiness =====
  for (const m of moduleRecords) {
    db.prepare(`INSERT INTO module_readiness (id,user_id,module_id,lessons_completed,lessons_total,workbook_answered,workbook_total,poe_items_done,poe_items_total,poe_items_competent,we_evidence_done,we_evidence_total,ready_for_assessment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid(), learnerId, m.id, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  // ===== Audit =====
  db.prepare(`INSERT INTO audit_logs (id,user_id,role,action,new_status,comment) VALUES (?,?,?,?,?,?)`)
    .run(uid(), adminId, 'admin', 'system_seeded', 'published', 'Pre-seeded official 334102002 curriculum structure');

  loadEnrichedContent();
  console.log('Seed complete — official 334102002 curriculum loaded.');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@naleli.co.za';
  const adminPwd = process.env.ADMIN_DEFAULT_PASSWORD || process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  console.log(`APP_ENV=${process.env.APP_ENV || 'development'}`);
  console.log('Users:');
  console.log(`  superadmin@naleli.co.za / ChangeMe123!  (legacy default — rotate in production)`);
  console.log(`  ${adminEmail} / ${adminPwd}  ${adminPwd === 'ChangeMe123!' ? '(legacy default — set ADMIN_DEFAULT_PASSWORD in production)' : '(from env)'}`);
  console.log('  coursemanager@naleli.co.za / ChangeMe123!');
  console.log('  facilitator@naleli.co.za / ChangeMe123!');
  console.log('  assessor@naleli.co.za / ChangeMe123!');
  console.log('  moderator@naleli.co.za / ChangeMe123!');
  console.log('  finance@naleli.co.za / ChangeMe123!');
  console.log('  supervisor@naleli.co.za / ChangeMe123!');
  console.log('  student@naleli.co.za / Student123!   (active)');
  console.log('  learner2@naleli.co.za / Student123!  (active)');
  console.log('  pending@naleli.co.za / Student123!   (pending payment)');
}

run();

// ============================================================
// ENRICHED LEARNER CONTENT (AI-generated, requires SME review)
// ============================================================
// After the rest of the seed, load AI-enriched blocks for all 36 modules
// (15 KMs + 11 PMs + 10 WMs). This populates the topic_content table.
function loadEnrichedContent() {
  const km = require('./enriched-content-km');
  const pm = require('./enriched-content-pm');
  const wm = require('./enriched-content-wm');

  const insert = db.prepare(`
    INSERT INTO topic_content (
      id, curriculum_element_id, why_it_matters, plain_english, sa_example,
      scenario, step_by_step, common_mistakes, learn_by_doing,
      workbook_questions_json, quiz_json, poe_link, assessor_checklist,
      moderator_checklist, references_json, up_to_date_note, review_status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let loaded = 0;
  for (const [key, mod] of Object.entries(km)) {
    for (const t of (mod.topics || [])) {
      // We need curriculum_element_id for the topic. Try to find it.
      const row = db.prepare(`
        SELECT id FROM curriculum_elements
        WHERE type='topic' AND code=? LIMIT 1
      `).get(t.kt_code);
      if (!row) continue;
      insert.run(
        uid('tcontent'),
        row.id,
        t.why_it_matters || null,
        t.plain_english || null,
        t.sa_example || null,
        t.scenario || null,
        t.step_by_step || null,
        t.common_mistakes || null,
        t.learn_by_doing || null,
        JSON.stringify(t.workbook_questions || []),
        JSON.stringify(t.quiz || []),
        t.poe_link || null,
        t.assessor_checklist || null,
        t.moderator_checklist || null,
        JSON.stringify(t.references || []),
        t.up_to_date_note || null,
        'draft_ai'
      );
      loaded++;
    }
  }
  for (const [key, mod] of Object.entries(pm)) {
    for (const it of (mod.items || [])) {
      const row = db.prepare(`
        SELECT id FROM curriculum_elements
        WHERE type='practical_activity' AND code=? LIMIT 1
      `).get(it.psi_code);
      if (!row) continue;
      insert.run(
        uid('tcontent'),
        row.id,
        it.why_it_matters || null,
        it.plain_english || null,
        it.sa_example || null,
        it.scenario || null,
        it.step_by_step || null,
        it.common_mistakes || null,
        it.learn_by_doing || null,
        JSON.stringify(it.workbook_questions || []),
        JSON.stringify(it.quiz || []),
        it.poe_link || null,
        it.assessor_checklist || null,
        it.moderator_checklist || null,
        JSON.stringify(it.references || []),
        it.up_to_date_note || null,
        'draft_ai'
      );
      loaded++;
    }
  }
  for (const [key, mod] of Object.entries(wm)) {
    for (const it of (mod.items || [])) {
      const row = db.prepare(`
        SELECT id FROM curriculum_elements
        WHERE type='work_experience_item' AND code=? LIMIT 1
      `).get(it.wei_code);
      if (!row) continue;
      insert.run(
        uid('tcontent'),
        row.id,
        it.why_it_matters || null,
        it.plain_english || null,
        it.sa_example || null,
        it.scenario || null,
        it.step_by_step || null,
        it.common_mistakes || null,
        it.learn_by_doing || null,
        JSON.stringify(it.workbook_questions || []),
        JSON.stringify(it.quiz || []),
        it.poe_link || null,
        it.assessor_checklist || null,
        it.moderator_checklist || null,
        JSON.stringify(it.references || []),
        it.up_to_date_note || null,
        'draft_ai'
      );
      loaded++;
    }
  }
  console.log(`  topic_content rows loaded: ${loaded}`);
}
