# -*- coding: utf-8 -*-
"""测试替身：外部能力（LLM / 存储 / 微信域桥 / 抖音 / 海报）的可控实现。"""


class FakeLlm(object):
    def __init__(self, text="生成结果", ok=True, code="LLM_NOT_CONFIGURED"):
        self.text = text
        self.ok = ok
        self.code = code
        self.prompts = []

    def configured(self):
        return self.ok

    def complete(self, prompt, system=None, timeout=None):
        self.prompts.append(prompt)
        if not self.ok:
            return {"ok": False, "code": self.code, "detail": "fake llm 未配置"}
        return {"ok": True, "text": self.text, "model": "fake-model"}


class FakeStore(object):
    available = True
    reason = ""

    def __init__(self, data=None):
        self.data = {key: list(value) for key, value in (data or {}).items()}
        self.seed = 0

    def append(self, collection, record):
        self.seed += 1
        item = dict(record or {})
        item.setdefault("id", "id-%d" % self.seed)
        self.data.setdefault(collection, []).append(item)
        return item

    def query(self, collection, filters=None, limit=None):
        records = list(self.data.get(collection, []))
        if filters:
            records = [r for r in records if all(r.get(k) == v for k, v in filters.items())]
        if limit:
            records = records[-int(limit):]
        return records

    def count(self, collection, filters=None):
        return len(self.query(collection, filters))


class FakeWechat(object):
    def __init__(self, result=None):
        self.result = result if result is not None else {"ok": True}
        self.calls = []

    def _respond(self, capability, payload):
        self.calls.append((capability, payload))
        return dict(self.result)

    def status(self):
        return self._respond("status", {})

    def send(self, to, text):
        return self._respond("send", {"to": to, "text": text})

    def group(self, group, text):
        return self._respond("group", {"group": group, "text": text})

    def add_friend(self, wxid, message=""):
        return self._respond("add_friend", {"wxid": wxid, "message": message})

    def friends(self, limit=None, keyword=None):
        return self._respond("friends", {"limit": limit, "keyword": keyword})

    def listen(self, chats=None, limit=None):
        return self._respond("listen", {"chats": chats, "limit": limit})


class FakeDouyin(object):
    def __init__(self, result=None):
        self.result = result if result is not None else {"ok": True}
        self.calls = []

    def _respond(self, capability, payload):
        self.calls.append((capability, payload))
        return dict(self.result)

    def status(self):
        return self._respond("status", {})

    def collect(self, keyword, limit=None):
        return self._respond("collect", {"keyword": keyword, "limit": limit})

    def transcribe(self, audio_path, engine=None):
        return self._respond("transcribe", {"audio_path": audio_path, "engine": engine})

    def ingest(self, record):
        return self._respond("ingest", {"record": record})


class FakePoster(object):
    def __init__(self, result=None):
        self.result = result if result is not None else {"ok": True, "poster_url": "http://127.0.0.1/p.png"}
        self.calls = []

    def configured(self):
        return True

    def generate(self, text, title="", size=None):
        self.calls.append({"text": text, "title": title})
        return dict(self.result)


def build_context(llm=None, store=None, wechat=None, douyin=None, poster=None, config=None):
    """组装带替身的 FlowContext（默认全用「正常」替身）。"""
    from capabilities import common

    return common.FlowContext(
        config=config or {},
        llm=llm if llm is not None else FakeLlm(),
        store=store if store is not None else FakeStore(),
        wechat=wechat if wechat is not None else FakeWechat(),
        douyin=douyin if douyin is not None else FakeDouyin(),
        poster=poster if poster is not None else FakePoster(),
    )


class risk_env(object):
    """上下文管理器：临时清除/设置 FLOWS_ENABLE_HIGH_RISK，避免污染宿主环境。"""

    KEY = "FLOWS_ENABLE_HIGH_RISK"

    def __init__(self, value=None):
        self.value = value
        self.previous = None

    def __enter__(self):
        import os

        self.previous = os.environ.pop(self.KEY, None)
        if self.value is not None:
            os.environ[self.KEY] = self.value
        return self

    def __exit__(self, exc_type, exc, tb):
        import os

        os.environ.pop(self.KEY, None)
        if self.previous is not None:
            os.environ[self.KEY] = self.previous
        return False

