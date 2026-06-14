#!/bin/bash
# UAT verification script — runs server + smoke + env-var flow in one go
set -e
cd /workspace/nibs-portal

export APP_ENV=uat
export APP_URL=https://uat-office.naleli.co.za
export APP_PORT=8088
export ADMIN_EMAIL=admin@naleli.co.za
export ADMIN_DEFAULT_PASSWORD=change-on-first-login
export SESSION_SECRET=test-uat-session-secret-replace-me-32chars
export JWT_SECRET=test-uat-jwt-secret-replace-me-32chars

# Start server
node server/index.js > /tmp/nibs.log 2>&1 &
SRV_PID=$!
echo "server PID: $SRV_PID"

# Wait for ready
READY=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -m 1 http://localhost:8088/healthz > /dev/null 2>&1; then
    READY=1
    echo "ready in ${i}s"
    break
  fi
  sleep 1
done

if [ "$READY" = "0" ]; then
  echo "FAILED to start"
  cat /tmp/nibs.log
  kill $SRV_PID 2>/dev/null || true
  exit 1
fi

cleanup() { kill $SRV_PID 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT

echo
echo "=== smoke test (73 checks) ==="
BASE=http://127.0.0.1:8088 bash docs/smoke.sh 2>&1 | tail -3

echo
echo "=== env-var flow: login with placeholder ==="
curl -s -c /tmp/admin.txt -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@naleli.co.za","password":"change-on-first-login"}'
echo

echo
echo "=== /me must_change_password=1 ==="
curl -s -b /tmp/admin.txt http://localhost:8088/api/auth/me | python3 -c "import json,sys; print('must_change_password:', json.load(sys.stdin)['user'].get('must_change_password'))"

echo
echo "=== protected API before password change (expect 403) ==="
curl -s -b /tmp/admin.txt http://localhost:8088/api/users
echo

echo
echo "=== change password ==="
curl -s -b /tmp/admin.txt -X POST http://localhost:8088/api/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{"new_password":"RealUatPassword!2026"}'
echo

echo
echo "=== protected API after change (expect users list) ==="
curl -s -b /tmp/admin.txt http://localhost:8088/api/users | python3 -c "import json,sys; d=json.load(sys.stdin); print('users:', len(d) if isinstance(d, list) else 'err')"

echo
echo "=== /me must_change_password=0 ==="
curl -s -b /tmp/admin.txt http://localhost:8088/api/auth/me | python3 -c "import json,sys; print('must_change_password:', json.load(sys.stdin)['user'].get('must_change_password'))"

echo
echo "=== file persistence check ==="
mkdir -p uploads
echo "test file" > uploads/test-persistence.txt
echo "uploads/test-persistence.txt exists?" && [ -f uploads/test-persistence.txt ] && echo "  YES" || echo "  NO"

echo
echo "=== DONE ==="
