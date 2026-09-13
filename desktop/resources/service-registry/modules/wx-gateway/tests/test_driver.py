# -*- coding: utf-8 -*-
import os
import re
import sys

MODULE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, MODULE_DIR)

import wx_driver  # noqa: E402


def test_backend_info_declares_open_source_license():
    info = wx_driver.backend_info()
    assert info["name"] == "wxauto"
    assert info["license"] == "MIT"
    assert isinstance(info["available"], bool)


def test_supported_and_unsupported_are_disjoint_and_cover_eight():
    supported = set(wx_driver.SUPPORTED_CAPABILITIES)
    unsupported = set(wx_driver.UNSUPPORTED_CAPABILITIES)
    assert not (supported & unsupported)
    assert len(supported | unsupported) == 8


def test_status_returns_structured_error_without_backend():
    """未装 wxauto / 微信未运行时返回结构化错误码，且不抛异常。"""
    result = wx_driver.WxAutoBackend().status()
    assert result["ok"] is False
    assert result["code"] in {
        wx_driver.CODE_BACKEND_MISSING,
        wx_driver.CODE_WECHAT_NOT_RUNNING,
        wx_driver.CODE_BACKEND_ERROR,
    }
    assert result["detail"]


def test_send_requires_params_before_touching_backend():
    """缺参数直接拒绝，且不依赖后端是否安装（可确定性断言）。"""
    backend = wx_driver.WxAutoBackend()
    assert backend.send("", "hi")["code"] == wx_driver.CODE_BACKEND_ERROR
    assert backend.send("u", "")["code"] == wx_driver.CODE_BACKEND_ERROR
    assert backend.send_group("", "hi")["code"] == wx_driver.CODE_BACKEND_ERROR
    assert backend.send_group("g", "")["code"] == wx_driver.CODE_BACKEND_ERROR


def test_friends_and_listen_do_not_raise_without_backend():
    backend = wx_driver.WxAutoBackend()
    for result in (backend.friends(), backend.friends(limit=5, keyword="x"), backend.listen()):
        assert result["ok"] is False
        assert result["code"]


def test_as_list_normalisation():
    assert wx_driver._as_list(None) == []
    assert wx_driver._as_list([1, 2]) == [1, 2]
    assert wx_driver._as_list((1, 2)) == [1, 2]
    assert wx_driver._as_list("solo") == ["solo"]


def test_normalize_friend_handles_str_and_dict():
    assert wx_driver._normalize_friend("张三")["name"] == "张三"
    item = wx_driver._normalize_friend({"name": "李四", "wxid": "wxid_1", "remark": "备注"})
    assert item == {"name": "李四", "wxid": "wxid_1", "remark": "备注"}


def test_backend_uses_allowlisted_imports_only():
    """依赖白名单：模块实现文件不得引入白名单之外的第三方依赖。

    这条防的是"为图省事引入未授权/商业闭源内核"——任何新依赖都必须先在这里显式登记。
    """
    allowed = {
        "os", "sys", "json", "re", "time", "logging", "argparse",
        "flask", "wxauto",
        "config", "core", "logger", "risk", "wx_driver",
    }
    pattern = re.compile(r"^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)", re.M)
    for name in sorted(os.listdir(MODULE_DIR)):
        if not name.endswith(".py"):
            continue
        with open(os.path.join(MODULE_DIR, name), "r", encoding="utf-8") as fh:
            source = fh.read()
        for found in sorted(set(pattern.findall(source))):
            assert found in allowed, name + " 引入了白名单外的依赖: " + found
