# -*- coding: utf-8 -*-
"""CEO 角色业务流：战略文档生成、关键词规划。

两个 flow 均为「LLM 生成 + 归档」的只读流程，对标源头同名 flow 的编排设计后改写。
"""

from . import common
from .common import STORAGE_BACKEND_UNAVAILABLE

STRATEGY_COLLECTION = "ceo_strategy_docs"
KEYWORD_COLLECTION = "ceo_keyword_plans"


def run_strategy_doc(params, ctx):
    """战略文档生成：围绕主题产出中文战略草案并归档。"""
    flow = "ceo-strategy-doc"
    topic = common.get_param(params, "topic", "str")
    strategy = common.get_param(params, "strategy", "str?", "")

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("LLM 生成战略草案")
    extra = "已有战略方向：%s。" % strategy if strategy else ""
    prompt = (
        "你是企业战略顾问。围绕主题「%s」输出一份中文战略文档草案。%s\n"
        "结构固定为四段：目标、现状判断、三条关键动作、风险与对策。不要输出与结构无关的寒暄。" % (topic, extra)
    )
    drafted = ctx.llm.complete(prompt)
    if not drafted.get("ok"):
        return ctx.dependency_failed(flow, drafted)

    ctx.step("归档战略文档")
    record_id = common.record(
        ctx, STRATEGY_COLLECTION, {"topic": topic, "strategy": strategy, "doc": drafted["text"]}
    )

    return common.ok(flow, steps=ctx.steps, topic=topic, doc=drafted["text"], record_id=record_id)


def run_keyword_planning(params, ctx):
    """关键词规划：按产品与预算产出关键词列表与投放建议。"""
    flow = "ceo-keyword-planning"
    product = common.get_param(params, "product", "str")
    budget = common.get_param(params, "budget", "num?", None)

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("LLM 生成关键词规划")
    budget_hint = "预算约 %s 元。" % budget if budget is not None else ""
    prompt = (
        "为产品「%s」做中文关键词规划。%s\n"
        "先输出 10 行关键词，每行格式为「关键词 | 意图 | 建议出价区间」；"
        "再输出一段 80 字以内的投放建议。不要编造具体平台的实时数据。" % (product, budget_hint)
    )
    planned = ctx.llm.complete(prompt)
    if not planned.get("ok"):
        return ctx.dependency_failed(flow, planned)

    ctx.step("解析关键词清单")
    keywords = []
    for raw in planned["text"].splitlines():
        line = raw.strip().lstrip("-*0123456789. ").strip()
        if not line:
            continue
        if "|" in line:
            parts = [part.strip() for part in line.split("|")]
            keywords.append(parts[0])

    ctx.step("归档关键词规划")
    record_id = common.record(
        ctx,
        KEYWORD_COLLECTION,
        {"product": product, "budget": budget, "keywords": keywords, "plan": planned["text"]},
    )

    return common.ok(
        flow,
        steps=ctx.steps,
        product=product,
        keywords=keywords,
        keyword_count=len(keywords),
        plan=planned["text"],
        record_id=record_id,
    )


FLOWS = {
    "ceo-strategy-doc": {
        "title": "战略文档生成",
        "role": "CEO",
        "risk": "readonly",
        "trigger": "手动触发（沿用源头设计）",
        "params": {"topic": "str", "strategy": "str?"},
        "steps": ["LLM 生成战略草案", "归档战略文档"],
        "produces": ["doc", "record_id"],
        "run": run_strategy_doc,
    },
    "ceo-keyword-planning": {
        "title": "关键词规划",
        "role": "CEO",
        "risk": "readonly",
        "trigger": "手动触发（沿用源头设计）",
        "params": {"product": "str", "budget": "num?"},
        "steps": ["LLM 生成关键词规划", "解析关键词清单", "归档关键词规划"],
        "produces": ["keywords", "plan", "record_id"],
        "run": run_keyword_planning,
    },
}
