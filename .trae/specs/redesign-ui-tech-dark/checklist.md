# Checklist

## 阶段一：设计系统
- [x] variables.css 主色为 #6366f1，辅助色为 #8b5cf6
- [x] variables.css 包含 --gradient-brand、--color-glow、--shadow-sm/md/lg/glow
- [x] variables.css 包含 --sidebar-bg、--sidebar-text、--sidebar-active
- [x] variables.css 字体栈以 HarmonyOS Sans / 思源黑体优先
- [x] theme.ts primaryColor 与 variables.css 一致
- [x] App.tsx ConfigProvider colorPrimary 为 #6366f1

## 阶段二：MainLayout
- [x] 侧边栏背景为 #0f172a，文字为浅色
- [x] Logo 区显示渐变图标 + 渐变文字
- [x] 当前路由对应导航项左侧有 3px 渐变高亮条
- [x] 导航项 hover 显示玻璃态背景
- [x] 侧边栏底部显示用户卡片（avatar + username + 角色）
- [x] Header 应用 backdrop-filter blur 玻璃态
- [x] Header 包含通知图标和全局搜索入口
- [x] 内容区背景为浅灰渐变
- [x] 移动端 Drawer 头部显示品牌视觉

## 阶段三：Login
- [x] 桌面端显示左右分屏（左侧品牌视觉 + 右侧登录卡片）
- [x] 左侧包含产品标语和渐变光晕装饰
- [x] 登录卡片有玻璃态边框和微发光阴影
- [x] 登录按钮为品牌渐变背景
- [x] 移动端单卡片 + 顶部品牌头

## 阶段四：Dashboard
- [x] 顶部欢迎横幅为品牌渐变背景
- [x] 横幅显示时间问候语（早/午/晚）+ 用户名 + 当前日期
- [x] 统计卡片包含图标色块 + 数值 + 占位趋势
- [x] 统计卡片 hover 有 lift 动效
- [x] 包含 4 个快捷入口卡片（创建 Agent / 新建对话 / 上传知识库 / 浏览市场）
- [x] 包含最近活动占位列表

## 阶段五：业务卡片
- [x] AgentMarket 卡片顶部有渐变封面色块
- [x] AgentMarket avatar 居中浮起于封面之上
- [x] AgentMarket 卡片 hover 为 translateY -4px + shadow-glow
- [x] KnowledgeList 卡片有左侧图标色块
- [x] KnowledgeList 卡片有文档数徽章
- [x] KnowledgeList hover 动效与 AgentMarket 一致
- [x] AgentDetail / KnowledgeDetail 的 Descriptions 有圆角容器 + 阴影
- [x] UserCenter 左侧 Menu 为深色背景

## 阶段六：动效与滚动条
- [x] 路由切换有 fade-in 200ms 动效
- [x] 列表项有 stagger 入场动效
- [x] 滚动条宽度为 8px，有圆角，hover 加深
- [x] 深色侧边栏滚动条配色与侧边栏背景协调

## 阶段七：验证
- [x] 所有修改文件 GetDiagnostics 0 错误
- [x] dev server 启动无报错
- [x] 浏览器预览登录页、Dashboard、AgentMarket、KnowledgeList 视觉符合预期
- [x] 主题切换（light/dark）功能正常，侧边栏始终保持深色品牌一致
- [x] 移动端响应式（< 768px）布局正常
