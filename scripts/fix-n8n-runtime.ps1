# ============================================================
# 修复 n8n 运行时原生依赖（sqlite3 NAPI 预编译库缺失 → 启动即退出 code=1）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\fix-n8n-runtime.ps1
#
# 说明：
#   - 需要联网（从 GitHub 下载 sqlite3 预编译库）
#   - 修复前请先关闭深瞳AI桌面端（避免文件被占用）
#   - 会修复：自定义安装位置 + 默认位置 + 本仓库 desktop/runtime 三处
# ============================================================
$ErrorActionPreference = 'Stop'
$host.UI.RawUI.WindowTitle = '修复 n8n 运行时'

function Fix-N8nCopy {
    param([string]$N8nDir)
    if (-not (Test-Path $N8nDir)) {
        Write-Host "  - 跳过（目录不存在）：$N8nDir"
        return $false
    }
    $nodeExe = Join-Path $N8nDir 'node\node.exe'
    $prebuild = Join-Path $N8nDir 'node_modules\prebuild-install\bin.js'
    $sqliteDir = Join-Path $N8nDir 'node_modules\sqlite3'
    $binding = Join-Path $sqliteDir 'build\Release\node_sqlite3.node'
    if (-not (Test-Path $nodeExe) -or -not (Test-Path $prebuild) -or -not (Test-Path $sqliteDir)) {
        Write-Host "  - 跳过（运行时不完整）：$N8nDir"
        return $false
    }
    if (Test-Path $binding) {
        Write-Host "  - sqlite3 原生库已存在，无需修复：$binding"
        return $true
    }
    Write-Host "  - 下载 sqlite3 NAPI 预编译库（需要网络，稍候）..."
    Push-Location $sqliteDir
    try {
        & $nodeExe $prebuild '-r' 'napi' 2>&1 | ForEach-Object { Write-Host "      $_" }
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            Write-Host "  - prebuild-install 退出码 $exit"
            return $false
        }
        if (-not (Test-Path $binding)) {
            Write-Host "  - 修复失败：$binding 未生成"
            return $false
        }
        $verify = & $nodeExe -e "const s=require('sqlite3'); const db=new s.Database(':memory:'); db.close(); console.log('sqlite3 OK')" 2>&1
        if (($verify -join ' ') -match 'OK') {
            Write-Host "  - ✅ sqlite3 修复成功并可加载"
            return $true
        } else {
            Write-Host "  - 警告：绑定已生成但加载异常：$verify"
            return $true
        }
    } finally {
        Pop-Location
    }
}

$targets = @()
# 1) 自定义安装位置（桌面端设置里改过下载位置时）
$appData = $env:APPDATA
$locCfg = Join-Path $appData 'shentong-ai-desktop\runtime-location.json'
if (Test-Path $locCfg) {
    try {
        $cfg = Get-Content $locCfg -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.path) { $targets += (Join-Path $cfg.path 'n8n') }
    } catch {
        Write-Host "  - 自定义位置配置解析失败，忽略：$locCfg"
    }
}
# 2) 默认安装位置
$targets += (Join-Path $appData 'shentong-ai-desktop\runtime\n8n')
# 3) 本仓库
$repoRoot = Split-Path -Parent $PSScriptRoot
$targets += (Join-Path $repoRoot 'desktop\runtime\n8n')

$targets = $targets | Select-Object -Unique

if (-not $targets) {
    Write-Host '未找到任何 n8n 运行时目录。请先打开深瞳AI桌面端触发运行时下载，再运行本脚本。'
    exit 1
}

Write-Host '========================================'
Write-Host '  修复 n8n 运行时原生依赖（sqlite3）'
Write-Host '========================================'
$allOk = $true
foreach ($t in $targets) {
    Write-Host ''
    Write-Host "[目标] $t"
    $r = Fix-N8nCopy $t
    if (-not $r) { $allOk = $false }
}

Write-Host ''
Write-Host '----------------------------------------'
Write-Host '  端口占用诊断（帮助定位 OpenClaw/N8N 启动失败）'
Write-Host '----------------------------------------'
foreach ($port in 8080, 5678, 3100, 8642) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        foreach ($c in $conn) {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            Write-Host "  ⚠️ 端口 $port 被占用 PID=$($c.OwningProcess) 进程=$($proc.ProcessName) 路径=$($proc.Path)"
        }
    } else {
        Write-Host "  ✅ 端口 $port 空闲"
    }
}

Write-Host ''
Write-Host '----------------------------------------'
Write-Host '  运行时自检（各服务入口可执行性）'
Write-Host '----------------------------------------'
$runtimeRoots = @()
foreach ($t in $targets) {
    $runtimeRoots += Split-Path -Parent $t
}
$runtimeRoots = $runtimeRoots | Select-Object -Unique
foreach ($root in $runtimeRoots) {
    if (-not (Test-Path $root)) { continue }
    Write-Host "[运行时根目录] $root"
    foreach ($svc in @('openclaw','n8n','mcp','hermes')) {
        $dir = Join-Path $root $svc
        if (-not (Test-Path $dir)) { Write-Host "  - $svc 未安装"; continue }
        $cmd = Join-Path $dir 'openclaw.exe.cmd'
        switch ($svc) {
            'n8n'    { $cmd = Join-Path $dir 'n8n.exe.cmd' }
            'mcp'    { $cmd = Join-Path $dir 'mcp-gateway.exe.cmd' }
            'hermes' { $cmd = Join-Path $dir 'hermes.exe.cmd' }
        }
        if (-not (Test-Path $cmd)) { Write-Host "  - $svc 入口缺失：$cmd"; continue }
        try {
            $ver = & $cmd '--version' 2>&1 | Select-Object -First 1
            Write-Host "  - $svc : $ver"
        } catch {
            Write-Host "  - $svc 执行失败：$_"
        }
    }
}

Write-Host ''
Write-Host '----------------------------------------'
Write-Host '  孤儿运行时进程清理（可选）'
Write-Host '----------------------------------------'
$runtimeNodeProcs = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and ($_.Path -like '*shentong-ai-desktop*runtime*' -or $_.Path -like '*二次开发*desktop*runtime*')
}
if ($runtimeNodeProcs) {
    foreach ($p in $runtimeNodeProcs) {
        Write-Host "  发现可能遗留的运行时进程 PID=$($p.Id) 路径=$($p.Path)"
    }
    $ans = Read-Host '  是否结束以上进程（清理后释放 8080/5678 等端口）？[y/N]'
    if ($ans -match '^[yY]') {
        foreach ($p in $runtimeNodeProcs) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Write-Host "  已结束 PID=$($p.Id)" }
            catch { Write-Host "  结束 PID=$($p.Id) 失败：$_" }
        }
    }
} else {
    Write-Host '  ✅ 未发现遗留的运行时 node 进程'
}

Write-Host ''
if ($allOk) {
    Write-Host '🎉 修复完成！请重启深瞳AI桌面端，N8N 应能正常启动。'
} else {
    Write-Host '❌ 部分目标修复失败。请确认网络可访问 GitHub（github.com），然后重试；'
    Write-Host '   若仍失败，请把上方输出完整发给我。'
    exit 1
}
