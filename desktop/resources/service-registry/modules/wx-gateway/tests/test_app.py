# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app  # noqa: E402

CAPS = [
    "status",
    "send",
    "friends",
    "add_friend",
    "moments",
    "moments_publish",
    "group",
    "listen",
]
UNAVAILABLE_CAPS = ["add_friend", "moments", "moments_publish"]
OPEN_READONLY_CAPS = ["status", "friends", "listen"]
OPEN_HIGH_RISK_CAPS = ["send", "group"]
BACKEND_ERROR_CODES = {"BACKEND_MISSING", "WECHAT_NOT_RUNNING", "BACKEND_ERROR"}


def test_health():
    client = app.app.test_client()
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is True
    # 后端自述：开源 wxauto + MIT，且后端缺失也不影响 /api/health 可用
    assert body["service"] == "wx-gateway"
    assert body["backend"] == "wxauto"
    assert body["backend_license"] == "MIT"
    assert isinstance(body["backend_available"], bool)


def test_capabilities_listing():
    client = app.app.test_client()
    res = client.get("/api/wx/capabilities")
    assert res.status_code == 200
    caps = res.get_json()["capabilities"]
    assert set(caps.keys()) == set(CAPS)


def test_status_reports_not_connected_without_backend():
    client = app.app.test_client()
    res = client.get("/api/wx/status")
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is True
    assert body["connected"] is False
    assert body["detail"] in BACKEND_ERROR_CODES


def test_dispatch_unavailable_capabilities():
    client = app.app.test_client()
    for cap in UNAVAILABLE_CAPS:
        res = client.post("/api/wx/" + cap, json={"text": "hi"})
        assert res.status_code == 200
        assert res.get_json()["code"] == "CAPABILITY_UNAVAILABLE"


def test_dispatch_open_readonly_capabilities_without_backend():
    client = app.app.test_client()
    for cap in OPEN_READONLY_CAPS:
        res = client.post("/api/wx/" + cap, json={"to": "u", "text": "hi"})
        assert res.status_code == 200
        body = res.get_json()
        assert body["ok"] is False
        assert body["code"] in BACKEND_ERROR_CODES


def test_dispatch_high_risk_capabilities_disabled_by_default():
    """F6 灰度：外发类能力默认关闸，返回 RISK_DISABLED（而不是伪装成后端错误）。"""
    client = app.app.test_client()
    for cap in OPEN_HIGH_RISK_CAPS:
        res = client.post("/api/wx/" + cap, json={"to": "u", "text": "hi", "group": "g"})
        assert res.status_code == 200
        assert res.get_json()["code"] == "RISK_DISABLED"


def test_unknown_capability():
    client = app.app.test_client()
    res = client.post("/api/wx/does_not_exist", json={})
    assert res.status_code == 200
    assert res.get_json()["code"] == "UNKNOWN_CAP"
