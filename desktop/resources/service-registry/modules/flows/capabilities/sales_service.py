# -*- coding: utf-8 -*-
"""销售客服角色业务流：添加好友、客户跟进、内容推送。

两个动作类 flow（加好友 / 内容推送）标 risk=high，默认关闭；
跟进类 flow 只生成话术并归档，不触达客户，标 readonly。
"""

from . import common
from .common import STORAGE_BACKEND_UNAVAILABLE

CUSTOMER_COLLECTION = "customer_records"
FOLLOWUP_COLLECTION = "sales_followup_records"
FRIEND_COLLECTION = "sales_friend_records"
PUSH_COLLECTION = "sales_push_records"


def run_add_friend(params, ctx):
    """添加好友：调用微信域桥加好友能力；开源后端不提供时如实回传 CAPABILITY_UNAVAILABLE。"""
    flow = "sales-service-add-friend"
    wxid = common.get_param(params, "wxid", "str")
    message = common.get_param(params, "message", "str?", "")

    ctx.step("调用微信域桥加好友")
    result = ctx.wechat.add_friend(wxid, message)
    if not result.get("ok"):
        return ctx.dependency_failed(flow, result)

    ctx.step("记录加好友请求")
    record_id = common.record(ctx, FRIEND_COLLECTION, {"wxid": wxid, "message": message})
    return common.ok(flow, steps=ctx.steps, wxid=wxid, record_id=record_id, detail="好友请求已提交")


def run_followup(params, ctx):
    """客户跟进：读取客户上下文 → LLM 生成跟进话术 → 归档（不触达客户）。"""
    flow = "sales-service-followup"
    contact = common.get_param(params, "contact", "str")
    context = common.get_param(params, "context", "str?", "")

    if not ctx.store.available:
        return common.fail(flow, STORAGE_BACKEND_UNAVAILABLE, ctx.store.reason, steps=ctx.steps)

    ctx.step("读取客户上下文")
    history = ctx.store.query(CUSTOMER_COLLECTION, {"contact": contact})
    merged = context or "\n".join(str(item.get("note", "")).strip() for item in history).strip()

    ctx.step("LLM 生成跟进话术")
    prompt = (
        "为联系人「%s」写一条中文跟进话术，80 字以内，语气自然、不群发感，"
        "不要编造未提供的合作背景。\n已知上下文：\n%s" % (contact, merged or "（暂无）")
    )
    drafted = ctx.llm.complete(prompt)
    if not drafted.get("ok"):
        return ctx.dependency_failed(flow, drafted)

    ctx.step("归档跟进话术")
    record_id = common.record(
        ctx, FOLLOWUP_COLLECTION, {"contact": contact, "text": drafted["text"], "context": merged}
    )

    return common.ok(flow, steps=ctx.steps, contact=contact, text=drafted["text"], record_id=record_id)


def run_push_content(params, ctx):
    """内容推送：调用微信域桥向目标发送内容（高风险，默认关闭）。"""
    flow = "sales-service-push-content"
    content = common.get_param(params, "content", "str")
    target = common.get_param(params, "target", "str")

    ctx.step("调用微信域桥发送内容")
    result = ctx.wechat.send(target, content)
    if not result.get("ok"):
        return ctx.dependency_failed(flow, result)

    ctx.step("记录推送结果")
    record_id = common.record(ctx, PUSH_COLLECTION, {"target": target, "content": content})
    return common.ok(flow, steps=ctx.steps, target=target, record_id=record_id, detail="内容已推送")


FLOWS = {
    "sales-service-add-friend": {
        "title": "添加好友",
        "role": "销售客服",
        "risk": "high",
        "trigger": "手动触发（沿用源头设计）",
        "params": {"wxid": "str", "message": "str?"},
        "steps": ["调用微信域桥加好友", "记录加好友请求"],
        "produces": ["wxid", "record_id"],
        "run": run_add_friend,
    },
    "sales-service-followup": {
        "title": "客户跟进",
        "role": "销售客服",
        "risk": "readonly",
        "trigger": "每日 09:30（沿用源头排期）",
        "params": {"contact": "str", "context": "str?"},
        "steps": ["读取客户上下文", "LLM 生成跟进话术", "归档跟进话术"],
        "produces": ["text", "record_id"],
        "run": run_followup,
    },
    "sales-service-push-content": {
        "title": "内容推送",
        "role": "销售客服",
        "risk": "high",
        "trigger": "手动触发（沿用源头设计）",
        "params": {"content": "str", "target": "str"},
        "steps": ["调用微信域桥发送内容", "记录推送结果"],
        "produces": ["target", "record_id"],
        "run": run_push_content,
    },
}

