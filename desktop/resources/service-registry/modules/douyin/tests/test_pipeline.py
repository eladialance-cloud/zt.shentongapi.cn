# -*- coding: utf-8 -*-
"""douyin 流水线（F1）：下载 / 抽音频 / 转写 / 入库 / 采集 的可注入接缝测试。

全程用替身（core._urlopen / core._runner）与临时目录，不需要真实网络、ffmpeg、转写引擎。
"""

import json
import os
import shutil
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import core  # noqa: E402


class _env(object):
    """临时设置/清除环境变量。"""

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


class _sandbox(object):
    """把配置 / 状态目录 / 风控状态都指向临时目录，避免污染模块目录。"""

    _CLEARED = (
        "DOUYIN_BROWSER_ENDPOINT",
        "DOUYIN_TRANSCRIBE_ENDPOINT",
        "DOUYIN_FFMPEG",
        "DOUYIN_PAUSED",
        "DOUYIN_MAX_DOWNLOAD_MB",
    )

    def __enter__(self):
        self.root = tempfile.mkdtemp(prefix="st-douyin-")
        self.stack = [
            _env("DOUYIN_CONFIG", os.path.join(self.root, "config.json")),
            _env("DOUYIN_STATE_DIR", self.root),
            _env("DOUYIN_RISK_STATE", os.path.join(self.root, "risk_state.json")),
        ] + [_env(key, None) for key in self._CLEARED]
        for ctx in self.stack:
            ctx.__enter__()
        return self.root

    def __exit__(self, exc_type, exc, tb):
        for ctx in reversed(self.stack):
            ctx.__exit__(exc_type, exc, tb)
        shutil.rmtree(self.root, ignore_errors=True)
        return False


class _FakeResponse(object):
    def __init__(self, chunks, headers=None):
        self._chunks = list(chunks)
        self.headers = headers or {}
        self.closed = False

    def read(self, size=-1):
        return self._chunks.pop(0) if self._chunks else b""

    def close(self):
        self.closed = True


class _UrlOpenStub(object):
    """_urlopen 替身：按 URL 子串路由到「二进制分片」或「JSON 体」。"""

    def __init__(self, routes, error=None):
        self.routes = routes
        self.error = error
        self.requests = []

    def __call__(self, request, timeout=None):
        url = getattr(request, "full_url", str(request))
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        for key, value in self.routes:
            if key in url:
                if isinstance(value, list):
                    return _FakeResponse(value, headers={"Content-Type": "video/mp4"})
                return _FakeResponse(
                    [json.dumps(value, ensure_ascii=False).encode("utf-8")],
                    headers={"Content-Type": "application/json"},
                )
        raise AssertionError("未路由的请求: " + url)

    def body(self, index=0):
        return json.loads(self.requests[index].data.decode("utf-8"))


class _RunnerStub(object):
    """subprocess.run 替身：按需产出音频文件并回放 returncode/stderr。"""

    def __init__(self, returncode=0, create=True, stderr=b""):
        self.returncode = returncode
        self.create = create
        self.stderr = stderr
        self.commands = []

    def __call__(self, command, capture_output=True, timeout=None):
        self.commands.append(list(command))
        if self.create:
            with open(command[-1], "wb") as handle:
                handle.write(b"RIFF0000WAVE")
        return types.SimpleNamespace(returncode=self.returncode, stderr=self.stderr)


class _patch(object):
    """临时替换 core 上的可注入接缝。"""

    def __init__(self, **attrs):
        self.attrs = attrs
        self.originals = {}

    def __enter__(self):
        for name, value in self.attrs.items():
            self.originals[name] = getattr(core, name)
            setattr(core, name, value)
        return self

    def __exit__(self, exc_type, exc, tb):
        for name, value in self.originals.items():
            setattr(core, name, value)
        return False


# ———— download ————
def test_download_writes_file_then_hits_cache():
    with _sandbox() as root:
        stub = _UrlOpenStub([("cdn.example.com", [b"abc", b"def", b""])])
        with _patch(_urlopen=stub):
            first = core.call_capability("download", {"url": "https://cdn.example.com/v.mp4?sign=1"})
            assert first["ok"] is True
            assert first["bytes"] == 6
            assert first["cached"] is False
            assert first["path"].startswith(root)
            assert os.path.isfile(first["path"])
            assert first["path"].endswith(".mp4")
            # 第二次同 URL → 命中本地缓存，不再发请求
            with _patch(_urlopen=_UrlOpenStub([])):
                second = core.call_capability("download", {"url": "https://cdn.example.com/v.mp4?sign=1"})
        assert second["ok"] is True
        assert second["cached"] is True
        assert second["path"] == first["path"]
        assert len(stub.requests) == 1


def test_download_rejects_non_http_url_and_missing_param():
    with _sandbox():
        assert core.call_capability("download", {})["code"] == "PARAM_MISSING"
        assert core.call_capability("download", {"url": "ftp://x/v.mp4"})["code"] == "PARAM_MISSING"


def test_download_oversize_is_rejected_and_cleaned():
    with _sandbox() as root:
        chunk = b"x" * (512 * 1024)
        stub = _UrlOpenStub([("cdn.example.com", [chunk, chunk, chunk, b""])])
        with _patch(_urlopen=stub), _env("DOUYIN_MAX_DOWNLOAD_MB", "1"):
            result = core.call_capability("download", {"url": "https://cdn.example.com/big.mp4"})
        assert result["ok"] is False
        assert result["code"] == "DOWNLOAD_FAILED"
        assert "上限" in result["detail"]
        videos = os.path.join(root, "media", "videos")
        leftovers = os.listdir(videos) if os.path.isdir(videos) else []
        assert leftovers == [], "超限下载不应留下半成品文件"


def test_download_network_error_is_structured():
    with _sandbox():
        with _patch(_urlopen=_UrlOpenStub([], error=OSError("connection reset"))):
            result = core.call_capability("download", {"url": "https://cdn.example.com/v.mp4"})
        assert result["ok"] is False
        assert result["code"] == "DOWNLOAD_FAILED"
        assert "connection reset" in result["detail"]


# ———— extract ————
def test_extract_without_ffmpeg_is_dependency_missing():
    with _sandbox() as root:
        video = os.path.join(root, "in.mp4")
        with open(video, "wb") as handle:
            handle.write(b"video")
        with _patch(_ffmpeg_path=lambda cfg=None: ""):
            result = core.call_capability("extract", {"video_path": video})
        assert result["code"] == "DEPENDENCY_MISSING"
        assert "ffmpeg" in result["detail"]


def test_extract_invokes_ffmpeg_with_16k_mono():
    with _sandbox() as root:
        video = os.path.join(root, "in.mp4")
        with open(video, "wb") as handle:
            handle.write(b"video")
        runner = _RunnerStub()
        with _patch(_ffmpeg_path=lambda cfg=None: sys.executable, _runner=runner):
            result = core.call_capability("extract", {"video_path": video})
        assert result["ok"] is True
        assert result["path"].endswith(".wav")
        assert os.path.isfile(result["path"])
        command = runner.commands[0]
        for flag in ("-vn", "pcm_s16le", "-ar", "16000", "-ac", "1"):
            assert flag in command, flag


def test_extract_ffmpeg_failure_is_structured():
    with _sandbox() as root:
        video = os.path.join(root, "in.mp4")
        with open(video, "wb") as handle:
            handle.write(b"video")
        runner = _RunnerStub(returncode=1, create=False, stderr=b"Invalid data found")
        with _patch(_ffmpeg_path=lambda cfg=None: sys.executable, _runner=runner):
            result = core.call_capability("extract", {"video_path": video})
        assert result["code"] == "EXTRACT_FAILED"
        assert "Invalid data found" in result["detail"]


def test_extract_missing_video_file():
    with _sandbox():
        result = core.call_capability("extract", {"video_path": os.path.join(os.sep, "nope.mp4")})
        assert result["code"] == "FILE_NOT_FOUND"


# ———— transcribe ————
def test_transcribe_posts_to_engine_seam():
    with _sandbox() as root:
        audio = os.path.join(root, "a.wav")
        with open(audio, "wb") as handle:
            handle.write(b"RIFF")
        stub = _UrlOpenStub([("127.0.0.1:9100", {"text": "大家好，今天我们聊露营装备"})])
        with _env("DOUYIN_TRANSCRIBE_ENDPOINT", "http://127.0.0.1:9100/transcribe"), _patch(_urlopen=stub):
            result = core.call_capability("transcribe", {"audio_path": audio, "engine": "vosk"})
        assert result["ok"] is True
        assert result["engine"] == "vosk"
        assert result["text"] == "大家好，今天我们聊露营装备"
        assert result["length"] == len(result["text"])
        body = stub.body()
        assert body["engine"] == "vosk"
        assert body["audio_path"] == os.path.abspath(audio)


def test_transcribe_engine_failure_is_structured():
    with _sandbox() as root:
        audio = os.path.join(root, "a.wav")
        with open(audio, "wb") as handle:
            handle.write(b"RIFF")
        stub = _UrlOpenStub([("127.0.0.1:9100", {"ok": False, "code": "MODEL_MISSING", "detail": "模型未下载"})])
        with _env("DOUYIN_TRANSCRIBE_ENDPOINT", "http://127.0.0.1:9100/transcribe"), _patch(_urlopen=stub):
            result = core.call_capability("transcribe", {"audio_path": audio})
        assert result["code"] == "MODEL_MISSING"
        assert result["detail"] == "模型未下载"


# ———— collect ————
def test_collect_forwards_keyword_to_browser_seam():
    stub = _UrlOpenStub([("127.0.0.1:9181", {"ok": True, "items": [{"url": "u1"}, {"url": "u2"}]})])
    with _sandbox(), _env("DOUYIN_BROWSER_ENDPOINT", "http://127.0.0.1:9181/browser"), _patch(_urlopen=stub):
        result = core.call_capability("collect", {"keyword": "露营装备", "limit": 5})
    assert result["ok"] is True
    assert result["count"] == 2
    assert result["keyword"] == "露营装备"
    body = stub.body()
    assert body == {"action": "collect", "platform": "douyin", "keyword": "露营装备", "limit": 5}


def test_collect_propagates_seam_failure_code():
    stub = _UrlOpenStub([("127.0.0.1:9181", {"ok": False, "code": "LOGIN_EXPIRED", "detail": "登录态失效"})])
    with _sandbox(), _env("DOUYIN_BROWSER_ENDPOINT", "http://127.0.0.1:9181/browser"), _patch(_urlopen=stub):
        result = core.call_capability("collect", {"keyword": "x"})
    assert result["code"] == "LOGIN_EXPIRED"
    assert result["detail"] == "登录态失效"


def test_collect_requires_keyword():
    with _sandbox():
        assert core.call_capability("collect", {})["code"] == "PARAM_MISSING"


# ———— ingest ————
def test_ingest_appends_records_with_ids():
    with _sandbox() as root:
        first = core.call_capability("ingest", {"record": {"title": "A", "url": "u1"}})
        second = core.call_capability("ingest", {"record": {"title": "B"}})
        assert first["ok"] is True
        assert first["count"] == 1
        assert second["count"] == 2
        assert first["id"] != second["id"]
        assert second["path"].startswith(root)
        with open(second["path"], "r", encoding="utf-8") as handle:
            items = json.load(handle)
        assert [item["title"] for item in items] == ["A", "B"]
        assert all(item.get("created_at") for item in items)


def test_ingest_requires_record_object():
    with _sandbox():
        assert core.call_capability("ingest", {})["code"] == "PARAM_MISSING"
        assert core.call_capability("ingest", {"record": "不是对象"})["code"] == "PARAM_MISSING"


# ———— status + 全链路冒烟 ————
def test_status_reports_engines_when_seams_configured():
    with _sandbox(), _env("DOUYIN_BROWSER_ENDPOINT", "http://127.0.0.1:9181/browser"), _env(
        "DOUYIN_TRANSCRIBE_ENDPOINT", "http://127.0.0.1:9100/transcribe"
    ), _env("DOUYIN_FFMPEG", sys.executable):
        result = core.call_capability("status", {})
    assert result["ready"] is True
    assert result["missing"] == []
    assert result["engines"] == {"browser": True, "ffmpeg": True, "transcriber": True, "storage": True}


def test_pipeline_end_to_end_smoke():
    """采集 → 下载 → 抽音频 → 转写 → 入库 全链路冒烟（全部接缝为替身）。"""
    with _sandbox() as root:
        stub = _UrlOpenStub(
            [
                ("127.0.0.1:9181", {"ok": True, "items": [{"url": "https://cdn.example.com/v.mp4"}]}),
                ("cdn.example.com", [b"video-bytes", b""]),
                ("127.0.0.1:9100", {"text": "露营装备测评"}),
            ]
        )
        runner = _RunnerStub()
        with _env("DOUYIN_BROWSER_ENDPOINT", "http://127.0.0.1:9181/browser"), _env(
            "DOUYIN_TRANSCRIBE_ENDPOINT", "http://127.0.0.1:9100/transcribe"
        ), _patch(_urlopen=stub, _runner=runner, _ffmpeg_path=lambda cfg=None: sys.executable):
            collected = core.call_capability("collect", {"keyword": "露营"})
            assert collected["count"] == 1
            url = collected["items"][0]["url"]
            downloaded = core.call_capability("download", {"url": url})
            extracted = core.call_capability("extract", {"video_path": downloaded["path"]})
            transcribed = core.call_capability("transcribe", {"audio_path": extracted["path"]})
            ingested = core.call_capability(
                "ingest",
                {
                    "record": {
                        "title": "露营装备测评",
                        "url": url,
                        "video_path": downloaded["path"],
                        "audio_path": extracted["path"],
                        "text": transcribed["text"],
                    }
                },
            )
        assert ingested["ok"] is True
        assert ingested["count"] == 1
        with open(ingested["path"], "r", encoding="utf-8") as handle:
            record = json.load(handle)[0]
        assert record["text"] == "露营装备测评"
        assert record["video_path"].startswith(root)
        assert record["audio_path"].startswith(root)
