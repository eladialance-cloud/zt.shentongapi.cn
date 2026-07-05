# Checklist

## 阶段一：配色系统
- [x] variables.css 主色为 #00d4ff，辅助色为 #b026ff
- [x] variables.css --gradient-brand 为 linear-gradient(135deg, #00d4ff 0%, #b026ff 100%)
- [x] variables.css 深色背景 --sidebar-bg 为 #0a0e27
- [x] variables.css 新增 --color-accent: #00ff88
- [x] 发光色为青/紫双色（rgba(0,212,255,0.5) / rgba(176,38,255,0.5)）

## 阶段二：全局动效
- [x] global.css 包含 @keyframes scanline（扫光线横扫 3s）
- [x] global.css 包含 @keyframes particle-float（粒子悬浮 6s）
- [x] global.css 包含 @keyframes grid-move（网格移动 20s）
- [x] global.css 包含 @keyframes border-flow（流光边框 2s）
- [x] global.css 包含 @keyframes glow-pulse（发光脉冲 2s）
- [x] global.css 包含工具类 .scanline / .grid-bg / .neon-text / .holo-icon

## 阶段三：Mock 演示登录
- [x] 存在 src/utils/mock-data.ts 导出 mockUser + 业务 mock 数据
- [x] api/auth.ts 包含 mockLogin() 函数
- [x] request.ts 拦截器识别 demo-token-not-real 返回 mock 数据
- [x] Login 页包含"演示模式登录"按钮
- [x] 点击演示登录后跳转 Dashboard 且所有页面可浏览

## 阶段四：Login 赛博风
- [x] 左侧背景为深空黑 + 透视网格 + 粒子悬浮
- [x] "深瞳 AI"标题为霓虹发光文字
- [x] "智能中台 / 洞察未来"有扫光动画
- [x] 顶部有 2px 扫光线
- [x] 登录按钮有强发光 + hover 流光边框
- [x] "演示模式登录"按钮为虚线边框 + 青色发光

## 阶段五：MainLayout
- [x] 侧边栏背景叠加微弱网格纹理
- [x] 导航 active 高亮条为流光动画
- [x] Logo 图标 hover 有旋转 + 发光脉冲
- [x] Header 顶部有 2px 扫光线

## 阶段六：Dashboard
- [x] 欢迎横幅有粒子悬浮 + 网格背景
- [x] 统计数字从 0 滚动到目标值（1s 动画）
- [x] 统计卡片有发光边框 + hover 光晕扩散
- [x] 快捷入口图标有全息渐变 + hover 旋转

## 阶段七：业务卡片
- [x] AgentMarket 卡片 hover 有流光边框环绕
- [x] AgentMarket 卡片 hover 有光晕扩散
- [x] AgentMarket 封面色块有内部光晕
- [x] KnowledgeList 卡片 hover 有流光边框 + 光晕扩散

## 阶段八：验证
- [x] 所有修改文件 GetDiagnostics 0 错误
- [x] dev server 启动无报错
- [x] 演示模式登录后浏览器预览各页面科技感符合预期
- [x] 主题切换（light/dark）功能正常
- [x] 移动端响应式布局正常
