# -*- coding: utf-8 -*-
"""微信自动化后端适配层 —— 本模块是本服务唯一与第三方库耦合的文件。

为什么单列一层
--------------
上游接缝（core.py 的 8 个 *_impl）只依赖本模块暴露的稳定接口：换后端只改本模块，
能力路由、HTTP 端点、上层编排（Hermes / n8n / 前端工具集）全部不动。

后端选型（合规结论）
--------------------
采用开源 wxauto（MIT）。本项目不引入、不依赖、不复制任何商业闭源增强内核
（付费授权版微信自动化库），不读取商业授权密钥，源码内不出现任何商业品牌 token。

- 开源后端覆盖能力：status / send / friends / group / listen
- 开源后端不提供：add_friend / moments / moments_publish
  （属商业内核增强项，且风控等级最高：加好友 / 朋友圈），由 core.py 返回 CAPABILITY_UNAVAILABLE

降级策略
--------
未安装 wxauto、或微信未运行/未登录时，本模块只返回结构化错误码、不抛异常栈，
保证 /api/health 与能力清单始终可用（服务可拉起、可诊断）。

★ 真机核对点
--------------
本模块对 wxauto 的调用点全部集中在下面两张表（WXAUTO_METHODS / FRIENDS_METHODS）。
不同 wxauto 版本的方法名与签名可能不同；真机核对后只改这两张表，不要改 core.py。
"""

CODE_BACKEND_MISSING = "BACKEND_MISSING"
CODE_WECHAT_NOT_RUNNING = "WECHAT_NOT_RUNNING"
CODE_BACKEND_ERROR = "BACKEND_ERROR"

BACKEND_NAME = "wxauto"
BACKEND_LICENSE = "MIT"
BACKEND_HOMEPAGE = "https://github.com/cluic/wxauto"

SUPPORTED_CAPABILITIES = ("status", "send", "friends", "group", "listen")
UNSUPPORTED_CAPABILITIES = ("add_friend", "moments", "moments_publish")

# ★ 真机核对点 1：入口类与调用方法名（按 wxauto 公开 API 约定书写）
WXAUTO_METHODS = {
    "client": "WeChat",                       # 入口类；需 Windows + PC 微信已登录
    "send_msg": "SendMsg",                    # SendMsg(msg=..., who=...)
    "get_my_info": "GetMyInfo",               # 自身信息（昵称等）→ status
    "chat_with": "ChatWith",                  # ChatWith(who=...) 打开会话
    "add_listen_chat": "AddListenChat",       # AddListenChat(who=...) 加入监听
    "get_listen_message": "GetListenMessage", # 取监听中的新消息
}

# ★ 真机核对点 2：好友列表取法（各版本命名不一，按顺序取第一个存在的方法）
FRIENDS_METHODS = ("GetContactList", "GetAllFriends", "GetFriends")


def _fail(code, detail):
    """统一失败结构：ok=False + 错误码 + 人话说明。"""
    return {"ok": False, "code": code, "detail": detail}


def _ok(**extra):
    """统一成功结构。"""
    out = {"ok": True, "backend": BACKEND_NAME}
    out.update(extra)
    return out


def _as_list(raw):
    """把 wxauto 的返回值规整成 list（容忍 None / 单个对象 / 已是 list）。"""
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, tuple):
        return list(raw)
    return [raw]


def _normalize_friend(item):
    """好友/联系人条目规整为 {name, wxid, remark}（wxauto 可能返回 str 或 dict）。"""
    if isinstance(item, dict):
        return {
            "name": str(item.get("name") or item.get("remark") or item.get("昵称") or ""),
            "wxid": str(item.get("wxid") or item.get("id") or ""),
            "remark": str(item.get("remark") or item.get("备注") or ""),
        }
    return {"name": str(item), "wxid": "", "remark": ""}


def probe_backend():
    """探测开源后端是否可导入，返回 (available, reason)。不依赖微信是否在运行。"""
    try:
        import wxauto  # noqa: F401
    except ImportError:
        return False, "未安装开源后端 wxauto（pip install wxauto）"
    except Exception as exc:  # 平台不匹配 / 依赖缺失等
        return False, "wxauto 导入失败: " + str(exc)
    return True, ""


def backend_info():
    """后端元信息（供 /api/health 与能力清单展示；微信没在跑也能返回）。"""
    available, reason = probe_backend()
    return {
        "name": BACKEND_NAME,
        "license": BACKEND_LICENSE,
        "homepage": BACKEND_HOMEPAGE,
        "available": available,
        "reason": reason,
        "supported": list(SUPPORTED_CAPABILITIES),
        "unsupported": list(UNSUPPORTED_CAPABILITIES),
    }


class WxAutoBackend(object):
    """开源 wxauto 后端：实现 5 个受支持能力。惰性连接微信，实例可复用。"""

    def __init__(self):
        self._client = None

    # ———— 连接管理 ————

    def _ensure_client(self):
        """返回 (client, err)；首次调用时导入并实例化 wxauto 入口类。"""
        if self._client is not None:
            return self._client, None
        try:
            import wxauto
        except ImportError:
            return None, _fail(CODE_BACKEND_MISSING, "未安装开源后端 wxauto（pip install wxauto）")
        except Exception as exc:
            return None, _fail(CODE_BACKEND_ERROR, "wxauto 导入失败: " + str(exc))
        factory = getattr(wxauto, WXAUTO_METHODS["client"], None)
        if factory is None:
            return None, _fail(
                CODE_BACKEND_ERROR,
                "wxauto 缺少入口类 " + WXAUTO_METHODS["client"] + "（版本不匹配，见 wx_driver 真机核对点 1）",
            )
        try:
            self._client = factory()
        except Exception as exc:
            # 微信未运行 / 未登录 / 界面元素定位失败都落这里，统一按"未就绪"处理
            return None, _fail(CODE_WECHAT_NOT_RUNNING, "微信未运行或未登录: " + str(exc))
        return self._client, None

    def _invoke(self, client, method_key, *args, **kwargs):
        """按方法名表调用 wxauto，返回 (value, err)；异常统一收敛为结构化错误。"""
        name = WXAUTO_METHODS.get(method_key)
        fn = getattr(client, name, None) if name else None
        if fn is None:
            return None, _fail(
                CODE_BACKEND_ERROR,
                "wxauto 缺少方法 " + str(name) + "（见 wx_driver 真机核对点 1）",
            )
        try:
            return fn(*args, **kwargs), None
        except Exception as exc:
            return None, _fail(CODE_BACKEND_ERROR, "调用 " + str(name) + " 失败: " + str(exc))

    @staticmethod
    def _first_method(client, names):
        """按候选名顺序取第一个存在的方法，返回 (name, fn)。"""
        for candidate in names:
            fn = getattr(client, candidate, None)
            if fn is not None:
                return candidate, fn
        return None, None

    # ———— 能力实现 ————

    def status(self):
        """连接状态（只读）：微信是否在跑 + 当前登录昵称。"""
        client, err = self._ensure_client()
        if err:
            return err
        info, err = self._invoke(client, "get_my_info")
        if err:
            return err
        nickname = ""
        if isinstance(info, dict):
            nickname = str(info.get("nickname") or info.get("name") or "")
        return _ok(connected=True, nickname=nickname)

    def send(self, to, text):
        """发消息给联系人/群：SendMsg(msg=text, who=to)。风控 high，默认关闭。"""
        if not to or not text:
            return _fail(CODE_BACKEND_ERROR, "缺少参数: to / text")
        client, err = self._ensure_client()
        if err:
            return err
        _, err = self._invoke(client, "send_msg", msg=text, who=to)
        if err:
            return err
        return _ok(to=to, sent=True)

    def friends(self, limit=None, keyword=None):
        """好友列表（只读）。取法见 FRIENDS_METHODS（各版本命名不一）。"""
        client, err = self._ensure_client()
        if err:
            return err
        name, fn = self._first_method(client, FRIENDS_METHODS)
        if fn is None:
            return _fail(
                CODE_BACKEND_ERROR,
                "wxauto 无好友列表方法（见 wx_driver.FRIENDS_METHODS 真机核对点 2）",
            )
        try:
            raw = fn()
        except Exception as exc:
            return _fail(CODE_BACKEND_ERROR, "调用 " + str(name) + " 失败: " + str(exc))
        items = [_normalize_friend(x) for x in _as_list(raw)]
        if keyword:
            items = [x for x in items if keyword in x["name"]]
        if limit:
            items = items[: int(limit)]
        return _ok(friends=items, count=len(items))

    def send_group(self, group, text):
        """群聊消息：先切到群会话再发送，避免发错对象。风控 high，默认关闭。"""
        if not group or not text:
            return _fail(CODE_BACKEND_ERROR, "缺少参数: group / text")
        client, err = self._ensure_client()
        if err:
            return err
        _, err = self._invoke(client, "chat_with", who=group)
        if err:
            return err
        _, err = self._invoke(client, "send_msg", msg=text, who=group)
        if err:
            return err
        return _ok(group=group, sent=True)

    def listen(self, chats=None, limit=None):
        """监听消息（只读）：chats 先加入监听，再取新消息；limit 截断条数。"""
        client, err = self._ensure_client()
        if err:
            return err
        for chat in _as_list(chats):
            _, err = self._invoke(client, "add_listen_chat", who=chat)
            if err:
                return err
        raw, err = self._invoke(client, "get_listen_message")
        if err:
            return err
        messages = []
        if isinstance(raw, dict):
            for who, msgs in raw.items():
                for msg in _as_list(msgs):
                    messages.append({"chat": str(who), "content": str(msg)})
        else:
            for msg in _as_list(raw):
                messages.append({"chat": "", "content": str(msg)})
        if limit:
            messages = messages[: int(limit)]
        return _ok(messages=messages, count=len(messages))


_BACKEND = None


def get_backend():
    """后端单例（保持微信连接可复用，避免每次调用重新实例化）。"""
    global _BACKEND
    if _BACKEND is None:
        _BACKEND = WxAutoBackend()
    return _BACKEND

