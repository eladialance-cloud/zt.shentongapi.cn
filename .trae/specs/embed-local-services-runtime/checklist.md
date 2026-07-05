# Checklist

## 运行时清单与目录结构
- [x] `desktop/runtime/manifest.json` 存在且包含 n8n/openclaw/mcp 三服务的 version / entry / sha256 / 各平台下载地址字段
- [x] `desktop/runtime/n8n/`、`desktop/runtime/openclaw/`、`desktop/runtime/mcp-gateway/` 三目录存在(各含 `.gitkeep`)
- [x] `desktop/.gitignore` 已忽略 `runtime/*/` 大文件,但保留 `.gitkeep` 与 `manifest.json`

## RuntimeResolver 实现
- [x] `desktop/electron/main/runtime-resolver.ts` 导出 `resolve(name)` 返回 `{ cmd, args, env } | null`
- [x] 解析优先级正确:内置 extraResources → userData 补丁 → 宿主机命令回退
- [x] 跨平台入口路径正确(Windows `.exe` / Mac & Linux 无后缀)
- [x] `verifyIntegrity(name)` 使用 SHA-256 校验入口文件与 manifest 比对

## RuntimeDownloader 实现
- [x] `desktop/electron/main/runtime-downloader.ts` 导出 `download(name, onProgress): Promise<boolean>`
- [x] 从 manifest 读取 CDN 地址并按平台+架构拼接
- [x] 使用 `https.get` 流式下载,支持 Range 请求断点续传
- [x] 每秒 emit 进度事件 `{ percent, speedKBs, etaSec }`
- [x] 下载完成后校验 SHA-256,失败则删除并重试
- [x] 解压到 `userData/runtime/<service>/` 并更新版本清单
- [x] 失败重试最多 3 次,间隔 5 秒,断点续传复用已下载部分

## ServiceManager 改造
- [x] `service-manager.ts` 中 `SERVICE_COMMANDS` 硬编码常量已移除
- [x] `spawnService()` 改为调用 `RuntimeResolver.resolve(name)` 获取启动命令
- [x] N8N_ENV / MCP_ENV 环境变量仍正确注入
- [x] `install()` 方法不再是占位 mock,实际调用 `RuntimeDownloader.download()` 并自动 `start()`
- [x] `checkEnvironment()` 调用 `RuntimeResolver.verifyIntegrity()` 返回三服务完整性

## 构建期下载脚本
- [x] `desktop/scripts/fetch-runtime.ts` 存在且可执行
- [x] 读取 manifest.json 并按平台下载各服务运行时到 `runtime/<service>/`
- [x] 下载完成后校验 SHA-256,失败时 `process.exit(1)` 中断构建(CDN 不可达时容错跳过)
- [x] 实际 SHA-256 写入 manifest.json(CDN 可达时)
- [x] `package.json` 中 `prebuild:win` / `prebuild:mac` 脚本已注册(`build:win` / `build:mac` 前手动或 CI 串联触发)

## electron-builder 打包配置
- [x] `electron-builder.yml` 的 `extraResources` 包含 `- from: runtime/` `to: runtime/`
- [ ] 打包后安装目录 `resources/runtime/{n8n,openclaw,mcp-gateway}/` 完整存在(待实际打包验证)
- [ ] `resources/runtime/manifest.json` 存在且含实际 SHA-256(待 CDN 可达后实际下载验证)

## Onboarding 引导页增强
- [x] "环境检测"步骤调用 IPC `runtime:verify` 触发主进程校验
- [x] 校验通过显示 ✅,失败显示 ❌ + "重新下载"按钮
- [x] 点击"重新下载"调用 IPC `runtime:download` 并监听进度事件
- [x] 进度条展示百分比 + 速率 + ETA(深色赛博风格)
- [x] 下载完成后重新校验,通过则进入"服务初始化"自动 `startAll()`

## IPC 通道与 Preload
- [x] `ipcMain.handle('runtime:verify')` 注册并调用 `RuntimeResolver.verifyIntegrity()`
- [x] `ipcMain.handle('runtime:download')` 注册并调用 `RuntimeDownloader.download()`
- [x] `webContents.send('runtime:download-progress')` 推送进度事件
- [x] preload 通过 `contextBridge` 暴露 `window.runtime` API(verify / download / onProgress)
- [x] `desktop/electron/shared/types.ts` 新增 `RuntimeDownloadProgress` 与 `RuntimeVerifyResult` 类型

## 版本管理与增量更新
- [x] 客户端启动时比对内置 manifest 与 userData manifest,取较新版本(pickNewerManifest 语义化版本比较)
- [x] electron-updater `update-downloaded` 事件后清理 userData/runtime(确保使用新版本内置运行时)
- [x] 管理端版本管理模块可查看各客户端版本对应的运行时版本号(静态展示,待后端扩展 runtimeVersions 字段)

## 验证与测试
- [ ] `npm run build:win` 成功且运行时被正确打包(需 CDN 可达 + tsx 安装,留待用户手动验证)
- [ ] 安装后首次启动 Onboarding 校验通过且三服务自动拉起(端口 8080/5678/3100 监听)(需实际安装验证)
- [ ] 模拟运行时损坏(删除入口文件)后引导页显示"重新下载"并能恢复(需实际运行验证)
- [x] `npm run typecheck` 退出码 0,零类型错误
- [x] `desktop/tests/e2e/runtime-bundled.e2e.test.ts` 覆盖运行时解析与校验流程(11 个测试用例,typecheck 通过)
