# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402


class _env(object):
    """临时设置/清除某个环境变量。"""

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
    with _env("DOUYIN_CONFIG", None):
        assert config.config_path() == os.path.join(os.path.dirname(os.path.abspath(config.__file__)), "config.json")


def test_config_path_honors_env_override():
    """打包后模块目录只读，service-manager 用 DOUYIN_CONFIG 把配置指到用户数据目录。"""
    custom = os.path.join(os.sep, "tmp", "st-douyin", "config.json")
    with _env("DOUYIN_CONFIG", custom):
        assert config.config_path() == custom


def test_load_config_reads_override_file():
    import json
    import shutil
    import tempfile

    root = tempfile.mkdtemp()
    try:
        path = os.path.join(root, "config.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"douyin_port": 9131, "douyin_daily_limit": 7}, handle)
        with _env("DOUYIN_CONFIG", path), _env("DOUYIN_PORT", None):
            cfg = config.load_config()
        assert cfg["douyin_port"] == 9131
        assert cfg["douyin_daily_limit"] == 7
    finally:
        shutil.rmtree(root, ignore_errors=True)

