-- NIBS Pathway Portal — SQLite schema (v2)
-- Source of truth: QCTO Curriculum Document 334102002 (Office Administrator) + External Assessment Specifications
-- All IDs are TEXT (uuid-ish) for portability; FKs are explicit.
-- Designed for clean migration to PostgreSQL.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ===== USERS / ROLES =====
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  id_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  payment_status TEXT NOT NULL DEFAULT 'pending_payment',
  cohort_id TEXT,
  employer_id TEXT,
  avatar_color TEXT,
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  course_id TEXT,
  facilitator_id TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== CURRICULUM (source of truth from uploaded documents) =====
-- Lifecycle: extracted -> needs_review -> reviewed -> approved -> published | archived
CREATE TABLE IF NOT EXISTS curriculum_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version TEXT,
  source TEXT,                       -- e.g. "QCTO 334102002 v1"
  document_kind TEXT NOT NULL DEFAULT 'curriculum', -- curriculum | learner_guide | workbook | assessment_guide | poe_guide | facilitator_guide | moderator_guide | workplace_logbook | supporting_reference
  file_path TEXT,
  original_filename TEXT,
  extracted_text TEXT,               -- raw extracted text for parser
  extraction_status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | extracted | failed
  upload_status TEXT NOT NULL DEFAULT 'extracted', -- extracted | needs_review | reviewed | approved | published | archived
  uploaded_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A high-level "section" of a curriculum document (e.g. SECTION 1 CURRICULUM SUMMARY)
CREATE TABLE IF NOT EXISTS curriculum_sections (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  code TEXT,                         -- e.g. "SEC-1", "SEC-2", "SEC-3A", "SEC-3B", "SEC-3C", "SEC-4"
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0
);

-- Curriculum elements: KM, PM, WM, KTs, PAs, WAs, IACs, SEs, etc.
-- Hierarchical: a KT can be parented to a KM; a PA to a PM; a WA to a WM.
-- Lifecycle mirrors curriculum_documents.upload_status.
CREATE TABLE IF NOT EXISTS curriculum_elements (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  parent_id TEXT,                    -- hierarchical parent (KM -> KT -> IAC, PM -> PA -> IAC, WM -> WE -> WA/SE)
  section_id TEXT,                   -- top-level section this element belongs to
  type TEXT NOT NULL,                -- knowledge_module | practical_skill_module | work_experience_module
                                       -- topic | topic_element | practical_activity
                                       -- work_experience_item | work_activity | supporting_evidence
                                       -- internal_assessment_criterion
                                       -- occupational_task | eisa_focus_area
                                       -- occupational_purpose | entry_requirement
                                       -- contextualised_workplace_knowledge
  code TEXT,                         -- official code: KM-01, PM-01, WM-01, KT01, PA0101, WA0101, SE0101, IAC0101
  title TEXT NOT NULL,
  description TEXT,                  -- short description / scope
  body TEXT,                         -- long body (topic details, IAC text, etc.)
  nqf_level INTEGER,
  credits INTEGER,
  weight_percent INTEGER,            -- topic weight or IAC weight if applicable
  linked_modules TEXT,               -- JSON array of curriculum_element ids (for cross-linking)
  eisa_focus_area INTEGER,           -- 1..7 if linked to EISA focus area
  order_index INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'extracted', -- extracted | needs_review | reviewed | approved | published | archived
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_curriculum_doc ON curriculum_elements(document_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_parent ON curriculum_elements(parent_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_type ON curriculum_elements(type);
CREATE INDEX IF NOT EXISTS idx_curriculum_code ON curriculum_elements(code);
CREATE INDEX IF NOT EXISTS idx_curriculum_status ON curriculum_elements(status);

-- Cross-curriculum mappings: link IAC to topic, IAC to practical activity, etc.
CREATE TABLE IF NOT EXISTS curriculum_mappings (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  from_element_id TEXT NOT NULL,     -- e.g. IAC element
  to_element_id TEXT NOT NULL,       -- e.g. Topic or PA
  relation TEXT NOT NULL,            -- 'iac_of_topic' | 'iac_of_pa' | 'iac_of_we' | 'pa_of_pm' | 'kt_of_km' | 'wa_of_wm' | 'se_of_we' | 'linked_to'
  weight_percent INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cm_from ON curriculum_mappings(from_element_id);
CREATE INDEX IF NOT EXISTS idx_cm_to ON curriculum_mappings(to_element_id);

-- ===== COURSES / MODULES / LESSONS / RESOURCES =====
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  qualification_type TEXT,
  saqa_id TEXT,
  nqf_level INTEGER,
  total_credits INTEGER,
  curriculum_document_id TEXT,
  cover_color TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  curriculum_element_id TEXT,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  nqf_level INTEGER,
  credits INTEGER,
  order_index INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  curriculum_element_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  video_url TEXT,
  image_url TEXT,
  duration_minutes INTEGER DEFAULT 15,
  key_terms TEXT,
  sa_scenario TEXT,
  workbook_activity_id TEXT,
  practical_task_id TEXT,
  poe_item_id TEXT,
  order_index INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  content_status TEXT NOT NULL DEFAULT 'placeholder', -- placeholder | draft_support | reviewed | final
  content_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lessons_curr ON lessons(curriculum_element_id);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  lesson_id TEXT,
  module_id TEXT,
  title TEXT NOT NULL,
  kind TEXT,
  file_path TEXT,
  url TEXT,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lesson <-> curriculum element mapping (which IACs does this lesson cover?)
CREATE TABLE IF NOT EXISTS lesson_mappings (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  curriculum_element_id TEXT NOT NULL, -- KM, PM, WM, KT, PA, WA, IAC, etc.
  mapping_kind TEXT NOT NULL,         -- 'covers' | 'introduces' | 'practices' | 'assesses'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lm_lesson ON lesson_mappings(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lm_curr ON lesson_mappings(curriculum_element_id);

-- ===== ENROLMENT & PROGRESS =====
CREATE TABLE IF NOT EXISTS enrolments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  cohort_id TEXT,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  last_position INTEGER DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Module-level readiness: per module, per learner — which official modules are ready/mapped/etc.
CREATE TABLE IF NOT EXISTS module_readiness (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  lessons_completed INTEGER DEFAULT 0,
  lessons_total INTEGER DEFAULT 0,
  workbook_answered INTEGER DEFAULT 0,
  workbook_total INTEGER DEFAULT 0,
  poe_items_done INTEGER DEFAULT 0,
  poe_items_total INTEGER DEFAULT 0,
  poe_items_competent INTEGER DEFAULT 0,
  we_evidence_done INTEGER DEFAULT 0,
  we_evidence_total INTEGER DEFAULT 0,
  ready_for_assessment INTEGER DEFAULT 0, -- 0/1
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mr_user ON module_readiness(user_id);

-- ===== WORKBOOK =====
CREATE TABLE IF NOT EXISTS workbook_questions (
  id TEXT PRIMARY KEY,
  module_id TEXT,
  lesson_id TEXT,
  curriculum_element_id TEXT,
  code TEXT,
  prompt TEXT NOT NULL,
  helper TEXT,
  answer_type TEXT NOT NULL DEFAULT 'long_text',
  is_required INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workbook_answers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  attempt INTEGER NOT NULL DEFAULT 1,
  facilitator_feedback TEXT,
  facilitator_id TEXT,
  assessor_decision TEXT,
  assessor_id TEXT,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workbook_versions (
  id TEXT PRIMARY KEY,
  answer_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  answer_text TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  comment TEXT
);

-- ===== POE — restructured around Work Experience Modules =====
CREATE TABLE IF NOT EXISTS poe_templates (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  curriculum_document_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A POE section groups evidence by official Work Experience Module (WM-01 .. WM-10)
CREATE TABLE IF NOT EXISTS poe_sections (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  curriculum_element_id TEXT,         -- links to official WM element
  code TEXT,                          -- e.g. WM-01, WM-02
  title TEXT NOT NULL,                -- official module title
  description TEXT,
  linked_eisa_focus_areas TEXT,       -- JSON array
  linked_kms TEXT,                    -- JSON array of KM element ids
  linked_pms TEXT,                    -- JSON array of PM element ids
  order_index INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poesection_curr ON poe_sections(curriculum_element_id);

-- An evidence group is a logical bucket of evidence under a WM section
-- e.g. for WM-01: "WE01 Day-to-day admin", "WE02 Meetings", "WE03 Information processing"
CREATE TABLE IF NOT EXISTS poe_evidence_groups (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  curriculum_element_id TEXT,         -- links to a work_experience_item element
  code TEXT,                          -- e.g. "WE01", "WE02"
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0
);

-- A POE item = a specific supporting evidence requirement (an SE, or a single WA to record)
CREATE TABLE IF NOT EXISTS poe_items (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  evidence_group_id TEXT,
  curriculum_element_id TEXT,         -- links to the official SE / WA / IAC element
  code TEXT,                          -- e.g. SE0101, WA0101, IAC0101
  title TEXT NOT NULL,
  instructions TEXT,
  why_required TEXT,
  how_to_prepare TEXT,
  common_mistakes TEXT,
  linked_outcome TEXT,
  linked_modules TEXT,                -- JSON: which KMs/PMs/WMs this evidence proves
  linked_iacs TEXT,                   -- JSON: which IACs this evidence addresses
  eisa_focus_area INTEGER,
  assessment_criteria TEXT,
  assessor_checklist TEXT,            -- text checklist for assessor
  moderator_checklist TEXT,           -- text checklist for moderator
  evidence_kind TEXT NOT NULL DEFAULT 'supporting_evidence', -- supporting_evidence | work_activity | iac | declaration
  requires_supervisor_signoff INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poi_section ON poe_items(section_id);
CREATE INDEX IF NOT EXISTS idx_poi_group ON poe_items(evidence_group_id);

CREATE TABLE IF NOT EXISTS poe_fields (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  field_type TEXT NOT NULL,
  label TEXT NOT NULL,
  helper TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  options_json TEXT,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poe_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  data_json TEXT,
  declaration_signed INTEGER NOT NULL DEFAULT 0,
  supervisor_signed INTEGER NOT NULL DEFAULT 0,
  supervisor_id TEXT,
  supervisor_feedback TEXT,
  supervisor_signed_at TEXT,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_poes_user ON poe_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_poes_item ON poe_submissions(item_id);

CREATE TABLE IF NOT EXISTS poe_submission_versions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data_json TEXT,
  comment TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poe_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  user_id TEXT NOT NULL,
  item_id TEXT,
  field_id TEXT,
  original_name TEXT,
  stored_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- POE mapping: which POE item covers which curriculum element (KM/PM/WM/KT/PA/WA/IAC)
CREATE TABLE IF NOT EXISTS poe_mappings (
  id TEXT PRIMARY KEY,
  poe_item_id TEXT NOT NULL,
  curriculum_element_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'covers',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_item ON poe_mappings(poe_item_id);
CREATE INDEX IF NOT EXISTS idx_pm_curr ON poe_mappings(curriculum_element_id);

-- Assessor checklist (per POE item, curated from official IACs)
CREATE TABLE IF NOT EXISTS assessment_mappings (
  id TEXT PRIMARY KEY,
  poe_item_id TEXT NOT NULL,
  curriculum_element_id TEXT NOT NULL, -- IAC
  checklist_item TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_am_item ON assessment_mappings(poe_item_id);

-- Moderator checklist
CREATE TABLE IF NOT EXISTS moderation_mappings (
  id TEXT PRIMARY KEY,
  poe_item_id TEXT NOT NULL,
  curriculum_element_id TEXT NOT NULL,
  checklist_item TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);

-- ===== FEEDBACK / ASSESSOR / MODERATOR =====
CREATE TABLE IF NOT EXISTS facilitator_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  facilitator_id TEXT NOT NULL,
  context_type TEXT NOT NULL,
  context_id TEXT NOT NULL,
  feedback TEXT NOT NULL,
  return_for_correction INTEGER NOT NULL DEFAULT 0,
  recommend_for_assessment INTEGER NOT NULL DEFAULT 0,
  flag_at_risk INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessor_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  assessor_id TEXT NOT NULL,
  context_type TEXT NOT NULL,
  context_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  feedback TEXT,
  criteria_json TEXT,
  signoff_name TEXT,
  signoff_role TEXT,
  signed_off INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moderator_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  assessor_review_id TEXT,
  decision TEXT NOT NULL,
  findings TEXT,
  signoff_name TEXT,
  signoff_role TEXT,
  signed_off INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supervisor_signoffs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  supervisor_id TEXT NOT NULL,
  poe_item_id TEXT,                   -- which POE item is being signed off
  work_activity_code TEXT,
  feedback TEXT,
  signed_off INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ss_user ON supervisor_signoffs(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_poe ON supervisor_signoffs(poe_item_id);

-- ===== PAYMENTS / PDF / AUDIT =====
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'ZAR',
  method TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pdf_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exported_by TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  comment TEXT,
  related_learner TEXT,
  related_module TEXT,
  related_poe_item TEXT,
  related_curriculum_element TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cohort_id TEXT,
  session_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS class_notes (
  id TEXT PRIMARY KEY,
  cohort_id TEXT,
  facilitator_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  attachment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== ENRICHED LEARNER CONTENT (AI-generated, requires review) =====
-- One row per curriculum element (topic, practical_skill_item, work_experience_item).
-- Stores the blocks the lesson page renders: why_it_matters, plain_english,
-- sa_example, scenario, step_by_step, common_mistakes, learn_by_doing,
-- workbook_questions (JSON), quiz (JSON), poe_link, assessor_checklist,
-- moderator_checklist, references (JSON), review_status.

CREATE TABLE IF NOT EXISTS topic_content (
  id TEXT PRIMARY KEY,
  curriculum_element_id TEXT NOT NULL UNIQUE,   -- 1:1 with a topic / item
  -- blocks
  why_it_matters TEXT,
  plain_english TEXT,
  sa_example TEXT,
  scenario TEXT,
  step_by_step TEXT,
  common_mistakes TEXT,
  learn_by_doing TEXT,                          -- markdown / html
  workbook_questions_json TEXT,                  -- JSON array of {prompt, helper}
  quiz_json TEXT,                                -- JSON array of {q, options:[..], answer}
  poe_link TEXT,                                 -- which POE item(s) this contributes to
  assessor_checklist TEXT,
  moderator_checklist TEXT,
  references_json TEXT,                          -- JSON array of refs
  up_to_date_note TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft_ai',  -- draft_ai | needs_sme_review | reviewed | approved | published | archived
  reviewed_by TEXT,
  reviewed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_topic_content_status ON topic_content(review_status);
