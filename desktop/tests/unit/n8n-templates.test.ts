import {
  N8N_TEMPLATES,
  listN8nTemplates,
  getN8nTemplate,
  getN8nWebhookPath,
  buildN8nWorkflowJson,
  buildAllN8nWorkflowJson,
  type N8nTemplateMeta,
} from '../../electron/main/n8n-templates'

describe('n8n-templates 目录', () => {
  it('首批 12 个高频模板', () => {
    expect(N8N_TEMPLATES).toHaveLength(12)
    expect(listN8nTemplates()).toHaveLength(12)
  })

  it('每个模板具备完整元数据', () => {
    for (const t of N8N_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.slug).toMatch(/^st-wf-[a-z0-9-]+$/)
      expect(t.name).toBeTruthy()
      expect(t.role).toBeTruthy()
      expect(['automation', 'integration', 'data_processing', 'other']).toContain(t.category)
      expect(['readonly', 'high']).toContain(t.risk)
      expect(t.description).toBeTruthy()
      expect(typeof t.inputSchema).toBe('object')
    }
  })

  it('模板 id 唯一且 slug 唯一', () => {
    const ids = new Set(N8N_TEMPLATES.map((t) => t.id))
    const slugs = new Set(N8N_TEMPLATES.map((t) => t.slug))
    expect(ids.size).toBe(12)
    expect(slugs.size).toBe(12)
  })

  it('getN8nTemplate / getN8nWebhookPath 按 id 命中', () => {
    expect(getN8nTemplate('secretary-daily-poster')?.role).toBe('秘书')
    expect(getN8nWebhookPath('secretary-daily-poster')).toBe('st-wf-secretary-daily-poster')
    expect(getN8nTemplate('nope')).toBeUndefined()
    expect(getN8nWebhookPath('nope')).toBeUndefined()
  })

  it('高风险模板标注 risk=high', () => {
    const high = N8N_TEMPLATES.filter((t) => t.risk === 'high').map((t) => t.id)
    expect(high).toEqual(expect.arrayContaining(['sales-service-add-friend', 'channel-multi-round-dm', 'private-domain-morning-push']))
  })

  it('buildN8nWorkflowJson 产出 Webhook + 业务流引擎调用 + Respond 并连线', () => {
    const t = getN8nTemplate('secretary-daily-poster') as N8nTemplateMeta
    const wf = buildN8nWorkflowJson(t)
    expect(wf.name).toBe(t.name)
    const nodeNames = wf.nodes.map((n) => n.name)
    expect(nodeNames).toContain('Webhook')
    expect(nodeNames).toContain('调用业务流引擎')
    expect(nodeNames).toContain('Respond to Webhook')
    const webhook = wf.nodes.find((n) => n.name === 'Webhook')
    expect(webhook?.parameters.path).toBe(t.slug)
    expect(webhook?.parameters.httpMethod).toBe('POST')
    const engine = wf.nodes.find((n) => n.name === '调用业务流引擎')
    expect(engine?.type).toBe('n8n-nodes-base.httpRequest')
    expect(engine?.parameters.method).toBe('POST')
    expect(engine?.parameters.url).toBe('http://127.0.0.1:9040/api/flows/secretary-daily-poster')
    expect(wf.connections['Webhook']?.main?.[0]?.[0]?.node).toBe('调用业务流引擎')
    expect(wf.connections['调用业务流引擎']?.main?.[0]?.[0]?.node).toBe('Respond to Webhook')
  })

  it('模板不内嵌业务实现（业务逻辑统一由业务流引擎承载）', () => {
    for (const t of N8N_TEMPLATES) {
      const wf = buildN8nWorkflowJson(t)
      expect(wf.nodes.some((n) => n.type === 'n8n-nodes-base.function')).toBe(false)
      const engine = wf.nodes.find((n) => n.name === '调用业务流引擎')
      expect(engine?.parameters.url).toBe(`http://127.0.0.1:9040/api/flows/${t.id}`)
    }
  })

  it('可覆盖业务流引擎地址（末尾斜杠需归一化）', () => {
    const t = getN8nTemplate('traffic-generate-copy') as N8nTemplateMeta
    const wf = buildN8nWorkflowJson(t, { flowsBaseUrl: 'http://127.0.0.1:9999/' })
    const engine = wf.nodes.find((n) => n.name === '调用业务流引擎')
    expect(engine?.parameters.url).toBe('http://127.0.0.1:9999/api/flows/traffic-generate-copy')
  })

  it('buildAllN8nWorkflowJson 返回全部模板', () => {
    const all = buildAllN8nWorkflowJson()
    expect(Object.keys(all)).toHaveLength(12)
    expect(all['channel-multi-round-dm'].nodes[0].parameters.path).toBe('st-wf-channel-multi-round-dm')
  })
})
