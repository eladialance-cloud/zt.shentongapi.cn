# 推送重试脚本：push main + upgrade/electron-41，失败自动重试（最多 10 次）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/push-retry.ps1
Set-Location "D:\二次开发"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
$remote = "https://github.com/eladialance-cloud/zt.shentongapi.cn.git"
if (-not (Test-Path $git)) { Write-Error "找不到 git: $git" }
for ($i = 1; $i -le 10; $i++) {
  Write-Host ("--- 第 {0} 次尝试 main ---" -f $i)
  & $git push $remote main
  if ($LASTEXITCODE -eq 0) {
    Write-Host "main 推送成功"
    for ($j = 1; $j -le 10; $j++) {
      Write-Host ("--- 第 {0} 次尝试 upgrade/electron-41 ---" -f $j)
      & $git push $remote main:upgrade/electron-41
      if ($LASTEXITCODE -eq 0) { Write-Host "两个分支都推送成功"; exit 0 }
      Start-Sleep -Seconds 10
    }
    Write-Host "upgrade/electron-41 推送失败"; exit 1
  }
  Start-Sleep -Seconds 10
}
Write-Host "main 推送失败（网络持续不通）"; exit 1