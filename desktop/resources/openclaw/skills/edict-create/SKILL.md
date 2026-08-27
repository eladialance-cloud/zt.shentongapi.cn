---
name: edict-create
description: 当用户下达正式旨意/复杂任务（「帮我做XX」「调研XX」「写一份XX」「部署XX」，或以「传旨」「下旨」开头）时，建立三省六部 JJC 看板任务并转中书省。参数：title（10-30字中文标题，必填，自己概括不复制原文）、body（旨意正文，可选）、dept（指定部门，可选：礼部/户部/吏部/兵部/刑部/工部）。
metadata:
  {
    "openclaw":
      {
        "emoji": "📜",
        "requires": { "env": ["HERMES_PYTHON", "EDICT_HOME"] },
      },
  }
---

# 传旨建任务（三省六部）

用户下达旨意时，建立看板任务并转中书省处理。

## 用法

运行脚本（title 必须是 10-30 字中文一句话概括，禁止路径/URL/代码/系统元数据，不带「传旨」前缀）：

```bash
node <skill_dir>/scripts/edict-create.mjs --title "<标题>" [--body "<正文>"] [--dept "<部门>"]
```

## 说明

- 只有「重任务/正式旨意」才调用本工具；闲聊、问答、简单查询直接回复，不建任务。
- 脚本调用本地 kanban_update.py create 建 JJC-YYYYMMDD-NNN 任务（状态 Zhongshu，越权身份 taizi）。
- 创建成功输出单行 JSON：{"ok":true,"taskId":"JJC-...","title":"..."}；失败输出 {"ok":false,"error":"..."}。
- 建任务本身不扣费；后续官署执行由 Hermes 执行链路计费（reportLocalExecution → credits）。
