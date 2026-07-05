# 用户前台优化 - 产品需求文档

## Overview
- **Summary**: 优化用户前台体验，包括：1）添加网页介绍页面（Landing Page）作为首页，参考D:\AI Agent的页面设计；2）在登录后的Dashboard页面展示两个品牌名称；3）重新优化页面顶部和底部左右两边的配色方案，提升科技感视觉效果。
- **Purpose**: 提升用户首次访问体验，增强品牌识别度，优化整体视觉设计
- **Target Users**: 所有访问网站的用户

## Goals
- [x] 添加网页介绍页面（Landing Page），作为用户打开网页时的第一个页面
- [x] 在登录后的Dashboard页面展示两个品牌名称
- [x] 重新优化页面顶部和底部左右两边的配色方案

## Non-Goals (Out of Scope)
- [ ] 不修改后端API接口
- [ ] 不添加新的业务功能模块
- [ ] 不修改登录页面的核心逻辑

## Background & Context
- 当前项目基于React 18 + TypeScript + Vite 5 + Ant Design 5
- 参考页面D:\AI Agent\frontend\user\src\pages\Landing.tsx包含完整的Landing Page实现，包括粒子矩阵背景、英雄区、域面展示、工作流程、入口矩阵等模块
- 当前路由配置中，根路径`/`直接指向受保护的Dashboard页面
- 配色方案已定义在src/styles/variables.css中，采用电光青#00d4ff和霓虹紫#b026ff的赛博科技感双色霓虹视觉系统

## Functional Requirements
- **FR-1**: 用户打开网页默认进入Landing Page（无需登录），展示网站介绍内容
- **FR-2**: 登录成功后跳转至Dashboard页面，页面顶部展示两个品牌名称
- **FR-3**: 重新优化MainLayout组件的顶部和底部配色，增强科技感视觉效果

## Non-Functional Requirements
- **NFR-1**: Landing Page需保持与参考页面一致的科技感设计风格
- **NFR-2**: 页面加载性能良好，粒子动画不影响页面响应
- **NFR-3**: 响应式设计适配移动端和桌面端

## Constraints
- **Technical**: 开发必须在d:\二次开发\frontend\user目录下进行，不修改原始D:\AI Agent代码
- **Technical**: 所有TypeScript文件必须通过GetDiagnostics零类型错误检查
- **Technical**: CSS必须使用CSS Modules

## Assumptions
- [x] 用户使用现代浏览器（支持CSS backdrop-filter、Grid等特性）
- [x] 参考页面的ParticleMatrix组件可以复用

## Acceptance Criteria

### AC-1: Landing Page作为首页
- **Given**: 用户未登录状态下访问网站根路径
- **When**: 用户打开网页
- **Then**: 显示Landing Page介绍页面，包含英雄区、域面展示、工作流程等模块
- **Verification**: `human-judgment`

### AC-2: Landing Page可导航至登录页面
- **Given**: 用户在Landing Page
- **When**: 用户点击登录按钮
- **Then**: 跳转至/login页面
- **Verification**: `programmatic`

### AC-3: Dashboard展示双品牌名称
- **Given**: 用户已登录并进入Dashboard页面
- **When**: 页面加载完成
- **Then**: 顶部横幅区域展示两个品牌名称（深瞳AI和深境AI）
- **Verification**: `human-judgment`

### AC-4: 顶部配色优化
- **Given**: 用户已登录进入任意页面
- **When**: 查看页面顶部区域
- **Then**: 顶部header采用优化后的配色方案，包含渐变发光效果
- **Verification**: `human-judgment`

### AC-5: 底部配色优化
- **Given**: 用户已登录进入任意页面
- **When**: 查看页面底部区域（用户卡片、侧边栏底部）
- **Then**: 底部区域采用优化后的配色方案，增强视觉层次感
- **Verification**: `human-judgment`

## Open Questions
- [ ] 两个品牌名称的具体内容是什么？（假设为"深瞳AI"和"深境AI"）
- [ ] 是否需要在Landing Page中添加注册功能？（参考页面有注册按钮）