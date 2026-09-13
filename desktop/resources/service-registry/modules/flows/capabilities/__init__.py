# -*- coding: utf-8 -*-
"""业务流能力注册表。

按角色拆分 7 个模块、共 12 个高频业务流；本文件汇总成唯一注册表 ``FLOW_REGISTRY``。
flow id 与桌面端 n8n 模板 id 一一对应（kebab-case），便于 webhook 直连。
"""

from . import channel, ceo, new_media, private_domain, sales_service, secretary, traffic

FLOW_REGISTRY = {}

for _module in (secretary, ceo, sales_service, private_domain, traffic, new_media, channel):
    for _flow_id, _meta in _module.FLOWS.items():
        if _flow_id in FLOW_REGISTRY:
            raise RuntimeError("业务流 id 重复注册: %s" % _flow_id)
        FLOW_REGISTRY[_flow_id] = _meta

del _module, _flow_id, _meta

