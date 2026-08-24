# ============================================================================
# 一键推送 CI 修复并触发构建（网络恢复后运行）
# 本次修改:
#   desktop 管理后台移除 + CI 仅构建 + 版本 0.7.5
#                                        + Artifacts 保留供手动下载
# 用法: powershell -ExecutionPolicy Bypass -File scripts/push-trigger-ci.ps1
# ============================================================================
param([string]$CommitMsg = "refactor(desktop): 移除桌面端内置管理后台(路由/页面/API/类型/测试)+版本0.7.4->0.7.5(CI构建0.7.6)")
$ErrorActionPreference = 'Stop'
$git  = 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'
$repo = 'https://github.com/eladialance-cloud/zt.shentongapi.cn.git'
Set-Location 'D:/二次开发'

# 0) 检查 GitHub 连通性
Write-Host "=== 0. 检查 GitHub 连通性 ===" -ForegroundColor Cyan
$ok = Test-NetConnection github.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $ok) {
    Write-Host "ERROR: 连不上 github.com:443（网络不通），请换网络/手机热点后重试" -ForegroundColor Red
    exit 1
}
Write-Host "GitHub 连通 OK" -ForegroundColor Green

# 1) 暂存修改并提交
Write-Host ""
Write-Host "=== 1. add + commit ===" -ForegroundColor Cyan
& $git add -A desktop/package.json desktop/src desktop/tests .github/workflows/desktop-build.yml
if ($LASTEXITCODE -ne 0) { Write-Host "git add 失败" -ForegroundColor Red; exit 1 }
& $git commit -m $CommitMsg
if ($LASTEXITCODE -ne 0) { Write-Host "git commit 失败" -ForegroundColor Red; exit 1 }
& $git --no-pager log --oneline -2

# 2) 推送 main
Write-Host "=== 2. 推送 main ===" -ForegroundColor Cyan
& $git push $repo main
if ($LASTEXITCODE -ne 0) { Write-Host "main 推送失败" -ForegroundColor Red; exit 1 }
Write-Host "main 推送成功" -ForegroundColor Green

# 3) 推送 upgrade/electron-41（CI 触发分支）
Write-Host "=== 3. 推送 upgrade/electron-41（触发 CI）===" -ForegroundColor Cyan
& $git push $repo main:upgrade/electron-41
if ($LASTEXITCODE -ne 0) { Write-Host "upgrade/electron-41 推送失败" -ForegroundColor Red; exit 1 }
Write-Host "upgrade/electron-41 推送成功" -ForegroundColor Green

# 4) 验证远端 refs
Write-Host "=== 4. 验证远端 refs ===" -ForegroundColor Cyan
& $git ls-remote $repo main upgrade/electron-41

Write-Host ""
Write-Host "完成。CI 会构建 0.7.6（仅构建不上传），安装包在 Actions 页面 Artifacts 中下载后手动上传。" -ForegroundColor Green
Write-Host "到 GitHub Actions 页面看进度: https://github.com/eladialance-cloud/zt.shentongapi.cn/actions" -ForegroundColor Yellow
