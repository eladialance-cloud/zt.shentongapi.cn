# commit-video-claw.ps1 - VideoClaw 接入提交脚本（Task 7）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\commit-video-claw.ps1
# 说明: 先同步 vendored 技能代码到 resources 副本，再 git add + commit
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"

# ---- 1. 同步 vendored -> resources（单一真源 = 仓库根 video-claw/）----
$src = Join-Path (Resolve-Path ".") "video-claw"
$dst = Join-Path (Resolve-Path ".") "desktop\resources\openclaw\skills\video-claw"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
& robocopy $src $dst /E /NFL /NDL /NJH /NJS | Out-Null
Write-Host "[OK] 已同步 video-claw -> resources/openclaw/skills/video-claw"

# ---- 2. git add ----
& $git add `
  "desktop/electron/shared/types.ts" `
  "desktop/electron/main/runtime-manifest-embedded.ts" `
  "desktop/electron/main/runtime-resolver.ts" `
  "desktop/electron/main/service-manager.ts" `
  "desktop/electron/main/video-claw-config.ts" `
  "desktop/runtime/manifest.json" `
  "desktop/src/components/StatusBar.tsx" `
  "desktop/src/components/MainLayout/StatusBar.tsx" `
  "desktop/src/components/MainLayout/StatusPanel.tsx" `
  "desktop/src/components/Sidebar/index.tsx" `
  "desktop/src/router/index.tsx" `
  "desktop/src/pages/Onboarding/index.tsx" `
  "desktop/src/pages/ServiceManager/index.tsx" `
  "desktop/src/pages/VideoClaw" `
  "desktop/tests/unit/video-claw-manifest.test.ts" `
  "desktop/tests/unit/video-claw-config.test.ts" `
  "desktop/tests/unit/video-claw-skill.test.ts" `
  "desktop/resources/openclaw/skills/video-claw" `
  "scripts/build-video-claw-runtime.ps1" `
  "scripts/upload-video-claw-runtime.ps1" `
  "scripts/runtime-templates/video-claw" `
  "video-claw" 
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }

# ---- 3. commit ----
& $git commit -m "feat(video-claw): 接入AI视频生成-本地服务+技能内置+llmproxy适配+桌面端页面"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git commit 失败"; exit 1 }
Write-Host ""
Write-Host "=== 提交完成，可 push ==="