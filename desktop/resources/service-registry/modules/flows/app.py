# -*- coding: utf-8 -*-
"""业务流引擎 HTTP 服务（Flask）。

端点：
    GET  /api/health        服务健康 + 依赖自述（缺依赖不影响本端点可用）
    GET  /api/flows         业务流清单（含元数据）
    POST /api/flows/<id>    执行指定业务流（body 即 params）

业务错误一律以 HTTP 200 + ``{ok: false, code}`` 返回，便于 n8n / 主进程只按 body 分支，
不依赖 HTTP 状态码。
"""

import argparse
import os

from flask import Flask, jsonify, request

from config import load_config
from core import call_flow, list_flows
from logger import setup_logging

app = Flask(__name__)
CONFIG = load_config()


@app.route("/api/health", methods=["GET"])
def health():
    """健康检查：始终 200，并自述当前数据层与高风险闸门状态。"""
    return jsonify(
        {
            "ok": True,
            "service": "flows",
            "flow_count": len(list_flows()),
            "storage_backend": CONFIG.get("storage_backend", "local"),
            "high_risk_enabled": bool(CONFIG.get("enable_high_risk")),
        }
    )


@app.route("/api/flows", methods=["GET"])
def list_endpoint():
    return jsonify({"ok": True, "flows": list_flows()})


@app.route("/api/flows/<flow_id>", methods=["GET", "POST"])
def run_endpoint(flow_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}
    return jsonify(call_flow(flow_id, payload, config=CONFIG))


def main():
    parser = argparse.ArgumentParser(description="深瞳业务流引擎（12 个高频业务流）")
    parser.add_argument("--port", type=int, default=int(os.environ.get("FLOWS_PORT", "9040")))
    args = parser.parse_args()
    setup_logging()
    CONFIG.update(load_config())
    app.run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()

