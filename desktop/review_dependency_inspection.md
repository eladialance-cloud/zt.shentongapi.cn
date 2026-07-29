# 依赖树与运行时下载脚本审查报告

**项目:** `D:\二次开发\desktop`  
**审查时间:** 2026-07-29 17:30 (GMT+8)  
**审查范围:** `package.json`、`scripts/fetch-runtime.ts`、`node_modules/electron/package.json`、依赖树  
**审查结论:** 发现 **1 处依赖冲突（版本不兼容）**、**1 处依赖缺失**、**1 处 Electron 重复/版本分裂风险**、**运行时下载脚本本身无 Electron 版本污染**。  

---

## 1. Electron 被谁依赖

### 1.1 直接依赖

```text
shentong-ai-desktop@0.4.9 D:\二次开发\desktop
`-- electron@41.7.1
```

`electron` 是项目的 **直接 devDependency**，版本锁定为 `^41.7.1`，实际安装版本为 `41.7.1`。

### 1.2 完整依赖树中的 Electron 相关包

```text
+-- electron-builder@26.15.3
|   +-- @electron/asar@3.4.1
|   +-- @electron/fuses@1.8.0
|   +-- @electron/get@3.1.0
|   +-- @electron/notarize@2.5.0
|   +-- @electron/osx-sign@1.3.3
|   +-- @electron/rebuild@4.2.0
|   +-- @electron/universal@2.0.3
|   +-- UNMET DEPENDENCY electron-builder-squirrel-windows@26.15.3
|   +-- electron-publish@26.15.3
+-- electron-log@5.2.0
+-- electron-updater@6.8.9
+-- electron-vite@5.0.0
|   +-- electron-to-chromium@1.5.387
|   `-- vite@8.1.5 deduped invalid: "^5.0.0 || ^6.0.0 || ^7.0.0" from node_modules/electron-vite
+-- electron@41.7.1
|   +-- @electron/get@2.0.3
+-- vite@8.1.5 invalid: "^5.0.0 || ^6.0.0 || ^7.0.0" from node_modules/electron-vite
```

- **electron@41.7.1** 仅由项目直接依赖，无其他包意外引入。
- **@electron/get 出现两个版本：**
  - `electron-builder@26.15.3` → `@electron/get@3.1.0`
  - `electron@41.7.1` → `@electron/get@2.0.3`
  这是 npm 正常的版本隔离，不构成污染，但说明 Electron 41 与 electron-builder 26 的 `@electron/get` 大版本不同。

---

## 2. 依赖冲突与污染

### 2.1 ⚠️ `vite` 版本与 `electron-vite` 声明不兼容

**证据：**

```text
`-- vite@8.1.5 deduped invalid: "^5.0.0 || ^6.0.0 || ^7.0.0" from node_modules/electron-vite
```

- `electron-vite@5.0.0` 的 peer/依赖声明只接受 `vite@^5 || ^6 || ^7`。
- 项目实际安装了 `vite@8.1.5`（`devDependencies` 中声明为 `^8.1.5`）。
- npm 标记为 **invalid**（语义不满足），但 npm 仍完成了安装（npm 对 invalid 通常不会硬失败）。

**风险：**

- `electron-vite` 可能在 Vite 8 下出现未测试行为，例如配置解析、热更新、插件 API 差异。
- 构建 `npm run build` / `npm run dev` 时可能触发隐性兼容问题。

**建议：**

- 将 `vite` 降级到 `^7.x` 或等待 `electron-vite` 发布支持 Vite 8 的版本。
- 或显式覆盖 `electron-vite` 的 peer dependency（不推荐长期保持）。

### 2.2 ⚠️ `electron-builder-squirrel-windows` 未安装

**证据：**

```text
npm error missing: electron-builder-squirrel-windows@26.15.3, required by app-builder-lib@26.15.3
```

- `electron-builder@26.15.3` 的 `app-builder-lib` 子包可选依赖（或默认依赖）`electron-builder-squirrel-windows@26.15.3` 缺失。
- 这通常不影响非 Squirrel.Windows 目标，但如果打包目标包含 Windows 且使用 Squirrel，构建会失败。

**建议：**

- 若仅使用 `nsis`/`portable` 目标，可忽略；否则执行 `npm install electron-builder-squirrel-windows@26.15.3` 补齐。

### 2.3 ⚠️ Electron 版本较新，builder 组合未经验证

- `electron@41.7.1` 属于较新的主版本（Electron 41）。
- `electron-builder@26.15.3` 理论上支持 Electron 41，但建议查阅 electron-builder release notes 确认。
- 本地 `node_modules/electron/dist/electron.exe` 已存在，说明 Electron 二进制已下载成功。

---

## 3. `scripts/fetch-runtime.ts` 审查

### 3.1 脚本用途

该脚本**并非**下载 Electron 运行时，而是下载以下四个服务的运行时到 `runtime/` 目录：

- `n8n`（v1.62.0）
- `openclaw`（v0.3.0）
- `mcp`（MCP Gateway，v0.2.0）
- `hermes`（Hermes Agent，v0.19.0）

### 3.2 与 Electron 版本的关系

- 脚本中**没有任何读取 `package.json` 中 `electron` 版本的逻辑**。
- 脚本下载的是**服务运行时**（n8n/openclaw/mcp/hermes），与 Electron 的版本完全独立。
- 因此，脚本下载的运行时版本与 `package.json` 的 Electron 版本**没有直接对应关系**，也不存在必须一致的要求。

### 3.3 运行时下载脚本本身的问题

| 项目 | 状态 | 说明 |
|---|---|---|
| 下载失败处理 | ✅ | 失败时打印警告并 `process.exit(0)`，不中断构建 |
| SHA-256 校验 | ✅ | 流式下载后计算 SHA-256 并与 manifest 比对 |
| manifest 写回 | ✅ | 成功后更新 `runtime/manifest.json` |
| 超时控制 | ⚠️ | 总超时 60s，每收到数据重置计时；CDN 未部署时可能全部失败 |
| URL 域名 | ⚠️ | 使用 `https://zt.shentongapi.cn/runtime/...`，当前未部署 |

### 3.4 当前 `runtime/manifest.json` 状态

所有服务的 `sha256` 字段均为空字符串：

```json
{
  "version": "1.0.0",
  "services": {
    "n8n": { "version": "1.62.0", ... },
    "openclaw": { "version": "0.3.0", ... },
    "mcp": { "version": "0.2.0", ... },
    "hermes": { "version": "0.19.0", ... }
  }
}
```

说明打包前运行时下载**尚未成功执行过**，安装包构建后将依赖首次启动时的 `RuntimeDownloader` 在线下载。

---

## 4. `node_modules/electron/package.json` 检查

### 4.1 版本信息

```json
{
  "name": "electron",
  "version": "41.7.1"
}
```

- 与 `package.json` 中 `electron: "^41.7.1"` 一致。

### 4.2 平台与架构

- `node_modules/electron/path.txt` 内容为 `electron.exe`。
- `node_modules/electron/dist/electron.exe` 存在（大小约 223 MB），说明已下载 **Windows x64** 二进制。
- 当前运行环境为 Windows x64，因此安装包为 `win32-x64`。

### 4.3 与打包目标的匹配性

| 脚本 | 目标平台/架构 | Electron 二进制是否匹配 |
|---|---|---|
| `prebuild:win` / `build:win` | win32-x64 | ✅ 本地已存在 win32-x64 二进制 |
| `prebuild:mac` / `build:mac` | darwin-x64 + darwin-arm64 | ⚠️ 当前本地只有 win32-x64，mac 打包时会由 `@electron/get` 重新下载 |

- Electron 的 postinstall 默认只下载当前平台/架构的二进制。
- 如果要在 Windows 上交叉打包 macOS，需要确保 `@electron/get` 能正确下载 darwin 二进制，或配置 `electron-download` 缓存。

---

## 5. 结论

1. **Electron 依赖关系清晰**：`electron@41.7.1` 为项目直接 devDependency，无其他包意外引入 electron。
2. **`fetch-runtime.ts` 不下载 Electron**：它下载的是 n8n/openclaw/mcp/hermes 四个服务运行时，与 Electron 版本无关，因此不存在“运行时下载版本与 Electron 版本不一致”的污染问题。
3. **主要风险是 `vite@8.1.5` 与 `electron-vite@5.0.0` 的 peer 声明不兼容**，被 npm 标记为 `invalid`，可能导致构建或 dev 模式异常。
4. **`electron-builder-squirrel-windows@26.15.3` 缺失**，仅在使用 Squirrel.Windows 目标时构成阻塞。
5. **当前 Electron 二进制为 win32-x64**，与 Windows 打包目标匹配；macOS 交叉打包需要额外下载 darwin 二进制。

---

## 6. 建议修复清单

- [ ] **处理 Vite 版本冲突**：将 `vite` 降级到 `^7.x`，或升级 `electron-vite` 到支持 Vite 8 的版本。
- [ ] **确认 electron-builder 对 Electron 41 的支持**：查阅 `electron-builder@26.15.3` release notes，必要时升级/降级 builder。
- [ ] **补齐 Squirrel 依赖**：若使用 Windows Squirrel 更新通道，安装 `electron-builder-squirrel-windows@26.15.3`。
- [ ] **验证运行时下载**：部署 CDN 或确认首次启动的 `RuntimeDownloader` 能正常下载 n8n/openclaw/mcp/hermes。
- [ ] **多平台打包准备**：在 CI 或打包机中预下载对应平台/架构的 Electron 二进制，避免交叉打包失败。
