# pack-mcp-manual.ps1 - Package MCP Gateway portable archive (with Node.js runtime)
# Usage: .\pack-mcp-manual.ps1 [-Version 1.0.0] [-NodeVersion v20.18.1]
#
# Output: cdn/mcp/<version>/mcp-win-x64.tar.gz
# Structure: flat archive (no top-level dir)
#   mcp-gateway.exe.cmd   Windows wrapper (uses portable node/node.exe)
#   mcp-gateway           Unix wrapper (bash)
#   node/                 Node.js runtime (node.exe etc)
#   node_modules/mcp-gateway/
#   package.json
#
# Script outputs SHA-256 and size for manifest.json
#
# NOTES:
# - The .cmd wrapper uses "%~dp0node\node.exe" (portable Node.js bundled in
#   the archive), NOT a bare "node" command. This ensures the archive is
#   fully self-contained and does not depend on the host having Node.js
#   installed or on PATH.
# - npm install runs WITHOUT --ignore-scripts so that any native modules
#   (e.g. sqlite3 / better-sqlite3) are compiled or download prebuilt
#   binaries automatically. If the packaging host lacks build tools and
#   a native module fails, add a separate install step for that module
#   (similar to package-n8n-portable.ps1 step 3b).
# - Node.js v20.x LTS is required (mcp-gateway needs Node >= 18).

param(
    [string]$Version = "0.2.0",
    [string]$NodeVersion = "v20.18.1",
    [string]$PkgName = "mcp-gateway",
    # Relative path (from build root) to the mcp-gateway entry script.
    # Verify against node_modules/mcp-gateway/package.json "bin" or "main" field.
    [string]$EntryRel = "node_modules\mcp-gateway\dist\src\mcp-gateway.js",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $OutputDir) {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $OutputDir = Join-Path $projectRoot "cdn\mcp\$Version"
}

$ArchiveName = "mcp-win-x64.tar.gz"
$ArchivePath = Join-Path $OutputDir $ArchiveName
$BuildDir = Join-Path $env:TEMP "mcp-portable-build-$Version"

$NodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$NodeZip = Join-Path $env:TEMP "node-$NodeVersion-win-x64.zip"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MCP Gateway Portable Packaging" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MCP version:   $Version" -ForegroundColor Gray
Write-Host "  Node version:  $NodeVersion" -ForegroundColor Gray
Write-Host "  npm package:   $PkgName@$Version" -ForegroundColor Gray
Write-Host "  Entry path:    $EntryRel" -ForegroundColor Gray
Write-Host "  Output:        $ArchivePath" -ForegroundColor Gray
Write-Host "  Build dir:     $BuildDir" -ForegroundColor Gray
Write-Host ""

# ============================================================
# 1. Download Node.js v20.x LTS (required >= 18)
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
$pkgJson = '{"name":"mcp-portable","version":"' + $Version + '","private":true}'
[System.IO.File]::WriteAllText((Join-Path $BuildDir "package.json"), $pkgJson, [System.Text.UTF8Encoding]::new($false))

# ============================================================
# 3. npm install mcp-gateway (local, WITHOUT --ignore-scripts)
# ============================================================
# NOTE: --ignore-scripts is intentionally OMITTED so that any native
# modules (e.g. better-sqlite3 / sqlite3) are compiled or have their
# prebuilt binaries downloaded during install. This requires either:
#   (a) build tools on the host (Python + VS Build Tools), OR
#   (b) the native module's install script to fetch a prebuilt binary
#       (most modern packages do this via prebuild-install).
# If a native module fails to install, add a separate step to install
# it without --ignore-scripts (see package-n8n-portable.ps1 step 3b).
Write-Host "[3/6] npm install $PkgName@$Version (local, no --ignore-scripts) ..." -ForegroundColor Yellow

$npmCli = Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path $npmCli)) {
    throw "npm-cli.js not found: $npmCli"
}

$env:PATH = "$nodeDir;" + $env:PATH
$env:npm_config_cache = Join-Path $BuildDir ".npm-cache"
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"

$npmLog = Join-Path $env:TEMP "mcp-npm-install-$Version.log"
Push-Location $BuildDir
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $result = & $nodeExe $npmCli install "$PkgName@$Version" --omit=dev --no-save --no-audit --no-fund 2>&1
    $result | Out-File -FilePath $npmLog -Encoding utf8
    $result | ForEach-Object { Write-Host $_ }
    # npm sometimes exits non-zero for notices/warnings; verify by existence of package dir
    $pkgDir = Join-Path $BuildDir "node_modules\$PkgName"
    if (-not (Test-Path $pkgDir)) {
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  npm install failed (exit $LASTEXITCODE), see log: $npmLog" -ForegroundColor Red
        }
        throw "npm install $PkgName@$Version failed (package dir missing: $pkgDir)"
    }
} finally {
    $ErrorActionPreference = $prevEAP
    Pop-Location
}

# Verify entry point exists. If the guessed path is wrong, print helpful
# guidance so the operator can re-run with -EntryRel <correct path>.
$entryAbs = Join-Path $BuildDir $EntryRel
if (-not (Test-Path $entryAbs)) {
    Write-Host ""
    Write-Host "  WARNING: Expected entry not found: $entryAbs" -ForegroundColor Red
    Write-Host "  Inspect node_modules\$PkgName\package.json `"bin`" / `"main`" field." -ForegroundColor Yellow
    $pkgJsonPath = Join-Path $BuildDir "node_modules\$PkgName\package.json"
    if (Test-Path $pkgJsonPath) {
        $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        if ($pkg.bin) {
            Write-Host "  Detected bin field:" -ForegroundColor Cyan
            $pkg.bin.PSObject.Properties | ForEach-Object {
                Write-Host ("    {0} -> {1}" -f $_.Name, $_.Value) -ForegroundColor Cyan
            }
        }
        if ($pkg.main) {
            Write-Host "  Detected main field: $($pkg.main)" -ForegroundColor Cyan
        }
    }
    throw "mcp-gateway entry not found at: $entryAbs (adjust -EntryRel)"
}
Write-Host "  $PkgName installed, entry: $entryAbs" -ForegroundColor Green

# Clean npm cache
Remove-Item -Recurse -Force (Join-Path $BuildDir ".npm-cache") -ErrorAction SilentlyContinue

# Clean package-lock.json (archive only needs .cmd + node_modules + node/)
Remove-Item -Force (Join-Path $BuildDir "package-lock.json") -ErrorAction SilentlyContinue

# ============================================================
# 4. Create wrapper scripts
# ============================================================
Write-Host "[4/6] Creating wrapper scripts ..." -ForegroundColor Yellow

# mcp-gateway.exe.cmd (Windows)
# CRITICAL: uses "%~dp0node\node.exe" (portable Node bundled in archive),
# NOT a bare "node" command. This ensures the archive is self-contained.
$entryWin = $EntryRel -replace '/', '\'
$cmdContent = "@echo off`r`n""%~dp0node\node.exe"" ""%~dp0$entryWin`" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $BuildDir "mcp-gateway.exe.cmd"), $cmdContent, [System.Text.Encoding]::ASCII)
Write-Host "  mcp-gateway.exe.cmd created" -ForegroundColor Gray
Write-Host "  Content: $cmdContent" -ForegroundColor Gray

# mcp-gateway (Unix bash, LF line endings) 鈥?for cross-platform consistency
$entryFwd = $EntryRel -replace '\\', '/'
$bashContent = '#!/bin/bash' + "`n" + 'DIR="$(cd "$(dirname "$0")" && pwd)"' + "`n" + '"$DIR/node/bin/node" "$DIR/' + $entryFwd + '" "$@"' + "`n"
[System.IO.File]::WriteAllBytes((Join-Path $BuildDir "mcp-gateway"), [System.Text.Encoding]::ASCII.GetBytes($bashContent))
Write-Host "  mcp-gateway (Unix) created" -ForegroundColor Gray

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
Write-Host "manifest.json mcp values:" -ForegroundColor Yellow
Write-Host "{"
Write-Host "  `"version`": `"$Version`","
Write-Host "  `"downloadUrl`": { `"win32-x64`": `"https://zt.shentongapi.cn/runtime/mcp/$Version/mcp-win-x64.tar.gz`" },"
Write-Host "  `"size`": { `"win32-x64`": $archiveSize },"
Write-Host "  `"sha256`": { `"win32-x64`": `"$sha256`" }"
Write-Host "}"
Write-Host ""
Write-Host "Next: run upload-runtime.ps1 to upload to CDN" -ForegroundColor Gray
Write-Host ""
