# 业务流引擎（flows）

F3（路线 A）落地物：**12 个高频业务流由 Python 承载真实编排**，n8n 侧只做 webhook 触发与转发。

## 链路

```
n8n Webhook ──HTTP──▶ /api/flows/<flow-id> ──▶ 业务流实现
                                             ├─ LLM（OpenAI 兼容）
                                             ├─ 数据层（默认本地 JSON 记录仓）
                                             ├─ 微信域桥（127.0.0.1:9020）
                                             ├─ 抖音采集（127.0.0.1:9030）
                                             └─ 海报渲染接缝
```

## 两条调用入口

- **CLI**（排障 / 脚本编排）：
  `python tool_box.py --list`
  `python tool_box.py secretary-daily-poster --params "{\"date\": \"2026-09-09\"}"`
- **HTTP**：`GET /api/health`、`GET /api/flows`、`POST /api/flows/<flow-id>`（body 即参数）

## 12 个业务流

| flow id | 名称 | 角色 | 风控 | 触发（沿用源头排期） | 依赖 |
|---|---|---|---|---|---|
| secretary-daily-poster | 每日海报 AI 制作 | 秘书 | readonly | 每日 08:30 | LLM、数据层、海报（可选） |
| secretary-daily-summary | 每日汇总报告 | 秘书 | readonly | 每日 20:00 | LLM、数据层 |
| ceo-strategy-doc | 战略文档生成 | CEO | readonly | 手动 | LLM、数据层 |
| ceo-keyword-planning | 关键词规划 | CEO | readonly | 手动 | LLM、数据层 |
| sales-service-add-friend | 添加好友 | 销售客服 | **high** | 手动 | 微信域桥 |
| sales-service-followup | 客户跟进 | 销售客服 | readonly | 每日 09:30 | LLM、数据层 |
| sales-service-push-content | 内容推送 | 销售客服 | **high** | 手动 | 微信域桥 |
| private-domain-morning-push | 早间私域推送 | 私域运营 | **high** | 每日 08:00 | 微信域桥 |
| traffic-collect-hot-videos | 爆款视频采集 | 流量操盘 | readonly | 每日 09:00 | 抖音采集、数据层 |
| traffic-generate-copy | 文案生成 | 流量操盘 | readonly | 每日 10:00 | LLM、数据层 |
| new-media-wechat-article | 公众号文章二创 | 新媒体 | readonly | 每日 11:00 | LLM、数据层 |
| channel-multi-round-dm | 多轮私信 | 渠道 | **high** | 手动 | LLM、微信域桥 |

## 错误码（缺依赖不假成功）

| 场景 | code |
|---|---|
| 未知 flow id | `FLOW_NOT_FOUND` |
| 必填参数缺失 / 类型不符 | `PARAM_MISSING` |
| 高风险 flow 未开闸 | `RISK_DISABLED` |
| 外发额度用满（每分钟 / 每日） | `RATE_LIMITED` |
| 风控熔断暂停 | `RISK_PAUSED` |
| LLM 未配置 | `LLM_NOT_CONFIGURED` |
| 飞书数据层未配置 | `STORAGE_BACKEND_UNAVAILABLE` |
| 依赖服务（域桥 / 抖音 / 海报）不可达 | `DEPENDENCY_MISSING` |
| 海报服务未配置 | `POSTER_NOT_CONFIGURED`（非致命：仍产出文案并注明） |
| 业务实现异常 | `FLOW_FAILED` |

依赖服务自身的错误码会**原样透传**（例如域桥的 `BACKEND_MISSING` / `WECHAT_NOT_RUNNING` /
`CAPABILITY_UNAVAILABLE`、抖音的 `DEPENDENCY_MISSING` / `DOWNLOAD_FAILED`），便于前端精确提示。

## 数据层（可插拔）

- 默认 `local`：JSON 记录仓（一个 collection 一个文件），零外部依赖。
  落盘位置由 `FLOWS_STORAGE_ROOT` 决定 —— 打包运行时是 **`<userData>/service-registry/flows/data`**
  （模块目录随包分发在 `resources/` 内，macOS 与 Program Files 下**不可写**，所以不能写那里）；
  开发 / 单测下缺省回退到模块目录旁的 `data/`。
- `feishu`（飞书多维表格）：已接入（标准库直连，零第三方依赖）。写飞书需要：
  `storage_backend: feishu` + `storage_feishu.app_token` + `storage_feishu.tables`（collection → table_id）
  + `FEISHU_APP_ID` / `FEISHU_APP_SECRET`。**任一缺失或 collection 未映射时明确返回 `STORAGE_BACKEND_UNAVAILABLE`，绝不静默丢数据。**
  真机未配置飞书时保持 `local`（默认值）。切表方式：`FLOWS_FEISHU_APP_TOKEN` / `FLOWS_FEISHU_TABLES`（JSON）。

## 风控

`risk: high` 的 4 个 flow（加好友 / 内容推送 / 私域群发 / 多轮私信）默认关闭，
需 `enable_high_risk: true` 或 `FLOWS_ENABLE_HIGH_RISK=1` 才可执行。
服务行本身默认 `disabled: true`：与其它外部 Python 模块一致，真机验证后再拍板开启。

风控由模块内的 `risk.py`（`RiskGate`）统一负责，三段语义：

- **灰度**：高风险 flow 未开闸 → `RISK_DISABLED`；
- **降频**：`risk_rate_per_minute`（每分钟）/ `risk_daily_limit`（自然日）**只对高风险 flow 计数**
  （额度 = 外发配额，只读流程不占），超限 → `RATE_LIMITED`；**0 = 不限（出厂默认）**；
- **熔断**：`risk_paused: true` 或 `FLOWS_PAUSED=1` 时全部调用 → `RISK_PAUSED`。

额度计数落在 `<config 目录>/risk_state.json`（`FLOWS_RISK_STATE` 可覆盖），重启不清零，
便于诊断「今天还能发多少条」；未配置额度时不写该文件。建议真机验证后按需设置，例如
`risk_rate_per_minute: 20`、`risk_daily_limit: 50`。

## 配置

配置文件默认在 `<userData>/service-registry/flows/config.json`（可用 `FLOWS_CONFIG` 覆盖；
开发/单测下缺省在模块目录旁），`postInstall` 会写入最小默认值。环境变量覆盖：
`FLOWS_PORT` / `FLOWS_STORAGE_BACKEND` / `FLOWS_STORAGE_ROOT` / `FLOWS_LLM_BASE_URL` /
`FLOWS_LLM_API_KEY` / `FLOWS_LLM_MODEL` / `FLOWS_WX_BASE_URL` / `FLOWS_DOUYIN_BASE_URL` /
`FLOWS_POSTER_ENDPOINT` / `FLOWS_ENABLE_HIGH_RISK` / `FLOWS_PRIVATE_DOMAIN_TARGET` / `FLOWS_CONFIG`。
风控相关：`FLOWS_RISK_RATE_PER_MINUTE` / `FLOWS_RISK_DAILY_LIMIT` / `FLOWS_PAUSED` / `FLOWS_RISK_STATE`。

## 测试

```bash
python tests/run_tests.py      # 本机未装 pytest 时的兜底运行器（75 用例）
pytest -q                      # 装了 pytest 也可以直接跑
```
