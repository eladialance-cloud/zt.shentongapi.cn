# -*- coding: utf-8 -*-
"""新媒体角色业务流：公众号文章二创。

只做「素材 → 二创文稿」的生成与归档；实际投递到公众号由 P5 通道适配器负责。
"""

from . import common
from .common import STORAGE_BACKEND_UNAVAILABLE

ARTICLE_COLLECTION = "new_media_articles"


def run_wechat_article(params, ctx):
    """公众号文章二创：按素材与标题方向改写一篇文章并归档。"""
    flow = "new-media-wechat-article"
    source = common.get_param(params, "source", "str")
    title = common.get_param(params, "title", "str?", "")

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("LLM 二创文章")
    title_hint = "文章标题方向：%s。" % title if title else "请自行拟一个中文标题。"
    prompt = (
        "把下面的素材改写成一篇中文公众号文章，保留事实、重写表达，不要照抄原句、不要编造数据。%s\n"
        "输出格式：第一行是标题，空一行后是正文（600 字以内）。\n\n素材：\n%s" % (title_hint, source)
    )
    drafted = ctx.llm.complete(prompt)
    if not drafted.get("ok"):
        return ctx.dependency_failed(flow, drafted)

    ctx.step("解析标题与正文")
    lines = drafted["text"].splitlines()
    article_title = title or (lines[0].strip() if lines else "")
    body = "\n".join(lines[1:]).strip() if len(lines) > 1 else ""
    if not body:
        body = drafted["text"].strip()

    ctx.step("归档二创文稿")
    record_id = common.record(ctx, ARTICLE_COLLECTION, {"title": article_title, "body": body})

    return common.ok(
        flow, steps=ctx.steps, title=article_title, body=body, record_id=record_id
    )


FLOWS = {
    "new-media-wechat-article": {
        "title": "公众号文章二创",
        "role": "新媒体",
        "risk": "readonly",
        "trigger": "每日 11:00（沿用源头排期）",
        "params": {"source": "str", "title": "str?"},
        "steps": ["LLM 二创文章", "解析标题与正文", "归档二创文稿"],
        "produces": ["title", "body", "record_id"],
        "run": run_wechat_article,
    },
}

