# 内置本地服务运行时 Spec

## Why
当前深瞳AI 安装包(`d:\二次开发\desktop\`)通过 `child_process.spawn` 调用宿主机命令(`n8n` / `opencclaw` / `mcp-gateway`)启动本地服务,完全依赖用户预装 Node.js + CLI,导致开箱即用体验缺失。原 spec(`build-shentong-downloadable-client/spec.md:145-149`)承诺的"首次启动自动下载并安装运行时"也未真正实现(`ServiceManager.install()` 仅为占位 mock)。本 spec 旨在将 N8N / OpenClaw / MCP Gateway 运行时打包进安装包,实现双击即用。

## What Changes
- **新增运行时打包流程**:构建期下载平台对应的 N8N / OpenClaw / MCP 运行时包,放入 `desktop/runtime/<service>/` 目录
- **新增 `runtime/` 目录结构**:
  - `runtime/n8n/` — N8N 便携包(含 node_modules 与入口 `n8n` CLI)
  - `runtime/openclaw/` — OpenClaw 可执行文件
  - `runtime/mcp-gateway/` — MCP Gateway 可执行文件
  - `runtime/manifest.json` — 各服务版本号 + 入口路径 + 校验和
- **修改 `electron-builder.yml`**:`extraResources` 增加 `runtime/**`,打包到 `resources/runtime/`
- **修改 `ServiceManager`**:
  - 启动命令优先解析 `process.resourcesPath/runtime/<service>/` 内的入口
  - 回退逻辑:若内置运行时缺失,再尝试宿主机命令(保持兼容)
  - `install()` 方法改为"内置运行时存在性校验 + 缺失时在线下载"
- **新增 `RuntimeResolver` 模块**:跨平台解析各服务入口绝对路径(Windows `.exe` / Mac 无后缀 / Linux 无后缀)
- **新增运行时下载器 `RuntimeDownloader`**:首次启动若内置运行时损坏或缺失,按平台从 CDN 下载并解压到 `app.getPath('userData')/runtime/`
- **修改首次启动引导(`Onboarding`)**:环境检测步骤改为"校验内置运行时完整性(校验和)",缺失时显示下载进度
- **新增版本管理**:运行时版本写入 `manifest.json`,客户端启动时比对,支持通过 electron-updater 增量更新运行时包

## Impact
- **Affected specs**:
  - `build-shentong-downloadable-client` — Task 16(ServiceManager)与首次启动引导需联动改造,install() 占位实现被替换
  - `enhance-ui-cyber-tech` — StatusBar 服务状态展示不变,但 Onboarding 引导步骤增强
- **Affected code**:
  - `desktop/electron/main/service-manager.ts` — 启动命令解析逻辑重写
  - `desktop/electron-builder.yml` — extraResources 扩展
  - `desktop/electron/main/runtime-resolver.ts` — 新增
  - `desktop/electron/main/runtime-downloader.ts` — 新增
  - `desktop/src/pages/Onboarding/index.tsx` — 引导步骤增强
  - `desktop/scripts/fetch-runtime.ts` — 新增构建期下载脚本
  - `desktop/runtime/manifest.json` — 新增版本清单
- **打包体积影响**:预计增加 ~150-250MB(N8N ~120MB / OpenClaw ~30MB / MCP ~10MB),通过 asar 拆包 + extraResources 外置避免膨胀

## ADDED Requirements

### Requirement: 运行时打包与版本清单
The system SHALL bundle N8N, OpenClaw, and MCP Gateway runtime binaries into the installer via `extraResources`, with a `manifest.json` declaring each service's version, entry path, and SHA-256 checksum for integrity verification.

#### Scenario: 构建期下载运行时
- **WHEN** 执行 `npm run build:win` 或 `build:mac`
- **THEN** 预构建脚本 `scripts/fetch-runtime.ts` 读取 `runtime/manifest.json` 中声明的版本与下载地址
- **AND** 按当前平台下载对应的运行时包到 `runtime/<service>/` 目录
- **AND** 下载完成后校验 SHA-256,失败则中断构建并报错
- **AND** electron-builder 将 `runtime/**` 通过 `extraResources` 打包到安装包的 `resources/runtime/`

#### Scenario: 运行时版本清单
- **WHEN** 客户端主进程启动
- **THEN** 读取 `process.resourcesPath/runtime/manifest.json`
- **AND** 与本地 `app.getPath('userData')/runtime/manifest.json`(若有补丁更新)比对
- **AND** 取版本较新者作为本次启动使用的运行时

### Requirement: 跨平台运行时路径解析
The system SHALL provide a `RuntimeResolver` that resolves the absolute entry path of each service for the current platform, preferring bundled runtime in `resources/runtime/`, falling back to user-data dir (downloaded patches), and finally to host system command.

#### Scenario: Windows 下解析 N8N 入口
- **WHEN** 平台为 win32 且需要启动 N8N
- **THEN** `RuntimeResolver.resolve('n8n')` 依次检查:
  1. `process.resourcesPath/runtime/n8n/n8n.exe`(内置便携可执行)
  2. `process.resourcesPath/runtime/n8n/node_modules/n8n/bin/n8n`(Node 脚本入口,配合内置 Node 运行时)
  3. `app.getPath('userData')/runtime/n8n/`(用户目录补丁)
  4. 宿主机 `n8n` 命令(回退)
- **AND** 返回首个存在路径的 `{ cmd, args, env }` 组合

#### Scenario: 内置运行时缺失回退宿主机
- **WHEN** 内置运行时目录不存在或入口文件缺失
- **AND** 宿主机也未安装对应命令
- **THEN** `ServiceManager.start()` 返回 false 并设置 `info.error = '运行时未安装'`
- **AND** 触发 `service-error` 事件,前端引导用户点击"下载运行时"

### Requirement: 首次启动运行时完整性校验
The system SHALL verify the integrity of bundled runtime on first launch by checking SHA-256 checksums against `manifest.json`, and trigger download UI if any service is corrupted or missing.

#### Scenario: 内置运行时完整
- **WHEN** 用户首次启动客户端
- **THEN** Onboarding 引导的"环境检测"步骤读取 `manifest.json`
- **AND** 对每个服务的入口文件计算 SHA-256 并与 manifest 比对
- **AND** 全部匹配则标记服务为 ready,进入"服务初始化"步骤自动拉起三服务

#### Scenario: 内置运行时损坏
- **WHEN** 校验某服务 SHA-256 不匹配(如安装包被篡改或下载中断)
- **THEN** 引导界面显示该服务为"损坏,需重新下载"
- **AND** 提供"重新下载"按钮,触发 `RuntimeDownloader.download(service)` 从 CDN 重新拉取到 `userData/runtime/<service>/`
- **AND** 下载过程显示进度条与速率
- **AND** 下载完成后重新校验,通过则继续

### Requirement: 运行时在线下载器
The system SHALL provide a `RuntimeDownloader` that downloads service runtime packages from a configurable CDN URL, extracts to user data directory, and verifies checksum, with resumable download support and progress events.

#### Scenario: 正常下载并解压
- **WHEN** 调用 `RuntimeDownloader.download('n8n', onProgress)`
- **THEN** 从 `manifest.json` 中读取 N8N 的 CDN 地址(含平台与版本号)
- **AND** 使用 `https.get` 流式下载到临时文件 `userData/runtime/.tmp/n8n-<version>.tar.gz`
- **AND** 支持 Range 请求续传(若临时文件已存在部分数据)
- **AND** 每秒 emit 进度事件 `{ percent, speedKBs, etaSec }`
- **AND** 下载完成后校验 SHA-256
- **AND** 解压到 `userData/runtime/n8n/`(覆盖旧版本)
- **AND** 更新 `userData/runtime/manifest.json` 中的版本号
- **AND** 删除临时文件,返回 true

#### Scenario: 下载失败重试
- **WHEN** 下载过程中网络中断或 HTTP 状态码非 2xx
- **THEN** 自动重试最多 3 次,间隔 5 秒
- **AND** 重试时复用已下载的部分(断点续传)
- **AND** 超过重试上限后返回 false 并 emit error 事件

### Requirement: ServiceManager 启动逻辑改造
The system SHALL modify `ServiceManager` to use `RuntimeResolver` for command resolution, removing the hard-coded `SERVICE_COMMANDS` map, with automatic fallback to bundled runtime first, then host command.

#### Scenario: 使用内置运行时启动 N8N
- **WHEN** 调用 `ServiceManager.start('n8n')`
- **AND** `RuntimeResolver.resolve('n8n')` 返回内置便携入口
- **THEN** 使用解析得到的 `{ cmd, args, env }` 调用 `spawn`
- **AND** 注入 `N8N_ENV` 环境变量(Host/Port/Protocol/Timezone)
- **AND** 等待端口 5678 就绪,超时 30 秒
- **AND** 就绪后标记 status=running

#### Scenario: install() 方法真实实现
- **WHEN** 调用 `ServiceManager.install(name, onProgress)`
- **THEN** 不再是占位 mock
- **AND** 实际调用 `RuntimeDownloader.download(name, onProgress)` 下载到 userData
- **AND** 下载完成后调用 `RuntimeResolver` 重新解析路径
- **AND** 自动 `start(name)` 拉起服务
- **AND** 返回 true/false 表示安装并启动是否成功

## MODIFIED Requirements

### Requirement: 首次服务初始化(原 build-shentong-downloadable-client spec)
**Modified**: 引导向导的"环境检测"步骤不再检测宿主机是否预装命令,而是校验安装包内置运行时的 SHA-256 完整性。若损坏则触发在线下载到 userData 目录,而非依赖用户手动安装。`install()` 方法从占位 mock 改为调用 `RuntimeDownloader` 真实下载。

### Requirement: ServiceManager 启动命令解析(原 build-shentong-downloadable-client spec)
**Modified**: `SERVICE_COMMANDS` 硬编码命令表移除,改为通过 `RuntimeResolver.resolve(name)` 动态解析。解析优先级:内置 extraResources → userData 补丁 → 宿主机命令回退。三服务(OpenClaw/N8N/MCP)统一走该解析链路。

## REMOVED Requirements
（无移除项,本 spec 为对 build-shentong-downloadable-client 的增量补齐)
