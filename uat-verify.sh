#!/bin/bash
# Option A verification — runs the canonical 73-check smoke test with
# ADMIN_DEFAULT_PASSWORD=change-on-first-login (production UAT flow).
set +e
cd /workspace/nibs-portal

# 1. Clean DB and re-seed with the env that triggers must_change_password
pkill -9 -f "node " 2>/dev/null
sleep 1
rm -f database/nibs.db
ADMIN_DEFAULT_PASSWORD=change-on-first-login \
ADMIN_EMAIL=admin@naleli.co.za \
node server/seed/run.js > /tmp/s1-seed.txt 2>&1
echo "STEP1 seed exit: $?"

# 2. Verify admin state
node -e "
const db = require('./server/db');
const u = db.prepare(\"SELECT email, must_change_password FROM users WHERE role='admin'\").get();
console.log(JSON.stringify(u));
" > /tmp/s2-check.txt 2>&1
cat /tmp/s2-check.txt

# 3. Start the server
node server/index.js > /tmp/s3-srv.txt 2>&1 &
SRV=$!
echo "STEP3 server PID: $SRV"

# 4. Wait for ready
for i in 1 2 3 4 5 6 7 8; do
  if curl -s -m 1 http://localhost:8088/healthz > /dev/null 2>&1; then
    echo "ready in ${i}s"
    break
  fi
  sleep 1
done

# 5. Run the smoke test WITH the same env so the seed matches
ADMIN_DEFAULT_PASSWORD=change-on-first-login \
ADMIN_EMAIL=admin@naleli.co.za \
BASE=http://127.0.0.1:8088 \
bash docs/smoke.sh > /tmp/s4-smoke.txt 2>&1
SMOKE_EXIT=$?
echo "STEP5 smoke exit: $SMOKE_EXIT"
tail -3 /tmp/s4-smoke.txt
echo
echo "PASS: $(grep -c '✅' /tmp/s4-smoke.txt) FAIL: $(grep -c '❌' /tmp/s4-smoke.txt)"
echo
echo "--- failures (if any) ---"
grep "❌" /tmp/s4-smoke.txt | head -10

# 6. Stop server
kill $SRV 2>/dev/null
wait 2>/dev/null
echo "DONE"
