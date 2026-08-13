# deploy-video-claw.ps1 - VideoClaw 后端部署脚本（Task 7）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\deploy-video-claw.ps1
# 说明: 本地 git bundle -> scp 到服务器 -> 服务器 fetch bundle + reset + build + 重启 + 健康检查
# 注意: 桌面端安装包需另行构建并发布到 updates 目录（本脚本不含）
$ErrorActionPreference = "Continue"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
$SERVER = $env:ST_SERVER; if (-not $SERVER) { $SERVER = "129.204.227.200" }
$SSH_USER = $env:ST_SSH_USER; if (-not $SSH_USER) { $SSH_USER = "ubuntu" }

# ---- 1. 创建 bundle（带短 SHA 文件名）----
$short = (& $git rev-parse --short=8 HEAD).Trim()
if (-not $short) { Write-Host "[ERROR] 无法获取 HEAD"; exit 1 }
$bundle = Join-Path (Resolve-Path ".") "dist-deploy\shentong-main-$short.bundle"
if (Test-Path $bundle) { Remove-Item $bundle -Force }
& $git bundle create $bundle main
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] bundle 创建失败"; exit 1 }
Write-Host "[OK] bundle: $bundle"

# ---- 2. scp 上传 ----
& scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$bundle" "$SSH_USER@${SERVER}:/tmp/shentong-main-$short.bundle"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] scp 上传失败"; exit 1 }

# ---- 3. 服务器部署（fetch bundle -> reset -> build -> 重启 -> 健康检查）----
$serverDeploy = 'cd /opt/shentong && sudo git fetch /tmp/shentong-main-' + $short + '.bundle "+refs/heads/*:refs/remotes/bundle/*" && sudo git reset --hard bundle/main && git --no-pager log --oneline -1 && cd backend && sudo rm -rf dist && sudo npm run build 2>&1 | tail -3 && sudo fuser -k 3001/tcp 2>/dev/null; sleep 2; sudo bash -c ''cd /opt/shentong/backend && nohup node /opt/shentong/backend/dist/main.js > server.log 2>&1 &''; sleep 12; curl -s http://127.0.0.1:3001/api/health; echo; sudo grep -iE ''ERROR|can.t resolve|Duplicate'' server.log | tail -8 || echo NO_ERRORS'
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$serverDeploy"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] 后端部署失败，请手动检查" }

Write-Host ""
Write-Host "=== 部署完成 ==="
Write-Host "下一步（video-claw 运行时 + 桌面端发布）:"
Write-Host "  1) 构建运行时: powershell -ExecutionPolicy Bypass -File scripts\build-video-claw-runtime.ps1"
Write-Host "  2) 上传运行时: powershell -ExecutionPolicy Bypass -File scripts\upload-video-claw-runtime.ps1"
Write-Host "  3) 构建桌面端安装包 (desktop: npm run build:win) -> 上传 updates 目录（更新 latest.yml）"