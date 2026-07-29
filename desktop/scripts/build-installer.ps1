# =============================================================================
# 娣辩灣AI 妗岄潰瀹㈡埛绔?- Windows 涓€閿墦鍖呰剼鏈?
#
# 鐢ㄦ硶:
#   npm run pack:win                                   # 鎵撳寘 Windows
#   .\scripts\build-installer.ps1 -Target win          # 鍚屼笂
#   .\scripts\build-installer.ps1 -Target mac          # 鎵撳寘 Mac(闇€鍦?Mac 涓婃墽琛?
#   .\scripts\build-installer.ps1 -Target all          # 鎵撳寘鍏ㄥ钩鍙?
#   .\scripts\build-installer.ps1 -ApiBase https://api.example.com/api
#   .\scripts\build-installer.ps1 -Version 1.0.0
# =============================================================================

param(
    [ValidateSet('win', 'mac', 'all')]
    [string]$Target = 'win',

    [string]$Version,

    [string]$ApiBase
)

# 涓ユ牸閿欒妯″紡
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 鍒囨崲鍒?desktop 鐩綍
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# 璁℃椂鍣?
$startTime = Get-Date

function Write-Step {
    param([string]$message)
    Write-Host ""
    Write-Host "鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣" -ForegroundColor Cyan
    Write-Host "  $message" -ForegroundColor Cyan
    Write-Host "鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣" -ForegroundColor Cyan
}

function Write-OK {
    param([string]$message)
    Write-Host "  [OK] $message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$message)
    Write-Host "  [FAIL] $message" -ForegroundColor Red
}

function Write-Info {
    param([string]$message)
    Write-Host "  [INFO] $message" -ForegroundColor Gray
}

# 璇诲彇 package.json
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$actualVersion = if ($Version) { $Version } else { $pkg.version }

Write-Host ""
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "  娣辩灣AI 妗岄潰瀹㈡埛绔竴閿墦鍖? -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "  鐩爣骞冲彴: $Target" -ForegroundColor Magenta
Write-Host "  鐗堟湰鍙?   $actualVersion" -ForegroundColor Magenta
if ($ApiBase) {
    Write-Host "  API 鍦板潃: $ApiBase" -ForegroundColor Magenta
}
Write-Host "  宸ヤ綔鐩綍: $projectRoot" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta

try {
    # ===== 姝ラ 1:绫诲瀷妫€鏌?=====
    Write-Step "姝ラ 1/7:绫诲瀷妫€鏌?typecheck)"
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "绫诲瀷妫€鏌ュけ璐? }
    Write-OK "绫诲瀷妫€鏌ラ€氳繃"

    # ===== 姝ラ 2:涓嬭浇杩愯鏃?=====
    Write-Step "姝ラ 2/7:涓嬭浇杩愯鏃?fetch-runtime)"
    if ($Target -eq 'all') {
        & npm run fetch-runtime -- --win
        if ($LASTEXITCODE -ne 0) { throw "涓嬭浇 Windows 杩愯鏃跺け璐? }
        & npm run fetch-runtime -- --mac
        if ($LASTEXITCODE -ne 0) { throw "涓嬭浇 Mac 杩愯鏃跺け璐? }
    } else {
        & npm run fetch-runtime -- --$Target
        if ($LASTEXITCODE -ne 0) { throw "涓嬭浇杩愯鏃跺け璐? }
    }
    Write-OK "杩愯鏃朵笅杞藉畬鎴?

    # ===== 姝ラ 3:娉ㄥ叆 API 鍦板潃 =====
    if ($ApiBase) {
        Write-Step "姝ラ 3/7:娉ㄥ叆鐢熶骇鐜 API 鍦板潃"
        $envFile = ".env.production"
        $envContent = "# 鐢熶骇鐜閰嶇疆`nVITE_API_BASE_URL=$ApiBase`n"
        Set-Content -Path $envFile -Value $envContent -Encoding UTF8 -NoNewline
        # 纭繚鏈熬鏈夋崲琛?
        Add-Content -Path $envFile -Value ""
        Write-OK "宸插啓鍏?$envFile"
        Write-Info "VITE_API_BASE_URL=$ApiBase"
    } else {
        Write-Step "姝ラ 3/7:璺宠繃 API 鍦板潃娉ㄥ叆(鏈寚瀹?-ApiBase)"
    }

    # ===== 姝ラ 4:缂栬瘧 =====
    Write-Step "姝ラ 4/7:缂栬瘧涓昏繘绋?+ preload + 娓叉煋杩涚▼"
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "缂栬瘧澶辫触" }
    Write-OK "缂栬瘧瀹屾垚"

    # ===== 姝ラ 5:鎵撳寘瀹夎绋嬪簭 =====
    Write-Step "姝ラ 5/7:electron-builder 鎵撳寘"
    if ($Target -eq 'all') {
        & npx electron-builder --win --mac
    } else {
        & npx electron-builder --$Target
    }
    if ($LASTEXITCODE -ne 0) { throw "electron-builder 鎵撳寘澶辫触" }
    Write-OK "瀹夎绋嬪簭鎵撳寘瀹屾垚"


    # ===== Step 5.5: Rename zip to .exe.zip =====
    Write-Step "Step 5.5/8: Rename zip artifacts"
    $installerVerDir = Join-Path $projectRoot "dist\installer-v$actualVersion"
    $installerLinkDir = Join-Path $projectRoot "dist\installer"
    $targetDir = if (Test-Path $installerLinkDir) { $installerLinkDir } else { $installerVerDir }
    if (Test-Path $targetDir) {
        Get-ChildItem $targetDir -Filter "*.zip" | Where-Object { $_.Name -notlike "*.exe.zip" } | ForEach-Object {
            $newName = $_.BaseName + ".exe.zip"
            $newPath = Join-Path $targetDir $newName
            Rename-Item $_.FullName $newPath
            Write-OK "Renamed: $($_.Name) -> $newName"
        }
    }

    # ===== Step 6/8: Generate latest.yml =====
    Write-Step "Step 6/8: Generate latest.yml"
    & npx tsx scripts/generate-latest-yml.ts
    if ($LASTEXITCODE -ne 0) { throw "Generate latest.yml failed" }
    Write-OK "latest.yml generated"

    # ===== Step 7/8: Verify installers =====
    Write-Step "Step 7/8: Verify installer integrity"
    & npx tsx scripts/verify-installer.ts
    if ($LASTEXITCODE -ne 0) { throw "Verify failed" }
    Write-OK "Verification passed"

    # ===== Step 8/8: Create user download filename =====
    Write-Step "Step 8/8: Create user download file (ShenTongAI-{version}-x64.exe.zip)"
    if (Test-Path $targetDir) {
        $exeZip = Get-ChildItem $targetDir -Filter "ShenTongAI-Setup-$actualVersion-x64.exe.zip" | Select-Object -First 1
        if ($exeZip) {
            $downloadName = "ShenTongAI-$actualVersion-x64.exe.zip"
            $downloadPath = Join-Path $targetDir $downloadName
            if (Test-Path $downloadPath) { Clear-Content $downloadPath -Force }
            Copy-Item $exeZip.FullName $downloadPath -Force
            Write-OK "User download file: $downloadName"
        }
    }
    # ===== 鎵撳寘鎶ュ憡 =====
    $endTime = Get-Date
    $duration = $endTime - $startTime
    $durationStr = "{0}鍒唟1}绉? -f [int]$duration.TotalMinutes, $duration.Seconds

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  鎵撳寘鎴愬姛!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  鑰楁椂: $durationStr" -ForegroundColor Green
    Write-Host "  鐗堟湰: $actualVersion" -ForegroundColor Green
    Write-Host "  骞冲彴: $Target" -ForegroundColor Green
    Write-Host ""
    Write-Host "  浜х墿鐩綍:" -ForegroundColor Green
    $installerDir = Join-Path $projectRoot "dist\installer"
    $latestYmlPath = Join-Path $installerDir "latest.yml"
    if (Test-Path $installerDir) {
        Get-ChildItem $installerDir | ForEach-Object {
            $sizeMB = [math]::Round($_.Length / 1024 / 1024, 2)
            Write-Host "    $($_.Name)  ($sizeMB MB)" -ForegroundColor Gray
        }
    }
    # 杈撳嚭 SHA-512 鎽樿(浠?latest.yml 涓鍙?
    if (Test-Path $latestYmlPath) {
        Write-Host ""
        Write-Host "  SHA-512 鎽樿(鏉ヨ嚜 latest.yml):" -ForegroundColor Green
        $ymlLines = Get-Content $latestYmlPath
        $currentFile = ""
        foreach ($line in $ymlLines) {
            if ($line -match '^\s*url:\s*(.+)$') {
                $currentFile = $matches[1].Trim()
            } elseif ($line -match '^\s*sha512:\s*(.+)$') {
                $sha = $matches[1].Trim()
                if ($currentFile) {
                    Write-Host "    $currentFile" -ForegroundColor Gray
                    Write-Host "      $sha" -ForegroundColor DarkGray
                    $currentFile = ""
                }
            }
        }
    }
    Write-Host ""
    Write-Host "  涓嬩竴姝?" -ForegroundColor Yellow
    Write-Host "    1. 涓婁紶 dist/installer/ 涓嬬殑瀹夎鍖呬笌 latest.yml 鍒版湇鍔″櫒" -ForegroundColor Yellow
    Write-Host "    2. 鐢ㄦ埛閫氳繃 update.shentong.ai/desktop/ 鑷姩鏇存柊" -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  鎵撳寘澶辫触!" -ForegroundColor Red
    Write-Host "========================================================" -ForegroundColor Red
    Write-Fail $_.Exception.Message
    Write-Host ""
    exit 1
}
