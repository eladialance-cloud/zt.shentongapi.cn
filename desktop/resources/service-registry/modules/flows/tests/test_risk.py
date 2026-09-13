# -*- coding: utf-8 -*-
"""risk.RiskGate（F6）：灰度开闸 / 每分钟降频 / 每日额度落盘 / 熔断暂停。

本文件在 flows / wx-gateway / douyin 三个模块内保持一致（risk.py 是三模块共用实现）。
"""

import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import risk  # noqa: E402


class _env(object):
    """临时设置/清除环境变量。"""

    def __init__(self, key, value):
        self.key = key
        self.value = value
        self.previous = None

    def __enter__(self):
        self.previous = os.environ.pop(self.key, None)
        if self.value is not None:
            os.environ[self.key] = self.value
        return self

    def __exit__(self, exc_type, exc, tb):
        os.environ.pop(self.key, None)
        if self.previous is not None:
            os.environ[self.key] = self.previous
        return False


def _temp_state():
    root = tempfile.mkdtemp(prefix="st-risk-")
    return root, os.path.join(root, "risk_state.json")


def test_high_risk_disabled_by_default():
    """灰度：高风险动作默认关闸；只读动作不受影响。"""
    gate = risk.RiskGate({"enable_high_risk": False}, "T")
    blocked = gate.acquire("send", high_risk=True)
    assert blocked["ok"] is False
    assert blocked["code"] == risk.RISK_DISABLED
    assert "T_ENABLE_HIGH_RISK" in blocked["detail"]
    assert gate.acquire("status", high_risk=False, count=False) is None


def test_high_risk_env_opens_gate():
    with _env("T_ENABLE_HIGH_RISK", "1"):
        gate = risk.RiskGate({}, "T")
        assert gate.high_risk_enabled() is True
        assert gate.acquire("send", high_risk=True) is None


def test_paused_blocks_everything():
    gate = risk.RiskGate({"risk_paused": True}, "T")
    assert gate.paused() is True
    for high in (True, False):
        blocked = gate.acquire("status", high_risk=high, count=False)
        assert blocked["code"] == risk.RISK_PAUSED


def test_no_state_file_when_unlimited():
    """默认不限流：不应产生状态文件（避免打包后模块目录被写脏）。"""
    root, state = _temp_state()
    try:
        gate = risk.RiskGate({"enable_high_risk": True}, "T", state_path=state)
        for _ in range(50):
            assert gate.acquire("send", high_risk=True) is None
        assert not os.path.exists(state)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_minute_limit():
    root, state = _temp_state()
    try:
        gate = risk.RiskGate({"risk_rate_per_minute": 2}, "T", state_path=state)
        assert gate.acquire("send") is None
        assert gate.acquire("send") is None
        blocked = gate.acquire("send")
        assert blocked["code"] == risk.RATE_LIMITED
        assert blocked["limit"] == 2
        assert blocked["retry_after"] >= 1
        assert os.path.exists(state)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_daily_limit_persists_across_instances():
    """每日额度落盘：进程重启（新实例）后额度继续生效，不会「重启即刷新」。"""
    root, state = _temp_state()
    try:
        cfg = {"risk_daily_limit": 2}
        first = risk.RiskGate(cfg, "T", state_path=state)
        assert first.acquire("publish") is None
        assert first.acquire("publish") is None
        second = risk.RiskGate(cfg, "T", state_path=state)
        blocked = second.acquire("publish")
        assert blocked["code"] == risk.RATE_LIMITED
        assert blocked["used"] == 2
        snapshot = second.snapshot()
        assert snapshot["used_today"]["publish"] == 2
        with open(state, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        assert payload["day"] == snapshot["day"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_day_rollover_resets_counts():
    root, state = _temp_state()
    try:
        clock = [1000.0]
        cfg = {"risk_daily_limit": 1}
        assert risk.RiskGate(cfg, "T", state_path=state, now=lambda: clock[0]).acquire("publish") is None
        same_day = risk.RiskGate(cfg, "T", state_path=state, now=lambda: clock[0]).acquire("publish")
        assert same_day["code"] == risk.RATE_LIMITED
        clock[0] += 86400  # 次日
        assert risk.RiskGate(cfg, "T", state_path=state, now=lambda: clock[0]).acquire("publish") is None
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_per_action_counters_are_independent():
    root, state = _temp_state()
    try:
        gate = risk.RiskGate({"risk_daily_limit": 1}, "T", state_path=state)
        assert gate.acquire("a") is None
        assert gate.acquire("b") is None
        assert gate.acquire("a")["code"] == risk.RATE_LIMITED
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_count_false_does_not_consume_quota():
    """只读查询不占额度（额度 = 外发配额）。"""
    root, state = _temp_state()
    try:
        gate = risk.RiskGate({"risk_rate_per_minute": 1, "risk_daily_limit": 1}, "T", state_path=state)
        for _ in range(5):
            assert gate.acquire("status", count=False) is None
        assert gate.acquire("status") is None
        assert gate.acquire("status")["code"] == risk.RATE_LIMITED
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_state_file_unwritable_does_not_raise():
    """状态文件不可写（父路径非目录）时退化为进程内计数，不阻断业务。"""
    root = tempfile.mkdtemp()
    try:
        blocker = os.path.join(root, "not-a-dir")
        with open(blocker, "w", encoding="utf-8") as handle:
            handle.write("x")
        gate = risk.RiskGate(
            {"risk_daily_limit": 1}, "T", state_path=os.path.join(blocker, "risk_state.json")
        )
        assert gate.acquire("publish") is None
        assert gate.acquire("publish")["code"] == risk.RATE_LIMITED
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_default_state_path_helper():
    assert risk.default_state_path("/x/y/config.json").endswith("risk_state.json")
    assert risk.default_state_path("") == ""
