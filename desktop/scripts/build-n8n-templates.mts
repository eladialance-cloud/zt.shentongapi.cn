// 生成 n8n 工作流模板 JSON（供本地 n8n 导入）与目录清单 catalog.json
// 数据来源：electron/main/n8n-templates.ts（唯一权威）
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { N8N_TEMPLATES, buildN8nWorkflowJson } from '../electron/main/n8n-templates'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'resources', 'n8n', 'workflows')
mkdirSync(outDir, { recursive: true })

let count = 0
for (const t of N8N_TEMPLATES) {
  const wf = buildN8nWorkflowJson(t)
  const file = join(outDir, `${t.id}.json`)
  writeFileSync(file, JSON.stringify(wf, null, 2) + '\n', 'utf-8')
  count++
}

const catalog = {
  name: '深瞳 n8n 工作流模板目录',
  version: 1,
  templates: N8N_TEMPLATES.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    role: t.role,
    category: t.category,
    description: t.description,
    risk: t.risk,
    inputSchema: t.inputSchema,
  })),
}
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf-8')

console.log(`[build:n8n] wrote ${count} workflows + catalog.json -> ${outDir}`)