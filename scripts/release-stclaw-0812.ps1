# release-stclaw-0812.ps1 - ST-Claw v0.8.14 一键发布（本地构建+上传，服务器命令见最后输出）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\release-stclaw-0812.ps1
# 前置: 本机可联网（npm install / pip / git push / scp 到 129.204.227.200）
# 阶段:
#   0 提交功能改动         1 构建 video-claw 运行时(回填 size/sha256)
#   2 提交清单+推送        3 上传运行时到服务器 CDN
#   4 打包桌面端 0.8.14    5 上传安装包+latest.yml 到服务器
# 参数: -SkipRuntime  跳过步骤1（已构建过运行时后断点续跑用）
param([switch]$SkipRuntime)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
$repoRoot = (Resolve-Path ".")
$server = "129.204.227.200"
$sshUser = "ubuntu"
$version = (Get-Content (Join-Path $repoRoot "desktop\package.json") -Raw | ConvertFrom-Json).version

function Step {
  param([string]$n, [string]$msg)
  Write-Host ""
  Write-Host ("===== [" + $n + "] " + $msg + " =====") -ForegroundColor Cyan
}

# ---- 0. 提交功能改动 ----
Step "0" ("提交功能改动 (v" + $version + ")")
& $git add `
  "backend/src/modules/chat/services/llm-proxy.service.ts" `
  "desktop/electron/main/index.ts" `
  "desktop/electron/main/llm-integrations.ts" `
  "desktop/electron/main/openclaw-chat.ts" `
  "desktop/electron/main/service-manager.ts" `
  "desktop/electron/main/video-claw-config.ts" `
  "desktop/electron/preload/index.ts" `
  "desktop/electron/shared/types.ts" `
  "desktop/package.json" `
  "desktop/package-lock.json" `
  "desktop/resources/openclaw/skills/video-claw" `
  "desktop/src/api/llm-integrations-api.ts" `
  "desktop/src/api/openclaw-chat-api.ts" `
  "desktop/src/pages/Chat/index.tsx" `
  "desktop/src/pages/Settings/LlmIntegrations.tsx" `
  "desktop/src/pages/Settings/index.tsx" `
  "desktop/src/store/chat-stream.ts" `
  "desktop/tests/unit/openclaw-chat.test.ts" `
  "desktop/tests/unit/video-claw-config.test.ts" `
  "desktop/scripts/build-installer.ps1" `
  "scripts/build-video-claw-runtime.ps1" `
  "scripts/runtime-templates/video-claw" `
  "desktop/tests/unit/video-claw-manifest.test.ts" `
  "desktop/tests/unit/service-manager.video-claw.test.ts" `
  "video-claw"
if ($LASTEXITCODE -ne 0) { throw "git add 失败" }
& $git commit -m "fix(video-claw): 运行时补装cffi/playwright+依赖冒烟+启动预检+模型下拉兜底(空列表不清空静态表/视频模型平台中转) v$version"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 无改动或失败，继续构建" }

# ---- 1. 构建 video-claw 运行时 ----
if (-not $SkipRuntime) {
  Step "1" "构建 video-claw 运行时 (npm install + next build + pip + tar.gz)"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-video-claw-runtime.ps1")
  if ($LASTEXITCODE -ne 0) { throw "build-video-claw-runtime.ps1 失败" }
} else {
  Step "1" "跳过运行时构建 (-SkipRuntime)"
}

# ---- 2. 提交运行时清单变化 + 推送 ----
Step "2" "提交运行时清单变化并推送"
$chk = & $git status --porcelain -- desktop/electron/main/runtime-manifest-embedded.ts desktop/runtime/manifest.json desktop/scripts/build-installer.ps1
if ($chk) {
  & $git add -f desktop/electron/main/runtime-manifest-embedded.ts desktop/runtime/manifest.json desktop/scripts/build-installer.ps1
  if ($LASTEXITCODE -ne 0) { throw "git add manifest 失败" }
  & $git commit -m "chore(video-claw): 运行时 v0.1.0 重新打包 回填 size/sha256"
  if ($LASTEXITCODE -ne 0) { throw "git commit manifest 失败" }
}
& $git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push 失败，请检查网络" }

# ---- 3. 上传运行时到服务器 CDN ----
Step "3" "上传运行时到服务器 CDN"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "upload-video-claw-runtime.ps1")
if ($LASTEXITCODE -ne 0) { throw "upload-video-claw-runtime.ps1 失败" }

# ---- 4. 打包桌面端 ----
Step "4" ("打包桌面端 " + $version + " (electron-builder)")
Push-Location (Join-Path $repoRoot "desktop")
& npm run pack:win
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "pack:win 失败" }
Pop-Location

# ---- 5. 上传安装包 + latest.yml ----
Step "5" "上传安装包到服务器"
$installerDir = Join-Path $repoRoot ("desktop\dist\installer-v" + $version)
$exe = Join-Path $installerDir ("ShenTongAI-Setup-" + $version + "-x64.exe")
$zip = Join-Path $installerDir ("ShenTongAI-Setup-" + $version + "-x64.exe.zip")
$yml = Join-Path $installerDir "latest.yml"
if (-not (Test-Path $exe)) { throw ("未找到安装包: " + $exe) }
if (-not (Test-Path $yml)) { throw ("未找到 latest.yml: " + $yml) }
if (-not (Test-Path $zip)) { Compress-Archive -Force -Path $exe -DestinationPath $zip }
& scp -o ConnectTimeout=30 $exe $zip $yml ($sshUser + "@" + $server + ":/tmp/")
if ($LASTEXITCODE -ne 0) { throw "scp 上传安装包失败" }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host ("  本地发布完成！服务器下一步（SSH 到 " + $server + " 执行）:") -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host @'
# 1) 更新服务器代码 + 部署后端
cd /opt/shentong && sudo git pull origin main
cd /opt/shentong/backend && sudo rm -rf dist && sudo npm run build 2>&1 | tail -3 && echo BUILD_OK
for i in 1 2 3; do sudo fuser -k 3001/tcp 2>/dev/null; sleep 2; sudo ss -tlnp | grep 3001 || break; done
sudo bash -c 'cd /opt/shentong/backend && nohup node /opt/shentong/backend/dist/main.js > server.log 2>&1 &'
sleep 12 && curl -s http://127.0.0.1:3001/api/health; echo

# 2) 发布桌面端更新
cd /opt/shentong/updates
sudo cp latest.yml latest.yml.bak.$(date +%Y%m%d%H%M%S)
sudo mv /tmp/ShenTongAI-Setup-0.8.12-x64.exe /tmp/ShenTongAI-Setup-0.8.12-x64.exe.zip /tmp/latest.yml /opt/shentong/updates/
sudo chown -R www-data:www-data /opt/shentong/updates
curl -s https://zt.shentongapi.cn/desktop/latest.yml | head -3
curl -sI https://zt.shentongapi.cn/desktop/ShenTongAI-Setup-0.8.12-x64.exe | head -3
'@.Replace('0.8.12', $version)
Write-Host ""
Write-Host "=== 发布脚本结束 ===" -ForegroundColor Green