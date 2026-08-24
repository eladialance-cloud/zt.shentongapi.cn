# 一键提交+推送：技能源名称中文化翻译脚本
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
Set-Location "D:\二次开发"
& $git add backend/scripts/translate-skill-names.js
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
& $git commit -m "feat(skill-market): 技能源名称批量中文化脚本-复用全局中转+AES解密+原文备份enName"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 失败，继续尝试 push"; }
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "=== 提交+推送完成 ==="