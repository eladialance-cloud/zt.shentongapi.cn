# -*- coding: utf-8 -*-
"""抖音采集/转写核心（M5）：F1 接缝落地 + F6 风控闸门。

只读流水线：status → collect → download → extract → transcribe → ingest。

设计要点：
- 每个阶段都是**可注入接缝**：外部依赖（浏览器控制 / ffmpeg / 转写引擎）缺失时返回
  结构化错误码（DEPENDENCY_MISSING 等），绝不假成功、不假死；
- 采集复用主进程 computer-control-mcp 的 HTTP 接缝（``douyin_browser_endpoint``），
  本服务不引入独立浏览器驱动；
- 下载走标准库 urllib 直链落盘、抽音频调本地 ffmpeg、转写调配置的引擎端点、
  入库用标准库 JSON 记录仓（零第三方依赖，Python 3.8 可跑）；
- 发布/评论/私信**代码级硬关闭**（与配置无关），返回 DISABLED；
- 风控（F6）：``risk.RiskGate`` 统一负责灰度开闸 / 降频 / 熔断暂停。

``_urlopen`` / ``_runner`` 是刻意留出的可注入点（单测替换为替身，无需真实网络与 ffmpeg）。
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.request

import config as config_module
import risk as risk_mod

USER_AGENT = "ShenTongDouyinPipeline/1.0"
CHUNK_SIZE = 256 * 1024
AUDIO_EXTENSIONS = (".mp4", ".mov", ".mkv", ".webm", ".m4v", ".flv", ".avi")

# 能力注册表：name -> {title, risk, stage, params, depends}
# risk: readonly = 只读采集/转写；high = 发布/评论/私信（代码级硬关闭，永久默认禁用）
# depends: 该能力需要的外部接缝（用于 status 自检与前端提示）
DOUYIN_CAPABILITIES = {
    "status": {
        "title": "采集状态",
        "risk": "readonly",
        "stage": "status",
        "params": {},
        "depends": [],
    },
    "collect": {
        "title": "采集视频",
        "risk": "readonly",
        "stage": "collect",
        "params": {"keyword": "str", "limit": "int?"},
        "depends": ["browser"],
    },
    "download": {
        "title": "下载视频",
        "risk": "readonly",
        "stage": "download",
        "params": {"url": "str", "filename": "str?"},
        "depends": [],
    },
    "extract": {
        "title": "提取音频",
        "risk": "readonly",
        "stage": "extract",
        "params": {"video_path": "str"},
        "depends": ["ffmpeg"],
    },
    "transcribe": {
        "title": "语音转写",
        "risk": "readonly",
        "stage": "transcribe",
        "params": {"audio_path": "str", "engine": "str?"},
        "depends": ["transcriber"],
    },
    "ingest": {
        "title": "结构化入库",
        "risk": "readonly",
        "stage": "ingest",
        "params": {"record": "obj"},
        "depends": [],
    },
    "publish": {
        "title": "发布视频",
        "risk": "high",
        "stage": "publish",
        "params": {"video_path": "str", "title": "str"},
        "depends": [],
    },
    "comment": {
        "title": "评论互动",
        "risk": "high",
        "stage": "comment",
        "params": {"url": "str", "text": "str"},
        "depends": [],
    },
    "dm": {
        "title": "私信",
        "risk": "high",
        "stage": "dm",
        "params": {"user": "str", "text": "str"},
        "depends": [],
    },
}

# 保留：仅在某个槽位确实未接入时使用（当前所有只读能力均已接入真实实现）
PIPELINE_NOT_READY = {"ok": False, "code": "PIPELINE_NOT_READY", "detail": "采集/转写接缝未接入"}
DISABLED = {"ok": False, "code": "DISABLED", "detail": "高风险能力已硬关闭（发布/评论/私信默认禁用）"}

# 高风险能力集合（代码级硬关闭，不随配置开启）
_HIGH_RISK = frozenset(name for name, meta in DOUYIN_CAPABILITIES.items() if meta["risk"] == "high")
# 计入风控额度的能力：采集会驱动浏览器、易触发平台风控；纯查询不占额度
_RATE_COUNTED = frozenset(("collect",))

# ———— 可注入接缝（单测替换）————
_urlopen = urllib.request.urlopen
_runner = subprocess.run


class _TooLarge(Exception):
    """下载体积超限。"""


def _fail(code, detail, **fields):
    result = {"ok": False, "code": code, "detail": detail}
    result.update(fields)
    return result


def _text(payload, name):
    if not isinstance(payload, dict):
        return ""
    value = payload.get(name)
    return str(value).strip() if value is not None else ""


def _int_of(value, fallback):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _hash_id(text, length=16):
    return hashlib.sha1(str(text).encode("utf-8")).hexdigest()[:length]


def _remove_quietly(path):
    try:
        os.remove(path)
    except OSError:
        pass


def _state_dir(cfg=None):
    """可写状态目录（下载视频 / 抽取音频 / 入库记录 / 风控状态）。"""
    cfg = cfg or config_module.load_config()
    configured = str(cfg.get("douyin_state_dir") or "").strip()
    if configured:
        return configured
    return os.path.dirname(os.path.abspath(config_module.config_path()))


def _writable_dir(path):
    """探测目录可写（打包后模块目录可能只读，必须提前发现而不是运行时炸）。"""
    try:
        if not os.path.isdir(path):
            os.makedirs(path)
        probe = os.path.join(path, ".douyin-write-probe")
        with open(probe, "w", encoding="utf-8") as handle:
            handle.write("ok")
        os.remove(probe)
        return True
    except OSError:
        return False


def _ffmpeg_path(cfg=None):
    """ffmpeg 可执行文件：配置优先，其次 PATH；都没有返回空串。"""
    cfg = cfg or config_module.load_config()
    configured = str(cfg.get("douyin_ffmpeg") or "").strip()
    if configured:
        if os.path.exists(configured) or shutil.which(configured):
            return configured
        return ""
    return shutil.which("ffmpeg") or ""


def _post_json(url, body, timeout=60):
    """标准库 JSON POST（走可注入的 _urlopen，便于单测）。"""
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    response = _urlopen(request, timeout=timeout)
    try:
        raw = response.read()
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            close()
    text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
    return json.loads(text) if text.strip() else {}


def _gate(config=None):
    """构造风控闸门（状态文件与 config.json 同目录，打包后在用户数据目录）。"""
    cfg = config if config is not None else config_module.load_config()
    try:
        state_path = config_module.risk_state_path()
    except Exception:  # pragma: no cover - 配置异常时退化为仅进程内计数
        state_path = ""
    return risk_mod.RiskGate(config=cfg, env_prefix="DOUYIN", state_path=state_path)


# ———— 流水线各阶段 ————
def _status_impl(payload, cfg=None, gate=None):
    """采集状态：回报各接缝就绪情况（ready = 浏览器 + ffmpeg + 转写 + 可写目录）。"""
    cfg = cfg or config_module.load_config()
    state_dir = _state_dir(cfg)
    engines = {
        "browser": bool(str(cfg.get("douyin_browser_endpoint") or "").strip()),
        "ffmpeg": bool(_ffmpeg_path(cfg)),
        "transcriber": bool(str(cfg.get("douyin_transcribe_endpoint") or "").strip()),
        "storage": _writable_dir(state_dir),
    }
    result = {
        "ok": True,
        "code": "OK",
        "ready": all(engines.values()),
        "login": "unknown",  # 需浏览器接缝回报；未接入时保持 unknown，不假装在线
        "engines": engines,
        "missing": [name for name, ready in sorted(engines.items()) if not ready],
        "engine": cfg.get("douyin_transcribe_engine"),
        "state_dir": state_dir,
    }
    if gate is not None:
        result["risk"] = gate.snapshot()
    return result


def _collect_impl(payload, cfg=None, gate=None):
    """采集视频：payload={"keyword": str, "limit": int?}；转发给浏览器控制接缝（computer-control-mcp）。"""
    keyword = _text(payload, "keyword")
    if not keyword:
        return _fail("PARAM_MISSING", "缺少参数 keyword（采集关键词）")
    cfg = cfg or config_module.load_config()
    endpoint = str(cfg.get("douyin_browser_endpoint") or "").strip()
    if not endpoint:
        return _fail(
            "DEPENDENCY_MISSING",
            "浏览器控制接缝未接入：请配置 douyin_browser_endpoint（复用 computer-control-mcp，不引入独立浏览器驱动）",
        )
    limit = max(1, min(_int_of((payload or {}).get("limit"), 20), 200))
    try:
        data = _post_json(
            endpoint,
            {"action": "collect", "platform": "douyin", "keyword": keyword, "limit": limit},
            timeout=180,
        )
    except Exception as err:
        return _fail("DEPENDENCY_MISSING", "浏览器控制接缝调用失败: %s" % err)
    if isinstance(data, dict) and data.get("ok") is False:
        return _fail(
            data.get("code") or "DEPENDENCY_MISSING",
            data.get("detail") or data.get("error") or "采集失败",
        )
    items = data.get("items") if isinstance(data, dict) else None
    items = items if isinstance(items, list) else []
    return {"ok": True, "code": "OK", "keyword": keyword, "limit": limit, "count": len(items), "items": items}


def _download_impl(payload, cfg=None, gate=None):
    """下载视频：payload={"url": str, "filename": str?}；直链落盘到 <state>/media/videos/。"""
    url = _text(payload, "url")
    if not url:
        return _fail("PARAM_MISSING", "缺少参数 url（视频直链）")
    if not re.match(r"^https?://", url, re.I):
        return _fail("PARAM_MISSING", "url 必须是 http(s) 直链")
    cfg = cfg or config_module.load_config()
    max_mb = max(1, _int_of(cfg.get("douyin_max_download_mb"), 200))
    max_bytes = max_mb * 1024 * 1024
    target_dir = os.path.join(_state_dir(cfg), "media", "videos")
    if not _writable_dir(target_dir):
        return _fail("DOWNLOAD_FAILED", "下载目录不可写: %s" % target_dir)

    name = _text(payload, "filename")
    if name:
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(name))
        path = os.path.join(target_dir, safe)
    else:
        suffix = os.path.splitext(url.split("?")[0])[1].lower()
        if suffix not in AUDIO_EXTENSIONS:
            suffix = ".mp4"
        path = os.path.join(target_dir, _hash_id(url) + suffix)

    if os.path.exists(path) and os.path.getsize(path) > 0:
        return {"ok": True, "code": "OK", "path": path, "bytes": os.path.getsize(path), "cached": True}

    part = path + ".part"
    size = 0
    content_type = ""
    try:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        response = _urlopen(request, timeout=90)
        try:
            headers = getattr(response, "headers", None)
            if headers is not None and hasattr(headers, "get"):
                content_type = str(headers.get("Content-Type") or "")
            with open(part, "wb") as handle:
                while True:
                    chunk = response.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > max_bytes:
                        raise _TooLarge()
                    handle.write(chunk)
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()
    except _TooLarge:
        _remove_quietly(part)
        return _fail("DOWNLOAD_FAILED", "视频超过 %d MB 下载上限（douyin_max_download_mb）" % max_mb)
    except Exception as err:
        _remove_quietly(part)
        return _fail("DOWNLOAD_FAILED", "下载失败: %s" % err)
    try:
        os.replace(part, path)
    except OSError as err:
        _remove_quietly(part)
        return _fail("DOWNLOAD_FAILED", "落盘失败: %s" % err)
    return {"ok": True, "code": "OK", "path": path, "bytes": size, "content_type": content_type, "cached": False}


def _extract_impl(payload, cfg=None, gate=None):
    """提取音频：payload={"video_path": str}；调 ffmpeg 抽 16k 单声道 wav。"""
    video_path = _text(payload, "video_path")
    if not video_path:
        return _fail("PARAM_MISSING", "缺少参数 video_path（本地视频路径）")
    if not os.path.isfile(video_path):
        return _fail("FILE_NOT_FOUND", "视频文件不存在: %s" % video_path)
    cfg = cfg or config_module.load_config()
    ffmpeg = _ffmpeg_path(cfg)
    if not ffmpeg:
        return _fail(
            "DEPENDENCY_MISSING",
            "未找到 ffmpeg：请安装 ffmpeg 或配置 douyin_ffmpeg 指向可执行文件",
        )
    target_dir = os.path.join(_state_dir(cfg), "media", "audio")
    if not _writable_dir(target_dir):
        return _fail("EXTRACT_FAILED", "音频目录不可写: %s" % target_dir)
    audio_path = os.path.join(target_dir, _hash_id(os.path.abspath(video_path)) + ".wav")
    command = [
        ffmpeg,
        "-y",
        "-i",
        video_path,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        audio_path,
    ]
    try:
        completed = _runner(command, capture_output=True, timeout=1800)
    except Exception as err:
        return _fail("EXTRACT_FAILED", "ffmpeg 执行失败: %s" % err)
    code = getattr(completed, "returncode", 0)
    if code not in (0, None) or not os.path.isfile(audio_path):
        stderr = getattr(completed, "stderr", b"") or b""
        if isinstance(stderr, (bytes, bytearray)):
            stderr = stderr.decode("utf-8", "ignore")
        return _fail("EXTRACT_FAILED", "ffmpeg 退出码 %s: %s" % (code, str(stderr)[-300:]))
    return {"ok": True, "code": "OK", "path": audio_path, "bytes": os.path.getsize(audio_path), "video_path": video_path}


def _transcribe_impl(payload, cfg=None, gate=None):
    """语音转写：payload={"audio_path": str, "engine": str?}；调配置的转写引擎端点。"""
    audio_path = _text(payload, "audio_path")
    if not audio_path:
        return _fail("PARAM_MISSING", "缺少参数 audio_path（本地音频路径）")
    if not os.path.isfile(audio_path):
        return _fail("FILE_NOT_FOUND", "音频文件不存在: %s" % audio_path)
    cfg = cfg or config_module.load_config()
    engine = _text(payload, "engine") or str(cfg.get("douyin_transcribe_engine") or "video-claw")
    endpoint = str(cfg.get("douyin_transcribe_endpoint") or "").strip()
    if not endpoint:
        return _fail(
            "DEPENDENCY_MISSING",
            "转写引擎未接入：请配置 douyin_transcribe_endpoint（当前引擎 %s；video-claw / vosk 皆可通过该 HTTP 接缝接入）"
            % engine,
        )
    try:
        data = _post_json(
            endpoint,
            {"engine": engine, "audio_path": os.path.abspath(audio_path), "language": _text(payload, "language") or "zh"},
            timeout=1800,
        )
    except Exception as err:
        return _fail("TRANSCRIBE_FAILED", "转写引擎调用失败: %s" % err)
    if isinstance(data, dict) and data.get("ok") is False:
        return _fail(data.get("code") or "TRANSCRIBE_FAILED", data.get("detail") or data.get("error") or "转写失败")
    text = ""
    if isinstance(data, dict):
        text = str(data.get("text") or data.get("transcript") or "")
    elif isinstance(data, str):
        text = data
    return {
        "ok": True,
        "code": "OK",
        "engine": engine,
        "audio_path": os.path.abspath(audio_path),
        "text": text,
        "length": len(text),
    }


def _ingest_impl(payload, cfg=None, gate=None):
    """结构化入库：payload={"record": obj}；追加到 <state>/ingest/<date>.json。"""
    record = (payload or {}).get("record") if isinstance(payload, dict) else None
    if not isinstance(record, dict):
        return _fail("PARAM_MISSING", "缺少参数 record（对象：至少含 title/url 等字段）")
    cfg = cfg or config_module.load_config()
    target_dir = os.path.join(_state_dir(cfg), "ingest")
    if not _writable_dir(target_dir):
        return _fail("INGEST_FAILED", "入库目录不可写: %s" % target_dir)
    path = os.path.join(target_dir, time.strftime("%Y-%m-%d") + ".json")
    items = []
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
            if isinstance(loaded, list):
                items = loaded
        except (OSError, ValueError):
            items = []
    entry = dict(record)
    entry["id"] = _hash_id("%s|%s|%s" % (entry.get("url", ""), entry.get("title", ""), time.time()), 20)
    entry["created_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    items.append(entry)
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(items, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except OSError as err:
        return _fail("INGEST_FAILED", "入库写入失败: %s" % err)
    return {"ok": True, "code": "OK", "id": entry["id"], "count": len(items), "path": path}


CAPABILITY_IMPLS = {
    "status": _status_impl,
    "collect": _collect_impl,
    "download": _download_impl,
    "extract": _extract_impl,
    "transcribe": _transcribe_impl,
    "ingest": _ingest_impl,
}


def list_capabilities():
    """能力清单（含中文名 / 风控 / 阶段 / 依赖接缝 / 参数 schema），供能力发现端点使用。"""
    return {
        name: {
            "title": meta["title"],
            "risk": meta["risk"],
            "stage": meta["stage"],
            "params": meta["params"],
            "depends": meta.get("depends", []),
        }
        for name, meta in DOUYIN_CAPABILITIES.items()
    }


def call_capability(cap, payload, config=None, gate=None):
    """分派：高风险硬关闭 → 未知能力 → 风控闸门 → 流水线槽位。"""
    if cap in _HIGH_RISK:
        return dict(DISABLED)
    meta = DOUYIN_CAPABILITIES.get(cap)
    fn = CAPABILITY_IMPLS.get(cap)
    if meta is None or fn is None:
        return {"ok": False, "code": "UNKNOWN_CAP", "detail": "未知能力: " + str(cap)}
    cfg = config if config is not None else config_module.load_config()
    gate = gate if gate is not None else _gate(cfg)
    blocked = gate.acquire(cap, high_risk=False, count=(cap in _RATE_COUNTED))
    if blocked:
        result = dict(blocked)
        result["cap"] = cap
        return result
    return fn(payload or {}, cfg, gate)
