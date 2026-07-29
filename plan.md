# 深瞳AI v1.0 UI 重设计 — 实施计划

> **基准文档：** [design.md](./design.md)  
> **日期：** 2026-07-25  
> **方法：** Superpowers 阶段 3 — 原子任务 (2-5 min each)  
> **总预估：** ~110 分钟，4 阶段

---

## 阶段概览

```
🔴 阶段1 Token层 (15min)    → 设计变量固化
🟡 阶段2 壳层 (45min)        → MainLayout 重写
🟢 阶段3 登录页 (20min)      → 三个登录页CSS重写
🔵 阶段4 Landing页 (30min)   → 数据提取 + CSS大重写
```

---

## 🔴 阶段 1：Token 层（必须最先做）

> 目标：全局 CSS 变量 + Ant Design 主题映射切换到 v1.0 暗色色系

### Task 1.1 — 重写 design-tokens.css
**文件：** `desktop/src/styles/design-tokens.css`  
**操作：** 全量重写  
**内容：**
1. `:root` 块替换为 v1.0 暗色变量（见 design.md §1.2-1.7）
2. 删除 `[data-theme="dark"]` 块（暗色变默认）
3. 新增变量：
   - `--color-brand` / `--color-brand-hover` / `--color-brand-active` / `--color-brand-light`
   - `--color-bg-root` / `--color-bg-overlay` / `--color-bg-hover`
   - `--color-scrollbar-thumb` / `--color-scrollbar-track`
   - `--font-family-mono` / `--font-size-*` / `--font-weight-*`
   - `--space-*`（4px 基准梯度）
   - `--radius-*`（sm/md/lg/xl）
   - `--shadow-glow-brand`
   - `--duration-*` / `--ease-out` / `--ease-in-out`
4. **保留不变：**
   - `--color-ai-business/content/delivery/finance/service/default` 及 `*-light` 变体
   - `--color-success/warning/error/info/purple` 语义（值更新为暗色版）
**验证：** 打开 `design-tokens.css`，确认所有新变量可读、`--color-ai-*` 6 个系列未被删除  
**时间：** 5 min  
**依赖：** 无

### Task 1.2 — 更新 global.css
**文件：** `desktop/src/styles/global.css`  
**操作：** 编辑  
**内容：**
1. 注释从 `v0.3.1 浅色主题` 改为 `v1.0 暗色主题`
2. `body { background }` 从 `var(--color-bg-layout)` 改为 `var(--color-bg-base)`
3. `body { color }` 从 `var(--color-text-primary)` 保持（值由 CSS 变量自动更新）
4. `::selection { background }` 从 `var(--color-primary-light)` 改为 `var(--color-brand-light)`
5. 滚动条颜色从 `var(--color-border)` 改为 `var(--color-scrollbar-thumb)`
**验证：** 文件保存，语法无错误  
**时间：** 3 min  
**依赖：** Task 1.1

### Task 1.3 — 重写 antd-theme.ts
**文件：** `desktop/src/theme/antd-theme.ts`  
**操作：** 全量重写  
**内容：** 使用 design.md §1.8 的完整 Ant Design ThemeConfig 对象  
**核心映射表：**

| Token | 值 |
|-------|-----|
| colorPrimary | `#4F6EF7` |
| colorSuccess | `#34D399` |
| colorWarning | `#FBBF24` |
| colorError | `#F87171` |
| colorInfo | `#60A5FA` |
| colorTextBase | `#E6EDF3` |
| colorBgBase | `#161B22` |
| colorBgContainer | `#1C2333` |
| colorBgElevated | `#21283A` |
| colorBorder | `#30363D` |
| fontFamily | Inter/PingFang SC/Microsoft YaHei |
| fontSize | 13 |
| borderRadius | 6 |

**验证：** TypeScript 编译通过，无类型错误  
**时间：** 5 min  
**依赖：** 无（与 1.1/1.2 并行）

### Task 1.4 — 添加 lucide-react 依赖
**文件：** `desktop/package.json`  
**操作：** 执行 `npm install lucide-react`  
**原因：** IconDock 使用 lucide-react 图标替代 emoji  
**验证：** `node_modules/lucide-react` 存在，`npm ls lucide-react` 输出版本  
**时间：** 2 min  
**依赖：** 无（可与其他并行）

### 🔴 阶段1检查点
- [ ] `npm run dev` 启动无白屏
- [ ] Ant Design Modal/Button/Card 呈暗色
- [ ] 控制台无 CSS 变量未定义警告
- [ ] AI 员工色系 (`--color-ai-business` 等) 仍可读

---

## 🟡 阶段 2：壳层（核心体验）

> 目标：MainLayout 改为 48px TopBar + 48px IconDock + 28px StatusBar，删除 TopTabs

### Task 2.1 — 新建 IconDock 组件
**文件：** `desktop/src/components/IconDock/index.tsx`  
**操作：** 新建  
**内容：**
```typescript
// 7 个图标 + Tooltip + 激活态高亮 + 路径映射
// 使用 lucide-react: Building2, MessageSquare, Workflow, BookOpen, 
//   Bot, Users, Settings
// 对齐现有路由:
//   office→/office, chat→/chat, hermes→/hermes, knowledge→/knowledge,
//   agents→/agent-market, team→/team, settings→/settings
```
**关键逻辑：**
- `useLocation()` 判断当前路由激活态
- 激活态：`background: var(--color-brand-light)` + 左侧 `2px solid var(--color-brand)` 指示条
- Tooltip: `placement="right"` 显示名称 + 快捷键
- 支持 Ctrl+1~7 快捷键导航

**验证：** 组件导出可被 import  
**时间：** 5 min  
**依赖：** Task 1.4

### Task 2.2 — 新建 IconDock CSS
**文件：** `desktop/src/components/IconDock/styles.module.css`  
**操作：** 新建  
**内容：**
- `.dock`: 48px 宽, 100% 高, flex column, `background: var(--color-bg-root)`
- `.dockItem`: 36×36px, center, `border-radius: 6px`, cursor pointer
- `.dockItemActive`: `background: var(--color-brand-light)`, 左侧 2px 指示条
- `.dockItem:hover`: `background: var(--color-bg-hover)`
- 右侧 `1px solid var(--color-border)` 分割线

**验证：** 文件语法正确  
**时间：** 3 min  
**依赖：** Task 2.1

### Task 2.3 — 编辑 TopBar.tsx
**文件：** `desktop/src/components/MainLayout/TopBar.tsx`  
**操作：** 编辑（最小改动）  
**改动点：**
1. 去掉 Logo + 产品名区域（`<div className={styles.left}>` 整块删除）
2. 搜索 `<Input.Search>` 替换为 `<Button>` 显示 "⌘K 搜索..."（点击打开 CommandPalette）
3. 去掉用户名 `<span>`（头像旁只留 Avatar）
4. 高度从 56px 改为 48px（CSS 中控制）

**不改：** 搜索过滤逻辑、通知逻辑、用户菜单、积分显示、余额逻辑  
**验证：** `npm run dev` → TopBar 渲染 48px，无 Logo，有 ⌘K 按钮  
**时间：** 5 min  
**依赖：** 无（可并行）

### Task 2.4 — 重写 TopBar.module.css
**文件：** `desktop/src/components/MainLayout/TopBar.module.css`  
**操作：** 重写  
**内容：**
- `.topbar`: 48px, `background: var(--color-bg-elevated)`, `border-bottom: 1px solid var(--color-border)`
- 去 `.left`, 去 `.logo`, 去 `.productName`
- `.searchBtn`: 替代 `.searchInput`, 按钮样式
- `.right`: 积分+通知+头像右对齐
- `.avatarWrap`: 简化（去掉用户名）

**验证：** 语法正确  
**时间：** 3 min  
**依赖：** Task 2.3

### Task 2.5 — 删除 TopTabs.tsx
**文件：** `desktop/src/components/MainLayout/TopTabs.tsx`  
**操作：** **删除**  
**原因：** 导航功能已迁移到 IconDock  
**验证：** 无其他文件 import TopTabs（grep 确认）  
**时间：** 1 min  
**依赖：** Task 2.3

### Task 2.6 — 编辑 StatusBar.tsx
**文件：** `desktop/src/components/MainLayout/StatusBar.tsx`  
**操作：** 编辑（最小改动）  
**改动点：**
1. 注释从 v0.3.1 改为 v1.0
2. 去掉 `.breathing` 类名引用（CSS 中删除呼吸动画）
3. 底部 `<footer>` height 改为 28px（CSS 中控制）

**不改：** 所有业务逻辑（服务状态监听、同步日志、版本检查、网络监听）  
**验证：** StatusBar 功能正常  
**时间：** 3 min  
**依赖：** 无

### Task 2.7 — 重写 StatusBar.module.css
**文件：** `desktop/src/components/MainLayout/StatusBar.module.css`  
**操作：** 重写  
**内容：**
- `.statusbar`: 28px, `background: var(--color-bg-elevated)`, `font-size: 11px`
- `.dot`: 去掉 `@keyframes breathing`（呼吸动画），保持纯色圆点
- `.indicator`: 紧凑间距
- `.label`: `font-size: 11px`
- 同步日志 Modal 样式适配暗色（不改逻辑）

**验证：** 语法正确  
**时间：** 3 min  
**依赖：** Task 2.6

### Task 2.8 — 新建 CommandPalette 组件
**文件：** `desktop/src/components/CommandPalette/index.tsx`  
**操作：** 新建  
**内容：**
- 全屏遮罩：`position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);`
- 浮层：560px 宽, `top: 15%`, 居中
- 搜索 Input：42px, `font-size: 16px`, 自动聚焦
- 结果列表：分组（"AI 员工"/"技能"/"知识库"/"工作流"），每组标题
- 每项 44px：图标 + 标题 + 副标题 + 右侧 Tag
- 键盘：↑↓ 选择 / Enter 跳转 / Esc 关闭

**复用逻辑（从 TopBar.tsx 提取）：**
- `SEARCH_RESULTS` 数组
- `filteredResults` useMemo 过滤逻辑
- `buildRoutePath()` 跳转路由函数
- `RESULT_TYPE_LABEL/COLOR/ICON` 映射
- 搜索范围 API（`getSearchCategories`）

**验证：** Ctrl+K 弹出面板，可搜索，可跳转  
**时间：** 8 min  
**依赖：** 无

### Task 2.9 — 新建 CommandPalette CSS
**文件：** `desktop/src/components/CommandPalette/styles.module.css`  
**操作：** 新建  
**内容：**
- `.overlay`: 全屏遮罩
- `.panel`: 560px, `background: var(--color-bg-elevated)`, `border: 1px solid var(--color-border)`, `border-radius: 12px`, `box-shadow: var(--shadow-lg)`
- `.searchInput`: 42px, 自动聚焦
- `.group`: 分组容器
- `.groupTitle`: 11px, `var(--color-text-tertiary)`, uppercase
- `.item`: 44px, hover 态 `var(--color-bg-hover)`
- `.itemActive`: `background: var(--color-brand-light)`

**验证：** 语法正确  
**时间：** 3 min  
**依赖：** Task 2.8

### Task 2.10 — 编辑 MainLayout/index.tsx
**文件：** `desktop/src/components/MainLayout/index.tsx`  
**操作：** 编辑  
**改动：**
1. `import Sidebar` → `import IconDock`
2. `import TopTabs` → **删除**（已无此文件）
3. `import CommandPalette` → 新增
4. `<TopTabs />` → **删除**
5. `<Sidebar collapsed={...}>` → `<IconDock />`
6. `<Breadcrumb />` → 保留
7. 挂载 `<CommandPalette />`（始终在 DOM 中，Ctrl+K 控制显隐）
8. `sidebarCollapsed` 状态和相关 logic → 删除

**验证：** `npm run dev` → 布局为 Dock(48px)+Content+StatusBar(28px)  
**时间：** 3 min  
**依赖：** Task 2.1-2.9 全部

### Task 2.11 — 重写 MainLayout/styles.module.css
**文件：** `desktop/src/components/MainLayout/styles.module.css`  
**操作：** 重写  
**内容：**
```css
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg-base);
  overflow: hidden;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--color-bg-base);
}
```
**去掉：** `padding-top: 56px`, `padding-bottom: 32px`, `.tabsBar`, `overflow: hidden` on body  
**验证：** 语法正确  
**时间：** 2 min  
**依赖：** Task 2.10

### 🟡 阶段2检查点
- [ ] MainLayout = TopBar(48px) + IconDock(48px) + Content + StatusBar(28px)
- [ ] 点击 Dock 图标可跳转到对应页面
- [ ] Ctrl+K 弹出 CommandPalette
- [ ] Office 页面正常渲染（Pixi.js canvas 不被 Dock 遮盖）
- [ ] TopTabs.tsx 已删除，无 import 报错

---

## 🟢 阶段 3：登录页（三个独立 CSS 重写，可并行）

> 目标：三个登录页统一为 v1.0 暗色风格，逻辑代码零改动

### Task 3.1 — 重写桌面端登录页 CSS
**文件：** `desktop/src/pages/Login/styles.module.css`  
**操作：** 全量重写  
**内容要点：**
- `.container`: `background: var(--color-bg-base)` 纯色，去掉 `radial-gradient` + 网格伪元素
- `.card`: `background: var(--color-bg-elevated)`, `border: 1px solid var(--color-border)`, `border-radius: 12px`, 400px, padding 36px
- 删除 `.card::before`（顶部光带）
- `.logoIcon`: 36px, `color: var(--color-brand)`, 去掉 `filter: drop-shadow`
- `.title`: 20px, `color: var(--color-text-primary)`
- `.subtitle`: 13px, `color: var(--color-text-secondary)`
- `.input`: `background: var(--color-bg-root)`, `border-color: var(--color-border)`, height 44px
- `.submitBtn`: `background: var(--color-brand)`, 去掉 gradient, `border-radius: 6px`
- `.link`: `color: var(--color-brand)`
- 删除 `.demoBtn`（如有）
**验证：** 桌面端登录页无渐变/发光/网格，卡片干净  
**时间：** 5 min  
**依赖：** 阶段1（Token 层）

### Task 3.2 — 重写用户网页端登录页 CSS
**文件：** `frontend/user/src/pages/Login/styles.module.css`  
**操作：** 全量重写  
**内容要点：**
- `.container`: 保持 flex 分屏，两个半屏都改暗色
- 左侧 `.brandSide`:
  - `background: var(--color-bg-root)` (或 `#0D1117`)
  - 删除 `::before` (扫光线) + `::after` (网格纹理)
  - 删除 `.decoration1` `.decoration2` 伪元素
  - 删除所有 `@keyframes`: scanline, grid-move, text-shimmer, glow-pulse
  - 品牌标题 `.brandHeading`: 纯色 `var(--color-text-primary)` / 40px, 去掉 gradient 流动
  - 品牌图标: 纯色 `var(--color-brand)`, round, 去掉多层发光
- 右侧 `.formSide`:
  - `background: var(--color-bg-base)` (暗色替代 `#f8fafc`)
  - `.formTitle`: 暗色文字
  - `.formSubtitle`: `var(--color-text-secondary)`
- `.submitButton`: `background: var(--color-brand)`, 去掉 `box-shadow: var(--shadow-neon)`
- `.link`: `color: var(--color-brand)`, 去掉 `text-shadow` 发光
- 移动端 `.mobileHeader`: 去掉 gradient brand, 改为纯色
**验证：** 用户网页端登录页无任何动画，双暗色分屏  
**时间：** 8 min  
**依赖：** 无（此项目有自己的 CSS 变量）

### Task 3.3 — 重写管理后台登录页 CSS
**文件：** `frontend/admin/src/pages/Login/styles.module.css`  
**操作：** 全量重写  
**内容要点：**
- 同上桌面端登录风格
- `.container`: `background: var(--color-bg-base)`, 纯色
- `.card`: `background: var(--color-bg-elevated)`, `border: 1px solid var(--color-border)`, 440px
- 删除 `.card::before` 光带
- `.logoIcon`: 36px, `color: var(--color-brand)`, 去掉发光
- `.submitBtn`: 纯色 `var(--color-brand)`, 去掉 gradient
- `.captchaCanvas`: border 改为 `var(--color-border)`, background 改为 `var(--color-bg-elevated)`
**验证：** 管理后台登录页暗色，Canvas 验证码可读  
**时间：** 5 min  
**依赖：** 无

### Task 3.4 — 适配管理后台登录页 Canvas 配色
**文件：** `frontend/admin/src/pages/Login/index.tsx`  
**操作：** 编辑（仅 Canvas 绘制配色）  
**改动点：** `drawCaptcha()` 函数内
- 背景：`'rgba(15, 23, 42, 0.9)'` → `'var(--color-bg-elevated)'`（或硬编码 `'#1C2333'`，Canvas 不支持 CSS 变量）
- 干扰线颜色：`'rgba(56+..., 189+..., 248, 0.4)'` → `'rgba(79, 110, 247, 0.3)'`
- 字符颜色：从 `['#38bdf8','#818cf8','#34d399','#f472b6','#facc15']` → `['#4F6EF7','#6B86FF','#34D399','#F87171','#FBBF24']`
- 干扰点：`'rgba(255,255,255,...)'` → `'rgba(230,237,243,...)'`

**不改：** `generateCaptcha()`, form submit, 验证逻辑  
**验证：** Canvas 验证码适配暗色背景，可见可读  
**时间：** 3 min  
**依赖：** Task 3.3

### 🟢 阶段3检查点
- [ ] 三个登录页无 gradient/glow/animation/backdrop-blur
- [ ] 三端按钮纯色品牌蓝紫
- [ ] 管理后台 Canvas 验证码可读
- [ ] 各端登录表单提交正常（不改逻辑）

---

## 🔵 阶段 4：Landing 页可配置化

> 目标：数据提取到 data.ts + CSS 从 1500 行缩减到 ~300 行

### Task 4.1 — 新建 Login 数据文件
**文件：** `frontend/user/src/pages/Landing/data.ts`  
**操作：** 新建  
**内容：**
1. 从 `Landing/index.tsx` 复制以下数组定义到 `data.ts`（不改内容）：
   - `navItems`（NavItem[]）
   - `heroStats`（StatItem[]）
   - `foundationCards`（FoundationCard[]）
   - `processSteps`（string[]）
   - `ceoCard`（OrgCard）
   - `coreCards`（OrgCard[]）
   - `execCards`（OrgCard[]）
   - `flywheelSteps`（FlywheelStep[]）
   - `flywheelDetails`（Record<number, string[]>）
   - `dataflowCards`（DataflowCard[]）
   - `infraCards`（InfraCard[]）
   - `techCards`（TechCard[]）
   - `techStack`（string[]）
   - `industryCards`（IndustryCard[]）
2. 导出所有数组 + 类型 interface 定义
**验证：** `data.ts` TypeScript 编译通过  
**时间：** 5 min  
**依赖：** 无

### Task 4.2 — 编辑 Landing/index.tsx
**文件：** `frontend/user/src/pages/Landing/index.tsx`  
**操作：** 编辑  
**改动：**
1. 所有硬编码数组 → 从 `./data` import
2. 删除本地数组定义 + 类型 interface
3. JSX 部分**完全不动**（section 结构不变）
**验证：** Landing 页正常渲染，所有 section 内容与改动前一致  
**时间：** 5 min  
**依赖：** Task 4.1

### Task 4.3 — 重写 Landing CSS (Part 1: 基础 Token + Navbar + Hero)
**文件：** `frontend/user/src/pages/Landing/styles.module.css`  
**操作：** 全量重写（分 3 轮）  
**Part 1 内容：**
1. `.page` Token：
   - `--bg: #0D1117` / `--card-bg: #1C2333` / `--card-border: #30363D` / `--accent: #4F6EF7` / `--text: #E6EDF3` / `--text-soft: #8B949E` / `--text-faint: #6E7681` / `--text-mute: #484F58`
2. `.page`: `background: var(--bg)`, `font-family: var(--font-family)`, 保留 `.particleBg`
3. Navbar: 64px, `background: var(--color-bg-elevated)`, `border-bottom: 1px solid var(--color-border)`
   - `.navbarBtnOutline`: `border: 1px solid var(--color-brand)`, `color: var(--color-brand)`, `border-radius: 6px`
   - `.navbarNavBtn`: `color: var(--text-soft)` → hover `var(--text)`
4. Hero: `min-height: 100vh` 保留
   - `.heroTitle`: 52px, `color: var(--text)`
   - `.heroStatValue`: `color: var(--color-brand)`
   - `.heroCtaPrimary`: `background: var(--color-brand)`, `border-radius: 6px`
5. 保留 `.section`, `.section.visible`, `@keyframes fadeInUp`, `.scrollHint`
6. `.particleBg`: 保留

**删除所有 CSS:** `scanline`, `grid-move`, `text-shimmer`, `glow-pulse` 动画  
**验证：** Navbar + Hero 暗色无动画  
**时间：** 8 min  
**依赖：** 无

### Task 4.4 — 重写 Landing CSS (Part 2: Foundation + Organization + Flywheel)
**Part 2 内容：**
1. Foundation:
   - `.featureCard`: `background: var(--card-bg)`, `border: 1px solid var(--card-border)`, `border-radius: 8px`
   - hover: `border-color: var(--color-brand)`
   - `.sectionLabel`: `color: var(--text-mute)`
2. Organization:
   - `.orgCard`: `background: var(--card-bg)`, `border: 1px solid var(--card-border)`
   - `.orgCeoCard`: label 色保留
   - `.orgBadge`: `var(--color-brand)`
   - Legend dot 色保留
3. Flywheel:
   - `.stepCard`: `background: var(--card-bg)`, `border: 1px solid var(--card-border)`
   - `.stepCardActive`: `border-color: var(--color-brand)`
   - `.stepNumber`: `color: var(--color-brand)`
   - `.detailPanel`: `background: var(--card-bg)`, `border: 1px solid var(--card-border)`

**验证：** Foundation+Organization+Flywheel 3个 section 暗色统一  
**时间：** 8 min  
**依赖：** Task 4.3

### Task 4.5 — 重写 Landing CSS (Part 3: 剩余所有 + Footer)
**Part 3 内容：**
1. Collaboration:
   - `.dataflowCard`, `.infraCard`: 暗色卡片风格
2. Tech:
   - `.techCard`, `.techStackItem`: 同上
3. Industries:
   - `.industryTag`: `background: var(--card-bg)`, `border: 1px solid var(--card-border)`, hover → `border-color: var(--color-brand)`
4. Download:
   - `.downloadCard`: 暗色卡片
   - `.downloadBtn`: `background: var(--color-brand)` 纯色
5. CTA:
   - `.ctaInner`: `background: var(--card-bg)`, subtle glow
   - `.ctaBtnPrimary`: `background: var(--color-brand)`
6. Footer:
   - `background: var(--color-bg-root)`, `border-top: 1px solid var(--color-border)`
7. Back to top: 保留 `.backToTop`
8. 移动端: 保留 `@media (max-width: 768px)`，变暗色

**验证：** 10 个 section 全部暗色统一，无反光/毛玻璃/动画  
**时间：** 8 min  
**依赖：** Task 4.4

### 🔵 阶段4检查点
- [ ] `data.ts` 存在且导出所有数组
- [ ] `index.tsx` 从 `data.ts` 引用，无本地硬编码数组
- [ ] 10 个 section 完整渲染
- [ ] 粒子背景保留 (ParticleMatrix)
- [ ] 滚动入场动画保留 (fadeInUp)
- [ ] 终端无 CSS 动画被删除导致的报错

---

## 📊 任务依赖图

```
阶段1 (可并行)
  1.1 design-tokens.css ──→ 1.2 global.css
  1.3 antd-theme.ts
  1.4 lucide-react ────────→ 2.1 IconDock
        │
阶段2 (串行于壳层)
  2.1 IconDock.tsx ──→ 2.2 IconDock.css ──┐
  2.3 TopBar.tsx ───→ 2.4 TopBar.css ─────┤
  2.5 删除 TopTabs ────────────────────────┤
  2.6 StatusBar.tsx → 2.7 StatusBar.css ──┤
  2.8 CmdPalette.tsx→2.9 CmdPalette.css ──┤
                                           ↓
                          2.10 MainLayout/index.tsx
                                 ↓
                          2.11 MainLayout/styles.css

阶段3 (可并行)
  3.1 desktop登录CSS
  3.2 user登录CSS
  3.3 adLoginCSS → 3.4 adLoginCanvas

阶段4 (串行)
  4.1 data.ts → 4.2 index.tsx → 4.3→4.4→4.5 CSS
```

---

## 🚦 执行策略

**推荐执行方式：** 子代理并行（每阶段启动多个子代理）

| 阶段 | 策略 | 子代理数 |
|------|------|----------|
| 1 Token层 | 3 子代理并行 (1.1/1.3/1.4) | 3 |
| 2 壳层 | 3 子代理并行 (Dock组 / TopBar组 / CmdPalette组) | 3 |
| 3 登录页 | 3 子代理并行 (三端各自) | 3 |
| 4 Landing | 序列执行 (依赖性高) | 1 |

**回退方案：** 所有改动可 git reset, 无破坏性操作。每个阶段完成后运行 `npm run dev` 确认无白屏。
