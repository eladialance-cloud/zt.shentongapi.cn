# -*- coding: utf-8 -*-
"""深瞳业务流引擎 CLI 入口（本机直调，便于排障与脚本编排）。

用法：
    python tool_box.py --list
    python tool_box.py secretary-daily-poster --params '{"date": "2026-09-09"}'

成功打印业务结果 JSON 并返回 0；失败打印错误 JSON 并返回 1。
"""

import argparse
import json
import sys

from config import load_config
from core import call_flow, list_flows


def _print(payload):
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


def main(argv=None):
    parser = argparse.ArgumentParser(description="深瞳业务流引擎")
    parser.add_argument("flow", nargs="?", help="业务流 id（用 --list 查看全部）")
    parser.add_argument("--params", default="{}", help="业务流参数（JSON 对象字符串）")
    parser.add_argument("--timeout", type=int, default=None, help="超时秒数（可选）")
    parser.add_argument("--list", action="store_true", help="列出全部业务流")
    args = parser.parse_args(argv)

    if args.list or not args.flow:
        _print(list_flows())
        return 0

    try:
        params = json.loads(args.params or "{}")
    except ValueError as err:
        _print({"ok": False, "code": "PARAM_MISSING", "error": "参数不是合法 JSON: %s" % err})
        return 1
    if not isinstance(params, dict):
        _print({"ok": False, "code": "PARAM_MISSING", "error": "--params 必须是 JSON 对象"})
        return 1

    result = call_flow(args.flow, params, timeout=args.timeout, config=load_config())
    _print(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())

