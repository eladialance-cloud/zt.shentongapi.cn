---
name: hermes-agent
description: 当用户任务需要多步骤分解、并行子代理协作、复杂推理或长期记忆时，将任务交给本地 Hermes Agent 编排处理。参数：task（任务描述，必填）。
metadata:
  {
    "openclaw":
      {
        "emoji": "🤖",
        "requires": { "env": ["HERMES_BIN", "HERMES_HOME"] },
      },
  }
---

# Hermes Agent

调用本地 Hermes Agent（127.0.0.1:8642 同款运行时，headless CLI 模式）执行复杂任务。

## 用法

运行脚本（把 <任务描述> 换成用户的原始请求，不要加工或缩写）：

```bash
node <skill_dir>/scripts/hermes-agent.mjs --task "<任务描述>"
```

## 说明

- Hermes 是本地多代理编排引擎，适合：多步骤分解、子代理并行、需要记忆/技能积累的长期任务。
- 简单问题不要调用本工具，直接回复即可。
- 脚本通过 `hermes chat -q "<任务>" -Q --source tool` 以静默单查询模式执行，输出为最终回复。
- 执行失败时返回错误信息（例如 Hermes 未配置模型、运行时未安装）。
