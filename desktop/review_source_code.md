# 源代码重复性审查报告

**项目路径:** `D:\二次开发\desktop`
**审查时间:** 2026-07-29 20:57 (GMT+8)
**审查目标:** 检查项目中是否存在两套重复的源代码

---

## 1. 项目顶层目录结构

```
D:\二次开发\desktop\
├── .cache/              # 构建缓存
├── .git/                # Git 仓库
├── build/               # 构建脚本输出
├── dist/                # 构建产物（main/preload/renderer）
├── docs/                # 文档
├── electron/            # Electron 主进程源码
│   ├── main/            # 主进程（窗口管理、本地DB、服务管理、托盘等）
│   ├── preload/         # 预加载脚本
│   └── shared/          # 主进程与渲染进程共享类型
├── node_modules/        # 依赖
├── public/              # 静态资源（Office 等距素材等）
├── resources/           # 应用资源（图标等）
├── runtime/             # 运行时资源
├── scripts/             # 构建/审计脚本
├── src/                 # ★ 唯一的渲染进程源码目录
│   ├── api/             # API 层（HTTP 客户端 + 各业务接口）
│   ├── assets/          # 前端静态资源
│   ├── components/      # 通用组件
│   ├── pages/           # 页面组件
│   ├── public/          # 前端公共资源（logo.png）
│   ├── router/          # 路由配置
│   ├── services/        # 服务层
│   ├── store/           # Zustand 状态管理
│   ├── styles/          # 全局样式
│   ├── theme/           # Antd 主题
│   ├── types/           # TypeScript 类型定义
│   └── utils/           # 工具函数
├── tests/               # 测试
├── .env / .env.development / .env.production
├── electron.vite.config.ts   # ★ 唯一的构建配置
├── package.json
├── tsconfig.json             # 根 TS 配置（仅含 electron.vite.config.ts）
├── tsconfig.node.json        # Node 端 TS 配置（electron/ 目录）
└── tsconfig.web.json         # 渲染进程 TS 配置（src/ 目录）
```

### 结论：**不存在两个 src 目录**

项目中只有一个 `src/` 目录，位于项目根目录下。`electron/` 目录是 Electron 主进程代码，与 `src/`（渲染进程）是职责分离的正常架构，不是重复。

---

## 2. 重复目录/组件检查

### 2.1 pages 目录

- **只有一个 pages 目录：** `src/pages/`
- 不存在 `src/views/`、`src/screens/` 或其他类似的页面目录
- `src/pages/` 下包含所有业务页面：admin/、Chat/、Dashboard/、Login/、Register/ 等

### 2.2 Login 组件

项目中有 **两个 Login 组件**，但它们是 **不同业务场景的合理设计**，不是重复代码：

| 属性 | `src/pages/Login/index.tsx` | `src/pages/admin/Login/index.tsx` |
|------|----------------------------|----------------------------------|
| **用途** | 用户端登录 | 管理后台登录 |
| **组件名** | `Login` | `AdminLogin` |
| **API 调用** | `POST /auth/login`（httpClient 直接调用） | `POST /admin/auth/login`（通过 admin-auth-api） |
| **认证 Store** | `useAuthStore`（src/store/auth.ts） | `useAdminAuthStore`（src/store/admin-auth.ts） |
| **验证码** | 无 | 有（Canvas 图形验证码） |
| **登录后跳转** | `/dashboard` | `/admin/dashboard` |
| **演示模式** | **有** | 无 |
| **路由路径** | `/login` | `/admin/login` |

**结论：** 两个 Login 组件服务于完全不同的认证体系（用户端 vs 管理端），代码逻辑差异显著，是合理的架构设计，**不是重复代码**。

### 2.3 其他登录相关组件

搜索整个 `src/` 目录，`function Login` / `const Login` / `class Login` 的定义仅出现在 `src/pages/Login/index.tsx` 第 60 行。不存在 `components/Login/` 或其他位置定义的登录组件。

---

## 3. 演示模式（DEMO_TOKEN）代码分析

### 3.1 DEMO_TOKEN 出现位置

全项目范围（排除 node_modules、dist、.git、.cache）搜索结果：

| 文件 | 行号 | 内容 |
|------|------|------|
| `src/pages/Login/index.tsx` | 9 | `// 6. 演示模式：DEMO_TOKEN 直接进入 dashboard` |
| `src/pages/Login/index.tsx` | 21 | `const DEMO_TOKEN = 'demo-token-shentong-ai'` |
| `src/pages/Login/index.tsx` | 135 | `setAuth(DEMO_TOKEN, DEMO_TOKEN, DEMO_TOKEN, demoUser)` |

**DEMO_TOKEN 仅存在于一个文件中：** `src/pages/Login/index.tsx`

### 3.2 "演示模式" 出现位置

| 文件 | 行号 | 内容 |
|------|------|------|
| `src/pages/Login/index.tsx` | 9 | 注释：`演示模式：DEMO_TOKEN 直接进入 dashboard` |
| `src/pages/Login/index.tsx` | 20 | 注释：`演示模式 token（不调用后端 API，直接进入 dashboard）` |
| `src/pages/Login/index.tsx` | 126 | 注释：`演示模式登录` |
| `src/pages/Login/index.tsx` | 130 | 代码：`username: '演示用户'` |
| `src/pages/Login/index.tsx` | 136 | 代码：`message.success('已进入演示模式')` |
| `src/pages/Login/index.tsx` | 205 | JSX：`演示模式体验`（按钮文字） |
| `src/pages/Login/styles.module.css` | 122 | CSS 注释：`演示模式按钮` |
| `src/pages/Office/services/officeBridge.ts` | 多处 | Office 场景的演示序列（与登录演示模式无关） |

### 3.3 demo 关键词出现位置（src/ 目录，区分大小写）

- `src/pages/Login/index.tsx` — DEMO_TOKEN 定义和使用
- `src/pages/Office/scenarios/demo-helpers.ts` — Office 演示辅助函数
- `src/pages/Office/scenarios/MonthlyReportDemo.tsx` — 月报演示场景
- `src/pages/Office/scenarios/SKILLVisitDemo.tsx` — SKILL 访问演示场景
- `src/pages/Office/scenarios/VoiceMeetingDemo.tsx` — 语音会议演示场景
- `src/pages/Office/services/officeBridge.ts` — Office 桥接演示序列

**结论：** demo 相关代码集中在两个独立区域：
1. **登录页演示模式**（`src/pages/Login/`）— 允许用户跳过认证直接体验产品
2. **Office 演示场景**（`src/pages/Office/scenarios/`）— AI 办公室的可视化演示动画

两者完全独立，不存在交叉或重复。

---

## 4. 构建配置分析

### 4.1 electron.vite.config.ts（唯一的构建配置）

```
vite.config.ts  →  不存在 ❌（已确认）
webpack.config.*  →  不存在 ❌（已确认）
```

**`electron.vite.config.ts` 是项目唯一的构建配置文件**，使用 `electron-vite` 框架。

### 4.2 Renderer 入口配置

```typescript
renderer: {
  root: resolve(__dirname, 'src'),           // ← 源码根目录指向 src/
  publicDir: resolve(__dirname, 'public'),   // ← 静态资源指向 public/
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')         // ← 路径别名 @ → src/
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/index.html') }  // ← 入口 HTML
    }
  }
}
```

**结论：** 构建配置明确指向 `src/` 作为唯一渲染进程源码目录。不存在第二个源码目录的构建配置。

### 4.3 Main/Preload 入口配置

- Main 进程入口：`electron/main/index.ts` → 输出到 `dist/main/`
- Preload 入口：`electron/preload/index.ts` → 输出到 `dist/preload/`

---

## 5. TypeScript 配置分析

### 5.1 三个 tsconfig 文件

| 文件 | 用途 | include 范围 | paths 别名 |
|------|------|-------------|-----------|
| `tsconfig.json` | 根配置（仅用于 electron.vite.config.ts） | `electron.vite.config.ts` | 无 |
| `tsconfig.node.json` | Electron 主进程 | `electron/**/*.ts`, `scripts/**/*` | `@shared/* → ./electron/shared/*` |
| `tsconfig.web.json` | 渲染进程（src/） | `src/**/*.ts`, `src/**/*.tsx`, `electron/shared/**/*.ts`, `tests/**/*.ts` | `@/* → ./src/*`, `@shared/* → ./electron/shared/*` |

### 5.2 路径别名一致性

- `@/*` → `./src/*`（tsconfig.web.json 定义，electron.vite.config.ts 的 renderer.resolve.alias 也定义了相同映射）
- `@shared/*` → `./electron/shared/*`（tsconfig.web.json 和 tsconfig.node.json 都定义了）

**结论：** 路径别名配置一致，无冲突。所有配置都指向唯一的 `src/` 目录。

### 5.3 tsconfig.web.json 的 exclude 列表

```json
"exclude": [
  "src/api/sync-api.ts",
  "src/pages/Automation",
  "src/pages/Settings/RemoteControl.tsx",
  "src/pages/Settings/SyncStatus.tsx",
  "src/pages/Team",
  "src/services/office-ws.ts",
  "src/store/__tests__/state-machine.test.ts",
  "src/utils/__tests__/astar.test.ts"
]
```

**注意：** 上述排除的文件/目录在 `src/` 中 **实际不存在**（已通过文件搜索确认）。这些是已删除功能的遗留排除项，不影响构建，但建议清理。

---

## 6. package.json scripts 分析

`package.json` 中没有定义 `scripts` 字段（仅有 dependencies 和基础元数据）。构建命令通过根目录的独立脚本执行：

- `run-evite-build.cjs` — electron-vite 构建脚本
- `run-build-desktop.cjs` — 桌面端打包脚本
- `run-tsc-audit.cjs` — TypeScript 审计脚本
- `run-tsc-desktop.cjs` — TypeScript 编译检查脚本
- `build-v046.bat` — Windows 批处理构建脚本

所有这些脚本都使用 `electron.vite.config.ts` 作为构建配置，不存在配置冲突。

---

## 7. 综合结论

### ❌ 不存在两套重复的源代码

| 检查项 | 结果 |
|--------|------|
| 两个 src 目录 | ❌ 不存在，只有 `src/` |
| 两个 pages 目录 | ❌ 不存在，只有 `src/pages/` |
| 两个 Login 组件 | ⚠️ 存在两个，但用途不同（用户端 vs 管理端），非重复 |
| views/ 目录 | ❌ 不存在 |
| vite.config.ts 与 electron.vite.config.ts 冲突 | ❌ vite.config.ts 不存在 |
| 多个构建配置冲突 | ❌ 仅 electron.vite.config.ts 一个 |
| 路径别名冲突 | ❌ 一致，`@ → src/` |
| DEMO_TOKEN 重复定义 | ❌ 仅在 `src/pages/Login/index.tsx` 一处 |

### 🔍 演示模式（DEMO_TOKEN）风险评估

演示模式代码位于 `src/pages/Login/index.tsx`，功能为：
- 定义硬编码 token `'demo-token-shentong-ai'`
- 创建 `id: 0, username: '演示用户'` 的虚拟用户
- 跳过后端 API 验证，直接写入 auth store 并跳转 dashboard
- UI 上展示"演示模式体验"按钮

**风险提示：**
1. **生产环境风险** — 演示模式按钮在所有环境中可见，没有环境判断（如 `import.meta.env.DEV`），生产环境用户也可使用演示模式绕过认证
2. **Token 硬编码** — DEMO_TOKEN 为明文硬编码，可被轻易伪造
3. **权限风险** — 演示用户 `roles: ['user']` 可访问所有用户端功能，可能暴露付费功能

**建议：** 在生产构建中移除或禁用演示模式按钮，或通过环境变量控制其可见性。

### 🧹 遗留清理建议

`tsconfig.web.json` 的 `exclude` 列表引用了 5 个不存在的文件/目录，建议清理：
- `src/api/sync-api.ts`
- `src/pages/Automation`
- `src/pages/Settings/RemoteControl.tsx`
- `src/pages/Settings/SyncStatus.tsx`
- `src/pages/Team`

---

*报告生成时间: 2026-07-29 20:57 GMT+8*
