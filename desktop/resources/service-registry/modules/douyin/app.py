# -*- coding: utf-8 -*-
"""douyin 抖音采集/转写服务（Flask，M5）。

只读流水线（status/collect/download/extract/transcribe/ingest）已接入真实实现；
外部接缝（浏览器控制 / ffmpeg / 转写引擎）缺失时返回结构化错误码（DEPENDENCY_MISSING），
不会假成功。发布/评论/私信代码级硬关闭，返回 DISABLED。
"""
import argparse
import os

from flask import Flask, jsonify, request

from config import load_config
from core import call_capability, list_capabilities
from logger import setup_logging

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "douyin", "mode": "read-only"})


@app.route("/api/douyin/capabilities", methods=["GET"])
def capabilities():
    return jsonify({"ok": True, "capabilities": list_capabilities()})


@app.route("/api/douyin/status", methods=["GET"])
def status():
    return jsonify(call_capability("status", {}))


@app.route("/api/douyin/<cap>", methods=["GET", "POST"])
def dispatch(cap):
    payload = request.get_json(silent=True) or {}
    return jsonify(call_capability(cap, payload))


def main():
    parser = argparse.ArgumentParser(description="douyin 抖音采集/转写（只读流水线）")
    parser.add_argument("--port", type=int, default=int(os.environ.get("DOUYIN_PORT", "9030")))
    args = parser.parse_args()
    setup_logging()
    cfg = load_config()
    app.config.update(cfg)
    app.run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()
