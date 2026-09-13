# 环境组件「显示未安装、点击没反应」修复记录（2026-09-13）

## 一、用户现象

设置 → 环境组件：4 项全部显示「未安装」，且页面上没有任何按钮可点（点击毫无反应）。

## 二、根因（两处，均与服务器清理无关）

### 1. 找 Python 的搜索范围不完整（`desktop/electron/main/service-registry/whitelist.ts`）

旧 `resolveBundledPython()` 只扫两个根：

- `<resources>/runtime/<svc>`
- `<cwd>/runtime/<svc>`

且只认一种布局 `<svc>/python/python.exe`。于是：

- 用户在「本地服务管理」自定义的运行时下载目录（`getRuntimeRoot()`，本例 `E:\中台\4工具`）**完全没有被搜索**；
- Hermes 0.20.5 的真实布局识别不了：
  - `node_modules/hermes-agent/runtime/python/cpython-<ver>/python.exe`
  - `node_modules/hermes-agent/runtime/hermes-agent/venv/Scripts/python.exe`

实测该机器上 `E:\中台\4工具\video-claw\python\python.exe`、`...\hermes\...\cpython-3.11-windows-x86_64-none\python.exe`
两个可用的解释器（pip 均可运行）就在那里，程序却一个都看不见。

### 2. 安装包没有打包内置 Python（`desktop/electron-builder.yml`）

`extraResources` 只带了 `runtime/manifest.json`。CI 的「🐍 Download Hermes Python Runtime」步骤
明明在打包前生成了 `desktop/runtime/hermes/python`（194.6MB，Python 3.11.9 + pip + hermes-agent），
但没有任何配置把它放进安装包 → 用户装的 `resources\runtime\` 里只有一个 `manifest.json`。

### 3. 「点击没反应」的直接原因（`desktop/src/pages/Settings/EnvComponents.tsx`）

页面只在 `item.installable === true` 时渲染「安装」按钮：

- `python` 项恒为 `installable: false`（设计上不可一键安装）；
- `flowsDeps` / `playwright` 的 `installable = pythonReady`，python 找不到时为 `false`；
- `vosk` 恒为 `false`。

三项叠加 → 整页 0 个按钮，用户点哪里都没有反馈。

### 4. 连带影响（不只是显示问题）

`flows`（业务流引擎）/ `wx-gateway`（微信域桥）/ `douyin`（抖音服务）都通过
`resolveBundledPython()` 取解释器（`whitelist.ts` 的 spawn 规格 + `flow-executor.ts`），
取不到就回退宿主机 `python` 命令——用户机通常没有，这些自动化会直接启动失败。

## 三、修复内容

| 文件 | 改动 |
| --- | --- |
| `desktop/electron/main/service-registry/whitelist.ts` | 新增 `pythonSearchRoots()`：搜索根 = 随包 `resources/runtime` + 开发态 `cwd/runtime` + `getRuntimeRoot()`（用户自定义下载目录），支持单测注入 `extraRoots`；新增 `pythonCandidatesUnder()`：单服务目录内识别 4 种布局（`python/` → `cpython-<ver>/` → `venv/` → 兜底）；导出 `listBundledPythons()` 供检测端复用 |
| `desktop/electron/main/env-components.ts` | 删除重复的 `bundledPythons()`，改用 `listBundledPythons()`；新增 `pipCapablePython()`（三级兜底，优先真的装了 pip 的解释器）；`findVoskModel()` 改按搜索根枚举 |
| `desktop/src/pages/Settings/EnvComponents.tsx` | 未就绪且不可自动安装的项渲染「如何处理」按钮并给出人工处理说明，杜绝「整页零按钮」 |
| `desktop/electron-builder.yml` | `extraResources` 增加 `runtime/hermes/python` → `resources/runtime/hermes/python` |
| `.github/workflows/desktop-build.yml` | 打包前新增「🐍 Verify bundled Python before packaging」硬校验，并去掉该步骤的 `continue-on-error`；打包后校验 `win-unpacked\resources\runtime\hermes\python\python.exe` 存在 |

### 顺序约定（重要）

Hermes 0.20.5 的 `venv/Scripts/python.exe` 是 **uv 跳板**（内嵌构建机绝对路径，实测 `python -m pip`
直接报错），必须排在真实 cpython 之后 —— 与既有 `edict-bridge.resolveHermesPython()` 的顺序保持一致，
否则会选到一个跑不起来的解释器。

## 四、验证

- `npm run typecheck` 退出码 0。
- `npx jest`：96 套件 / 887 用例全绿（新增 `bundled-python.test.ts` 9 例、`env-components-page.test.tsx` 3 例）。
- `npm run build` 退出码 0。
- `npx electron-builder --win --dir` 退出码 0；产物实测：
  `dist\installer-v2.1.0\win-unpacked\resources\runtime\hermes\python\python.exe` = Python 3.11.9，
  `python -m pip --version` = pip 26.2.1，同目录 `manifest.json` 仍在。
- 真实机器（`E:\中台\4工具`）验证：修复后 `resolveBundledPython()` 选中
  `...\cpython-3.11-windows-x86_64-none\python.exe`（pip 26.2 可运行）；`%LOCALAPPDATA%\ms-playwright` 存在，
  即浏览器自动化内核会显示「已就绪」。

## 五、发布

`desktop/package.json` 由 `2.1.0` 对齐为线上最新 `2.1.1`，CI 自动构建 **2.1.2**（避与线上 2.1.1 版本号冲突）。
安装包体积预计由约 121MB 增至约 310MB（内置 Python 194.6MB，NSIS 压缩后会小一些）。