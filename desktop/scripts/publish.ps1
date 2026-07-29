# publish.ps1 - 深瞳AI桌面端一键打包+上传+部署
# 用法:
#   .\scripts\publish.ps1                          # 默认打包+上传(压缩包+安装包)
#   .\scripts\publish.ps1 -ZipOnly                 # 仅打包上传压缩包
#   .\scripts\publish.ps1 -ServerUser root -ServerHost 1.2.3.4
# 中途会提示输入 SSH 密码（scp 上传 + ssh 部署）

param(
    [string]$ServerUser = "ubuntu",
    [string]$ServerHost = "129.204.227.200",
    [string]$RemoteDir = "/opt/shentong/updates",
    [switch]$ZipOnly
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location "$PSScriptRoot\.."

# 1. 读取版本号
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$version = $pkg.version
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  深瞳AI 桌面端发布 v$version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  模式: $(if ($ZipOnly) {'仅压缩包'} else {'压缩包+安装包'})" -ForegroundColor Gray

# 2. 类型检查
Write-Host ""
Write-Host "[1/7] TypeScript 类型检查..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 类型检查失败" -ForegroundColor Red; exit 1 }
Write-Host "✅ 类型检查通过" -ForegroundColor Green

# 3. 下载运行时
Write-Host ""
Write-Host "[2/7] 下载运行时..." -ForegroundColor Yellow
npm run fetch-runtime -- --win
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 运行时下载失败" -ForegroundColor Red; exit 1 }
Write-Host "✅ 运行时就绪" -ForegroundColor Green

# 4. 构建
Write-Host ""
Write-Host "[3/7] 构建中..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 构建失败" -ForegroundColor Red; exit 1 }
Write-Host "✅ 构建通过" -ForegroundColor Green

# 5. 打包
Write-Host ""
Write-Host "[4/7] 打包 electron-builder..." -ForegroundColor Yellow
npx electron-builder --win
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 打包失败" -ForegroundColor Red; exit 1 }
Write-Host "✅ 打包完成" -ForegroundColor Green

# 6. 生成 latest.yml
Write-Host ""
Write-Host "[5/7] 生成 latest.yml..." -ForegroundColor Yellow
npx tsx scripts/generate-latest-yml.ts
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ latest.yml 生成失败" -ForegroundColor Red; exit 1 }
Write-Host "✅ latest.yml 已生成" -ForegroundColor Green

# 7. 收集产物
Write-Host ""
Write-Host "[6/7] 收集产物..." -ForegroundColor Yellow

# 注意: electron-builder.yml 的 directories.output 使用不带点的版本号格式（如 v041 对应 v0.4.1）
# 因此此处需将 $version 中的点号去除，与 electron-builder 输出目录保持一致
$versionNoDot = $version.Replace('.', '')
$installerDir = "dist\installer-v$versionNoDot"

# 压缩包（便携版）- electron-builder zip target 生成
$zipFile = Get-ChildItem $installerDir -Filter "ShenTongAI-$version-x64.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $zipFile) {
    $zipFile = Get-ChildItem $installerDir -Filter "*$version*x64.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
}

# NSIS 安装包
$exeFile = Get-ChildItem $installerDir -Filter "ShenTongAI-Setup-$version-x64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exeFile) {
    $exeFile = Get-ChildItem $installerDir -Filter "*$version*x64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
}

$ymlFile = "dist\installer\latest.yml"

if (-not $zipFile) {
    Write-Host "`n❌ 找不到版本 $version 的压缩包" -ForegroundColor Red
    exit 1
}
if (-not $ZipOnly -and -not $exeFile) {
    Write-Host "`n⚠️ 未找到安装包，将仅上传压缩包" -ForegroundColor Yellow
    $ZipOnly = $true
}

Write-Host "  压缩包: $($zipFile.Name) ($([math]::Round($zipFile.Length/1MB, 2)) MB)" -ForegroundColor Gray
if (-not $ZipOnly) {
    Write-Host "  安装包: $($exeFile.Name) ($([math]::Round($exeFile.Length/1MB, 2)) MB)" -ForegroundColor Gray
}
Write-Host "  latest.yml: $(if (Test-Path $ymlFile) {'存在'} else {'缺失'})" -ForegroundColor Gray

# 生成下载页 HTML
$htmlContent = @"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>深瞳AI 桌面客户端 v$version 下载</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f1923; color: #e0e0e0; min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
}
.container { max-width: 600px; width: 90%; padding: 40px; }
.card {
  background: #1a2a3a; border-radius: 16px; padding: 48px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.05);
}
.logo { text-align: center; margin-bottom: 32px; }
.logo h1 { font-size: 28px; color: #4fc3f7; font-weight: 600; }
.version {
  text-align: center; font-size: 14px; color: #78909c;
  margin-bottom: 40px; letter-spacing: 1px;
}
.download-btn {
  display: block; width: 100%; padding: 18px; margin-bottom: 16px;
  border-radius: 10px; text-align: center; text-decoration: none;
  font-size: 16px; font-weight: 500; transition: all 0.2s;
}
.btn-primary {
  background: linear-gradient(135deg, #4fc3f7, #29b6f6);
  color: #0f1923;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(79,195,247,0.4); }
.btn-secondary {
  background: rgba(255,255,255,0.08); color: #b0bec5;
  border: 1px solid rgba(255,255,255,0.1);
}
.btn-secondary:hover { background: rgba(255,255,255,0.12); }
.file-info { font-size: 12px; color: #546e7a; margin-top: 8px; text-align: center; }
.divider { height: 1px; background: rgba(255,255,255,0.06); margin: 24px 0; }
.notes { font-size: 13px; color: #78909c; line-height: 1.8; margin-top: 24px; }
.notes ul { padding-left: 20px; }
.notes li { margin-bottom: 6px; }
.footer { text-align: center; margin-top: 32px; font-size: 12px; color: #455a64; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="logo"><h1>🔮 深瞳AI</h1></div>
    <div class="version">桌面客户端 v$version</div>

    <a href="./$(Split-Path $zipFile.Name -Leaf)" class="download-btn btn-primary">
      📦 下载压缩包（免安装）
    </a>
    <div class="file-info">$([math]::Round($zipFile.Length/1MB, 1)) MB · ZIP · x64</div>
"@

if (-not $ZipOnly) {
    $htmlContent += @"

    <div class="divider"></div>

    <a href="./$(Split-Path $exeFile.Name -Leaf)" class="download-btn btn-secondary">
      💿 下载安装包（推荐）
    </a>
    <div class="file-info">$([math]::Round($exeFile.Length/1MB, 1)) MB · EXE · x64</div>
"@
}

$htmlContent += @"

    <div class="notes">
      <strong>更新说明：</strong>
      <ul>
        <li>压缩包版：解压后直接运行，无需安装管理员权限</li>
        <li>安装包版：双击安装，自动创建桌面快捷方式</li>
        <li>首次运行需联网激活，后续可离线使用</li>
        <li>如遇安全提示，请选择"仍要运行"</li>
      </ul>
    </div>
    <div class="footer">
      Copyright © 2026 Shentong · <a href="./latest.yml" style="color:#455a64;">自动更新清单</a>
    </div>
  </div>
</div>
</body>
</html>
"@

$downloadPage = "dist\installer\index.html"
Set-Content -Path $downloadPage -Value $htmlContent -Encoding UTF8
Write-Host "  下载页: index.html" -ForegroundColor Gray

# 8. 上传到服务器
Write-Host ""
Write-Host "[7/7] 上传到服务器..." -ForegroundColor Yellow
Write-Host "  目标: ${ServerUser}@${ServerHost}:$RemoteDir/" -ForegroundColor Gray
Write-Host "  请输入 SSH 密码..." -ForegroundColor Gray

# 上传压缩包
scp $zipFile.FullName "${ServerUser}@${ServerHost}:/tmp/"
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 上传压缩包失败" -ForegroundColor Red; exit 1 }

# 上传安装包（如果不是仅压缩包模式）
if (-not $ZipOnly) {
    scp $exeFile.FullName "${ServerUser}@${ServerHost}:/tmp/"
    if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 上传安装包失败" -ForegroundColor Red; exit 1 }
}

# 上传 latest.yml
scp $ymlFile "${ServerUser}@${ServerHost}:/tmp/"
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 上传 latest.yml 失败" -ForegroundColor Red; exit 1 }

# 上传下载页
scp $downloadPage "${ServerUser}@${ServerHost}:/tmp/"
if ($LASTEXITCODE -ne 0) { Write-Host "`n❌ 上传下载页失败" -ForegroundColor Red; exit 1 }

Write-Host "✅ 上传完成" -ForegroundColor Green

# 9. 远程部署
Write-Host ""
Write-Host "远程部署..." -ForegroundColor Yellow

$filesToMove = @($zipFile.Name, "latest.yml", "index.html")
if (-not $ZipOnly) {
    $filesToMove = @($zipFile.Name, $exeFile.Name, "latest.yml", "index.html")
}

$remoteCmd = "sudo rm -f $RemoteDir/* && "
foreach ($f in $filesToMove) {
    $remoteCmd += "sudo cp /tmp/$f $RemoteDir/ && rm -f /tmp/$f && "
}
# 服务器端自动压缩 .exe 为 .exe.zip（只要有 .exe 就必须创建，不受 -ZipOnly 影响）
if ($exeFile) {
    $exeZipName = "ShenTongAI-Setup-$version-x64.exe.zip"
    $exeName = "ShenTongAI-Setup-$version-x64.exe"
    $remoteCmd += "cd $RemoteDir && sudo zip -j $exeZipName $exeName && sudo chown www-data:www-data $exeZipName && sudo chmod 644 $exeZipName && "
    $remoteCmd += "if [ ! -f $RemoteDir/$exeZipName ]; then echo '❌ .exe.zip 创建失败' && exit 1; fi && "
}
$remoteCmd += "echo '✅ 文件已替换' && ls -lh $RemoteDir/"

ssh "${ServerUser}@${ServerHost}" $remoteCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 远程部署失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  🎉 v$version 发布完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  下载页面: https://zt.shentongapi.cn/desktop/" -ForegroundColor Cyan
Write-Host "  更新清单: https://zt.shentongapi.cn/desktop/latest.yml" -ForegroundColor Cyan
Write-Host "  压缩包:   $($zipFile.Name)" -ForegroundColor Gray
if (-not $ZipOnly) {
    Write-Host "  安装包:   $($exeFile.Name)" -ForegroundColor Gray
    Write-Host "  下载压缩包: ShenTongAI-Setup-$version-x64.exe.zip" -ForegroundColor Gray
}
Write-Host ""
