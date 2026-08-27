# package-hermes-portable.ps1 - Package Hermes Agent portable archive (with Node.js runtime)
# Usage: .\package-hermes-portable.ps1 [-HermesVersion 0.19.0] [-NodeVersion v20.18.1]
#
# Output: cdn/hermes/<version>/hermes-win-x64.tar.gz
# Structure: flat archive (no top-level dir)
#   hermes.exe.cmd        Windows wrapper
#   hermes                Unix wrapper (bash)
#   node/                 Node.js runtime (node.exe etc)
#   node_modules/hermes-agent/   hermes-agent itself
#   package.json
#
# Script outputs SHA-256 and size for manifest.json
#
# NOTES:
# - hermes-agent listens on port 8642 at runtime; port configuration is injected
#   by service-manager via env vars, NOT by this packaging script.
# - CUSTOM_API_KEY and CUSTOM_BASE_URL env vars are injected by service-manager
#   at spawn time (from HERMES_API_SERVER_KEY and MCP_BACKEND_URL). This script
#   does NOT need to handle them.
# - npm install runs WITHOUT --ignore-scripts so that any native modules
#   (e.g. sqlite3 / better-sqlite3 used by hermes-agent for local SQLite
#   storage) are compiled automatically during install.
# - The hermes-agent entry point path below is a best-guess; verify the actual
#   path after install by inspecting node_modules/hermes-agent/package.json
#   "bin" field. Common candidates:
#       bin/hermes          (no extension, shebang script)
#       bin/hermes.js       (Node script)
#       dist/index.js       (compiled entry)
#   The default below uses bin/hermes. Adjust $HermesEntryRel if needed.

param(
    [string]$HermesVersion = "0.20.5",
    [string]$NodeVersion = "v20.18.1",
    [string]$HermesPkg = "hermes-agent",
    # Relative path (from build root) to the hermes entry script.
    # Verify against node_modules/hermes-agent/package.json "bin" field.
    [string]$HermesEntryRel = "node_modules\hermes-agent\bin\hermes.js",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $OutputDir) {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $OutputDir = Join-Path $projectRoot "cdn\hermes\$HermesVersion"
}

$ArchiveName = "hermes-win-x64.tar.gz"
$ArchivePath = Join-Path $OutputDir $ArchiveName
$BuildDir = Join-Path $env:TEMP "hermes-portable-build-$HermesVersion"

$NodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$NodeZip = Join-Path $env:TEMP "node-$NodeVersion-win-x64.zip"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Hermes Agent Portable Packaging" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Hermes version: $HermesVersion" -ForegroundColor Gray
Write-Host "  Node version:   $NodeVersion" -ForegroundColor Gray
Write-Host "  npm package:    $HermesPkg@$HermesVersion" -ForegroundColor Gray
Write-Host "  Entry path:     $HermesEntryRel" -ForegroundColor Gray
Write-Host "  Output:         $ArchivePath" -ForegroundColor Gray
Write-Host "  Build dir:      $BuildDir" -ForegroundColor Gray
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
# 2. Prepare build directory (幂等: 已装同版本则跳过重建, 避免重复 npm install)
# ============================================================
$skipReinstall = $false
$installedPkgJson = Join-Path $BuildDir "node_modules\$HermesPkg\package.json"
if (Test-Path $installedPkgJson) {
    try {
        $installedVer = (Get-Content $installedPkgJson -Raw | ConvertFrom-Json).version
        if ($installedVer -eq $HermesVersion) { $skipReinstall = $true }
    } catch { $skipReinstall = $false }
}
if ($skipReinstall) {
    Write-Host "[2/6] Build dir already has $HermesPkg@$HermesVersion, skip Node extract + npm install ..." -ForegroundColor Gray
} else {
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
$pkgJson = '{"name":"hermes-portable","version":"' + $HermesVersion + '","private":true}'
[System.IO.File]::WriteAllText((Join-Path $BuildDir "package.json"), $pkgJson, [System.Text.UTF8Encoding]::new($false))

# ============================================================
# 3. npm install hermes-agent (local, WITHOUT --ignore-scripts)
# ============================================================
# NOTE: --ignore-scripts is intentionally OMITTED so that native modules
# (e.g. sqlite3 / better-sqlite3 used by hermes-agent for local SQLite
# storage) are compiled during install. This requires node-gyp / build tools
# to be available on the packaging host (Python + VS Build Tools).
Write-Host "[3/6] npm install $HermesPkg@$HermesVersion (local, native modules compiled) ..." -ForegroundColor Yellow

$npmCli = Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path $npmCli)) {
    throw "npm-cli.js not found: $npmCli"
}

$env:PATH = "$nodeDir;" + $env:PATH
$env:npm_config_cache = Join-Path $BuildDir ".npm-cache"
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"

$npmLog = Join-Path $env:TEMP "hermes-npm-install-$HermesVersion.log"
Push-Location $BuildDir
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $result = & $nodeExe $npmCli install "$HermesPkg@$HermesVersion" --omit=dev --no-save --no-audit --no-fund 2>&1
    $result | Out-File -FilePath $npmLog -Encoding utf8
    $result | ForEach-Object { Write-Host $_ }
    # npm sometimes exits non-zero for notices/warnings; verify by existence of package dir
    $pkgDir = Join-Path $BuildDir "node_modules\$HermesPkg"
    if (-not (Test-Path $pkgDir)) {
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  npm install failed (exit $LASTEXITCODE), see log: $npmLog" -ForegroundColor Red
        }
        throw "npm install $HermesPkg@$HermesVersion failed (package dir missing: $pkgDir)"
    }
} finally {
    $ErrorActionPreference = $prevEAP
    Pop-Location
}
}

# Verify entry point exists. If the guessed path is wrong, print helpful
# guidance so the operator can re-run with -HermesEntryRel <correct path>.
$hermesEntryAbs = Join-Path $BuildDir $HermesEntryRel
if (-not (Test-Path $hermesEntryAbs)) {
    Write-Host ""
    Write-Host "  WARNING: Expected entry not found: $hermesEntryAbs" -ForegroundColor Red
    Write-Host "  Inspect node_modules\$HermesPkg\package.json `"bin`" field." -ForegroundColor Yellow
    $pkgJsonPath = Join-Path $BuildDir "node_modules\$HermesPkg\package.json"
    if (Test-Path $pkgJsonPath) {
        $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        if ($pkg.bin) {
            Write-Host "  Detected bin field:" -ForegroundColor Cyan
            $pkg.bin.PSObject.Properties | ForEach-Object {
                Write-Host ("    {0} -> {1}" -f $_.Name, $_.Value) -ForegroundColor Cyan
            }
        }
    }
    throw "hermes entry not found at: $hermesEntryAbs (adjust -HermesEntryRel)"
}
Write-Host "  hermes-agent installed, entry: $hermesEntryAbs" -ForegroundColor Green

# Clean npm cache
Remove-Item -Recurse -Force (Join-Path $BuildDir ".npm-cache") -ErrorAction SilentlyContinue

# ============================================================
# 4. Create wrapper scripts
# ============================================================
Write-Host "[4/6] Creating wrapper scripts ..." -ForegroundColor Yellow

# Convert Windows backslashes to forward slashes for the .cmd path
$entryFwd = $HermesEntryRel -replace '\\', '/'

# hermes.exe.cmd (Windows)
$cmdContent = "@echo off`r`n""%~dp0node\node.exe"" ""%~dp0$entryFwd"" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $BuildDir "hermes.exe.cmd"), $cmdContent, [System.Text.Encoding]::ASCII)
Write-Host "  hermes.exe.cmd created" -ForegroundColor Gray

# hermes (Unix bash, LF line endings)
$bashContent = '#!/bin/bash' + "`n" + 'DIR="$(cd "$(dirname "$0")" && pwd)"' + "`n" + '"$DIR/node/bin/node" "$DIR/' + $entryFwd + '" "$@"' + "`n"
[System.IO.File]::WriteAllBytes((Join-Path $BuildDir "hermes"), [System.Text.Encoding]::ASCII.GetBytes($bashContent))
Write-Host "  hermes (Unix) created" -ForegroundColor Gray

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
Write-Host "manifest.json hermes values:" -ForegroundColor Yellow
Write-Host "{"
Write-Host "  `"version`": `"$HermesVersion`","
Write-Host "  `"downloadUrl`": { `"win32-x64`": `"https://zt.shentongapi.cn/runtime/hermes/$HermesVersion/hermes-win-x64.tar.gz`" },"
Write-Host "  `"size`": { `"win32-x64`": $archiveSize },"
Write-Host "  `"sha256`": { `"win32-x64`": `"$sha256`" }"
Write-Host "}"
Write-Host ""
Write-Host "Next: run upload-runtime.ps1 to upload to CDN" -ForegroundColor Gray
Write-Host ""
