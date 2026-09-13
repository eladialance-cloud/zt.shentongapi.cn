# -*- coding: utf-8 -*-
"""wx-gateway 配置加载：config.json（可选）+ 环境变量覆盖。

后端为开源 wxauto（MIT），**不需要任何授权密钥**，因此本模块不再读取 license_key。
历史配置里的 license_key / license_source / sdk_mode 字段会被忽略（保留兼容，不报错）。
"""
import json
import os

DEFAULTS = {
    "wx_port": 9020,
    "backend": "wxauto",
    "wx_auto_home": "",
    "wx_appid": "",
    # 风控（F6）：高风险动作默认关闸；额度 0 = 不限（建议真机验证后按需开启）
    "enable_high_risk": False,
    "risk_rate_per_minute": 0,
    "risk_daily_limit": 0,
    "risk_paused": False,
}

_BOOL_ENV = {
    "WX_ENABLE_HIGH_RISK": "enable_high_risk",
    "WX_PAUSED": "risk_paused",
}

_INT_ENV = {
    "WX_RISK_RATE_PER_MINUTE": "risk_rate_per_minute",
    "WX_RISK_DAILY_LIMIT": "risk_daily_limit",
}


def config_path():
    """配置文件位置：WX_CONFIG 优先（打包后指向用户数据目录），否则模块目录旁。

    模块目录随包分发在 resources 内（macOS / Program Files 下只读），因此 service-manager
    通过 WX_CONFIG 把配置指到 <userData>/service-registry/wx-gateway/config.json。
    """
    override = os.environ.get("WX_CONFIG")
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
    # 环境变量优先级最高（便于 service-manager 注入）
    if os.environ.get("WX_PORT"):
        data["wx_port"] = int(os.environ["WX_PORT"])
    if os.environ.get("WX_AUTO_HOME"):
        data["wx_auto_home"] = os.environ["WX_AUTO_HOME"]
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
    return data


def risk_state_path():
    """风控状态文件：WX_RISK_STATE 优先，否则与 config.json 同目录（打包后在用户数据目录）。"""
    override = os.environ.get("WX_RISK_STATE")
    if override:
        return override
    return os.path.join(os.path.dirname(os.path.abspath(config_path())), "risk_state.json")
