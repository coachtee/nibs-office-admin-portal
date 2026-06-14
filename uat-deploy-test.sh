#!/bin/bash
# UAT deploy verification — runs server, smoke test, first-login flow, all inline.
# Mirrors what Portainer will do.
set +e

cd /workspace/nibs-portal

export APP_ENV=uat
export APP_URL=https://uat-office.naleli.co.za
export APP_PORT=8088
export NODE_ENV=production
export PORT=8088
export SQLITE_PATH=./database/nibs.db
export DB_PATH=./database/nibs.db
export UPLOAD_DIR=./uploads
export PDF_EXPORT_DIR=./exports
export ADMIN_EMAIL=admin@naleli.co.za
export ADMIN_DEFAULT_PASSWORD=change-on-first-login
export SESSION_SECRET=uat-test-session-secret-rotate-in-production-32chars
export JWT_SECRET=uat-test-jwt-secret-rotate-in-production-32chars
export DATABASE_URL=

# Reset
pkill -9 -f "node server" 2>/dev/null
sleep 1
rm -f database/nibs.db*
mkdir -p uploads exports

echo "===== STAGE 1: SEED ====="
node server/seed/run.js > /tmp/stage1-seed.log 2>&1
SEED_EXIT=$?
echo "  seed exit: $SEED_EXIT"
tail -3 /tmp/stage1-seed.log
echo

echo "===== STAGE 2: VERIFY ENV + DB STATE ====="
node -e "
const db = require('./server/db');
const u = db.prepare(\"SELECT id, email, must_change_password FROM users WHERE role='admin'\").get();
console.log('  admin:', u.email, '| must_change_password:', u.must_change_password);
console.log('  (expect must_change_password: 1)');
const all = db.prepare('SELECT role, must_change_password, COUNT(*) c FROM users GROUP BY role, must_change_password').all();
console.log('  user counts by role:');
all.forEach(r => console.log('   ', r.role + ':', r.c, '| must_change:', r.must_change_password));
"
echo

echo "===== STAGE 3: START SERVER ====="
node server/index.js > /tmp/stage3-server.log 2>&1 &
SRV=$!
echo "  server PID: $SRV"
READY=0
for i in 1 2 3 4 5; do
  if curl -s -m 1 http://localhost:8088/healthz > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" = "0" ] && { echo "  FAILED to start"; cat /tmp/stage3-server.log; kill $SRV 2>/dev/null; exit 1; }
echo "  server ready in ${i}s"
echo "  --- server log ---"
cat /tmp/stage3-server.log | head -5
echo

echo "===== STAGE 4: 73/73 SMOKE TEST ====="
BASE=http://127.0.0.1:8088 bash docs/smoke.sh > /tmp/stage4-smoke.log 2>&1
SMOKE_EXIT=$?
echo "  smoke exit: $SMOKE_EXIT"
tail -3 /tmp/stage4-smoke.log
echo
FAIL_COUNT=$(grep -c "❌" /tmp/stage4-smoke.log)
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  --- failing checks ---"
  grep -B0 -A1 "❌" /tmp/stage4-smoke.log | head -30
fi
echo

echo "===== STAGE 5: FIRST-LOGIN SMOKE (admin) ====="
# Login with placeholder
LOGIN_HTTP=$(curl -s -c /tmp/admin.txt -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@naleli.co.za","password":"change-on-first-login"}' \
  -w "%{http_code}" -o /tmp/stage5-login.out)
echo "  5.1 Login as admin (placeholder): HTTP $LOGIN_HTTP (expect 200)"
cat /tmp/stage5-login.out
echo
# /me should show must_change_password=1
ME_HTTP=$(curl -s -b /tmp/admin.txt http://localhost:8088/api/auth/me -w "%{http_code}" -o /tmp/stage5-me.out)
MCP=$(python3 -c "import json; print(json.load(open('/tmp/stage5-me.out'))['user'].get('must_change_password'))" 2>/dev/null)
echo "  5.2 /me must_change_password: $MCP (expect 1)"
# Protected API before change
USERS_HTTP=$(curl -s -b /tmp/admin.txt http://localhost:8088/api/users -w "%{http_code}" -o /tmp/stage5-users.out)
USERS_ERR=$(python3 -c "import json; d=json.load(open('/tmp/stage5-users.out')); print(d.get('error','none'))" 2>/dev/null)
echo "  5.3 /api/users before change: HTTP $USERS_HTTP, error=$USERS_ERR (expect 403, error=must_change_password)"
# Change password
CHG_HTTP=$(curl -s -b /tmp/admin.txt -X POST http://localhost:8088/api/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{"new_password":"RealUatPassword!2026"}' -w "%{http_code}" -o /tmp/stage5-chg.out)
echo "  5.4 Change password: HTTP $CHG_HTTP (expect 200)"
cat /tmp/stage5-chg.out
echo
# /me should now show must_change_password=0
ME2_HTTP=$(curl -s -b /tmp/admin.txt http://localhost:8088/api/auth/me -w "%{http_code}" -o /tmp/stage5-me2.out)
MCP2=$(python3 -c "import json; print(json.load(open('/tmp/stage5-me2.out'))['user'].get('must_change_password'))" 2>/dev/null)
echo "  5.5 /me after change: must_change_password=$MCP2 (expect 0)"
# Protected API after change
USERS2_HTTP=$(curl -s -b /tmp/admin.txt http://localhost:8088/api/users -w "%{http_code}" -o /tmp/stage5-users2.out)
USERS2_LEN=$(python3 -c "import json; d=json.load(open('/tmp/stage5-users2.out')); print(len(d) if isinstance(d, list) else 'err:'+str(d)[:60])" 2>/dev/null)
echo "  5.6 /api/users after change: HTTP $USERS2_HTTP, users=$USERS2_LEN (expect 200, 11 users)"
echo

echo "===== STAGE 6: LEARNER FLOW (no gating) ====="
SLOGIN_HTTP=$(curl -s -c /tmp/student.txt -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@naleli.co.za","password":"Student123!"}' -w "%{http_code}" -o /dev/null)
echo "  6.1 Learner login: HTTP $SLOGIN_HTTP (expect 200)"
DASH_HTTP=$(curl -s -b /tmp/student.txt http://localhost:8088/api/learner/dashboard -w "%{http_code}" -o /tmp/stage6-dash.out)
DASH_NAME=$(python3 -c "import json; print(json.load(open('/tmp/stage6-dash.out')).get('user',{}).get('full_name','?'))" 2>/dev/null)
echo "  6.2 Learner dashboard: HTTP $DASH_HTTP, name=$DASH_NAME (expect 200, Amahle Khumalo)"
echo

echo "===== STAGE 7: PERSISTENT VOLUMES ====="
echo "test file" > uploads/test-persistence.txt
if [ -f uploads/test-persistence.txt ]; then
  echo "  7.1 uploads/test-persistence.txt created"
  echo "  7.2 (Portainer bind mount ./uploads:/data/uploads will preserve this across container restarts)"
else
  echo "  7.1 FAILED to create test file"
fi
echo

echo "===== STAGE 8: STOP SERVER ====="
kill $SRV 2>/dev/null
wait 2>/dev/null
echo "  8.1 Server stopped"
echo

echo "===== SUMMARY ====="
echo "  Seed:        exit=$SEED_EXIT"
echo "  Smoke:       exit=$SMOKE_EXIT, failures=$FAIL_COUNT"
echo "  Server log:  /tmp/stage3-server.log"
echo "  Smoke log:   /tmp/stage4-smoke.log"
echo "DONE"
