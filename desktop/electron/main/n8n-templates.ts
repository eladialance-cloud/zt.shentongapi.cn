// 深瞳 n8n 工作流模板目录（M3）
//
// 首批 12 个高频模板：每个模板含业务元数据（id/name/role/category/description/risk/inputSchema）
// 与一个可导入本地 n8n 的 workflow JSON（Webhook 触发 → 调用业务流引擎 → Respond to Webhook）。
//
// 承载方式（F3 路线 A）：**n8n 只做触发与转发，业务编排全部由 Python 业务流引擎承载**
// （见 resources/service-registry/modules/flows）。因此模板里没有任何业务实现代码，
// 只有一条 HTTP 转发；业务逻辑改动只需改引擎，无需重新导入 n8n 工作流。
//
// 合规：仅抄参考流程的业务编排/时序/字段/文案改写 30%+；无任何商业品牌 token。

export type WfCategory = 'automation' | 'integration' | 'data_processing' | 'other'
export type WfRisk = 'readonly' | 'high'

export interface N8nTemplateMeta {
  /** 模板 id（小写短横线，深瞳命名） */
  id: string
  /** n8n webhook 路径（= slug） */
  slug: string
  /** 展示名 */
  name: string
  /** 所属角色 */
  role: string
  category: WfCategory
  description: string
  /** 风控级别：high = 群发/加好友/发布类，默认不启用 */
  risk: WfRisk
  /** 输入参数 schema：参数字段名 -> 类型/必填 */
  inputSchema: Record<string, string>
}

export interface N8nWorkflowJson {
  name: string
  nodes: Array<{
    parameters: Record<string, unknown>
    id: string
    name: string
    type: string
    typeVersion: number
    position: [number, number]
  }>
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>
  settings: { executionOrder: string }
}

const T: ReadonlyArray<N8nTemplateMeta> = [
  {
    id: 'secretary-daily-poster', slug: 'st-wf-secretary-daily-poster', name: '每日海报 AI 制作',
    role: '秘书', category: 'data_processing', risk: 'readonly',
    description: '飞书取今日内容 → LLM 压缩 → 海报生成 → 写回分发表',
    inputSchema: { date: 'str', domain: 'str', content: 'str?' },
  },
  {
    id: 'secretary-daily-summary', slug: 'st-wf-secretary-daily-summary', name: '每日汇总报告',
    role: '秘书', category: 'data_processing', risk: 'readonly',
    description: '汇总今日内容 → 生成日报 → 写回汇总表',
    inputSchema: { date: 'str', include_poster: 'bool?' },
  },
  {
    id: 'ceo-strategy-doc', slug: 'st-wf-ceo-strategy-doc', name: '战略文档生成',
    role: 'CEO', category: 'data_processing', risk: 'readonly',
    description: '围绕主题生成战略文档草案',
    inputSchema: { topic: 'str', strategy: 'str?' },
  },
  {
    id: 'ceo-keyword-planning', slug: 'st-wf-ceo-keyword-planning', name: '关键词规划',
    role: 'CEO', category: 'data_processing', risk: 'readonly',
    description: '生成关键词规划与投放建议',
    inputSchema: { product: 'str', budget: 'num?' },
  },
  {
    id: 'sales-service-add-friend', slug: 'st-wf-sales-service-add-friend', name: '添加好友',
    role: '销售客服', category: 'automation', risk: 'high',
    description: '按 wxid 添加好友并发送验证信息（风控默认关）',
    inputSchema: { wxid: 'str', message: 'str?' },
  },
  {
    id: 'sales-service-followup', slug: 'st-wf-sales-service-followup', name: '客户跟进',
    role: '销售客服', category: 'automation', risk: 'readonly',
    description: '按客户上下文生成跟进内容',
    inputSchema: { contact: 'str', context: 'str?' },
  },
  {
    id: 'sales-service-push-content', slug: 'st-wf-sales-service-push-content', name: '内容推送',
    role: '销售客服', category: 'automation', risk: 'high',
    description: '向目标受众推送内容（风控默认关）',
    inputSchema: { content: 'str', target: 'str' },
  },
  {
    id: 'private-domain-morning-push', slug: 'st-wf-private-domain-morning-push', name: '早间私域推送',
    role: '私域运营', category: 'automation', risk: 'high',
    description: '早间向私域推送内容（风控默认关）',
    inputSchema: { content: 'str?' },
  },
  {
    id: 'traffic-collect-hot-videos', slug: 'st-wf-traffic-collect-hot-videos', name: '爆款视频采集',
    role: '流量操盘', category: 'data_processing', risk: 'readonly',
    description: '采集爆款视频并结构化入库',
    inputSchema: { keyword: 'str', limit: 'num?' },
  },
  {
    id: 'traffic-generate-copy', slug: 'st-wf-traffic-generate-copy', name: '文案生成',
    role: '流量操盘', category: 'data_processing', risk: 'readonly',
    description: '按主题生成多种风格文案',
    inputSchema: { topic: 'str', style: 'str?' },
  },
  {
    id: 'new-media-wechat-article', slug: 'st-wf-new-media-wechat-article', name: '公众号文章二创',
    role: '新媒体', category: 'data_processing', risk: 'readonly',
    description: '从素材改写公众号文章/图文',
    inputSchema: { source: 'str', title: 'str?' },
  },
  {
    id: 'channel-multi-round-dm', slug: 'st-wf-channel-multi-round-dm', name: '多轮私信',
    role: '渠道', category: 'automation', risk: 'high',
    description: '按轮次与潜在客户多轮私信（风控默认关）',
    inputSchema: { contact: 'str', round: 'num' },
  },
]

export const N8N_TEMPLATES: ReadonlyArray<N8nTemplateMeta> = T

/** 主进程/前端可发现的模板清单（不含 n8n JSON 大对象） */
export function listN8nTemplates(): ReadonlyArray<N8nTemplateMeta> {
  return N8N_TEMPLATES
}

export function getN8nTemplate(id: string): N8nTemplateMeta | undefined {
  return N8N_TEMPLATES.find((t) => t.id === id)
}

export function getN8nWebhookPath(id: string): string | undefined {
  return getN8nTemplate(id)?.slug
}

/** 业务流引擎默认地址（与 flows 模块 patch.yaml 的 9040 端口一致） */
export const FLOWS_BASE_URL_DEFAULT = 'http://127.0.0.1:9040'

/** 业务流引擎调用节点名（触发器与响应节点之间唯一的一跳） */
export const FLOWS_ENGINE_NODE = '调用业务流引擎'

/**
 * 根据模板元数据生成可导入本地 n8n 的 workflow JSON。
 * 中间节点为 HTTP 请求（转发到业务流引擎），不在模板内保留任何业务实现。
 */
export function buildN8nWorkflowJson(
  template: N8nTemplateMeta,
  options: { flowsBaseUrl?: string } = {},
): N8nWorkflowJson {
  const baseUrl = (options.flowsBaseUrl || FLOWS_BASE_URL_DEFAULT).replace(/\/+$/, '')
  return {
    name: template.name,
    nodes: [
      {
        parameters: { path: template.slug, responseMode: 'lastNode', httpMethod: 'POST' },
        id: 'webhook',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [220, 300],
      },
      {
        parameters: {
          method: 'POST',
          url: `${baseUrl}/api/flows/${template.id}`,
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($json.body ?? {}) }}',
          options: { timeout: 300000 },
        },
        id: 'flow',
        name: FLOWS_ENGINE_NODE,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [480, 300],
      },
      {
        parameters: { respondWith: 'firstIncomingItem' },
        id: 'respond',
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [760, 300],
      },
    ],
    connections: {
      Webhook: { main: [[{ node: FLOWS_ENGINE_NODE, type: 'main', index: 0 }]] },
      [FLOWS_ENGINE_NODE]: { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  }
}

/** 批量生成全部模板 JSON（供导入脚本/测试用） */
export function buildAllN8nWorkflowJson(): Record<string, N8nWorkflowJson> {
  const out: Record<string, N8nWorkflowJson> = {}
  for (const t of N8N_TEMPLATES) out[t.id] = buildN8nWorkflowJson(t)
  return out
}
