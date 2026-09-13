# -*- coding: utf-8 -*-
"""业务流引擎启动垫片（bootstrap launcher）。

为什么要这个文件：
深瞳随包携带的嵌入式 Python（runtime/hermes/python）带有 `python311._pth`，
解释器因此以 **isolated / safe_path** 模式运行——`sys.path` 既不含脚本所在目录，
也不吃 `PYTHONPATH` 环境变量。直接 `python tool_box.py` / `python app.py` 会在
`from config import load_config` 处抛 ModuleNotFoundError。

本垫片显式把模块目录插入 sys.path，再用 runpy 运行目标脚本，等价于正常安装下的
`python <script>`，从而同时兼容嵌入式 Python 与系统 Python。

用法（由 Node 侧 flow-executor.ts / whitelist.ts 调用）：
    python _bootstrap.py tool_box.py --list
    python _bootstrap.py app.py --port 9040
"""

import os
import runpy
import sys


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("用法: python _bootstrap.py <script.py> [args...]\n")
        return 2
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    target = sys.argv[1]
    script = target if os.path.isabs(target) else os.path.join(here, target)
    # 还原为目标脚本自身的 argv（脚本名 + 后续参数）
    sys.argv = [script] + sys.argv[2:]
    runpy.run_path(script, run_name="__main__")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
