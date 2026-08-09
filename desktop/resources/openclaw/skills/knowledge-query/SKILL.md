---
name: knowledge-query
description: 当用户询问产品知识、操作手册、行业方案、内部资料、业务规范等问题时，先检索云端知识库（本人私有库 + 官方已发布库），用检索到的内容回答。参数：query（检索问题，必填）、mode（global=全局检索所有库，kb=指定某个知识库，默认 global）、kb-id（mode=kb 时必填，知识库 ID）、top-k（返回片段数，默认 5）。
metadata:
  {
    "openclaw":
      {
        "emoji": "📚",
        "requires": { "env": ["ST_AUTH_FILE"] },
      },
  }
---

# 知识库检索

检索深瞳AI 云端知识库（本人私有库 + 官方已发布行业库），用权威资料回答用户问题。

## 用法

全局检索（默认）：

```bash
node <skill_dir>/scripts/knowledge-query.mjs --query "用户问题"
```

指定知识库检索：

```bash
node <skill_dir>/scripts/knowledge-query.mjs --query "用户问题" --mode kb --kb-id 3
```

## 说明

- 输出为命中的资料片段，每条包含「来源库 / 文档名」，回答时须注明出处。
- 检索无命中时脚本会明确提示「未找到相关资料」，此时不要编造内容，如实告知用户。
- 该技能只做检索，不扣积分。
