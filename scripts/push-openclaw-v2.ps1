# OpenClaw v2 改动一键提交+推送（提交后推 main + 触发 CI 分支）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/push-openclaw-v2.ps1
Set-Location "D:\二次开发"
$ErrorActionPreference = "Stop"
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
if (-not (Test-Path $git)) { Write-Error "找不到 git: $git" }
& $git add 'backend/package.json' 'backend/src/common/utils/db-migration.ts' 'backend/src/modules/auth/services/auth.service.ts' 'backend/src/modules/chat/chat.module.ts' 'backend/src/modules/chat/controllers/chat-accounting.controller.ts' 'backend/src/modules/chat/services/chat-accounting.service.ts' 'backend/src/modules/chat/services/llm-proxy.service.ts' 'backend/src/modules/hermes/services/hermes.service.ts' 'backend/src/modules/openclaw/controllers/openclaw.controller.ts' 'backend/src/modules/openclaw/openclaw.module.ts' 'backend/src/modules/openclaw/services/openclaw.service.ts' 'backend/src/modules/user/entities/user.entity.ts' 'backend/test/unit/chat-accounting.spec.ts' 'desktop/electron/main/index.ts' 'desktop/electron/main/openclaw-chat.ts' 'desktop/electron/main/service-manager.ts' 'desktop/electron/preload/index.ts' 'desktop/electron/shared/types.ts' 'desktop/package.json' 'desktop/resources/openclaw/' 'desktop/scripts/openclaw-probe.ts' 'desktop/src/App.tsx' 'desktop/src/api/chat-api.ts' 'desktop/src/api/openclaw-chat-api.ts' 'desktop/src/pages/Chat/components/MessageList.tsx' 'desktop/src/pages/Chat/index.tsx' 'desktop/src/pages/Chat/styles.module.css' 'desktop/tests/unit/openclaw-chat.test.ts' 'desktop/tests/unit/openclaw-skills.test.mjs' 'scripts/DEPLOY-SOP.md'
& $git commit -m 'feat(openclaw): 对话模型走管理后台llm-proxy(用户可选模型+按后台定价扣费)+登录自动注入Key+删双重记账版本0.7.7(CI 0.7.8)'
& $git --no-pager log --oneline -1
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
Write-Host "OK: 已提交并推送，等待 CI 构建 0.7.8"