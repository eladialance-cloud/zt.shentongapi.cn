# fix-commit-message.ps1 - 修正 7bcccb98 乱码提交信息并强制推送（仅在你确认需要时运行）
# Usage: powershell -ExecutionPolicy Bypass -File scripts\fix-commit-message.ps1
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $candidates = @(
    "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe"
  )
  $git = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $git) { Write-Host "[ERROR] git not found"; exit 1 }

# 只修正最近一个提交（7bcccb98），不改动任何文件内容
& $git --no-pager log --oneline -1
& $git commit --amend -m "fix(desktop): 运行时校验根因+内置清单兜底+旧版残留重装+.tmp清理+下载位置超时"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] amend failed"; exit 1 }
& $git --no-pager log --oneline -1

$url = "https://github.com/eladialance-cloud/zt.shentongapi.cn.git"
Write-Host ""
Write-Host "Force pushing main ..."
& $git push --force $url main
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] push main failed"; exit 1 }
Write-Host "Force pushing main:upgrade/electron-41 (restarts Desktop Build CI) ..."
& $git push --force $url main:upgrade/electron-41
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] push CI branch failed"; exit 1 }
Write-Host ""
Write-Host "DONE! 提交信息已修正，CI 已重新触发"
