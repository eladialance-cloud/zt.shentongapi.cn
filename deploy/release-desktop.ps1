#Requires -Version 5.1
<#
  release-desktop.ps1 - one-command Windows desktop release helper (local side).

  Steps: preflight -> (optional -Push) -> poll the GitHub Actions "Desktop Build" run ->
         download the artifact -> verify version/sha512/size against latest.yml ->
         upload exe + latest.yml + publish SQL + server script to the server /tmp/ ->
         (optional -Publish) run the server-side publish + DB registration, then verify.

  Requirements:
    - git credential helper holds a GitHub token (git credential fill returns password=...)
    - ssh key auth to the server and passwordless sudo there
    - deploy/publish-<version>.sql exists (website changelog for that version)

  Examples:
    powershell -ExecutionPolicy Bypass -File deploy\release-desktop.ps1 -Version 2.1.7
    powershell -ExecutionPolicy Bypass -File deploy\release-desktop.ps1 -Version 2.1.7 -Push -Publish
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Branch = "upgrade/electron-41",
  [string]$Repo = "eladialance-cloud/zt.shentongapi.cn",
  [string]$Sha = "",
  [string]$Server = "ubuntu@129.204.227.200",
  [string]$SiteBase = "https://zt.shentongapi.cn",
  [int]$TimeoutMinutes = 60,
  [switch]$Push,
  [switch]$SkipUpload,
  [switch]$Publish
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DeployDir = Join-Path $RepoRoot "deploy"
$ArtifactDir = Join-Path $RepoRoot ("desktop-artifact\" + $Version)
$ExeName = "ShenTongAI-Setup-$Version-x64.exe"
$SqlPath = Join-Path $DeployDir ("publish-" + $Version + ".sql")
$ServerScript = Join-Path $DeployDir "publish-desktop.sh"

function Write-Step([string]$Text) { Write-Host ""; Write-Host ("=== " + $Text + " ===") }
function Write-Ok([string]$Text) { Write-Host ("  [ok]   " + $Text) }
function Write-Warn2([string]$Text) { Write-Host ("  [warn] " + $Text) }

function Invoke-Checked([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw ($File + " failed with exit code " + $LASTEXITCODE) }
}

function Get-ApiJson([string]$Url, [string]$Token) {
  $tmp = Join-Path $env:TEMP ("gh-" + [guid]::NewGuid().ToString("N") + ".json")
  for ($i = 1; $i -le 8; $i++) {
    & curl.exe -s -f -H ("Authorization: Bearer " + $Token) -H "User-Agent: shentong-deploy" -H "Accept: application/vnd.github+json" -o $tmp $Url
    if ($LASTEXITCODE -eq 0 -and (Test-Path $tmp) -and (Get-Item $tmp).Length -gt 0) {
      $txt = Get-Content -Raw -Encoding UTF8 $tmp
      Remove-Item $tmp -Force
      return ($txt | ConvertFrom-Json)
    }
    Write-Warn2 ("curl API attempt " + $i + " failed (exit " + $LASTEXITCODE + ")")
    Start-Sleep -Seconds 10
  }
  throw ("curl could not reach the GitHub API: " + $Url)
}

function Get-GitHubToken {
  $cred = ("protocol=https`nhost=github.com`n`n" | git credential fill 2>$null)
  $token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=', ''
  if (-not $token) { throw "no GitHub token from git credential fill (check the credential helper)" }
  return $token
}

function Get-Sha512Base64([string]$Path) {
  $hex = (Get-FileHash -LiteralPath $Path -Algorithm SHA512).Hash
  $bytes = for ($i = 0; $i -lt $hex.Length; $i += 2) { [Convert]::ToByte($hex.Substring($i, 2), 16) }
  return [Convert]::ToBase64String($bytes)
}

function Read-LatestYml([string]$Path) {
  $yml = Get-Content -Raw -Encoding UTF8 $Path
  $out = @{ version = ""; sha512 = ""; size = 0 }
  if ($yml -match "(?m)^version:\s*(\S+)\s*$") { $out.version = $Matches[1] }
  if ($yml -match "(?m)^sha512:\s*(\S+)\s*$") { $out.sha512 = $Matches[1] }
  if ($yml -match "(?m)^\s*size:\s*(\d+)\s*$") { $out.size = [int64]$Matches[1] }
  return $out
}
# ---------------------------------------------------------------- preflight
Write-Step "0. Preflight"
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw ("bad -Version: " + $Version) }
Set-Location $RepoRoot
$pkgVersion = (Get-Content -Raw -Encoding UTF8 (Join-Path $RepoRoot "desktop\package.json") | ConvertFrom-Json).version
$p = $pkgVersion.Split(".")
if ([int]$p[2] -ge 9) { $expected = $p[0] + "." + ([int]$p[1] + 1) + ".0" } else { $expected = $p[0] + "." + $p[1] + "." + ([int]$p[2] + 1) }
if ($expected -ne $Version) {
  throw ("desktop/package.json is " + $pkgVersion + ", so CI would build " + $expected + ", not " + $Version + ". Align package.json with the online version first (SOP section 1).")
}
Write-Ok ("package.json " + $pkgVersion + " -> CI build " + $Version)
$branchNow = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branchNow -ne $Branch) { Write-Warn2 ("current branch is " + $branchNow + ", expected " + $Branch) }
$dirty = git status --porcelain
$trackedDirty = @($dirty | Where-Object { $_ -and -not $_.StartsWith("??") })
if ($trackedDirty.Count -gt 0) { throw "working tree has uncommitted tracked changes; commit them first" }
if (-not (Test-Path $SqlPath)) {
  $prev = Get-ChildItem $DeployDir -Filter "publish-*.sql" | Sort-Object Name -Descending | Select-Object -First 1
  throw ("missing " + $SqlPath + " (website changelog). Easiest: copy " + $prev.Name + " and bump its version string, then edit the changelog.")
}
if (-not (Test-Path $ServerScript)) { throw ("missing " + $ServerScript) }
if (-not $Sha) { $Sha = (git rev-parse --short HEAD).Trim() }
Write-Ok ("head sha " + $Sha + ", changelog " + (Split-Path -Leaf $SqlPath))

# ---------------------------------------------------------------- push
if ($Push) {
  Write-Step "1. Push (triggers the CI build)"
  Invoke-Checked "git" @("push", "origin", $Branch)
  Write-Ok ("pushed " + $Branch)
} else {
  Write-Step ("1. Push skipped (-Push not set); assuming " + $Sha + " is already on origin/" + $Branch)
}

# ---------------------------------------------------------------- poll CI
Write-Step "2. Poll GitHub Actions (Desktop Build)"
$token = Get-GitHubToken
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$run = $null
while ((Get-Date) -lt $deadline) {
  $runs = Get-ApiJson ("https://api.github.com/repos/" + $Repo + "/actions/runs?branch=" + $Branch + "&per_page=10") $token
  $run = $runs.workflow_runs | Where-Object { $_.head_sha -like ($Sha + "*") -and $_.name -eq "Desktop Build" } | Select-Object -First 1
  if (-not $run) { Write-Warn2 ("no Desktop Build run for " + $Sha + " yet, retry in 30s"); Start-Sleep 30; continue }
  Write-Host ("  run #" + $run.run_number + " status=" + $run.status + " conclusion=" + $run.conclusion)
  if ($run.status -eq "completed") { break }
  Start-Sleep 30
}
if (-not $run) { throw ("timeout: no build run for " + $Sha) }
if ($run.status -ne "completed") { throw ("timeout: build still " + $run.status + " - " + $run.html_url) }
if ($run.conclusion -ne "success") { throw ("build failed: " + $run.conclusion + " - " + $run.html_url) }
Write-Ok ("run #" + $run.run_number + " success")
# ---------------------------------------------------------------- download
Write-Step "3. Download artifact"
$arts = Get-ApiJson ("https://api.github.com/repos/" + $Repo + "/actions/runs/" + $run.id + "/artifacts") $token
$art = $arts.artifacts | Where-Object { $_.name -like "desktop-windows*" } | Select-Object -First 1
if (-not $art) { throw "artifact desktop-windows* not found (expired?)" }
New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
$zip = Join-Path $ArtifactDir "artifact.zip"
$downloaded = $false
for ($i = 1; $i -le 6; $i++) {
  & curl.exe -s -f -L -H ("Authorization: Bearer " + $token) -H "User-Agent: shentong-deploy" -o $zip $art.archive_download_url
  if ($LASTEXITCODE -eq 0 -and (Test-Path $zip) -and (Get-Item $zip).Length -gt 1000000) { $downloaded = $true; break }
  Write-Warn2 ("download attempt " + $i + " failed (exit " + $LASTEXITCODE + ")")
  Start-Sleep -Seconds 10
}
if (-not $downloaded) { throw "artifact download failed" }
Expand-Archive -Path $zip -DestinationPath $ArtifactDir -Force
Remove-Item $zip -Force
Write-Ok ("artifact -> " + $ArtifactDir)

# ---------------------------------------------------------------- verify
Write-Step "4. Verify artifact against latest.yml"
$exePath = Join-Path $ArtifactDir $ExeName
$ymlPath = Join-Path $ArtifactDir "latest.yml"
if (-not (Test-Path $exePath)) { throw ("missing " + $ExeName + " in the artifact") }
if (-not (Test-Path $ymlPath)) { throw "missing latest.yml in the artifact" }
$yml = Read-LatestYml $ymlPath
if ($yml.version -ne $Version) { throw ("latest.yml version is " + $yml.version + ", expected " + $Version) }
$exeSize = (Get-Item $exePath).Length
if ($yml.size -ne $exeSize) { throw ("size mismatch: latest.yml " + $yml.size + " vs local " + $exeSize) }
$localSha = Get-Sha512Base64 $exePath
if ($localSha -ne $yml.sha512) { throw "sha512 mismatch: local base64 does not match latest.yml" }
Write-Ok ("version " + $yml.version + ", size " + $exeSize + ", sha512 " + $localSha.Substring(0, 16) + "...")

# ---------------------------------------------------------------- upload
if ($SkipUpload) {
  Write-Warn2 "upload skipped (-SkipUpload); artifact is ready locally"
} else {
  Write-Step "5. Upload to the server /tmp/"
  Invoke-Checked "scp" @("-o", "BatchMode=yes", $exePath, $ymlPath, $ServerScript, $SqlPath, ($Server + ":/tmp/"))
  Write-Ok ("uploaded exe + latest.yml + publish-desktop.sh + publish-" + $Version + ".sql")
}

# ---------------------------------------------------------------- publish
if ($Publish) {
  Write-Step "6. Server publish + DB registration"
  Invoke-Checked "ssh" @("-o", "BatchMode=yes", $Server, ("bash /tmp/publish-desktop.sh " + $Version))
  Invoke-Checked "ssh" @("-o", "BatchMode=yes", $Server, ("sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-" + $Version + ".sql"))

  Write-Step "7. Verify live"
  Write-Host "  --- latest.yml ---"
  & curl.exe -s ($SiteBase + "/desktop/latest.yml") | Select-Object -First 3
  $code = & curl.exe -s -o NUL -w "%{http_code}" ($SiteBase + "/desktop/ShenTongAI-Setup-" + $Version + "-x64.exe.zip")
  Write-Host ("  --- zip HTTP " + $code + " (anything but 200 means the Setup-prefixed zip is missing) ---")
  $check = & curl.exe -s ($SiteBase + "/api/version/check?platform=win&currentVersion=0.0.0")
  Write-Host ("  --- version/check: " + $check.Substring(0, [Math]::Min(200, $check.Length)) + " ---")
  Write-Host ""
  Write-Host "  Manual smoke test still required: install on a real machine, confirm the update prompt,"
  Write-Host "  then walk section 2 of the acceptance checklist under deploy/ (needs a real Feishu account)."
} else {
  Write-Step "6. Next step (server side)"
  Write-Host ("  ssh " + $Server + " 'bash /tmp/publish-desktop.sh " + $Version + "'")
  Write-Host ("  ssh " + $Server + " 'sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-" + $Version + ".sql'")
  Write-Host "  or re-run this script with -Publish to do both."
}

Write-Host ""
Write-Host ("DONE: " + $ExeName + " (" + $Version + ")")
