# -*- coding: utf-8 -*-
"""可插拔数据层。

默认后端 ``local``：模块 ``data/`` 下的 JSON 记录仓（一个 collection 一个文件，整体读写，
适合本机单人量级），零外部依赖、零账号要求。

``feishu`` 后端：写入飞书多维表格（bitable）。零第三方依赖——用标准库 ``urllib`` 直连
飞书开放平台。凭证与表映射来自环境/配置：

  FEISHU_APP_ID / FEISHU_APP_SECRET       飞书自建应用凭证（必需）
  config.storage_feishu = {
      "app_token": "bascnXXXX",            # 多维表格 app token
      "tables": { "<collection>": "tblXXXX" }   # collection → 数据表 id
  }

未配置凭证、或某 collection 未映射到数据表时，该后端**明确不可用**
（统一返回 STORAGE_BACKEND_UNAVAILABLE，绝不静默丢数据）。
"""

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from .common import STORAGE_BACKEND_UNAVAILABLE

_LOCK = threading.Lock()

_DEFAULT_BASE = "https://open.feishu.cn/open-apis"


def _safe_name(collection):
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(collection))


class LocalStore(object):
    """本地 JSON 记录仓。"""

    backend = "local"

    def __init__(self, root):
        self.root = root
        self.available = True
        self.reason = ""

    def path_for(self, collection):
        return os.path.join(self.root, _safe_name(collection) + ".json")

    def _load(self, collection):
        path = self.path_for(collection)
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            return []
        return data if isinstance(data, list) else []

    def _save(self, collection, records):
        if not os.path.isdir(self.root):
            os.makedirs(self.root)
        with open(self.path_for(collection), "w", encoding="utf-8") as handle:
            json.dump(records, handle, ensure_ascii=False, indent=2)

    def append(self, collection, record):
        """追加一条记录并补默认 id，返回落库后的记录。"""
        item = dict(record or {})
        item.setdefault("id", uuid.uuid4().hex)
        with _LOCK:
            records = self._load(collection)
            records.append(item)
            self._save(collection, records)
        return item

    def query(self, collection, filters=None, limit=None):
        """按字段等值过滤取记录；limit 取最近 N 条。"""
        records = self._load(collection)
        if filters:
            records = [
                record
                for record in records
                if all(record.get(key) == value for key, value in filters.items())
            ]
        if limit:
            records = records[-int(limit):]
        return records

    def count(self, collection, filters=None):
        return len(self.query(collection, filters))


class FeishuStore(object):
    """飞书多维表格后端（零第三方依赖，标准库直连）。

    只支持 append / query / count 三个语义；字段名即飞书表列名（TEXT 列直接写字符串）。
    """

    backend = "feishu"

    def __init__(self, config=None):
        cfg = config or {}
        feishu = cfg.get("storage_feishu") or {}
        if not isinstance(feishu, dict):
            feishu = {}
        self.app_token = str(feishu.get("app_token") or cfg.get("feishu_app_token") or "").strip()
        tables = feishu.get("tables") or cfg.get("feishu_tables") or {}
        self.tables = dict(tables) if isinstance(tables, dict) else {}
        self.base_url = str(cfg.get("feishu_base_url") or os.environ.get("FEISHU_BASE_URL") or _DEFAULT_BASE).rstrip("/")
        self.app_id = str(cfg.get("feishu_app_id") or os.environ.get("FEISHU_APP_ID") or "").strip()
        self.app_secret = str(cfg.get("feishu_app_secret") or os.environ.get("FEISHU_APP_SECRET") or "").strip()
        self._token = None
        self._token_expire = 0.0

        if not (self.app_id and self.app_secret):
            self.available = False
            self.reason = "飞书凭证未配置（FEISHU_APP_ID / FEISHU_APP_SECRET）"
        elif not self.app_token:
            self.available = False
            self.reason = "飞书多维表格 app_token 未配置（storage_feishu.app_token）"
        else:
            self.available = True
            self.reason = ""

    # ———— 基础 HTTP ————
    def _result(self, detail=None):
        return {"ok": False, "code": STORAGE_BACKEND_UNAVAILABLE, "detail": detail or self.reason}

    def _post(self, path, payload, retried=False):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + path,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": "Bearer " + (self._tenant_token() or ""),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                data = json.loads(exc.read().decode("utf-8"))
            except (ValueError, OSError):
                return {"code": -1, "msg": "HTTP %s" % exc.code}
        except (urllib.error.URLError, OSError, ValueError) as exc:
            return {"code": -1, "msg": str(exc)}

        code = data.get("code")
        if not retried and code in (99991663, 99991661, 99991664):
            self._token = None
            self._token_expire = 0.0
            return self._post(path, payload, retried=True)
        return data

    def _get(self, path):
        req = urllib.request.Request(
            self.base_url + path,
            method="GET",
            headers={"Authorization": "Bearer " + (self._tenant_token() or "")},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                return json.loads(exc.read().decode("utf-8"))
            except (ValueError, OSError):
                return {"code": -1, "msg": "HTTP %s" % exc.code}
        except (urllib.error.URLError, OSError, ValueError) as exc:
            return {"code": -1, "msg": str(exc)}

    def _tenant_token(self):
        now = time.time()
        if self._token and self._token_expire > now + 60:
            return self._token
        payload = json.dumps({"app_id": self.app_id, "app_secret": self.app_secret}).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + "/auth/v3/tenant_access_token/internal",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, ValueError):
            return None
        if data.get("code") != 0:
            return None
        self._token = data.get("tenant_access_token")
        self._token_expire = now + float(data.get("expire") or 7200)
        return self._token

    def _table_id(self, collection):
        return self.tables.get(str(collection)) or self.tables.get(_safe_name(collection))

    # ———— 语义 ————
    def append(self, collection, record):
        if not self.available:
            return self._result()
        table_id = self._table_id(collection)
        if not table_id:
            return self._result("collection 未映射飞书数据表: %s" % collection)
        item = dict(record or {})
        item.setdefault("id", uuid.uuid4().hex)
        data = self._post(
            "/bitable/v1/apps/%s/tables/%s/records" % (self.app_token, table_id),
            {"fields": item},
        )
        if data.get("code") != 0:
            return self._result(data.get("msg") or "飞书写入失败")
        return item

    def query(self, collection, filters=None, limit=None):
        if not self.available:
            return self._result()
        table_id = self._table_id(collection)
        if not table_id:
            return self._result("collection 未映射飞书数据表: %s" % collection)
        data = self._get(
            "/bitable/v1/apps/%s/tables/%s/records?page_size=%d"
            % (self.app_token, table_id, min(500, int(limit or 100)))
        )
        if data.get("code") != 0:
            return self._result(data.get("msg") or "飞书读取失败")
        items = (data.get("data") or {}).get("items") or []
        records = []
        for it in items:
            fields = it.get("fields") or {}
            row = dict(fields)
            row.setdefault("record_id", it.get("record_id"))
            records.append(row)
        if filters:
            records = [
                r for r in records if all(r.get(k) == v for k, v in filters.items())
            ]
        return records

    def count(self, collection, filters=None):
        result = self.query(collection, filters)
        if isinstance(result, dict):
            return 0
        return len(result)


def get_store(config=None):
    """按配置返回数据层后端；未知后端名回退到 local。"""
    cfg = config or {}
    backend = str(cfg.get("storage_backend") or "local").strip().lower()
    if backend == "feishu":
        return FeishuStore(cfg)
    root = cfg.get("storage_root") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    return LocalStore(root)
