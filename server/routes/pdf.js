// PDF exports — official 334102002 chain: Curriculum -> Activity -> Evidence -> Assessor -> Moderator
const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const EXPORT_DIR = process.env.EXPORT_DIR || path.join(__dirname, '..', '..', 'uploads', 'exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const PROVIDER = {
  name: process.env.PROVIDER_NAME || 'NIBS — Naleli Institute of Business Studies',
  reg: process.env.PROVIDER_REGISTRATION || 'QCTO-SDF-XXXXX',
  address: process.env.PROVIDER_ADDRESS || 'Cape Town, South Africa',
  contact: process.env.PROVIDER_CONTACT || 'info@naleli.co.za',
  phone: process.env.PROVIDER_PHONE || '+27 21 000 0000',
};
const CURRICULUM_CODE = '334102002';
const CURRICULUM_TITLE = 'Occupational Certificate: Office Administrator';
const CURRICULUM_NQF = 5;

const COL = { ink: '#1B2A23', primary: '#1F5132', gold: '#C7A24A', line: '#E6DCC4', bg2: '#F2EBDC' };

function newDoc(title) {
  return new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Producer: 'NIBS Pathway Portal' } });
}

function header(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 70).fill(COL.primary);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16).text(PROVIDER.name, 48, 22);
  doc.font('Helvetica').fontSize(9).fillColor('#E6E1D2').text(PROVIDER.address + ' • ' + PROVIDER.contact, 48, 42);
  doc.rect(0, 70, doc.page.width, 3).fill(COL.gold);
  doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(20).text(title, 48, 100);
  if (subtitle) doc.font('Helvetica').fontSize(10).fillColor('#5C6E63').text(subtitle, 48, 126);
  doc.moveTo(48, 150).lineTo(doc.page.width - 48, 150).strokeColor(COL.line).stroke();
  doc.y = 170;
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 36;
    doc.fontSize(8).fillColor('#8A8A8A').text(`${PROVIDER.name} • ${CURRICULUM_CODE} ${CURRICULUM_TITLE} • Confidential`, 48, y, { width: 340 });
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - 48 - 240, y, { width: 240, align: 'right' });
    doc.rect(0, doc.page.height - 6, doc.page.width, 6).fill(COL.gold);
  }
}

function sectionTitle(doc, text) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(COL.primary).font('Helvetica-Bold').fontSize(13).text(text);
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - 48, doc.y + 2).strokeColor(COL.gold).lineWidth(1).stroke();
  doc.moveDown(0.5);
  doc.fillColor(COL.ink);
}

function fieldRow(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#324A3D').text(label, { continued: false });
  doc.font('Helvetica').fontSize(10).fillColor(COL.ink).text(value || '—', { width: doc.page.width - 96 });
  doc.moveDown(0.2);
}

function saveAndRespond(doc, res, filename) {
  const filePath = path.join(EXPORT_DIR, `${Date.now()}-${filename}`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.end();
  stream.on('finish', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  });
}

// ===== POE PACK — full evidence pack with official curriculum chain =====
router.get('/poe-pack/:userId', requireCap('pdf.*'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const course = db.prepare('SELECT * FROM courses ORDER BY created_at LIMIT 1').get();
  const cohort = user.cohort_id ? db.prepare('SELECT * FROM cohorts WHERE id = ?').get(user.cohort_id) : null;
  const curDoc = db.prepare("SELECT * FROM curriculum_documents WHERE document_kind = 'curriculum' ORDER BY created_at DESC LIMIT 1").get();
  const modules = course ? db.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY order_index, code").all(course.id) : [];
  const wmModules = modules.filter(m => m.type === 'work_experience');

  const submissions = db.prepare(`
    SELECT ps.*, pi.title AS item_title, pi.code AS item_code, pi.instructions, pi.why_required,
           pi.linked_outcome, pi.assessment_criteria, pi.assessor_checklist, pi.moderator_checklist,
           pi.eisa_focus_area, pi.requires_supervisor_signoff,
           s.title AS section_title, s.code AS section_code, s.curriculum_element_id AS wm_id,
           (SELECT template_id FROM poe_sections WHERE id = s.id) AS template_id
    FROM poe_submissions ps
    JOIN poe_items pi ON ps.item_id = pi.id
    JOIN poe_sections s ON pi.section_id = s.id
    WHERE ps.user_id = ?
    ORDER BY s.order_index, pi.order_index
  `).all(user.id);
  const fieldsByItem = {};
  const itemsIds = [...new Set(submissions.map(s => s.item_id))];
  if (itemsIds.length) {
    db.prepare(`SELECT * FROM poe_fields WHERE item_id IN (${itemsIds.map(()=>'?').join(',')}) ORDER BY order_index`).all(...itemsIds).forEach(f => {
      (fieldsByItem[f.item_id] = fieldsByItem[f.item_id] || []).push(f);
    });
  }
  const assessorDecisions = db.prepare(`SELECT * FROM assessor_reviews WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
  const moderatorDecisions = db.prepare(`SELECT * FROM moderator_reviews WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
  const supervisorSigns = db.prepare(`SELECT * FROM supervisor_signoffs WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
  const evidenceIndex = db.prepare(`SELECT * FROM poe_files WHERE user_id = ? ORDER BY uploaded_at DESC`).all(user.id);

  const doc = newDoc(`POE Pack — ${user.full_name}`);
  // Cover
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COL.bg2);
  doc.rect(0, doc.page.height / 2 - 110, doc.page.width, 220).fill(COL.primary);
  doc.rect(0, doc.page.height / 2 + 110, doc.page.width, 3).fill(COL.gold);
  doc.fillColor(COL.primary).font('Helvetica-Bold').fontSize(22).text('PORTFOLIO OF EVIDENCE', 48, doc.page.height / 2 - 100);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13).text(PROVIDER.name, 48, doc.page.height / 2 - 50);
  doc.font('Helvetica').fontSize(11).text(`${CURRICULUM_CODE} — ${CURRICULUM_TITLE} • NQF Level ${CURRICULUM_NQF}`, 48, doc.page.height / 2 - 32);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COL.gold).text(user.full_name, 48, doc.page.height / 2 - 8);
  doc.font('Helvetica').fontSize(11).fillColor('#E6E1D2').text(`Cohort: ${cohort ? cohort.name : '—'}`, 48, doc.page.height / 2 + 22);
  doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`, 48, doc.page.height / 2 + 40);
  doc.text(`Provider: ${PROVIDER.reg}`, 48, doc.page.height / 2 + 56);
  doc.addPage();

  // 1. Course & Curriculum details (from official document)
  header(doc, 'Course & Curriculum Details (Official)', `Source: ${curDoc ? curDoc.title : 'QCTO 334102002'}`);
  fieldRow(doc, 'Curriculum Code', CURRICULUM_CODE);
  fieldRow(doc, 'Curriculum Title', CURRICULUM_TITLE);
  fieldRow(doc, 'Qualification Type', 'Occupational Certificate');
  fieldRow(doc, 'NQF Level', String(CURRICULUM_NQF));
  fieldRow(doc, 'Total Credits (KM + PM + WM)', '132 + 155 + 158 = 445');
  fieldRow(doc, 'Entry Requirements', 'NQF Level 4 with Communication');
  fieldRow(doc, 'AQP', 'Quality Council for Trades and Occupations (QCTO)');
  fieldRow(doc, 'Provider', `${PROVIDER.name} (${PROVIDER.reg})`);

  // 2. Learner details
  sectionTitle(doc, 'Learner & Cohort Details');
  fieldRow(doc, 'Learner Full Name', user.full_name);
  fieldRow(doc, 'Email', user.email);
  fieldRow(doc, 'ID Number', user.id_number || '—');
  fieldRow(doc, 'Phone', user.phone || '—');
  fieldRow(doc, 'Cohort', cohort ? `${cohort.name} (${cohort.start_date || ''} → ${cohort.end_date || ''})` : '—');
  fieldRow(doc, 'Status', user.status);
  fieldRow(doc, 'Payment Status', user.payment_status);

  // 3. Learner declaration
  sectionTitle(doc, 'Learner Declaration');
  doc.font('Helvetica').fontSize(10).fillColor(COL.ink).text(
    `I, ${user.full_name}, declare that the evidence contained in this Portfolio of Evidence is my own work, was completed in line with the requirements of the Occupational Certificate: Office Administrator (${CURRICULUM_CODE}), and is a true reflection of my learning and workplace experience. I understand that this evidence is subject to internal and external moderation.`,
    { width: doc.page.width - 96, align: 'justify' }
  );
  doc.moveDown(1);
  doc.text('Signed: ____________________________   Date: ____________');

  // 4. Module structure (KM / PM / WM)
  sectionTitle(doc, 'Module Structure (from official curriculum)');
  doc.font('Helvetica-Bold').fontSize(10);
  ['Code','Module','Type','NQF','Cr'].forEach((h, i) => {
    const xs = [48, 130, 320, 410, 460];
    doc.text(h, xs[i], doc.y, { width: i === 1 ? 180 : 70 });
  });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9);
  for (const m of modules) {
    if (doc.y > doc.page.height - 60) doc.addPage();
    const xs = [48, 130, 320, 410, 460];
    doc.text(m.code, xs[0], doc.y, { width: 80 });
    doc.text((m.title || '').slice(0, 38), xs[1], doc.y, { width: 185 });
    doc.text(m.type.replace(/_/g, ' '), xs[2], doc.y, { width: 85 });
    doc.text(String(m.nqf_level || '—'), xs[3], doc.y);
    doc.text(String(m.credits || '—'), xs[4], doc.y);
    doc.moveDown(0.3);
  }

  // 5. Curriculum mapping summary (KM -> PM -> WM)
  doc.addPage();
  sectionTitle(doc, 'Curriculum Mapping Summary (KM → PM → WM)');
  for (const wm of wmModules) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(`${wm.code} — ${wm.title}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`NQF ${wm.nqf_level} • ${wm.credits} cr${wm.eisa_focus_area ? ` • EISA Focus Area ${wm.eisa_focus_area}` : ''}`);
    doc.moveDown(0.2);
    // Linked IACs
    const iacs = db.prepare(`SELECT * FROM curriculum_elements WHERE id IN (
      SELECT to_element_id FROM curriculum_mappings
      WHERE from_element_id IN (SELECT id FROM curriculum_elements WHERE parent_id = ? AND type = 'topic')
    )`).all(wm.curriculum_element_id || '');
    if (iacs.length) {
      doc.font('Helvetica').fontSize(9).fillColor(COL.ink).text('Linked Internal Assessment Criteria:', { continued: false });
      iacs.slice(0, 6).forEach(iac => {
        doc.font('Helvetica').fontSize(8).fillColor('#5C6E63').text(`• ${iac.code} — ${(iac.title || '').slice(0, 90)}`, { width: doc.page.width - 96 });
      });
      if (iacs.length > 6) doc.font('Helvetica').fontSize(8).text(`... and ${iacs.length - 6} more.`, { width: doc.page.width - 96 });
    }
    doc.moveDown(0.6);
  }

  // 6. POE checklist + submissions (one block per submission, with official chain)
  doc.addPage();
  sectionTitle(doc, 'POE Submissions — Curriculum → Activity → Evidence → Decision → Finding');
  if (!submissions.length) doc.font('Helvetica').fontSize(10).text('No POE submissions recorded.');
  for (const s of submissions) {
    if (doc.y > doc.page.height - 220) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(`${s.item_code || ''} — ${s.item_title}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`${s.section_title} • Attempt ${s.attempt} • Status: ${s.status} • ${s.updated_at}`);
    doc.moveDown(0.2);
    if (s.eisa_focus_area) doc.font('Helvetica').fontSize(9).fillColor(COL.primary).text(`Linked EISA Focus Area: ${s.eisa_focus_area}`);
    if (s.linked_outcome) doc.font('Helvetica').fontSize(9).text(`Linked outcome: ${s.linked_outcome}`);
    if (s.assessment_criteria) doc.font('Helvetica').fontSize(9).text(`Assessment criteria: ${s.assessment_criteria}`);
    if (s.assessor_checklist) doc.font('Helvetica').fontSize(9).fillColor('#324A3D').text(`Assessor checklist: ${s.assessor_checklist}`);
    if (s.moderator_checklist) doc.font('Helvetica').fontSize(9).fillColor('#324A3D').text(`Moderator checklist: ${s.moderator_checklist}`);
    let data = {}; try { data = JSON.parse(s.data_json || '{}'); } catch {}
    const fields = fieldsByItem[s.item_id] || [];
    for (const f of fields) {
      const val = data[f.id];
      if (val == null || val === '') continue;
      doc.font('Helvetica-Bold').fontSize(9).text(`${f.label}:`);
      doc.font('Helvetica').fontSize(9).text(String(val), { width: doc.page.width - 96 });
    }
    if (s.supervisor_signed) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F5132').text('✓ Supervisor signed off');
      if (s.supervisor_feedback) doc.font('Helvetica').fontSize(9).text(s.supervisor_feedback, { width: doc.page.width - 96 });
    }
    doc.moveDown(0.7);
  }

  // 7. Assessor decisions
  doc.addPage();
  sectionTitle(doc, 'Assessor Decisions');
  if (!assessorDecisions.length) doc.font('Helvetica').fontSize(10).text('No assessor decisions yet.');
  for (const r of assessorDecisions) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).text(`${r.created_at} • ${r.decision.toUpperCase().replace(/_/g, ' ')}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`Assessor: ${r.signoff_name || '—'} (${r.signoff_role || '—'}) ${r.signed_off ? '✓ signed' : 'unsigned'}`);
    if (r.feedback) doc.font('Helvetica').fontSize(9).text(r.feedback, { width: doc.page.width - 96 });
    doc.moveDown(0.4);
  }

  // 8. Moderator findings
  if (doc.y > doc.page.height - 180) doc.addPage();
  sectionTitle(doc, 'Moderator Findings');
  if (!moderatorDecisions.length) doc.font('Helvetica').fontSize(10).text('No moderation findings yet.');
  for (const r of moderatorDecisions) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).text(`${r.created_at} • ${r.decision.toUpperCase().replace(/_/g, ' ')}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`Moderator: ${r.signoff_name || '—'} (${r.signoff_role || '—'}) ${r.signed_off ? '✓ signed' : 'unsigned'}`);
    if (r.findings) doc.font('Helvetica').fontSize(9).text(r.findings, { width: doc.page.width - 96 });
    doc.moveDown(0.4);
  }

  // 9. Workplace supervisor sign-offs
  if (doc.y > doc.page.height - 180) doc.addPage();
  sectionTitle(doc, 'Workplace Supervisor Sign-Offs');
  if (!supervisorSigns.length) doc.font('Helvetica').fontSize(10).text('No supervisor sign-offs yet.');
  for (const r of supervisorSigns) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).text(`${r.created_at} • ${r.work_activity_code || 'Workplace activity'}`);
    doc.font('Helvetica').fontSize(9).text(r.feedback || '', { width: doc.page.width - 96 });
    doc.font('Helvetica').fontSize(9).text(r.signed_off ? '✓ Signed off' : 'Unsigned');
    doc.moveDown(0.4);
  }

  // 10. Evidence index
  if (doc.y > doc.page.height - 180) doc.addPage();
  sectionTitle(doc, 'Evidence Index');
  if (!evidenceIndex.length) doc.font('Helvetica').fontSize(10).text('No uploaded evidence files.');
  for (const f of evidenceIndex) {
    if (doc.y > doc.page.height - 50) doc.addPage();
    doc.font('Helvetica').fontSize(9).text(`• ${f.original_name} (${(f.size_bytes/1024).toFixed(1)} KB, ${f.mime_type}) — ${f.uploaded_at}`);
  }

  // 11. Audit summary
  if (doc.y > doc.page.height - 180) doc.addPage();
  sectionTitle(doc, 'Audit Summary');
  const auditRows = db.prepare('SELECT * FROM audit_logs WHERE related_learner = ? ORDER BY created_at DESC LIMIT 60').all(user.id);
  if (!auditRows.length) doc.font('Helvetica').fontSize(10).text('No audit history.');
  for (const a of auditRows) {
    if (doc.y > doc.page.height - 40) doc.addPage();
    doc.font('Helvetica').fontSize(8).text(`${a.created_at} • ${a.action} • ${a.role || '—'}${a.new_status ? ' → ' + a.new_status : ''}`);
  }

  // 12. Final sign-off
  doc.addPage();
  doc.fillColor(COL.primary).font('Helvetica-Bold').fontSize(20).text('Final Sign-Off', 48, 100);
  doc.moveTo(48, 130).lineTo(doc.page.width - 48, 130).strokeColor(COL.gold).stroke();
  doc.moveDown(2);
  ['Facilitator', 'Assessor', 'Moderator', 'Workplace Supervisor', 'Learner'].forEach(r => {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COL.ink).text(r);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text('Name: ____________________________   Signature: __________________________   Date: ___________');
    doc.moveDown(0.7);
  });

  footer(doc);
  audit({ user_id: req.user.id, role: req.user.role, action: 'pdf_exported', related_learner: user.id, ip: req.ip, comment: 'poe-pack-official' });
  db.prepare('INSERT INTO pdf_exports (id,user_id,exported_by,kind) VALUES (?,?,?,?)').run(uid(), user.id, req.user.id, 'poe_pack');
  saveAndRespond(doc, res, `poe-pack-${user.full_name.replace(/\s+/g,'_')}.pdf`);
});

// ===== WORKBOOK =====
router.get('/workbook/:userId', requireCap('pdf.*'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const answers = db.prepare(`
    SELECT wa.*, wq.prompt, wq.code, wq.helper, m.title AS module_title, m.code AS module_code, m.type AS module_type
    FROM workbook_answers wa
    JOIN workbook_questions wq ON wa.question_id = wq.id
    LEFT JOIN modules m ON wq.module_id = m.id
    WHERE wa.user_id = ? ORDER BY m.order_index, wq.order_index
  `).all(user.id);
  const doc = newDoc(`Workbook — ${user.full_name}`);
  header(doc, 'Learner Workbook Responses', `${user.full_name} • ${user.email} • ${CURRICULUM_CODE} ${CURRICULUM_TITLE}`);
  if (!answers.length) doc.font('Helvetica').fontSize(11).text('No workbook responses yet.');
  for (const a of answers) {
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(`${a.module_code || ''} (${a.module_type || ''}) — ${a.prompt.slice(0, 80)}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`Status: ${a.status} • Attempt ${a.attempt} • Updated: ${a.updated_at}`);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(COL.ink).text(a.answer_text || '(no response)', { width: doc.page.width - 96 });
    if (a.facilitator_feedback) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COL.gold).text('Facilitator: ' + a.facilitator_feedback, { width: doc.page.width - 96 });
    }
    doc.moveDown(0.6);
  }
  footer(doc);
  audit({ user_id: req.user.id, role: req.user.role, action: 'pdf_exported', related_learner: user.id, ip: req.ip, comment: 'workbook' });
  db.prepare('INSERT INTO pdf_exports (id,user_id,exported_by,kind) VALUES (?,?,?,?)').run(uid(), user.id, req.user.id, 'workbook');
  saveAndRespond(doc, res, `workbook-${user.full_name.replace(/\s+/g,'_')}.pdf`);
});

// ===== ASSESSMENT REPORT =====
router.get('/assessment/:userId', requireCap('pdf.*'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const reviews = db.prepare(`SELECT ar.*, pi.title AS item_title, pi.code AS item_code, pi.eisa_focus_area
    FROM assessor_reviews ar LEFT JOIN poe_submissions ps ON ar.context_id = ps.id
    LEFT JOIN poe_items pi ON ps.item_id = pi.id
    WHERE ar.user_id = ? ORDER BY ar.created_at DESC`).all(user.id);
  const doc = newDoc(`Assessment Report — ${user.full_name}`);
  header(doc, 'Assessor Report', `${user.full_name} • ${CURRICULUM_CODE} ${CURRICULUM_TITLE}`);
  fieldRow(doc, 'Learner', user.full_name);
  fieldRow(doc, 'Email', user.email);
  fieldRow(doc, 'Status', user.status);
  if (!reviews.length) doc.font('Helvetica').fontSize(11).text('No assessments recorded.');
  for (const r of reviews) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(`${r.item_code || ''} — ${r.item_title || ''}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`${r.created_at} • ${r.decision.toUpperCase().replace(/_/g, ' ')}${r.eisa_focus_area ? ' • EISA Focus Area ' + r.eisa_focus_area : ''}`);
    doc.font('Helvetica').fontSize(9).text(`Assessor: ${r.signoff_name} (${r.signoff_role}) ${r.signed_off ? '✓ Signed' : 'Unsigned'}`);
    if (r.feedback) doc.font('Helvetica').fontSize(9).text(r.feedback, { width: doc.page.width - 96 });
    doc.moveDown(0.5);
  }
  footer(doc);
  audit({ user_id: req.user.id, role: req.user.role, action: 'pdf_exported', related_learner: user.id, ip: req.ip, comment: 'assessment' });
  db.prepare('INSERT INTO pdf_exports (id,user_id,exported_by,kind) VALUES (?,?,?,?)').run(uid(), user.id, req.user.id, 'assessment_report');
  saveAndRespond(doc, res, `assessment-${user.full_name.replace(/\s+/g,'_')}.pdf`);
});

// ===== MODERATION REPORT =====
router.get('/moderation/:userId', requireCap('pdf.*'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const reviews = db.prepare(`SELECT mr.*, pi.title AS item_title, pi.code AS item_code, pi.eisa_focus_area
    FROM moderator_reviews mr LEFT JOIN poe_submissions ps ON ps.user_id = mr.user_id
    LEFT JOIN poe_items pi ON ps.item_id = pi.id
    WHERE mr.user_id = ? ORDER BY mr.created_at DESC`).all(user.id);
  const doc = newDoc(`Moderation Report — ${user.full_name}`);
  header(doc, 'Moderation Report', `${user.full_name} • ${CURRICULUM_CODE} ${CURRICULUM_TITLE}`);
  fieldRow(doc, 'Learner', user.full_name);
  if (!reviews.length) doc.font('Helvetica').fontSize(11).text('No moderation recorded.');
  for (const r of reviews) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(`${r.item_code || ''} — ${r.item_title || ''}`);
    doc.font('Helvetica').fontSize(9).fillColor('#5C6E63').text(`${r.created_at} • ${r.decision.toUpperCase().replace(/_/g, ' ')}`);
    doc.font('Helvetica').fontSize(9).text(`Moderator: ${r.signoff_name} (${r.signoff_role}) ${r.signed_off ? '✓ Signed' : 'Unsigned'}`);
    if (r.findings) doc.font('Helvetica').fontSize(9).text(r.findings, { width: doc.page.width - 96 });
    doc.moveDown(0.5);
  }
  footer(doc);
  audit({ user_id: req.user.id, role: req.user.role, action: 'pdf_exported', related_learner: user.id, ip: req.ip, comment: 'moderation' });
  db.prepare('INSERT INTO pdf_exports (id,user_id,exported_by,kind) VALUES (?,?,?,?)').run(uid(), user.id, req.user.id, 'moderation_report');
  saveAndRespond(doc, res, `moderation-${user.full_name.replace(/\s+/g,'_')}.pdf`);
});

// ===== EVIDENCE INDEX =====
router.get('/evidence-index/:userId', requireCap('pdf.*'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const files = db.prepare('SELECT * FROM poe_files WHERE user_id = ? ORDER BY uploaded_at DESC').all(user.id);
  const doc = newDoc(`Evidence Index — ${user.full_name}`);
  header(doc, 'Evidence Index', user.full_name);
  if (!files.length) doc.font('Helvetica').fontSize(11).text('No evidence uploaded.');
  for (const f of files) {
    if (doc.y > doc.page.height - 50) doc.addPage();
    doc.font('Helvetica').fontSize(10).text(`• ${f.original_name}`);
    doc.font('Helvetica').fontSize(8).fillColor('#5C6E63').text(`  ${(f.size_bytes/1024).toFixed(1)} KB • ${f.mime_type} • ${f.uploaded_at}`);
    doc.moveDown(0.3);
  }
  footer(doc);
  audit({ user_id: req.user.id, role: req.user.role, action: 'pdf_exported', related_learner: user.id, ip: req.ip, comment: 'evidence-index' });
  db.prepare('INSERT INTO pdf_exports (id,user_id,exported_by,kind) VALUES (?,?,?,?)').run(uid(), user.id, req.user.id, 'evidence_index');
  saveAndRespond(doc, res, `evidence-index-${user.full_name.replace(/\s+/g,'_')}.pdf`);
});

// ===== MISSING EVIDENCE REPORT =====
router.get('/missing-evidence', requireCap('pdf.*'), (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.cohort_id,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status IN ('draft','not_started')) AS drafts,
      (SELECT COUNT(*) FROM poe_submissions ps WHERE ps.user_id = u.id AND ps.status IN ('needs_correction','resubmitted')) AS needs_correction,
      (SELECT COUNT(*) FROM poe_items pi WHERE pi.id NOT IN (SELECT item_id FROM poe_submissions WHERE user_id = u.id)) AS missing_items
    FROM users u WHERE u.role='learner' ORDER BY u.full_name
  `).all();
  const doc = newDoc('Missing Evidence Report');
  header(doc, 'Missing Evidence Report', `${CURRICULUM_CODE} ${CURRICULUM_TITLE} • Generated ${new Date().toLocaleString('en-ZA')}`);
  doc.font('Helvetica-Bold').fontSize(10);
  ['Learner','Cohort','Drafts','Needs Correction','Not Submitted'].forEach((h,i)=>{
    const xs = [48, 220, 360, 440, 530];
    doc.text(h, xs[i], doc.y, { width: 140 });
  });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9);
  for (const r of rows) {
    if (doc.y > doc.page.height - 60) doc.addPage();
    const xs = [48, 220, 360, 440, 530];
    doc.text(r.full_name, xs[0], doc.y, { width: 170 });
    doc.text(r.cohort_id || '—', xs[1], doc.y, { width: 140 });
    doc.text(String(r.drafts), xs[2], doc.y);
    doc.text(String(r.needs_correction), xs[3], doc.y);
    doc.text(String(r.missing_items), xs[4], doc.y);
    doc.moveDown(0.3);
  }
  footer(doc);
  audit({ user_id: _req.user.id, role: _req.user.role, action: 'pdf_exported', comment: 'missing-evidence', ip: _req.ip });
  saveAndRespond(doc, res, 'missing-evidence.pdf');
});

// ===== LEARNER PROGRESS =====
router.get('/progress/:userId', requireCap('pdf.*'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const lessons = db.prepare(`SELECT COUNT(*) AS c FROM lesson_progress WHERE user_id = ? AND status='completed'`).get(user.id).c;
  const wb = db.prepare(`SELECT COUNT(*) AS c FROM workbook_answers WHERE user_id = ? AND status='submitted'`).get(user.id).c;
  const comp = db.prepare(`SELECT COUNT(*) AS c FROM poe_submissions WHERE user_id = ? AND status='competent'`).get(user.id).c;
  const final = db.prepare(`SELECT COUNT(*) AS c FROM poe_submissions WHERE user_id = ? AND status='final_approved'`).get(user.id).c;
  const doc = newDoc(`Progress — ${user.full_name}`);
  header(doc, 'Learner Progress Report', `${user.full_name} • ${CURRICULUM_CODE} ${CURRICULUM_TITLE}`);
  fieldRow(doc, 'Lessons completed', String(lessons));
  fieldRow(doc, 'Workbook activities submitted', String(wb));
  fieldRow(doc, 'POE items competent', String(comp));
  fieldRow(doc, 'POE items final approved', String(final));
  fieldRow(doc, 'Status', user.status);
  footer(doc);
  audit({ user_id: req.user.id, role: req.user.role, action: 'pdf_exported', related_learner: user.id, ip: req.ip, comment: 'progress' });
  saveAndRespond(doc, res, `progress-${user.full_name.replace(/\s+/g,'_')}.pdf`);
});

module.exports = router;
