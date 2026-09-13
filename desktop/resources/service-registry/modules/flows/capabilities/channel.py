# -*- coding: utf-8 -*-
"""渠道角色业务流：多轮私信。

高风险（主动触达），默认关闭；话术由 LLM 按轮次生成，发送走微信域桥。
"""

from . import common
from .common import PARAM_MISSING

DM_COLLECTION = "channel_dm_records"


def run_multi_round_dm(params, ctx):
    """多轮私信：按轮次生成话术 → 通过微信域桥发送 → 记录轮次。"""
    flow = "channel-multi-round-dm"
    contact = common.get_param(params, "contact", "str")
    round_no = common.get_param(params, "round", "int")
    if round_no < 1:
        return common.fail(flow, PARAM_MISSING, "轮次 round 必须为正整数", steps=ctx.steps)

    ctx.step("LLM 生成第 %d 轮话术" % round_no)
    prompt = (
        "给潜在客户写第 %d 轮中文私信：自然、口语化、80 字以内，"
        "不要出现「尊敬的客户」这类模板腔，不要承诺价格或效果。" % round_no
    )
    drafted = ctx.llm.complete(prompt)
    if not drafted.get("ok"):
        return ctx.dependency_failed(flow, drafted)

    ctx.step("调用微信域桥发送私信")
    sent = ctx.wechat.send(contact, drafted["text"])
    if not sent.get("ok"):
        return ctx.dependency_failed(flow, sent)

    ctx.step("记录私信轮次")
    record_id = common.record(
        ctx, DM_COLLECTION, {"contact": contact, "round": round_no, "text": drafted["text"]}
    )

    return common.ok(
        flow, steps=ctx.steps, contact=contact, round=round_no, text=drafted["text"], record_id=record_id
    )


FLOWS = {
    "channel-multi-round-dm": {
        "title": "多轮私信",
        "role": "渠道",
        "risk": "high",
        "trigger": "手动触发（沿用源头设计）",
        "params": {"contact": "str", "round": "int"},
        "steps": ["LLM 生成话术", "调用微信域桥发送私信", "记录私信轮次"],
        "produces": ["text", "record_id"],
        "run": run_multi_round_dm,
    },
}

