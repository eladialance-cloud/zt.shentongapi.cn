# -*- coding: utf-8 -*-
"""海报生成接缝。

未配置海报服务地址时返回 POSTER_NOT_CONFIGURED —— 海报是「锦上添花」的一步，
业务流据此把该步骤标为跳过，而不是伪造一个假的图片地址。
"""

import os

from . import http_util
from .common import DEPENDENCY_MISSING, POSTER_NOT_CONFIGURED

DEFAULT_TIMEOUT = 60


class PosterGenerator(object):
    def __init__(self, endpoint="", timeout=DEFAULT_TIMEOUT):
        self.endpoint = (endpoint or "").strip()
        self.timeout = timeout

    def configured(self):
        return bool(self.endpoint)

    def generate(self, text, title="", size=None):
        """生成海报，返回 ``{ok, poster_url}`` 或结构化错误。"""
        if not self.configured():
            return {
                "ok": False,
                "code": POSTER_NOT_CONFIGURED,
                "detail": "未配置海报生成服务（poster_endpoint 或 FLOWS_POSTER_ENDPOINT）",
            }
        try:
            data = http_util.post_json(
                self.endpoint,
                {"text": text, "title": title, "size": size},
                timeout=self.timeout,
            )
        except http_util.HttpError as err:
            return {"ok": False, "code": DEPENDENCY_MISSING, "detail": "海报服务不可达: %s" % err}
        if not isinstance(data, dict):
            return {"ok": False, "code": DEPENDENCY_MISSING, "detail": "海报服务返回结构异常"}
        url = data.get("poster_url") or data.get("url")
        if data.get("ok") and url:
            return {"ok": True, "poster_url": url}
        return {
            "ok": False,
            "code": data.get("code") or DEPENDENCY_MISSING,
            "detail": data.get("detail") or "海报服务未返回可用地址",
        }


def get_generator(config=None):
    cfg = config or {}
    return PosterGenerator(
        endpoint=cfg.get("poster_endpoint") or os.environ.get("FLOWS_POSTER_ENDPOINT", ""),
    )

