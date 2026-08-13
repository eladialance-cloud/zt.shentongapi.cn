﻿﻿# build-video-claw-runtime.ps1 - 构建并打包 VideoClaw Windows 运行时
#
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\build-video-claw-runtime.ps1
# 前置:  本机可联网（npm install / pip install 需要）
# 产物:  dist-deploy\video-claw-win-x64.tar.gz
#        并回填 desktop/runtime/manifest.json + runtime-manifest-embedded.ts 的 size/sha256
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$repoRoot = (Resolve-Path ".")
$version = "0.1.0"
$archiveName = "video-claw-win-x64.tar.gz"
$stage = Join-Path $repoRoot "dist-deploy\video-claw-runtime"
$archive = Join-Path $repoRoot ("dist-deploy\" + $archiveName)
$hermesRoot = Join-Path $repoRoot "desktop\runtime\hermes"
$appSrc = Join-Path $repoRoot "video-claw\video-claw"
$templateDir = Join-Path $PSScriptRoot "runtime-templates\video-claw"

function Write-Step($n, $msg) { Write-Host ("[" + $n + "/6] " + $msg) }

# ---- 0. 清理旧产物 ----
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $archive) { Remove-Item $archive -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "dist-deploy") | Out-Null
Write-Step "0" "清理完成，准备构建"

# ---- 1. 前端构建（需要联网 npm；registry 已按用户 .npmrc 指向 npmmirror）----
Write-Step "1" "构建前端 (npm install + next build + prune)..."
Push-Location (Join-Path $appSrc "frontend")
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install 失败，请检查网络后重试" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "next build 失败" }
npm prune --omit=dev
Pop-Location
if (-not (Test-Path (Join-Path $appSrc "frontend\.next"))) { throw ".next 产物不存在" }

# ---- 2. 组装 python（复用 hermes 嵌入式 Python + 补装缺失依赖，需要联网 pip）----
Write-Step "2" "组装 python 运行时（含 numpy/dashscope/python-docx/PyPDF2）..."
& robocopy (Join-Path $hermesRoot "python") (Join-Path $stage "python") /E /NFL /NDL /NJH /NJS /XD __pycache__ | Out-Null
if ($LASTEXITCODE -ge 8) { throw "复制 python 失败" }
$py = Join-Path $stage "python\python.exe"
if (-not (Test-Path $py)) { throw "python.exe 不存在: $py" }
& $py -m pip --disable-pip-version-check --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pip 不可用" }
& $py -m pip install --disable-pip-version-check --no-warn-script-location numpy dashscope python-docx PyPDF2
if ($LASTEXITCODE -ne 0) { throw "pip install 失败，请检查网络后重试" }

# ---- 3. 组装 node（复用 hermes 嵌入式 Node 24）----
Write-Step "3" "组装 node 运行时..."
& robocopy (Join-Path $hermesRoot "node") (Join-Path $stage "node") /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "复制 node 失败" }

# ---- 4. 复制应用代码 + 启动器 ----
Write-Step "4" "复制应用代码与启动器..."
& robocopy $appSrc (Join-Path $stage "video-claw\video-claw") /E /NFL /NDL /NJH /NJS /XD .git /XD __pycache__ /XD .next /XF *.pyc | Out-Null
if ($LASTEXITCODE -ge 8) { throw "复制应用失败" }
# 前端 .next 产物单独复制（步骤 1 生成，勿用源码树旧产物）
if (-not (Test-Path (Join-Path $appSrc "frontend\.next"))) { throw ".next 缺失" }
& robocopy (Join-Path $appSrc "frontend\.next") (Join-Path $stage "video-claw\video-claw\frontend\.next") /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "复制 .next 失败" }
Copy-Item (Join-Path $templateDir "video-claw.cmd") (Join-Path $stage "video-claw.cmd") -Force
Copy-Item (Join-Path $templateDir "video-claw-server.js") (Join-Path $stage "video-claw-server.js") -Force

# ---- ffmpeg（可选）：本机存在则打包，缺失仅提示（核心文生图/图生视频不依赖）----
$ffmpeg = $null
foreach ($cand in @("C:\ffmpeg\bin\ffmpeg.exe", "D:\ffmpeg\bin\ffmpeg.exe", "$env:USERPROFILE\ffmpeg\bin\ffmpeg.exe")) {
  if (Test-Path $cand) { $ffmpeg = $cand; break }
}
if ($ffmpeg) {
  New-Item -ItemType Directory -Force -Path (Join-Path $stage "ffmpeg\bin") | Out-Null
  Copy-Item $ffmpeg (Join-Path $stage "ffmpeg\bin\ffmpeg.exe") -Force
  Write-Host "  [OK] 已打包 ffmpeg: $ffmpeg"
} else {
  Write-Host "  [WARN] 未找到本机 ffmpeg.exe，视频后期剪辑停点不可用（生成不受影响）。"
  Write-Host "        可选：下载 ffmpeg 到 C:\ffmpeg\bin\ffmpeg.exe 后重跑本脚本。"
}

# ---- 5. 打包 tar.gz ----
Write-Step "5" "打包 $archiveName ..."
Push-Location $stage
tar -czf $archive -C $stage .
Pop-Location
if (-not (Test-Path $archive)) { throw "打包失败" }

# ---- 6. 回填 manifest（Node 助手：计算 size/sha256 并同步两处清单，格式稳定）----
Write-Step "6" "回填 manifest size/sha256..."
$manifestPath = Join-Path $repoRoot "desktop\runtime\manifest.json"
$embPath = Join-Path $repoRoot "desktop\electron\main\runtime-manifest-embedded.ts"
$fixer = Join-Path $templateDir "fix-video-claw-manifest.cjs"
$nodeExe = Join-Path $stage "node\node.exe"
if (-not (Test-Path $nodeExe)) { $nodeExe = "node" }
& $nodeExe $fixer $archive $manifestPath $embPath
if ($LASTEXITCODE -ne 0) { throw "manifest 回填失败" }
Write-Host ""
Write-Host "=== 构建完成 ==="
Write-Host ("  tar.gz : " + $archive + " (" + [math]::Round($size / 1MB, 1) + " MB)")
Write-Host "  下一步: powershell -ExecutionPolicy Bypass -File scripts\upload-video-claw-runtime.ps1"