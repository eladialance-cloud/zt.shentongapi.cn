# wx-gateway（微信域桥）

外部 Python 微信域桥服务，由 `service-manager` 依据 `patch.yaml` 拉起（`launch=wx-gateway`），对外暴露 HTTP JSON 端点。

## 当前状态

- **后端已落地**：采用开源 **wxauto（MIT）**，不使用任何商业闭源增强内核，不需要授权密钥。
  唯一的第三方耦合点是 `wx_driver.py`，换后端只改该文件，`core.py` 的能力路由与上层编排不动。
- **5 个能力已接通**：`status` / `send` / `friends` / `group` / `listen`（真机需装 wxauto + 微信已登录）。
- **3 个能力不提供**：`add_friend` / `moments` / `moments_publish` 属商业内核增强项，固定返回
  `CAPABILITY_UNAVAILABLE`；如同一能力需落地，须先过合规与灰度评审。
- **服务默认 `disabled`**，且**外发能力默认关闸**：`send` / `group` 需 `WX_ENABLE_HIGH_RISK=1`
  或 config `enable_high_risk=true` 才放行（F6 灰度），否则返回 `RISK_DISABLED`。
- 后端选型决策与真机核对清单见 **`SDK_INFO.md`**（模板 `SDK_INFO.template.md`）。

## 端点

- `GET /api/health`：服务健康 + 后端自述（`backend` / `backend_license` / `backend_available` / `backend_reason`）；
  后端缺失也不影响本端点（服务可拉起、可诊断）。
- `GET /api/wx/capabilities`：能力清单（中文名 / 风控 / 后端支持情况 / 参数 schema）。
- `GET /api/wx/status`：连接状态；后端不可用时 `connected=false`，`detail` 为错误码。
- `GET/POST /api/wx/<cap>`：按能力名分派。

## 错误码

| 错误码 | 含义 |
|---|---|
| `BACKEND_MISSING` | 未安装开源后端 `wxauto`（`pip install wxauto`） |
| `WECHAT_NOT_RUNNING` | PC 微信未运行 / 未登录 / 界面元素定位失败 |
| `BACKEND_ERROR` | 调用后端失败（方法名不匹配、参数缺失等，见 `wx_driver.py` 真机核对点） |
| `CAPABILITY_UNAVAILABLE` | 该能力不由开源后端提供（加好友 / 朋友圈） |
| `RISK_DISABLED` | 高风险能力（发消息 / 群聊）默认关闸，需显式开闸 |
| `RATE_LIMITED` | 外发额度用满（`risk_rate_per_minute` / `risk_daily_limit`，0 = 不限） |
| `RISK_PAUSED` | 风控熔断暂停（`risk_paused` / `WX_PAUSED=1`） |
| `UNKNOWN_CAP` | 未知能力名 |

## 配置

- `config.json`（可选，postInstall 自动生成）：`wx_port` / `backend` / `wx_auto_home` / `wx_appid`
  / `enable_high_risk` / `risk_rate_per_minute` / `risk_daily_limit` / `risk_paused`。
- 环境变量：`WX_PORT` / `WX_AUTO_HOME` / `WX_APPID` / `WX_PYTHON` / `WX_ENABLE_HIGH_RISK` /
  `WX_RISK_RATE_PER_MINUTE` / `WX_RISK_DAILY_LIMIT` / `WX_PAUSED` / `WX_RISK_STATE`。
- 不再读取 `WX_LICENSE_KEY`（后端为开源库，无需授权密钥）。

风控由模块内 `risk.py`（`RiskGate`）统一负责：额度**只对外发类能力计数**（只读查询不占额度），
计数落在 `<config 目录>/risk_state.json`，重启不清零；未配置额度时不写该文件。
建议真机验证后按需设置，例如 `risk_rate_per_minute: 20`、`risk_daily_limit: 50`。

## 运行（本地）

```sh
python app.py --port 9020
```

## 测试

```sh
python tests/run_tests.py    # 本机无 pytest 时的兜底运行器
pytest -q                    # 装了 pytest 亦可用（用例为 pytest 风格）
```

用例不要求安装 `wxauto`：后端缺失时的降级行为（结构化错误码、不抛栈）正是被测对象。
