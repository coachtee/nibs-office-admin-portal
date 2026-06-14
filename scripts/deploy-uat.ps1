# ============================================================
# NIBS Office Admin Portal — UAT deploy script (Windows PowerShell)
# Run from any Windows machine with ssh + scp available.
#
# Usage:
#   1. Open PowerShell as Administrator (so ssh-agent can persist keys)
#   2. .\deploy-uat.ps1
#
# It will:
#   - ssh into naleli@157.173.99.185
#   - create ~/office-admin-portal/ and clone the GitHub repo
#   - create the env file with the UAT settings
#   - build the Docker image
#   - create the container with the right port (8088), volumes, restart
#   - wait for the healthcheck
#   - report status
#
# The container is exposed on port 8088. Nginx Proxy Manager
# can then proxy uat-office.naleli.co.za -> 157.173.99.185:8088.
# ============================================================

# ====== Config ======
$SSH_USER   = "naleli"
$SSH_HOST   = "157.173.99.185"
$SSH_PORT   = 22
$REPO       = "git@github.com:coachtee/nibs-office-admin-portal.git"
$BRANCH     = "main"
$APP_DIR    = "$HOME/office-admin-portal"
$ENV_FILE   = "$APP_DIR/office-admin-portal.env"
$CONTAINER  = "office-admin-portal"
$IMAGE      = "office-admin-portal:uat"
$HTTP_PORT  = 8088
$ADMIN_EMAIL        = "admin@naleli.co.za"
$ADMIN_DEFAULT_PW   = "change-on-first-login"
$SESSION_SECRET     = "uat-CHANGE-ME-session-secret-rotate-in-prod-32chars-min"
$JWT_SECRET         = "uat-CHANGE-ME-jwt-secret-rotate-in-prod-32chars-min"

# ====== SSH wrapper ======
function Run-SSH {
    param([string]$Command, [int]$TimeoutSec = 120)
    Write-Host ">>> ssh $SSH_USER@$SSH_HOST $Command" -ForegroundColor DarkGray
    $result = ssh -p $SSH_PORT -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 `
        "$SSH_USER@$SSH_HOST" $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ssh command failed (exit $LASTEXITCODE)" -ForegroundColor Red
    }
    return $result
}

# ====== 1. Confirm we can reach the server ======
Write-Host ""
Write-Host "===== STEP 1: Confirm SSH connectivity =====" -ForegroundColor Cyan
$whoami = Run-SSH "whoami && uname -a && date"
if (-not $whoami) {
    Write-Host "Cannot reach $SSH_USER@$SSH_HOST — check VPN / network / firewall" -ForegroundColor Red
    exit 1
}
Write-Host $whoami

# ====== 2. Check / install Docker ======
Write-Host ""
Write-Host "===== STEP 2: Verify Docker is installed =====" -ForegroundColor Cyan
$dockerCheck = Run-SSH "command -v docker && docker --version"
if (-not $dockerCheck) {
    Write-Host "Docker not found — installing..." -ForegroundColor Yellow
    Run-SSH "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $SSH_USER"
    Write-Host "Docker installed. Re-login as $SSH_USER for the docker group to take effect." -ForegroundColor Green
    exit 0
} else {
    Write-Host $dockerCheck
}

# ====== 3. Clone or update the repo ======
Write-Host ""
Write-Host "===== STEP 3: Clone the GitHub repo =====" -ForegroundColor Cyan
Run-SSH "[ -d $APP_DIR/.git ] && (cd $APP_DIR && git fetch origin $BRANCH && git reset --hard origin/$BRANCH) || (git clone $REPO $APP_DIR && cd $APP_DIR && git checkout $BRANCH)"
$revParse = Run-SSH "cd $APP_DIR && git rev-parse --short HEAD"
Write-Host "  HEAD = $revParse"

# ====== 4. Write the env file (NEVER commit this) ======
Write-Host ""
Write-Host "===== STEP 4: Write env file =====" -ForegroundColor Cyan
$envContent = @"
APP_ENV=uat
APP_URL=https://uat-office.naleli.co.za
APP_PORT=$HTTP_PORT
NODE_ENV=production
PORT=$HTTP_PORT
SQLITE_PATH=/data/nibs.db
DB_PATH=/data/nibs.db
UPLOAD_DIR=/data/uploads
PDF_EXPORT_DIR=/data/uploads/exports
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_DEFAULT_PASSWORD=$ADMIN_DEFAULT_PW
SESSION_SECRET=$SESSION_SECRET
JWT_SECRET=$JWT_SECRET
DATABASE_URL=
"@
$envB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))
Run-SSH "mkdir -p $APP_DIR && echo $envB64 | base64 -d > $ENV_FILE && chmod 600 $ENV_FILE"
Write-Host "  Env file: $ENV_FILE (chmod 600)"

# ====== 5. Stop any existing container ======
Write-Host ""
Write-Host "===== STEP 5: Stop existing container (if any) =====" -ForegroundColor Cyan
Run-SSH "docker rm -f $CONTAINER 2>/dev/null; echo done"

# ====== 6. Create the persistent volumes (host paths) ======
Write-Host ""
Write-Host "===== STEP 6: Create host data dirs =====" -ForegroundColor Cyan
Run-SSH "mkdir -p $APP_DIR/data $APP_DIR/uploads $APP_DIR/exports && echo created"

# ====== 7. Build the image ======
Write-Host ""
Write-Host "===== STEP 7: Build Docker image (this may take 2-5 min on first run) =====" -ForegroundColor Cyan
$buildLog = Run-SSH "cd $APP_DIR && docker build -t $IMAGE . 2>&1 | tail -20"
Write-Host $buildLog

# ====== 8. Start the container ======
Write-Host ""
Write-Host "===== STEP 8: Start container =====" -ForegroundColor Cyan
$runCmd = @"
docker run -d `
  --name $CONTAINER `
  --restart unless-stopped `
  --env-file $ENV_FILE `
  -e PORT=$HTTP_PORT `
  -e APP_PORT=$HTTP_PORT `
  -e NODE_ENV=production `
  -e SQLITE_PATH=/data/nibs.db `
  -e DB_PATH=/data/nibs.db `
  -e UPLOAD_DIR=/data/uploads `
  -e PDF_EXPORT_DIR=/data/uploads/exports `
  -v $APP_DIR/data:/data `
  -v $APP_DIR/uploads:/data/uploads `
  -v $APP_DIR/exports:/data/uploads/exports `
  -p ${HTTP_PORT}:${HTTP_PORT} `
  --health-cmd "wget --no-verbose --tries=1 --spider http://127.0.0.1:${HTTP_PORT}/ || exit 1" `
  --health-interval 30s `
  --health-timeout 5s `
  --health-retries 3 `
  --health-start-period 10s `
  --log-driver json-file `
  --log-opt max-size=10m `
  --log-opt max-file=3 `
  $IMAGE
"@
$runB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($runCmd))
Run-SSH "echo $runB64 | base64 -d | sh"
$containerId = Run-SSH "docker ps -q -f name=$CONTAINER"
if (-not $containerId) {
    Write-Host "Container did not start. Logs:" -ForegroundColor Red
    Run-SSH "docker logs $CONTAINER 2>&1 | tail -30"
    exit 1
}
Write-Host "  container id: $containerId"

# ====== 9. Wait for healthcheck ======
Write-Host ""
Write-Host "===== STEP 9: Wait for healthcheck =====" -ForegroundColor Cyan
$healthy = $false
for ($i = 1; $i -le 30; $i++) {
    $h = Run-SSH "docker inspect --format='{{.State.Health.Status}}' $CONTAINER"
    if ($h -eq "healthy") { $healthy = $true; break }
    if ($h -eq "unhealthy") {
        Write-Host "  Container is unhealthy. Logs:" -ForegroundColor Red
        Run-SSH "docker logs $CONTAINER 2>&1 | tail -30"
        break
    }
    Write-Host "  ... waiting ($i/30): $h"
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Write-Host "Container did not become healthy in 60s" -ForegroundColor Red
    Run-SSH "docker logs $CONTAINER 2>&1 | tail -50"
    exit 1
}
Write-Host "  Container is HEALTHY" -ForegroundColor Green

# ====== 10. Show status ======
Write-Host ""
Write-Host "===== STEP 10: Final status =====" -ForegroundColor Cyan
Run-SSH "docker ps -f name=$CONTAINER --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
Write-Host ""
Write-Host "Logs (last 20 lines):" -ForegroundColor DarkGray
Run-SSH "docker logs $CONTAINER --tail 20"

# ====== 11. Test from server ======
Write-Host ""
Write-Host "===== STEP 11: Smoke test from server =====" -ForegroundColor Cyan
$httpCheck = Run-SSH "curl -sS -o /dev/null -w 'http://localhost:${HTTP_PORT}/ -> %{http_code}\n' http://localhost:${HTTP_PORT}/"
Write-Host $httpCheck

# ====== Done ======
Write-Host ""
Write-Host "===== DEPLOYMENT COMPLETE =====" -ForegroundColor Green
Write-Host ""
Write-Host "Container: $CONTAINER (running, healthy)"
Write-Host "Internal:  http://157.173.99.185:${HTTP_PORT}/"
Write-Host "Container logs: ssh $SSH_USER@$SSH_HOST 'docker logs -f $CONTAINER'"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Configure Nginx Proxy Manager: uat-office.naleli.co.za -> 157.173.99.185:${HTTP_PORT}"
Write-Host "  2. Open https://uat-office.naleli.co.za/ in a browser"
Write-Host "  3. Login as admin@naleli.co.za / change-on-first-login"
Write-Host "  4. Set a real password (forced on first login)"
Write-Host "  5. Run the smoke test: .\smoke-uat.ps1"
Write-Host ""
