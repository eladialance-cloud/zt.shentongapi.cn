# 前端骨架补全 Spec

## Why
对照《开发文档-前端开发指南.md》(v1.0) 审查发现，当前用户前台骨架存在 7 类功能缺失，其中 OPC 模块完全空白、注册页缺失、用户中心 2 子页缺失、聊天模块 6 项增强功能未实现，无法满足指南要求的功能完整性。

## What Changes
- **新增 OPC 模块**：团队列表、团队详情、任务提交、任务看板、Agent 仓库 5 个页面 + API + Store + Types + 路由 + 导航入口
- **新增注册页**：`pages/Register/` 目录 + 路由 `/register`
- **新增会员页**：`pages/user/UserCenter/Membership.tsx` + 路由
- **新增收益页**：`pages/user/UserCenter/Revenue.tsx` + 路由
- **补全聊天模块**：会话分组、消息滚动加载、模型切换 UI、Agent 挂载 UI、知识库挂载 UI、插件启用 UI
- **新增 ChatMessage 公共组件**：从 ChatArea 中抽出消息渲染逻辑
- **新增 AgentCard 业务组件**：可复用的 Agent 卡片组件

## Impact
- Affected code: `src/router/index.tsx`, `src/components/MainLayout/index.tsx`, `src/pages/chat/`, `src/api/`, `src/store/`, `src/types/`, `src/components/`

## ADDED Requirements

### Requirement: OPC 模块（团队协作）
系统 SHALL 提供 OPC 模块，包含团队列表、团队详情、任务提交、任务看板、Agent 仓库 5 个页面，配备独立的 API、Store、Types 和路由。

#### Scenario: 用户访问 OPC
- **WHEN** 用户点击侧边栏"OPC协作"入口
- **THEN** 跳转至团队列表页，展示所属团队

### Requirement: 注册页
系统 SHALL 提供注册页面，路由为 `/register`，支持用户注册。

#### Scenario: 未注册用户注册
- **WHEN** 用户在登录页点击"注册"链接
- **THEN** 跳转至注册页，填写信息后可完成注册

### Requirement: 会员管理
系统 SHALL 在用户中心提供会员管理子页，展示会员等级、权益和开通入口。

### Requirement: 收益管理
系统 SHALL 在用户中心提供收益管理子页（创作者专用），展示收益统计、明细和提现入口。

### Requirement: 聊天模块增强
系统 SHALL 补全聊天模块的 6 项功能：会话分组、消息滚动加载、模型切换、Agent 挂载、知识库挂载、插件启用。

### Requirement: ChatMessage 公共组件
系统 SHALL 将消息渲染逻辑抽为 `components/ChatMessage/` 公共组件，遵循指南 7.1 节业务组件复用原则。

### Requirement: AgentCard 业务组件
系统 SHALL 创建 `components/AgentCard/` 可复用业务组件，遵循指南 7.2 节示例。
