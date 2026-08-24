# deploy-catalog-resume.ps1 - 续跑部署（跳过 commit/push/本地构建，仅打包上传 + 后端重启 + 管理后台部署）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\deploy-catalog-resume.ps1
# 前置: 管理后台 dist 已生成（dist-deploy/admin-dist.zip 存在即可），服务器 SSH 访问(交互输密码)
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$ErrorActionPreference = "Continue"

$SERVER = $env:ST_SERVER; if (-not $SERVER) { $SERVER = "129.204.227.200" }
$SSH_USER = $env:ST_SSH_USER; if (-not $SSH_USER) { $SSH_USER = "ubuntu" }

# ---- 1. 用现有 dist 重新打包（tar 不经过 node，规避 libuv 崩溃）----
$adminZip = Join-Path (Resolve-Path ".") "dist-deploy\admin-dist.zip"
if (Test-Path $adminZip) { Remove-Item $adminZip -Force }
& tar -a -c -f $adminZip -C "frontend/admin/dist" .
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] 打包失败"; exit 1 }
Write-Host ("[OK] admin dist: {0} ({1} bytes)" -f $adminZip, (Get-Item $adminZip).Length)

# ---- 2. 上传管理后台包 ----
Write-Host "上传 admin-dist.zip ..."
& scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$adminZip" "$SSH_USER@${SERVER}:/tmp/admin-dist.zip"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] admin scp 上传失败"; exit 1 }

# ---- 3. 部署后端（拉代码(容错) -> 构建 -> 安全重启 -> 健康检查）----
Write-Host "部署后端 ..."
$serverDeploy = 'cd /opt/shentong && (sudo git pull origin main 2>&1 | tail -2 || true) && cd backend && sudo rm -rf dist && sudo npm run build 2>&1 | tail -3 && sudo fuser -k 3001/tcp 2>/dev/null; sleep 2; sudo bash -c ''cd /opt/shentong/backend && nohup node /opt/shentong/backend/dist/main.js > server.log 2>&1 &''; sleep 12; curl -s http://127.0.0.1:3001/api/health; echo; sudo grep -iE ''ERROR|can.t resolve'' server.log | tail -8 || echo NO_ERRORS'
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$serverDeploy"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] 后端部署失败，请手动检查" }

# ---- 4. 部署管理后台（解压 -> 备份 -> 替换 -> 验证）----
Write-Host "部署管理后台 ..."
$serverAdmin = 'cd /tmp && sudo rm -rf admin-new && sudo mkdir admin-new && sudo unzip -q -o /tmp/admin-dist.zip -d /tmp/admin-new/ && sudo cp -r /usr/share/nginx/html/admin /usr/share/nginx/html/admin.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null; sudo rm -rf /usr/share/nginx/html/admin && sudo cp -r /tmp/admin-new /usr/share/nginx/html/admin && sudo chown -R www-data:www-data /usr/share/nginx/html/admin 2>/dev/null || true; curl -s https://zt.shentongapi.cn/admin/ | grep -oE ''assets/index-[A-Za-z0-9_.-]+'''
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$serverAdmin"

Write-Host ""
Write-Host "=== 部署完成 ==="
