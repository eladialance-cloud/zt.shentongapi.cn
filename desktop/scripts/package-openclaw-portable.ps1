# package-openclaw-portable.ps1 - Package OpenClaw portable archive (with Node.js runtime)
# Usage: .\package-openclaw-portable.ps1 [-OpenclawVersion 2026.7.1] [-NodeVersion v22.22.3]
#
# Output: cdn/openclaw/<version>/openclaw-win-x64.tar.gz
# Structure: flat archive (no top-level dir)
#   openclaw.exe.cmd      Windows wrapper
#   openclaw              Unix wrapper (bash)
#   node/                 Node.js runtime (node.exe etc)
#   node_modules/<OpenclawPkg>/   openclaw itself
#   package.json
#
# Script outputs SHA-256 and size for manifest.json
#
# NOTES:
# - OpenClaw requires Node.js >= 22.22.3. Default uses v22.22.3 LTS; a newer
#   v22 LTS release can be supplied via -NodeVersion.
# - npm install runs WITHOUT --ignore-scripts so that any native modules
#   are compiled automatically during install (requires Python + VS Build
#   Tools on the packaging host).
# - The OpenClaw npm package name is NOT verified. Common candidates:
#       openclaw              (top-level unscoped)
#       @anthropic/openclaw   (scoped, hypothesized)
#       openclaw-cli
#   Default uses "openclaw". Override with -OpenclawPkg if install fails.
# - The OpenClaw entry path below is a best-guess (openclaw.mjs); verify
#   after install by inspecting node_modules/<OpenclawPkg>/package.json
#   "bin" field. Common candidates:
#       openclaw.mjs          (ESM entry, no extension change)
#       bin/openclaw.mjs
#       dist/index.js
#       bin/openclaw          (shebang)
#   Adjust -OpenclawEntryRel if the actual path differs.

param(
    [string]$OpenclawVersion = "0.3.0",
    # Node >= 22.22.3 required by openclaw.
    [string]$NodeVersion = "v22.22.3",
    # NOTE: verify actual npm package name. Candidates: openclaw,
    # @anthropic/openclaw, openclaw-cli. Override with -OpenclawPkg if needed.
    [string]$OpenclawPkg = "openclaw",
    # Whether to append @$OpenclawVersion to the npm install spec.
    # Some packages use a non-semver tag; set -UseVersionSuffix $false to
    # install the unversioned package (e.g. npm install openclaw).
    [bool]$UseVersionSuffix = $false,
    # Relative path (from build root) to the openclaw entry script.
    # Verify against node_modules/<OpenclawPkg>/package.json "bin" field.
    [string]$OpenclawEntryRel = "node_modules\openclaw\openclaw.mjs",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $OutputDir) {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $OutputDir = Join-Path $projectRoot "cdn\openclaw\$OpenclawVersion"
}

$ArchiveName = "openclaw-win-x64.tar.gz"
$ArchivePath = Join-Path $OutputDir $ArchiveName
$BuildDir = Join-Path $env:TEMP "openclaw-portable-build-$OpenclawVersion"

$NodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$NodeZip = Join-Path $env:TEMP "node-$NodeVersion-win-x64.zip"

# Build npm install spec
if ($UseVersionSuffix) {
    $installSpec = "$OpenclawPkg@$OpenclawVersion"
} else {
    $installSpec = $OpenclawPkg
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Portable Packaging" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Openclaw version: $OpenclawVersion" -ForegroundColor Gray
Write-Host "  Node version:     $NodeVersion (>= 22.22.3 required)" -ForegroundColor Gray
Write-Host "  npm package:      $installSpec" -ForegroundColor Gray
Write-Host "  Entry path:       $OpenclawEntryRel" -ForegroundColor Gray
Write-Host "  Output:           $ArchivePath" -ForegroundColor Gray
Write-Host "  Build dir:        $BuildDir" -ForegroundColor Gray
Write-Host ""

# ============================================================
# 0. Verify Node version meets minimum (>= 22.22.3)
# ============================================================
$minNode = [Version]"22.22.3"
$nodeVerOnly = $NodeVersion.TrimStart('v')
try {
    $parsedNode = [Version]$nodeVerOnly
} catch {
    Write-Host "  WARNING: could not parse NodeVersion '$NodeVersion' as a version" -ForegroundColor Yellow
    $parsedNode = $null
}
if ($parsedNode -and $parsedNode -lt $minNode) {
    throw "Node version $NodeVersion is below openclaw minimum 22.22.3. Use -NodeVersion v22.22.3 or newer."
}
Write-Host "  Node version check OK (>= 22.22.3)" -ForegroundColor Green

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
$pkgJson = '{"name":"openclaw-portable","version":"' + $OpenclawVersion + '","private":true}'
[System.IO.File]::WriteAllText((Join-Path $BuildDir "package.json"), $pkgJson, [System.Text.UTF8Encoding]::new($false))

# ============================================================
# 3. npm install openclaw (local, WITHOUT --ignore-scripts)
# ============================================================
# NOTE: --ignore-scripts is intentionally OMITTED so that any native
# modules are compiled during install. Requires node-gyp / build tools
# (Python + VS Build Tools) on the packaging host.
Write-Host "[3/6] npm install $installSpec (local, native modules compiled) ..." -ForegroundColor Yellow

$npmCli = Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path $npmCli)) {
    throw "npm-cli.js not found: $npmCli"
}

$env:PATH = "$nodeDir;" + $env:PATH
$env:npm_config_cache = Join-Path $BuildDir ".npm-cache"
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"

$npmLog = Join-Path $env:TEMP "openclaw-npm-install-$OpenclawVersion.log"
Push-Location $BuildDir
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $result = & $nodeExe $npmCli install $installSpec --omit=dev --no-save --no-audit --no-fund 2>&1
    $result | Out-File -FilePath $npmLog -Encoding utf8
    $result | ForEach-Object { Write-Host $_ }
    # npm sometimes exits non-zero for notices/warnings; verify by existence of package dir
    $pkgDir = Join-Path $BuildDir "node_modules\$OpenclawPkg"
    if (-not (Test-Path $pkgDir)) {
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  npm install failed (exit $LASTEXITCODE), see log: $npmLog" -ForegroundColor Red
            Write-Host "  If the package name is wrong, retry with -OpenclawPkg <name>" -ForegroundColor Yellow
        }
        throw "npm install $installSpec failed (package dir missing: $pkgDir)"
    }
} finally {
    $ErrorActionPreference = $prevEAP
    Pop-Location
}

# Verify entry point exists. If the guessed path is wrong, print helpful
# guidance so the operator can re-run with -OpenclawEntryRel <correct path>.
$openclawEntryAbs = Join-Path $BuildDir $OpenclawEntryRel
if (-not (Test-Path $openclawEntryAbs)) {
    Write-Host ""
    Write-Host "  WARNING: Expected entry not found: $openclawEntryAbs" -ForegroundColor Red
    Write-Host "  Inspect node_modules\$OpenclawPkg\package.json `"bin`" field." -ForegroundColor Yellow
    $pkgJsonPath = Join-Path $BuildDir "node_modules\$OpenclawPkg\package.json"
    if (Test-Path $pkgJsonPath) {
        $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        if ($pkg.bin) {
            Write-Host "  Detected bin field:" -ForegroundColor Cyan
            $pkg.bin.PSObject.Properties | ForEach-Object {
                Write-Host ("    {0} -> {1}" -f $_.Name, $_.Value) -ForegroundColor Cyan
            }
        }
        if ($pkg.main) {
            Write-Host ("  Detected main: {0}" -f $pkg.main) -ForegroundColor Cyan
        }
        if ($pkg.module) {
            Write-Host ("  Detected module: {0}" -f $pkg.module) -ForegroundColor Cyan
        }
        if ($pkg.exports) {
            Write-Host "  Detected exports (inspect manually):" -ForegroundColor Cyan
            Write-Host ($pkg.exports | ConvertTo-Json -Depth 5) -ForegroundColor Cyan
        }
    }
    throw "openclaw entry not found at: $openclawEntryAbs (adjust -OpenclawEntryRel)"
}
Write-Host "  openclaw installed, entry: $openclawEntryAbs" -ForegroundColor Green

# Clean npm cache and package-lock.json (reduce archive size)
Remove-Item -Recurse -Force (Join-Path $BuildDir ".npm-cache") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $BuildDir "package-lock.json") -ErrorAction SilentlyContinue

# ============================================================
# 4. Create wrapper scripts
# ============================================================
Write-Host "[4/6] Creating wrapper scripts ..." -ForegroundColor Yellow

# Convert Windows backslashes to forward slashes for the .cmd path
$entryFwd = $OpenclawEntryRel -replace '\\', '/'

# openclaw.exe.cmd (Windows)
$cmdContent = "@echo off`r`n""%~dp0node\node.exe"" ""%~dp0$entryFwd"" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $BuildDir "openclaw.exe.cmd"), $cmdContent, [System.Text.Encoding]::ASCII)
Write-Host "  openclaw.exe.cmd created" -ForegroundColor Gray

# openclaw (Unix bash, LF line endings)
$bashContent = '#!/bin/bash' + "`n" + 'DIR="$(cd "$(dirname "$0")" && pwd)"' + "`n" + '"$DIR/node/bin/node" "$DIR/' + $entryFwd + '" "$@"' + "`n"
[System.IO.File]::WriteAllBytes((Join-Path $BuildDir "openclaw"), [System.Text.Encoding]::ASCII.GetBytes($bashContent))
Write-Host "  openclaw (Unix) created" -ForegroundColor Gray

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
Write-Host "manifest.json openclaw values:" -ForegroundColor Yellow
Write-Host "{"
Write-Host "  `"version`": `"$OpenclawVersion`","
Write-Host "  `"downloadUrl`": { `"win32-x64`": `"https://zt.shentongapi.cn/runtime/openclaw/$OpenclawVersion/openclaw-win-x64.tar.gz`" },"
Write-Host "  `"size`": { `"win32-x64`": $archiveSize },"
Write-Host "  `"sha256`": { `"win32-x64`": `"$sha256`" }"
Write-Host "}"
Write-Host ""
Write-Host "Next: run upload-runtime.ps1 to upload to CDN" -ForegroundColor Gray
Write-Host ""
