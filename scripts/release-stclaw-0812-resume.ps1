# release-stclaw-0812-resume.ps1 - ST-Claw v0.8.12 续跑：清单提交+推送 → 上传运行时 → 打包 0.8.12 → 上传安装包
# 用法: powershell -ExecutionPolicy Bypass -File scripts\release-stclaw-0812-resume.ps1
# 前置: 已完成 release-stclaw-0812.ps1 步骤0/1（功能提交 + 运行时构建）
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

# ---- 2. 提交运行时清单变化 + 推送（desktop/runtime 被根 .gitignore 忽略，只提交 embedded TS + 脚本BOM修复） ----
Step "2" "提交运行时清单变化并推送"
$chk = & $git status --porcelain -- desktop/electron/main/runtime-manifest-embedded.ts desktop/scripts/build-installer.ps1
if ($chk) {
  & $git add desktop/electron/main/runtime-manifest-embedded.ts desktop/scripts/build-installer.ps1
  if ($LASTEXITCODE -ne 0) { throw "git add embedded manifest 失败" }
  & $git commit -m "chore(video-claw): 运行时 v0.1.0 重新打包 回填 size/sha256; build-installer.ps1 加UTF-8 BOM"
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
Write-Host "=== 续跑脚本结束 ===" -ForegroundColor Green