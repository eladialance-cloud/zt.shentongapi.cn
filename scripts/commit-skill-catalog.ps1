# 一键提交+推送：开源技能库清单（技能源）+ 管理后台管理 + 桌面端直连下载 + OpenClaw 配置修复
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
Set-Location "D:\二次开发"
$files = @(
  "backend/src/common/utils/db-migration.ts",
  "backend/src/modules/admin-imports/admin-imports.module.ts",
  "backend/src/modules/admin-imports/admin-imports.service.ts",
  "backend/src/modules/admin-imports/entities/asset-import-job.entity.ts",
  "backend/src/modules/admin-imports/parsers/skill-catalog-categories.ts",
  "backend/src/modules/admin-skill-store/admin-skill-store.controller.ts",
  "backend/src/modules/admin-skill-store/admin-skill-store.service.ts",
  "backend/src/modules/admin-skill-store/dto/skill-source.dto.ts",
  "backend/src/modules/skill-store/entities/skill-source.entity.ts",
  "backend/src/modules/skill-store/skill-store.module.ts",
  "backend/src/modules/skill-store/controllers/skill-sources.controller.ts",
  "backend/src/modules/skill-store/services/skill-sources.service.ts",
  "backend/scripts/seed-skill-catalog.js",
  "backend/test/unit/admin-imports.service.spec.ts",
  "backend/test/unit/import-parsers.spec.ts",
  "frontend/admin/src/api/admin-skill-store-api.ts",
  "frontend/admin/src/pages/SkillStore/index.tsx",
  "frontend/admin/src/types/admin-skill-store.ts",
  "desktop/electron-builder.yml",
  "desktop/electron/main/index.ts",
  "desktop/electron/main/local-market/local-content-manager.ts",
  "desktop/electron/main/openclaw-mcp-sync.ts",
  "desktop/electron/main/runtime-downloader.ts",
  "desktop/electron/main/service-manager.ts",
  "desktop/electron/preload/index.ts",
  "desktop/electron/shared/types.ts",
  "desktop/src/api/market-api.ts",
  "desktop/src/pages/SkillMarket/index.tsx",
  "desktop/src/pages/SkillMarket/OpenSourceSkills.tsx",
  "desktop/src/types/skill-source.ts"
)
& $git add $files
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] git add 失败"; exit 1 }
& $git commit -m "feat(skill-market): 开源技能库清单入库技能源+管理后台编辑/批量删除/分类筛选+桌面端GitHub直连下载安装+OpenClaw配置修复"
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] commit 失败（可能无变更或冲突），继续尝试 push"; }
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "=== 提交+推送完成 ==="