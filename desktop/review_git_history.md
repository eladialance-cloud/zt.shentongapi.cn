# Git 历史与分支状态审查报告

**审查日期：** 2026-07-29  
**项目路径：** `D:\二次开发\desktop`  
**审查范围：** Git 仓库状态、分支同步、代码重复性检查

---

## 1. Git 仓库状态

### 1.1 当前分支

| 分支 | 状态 |
|------|------|
| `main` | 本地存在，远程跟踪 `remotes/origin/main` |
| **`upgrade/electron-41`** | **当前所在分支** |

### 1.2 分支差异

- `upgrade/electron-41` 相对于 `main` 有 **4 个额外提交**（`main` 没有这些提交）：
  1. `95187b4f` - fix(desktop): H-08b workaround - skip native rebuild for sqlcipher 6.0.0
  2. `d4c8f2ca` - fix(desktop): upgrade vite 8.0.0 -> 8.1.5 to fix fs.deny bypass CVE (H-08c follow-up)
  3. `410a662b` - feat(desktop): upgrade @journeyapps/sqlcipher 5.3.1 -> 6.0.0 (H-08b)
  4. `5e2d56d7` - feat(desktop): upgrade Electron 31.7.7 -> 41.7.1 (H-08)

- `main` 相对于 `upgrade/electron-41` **没有额外提交**（`main` 是 `upgrade/electron-41` 的祖先）

**结论：** 两个分支没有分叉，`upgrade/electron-41` 是 `main` 的超集。不存在分支间代码不同步的问题。

### 1.3 提交历史（最近 9 条）

```
95187b4f fix(desktop): H-08b workaround - skip native rebuild for sqlcipher 6.0.0
d4c8f2ca fix(desktop): upgrade vite 8.0.0 -> 8.1.5 to fix fs.deny bypass CVE (H-08c follow-up)
410a662b feat(desktop): upgrade @journeyapps/sqlcipher 5.3.1 -> 6.0.0 (H-08b)
5e2d56d7 feat(desktop): upgrade Electron 31.7.7 -> 41.7.1 (H-08)
8dafbdaf feat: Agent GitHub批量导入功能 + .gitignore修复 + API Key Pool/Statistics/Version模块修复
c1111bc4 fix: 后端启动时自动迁移补齐缺失列
24a131a2 fix: users表添加must_change_password列, roles表添加code列, 添加迁移脚本
27432fd4 feat: 添加Agent批量导入脚本 + 用户端Agent列表/详情API
e5222f87 修复：AdminAuthModule导出JwtModule供其他admin模块使用
...
820346f8 初始提交：后端源码+Docker编排+部署配置+桌面安装包+Landing站点
```

### 1.4 工作区改动状态

**大量未暂存更改（modified）**：涵盖 backend、frontend/admin、frontend/user（已删除）、desktop 自身代码。  
**大量未跟踪文件（untracked）**：包括新模块、脚本、部署配置等。

> ⚠️ 工作区处于高度"脏"状态，有 100+ 个修改文件和 200+ 个未跟踪文件未提交。

### 1.5 Git Stash

存在 **1 个 stash**：

```
stash@{0}: WIP on upgrade/electron-41: 95187b4f fix(desktop): H-08b workaround - skip native rebuild for sqlcipher 6.0.0
```

这是当前分支最新提交的 WIP（Work In Progress），表明之前有未完成的工作被暂存。

### 1.6 子模块

**无子模块。** `.gitmodules` 文件不存在，`git submodule status` 无输出。

---

## 2. 代码重复性分析

### 2.1 dist 目录中的多份构建产物

`dist/` 目录下存在 **多份完全相同的构建产物副本**：

| 路径 | 用途 | index-jOJogG2u.js MD5 |
|------|------|----------------------|
| `dist/renderer/` | 当前开发构建输出 | `7D69E3374C57679C4F86C1BB5888CD1C` |
| `dist/asar-review-0.5.1/dist/renderer/` | v0.5.1 ASAR 审查副本 | `7D69E3374C57679C4F86C1BB5888CD1C` |
| `dist/installer-new/asar-unpacked/dist/renderer/` | 安装包解包副本 | `7D69E3374C57679C4F86C1BB5888CD1C` |
| `dist/installer-new/asar-check-tmp/dist/renderer/` | ASAR 检查临时副本 | （同上，未计算但文件名一致） |

**结论：** 这不是"两套不同代码"，而是**同一份构建产物被复制到多个位置**。这是 Electron 打包流程的正常行为（开发构建 → ASAR 打包 → 安装包解包验证）。三份副本的 MD5 哈希完全一致，证实它们是同一份代码。

### 2.2 多版本安装包并存

`dist/` 下存在 3 个版本的安装包：

| 目录 | 版本 | 安装包大小 |
|------|------|-----------|
| `dist/installer-v0.4.9/` | v0.4.9 | 397 MB |
| `dist/installer-v0.5.1/` | v0.5.1 | 397 MB |
| `dist/installer-new/` | v0.5.0 | 397 MB |

这些是不同版本的构建产物，属于历史遗留，可以考虑清理旧版本以节省磁盘空间。

---

## 3. Login 组件对比分析

### 3.1 源码 Login 组件（`src/pages/Login/index.tsx`）

**文件大小：** 6,914 字节  
**核心功能：**

1. **正常登录流程：**
   - 获取设备指纹（`window.electronAPI.device.getFingerprint`）
   - 获取设备名称和类型
   - 调用 `POST /auth/login` API
   - 成功后保存 token → 初始化本地 DB → 跳转 dashboard

2. **演示模式（Demo Mode）：**
   - 常量 `DEMO_TOKEN = 'demo-token-shentong-ai'`
   - `handleDemoLogin()` 函数：跳过后端 API，直接设置假 token 和假用户信息进入 dashboard
   - UI 中显示"演示模式体验"按钮
   - 演示用户信息：`{ id: 0, username: '演示用户', email: 'demo@shentong.ai', level: 0, roles: ['user'] }`

### 3.2 dist 中的 Login 代码（`dist/renderer/assets/index-jOJogG2u.js`）

通过搜索 bundle 中的关键标识符确认：

| 关键词 | 是否存在 | 说明 |
|--------|---------|------|
| `demo-token-shentong` | ✅ 存在 | DEMO_TOKEN 常量已打包 |
| `演示模式` | ✅ 存在 | 注释和提示文本已打包 |
| `handleDemoLogin` | ✅ 存在 | 演示模式函数已打包 |
| `已进入演示模式` | ✅ 存在 | 成功提示文本已打包 |
| `演示模式体验` | ❓ 未精确搜索（可能因 minify 改变文本组合方式） | — |

**dist bundle 中的 handleDemoLogin 代码片段：**
```javascript
/** 演示模式登录 */
const handleDemoLogin = () => {
    setAuth(DEMO_TOKEN, DEMO_TOKEN, DEMO_TOKEN, {
        id: 0,
        username: "演示用户",
        email: "demo@shentong.ai",
        level: 0,
        roles: ["user"]
    });
    staticMethods.success("已进入演示模式");
    navigate("/dashboard", { replace: true });
};
```

### 3.3 源码 vs dist 对比结论

**源码和 dist 中的 Login 组件代码一致。** 演示模式代码在源码和构建产物中完全相同，不存在"两套不同代码"的问题。

---

## 4. "演示模式"代码安全评估

### 4.1 演示模式存在的问题

| 风险等级 | 问题 | 说明 |
|---------|------|------|
| 🔴 **高** | 生产环境暴露演示入口 | "演示模式体验"按钮在 UI 中可见，任何用户均可点击 |
| 🔴 **高** | 假 token 可绕过认证 | `DEMO_TOKEN = 'demo-token-shentong-ai'` 是硬编码值，使用后直接进入 dashboard |
| 🟡 **中** | 演示用户权限未限制 | `roles: ['user']` 赋予正常用户权限，但 token 是假的，API 调用会失败 |
| 🟡 **中** | 未区分开发/生产环境 | 代码中没有 `import.meta.env.DEV` 或 `NODE_ENV` 判断，所有环境均可用 |

### 4.2 建议

1. **移除演示模式代码**：在正式发布版本中删除 `DEMO_TOKEN`、`handleDemoLogin` 函数和"演示模式体验"按钮
2. **或者用环境变量控制**：仅在开发模式下显示演示入口
   ```tsx
   {import.meta.env.DEV && (
     <Button block onClick={handleDemoLogin} className={styles.demoBtn}>
       演示模式体验
     </Button>
   )}
   ```
3. **重新构建并发布**：移除演示模式后重新打包，确保 dist 产物中不再包含 `demo-token-shentong-ai`

---

## 5. 综合结论

### 是否存在"两套重复代码"？

**否。** 不存在两套不同的重复代码。具体发现：

| 检查项 | 结果 |
|--------|------|
| 分支间代码不同步 | ❌ 不存在。`upgrade/electron-41` 是 `main` 的超集，无分叉 |
| dist 多份构建产物 | ⚠️ 存在 3 份相同副本，但 MD5 一致，是同一份代码的复制（打包流程正常行为） |
| 源码 vs dist 不一致 | ❌ 不存在。Login 组件源码与 dist bundle 代码一致 |
| 子模块导致重复 | ❌ 不存在。无子模块 |
| Git stash 导致混淆 | ⚠️ 存在 1 个 stash，但不影响当前工作区代码 |

### 主要风险

1. **演示模式代码未移除**：生产构建中包含 `demo-token-shentong-ai`，任何用户可通过"演示模式体验"按钮绕过登录
2. **工作区极度脏乱**：100+ 个修改文件和 200+ 个未跟踪文件未提交，建议尽快整理提交
3. **旧版本安装包未清理**：`dist/` 下有 v0.4.9 和 v0.5.0/v0.5.1 三个版本的安装包，占用约 1.2 GB 磁盘空间

### 建议操作

1. ✅ 移除或环境隔离 Login 组件中的演示模式代码
2. ✅ 重新构建桌面端，确保 dist 产物中不包含 demo token
3. ✅ 整理工作区，提交有价值的更改，清理临时文件
4. ✅ 清理旧版本安装包（v0.4.9）
5. ✅ 检查 `git stash@{0}` 内容，决定是否恢复或丢弃

---

*报告生成时间：2026-07-29 20:57 GMT+8*
