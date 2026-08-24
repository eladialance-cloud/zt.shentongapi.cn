# setup-video-claw-build-env.ps1 - 准备 build-video-claw-runtime.ps1 的前置环境
#
# 作用:
#   1) 解包 desktop/runtime/hermes-win-x64.tar.gz -> desktop/runtime/hermes（补齐 node/ 等运行时）
#   2) 按 CI(desktop-build.yml 步骤6.5) 的方式创建 desktop/runtime/hermes/python：
#      Python 3.11.9 嵌入版 + 启用 site-packages + pip + hermes-agent==0.19.0
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\setup-video-claw-build-env.ps1
# 前置:  本机可联网（python.org / bootstrap.pypa.io / pypi）
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$repoRoot = (Resolve-Path ".")
$hermesRoot = Join-Path $repoRoot "desktop\runtime\hermes"
$hermesTar = Join-Path $repoRoot "desktop\runtime\hermes-win-x64.tar.gz"

# ---- 1. 补齐 hermes 运行时（node/ 等）----
if (-not (Test-Path (Join-Path $hermesRoot "node\node.exe"))) {
  if (-not (Test-Path $hermesTar)) { throw "找不到 $hermesTar" }
  Write-Host "[1/2] 解包 hermes-win-x64.tar.gz -> desktop/runtime/hermes ..."
  tar -xzf $hermesTar -C $hermesRoot
  if ($LASTEXITCODE -ne 0) { throw "解包 hermes 失败" }
} else {
  Write-Host "[1/2] hermes node 已存在，跳过解包"
}
if (-not (Test-Path (Join-Path $hermesRoot "node\node.exe"))) { throw "hermes node 仍然缺失" }

# ---- 2. 创建 hermes/python（复用 CI 6.5 逻辑）----
$pythonDir = Join-Path $hermesRoot "python"
if (-not (Test-Path (Join-Path $pythonDir "python.exe"))) {
  $pythonVersion = "3.11.9"
  $pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
  $tempFile = Join-Path $env:TEMP "hermes-python.zip"

  Write-Host "[2/2] 下载 Python $pythonVersion embeddable ..."
  New-Item -ItemType Directory -Force -Path $pythonDir | Out-Null
  Invoke-WebRequest -Uri $pythonUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 180
  Expand-Archive -Path $tempFile -DestinationPath $pythonDir -Force
  Remove-Item $tempFile -ErrorAction SilentlyContinue

  # 启用 site-packages：嵌入版默认注释掉 import site，pip 无法加载
  $pthFile = Get-ChildItem $pythonDir | Where-Object { $_.Name -like '*._pth' } | Select-Object -First 1
  if ($pthFile) {
    $content = [System.IO.File]::ReadAllText($pthFile.FullName)
    if ($content -match '#import site') {
      $content = $content -replace '#import site', 'import site'
      [System.IO.File]::WriteAllText($pthFile.FullName, $content)
      Write-Host "  [OK] 已启用 site-packages ($($pthFile.Name))"
    }
  } else {
    throw "python*._pth 未找到"
  }

  & (Join-Path $pythonDir "python.exe") --version
  if ($LASTEXITCODE -ne 0) { throw "python.exe 不可用" }

  Write-Host "  安装 pip ..."
  $pipFile = Join-Path $env:TEMP "get-pip.py"
  Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $pipFile -UseBasicParsing -TimeoutSec 180
  & (Join-Path $pythonDir "python.exe") $pipFile --no-warn-script-location
  if ($LASTEXITCODE -ne 0) { throw "get-pip.py 失败" }
  Remove-Item $pipFile -ErrorAction SilentlyContinue

  Write-Host "  安装 hermes-agent==0.19.0 ..."
  & (Join-Path $pythonDir "python.exe") -m pip install "hermes-agent==0.19.0" --no-warn-script-location
  if ($LASTEXITCODE -ne 0) { throw "hermes-agent 安装失败" }
} else {
  Write-Host "[2/2] hermes python 已存在，跳过"
}
if (-not (Test-Path (Join-Path $pythonDir "python.exe"))) { throw "hermes python 仍然缺失" }

Write-Host ""
Write-Host "=== 环境就绪 ==="
Write-Host "  node:   $(Join-Path $hermesRoot 'node\node.exe')"
Write-Host "  python: $(Join-Path $pythonDir 'python.exe')"
Write-Host "下一步: powershell -ExecutionPolicy Bypass -File scripts\build-video-claw-runtime.ps1"