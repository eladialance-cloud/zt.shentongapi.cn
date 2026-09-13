# -*- coding: utf-8 -*-
"""LLM 适配：OpenAI 兼容 /chat/completions。

未配置 base_url 或 model 时返回 LLM_NOT_CONFIGURED（不抛异常），
保证缺模型配置时服务仍可拉起、可诊断。
"""

import os

from . import http_util
from .common import LLM_NOT_CONFIGURED

DEFAULT_TIMEOUT = 60


class LlmClient(object):
    def __init__(self, base_url="", api_key="", model="", timeout=DEFAULT_TIMEOUT):
        self.base_url = (base_url or "").strip().rstrip("/")
        self.api_key = api_key or ""
        self.model = model or ""
        self.timeout = timeout

    def configured(self):
        return bool(self.base_url and self.model)

    def complete(self, prompt, system=None, timeout=None):
        """单轮补全，返回 ``{ok, text, model}`` 或 ``{ok: False, code, detail}``。"""
        if not self.configured():
            return {
                "ok": False,
                "code": LLM_NOT_CONFIGURED,
                "detail": "未配置 LLM（需 llm_base_url 与 llm_model，或 FLOWS_LLM_* 环境变量）",
            }
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        headers = {"Authorization": "Bearer " + self.api_key} if self.api_key else None
        try:
            data = http_util.post_json(
                self.base_url + "/chat/completions",
                {"model": self.model, "messages": messages},
                timeout=timeout or self.timeout,
                headers=headers,
            )
        except http_util.HttpError as err:
            return {"ok": False, "code": "LLM_UNREACHABLE", "detail": str(err)}
        text = extract_text(data)
        if not text:
            return {"ok": False, "code": "LLM_BAD_RESPONSE", "detail": "模型返回为空或结构不可识别"}
        model = data.get("model") if isinstance(data, dict) else None
        return {"ok": True, "text": text, "model": model or self.model}


def extract_text(data):
    """兼容 OpenAI /chat/completions 与常见网关的简化返回结构。"""
    if not isinstance(data, dict):
        return ""
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        legacy = first.get("text")
        if isinstance(legacy, str) and legacy.strip():
            return legacy.strip()
    for key in ("text", "content", "output", "result"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def get_llm(config=None):
    """按配置/环境变量构造 LLM 客户端（缺配置时 complete() 返回 LLM_NOT_CONFIGURED）。"""
    cfg = config or {}
    return LlmClient(
        base_url=cfg.get("llm_base_url") or os.environ.get("FLOWS_LLM_BASE_URL", ""),
        api_key=cfg.get("llm_api_key") or os.environ.get("FLOWS_LLM_API_KEY", ""),
        model=cfg.get("llm_model") or os.environ.get("FLOWS_LLM_MODEL", ""),
    )

