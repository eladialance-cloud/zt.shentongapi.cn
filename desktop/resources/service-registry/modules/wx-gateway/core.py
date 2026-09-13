# -*- coding: utf-8 -*-
"""微信域桥核心：能力路由 + 风控分级（后端实现见 wx_driver.py）。

8 个能力各有独立处理函数与参数 schema；后端采用开源 wxauto（MIT）：
- 5 个能力由开源后端实现：status / send / friends / group / listen
- 3 个能力开源后端不提供：add_friend / moments / moments_publish（商业内核增强项），
  统一返回 CAPABILITY_UNAVAILABLE；将来若要落地，须先过合规与灰度评审。

合规：不引入任何商业闭源组件、不使用授权密钥、源码内不出现商业品牌 token。
后端许可证与真机核对点见 wx_driver.py。

风控（F6）：高风险能力（发消息 / 群聊）默认关闸，需 ``WX_ENABLE_HIGH_RISK=1``
或 config ``enable_high_risk=true`` 才放行；额度（``risk_rate_per_minute`` /
``risk_daily_limit``，0 = 不限）与熔断暂停（``risk_paused``）统一由 risk.RiskGate 负责。
"""

import risk as risk_mod
import wx_driver

# 能力注册表：name -> {title, risk, backend, params}
# risk: readonly = 只读/低危；high = 群发/加好友/发圈等，默认关闭（服务行 disabled）。
# backend: open = 开源后端已实现；unavailable = 开源后端不提供，返回 CAPABILITY_UNAVAILABLE。
WX_CAPABILITIES = {
    "status": {
        "title": "连接状态",
        "risk": "readonly",
        "backend": "open",
        "params": {},
    },
    "send": {
        "title": "发消息",
        "risk": "high",
        "backend": "open",
        "params": {"to": "str", "text": "str"},
    },
    "friends": {
        "title": "好友列表",
        "risk": "readonly",
        "backend": "open",
        "params": {"limit": "int?", "keyword": "str?"},
    },
    "add_friend": {
        "title": "添加好友",
        "risk": "high",
        "backend": "unavailable",
        "params": {"wxid": "str", "message": "str?"},
    },
    "moments": {
        "title": "朋友圈列表",
        "risk": "readonly",
        "backend": "unavailable",
        "params": {"limit": "int?"},
    },
    "moments_publish": {
        "title": "发布朋友圈",
        "risk": "high",
        "backend": "unavailable",
        "params": {"text": "str", "images": "list[str]?"},
    },
    "group": {
        "title": "群聊消息",
        "risk": "high",
        "backend": "open",
        "params": {"group": "str", "text": "str"},
    },
    "listen": {
        "title": "监听消息",
        "risk": "readonly",
        "backend": "open",
        "params": {"chats": "list[str]?", "limit": "int?"},
    },
}

CAPABILITY_UNAVAILABLE = {
    "ok": False,
    "code": "CAPABILITY_UNAVAILABLE",
    "detail": "该能力不由开源后端提供（商业内核增强项），默认关闭；如需落地须先过合规与灰度评审",
}

# ———— 能力实现：5 个走开源后端，3 个固定不可用 ————


def _status_impl(payload):
    """连接状态 → {ok, connected, nickname}；后端缺失/微信未运行时返回结构化错误码。"""
    return wx_driver.get_backend().status()


def _send_impl(payload):
    """发消息：payload = {"to": contact, "text": message}；风控 high，默认关闭。"""
    return wx_driver.get_backend().send(payload.get("to", ""), payload.get("text", ""))


def _friends_impl(payload):
    """好友列表：payload = {"limit": int?, "keyword": str?}；只读。"""
    return wx_driver.get_backend().friends(
        limit=payload.get("limit"),
        keyword=payload.get("keyword"),
    )


def _add_friend_impl(payload):
    """添加好友：开源后端不提供，默认关闭（商业内核增强项）。"""
    return dict(CAPABILITY_UNAVAILABLE)


def _moments_impl(payload):
    """朋友圈列表：开源后端不提供（商业内核增强项）。"""
    return dict(CAPABILITY_UNAVAILABLE)


def _moments_publish_impl(payload):
    """发布朋友圈：开源后端不提供，默认关闭（商业内核增强项）。"""
    return dict(CAPABILITY_UNAVAILABLE)


def _group_impl(payload):
    """群聊消息：payload = {"group": str, "text": str}；风控 high，默认关闭。"""
    return wx_driver.get_backend().send_group(payload.get("group", ""), payload.get("text", ""))


def _listen_impl(payload):
    """监听消息：payload = {"chats": list[str]?, "limit": int?}；只读。"""
    return wx_driver.get_backend().listen(
        chats=payload.get("chats"),
        limit=payload.get("limit"),
    )


# 能力名 -> 处理函数
CAPABILITY_IMPLS = {
    "status": _status_impl,
    "send": _send_impl,
    "friends": _friends_impl,
    "add_friend": _add_friend_impl,
    "moments": _moments_impl,
    "moments_publish": _moments_publish_impl,
    "group": _group_impl,
    "listen": _listen_impl,
}


def list_capabilities():
    """能力清单（中文名 / 风控级别 / 后端支持情况 / 参数 schema），供 /api/wx/capabilities 与前端发现。"""
    return {
        name: {
            "title": meta["title"],
            "risk": meta["risk"],
            "backend": meta["backend"],
            "params": meta["params"],
        }
        for name, meta in WX_CAPABILITIES.items()
    }


def _gate(config=None):
    """构造风控闸门（状态文件与 config.json 同目录，打包后在用户数据目录）。"""
    cfg = config
    state_path = ""
    try:
        import config as config_module
        if cfg is None:
            cfg = config_module.load_config()
        state_path = config_module.risk_state_path()
    except Exception:
        cfg = cfg or {}
    return risk_mod.RiskGate(config=cfg, env_prefix="WX", state_path=state_path)


def call_capability(cap, payload, config=None, gate=None):
    """按能力名分派。

    顺序：未知能力 → UNKNOWN_CAP；开源后端不提供 → CAPABILITY_UNAVAILABLE（永久事实，
    不是灰度开关）；高风险能力 → 灰度/额度闸门；其余走后端实现。payload 缺省为空 dict。
    """
    meta = WX_CAPABILITIES.get(cap)
    fn = CAPABILITY_IMPLS.get(cap)
    if meta is None or fn is None:
        return {"ok": False, "code": "UNKNOWN_CAP", "detail": "未知能力: " + str(cap)}
    if meta.get("backend") != "open":
        return dict(CAPABILITY_UNAVAILABLE)
    high_risk = meta.get("risk") == "high"
    gate = gate if gate is not None else _gate(config)
    # 额度只针对外发类（高风险）能力：只读查询不占额度
    blocked = gate.acquire(cap, high_risk=high_risk, count=high_risk)
    if blocked:
        result = dict(blocked)
        result["cap"] = cap
        return result
    return fn(payload or {})
