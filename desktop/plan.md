# Implementation Plan: v0.5.2 修复构建

## 前置条件
- 当前工作区版本 0.5.1，electron external 已修复
- `runtime/manifest.json` 已有 hermes 配置（sha256 为空）
- `runtime/hermes/` 目录为空

## Task 1: 移除 Login 演示模式代码
**文件**: `src/pages/Login/index.tsx`
**操作**:
1. 删除第 6 行注释 `// 6. 演示模式：DEMO_TOKEN 直接进入 dashboard`
2. 删除第 20-21 行 `DEMO_TOKEN` 常量定义
3. 删除第 124-136 行 `handleDemoLogin` 函数
4. 删除第 197-207 行 分割线和演示模式按钮 JSX
**验证**: 搜索 `DEMO_TOKEN`、`handleDemoLogin`、`演示模式` 确认 0 匹配

## Task 2: 清理 Login 样式
**文件**: `src/pages/Login/styles.module.css`
**操作**: 删除 `.divider` 和 `.demoBtn` 样式块（如存在）
**验证**: 搜索 `demoBtn`、`divider` 确认已移除

## Task 3: 尝试下载 Hermes 运行时
**操作**:
1. 从 CDN 下载 `hermes-win-x64.tar.gz`
2. 解压到 `runtime/hermes/`
3. 验证入口文件存在
4. 计算 sha256 并回填到 manifest.json
**备用方案**: 如果 CDN 不可达，运行 `scripts/package-hermes-portable.ps1` 本地打包
**验证**: `runtime/hermes/` 目录非空

## Task 4: 更新版本号
**文件**: `package.json`
**操作**: `"version": "0.5.1"` → `"0.5.2"`
**文件**: `electron-builder.yml`
**操作**: 输出目录改为 `dist/installer-v0.5.2`

## Task 5: 构建
**操作**:
1. `npx electron-vite build`
2. 验证 `dist/main/index.js` 无 `getElectronPath`
3. 验证 `dist/renderer/` 中无 `demo-token-shentong`
4. `npx electron-builder --win --x64`
5. 验证安装包 `dist/installer-v0.5.2/win-unpacked/resources/runtime/hermes/` 非空

## 验证清单
- [ ] Login 页面无演示模式按钮
- [ ] dist/renderer 无 DEMO_TOKEN
- [ ] dist/main 无 getElectronPath
- [ ] runtime/hermes 有可执行文件
- [ ] manifest.json hermes sha256 已填入
- [ ] 安装包版本号 0.5.2
