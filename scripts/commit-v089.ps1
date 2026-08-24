# 一键提交+推送：翻译脚本改进 + 桌面端版本0.8.8(CI将构建0.8.9)
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
Set-Location "D:\二次开发"
& $git add backend/scripts/translate-skill-names.js desktop/package.json
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
& $git commit -m "feat(skill-market): 翻译脚本健壮化(批次40/json_object/容错解析)+桌面端版本0.8.9-开源技能库中文技能名"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 失败，继续尝试 push"; }
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "=== 提交+推送完成 ==="