# 用户前台优化 - 实施计划

## [ ] Task 1: 创建Landing Page组件
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 参考D:\AI Agent\frontend\user\src\pages\Landing.tsx创建新的Landing Page组件
  - 创建Landing Page专用样式文件
  - 复用ParticleMatrix粒子矩阵背景组件
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement` TR-1.1: Landing Page包含英雄区、域面展示、工作流程、入口矩阵等模块
  - `human-judgement` TR-1.2: 粒子矩阵背景正常显示，鼠标交互效果正常
- **Notes**: 需要创建src/pages/Landing目录和相关文件

## [ ] Task 2: 修改路由配置，Landing Page作为首页
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 修改src/router/index.tsx，将Landing Page设置为根路径`/`（无需登录）
  - 登录后的Dashboard页面改为`/dashboard`路径
  - 更新导航链接指向
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 未登录访问`/`显示Landing Page
  - `programmatic` TR-2.2: 登录后访问`/`重定向至Dashboard
  - `programmatic` TR-2.3: Landing Page登录按钮跳转至`/login`
- **Notes**: 需要确保路由守卫逻辑正确，登录后能正常访问Dashboard

## [ ] Task 3: Dashboard页面添加双品牌名称
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 修改src/pages/Dashboard/index.tsx，在顶部横幅区域添加两个品牌名称
  - 设计品牌名称的展示样式，增强视觉效果
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement` TR-3.1: Dashboard顶部横幅显示两个品牌名称
  - `human-judgement` TR-3.2: 品牌名称样式与整体科技感设计风格一致
- **Notes**: 品牌名称假设为"深瞳AI"和"深境AI"，采用渐变效果展示

## [ ] Task 4: 优化顶部配色方案
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 修改src/components/MainLayout/styles.module.css，优化header区域配色
  - 增强顶部渐变发光效果，添加左右两侧的装饰元素
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: 顶部header配色方案优化，视觉效果提升
  - `human-judgement` TR-4.2: 顶部左右两侧有装饰性配色元素
- **Notes**: 参考Landing Page的渐变配色方案

## [ ] Task 5: 优化底部配色方案
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - 修改src/components/MainLayout/styles.module.css，优化侧边栏底部和用户卡片配色
  - 增强底部区域的视觉层次感和科技感
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgement` TR-5.1: 侧边栏底部配色方案优化
  - `human-judgement` TR-5.2: 用户卡片样式增强，视觉效果提升
- **Notes**: 保持与顶部配色的一致性