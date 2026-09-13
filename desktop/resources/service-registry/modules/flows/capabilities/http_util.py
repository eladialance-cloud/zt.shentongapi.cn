# -*- coding: utf-8 -*-
"""极简 HTTP JSON 客户端（标准库 urllib，便于单测替换）。

所有网络异常统一抛 ``HttpError``，由调用方转成结构化错误码，避免异常栈穿透服务边界。
"""

import json
import urllib.error
import urllib.request


class HttpError(Exception):
    """网络 / 状态码 / 解析错误。"""

    def __init__(self, message, code="HTTP_ERROR", status=None):
        self.code = code
        self.status = status
        super(HttpError, self).__init__(message)


def post_json(url, payload, timeout=30, headers=None):
    """POST JSON 并返回解析后的响应体（空响应体返回空 dict）。"""
    body = json.dumps(payload if payload is not None else {}, ensure_ascii=False).encode("utf-8")
    head = {"Content-Type": "application/json"}
    if headers:
        head.update(headers)
    return _send(urllib.request.Request(url, data=body, method="POST", headers=head), timeout)


def get_json(url, timeout=30, headers=None):
    """GET JSON。"""
    return _send(urllib.request.Request(url, method="GET", headers=dict(headers or {})), timeout)


def _send(request, timeout):
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        raise HttpError("HTTP %s" % err.code, code="HTTP_STATUS", status=err.code)
    except Exception as err:  # URLError / socket.timeout / OSError
        raise HttpError(str(err), code="HTTP_UNREACHABLE")
    raw = (raw or "").strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except ValueError:
        raise HttpError("响应不是合法 JSON", code="HTTP_BAD_JSON")

