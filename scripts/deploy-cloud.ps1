# deploy-cloud.ps1 - 一键部署到云端（提交->推送触发CI->等待构建->下载安装包->部署管理后台->部署后端->上传安装包）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\deploy-cloud.ps1
# 前置: 本机已配置 GitHub 凭据(Windows 凭据管理器) + 服务器 SSH 访问(交互输密码)
# 说明: 脚本只做推送/等待/下载/部署，不修改任何业务代码。

$ErrorActionPreference = "Continue"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')) -ErrorAction Stop

$REPO = "eladialance-cloud/zt.shentongapi.cn"
$PUSH_URL = "https://github.com/$REPO.git"
$SERVER = $env:ST_SERVER
if (-not $SERVER) { $SERVER = "129.204.227.200" }
$SSH_USER = $env:ST_SSH_USER
if (-not $SSH_USER) { $SSH_USER = "ubuntu" }
$COMMIT_MSG = "feat(admin-model): 全局中转+6分类模型上架(文本/识图/绘画/语音/视频)+llm-proxy多模态网关(images/audio/video)+桌面端模型设置页与媒体弹窗网关化(版本0.8.4->0.8.5,CI构建0.8.6)"

# ---- locate git ----
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $git = @(
    "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $git) { Write-Host "[ERROR] git not found"; exit 1 }
Write-Host "git: $git"

# ---- 获取 GitHub Token（从 Windows 凭据管理器读取）----
function Get-GitHubToken {
  $credOut = @("protocol=https", "host=github.com", "") -join [char]10 | & $git credential fill 2>$null
  $token = $null
  foreach ($line in $credOut) {
    if ($line -like "password=*") { $token = $line.Substring(9); break }
  }
  return $token
}
$token = $null
if ($env:GH_TOKEN) { $token = $env:GH_TOKEN }
if (-not $token) { $token = Get-GitHubToken }
if (-not $token) {
  Write-Host "[ERROR] 未找到 GitHub Token。请设置环境变量 GH_TOKEN 或运行: git credential-manager github login"
  exit 1
}
$headers = @{ Authorization = "Bearer $token"; "User-Agent" = "deploy-cloud" }
Write-Host "[OK] GitHub token obtained"

# ---- 1. 暂存并提交本轮改动 ----
$files = @(
  "backend/package.json",
  "backend/src/common/utils/db-migration.ts",
  "backend/src/modules/admin-model/admin-model.service.ts",
  "backend/src/modules/admin-model/dto/create-model.dto.ts",
  "backend/src/modules/admin-model/dto/create-provider.dto.ts",
  "backend/src/modules/admin-model/dto/update-model.dto.ts",
  "backend/src/modules/admin-model/dto/update-provider.dto.ts",
  "backend/src/modules/admin-model/entities/model-provider.entity.ts",
  "backend/src/modules/admin-model/utils/relay-resolver.ts",
  "backend/src/modules/chat/chat.module.ts",
  "backend/src/modules/chat/controllers/chat-accounting.controller.ts",
  "backend/src/modules/chat/controllers/llm-proxy.controller.ts",
  "backend/src/modules/chat/services/chat-accounting.service.ts",
  "backend/src/modules/chat/services/llm-proxy.service.ts",
  "backend/src/modules/media-generation/generation-client.service.ts",
  "backend/src/modules/media-generation/media-generation.service.ts",
  "backend/src/modules/model/entities/model.entity.ts",
  "backend/src/modules/model/services/model.service.ts",
  "backend/src/modules/user/entities/user.entity.ts",
  "backend/test/unit/llm-proxy-gateway.spec.ts",
  "desktop/package.json",
  "desktop/src/api/chat-api.ts",
  "desktop/src/api/media-generation-api.ts",
  "desktop/src/pages/Chat/components/MediaGenerationModal.tsx",
  "desktop/src/pages/Chat/index.tsx",
  "desktop/src/pages/Settings/index.tsx",
  "desktop/src/pages/Settings/Models.tsx",
  "frontend/admin/src/pages/Agents/index.tsx",
  "frontend/admin/src/pages/Models/ProviderImportModal.tsx",
  "frontend/admin/src/pages/Models/index.tsx",
  "frontend/admin/src/types/admin-model.ts"
)
& $git add -f $files 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add failed"; exit 1 }
$staged = @(& $git diff --cached --name-only)
if ($staged.Count -eq 0) {
  Write-Host "[INFO] 无新增暂存改动，跳过 commit"
} else {
  Write-Host "Staged files:"
  $staged | ForEach-Object { Write-Host "  $_" }
  & $git commit -m $COMMIT_MSG
  if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git commit failed"; exit 1 }
  & $git --no-pager log --oneline -1
}
# ---- 2. 推送 main + CI 分支（触发 Desktop Build）----
Write-Host ""
Write-Host "Pushing main ..."
& $git push $PUSH_URL main
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] push main failed"; exit 1 }
Write-Host "Pushing main:upgrade/electron-41 (triggers Desktop Build CI) ..."
& $git push $PUSH_URL main:upgrade/electron-41
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] 普通推送失败，改用 force push（该分支仅为 main 镜像）..."
  & $git push --force $PUSH_URL main:upgrade/electron-41
  if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] push CI branch failed"; exit 1 }
}

# ---- 3. 等待 CI 构建完成 ----
Write-Host ""
Write-Host "Waiting for CI build (Desktop Build) ..."
$runId = $null
for ($i = 0; $i -lt 180; $i++) {
  Start-Sleep -Seconds 10
  try {
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/actions/runs?branch=upgrade/electron-41&event=push&per_page=3" -Headers $headers
  } catch { continue }
  $run = $runs.workflow_runs | Where-Object { $_.name -eq "Desktop Build" } | Select-Object -First 1
  if (-not $run) { continue }
  $runId = $run.id
  Write-Host ("  run #{0} status={1} conclusion={2}" -f $run.id, $run.status, $run.conclusion)
  if ($run.status -eq "completed") {
    if ($run.conclusion -ne "success") { Write-Host "[ERROR] CI 构建失败: https://github.com/$REPO/actions/runs/$($run.id)"; exit 1 }
    break
  }
}
if (-not $runId) { Write-Host "[ERROR] 未找到 CI 运行（轮询超时）"; exit 1 }

# ---- 4. 下载安装包产物 ----
Write-Host ""
Write-Host "Downloading artifacts ..."
$dlDir = Join-Path (Resolve-Path ".") "dist-deploy"
New-Item -ItemType Directory -Force -Path $dlDir | Out-Null
$art = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/actions/runs/$runId/artifacts" -Headers $headers
$winArt = $art.artifacts | Where-Object { $_.name -like "*desktop-windows*" -or $_.name -like "*windows*" } | Select-Object -First 1
if (-not $winArt) { Write-Host "[ERROR] 未找到 windows 产物"; exit 1 }
$zipPath = Join-Path $dlDir ($winArt.name + ".zip")
Invoke-WebRequest -Uri "https://api.github.com/repos/$REPO/actions/artifacts/$($winArt.id)/zip" -Headers $headers -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $dlDir -Force
$exe = Get-ChildItem $dlDir -Filter "ShenTongAI-Setup-*.exe" | Select-Object -First 1
$yml = Get-ChildItem $dlDir -Filter "latest.yml" | Select-Object -First 1
if (-not $exe -or -not $yml) { Write-Host "[ERROR] 产物缺少 exe 或 latest.yml"; exit 1 }
Write-Host ("[OK] installer: {0} ({1} bytes)" -f $exe.Name, $exe.Length)

# ---- 5. 构建管理后台前端 ----
Write-Host ""
Write-Host "Building admin frontend ..."
Push-Location "frontend/admin"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] admin build failed"; Pop-Location; exit 1 }
Pop-Location
$adminZip = Join-Path $dlDir "admin-dist.zip"
if (Test-Path $adminZip) { Remove-Item $adminZip -Force }
Compress-Archive -Path "frontend/admin/dist/*" -DestinationPath $adminZip -Force
Write-Host ("[OK] admin dist: {0} ({1} bytes)" -f $adminZip, (Get-Item $adminZip).Length)

# ---- 6. 部署后端到服务器（含 ffmpeg + nginx 补丁）----
Write-Host ""
Write-Host "Deploying backend to $SSH_USER@$SERVER ..."
$serverEnv = 'command -v ffmpeg >/dev/null 2>&1 || (sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg); if ! sudo grep -q client_max_body_size /etc/nginx/nginx.conf; then sudo sed -i "s/^http {/http {\\n    client_max_body_size 200m;/" /etc/nginx/nginx.conf; fi; sudo nginx -t && sudo systemctl reload nginx || echo NGINX_PATCH_FAILED; echo ENV_DONE'
$serverDeploy = 'cd /opt/shentong && sudo git pull origin main && cd backend && sudo npm ci 2>&1 | tail -2 && sudo npm run build 2>&1 | tail -3 && sudo pkill -9 -f "node dist/main.js"; sleep 2; sudo nohup node dist/main.js > server.log 2>&1 & sleep 8; curl -s http://127.0.0.1:3001/api/health; echo'
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" "$serverEnv && $serverDeploy"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] 后端部署失败，请手动执行（建议 root 登录）："
  Write-Host "  ssh $SSH_USER@$SERVER"
  Write-Host "  cd /opt/shentong && git pull origin main && cd backend && npm ci && npm run build && pkill -9 -f 'node dist/main.js'; sleep 2; nohup node dist/main.js > server.log 2>&1 & sleep 8; curl -s http://127.0.0.1:3001/api/health; echo"
}

# ---- 7. 上传并部署管理后台 ----
Write-Host ""
Write-Host "Uploading admin dist ..."
& scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$adminZip" "$SSH_USER@${SERVER}:/tmp/admin-dist.zip"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] admin scp 上传失败"; exit 1 }
$serverAdmin = 'cd /tmp && sudo rm -rf admin-new && sudo mkdir admin-new && sudo unzip -q -o /tmp/admin-dist.zip -d /tmp/admin-new/ && sudo cp -r /usr/share/nginx/html/admin /usr/share/nginx/html/admin.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null; sudo rm -rf /usr/share/nginx/html/admin && sudo cp -r /tmp/admin-new /usr/share/nginx/html/admin && sudo chown -R www-data:www-data /usr/share/nginx/html/admin 2>/dev/null || true; curl -s -o /dev/null -w "admin:%{http_code}" https://zt.shentongapi.cn/admin/; echo'
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" "$serverAdmin"

# ---- 8. 上传安装包并更新 latest.yml ----
Write-Host ""
Write-Host "Uploading installer to $SSH_USER@$SERVER ..."
& scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$($exe.FullName)" "$($yml.FullName)" "$SSH_USER@${SERVER}:/tmp/"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] scp 上传失败"; exit 1 }
$serverUpdTemplate = 'cd /opt/shentong/updates && sudo cp latest.yml latest.yml.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null; sudo mv /tmp/__EXE__ /tmp/latest.yml /opt/shentong/updates/ && sudo zip -j __EXE__.zip __EXE__ && sudo chown -R www-data:www-data /opt/shentong/updates && echo --- latest.yml --- && curl -s https://zt.shentongapi.cn/desktop/latest.yml | head -5'
$serverUpd = $serverUpdTemplate.Replace("__EXE__", $exe.Name)
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" "$serverUpd"
Write-Host ""
Write-Host "=== 部署完成 ==="
Write-Host "安装包: https://zt.shentongapi.cn/desktop/$($exe.Name).zip"
