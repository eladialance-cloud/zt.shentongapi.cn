# -*- coding: utf-8 -*-
"""业务流引擎公共层：统一结果结构、错误码、参数校验与流程上下文。

约定：
- flow 一律返回 dict，错误用 ``code`` 表达，不把异常抛过引擎边界；
- 参数校验失败抛 ``ParamError``，由 core 兜住转成 PARAM_MISSING；
- ``FlowContext`` 聚合外部能力（LLM / 存储 / 微信域桥 / 抖音 / 海报），单测可注入替身。
"""

import datetime


# ———— 统一错误码 ————
FLOW_NOT_FOUND = "FLOW_NOT_FOUND"
PARAM_MISSING = "PARAM_MISSING"
RISK_DISABLED = "RISK_DISABLED"
RATE_LIMITED = "RATE_LIMITED"
RISK_PAUSED = "RISK_PAUSED"
LLM_NOT_CONFIGURED = "LLM_NOT_CONFIGURED"
STORAGE_BACKEND_UNAVAILABLE = "STORAGE_BACKEND_UNAVAILABLE"
DEPENDENCY_MISSING = "DEPENDENCY_MISSING"
POSTER_NOT_CONFIGURED = "POSTER_NOT_CONFIGURED"
FLOW_FAILED = "FLOW_FAILED"


def _type_name(value):
    return "空" if value is None else type(value).__name__


class ParamError(ValueError):
    """参数缺失或类型不符（由 core 统一转成 PARAM_MISSING）。"""

    def __init__(self, name, expected, got):
        self.name = name
        self.expected = expected
        self.got = got
        super(ParamError, self).__init__("参数 %s 需要 %s，实际为 %s" % (name, expected, _type_name(got)))


_TYPES = {
    "str": str,
    "int": int,
    "num": (int, float),
    "bool": bool,
    "list": list,
    "dict": dict,
    "obj": dict,
}


def get_param(params, name, spec, default=None):
    """按 schema 取值并校验类型。spec 形如 ``"str"``（必填）/ ``"int?"``（可选）。"""
    optional = spec.endswith("?")
    kind = spec[:-1] if optional else spec
    if name not in params or params[name] is None:
        if optional:
            return default
        raise ParamError(name, spec, None)
    value = params[name]
    expected = _TYPES.get(kind)
    if expected is None:
        return value
    if isinstance(value, bool) and expected is not bool:
        raise ParamError(name, spec, value)
    if not isinstance(value, expected):
        raise ParamError(name, spec, value)
    return value


def ok(flow, steps=None, **fields):
    """构造成功结果。"""
    result = {"ok": True, "flow": flow, "code": "OK"}
    if steps:
        result["steps"] = list(steps)
    result.update(fields)
    return result


def fail(flow, code, detail, steps=None, **fields):
    """构造失败结果（ok=False + code + error）。"""
    result = {"ok": False, "flow": flow, "code": code, "error": detail}
    if steps:
        result["steps"] = list(steps)
    result.update(fields)
    return result


def today():
    """今天（YYYY-MM-DD）。"""
    return datetime.date.today().strftime("%Y-%m-%d")


def shift_date(days, base=None):
    """相对基准日期偏移若干天（YYYY-MM-DD）。"""
    anchor = base or datetime.date.today()
    return (anchor + datetime.timedelta(days=days)).strftime("%Y-%m-%d")


def record(ctx, collection, payload):
    """尽力记录一条结果，返回记录 id；数据层不可用时返回 None（不阻断动作类流程）。"""
    if not ctx.store.available:
        return None
    stored = ctx.store.append(collection, payload)
    return stored.get("id") if isinstance(stored, dict) else None


class FlowContext(object):
    """一次 flow 执行的上下文：外部能力 + 步骤轨迹。"""

    def __init__(self, config=None, llm=None, store=None, wechat=None, douyin=None, poster=None):
        from . import douyin as douyin_mod
        from . import llm as llm_mod
        from . import poster as poster_mod
        from . import storage as storage_mod
        from . import wechat as wechat_mod

        cfg = config or {}
        self.config = cfg
        self.llm = llm if llm is not None else llm_mod.get_llm(cfg)
        self.store = store if store is not None else storage_mod.get_store(cfg)
        self.wechat = wechat if wechat is not None else wechat_mod.get_client(cfg)
        self.douyin = douyin if douyin is not None else douyin_mod.get_client(cfg)
        self.poster = poster if poster is not None else poster_mod.get_generator(cfg)
        self.steps = []

    def step(self, name):
        """记录一个已执行的编排步骤，并原样返回步骤名。"""
        self.steps.append(name)
        return name

    def dependency_failed(self, flow_id, result, fallback_code=DEPENDENCY_MISSING):
        """把外部能力返回的失败结果转成 flow 失败结果。"""
        data = result if isinstance(result, dict) else {}
        code = data.get("code") or fallback_code
        detail = data.get("detail") or data.get("error") or "外部依赖调用失败"
        return fail(flow_id, code, detail, steps=list(self.steps))
