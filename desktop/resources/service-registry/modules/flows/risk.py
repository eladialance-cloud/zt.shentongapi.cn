# -*- coding: utf-8 -*-
"""风控闸门（F6）：高风险灰度开闸 + 降频 + 一键暂停。

flows / wx-gateway / douyin 三个外部能力模块共用同一份实现（各模块自带副本，
与 config.py 一样是刻意重复：模块会被单独复制进 resources/ 独立运行）。

三件事：
1. **灰度**：高风险动作默认关闭，需 ``<PREFIX>_ENABLE_HIGH_RISK=1``
   或 config ``enable_high_risk=true`` 才放行，否则 ``RISK_DISABLED``；
2. **降频**：每分钟上限 ``risk_rate_per_minute``、每日上限 ``risk_daily_limit``
   （自然日），**0 表示不限**；超限返回 ``RATE_LIMITED``（带剩余/重置提示）；
3. **暂停**：``risk_paused`` 或 ``<PREFIX>_PAUSED=1`` 时一律 ``RISK_PAUSED``（运维熔断）。

状态落在 JSON（默认与 config.json 同目录的 risk_state.json），重启不清零，
便于诊断「今天还能发多少条」。文件不可写时退化为仅进程内计数，不阻断主流程。
"""

import json
import os
import time

RISK_DISABLED = "RISK_DISABLED"
RATE_LIMITED = "RATE_LIMITED"
RISK_PAUSED = "RISK_PAUSED"

WINDOW_SECONDS = 60
_TRUE = ("1", "true", "yes", "on")


def _flag(raw):
    return str(raw).strip().lower() in _TRUE


def default_state_path(config_path):
    """状态文件默认位置：与 config.json 同目录（打包后该目录在用户数据目录，可写）。"""
    if not config_path:
        return ""
    return os.path.join(os.path.dirname(os.path.abspath(config_path)), "risk_state.json")


class RiskGate(object):
    """一次服务生命周期内复用的风控闸门（内部持有窗口/当日计数）。"""

    def __init__(self, config=None, env_prefix="", state_path=None, now=None):
        self.config = config or {}
        self.env_prefix = str(env_prefix or "").upper()
        self.state_path = state_path or ""
        self._now = now or time.time
        self._windows = {}   # action -> [时间戳]
        self._counts = {}    # action -> 今日已用
        self._day = ""
        self._loaded = False

    # ———— 配置读取（环境变量优先于 config.json）————
    def _env(self, name):
        if not self.env_prefix:
            return None
        return os.environ.get("%s_%s" % (self.env_prefix, name))

    def _flag_conf(self, env_name, key):
        raw = self._env(env_name)
        if raw is not None and raw != "":
            return _flag(raw)
        return bool(self.config.get(key))

    def _int_conf(self, env_name, key, fallback=0):
        raw = self._env(env_name)
        source = raw if (raw is not None and raw != "") else self.config.get(key)
        try:
            value = int(source)
        except (TypeError, ValueError):
            return fallback
        return value if value >= 0 else fallback

    def high_risk_enabled(self):
        """高风险动作是否已开闸。"""
        return self._flag_conf("ENABLE_HIGH_RISK", "enable_high_risk")

    def paused(self):
        """是否处于熔断暂停状态。"""
        return self._flag_conf("PAUSED", "risk_paused")

    def rate_per_minute(self):
        """每分钟额度；0 = 不限。"""
        return self._int_conf("RISK_RATE_PER_MINUTE", "risk_rate_per_minute", 0)

    def daily_limit(self):
        """每日额度；0 = 不限。"""
        return self._int_conf("RISK_DAILY_LIMIT", "risk_daily_limit", 0)

    # ———— 状态读写 ————
    def _today(self):
        return time.strftime("%Y-%m-%d", time.localtime(self._now()))

    def _load(self):
        if self._loaded:
            return
        self._loaded = True
        self._day = self._today()
        if not self.state_path or not os.path.exists(self.state_path):
            return
        try:
            with open(self.state_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            return
        if not isinstance(data, dict):
            return
        if data.get("day") == self._day:
            counts = data.get("counts")
            if isinstance(counts, dict):
                for key, value in counts.items():
                    try:
                        self._counts[str(key)] = int(value)
                    except (TypeError, ValueError):
                        continue
        cutoff = self._now() - WINDOW_SECONDS
        windows = data.get("windows")
        if isinstance(windows, dict):
            for key, stamps in windows.items():
                if not isinstance(stamps, list):
                    continue
                kept = [s for s in stamps if isinstance(s, (int, float)) and s > cutoff]
                if kept:
                    self._windows[str(key)] = kept

    def _save(self):
        if not self.state_path:
            return
        payload = {
            "day": self._today(),
            "counts": self._counts,
            "windows": self._windows,
        }
        try:
            parent = os.path.dirname(self.state_path)
            if parent and not os.path.isdir(parent):
                os.makedirs(parent)
            tmp = self.state_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False)
            os.replace(tmp, self.state_path)
        except OSError:
            # 状态文件不可写时退化为「仅进程内计数」，不因为风控记账失败而阻断业务
            pass

    def snapshot(self):
        """当前风控快照（供 /api/*/status 诊断展示）。"""
        self._load()
        return {
            "paused": self.paused(),
            "high_risk_enabled": self.high_risk_enabled(),
            "rate_per_minute": self.rate_per_minute(),
            "daily_limit": self.daily_limit(),
            "day": self._day,
            "used_today": dict(self._counts),
            "state_file": self.state_path or None,
        }

    # ———— 闸门 ————
    def acquire(self, action, high_risk=False, count=True, daily_limit=None):
        """申请一次动作额度。

        返回 ``None`` 表示放行（并按需记账）；否则返回结构化失败 dict（含 code/detail）。
        ``count=False`` 用于只读查询：不占用外发额度、也不落盘。
        """
        name = str(action or "default")
        if self.paused():
            return {
                "ok": False,
                "code": RISK_PAUSED,
                "detail": "风控已暂停（risk_paused / %s_PAUSED）：全部动作被拦截，解除后自动恢复"
                % self.env_prefix,
                "risk": "paused",
            }
        if high_risk and not self.high_risk_enabled():
            return {
                "ok": False,
                "code": RISK_DISABLED,
                "detail": "高风险动作默认关闭（灰度）；确认合规后设 %s_ENABLE_HIGH_RISK=1 或 config enable_high_risk=true"
                % self.env_prefix,
                "risk": "disabled",
            }
        if not count:
            return None

        minute_cap = self.rate_per_minute()
        day_cap = self.daily_limit() if daily_limit is None else max(0, int(daily_limit or 0))
        if minute_cap <= 0 and day_cap <= 0:
            return None  # 未配置额度：直接放行，不读也不写状态文件

        self._load()
        if self._day != self._today():  # 跨天：清零当日额度
            self._counts = {}
            self._day = self._today()
        now = self._now()

        if minute_cap > 0:
            window = [stamp for stamp in self._windows.get(name, []) if now - stamp < WINDOW_SECONDS]
            if len(window) >= minute_cap:
                wait = int(WINDOW_SECONDS - (now - window[0])) + 1
                return {
                    "ok": False,
                    "code": RATE_LIMITED,
                    "detail": "「%s」每分钟额度 %d 已用满，请 %d 秒后重试" % (name, minute_cap, wait),
                    "limit": minute_cap,
                    "used": len(window),
                    "retry_after": wait,
                }
            self._windows[name] = window

        if day_cap > 0:
            used = int(self._counts.get(name, 0))
            if used >= day_cap:
                return {
                    "ok": False,
                    "code": RATE_LIMITED,
                    "detail": "「%s」今日额度 %d 已用满（次日 0 点自动重置）" % (name, day_cap),
                    "limit": day_cap,
                    "used": used,
                    "retry_after": None,
                }

        if minute_cap > 0:
            self._windows.setdefault(name, []).append(now)
        if day_cap > 0:
            self._counts[name] = int(self._counts.get(name, 0)) + 1
        self._save()
        return None
