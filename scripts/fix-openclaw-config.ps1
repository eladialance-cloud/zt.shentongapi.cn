
$ErrorActionPreference = 'Stop'

# ============================================================
# OpenClaw 启动失败即时修复脚本
# 根因: 0.8.8 桌面端向 openclaw.json 写入了根级 mcpServers 键,
#       但 OpenClaw 2026.7.1 只认 mcp.servers, 导致整份配置校验失败:
#       "<root>: Invalid input" -> Gateway 无法启动
# 本脚本: 1) 备份并替换已安装桌面端的 app.asar(已修复)
#         2) 迁移 openclaw.json: mcpServers -> mcp.servers
# 用法:  先退出桌面端, 然后执行本脚本
# ============================================================

$res = "E:\中台\新建文件夹\shentong-ai-desktop\resources"
$src = "D:\二次开发\dist-deploy\oc-fix"

if (-not (Test-Path -LiteralPath "$src\app.asar")) {
  Write-Host "FATAL: fixed asar not found: $src\app.asar"
  exit 1
}

# 1) 若应用正在运行则中止
$running = Get-Process | Where-Object { $_.ProcessName -like '*shentong*' -or $_.ProcessName -like '*深瞳*' -or $_.Path -like '*shentong-ai-desktop*' } | Select-Object -First 1
if ($running) {
  Write-Host "App is running (PID $($running.Id)). Please quit the desktop app first, then rerun."
  exit 1
}

# 2) 备份
$stamp = Get-Date -Format "yyyyMMddHHmmss"
Copy-Item -LiteralPath "$res\app.asar" -Destination "$res\app.asar.bak.$stamp" -Force
if (Test-Path -LiteralPath "$res\app.asar.unpacked") {
  Copy-Item -LiteralPath "$res\app.asar.unpacked" -Destination "$res\app.asar.unpacked.bak.$stamp" -Recurse -Force
}
Write-Host "Backup done: app.asar.bak.$stamp"

# 3) 替换 asar + unpacked
Copy-Item -LiteralPath "$src\app.asar" -Destination "$res\app.asar" -Force
if (Test-Path -LiteralPath "$res\app.asar.unpacked") {
  Remove-Item -LiteralPath "$res\app.asar.unpacked" -Recurse -Force
}
Copy-Item -LiteralPath "$src\app.asar.unpacked" -Destination "$res\app.asar.unpacked" -Recurse -Force
Write-Host "app.asar replaced (mcp.servers fix included)"

# 4) 迁移 openclaw.json
$cfgPath = Join-Path $env:APPDATA "shentong-ai-desktop\openclaw-home\.openclaw\openclaw.json"
if (Test-Path -LiteralPath $cfgPath) {
  $cfg = Get-Content -Raw -LiteralPath $cfgPath | ConvertFrom-Json
  if ($cfg.PSObject.Properties.Name -contains 'mcpServers') {
    $servers = $cfg.mcpServers
    if ($null -eq $cfg.mcp) { $cfg | Add-Member -NotePropertyName 'mcp' -NotePropertyValue ([PSCustomObject]@{}) }
    if ($null -eq $cfg.mcp.servers) { $cfg.mcp | Add-Member -NotePropertyName 'servers' -NotePropertyValue ([PSCustomObject]@{}) }
    $cfg.mcp.servers = $servers
    $cfg.PSObject.Properties.Remove('mcpServers')
    $json = $cfg | ConvertTo-Json -Depth 30
    [System.IO.File]::WriteAllText($cfgPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "openclaw.json migrated: mcpServers -> mcp.servers"
  } else {
    Write-Host "openclaw.json has no mcpServers key, nothing to migrate"
  }
} else {
  Write-Host "openclaw.json not found: $cfgPath"
}
Write-Host "DEPLOY_DONE - now start OpenClaw from the desktop app"
