# -*- coding: utf-8 -*-
"""测试兜底运行器（本机未安装 pytest 时使用）。

用法：
    python tests/run_tests.py        # 跑 tests/ 下全部 test_*.py
装了 pytest 的机器仍可直接 `pytest -q`（用例是标准 pytest 风格）。
"""

import importlib.util
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))


def load_module(path):
    name = "flowstest_" + os.path.splitext(os.path.basename(path))[0]
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    files = sorted(f for f in os.listdir(HERE) if f.startswith("test_") and f.endswith(".py"))
    passed = 0
    failed = 0
    skipped = 0
    for name in files:
        try:
            module = load_module(os.path.join(HERE, name))
        except ImportError as exc:
            # 可选依赖缺失（如未安装 flask 时的 test_app）→ 跳过而非中断整套用例
            print("SKIP  %s（缺少依赖: %s）" % (name, exc))
            skipped += 1
            continue
        for attr in sorted(dir(module)):
            if not attr.startswith("test_"):
                continue
            fn = getattr(module, attr)
            if not callable(fn):
                continue
            try:
                fn()
                passed += 1
                print("PASS  %s::%s" % (name, attr))
            except Exception:
                failed += 1
                print("FAIL  %s::%s" % (name, attr))
                traceback.print_exc()
    print("-" * 56)
    print("passed=%d failed=%d skipped=%d" % (passed, failed, skipped))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

