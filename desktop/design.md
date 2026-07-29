# Design: 桌面端 v0.5.2 修复构建

## 问题描述

当前工作区 (v0.5.1) 存在两个问题：
1. **Login 页面包含演示模式** — `DEMO_TOKEN` 硬编码 + "演示模式体验"按钮在生产环境中可见，安全风险
2. **Hermes 运行时缺失** — `runtime/hermes/` 目录为空，manifest.json 已配置但 sha256 为空，CDN 下载失败导致安装包中无 hermes

## 方案探索

### 方案 A：最小修复（仅改当前工作区）
- 直接编辑 `Login/index.tsx` 删除演示模式代码
- 尝试下载 hermes 运行时到 `runtime/hermes/`
- 用当前工作区重新构建 v0.5.2

**优点**：最快、风险最低
**缺点**：stash 中的 301 个文件改动仍然悬而未决

### 方案 B：从 stash 恢复 Login + 修复 hermes
- 从 stash 恢复 Login/index.tsx 和 Login/styles.module.css
- 下载 hermes 运行时
- 重新构建

**优点**：Login 组件恢复为用户设计的新版（记住密码功能）
**缺点**：stash 中 Login 是旧版本，当前工作区可能已有其他改动

### 方案 C：完整 stash 恢复
- 解决 105 个文件冲突
- 全面恢复 stash 中的改动

**优点**：一次性解决所有问题
**缺点**：冲突解决工作量巨大、风险高

## 推荐方案：A（最小修复）

理由：
1. 当前工作区已经是最新版本（比 stash 更新），不应回退
2. Login 演示模式只需要删除几行代码
3. Hermes 运行时需要从 CDN 下载或手动准备
4. stash 的处理是独立问题，不应阻塞当前修复

## 修改清单

### Task 1: 移除 Login 演示模式
- 文件：`src/pages/Login/index.tsx`
- 删除：`DEMO_TOKEN` 常量、`handleDemoLogin` 函数、演示模式按钮 JSX、分割线
- 文件：`src/pages/Login/styles.module.css`
- 删除：`.demoBtn` 和 `.divider` 样式（如存在）

### Task 2: 下载 Hermes 运行时
- 从 `https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-win-x64.tar.gz` 下载
- 解压到 `runtime/hermes/`
- 验证 `hermes.exe.cmd` 或入口文件存在
- 回填 sha256 到 `runtime/manifest.json`

### Task 3: 更新版本号
- `package.json` version: 0.5.1 → 0.5.2
- `electron-builder.yml` 输出目录（如需要）

### Task 4: 重新构建
- `electron-vite build` → 生成 dist/main、dist/renderer
- `electron-builder --win` → 生成安装包
- 验证安装包中无 `getElectronPath`、无演示模式、hermes 存在

## 风险

- CDN 可能不可达（hermes 下载失败）→ 需要备用方案
- 构建环境可能缺少依赖 → 需要 `npm install` 先
- 当前工作区 249 个 untracked 文件可能干扰构建 → 需要清理或忽略
