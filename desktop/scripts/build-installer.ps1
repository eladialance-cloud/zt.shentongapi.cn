# =============================================================================
# 深瞳AI 桌面客户端 - Windows 一键打包脚本
#
# 用法:
#   npm run pack:win                                   # 打包 Windows
#   .\scripts\build-installer.ps1 -Target win          # 同上
#   .\scripts\build-installer.ps1 -Target mac          # 打包 Mac(需在 Mac 上执行)
#   .\scripts\build-installer.ps1 -Target all          # 打包全平台
#   .\scripts\build-installer.ps1 -ApiBase https://api.example.com/api
#   .\scripts\build-installer.ps1 -Version 1.0.0
# =============================================================================

param(
    [ValidateSet('win', 'mac', 'all')]
    [string]$Target = 'win',

    [string]$Version,

    [string]$ApiBase
)

# 严格错误模式
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 切换到 desktop 目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# 计时器
$startTime = Get-Date

function Write-Step {
    param([string]$message)
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $message" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
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

# 读取 package.json
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$actualVersion = if ($Version) { $Version } else { $pkg.version }

Write-Host ""
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "  深瞳AI 桌面客户端一键打包" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "  目标平台: $Target" -ForegroundColor Magenta
Write-Host "  版本号:   $actualVersion" -ForegroundColor Magenta
if ($ApiBase) {
    Write-Host "  API 地址: $ApiBase" -ForegroundColor Magenta
}
Write-Host "  工作目录: $projectRoot" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta

try {
    # ===== 步骤 1:类型检查 =====
    Write-Step "步骤 1/7:类型检查(typecheck)"
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "类型检查失败" }
    Write-OK "类型检查通过"

    # ===== 步骤 2:下载运行时 =====
    Write-Step "步骤 2/7:下载运行时(fetch-runtime)"
    if ($Target -eq 'all') {
        & npm run fetch-runtime -- --win
        if ($LASTEXITCODE -ne 0) { throw "下载 Windows 运行时失败" }
        & npm run fetch-runtime -- --mac
        if ($LASTEXITCODE -ne 0) { throw "下载 Mac 运行时失败" }
    } else {
        & npm run fetch-runtime -- --$Target
        if ($LASTEXITCODE -ne 0) { throw "下载运行时失败" }
    }
    Write-OK "运行时下载完成"

    # ===== 步骤 3:注入 API 地址 =====
    if ($ApiBase) {
        Write-Step "步骤 3/7:注入生产环境 API 地址"
        $envFile = ".env.production"
        $envContent = "# 生产环境配置`nVITE_API_BASE_URL=$ApiBase`n"
        Set-Content -Path $envFile -Value $envContent -Encoding UTF8 -NoNewline
        # 确保末尾有换行
        Add-Content -Path $envFile -Value ""
        Write-OK "已写入 $envFile"
        Write-Info "VITE_API_BASE_URL=$ApiBase"
    } else {
        Write-Step "步骤 3/7:跳过 API 地址注入(未指定 -ApiBase)"
    }

    # ===== 步骤 4:编译 =====
    Write-Step "步骤 4/7:编译主进程 + preload + 渲染进程"
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "编译失败" }
    Write-OK "编译完成"

    # ===== 步骤 5:打包安装程序 =====
    Write-Step "步骤 5/7:electron-builder 打包"
    if ($Target -eq 'all') {
        & npx electron-builder --win --mac
    } else {
        & npx electron-builder --$Target
    }
    if ($LASTEXITCODE -ne 0) { throw "electron-builder 打包失败" }
    Write-OK "安装程序打包完成"

    # ===== 步骤 6:生成 latest.yml =====
    Write-Step "步骤 6/7:生成 latest.yml(electron-updater 清单)"
    & npx tsx scripts/generate-latest-yml.ts
    if ($LASTEXITCODE -ne 0) { throw "生成 latest.yml 失败" }
    Write-OK "latest.yml 已生成"

    # ===== 步骤 7:校验产物 =====
    Write-Step "步骤 7/7:校验产物完整性"
    & npx tsx scripts/verify-installer.ts
    if ($LASTEXITCODE -ne 0) { throw "产物校验失败" }
    Write-OK "校验通过"

    # ===== 打包报告 =====
    $endTime = Get-Date
    $duration = $endTime - $startTime
    $durationStr = "{0}分{1}秒" -f [int]$duration.TotalMinutes, $duration.Seconds

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  打包成功!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  耗时: $durationStr" -ForegroundColor Green
    Write-Host "  版本: $actualVersion" -ForegroundColor Green
    Write-Host "  平台: $Target" -ForegroundColor Green
    Write-Host ""
    Write-Host "  产物目录:" -ForegroundColor Green
    $installerDir = Join-Path $projectRoot "dist\installer"
    $latestYmlPath = Join-Path $installerDir "latest.yml"
    if (Test-Path $installerDir) {
        Get-ChildItem $installerDir | ForEach-Object {
            $sizeMB = [math]::Round($_.Length / 1024 / 1024, 2)
            Write-Host "    $($_.Name)  ($sizeMB MB)" -ForegroundColor Gray
        }
    }
    # 输出 SHA-512 摘要(从 latest.yml 中读取)
    if (Test-Path $latestYmlPath) {
        Write-Host ""
        Write-Host "  SHA-512 摘要(来自 latest.yml):" -ForegroundColor Green
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
    Write-Host "  下一步:" -ForegroundColor Yellow
    Write-Host "    1. 上传 dist/installer/ 下的安装包与 latest.yml 到服务器" -ForegroundColor Yellow
    Write-Host "    2. 用户通过 update.shentong.ai/desktop/ 自动更新" -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  打包失败!" -ForegroundColor Red
    Write-Host "========================================================" -ForegroundColor Red
    Write-Fail $_.Exception.Message
    Write-Host ""
    exit 1
}
