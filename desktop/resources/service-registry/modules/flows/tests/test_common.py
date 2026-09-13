# -*- coding: utf-8 -*-
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from capabilities import common  # noqa: E402


def _expect_param_error(params, name, spec):
    try:
        common.get_param(params, name, spec)
    except common.ParamError as err:
        assert err.name == name, err
        return
    raise AssertionError("应抛 ParamError: %s=%r spec=%s" % (name, params.get(name), spec))


def test_required_param_missing_raises():
    _expect_param_error({}, "date", "str")
    _expect_param_error({"date": None}, "date", "str")


def test_optional_param_returns_default():
    assert common.get_param({}, "date", "str?", "2026-09-09") == "2026-09-09"


def test_type_mismatch_raises():
    _expect_param_error({"limit": "20"}, "limit", "int?")
    _expect_param_error({"topic": 3}, "topic", "str")


def test_bool_is_not_accepted_as_int():
    """bool 是 int 子类，必须显式拒绝，否则 round=True 会被当成第 1 轮。"""
    _expect_param_error({"round": True}, "round", "int")


def test_valid_types_pass_through():
    assert common.get_param({"limit": 5}, "limit", "int") == 5
    assert common.get_param({"budget": 1.5}, "budget", "num?") == 1.5
    assert common.get_param({"flag": False}, "flag", "bool?") is False


def test_ok_and_fail_shape():
    good = common.ok("demo", steps=["a"], value=1)
    assert good["ok"] is True
    assert good["code"] == "OK"
    assert good["flow"] == "demo"
    assert good["steps"] == ["a"]
    assert good["value"] == 1

    bad = common.fail("demo", common.PARAM_MISSING, "缺参")
    assert bad["ok"] is False
    assert bad["code"] == "PARAM_MISSING"
    assert bad["error"] == "缺参"


def test_shift_date():
    base = datetime.date(2026, 9, 9)
    assert common.shift_date(-1, base) == "2026-09-08"
    assert common.shift_date(1, base) == "2026-09-10"


def test_record_is_noop_when_store_unavailable():
    class Dead(object):
        available = False
        reason = "预留后端"

    ctx = common.FlowContext.__new__(common.FlowContext)
    ctx.store = Dead()
    assert common.record(ctx, "demo", {"a": 1}) is None


def test_dependency_failed_carries_upstream_code():
    ctx = common.FlowContext(config={})
    ctx.steps = ["step-1"]
    result = ctx.dependency_failed("demo", {"ok": False, "code": "CAPABILITY_UNAVAILABLE", "detail": "不支持"})
    assert result["ok"] is False
    assert result["code"] == "CAPABILITY_UNAVAILABLE"
    assert result["error"] == "不支持"
    assert result["steps"] == ["step-1"]


def test_dependency_failed_falls_back_to_dependency_missing():
    ctx = common.FlowContext(config={})
    result = ctx.dependency_failed("demo", {})
    assert result["code"] == common.DEPENDENCY_MISSING

