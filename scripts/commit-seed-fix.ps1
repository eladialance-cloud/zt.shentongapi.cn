# 一键提交+推送：seed-skill-catalog.js .env 自动定位修复
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
Set-Location "D:\二次开发"
& $git add backend/scripts/seed-skill-catalog.js
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
& $git commit -m "fix(seed): 种子脚本自动定位backend/.env-不再依赖运行目录"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 失败，继续尝试 push"; }
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "=== 提交+推送完成 ==="