# -*- coding: utf-8 -*-
"""私域运营角色业务流：早间私域推送。

高风险（群发触达），默认关闭；未指定目标群时明确报参数缺失，不乱发。
"""

from . import common
from .common import PARAM_MISSING

PUSH_COLLECTION = "private_domain_push_records"


def run_morning_push(params, ctx):
    """早间私域推送：校验内容与目标群 → 群发 → 记录。"""
    flow = "private-domain-morning-push"
    content = common.get_param(params, "content", "str?", "") or str(ctx.config.get("private_domain_content", "")).strip()
    target = common.get_param(params, "target", "str?", "") or str(ctx.config.get("private_domain_target", "")).strip()

    if not content:
        return common.fail(flow, PARAM_MISSING, "缺少推送内容（content 参数或 private_domain_content 配置）", steps=ctx.steps)
    if not target:
        return common.fail(flow, PARAM_MISSING, "缺少推送目标群（target 参数或 private_domain_target 配置）", steps=ctx.steps)

    ctx.step("调用微信域桥群发")
    result = ctx.wechat.group(target, content)
    if not result.get("ok"):
        return ctx.dependency_failed(flow, result)

    ctx.step("记录私域推送")
    record_id = common.record(ctx, PUSH_COLLECTION, {"target": target, "content": content})
    return common.ok(flow, steps=ctx.steps, target=target, record_id=record_id, detail="早间私域推送已发送")


FLOWS = {
    "private-domain-morning-push": {
        "title": "早间私域推送",
        "role": "私域运营",
        "risk": "high",
        "trigger": "每日 08:00（沿用源头排期）",
        "params": {"content": "str?", "target": "str?"},
        "steps": ["校验内容与目标群", "调用微信域桥群发", "记录私域推送"],
        "produces": ["target", "record_id"],
        "run": run_morning_push,
    },
}

