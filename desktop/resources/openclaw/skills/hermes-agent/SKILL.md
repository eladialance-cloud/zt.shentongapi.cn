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
- 复杂任务请带 `--require-json`：脚本会在任务描述末尾拼接输出契约，要求 Hermes 只输出单行 JSON。

## 输出契约（重要）

任务描述末尾必须附上以下要求（原样拼接进 `--task`）：

> 你是项目总监：任务描述前会附上可用团队成员清单（角色+人设摘要）。有合适成员时：把任务拆成步骤并指派给最合适的成员，每个 step 必须带 assigneeName（成员角色名）与 assigneeMemberId。没有合适成员或团队为空时：用你自己的子代理团队执行，step 不写 assigneeName。
> 最终回复必须是单行 JSON，不要输出任何其他文字。格式：
> {"summary":"给用户的最终结论","steps":[{"name":"步骤名","status":"done","assigneeName":"成员名","assigneeMemberId":1,"outputs":[{"type":"text|image|video","content":"文本"或"url":"可访问URL"}]}],"outputs":[{"type":"text|image|video","content"或"url"}],"status":"completed"}

失败时输出 {"status":"failed","summary":"失败原因","error":"错误详情"}。
脚本会自动解析该 JSON；解析失败时降级为纯文本（不影响回写）。
