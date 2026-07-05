# 深瞳 AI 用户前台 UI 美化 Spec

## Why

当前用户前台采用 Ant Design 默认风格 + 标准蓝紫主题（`#1677ff`），视觉表达单薄、品牌识别度低：侧边栏纯白朴素、卡片无视觉重点、Dashboard 仅为占位页、Login 渐变背景过于普通。作为"深瞳 AI 智能中台"产品前台，需要建立科技感深色品牌视觉系统，提升专业感与产品调性，统一全站设计语言。

## What Changes

### 设计系统层
- 品牌主色由 `#1677ff` 调整为靛蓝 `#6366f1`（indigo-500），辅助色由 `#722ed1` 调整为紫 `#8b5cf6`（violet-500）
- 新增品牌渐变 `linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)` 与发光色 `rgba(99, 102, 241, 0.4)`
- 新增 4 级阴影层级（shadow-sm/md/lg/glow），shadow-glow 用于强调元素发光
- 字体栈引入 HarmonyOS Sans / 思源黑体优先（中文优化），Inter 作为西文 fallback
- 圆角体系扩展为 6/8/12/16 四级
- 动效曲线统一为 `cubic-bezier(0.4, 0, 0.2, 1)`，时长 200ms（标准）/ 300ms（强调）

### MainLayout 重塑
- 侧边栏改为深色背景（`#0f172a` slate-900），宽度 220px 保持
- Logo 区品牌化：渐变机器人图标 + "深瞳 AI" 渐变文字 + 发光底色
- 导航项 active 状态：左侧 3px 渐变高亮条 + 玻璃态背景 + 文字高亮
- 导航项 hover：浅玻璃态背景
- 侧边栏底部新增用户卡片（avatar + username + 角色标签）
- Header 改为玻璃态（`backdrop-filter: blur(12px)` + 半透明白底）+ 增加通知图标 + 全局搜索入口（非功能性占位）
- 内容区背景改为浅灰渐变 `linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)`

### Login 页升级
- 桌面端改为左右分屏：左侧 50% 深色品牌视觉（产品标语 + 几何装饰 + 渐变光晕），右侧 50% 居中登录卡片
- 移动端：单卡片 + 顶部品牌头（渐变图标 + "深瞳 AI"）
- 登录卡片加入玻璃态边框 + 微发光阴影
- 提交按钮改为品牌渐变背景

### Dashboard 重做
- 顶部欢迎横幅：品牌渐变背景 + 时间问候语（"早上好/下午好/晚上好" + 用户名）+ 当前日期
- 统计卡片升级：左侧图标色块（4 种品牌色）+ 数值 + 占位趋势文字 + hover lift 动效
- 新增"快捷入口"卡片网格：创建 Agent / 新建对话 / 上传知识库 / 浏览市场（4 个入口卡片，icon + 标题 + 描述）
- 新增"最近活动"占位列表（mock 数据 + 时间戳）

### 业务卡片统一升级
- **AgentMarket 卡片**：顶部 80px 渐变封面色块（按 category 哈希配色）+ avatar 居中浮起 + hover translateY -4px + shadow-glow + 价格徽章升级
- **KnowledgeList 卡片**：左侧图标色块（按文档数变色）+ 文档数徽章 + 状态 Tag 升级 + hover 动效
- **AgentDetail / KnowledgeDetail**：Descriptions 区块加圆角容器 + 阴影
- **UserCenter**：左侧 Menu 改为深色背景对齐侧边栏风格

### 全局动效
- 路由切换：内容区 fade-in 200ms
- 列表项 stagger 入场：每项 50ms 延迟，最多 8 项后不再延迟
- 卡片 hover：统一 lift + shadow-glow
- 滚动条加宽到 8px + 圆角 + hover 加深，深色侧边栏独立滚动条配色

### 响应式优化
- 移动端 Drawer 头部加品牌视觉（渐变 logo 区）
- 卡片网格在 xs 断点单列，sm 两列，md+ 三/四列

## Impact

- **Affected specs**: 
  - 用户前台视觉规范（开发文档-前端开发指南.md 2.1/2.2）
  - 主题切换机制（settings store dark/light）
- **Affected code**:
  - `src/styles/variables.css` - CSS 变量全面重写
  - `src/styles/theme.ts` - antd token 调整
  - `src/styles/global.css` - 滚动条 + 路由动效
  - `src/components/MainLayout/index.tsx` + `styles.module.css` - 侧边栏/Header 重塑
  - `src/pages/Login/index.tsx` + `styles.module.css` - 分屏布局
  - `src/pages/Dashboard/index.tsx` - 完全重写
  - `src/pages/agent/AgentMarket/index.tsx` + `styles.module.css` - 卡片升级
  - `src/pages/knowledge/KnowledgeList/index.tsx` + `styles.module.css` - 卡片升级
  - `src/pages/user/UserCenter/index.tsx` + `styles.module.css` - Menu 深色
  - `src/App.tsx` - ConfigProvider token 调整
- **影响主题切换**：dark 模式下侧边栏保持深色，light 模式下侧边栏仍为深色（品牌一致），仅内容区随主题切换

## ADDED Requirements

### Requirement: 品牌色系统
系统 SHALL 使用靛蓝（#6366f1）作为主色，紫（#8b5cf6）作为辅助色，并提供品牌渐变与发光色 token，供全站组件复用。

#### Scenario: 主色应用
- **WHEN** 开发者引用 `var(--color-primary)`
- **THEN** 取值为 `#6366f1`

#### Scenario: 品牌渐变可用
- **WHEN** 开发者引用 `var(--gradient-brand)`
- **THEN** 取值为 `linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)`

### Requirement: 深色侧边栏
MainLayout 的侧边栏 SHALL 使用深色背景（#0f172a），导航项 active 状态 SHALL 显示左侧 3px 渐变高亮条，hover 状态 SHALL 显示玻璃态背景。

#### Scenario: 当前路由高亮
- **WHEN** 用户访问 `/chat`
- **THEN** "对话"导航项左侧显示 3px 渐变条，文字高亮，背景为玻璃态

### Requirement: 路由切换动效
页面切换时 SHALL 应用 fade-in 动效，时长 200ms，缓动曲线 `cubic-bezier(0.4, 0, 0.2, 1)`。

#### Scenario: 路由跳转
- **WHEN** 用户从 `/` 跳转到 `/chat`
- **THEN** ChatCenter 内容区以 fade-in 200ms 出现

### Requirement: 卡片 hover 动效
所有业务卡片（Agent / Knowledge 等）hover 时 SHALL 上浮 4px 并显示发光阴影。

#### Scenario: 鼠标悬停 Agent 卡片
- **WHEN** 用户鼠标进入 AgentMarket 卡片
- **THEN** 卡片 translateY -4px，box-shadow 为发光阴影

### Requirement: Dashboard 欢迎横幅
Dashboard 顶部 SHALL 显示品牌渐变欢迎横幅，包含时间问候语、用户名、当前日期。

#### Scenario: 早上访问
- **WHEN** 用户在 06:00-12:00 访问 Dashboard
- **THEN** 横幅显示"早上好，{username}" + 当前日期

## MODIFIED Requirements

### Requirement: MainLayout 布局
侧边栏背景由白色改为深色（#0f172a），Header 改为玻璃态，内容区背景改为浅灰渐变。导航项 active 状态新增左侧高亮条。侧边栏底部新增用户卡片。

### Requirement: Login 页
登录页由单卡片改为左右分屏（桌面端），左侧为深色品牌视觉，右侧为登录卡片。移动端保留单卡片但加品牌头。

### Requirement: Dashboard 页
Dashboard 由占位页重做为完整工作台：欢迎横幅 + 统计卡片 + 快捷入口 + 最近活动列表。

### Requirement: AgentMarket 卡片
卡片新增顶部渐变封面色块，hover 动效由 translateY -2px 升级为 -4px + 发光阴影，价格徽章视觉升级。

## REMOVED Requirements

### Requirement: 纯白侧边栏
**Reason**: 改为深色侧边栏以建立科技感品牌视觉
**Migration**: `--sidebar-bg` 变量由 `#ffffff` 改为 `#0f172a`，依赖该变量的样式同步更新
