# 深瞳AI v1.0 — 全链路 UI 重设计方案

> **版本：** v1.0-draft  
> **日期：** 2026-07-25  
> **范围：** 桌面端壳层 + 桌面端登录 + 用户网页端登录 + Landing 页 + 管理后台登录  
> **不动范围：** AI 办公室 / 所有页面业务逻辑 / API / Store / Router / 后端 / Electron 主进程  
> **设计方向：** Cursor/Windsurf 式暗色 IDE 美学，命令面板驱动，图标Dock导航  
> **技术栈：** React 18 + Ant Design 5 + Zustand + CSS Modules

---

## 目录

1. [设计 Token](#1-设计-token)
2. [桌面端 MainLayout 壳层](#2-桌面端-mainlayout-壳层)
3. [桌面端登录页](#3-桌面端登录页)
4. [用户网页端登录页](#4-用户网页端登录页)
5. [Landing 页可配置化](#5-landing-页可配置化)
6. [管理后台登录页](#6-管理后台登录页)
7. [实施计划](#7-实施计划)

---

## 1. 设计 Token

### 1.1 设计哲学

```
Cursor/Windsurf 美学内核:
  • 暗色基底 → 减少视觉疲劳，让 AI 办公室 2D 场景更突出
  • 微妙灰度层次 → 不用纯黑，用 slate 暖灰系列
  • 品牌蓝紫渐变 → 唯一彩色点缀
  • 极简无装饰 → 去掉分组标题、去掉 emoji 图标、去掉多余分割线
  • 命令面板中心 → 键盘优先，搜索即导航
```

### 1.2 配色方案

来自 UI/UX Pro Max: **Dark Mode Premium (#17) + Tech Blue 暗色调适配**

```css
:root {
  /* ===== 主品牌色 ===== */
  --color-brand: #4F6EF7;           /* 品牌蓝紫，替代 Ant Design 默认 #1677FF */
  --color-brand-hover: #6B86FF;     /* 悬停态 */
  --color-brand-active: #3D56D4;    /* 按下态 */
  --color-brand-light: rgba(79, 110, 247, 0.15);  /* 浅色背景 */

  /* ===== 语义色 ===== */
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #F87171;
  --color-info: #60A5FA;

  /* ===== 中性色 (slate 暖灰系列) ===== */
  --color-bg-root: #0D1117;         /* 最底层背景 (接近 GitHub Dark) */
  --color-bg-base: #161B22;         /* 主背景 */
  --color-bg-elevated: #1C2333;     /* 卡片/面板背景 */
  --color-bg-overlay: #21283A;      /* 浮层/Dropdown 背景 */
  --color-bg-hover: rgba(255,255,255,0.04);  /* 悬停态 */

  /* ===== 文字色 ===== */
  --color-text-primary: #E6EDF3;    /* 主文字 */
  --color-text-secondary: #8B949E;  /* 辅助文字 */
  --color-text-tertiary: #6E7681;   /* 次要文字 */
  --color-text-disabled: #484F58;   /* 禁用文字 */

  /* ===== 边框色 ===== */
  --color-border: #30363D;          /* 默认边框 */
  --color-border-light: #21262D;    /* 浅边框 */
  --color-border-hover: #484F58;    /* 悬停边框 */

  /* ===== 滚动条 ===== */
  --color-scrollbar-thumb: #30363D;
  --color-scrollbar-track: transparent;
}
```

**与现有 design-tokens.css 的关系：**  
完全替换现有 CSS 变量值，保持变量名语义兼容（如 `--color-primary` → `--color-brand`），所有引用旧变量的页面自动继承新色值。

### 1.3 字体

```css
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, 
               'SF Pro Text', 'Segoe UI', 'PingFang SC', 
               'Microsoft YaHei', sans-serif;
--font-family-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code',
                     'SF Mono', Consolas, monospace;

--font-size-caption: 11px;
--font-size-body: 13px;
--font-size-body-lg: 14px;
--font-size-heading: 16px;
--font-size-title: 18px;
--font-size-display: 24px;

--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
```

### 1.4 间距 (4px 基准)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

### 1.5 圆角

```css
--radius-sm: 4px;     /* 输入框 / 小按钮 */
--radius-md: 6px;     /* 卡片 / 面板 */
--radius-lg: 8px;     /* Modal / Drawer */
--radius-xl: 12px;    /* 大面板 */
```

### 1.6 阴影 (暗色专用 → 发光替代传统阴影)

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
--shadow-glow-brand: 0 0 12px rgba(79, 110, 247, 0.3);
```

### 1.7 动效

```css
--duration-fast: 0.15s;
--duration-base: 0.2s;
--duration-slow: 0.3s;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

### 1.8 Ant Design 主题映射

```typescript
// 替换 src/theme/antd-theme.ts
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#4F6EF7',
    colorSuccess: '#34D399',
    colorWarning: '#FBBF24',
    colorError: '#F87171',
    colorInfo: '#60A5FA',
    colorTextBase: '#E6EDF3',
    colorBgBase: '#161B22',
    colorBgContainer: '#1C2333',
    colorBgElevated: '#21283A',
    colorBorder: '#30363D',
    colorBorderSecondary: '#21262D',
    fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
    fontSize: 13,
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    wireframe: false,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      primaryShadow: '0 0 12px rgba(79, 110, 247, 0.3)',
    },
    Card: {
      borderRadiusLG: 8,
      colorBgContainer: '#1C2333',
    },
    Input: {
      borderRadius: 6,
      colorBgContainer: '#0D1117',
      colorBorder: '#30363D',
      activeBorderColor: '#4F6EF7',
      hoverBorderColor: '#484F58',
    },
    Modal: {
      borderRadiusLG: 12,
      colorBgElevated: '#1C2333',
    },
    Dropdown: {
      colorBgElevated: '#21283A',
    },
    Tooltip: {
      colorBgSpotlight: '#21283A',
    },
    Message: {
      colorBgElevated: '#21283A',
    },
    Notification: {
      colorBgElevated: '#21283A',
    },
  },
};
```

---

---

## 2. 桌面端 MainLayout 壳层

### 2.1 新布局结构

**现状 → 目标**

```
现状 (v0.4.8)：                             目标 (v1.0)：
┌─────────────────────────────┐           ┌─────────────────────────────────┐
│ TopBar 56px [Logo][搜索]    │           │ TopBar 48px ≡ ⌘K...  [积分][🔔][👤]│
├─────────────────────────────┤  ──→     ├──┬──────────────────────────────┤
│ TopTabs 44px [首页][对话]...│           │🏢│                              │
├────┬────────────────────────┤           │💬│       CONTENT AREA           │
│200px│  CONTENT              │           │⚡│    (Office / Chat / etc.)    │
│ SB │                       │           │📚│                              │
│分组│                       │           │🤖│                              │
│导航│                       │           │👥│                              │
├────┴────────────────────────┤           │⚙│                              │
│ StatusBar 32px             │           ├──┴──────────────────────────────┤
└─────────────────────────────┘           │ StatusBar 28px 🟢OC 🟢N8N v0.4.8│
                                          └─────────────────────────────────┘
```

**关键变化：**

| 组件 | 现状 | 目标 | 说明 |
|------|------|------|------|
| TopBar | 56px，含搜索框 | 48px，搜索缩为 ⌘K 按钮 | 侧面腾空间给Dock |
| TopTabs | 44px 独立条 | **删除** | 功能并入IconDock |
| Sidebar | 200/64px，4分组+文字 | 48px 纯图标Dock | 永久折叠，7个图标 |
| StatusBar | 32px | 28px | 微缩，保留所有功能 |
| 命令面板 | 内嵌搜索下拉 | ⌘K 全屏浮层 | Raycast 风格 |

### 2.2 TopBar 48px

**设计要点：**
- 高度 48px，`background: var(--color-bg-elevated)`
- 底部 1px `var(--color-border)` 分割线
- 左侧：汉堡菜单(≡) + ⌘K 搜索按钮（显示 `Ctrl+K` 快捷键徽章）
- 右侧：积分 → 通知Badge → 用户头像（保持现有顺序，去掉用户名文字）
- 去掉 Logo "深瞳AI" 文字（移到 IconDock 首个图标 Tooltip）

```
┌──────────────────────────────────────────────────────┐
│ ≡  ⌘K 搜索 AI员工、技能、知识库...  Ctrl+K    💎1208 🔔3 👤│ ← 48px
└──────────────────────────────────────────────────────┘
```

**代码改动：**
- `TopBar.tsx`：去掉 Logo 区域、产品名，搜索 Input 改为 Button
- `TopBar.module.css`：重写样式
- **删除** `TopTabs.tsx`（导航合并到IconDock）

### 2.3 IconDock 48px

**设计要点：**
- 宽 48px，永远不展开（去掉折叠/展开切换）
- `background: var(--color-bg-root)` 比主背景深一层
- 右侧 1px `var(--color-border)` 分割线
- 7 个图标垂直居中排列，间距 4px
- 每个图标 36×36px 点击区域，`border-radius: var(--radius-md)`
- 激活态：`background: var(--color-brand-light)` + 左侧 2px 指示条
- Hover 态：`background: var(--color-bg-hover)`
- Tooltip 显示名称 + 快捷键

**图标映射：**

```typescript
const DOCK_ITEMS = [
  { key: 'office',    icon: Building2,    label: 'AI 办公室', shortcut: '⌘1', path: '/office'     },
  { key: 'chat',      icon: MessageSquare, label: '对话',      shortcut: '⌘2', path: '/chat'       },
  { key: 'hermes',    icon: Workflow,      label: 'Hermes',    shortcut: '⌘3', path: '/hermes'     },
  { key: 'knowledge', icon: BookOpen,      label: '知识库',    shortcut: '⌘4', path: '/knowledge'  },
  { key: 'agents',    icon: Bot,           label: '智能体',    shortcut: '⌘5', path: '/agent-market'},
  { key: 'team',      icon: Users,         label: '团队',      shortcut: '⌘6', path: '/team'       },
  { key: 'settings',  icon: Settings,      label: '设置',      shortcut: '⌘7', path: '/settings'   },
];
```

使用 **lucide-react** 图标库（`Building2`, `MessageSquare`, `Workflow`, `BookOpen`, `Bot`, `Users`, `Settings`）替代 emoji。

**代码改动：**
- 新建 `desktop/src/components/IconDock/index.tsx` + `styles.module.css`
- 修改 `MainLayout/index.tsx`：`<Sidebar>` 替换为 `<IconDock>`
- 保留 `Sidebar/` 组件不动（仅引用失效）

### 2.4 命令面板 ⌘K

**设计要点：**
- 全屏暗色遮罩（`rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`）
- 浮层居中偏上（`top: 20%`），宽 560px
- 搜索框自动聚焦，42px 高度，`font-size: 16px`
- 结果列表分组展示，每组有标题（如"AI 员工"/"技能"/"知识库"/"工作流"）
- 每项 44px 高，左侧图标 + 标题 + 副标题 + 右侧快捷键提示
- 键盘导航：↑↓ 选择，Enter 跳转，Esc 关闭
- 搜索范围支持动态 API（保留功能）

**复用现有逻辑：**
- 搜索结果过滤逻辑 → 从 `TopBar.tsx` 提取
- 搜索范围 API → `search-api.ts` 不变
- 结果跳转逻辑 → `buildRoutePath()` 不变

**代码改动：**
- 新建 `desktop/src/components/CommandPalette/index.tsx`
- 在 `MainLayout` 中挂载，`Ctrl+K` 触发

### 2.5 StatusBar 28px

**设计要点：**
- 高度 28px（从32px微缩）
- `background: var(--color-bg-elevated)`
- `font-size: 11px`（caption级别）
- 去掉呼吸动画的 `.breathing`（保留绿色圆点常亮即可）
- 服务指示器格式：`🟢 OpenClaw:51096` → 紧凑排列
- 右侧版本号保留点击检查更新功能

**代码改动：**
- `StatusBar.tsx`：样式调整（不改逻辑）
- `StatusBar.module.css`：重写

### 2.6 MainLayout 容器

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
  /* TopBar=48px, StatusBar=28px, no padding-top needed if both are flex children */
}

.content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--color-bg-base);
}
```

**代码改动清单：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `MainLayout/index.tsx` | 编辑 | 去掉TopTabs，IconDock替换Sidebar，挂载CommandPalette |
| `MainLayout/styles.module.css` | 重写 | 暗色布局，去掉padding |
| `MainLayout/TopBar.tsx` | 编辑 | 简化为48px，搜索变按钮 |
| `MainLayout/TopBar.module.css` | 重写 | 暗色顶栏 |
| `MainLayout/TopTabs.tsx` | **删除** | 功能并入IconDock |
| `MainLayout/StatusBar.tsx` | 编辑 | 微调样式（不改逻辑） |
| `MainLayout/StatusBar.module.css` | 重写 | 28px暗色底栏 |
| `IconDock/index.tsx` | **新建** | 48px纯图标Dock |
| `IconDock/styles.module.css` | **新建** | Dock样式 |
| `CommandPalette/index.tsx` | **新建** | ⌘K全屏命令面板 |
| `CommandPalette/styles.module.css` | **新建** | 面板样式 |

**不动范围：**
- `Breadcrumb/index.tsx` — 保留，样式继承暗色变量
- `StatusPanel.tsx` — 保留
- 所有页面组件（`/office`, `/chat`, `/dashboard`, ...）— 不动

---

---

## 3. 三端登录页重设计

### 3.1 统一设计原则

退出赛博朋克审美（霓虹扫光线/网格/发光动画/颗粒），进入 **Cursor/Windsurf 专业暗色**：

```
赛博朋克 → 专业暗色
━━━━━━━━━━━━━━━━━━━━━━
✗ 扫光线动画       → 干净的静态界面
✗ 网格背景纹理     → 纯色暗背景
✗ 霓虹多层光晕     → 单层光泽（shadow-glow-brand）
✗ emoji 图标       → SVG 图标
✗ 渐变按钮         → 纯色品牌蓝紫按钮
✗ 大写英文标签     → 中文 + 英文副标题
✗ backdrop-blur 毛玻璃 → 干净半透明卡片
```

### 3.2 桌面端登录页

**现状：** 赛博黑底 + 网格背景 + 毛玻璃卡片 + 渐变按钮 + 霓虹光带  
**目标：** 极简居中卡片 + 干净品牌色点缀

```
        ┌─────────────────────────┐
        │                         │
        │       🔷 深瞳AI         │  ← brand icon (36px, brand color)
        │      登录你的智能工作台  │
        │                         │
        │  ┌─────────────────┐    │
        │  │ 用户名或邮箱      │    │  44px 输入框
        │  └─────────────────┘    │
        │  ┌─────────────────┐    │
        │  │ 密码            │    │
        │  └─────────────────┘    │
        │  ☐ 记住账号密码          │
        │  ┌─────────────────┐    │
        │  │    登  录       │    │  42px, brand bg
        │  └─────────────────┘    │
        │                         │
        │  忘记密码？  立即注册     │
        │                         │
        └─────────────────────────┘
```

**改动清单：**

| 项 | 现状 | 目标 |
|----|------|------|
| 背景 | `radial-gradient` × 2 + 网格伪元素 | `var(--color-bg-base)` 纯色 |
| 卡片 | `rgba(17,24,39,0.85)` + `backdrop-blur(20px)` + 顶部光带伪元素 | `var(--color-bg-elevated)` + `border: 1px solid var(--color-border)` 无光带 |
| 卡片尺寸 | 420px, padding 40/36 | 400px, padding 36px |
| Logo | `RobotOutlined` 48px + 发光 `filter: drop-shadow` | SVG 图标 36px, 纯色无发光 |
| 标题字体 | 24px letter-spacing:1px | 20px, `font-weight: 600` |
| 按钮 | 渐变 `linear-gradient(135deg, primary, purple)` | 纯色 `var(--color-brand)` |
| 链接色 | `#818cf8` | `var(--color-brand)` |
| 错误消息 | `antd message.error` | 保留不变 |

**代码改动：**
- `desktop/src/pages/Login/index.tsx`：**不动**（只改CSS，不改逻辑）
- `desktop/src/pages/Login/styles.module.css`：**重写**

### 3.3 用户网页端登录页

**现状：** 左暗右亮分屏 + 扫光线动画 + 网格纹理动画 + 渐变流动文字  
**目标：** 左暗右暗双暗色 + 静态干净

```
  ┌────────────────────┬──────────────────┐
  │                    │                  │
  │   🔷 深瞳AI        │   欢迎回来        │
  │                    │   登录以开始      │
  │   智能中台         │                  │
  │   洞察未来         │   ┌────────────┐  │
  │                    │   │ 用户名/邮箱  │  │
  │   一站式 AI Agent  │   └────────────┘  │
  │   与知识库管理平台 │   ┌────────────┐  │
  │                    │   │ 密码        │  │
  │                    │   └────────────┘  │
  │                    │   ┌────────────┐  │
  │                    │   │   登  录   │  │
  │                    │   └────────────┘  │
  │                    │                  │
  │                    │   还没有账号？     │
  │                    │   立即注册 →      │
  └────────────────────┴──────────────────┘
     #0D1117 品牌深底     #161B22 表单暗底
```

**改动清单：**

| 项 | 现状 | 目标 |
|----|------|------|
| 左侧背景 | `#0a0e27` + 光晕 ×2 + 网格纹理动画 | `var(--color-bg-root)` 纯色 + 微弱 `var(--color-brand-light)` 光晕(静态) |
| 扫光线 | `::before` 2px 渐变 + 3s 动画 | **删除** |
| 网格纹理 | `::after` 透视移动 20s 动画 | **删除**（或保留静态极淡网格） |
| 标题 | 渐变流动文字 `text-shimmer 3s` | 纯色 `var(--color-text-primary)` 40px |
| 右侧背景 | `#f8fafc` 浅色 | `var(--color-bg-base)` 暗色 |
| 按钮 | 带霓虹发光的渐变 | 纯色 `var(--color-brand)` 42px |
| 链接 | hover 发光 `text-shadow` | 普通 hover 亮色 |
| 动画 | scanline / grid-move / text-shimmer / glow-pulse | **全部删除** |

**代码改动：**
- `frontend/user/src/pages/Login/index.tsx`：**不动**（只改CSS）
- `frontend/user/src/pages/Login/styles.module.css`：**重写**

### 3.4 管理后台登录页

**现状：** 赛博冷蓝中心卡片 + 网格背景 + 毛玻璃 + 渐变按钮 + Canvas 彩色验证码  
**目标：** 与桌面端登录同风格 + 保留图形验证码

```
        ┌─────────────────────────┐
        │                         │
        │      🛡 深瞳AI 管理后台  │  ← shield icon
        │      管理员登录          │
        │                         │
        │  ┌─────────────────┐    │
        │  │ 管理员用户名      │    │
        │  └─────────────────┘    │
        │  ┌─────────────────┐    │
        │  │ 密码            │    │
        │  └─────────────────┘    │
        │  ┌──────────┐ ┌──────┐  │
        │  │ 验证码    │ │ABCD  │  │  ← canvas验证码保留
        │  └──────────┘ └──────┘  │
        │  ┌─────────────────┐    │
        │  │  登 录 管 理 后 台│    │
        │  └─────────────────┘    │
        │                         │
        │    返回用户端登录         │
        └─────────────────────────┘
```

**改动清单：**

| 项 | 现状 | 目标 |
|----|------|------|
| 背景 | 冷蓝渐变 + 网格 | `var(--color-bg-base)` 纯色 |
| 卡片 | 毛玻璃 + 光带 | 干净卡片 |
| 图标 | `SafetyCertificateOutlined` 44px + 发光 | 36px, 纯色 |
| 按钮 | 渐变蓝紫 | 纯色 `var(--color-brand)` |
| 验证码 Canvas | 彩色字符 + 干扰线 + 干扰点 | 保留 Canvas 绘制逻辑不变，**配色适配暗色**（背景 `var(--color-bg-elevated)`，字符用 `var(--color-brand)`/`var(--color-text-secondary)`） |
| 底部链接 | 蓝色 | `var(--color-brand)` |

**代码改动：**
- `frontend/admin/src/pages/Login/index.tsx`：Canvas 配色变量替换（不改核心逻辑）
- `frontend/admin/src/pages/Login/styles.module.css`：**重写**

### 3.5 三端登录页共享改动

| 改法 | 桌面端 | 用户网页端 | 管理后台 |
|------|--------|------------|----------|
| 去掉赛博装饰 | ✅ | ✅ | ✅ |
| 去掉毛玻璃效果 | ✅ | ✅ | ✅ |
| 去掉动画 | ✅ | ✅ | ✅ |
| 按钮改用纯色 | ✅ | ✅ | ✅ |
| 字体收窄为21px | ✅ | — (28px) | ✅ |
| 输入框统一高44px | ✅ | — (antd默认) | ✅ |
| 暗色表单 | ✅ | ✅ (右侧变暗) | ✅ |
| 验证码Canvas适配 | — | — | ✅ |
| 逻辑代码 | **不动** | **不动** | **不动** |

---

---

## 4. Landing 页可配置化

### 4.1 问题诊断

今日 Landing 页有 1500+ 行 CSS + 500+ 行 JSX，所有文案/数据散落在 `index.tsx` 硬编码数组中。

**痛点：**
- 改一段话要翻 `index.tsx` 找对应数组项
- 增删 section 要在 CSS + JSX 两处同步改
- 非开发者无法更新营销内容
- 动画过多（scanline/grid-move/text-shimmer/glow-pulse）

### 4.2 改造方案

**方案：数据-视图分离 + 设计 Token 已统一，不改结构只改皮**

```
现状：
  index.tsx ─── 硬编码数据数组 ─── styles.module.css (1500行赛博风CSS)
                └── 所有文案内联
                └── 所有动画开放

目标：
  data.ts ─── 可配置数据文件 ──→  index.tsx ─── styles.module.css (暗色专业CSS, ~300行)
  ├── heroData            ├── Hero Section               ├── 统一色系 (slate+brand)
  ├── foundationCards     ├── Foundation Section         ├── 去动画 = 更快
  ├── orgCards            ├── Organization Section       ├── 滚动入场保留(fadeInUp)
  ├── flywheelSteps       ├── Flywheel Section           ├── 粒子背景保留
  ├── industryCards       ├── Industries Section
  └── downloadInfo        └── Download Section
                          └── CTA Section
                          └── Footer
```

### 4.3 视觉调整

保持 section 结构和顺序不变，只改视觉层：

| 组件 | 现状 | 目标 |
|------|------|------|
| Navbar | 顶部固定, `rgba(0,0,0,0.95)` + 毛玻璃 | `var(--color-bg-elevated)` + `border-bottom` |
| 品牌Logo | 青色方块 `#00d4ff` | `var(--color-brand)` 块 |
| Nav 按钮 | 白色文字 | `var(--color-text-secondary)` → hover `var(--color-text-primary)` |
| CTA 按钮 | 圆角20px描边 `#00d4ff` | `border-radius: 6px` 描边 `var(--color-brand)` |
| Hero 标题 | 白色 56px | `var(--color-text-primary)` 52px |
| Hero 描述 | 青色系 `#cce5ff` | `var(--color-text-secondary)` |
| 统计数字 | 青色系 | `var(--color-brand)` |
| Feature 卡片 | `rgba(10,20,40,0.75)` + blur(12px) + 青色边框 | `var(--color-bg-elevated)` + `border: 1px solid var(--color-border)` |
| Step 卡片 | 同上赛博风 | 同上干净风格 |
| Flywheel 详情面板 | 青色边框 + 毛玻璃 | `var(--color-bg-elevated)` + `var(--color-border)` |
| Org 卡片 | 带 `orgBadge` / 边框色分层 | 保留分层色逻辑，统一暗色底 |
| Industry 标签 | 青色系 | `var(--color-brand)` hover |
| Download 卡片 | 毛玻璃暗色卡片 | 干净暗色卡片 |
| Footer | 暗色底 | `var(--color-bg-root)` |
| 粒子背景 | `<ParticleMatrix />` | **保留**（品牌特色动效） |
| 滚动入场 `fadeInUp` | `translateY(30px)` | **保留** |

### 4.4 数据文件结构

新建 `frontend/user/src/pages/Landing/data.ts`，将以下数组从 `index.tsx` 提取：

```typescript
// data.ts — Landing 页所有可配置数据

// 导航项
export const navItems = [ ... ];

// Hero 统计
export const heroStats = [ ... ];

// 技术基座卡片
export const foundationCards = [ ... ];
export const processSteps = [ ... ];

// 组织架构
export const ceoCard = { ... };
export const coreCards = [ ... ];
export const execCards = [ ... ];

// 业务飞轮
export const flywheelSteps = [ ... ];
export const flywheelDetails = [ ... ];

// 协作网络
export const dataflowCards = [ ... ];
export const infraCards = [ ... ];

// 技术底座
export const techCards = [ ... ];
export const techStack = [ ... ];

// 适用场景
export const industryCards = [ ... ];
```

### 4.5 代码改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `Landing/data.ts` | **新建** | 所有数据数组提取 |
| `Landing/index.tsx` | **编辑** | 删除硬编码数组，从 `data.ts` import |
| `Landing/styles.module.css` | **重写** | 1500行 → ~300行，统一 Token，去动画 |
| `Landing/ParticleMatrix` | **不动** | 保留 |

### 4.6 不改范围

| 不改 | 原因 |
|------|------|
| Section 架构 (10个section) | 结构成熟 |
| IntersectionObserver 滚动逻辑 | 功能正常 |
| latest.yml 动态版本 | 功能正常 |
| 下载流程 (认证判断 + 跳转注册) | 功能正常 |
| 移动端响应式布局 | 布局保留只改色 |
| 回到顶部按钮 | 功能正常 |

---

---

## 5. 全链路文件改动总览

### 5.1 文件改动矩阵

| # | 文件 | 操作 | 行数估算 | 风险 |
|---|------|------|----------|------|
| **桌面端 (desktop)** | | | | |
| 1 | `desktop/src/components/MainLayout/index.tsx` | 编辑 | +5 / -3 行 | 低 |
| 2 | `desktop/src/components/MainLayout/styles.module.css` | 重写 | 全量 | 低 |
| 3 | `desktop/src/components/MainLayout/TopBar.tsx` | 编辑 | +15 / -20 行 | 低 |
| 4 | `desktop/src/components/MainLayout/TopBar.module.css` | 重写 | 全量 | 低 |
| 5 | `desktop/src/components/MainLayout/TopTabs.tsx` | **删除** | — | 低 |
| 6 | `desktop/src/components/MainLayout/StatusBar.tsx` | 编辑 | 微调样式 | 低 |
| 7 | `desktop/src/components/MainLayout/StatusBar.module.css` | 重写 | 全量 | 低 |
| 8 | `desktop/src/components/IconDock/index.tsx` | **新建** | ~60行 | 低 |
| 9 | `desktop/src/components/IconDock/styles.module.css` | **新建** | ~80行 | 低 |
| 10 | `desktop/src/components/CommandPalette/index.tsx` | **新建** | ~120行 | 中 |
| 11 | `desktop/src/components/CommandPalette/styles.module.css` | **新建** | ~80行 | 低 |
| 12 | `desktop/src/pages/Login/styles.module.css` | 重写 | 全量 | 低 |
| 13 | `desktop/src/styles/design-tokens.css` | 重写 | 全量 Token | **高** 🔴 |
| 14 | `desktop/src/styles/global.css` | 编辑 | 补充暗色变量 | 中 |
| 15 | `desktop/src/theme/antd-theme.ts` | 重写 | 全量映射 | 中 |
| 16 | `desktop/package.json` | 编辑 | 添加 `lucide-react` | 低 |
| **用户网页端 (frontend/user)** | | | | |
| 17 | `frontend/user/src/pages/Login/styles.module.css` | 重写 | 全量 | 低 |
| 18 | `frontend/user/src/pages/Landing/data.ts` | **新建** | ~120行 | 低 |
| 19 | `frontend/user/src/pages/Landing/index.tsx` | 编辑 | 提取数据、删数组 | 低 |
| 20 | `frontend/user/src/pages/Landing/styles.module.css` | 重写 | 1500→300行 | 中 |
| **管理后台 (frontend/admin)** | | | | |
| 21 | `frontend/admin/src/pages/Login/index.tsx` | 编辑 | Canvas配色~5行 | 低 |
| 22 | `frontend/admin/src/pages/Login/styles.module.css` | 重写 | 全量 | 低 |

**合计：** 6 新建 + 6 编辑 + 8 重写 + 1 删除 = 21 个文件

### 5.2 不动清单

| 绝对不动 | 原因 |
|-----------|------|
| `desktop/src/pages/Office/` 全部 | AI 办公室 2D 场景 |
| `desktop/src/pages/` 其他页面（Dashboard/Chat/Knowledge/...） | 业务页面 |
| `desktop/src/api/` | API 层 |
| `desktop/src/store/` | Zustand Store |
| `desktop/src/router/` | 路由 |
| `desktop/src/hooks/` | 自定义 Hook |
| `desktop/src/utils/` | 工具函数 |
| `desktop/electron/` | Electron 主进程 |
| `desktop/package.json` 依赖 | 除 lucide-react 外 |
| `frontend/user/src/pages/Login/index.tsx` | 登录逻辑 |
| `frontend/user/src/api/` | API 层 |
| `frontend/user/src/store/` | Store |
| `frontend/admin/src/pages/Login/index.tsx` | 核心逻辑（除Canvas配色） |
| `frontend/admin/src/api/` `store/` `router/` | 全部 |
| 后端服务 | Go 后端 |

### 5.3 实施顺序 (分 4 阶段)

```
阶段 1 🔴 — Token 层 (必须先做)
  ① design-tokens.css 全量重写
  ② global.css 补充暗色变量
  ③ antd-theme.ts 映射
  ⏱ 预估 15 分钟
  ✅ 验证：项目启动无白屏，Ant Design 组件变暗色

阶段 2 🟡 — 壳层 (核心体验)
  ④ MainLayout/styles.module.css 重写
  ⑤ TopBar.tsx 编辑 + 删除 TopTabs.tsx
  ⑥ IconDock 新建
  ⑦ CommandPalette 新建
  ⑧ StatusBar 编辑
  ⏱ 预估 45 分钟
  ✅ 验证：所有页面正常渲染，Dock 点击跳转正常，⌘K 弹出面板

阶段 3 🟢 — 登录页 (三个独立，可并行)
  ⑨ desktop Login CSS 重写
  ⑩ user Login CSS 重写
  ⑪ admin Login CSS 重写 + Canvas 适配
  ⏱ 预估 20 分钟
  ✅ 验证：三个登录页视觉统一，表单提交正常

阶段 4 🔵 — Landing 页
  ⑫ data.ts 新建
  ⑬ index.tsx 引用数据
  ⑭ styles.module.css 全量重写
  ⏱ 预估 30 分钟
  ✅ 验证：所有 Section 正常展示，颜色统一，无动画断裂
```

### 5.4 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Token 改动导致 Ant Design 组件渲染异常 | 中 | 高 | `antd-theme.ts` 映射前先 diff 原色值，保留兼容变量名 |
| IconDock 导航覆盖不完整 | 低 | 中 | 保留原 Sidebar 文件不动，可快速回退 |
| CommandPalette 搜索逻辑与 TopBar 不一致 | 低 | 低 | 从 TopBar.tsx 提取共用函数，不改逻辑 |
| Landing 页 CSS 重写后视觉断裂 | 中 | 低 | 保留原 CSS 备份，逐步替换 |
| `lucide-react` 与现有包冲突 | 低 | 低 | 只添加一个图标依赖，与 antd 无冲突 |
| Canvas 验证码配色适配后看不清 | 低 | 低 | Canvas 是管理后台专用，留出高对比度保证可读性 |

### 5.5 验收标准

- [ ] `design-tokens.css` 全部变量替换为 v1.0 色值
- [ ] 桌面端启动后 Ant Design 组件呈现暗色主题
- [ ] MainLayout = 48px TopBar + 48px IconDock + 28px StatusBar
- [ ] ⌘K 弹出命令面板，可搜索跳转
- [ ] IconDock 7 个图标 Tooltip 正确，点击导航正常
- [ ] AI 办公室 (`/office`) 正常渲染（Pixi.js canvas），不被遮盖
- [ ] 三端登录页视觉统一：暗色卡片 + 蓝紫品牌按钮 + 无动画
- [ ] Landing 页 `data.ts` 结构与原数组一致
- [ ] Landing 页 10 个 section 渲染完整，滚动入场正常
- [ ] 管理后台 Canvas 验证码可见可点击
- [ ] 无 console error（除已有无关 error）

---

## 📋 设计总结

| Block | 内容 | 状态 |
|-------|------|------|
| #1 | 设计 Token | ✅ |
| #2 | MainLayout 壳层 | ✅ |
| #3 | 三端登录 | ✅ |
| #4 | Landing 可配置化 | ✅ |
| #5 | 总览 + 实施顺序 | ✅ |

**全量 21 文件 / 4 阶段 / 预估 ~110 分钟**

---

👉 **design.md 全部产出完成。确认后进入 Superpowers 阶段 3：Implementation Planning（plan.md）。**
