# 创建三省六部 11 个 Hermes profiles（幂等）
# 用法: .\create-edict-profiles.ps1 -HermesJs <hermes.js 路径> -NodeExe <node.exe 路径>
param(
  [string]$HermesJs = "",
  [string]$NodeExe = "",
  [string]$ProfilesRoot = "",
  [string]$PromptDir = ""
)
$ErrorActionPreference = "Stop"

# ---- 自动探测默认值 ----
if (-not $NodeExe) { $NodeExe = "node" }
if (-not $HermesJs) {
  $candidates = @(
    "$PSScriptRoot\..\runtime\hermes\node_modules\hermes-agent\bin\hermes.js",
    "$PSScriptRoot\..\resources\hermes\node_modules\hermes-agent\bin\hermes.js"
  )
  $HermesJs = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $HermesJs) { throw "未找到 hermes.js，请用 -HermesJs 指定" }
if (-not $ProfilesRoot) {
  $ProfilesRoot = Join-Path $HOME ".hermes\profiles"
}
if (-not $PromptDir) {
  $PromptDir = Join-Path $PSScriptRoot "..\resources\edict\profiles"
}

# ---- 11 个官署 profile 定义 ----
$Profiles = @(
  @{ id = "zhongshu";  desc = "中书省·规划决策：起草执行方案、提交门下审议、转尚书执行" },
  @{ id = "menxia";    desc = "门下省·审议把关：四维审议、封驳/准奏、最多3轮" },
  @{ id = "shangshu";  desc = "尚书省·执行调度：按领域派发六部、汇总结果" },
  @{ id = "libu";      desc = "礼部·内容与礼仪：文档、规范、UI、对外沟通" },
  @{ id = "hubu";      desc = "户部·财务与数据：数据分析、统计、资源管理" },
  @{ id = "libu_hr";   desc = "吏部·人事与组织：考核评估、团队建设、能力培训" },
  @{ id = "bingbu";    desc = "兵部·研发攻坚：工程实现、架构设计、功能开发" },
  @{ id = "xingbu";    desc = "刑部·质检与审计：质量保障、测试验收、合规审计" },
  @{ id = "gongbu";    desc = "工部·工程与运维：基础设施、部署运维、性能监控" },
  @{ id = "zaochao";   desc = "司礼监·上朝与要闻：上朝仪式、每日要闻简报" },
  @{ id = "qintianjian"; desc = "钦天监·分析与预测：数据分析、性能度量、趋势预测" }
)

Write-Host "Hermes CLI: $HermesJs"
Write-Host "ProfilesRoot: $ProfilesRoot"
Write-Host "PromptDir: $PromptDir"

foreach ($p in $Profiles) {
  $id = $p.id
  $promptFile = Join-Path $PromptDir "$id.md"
  if (-not (Test-Path $promptFile)) { Write-Warning "提示词缺失: $promptFile"; continue }

  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $listOut = & $NodeExe $HermesJs profile list 2>&1 | Out-String
  $ErrorActionPreference = $prevEAP
  if ($listOut -match $id) {
    Write-Host "[skip] $id 已存在"
  } else {
    Write-Host "[create] $id ..."
    & $NodeExe $HermesJs profile create $id --description $p.desc --no-skills
    if ($LASTEXITCODE -ne 0) { Write-Warning "[fail] create $id 退出码 $LASTEXITCODE"; continue }
  }

  # 写入 SOUL.md（profile 人设文件）
  $soulPath = Join-Path $ProfilesRoot "$id\SOUL.md"
  if (-not (Test-Path (Split-Path $soulPath))) { New-Item -ItemType Directory -Force -Path (Split-Path $soulPath) | Out-Null }
  Copy-Item -Force $promptFile $soulPath
  Write-Host "[ok] $id SOUL.md -> $soulPath"
}


# ---- 同步全局 config.yaml 到每个 profile（Hermes CLI -p <profile> 会切换到 profile 自己的 HERMES_HOME，
#      每个 profile 必须持有 config.yaml，否则报 "No inference provider configured"）----
$globalCfg = Join-Path $HOME ".hermes\config.yaml"
if (Test-Path $globalCfg) {
  $cfgText = Get-Content -Raw -Encoding UTF8 $globalCfg
  foreach ($p2 in $Profiles) {
    $target = Join-Path $ProfilesRoot "$($p2.id)\config.yaml"
    $dir = Split-Path $target
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -Path $target -Value $cfgText -Encoding UTF8 -NoNewline
    Write-Host "[ok] $($p2.id) config.yaml <- $globalCfg"
  }
} else {
  Write-Warning "未找到全局 $globalCfg（先在应用内登录生成 llm-proxy 配置，或手动放置 config.yaml 后重跑）"
}

Write-Host ""
Write-Host "=== 校验 ==="
& $NodeExe $HermesJs profile list
