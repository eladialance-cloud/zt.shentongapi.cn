# ASAR 打包产物勘查报告

## 1. 勘查目标
- 项目目录：`D:\二次开发\desktop`
- 打包产物：`dist/installer-new/ShenTongAI-Setup-0.5.0-x64.exe`（397,227,518 字节）
- 任务：确认 asar 内是否包含 `node_modules/electron`，并分析原因。

## 2. 关键发现

### 2.1 asar 中**不存在** `node_modules/electron`
通过以下命令验证：

```powershell
& "D:\二次开发\desktop\node_modules\.bin\asar.cmd" list "D:\二次开发\desktop\dist\installer-new\nsis-extract\resources\app.asar"
```

- asar 顶层 `node_modules` 共有 129 个直接子包（见 `asar-top-modules.txt`）。
- 搜索 `\node_modules\electron($|\\)` **无匹配**。
- asar 中所有含 "electron" 字样的条目仅来自运行时依赖 `electron-log` 与 `electron-updater`，没有 Electron 框架本身。

命令输出证据：

```text
Lines in asar list: 16889
```

```text
\node_modules\electron-log
\node_modules\electron-log\LICENSE
\node_modules\electron-log\main.js
...
\node_modules\electron-updater
...
```

### 2.2 asar 内容结构
从 NSIS 安装包中提取的 `resources/app.asar` 大小为 **91,751,209 字节（约 87.5 MB）**，解包后分布：

| 目录/文件 | 大小 |
|---|---|
| dist | 9.83 MB |
| node_modules | 73.83 MB |
| package.json | 0.23 MB |

最大的几个生产依赖包：

| 包名 | 大小 |
|---|---|
| pixi.js | 18.25 MB |
| antd | 17.64 MB |
| @ant-design | 11.05 MB |
| lucide-react | 7.11 MB |
| react-dom | 4.30 MB |

### 2.3 `node_modules/electron` 不在 asar 中的原因
1. **package.json 正确分类**：`electron` 位于 `devDependencies`（`^41.7.1`），所有生产依赖位于 `dependencies`。

```json
// package.json 节选
"dependencies": {
  "@ant-design/icons": "^5.5.1",
  "@journeyapps/sqlcipher": "^6.0.0",
  "antd": "^5.21.6",
  "axios": "^1.7.7",
  "electron-log": "^5.2.0",
  "electron-updater": "^6.3.9",
  ...
},
"devDependencies": {
  "electron": "^41.7.1",
  ...
}
```

2. **electron-builder 默认排除 devDependencies**：builder-effective-config / builder-debug 中可见默认模式 `'!**/node_modules/**'`，electron-builder 仅打包 `dependencies` 中声明的模块。

```yaml
# builder-debug.yml 节选
firstOrDefaultFilePatterns:
  - '!**/node_modules/**'
  - '!electron/**'
  - '!**/electron-builder.{yaml,yml,json,json5,toml,ts}'
  ...
nodeModuleFilePatterns:
  - '**/*'
  - dist/main/**/*
  - dist/preload/**/*
  - dist/renderer/**/*
  - package.json
  - '!**/*.{ts,tsx,map}'
  - '!src/**'
  - '!electron/**'
  - '!*.config.*'
```

3. **package-lock.json 验证**：没有任何非根包把 `electron` 声明为 `dependencies`；仅 `node_modules/electron` 自身以及 `@journeyapps/sqlcipher` 的 `devDependencies` 引用了它。

```text
Packages declaring electron as dependency (not devDependency): 0
None found.
```

### 2.4 注意点：`@journeyapps/sqlcipher` 的 `devDependencies.electron`
该原生模块的 `package.json` 中 `devDependencies` 包含：

```json
"devDependencies": {
  "electron": "^41.1.0",
  ...
}
```

但因为 electron-builder 不打包 `devDependencies`，且 sqlcipher 本身通过 `asarUnpack` 机制被放到 `app.asar.unpacked\node_modules\@journeyapps\sqlcipher`，其源码中的 devDependencies 不影响最终 asar 内容。

## 3. 结论
- **asar 内未包含 `node_modules/electron`**。
- Electron 框架本身以独立二进制（`electron.exe`）形式存在于 `win-unpacked` 根目录，而不是作为 npm 包被打进 asar。
- 当前打包配置（`files` + 依赖分类）是正确的，`electron` 作为 devDependency 不会被错误打包进 asar。

## 4. 修复建议
当前未发现需要修复的问题。如需进一步瘦身，可考虑：
1. **按需引入 antd 组件**：当前 antd + @ant-design 合计约 28.7 MB，使用 babel-plugin-import 或替换为按需子包可减少体积。
2. **裁剪 pixi.js/lucide-react**：确认是否全部功能都在使用；lucide-react 可改用 tree-shake 后的单个图标导入。
3. **审查 `files` 配置**：当前 `files` 只包含 `dist/main`、`dist/preload`、`dist/renderer` 与 `package.json`，已较精简，可保持。
4. **启用 `asar: true`**：已启用，正确；继续保留。

---
*勘查时间：2026-07-29 17:30+08:00*  
*工具：7za、npx asar、PowerShell、grep*
