#!/bin/bash
# QA report generator — runs the UAT env, hits the portal as multiple
# users, captures HTML snapshots + key API responses, builds a Markdown
# QA report. All in one process so nothing dies between calls.
set +e
cd /workspace/nibs-portal

# === Setup ===
pkill -9 -f "node " 2>/dev/null
sleep 1
rm -f database/nibs.db
mkdir -p qa-artifacts

ADMIN_DEFAULT_PASSWORD=change-on-first-login \
ADMIN_EMAIL=admin@naleli.co.za \
node server/seed/run.js > qa-artifacts/01-seed.txt 2>&1
echo "1. Seed: $?"

# === Start server inline ===
ADMIN_DEFAULT_PASSWORD=change-on-first-login \
ADMIN_EMAIL=admin@naleli.co.za \
node server/index.js > qa-artifacts/02-server.txt 2>&1 &
SRV=$!
echo "2. Server PID: $SRV"

# Wait for ready
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -m 1 http://localhost:8088/healthz > /dev/null 2>&1; then
    echo "3. Ready in ${i}s"
    break
  fi
  sleep 1
done

# === Capture healthz ===
echo "4. Healthz check:"
curl -s http://localhost:8088/healthz
echo
echo

# === Public landing page (HTML) ===
curl -s http://localhost:8088/ > qa-artifacts/03-landing.html
echo "5. Public landing: $(wc -c < qa-artifacts/03-landing.html) bytes"

# === Public curriculum (manifest, etc) ===
curl -s http://localhost:8088/static/manifest.webmanifest > qa-artifacts/04-manifest.json
echo "6. Manifest: $(wc -c < qa-artifacts/04-manifest.json) bytes"

# === Admin login (with placeholder) ===
ADMIN_COOKIE=qa-artifacts/admin.cookie
rm -f $ADMIN_COOKIE
curl -s -c $ADMIN_COOKIE -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@naleli.co.za","password":"change-on-first-login"}' > qa-artifacts/05-admin-login.json
echo "7. Admin login response:"
cat qa-artifacts/05-admin-login.json
echo

# /me (must_change_password=1)
curl -s -b $ADMIN_COOKIE http://localhost:8088/api/auth/me > qa-artifacts/06-admin-me-before.json
echo "8. /me before change:"
cat qa-artifacts/06-admin-me-before.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('  must_change_password:', d['user'].get('must_change_password'), '| email:', d['user'].get('email'), '| role:', d['user'].get('role'))"

# /api/users blocked
USERS_BEFORE=$(curl -s -b $ADMIN_COOKIE http://localhost:8088/api/users)
echo "9. /api/users before change (should be 403):"
echo "   $USERS_BEFORE"

# Change password
curl -s -b $ADMIN_COOKIE -X POST http://localhost:8088/api/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{"new_password":"QaReportPwd!2026"}' > qa-artifacts/07-admin-change.json
echo "10. Change password:"
cat qa-artifacts/07-admin-change.json
echo

# /me after change
curl -s -b $ADMIN_COOKIE http://localhost:8088/api/auth/me > qa-artifacts/08-admin-me-after.json
echo "11. /me after change:"
cat qa-artifacts/08-admin-me-after.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('  must_change_password:', d['user'].get('must_change_password'))"

# /api/users now works
USERS_AFTER=$(curl -s -b $ADMIN_COOKIE http://localhost:8088/api/users > qa-artifacts/09-admin-users.json; wc -c < qa-artifacts/09-admin-users.json)
echo "12. /api/users after change: $USERS_AFTER bytes"

# === Admin role dashboards ===
for path in /admin/dashboard /admin/curriculum-mapping /admin/content-review /admin/poe-templates /admin/reports /admin/audit /admin/users; do
  code=$(curl -s -o qa-artifacts/10-admin-page-$(echo $path | tr / _).html -b $ADMIN_COOKIE -w "%{http_code}" http://localhost:8088$path)
  size=$(wc -c < qa-artifacts/10-admin-page-$(echo $path | tr / _).html)
  echo "13. GET $path -> $code ($size bytes)"
done

# === Learner login + dashboard ===
LEARNER_COOKIE=qa-artifacts/learner.cookie
rm -f $LEARNER_COOKIE
curl -s -c $LEARNER_COOKIE -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@naleli.co.za","password":"Student123!"}' > qa-artifacts/11-learner-login.json
curl -s -b $LEARNER_COOKIE http://localhost:8088/api/learner/dashboard > qa-artifacts/12-learner-dashboard.json
echo "14. Learner dashboard (excerpt):"
cat qa-artifacts/12-learner-dashboard.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('  user:', d.get('user', {}).get('full_name'))
cp = d.get('course_progress', {})
print('  course_progress:', cp)
mb = d.get('modules_by_type', {})
print('  modules by type: knowledge={}, practical_skill={}, work_experience={}'.format(
  len(mb.get('knowledge', [])), len(mb.get('practical_skill', [])), len(mb.get('work_experience', []))))
cont = d.get('continue')
print('  continue:', cont.get('title') if cont else None)
"

# Learner page routes
for path in /app/dashboard /app/pathway /app/workbook /app/poe; do
  code=$(curl -s -o qa-artifacts/13-learner-page-$(echo $path | tr / _).html -b $LEARNER_COOKIE -w "%{http_code}" http://localhost:8088$path)
  size=$(wc -c < qa-artifacts/13-learner-page-$(echo $path | tr / _).html)
  echo "15. GET $path (learner) -> $code ($size bytes)"
done

# === Lesson with enriched content ===
LESSON_ID=$(node -e "const db=require('./server/db'); console.log(db.prepare('SELECT id FROM lessons LIMIT 1').get().id)")
echo "16. First lesson id: $LESSON_ID"
curl -s -b $LEARNER_COOKIE http://localhost:8088/api/lessons/$LESSON_ID > qa-artifacts/14-lesson.json
cat qa-artifacts/14-lesson.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
l = d.get('lesson', {})
print('  title:', l.get('title'))
print('  curriculum_element_id:', l.get('curriculum_element_id'))
"

# Get the lesson page HTML
curl -s -o qa-artifacts/15-lesson-page.html -b $LEARNER_COOKIE http://localhost:8088/app/lesson/$LESSON_ID
echo "17. Lesson page: $(wc -c < qa-artifacts/15-lesson-page.html) bytes"

# === Enriched content for KM-01-KT01 ===
ELEMENT_ID=$(node -e "const db=require('./server/db'); console.log(db.prepare(\"SELECT id FROM curriculum_elements WHERE code='KM-01-KT01'\").get().id)")
echo "18. KM-01-KT01 element id: $ELEMENT_ID"
curl -s -b $LEARNER_COOKIE http://localhost:8088/api/lessons/topic-content/$ELEMENT_ID > qa-artifacts/16-enriched-content.json
echo "19. Enriched content (excerpt):"
cat qa-artifacts/16-enriched-content.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('  why_it_matters[:120]:', (d.get('why_it_matters') or '')[:120])
print('  plain_english[:120]:', (d.get('plain_english') or '')[:120])
print('  sa_example[:120]:', (d.get('sa_example') or '')[:120])
print('  has scenario:', bool(d.get('scenario')))
print('  has step_by_step:', bool(d.get('step_by_step')))
print('  has common_mistakes:', bool(d.get('common_mistakes')))
print('  has learn_by_doing:', bool(d.get('learn_by_doing')))
print('  workbook_questions:', len(d.get('workbook_questions', [])))
print('  quiz:', len(d.get('quiz', [])))
print('  references:', len(d.get('references', [])))
print('  status:', d.get('review_status'))
"

# === Admin content review page ===
curl -s -b $ADMIN_COOKIE http://localhost:8088/api/lessons/topic-content > qa-artifacts/17-content-review-list.json
cat qa-artifacts/17-content-review-list.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
items = d.get('items', [])
print('  total content rows:', len(items))
statuses = {}
for i in items:
  s = i.get('review_status', '?')
  statuses[s] = statuses.get(s, 0) + 1
print('  by status:', statuses)
"

# === Smoke test (the canonical 73 checks) ===
echo
echo "=== 20. SMOKE TEST (canonical 73-check) ==="
ADMIN_DEFAULT_PASSWORD=change-on-first-login \
ADMIN_EMAIL=admin@naleli.co.za \
BASE=http://127.0.0.1:8088 \
bash docs/smoke.sh > qa-artifacts/18-smoke.txt 2>&1
SMOKE_EXIT=$?
tail -3 qa-artifacts/18-smoke.txt
echo "smoke exit: $SMOKE_EXIT"
echo "PASS: $(grep -c '✅' qa-artifacts/18-smoke.txt) FAIL: $(grep -c '❌' qa-artifacts/18-smoke.txt)"

# === Database summary ===
node -e "
const db = require('./server/db');
const lines = [];
lines.push('Users: ' + db.prepare('SELECT COUNT(*) c FROM users').get().c);
lines.push('Cohorts: ' + db.prepare('SELECT COUNT(*) c FROM cohorts').get().c);
lines.push('Curriculum elements: ' + db.prepare('SELECT COUNT(*) c FROM curriculum_elements').get().c);
lines.push('Curriculum documents: ' + db.prepare('SELECT COUNT(*) c FROM curriculum_documents').get().c);
lines.push('Modules: ' + db.prepare('SELECT COUNT(*) c FROM modules').get().c);
lines.push('Lessons: ' + db.prepare('SELECT COUNT(*) c FROM lessons').get().c);
lines.push('POE sections: ' + db.prepare('SELECT COUNT(*) c FROM poe_sections').get().c);
lines.push('POE evidence groups: ' + db.prepare('SELECT COUNT(*) c FROM poe_evidence_groups').get().c);
lines.push('POE items: ' + db.prepare('SELECT COUNT(*) c FROM poe_items').get().c);
lines.push('POE fields: ' + db.prepare('SELECT COUNT(*) c FROM poe_fields').get().c);
lines.push('Enriched content rows: ' + db.prepare('SELECT COUNT(*) c FROM topic_content').get().c);
require('fs').writeFileSync('qa-artifacts/19-db-summary.txt', lines.join('\n') + '\n');
" 2>&1
cat qa-artifacts/19-db-summary.txt

# === Stop server ===
kill $SRV 2>/dev/null
wait 2>/dev/null

echo
echo "=== DONE — all artifacts in qa-artifacts/ ==="
ls -la qa-artifacts/