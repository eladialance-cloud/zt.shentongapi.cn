# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import (  # noqa: E402
    CAPABILITY_IMPLS,
    CAPABILITY_UNAVAILABLE,
    WX_CAPABILITIES,
    call_capability,
    list_capabilities,
)

EXPECTED = {
    "status",
    "send",
    "friends",
    "add_friend",
    "moments",
    "moments_publish",
    "group",
    "listen",
}

# 开源后端（wxauto）已实现的 5 个能力
OPEN_CAPS = {"status", "send", "friends", "group", "listen"}
# 其中只读能力（不占风控额度）
OPEN_READONLY_CAPS = {"status", "friends", "listen"}
# 其中外发能力（F6：默认关闸，需 WX_ENABLE_HIGH_RISK=1）
OPEN_HIGH_RISK_CAPS = {"send", "group"}
# 开源后端不提供、固定返回 CAPABILITY_UNAVAILABLE 的 3 个能力
UNAVAILABLE_CAPS = {"add_friend", "moments", "moments_publish"}
# 无后端时的合法结构化错误码（本机未装 wxauto → BACKEND_MISSING）
BACKEND_ERROR_CODES = {"BACKEND_MISSING", "WECHAT_NOT_RUNNING", "BACKEND_ERROR"}


def test_eight_capabilities_registered():
    assert set(WX_CAPABILITIES.keys()) == EXPECTED
    assert set(CAPABILITY_IMPLS.keys()) == EXPECTED


def test_unavailable_capabilities_return_capability_unavailable():
    """3 个能力不由开源后端提供：必须返回 CAPABILITY_UNAVAILABLE，而不是伪装成功。"""
    for cap in UNAVAILABLE_CAPS:
        result = call_capability(cap, {})
        assert result["ok"] is False
        assert result["code"] == "CAPABILITY_UNAVAILABLE"
        assert result == CAPABILITY_UNAVAILABLE


class _env(object):
    """临时设置/清除环境变量（风控闸门读 env，测试需要隔离）。"""

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


def test_open_readonly_capabilities_never_raise_without_backend():
    """只读能力在未装 wxauto 时必须返回结构化错误码，不能抛异常栈（服务要能拉起、能诊断）。"""
    for cap in OPEN_READONLY_CAPS:
        result = call_capability(cap, {})
        assert result["ok"] is False
        assert result["code"] in BACKEND_ERROR_CODES
        assert result["detail"]


def test_high_risk_capabilities_disabled_by_default():
    """F6 灰度：发消息 / 群聊默认关闸，不能因为「装了开源后端」就默认能发。"""
    for cap in OPEN_HIGH_RISK_CAPS:
        result = call_capability(cap, {"to": "u", "text": "hi", "group": "g"})
        assert result["ok"] is False
        assert result["code"] == "RISK_DISABLED"
        assert result["cap"] == cap


def test_high_risk_capabilities_open_with_env():
    """显式开闸后，才继续走真实后端（本机无 wxauto → 结构化后端错误码）。"""
    with _env("WX_ENABLE_HIGH_RISK", "1"):
        for cap in OPEN_HIGH_RISK_CAPS:
            result = call_capability(cap, {"to": "u", "text": "hi", "group": "g"})
            assert result["code"] in BACKEND_ERROR_CODES


def test_paused_blocks_everything():
    """F6 熔断：risk_paused 时连只读能力也拦截（运维一键停）。"""
    with _env("WX_PAUSED", "1"):
        result = call_capability("status", {})
        assert result["ok"] is False
        assert result["code"] == "RISK_PAUSED"


def test_call_capability_unknown():
    assert call_capability("nope", {})["code"] == "UNKNOWN_CAP"


def test_call_capability_none_payload():
    """payload=None 不应崩溃（HTTP 层可能给空 body）。"""
    assert call_capability("moments", None)["code"] == "CAPABILITY_UNAVAILABLE"
    assert call_capability("status", None)["code"] in BACKEND_ERROR_CODES


def test_list_capabilities_metadata():
    caps = list_capabilities()
    assert caps["send"]["risk"] == "high"
    assert caps["friends"]["risk"] == "readonly"
    assert caps["send"]["params"]["to"] == "str"


def test_capability_backend_field_matches_support():
    """能力清单的 backend 字段必须与真实支持情况一致（open / unavailable）。"""
    caps = list_capabilities()
    for name, meta in caps.items():
        expected = "unavailable" if name in UNAVAILABLE_CAPS else "open"
        assert meta["backend"] == expected, name


def test_listen_schema_accepts_chats():
    """listen 需要目标会话才能加入监听，schema 必须暴露 chats。"""
    assert "chats" in list_capabilities()["listen"]["params"]
