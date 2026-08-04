# upload-v029.ps1 - 上传深瞳AI桌面端 v0.2.9 到服务器
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# 用法: .\upload-v029.ps1
# 会提示输入 SSH 密码

$ServerUser = "ubuntu"
$ServerHost = "129.204.227.200"
$RemoteDir = "/opt/shentong/updates"
$ReleaseDir = "D:\二次开发\desktop\dist\release-v029"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  上传深瞳AI v0.2.9 到服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  目标: ${ServerUser}@${ServerHost}:$RemoteDir/" -ForegroundColor Gray
Write-Host ""

# 检查文件
$files = @(
    "ShenTongAI-0.2.9-x64.zip",
    "ShenTongAI-Setup-0.2.9-x64.exe",
    "latest.yml",
    "index.html"
)

foreach ($f in $files) {
    $path = Join-Path $ReleaseDir $f
    if (-not (Test-Path $path)) {
        Write-Host "❌ 文件不存在: $path" -ForegroundColor Red
        exit 1
    }
    $size = [math]::Round((Get-Item $path).Length/1MB, 2)
    Write-Host "  ✅ $f ($size MB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "即将上传到服务器，可能需要输入密码..." -ForegroundColor Yellow
Write-Host ""

# 上传每个文件
foreach ($f in $files) {
    $localPath = Join-Path $ReleaseDir $f
    Write-Host "上传 $f ..." -ForegroundColor Yellow
    scp $localPath "${ServerUser}@${ServerHost}:/tmp/st_upload_$f"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 上传 $f 失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✅ 完成" -ForegroundColor Green
}

# 远程部署
Write-Host ""
Write-Host "远程部署..." -ForegroundColor Yellow

$remoteCmd = @"
sudo mkdir -p $RemoteDir && \
sudo rm -f $RemoteDir/* && \
sudo cp /tmp/st_upload_* $RemoteDir/ && \
sudo chown -R www-data:www-data $RemoteDir/ && \
sudo chmod -R 755 $RemoteDir/ && \
rm -f /tmp/st_upload_* && \
echo '=== 部署完成 ===' && \
ls -lh $RemoteDir/
"@

ssh "${ServerUser}@${ServerHost}" $remoteCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 远程部署失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  🎉 v0.2.9 上传部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  下载页面: https://zt.shentongapi.cn/desktop/" -ForegroundColor Cyan
Write-Host "  更新清单: https://zt.shentongapi.cn/desktop/latest.yml" -ForegroundColor Cyan
Write-Host ""
