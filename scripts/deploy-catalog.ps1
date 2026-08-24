# deploy-catalog.ps1 - 一键部署「技能目录仓库自动展开」功能（后端 + 管理后台）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\deploy-catalog.ps1
# 前置: GitHub 凭据(Windows 凭据管理器) + 服务器 SSH 访问(交互输密码)
# 注意: 远端命令统一用单引号（PowerShell 5.1 传参给 ssh.exe 会吞掉双引号，单引号安全）
#       pkill 用 main[.]js 方括号技巧避免匹配到远程 shell 自身
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$ErrorActionPreference = "Continue"

$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe" }
$remote = "https://github.com/eladialance-cloud/zt.shentongapi.cn.git"
$SERVER = $env:ST_SERVER; if (-not $SERVER) { $SERVER = "129.204.227.200" }
$SSH_USER = $env:ST_SSH_USER; if (-not $SSH_USER) { $SSH_USER = "ubuntu" }

# ---- 1. 暂存并提交本轮改动（仅目录展开功能相关文件）----
$files = @(
  "backend/src/common/utils/db-migration.ts",
  "backend/src/modules/admin-imports/admin-imports.service.ts",
  "backend/src/modules/admin-imports/dto/create-import.dto.ts",
  "backend/src/modules/admin-imports/entities/asset-import-job.entity.ts",
  "backend/src/modules/admin-imports/parsers/skill-catalog-parser.ts",
  "backend/src/modules/admin-imports/parsers/skill-catalog-expander.ts",
  "backend/test/unit/import-parsers.spec.ts",
  "frontend/admin/src/api/admin-imports-api.ts",
  "frontend/admin/src/pages/Imports/index.tsx",
  "frontend/admin/src/types/admin-imports.ts"
)
& $git add -- $files
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
$staged = @(& $git diff --cached --name-only)
if ($staged.Count -eq 0) { Write-Host "[INFO] 无新增暂存改动，跳过 commit" }
else {
  $staged | ForEach-Object { Write-Host "  $_" }
  & $git commit -m "feat(admin-imports): 技能目录仓库自动展开-awesome-openclaw-skills类categories索引按分类轮询拉取SKILL.md生成草稿+maxSkills参数+目录统计"
  if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git commit 失败"; exit 1 }
}

# ---- 2. 推送 main + upgrade/electron-41（失败重试最多 10 次）----
$mainOk = $false
for ($i = 1; $i -le 10; $i++) {
  Write-Host ("--- 第 {0} 次尝试 main ---" -f $i)
  & $git push $remote main
  if ($LASTEXITCODE -eq 0) { Write-Host "main 推送成功"; $mainOk = $true; break }
  Start-Sleep -Seconds 10
}
if (-not $mainOk) { Write-Host "[ERROR] main 推送失败（网络持续不通）"; exit 1 }
$branchOk = $false
for ($j = 1; $j -le 10; $j++) {
  Write-Host ("--- 第 {0} 次尝试 upgrade/electron-41 ---" -f $j)
  & $git push $remote main:upgrade/electron-41
  if ($LASTEXITCODE -eq 0) { Write-Host "upgrade/electron-41 推送成功"; $branchOk = $true; break }
  Start-Sleep -Seconds 10
}
if (-not $branchOk) { Write-Host "[WARN] upgrade/electron-41 推送失败（可后续单独补推）" }

# ---- 3. 构建管理后台前端并打包（tar 保证 zip 内正斜杠路径）----
Write-Host ""
Write-Host "构建管理后台前端 ..."
Push-Location "frontend/admin"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] admin build 失败"; Pop-Location; exit 1 }
Pop-Location
$adminZip = Join-Path (Resolve-Path ".") "dist-deploy\admin-dist.zip"
if (Test-Path $adminZip) { Remove-Item $adminZip -Force }
& tar -a -c -f $adminZip -C "frontend/admin/dist" .
Write-Host ("[OK] admin dist: {0} ({1} bytes)" -f $adminZip, (Get-Item $adminZip).Length)

# ---- 4. 上传管理后台包到服务器 ----
Write-Host "上传 admin-dist.zip ..."
& scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$adminZip" "$SSH_USER@${SERVER}:/tmp/admin-dist.zip"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] admin scp 上传失败"; exit 1 }

# ---- 5. 部署后端（拉代码 -> 构建 -> 重启 -> 健康检查）----
Write-Host "部署后端 ..."
$serverDeploy = 'cd /opt/shentong && (sudo git pull origin main 2>&1 | tail -2 || true) && cd backend && sudo rm -rf dist && sudo npm run build 2>&1 | tail -3 && sudo fuser -k 3001/tcp 2>/dev/null; sleep 2; sudo bash -c ''cd /opt/shentong/backend && nohup node /opt/shentong/backend/dist/main.js > server.log 2>&1 &''; sleep 12; curl -s http://127.0.0.1:3001/api/health; echo; sudo grep -iE ''ERROR|can.t resolve'' server.log | tail -8 || echo NO_ERRORS'
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$serverDeploy"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] 后端部署失败，请手动检查" }

# ---- 6. 部署管理后台（解压 -> 备份 -> 替换 -> 验证）----
Write-Host "部署管理后台 ..."
$serverAdmin = 'cd /tmp && sudo rm -rf admin-new && sudo mkdir admin-new && sudo unzip -q -o /tmp/admin-dist.zip -d /tmp/admin-new/ && sudo cp -r /usr/share/nginx/html/admin /usr/share/nginx/html/admin.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null; sudo rm -rf /usr/share/nginx/html/admin && sudo cp -r /tmp/admin-new /usr/share/nginx/html/admin && sudo chown -R www-data:www-data /usr/share/nginx/html/admin 2>/dev/null || true; curl -s https://zt.shentongapi.cn/admin/ | grep -oE ''assets/index-[A-Za-z0-9_.-]+'''
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$serverAdmin"

Write-Host ""
Write-Host "=== 部署完成 ==="
