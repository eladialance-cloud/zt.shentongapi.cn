# 工作流模块三表合并改造 — 完成报告

## 目标
将三套分散的工作流系统合并为统一管理：
- `workflows` 表：只有 name + description
- `n8n_workflow_lib` 表：有 JSON 数据但无定价/审核流
- `n8n_workflows` 表：用户私有实例缓存

统一为 `workflows` 表（20 字段）。

## 已完成改造

### 后端（6 文件）
1. `workflow.entity.ts` — 重写：20 字段含 workflowJson(MEDIUMTEXT)/reviewStatus(enum)/publishStatus/engineType/pricePerExecution 等
2. `workflow.dto.ts` — 6 DTO：Create/Update/ImportGithub/Review/Query/Reject
3. `admin-workflow.service.ts` — 完整 CRUD + 审核流 + GitHub 导入(镜像加速+去重) + 执行链路(积分扣减+回滚)
4. `admin-workflow.controller.ts` — 15 端点：list/detail/create/update/delete/review(stats/execLogs/execute/importGithub)
5. `admin-workflow.module.ts` — 移除 N8nWorkflowLibEntity
6. `admin-user.service.ts` — 修复 phone: null→undefined 编译错误

### 前端（4 文件）
1. `admin-workflow.ts` — 全部类型接口对齐
2. `admin-workflow-api.ts` — 全部 API 函数
3. `Workflows/index.tsx` — 全新单页：5 Tab(草稿/待审核/已通过/已发布/已驳回) + 内联审核 + GitHub导入Modal + 编辑Modal + 详情Modal + 搜索/筛选
4. `api/index.ts` — 移除 admin-workflow-lib-api 导出冲突
5. `router/index.tsx` — 移除 workflows/review、workflows/stats 路由

### 编译验证
- 后端 tsc --noEmit：0 error ✅
- 前端 tsc --noEmit：0 error ✅

## 待处理（需确认后执行）
1. 删除废弃后端文件：N8nWorkflowLib Entity/Controller/Service（需确认路径）
2. 删除废弃前端文件：Workflows/Review.tsx、Workflows/Stats.tsx
3. 数据库 migration：workflows 表需加新列

## 下一个模块
待确认：工具栏 / 设置 / 公告？（design.md 中有完整列表）
