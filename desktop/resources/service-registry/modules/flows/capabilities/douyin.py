# -*- coding: utf-8 -*-
"""抖音采集/转写适配：调用本机 douyin 服务（默认 127.0.0.1:9030，只读流水线）。

采集/转写接缝就绪前，douyin 服务返回 PIPELINE_NOT_READY；本适配层原样透传，
业务流据此把「采集失败」如实报出，不伪造数据。
"""

import os

from . import http_util
from .common import DEPENDENCY_MISSING

DEFAULT_BASE_URL = "http://127.0.0.1:9030"
DEFAULT_TIMEOUT = 120


class DouyinClient(object):
    def __init__(self, base_url=DEFAULT_BASE_URL, timeout=DEFAULT_TIMEOUT):
        self.base_url = (base_url or DEFAULT_BASE_URL).strip().rstrip("/")
        self.timeout = timeout

    def call(self, capability, payload=None):
        """调用采集服务能力，返回其原始结果 dict；不可达时给出 DEPENDENCY_MISSING。"""
        try:
            data = http_util.post_json(
                "%s/api/douyin/%s" % (self.base_url, capability),
                payload or {},
                timeout=self.timeout,
            )
        except http_util.HttpError as err:
            return {"ok": False, "code": DEPENDENCY_MISSING, "detail": "抖音采集服务不可达: %s" % err}
        if not isinstance(data, dict):
            return {"ok": False, "code": DEPENDENCY_MISSING, "detail": "抖音采集服务返回结构异常"}
        return data

    def status(self):
        return self.call("status")

    def collect(self, keyword, limit=None):
        return self.call("collect", {"keyword": keyword, "limit": limit})

    def transcribe(self, audio_path, engine=None):
        return self.call("transcribe", {"audio_path": audio_path, "engine": engine})

    def ingest(self, record):
        return self.call("ingest", {"record": record})


def get_client(config=None):
    cfg = config or {}
    return DouyinClient(
        base_url=cfg.get("douyin_base_url") or os.environ.get("FLOWS_DOUYIN_BASE_URL", DEFAULT_BASE_URL),
    )

