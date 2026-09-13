# 深瞳 n8n 工作流模板目录（M3）

首批 **12 个高频工作流模板**，每个为一个可导入本地 n8n 的 workflow JSON（`workflows/<id>.json`），
由 `electron/main/n8n-templates.ts`（元数据 + 生成器）唯一权威；`catalog.json` 提供主进程/前端可发现的模板清单。

## 承载方式（F3 路线 A）

n8n 只做**触发与转发**，链路固定为：`Webhook → 调用业务流引擎（HTTP）→ Respond to Webhook`。
业务编排全部由 Python **业务流引擎**承载（`resources/service-registry/modules/flows`，默认 `http://127.0.0.1:9040`）。
因此模板里**没有任何业务实现代码**——业务逻辑改动只需改引擎，无需重新导入 n8n 工作流。

## 模板清单

| id | 名称 | 角色 | 风控 | webhook 路径 |
|---|---|---|---|---|
| secretary-daily-poster | 每日海报 AI 制作 | 秘书 | readonly | st-wf-secretary-daily-poster |
| secretary-daily-summary | 每日汇总报告 | 秘书 | readonly | st-wf-secretary-daily-summary |
| ceo-strategy-doc | 战略文档生成 | CEO | readonly | st-wf-ceo-strategy-doc |
| ceo-keyword-planning | 关键词规划 | CEO | readonly | st-wf-ceo-keyword-planning |
| sales-service-add-friend | 添加好友 | 销售客服 | high | st-wf-sales-service-add-friend |
| sales-service-followup | 客户跟进 | 销售客服 | readonly | st-wf-sales-service-followup |
| sales-service-push-content | 内容推送 | 销售客服 | high | st-wf-sales-service-push-content |
| private-domain-morning-push | 早间私域推送 | 私域运营 | high | st-wf-private-domain-morning-push |
| traffic-collect-hot-videos | 爆款视频采集 | 流量操盘 | readonly | st-wf-traffic-collect-hot-videos |
| traffic-generate-copy | 文案生成 | 流量操盘 | readonly | st-wf-traffic-generate-copy |
| new-media-wechat-article | 公众号文章二创 | 新媒体 | readonly | st-wf-new-media-wechat-article |
| channel-multi-round-dm | 多轮私信 | 渠道 | high | st-wf-channel-multi-round-dm |

## 用途说明

- **前置**：桌面端「业务流引擎」服务需处于运行状态（服务管理里启动 `flows`，端口 9040）；
  高风险模板（`risk: high`）还要求引擎侧开闸（`enable_high_risk` 或 `FLOWS_ENABLE_HIGH_RISK=1`）。
- **导入 n8n**：优先用批量导入脚本（见下）；也可以手工 Import from File 选择 `workflows/<id>.json` 后激活 Webhook 节点。
- **改业务逻辑**：不在模板里改。去 `resources/service-registry/modules/flows/capabilities/<角色>.py` 改对应 flow，重启引擎服务即可生效。
- **编写新模板**：在 `electron/main/n8n-templates.ts` 的 `N8N_TEMPLATES` 增删，再运行 `npm run build:n8n` 重生成 JSON 与 `catalog.json`。
- **改引擎地址**：`buildN8nWorkflowJson(tpl, { flowsBaseUrl })` 可覆盖默认地址（默认 `http://127.0.0.1:9040`）。

## 执行

主进程 `n8n-executor.ts` 的 `runN8nTemplate(templateId, payload)` 按模板 id 解析 webhook 路径并触发本地 n8n。

## 批量导入 / 激活（F5）

`scripts/import-n8n-workflows.mts` 用 n8n 公开 REST API 把 12 个模板批量导入并激活，
替代人工逐个导入：

```sh
cd desktop
N8N_API_KEY=<n8n → Settings → n8n API 里生成的 Key> npm run import:n8n
# 只演练不写入：
npm run import:n8n -- --dry-run
# 只导入不激活：
npm run import:n8n -- --no-activate
```

- **幂等**：按 webhook 路径（其次按名字）匹配远端已有工作流，命中则更新而不是重复创建。
- **风控（F6）**：`risk: high` 的 4 个模板**默认只导入不激活**，需显式 `--activate-high-risk`
  才会激活（还要配合引擎侧 `FLOWS_ENABLE_HIGH_RISK=1` 才能真正跑通）。
- **激活兼容**：优先调 `POST /api/v1/workflows/<id>/activate`；老版本 n8n 没有该端点时
  自动回退 `PUT /api/v1/workflows/<id> {"active": true}`；两者都不支持时报告里给出明确提示
  （此时请到 n8n 界面手动激活），不会静默假成功。
- 其它参数：`--base-url`（默认 `http://127.0.0.1:5678`，也可用 `N8N_BASE_URL`）、
  `--dir`（默认 `resources/n8n/workflows`）、`--json`（输出 JSON 报告，便于 CI 消费）。
