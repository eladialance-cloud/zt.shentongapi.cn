# -*- coding: utf-8 -*-
"""微信域桥适配：调用本机 wx-gateway（默认 127.0.0.1:9020）。

域桥未启动 / 微信未登录 / 能力不由开源后端提供时，原样透传其结构化错误码
（DEPENDENCY_MISSING / BACKEND_MISSING / WECHAT_NOT_RUNNING / CAPABILITY_UNAVAILABLE），
业务流据此决定降级或失败，不做假成功。
"""

import os

from . import http_util
from .common import DEPENDENCY_MISSING

DEFAULT_BASE_URL = "http://127.0.0.1:9020"
DEFAULT_TIMEOUT = 20


class WechatClient(object):
    def __init__(self, base_url=DEFAULT_BASE_URL, timeout=DEFAULT_TIMEOUT):
        self.base_url = (base_url or DEFAULT_BASE_URL).strip().rstrip("/")
        self.timeout = timeout

    def call(self, capability, payload=None):
        """调用域桥能力，返回其原始结果 dict；不可达时给出 DEPENDENCY_MISSING。"""
        try:
            data = http_util.post_json(
                "%s/api/wx/%s" % (self.base_url, capability),
                payload or {},
                timeout=self.timeout,
            )
        except http_util.HttpError as err:
            return {"ok": False, "code": DEPENDENCY_MISSING, "detail": "微信域桥不可达: %s" % err}
        if not isinstance(data, dict):
            return {"ok": False, "code": DEPENDENCY_MISSING, "detail": "微信域桥返回结构异常"}
        return data

    def status(self):
        return self.call("status")

    def send(self, to, text):
        """单聊发消息（域桥侧 risk: high，默认关闭）。"""
        return self.call("send", {"to": to, "text": text})

    def group(self, group, text):
        """群聊发消息（域桥侧 risk: high，默认关闭）。"""
        return self.call("group", {"group": group, "text": text})

    def add_friend(self, wxid, message=""):
        """加好友（开源后端不提供，域桥返回 CAPABILITY_UNAVAILABLE）。"""
        return self.call("add_friend", {"wxid": wxid, "message": message})

    def friends(self, limit=None, keyword=None):
        return self.call("friends", {"limit": limit, "keyword": keyword})

    def listen(self, chats=None, limit=None):
        return self.call("listen", {"chats": chats, "limit": limit})


def get_client(config=None):
    cfg = config or {}
    return WechatClient(
        base_url=cfg.get("wx_base_url") or os.environ.get("FLOWS_WX_BASE_URL", DEFAULT_BASE_URL),
    )

