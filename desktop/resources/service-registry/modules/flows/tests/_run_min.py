# -*- coding: utf-8 -*-
"""最小测试运行器：加载 tests/ 下的 test_*.py，跑所有 test_* 函数（不依赖 pytest/flask）。"""
import importlib.util
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

only = sys.argv[1:] if len(sys.argv) > 1 else None

files = sorted(f for f in os.listdir(HERE) if f.startswith("test_") and f.endswith(".py"))
if only:
    files = [f for f in files if any(o in f for o in only)]

total = passed = 0
failures = []
for fn in files:
    if fn in ("test_app.py",):  # 需要 flask，跳过
        continue
    name = fn[:-3]
    try:
        spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fn))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except Exception as exc:  # noqa: BLE001
        failures.append((fn, "<import>", traceback.format_exc()))
        total += 1
        continue
    for attr in sorted(dir(mod)):
        if not attr.startswith("test_"):
            continue
        fnc = getattr(mod, attr)
        if not callable(fnc):
            continue
        total += 1
        try:
            fnc()
            passed += 1
        except Exception:  # noqa: BLE001
            failures.append((fn, attr, traceback.format_exc()))

for f, a, tb in failures:
    print("FAIL %s :: %s\n%s" % (f, a, tb))
print("\n%d/%d passed" % (passed, total))
sys.exit(0 if passed == total else 1)
