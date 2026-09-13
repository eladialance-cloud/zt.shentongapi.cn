# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as config_mod  # noqa: E402


def test_feishu_tables_env_injection():
    os.environ["FLOWS_FEISHU_APP_TOKEN"] = "bascnX"
    os.environ["FLOWS_FEISHU_TABLES"] = '{"demo": "tbl1"}'
    try:
        cfg = config_mod.load_config()
    finally:
        os.environ.pop("FLOWS_FEISHU_APP_TOKEN", None)
        os.environ.pop("FLOWS_FEISHU_TABLES", None)
    assert cfg["storage_feishu"]["app_token"] == "bascnX"
    assert cfg["storage_feishu"]["tables"]["demo"] == "tbl1"
    assert "_feishu_app_token" not in cfg


def test_feishu_tables_env_invalid_json_ignored():
    os.environ["FLOWS_FEISHU_TABLES"] = "not-json"
    try:
        cfg = config_mod.load_config()
    finally:
        os.environ.pop("FLOWS_FEISHU_TABLES", None)
    assert not cfg.get("storage_feishu")


def test_defaults_still_local():
    cfg = config_mod.load_config()
    assert cfg.get("storage_backend", "local") in ("local", "feishu")
    assert "storage_feishu" in config_mod.DEFAULTS
