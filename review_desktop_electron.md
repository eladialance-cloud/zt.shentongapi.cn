# Electron 桌面应用代码审查报告

**审查日期：** 2026-07-29  
**审查范围：** `D:\二次开发\desktop` — Electron 主进程、预加载、打包配置  
**审查人：** 自动代码审查（subagent）

---

## 目录

1. [审查摘要](#1-审查摘要)
2. [Electron 安全配置](#2-electron-安全配置)
3. [IPC 通信安全](#3-ipc-通信安全)
4. [进程管理](#4-进程管理)
5. [文件系统安全](#5-文件系统安全)
6. [打包配置](#6-打包配置)
7. [依赖安全](#7-依赖安全)
8. [运行时管理](#8-运行时管理)
9. [类型安全](#9-类型安全)
10. [其他发现](#10-其他发现)
11. [问题汇总表](#11-问题汇总表)

---

## 1. 审查摘要

| 严重级别 | 数量 |
|----------|------|
| Critical | 2    |
| Major    | 8    |
| Minor    | 9    |
| **合计** | **19** |

整体评价：项目在 Electron 安全基础方面做得较好——`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 均已正确配置，CSP 策略已实施，preload 使用 `contextBridge` 暴露 API。但在 IPC 输入验证、凭据存储安全、部分进程管理和打包配置方面存在需要修复的问题。

---

## 2. Electron 安全配置

### 2.1 BrowserWindow 安全设置 ✅ 通过

**文件：** `electron/main/windows/main-window.ts`

```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

- `contextIsolation: true` — ✅ 渲染进程与 Node.js 上下文隔离
- `nodeIntegration: false` — ✅ 渲染进程无法直接访问 Node.js API
- `sandbox: true` — ✅ 启用沙箱模式

### 2.2 CSP 策略 ✅ 通过（有 Minor 注意事项）

**文件：** `electron/main/index.ts` (第 64-92 行)

- 生产环境 `script-src 'self'` — ✅ 严格
- 开发环境 `script-src 'self' 'unsafe-inline'` — ✅ 可接受（React HMR 需要）
- `object-src 'none'` — ✅ 禁止插件
- `frame-ancestors 'none'` — ✅ 禁止嵌入

> **[Minor] CSP 生产环境 `connect-src` 过于宽松**  
> 生产环境 `connect-src` 设为 `'self' https: wss:`，允许任意 HTTPS/WSS 连接。虽然注释说明是为了后端域名变更的兼容性，但这意味着若渲染进程被 XSS 攻击，攻击者可向任意 HTTPS 服务器发送数据。  
> **建议：** 维护后端域名白名单，或至少限制为已知域名模式（如 `https://*.shentongapi.cn`）。  
> **文件：** `electron/main/index.ts` 第 73 行

### 2.3 外部链接处理 ✅ 通过

**文件：** `electron/main/windows/main-window.ts`

```typescript
mainWindow.webContents.setWindowOpenHandler((details) => {
  const parsed = new URL(details.url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { action: 'deny' }
  }
  void shell.openExternal(details.url)
  return { action: 'deny' }
})
```

- 仅允许 `http:` / `https:` 协议 — ✅ 防止 `file:` / `javascript:` 注入
- 在系统浏览器中打开，不允许在应用内打开新窗口 — ✅

### 2.4 Preload 安全 ✅ 通过

**文件：** `electron/preload/index.ts`

```typescript
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  // ...
} else {
  throw new Error('[preload] CRITICAL: context isolation is disabled...')
}
```

- 检查 `contextIsolated` 并在未启用时抛出错误 — ✅ 优秀的安全实践
- 使用 `contextBridge.exposeInMainWorld` — ✅ 无直接 `ipcRenderer` 泄露

---

## 3. IPC 通信安全

### 3.1 部分 IPC handler 缺少发送者验证

**[Major] `service:restart` 和 `service:checkEnv` 缺少 sender 验证**  
**文件：** `electron/main/index.ts` 第 166-169 行

```typescript
ipcMain.handle('service:restart', (_event, name: ServiceName) => serviceManager.restart(name))
ipcMain.handle('service:checkEnv', () => serviceManager.checkEnvironment())
```

对比同文件中其他敏感操作（`service:start`、`service:stop`、`service:install`）均有 `event.sender !== getMainWindow()?.webContents` 验证：

```typescript
ipcMain.handle('service:start', (event, name: ServiceName) => {
  if (event.sender !== getMainWindow()?.webContents) return
  return serviceManager.start(name)
})
```

`service:restart` 可以停止并重启系统服务，`service:checkEnv` 可泄露环境信息，应同样进行 sender 验证。  
**建议：** 为 `service:restart` 和 `service:checkEnv` 添加 sender 验证。

### 3.2 IPC 输入参数验证不足

**[Major] 多个 IPC handler 缺少参数类型/值验证**  
**文件：** `electron/main/index.ts`

以下 handler 直接信任渲染进程传入的参数，未做验证：

- `syncQueue:enqueue` — `item: SyncQueueItem` 未验证 `client_txn_id` 格式、`payload` 大小限制
- `syncQueue:getPending` — `limit: number` 未验证范围（可传入极大值导致内存耗尽）
- `syncQueue:updateStatus` — `id: number`、`retryCount: number` 未验证
- `syncQueue:exists` — `client_txn_id: string` 未验证长度
- `remoteControl:bind` — `config.webhookUrl` 未验证 URL 格式和协议
- `credential:set` — `key: string` 和 `value: string` 未验证长度/格式
- `db:initialize` — `userId` 和 `dbSecret` 仅检查非空，未验证格式

**建议：**
1. 为每个 IPC handler 添加参数验证（类型、长度、格式）
2. 对 `limit` 参数添加上界（如 `Math.min(limit, 1000)`）
3. 对 `webhookUrl` 验证 URL 协议为 `https:`
4. 对 `key` 参数使用白名单（如 `['accessToken', 'refreshToken']`）

### 3.3 `credential:set/get/delete` 无 sender 验证

**[Major] 凭据操作 IPC 无 sender 验证**  
**文件：** `electron/main/index.ts` 第 297-305 行

```typescript
ipcMain.handle('credential:set', (_e, key: string, value: string) => {
  setCredential(key, value)
})
ipcMain.handle('credential:get', (_e, key: string) => {
  return getCredential(key)
})
ipcMain.handle('credential:delete', (_e, key: string) => {
  deleteCredential(key)
})
```

任何渲染进程（包括潜在的 iframe 或被注入的 webview）都可以读写凭据。虽然当前只有主窗口存在，但这是纵深防御的缺失。  
**建议：** 添加 `event.sender !== getMainWindow()?.webContents` 验证。

### 3.4 `auth:getToken` / `auth:getApiBase` 无 sender 验证

**[Major] 认证信息查询无 sender 验证**  
**文件：** `electron/main/index.ts` 第 307-314 行

```typescript
ipcMain.handle('auth:getToken', async (): Promise<string | null> => {
  return getCredential('accessToken')
})
ipcMain.handle('auth:getApiBase', async (): Promise<string> => {
  return getApiBase()
})
```

`auth:getToken` 返回访问令牌，是高敏感操作，必须有 sender 验证。  
**建议：** 添加 sender 验证。

### 3.5 `hermes:set-llm-proxy-key` 无 sender 验证

**[Minor] LLM 代理密钥设置无 sender 验证**  
**文件：** `electron/main/index.ts` 第 318-320 行

```typescript
ipcMain.handle('hermes:set-llm-proxy-key', (_e, key: string) => {
  setHermesLlmProxyKey(key)
  return true
})
```

**建议：** 添加 sender 验证。

---

## 4. 进程管理

### 4.1 子进程创建 ✅ 良好（有 Minor 注意事项）

**文件：** `electron/main/service-manager.ts`

- 使用 `spawn` 而非 `exec` — ✅ 避免 shell 注入
- Windows 下对 `.cmd/.bat` 文件使用 `shell: true`，但有路径引号包裹 — ✅
- 使用 `tree-kill` 终止进程树 — ✅ 避免僵尸子进程
- `windowsHide: true` — ✅ 隐藏子进程窗口

> **[Minor] `spawnCmd` 引号包裹逻辑不够完善**  
> **文件：** `service-manager.ts` 第 405-408 行  
> ```typescript
> const spawnCmd = needsShell && path.isAbsolute(resolved.cmd) && !resolved.cmd.startsWith('"')
>   ? `"${resolved.cmd}"`
>   : resolved.cmd
> ```
> 当 `resolved.cmd` 本身包含双引号但不是以双引号开头时，可能产生异常引号嵌套。  
> **建议：** 使用更严格的引号检测，如 `!resolved.cmd.includes('"')`。

### 4.2 进程退出处理 ✅ 良好

**文件：** `electron/main/service-manager.ts`

- `child.once('exit', ...)` — ✅ 监听退出事件
- `child.once('error', ...)` — ✅ 监听 spawn 错误
- 自动重启机制：最多 3 次，间隔 5 秒 — ✅ 合理的限制
- `intentionalStop` 标记防止主动停止时触发自动重启 — ✅
- `before-quit` 时 `await serviceManager.stopAll()` — ✅ 优雅退出

### 4.3 定时器清理

**[Minor] metricsTimer 和 cloudHealthTimer 在应用退出时未显式清理**  
**文件：** `electron/main/service-manager.ts` 第 160-170 行

虽然使用了 `unref()` 使定时器不阻止进程退出，但在 `stopAll()` 中未调用 `clearInterval`。  
**建议：** 在 `stopAll()` 或单独的 `destroy()` 方法中清理定时器。

### 4.4 PowerShell 进程采样

**[Minor] `sampleProcess` 每次创建新 PowerShell 进程**  
**文件：** `electron/main/service-manager.ts` 第 90-106 行

每 5 秒为每个运行中的服务创建一个 PowerShell 进程来采样 CPU/内存指标。如果有 4 个服务运行，每 5 秒创建 4 个 PowerShell 进程，资源开销较大。  
**建议：** 考虑使用 WMI 事件订阅或降低采样频率（如 15 秒），或使用原生 Node.js 模块读取进程指标。

---

## 5. 文件系统安全

### 5.1 路径拼接 ✅ 通过

- 使用 `path.join()` 进行路径拼接 — ✅
- `runtime-downloader.ts` 中临时文件目录使用 `app.getPath('userData')` — ✅
- `runtime-resolver.ts` 中解析路径时使用 `path.join` — ✅

### 5.2 临时文件清理 ✅ 良好

**文件：** `electron/main/runtime-downloader.ts`

- `cdnInstall` 中使用 `try/finally` 确保临时归档文件被删除 — ✅
- `downloadRuntimeArchive` 中失败时清理临时文件 — ✅
- `verifyArchiveIntegrity` 中 SHA-256 不匹配时删除文件 — ✅

### 5.3 凭据存储文件权限

**[Minor] 凭据文件权限设置为 0o600 但在 Windows 上效果有限**  
**文件：** `electron/main/services/credential-store.ts` 第 33 行

```typescript
fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
```

`mode: 0o600` 在 Windows 上仅设置只读属性，不提供 Unix 式的文件权限保护。实际上依赖 SafeStorage 加密来保护内容。  
**建议：** 注释中说明 Windows 上的保护机制依赖 SafeStorage 加密而非文件权限。当前实现已足够安全，仅需文档说明。

### 5.4 manifest 文件读取无路径遍历风险 ✅ 通过

`runtime-resolver.ts` 中 `loadManifest()` 使用固定路径拼接，服务名来自 `ServiceName` 枚举类型（`'openclaw' | 'n8n' | 'mcp' | 'hermes'`），不存在路径遍历风险。

---

## 6. 打包配置

### 6.1 asar 设置 ✅ 通过

**文件：** `electron-builder.yml`

```yaml
asar: true
```

- ✅ 启用 asar 打包，源代码打包进 archive，不易被随意查看

### 6.2 文件排除规则 ✅ 通过

```yaml
files:
  - dist/main/**/*
  - dist/preload/**/*
  - dist/renderer/**/*
  - package.json
  - "!**/*.{ts,tsx,map}"
  - "!src/**"
  - "!electron/**"
  - "!*.config.*"
```

- ✅ 排除了 TypeScript 源码、sourcemap、配置文件
- ✅ 仅包含编译后的 `dist/` 目录

### 6.3 npmRebuild 禁用

**[Major] `npmRebuild: false` 禁用原生模块重新编译**  
**文件：** `electron-builder.yml`

```yaml
npmRebuild: false
nodeGypRebuild: false
```

注释说明是为了保留手动放置的 `@journeyapps/sqlcipher` 预编译二进制文件。这是一个脆弱的 workaround：

1. 如果更换 Node.js / Electron 版本，ABI 可能不兼容，预编译二进制将无法加载
2. 手动放置二进制文件的方式不可重现，依赖开发者记忆
3. 注释提到 5.3.1 时代的 binary 复用于 6.0.0，存在潜在 ABI 不匹配风险

**建议：**
1. 考虑使用 `electron-rebuild` 配合 `@journeyapps/sqlcipher` 的源码编译
2. 或切换到 `better-sqlite3`（有更好的 Electron 兼容性和预编译二进制支持）
3. 至少应在 CI/CD 中添加二进制文件存在性和加载验证的检查步骤

### 6.4 代码签名配置 ✅ 良好

```yaml
# 代码签名：通过环境变量配置，不硬编码证书路径/密码
# 构建时设置 CSC_LINK 与 CSC_KEY_PASSWORD 环境变量即可启用签名
```

- ✅ 未硬编码证书路径和密码
- ✅ 通过环境变量注入

### 6.5 extraResources

**[Minor] runtime/ 目录整体打包到 extraResources**  
**文件：** `electron-builder.yml`

```yaml
extraResources:
  - from: runtime/
    to: runtime/
    filter: ["**/*", "!**/.gitkeep"]
```

`runtime/` 目录包含 `manifest.json` 和可能的运行时归档，这些文件会被打包到 `extraResources` 中。`manifest.json` 中的 SHA-256 哈希和下载 URL 虽然不是秘密信息，但会被最终用户可见（在安装目录的 `resources/runtime/` 下）。  
**评估：** 风险可接受，但应确保 `manifest.json` 中不包含敏感信息。

---

## 7. 依赖安全

### 7.1 dependencies vs devDependencies 分类

**[Major] 多个应属于 devDependencies 的包放在了 dependencies 中**  
**文件：** `package.json`

```json
"dependencies": {
  "@ant-design/icons": "^5.5.1",    // 前端 UI 库，打包进 renderer dist
  "antd": "^5.21.6",                 // 前端 UI 库，打包进 renderer dist
  "axios": "^1.7.7",                 // 前端 HTTP 库，打包进 renderer dist
  "lucide-react": "^1.26.0",         // 前端图标库，打包进 renderer dist
  "pixi.js": "^8.6.6",               // 前端图形库，打包进 renderer dist
  "react": "^18.3.1",                // 前端框架，打包进 renderer dist
  "react-dom": "^18.3.1",            // 前端框架，打包进 renderer dist
  "react-router-dom": "^6.27.0",     // 前端路由，打包进 renderer dist
  "socket.io-client": "^4.8.1",      // 前端 WebSocket 客户端，打包进 renderer dist
  "zustand": "^4.5.5"                // 前端状态管理，打包进 renderer dist
}
```

这些前端库通过 Vite 打包到 `dist/renderer/` 中，不需要在运行时从 `node_modules` 加载。放在 `dependencies` 中意味着：

1. `electron-builder` 打包时可能会将它们包含进 asar（尽管有 `files` 排除规则）
2. 增加 `npm install` 时的安装量和时间
3. 增加供应链攻击面（这些包的 postinstall 脚本会在安装时执行）

实际上只有以下包需要留在 `dependencies` 中（主进程运行时需要）：
- `@journeyapps/sqlcipher` — 原生模块，运行时加载
- `electron-log` — 主进程日志
- `electron-updater` — 自动更新
- `tree-kill` — 进程管理

**建议：** 将前端库移至 `devDependencies`。

### 7.2 版本固定策略

**[Minor] 使用 `^` 前缀的版本范围**  
**文件：** `package.json`

所有依赖使用 `^` 前缀（如 `"react": "^18.3.1"`），允许自动升级到次版本。这可能导致不同时间安装的版本不一致。  
**建议：** 对于生产应用，考虑使用 `package-lock.json` 锁定版本，或使用精确版本号（去掉 `^`）。

### 7.3 `electron` 在 devDependencies ✅ 正确

```json
"devDependencies": {
  "electron": "^41.7.1",
  "electron-builder": "^26.15.3",
  "electron-vite": "^5.0.0"
}
```

- ✅ `electron` 框架在 `devDependencies` 中（`externalizeDepsPlugin` 处理）

---

## 8. 运行时管理

### 8.1 SHA-256 校验机制 ✅ 良好

**文件：** `electron/main/runtime-downloader.ts`

```typescript
export async function verifyArchiveIntegrity(
  name: ServiceName,
  filePath: string
): Promise<void> {
  const expected = serviceEntry.sha256[platformKey()]
  if (!expected) {
    console.warn(`[runtime-installer] ${name} sha256 未填充，跳过完整性校验`)
    return
  }
  const actual = await computeFileSha256(filePath)
  if (actual !== expected) {
    await fs.promises.unlink(filePath)
    throw new Error(`运行时归档校验失败（SHA-256 不匹配）...`)
  }
}
```

- ✅ 下载后进行 SHA-256 校验
- ✅ 校验失败时删除文件
- ✅ 流式计算哈希，兼容大文件
- ✅ 空哈希时跳过校验（开发环境兼容）

### 8.2 下载回退机制 ✅ 良好

**文件：** `electron/main/runtime-downloader.ts` `download()` 函数

- n8n: CDN 便携版优先 → npm 回退
- 其他服务: npm 优先 → CDN 回退
- 两者都失败时返回合并错误信息 — ✅

### 8.3 下载超时和错误恢复 ✅ 良好

- 归档下载超时：2 分钟（`AbortSignal.timeout`）— ✅
- 安装超时：5 分钟 — ✅
- 解压超时：2 分钟 — ✅
- 取消安装机制（`cancelFlags` + `kill`）— ✅

### 8.4 manifest 版本不一致

**[Major] `runtime-downloader.ts` 的 `DEFAULT_VERSIONS` 与 `manifest.json` 不一致**  
**文件：** `electron/main/runtime-downloader.ts` 第 31-36 行

```typescript
const DEFAULT_VERSIONS: Record<ServiceName, string> = {
  openclaw: '2026.7.1',
  n8n: '2.30.3',
  mcp: '1.0.0',
  hermes: '0.1.0'
}
```

对比 `runtime/manifest.json`：
- n8n: manifest 为 `1.62.0`，DEFAULT_VERSIONS 为 `2.30.3` — **不一致**
- hermes: manifest 为 `0.19.0`，DEFAULT_VERSIONS 为 `0.1.0` — **不一致**

当 manifest 读取失败时，会使用错误的版本号进行 npm 安装，可能安装不兼容的版本。  
**建议：** 同步 `DEFAULT_VERSIONS` 与 `manifest.json` 中的版本号，或从 manifest 唯一来源读取。

### 8.5 `verifyIntegrity` 对 builtin/userData 来源不实际校验文件哈希

**[Major] `verifyIntegrity` 对本地运行时仅检查入口文件存在性，不校验 SHA-256**  
**文件：** `electron/main/runtime-resolver.ts` 第 236-250 行

```typescript
// builtin/userData 来源：归档完整性已由 runtime-downloader 在下载/解压时验证，
// 无需再将入口文件哈希与归档哈希比较，入口文件存在即视为完整
return true
```

虽然注释说明归档下载时已验证 SHA-256，但这意味着：
1. 如果运行时文件在下载后被篡改（如恶意软件替换），`verifyIntegrity` 不会发现
2. `runtime:verify` IPC 返回的结果可能给用户虚假的安全感

**建议：**
- 对 builtin 来源，在应用构建时生成入口文件的哈希清单，运行时验证入口文件哈希
- 或至少在 `verifyIntegrity` 中明确标注"仅检查存在性，不验证文件内容"的语义

---

## 9. 类型安全

### 9.1 Preload API 类型完整性 ✅ 良好

**文件：** `electron/shared/types.ts`

- `ElectronAPI` 接口完整定义了所有暴露的 API — ✅
- `RuntimeAPI`、`RemoteControlAPI`、`AuthAPI` 分别定义 — ✅
- 使用 `Promise<T>` 返回类型匹配 `ipcRenderer.invoke` — ✅
- 事件监听器返回取消监听函数 `() => void` — ✅

### 9.2 IPC handler 返回类型

**[Minor] 部分 IPC handler 返回类型与 preload 声明不匹配**  
**文件：** `electron/main/index.ts`

- `credential:set` 在主进程中返回 `void`（`setCredential` 无返回值），但 preload 中声明为 `Promise<void>` — 实际上 `ipcMain.handle` 会将返回值包装为 Promise，但 `setCredential` 是同步函数，`ipcMain.handle` 回调不是 async 的，返回 `undefined`。这在实践中可行但不一致。  
- `hermes:set-llm-proxy-key` 同理。

**建议：** 将这些 handler 改为 `async` 函数或显式返回 `Promise.resolve()`，保持类型一致性。

### 9.3 `ServiceName` 类型安全 ✅ 通过

`ServiceName` 是联合字面量类型 `'openclaw' | 'n8n' | 'mcp' | 'hermes'`，IPC handler 中的参数标注为该类型，TypeScript 编译时会检查。但运行时无验证——如果渲染进程被攻击，可传入任意字符串。

---

## 10. 其他发现

### 10.1 `HERMES_API_SERVER_KEY` 硬编码

**[Critical] Hermes API Server Key 硬编码在源码中**  
**文件：** `electron/main/service-manager.ts` 第 38 行

```typescript
const HERMES_API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY || 'shentong-local-hermes-key'
```

默认值 `'shentong-local-hermes-key'` 硬编码在源码中，打包后会被包含在 asar 内。虽然这是本地服务的密钥，但：
1. 任何人都可以从安装包中提取此密钥
2. 如果本地 Hermes 服务监听在 `127.0.0.1`，同一台机器上的其他进程可以使用此密钥访问 Hermes API
3. 这是一个安全凭证，不应出现在源码中

**建议：**
1. 在构建时通过环境变量注入此密钥
2. 或在首次运行时随机生成并存储在 SafeStorage 中
3. 或评估此密钥的实际安全需求——如果仅用于本地进程间认证，考虑使用随机生成的 token 并通过 IPC 传递

### 10.2 `MCP_BACKEND_URL` 可能泄露 API 地址

**[Minor] MCP 后端 URL 从环境变量派生时未验证**  
**文件：** `electron/main/service-manager.ts` 第 31 行

```typescript
const MCP_BACKEND_URL = process.env.VITE_API_BASE_URL?.replace('/api', '') || 'https://zt.shentongapi.cn'
```

`VITE_API_BASE_URL` 的值会被注入到打包后的代码中（通过 `electron.vite.config.ts` 的 `define`）。如果 `VITE_API_BASE_URL` 包含恶意 URL，`replace('/api', '')` 可能产生非预期结果。  
**评估：** 风险较低，因为 `VITE_API_BASE_URL` 来自构建时环境变量，非运行时用户可控。

### 10.3 `compareVersion` 函数重复实现

**[Minor] 版本比较函数在两个文件中重复实现**  
**文件：**
- `electron/main/index.ts` 第 393-404 行：`compareVersion(a, b)`
- `electron/main/runtime-resolver.ts` 第 101-117 行：`compareSemver(a, b)`

两个函数功能相同但实现不同，维护时可能出现不一致。  
**建议：** 提取到共享工具模块 `electron/shared/utils.ts` 中。

### 10.4 ` ELECTRON_RUN_AS_NODE` 检查 ✅ 良好

**文件：** `electron/main/index.ts` 第 14-27 行

在应用启动最早阶段检测 `ELECTRON_RUN_AS_NODE` 环境变量并给出中文提示退出。这是一个很好的防御性编程实践。

### 10.5 单实例锁 ✅ 良好

```typescript
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
```

- ✅ 防止多实例运行
- ✅ 第二实例启动时激活已有窗口

### 10.6 全局错误处理 ✅ 良好

```typescript
process.on('unhandledRejection', (reason: unknown) => {
  log.error('[unhandledRejection]', reason)
})
process.on('uncaughtException', (err: Error) => {
  log.error('[uncaughtException]', err.stack || err.message)
  if (app.isReady()) {
    dialog.showErrorBox('应用发生严重错误', `${err.message}\n\n日志已记录，应用将退出。`)
  }
  app.exit(1)
})
```

- ✅ 捕获未处理的 Promise 拒绝
- ✅ 捕获未捕获的异常并优雅退出

### 10.7 `localDb` SQL 注入风险评估

**[Critical] 同步队列操作存在潜在 SQL 注入风险**  
**文件：** `electron/main/index.ts` 第 218-232 行

```typescript
ipcMain.handle('syncQueue:enqueue', async (_event, item: SyncQueueItem): Promise<number> => {
  // ...
  const result = await localDb.run(
    `INSERT INTO local_sync_queue (client_txn_id, entity_type, entity_id, operation, payload, status, retry_count)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
    [item.client_txn_id, item.entity_type, item.entity_id, item.operation, JSON.stringify(item.payload)]
  )
```

SQL 语句本身使用了参数化查询（`?` 占位符），这是好的。但 `item.entity_type` 和 `item.operation` 来自渲染进程且未验证是否匹配 `SyncEntityType` 和 `SyncOperation` 联合类型。虽然参数化查询防止了 SQL 注入，但写入任意字符串到数据库可能导致后续查询逻辑异常。

`JSON.stringify(item.payload)` 将任意对象序列化为 JSON 字符串存储——如果 `item.payload` 包含循环引用或超大对象，`JSON.stringify` 可能抛出异常或生成超大字符串。  
**建议：**
1. 验证 `item.entity_type` 和 `item.operation` 是否为合法枚举值
2. 限制 `item.payload` 的大小（如 `JSON.stringify` 后不超过 1MB）
3. 验证 `item.client_txn_id` 格式（如 UUID 或长度限制）

---

## 11. 问题汇总表

| # | 严重级别 | 模块 | 问题描述 | 文件位置 |
|---|----------|------|----------|----------|
| 1 | **Critical** | 安全 | Hermes API Server Key 硬编码在源码中 | `service-manager.ts:38` |
| 2 | **Critical** | IPC 安全 | 同步队列参数未验证枚举值和 payload 大小 | `index.ts:218-232` |
| 3 | **Major** | IPC 安全 | `service:restart` 和 `service:checkEnv` 缺少 sender 验证 | `index.ts:166-169` |
| 4 | **Major** | IPC 安全 | 多个 IPC handler 缺少参数类型/值验证 | `index.ts` 多处 |
| 5 | **Major** | IPC 安全 | `credential:set/get/delete` 无 sender 验证 | `index.ts:297-305` |
| 6 | **Major** | IPC 安全 | `auth:getToken` / `auth:getApiBase` 无 sender 验证 | `index.ts:307-314` |
| 7 | **Major** | 打包配置 | `npmRebuild: false` 禁用原生模块重编译（脆弱 workaround） | `electron-builder.yml` |
| 8 | **Major** | 依赖管理 | 前端库错误放置在 `dependencies` 中 | `package.json` |
| 9 | **Major** | 运行时管理 | `DEFAULT_VERSIONS` 与 `manifest.json` 版本不一致 | `runtime-downloader.ts:31-36` |
| 10 | **Major** | 运行时管理 | `verifyIntegrity` 对本地运行时不实际校验文件哈希 | `runtime-resolver.ts:236-250` |
| 11 | Minor | 安全 | CSP 生产环境 `connect-src` 过于宽松 | `index.ts:73` |
| 12 | Minor | IPC 安全 | `hermes:set-llm-proxy-key` 无 sender 验证 | `index.ts:318-320` |
| 13 | Minor | 进程管理 | `spawnCmd` 引号包裹逻辑不够完善 | `service-manager.ts:405-408` |
| 14 | Minor | 进程管理 | metricsTimer 和 cloudHealthTimer 退出时未显式清理 | `service-manager.ts:160-170` |
| 15 | Minor | 进程管理 | PowerShell 进程采样开销较大 | `service-manager.ts:90-106` |
| 16 | Minor | 文件系统 | 凭据文件权限在 Windows 上效果有限 | `credential-store.ts:33` |
| 17 | Minor | 打包配置 | `runtime/` 目录整体打包到 extraResources | `electron-builder.yml` |
| 18 | Minor | 依赖管理 | 使用 `^` 前缀的版本范围 | `package.json` |
| 19 | Minor | 代码质量 | 版本比较函数重复实现 | `index.ts` / `runtime-resolver.ts` |
| 20 | Minor | 类型安全 | 部分 IPC handler 返回类型与 preload 声明不严格匹配 | `index.ts` 多处 |

---

## 修复优先级建议

### P0 — 立即修复（Critical）
1. **Hermes API Server Key** — 改为运行时生成或环境变量注入
2. **同步队列参数验证** — 添加枚举值校验和 payload 大小限制

### P1 — 尽快修复（Major）
3. 为所有敏感 IPC handler 添加 `sender` 验证
4. 添加 IPC 参数验证框架（验证类型、长度、格式）
5. 同步 `DEFAULT_VERSIONS` 与 `manifest.json`
6. 评估 `npmRebuild: false` 的长期解决方案
7. 将前端库移至 `devDependencies`

### P2 — 计划修复（Minor）
8. 收紧 CSP `connect-src` 白名单
9. 提取重复的版本比较函数
10. 优化 PowerShell 进程采样频率
11. 清理定时器在退出时的处理

---

*报告结束*
