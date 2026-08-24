$ErrorActionPreference = 'Stop'
$cfgPath = Join-Path $env:APPDATA "shentong-ai-desktop\openclaw-home\.openclaw\openclaw.json"
if (-not (Test-Path -LiteralPath $cfgPath)) { Write-Host "FAIL: not found: $cfgPath"; exit 1 }

# 1) 备份
$stamp = Get-Date -Format "yyyyMMddHHmmss"
Copy-Item -LiteralPath $cfgPath -Destination "$cfgPath.bak.$stamp" -Force
Write-Host "backup -> openclaw.json.bak.$stamp"

# 2) 读取并修复损坏的 JSON 转义（Windows 路径里的单反斜杠 -> 合法 \ 转义）
$raw = [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8)
$sb = [System.Text.StringBuilder]::new()
$i = 0
$bs = [char]0x5C
while ($i -lt $raw.Length) {
  $c = $raw[$i]
  if ($c -eq $bs -and ($i + 1) -lt $raw.Length) {
    $n = $raw[$i + 1]
    if ($n -eq '"' -or $n -eq $bs -or $n -eq '/' -or $n -eq 'b' -or $n -eq 'f' -or $n -eq 'n' -or $n -eq 'r' -or $n -eq 't' -or $n -eq 'u') {
      [void]$sb.Append($c); [void]$sb.Append($n)
    } else {
      [void]$sb.Append($bs); [void]$sb.Append($bs); [void]$sb.Append($n)
    }
    $i += 2
  } else { [void]$sb.Append($c); $i += 1 }
}
$repaired = $sb.ToString()
$cfg = $null
try { $cfg = $repaired | ConvertFrom-Json }
catch { Write-Host "WARN: parse failed after escape repair, will regenerate config"; $cfg = $null }

if ($null -eq $cfg) {
  # 3a) 兜底：重新生成一份已知正确的配置（保留用户关键凭据）
  $cfg = [PSCustomObject]@{
    gateway = [PSCustomObject]@{
      http  = [PSCustomObject]@{ endpoints = [PSCustomObject]@{ chatCompletions = [PSCustomObject]@{ enabled = $true } } }
      auth  = [PSCustomObject]@{ token = '2bb301167bcfcfee7111b28a59d7a2fb64273b57d8810bf6' }
    }
    agents  = [PSCustomObject]@{ defaults = [PSCustomObject]@{ memorySearch = [PSCustomObject]@{ provider = 'none' } } }
    skills  = [PSCustomObject]@{ load = [PSCustomObject]@{ extraDirs = @('E:\中台\新建文件夹\shentong-ai-desktop\resources\openclaw\skills') } }
    models  = [PSCustomObject]@{ providers = [PSCustomObject]@{ openai = [PSCustomObject]@{ baseUrl = 'https://zt.shentongapi.cn/api/llm-proxy/v1'; api = 'openai-completions'; apiKey = 'sk-shentong-cb4cc9d7b0cc5bc75a71d1c969d4f156' } } }
    plugins = [PSCustomObject]@{ entries = [PSCustomObject]@{ 'openclaw-weixin' = [PSCustomObject]@{ enabled = $true } } }
    mcp     = [PSCustomObject]@{ servers = [PSCustomObject]@{} }
  }
  Write-Host "regenerated config from known-good template"
} else {
  # 3b) 修正 extraDirs 为真实存在的内置技能目录
  $goodDir = 'E:\中台\新建文件夹\shentong-ai-desktop\resources\openclaw\skills'
  if ($null -eq $cfg.skills) { $cfg | Add-Member -NotePropertyName 'skills' -NotePropertyValue ([PSCustomObject]@{}) }
  if ($null -eq $cfg.skills.load) { $cfg.skills | Add-Member -NotePropertyName 'load' -NotePropertyValue ([PSCustomObject]@{}) }
  $cfg.skills.load.extraDirs = @($goodDir)
  # 4) 迁移 mcpServers -> mcp.servers 并删除旧键
  if ($cfg.PSObject.Properties.Name -contains 'mcpServers') {
    $servers = $cfg.mcpServers
    if ($null -eq $cfg.mcp) { $cfg | Add-Member -NotePropertyName 'mcp' -NotePropertyValue ([PSCustomObject]@{}) }
    if ($null -eq $cfg.mcp.servers) { $cfg.mcp | Add-Member -NotePropertyName 'servers' -NotePropertyValue ([PSCustomObject]@{}) }
    $cfg.mcp.servers = $servers
    $cfg.PSObject.Properties.Remove('mcpServers')
    Write-Host "migrated mcpServers -> mcp.servers"
  }
}

# 5) 写回（UTF-8 无 BOM）
$json = $cfg | ConvertTo-Json -Depth 40
[System.IO.File]::WriteAllText($cfgPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "written: $cfgPath"

# 6) 自检：重新读取并解析
$chk = Get-Content -Raw -LiteralPath $cfgPath | ConvertFrom-Json
if ($null -eq $chk) { Write-Host "FAIL: final config unreadable"; exit 1 }
Write-Host "VERIFY_OK - openclaw.json is valid JSON now"
