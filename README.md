# NIBS Pathway Portal — Office Administrator (QCTO 334102002)

A premium, QCTO-aligned learning, POE and assessment platform for the
**Occupational Certificate: Office Administrator** (NQF Level 5, 445 credits, SAQA-aligned, code 334102002).

> **The official QCTO Office Administrator curriculum (code 334102002) is the source of truth** and is pre-seeded:
> 15 Knowledge Modules, 11 Practical Skill Modules, 10 Work Experience Modules (445 credits, NQF 5).
> All official topics (KTs), Internal Assessment Criteria (IACs), Work Activities (WAs) and Supporting Evidence (SEs) are loaded.
> The POE is organised around the 10 Work Experience Modules and their official WAs/SEs.
> Draft learner content is clearly labelled until the official learner guide, workbook, facilitator guide and assessment guide are uploaded.

This build delivers (with **official QCTO 334102002** as source of truth):

- **Curriculum documents** ingested from the official PDF — extract → review → publish workflow
- **Curriculum mapping matrix** with 36 official modules, 53 topics, 206 IACs, 87 WAs, 63 SEs
- **All EISA focus areas** wired to the corresponding Work Experience Modules



- Public landing page (`/`)
- Role-based portals for: Super Admin, Admin, Course Manager, Learner, Facilitator,
  Assessor, Moderator, Finance, Workplace Supervisor
- Netflix-style learner dashboard with **Continue where you left off**, **Due soon**,
  **Needs correction**, **Missing POE**, **Submitted for review**, **Recommended next**,
  **Assessment readiness**, **Completed recently**
- Online **workbook** with save / submit / resubmit / version history
- Online **POE editor** with declarations, file uploads, supervisor sign-off and PDF export
- **Curriculum mapping** matrix (Knowledge / Practical Skill / Work Experience modules)
- **Course builder** for modules, lessons, POE templates, curriculum elements
- **Facilitator** cohort management, attendance, class notes, feedback, return-for-correction
- **Assessor** three-column review screen with decision, criteria, sign-off
- **Moderator** review with sampling, findings, sign-off
- **Workplace supervisor** sign-off workflow
- **Finance** dashboard with payment status, activate/suspend, payment log
- **PDF export** for POE pack, workbook, assessment, moderation, evidence index,
  missing evidence, learner progress
- **Audit trail** for every meaningful action
- **PWA manifest + service worker** for offline support
- **POCO/POPIA-aware** access control and audit
- **Docker-ready**, **Nginx Proxy Manager** friendly, **SQLite** (PostgreSQL-ready)

---

## Quick start (local)

```bash
git clone <this-repo>
cd nibs-portal
cp .env.example .env          # edit values
npm install
npm run init                  # creates DB + seeds demo data
npm start                     # http://localhost:8080
```

Open <http://localhost:8080>.

### Demo accounts (created by seed)

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@naleli.co.za | ChangeMe123! |
| Admin | admin@naleli.co.za | ChangeMe123! |
| Course Manager | coursemanager@naleli.co.za | ChangeMe123! |
| Learner (active) | student@naleli.co.za | Student123! |
| Learner (active) | learner2@naleli.co.za | Student123! |
| Learner (pending payment) | pending@naleli.co.za | Student123! |
| Facilitator | facilitator@naleli.co.za | ChangeMe123! |
| Assessor | assessor@naleli.co.za | ChangeMe123! |
| Moderator | moderator@naleli.co.za | ChangeMe123! |
| Finance | finance@naleli.co.za | ChangeMe123! |
| Workplace Supervisor | supervisor@naleli.co.za | ChangeMe123! |

> Change every default password before going to production.

---

## Deploying to `office.naleli.co.za` on an Ubuntu VPS

### 1. Provision the VPS

Ubuntu 22.04 LTS, 2 vCPU / 4 GB RAM is a comfortable starting point. Open ports 22, 80, 443.

### 2. Install Docker + Compose

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### 3. Clone and configure

```bash
cd /opt
sudo git clone <your-git-url> nibs-portal
cd nibs-portal
sudo cp .env.example .env
sudo nano .env      # set JWT_SECRET, COOKIE_SECRET, PROVIDER_*, etc.
```

### 4. Build + run

```bash
sudo docker compose build
sudo docker compose up -d
sudo docker compose logs -f nibs   # ctrl-c to exit
```

Confirm health:

```bash
curl http://localhost:8080/healthz
```

### 5. Point DNS

In your DNS provider, add an A record:

```
office.naleli.co.za  A  <VPS_PUBLIC_IP>
```

### 6. Set up Nginx Proxy Manager (recommended)

If you use **Nginx Proxy Manager** (NPM) — most common in production — do this:

1. Add a new **Proxy Host** in NPM:
   - **Domain**: `office.naleli.co.za`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `127.0.0.1` (or the Docker container IP)
   - **Forward Port**: `8080`
   - **Cache assets**: off
   - **Block common exploits**: on
   - **Websockets support**: on (recommended)
2. On the **SSL** tab, request a Let's Encrypt certificate.
3. Optional: enable **Force SSL** and **HTTP/2**.

That's it — `https://office.naleli.co.za` is now live.

### 7. Set up Nginx directly (alternative)

If you don't use NPM, the included `nginx/nibs.conf` shows a working configuration.
Copy it to `/etc/nginx/sites-available/nibs.conf`, symlink to `sites-enabled/`, and run
`certbot --nginx -d office.naleli.co.za`.

### 8. Backups

The whole database and uploads live in the `nibs-data` Docker volume. Back it up:

```bash
sudo docker run --rm -v nibs-portal_nibs-data:/data -v $(pwd):/backup alpine tar czf /backup/nibs-data-$(date +%F).tgz -C /data .
```

Restore:

```bash
sudo docker run --rm -v nibs-portal_nibs-data:/data -v $(pwd):/backup alpine sh -c "tar xzf /backup/nibs-data-YYYY-MM-DD.tgz -C /data"
```

### 9. Updates

```bash
cd /opt/nibs-portal
sudo git pull
sudo docker compose build
sudo docker compose up -d
```

### 10. Reset / reseed

```bash
sudo docker compose exec nibs node server/db/init.js
sudo docker compose exec nibs node server/seed/run.js
```

> Resetting wipes the database. Do not run in production.

---

## Architecture

```
nibs-portal/
├─ server/
│  ├─ index.js            # Express app
│  ├─ db/
│  │  ├─ schema.sql       # SQLite schema (PostgreSQL-ready)
│  │  ├─ init.js          # creates DB from schema
│  │  └─ index.js         # singleton
│  ├─ middleware/
│  │  └─ auth.js          # JWT + role-cap matrix + audit
│  ├─ routes/
│  │  ├─ auth.js          # login / apply / me / logout
│  │  ├─ users.js         # admin user mgmt
│  │  ├─ cohorts.js
│  │  ├─ courses.js
│  │  ├─ modules.js
│  │  ├─ lessons.js
│  │  ├─ resources.js
│  │  ├─ curriculum.js    # documents + elements + matrix
│  │  ├─ workbook.js
│  │  ├─ poe.js           # POE editor + uploads + templates
│  │  ├─ facilitator.js
│  │  ├─ assessor.js
│  │  ├─ moderator.js
│  │  ├─ supervisor.js
│  │  ├─ finance.js
│  │  ├─ payments.js      # PayFast / Ozow placeholders
│  │  ├─ reports.js
│  │  ├─ audit.js
│  │  ├─ pdf.js           # PDFKit exports
│  │  ├─ learner.js       # Netflix dashboard data
│  │  └─ pages.js         # HTML shell router
│  ├─ utils/helpers.js
│  └─ seed/run.js         # demo data
├─ public/
│  ├─ index.html          # public landing
│  ├─ css/styles.css
│  ├─ js/app.js, shell.js
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  └─ pages/
│     ├─ login.html, apply.html, logout.html, 404.html
│     ├─ app/             # learner-facing
│     ├─ admin/
│     ├─ facilitator/
│     ├─ assessor/
│     ├─ moderator/
│     ├─ supervisor/
│     └─ finance/
├─ nginx/nibs.conf
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

### Database

SQLite is the default for fast MVP. The schema is designed so a move to PostgreSQL
is mostly a connection-string change. Every table uses TEXT primary keys (UUID),
explicit foreign keys, indexed status columns, and `version` columns where content
is versioned.

### Auth

JWT in an `HttpOnly` cookie. Role-based capabilities (`CAPS`) gate every route.
`requireAuth`, `requireRole`, `requireCap` are wired in `server/middleware/auth.js`.

### Audit

Every meaningful action calls `audit(...)` which writes to `audit_logs` with
old/new status, comment, related learner/POE item, and the user/role.

### POPIA

- Learners only see their own records
- Facilitators only see assigned cohorts
- Assessors only see assigned learners
- Moderators only see assigned moderation records
- Workplace supervisors only see assigned learners
- Finance only sees payment/access data
- All file uploads are private, validated, and linked to a user + POE item

### PWA / Offline

- `manifest.webmanifest` registered
- `sw.js` service worker caches the shell
- Workbook / POE drafts can be saved locally and synced later (future: IndexedDB queue)

### Payments

The platform ships PayFast and Ozow **webhook placeholders** in `routes/payments.js`.
Never ship real merchant keys. Webhooks update `users.status` and `payment_status`.

### PDF

PDFKit powers every export. Each PDF includes the provider header, learner details,
status, audit trail, and final sign-off page.

---

## Testing the platform by role

### Public visitor
- Visit `/` — landing page loads
- Click **Apply** → submit form → login redirect
- Click **Login** → submit demo credentials → role-appropriate home

### Active learner
- Login as `student@naleli.co.za` / `Student123!`
- See Netflix-style dashboard rows
- Open a lesson → save progress → mark complete
- Open the workbook → save a draft → submit
- Open a POE item → fill in fields → upload evidence → submit
- Click **Export POE pack** (admin) to see the full PDF

### Pending-payment learner
- Login as `pending@naleli.co.za` / `Student123!`
- Locked access screen with **"Your access is pending payment confirmation."**
- All learning and POE routes return 402

### Facilitator
- Login as `facilitator@naleli.co.za` / `ChangeMe123!`
- Open the assigned cohort
- Open a learner → add feedback → return for correction / recommend for assessment / flag at risk
- Add attendance and class notes

### Assessor
- Login as `assessor@naleli.co.za` / `ChangeMe123!`
- Open the assessment queue
- Click a submission → three-column review screen
- Add criteria, feedback, sign-off, decision
- Submit decision → submission moves to `competent` or `not_yet_competent`

### Moderator
- Login as `moderator@naleli.co.za` / `ChangeMe123!`
- Open the moderation queue (samples are selected when assessors mark competent)
- Review the assessor's decision → approve or request reassessment

### Admin
- Login as `admin@naleli.co.za` / `ChangeMe123!`
- Create a learner, set status, change role
- Upload a curriculum document → approve → publish
- Add a Knowledge Module / Practical Skill / Work Experience Module
- View curriculum mapping matrix
- Manage POE templates
- View reports and audit trail
- Export a learner's full POE pack

### Workplace Supervisor
- Login as `supervisor@naleli.co.za` / `ChangeMe123!`
- See assigned learners
- Open a learner → add workplace sign-off

### Finance
- Login as `finance@naleli.co.za` / `ChangeMe123!`
- View payment status across all learners
- Mark a learner as paid → their `payment_status` and `status` become `active`

---

## Production checklist

- [ ] Replace every default password
- [ ] Set `JWT_SECRET` to a long random value
- [ ] Configure PayFast / Ozow merchant keys (in `.env`)
- [ ] Configure SSL via Nginx Proxy Manager
- [ ] Enable daily database backups
- [ ] Upload the official QCTO Office Administrator curriculum document
- [ ] Upload the official QCTO learner guide, workbook, assessment guide, POE guide and moderator guide
- [ ] Map the official curriculum elements to modules
- [ ] Update the demo POE template with the official POE items
- [ ] Add a real privacy notice in `/pages/login.html`
- [ ] Add a real retention policy text
- [ ] Add a real consent declaration language
- [ ] Enable file-type virus scanning (e.g. ClamAV) on uploads

---

## Why this isn't a basic LMS

- It is **QCTO-aware at the data layer**: every learning item, workbook response, and POE item
  is mapped to a curriculum element, an assessment criterion, an assessor decision and a
  moderator sign-off. The **curriculum mapping matrix** and the **POE pack PDF** together
  prove the chain: outcome → activity → evidence → assessor → moderator.
- It is a **pathway, not a content dump**: the Netflix-style rows answer the learner's only
  real question — "what must I finish next?"
- It is a **workflow, not a form**: facilitators can return work for correction,
  recommend for assessment, or flag at risk — all logged.
- It is **POPIA-aware by design**: role-based access, private file storage, audit trail.
- It is **offline-friendly**: PWA manifest, service worker, local draft backup.
- It is **deployed in minutes**: Docker + Nginx Proxy Manager + Let's Encrypt.

---

© NIBS — Naleli Institute of Business Studies. Demo content only until official QCTO
documents are uploaded.

---

## Deployment to UAT (`uat-office.naleli.co.za` via Portainer + Nginx Proxy Manager)

### Architecture

```
Browser → uat-office.naleli.co.za (HTTPS)
        → Nginx Proxy Manager (TLS termination + reverse proxy)
        → office-admin-portal container (port 8088)
        → SQLite DB at /data/nibs.db
        → /data/uploads (POE evidence files)
        → /data/uploads/exports (PDF packs)
```

### Portainer stack (1. add stack → 2. paste docker-compose.yml → 3. add env file → 4. deploy)

**Service name:** `office-admin-portal`
**Image:** built from this Dockerfile on first deploy
**Port mapping:** `8088:8088` (host port must be free and reachable from NPM)
**Restart:** `unless-stopped`
**Volumes on host:**
- `./data` → `/data`  (DB + uploads + exports)
- `./uploads` → `/data/uploads`
- `./exports` → `/data/uploads/exports`

**Environment file** (`office-admin-portal.env` in Portainer, see `.env.example` for the full list):
- `APP_PORT=8088`
- `APP_URL=https://uat-office.naleli.co.za`
- `SQLITE_PATH=/data/nibs.db`
- `UPLOAD_DIR=/data/uploads`
- `PDF_EXPORT_DIR=/data/uploads/exports`
- `JWT_SECRET=<32+ chars random>`
- `SESSION_SECRET=<32+ chars random>`
- `ADMIN_EMAIL=admin@naleli.co.za`
- `ADMIN_PASSWORD=ChangeMe123!`  *(change on first login)*

### Nginx Proxy Manager (NPM) — proxy host

- **Domain:** `uat-office.naleli.co.za`
- **Scheme:** http
- **Forward host:** `office-admin-portal` (or the Portainer service IP)
- **Forward port:** `8088`
- **Cache assets:** off
- **Block common exploits:** on
- **Websockets:** on
- **SSL:** Let's Encrypt (Force SSL = on, HTTP/2 = on)
- **Advanced:** add `proxy_read_timeout 300;` to handle PDF generation

### First-deploy checklist

1. Add the **GitHub deploy key** (provided in chat) to the repo with **write access**.
2. In Portainer, add the stack and deploy.
3. Wait for healthcheck to pass (HTTP 200 from `/`).
4. Visit `https://uat-office.naleli.co.za/` — public landing should render.
5. Login as `admin@naleli.co.za` / `ChangeMe123!` and:
   - [ ] Change admin password
   - [ ] Confirm the **QCTO 334102002** curriculum appears under `/admin/curriculum-mapping`
   - [ ] Open `/admin/content-review` — see 49 enriched content rows (Draft AI)
   - [ ] Open `/app/dashboard` as `student@naleli.co.za` / `Student123!` — see Netflix dashboard
   - [ ] Open any lesson under `/app/pathway` — see the enriched blocks (Draft AI banner at top)
   - [ ] Open `/app/poe` and generate the POE PDF — confirm 11 pages
   - [ ] Test assessor + moderator views
6. (Optional) Test 8088 directly: `curl -i http://<server-ip>:8088/`

### Smoke test (local)

```bash
# Reset DB, restart server, run 73-check smoke test
cd /workspace/nibs-portal
rm -f database/nibs.db*
node server/seed/run.js
PORT=8088 node server/index.js &
sleep 3
BASE=http://127.0.0.1:8088 bash docs/smoke.sh
# Expected: PASS: 73    FAIL: 0
```

---

## AI-enriched learner content (Draft AI → SME review → Approved → Published)

All 36 official modules (15 KMs + 11 PMs + 10 WMs) have **AI-generated learner-facing content** pre-seeded as `Draft AI`. Each topic / activity / work item has:

- Why it matters in the workplace
- Plain English explanation
- South African workplace example
- Real-life scenario
- Step-by-step guidance
- Common mistakes
- Learn-by-doing activity
- Workbook questions
- Knowledge check quiz
- POE evidence link
- Assessor + moderator checklists
- References (real, with URL and date accessed)
- "Up-to-date note" (flagged for periodic review)

**Workflow:**

1. SME logs in as admin / coursemanager / facilitator.
2. Opens `/admin/content-review`.
3. Filters by module, reviews AI vs official curriculum side-by-side, edits the status:
   - `draft_ai` → `needs_sme_review` → `reviewed` → `approved` → `published` (visible to learners)
4. Reference are real, cited with name, URL, date accessed, and why relevant.
5. POPIA, BCEA, LRA, SDA, SDLA, NQF/QCTO/SAQA, King IV, PFMA references are South-African-specific.

**Important:** the official QCTO 334102002 curriculum is the source of truth. AI-enriched content is layered on top and is clearly labelled until reviewed and approved.

