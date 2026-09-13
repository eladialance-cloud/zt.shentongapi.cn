# -*- coding: utf-8 -*-
"""业务流引擎配置：config.json（可选）+ 环境变量覆盖。

环境变量优先级最高，便于 service-manager 注入；缺省值保证「零配置也能拉起」。
"""

import json
import os

DEFAULTS = {
    "flows_port": 9040,
    "storage_backend": "local",
    "storage_root": "",
    "storage_feishu": {},
    "llm_base_url": "",
    "llm_api_key": "",
    "llm_model": "",
    "wx_base_url": "http://127.0.0.1:9020",
    "douyin_base_url": "http://127.0.0.1:9030",
    "poster_endpoint": "",
    "private_domain_target": "",
    "private_domain_content": "",
    "enable_high_risk": False,
    "risk_rate_per_minute": 0,
    "risk_daily_limit": 0,
    "risk_paused": False,
}


def _to_bool(raw):
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _to_json_obj(raw):
    """解析 JSON 对象字符串（用于 FLOWS_FEISHU_* 注入）。非法时返回 None 跳过。"""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


_ENV_MAP = {
    "FLOWS_PORT": ("flows_port", int),
    "FLOWS_STORAGE_BACKEND": ("storage_backend", str),
    "FLOWS_STORAGE_ROOT": ("storage_root", str),
    "FLOWS_STORAGE_FEISHU": ("storage_feishu", _to_json_obj),
    "FLOWS_STORAGE_FEISHU": ("storage_feishu", _to_json_obj),
    "FLOWS_FEISHU_APP_TOKEN": ("feishu_app_token", str),
    "FLOWS_FEISHU_TABLES": ("feishu_tables", _to_json_obj),
    "FLOWS_LLM_BASE_URL": ("llm_base_url", str),
    "FLOWS_LLM_API_KEY": ("llm_api_key", str),
    "FLOWS_LLM_MODEL": ("llm_model", str),
    "FLOWS_WX_BASE_URL": ("wx_base_url", str),
    "FLOWS_DOUYIN_BASE_URL": ("douyin_base_url", str),
    "FLOWS_POSTER_ENDPOINT": ("poster_endpoint", str),
    "FLOWS_PRIVATE_DOMAIN_TARGET": ("private_domain_target", str),
    "FLOWS_ENABLE_HIGH_RISK": ("enable_high_risk", _to_bool),
    "FLOWS_RISK_RATE_PER_MINUTE": ("risk_rate_per_minute", int),
    "FLOWS_RISK_DAILY_LIMIT": ("risk_daily_limit", int),
    "FLOWS_PAUSED": ("risk_paused", _to_bool),
    # 飞书后端注入（JSON 字符串）
    "FLOWS_FEISHU_APP_TOKEN": ("_feishu_app_token", str),
    "FLOWS_FEISHU_TABLES": ("_feishu_tables", _to_json_obj),
}


def module_dir():
    """模块根目录绝对路径。"""
    return os.path.dirname(os.path.abspath(__file__))


def config_path():
    """配置文件位置：FLOWS_CONFIG 优先（打包后指向用户数据目录），否则模块目录旁。

    模块目录随包分发在 resources 内（macOS / Program Files 下不可写），因此 service-manager
    会通过 FLOWS_CONFIG 把配置指到 <userData>/service-registry/flows/config.json。
    """
    override = os.environ.get("FLOWS_CONFIG")
    if override:
        return override
    return os.path.join(module_dir(), "config.json")


def load_config():
    data = dict(DEFAULTS)
    path = config_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
            if isinstance(loaded, dict):
                data.update(loaded)
        except (OSError, ValueError):
            pass
    for env_key, (field, cast) in _ENV_MAP.items():
        raw = os.environ.get(env_key)
        if raw is None or raw == "":
            continue
        try:
            data[field] = cast(raw)
        except (TypeError, ValueError):
            continue
    if not data.get("storage_root"):
        data["storage_root"] = os.path.join(module_dir(), "data")
    # 飞书后端：把 FLOWS_FEISHU_* 汇总为 storage_feishu（不覆盖 config.json 里已存在的映射）
    feishu = dict(data.get("storage_feishu") or {})
    app_token = data.pop("_feishu_app_token", None)
    if app_token:
        feishu.setdefault("app_token", app_token)
    tables = data.pop("_feishu_tables", None)
    if tables:
        existing = feishu.get("tables")
        merged = dict(tables)
        if isinstance(existing, dict):
            merged.update(existing)
        feishu["tables"] = merged
    if feishu:
        data["storage_feishu"] = feishu
    return data


def risk_state_path():
    """风控状态文件：FLOWS_RISK_STATE 优先，否则与 config.json 同目录（打包后在用户数据目录）。"""
    override = os.environ.get("FLOWS_RISK_STATE")
    if override:
        return override
    return os.path.join(os.path.dirname(os.path.abspath(config_path())), "risk_state.json")
