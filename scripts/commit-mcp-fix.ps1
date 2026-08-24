# 一键提交+推送：MCP目录列表补mcpServerId
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
Set-Location "D:\二次开发"
& $git add backend/src/modules/mcp/services/mcp.service.ts
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
& $git commit -m "fix(mcp): 目录列表补mcpServerId-修复桌面端MCP下载后去配置提示未登记"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 失败，继续尝试 push"; }
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "=== 提交+推送完成 ==="