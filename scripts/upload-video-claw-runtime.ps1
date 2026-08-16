# upload-video-claw-runtime.ps1 - 上传 VideoClaw 运行时到服务器 CDN
#
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\upload-video-claw-runtime.ps1
# 前置:  已执行 build-video-claw-runtime.ps1 生成 dist-deploy\video-claw-win-x64.tar.gz
# 依赖:  本机已配置 ssh/scp 免密或可交互输入密码
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$SERVER = $env:ST_SERVER; if (-not $SERVER) { $SERVER = "129.204.227.200" }
$SSH_USER = $env:ST_SSH_USER; if (-not $SSH_USER) { $SSH_USER = "ubuntu" }
$archiveName = "video-claw-win-x64.tar.gz"
$version = "0.1.1"
$archive = Join-Path (Resolve-Path ".") ("dist-deploy\" + $archiveName)
$remoteDir = "/opt/shentong/runtime/video-claw/" + $version
$url = "https://zt.shentongapi.cn/runtime/video-claw/" + $version + "/" + $archiveName

if (-not (Test-Path $archive)) {
  Write-Host "[ERROR] 找不到 $archive，请先运行 scripts\build-video-claw-runtime.ps1"
  exit 1
}
$mb = [math]::Round((Get-Item $archive).Length / 1MB, 1)
Write-Host ("[OK] 产物: " + $archive + " (" + $mb + " MB)")

# ---- 1. scp 上传到服务器 /tmp ----
Write-Host "上传 $archiveName ..."
& scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$archive" "$SSH_USER@${SERVER}:/tmp/$archiveName"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] scp 上传失败"; exit 1 }

# ---- 2. 服务器落位 + 结构校验 ----
# 注意: 远程命令用单引号单行字符串，且避免引号/反斜杠/正则元字符（PS5.1 传参给 ssh 会被 CommandLineToArgvW 二次解析破坏）
$serverCmd = 'sudo mkdir -p /opt/shentong/runtime/video-claw/0.1.1 && sudo mv /tmp/video-claw-win-x64.tar.gz /opt/shentong/runtime/video-claw/0.1.1/ && sudo chown -R www-data:www-data /opt/shentong/runtime/video-claw && sudo mkdir -p /opt/shentong/cdn/video-claw/0.1.1 && sudo cp /opt/shentong/runtime/video-claw/0.1.1/video-claw-win-x64.tar.gz /opt/shentong/cdn/video-claw/0.1.1/ && sudo mkdir -p /opt/shentong/updates/runtime/video-claw/0.1.1 && sudo cp /opt/shentong/runtime/video-claw/0.1.1/video-claw-win-x64.tar.gz /opt/shentong/updates/runtime/video-claw/0.1.1/ && sudo chown -R www-data:www-data /opt/shentong/cdn/video-claw /opt/shentong/updates/runtime/video-claw && ls -la /opt/shentong/runtime/video-claw/0.1.1 && cd /tmp && rm -rf vc-chk && mkdir vc-chk && tar -xzf /opt/shentong/runtime/video-claw/0.1.1/video-claw-win-x64.tar.gz -C vc-chk && test -f vc-chk/video-claw.cmd && test -f vc-chk/video-claw-server.js && test -f vc-chk/node/node.exe && test -f vc-chk/python/python.exe && test -f vc-chk/video-claw/video-claw/backend/api_server.py && test -f vc-chk/video-claw/video-claw/frontend/.next/BUILD_ID && echo STRUCTURE_OK && rm -rf vc-chk'
Write-Host "服务器部署 + 结构校验..."
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$serverCmd"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] 服务器部署失败，请手动检查"; exit 1 }

# ---- 3. 验证 CDN 可下载 ----
Write-Host "验证 CDN: $url"
$curlCmd = 'curl -sI https://zt.shentongapi.cn/runtime/video-claw/0.1.1/video-claw-win-x64.tar.gz | grep -iE "HTTP/|content-length"'
& ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "$SSH_USER@${SERVER}" "$curlCmd"

Write-Host ""
Write-Host "=== 上传完成 ==="
Write-Host "  1) 本地冒烟: 解压 tar.gz 到 desktop\runtime\video-claw 后运行 video-claw.cmd serve，验证 :8000/api/health 与 :3000"
Write-Host "  2) 提交代码: powershell -ExecutionPolicy Bypass -File scripts\commit-video-claw.ps1"