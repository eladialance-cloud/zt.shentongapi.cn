# fix-git-video-claw-history.ps1
# 用途: 重写最后2个提交(4984a207+c7ffa539)，从 git 历史剔除技能内置的
#       超大构建产物 node_modules(684MB)/.next(97MB)/__pycache__，适配 GitHub 100MB 单文件限制。
# 说明: 只操作 HEAD/索引，不动工作区与磁盘文件；合并为一个新提交后推送。
#       可重复执行（幂等）：若上次被安全网中止，直接重跑即可。
# 用法: powershell -ExecutionPolicy Bypass -File scripts\fix-git-video-claw-history.ps1
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
$base = "8a197e69"      # 4984a207 的父提交
$old  = "c7ffa539"      # 原最后一个提交

Write-Host "=== [1/5] 状态确认 ==="
$head = (& $git rev-parse --short HEAD).Trim()
Write-Host "当前 HEAD: $head  -> 将合并重写最后 2 个提交(4984a207+c7ffa539)"
$confirm = Read-Host "确认继续? 输入 y 回车"
if ($confirm -ne "y") { Write-Host "已取消"; exit 1 }

Write-Host "=== [2/5] git reset --mixed $base（索引/HEAD 回到基线，工作区与磁盘文件保留）==="
& $git reset --mixed $base
if ($LASTEXITCODE -ne 0) { throw "reset --mixed 失败" }

Write-Host "=== [3/5] 暂存技能副本源码（.gitignore 自动排除 node_modules/.next/__pycache__）==="
& $git add -A -- "video-claw" "desktop/resources/openclaw/skills/video-claw"
if ($LASTEXITCODE -ne 0) { throw "git add 技能副本失败" }

Write-Host "=== [3.5/5] 暂存两个提交的其余变更（桌面端代码/脚本/manifest，按 git 记录清单）==="
$rest = (& $git diff --name-only $base $old) | Where-Object { $_ -notmatch "^(video-claw/|desktop/resources/openclaw/skills/video-claw/|desktop/runtime/manifest.json$)" }
Write-Host "其余变更文件数: $($rest.Count)"
if ($rest.Count -gt 0) {
  # 注意: 不要用 2>&1 捕获 git 输出，CRLF 警告会被转成终止错误（PS5.1 + EAP=Stop）
  & $git add -- @rest
  if ($LASTEXITCODE -ne 0) { throw "git add 其余变更失败(exit=$LASTEXITCODE)" }
}
# 本次配套修改（版本号/.gitignore/脚本修复）
& $git add ".gitignore" "desktop/package.json" "scripts/commit-video-claw.ps1" "scripts/fix-git-video-claw-history.ps1"
& $git add -f "desktop/runtime/manifest.json"   # runtime/ 被根 .gitignore 排除，需 -f 强制（小文件，白名单）
if ($LASTEXITCODE -ne 0) { throw "git add 配套文件失败" }

Write-Host "=== [4/5] 安全网校验 + 提交 ==="
$bad = & $git diff --cached --name-only | Select-String -Pattern "video-claw.*(node_modules|/\.next/|__pycache__)"
if ($bad) {
  Write-Host "[ERROR] 暂存区仍存在应剔除的文件:"
  $bad | Select-Object -First 10 | ForEach-Object { Write-Host "  $($_.Line)" }
  throw "中止提交，请检查"
}
$staged = & $git diff --cached --name-only
Write-Host "暂存文件数: $($staged.Count)"
& $git commit -m "feat(video-claw): 接入AI视频生成-本地服务+技能内置+llmproxy适配+桌面端页面+版本0.8.10(剔除技能内置node_modules/.next-适配GitHub 100MB限制)"
if ($LASTEXITCODE -ne 0) { throw "commit 失败" }

Write-Host "=== [5/5] 推送 ==="
& $git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] push 失败（多为网络/凭据问题），稍后手动重试: git push origin main"
} else {
  Write-Host "[OK] push 成功"
}

Write-Host ""
Write-Host "=== 完成 ==="
Write-Host "服务器下一步:"
Write-Host "  cd /opt/shentong && sudo git pull origin main"
Write-Host "  cd backend && sudo rm -rf dist && sudo npm run build 2>&1 | tail -3 && echo BUILD_OK"
Write-Host "  for i in 1 2 3; do sudo fuser -k 3001/tcp 2>/dev/null; sleep 2; sudo ss -tlnp | grep 3001 || break; done"
Write-Host "  sudo bash -c 'cd /opt/shentong/backend && nohup node /opt/shentong/backend/dist/main.js > server.log 2>&1 &'"
Write-Host "  sleep 12 && curl -s http://127.0.0.1:3001/api/health; echo"
