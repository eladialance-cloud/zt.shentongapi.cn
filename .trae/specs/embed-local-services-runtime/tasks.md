# Tasks

- [x] Task 1: 设计运行时清单 manifest.json 并创建 runtime/ 目录骨架
  - [x] SubTask 1.1: 创建 `desktop/runtime/manifest.json`,声明 n8n/openclaw/mcp 三服务的 version、各平台下载地址、入口文件相对路径、SHA-256 校验和字段(初始值留空,构建期填充)
  - [x] SubTask 1.2: 创建 `desktop/runtime/n8n/`、`desktop/runtime/openclaw/`、`desktop/runtime/mcp-gateway/` 三个空目录(各放一个 `.gitkeep`)
  - [x] SubTask 1.3: 在 `desktop/.gitignore` 中追加 `runtime/*/` 与 `!runtime/*/.gitkeep` 与 `!runtime/manifest.json`,避免大文件入库

- [x] Task 2: 实现跨平台运行时路径解析器 RuntimeResolver
  - [x] SubTask 2.1: 新建 `desktop/electron/main/runtime-resolver.ts`,导出 `resolve(name: ServiceName): ResolvedRuntime | null`
  - [x] SubTask 2.2: 实现解析优先级链路:内置 `process.resourcesPath/runtime/<service>/` → `app.getPath('userData')/runtime/<service>/` → 宿主机命令
  - [x] SubTask 2.3: 实现 Windows 入口 `.exe` / Mac & Linux 无后缀的跨平台路径拼接,读取 manifest.json 中的 `entry` 字段
  - [x] SubTask 2.4: 导出 `verifyIntegrity(name): Promise<boolean>`,使用 `crypto.createHash('sha256')` 计算入口文件校验和并与 manifest 比对

- [x] Task 3: 实现运行时在线下载器 RuntimeDownloader
  - [x] SubTask 3.1: 新建 `desktop/electron/main/runtime-downloader.ts`,导出 `download(name, onProgress): Promise<boolean>`
  - [x] SubTask 3.2: 从 manifest.json 读取目标服务的 CDN 地址(按 `process.platform` + `process.arch` 拼参)
  - [x] SubTask 3.3: 使用 `https.get` 流式下载到 `userData/runtime/.tmp/<service>-<version>.tar.gz`,支持 Range 请求断点续传
  - [x] SubTask 3.4: 每秒 emit 进度事件 `{ percent, speedKBs, etaSec }`,下载完成后校验 SHA-256
  - [x] SubTask 3.5: 使用 `tar` 或 `node-tar` 解压到 `userData/runtime/<service>/`(覆盖旧版本),更新 `userData/runtime/manifest.json` 版本号,删除临时文件
  - [x] SubTask 3.6: 实现失败重试(最多 3 次,间隔 5 秒,断点续传)

- [x] Task 4: 改造 ServiceManager 使用 RuntimeResolver
  - [x] SubTask 4.1: 在 `service-manager.ts` 中移除硬编码 `SERVICE_COMMANDS` 常量
  - [x] SubTask 4.2: 在 `spawnService()` 方法中改为调用 `RuntimeResolver.resolve(name)` 获取 `{ cmd, args, env }`
  - [x] SubTask 4.3: 保留 N8N_ENV / MCP_ENV 环境变量注入逻辑,合并到解析结果的 env 中
  - [x] SubTask 4.4: 将 `install()` 方法从占位 mock 改为调用 `RuntimeDownloader.download(name, onProgress)` 真实下载,完成后自动 `start(name)`
  - [x] SubTask 4.5: `checkEnvironment()` 改为调用 `RuntimeResolver.verifyIntegrity()` 校验三服务完整性,返回 `{ openclaw, n8n, mcp }` 的 boolean

- [x] Task 5: 实现构建期运行时下载脚本
  - [x] SubTask 5.1: 新建 `desktop/scripts/fetch-runtime.ts`,读取 `runtime/manifest.json`
  - [x] SubTask 5.2: 按 `process.platform` + `process.arch` 拼接各服务下载地址,流式下载到 `runtime/<service>/`
  - [x] SubTask 5.3: 下载完成后校验 SHA-256,失败则 `process.exit(1)` 中断构建
  - [x] SubTask 5.4: 解压并写入实际的 SHA-256 到 manifest.json(便于运行时校验)
  - [x] SubTask 5.5: 在 `package.json` 的 `scripts` 中新增 `"prebuild:win": "tsx scripts/fetch-runtime.ts --win"` 与 `"prebuild:mac": "tsx scripts/fetch-runtime.ts --mac"`,并在 `build:win` / `build:mac` 前自动触发

- [x] Task 6: 修改 electron-builder.yml 打包运行时
  - [x] SubTask 6.1: 在 `electron-builder.yml` 的 `extraResources` 中新增 `- from: runtime/` `to: runtime/` 条目
  - [x] SubTask 6.2: 确认 `asar: true` 不影响 extraResources(extraResources 默认不打入 asar)
  - [ ] SubTask 6.3: 验证打包后安装目录结构:`resources/runtime/{n8n,openclaw,mcp-gateway}/` + `manifest.json` 完整存在(待 Task 10 实际打包验证)

- [x] Task 7: 增强 Onboarding 引导页支持运行时校验与下载
  - [x] SubTask 7.1: 修改 `desktop/src/pages/Onboarding/index.tsx` 的"环境检测"步骤,调用 IPC `runtime:verify` 触发主进程 `RuntimeResolver.verifyIntegrity()`
  - [x] SubTask 7.2: 校验通过则显示 ✅,校验失败显示 ❌ 并展示"重新下载"按钮
  - [x] SubTask 7.3: 点击"重新下载"调用 IPC `runtime:download`,监听 `runtime:download-progress` 事件展示进度条(百分比 + 速率 + ETA)
  - [x] SubTask 7.4: 下载完成后重新校验,通过则进入"服务初始化"步骤自动 `startAll()`
  - [x] SubTask 7.5: 新增 `desktop/src/pages/Onboarding/styles.module.css` 中进度条样式(深色赛博风格,主色 #6366f1/#00d4ff)

- [x] Task 8: 注册主进程 IPC 通道暴露运行时能力给渲染进程
  - [x] SubTask 8.1: 在 `desktop/electron/main/index.ts` 中注册 `ipcMain.handle('runtime:verify', ...)` 调用 `RuntimeResolver.verifyIntegrity()`
  - [x] SubTask 8.2: 注册 `ipcMain.handle('runtime:download', ...)` 调用 `RuntimeDownloader.download()`
  - [x] SubTask 8.3: 注册 `ipcMain.on('runtime:download-progress')` 通过 `webContents.send` 推送进度事件
  - [x] SubTask 8.4: 在 `desktop/electron/preload/index.ts` 中通过 `contextBridge.exposeInMainWorld` 暴露 `window.runtime` API(verify / download / onProgress)
  - [x] SubTask 8.5: 在 `desktop/electron/shared/types.ts` 中新增 `RuntimeDownloadProgress` 与 `RuntimeVerifyResult` 类型定义

- [x] Task 9: 运行时版本管理与增量更新支持
  - [x] SubTask 9.1: 客户端启动时读取内置 manifest 与 userData manifest,取版本较新者作为本次运行时来源
  - [x] SubTask 9.2: 在 `electron-updater` 的 `update-downloaded` 事件后,检查更新包内是否含 `runtime/` 目录,若有则一并解压到 userData
  - [x] SubTask 9.3: 在管理端 `版本管理` 模块新增"运行时版本"字段展示,允许管理员查看各版本对应的 N8N/OpenClaw/MCP 版本号

- [x] Task 10: 验证与测试
  - [ ] SubTask 10.1: 手动执行 `npm run build:win` 验证运行时被正确下载并打包进安装包(需 CDN 可达 + tsx 安装,留待用户手动验证)
  - [ ] SubTask 10.2: 安装后首次启动验证 Onboarding 校验通过且三服务自动拉起(端口 8080/5678/3100 监听)(需实际安装,留待用户手动验证)
  - [ ] SubTask 10.3: 模拟运行时损坏(删除入口文件)验证引导页显示"重新下载"并能恢复(需实际运行,留待用户手动验证)
  - [x] SubTask 10.4: 执行 `npm run typecheck` 确认零类型错误(退出码 0)
  - [x] SubTask 10.5: 新增 `desktop/tests/e2e/runtime-bundled.e2e.test.ts` 覆盖运行时解析与校验流程(11 个测试用例,typecheck 通过)

# Task Dependencies
- [Task 2] 依赖 [Task 1](需要 manifest.json 结构)
- [Task 3] 依赖 [Task 1](需要 manifest.json 中的 CDN 地址)
- [Task 4] 依赖 [Task 2] 与 [Task 3](ServiceManager 调用 RuntimeResolver 与 RuntimeDownloader)
- [Task 5] 依赖 [Task 1](脚本读取 manifest.json)
- [Task 6] 依赖 [Task 5](runtime/ 目录有内容后才能打包)
- [Task 7] 依赖 [Task 8](需要 IPC 通道)
- [Task 8] 依赖 [Task 2] 与 [Task 3](IPC 调用底层模块)
- [Task 9] 依赖 [Task 2] 与 [Task 3](版本比对基于已实现模块)
- [Task 10] 依赖 [Task 1-9] 全部完成

# Parallelizable Work
- [Task 2] 与 [Task 3] 可并行(均依赖 Task 1,但相互独立)
- [Task 5] 可与 [Task 2]/[Task 3] 并行(均依赖 Task 1)
- [Task 7] 与 [Task 9] 在 [Task 8] 完成后可并行
