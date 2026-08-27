# upload-runtime.ps1 - 上传运行时归档（tar.gz）到 CDN 服务器并配置 nginx 静态服务
# 用法: .\upload-runtime.ps1
# 会提示输入 SSH 密码
#
# CDN 本地暂存目录结构: <service>/<version>/<service>-win-x64.tar.gz
#   例如: cdn/openclaw/0.3.0/openclaw-win-x64.tar.gz
#         cdn/mcp/0.2.0/mcp-win-x64.tar.gz
# 服务器目标目录: /opt/shentong/runtime/<service>/<version>/<file>
# CDN 验证 URL: https://zt.shentongapi.cn/runtime/<service>/<version>/<file>

param(
    [string]$ServerUser = "ubuntu",
    [string]$ServerHost = "129.204.227.200",
    [string]$RemoteProjectDir = "/opt/shentong",  # 服务器上 docker-compose.yml 所在目录
    [string]$CdnLocalDir = "D:\二次开发\cdn"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$CdnDomain = "zt.shentongapi.cn"
$CdnBasePath = "/runtime"
# nginx location /runtime/ alias /opt/shentong/updates/runtime/
$RemoteBaseDir = "$RemoteProjectDir/updates/runtime"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  上传运行时归档到 CDN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  目标: ${ServerUser}@${ServerHost}:$RemoteBaseDir/" -ForegroundColor Gray
Write-Host "  本地: $CdnLocalDir" -ForegroundColor Gray
Write-Host ""

# 1. 检查本地目录与扫描归档文件
if (-not (Test-Path $CdnLocalDir)) {
    Write-Host "❌ CDN 本地目录不存在: $CdnLocalDir" -ForegroundColor Red
    exit 1
}

$archives = Get-ChildItem -Path $CdnLocalDir -Recurse -Filter *.tar.gz | Where-Object { -not $_.PSIsContainer }

if ($archives -eq $null -or $archives.Count -eq 0) {
    Write-Host "❌ 未找到任何 .tar.gz 归档文件: $CdnLocalDir" -ForegroundColor Red
    exit 1
}

# 单个对象时强制转为数组
if ($archives -isnot [System.Array]) {
    $archives = @($archives)
}

# 解析每个归档的相对路径，确定 service / version / filename
$uploadList = @()
foreach ($file in $archives) {
    $relativePath = $file.FullName.Substring($CdnLocalDir.Length).TrimStart('\', '/')
    $parts = $relativePath -split '[\\/]'
    if ($parts.Count -lt 3) {
        Write-Host "⚠️  跳过不符合结构的文件: $relativePath（应为 <service>/<version>/<file>）" -ForegroundColor Yellow
        continue
    }
    $service = $parts[0]
    $version = $parts[1]
    $filename = $parts[$parts.Count - 1]
    $sizeMB = [math]::Round($file.Length / 1MB, 2)
    $uploadList += [PSCustomObject]@{
        Service  = $service
        Version  = $version
        Filename = $filename
        FilePath = $file.FullName
        SizeMB   = $sizeMB
        Relative = "$service/$version/$filename"
    }
}

if ($uploadList.Count -eq 0) {
    Write-Host "❌ 没有可上传的有效归档文件（结构需为 <service>/<version>/<file>）" -ForegroundColor Red
    exit 1
}

Write-Host "  找到 $($uploadList.Count) 个归档文件:" -ForegroundColor Gray
foreach ($item in $uploadList) {
    Write-Host ("    {0} ({1} MB)" -f $item.Relative, $item.SizeMB) -ForegroundColor Gray
}
Write-Host ""

# 2. SCP 上传每个归档文件到 /tmp/
Write-Host "即将上传到服务器，可能需要输入密码..." -ForegroundColor Yellow
Write-Host ""

$total = $uploadList.Count
$index = 0
foreach ($item in $uploadList) {
    $index++
    $tmpRemote = "/tmp/runtime_upload_$($item.Service)_$($item.Version)_$($item.Filename)"
    Write-Host "[$index/$total] 上传 $($item.Filename) ..." -ForegroundColor Yellow
    scp $item.FilePath "${ServerUser}@${ServerHost}:$tmpRemote"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ 上传 $($item.Filename) 失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✅ 完成" -ForegroundColor Green
}

# 3. 远程部署：创建目录、移动文件、设置权限、清理临时文件
Write-Host ""
Write-Host "远程部署..." -ForegroundColor Yellow

$moveCommands = ""
foreach ($item in $uploadList) {
    $targetDir = "$RemoteBaseDir/$($item.Service)/$($item.Version)"
    $targetFile = "$targetDir/$($item.Filename)"
    $tmpRemote = "/tmp/runtime_upload_$($item.Service)_$($item.Version)_$($item.Filename)"
    $moveCommands += "sudo mkdir -p $targetDir && " + `
        "sudo mv $tmpRemote $targetFile && "
}

# 收集所有涉及的 service 目录用于统一设置权限
$serviceDirs = $uploadList | ForEach-Object { "$RemoteBaseDir/$($_.Service)" } | Sort-Object -Unique
$chownCommands = ""
foreach ($svcDir in $serviceDirs) {
    $chownCommands += "sudo chown -R www-data:www-data $svcDir && " + `
        "sudo chmod -R 755 $svcDir && "
}

$remoteCmd = @"
$moveCommands$chownCommands
rm -f /tmp/runtime_upload_* && \
echo '=== 部署完成 ===' && \
find $RemoteBaseDir -type f -name '*.tar.gz' | sort
"@

$remoteCmd = $remoteCmd -replace "`r", ""
ssh "${ServerUser}@${ServerHost}" $remoteCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ 远程部署失败" -ForegroundColor Red
    exit 1
}

Write-Host "  ✅ 文件已部署" -ForegroundColor Green

# 4. 验证 CDN 可达性
Write-Host ""
Write-Host "验证 CDN 可达性..." -ForegroundColor Yellow

foreach ($item in $uploadList) {
    $verifyUrl = "https://$CdnDomain$CdnBasePath/$($item.Service)/$($item.Version)/$($item.Filename)"
    try {
        $response = Invoke-WebRequest -Uri $verifyUrl -Method Head -UseBasicParsing -TimeoutSec 30
        Write-Host "  ✅ $verifyUrl ($($response.StatusCode) OK)" -ForegroundColor Green
    }
    catch {
        $statusCode = "N/A"
        if ($_.Exception.Response -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        Write-Host "  ⚠️  $verifyUrl 验证失败 (HTTP $statusCode)" -ForegroundColor Yellow
        Write-Host "      可稍后手动验证，不影响上传结果" -ForegroundColor Gray
    }
}

# 5. 完成
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  🎉 运行时归档上传完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  CDN 基础路径: https://$CdnDomain$CdnBasePath/" -ForegroundColor Cyan
Write-Host ""
