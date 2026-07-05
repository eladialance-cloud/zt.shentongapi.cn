# 深瞳 AI 用户前台 赛博科技感增强 Spec

## Why

上一轮 `redesign-ui-tech-dark` 完成了基础深色品牌升级，但用户反馈"没有科技感"：配色偏商务紫（#6366f1/#8b5cf6）缺乏未来感、动效仅 fade-in/stagger 过于基础、细节缺少科技纹理与发光质感。同时后端未启动导致无法登录查看实际页面效果，需要演示模式绕过登录。

本 spec 在现有代码基础上进行**赛博科技感增强**：引入深空黑 + 电光青/霓虹紫双色霓虹配色、网格纹理 + 粒子悬浮 + 扫光流动动效、发光边框 + 全息图标质感升级，并新增 Mock 演示登录模式。

## What Changes

### 配色系统重做（BREAKING）
- 主背景：深空黑 `#0a0e27`（取代 `#0f172a` slate-900）
- 品牌主色：电光青 `#00d4ff`（取代 `#6366f1` 靛蓝）
- 品牌辅助色：霓虹紫 `#b026ff`（取代 `#8b5cf6` 紫）
- 强调色（成功/活跃）：数据流绿 `#00ff88`
- 警示色：电光红 `#ff0080`
- 品牌渐变：`linear-gradient(135deg, #00d4ff 0%, #b026ff 100%)`（青紫双色霓虹）
- 发光色：`rgba(0, 212, 255, 0.5)`（青）+ `rgba(176, 38, 255, 0.5)`（紫）

### 动效体系升级
- **扫光线动画**：页面顶部 2px 流光横扫（青紫渐变，3s 循环）
- **粒子悬浮背景**：Login 左侧 + Dashboard 横幅加 CSS 粒子点阵悬浮动画
- **网格背景动画**：Login 左侧 + 侧边栏加透视网格缓慢移动
- **hover 光晕扩散**：卡片 hover 时径向发光从中心扩散
- **数字滚动效果**：Dashboard 统计数字从 0 滚动到目标值（CSS counter 或简单 JS）
- **流光边框**：卡片 hover 时边缘流光环绕动画

### 细节质感增强
- **网格纹理背景**：全局内容区加微弱 grid pattern（10% 透明度）
- **发光边框**：active 导航项 + 主按钮加多层 text-shadow/box-shadow 发光
- **全息图标**：Logo + 快捷入口图标加渐变 + 发光 + 微旋转 hover
- **霓虹文字**：标题文字加多层 text-shadow 实现霓虹发光
- **扫描线效果**：卡片 hover 时一道横线从上扫下
- **玻璃态升级**：Header + 卡片加渐变边框（border-image 或 ::before）

### Mock 演示登录模式
- Login 页新增"演示模式登录"按钮（次要按钮，位于主登录按钮下方）
- 点击后跳过真实 API，直接 mock 一个 demo token + demo user 进入系统
- Mock 用户：`{ id: 0, username: '演示用户', role: 'user', points: 9999, avatar: '' }`
- Mock token：`'demo-token-not-real'`（前端标记，所有 API 请求会被拦截器识别并 mock 响应）
- 演示模式下所有 API 请求返回 mock 数据（在 request 拦截器识别 demo-token 返回静态数据）

### 页面具体增强

#### Login 页
- 左侧背景：深空黑 + 透视网格动画 + 粒子悬浮 + 顶部扫光线
- 标题"深瞳 AI"改为霓虹文字（青色发光 + 紫色阴影）
- "智能中台 / 洞察未来"加扫光动画（gradient text 流动）
- 登录按钮：渐变 + 强发光 + hover 流光边框
- 新增"演示模式登录"按钮（虚线边框 + 青色发光）

#### MainLayout
- 侧边栏背景加微弱网格纹理（叠加在深空黑上）
- 导航 active 项：3px 高亮条改为流光动画（渐变流动）
- Logo 区加全息效果（图标 hover 旋转 + 发光脉冲）
- 用户卡片加扫描线 hover 效果

#### Dashboard
- 欢迎横幅：深空黑 + 粒子悬浮 + 网格 + 渐变叠加
- 统计数字：滚动入场动画（0 → 目标值，1s）
- 统计卡片：发光边框 + hover 光晕扩散
- 快捷入口图标：全息渐变 + hover 旋转

#### 业务卡片（AgentMarket / KnowledgeList）
- 卡片边框：1px 微透明 + hover 时流光边框动画
- hover：光晕扩散 + 扫描线 + translateY -4px
- 封面色块：加内部光晕（inset glow）

## Impact

- **Affected specs**: redesign-ui-tech-dark（配色 token 全部覆盖）
- **Affected code**:
  - `src/styles/variables.css` - 配色 token 全面重写（青紫霓虹）
  - `src/styles/global.css` - 新增扫光线/粒子/网格 keyframes + 工具类
  - `src/pages/Login/index.tsx` + `styles.module.css` - 赛博风左侧 + 演示模式按钮
  - `src/components/MainLayout/styles.module.css` - 侧边栏网格纹理 + 流光高亮条
  - `src/pages/Dashboard/index.tsx` + `styles.module.css` - 粒子背景 + 数字滚动
  - `src/pages/agent/AgentMarket/styles.module.css` - 流光边框 + 光晕扩散
  - `src/pages/knowledge/KnowledgeList/styles.module.css` - 同步卡片动效
  - `src/api/auth.ts` - 新增 mockLogin 函数
  - `src/store/auth.ts` - login 支持 mock 模式标记
  - `src/utils/request.ts` - 拦截器识别 demo-token 返回 mock 数据
  - `src/utils/mock-data.ts` - **新增** mock 数据集合

## ADDED Requirements

### Requirement: 赛博科技感配色
系统 SHALL 使用电光青 `#00d4ff` 作为主色，霓虹紫 `#b026ff` 作为辅助色，深空黑 `#0a0e27` 作为深色背景，提供双色霓虹渐变 token。

#### Scenario: 主色应用
- **WHEN** 开发者引用 `var(--color-primary)`
- **THEN** 取值为 `#00d4ff`

#### Scenario: 双色霓虹渐变
- **WHEN** 开发者引用 `var(--gradient-brand)`
- **THEN** 取值为 `linear-gradient(135deg, #00d4ff 0%, #b026ff 100%)`

### Requirement: 扫光线动效
全局顶部 SHALL 显示 2px 流光横扫动画，使用青紫渐变，3s 循环，作为科技感装饰元素。

#### Scenario: 页面加载
- **WHEN** 用户访问任意页面
- **THEN** 顶部出现 2px 流光从左到右横扫，3s 循环

### Requirement: 粒子悬浮背景
Login 左侧品牌区与 Dashboard 欢迎横幅 SHALL 显示粒子点阵悬浮动画，粒子数量不少于 20 个，缓慢上下浮动。

#### Scenario: Login 页加载
- **WHEN** 用户访问 /login
- **THEN** 左侧品牌区出现粒子悬浮 + 透视网格背景

### Requirement: 演示模式登录
Login 页 SHALL 提供"演示模式登录"按钮，点击后跳过真实 API，直接以 mock 用户身份进入系统，所有 API 请求返回 mock 数据。

#### Scenario: 演示登录
- **WHEN** 用户点击"演示模式登录"按钮
- **THEN** 系统以 demo 用户登录，跳转到 Dashboard，所有页面可浏览

#### Scenario: 演示模式 API 响应
- **WHEN** 演示模式下发起 API 请求（token 为 demo-token-not-real）
- **THEN** request 拦截器识别 token 并返回对应 mock 数据，不发送真实网络请求

### Requirement: 数字滚动动画
Dashboard 统计卡片数值 SHALL 从 0 滚动到目标值，动画时长 1s，缓动曲线 ease-out。

#### Scenario: Dashboard 加载
- **WHEN** 用户进入 Dashboard
- **THEN** 统计数字从 0 滚动到目标值（如 0 → 128）

### Requirement: 流光边框动效
业务卡片 hover 时 SHALL 显示边缘流光环绕动画，使用青紫渐变，2s 循环。

#### Scenario: 卡片 hover
- **WHEN** 用户鼠标悬停 AgentMarket 卡片
- **THEN** 卡片边缘出现流光环绕动画

## MODIFIED Requirements

### Requirement: 品牌色系统
配色由靛蓝紫（#6366f1/#8b5cf6）改为电光青/霓虹紫（#00d4ff/#b026ff），深色背景由 slate-900（#0f172a）改为深空黑（#0a0e27）。

### Requirement: Login 页
左侧品牌区由静态渐变改为动态赛博风（网格 + 粒子 + 扫光），新增演示模式登录按钮。

### Requirement: MainLayout 侧边栏
侧边栏背景加网格纹理叠加，导航 active 高亮条改为流光动画。

### Requirement: Dashboard 页
欢迎横幅加粒子悬浮 + 网格背景，统计数字加滚动入场动画。

### Requirement: 业务卡片 hover 动效
卡片 hover 由 translateY -4px + 静态发光阴影升级为 translateY -4px + 流光边框环绕 + 光晕扩散。

## REMOVED Requirements

### Requirement: 靛蓝紫配色
**Reason**: 改为电光青/霓虹紫双色霓虹以增强科技感
**Migration**: `--color-primary` 由 `#6366f1` 改为 `#00d4ff`，`--color-secondary` 由 `#8b5cf6` 改为 `#b026ff`，依赖该变量的样式自动跟随
