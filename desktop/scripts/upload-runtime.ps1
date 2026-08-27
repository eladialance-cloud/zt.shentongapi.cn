# upload-runtime.ps1 - Upload runtime archives (tar.gz) to CDN server
# Usage: .\upload-runtime.ps1

param(
    [string]$ServerUser = "ubuntu",
    [string]$ServerHost = "129.204.227.200",
    [string]$RemoteProjectDir = "/opt/shentong",
    [string]$CdnLocalDir = "D:\二次开发\cdn"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$CdnDomain = "zt.shentongapi.cn"
$CdnBasePath = "/runtime"
$RemoteBaseDir = "$RemoteProjectDir/updates/runtime"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Upload Runtime Archives to CDN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Target: ${ServerUser}@${ServerHost}:$RemoteBaseDir/" -ForegroundColor Gray
Write-Host "  Local:  $CdnLocalDir" -ForegroundColor Gray
Write-Host ""

# 1. Check local dir and scan archives
if (-not (Test-Path $CdnLocalDir)) {
    Write-Host "[ERROR] CDN local dir not found: $CdnLocalDir" -ForegroundColor Red
    exit 1
}

$archives = Get-ChildItem -Path $CdnLocalDir -Recurse -Filter *.tar.gz | Where-Object { -not $_.PSIsContainer }

if ($archives -eq $null -or $archives.Count -eq 0) {
    Write-Host "[ERROR] No .tar.gz archives found in: $CdnLocalDir" -ForegroundColor Red
    exit 1
}

if ($archives -isnot [System.Array]) {
    $archives = @($archives)
}

# Parse each archive's relative path to determine service / version / filename
$uploadList = @()
foreach ($file in $archives) {
    $relativePath = $file.FullName.Substring($CdnLocalDir.Length).TrimStart('\', '/')
    $parts = $relativePath -split '[\\/]'
    if ($parts.Count -lt 3) {
        Write-Host "[WARN] Skipping file with wrong structure: $relativePath" -ForegroundColor Yellow
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
    Write-Host "[ERROR] No valid archives to upload" -ForegroundColor Red
    exit 1
}

Write-Host "  Found $($uploadList.Count) archive(s):" -ForegroundColor Gray
foreach ($item in $uploadList) {
    Write-Host ("    {0} ({1} MB)" -f $item.Relative, $item.SizeMB) -ForegroundColor Gray
}
Write-Host ""

# 2. SCP upload each archive to /tmp/
Write-Host "Uploading to server, may require password..." -ForegroundColor Yellow
Write-Host ""

$total = $uploadList.Count
$index = 0
foreach ($item in $uploadList) {
    $index++
    $tmpRemote = "/tmp/runtime_upload_$($item.Service)_$($item.Version)_$($item.Filename)"
    Write-Host "[$index/$total] Uploading $($item.Filename) ..." -ForegroundColor Yellow
    scp $item.FilePath "${ServerUser}@${ServerHost}:$tmpRemote"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Upload $($item.Filename) failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] Done" -ForegroundColor Green
}

# 3. Remote deploy: create dirs, move files, set permissions
Write-Host ""
Write-Host "Remote deploy..." -ForegroundColor Yellow

$moveCommands = ""
foreach ($item in $uploadList) {
    $targetDir = "$RemoteBaseDir/$($item.Service)/$($item.Version)"
    $targetFile = "$targetDir/$($item.Filename)"
    $tmpRemote = "/tmp/runtime_upload_$($item.Service)_$($item.Version)_$($item.Filename)"
    $moveCommands += "sudo mkdir -p $targetDir && sudo mv $tmpRemote `"$targetFile`" && "
}

$serviceDirs = $uploadList | ForEach-Object { "$RemoteBaseDir/$($_.Service)" } | Sort-Object -Unique
$chownCommands = ""
foreach ($svcDir in $serviceDirs) {
    $chownCommands += "sudo chown -R www-data:www-data $svcDir && sudo chmod -R 755 $svcDir && "
}

$remoteCmd = @"
$moveCommands$chownCommands
rm -f /tmp/runtime_upload_* && \
echo '=== Deploy done ===' && \
find $RemoteBaseDir -type f -name '*.tar.gz' | sort
"@

$remoteCmd = $remoteCmd -replace "`r", ""
ssh "${ServerUser}@${ServerHost}" $remoteCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Remote deploy failed" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Files deployed" -ForegroundColor Green

# 4. Verify CDN reachability
Write-Host ""
Write-Host "Verifying CDN..." -ForegroundColor Yellow

foreach ($item in $uploadList) {
    $verifyUrl = "https://$CdnDomain$CdnBasePath/$($item.Service)/$($item.Version)/$($item.Filename)"
    try {
        $response = Invoke-WebRequest -Uri $verifyUrl -Method Head -UseBasicParsing -TimeoutSec 30
        Write-Host "  [OK] $verifyUrl ($($response.StatusCode))" -ForegroundColor Green
    }
    catch {
        $statusCode = "N/A"
        if ($_.Exception.Response -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        Write-Host "  [WARN] $verifyUrl failed (HTTP $statusCode)" -ForegroundColor Yellow
    }
}

# 5. Done
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Runtime archives upload complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  CDN base: https://$CdnDomain$CdnBasePath/" -ForegroundColor Cyan
Write-Host ""
