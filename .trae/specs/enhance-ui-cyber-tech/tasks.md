# Tasks

## 阶段一：配色系统重做

- [x] Task 1: 重写 CSS 变量为赛博科技配色
  - [x] SubTask 1.1: 修改 `src/styles/variables.css`，主色改为 #00d4ff，辅助色 #b026ff，深色背景 #0a0e27
  - [x] SubTask 1.2: 品牌渐变改为 `linear-gradient(135deg, #00d4ff 0%, #b026ff 100%)`，发光色改为青/紫双色
  - [x] SubTask 1.3: 侧边栏变量同步：--sidebar-bg 改为 #0a0e27，--sidebar-bg-active 改为 rgba(0, 212, 255, 0.15)
  - [x] SubTask 1.4: 新增 --color-accent: #00ff88（数据流绿，用于成功/活跃强调）

## 阶段二：全局动效 keyframes

- [x] Task 2: 新增赛博科技动效 keyframes 与工具类
  - [x] SubTask 2.1: 修改 `src/styles/global.css`，新增 @keyframes scanline（扫光线横扫 3s）
  - [x] SubTask 2.2: 新增 @keyframes particle-float（粒子悬浮 6s 循环）
  - [x] SubTask 2.3: 新增 @keyframes grid-move（网格透视移动 20s 循环）
  - [x] SubTask 2.4: 新增 @keyframes border-flow（流光边框环绕 2s）
  - [x] SubTask 2.5: 新增 @keyframes glow-pulse（发光脉冲 2s）+ count-up 相关样式
  - [x] SubTask 2.6: 新增工具类 .scanline / .grid-bg / .neon-text / .holo-icon

## 阶段三：Mock 演示登录系统

- [x] Task 3: 实现 Mock 演示登录
  - [x] SubTask 3.1: 新建 `src/utils/mock-data.ts`，导出 mockUser / mockSessions / mockAgents / mockKnowledge 等静态数据
  - [x] SubTask 3.2: 修改 `src/api/auth.ts`，新增 mockLogin() 函数返回 mock token + user
  - [x] SubTask 3.3: 修改 `src/utils/request.ts`，请求拦截器识别 demo-token-not-real，直接返回 mock-data 中对应数据（不发网络请求）
  - [x] SubTask 3.4: 修改 `src/pages/Login/index.tsx`，新增"演示模式登录"次要按钮，调用 mockLogin

## 阶段四：Login 页赛博风升级

- [x] Task 4: Login 页赛博科技感升级
  - [x] SubTask 4.1: 修改 `src/pages/Login/styles.module.css`，左侧背景改为深空黑 + 透视网格 + 粒子悬浮
  - [x] SubTask 4.2: 标题"深瞳 AI"改为霓虹文字（青色 text-shadow 多层发光）
  - [x] SubTask 4.3: "智能中中台 / 洞察未来"加扫光动画（gradient 流动）
  - [x] SubTask 4.4: 顶部加 2px 扫光线（::before 伪元素 + scanline 动画）
  - [x] SubTask 4.5: 登录按钮加强发光 + hover 流光边框
  - [x] SubTask 4.6: "演示模式登录"按钮样式：虚线边框 + 青色发光 + hover 填充

## 阶段五：MainLayout 赛博增强

- [x] Task 5: MainLayout 网格纹理 + 流光高亮条
  - [x] SubTask 5.1: 修改 `src/components/MainLayout/styles.module.css`，侧边栏背景叠加微弱网格纹理
  - [x] SubTask 5.2: 导航 active 高亮条改为流光动画（gradient 流动 border-flow）
  - [x] SubTask 5.3: Logo 图标加 hover 旋转 + 发光脉冲（holo-icon 类）
  - SubTask 5.4: Header 顶部加 2px 扫光线（全局，可选放 global.css）

## 阶段六：Dashboard 粒子 + 数字滚动

- [x] Task 6: Dashboard 科技感增强
  - [x] SubTask 6.1: 修改 `src/pages/Dashboard/styles.module.css`，欢迎横幅加粒子悬浮 + 网格背景
  - [x] SubTask 6.2: 修改 `src/pages/Dashboard/index.tsx`，统计数字实现滚动入场（useEffect + requestAnimationFrame 从 0 到目标值）
  - [x] SubTask 6.3: 统计卡片加发光边框 + hover 光晕扩散
  - [x] SubTask 6.4: 快捷入口图标加 holo-icon 类（全息渐变 + hover 旋转）

## 阶段七：业务卡片流光边框

- [x] Task 7: AgentMarket + KnowledgeList 卡片流光边框
  - [x] SubTask 7.1: 修改 `src/pages/agent/AgentMarket/styles.module.css`，卡片 hover 加流光边框动画（::after 伪元素 border-flow）
  - [x] SubTask 7.2: 卡片 hover 加光晕扩散（径向发光从中心扩散）
  - [x] SubTask 7.3: 封面色块加 inset glow（内部光晕）
  - [x] SubTask 7.4: 修改 `src/pages/knowledge/KnowledgeList/styles.module.css`，同步卡片流光边框 + 光晕扩散

## 阶段八：验证

- [x] Task 8: GetDiagnostics 验证 + 演示模式浏览器预览
  - [x] SubTask 8.1: 所有修改文件 GetDiagnostics 0 错误
  - [x] SubTask 8.2: dev server 重启，使用演示模式登录验证所有页面视觉效果

# Task Dependencies

- Task 2 依赖 Task 1（动效用新配色变量）
- Task 4 依赖 Task 1 + Task 2（Login 用新配色 + 新动效）
- Task 5 依赖 Task 1 + Task 2（MainLayout 用新配色 + 新动效）
- Task 6 依赖 Task 1 + Task 2（Dashboard 用新配色 + 新动效）
- Task 7 依赖 Task 1 + Task 2（卡片用新配色 + 新动效）
- Task 3 可与 Task 1/2 并行（Mock 系统独立于样式）
- Task 8 依赖所有前置任务完成
