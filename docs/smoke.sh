#!/usr/bin/env bash
# NIBS Pathway Portal — full smoke test
# Usage: bash docs/smoke.sh
set +e
BASE="${BASE:-http://127.0.0.1:8080}"
TMP=/tmp/cookies
rm -rf $TMP && mkdir -p $TMP
PASS=0; FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1 — $2"; FAIL=$((FAIL+1)); }

check_status() {
  local name="$1"; local expect="$2"; local url="$3"; local jar="$4"; shift 4
  local code
  code=$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' "$@" "$url")
  if [[ "$code" == "$expect" ]]; then ok "$name ($code)"; else fail "$name" "expected $expect got $code"; fi
}

check_contains() {
  local name="$1"; local needle="$2"; local url="$3"; local jar="$4"; shift 4
  local body
  body=$(curl -s -b "$jar" "$@" "$url")
  if [[ "$body" == *"$needle"* ]]; then ok "$name"; else fail "$name" "no '$needle' in: ${body:0:120}"; fi
}

login() {
  local email="$1"; local pwd="$2"; local label="$3"
  local jar="$TMP/$label.jar"
  rm -f "$jar"
  curl -s -c "$jar" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pwd\"}" \
    "$BASE/api/auth/login" > /dev/null
}

# If the env is set to force an admin password rotation (v1.2+ UAT flow),
# call /api/auth/change-password after login to clear the gate. Idempotent
# for users who are NOT flagged must_change_password.
maybe_clear_must_change() {
  local jar="$1"
  local new_pwd="$2"
  curl -s -b "$jar" -X POST -H 'Content-Type: application/json' \
    -d "{\"new_password\":\"$new_pwd\"}" \
    "$BASE/api/auth/change-password" > /dev/null
}

# Re-seed DB to a clean state.
# If ADMIN_DEFAULT_PASSWORD is set in the environment (UAT / production),
# re-seed with the same env so the admin's must_change_password flag matches
# what the running server will use.
if [ -n "$ADMIN_DEFAULT_PASSWORD" ]; then
  (cd /workspace/nibs-portal && ADMIN_DEFAULT_PASSWORD="$ADMIN_DEFAULT_PASSWORD" \
                                ADMIN_EMAIL="${ADMIN_EMAIL:-admin@naleli.co.za}" \
                                node server/seed/run.js > /dev/null 2>&1)
  # After the v1.2 env-var flow, the admin is flagged must_change_password=1.
  # Any test that logs in as the admin must call maybe_clear_must_change right
  # after login, otherwise all admin-only /api/* calls will return 403.
  ADMIN_MUST_CHANGE=1
else
  (cd /workspace/nibs-portal && node server/seed/run.js > /dev/null 2>&1)
  ADMIN_MUST_CHANGE=0
fi

echo "=== 1. Public landing page ==="
check_status "GET /" 200 "$BASE/" /dev/null
check_contains "manifest" "NIBS Pathway" "$BASE/static/manifest.webmanifest" /dev/null
check_contains "sw.js" "CACHE" "$BASE/sw.js" /dev/null
check_contains "css" "warm cream" "$BASE/static/css/styles.css" /dev/null

echo "=== 2. Super admin ==="
login superadmin@naleli.co.za ChangeMe123! superadmin
check_contains "me superadmin" "super_admin" "$BASE/api/auth/me" $TMP/superadmin.jar
check_contains "dashboard" "learners" "$BASE/api/reports/dashboard" $TMP/superadmin.jar
check_contains "users list" "users" "$BASE/api/users" $TMP/superadmin.jar

echo "=== 3. Admin ==="
# Login with the correct admin password: env override if set, else legacy.
ADMIN_LOGIN_PWD="${ADMIN_DEFAULT_PASSWORD:-ChangeMe123!}"
login "${ADMIN_EMAIL:-admin@naleli.co.za}" "$ADMIN_LOGIN_PWD" admin
# If the admin was seeded with must_change_password=1 (v1.2 UAT flow),
# clear the gate by rotating to a stable test password. This makes the
# canonical smoke test work both with and without the env var.
if [ "$ADMIN_MUST_CHANGE" = "1" ]; then
  maybe_clear_must_change $TMP/admin.jar "SmokeTestAdmin!2026"
fi
check_contains "me admin" "admin" "$BASE/api/auth/me" $TMP/admin.jar
check_contains "audit" "rows" "$BASE/api/audit" $TMP/admin.jar
check_contains "curriculum matrix" "rows" "$BASE/api/curriculum/matrix" $TMP/admin.jar
check_contains "POE templates" "templates" "$BASE/api/poe/templates" $TMP/admin.jar
check_contains "create user" "default_password" "$BASE/api/users" $TMP/admin.jar -X POST -H 'Content-Type: application/json' -d '{"email":"test@x.com","full_name":"Test","role":"learner","password":"Test1234!"}'

echo "=== 4. Active learner ==="
login student@naleli.co.za Student123! learner
check_contains "me learner" "learner" "$BASE/api/auth/me" $TMP/learner.jar
check_contains "dashboard" "course" "$BASE/api/learner/dashboard" $TMP/learner.jar
check_contains "pathway" "tabs" "$BASE/api/learner/pathway" $TMP/learner.jar
check_contains "my submissions" "submissions" "$BASE/api/poe/my-submissions" $TMP/learner.jar
LESSON_ID=$(cd /workspace/nibs-portal && node -e "console.log(require('./server/db').prepare('SELECT id FROM lessons LIMIT 1').get().id);")
check_contains "lesson fetch" "lesson" "$BASE/api/lessons/$LESSON_ID" $TMP/learner.jar
check_contains "lesson progress" "ok" "$BASE/api/lessons/$LESSON_ID/progress" $TMP/learner.jar -X POST -H 'Content-Type: application/json' -d '{"status":"completed"}'
check_contains "workbook answers" "answers" "$BASE/api/workbook/answers" $TMP/learner.jar
check_contains "workbook draft" "draft" "$BASE/api/workbook/answers" $TMP/learner.jar -X POST -H 'Content-Type: application/json' -d "{\"question_id\":\"$(cd /workspace/nibs-portal && node -e "console.log(require('./server/db').prepare('SELECT id FROM workbook_questions LIMIT 1').get().id);")\",\"answer_text\":\"smoke test\",\"status\":\"draft\"}"
POE_ID=$(cd /workspace/nibs-portal && node -e "console.log(require('./server/db').prepare('SELECT id FROM poe_items LIMIT 1').get().id);")
check_contains "poe item" "item" "$BASE/api/poe/items/$POE_ID" $TMP/learner.jar
check_contains "poe submit" "submitted" "$BASE/api/poe/items/$POE_ID/submit" $TMP/learner.jar -X POST -H 'Content-Type: application/json' -d "{\"data\":{\"x\":\"y\"},\"declaration_signed\":true,\"action\":\"submit\"}"

echo "=== 5. Pending payment learner ==="
login pending@naleli.co.za Student123! pending
check_contains "me pending" "pending_payment" "$BASE/api/auth/me" $TMP/pending.jar
check_contains "dashboard locked" "payment_locked" "$BASE/api/learner/dashboard" $TMP/pending.jar
# Try to submit a POE — should be 402
code=$(curl -s -b $TMP/pending.jar -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"data\":{},\"action\":\"submit\"}" "$BASE/api/poe/items/$POE_ID/submit")
if [[ "$code" == "402" ]]; then ok "pending can't submit ($code)"; else fail "pending can't submit" "expected 402 got $code"; fi
# Try to save draft — should also be 402
code=$(curl -s -b $TMP/pending.jar -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"data\":{},\"action\":\"draft\"}" "$BASE/api/poe/items/$POE_ID/submit")
if [[ "$code" == "402" ]]; then ok "pending can't draft ($code)"; else fail "pending can't draft" "expected 402 got $code"; fi

echo "=== 6. Facilitator ==="
login facilitator@naleli.co.za ChangeMe123! facilitator
check_contains "me facilitator" "facilitator" "$BASE/api/auth/me" $TMP/facilitator.jar
check_contains "cohorts" "cohorts" "$BASE/api/facilitator/cohorts" $TMP/facilitator.jar
LEARNER_ID=$(cd /workspace/nibs-portal && node -e "console.log(require('./server/db').prepare(\"SELECT id FROM users WHERE email='student@naleli.co.za'\").get().id);")
check_contains "facilitator learner" "learner" "$BASE/api/facilitator/learners/$LEARNER_ID" $TMP/facilitator.jar
check_contains "facilitator feedback" "ok" "$BASE/api/facilitator/feedback" $TMP/facilitator.jar -X POST -H 'Content-Type: application/json' -d "{\"user_id\":\"$LEARNER_ID\",\"context_type\":\"lesson\",\"context_id\":\"abc\",\"feedback\":\"great\",\"recommend_for_assessment\":true}"
check_contains "attendance" "ok" "$BASE/api/facilitator/attendance" $TMP/facilitator.jar -X POST -H 'Content-Type: application/json' -d "{\"user_id\":\"$LEARNER_ID\",\"status\":\"present\"}"
check_contains "class note" "ok" "$BASE/api/facilitator/class-notes" $TMP/facilitator.jar -X POST -H 'Content-Type: application/json' -d "{\"title\":\"Week 3\",\"body\":\"Covered POPIA\"}"

echo "=== 7. Assessor ==="
login assessor@naleli.co.za ChangeMe123! assessor
check_contains "me assessor" "assessor" "$BASE/api/auth/me" $TMP/assessor.jar
check_contains "assessor queue" "items" "$BASE/api/assessor/queue" $TMP/assessor.jar
SUB_ID=$(cd /workspace/nibs-portal && node -e "console.log(require('./server/db').prepare('SELECT id FROM poe_submissions WHERE user_id=(SELECT id FROM users WHERE email=\\'student@naleli.co.za\\') LIMIT 1').get().id);")
check_contains "assessor fetch" "submission" "$BASE/api/assessor/submission/$SUB_ID" $TMP/assessor.jar
check_contains "assessor decide" "new_status" "$BASE/api/assessor/decide" $TMP/assessor.jar -X POST -H 'Content-Type: application/json' -d "{\"submission_id\":\"$SUB_ID\",\"decision\":\"competent\",\"feedback\":\"well done\",\"criteria\":[\"a\"],\"signoff_name\":\"Thandiwe Naidoo\",\"signoff_role\":\"Assessor\",\"signed_off\":true}"

echo "=== 8. Moderator ==="
login moderator@naleli.co.za ChangeMe123! moderator
check_contains "me moderator" "moderator" "$BASE/api/auth/me" $TMP/moderator.jar
(cd /workspace/nibs-portal && node -e "require('./server/db').prepare(\"UPDATE poe_submissions SET status='selected_for_moderation' WHERE id=?\").run('$SUB_ID');")
check_contains "moderator queue" "items" "$BASE/api/moderator/queue" $TMP/moderator.jar
check_contains "moderator review" "item" "$BASE/api/moderator/review/$SUB_ID" $TMP/moderator.jar
check_contains "moderator decide" "new_status" "$BASE/api/moderator/decide" $TMP/moderator.jar -X POST -H 'Content-Type: application/json' -d "{\"submission_id\":\"$SUB_ID\",\"decision\":\"approved\",\"findings\":\"ok\",\"signoff_name\":\"Sipho Dlamini\",\"signoff_role\":\"Moderator\",\"signed_off\":true}"

echo "=== 9. Workplace supervisor ==="
login supervisor@naleli.co.za ChangeMe123! supervisor
check_contains "me supervisor" "employer" "$BASE/api/auth/me" $TMP/supervisor.jar
check_contains "supervisor learners" "learners" "$BASE/api/supervisor/learners" $TMP/supervisor.jar
check_contains "supervisor signoff" "ok" "$BASE/api/supervisor/signoff" $TMP/supervisor.jar -X POST -H 'Content-Type: application/json' -d "{\"user_id\":\"$LEARNER_ID\",\"work_activity_code\":\"WE-260101\",\"feedback\":\"good\",\"signed_off\":true}"

echo "=== 10. Finance ==="
login finance@naleli.co.za ChangeMe123! finance
check_contains "me finance" "finance" "$BASE/api/auth/me" $TMP/finance.jar
PENDING_ID=$(cd /workspace/nibs-portal && node -e "console.log(require('./server/db').prepare(\"SELECT id FROM users WHERE email='pending@naleli.co.za'\").get().id);")
check_contains "finance learners" "learners" "$BASE/api/finance/learners" $TMP/finance.jar
check_contains "finance mark paid" "ok" "$BASE/api/finance/payment" $TMP/finance.jar -X POST -H 'Content-Type: application/json' -d "{\"user_id\":\"$PENDING_ID\",\"amount_cents\":1850000,\"method\":\"eft\",\"status\":\"paid\"}"

echo "=== 11. PDF exports ==="
for kind in poe-pack workbook assessment moderation evidence-index; do
  out="/workspace/nibs-portal/uploads/smoke-$kind.pdf"
  code=$(curl -s -b $TMP/admin.jar -o "$out" -w '%{http_code}' "$BASE/api/pdf/$kind/$LEARNER_ID")
  if [[ "$code" == "200" ]] && [[ -s "$out" ]]; then ok "$kind ($(wc -c < "$out") bytes)"; else fail "$kind" "code=$code size=$(wc -c < "$out" 2>/dev/null)"; fi
done
code=$(curl -s -b $TMP/admin.jar -o /workspace/nibs-portal/uploads/smoke-missing.pdf -w '%{http_code}' "$BASE/api/pdf/missing-evidence")
[[ "$code" == "200" && -s /workspace/nibs-portal/uploads/smoke-missing.pdf ]] && ok "missing-evidence ($(wc -c < /workspace/nibs-portal/uploads/smoke-missing.pdf) bytes)" || fail "missing-evidence" "code=$code"
code=$(curl -s -b $TMP/admin.jar -o /workspace/nibs-portal/uploads/smoke-progress.pdf -w '%{http_code}' "$BASE/api/pdf/progress/$LEARNER_ID")
[[ "$code" == "200" && -s /workspace/nibs-portal/uploads/smoke-progress.pdf ]] && ok "progress ($(wc -c < /workspace/nibs-portal/uploads/smoke-progress.pdf) bytes)" || fail "progress" "code=$code"

echo "=== 12. All page routes (200) ==="
for p in / /login /apply /app /admin /facilitator /assessor /moderator /supervisor /finance \
         /admin/users /admin/course-builder /admin/curriculum-mapping /admin/poe-templates \
         /admin/reports /admin/audit /app/pathway /app/workbook /app/poe; do
  check_status "GET $p" 200 "$BASE$p" $TMP/admin.jar
done

echo "=== 13. After finance paid, pending learner is now active ==="
login pending@naleli.co.za Student123! pending2
check_contains "dashboard now active" "course_progress" "$BASE/api/learner/dashboard" $TMP/pending2.jar

echo
echo "================================================"
echo "PASS: $PASS    FAIL: $FAIL"
echo "================================================"
exit $FAIL
