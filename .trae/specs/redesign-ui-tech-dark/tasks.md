# Tasks

## 阶段一：设计系统升级（基础层）

- [x] Task 1: 升级 CSS 变量系统
  - [x] SubTask 1.1: 修改 `src/styles/variables.css`，调整主色为 `#6366f1`、辅助色为 `#8b5cf6`
  - [x] SubTask 1.2: 新增品牌渐变 `--gradient-brand`、发光色 `--color-glow`、4 级阴影层级 `--shadow-sm/md/lg/glow`
  - [x] SubTask 1.3: 新增深色侧边栏专用变量 `--sidebar-bg`、`--sidebar-text`、`--sidebar-active`
  - [x] SubTask 1.4: 字体栈调整为 HarmonyOS Sans / 思源黑体优先，圆角扩展为 6/8/12/16

- [x] Task 2: 同步 antd theme token
  - [x] SubTask 2.1: 修改 `src/styles/theme.ts`，primaryColor 改为 `#6366f1`
  - [x] SubTask 2.2: 修改 `src/App.tsx` ConfigProvider token，colorPrimary 改为 `#6366f1`，新增 borderRadiusLG/colorBgLayout

## 阶段二：MainLayout 重塑（核心框架）

- [x] Task 3: 重塑侧边栏
  - [x] SubTask 3.1: 修改 `src/components/MainLayout/styles.module.css`，sidebar 背景改为 `#0f172a`，文字改为浅色
  - [x] SubTask 3.2: Logo 区品牌化：渐变图标 + 渐变文字 + 发光底色
  - [x] SubTask 3.3: 导航项 active 状态：左侧 3px 渐变高亮条 + 玻璃态背景
  - [x] SubTask 3.4: 导航项 hover 状态：浅玻璃态背景
  - [x] SubTask 3.5: 侧边栏底部新增用户卡片（avatar + username + 角色标签）

- [x] Task 4: 升级 Header
  - [x] SubTask 4.1: Header 改为玻璃态（backdrop-filter blur + 半透明白底）
  - [x] SubTask 4.2: 新增通知图标（Badge 占位）+ 全局搜索入口（Input.Search 非功能性占位）
  - [x] SubTask 4.3: 移动端 Drawer 头部加品牌视觉

- [x] Task 5: 内容区背景升级
  - [x] SubTask 5.1: content 背景改为浅灰渐变 `linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)`

## 阶段三：Login 页升级

- [x] Task 6: 改造 Login 页为左右分屏
  - [x] SubTask 6.1: 桌面端左侧 50% 深色品牌视觉（产品标语 + 几何装饰 + 渐变光晕）
  - [x] SubTask 6.2: 右侧 50% 居中登录卡片，加玻璃态边框 + 微发光阴影
  - [x] SubTask 6.3: 提交按钮改为品牌渐变背景
  - [x] SubTask 6.4: 移动端响应式：单卡片 + 顶部品牌头

## 阶段四：Dashboard 重做

- [x] Task 7: 重写 Dashboard 页
  - [x] SubTask 7.1: 顶部欢迎横幅（品牌渐变背景 + 时间问候语 + 当前日期）
  - [x] SubTask 7.2: 统计卡片升级（图标色块 + 数值 + 占位趋势 + hover lift）
  - [x] SubTask 7.3: 新增快捷入口卡片网格（4 个入口：创建 Agent / 新建对话 / 上传知识库 / 浏览市场）
  - [x] SubTask 7.4: 新增最近活动占位列表（mock 数据 + 时间戳）

## 阶段五：业务卡片统一升级

- [x] Task 8: 升级 AgentMarket 卡片
  - [x] SubTask 8.1: 卡片顶部新增 80px 渐变封面色块（按 category 哈希配色）
  - [x] SubTask 8.2: avatar 居中浮起于封面之上
  - [x] SubTask 8.3: hover 动效升级为 translateY -4px + shadow-glow
  - [x] SubTask 8.4: 价格徽章视觉升级

- [x] Task 9: 升级 KnowledgeList 卡片
  - [x] SubTask 9.1: 左侧图标色块（按文档数变色）
  - [x] SubTask 9.2: 文档数徽章 + 状态 Tag 升级
  - [x] SubTask 9.3: hover 动效对齐 AgentMarket

- [x] Task 10: 升级 Detail 页与 UserCenter
  - [x] SubTask 10.1: AgentDetail / KnowledgeDetail 的 Descriptions 区块加圆角容器 + 阴影
  - [x] SubTask 10.2: UserCenter 左侧 Menu 改为深色背景对齐侧边栏风格

## 阶段六：全局动效与滚动条

- [x] Task 11: 全局动效体系
  - [x] SubTask 11.1: 修改 `src/styles/global.css`，新增路由 fade-in 200ms keyframes
  - [x] SubTask 11.2: 列表项 stagger 入场动效（每项 50ms 延迟，最多 8 项）
  - [x] SubTask 11.3: 滚动条加宽到 8px + 圆角 + hover 加深，深色侧边栏独立滚动条配色

## 阶段七：验证

- [x] Task 12: GetDiagnostics 验证 + 浏览器预览
  - [x] SubTask 12.1: 所有修改文件 GetDiagnostics 0 错误
  - [x] SubTask 12.2: dev server 重启后浏览器验证各页面视觉效果

# Task Dependencies

- Task 2 依赖 Task 1（theme.ts 需对齐 variables.css）
- Task 3/4/5 可并行（MainLayout 三个区域独立）
- Task 6 依赖 Task 1（Login 用新品牌色）
- Task 7 依赖 Task 1（Dashboard 用新设计 token）
- Task 8/9/10 可并行（三个业务页面独立）
- Task 11 依赖 Task 1（动效用阴影/曲线变量）
- Task 12 依赖所有前置任务完成
