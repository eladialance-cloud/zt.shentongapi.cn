# -*- coding: utf-8 -*-
"""秘书角色业务流：每日海报制作、每日汇总报告。

对标源头同名 flow 的编排设计（触发时间 / 步骤顺序 / 参数 / 返回字段），实现为去品牌改写版：
数据层走深瞳自有存储，文本生成走 OpenAI 兼容 LLM，海报走可插拔渲染接缝。
"""

from . import common
from .common import DEPENDENCY_MISSING, STORAGE_BACKEND_UNAVAILABLE

CONTENT_COLLECTION = "content_assets"
POSTER_COLLECTION = "daily_poster_records"
SUMMARY_COLLECTION = "daily_summary_records"


def run_daily_poster(params, ctx):
    """每日海报 AI 制作：取当日内容 → LLM 压缩成短文案 → 生成海报 → 写回分发表。"""
    flow = "secretary-daily-poster"
    date = common.get_param(params, "date", "str?", common.today())
    domain = common.get_param(params, "domain", "str?", "")
    content = common.get_param(params, "content", "str?", "")

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("读取当日内容源")
    items = ctx.store.query(CONTENT_COLLECTION, {"date": date})
    source = content or "\n".join(str(item.get("content", "")).strip() for item in items).strip()
    if not source:
        return common.ok(
            flow,
            steps=ctx.steps,
            skipped=True,
            date=date,
            poster_url=None,
            record_id=None,
            detail="当日无内容，跳过海报制作",
        )

    ctx.step("LLM 压缩文案")
    prompt = (
        "把下面的当日内容压缩成适合做成海报的中文短文案，保留关键数字与结论，"
        "60 字以内，直接给文案，不要解释：\n\n%s" % source
    )
    compressed = ctx.llm.complete(prompt)
    if not compressed.get("ok"):
        return ctx.dependency_failed(flow, compressed)
    text = compressed["text"]

    ctx.step("生成海报")
    poster = ctx.poster.generate(text, title=domain or "今日速览")
    poster_url = ""
    poster_note = ""
    if poster.get("ok"):
        poster_url = poster.get("poster_url", "")
    elif poster.get("code") == DEPENDENCY_MISSING:
        poster_note = "海报服务不可达，本次只产出压缩文案"
    else:
        poster_note = "海报服务未配置，本次只产出压缩文案"

    ctx.step("写回今日内容分发表")
    record_id = common.record(
        ctx,
        POSTER_COLLECTION,
        {"date": date, "domain": domain, "poster_url": poster_url, "compressed_content": text, "note": poster_note},
    )

    return common.ok(
        flow,
        steps=ctx.steps,
        date=date,
        domain=domain,
        poster_url=poster_url,
        compressed_content=text,
        record_id=record_id,
        note=poster_note,
    )


def run_daily_summary(params, ctx):
    """每日汇总报告：汇总当日素材与海报产出 → LLM 成文 → 写回汇总表。"""
    flow = "secretary-daily-summary"
    date = common.get_param(params, "date", "str?", common.today())
    include_poster = common.get_param(params, "include_poster", "bool?", False)

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("汇总当日素材")
    contents = ctx.store.query(CONTENT_COLLECTION, {"date": date})
    posters = ctx.store.query(POSTER_COLLECTION, {"date": date})
    if not contents and not posters:
        return common.ok(
            flow,
            steps=ctx.steps,
            skipped=True,
            date=date,
            summary="",
            record_id=None,
            detail="当日无素材，跳过汇总",
        )

    lines = ["- " + str(item.get("content", "")).strip() for item in contents if item.get("content")]
    if include_poster:
        for item in posters:
            if item.get("compressed_content"):
                lines.append("- [海报文案] " + str(item["compressed_content"]).strip())

    ctx.step("LLM 成文")
    prompt = (
        "把下面的当日素材汇总成一段中文日报，150 字以内，先结论后要点，"
        "不要编造素材里没有的信息：\n\n%s" % "\n".join(lines)
    )
    summary = ctx.llm.complete(prompt)
    if not summary.get("ok"):
        return ctx.dependency_failed(flow, summary)

    ctx.step("写回汇总表")
    record_id = common.record(
        ctx,
        SUMMARY_COLLECTION,
        {"date": date, "summary": summary["text"], "content_count": len(contents), "poster_count": len(posters)},
    )

    return common.ok(
        flow,
        steps=ctx.steps,
        date=date,
        summary=summary["text"],
        record_id=record_id,
        content_count=len(contents),
        poster_count=len(posters),
    )


FLOWS = {
    "secretary-daily-poster": {
        "title": "每日海报 AI 制作",
        "role": "秘书",
        "risk": "readonly",
        "trigger": "每日 08:30（沿用源头排期）",
        "params": {"date": "str?", "domain": "str?", "content": "str?"},
        "steps": ["读取当日内容源", "LLM 压缩文案", "生成海报", "写回今日内容分发表"],
        "produces": ["poster_url", "compressed_content", "record_id"],
        "run": run_daily_poster,
    },
    "secretary-daily-summary": {
        "title": "每日汇总报告",
        "role": "秘书",
        "risk": "readonly",
        "trigger": "每日 20:00（沿用源头排期）",
        "params": {"date": "str?", "include_poster": "bool?"},
        "steps": ["汇总当日素材", "LLM 成文", "写回汇总表"],
        "produces": ["summary", "record_id"],
        "run": run_daily_summary,
    },
}

