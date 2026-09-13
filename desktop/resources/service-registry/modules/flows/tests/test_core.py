# -*- coding: utf-8 -*-
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import core  # noqa: E402
import risk  # noqa: E402
from fakes import build_context, risk_env  # noqa: E402

EXPECTED_IDS = {
    "secretary-daily-poster",
    "secretary-daily-summary",
    "ceo-strategy-doc",
    "ceo-keyword-planning",
    "sales-service-add-friend",
    "sales-service-followup",
    "sales-service-push-content",
    "private-domain-morning-push",
    "traffic-collect-hot-videos",
    "traffic-generate-copy",
    "new-media-wechat-article",
    "channel-multi-round-dm",
}

HIGH_RISK_IDS = {
    "sales-service-add-friend",
    "sales-service-push-content",
    "private-domain-morning-push",
    "channel-multi-round-dm",
}


def _config(**extra):
    cfg = {"storage_root": tempfile.mkdtemp()}
    cfg.update(extra)
    return cfg


def test_twelve_flows_registered():
    """注册表必须与桌面端 12 个 n8n 模板一一对应。"""
    assert set(core.list_flows()) == EXPECTED_IDS
    assert len(core.FLOW_REGISTRY) == 12


def test_metadata_is_complete():
    for flow_id, meta in core.list_flows().items():
        assert meta["title"], flow_id
        assert meta["role"], flow_id
        assert meta["trigger"], flow_id
        assert meta["risk"] in ("readonly", "high"), flow_id
        assert isinstance(meta["params"], dict), flow_id
        assert isinstance(meta["steps"], list) and meta["steps"], flow_id
        assert isinstance(meta["produces"], list) and meta["produces"], flow_id


def test_list_flows_hides_runner():
    for meta in core.list_flows().values():
        assert "run" not in meta


def test_high_risk_set_matches_plan():
    declared = {fid for fid, meta in core.list_flows().items() if meta["risk"] == "high"}
    assert declared == HIGH_RISK_IDS


def test_unknown_flow_returns_flow_not_found():
    result = core.call_flow("nope", {})
    assert result["ok"] is False
    assert result["code"] == "FLOW_NOT_FOUND"
    assert result["flow"] == "nope"


def test_high_risk_disabled_by_default():
    with risk_env():
        for flow_id in HIGH_RISK_IDS:
            result = core.call_flow(flow_id, {}, config=_config())
            assert result["ok"] is False, flow_id
            assert result["code"] == "RISK_DISABLED", flow_id
            assert "FLOWS_ENABLE_HIGH_RISK" in result["error"]


def test_high_risk_env_switch_opens_gate():
    with risk_env("1"):
        result = core.call_flow(
            "channel-multi-round-dm",
            {"contact": "张三", "round": 1},
            config=_config(),
            ctx=build_context(),
        )
    assert result["code"] != "RISK_DISABLED"


def test_missing_param_maps_to_param_missing():
    with risk_env():
        result = core.call_flow("ceo-strategy-doc", {}, config=_config(), ctx=build_context())
    assert result["ok"] is False
    assert result["code"] == "PARAM_MISSING"
    assert "topic" in result["error"]


def test_business_exception_does_not_escape():
    flow_id = "ceo-strategy-doc"
    original = core.FLOW_REGISTRY[flow_id]["run"]

    def boom(params, ctx):
        raise RuntimeError("boom")

    core.FLOW_REGISTRY[flow_id]["run"] = boom
    try:
        result = core.call_flow(flow_id, {"topic": "t"}, config=_config(), ctx=build_context())
    finally:
        core.FLOW_REGISTRY[flow_id]["run"] = original
    assert result["ok"] is False
    assert result["code"] == "FLOW_FAILED"
    assert "boom" in result["error"]


def test_non_dict_result_is_rejected():
    flow_id = "ceo-strategy-doc"
    original = core.FLOW_REGISTRY[flow_id]["run"]
    core.FLOW_REGISTRY[flow_id]["run"] = lambda params, ctx: "not-a-dict"
    try:
        result = core.call_flow(flow_id, {"topic": "t"}, config=_config(), ctx=build_context())
    finally:
        core.FLOW_REGISTRY[flow_id]["run"] = original
    assert result["code"] == "FLOW_FAILED"


def test_steps_are_recorded_in_order():
    result = core.call_flow(
        "ceo-keyword-planning", {"product": "咖啡"}, config=_config(), ctx=build_context()
    )
    assert result["ok"] is True
    assert result["steps"] == ["LLM 生成关键词规划", "解析关键词清单", "归档关键词规划"]


def _gate(config, **extra):
    """注入一个固定配置的风控闸门（状态文件落在临时目录，不污染模块目录）。"""
    settings = {"enable_high_risk": True}
    settings.update(extra)
    return risk.RiskGate(
        settings,
        "FLOWS",
        state_path=os.path.join(config["storage_root"], "risk_state.json"),
    )


def test_rate_limit_blocks_second_high_risk_call():
    """F6 降频：开闸后仍受每分钟额度约束（额度 = 外发配额）。"""
    config = _config()
    gate = _gate(config, risk_rate_per_minute=1)
    params = {"contact": "张三", "round": 1}
    with risk_env():
        first = core.call_flow(
            "channel-multi-round-dm", params, config=config, ctx=build_context(), gate=gate
        )
        second = core.call_flow(
            "channel-multi-round-dm", params, config=config, ctx=build_context(), gate=gate
        )
    assert first["code"] != "RATE_LIMITED"
    assert second["ok"] is False
    assert second["code"] == "RATE_LIMITED"
    assert second["flow"] == "channel-multi-round-dm"


def test_paused_gate_blocks_high_risk_before_flow_runs():
    config = _config()
    gate = _gate(config, risk_paused=True)
    with risk_env():
        result = core.call_flow(
            "private-domain-morning-push",
            {"target": "群", "content": "早报"},
            config=config,
            ctx=build_context(),
            gate=gate,
        )
    assert result["ok"] is False
    assert result["code"] == "RISK_PAUSED"


def test_quota_not_consumed_by_readonly_flow():
    """额度只针对高风险流程：只读流程不受额度影响。"""
    config = _config()
    gate = _gate(config, risk_daily_limit=1)
    with risk_env():
        first = core.call_flow("ceo-strategy-doc", {"topic": "年度战略"}, config=config, ctx=build_context(), gate=gate)
        second = core.call_flow("ceo-strategy-doc", {"topic": "年度战略"}, config=config, ctx=build_context(), gate=gate)
    assert first["code"] != "RATE_LIMITED"
    assert second["code"] != "RATE_LIMITED"
    assert second["code"] == first["code"]
