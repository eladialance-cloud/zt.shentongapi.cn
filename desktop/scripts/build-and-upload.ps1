# =============================================================================
# 深瞳AI 桌面客户端 - 一键构建+上传脚本
#
# 用法:
#   .\scripts\build-and-upload.ps1                    # 默认构建+上传
#   .\scripts\build-and-upload.ps1 -SkipBuild        # 只上传现有文件
#   .\scripts\build-and-upload.ps1 -Version 0.6.0   # 指定版本
#   .\scripts\build-and-upload.ps1 -ServerIP 129.204.227.200  # 指定服务器
# =============================================================================

param(
    [switch]$SkipBuild = $false,
    [string]$Version,
    [string]$ServerIP = "129.204.227.200",
    [string]$ServerUser = "root",
    [string]$RemotePath = "/opt/shentong/updates",
    [string]$ApiBase
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$startTime = Get-Date

# 颜色输出函数
function Write-Step {
    param([string]$message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $message" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-OK { param([string]$message) Write-Host "  [OK] $message" -ForegroundColor Green }
function Write-Fail { param([string]$message) Write-Host "  [FAIL] $message" -ForegroundColor Red }
function Write-Info { param([string]$message) Write-Host "  [INFO] $message" -ForegroundColor Gray }
function Write-Warn { param([string]$message) Write-Host "  [WARN] $message" -ForegroundColor Yellow }

# 读取版本号
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$actualVersion = if ($Version) { $Version } else { $pkg.version }

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  深瞳AI 一键构建+上传" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  版本:    $actualVersion" -ForegroundColor Magenta
Write-Host "  服务器:  $ServerUser@$ServerIP" -ForegroundColor Magenta
Write-Host "  远程路径: $RemotePath" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

try {
    # ===== 步骤 1: 构建 =====
    if (-not $SkipBuild) {
        Write-Step "步骤 1/4: 执行构建"
        
        # 1.1 类型检查
        Write-Info "类型检查..."
        & npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw "类型检查失败" }
        Write-OK "类型检查通过"
        
        # 1.2 下载运行时（可选，网络不好可跳过）
        Write-Info "下载运行时..."
        & npm run fetch-runtime -- --win 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "运行时下载失败（网络问题），使用本地缓存或跳过"
        } else {
            Write-OK "运行时下载完成"
        }
        
        # 1.3 注入 API 地址
        if ($ApiBase) {
            $envFile = ".env.production"
            "VITE_API_BASE_URL=$ApiBase" | Set-Content $envFile -Encoding UTF8
            Write-OK "API 地址已注入: $ApiBase"
        }
        
        # 1.4 编译
        Write-Info "编译中..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "编译失败" }
        Write-OK "编译完成"
        
        # 1.5 打包
        Write-Info "打包中...（这可能需要几分钟）"
        $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
        $env:WIN_CSC_IDENTITY_AUTO_DISCOVERY = "false"
        & npx electron-builder --win --publish never
        if ($LASTEXITCODE -ne 0) { throw "打包失败" }
        Write-OK "打包完成"
        
        # 1.6 创建 .exe.zip 文件
        Write-Step "步骤 2/4: 创建 .exe.zip 文件"
        $installerDir = Join-Path $projectRoot "dist\installer-new"
        $exeFile = Get-ChildItem $installerDir -Filter "ShenTongAI-Setup-$actualVersion-x64.exe" | Select-Object -First 1
        
        if (-not $exeFile) {
            throw "找不到安装包: ShenTongAI-Setup-$actualVersion-x64.exe"
        }
        
        # 创建 .exe.zip（用户下载格式）
        $zipName = "ShenTongAI-$actualVersion-x64.exe.zip"
        $zipPath = Join-Path $installerDir $zipName
        
        Write-Info "创建 $zipName..."
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        Compress-Archive -Path $exeFile.FullName -DestinationPath $zipPath -CompressionLevel Optimal
        Write-OK "创建完成: $zipName ($([math]::Round((Get-Item $zipPath).Length/1MB,2)) MB)"
        
        # 1.7 生成 latest.yml
        Write-Info "生成 latest.yml..."
        & npx tsx scripts/generate-latest-yml.ts
        if ($LASTEXITCODE -ne 0) { Write-Warn "latest.yml 生成失败，继续上传" }
        else { Write-OK "latest.yml 生成完成" }
        
    } else {
        Write-Step "步骤 1/4: 跳过构建（使用现有文件）"
    }
    
    # ===== 步骤 2: 验证文件 =====
    Write-Step "步骤 2/4: 验证构建产物"
    $installerDir = Join-Path $projectRoot "dist\installer-new"
    $files = @(
        "ShenTongAI-Setup-$actualVersion-x64.exe",
        "ShenTongAI-$actualVersion-x64.exe.zip",
        "latest.yml"
    )
    
    foreach ($file in $files) {
        $path = Join-Path $installerDir $file
        if (Test-Path $path) {
            $size = [math]::Round((Get-Item $path).Length/1MB,2)
            Write-OK "$file ($size MB)"
        } else {
            Write-Warn "$file 不存在"
        }
    }
    
    # ===== 步骤 3: 上传到服务器 =====
    Write-Step "步骤 3/4: 上传到服务器"
    
    # 检查 SSH 连接
    Write-Info "检查服务器连接..."
    $sshTest = ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${ServerUser}@${ServerIP} "echo OK" 2>&1
    if ($sshTest -notcontains "OK") {
        throw "无法连接到服务器 $ServerIP，请检查网络或 SSH 配置"
    }
    Write-OK "服务器连接正常"
    
    # 上传文件
    Write-Info "上传 .exe.zip..."
    $zipLocal = Join-Path $installerDir "ShenTongAI-$actualVersion-x64.exe.zip"
    $zipRemote = "${ServerUser}@${ServerIP}:${RemotePath}/"
    
    scp $zipLocal $zipRemote
    if ($LASTEXITCODE -ne 0) { throw "上传 .exe.zip 失败" }
    Write-OK ".exe.zip 上传完成"
    
    # 上传 latest.yml（如果存在）
    $ymlLocal = Join-Path $installerDir "latest.yml"
    if (Test-Path $ymlLocal) {
        Write-Info "上传 latest.yml..."
        scp $ymlLocal $zipRemote
        if ($LASTEXITCODE -ne 0) { Write-Warn "latest.yml 上传失败" }
        else { Write-OK "latest.yml 上传完成" }
    }
    
    # ===== 步骤 4: 服务器端配置 =====
    Write-Step "步骤 4/4: 配置服务器"
    
    $sshCmd = @"
cd $RemotePath && \
ln -sf ShenTongAI-$actualVersion-x64.exe.zip ShenTongAI-Setup-$actualVersion-x64.exe.zip && \
ls -lh *.zip *.exe latest.yml 2>/dev/null | tail -5
"@
    
    Write-Info "创建符号链接..."
    $result = ssh ${ServerUser}@${ServerIP} $sshCmd 2>&1
    Write-OK "符号链接创建完成"
    Write-Info "服务器文件列表:"
    $result | ForEach-Object { Write-Info "  $_" }
    
    # 测试下载
    Write-Info "测试下载链接..."
    $testUrl = "https://zt.shentongapi.cn/desktop/ShenTongAI-$actualVersion-x64.exe.zip"
    try {
        $response = Invoke-WebRequest -Uri $testUrl -Method HEAD -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-OK "下载链接正常: HTTP 200"
        } else {
            Write-Warn "下载链接返回: $($response.StatusCode)"
        }
    } catch {
        Write-Warn "下载链接测试失败: $($_.Exception.Message)"
    }
    
    # ===== 完成报告 =====
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  构建+上传完成!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  耗时: $($duration.ToString('mm\:ss'))" -ForegroundColor Green
    Write-Host "  版本: $actualVersion" -ForegroundColor Green
    Write-Host ""
    Write-Host "  下载链接:" -ForegroundColor Green
    Write-Host "    https://zt.shentongapi.cn/desktop/ShenTongAI-$actualVersion-x64.exe.zip" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  本地文件:" -ForegroundColor Green
    Write-Host "    $installerDir" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  构建+上传失败!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Fail $_.Exception.Message
    Write-Host ""
    exit 1
}
