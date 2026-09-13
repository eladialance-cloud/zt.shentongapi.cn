# -*- coding: utf-8 -*-
"""wx-gateway 微信域桥服务（Flask）。

后端为开源 wxauto（MIT），见 wx_driver.py；未装后端或微信未运行时 /api/health 仍通过，
各能力返回结构化错误码（BACKEND_MISSING / WECHAT_NOT_RUNNING / CAPABILITY_UNAVAILABLE），
保证服务可被拉起、可诊断，不会因缺依赖假死。
"""
import argparse
import os

from flask import Flask, jsonify, request

import wx_driver
from config import load_config
from core import call_capability, list_capabilities
from logger import setup_logging

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def health():
    """服务健康 + 后端自述（后端是否可导入不影响本端点可用）。"""
    info = wx_driver.backend_info()
    return jsonify({
        "ok": True,
        "service": "wx-gateway",
        "backend": info["name"],
        "backend_license": info["license"],
        "backend_available": info["available"],
        "backend_reason": info["reason"],
    })


@app.route("/api/wx/capabilities", methods=["GET"])
def capabilities():
    return jsonify({"ok": True, "capabilities": list_capabilities()})


@app.route("/api/wx/status", methods=["GET"])
def status():
    result = call_capability("status", {})
    if not result.get("ok"):
        # 后端缺失 / 微信未运行：服务健康但未连接；detail 带错误码便于前端提示
        return jsonify({"ok": True, "connected": False, "detail": result.get("code", "")})
    return jsonify({"ok": True, "connected": True, "detail": "ok", **result})


@app.route("/api/wx/<cap>", methods=["GET", "POST"])
def dispatch(cap):
    payload = request.get_json(silent=True) or {}
    return jsonify(call_capability(cap, payload))


def main():
    parser = argparse.ArgumentParser(description="wx-gateway 微信域桥（开源 wxauto 后端）")
    parser.add_argument("--port", type=int, default=int(os.environ.get("WX_PORT", "9020")))
    args = parser.parse_args()
    setup_logging()
    cfg = load_config()
    app.config.update(cfg)
    app.run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()

