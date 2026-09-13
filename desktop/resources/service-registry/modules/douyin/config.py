# -*- coding: utf-8 -*-
"""douyin 配置加载：config.json（可选）+ 环境变量覆盖。只读采集，无授权密钥。"""
import json
import os

DEFAULTS = {
    "douyin_port": 9030,
    # 浏览器控制复用主进程 computer-control-mcp；这里只存 HTTP 接缝地址（未配置 → DEPENDENCY_MISSING）
    "douyin_browser": "computer-control",
    "douyin_browser_endpoint": "",
    # 转写引擎：video-claw / vosk 皆可，通过统一 HTTP 接缝接入
    "douyin_transcribe_engine": "video-claw",
    "douyin_transcribe_endpoint": "",
    # ffmpeg 可执行文件路径（缺省走 PATH）
    "douyin_ffmpeg": "",
    # 状态目录（下载的视频 / 抽取的音频 / 入库记录），缺省与 config.json 同目录
    "douyin_state_dir": "",
    # 采集每日上限（别名，等价 risk_daily_limit）；0 = 不限
    "douyin_daily_limit": 0,
    "douyin_max_download_mb": 200,
    # 风控（F6）
    "enable_high_risk": False,
    "risk_rate_per_minute": 0,
    "risk_daily_limit": 0,
    "risk_paused": False,
}

_BOOL_ENV = {
    "DOUYIN_ENABLE_HIGH_RISK": "enable_high_risk",
    "DOUYIN_PAUSED": "risk_paused",
}

_INT_ENV = {
    "DOUYIN_DAILY_LIMIT": "douyin_daily_limit",
    "DOUYIN_MAX_DOWNLOAD_MB": "douyin_max_download_mb",
    "DOUYIN_RISK_RATE_PER_MINUTE": "risk_rate_per_minute",
    "DOUYIN_RISK_DAILY_LIMIT": "risk_daily_limit",
}

_STR_ENV = {
    "DOUYIN_BROWSER_ENDPOINT": "douyin_browser_endpoint",
    "DOUYIN_TRANSCRIBE_ENDPOINT": "douyin_transcribe_endpoint",
    "DOUYIN_TRANSCRIBE_ENGINE": "douyin_transcribe_engine",
    "DOUYIN_FFMPEG": "douyin_ffmpeg",
    "DOUYIN_STATE_DIR": "douyin_state_dir",
}


def config_path():
    """配置文件位置：DOUYIN_CONFIG 优先（打包后指向用户数据目录），否则模块目录旁。

    模块目录随包分发在 resources 内（macOS / Program Files 下只读），因此 service-manager
    通过 DOUYIN_CONFIG 把配置指到 <userData>/service-registry/douyin/config.json。
    """
    override = os.environ.get("DOUYIN_CONFIG")
    if override:
        return override
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    data = dict(DEFAULTS)
    path = config_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data.update(json.load(f))
        except (OSError, ValueError):
            pass
    data["douyin_port"] = int(os.environ.get("DOUYIN_PORT", data.get("douyin_port", 9030)))
    for env_key, field in _STR_ENV.items():
        raw = os.environ.get(env_key)
        if raw not in (None, ""):
            data[field] = raw
    for env_key, field in _BOOL_ENV.items():
        raw = os.environ.get(env_key)
        if raw not in (None, ""):
            data[field] = str(raw).strip().lower() in ("1", "true", "yes", "on")
    for env_key, field in _INT_ENV.items():
        raw = os.environ.get(env_key)
        if raw in (None, ""):
            continue
        try:
            data[field] = int(raw)
        except (TypeError, ValueError):
            continue
    # douyin_daily_limit 是 risk_daily_limit 的别名（历史字段），未显式配置额度时以它为准
    if not data.get("risk_daily_limit") and data.get("douyin_daily_limit"):
        try:
            data["risk_daily_limit"] = int(data["douyin_daily_limit"])
        except (TypeError, ValueError):
            pass
    return data


def state_dir():
    """可写状态目录：DOUYIN_STATE_DIR / config.douyin_state_dir 优先，否则与 config.json 同目录。"""
    override = os.environ.get("DOUYIN_STATE_DIR")
    if override:
        return override
    configured = load_config().get("douyin_state_dir")
    if configured:
        return configured
    return os.path.dirname(os.path.abspath(config_path()))


def risk_state_path():
    """风控状态文件：DOUYIN_RISK_STATE 优先，否则与 config.json 同目录。"""
    override = os.environ.get("DOUYIN_RISK_STATE")
    if override:
        return override
    return os.path.join(os.path.dirname(os.path.abspath(config_path())), "risk_state.json")
