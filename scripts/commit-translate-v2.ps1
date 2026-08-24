# 一键提交+推送：翻译脚本改进版(批次40/max_tokens8000/json_object/健壮解析)
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
Set-Location "D:\二次开发"
& $git add backend/scripts/translate-skill-names.js
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
& $git commit -m "fix(translate): 批次40+max_tokens8000+response_format json_object+健壮解析-修复大批次截断导致解析失败"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 失败，继续尝试 push"; }
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "=== 提交+推送完成 ==="