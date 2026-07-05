# 采用深瞳AI首页设计方案 Spec

## Why
用户提供了一份完整的设计方案文档（`D:\AI Agent\首页设计方案-深瞳AI.md`），需要将 Landing Page 完全按照该方案重构，采用纯黑+金黄配色、10 段式结构、深灰实色卡片。

## What Changes
- **BREAKING**: 完全重构 Landing Page，替换现有的 9 段式青色科技风格
- 配色系统从青色/紫色改为纯黑(#0a0a0a) + 金黄(#f5c518)
- 卡片从半透明渐变改为深灰实色(#141414) + #2a2a2a 边框
- 页面结构改为 10 段：导航栏 → Hero → 基座双卡 → 组织架构 → 业务飞轮 → 协作网络 → 技术底座 → 适用场景 → CTA → 页脚
- 移除粒子背景（方案未提及）
- 采用方案中定义的字体规范、间距系统、动画效果

## Impact
- Affected code: `src/pages/Landing/index.tsx`, `src/pages/Landing/styles.module.css`

## ADDED Requirements

### Requirement: 10 段式首页结构
Landing Page 必须按顺序包含 10 个区块：Navbar、Hero、Foundation(OpenClaw+Hermes)、Organization(8大员工)、BusinessFlywheel(五步闭环)、Collaboration(12条数据流)、TechInfrastructure(三大设施)、Industries(12个行业)、CTA、Footer。

### Requirement: 金黄配色系统
- 主背景: #0a0a0a
- 卡片背景: #141414
- 卡片边框: #2a2a2a
- 主强调色: #f5c518 (金黄)
- 次强调色: #4a9eff (蓝)
- 成功色: #22c55e (绿)
- 文字主色: #ffffff
- 文字次色: #a0a0a0

### Requirement: Hero 区域
- 金黄标签: "OpenClaw + Hermes 基座 · 8大AI员工 · 真实项目闭环运营"
- 主标题: "打造AI自动化公司" / "8大AI员工 24h 自主工作"（第二行金黄）
- 4 项数据统计: 8核心 / 24/7全自动 / 1人启动 / ∞扩展
- CTA 按钮: "探索AI团队架构 ↓"（金黄大按钮）

### Requirement: 基座双卡区域
- OpenClaw 卡片: AI RUNTIME, 4 条特性
- Hermes 卡片: ORCHESTRATION, 4 条特性
- 闭环运行流程图: OpenClaw → Hermes → 8大AI员工 → n8n → 飞书

### Requirement: 组织架构区域
- CEO 决策层（金黄边框）→ 5 个核心层 → 6 个执行层
- 每个卡片: 图标、名称、角色、能力标签
- 核心标签: "核心" 金黄徽章

### Requirement: 业务飞轮区域
- 5 步闭环: 公域获客 → 私域沉淀 → 销售转化 → 交付成功 → 复购裂变
- 步骤卡片带编号、图标、英文标注、负责智能体标签
- 详情面板展示第1步的具体执行动作

### Requirement: 协作网络区域
- 6 组数据流卡片（CEO→秘书、秘书→所有Agent 等）
- 3 个基础设施卡（飞书表格、IM通讯、n8n自动化）

### Requirement: 技术底座区域
- 3 张技术卡: OpenClaw+Hermes基座 / n8n自动化 / 飞书多维表格
- 技术栈标签栏: 6 个技术项

### Requirement: 适用场景区域
- 12 个行业卡片（4列×3行）
- 每卡: 图标 + 行业名 + 英文名
- 底部提示: "不只是这12个行业"

### Requirement: CTA + Footer
- CTA: 行动号召区域
- Footer: 品牌信息 + 链接 + 版权

#### Scenario: 用户浏览首页
- **WHEN** 用户打开 Landing Page
- **THEN** 页面纯黑背景，金黄强调色
- **AND** 从上到下依次显示 10 个区块
- **AND** 品牌名为"深瞳AI"
