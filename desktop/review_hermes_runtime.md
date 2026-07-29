# Hermes 运行时完整链路审查报告

**审查日期**: 2026-07-29  
**审查项目**: `D:\二次开发\desktop`  
**审查范围**: Hermes Agent 运行时从配置 → 下载 → 打包 → 安装包 → 运行时解析的全链路完整性  

---

## 一、审查摘要

| 检查项 | 状态 | 严重程度 |
|--------|------|----------|
| 1. manifest.json 配置 | ✅ 已配置 | — |
| 2. runtime/hermes/ 目录内容 | ⚠️ 空目录 | **严重** |
| 3. fetch-runtime.ts 下载逻辑 | ✅ 已包含 hermes | — |
| 4. pack-runtime.ts 打包逻辑 | ✅ 已包含 hermes | — |
| 5. 项目中 hermes 相关文件 | ✅ 引用完整 | — |
| 6. electron-builder.yml extraResources | ✅ 全量打包 runtime/ | — |
| 7. Git 历史 | ⚠️ hermes 为未提交变更 | **中等** |
| 8. .gitignore 排除规则 | ⚠️ 排除 runtime/*/ 但无 .gitkeep | **严重** |
| 9. 其他脚本覆盖风险 | ✅ 无恶意覆盖 | — |
| 10. dist/ 安装包中 hermes | ❌ **缺失** | **致命** |

---

## 二、逐项详细审查

### 1. runtime/manifest.json 中 hermes 的配置

**状态**: ✅ 正确配置

当前工作副本的 `runtime/manifest.json` 已包含完整的 hermes 配置：

```json
"hermes": {
  "version": "0.19.0",
  "displayName": "Hermes Agent",
  "port": 8642,
  "entry": {
    "win32": "hermes.exe",
    "darwin": "hermes",
    "linux": "hermes"
  },
  "downloadUrl": {
    "win32-x64": "https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-win-x64.tar.gz",
    "darwin-x64": "https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-mac-x64.tar.gz",
    "darwin-arm64": "https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-mac-arm64.tar.gz",
    "linux-x64": "https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-linux-x64.tar.gz"
  },
  "sha256": {
    "win32-x64": "",
    "darwin-x64": "",
    "darwin-arm64": "",
    "linux-x64": ""
  }
}
```

**问题**: 所有平台的 `sha256` 均为空字符串，意味着：
- 构建时 `fetch-runtime.ts` 下载失败（CDN 不可达），未回填哈希值
- 运行时 `runtime-downloader.ts` 的 SHA-256 校验会被跳过（`expectedSha256` 为空时 `verifySha256` 返回 `true`）
- 安装后首次启动需要在线下载 hermes 运行时

**注意**: Git HEAD 版本（已提交版本）的 manifest.json **不包含 hermes 服务**，仅有 n8n、openclaw、mcp 三个服务。hermes 配置是当前未提交的工作区变更（`git diff HEAD` 显示新增）。同时，已提交版本使用的 CDN 域名是 `cdn.shentong.ai`，而工作区变更新增的 hermes 使用 `zt.shentongapi.cn`。

---

### 2. runtime/hermes/ 目录内容

**状态**: ⚠️ 空目录（**严重问题**）

```
runtime/
├── hermes/        ← 空目录，无任何文件，无 .gitkeep
├── mcp/           ← 有内容
├── mcp-gateway/   ← 有内容
├── n8n/           ← 有内容
├── openclaw/      ← 有内容
└── manifest.json
```

`runtime/hermes/` 目录存在但完全为空，没有任何文件（无 `.gitkeep`、无可执行文件、无 `node_modules`）。

**影响**:
- `electron-builder` 的 `extraResources` 配置 `from: runtime/` 会将此空目录打包进安装包
- 安装包中 `resources/runtime/hermes/` 将不存在或为空目录
- 应用启动时 `runtime-resolver.ts` 的 `resolve('hermes')` 在 builtin 路径找不到入口文件 `hermes.exe`
- 回退到 userData 路径 → 也不存在
- 最终回退到 host 命令 `where hermes` → 主机未安装则失败

---

### 3. scripts/fetch-runtime.ts 中 hermes 的下载逻辑

**状态**: ✅ 已正确包含 hermes

关键代码分析：

```typescript
// 类型定义包含 hermes
interface RuntimeManifest {
  services: Record<'n8n' | 'openclaw' | 'mcp' | 'hermes', ServiceEntry>;
}

// SERVICE_KEYS 数组包含 hermes
const SERVICE_KEYS = ['n8n', 'openclaw', 'mcp', 'hermes'] as const;
```

下载流程：
1. 读取 `manifest.json`
2. 遍历所有平台 × 所有服务（包括 hermes）
3. 从 `downloadUrl` 下载 `tar.gz`
4. 计算 SHA-256 并校验
5. 解压到 `runtime/<serviceKey>/` 目录
6. 回写 manifest.json 的 sha256 值
7. 下载失败时不中断构建，保留空 sha256，回退到运行时按需下载

**问题**: 当前 `runtime/hermes/` 为空，说明 `fetch-runtime.ts` 执行时 hermes 下载失败（CDN 地址 `https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-win-x64.tar.gz` 不可达），脚本按设计跳过并继续。

---

### 4. scripts/pack-runtime.ts 的打包逻辑

**状态**: ✅ 已正确包含 hermes

```typescript
const NPM_PACKAGES: Record<string, string> = {
  openclaw: 'openclaw',
  n8n: 'n8n',
  mcp: 'mcp-gateway',
  hermes: 'hermes-agent',  // ← hermes 映射到 npm 包 hermes-agent
};
```

打包脚本通过 `npm install hermes-agent@0.19.0` 安装并打包为 `tar.gz`，输出到 `../cdn/hermes/0.19.0/hermes-win-x64.tar.gz`。

此脚本用于生成 CDN 包，而非构建安装包时使用。构建安装包使用的是 `fetch-runtime.ts`（从 CDN 下载）。

另有独立的 `scripts/package-hermes-portable.ps1` 脚本，功能更完整：
- 下载 Node.js 运行时
- `npm install hermes-agent@0.19.0`（不使用 `--ignore-scripts`，以编译原生模块）
- 生成 `hermes.exe.cmd`（Windows）和 `hermes`（Unix）包装脚本
- 打包为 `tar.gz` 并计算 SHA-256

---

### 5. 项目中所有 hermes 相关文件和配置

**状态**: ✅ 引用完整

发现的 hermes 引用分布：

#### Electron 主进程
| 文件 | 用途 |
|------|------|
| `electron/main/service-manager.ts` | 服务管理器：启动/停止 hermes，环境变量注入（HERMES_API_SERVER_KEY → CUSTOM_API_KEY） |
| `electron/main/runtime-downloader.ts` | 在线下载器：CDN 下载失败时 npm fallback 安装 `hermes-agent` |
| `electron/main/runtime-resolver.ts` | 路径解析器：builtin → userData → host 命令回退链 |
| `electron/main/remote-control.ts` | 远程控制：引用 Hermes API 做意图识别（TODO，尚未实现） |
| `electron/shared/types.ts` | 类型定义：`ServiceName = 'openclaw' | 'n8n' | 'mcp' | 'hermes'` |

#### 构建脚本
| 文件 | 用途 |
|------|------|
| `scripts/fetch-runtime.ts` | 构建时从 CDN 下载 hermes 运行时 |
| `scripts/pack-runtime.ts` | 将 hermes-agent npm 包打包为 CDN 分发格式 |
| `scripts/package-hermes-portable.ps1` | 独立的 hermes 便携包打包脚本 |

#### 前端
| 文件 | 用途 |
|------|------|
| `src/api/hermes-api.ts` | 前端 Hermes API 调用 |
| `src/pages/Hermes/InstanceList.tsx` | Hermes 实例列表页面 |

#### 运行时配置
| 文件 | 用途 |
|------|------|
| `runtime/manifest.json` | 服务清单（含 hermes 配置） |

---

### 6. electron-builder.yml 中 extraResources 配置

**状态**: ✅ 配置正确（但源目录为空导致实际打包结果缺失 hermes）

```yaml
extraResources:
  - from: resources/
    to: resources/
  - from: runtime/
    to: runtime/
    filter: ["**/*", "!**/.gitkeep"]
```

`extraResources` 配置将整个 `runtime/` 目录复制到安装包的 `resources/runtime/` 目录。配置本身正确，但由于 `runtime/hermes/` 为空目录，实际打包结果中 hermes 内容缺失。

**filter** 排除了 `.gitkeep` 文件，这意味着即使有 `.gitkeep` 也不会被打包（这是正确的行为，.gitkeep 仅用于 Git 占位）。

---

### 7. Git 历史中 hermes 相关提交记录

**状态**: ⚠️ hermes 为未提交的工作区变更

```
git log --oneline --all -- "*hermes*"
c9692fe6 WIP on upgrade/electron-41: 95187b4f fix(desktop): H-08b workaround...
820346f8 初始提交：后端源码+Docker编排+部署配置+桌面安装包+Landing站点
```

Git 历史中仅有两条记录涉及 hermes 文件名匹配，但均为 stash/WIP 提交。

**关键发现**:
- **Git HEAD 版本的 `runtime/manifest.json` 不包含 hermes 服务**（仅有 n8n、openclaw、mcp）
- hermes 配置是在当前工作区中新增的，尚未提交
- `git diff HEAD -- runtime/manifest.json` 显示新增了完整的 hermes 配置块
- CDN 域名也从 `cdn.shentong.ai`（已提交版本）变更为 `zt.shentongapi.cn`（工作区版本）

---

### 8. .gitignore 排除规则

**状态**: ⚠️ 存在结构性问题

当前工作区 `.gitignore`：
```
# Runtime binaries (large files, downloaded at build time)
runtime/*/
!runtime/*/.gitkeep
!runtime/manifest.json
```

此规则：
- **排除** `runtime/` 下的所有子目录（`runtime/hermes/`, `runtime/n8n/` 等）
- **例外** 保留各子目录中的 `.gitkeep` 文件
- **例外** 保留 `runtime/manifest.json`

**问题**:
1. `runtime/hermes/` 目录中**没有 `.gitkeep` 文件**，因此 Git 完全不跟踪此目录
2. `git ls-files runtime/hermes/` 返回空 — Git 中不存在此目录的任何追踪记录
3. 如果从 Git 克隆项目，`runtime/hermes/` 目录不会被创建（Git 不跟踪空目录）
4. 其他服务目录（n8n, openclaw, mcp）也面临同样问题，除非它们有 `.gitkeep`

**对比 Git HEAD 版本的 .gitignore**:
```
# 旧版 .gitignore（已提交）不包含 runtime/*/ 排除规则
```
这说明 `runtime/*/` 排除规则是新增的，与 hermes 配置一同作为未提交变更引入。

---

### 9. 其他脚本或配置文件可能删除或覆盖 hermes 运行时

**状态**: ✅ 未发现恶意覆盖

检查了以下文件：
- `scripts/build-installer.ps1` — 调用 `fetch-runtime.ts` 下载运行时，不会删除已有文件
- `scripts/fetch-runtime.ts` — 下载失败时仅跳过，不删除已有内容；下载成功时解压覆盖目标目录
- `scripts/pack-runtime.ts` — 输出到 `../cdn/` 目录，不触碰 `runtime/`
- `scripts/package-hermes-portable.ps1` — 独立打包脚本，输出到 CDN 目录
- `electron/main/runtime-downloader.ts` — 运行时下载器，下载成功后**先清空再解压**：`fs.rmSync(destDir, { recursive: true, force: true })`，这是标准行为

**潜在风险**: `runtime-downloader.ts` 在下载成功后会递归删除 `userData/runtime/hermes/` 目录再解压。如果下载的 `tar.gz` 损坏或内容不完整，可能导致已有运行时被删除但新版本不完整。但有 SHA-256 校验作为前置保护（如果 sha256 不为空）。

---

### 10. dist/ 目录下安装包中 hermes 的存在情况

**状态**: ❌ **缺失（致命问题）**

#### dist/installer-v0.5.1/win-unpacked/resources/runtime/
```
resources/runtime/
├── mcp/           ← 存在
├── n8n/           ← 存在
├── openclaw/      ← 存在
├── manifest.json  ← 存在（包含 hermes 配置）
└── ❌ hermes/     ← 缺失！
```

安装包中的 `manifest.json` 已包含 hermes 配置（版本 0.19.0、端口 8642、下载地址等），但 `hermes/` 目录及其可执行文件**完全缺失**。

**影响**:
1. 安装后启动应用，`runtime-resolver.ts` 解析 `hermes` 服务：
   - builtin 路径 `resources/runtime/hermes/hermes.exe` → **不存在**
   - userData 路径 → **不存在**（首次安装未下载）
   - host 命令 `where hermes` → **不存在**（用户主机未安装 hermes-agent）
   - 结果：`resolve('hermes')` 返回 `null`，服务无法启动

2. `service-manager.ts` 中启动依赖链：
   ```
   K2 修复：四个服务存在启动依赖链
   MCP 依赖 OpenClaw 端口就绪，Hermes 依赖 MCP 端口就绪
   await this.start('hermes')  // ← 将失败
   ```

3. `verifyAll()` 返回 `{ hermes: false }`，前端状态面板将显示 Hermes 服务异常。

4. 运行时下载器 `runtime-downloader.ts` 可作为补救：
   - 应用启动后检测到 hermes 缺失，触发在线下载
   - 从 `https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-win-x64.tar.gz` 下载
   - **但如果 CDN 地址不可达，下载失败**
   - npm fallback：`npm install -g hermes-agent`（需要用户主机有 npm）
   - 如果 npm fallback 也失败，hermes 服务完全不可用

---

## 三、根因分析

Hermes 运行时在安装包中缺失的根因链路：

```
根因：CDN 地址不可达
  ↓
fetch-runtime.ts 下载 hermes tar.gz 失败
  ↓
runtime/hermes/ 目录保持为空（无 .gitkeep、无可执行文件）
  ↓
.gitignore 排除 runtime/*/，Git 不跟踪空目录
  ↓
electron-builder 打包时 runtime/hermes/ 为空，安装包中缺失
  ↓
manifest.json 已包含 hermes 配置，但无可执行文件
  ↓
安装后应用启动 hermes 服务失败
  ↓
依赖链断裂：Hermes 依赖 MCP，Hermes 不可用影响完整功能
```

---

## 四、修复建议

### 优先级 P0 — 立即修复

1. **打包 hermes 运行时到 runtime/hermes/**
   - 运行 `scripts/package-hermes-portable.ps1` 生成 `hermes-win-x64.tar.gz`
   - 或直接运行 `npx tsx scripts/fetch-runtime.ts --win`（需 CDN 可达）
   - 验证 `runtime/hermes/hermes.exe.cmd` 文件存在

2. **在 runtime/hermes/ 添加 .gitkeep**
   ```powershell
   New-Item -Path "runtime/hermes/.gitkeep" -ItemType File -Force
   ```
   确保 Git 跟踪此目录，克隆项目后目录存在。

3. **提交 hermes 相关变更到 Git**
   - manifest.json 中 hermes 配置
   - .gitignore 中 runtime/*/ 排除规则
   - runtime/hermes/.gitkeep
   - 所有引用 hermes 的源码文件

### 优先级 P1 — 短期改进

4. **fetch-runtime.ts 增加目录完整性校验**
   下载后验证 `runtime/hermes/` 目录非空，如果为空则发出明确错误而非静默跳过。

5. **build-installer.ps1 增加预打包检查**
   在调用 `electron-builder` 前验证 `runtime/hermes/` 目录包含入口文件，缺失则中断构建。

6. **manifest.json 中 sha256 填充**
   成功下载并打包后，将 SHA-256 哈希值回填到 manifest.json，启用运行时完整性校验。

### 优先级 P2 — 长期优化

7. **统一 CDN 域名**
   已提交版本使用 `cdn.shentong.ai`，工作区新增的 hermes 使用 `zt.shentongapi.cn`，应统一。

8. **runtime-downloader.ts 的 npm fallback 优化**
   当前 npm fallback 使用 `npm install -g`，在用户无 npm 环境时无效。考虑内置 node 运行时。

9. **服务启动依赖链容错**
   `service-manager.ts` 中 hermes 启动失败应更优雅地降级，而非阻塞依赖链。

---

## 五、结论

Hermes 运行时的配置链路（manifest → fetch-runtime → pack-runtime → electron-builder → resolver → service-manager）在代码层面**完整且正确**，但由于 **CDN 不可达导致下载失败** + **.gitignore 排除规则导致目录不被跟踪** + **缺少 .gitkeep 占位** 三个因素叠加，最终安装包中 hermes 运行时**完全缺失**。

这是一个**构建流程问题**而非代码逻辑问题——代码正确地处理了下载失败的情况（静默跳过 + 运行时按需下载回退），但安装包用户体验会严重受损：首次启动需要在线下载 hermes，如果 CDN 不可达或用户网络受限，hermes 服务将不可用。

**建议在发布前务必确保 `runtime/hermes/` 目录包含有效的可执行文件，并通过 `electron-builder` 打包验证。**
