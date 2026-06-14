# UAT Go-Live Checklist — NIBS Office Administrator Pathway Portal

**Target:** `https://uat-office.naleli.co.za`
**Stack:** Portainer + Nginx Proxy Manager
**Container port:** 8088
**Status:** UAT go-live approved; production wait until UAT sign-off

---

## 0. Pre-flight (completed before this checklist)

- [x] Official QCTO 334102002 curriculum pre-seeded (15 KMs + 11 PMs + 10 WMs = 36 modules, 445 credits)
- [x] AI-enriched content for 294 curriculum elements (Draft AI → SME review workflow)
- [x] 9 role-based portals (Super Admin, Admin, Course Manager, Learner, Facilitator, Assessor, Moderator, Finance, Workplace Supervisor)
- [x] Netflix-style learner dashboard with practical learning items
- [x] Online POE editor with supervisor signoff + 11-page PDF pack
- [x] 73/73 smoke test PASS
- [x] GitHub branches `main` and `develop` pushed
- [x] GitHub SSH deploy key added (read/write) by `@coachtee`
- [x] `Dockerfile` + `docker-compose.yml` ready for Portainer (port 8088, `/data` volume, `restart: unless-stopped`)
- [x] `.env.example` with all required env vars
- [x] `must_change_password` gate — admin is forced to rotate off the seed default on first login

---

## 1. Environment variables (Portainer stack env file)

In Portainer, name the env file `office-admin-portal.env` and set:

| Variable | Value | Notes |
|---|---|---|
| `APP_ENV` | `uat` | `development` \| `uat` \| `production` |
| `APP_URL` | `https://uat-office.naleli.co.za` | Used in email links, redirects |
| `APP_PORT` | `8088` | Internal container port |
| `DATABASE_URL` | *(leave blank for SQLite)* | Or `postgres://...` for future |
| `SQLITE_PATH` | `/data/nibs.db` | Persistent on host `./data` |
| `JWT_SECRET` | `<32+ random chars>` | **Rotate before production** |
| `SESSION_SECRET` | `<32+ random chars>` | **Rotate before production** |
| `UPLOAD_DIR` | `/data/uploads` | POE evidence files |
| `PDF_EXPORT_DIR` | `/data/uploads/exports` | Generated POE PDFs |
| `ADMIN_EMAIL` | `admin@naleli.co.za` | First-run admin |
| `ADMIN_DEFAULT_PASSWORD` | `change-on-first-login` | Forces rotation on first login |

> **NEVER commit `.env` or `office-admin-portal.env` to git.** Only `.env.example`.

---

## 2. Persistent volumes

| Container path | Host path | Contents |
|---|---|---|
| `/data` | `./data` | SQLite DB + uploads + exports |
| `/data/uploads` | `./uploads` | POE evidence files |
| `/data/uploads/exports` | `./exports` | Generated PDFs |

> All three bind mounts are declared in `docker-compose.yml`. Data survives any container rebuild as long as `./data` on the host is intact.

**Verification:** after the first deploy, drop a test file in `./uploads`, restart the container, confirm the file is still there.

---

## 3. First admin password change (do this in UAT)

1. Browse to `https://uat-office.naleli.co.za/login`
2. Sign in with `admin@naleli.co.za` / `change-on-first-login`
3. The system **forces** a password change before any other action works
4. Set a strong password (≥ 8 chars, mix case + digit)
5. Optionally, create your own named admin account and disable the default

> Other seeded accounts (superadmin, coursemanager, learner, etc.) are NOT forced to change. They keep their legacy `ChangeMe123!` / `Student123!` defaults — **rotate these or disable them in production**.

---

## 4. Nginx Proxy Manager proxy host

| Field | Value |
|---|---|
| Domain | `uat-office.naleli.co.za` |
| Scheme | `http` |
| Forward host | `office-admin-portal` (or the Portainer service IP) |
| Forward port | `8088` |
| Cache assets | off |
| Block common exploits | **on** |
| Websockets | **on** (future-proof) |
| SSL | Let's Encrypt (Force SSL = on, HTTP/2 = on) |
| Advanced | add `proxy_read_timeout 300;` (handles PDF generation) |

---

## 5. Backup plan (before declaring UAT go-live)

| What | How | Where | Test restore |
|---|---|---|---|
| SQLite DB | `cp /data/nibs.db /backups/nibs-$(date +%F).db` daily | Off-host (object storage / NAS) | Restore to a fresh container once |
| Uploads | rsync `/data/uploads` to off-host daily | Same | Spot-check file integrity |
| Exports | rsync `/data/uploads/exports` weekly | Same | Spot-check |
| Config | Portainer stack JSON + env file in a private git repo | GitHub / Gitea | Re-create stack from a fresh Portainer |

> **No backup = no go-live.** Test a full restore before UAT is declared done.

---

## 6. UAT test accounts

Pre-seeded (re-seed if needed):

| Role | Email | Default password | Notes |
|---|---|---|---|
| Super Admin | `superadmin@naleli.co.za` | `ChangeMe123!` | Full access — rotate in production |
| Admin | `admin@naleli.co.za` | `change-on-first-login` | Forced rotation on first login |
| Course Manager | `coursemanager@naleli.co.za` | `ChangeMe123!` | Curriculum / modules / lessons / POE templates |
| Facilitator | `facilitator@naleli.co.za` | `ChangeMe123!` | Cohort + feedback |
| Assessor | `assessor@naleli.co.za` | `ChangeMe123!` | Competence decision |
| Moderator | `moderator@naleli.co.za` | `ChangeMe123!` | Sample moderation |
| Finance | `finance@naleli.co.za` | `ChangeMe123!` | Payments + access |
| Workplace Supervisor | `supervisor@naleli.co.za` | `ChangeMe123!` | Workplace sign-off |
| Learner (active) | `student@naleli.co.za` | `Student123!` | Test learner 1 |
| Learner (active) | `learner2@naleli.co.za` | `Student123!` | Test learner 2 |
| Learner (pending payment) | `pending@naleli.co.za` | `Student123!` | Should see payment-lock screen |

> For real UAT, **create one test user per role** and let real humans click through. Use the pre-seeded accounts only for smoke testing.

---

## 7. Content review status — verify every lesson shows the banner

Each lesson that has AI-enriched content shows a banner:

> ⚠ This lesson includes AI-generated enrichment ("draft_ai" / "needs_sme_review" / "reviewed" / "approved" / "published"). The official curriculum document is the source of truth.

**Workflow for SME review:**

1. Login as admin / coursemanager / facilitator
2. Go to `/admin/content-review`
3. Filter by status (e.g. `draft_ai`)
4. Open each item, read the AI content side-by-side with the official curriculum element
5. Move it through the lifecycle: `draft_ai` → `needs_sme_review` → `reviewed` → `approved` → `published` (last step makes it visible to learners)
6. **Never** publish anything that has not been SME-reviewed
7. References must be checked against the live URL before publishing

**Block rule:** learners only see `approved` or `published` content. Drafts are staff-only.

---

## 8. Smoke test (run after every UAT deploy)

On the Portainer host, or any machine that can reach the container:

```bash
# Locally:
cd /workspace/nibs-portal
BASE=http://uat-office.naleli.co.za bash docs/smoke.sh
# Expected: PASS: 73    FAIL: 0
```

The smoke test covers: public landing, login flows, learner dashboard, workbook, POE editor, facilitator / assessor / moderator / finance / supervisor flows, curriculum mapping, audit, all 9 role dashboards.

---

## 9. UAT sign-off criteria

UAT is **declared done** when:

- [ ] All 73 smoke tests pass on the live URL
- [ ] Login works for all 11 pre-seeded accounts
- [ ] Admin is forced to change password on first login
- [ ] The 11-page POE PDF generates for a learner with at least 1 POE item submitted
- [ ] At least one AI-enriched lesson has been SME-reviewed and published
- [ ] Backup has run at least once AND a restore has been tested
- [ ] Nginx Proxy Manager forces HTTPS, returns a valid Let's Encrypt cert
- [ ] No errors in container logs (`docker logs office-admin-portal | tail -100`)
- [ ] At least 3 humans (admin / facilitator / learner) have clicked through their main flow and signed off

---

## 10. Known issues / things to do AFTER UAT

- **Production is NOT yet approved.** UAT sign-off is required first.
- Replace the `ChangeMe123!` and `Student123!` legacy defaults on all non-admin seeded accounts (or delete them in production).
- Wire up a real payment provider (PayFast / Paystack / Yoco) — the portal currently uses a manual `pending_payment` flag with finance approval.
- Wire up SMTP for the application confirmation email and password reset.
- Switch from SQLite to PostgreSQL when learner numbers justify it (the schema is portable; the driver is not yet).
- Wire up the official learner guide / workbook PDF as the source of truth for lesson content (the admin curriculum page supports this via PDF upload + `pdftotext` extraction).

---

## Quick reference — important URLs

| URL | What it is |
|---|---|
| `https://uat-office.naleli.co.za/` | Public landing |
| `https://uat-office.naleli.co.za/login` | Login |
| `https://uat-office.naleli.co.za/app/dashboard` | Learner Netflix-style dashboard |
| `https://uat-office.naleli.co.za/app/pathway` | Learner pathway (36 modules) |
| `https://uat-office.naleli.co.za/app/lesson/:id` | Learner lesson (renders enriched blocks) |
| `https://uat-office.naleli.co.za/app/poe` | Learner POE editor |
| `https://uat-office.naleli.co.za/admin/dashboard` | Admin dashboard |
| `https://uat-office.naleli.co.za/admin/curriculum-mapping` | Curriculum mapping matrix |
| `https://uat-office.naleli.co.za/admin/content-review` | AI content SME review (NEW in v1.1) |
| `https://uat-office.naleli.co.za/admin/audit` | Audit trail |
| `https://uat-office.naleli.co.za/assessor/review` | Assessor 3-column review |
| `https://uat-office.naleli.co.za/moderator/review` | Moderator review |
| `https://uat-office.naleli.co.za/healthz` | Container healthcheck |

---

## Quick reference — default logins

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@naleli.co.za` | `ChangeMe123!` |
| Admin | `admin@naleli.co.za` | `change-on-first-login` (forces rotation) |
| Course Manager | `coursemanager@naleli.co.za` | `ChangeMe123!` |
| Facilitator | `facilitator@naleli.co.za` | `ChangeMe123!` |
| Assessor | `assessor@naleli.co.za` | `ChangeMe123!` |
| Moderator | `moderator@naleli.co.za` | `ChangeMe123!` |
| Finance | `finance@naleli.co.za` | `ChangeMe123!` |
| Supervisor | `supervisor@naleli.co.za` | `ChangeMe123!` |
| Learner | `student@naleli.co.za` | `Student123!` |
| Learner (pending) | `pending@naleli.co.za` | `Student123!` |

---

**Document version:** v1.2 — 2026-06-14
**Build:** 1d3fcad (main) / 5d8ef03 (develop)
**Sign-off pending:** SSH key regeneration after sandbox wipe — see "Important" note in next message.
