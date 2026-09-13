# -*- coding: utf-8 -*-
"""流量操盘角色业务流：爆款视频采集、文案生成。

采集依赖 P6 抖音接缝（未就绪时如实回传 PIPELINE_NOT_READY）；文案生成只依赖 LLM。
"""

from . import common
from .common import STORAGE_BACKEND_UNAVAILABLE

VIDEO_COLLECTION = "traffic_hot_videos"
COPY_COLLECTION = "traffic_copy_records"


def run_collect_hot_videos(params, ctx):
    """爆款视频采集：调用抖音采集服务 → 结构化入库。"""
    flow = "traffic-collect-hot-videos"
    keyword = common.get_param(params, "keyword", "str")
    limit = common.get_param(params, "limit", "int?", 20)

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("调用抖音采集服务")
    result = ctx.douyin.collect(keyword, limit)
    if not result.get("ok"):
        return ctx.dependency_failed(flow, result)

    videos = result.get("videos") or result.get("items") or []
    if not isinstance(videos, list):
        videos = []

    ctx.step("结构化入库")
    record_id = common.record(
        ctx,
        VIDEO_COLLECTION,
        {"keyword": keyword, "limit": limit, "count": len(videos), "videos": videos},
    )

    return common.ok(
        flow, steps=ctx.steps, keyword=keyword, count=len(videos), videos=videos, record_id=record_id
    )


def run_generate_copy(params, ctx):
    """文案生成：按主题与风格产出多条中文短视频文案并归档。"""
    flow = "traffic-generate-copy"
    topic = common.get_param(params, "topic", "str")
    style = common.get_param(params, "style", "str?", "口播")
    count = common.get_param(params, "count", "int?", 3)

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("LLM 生成文案")
    prompt = (
        "围绕主题「%s」写 %d 条中文短视频文案，风格：%s。每条 60 字以内，"
        "每条单独成行并以「1. 2. 3.」编号，不要解释、不要加标题。" % (topic, count, style)
    )
    generated = ctx.llm.complete(prompt)
    if not generated.get("ok"):
        return ctx.dependency_failed(flow, generated)

    ctx.step("解析文案清单")
    copies = []
    for raw in generated["text"].splitlines():
        line = raw.strip()
        if not line:
            continue
        for prefix in ("1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "-", "*"):
            if line.startswith(prefix):
                line = line[len(prefix):].strip()
                break
        if line:
            copies.append(line)

    ctx.step("归档文案")
    record_id = common.record(
        ctx, COPY_COLLECTION, {"topic": topic, "style": style, "copies": copies, "raw": generated["text"]}
    )

    return common.ok(
        flow, steps=ctx.steps, topic=topic, style=style, copies=copies, count=len(copies), record_id=record_id
    )


FLOWS = {
    "traffic-collect-hot-videos": {
        "title": "爆款视频采集",
        "role": "流量操盘",
        "risk": "readonly",
        "trigger": "每日 09:00（沿用源头排期）",
        "params": {"keyword": "str", "limit": "int?"},
        "steps": ["调用抖音采集服务", "结构化入库"],
        "produces": ["videos", "count", "record_id"],
        "run": run_collect_hot_videos,
    },
    "traffic-generate-copy": {
        "title": "文案生成",
        "role": "流量操盘",
        "risk": "readonly",
        "trigger": "每日 10:00（沿用源头排期）",
        "params": {"topic": "str", "style": "str?", "count": "int?"},
        "steps": ["LLM 生成文案", "解析文案清单", "归档文案"],
        "produces": ["copies", "record_id"],
        "run": run_generate_copy,
    },
}

