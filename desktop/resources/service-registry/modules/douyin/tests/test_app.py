# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app  # noqa: E402

READONLY = ["status", "collect", "download", "extract", "transcribe", "ingest"]
HIGH = ["publish", "comment", "dm"]


def test_health():
    client = app.app.test_client()
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.get_json()["ok"] is True


def test_capabilities_listing():
    client = app.app.test_client()
    res = client.get("/api/douyin/capabilities")
    assert res.status_code == 200
    caps = res.get_json()["capabilities"]
    assert set(caps.keys()) == set(READONLY + HIGH)


def test_status_not_ready():
    client = app.app.test_client()
    body = client.get("/api/douyin/status").get_json()
    assert body["ok"] is True
    assert body["ready"] is False
    assert body["login"] == "unknown"


def test_readonly_dispatch_reports_structured_codes():
    """只读能力已接入真实实现：缺参数 → PARAM_MISSING，缺接缝 → DEPENDENCY_MISSING。"""
    client = app.app.test_client()
    for cap in ["collect", "download", "extract", "transcribe", "ingest"]:
        body = client.post("/api/douyin/" + cap, json={}).get_json()
        assert body["ok"] is False
        assert body["code"] == "PARAM_MISSING"
    body = client.post("/api/douyin/collect", json={"keyword": "露营"}).get_json()
    assert body["code"] == "DEPENDENCY_MISSING"


def test_high_risk_disabled():
    client = app.app.test_client()
    for cap in HIGH:
        body = client.post("/api/douyin/" + cap, json={"text": "x"}).get_json()
        assert body["code"] == "DISABLED"
