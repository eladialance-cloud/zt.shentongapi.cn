# -*- coding: utf-8 -*-
"""douyin 日志：统一输出到 stdout（service-manager 侧采集）。"""
import logging
import sys


def setup_logging():
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )