# -*- coding: utf-8 -*-
"""飞书多维表格后端测试（零第三方依赖，拦截 urllib 请求）。"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from capabilities import storage  # noqa: E402


def test_feishu_store_requires_credentials():
    store = storage.FeishuStore({"storage_backend": "feishu"})
    assert store.available is False
    assert "凭证" in store.reason
    result = store.append("demo", {})
    assert result["code"] == "STORAGE_BACKEND_UNAVAILABLE"


def test_feishu_store_requires_app_token():
    store = storage.FeishuStore(
        {"storage_backend": "feishu", "feishu_app_id": "a", "feishu_app_secret": "b"}
    )
    assert store.available is False
    assert "app_token" in store.reason


def test_feishu_store_unmapped_collection_is_unavailable():
    store = storage.FeishuStore(
        {
            "storage_backend": "feishu",
            "feishu_app_id": "a",
            "feishu_app_secret": "b",
            "storage_feishu": {"app_token": "bascnX", "tables": {}},
        }
    )
    assert store.available is True
    result = store.append("demo", {})
    assert result["code"] == "STORAGE_BACKEND_UNAVAILABLE"
    assert "未映射" in result["detail"]


def test_get_store_returns_feishu_when_configured():
    store = storage.get_store(
        {
            "storage_backend": "feishu",
            "feishu_app_id": "a",
            "feishu_app_secret": "b",
            "storage_feishu": {"app_token": "bascnX", "tables": {"demo": "tbl1"}},
        }
    )
    assert store.backend == "feishu"
    assert store.available is True
    assert store._table_id("demo") == "tbl1"


def test_feishu_store_append_and_query_with_stubbed_transport():
    store = storage.FeishuStore(
        {
            "storage_backend": "feishu",
            "feishu_app_id": "a",
            "feishu_app_secret": "b",
            "storage_feishu": {"app_token": "bascnX", "tables": {"demo": "tbl1"}},
        }
    )
    calls = []

    def fake_post(path, payload, retried=False):
        calls.append(("POST", path, payload))
        if "records" in path:
            return {"code": 0, "data": {"record": {"record_id": "rec1"}}}
        return {"code": 0, "data": {"tenant_access_token": "tk"}}

    def fake_get(path):
        calls.append(("GET", path, None))
        return {"code": 0, "data": {"items": [{"record_id": "r1", "fields": {"id": "x", "v": 1}}]}}

    store._post = fake_post
    store._get = fake_get
    store._token = "tk"
    store._token_expire = 9e18

    out = store.append("demo", {"v": 1})
    assert out["id"]
    assert any(c[0] == "POST" and "/tables/tbl1/records" in c[1] for c in calls)

    rows = store.query("demo")
    assert len(rows) == 1
    assert rows[0]["v"] == 1
    assert rows[0]["record_id"] == "r1"

    assert store.count("demo") == 1
    assert store.count("demo", {"v": 2}) == 0
