# douyin（抖音采集 / 转写，M5）

只读采集流水线服务，由 `service-manager` 依据 `patch.yaml` 拉起（`launch=douyin`），默认 `disabled`。
**发布/评论/私信永久默认关闭**（代码级硬关闭，返回 `DISABLED`，与配置开关无关）。

## 流水线

```
status → collect → download → extract → transcribe → ingest
   ↑         ↑         ↑          ↑          ↑           ↑
 自检    浏览器接缝  直链落盘    ffmpeg    转写引擎    JSON 记录仓
```

每个阶段都已接入**真实实现**，外部依赖通过配置的接缝注入；缺依赖时返回结构化错误码，
不假成功、不假死（服务始终能被拉起并自诊断）。

## 能力

| 能力 | 风控 | 依赖接缝 | 说明 |
|---|---|---|---|
| status | readonly | — | 自检浏览器 / ffmpeg / 转写 / 存储是否就绪（`ready` / `missing`） |
| collect | readonly | `douyin_browser_endpoint` | 按 keyword 采集视频列表（转发给 computer-control-mcp） |
| download | readonly | — | 直链下载到 `<state>/media/videos/`，同 URL 命中本地缓存 |
| extract | readonly | ffmpeg | 抽 16 kHz 单声道 wav 到 `<state>/media/audio/` |
| transcribe | readonly | `douyin_transcribe_endpoint` | 调转写引擎（video-claw / vosk 皆可，统一 HTTP 接缝） |
| ingest | readonly | — | 结构化记录追加到 `<state>/ingest/<date>.json` |
| publish / comment / dm | **high（硬关闭）** | — | 固定返回 `DISABLED` |

## 端点

- `GET /api/health`：服务健康。
- `GET /api/douyin/capabilities`：能力清单（含风控级别、依赖接缝、参数 schema）。
- `GET /api/douyin/status`：流水线自检（`ready` / `login` / `engines` / `missing` / `risk`）。
- `GET/POST /api/douyin/<cap>`：能力分派（body 即参数）。

## 接缝怎么接

三条接缝都是「填地址即可」，不需要改本服务代码：

1. **浏览器控制**：主进程已有 `computer-control-mcp`，把它暴露成 HTTP 后填
   `douyin_browser_endpoint`（例：`http://127.0.0.1:9181/browser`）。请求体
   `{"action": "collect", "platform": "douyin", "keyword": "...", "limit": n}`，
   期望响应 `{"ok": true, "items": [...]}`。
   —— **不引入独立 playwright**，与本机已装的浏览器控制能力复用同一套。
2. **ffmpeg**：装到 PATH，或 `douyin_ffmpeg` 指向可执行文件。
3. **转写引擎**：把 video-claw / vosk 包一层 HTTP，填 `douyin_transcribe_endpoint`。
   请求体 `{"engine": "...", "audio_path": "...", "language": "zh"}`，期望 `{"text": "..."}`。

## 错误码

| 错误码 | 含义 |
|---|---|
| `PARAM_MISSING` | 必填参数缺失（keyword / url / video_path / audio_path / record） |
| `FILE_NOT_FOUND` | 本地视频 / 音频文件不存在 |
| `DEPENDENCY_MISSING` | 接缝未接入或调用失败（浏览器 / ffmpeg / 转写引擎） |
| `DOWNLOAD_FAILED` | 下载失败 / 超体积上限 / 落盘失败 |
| `EXTRACT_FAILED` | ffmpeg 执行失败 |
| `TRANSCRIBE_FAILED` | 转写引擎执行失败 |
| `INGEST_FAILED` | 入库写入失败 |
| `DISABLED` | 高风险能力（发布 / 评论 / 私信）代码级硬关闭 |
| `RATE_LIMITED` / `RISK_PAUSED` | 风控额度用满 / 熔断暂停（见下） |
| `UNKNOWN_CAP` | 未知能力名 |

## 风控（F6）

发布 / 评论 / 私信是**代码级硬关闭**（即使 `DOUYIN_ENABLE_HIGH_RISK=1` 也返回 `DISABLED`）。
只读流水线由 `risk.py`（`RiskGate`）保护：

- **降频**：`collect` 计入额度（`risk_rate_per_minute` 每分钟 / `risk_daily_limit` 每日，
  也可用别名 `douyin_daily_limit`），超限 → `RATE_LIMITED`；**0 = 不限（出厂默认）**；
- **熔断**：`risk_paused: true` 或 `DOUYIN_PAUSED=1` → 全部调用 `RISK_PAUSED`。

计数落在 `<config 目录>/risk_state.json`（`DOUYIN_RISK_STATE` 可覆盖），重启不清零；
未配置额度时不写该文件。建议真机验证后设 `douyin_daily_limit: 50`（或 `risk_daily_limit: 50`）。

## 配置

`config.json`（可选，postInstall 自动生成；打包后位于 `<userData>/service-registry/douyin/`）：

| 键 | 默认 | 说明 |
|---|---|---|
| `douyin_port` | 9030 | 服务端口 |
| `douyin_browser` | `computer-control` | 浏览器控制标识（说明性字段） |
| `douyin_browser_endpoint` | 空 | 浏览器控制 HTTP 接缝 |
| `douyin_transcribe_engine` | `video-claw` | 转写引擎标识 |
| `douyin_transcribe_endpoint` | 空 | 转写引擎 HTTP 接缝 |
| `douyin_ffmpeg` | 空 | ffmpeg 路径（空 = 走 PATH） |
| `douyin_state_dir` | 空 | 状态目录（空 = 与 config.json 同目录） |
| `douyin_max_download_mb` | 200 | 单个视频下载体积上限 |
| `douyin_daily_limit` | 0 | 采集每日上限（`risk_daily_limit` 的别名，0 = 不限） |
| `enable_high_risk` / `risk_rate_per_minute` / `risk_daily_limit` / `risk_paused` | false / 0 / 0 / false | 风控 |

环境变量：`DOUYIN_PORT` / `DOUYIN_BROWSER_ENDPOINT` / `DOUYIN_TRANSCRIBE_ENDPOINT` /
`DOUYIN_TRANSCRIBE_ENGINE` / `DOUYIN_FFMPEG` / `DOUYIN_STATE_DIR` / `DOUYIN_MAX_DOWNLOAD_MB` /
`DOUYIN_DAILY_LIMIT` / `DOUYIN_ENABLE_HIGH_RISK` / `DOUYIN_RISK_RATE_PER_MINUTE` /
`DOUYIN_RISK_DAILY_LIMIT` / `DOUYIN_PAUSED` / `DOUYIN_CONFIG` / `DOUYIN_STATE_DIR` / `DOUYIN_PYTHON`。

## 运行（本地）

```sh
python app.py --port 9030
```

**灰度开关（F1.7）**：`patch.yaml` 里的 `disabled: true` 出厂保持关闭，
真机验证（采集→转写→入库 smoke）通过后再由用户拍板开启。

## 测试

```sh
python tests/run_tests.py      # 兜底运行器（47 用例，无 pytest 也能跑）
pytest -q                      # 装了 pytest 直接跑
```

用例全程使用替身（`core._urlopen` / `core._runner`）与临时目录，不需要真实网络、ffmpeg、转写引擎。
