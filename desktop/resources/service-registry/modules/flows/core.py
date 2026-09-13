# -*- coding: utf-8 -*-
"""业务流引擎核心：注册表汇总 + 分派 + 风控闸门。

- ``list_flows`` / ``get_flow``：元数据发现
- ``call_flow``：统一执行入口，把参数错误 / 未知 flow / 高风险未开闸 / 业务异常
  一律转成结构化结果，不让异常栈穿透 HTTP 或 CLI 边界。
"""

import risk as risk_mod
from capabilities import FLOW_REGISTRY
from capabilities import common
from capabilities.common import ParamError

HIGH_RISK_ENV = "FLOWS_ENABLE_HIGH_RISK"
_META_FIELDS = ("title", "role", "risk", "trigger", "params", "steps", "produces")


def list_flows():
    """全部业务流的元数据清单（不含可执行函数）。"""
    return {flow_id: {field: meta.get(field) for field in _META_FIELDS} for flow_id, meta in FLOW_REGISTRY.items()}


def get_flow(flow_id):
    """按 id 取业务流定义（含 run）。"""
    return FLOW_REGISTRY.get(flow_id)


def _config_or_load(config):
    """未显式传 config 时读模块 config.json（环境变量优先级更高，由 RiskGate 内部处理）。"""
    if config is not None:
        return config
    try:
        import config as config_module
        return config_module.load_config()
    except Exception:
        return {}


def _gate(config):
    """构造风控闸门（状态文件与 config.json 同目录，打包后在用户数据目录）。"""
    try:
        import config as config_module
        state_path = config_module.risk_state_path()
    except Exception:
        state_path = ""
    return risk_mod.RiskGate(config=_config_or_load(config), env_prefix="FLOWS", state_path=state_path)


def high_risk_enabled(config=None):
    """高风险业务流是否已开闸。

    环境变量优先（便于运维临时开闸 / 测试隔离），其次看配置里的 enable_high_risk。
    """
    return _gate(config).high_risk_enabled()


def call_flow(flow_id, params=None, timeout=None, config=None, ctx=None, gate=None):
    """执行指定业务流，返回统一结构结果（永不抛异常）。"""
    meta = get_flow(flow_id)
    if meta is None:
        return common.fail(flow_id, common.FLOW_NOT_FOUND, "未知业务流: %s" % flow_id)

    if meta.get("risk") == "high":
        gate = gate if gate is not None else _gate(config)
        if not gate.high_risk_enabled():
            return common.fail(
                flow_id,
                common.RISK_DISABLED,
                "高风险业务流默认关闭；确认合规后设 %s=1 再执行" % HIGH_RISK_ENV,
                steps=meta.get("steps"),
            )
        # 额度只针对高风险（外发类）流程：开了闸才需要降频保护
        blocked = gate.acquire(flow_id, high_risk=True)
        if blocked:
            return common.fail(flow_id, blocked["code"], blocked["detail"], steps=meta.get("steps"))

    if ctx is None:
        ctx = common.FlowContext(config=config)
    ctx.steps = []

    try:
        result = meta["run"](params or {}, ctx)
    except ParamError as err:
        return common.fail(flow_id, common.PARAM_MISSING, str(err), steps=list(ctx.steps))
    except Exception as err:  # 兜底：业务实现异常不穿透边界
        return common.fail(
            flow_id, common.FLOW_FAILED, "%s: %s" % (type(err).__name__, err), steps=list(ctx.steps)
        )

    if not isinstance(result, dict):
        return common.fail(flow_id, common.FLOW_FAILED, "业务流返回结构非法", steps=list(ctx.steps))
    result.setdefault("flow", flow_id)
    if not result.get("steps"):
        result["steps"] = list(ctx.steps)
    return result
