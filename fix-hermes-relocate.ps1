$ErrorActionPreference = 'Stop'
$root = 'E:\中台\4工具\hermes'
$agent = Join-Path $root 'node_modules\hermes-agent'
$src = Join-Path $agent 'runtime\hermes-agent'
$venv = Join-Path $src 'venv'
$mp = Join-Path $agent 'runtime\python\cpython-3.11-windows-x86_64-none'
$sp = Join-Path $venv 'Scripts'
$site = Join-Path $venv 'Lib\site-packages'

Write-Host '=== 1. rewrite pyvenv.cfg home ==='
$cfg = Join-Path $venv 'pyvenv.cfg'
if (-not (Test-Path "$cfg.bak")) { Copy-Item $cfg "$cfg.bak" -Force }
$lines = Get-Content $cfg
$lines = $lines | ForEach-Object { if ($_ -match '^home\s*=') { "home = $mp" } else { $_ } }
[System.IO.File]::WriteAllLines($cfg, [string[]]$lines, [System.Text.UTF8Encoding]::new($false))
Get-Content $cfg

Write-Host '=== 2. replace venv python trampolines with real python ==='
Copy-Item (Join-Path $mp 'python.exe') (Join-Path $sp 'python.exe') -Force
Copy-Item (Join-Path $mp 'pythonw.exe') (Join-Path $sp 'pythonw.exe') -Force
Write-Host '=== 2b. copy runtime DLLs (python311.dll / vcruntime140.dll / python3.dll) ==='
Get-ChildItem $mp -Filter *.dll | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $sp $_.Name) -Force
  Write-Host "  copied "
}
& (Join-Path $sp 'python.exe') --version
Write-Host "PY_EXIT=$LASTEXITCODE"

Write-Host '=== 3. rewrite editable finder + direct_url paths ==='
$oldCfg = Get-Content "$cfg.bak" | Where-Object { $_ -match '^home\s*=' } | Select-Object -First 1
$oldHome = ($oldCfg -split '=', 2)[1].Trim()
$oldSrc = $oldHome -replace '\\runtime\\python\\[^\\]+$', '\runtime\hermes-agent'
$newSrc = Join-Path $agent 'runtime\hermes-agent'
Write-Host "oldSrc=$oldSrc"
Write-Host "newSrc=$newSrc"
$finder = Get-ChildItem $site -Filter '__editable__*_finder.py' | Select-Object -First 1
if ($finder) {
  $content = Get-Content $finder.FullName -Raw
  $content2 = $content.Replace($oldSrc.Replace('\','\\'), $newSrc.Replace('\','\\'))
  if ($content2 -eq $content) { $content2 = $content.Replace($oldSrc, $newSrc) }
  if ($content2 -ne $content) { Set-Content -Path $finder.FullName -Value $content2 -Encoding UTF8; Write-Host "finder patched: $($finder.Name)" } else { Write-Host 'WARN: finder had no old path' }
}
$du = Join-Path $site 'hermes_agent-0.20.5.dist-info\direct_url.json'
if (Test-Path $du) {
  $j = Get-Content $du -Raw
  $oldUrl = $oldSrc -replace '\\','/'
  $newUrl = $newSrc -replace '\\','/'
  if ($j -like "*$oldUrl*") { $j = $j.Replace($oldUrl, $newUrl); Set-Content -Path $du -Value $j -Encoding UTF8; Write-Host 'direct_url.json patched' }
}

Write-Host '=== 4. patch python-launcher.js (portable: python -m hermes_cli.main) ==='
$lp = Join-Path $agent 'lib\python-launcher.js'
$lc = Get-Content $lp -Raw
if ($lc -notmatch 'HERMES_PORTABLE') {
  $oldFn = 'function buildConsoleInvocation(binName, userArgs, platform = process.platform) {' + "`n" + '  return {' + "`n" + '    command: getConsoleExecutable(binName, platform),' + "`n" + '    args: [...userArgs]' + "`n" + '  };' + "`n" + '}'
  $newFn = 'function buildConsoleInvocation(binName, userArgs, platform = process.platform) {' + "`n" + '  // [portable] Desktop-bundled runtime: trampolines embed build-machine paths,' + "`n" + '  // so always launch via the (relocated) venv python instead of .exe launchers.' + "`n" + '  return {' + "`n" + '    command: path.join(getVenvDirectory(), "Scripts", "python.exe"),' + "`n" + '    args: ["-m", "hermes_cli.main", ...userArgs]' + "`n" + '  };' + "`n" + '}'
  if ($lc.Contains($oldFn)) {
    $lc2 = $lc.Replace($oldFn, $newFn)
    Set-Content -Path $lp -Value $lc2 -Encoding UTF8
    Write-Host 'python-launcher.js patched'
  } else {
    Write-Host 'WARN: python-launcher.js function shape changed, skipping patch'
  }
} else { Write-Host 'python-launcher.js already patched' }

Write-Host '=== 5. import test ==='
& (Join-Path $sp 'python.exe') -c "import hermes_cli; print(hermes_cli.__file__)"
Write-Host "IMPORT_EXIT=$LASTEXITCODE"

Write-Host '=== 6. version test ==='
& (Join-Path $root 'hermes.exe.cmd') --version 2>&1
Write-Host "VERSION_EXIT=$LASTEXITCODE"
