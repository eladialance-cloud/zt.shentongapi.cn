# 三省六部真机联调（T2.2）：真实 Hermes 0.20.5 运行时 + 真实 llm-proxy 配置 + 真实看板，逐节点跑完整编排
# 前置条件：应用已登录（userData/hermes-home/config.yaml 已由应用写入 llm-proxy 配置），Hermes 运行时已下载（0.20.5）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/edict-real-machine-integration.ps1
# 参数：
#   -AppUserData <dir>   应用 userData（默认 %APPDATA%\shentong-ai-desktop）
#   -RuntimeRoot <dir>   Hermes 运行时根（默认 <userData>\runtime）
#   -DevDesktop <dir>    开发仓库 desktop 目录（默认脚本同级的上一级）
#   -NoProfilesEnsure    跳过 profile 引导（只跑编排）
param(
  [string]$AppUserData = "",
  [string]$RuntimeRoot = "",
  [string]$DevDesktop = "",
  [switch]$NoProfilesEnsure
)
$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---- 1. 路径解析 ----
if (-not $AppUserData) { $AppUserData = Join-Path $env:APPDATA "shentong-ai-desktop" }
if (-not $RuntimeRoot) { $RuntimeRoot = Join-Path $AppUserData "runtime" }
if (-not $DevDesktop)  { $DevDesktop = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }

$hermesRoot = Join-Path $RuntimeRoot "hermes"
$hermesHome = Join-Path $AppUserData "hermes-home"
$edictHome  = Join-Path $AppUserData "edict-data"

Write-Host "========================================================"
Write-Host " 三省六部真机联调（T2.2）"
Write-Host "========================================================"
Write-Host "AppUserData : $AppUserData"
Write-Host "HermesRoot  : $hermesRoot"
Write-Host "HermesHome  : $hermesHome"
Write-Host "EdictHome   : $edictHome"
Write-Host "DevDesktop  : $DevDesktop"
# profile create 必须显式指定 HERMES_HOME（否则 Hermes 落到 %LOCALAPPDATA%\hermes，权限/路径不可控）
$env:HERMES_HOME = $hermesHome
Write-Host ""

# ---- 2. 运行时探测（0.20.5 布局优先）----
function Find-First([string[]]$Paths) {
  foreach ($p in $Paths) { if ($p -and (Test-Path $p)) { return $p } }
  return ""
}
$nodeExe = Find-First @(
  (Join-Path $hermesRoot "node\node.exe"),
  (Join-Path $hermesRoot "node\node.exe")
)
$hermesEntry = Find-First @(
  (Join-Path $hermesRoot "node_modules\hermes-agent\bin\hermes.js")
)
$hermesExe = Find-First @(
  (Join-Path $hermesRoot "node_modules\hermes-agent\runtime\hermes-agent\venv\Scripts\hermes.exe"),
  (Join-Path $hermesRoot "hermes.exe")
)
$pythonExe = Find-First @(
  (Join-Path $hermesRoot "python\python.exe"),
  (Get-ChildItem (Join-Path $hermesRoot "node_modules\hermes-agent\runtime\python") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "cpython-*" } | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "python.exe" }),
  (Join-Path $hermesRoot "node_modules\hermes-agent\runtime\hermes-agent\venv\Scripts\python.exe")
)
$kanban = Join-Path $edictHome "scripts\kanban_update.py"
$tasks  = Join-Path $edictHome "data\tasks_source.json"
$globalCfg = Join-Path $hermesHome "config.yaml"

Write-Host "nodeExe    : $nodeExe"
Write-Host "hermesJs   : $hermesEntry"
Write-Host "hermesExe  : $hermesExe"
Write-Host "pythonExe  : $pythonExe"
Write-Host "kanban     : $kanban"
Write-Host "config.yaml: $globalCfg"
Write-Host ""

$missing = @()
if (-not $nodeExe)      { $missing += "node.exe（Hermes 运行时未下载完整）" }
if (-not $hermesEntry)  { $missing += "hermes.js（Hermes 运行时未下载完整）" }
if (-not $pythonExe)    { $missing += "python.exe（Hermes 运行时未下载完整）" }
if (-not (Test-Path $kanban)) { $missing += "kanban_update.py（edict 运行时未引导，先启动一次应用）" }
if (-not (Test-Path $globalCfg)) { $missing += "config.yaml（应用内先登录一次，生成 llm-proxy 配置）" }
if ($missing.Count -gt 0) {
  Write-Host "[FAIL] 缺少：" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host "请先在应用内登录并启动一次（生成 config.yaml 与 edict-data），确认 Hermes 服务正常后重跑本脚本。"
  exit 1
}

# ---- 3. profile 引导（幂等）----
if (-not $NoProfilesEnsure) {
  Write-Host "---- [3/5] 引导 11 个官署 profiles ----"
  $soulDir = Join-Path $DevDesktop "resources\edict\profiles"
  $profileRoot = Join-Path $hermesHome "profiles"
  $profiles = @("zhongshu","menxia","shangshu","libu","hubu","libu_hr","bingbu","xingbu","gongbu","zaochao","qintianjian")
  foreach ($id in $profiles) {
    $dir = Join-Path $profileRoot $id
    if (-not (Test-Path $dir)) {
      Write-Host "  [create] $id"
      # PS 5.1 会把 stderr 当 ErrorRecord（EAP=Stop 时直接抛错）；
      # Hermes 创建 wrapper 失败等仅属警告，按退出码与目录存在性判定真实成败
      $prevEAP = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      & $nodeExe $hermesEntry profile create $id --description "$id profile" --no-skills 2>&1 | Out-Null
      $ErrorActionPreference = $prevEAP
    }
    $soul = Join-Path $soulDir "$id.md"
    $soulDst = Join-Path $dir "SOUL.md"
    # profile create 会先写默认模板；识别默认模板则覆盖为官署人设，用户自定义保留
    $isDefaultSoul = $false
    if (Test-Path $soulDst) { $soulText = Get-Content -Raw -Encoding UTF8 $soulDst; if ($soulText -match "You are Hermes Agent, an intelligent AI assistant created by Nous Research") { $isDefaultSoul = $true } }
    if ((Test-Path $soul) -and (-not (Test-Path $soulDst) -or $isDefaultSoul)) { Copy-Item -Force $soul $soulDst }
  }
  # 同步 config.yaml 到每个 profile
  $cfgText = Get-Content -Raw -Encoding UTF8 $globalCfg
  foreach ($id in $profiles) {
    $dir = Join-Path $profileRoot $id
    if (Test-Path $dir) {
      $target = Join-Path $dir "config.yaml"
      $cur = ""
      if (Test-Path $target) { $cur = Get-Content -Raw -Encoding UTF8 $target }
      if ($cur -ne $cfgText) { Set-Content -Path $target -Value $cfgText -Encoding UTF8 -NoNewline }
    }
  }
  Write-Host "  [ok] profiles 就绪 + config.yaml 已同步"
} else {
  Write-Host "---- [3/5] 跳过 profile 引导（-NoProfilesEnsure）----"
}

# ---- 4. 校验 0.20.5 CLI ----
Write-Host "---- [4/5] Hermes CLI 校验 ----"
& $hermesExe --version 2>&1 | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" }

# ---- 5. 跑端到端编排（真实 LLM）----
Write-Host "---- [5/5] 端到端编排（中书→门下→尚书→六部→复核→完成，真实 LLM）----"
$env:E2E_PY = $pythonExe
$env:E2E_KANBAN = $kanban
$env:E2E_EDICT_HOME = $edictHome
$env:E2E_HERMES_EXE = $hermesExe
$env:E2E_HERMES_HOME = $hermesHome
$env:E2E_TASKS = $tasks
$tsx = Join-Path $DevDesktop "node_modules\tsx\dist\cli.mjs"
& node $tsx (Join-Path $DevDesktop "scripts\e2e-edict-pipeline.ts")
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] 编排未完成，请查看上方日志定位节点" -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "========================================================"
Write-Host " 真机联调完成 ✅ 任务已走完 中书→门下→尚书→六部→复核→完成"
Write-Host "========================================================"
