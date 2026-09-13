# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import core  # noqa: E402
from capabilities import llm as llm_mod  # noqa: E402
from capabilities import poster as poster_mod  # noqa: E402
from capabilities import storage  # noqa: E402
from capabilities import wechat as wechat_mod  # noqa: E402
from fakes import FakeDouyin, FakeLlm, FakePoster, FakeStore, FakeWechat, build_context, risk_env  # noqa: E402

# 每个 flow 的最小必填参数（可空参的 flow 不列）
MIN_PARAMS = {
    "ceo-strategy-doc": {"topic": "增长"},
    "ceo-keyword-planning": {"product": "咖啡"},
    "sales-service-add-friend": {"wxid": "wxid_demo"},
    "sales-service-followup": {"contact": "张三"},
    "sales-service-push-content": {"content": "你好", "target": "张三"},
    "private-domain-morning-push": {"content": "早上好", "target": "私域一群"},
    "traffic-collect-hot-videos": {"keyword": "咖啡"},
    "traffic-generate-copy": {"topic": "咖啡"},
    "new-media-wechat-article": {"source": "某素材"},
    "channel-multi-round-dm": {"contact": "张三", "round": 2},
}

# 已是 127.0.0.1 上未监听的端口（用于验证「依赖不可达」的结构化错误码）
DEAD_URL = "http://127.0.0.1:9"


def _run(flow_id, params, config=None, **services):
    cfg = dict(config or {})
    with risk_env("1"):
        return core.call_flow(flow_id, params, config=cfg, ctx=build_context(config=cfg, **services))


def test_every_flow_returns_structured_result_without_raising():
    for flow_id in core.list_flows():
        result = _run(flow_id, MIN_PARAMS.get(flow_id, {}))
        assert isinstance(result, dict), flow_id
        assert "ok" in result and "code" in result, flow_id
        assert result["flow"] == flow_id


# ———— 秘书 ————


def test_daily_poster_skips_when_no_content():
    result = _run("secretary-daily-poster", {}, store=FakeStore())
    assert result["ok"] is True
    assert result.get("skipped") is True
    assert result["poster_url"] is None


def test_daily_poster_happy_path():
    store = FakeStore()
    llm = FakeLlm(text="压缩文案")
    poster = FakePoster()
    result = _run(
        "secretary-daily-poster", {"date": "2026-09-09", "content": "今日内容"}, llm=llm, store=store, poster=poster
    )
    assert result["ok"] is True
    assert result["compressed_content"] == "压缩文案"
    assert result["poster_url"] == "http://127.0.0.1/p.png"
    assert result["record_id"]
    assert store.count("daily_poster_records") == 1
    assert "今日内容" in llm.prompts[0]


def test_daily_poster_without_llm_config_returns_llm_not_configured():
    result = _run("secretary-daily-poster", {"content": "x"}, llm=llm_mod.LlmClient())
    assert result["ok"] is False
    assert result["code"] == "LLM_NOT_CONFIGURED"


def test_daily_poster_succeeds_without_poster_service():
    """海报是可选步骤：未配置海报服务时仍产出压缩文案，并注明原因。"""
    result = _run("secretary-daily-poster", {"content": "x"}, poster=poster_mod.PosterGenerator())
    assert result["ok"] is True
    assert result["poster_url"] == ""
    assert result["note"]


def test_daily_poster_tolerates_unreachable_poster_service():
    result = _run(
        "secretary-daily-poster", {"content": "x"}, poster=poster_mod.PosterGenerator(endpoint=DEAD_URL)
    )
    assert result["ok"] is True
    assert result["poster_url"] == ""
    assert "不可达" in result["note"]


def test_daily_summary_skips_when_empty():
    result = _run("secretary-daily-summary", {}, store=FakeStore())
    assert result["ok"] is True
    assert result.get("skipped") is True


def test_daily_summary_includes_poster_when_requested():
    store = FakeStore(
        {
            "content_assets": [{"date": "2026-09-09", "content": "素材A"}],
            "daily_poster_records": [{"date": "2026-09-09", "compressed_content": "海报文案"}],
        }
    )
    llm = FakeLlm(text="日报")
    result = _run("secretary-daily-summary", {"date": "2026-09-09", "include_poster": True}, store=store, llm=llm)
    assert result["ok"] is True
    assert result["summary"] == "日报"
    assert "海报文案" in llm.prompts[0]


# ———— CEO ————


def test_strategy_doc_archives():
    store = FakeStore()
    result = _run("ceo-strategy-doc", {"topic": "出海"}, store=store)
    assert result["ok"] is True
    assert result["topic"] == "出海"
    assert store.count("ceo_strategy_docs") == 1


def test_keyword_planning_parses_pipe_lines():
    llm = FakeLlm(text="1. 咖啡机 | 交易 | 1-2元\n2. 咖啡豆推荐 | 信息 | 0.5-1元\n\n建议：先打信息词。")
    result = _run("ceo-keyword-planning", {"product": "咖啡"}, llm=llm)
    assert result["ok"] is True
    assert result["keywords"] == ["咖啡机", "咖啡豆推荐"]
    assert result["keyword_count"] == 2


# ———— 销售客服 ————


def test_followup_requires_contact():
    result = _run("sales-service-followup", {})
    assert result["code"] == "PARAM_MISSING"


def test_add_friend_passes_through_capability_unavailable():
    """开源后端不提供加好友：必须如实回传 CAPABILITY_UNAVAILABLE，不能伪装成功。"""
    wx = FakeWechat({"ok": False, "code": "CAPABILITY_UNAVAILABLE", "detail": "开源后端不提供"})
    result = _run("sales-service-add-friend", {"wxid": "demo"}, wechat=wx)
    assert result["ok"] is False
    assert result["code"] == "CAPABILITY_UNAVAILABLE"
    assert wx.calls[0][0] == "add_friend"


def test_push_content_reports_gateway_failure():
    wx = FakeWechat({"ok": False, "code": "WECHAT_NOT_RUNNING", "detail": "微信未运行"})
    result = _run("sales-service-push-content", {"content": "hi", "target": "张三"}, wechat=wx)
    assert result["code"] == "WECHAT_NOT_RUNNING"


def test_push_content_sends_on_success():
    wx = FakeWechat()
    result = _run("sales-service-push-content", {"content": "hi", "target": "张三"}, wechat=wx)
    assert result["ok"] is True
    assert wx.calls[0] == ("send", {"to": "张三", "text": "hi"})


def test_unreachable_wx_gateway_maps_to_dependency_missing():
    client = wechat_mod.WechatClient(base_url=DEAD_URL, timeout=1)
    result = _run("sales-service-push-content", {"content": "hi", "target": "张三"}, wechat=client)
    assert result["ok"] is False
    assert result["code"] == "DEPENDENCY_MISSING"


# ———— 私域运营 ————


def test_morning_push_requires_target():
    result = _run("private-domain-morning-push", {"content": "hi"})
    assert result["code"] == "PARAM_MISSING"
    assert "target" in result["error"]


def test_morning_push_uses_config_target():
    wx = FakeWechat()
    result = _run(
        "private-domain-morning-push", {"content": "hi"}, config={"private_domain_target": "群A"}, wechat=wx
    )
    assert result["ok"] is True
    assert wx.calls[0] == ("group", {"group": "群A", "text": "hi"})


# ———— 流量操盘 ————


def test_collect_hot_videos_reports_pipeline_not_ready():
    dy = FakeDouyin({"ok": False, "code": "PIPELINE_NOT_READY", "detail": "采集接缝未接入"})
    result = _run("traffic-collect-hot-videos", {"keyword": "咖啡"}, douyin=dy)
    assert result["ok"] is False
    assert result["code"] == "PIPELINE_NOT_READY"


def test_collect_hot_videos_ingests_on_success():
    store = FakeStore()
    dy = FakeDouyin({"ok": True, "videos": [{"id": "v1"}, {"id": "v2"}]})
    result = _run("traffic-collect-hot-videos", {"keyword": "咖啡", "limit": 2}, douyin=dy, store=store)
    assert result["ok"] is True
    assert result["count"] == 2
    assert store.count("traffic_hot_videos") == 1


def test_generate_copy_parses_numbered_lines():
    llm = FakeLlm(text="1. 第一条\n2. 第二条\n3. 第三条")
    result = _run("traffic-generate-copy", {"topic": "咖啡"}, llm=llm)
    assert result["copies"] == ["第一条", "第二条", "第三条"]


# ———— 新媒体 ————


def test_wechat_article_splits_title_and_body():
    llm = FakeLlm(text="标题行\n\n正文第一段\n正文第二段")
    result = _run("new-media-wechat-article", {"source": "素材"}, llm=llm)
    assert result["ok"] is True
    assert result["title"] == "标题行"
    assert result["body"] == "正文第一段\n正文第二段"


# ———— 渠道 ————


def test_multi_round_dm_rejects_bad_round():
    result = _run("channel-multi-round-dm", {"contact": "张三", "round": 0})
    assert result["code"] == "PARAM_MISSING"


def test_multi_round_dm_sends_llm_text():
    wx = FakeWechat()
    llm = FakeLlm(text="第二轮话术")
    result = _run("channel-multi-round-dm", {"contact": "张三", "round": 2}, wechat=wx, llm=llm)
    assert result["ok"] is True
    assert result["round"] == 2
    assert wx.calls[0] == ("send", {"to": "张三", "text": "第二轮话术"})


# ———— 数据层 / 适配层 ————


def test_feishu_storage_backend_blocks_data_flows():
    """飞书后端是预留位：选中它时数据类 flow 必须明确报不可用，而不是静默丢数据。"""
    result = _run("secretary-daily-poster", {"content": "x"}, store=storage.get_store({"storage_backend": "feishu"}))
    assert result["ok"] is False
    assert result["code"] == "STORAGE_BACKEND_UNAVAILABLE"


def test_llm_extract_text_variants():
    assert llm_mod.extract_text({"choices": [{"message": {"content": "hi"}}]}) == "hi"
    assert llm_mod.extract_text({"choices": [{"text": "legacy"}]}) == "legacy"
    assert llm_mod.extract_text({"content": "plain"}) == "plain"
    assert llm_mod.extract_text({"choices": []}) == ""
    assert llm_mod.extract_text(None) == ""
    assert llm_mod.extract_text({"choices": [{"message": {"content": "   "}}]}) == ""


def test_unconfigured_llm_reports_structured_code():
    client = llm_mod.LlmClient()
    assert client.configured() is False
    assert client.complete("hi")["code"] == "LLM_NOT_CONFIGURED"

