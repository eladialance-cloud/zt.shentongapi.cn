# package-n8n-portable.ps1 - Package N8N portable archive (with Node.js runtime)
# Usage: .\package-n8n-portable.ps1 [-N8nVersion 1.62.0] [-NodeVersion v20.18.1]
#
# Output: cdn/n8n/<version>/n8n-win-x64.tar.gz
# Structure: flat archive (no top-level dir)
#   n8n.exe.cmd          Windows wrapper
#   n8n                  Unix wrapper (bash)
#   node/                Node.js runtime (node.exe etc)
#   node_modules/n8n/    n8n itself
#   package.json
#
# Script outputs SHA-256 and size for manifest.json

param(
    [string]$N8nVersion = "1.62.0",
    [string]$NodeVersion = "v20.18.1",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $OutputDir) {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $OutputDir = Join-Path $projectRoot "cdn\n8n\$N8nVersion"
}

$ArchiveName = "n8n-win-x64.tar.gz"
$ArchivePath = Join-Path $OutputDir $ArchiveName
$BuildDir = Join-Path $env:TEMP "n8n-portable-build-$N8nVersion"

$NodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$NodeZip = Join-Path $env:TEMP "node-$NodeVersion-win-x64.zip"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  N8N Portable Packaging" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  N8N version:   $N8nVersion" -ForegroundColor Gray
Write-Host "  Node version:  $NodeVersion" -ForegroundColor Gray
Write-Host "  Output:        $ArchivePath" -ForegroundColor Gray
Write-Host "  Build dir:     $BuildDir" -ForegroundColor Gray
Write-Host ""

# ============================================================
# 1. Download Node.js
# ============================================================
function Download-FileWithProgress {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$Destination,
        [string]$Activity = "Download"
    )
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Proxy = [System.Net.WebRequest]::DefaultWebProxy
    if ($request.Proxy -ne $null) {
        $request.Proxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
    }
    $request.Method = "GET"
    $request.AllowAutoRedirect = $true

    $response = $request.GetResponse()
    try {
        $total = $response.ContentLength
        $stream = $response.GetResponseStream()
        $buffer = New-Object byte[] 81920
        $fs = [System.IO.File]::Create($Destination)
        try {
            $read = 0
            $received = 0
            while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $fs.Write($buffer, 0, $read)
                $received += $read
                if ($total -gt 0) {
                    $pct = [int](($received * 100) / $total)
                    Write-Progress -Activity $Activity -Status ("{0:N0} / {1:N0} bytes ({2}%)" -f $received, $total, $pct) -PercentComplete $pct
                } else {
                    Write-Progress -Activity $Activity -Status ("{0:N0} bytes" -f $received)
                }
            }
            Write-Progress -Activity $Activity -Completed
        } finally {
            $fs.Dispose()
        }
    } finally {
        $response.Close()
    }
}

if (-not (Test-Path $NodeZip)) {
    Write-Host "[1/6] Downloading Node.js $NodeVersion ..." -ForegroundColor Yellow
    Download-FileWithProgress -Url $NodeUrl -Destination $NodeZip -Activity "Downloading Node.js $NodeVersion"
    Write-Host "  Downloaded ($([math]::Round((Get-Item $NodeZip).Length / 1MB, 1)) MB)" -ForegroundColor Green
} else {
    Write-Host "[1/6] Node.js zip already exists, skip download" -ForegroundColor Gray
}

# ============================================================
# 2. Prepare build directory
# ============================================================
Write-Host "[2/6] Preparing build directory ..." -ForegroundColor Yellow
Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# Extract Node.js
Write-Host "  Extracting Node.js ..." -ForegroundColor Gray
$nodeExtractParent = Join-Path $BuildDir "_node_extract"
Expand-Archive -Path $NodeZip -DestinationPath $nodeExtractParent -Force
$extractedNodeDir = Get-ChildItem -Directory $nodeExtractParent | Select-Object -First 1
$nodeDir = Join-Path $BuildDir "node"
Move-Item $extractedNodeDir.FullName $nodeDir
Remove-Item $nodeExtractParent -Recurse -Force

$nodeExe = Join-Path $nodeDir "node.exe"
if (-not (Test-Path $nodeExe)) {
    throw "node.exe not found after extraction: $nodeExe"
}
Write-Host "  Node.js ready: $nodeExe" -ForegroundColor Green

# Create package.json
$pkgJson = '{"name":"n8n-portable","version":"' + $N8nVersion + '","private":true}'
[System.IO.File]::WriteAllText((Join-Path $BuildDir "package.json"), $pkgJson, [System.Text.UTF8Encoding]::new($false))

# ============================================================
# 3. npm install n8n (local, --ignore-scripts)
# ============================================================
# Strategy: the main n8n install uses --ignore-scripts to skip the
# install/postinstall scripts of ALL transitive dependencies. This avoids
# needing Windows Build Tools (Python + VS C++) for the many native modules
# in n8n's dependency tree. However, --ignore-scripts also skips
# better-sqlite3's prebuild-install step which downloads the prebuilt
# native binary 鈥?so n8n crashes at startup with:
#   DriverPackageNotInstalledError: SQLite package has not been found installed.
#
# Fix (Step 3b below): after the main install, separately install
# better-sqlite3 WITHOUT --ignore-scripts. Its install script
# (prebuild-install) fetches a prebuilt .node binary from GitHub releases
# for win-x64 + Node v20 鈥?no build tools required.
Write-Host "[3/6] npm install n8n@$N8nVersion (local, --ignore-scripts) ..." -ForegroundColor Yellow

$npmCli = Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path $npmCli)) {
    throw "npm-cli.js not found: $npmCli"
}

$env:PATH = "$nodeDir;" + $env:PATH
$env:npm_config_cache = Join-Path $BuildDir ".npm-cache"
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"

$npmLog = Join-Path $env:TEMP "n8n-npm-install-$N8nVersion.log"
Push-Location $BuildDir
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $result = & $nodeExe $npmCli install "n8n@$N8nVersion" --omit=dev --no-save --ignore-scripts --no-audit --no-fund 2>&1
    $result | Out-File -FilePath $npmLog -Encoding utf8
    $result | ForEach-Object { Write-Host $_ }
    # npm sometimes exits non-zero for notices/warnings; verify by existence of package dir
    $pkgDir = Join-Path $BuildDir "node_modules\n8n"
    if (-not (Test-Path $pkgDir)) {
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  npm install failed (exit $LASTEXITCODE), see log: $npmLog" -ForegroundColor Red
        }
        throw "npm install n8n@$N8nVersion failed (package dir missing: $pkgDir)"
    }
} finally {
    $ErrorActionPreference = $prevEAP
    Pop-Location
}

$n8nBinPath = Join-Path $BuildDir "node_modules\n8n\bin\n8n"
if (-not (Test-Path $n8nBinPath)) {
    throw "n8n bin not found after install: $n8nBinPath"
}
Write-Host "  n8n installed" -ForegroundColor Green

# ============================================================
# 3b. Install better-sqlite3 (prebuilt binary, no build tools needed)
# ============================================================
# n8n 1.62.0 uses TypeORM's SQLite driver to initialize its database.
# TypeORM's SqliteDriver tries better-sqlite3 first, then falls back to
# sqlite3. The main install above used --ignore-scripts, which skipped
# better-sqlite3's prebuild-install step 鈥?so the native binary is missing.
#
# Here we install better-sqlite3 WITHOUT --ignore-scripts so that its
# install script (prebuild-install) downloads the prebuilt .node binary
# for win-x64 + Node v20 from GitHub releases. This does NOT require
# Visual Studio Build Tools or Python on the packaging host.
Write-Host "[3b/6] npm install better-sqlite3 (prebuilt, NO --ignore-scripts) ..." -ForegroundColor Yellow
Push-Location $BuildDir
try {
    & $nodeExe $npmCli install "better-sqlite3" --omit=dev --no-save --no-audit --no-fund 2>&1 | Tee-Object -FilePath $npmLog -Append
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  better-sqlite3 install failed (exit $LASTEXITCODE), see log: $npmLog" -ForegroundColor Red
        Write-Host "  This usually means the prebuilt binary is unavailable for this Node/OS combo." -ForegroundColor Yellow
        Write-Host "  Fallback options: (1) install sqlite3 instead, (2) install Windows Build Tools." -ForegroundColor Yellow
        throw "npm install better-sqlite3 failed"
    }
} finally {
    Pop-Location
}

# Verify better-sqlite3 native binary exists (prebuild-install should have placed it)
$bsqlitePath = Join-Path $BuildDir "node_modules\better-sqlite3"
if (-not (Test-Path $bsqlitePath)) {
    throw "better-sqlite3 not found after install: $bsqlitePath"
}
$bsqliteNative = Get-ChildItem -Path (Join-Path $bsqlitePath "build\Release") -Filter "*.node" -ErrorAction SilentlyContinue
if (-not $bsqliteNative) {
    # Newer better-sqlite3 versions may use a prebuilds/ dir instead of build/Release
    $bsqlitePrebuild = Get-ChildItem -Path (Join-Path $bsqlitePath "prebuilds") -Filter "*.node" -Recurse -ErrorAction SilentlyContinue
    if (-not $bsqlitePrebuild) {
        Write-Host "  WARNING: better-sqlite3 native binary (.node) not found in build/Release or prebuilds/" -ForegroundColor Yellow
        Write-Host "  n8n may still fail to initialize SQLite DB at runtime." -ForegroundColor Yellow
    } else {
        Write-Host "  better-sqlite3 native binary found (prebuilds/)" -ForegroundColor Green
    }
} else {
    Write-Host "  better-sqlite3 native binary found (build/Release)" -ForegroundColor Green
}
Write-Host "  better-sqlite3 installed (SQLite driver ready for n8n)" -ForegroundColor Green

# Clean npm cache and package-lock.json (reduce archive size)
Remove-Item -Recurse -Force (Join-Path $BuildDir ".npm-cache") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $BuildDir "package-lock.json") -ErrorAction SilentlyContinue

# ============================================================
# 4. Create wrapper scripts
# ============================================================
Write-Host "[4/6] Creating wrapper scripts ..." -ForegroundColor Yellow

# n8n.exe.cmd (Windows)
$cmdContent = "@echo off`r`n""%~dp0node\node.exe"" ""%~dp0node_modules\n8n\bin\n8n"" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $BuildDir "n8n.exe.cmd"), $cmdContent, [System.Text.Encoding]::ASCII)
Write-Host "  n8n.exe.cmd created" -ForegroundColor Gray

# n8n (Unix bash, LF line endings)
$bashContent = '#!/bin/bash' + "`n" + 'DIR="$(cd "$(dirname "$0")" && pwd)"' + "`n" + '"$DIR/node/bin/node" "$DIR/node_modules/n8n/bin/n8n" "$@"' + "`n"
[System.IO.File]::WriteAllBytes((Join-Path $BuildDir "n8n"), [System.Text.Encoding]::ASCII.GetBytes($bashContent))
Write-Host "  n8n (Unix) created" -ForegroundColor Gray

# ============================================================
# 5. Package tar.gz (flat structure)
# ============================================================
Write-Host "[5/6] Packaging tar.gz ..." -ForegroundColor Yellow

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Remove-Item -Force $ArchivePath -ErrorAction SilentlyContinue

& tar -C $BuildDir -czf $ArchivePath --mode=0755 .
if ($LASTEXITCODE -ne 0) {
    Write-Host "  tar failed without --mode, retrying ..." -ForegroundColor Yellow
    & tar -C $BuildDir -czf $ArchivePath .
    if ($LASTEXITCODE -ne 0) {
        throw "tar packaging failed (exit $LASTEXITCODE)"
    }
}

$archiveSize = (Get-Item $ArchivePath).Length
Write-Host "  Packaged: $ArchivePath ($([math]::Round($archiveSize / 1MB, 2)) MB)" -ForegroundColor Green

# ============================================================
# 6. Compute SHA-256 and output manifest values
# ============================================================
Write-Host "[6/6] Computing SHA-256 ..." -ForegroundColor Yellow

$sha256 = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
Write-Host "  SHA-256: $sha256" -ForegroundColor Green

# ============================================================
# Output manifest.json fill values
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Packaging complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Archive: $ArchivePath" -ForegroundColor Cyan
Write-Host ""
Write-Host "manifest.json n8n values:" -ForegroundColor Yellow
Write-Host "{"
Write-Host "  `"version`": `"$N8nVersion`","
Write-Host "  `"downloadUrl`": { `"win32-x64`": `"https://zt.shentongapi.cn/runtime/n8n/$N8nVersion/n8n-win-x64.tar.gz`" },"
Write-Host "  `"size`": { `"win32-x64`": $archiveSize },"
Write-Host "  `"sha256`": { `"win32-x64`": `"$sha256`" }"
Write-Host "}"
Write-Host ""
Write-Host "Next: run upload-runtime.ps1 to upload to CDN" -ForegroundColor Gray
Write-Host ""
