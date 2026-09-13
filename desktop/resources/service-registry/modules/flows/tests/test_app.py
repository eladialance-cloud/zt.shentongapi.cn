# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app  # noqa: E402
from fakes import risk_env  # noqa: E402

CLIENT = app.test_client()


def test_health_is_always_ok():
    response = CLIENT.get("/api/health")
    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is True
    assert body["service"] == "flows"
    assert body["flow_count"] == 12


def test_list_flows_returns_twelve():
    body = CLIENT.get("/api/flows").get_json()
    assert body["ok"] is True
    assert len(body["flows"]) == 12
    assert body["flows"]["secretary-daily-poster"]["role"] == "秘书"


def test_unknown_flow_returns_flow_not_found():
    body = CLIENT.post("/api/flows/nope", json={}).get_json()
    assert body["ok"] is False
    assert body["code"] == "FLOW_NOT_FOUND"


def test_high_risk_flow_is_gated():
    with risk_env():
        body = CLIENT.post("/api/flows/channel-multi-round-dm", json={"contact": "x", "round": 1}).get_json()
    assert body["code"] == "RISK_DISABLED"


def test_missing_body_does_not_crash():
    body = CLIENT.get("/api/flows/ceo-strategy-doc").get_json()
    assert body["code"] == "PARAM_MISSING"

