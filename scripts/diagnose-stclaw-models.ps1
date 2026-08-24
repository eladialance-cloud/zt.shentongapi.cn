# 深瞳AI 桌面端 ST-Claw 模型下拉诊断脚本 v2
# 用法（PowerShell）:  powershell -ExecutionPolicy Bypass -File scripts/diagnose-stclaw-models.ps1
# 输出请整段贴回
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-Masked([string]$v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return "(空!)" }
  return $v.Substring(0, [Math]::Min(8, $v.Length)) + "*** (len=" + $v.Length + ")"
}

Write-Host "==== 1. 正在运行的 ST-Claw 进程 ===="
$pyProc = Get-Process -Name python -ErrorAction SilentlyContinue |
  Where-Object { (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $_.Id) -ErrorAction SilentlyContinue).CommandLine -match 'api_server.py|video-claw' }
foreach ($p in $pyProc) {
  $cim = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.Id) -ErrorAction SilentlyContinue
  Write-Host ("pid=" + $p.Id + " start=" + $p.StartTime)
  Write-Host ("cmd: " + $cim.CommandLine)
  Write-Host ("cwd: " + $cim.ExecutablePath)
  $backendDir = Split-Path ($cim.CommandLine -replace '"', '' -split ' ' | Where-Object { $_ -match 'api_server.py' } | Select-Object -First 1)
  Write-Host ("backendDir: " + $backendDir)
}

Write-Host ""
Write-Host "==== 2. userData / 运行时目录定位 ===="
$appDataCandidates = @(
  "$env:APPDATAshentong-ai-desktop",
  "$env:APPDATA深瞳AI-智能中台"
)
$appDataDir = $appDataCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appDataDir) {
  $appDataDir = Get-ChildItem -Path $env:APPDATA -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'shentong|深瞳' } | Select-Object -First 1 -ExpandProperty FullName
}
Write-Host ("userData: " + $appDataDir)

$runtimeRoot = ""
foreach ($loc in @("$appDataDiruntime-location.json")) {
  if (Test-Path $loc) {
    try {
      $j = Get-Content $loc -Raw | ConvertFrom-Json
      if ($j.path -and (Test-Path $j.path)) { $runtimeRoot = $j.path }
    } catch {}
  }
}
if (-not $runtimeRoot) { $runtimeRoot = Join-Path $appDataDir 'runtime' }
Write-Host ("runtimeRoot: " + $runtimeRoot)
Write-Host ("runtimeRoot 存在: " + (Test-Path $runtimeRoot))

Write-Host ""
Write-Host "==== 3. ST-Claw 运行时版本（manifest） ===="
$manifestPath = Join-Path $runtimeRoot 'manifest.json'
if (Test-Path $manifestPath) {
  $mf = Get-Content $manifestPath -Raw | ConvertFrom-Json
  Write-Host ("manifest: " + $manifestPath)
  Write-Host ("video-claw version: " + $mf.services.'video-claw'.version)
  Write-Host ("video-claw sha256: " + $mf.services.'video-claw'.sha256.'win32-x64')
} else {
  Write-Host ("未找到: " + $manifestPath)
}

Write-Host ""
Write-Host "==== 4. config.yaml（llmproxy 段） ===="
$cfgCandidates = @(
  "$runtimeRootideo-clawideo-clawideo-clawackendconfig.yaml",
  "$runtimeRootideo-clawideo-clawackendconfig.yaml",
  "$appDataDiruntimeideo-clawideo-clawideo-clawackendconfig.yaml",
  "$appDataDiruntimeideo-clawideo-clawackendconfig.yaml"
)
$cfg = $cfgCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$cfgKey = ""
if ($cfg) {
  Write-Host ("config.yaml: " + $cfg)
  $inLp = $false; $inModels = $false
  foreach ($line in (Get-Content $cfg)) {
    if ($line -match '^s{0,4}llmproxy:') { $inLp = $true; $inModels = $false; Write-Host ("[sec] " + $line); continue }
    if ($line -match '^s{4,6}models:') { $inModels = $true; Write-Host ("[sec] " + $line); continue }
    if ($inLp -and $line -match '^s+api_key:') {
      $cfgKey = ($line -split ':', 2)[1].Trim().Trim('"').Trim("'")
      Write-Host ("[llmproxy.api_key] " + (Get-Masked $cfgKey))
      continue
    }
    if ($inLp -and $line -match '^s+base_url:') { Write-Host ("[llmproxy.base_url] " + $line.Trim()); continue }
    if ($inModels -and $line.Trim() -like '- *') { Write-Host ("[whitelist] " + $line.Trim()) }
  }
} else {
  Write-Host "未找到 config.yaml"
}

Write-Host ""
Write-Host "==== 5. ST-Claw 本地 /api/models（全量） ===="
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/models" -TimeoutSec 8 -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Write-Host ("HTTP " + $r.StatusCode + "  模型数: " + ($j.models | Measure-Object).Count)
  $j.models | ForEach-Object { Write-Host ("  - " + $_.id + "  provider=" + $_.provider + "  types=" + ($_.type -join ",")) }
} catch {
  Write-Host ("/api/models 失败: " + $_.Exception.Message)
}

Write-Host ""
Write-Host "==== 6. 平台 /v1/models 直测（用 config.yaml 的 Key） ===="
if ($cfgKey) {
  try {
    $r2 = Invoke-WebRequest -Uri "https://zt.shentongapi.cn/api/llm-proxy/v1/models" -Headers @{ Authorization = "Bearer " + $cfgKey } -TimeoutSec 12 -UseBasicParsing
    $j2 = $r2.Content | ConvertFrom-Json
    Write-Host ("HTTP " + $r2.StatusCode + "  模型数: " + ($j2.data | Measure-Object).Count)
    $j2.data | ForEach-Object { Write-Host ("  - " + $_.id + "  type=" + $_.type) }
  } catch {
    Write-Host ("平台 /v1/models 失败: " + $_.Exception.Message)
    if ($_.Exception.Response) { Write-Host ("HTTP 状态: " + [int]$_.Exception.Response.StatusCode) }
  }
} else {
  Write-Host "config.yaml 没读到 Key —— 这就是断点所在（ST-Claw 拿不到 Key 就拉不到后台模型）"
}

Write-Host ""
Write-Host "==== 7. 桌面端安装版本 ===="
$installCandidates = @(
  "$env:LOCALAPPDATAPrograms深瞳AI-智能中台",
  "$env:LOCALAPPDATAProgramsshentong-ai-desktop"
)
$exe = Get-ChildItem -Path $installCandidates -Filter "*.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'ShenTongAI-Setup' } | Select-Object -First 1
if ($exe) {
  $vi = $exe.VersionInfo
  Write-Host ("installer: " + $exe.FullName + "  ver=" + $vi.FileVersion)
} else {
  Write-Host "未找到安装包（已安装版本请打开 设置-关于 查看）"
}

Write-Host ""
Write-Host "==== 8. 端口占用 ===="
foreach ($port in 3000, 8000) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    foreach ($c in $conn) {
      $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      Write-Host ("port " + $port + " LISTEN pid=" + $c.OwningProcess + " proc=" + $proc.ProcessName + " start=" + $proc.StartTime)
    }
  } else {
    Write-Host ("port " + $port + " 未监听")
  }
}

Write-Host ""
Write-Host "==== 诊断结束：请把以上全部输出贴回 ===="
