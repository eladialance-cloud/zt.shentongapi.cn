# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402


class _env(object):
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


def test_config_path_defaults_next_to_module():
    with _env("FLOWS_CONFIG", None):
        assert config.config_path() == os.path.join(config.module_dir(), "config.json")


def test_config_path_honors_env_override():
    """打包后模块目录只读，service-manager 用 FLOWS_CONFIG 把配置指到用户数据目录。"""
    custom = os.path.join(os.sep, "tmp", "st-flows", "config.json")
    with _env("FLOWS_CONFIG", custom):
        assert config.config_path() == custom


def test_load_config_reads_override_file():
    import json
    import shutil
    import tempfile

    root = tempfile.mkdtemp()
    try:
        path = os.path.join(root, "config.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"storage_backend": "feishu", "enable_high_risk": True}, handle)
        with _env("FLOWS_CONFIG", path), _env("FLOWS_ENABLE_HIGH_RISK", None):
            cfg = config.load_config()
        assert cfg["storage_backend"] == "feishu"
        assert cfg["enable_high_risk"] is True
    finally:
        shutil.rmtree(root, ignore_errors=True)

