# diagnose-runtime.ps1 - 桌面端运行时问题诊断（测试机/用户机通用）
# Usage: powershell -ExecutionPolicy Bypass -File scripts\diagnose-runtime.ps1
$ErrorActionPreference = "Continue"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  深瞳AI 桌面端运行时诊断" -ForegroundColor Cyan
Write-Host "=============================================="

# 1) 安装版本
Write-Host "`n[1] 安装版本"
$app = Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*","HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like "*深瞳*" -or $_.DisplayName -like "*ShenTong*" } | Select-Object -First 1
if ($app) {
  Write-Host "  DisplayName : $($app.DisplayName)"
  Write-Host "  Version     : $($app.DisplayVersion)"
  Write-Host "  InstallLoc  : $($app.InstallLocation)"
} else {
  Write-Host "  (未找到安装记录)"
}
$installDir = "$env:LOCALAPPDATA\Programs\shentong-ai-desktop"
Write-Host "  ProgramDir  : $installDir (存在: $(Test-Path $installDir))"
if (Test-Path "$installDir\resources\app.asar") {
  $size = (Get-Item "$installDir\resources\app.asar").Length
  Write-Host "  app.asar    : $size bytes, 修改时间 $((Get-Item "$installDir\resources\app.asar").LastWriteTime)"
}
Write-Host "  内置runtime : $installDir\resources\runtime (存在: $(Test-Path "$installDir\resources\runtime"))"
if (Test-Path "$installDir\resources\runtime\manifest.json") {
  $m = Get-Content "$installDir\resources\runtime\manifest.json" -Raw | ConvertFrom-Json
  Write-Host "  内置manifest版本: $($m.version)"
}

# 2) userData 运行时目录
$rt = "$env:APPDATA\shentong-ai-desktop\runtime"
Write-Host "`n[2] userData 运行时目录"
Write-Host "  路径: $rt (存在: $(Test-Path $rt))"
if (Test-Path "$rt\manifest.json") {
  $um = Get-Content "$rt\manifest.json" -Raw | ConvertFrom-Json
  Write-Host "  userData manifest 版本: $($um.version)"
}
if (Test-Path $rt) {
  Get-ChildItem $rt -Force | ForEach-Object {
    if ($_.PSIsContainer) {
      $nodeExe = Join-Path $_.FullName "node\node.exe"
      $nodeVer = "?"
      if (Test-Path $nodeExe) {
        try { $nodeVer = (& $nodeExe --version 2>&1 | Select-Object -First 1) } catch { $nodeVer = "?" }
      }
      $marker = Join-Path $_.FullName ".runtime-sha256"
      $hasMarker = Test-Path $marker
      $entry = Get-ChildItem $_.FullName -Filter "*.cmd" -ErrorAction SilentlyContinue | Select-Object -First 1
      Write-Host ("  [dir] {0,-10} node={1,-12} marker={2} entry={3}" -f $_.Name, $nodeVer, $hasMarker, $entry.Name)
    } else {
      Write-Host "  [file] $($_.Name) ($($_.Length) B)"
    }
  }
}

# 3) 自定义位置配置
$locCfg = "$env:APPDATA\shentong-ai-desktop\runtime-location.json"
Write-Host "`n[3] 自定义位置配置"
if (Test-Path $locCfg) { Write-Host "  $(Get-Content $locCfg -Raw)" }
else { Write-Host "  (无，使用默认 userData/runtime)" }

# 4) 宿主机命令回退（如果 userData 未装时会用到）
Write-Host "`n[4] 宿主机命令（PATH 回退检测）"
foreach ($cmd in @("openclaw", "n8n", "mcp-gateway", "hermes")) {
  $hit = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($hit) { Write-Host "  $cmd -> $($hit.Source)" }
  else { Write-Host "  $cmd -> (未在 PATH)" }
}
Write-Host "  系统 node: $((Get-Command node -ErrorAction SilentlyContinue).Source)"

# 5) 主进程日志尾部
$log = "$env:APPDATA\shentong-ai-desktop\logs\main.log"
Write-Host "`n[5] 主进程日志（最后 40 行）"
if (Test-Path $log) { Get-Content $log -Tail 40 }
else { Write-Host "  (无日志文件 $log)" }

Write-Host "`n=============================================="
Write-Host "  诊断完成，把以上输出发回即可" -ForegroundColor Cyan
