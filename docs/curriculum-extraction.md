# Curriculum extraction & ingestion

The platform is built to support **any** QCTO qualification, not only the Office Administrator (334102002) which is pre-seeded.

## Source of truth: official curriculum documents

The platform's "curriculum" is whatever you upload. The system treats each curriculum document as a structured artifact and extracts a normalised element tree.

### Lifecycle of a curriculum document

```
[Admin uploads PDF] → [extraction_status=processing] → [extracted]
                                                      ↓
                                          [upload_status=extracted]
                                                      ↓
                                       [Admin reviews / edits]
                                                      ↓
                                          [needs_review → reviewed]
                                                      ↓
                                            [approved → published]
                                                      ↓
                                          [Learners see it in pathway]
```

Document kinds recognised:

| kind | purpose |
|---|---|
| `curriculum` | The official QCTO curriculum document (defines structure) |
| `learner_guide` | Learner guide (teaching content) |
| `workbook` | Learner workbook |
| `assessment_guide` | Internal assessment guide |
| `poe_guide` | POE guide |
| `facilitator_guide` | Facilitator guide |
| `moderator_guide` | Moderator guide |
| `workplace_logbook` | Workplace logbook |
| `supporting_reference` | Other reference material (e.g. image-only PDFs) |

## What the ingestion pipeline does today (MVP)

The MVP ingestion is a **two-stage** process:

### Stage 1 — automated extraction (when a PDF is uploaded)

1. `pdftotext -layout` extracts the text and stores it on the curriculum_documents row (`extracted_text`).
2. The status is set to `extracted`.
3. A future automated parser can run heuristics to identify:
   - Section headers (e.g. "SECTION 3A: KNOWLEDGE MODULE SPECIFICATIONS")
   - Module codes and titles (`334102002-KM-01, Effective office administration and management, NQF Level 5, Credits 10`)
   - Topics (KT codes), activities (PA / WA codes), supporting evidence (SE codes)
   - Internal Assessment Criteria (IAC codes)
4. Extracted items are saved as **draft curriculum elements** with `status='extracted'`.
5. The third (image-only) PDF in the seed was saved as a `supporting_reference` with `extraction_status='failed'` — OCR is not yet implemented; the row is kept as a placeholder for future re-processing.

### Stage 2 — admin review (manual but supported)

- Admin opens **Curriculum Mapping** → reviews each module, topic, IAC.
- Admin can **edit / correct** any element via the API (`PATCH /api/curriculum/elements/:id`).
- Admin clicks **Mark for review** → **Approve** → **Publish**.
- Modules flow from `extracted` → `needs_review` → `reviewed` → `approved` → `published`.

## Pre-seeded extraction for 334102002

The Office Administrator curriculum is **pre-seeded** with:

- 6 official sections (SEC-1 to SEC-4, 3A, 3B, 3C)
- 15 Knowledge Modules (KM-01..KM-15)
- 11 Practical Skill Modules (PM-01..PM-11)
- 10 Work Experience Modules (WM-01..WM-10)
- 53 official topics (KTs)
- 145 topic elements
- **206 official Internal Assessment Criteria (IACs)** — all mapped to their parent topics
- 25 practical skill items
- 76 practical activities
- 23 work experience items
- 87 work activities
- **63 official Supporting Evidence items (SEs)**
- 7 EISA focus areas
- 7 occupational tasks

This means the platform works **immediately** for the 334102002 pathway. When the official learner guide and workbook are uploaded later, the corresponding fields are filled in and the `content_status` of the relevant lessons moves from `draft_support` to `reviewed` / `final`.

## Future: full automated parser

The platform is ready for a richer parser. To enable it:

1. Add a worker that runs after upload and inserts `curriculum_elements` rows with `status='extracted'`.
2. Use the existing tables:
   - `curriculum_sections` (top-level section)
   - `curriculum_elements` (KM, PM, WM, KT, IAC, PA, WA, SE)
   - `curriculum_mappings` (IAC ↔ topic, IAC ↔ activity, etc.)
   - `poe_mappings`, `lesson_mappings`, `assessment_mappings`, `moderation_mappings` (downstream)
3. The admin review UI is already in place — once the parser populates drafts, admin approves them.

## Multi-qualification support

The schema is intentionally generic:

- `curriculum_documents` accepts any qualification code, title, source, version.
- `curriculum_elements.type` is a free string with a controlled vocabulary — you can add new types without schema changes (e.g. `part_qualification`, `phase`).
- `courses` is independent of the curriculum document — a single curriculum document can drive multiple cohorts/courses.

To add another qualification, e.g. **Bookkeeper (SAQA ID 993101)**:

1. Admin uploads the official QCTO curriculum PDF via the course builder.
2. The ingestion pipeline creates a new `curriculum_documents` row.
3. Admin creates a new `courses` row pointing to that document.
4. The pathway, modules, POE, assessor and moderator views all work the same way.

## How to add another QCTO qualification later

```bash
# 1. Upload the curriculum PDF (admin UI: Course Builder → Upload curriculum document)
# 2. The system extracts text; admin reviews and publishes
# 3. Create a new course pointing to the document via /api/courses
# 4. Add modules / lessons via /api/modules and /api/lessons
# 5. Build the POE template via /api/poe/templates
# 6. Assign the course to a cohort
```

The platform is **qualification-agnostic** by design.
