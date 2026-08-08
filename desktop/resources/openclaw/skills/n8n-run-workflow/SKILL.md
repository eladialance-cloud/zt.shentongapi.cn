---
name: n8n-run-workflow
description: 当用户需要执行确定性操作（发邮件、查数据库、同步数据、生成报表、调用外部系统等）时，调用本地 N8N 工作流。参数：workflow-id（管理后台工作流 ID，必填）、payload（JSON 参数，可选）、path（N8N Webhook 路径，可选，默认等于 workflow-id）。
metadata:
  {
    "openclaw":
      {
        "emoji": "⚙️",
        "requires": { "env": ["N8N_API_KEY"] },
      },
  }
---

# N8N 工作流执行

调用本地 N8N（127.0.0.1:5678）执行工作流。

## 用法

```bash
node <skill_dir>/scripts/n8n-run-workflow.mjs --workflow-id "<ID>" --payload '<json>'
```

## 说明

- 工作流执行前会向云端记账（按管理后台为该工作流设定的「每次执行积分」扣费；定价为 0 表示免费）。
- 记账失败（未登录/离线/余额不足）会返回错误，工作流不会执行。
- 成功后输出工作流返回的 JSON 结果，直接向用户汇报关键信息。
