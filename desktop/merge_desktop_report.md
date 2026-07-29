# Desktop 文件合并报告

## 统计
- 保留工作区: 27 文件
- 从 stash 恢复: 1 文件
- 各有优劣（默认保留工作区）: 2 文件

## 详细决策

### desktop/.gitignore
- 决策: 保留工作区
- 原因: 工作区版本移除了 `.env.production` / `.env.development` / `.env.*.local` 的忽略规则，新增了 `cache/` 忽略。stash 版本保留了更多 .env 忽略规则但缺少 cache/。工作区版本更简洁，且 cache/ 忽略是有意义的新增。

### desktop/electron-builder.yml
- 决策: 保留工作区
- 原因: 工作区版本有 asarUnpack 配置（解包 sqlcipher 和 better-sqlite3 原生模块），stash 版本缺少此关键配置。工作区版本还有 zip target 输出、更完善的 artifactName 命名（ShenTongAI-${version}-${arch}）和 signAndEditExecutable: false。按任务特别指示保留工作区。

### desktop/electron.vite.config.ts
- 决策: 保留工作区
- 原因: 工作区版本已有 external electron 修复（将 electron 声明为 external 防止打包时 bundle npm 下载器包），还有 electron-updater external、dev CSP unsafe-inline 插件、pixi.js vendor 分块等。按任务特别指示保留工作区。

### desktop/electron/main/index.ts
- 决策: 保留工作区
- 原因: 工作区版本是大幅重构后的版本：新增了 ELECTRON_RUN_AS_NODE 环境变量检测、fixWindowsPath 修复、更完善的 IPC 处理（db:initialize 改用 userToken、credential API、hermes:set-llm-proxy-key、remoteControl 等）、doctor 预检、灰度更新等功能。stash 版本功能较少，缺少大量 IPC handler。工作区版本功能更完整。

### desktop/electron/main/runtime-downloader.ts
- 决策: 保留工作区
- 原因: 工作区版本是重写的 CDN 下载器（使用 https + AbortController + 断点续传 + SHA-256 流式校验），比 stash 版本的 npm install + CDN 回退双路径架构更简洁。工作区版本更聚焦于 CDN 下载到 userData 目录的模式，且有完善的断点续传和重试机制。

### desktop/electron/main/runtime-resolver.ts
- 决策: 保留工作区
- 原因: 工作区版本移除了 findCommandFullPath 手动遍历 PATH 的复杂逻辑（改用简单的 where/which），移除了 cloud 服务类型处理、CLOUD_SERVICES 集合、RUNTIME_ARGS 等概念，简化为 builtin/userData/host 三级解析。更简洁且与当前架构一致。

### desktop/electron/main/service-manager.ts
- 决策: 保留工作区
- 原因: 工作区版本新增了云端服务健康检查（checkCloudHealth/checkCloudService）、stderr 环形缓冲诊断、openclaw doctor 预检、deploymentType 支持、tree-kill 进程树清理、MCP SSE 就绪检测优化等。功能比 stash 版本更丰富。

### desktop/electron/main/updater.ts
- 决策: 保留工作区
- 原因: 工作区版本的灰度判断逻辑更完善：缓存 grayscaleHit 在实例字段中避免重复读取磁盘，persist 文件名从 update-grayscale.json 改为 grayscale.json 更简洁。stash 版本的灰度持久化包含 version+percent 校验但工作区版本更简洁实用。更新服务器 URL 工作区用 zt.shentongapi.cn，stash 用 update.shentong.ai（可能是未来域名，但目前保留工作区版本更安全）。

### desktop/electron/preload/index.ts
- 决策: 保留工作区
- 原因: 工作区版本暴露了更完整的 API：remoteControl、authApi、credential、hermes 等接口。stash 版本缺少这些 API 暴露，且有 context isolation 禁用时的 fallback（直接挂 window），工作区版本在禁用 context isolation 时抛错（更安全）。工作区版本安全性和功能都更好。

### desktop/electron/shared/types.ts
- 决策: 保留工作区
- 原因: 工作区版本包含完整的类型定义：ServiceDeploymentType、RuntimeUpdateInfo、RuntimeUpdateResult、RemoteControlAPI、AuthAPI、CredentialAPI 等。stash 版本移除了很多这些类型，但又新增了 InstallProgressPayload 和部分 RemoteControl 类型重复定义。工作区版本类型更完整，与 preload/index.ts 的 API 暴露一致。

### desktop/package.json
- 决策: 保留工作区
- 原因: 工作区版本 version=0.4.8（比 stash 的 0.5.1 低），但保留了完整的 scripts（postinstall、predev、dev、build、test、fetch-runtime、pack 等命令）和 devDependencies（electron、electron-builder、jest、ts-jest 等）。stash 版本移除了所有 scripts 和 devDependencies，仅保留 dependencies。工作区版本是完整可构建的项目配置。

### desktop/package-lock.json
- 决策: 保留工作区
- 原因: 与 package.json 一致，工作区版本保留完整的 lockfile（含 devDependencies 的锁定），stash 版本精简了 lockfile。保持与 package.json 一致。

### desktop/runtime/manifest.json
- 决策: 保留工作区
- 原因: 按任务特别指示保留工作区版本。工作区版本移除了 type/size 字段，openclaw 版本降为 0.3.0（端口 8080），补充了 darwin/linux 的 downloadUrl。stash 版本有 sha256 填充值和更高的 openclaw 版本号（2026.7.1），但工作区版本与当前代码中的端口配置（SERVICE_DEFS openclaw port 8080）一致。注意：工作区版本 sha256 为空，意味着首次启动会触发在线下载。

### desktop/scripts/build-installer.ps1
- 决策: 保留工作区
- 原因: 工作区版本中文注释编码正确，步骤命名清晰（步骤 1-7），包含完整的多语言注释。stash 版本中文注释出现乱码（编码问题），但新增了 Step 5.5（zip 重命名）和 Step 8（用户下载文件名生成）步骤。工作区版本注释正确，stash 版本有额外步骤但编码损坏。各有优劣，默认保留工作区。

### desktop/scripts/fetch-runtime.ts
- 决策: 保留工作区
- 原因: 工作区版本支持 4 个服务（含 hermes），CDN 地址用 zt.shentongapi.cn。stash 版本仅支持 3 个服务（无 hermes），CDN 地址用 cdn.shentong.ai。工作区版本服务覆盖更全。

### desktop/scripts/generate-latest-yml.ts
- 决策: 保留工作区
- 原因: 工作区版本动态扫描 installer-v* 目录找最新版本目录，更健壮。stash 版本使用固定 INSTALLER_DIR 路径（dist/installer），简化但不够灵活。工作区版本容错性更好。

### desktop/scripts/verify-installer.ts
- 决策: 保留工作区
- 原因: 工作区版本 INSTALLER_DIR 指向 dist/installer-v029（虽然看起来是硬编码版本号），sha512 解析逻辑更精确（区分缩进层级）。stash 版本指向 dist/installer，sha512 解析简化。工作区版本 sha512 解析更严谨。

### desktop/src/api/hermes-api.ts
- 决策: 保留工作区
- 原因: 工作区版本包含更多 API：getHealth、mountSkill、listSkillCategories、uninstallSkill、rateSkill、getSkillRatings、checkSkillUpdate、createSkill 等。stash 版本精简了很多 API，仅保留核心接口。工作区版本 API 覆盖更完整。

### desktop/src/api/service-manager-api.ts
- 决策: 保留工作区
- 原因: 工作区版本包含 installService 和 onServiceError，但缺少 onInstallProgress。stash 版本新增了 onInstallProgress 监听。工作区版本功能更完整（有 installService 和 onServiceError），缺少 onInstallProgress 但可在后续补充。各有优劣，默认保留工作区。

### desktop/src/components/MainLayout/StatusPanel.tsx
- 决策: 保留工作区
- 原因: 工作区版本使用 CSS 变量（var(--color-text-secondary) 等），与 v0.3.1 设计令牌系统一致。stash 版本使用硬编码颜色值。工作区版本设计系统一致性更好。

### desktop/src/components/MainLayout/TopTabs.tsx
- 决策: 保留工作区
- 原因: 文件仅在工作区存在（new file），stash 版本无此文件。工作区版本新增了顶部 Tab 导航组件，包含 11 个 Tab 项。

### desktop/src/components/StatusBar.tsx
- 决策: 保留工作区
- 原因: 文件仅在工作区存在（new file），stash 版本无此文件。工作区版本新增了底栏状态指示器组件。

### desktop/src/pages/Chat/index.tsx
- 决策: 保留工作区
- 原因: 工作区版本有右侧上下文面板（可折叠）、URL 参数预选 Agent（agentId 查询参数）、replyStartedRef 优化、更完善的 officeBridge 事件触发时序（4 秒延迟 onTaskComplete）。stash 版本移除了上下文面板、URL 预选，简化了 officeBridge 时序（1.5 秒延迟），使用硬编码颜色。工作区版本功能更丰富。

### desktop/src/pages/Login/index.tsx
- 决策: 从 stash 恢复
- 原因: 按任务特别指示。stash 版本删除了演示模式（DEMO_TOKEN），新增了"记住密码"功能（通过 SafeStorage 加密存储密码 + localStorage 存账号）。工作区版本保留了演示模式但缺少记住密码功能。stash 版本更符合生产环境需求。

### desktop/src/pages/Onboarding/index.tsx
- 决策: 保留工作区
- 原因: 工作区版本包含 3 个服务（无 hermes），使用 Progress 组件显示安装进度。stash 版本新增了 4 个服务（含 hermes）、列表式安装状态展示（每个服务独立 pending/installing/success/failed 状态）、单个重试和全部重试功能。stash 版本功能更丰富，但工作区版本与当前的 3 服务架构一致。各有优劣，默认保留工作区。

### desktop/src/pages/Onboarding/styles.module.css
- 决策: 保留工作区
- 原因: 工作区版本使用 CSS 变量，stash 版本使用硬编码颜色值并新增了 Step 2 安装列表样式。与 Onboarding/index.tsx 的决策一致，保留工作区版本。

### desktop/src/pages/ServiceManager/index.tsx
- 决策: 保留工作区
- 原因: 工作区版本有详情抽屉（Drawer + Descriptions）、全部启动/全部停止批量操作、ServiceStatusIndicator 共享组件、deploymentType 云端服务支持。stash 版本移除了抽屉和批量操作，改为修复进度条展示和一键修复全部。工作区版本功能更完整。

### desktop/src/pages/ServiceManager/styles.module.css
- 决策: 保留工作区
- 原因: 工作区版本使用 CSS 变量（v0.3.1 设计令牌），有抽屉日志区样式。stash 版本使用硬编码颜色值（赛博科技深色风格），新增了修复进度条样式。与 ServiceManager/index.tsx 决策一致。

### desktop/src/router/index.tsx
- 决策: 保留工作区
- 原因: 工作区版本使用 lazy + Suspense 懒加载所有页面组件，包含更多路由（Automation、Team、AgentDetail、KnowledgeEditor、admin 统一入口等），有 withSuspense 包装器。stash 版本改为同步 import（无懒加载），路由数量更少。工作区版本性能更好（懒加载）且路由更完整。

### desktop/tests/setup.ts
- 决策: 保留工作区
- 原因: 工作区版本的 generateAgent mock 包含 ownerType、ownerId、version 字段，与当前类型定义一致。stash 版本移除了这些字段，新增了 onInstallProgress 和 disableHardwareAcceleration mock。各有优劣，默认保留工作区。

### desktop/tsconfig.web.json
- 决策: 保留工作区
- 原因: 工作区版本的 exclude 列表排除了 TaskCenter、Team、Office、McpConfig、AgentDetail、AgentMarket、Automation 等目录（这些可能是未完成或有编译问题的模块）。stash 版本的 exclude 列表更精简（仅排除 Automation、Team、Settings/RemoteControl、Settings/SyncStatus、office-ws、测试文件）。工作区版本排除范围更广，可能是为了规避编译错误。保留工作区版本以维持当前构建状态。
