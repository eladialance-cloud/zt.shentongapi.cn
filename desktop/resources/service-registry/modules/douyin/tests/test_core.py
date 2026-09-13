# -*- coding: utf-8 -*-
"""douyin core：能力注册表 / 高风险硬关闭 / 只读能力缺依赖时的结构化错误码。"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import (  # noqa: E402
    CAPABILITY_IMPLS,
    DISABLED,
    DOUYIN_CAPABILITIES,
    call_capability,
    list_capabilities,
)

READONLY = {"status", "collect", "download", "extract", "transcribe", "ingest"}
HIGH = {"publish", "comment", "dm"}


class _env(object):
    """临时设置/清除环境变量（风控闸门读 env，测试需要隔离）。"""

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


def test_capability_registry():
    assert set(DOUYIN_CAPABILITIES.keys()) == READONLY | HIGH
    assert set(CAPABILITY_IMPLS.keys()) == READONLY


def test_high_risk_hard_disabled():
    """发布/评论/私信是代码级硬关闭：与配置、开闸开关都无关。"""
    for cap in HIGH:
        assert call_capability(cap, {}) == DISABLED
        assert call_capability(cap, {"text": "x"}) == DISABLED


def test_high_risk_still_disabled_when_gate_opened():
    with _env("DOUYIN_ENABLE_HIGH_RISK", "1"):
        for cap in HIGH:
            assert call_capability(cap, {}) == DISABLED


def test_unknown_cap():
    assert call_capability("nope", {})["code"] == "UNKNOWN_CAP"


def test_list_capabilities_metadata():
    caps = list_capabilities()
    assert caps["collect"]["risk"] == "readonly"
    assert caps["publish"]["risk"] == "high"
    assert caps["collect"]["params"]["keyword"] == "str"
    assert caps["collect"]["depends"] == ["browser"]
    assert caps["extract"]["depends"] == ["ffmpeg"]
    assert caps["transcribe"]["depends"] == ["transcriber"]
    assert caps["publish"]["depends"] == []


def test_status_is_structured_even_without_seams():
    with _env("DOUYIN_BROWSER_ENDPOINT", None), _env("DOUYIN_TRANSCRIBE_ENDPOINT", None):
        result = call_capability("status", {})
    assert result["ok"] is True
    assert result["ready"] is False
    assert set(result["engines"].keys()) == {"browser", "ffmpeg", "transcriber", "storage"}
    assert "browser" in result["missing"]
    assert result["login"] == "unknown"
    assert "risk" in result


def test_readonly_caps_report_missing_params():
    """缺参数时报 PARAM_MISSING（不是假装跑通，也不是抛异常）。"""
    for cap in ("collect", "download", "extract", "transcribe", "ingest"):
        result = call_capability(cap, {})
        assert result["ok"] is False, cap
        assert result["code"] == "PARAM_MISSING", cap
        assert result["detail"]


def test_collect_without_browser_seam_is_dependency_missing():
    with _env("DOUYIN_BROWSER_ENDPOINT", None):
        result = call_capability("collect", {"keyword": "露营装备"})
    assert result["ok"] is False
    assert result["code"] == "DEPENDENCY_MISSING"
    assert "browser_endpoint" in result["detail"]


def test_extract_missing_file_is_file_not_found():
    result = call_capability("extract", {"video_path": os.path.join(os.sep, "no-such-video.mp4")})
    assert result["code"] == "FILE_NOT_FOUND"


def test_transcribe_without_engine_seam_is_dependency_missing():
    import tempfile

    handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    handle.write(b"RIFF")
    handle.close()
    try:
        with _env("DOUYIN_TRANSCRIBE_ENDPOINT", None):
            result = call_capability("transcribe", {"audio_path": handle.name})
        assert result["code"] == "DEPENDENCY_MISSING"
        assert "transcribe_endpoint" in result["detail"]
    finally:
        os.remove(handle.name)


def test_paused_blocks_pipeline_but_not_hard_disabled():
    with _env("DOUYIN_PAUSED", "1"):
        assert call_capability("collect", {"keyword": "x"})["code"] == "RISK_PAUSED"
        assert call_capability("status", {})["code"] == "RISK_PAUSED"
        assert call_capability("publish", {}) == DISABLED
