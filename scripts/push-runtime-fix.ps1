# push-runtime-fix.ps1 - commit & push desktop runtime fixes using stored GitHub credentials
# Usage: powershell -ExecutionPolicy Bypass -File scripts\push-runtime-fix.ps1
# PS 5.1 下原生命令（git）的 stderr 警告会被 ErrorActionPreference=Stop 当成终止错误（LF/CRLF 提示），
# 而本脚本所有 git 命令都通过 $LASTEXITCODE 检查成败，因此全局用 Continue，仅关键 cmdlet 局部用 Stop。
$ErrorActionPreference = "Continue"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')) -ErrorAction Stop

# ---- locate git (not always on PATH) ----
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $candidates = @(
    "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe"
  )
  $git = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $git) { Write-Host "[ERROR] git not found"; exit 1 }
Write-Host "git: $git"

# ---- check stored credential ----
$cred = "$env:USERPROFILE\.git-credentials"
if (Test-Path $cred) { Write-Host "[OK] stored credential found" }
else { Write-Host "[WARN] no stored credential; password prompt will ask for PAT" }

# ---- stage 本次运行时修复相关的文件（含版本号提升） ----
$files = @(
  "desktop/electron/main/index.ts",
  "desktop/electron/main/runtime-downloader.ts",
  "desktop/electron/main/runtime-manifest-embedded.ts",
  "desktop/electron/main/runtime-resolver.ts",
  "desktop/electron/shared/types.ts",
  "desktop/electron/main/service-manager.ts",
  "desktop/electron/main/tray.ts",
  "desktop/src/pages/ServiceManager/index.tsx",
  "desktop/src/api/search-api.ts",
  "desktop/src/components/CommandPalette/index.tsx",
  "desktop/src/pages/Chat/styles.module.css",
  "desktop/src/pages/Credits/Recharge.tsx",
  "desktop/package.json",
  "desktop/package-lock.json",
  "desktop/electron-builder.yml",
  "desktop/tests/unit/runtime-content.test.ts",
  "desktop/tests/unit/mcp-gateway-server.test.ts",
  "desktop/tests/unit/runtime-lock-retry.test.ts",
  "desktop/resources/mcp/mcp-gateway-server.js",
  ".github/workflows/desktop-build.yml",
  "scripts/diagnose-runtime.ps1"
)
& $git add -f $files 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add failed"; exit 1 }
$staged = @(& $git diff --cached --name-only)
if ($staged.Count -eq 0) {
  Write-Host "[INFO] 无新增暂存改动（上次已提交），跳过 commit 直接推送"
} else {
  Write-Host "Staged files:"
  $staged | ForEach-Object { Write-Host "  $_" }
  # ---- commit ----
  & $git commit -m "fix(desktop): MCP桥脚本打包路径修复(extraResources扁平化)+托盘图标路径修正+版本升至0.6.9(CI构建0.7.0)"
  if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git commit failed"; exit 1 }
  & $git --no-pager log --oneline -1
}

# ---- push via HTTPS using stored credential ----
$url = "https://github.com/eladialance-cloud/zt.shentongapi.cn.git"
Write-Host ""
Write-Host "Pushing main ..."
& $git push $url main
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] push main failed"; exit 1 }

# CI 分支 upgrade/electron-41 只是 main 的镜像（触发 Desktop Build CI）
$mainSha = (& $git rev-parse main).Trim()
Write-Host "Pushing main:upgrade/electron-41 (triggers Desktop Build CI) ..."
& $git push $url main:upgrade/electron-41
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] CI 分支普通推送失败（可能非快进），改用 force push（该分支仅为 main 镜像）..."
  & $git push --force $url main:upgrade/electron-41
  if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] push CI branch failed"; exit 1 }
}

# 校验远端 CI 分支已指向 main 同一提交
$remoteSha = (& $git ls-remote $url refs/heads/upgrade/electron-41 | ForEach-Object { ($_ -split "`t")[0] })
Write-Host ""
if ($remoteSha -eq $mainSha) {
  Write-Host "CI 分支已同步: upgrade/electron-41 = $($mainSha.Substring(0,7)) (与 main 一致)"
} else {
  Write-Host "[WARN] CI 分支远端 SHA 不一致: local main=$($mainSha.Substring(0,7)) remote=$($remoteSha.Substring(0,7))"
}
Write-Host ""
Write-Host "下一步: GitHub -> Actions -> Desktop Build -> 最新一次运行 -> Artifacts"
Write-Host "下载 desktop-windows-latest 中的 ShenTongAI-Setup-*.exe 和 latest.yml"
