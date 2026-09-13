<#
  scripts/commit-all.ps1
  作用：把「源码改动」一次性提交进 git，自动排除本地草稿、临时产物与大文件。
  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\commit-all.ps1 -Message "feat: xxx"
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\commit-all.ps1 -Message "feat: xxx" -Push
  行为：
    1. 清掉上次 git 被打断留下的 .git/index.lock（若仍有 git 进程在跑则直接退出）
    2. 只暂存 $Paths 里的源码目录；根目录的 .tmp-* / _probe_* / _sbx_* / _refs / en-common.ts 等草稿一律不进
    3. 提交前巡检：命中草稿规则或存在 >5MB 文件就中止并列出，不会硬提交
    4. 打印顶层目录汇总后提交；-Push 才会推送
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Message,
  [string[]]$Paths = @('.github', 'backend', 'desktop', 'frontend', 'deploy', 'scripts', 'video-claw'),
  [switch]$Push,
  [switch]$AllowLargeFiles,
  [string]$Remote = 'origin'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot
Write-Host "[repo] $RepoRoot"

$JunkPattern = '(^\.tmp-|^_probe|^_sbx|^_refs/|^en-common\.ts$|^zh-chat\.ts$|^zh-common\.ts$)'
$MaxFileMB = 5

# --- 1. 陈旧 index.lock ---
$lock = Join-Path $RepoRoot '.git\index.lock'
if (Test-Path -LiteralPath $lock) {
  $ageMin = ((Get-Date) - (Get-Item -LiteralPath $lock).LastWriteTime).TotalMinutes
  $running = @(Get-Process -Name git, git-remote-https, git-remote-ssh -ErrorAction SilentlyContinue)
  if ($running.Count -gt 0) {
    Write-Warning ("检测到 git 进程仍在运行 (PID: {0})，请先结束它们再重跑。" -f ($running.Id -join ', '))
    exit 1
  }
  Remove-Item -LiteralPath $lock -Force
  Write-Host ("[lock] 已删除陈旧锁（存在 {0:N0} 分钟）" -f $ageMin) -ForegroundColor Green
}

# --- 2. 暂存 ---
Write-Host ("[add] " + ($Paths -join ' '))
& git add -- $Paths
if ($LASTEXITCODE -ne 0) { Write-Error 'git add 失败'; exit 1 }

# --- 3. 巡检 ---
$staged = @(& git diff --cached --name-only)
if ($staged.Count -eq 0) { Write-Warning '没有任何改动被暂存，退出。'; exit 1 }

$junk = @($staged | Where-Object { $_ -match $JunkPattern })
if ($junk.Count -gt 0) {
  Write-Warning '检测到疑似本地草稿，已中止（未提交）：'
  $junk | ForEach-Object { Write-Host "  $_" }
  exit 1
}

$big = @()
foreach ($f in $staged) {
  if (Test-Path -LiteralPath $f -PathType Leaf) {
    $mb = (Get-Item -LiteralPath $f).Length / 1MB
    if ($mb -gt $MaxFileMB) { $big += ('{0,8:N2}MB  {1}' -f $mb, $f) }
  }
}
if ($big.Count -gt 0 -and -not $AllowLargeFiles) {
  Write-Warning ("检测到超过 {0}MB 的文件，已中止（确认要提交就加 -AllowLargeFiles 重跑）：" -f $MaxFileMB)
  $big | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# --- 4. 汇总 ---
Write-Host ("[staged] {0} 个文件，按顶层目录：" -f $staged.Count)
$staged | ForEach-Object { ($_ -split '/')[0] } | Group-Object |
  Sort-Object Count -Descending | ForEach-Object { Write-Host ("  {0,-12} {1}" -f $_.Name, $_.Count) }

# --- 5. 提交 ---
& git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Error 'git commit 失败'; exit 1 }
& git --no-pager log --oneline -1

# --- 6. 可选推送 ---
if ($Push) {
  & git push $Remote HEAD
  if ($LASTEXITCODE -ne 0) { Write-Error 'git push 失败'; exit 1 }
  Write-Host '[push] 完成' -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host '提交完成（仅本地）。要推上去再执行：' -ForegroundColor Yellow
  Write-Host '  cd D:\二次开发; git push origin HEAD'
  Write-Host '  注意：当前分支 upgrade/electron-41 被 .github/workflows/desktop-build.yml 监听，push 会触发 Actions 重新打包（只出 artifact，不动生产）。'
}