// 批量导入 / 激活 n8n 工作流模板（F5）
//
// 用法：
//   npx tsx scripts/import-n8n-workflows.mts --api-key <N8N_API_KEY>
//   N8N_API_KEY=xxx npm run import:n8n -- --dry-run
//
// 参数：
//   --api-key <key>        n8n API Key（也可用环境变量 N8N_API_KEY）
//   --base-url <url>       n8n 地址，默认 http://127.0.0.1:5678（也可用 N8N_BASE_URL）
//   --dir <path>           模板目录，默认 resources/n8n/workflows
//   --no-activate          只导入不激活
//   --activate-high-risk   连 risk=high 的模板一起激活（默认不激活，灰度关闭）
//   --dry-run              只演练不写入
//   --json                 以 JSON 输出报告（供 CI / 上层程序消费）
//
// 数据来源：目录里的 catalog.json（提供 risk 元数据）+ 每个 <id>.json。
// 幂等：同名/同 webhook 路径的远端工作流会被更新而不是重复创建。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatReport,
  importN8nWorkflows,
  type ImportTarget,
  type WorkflowPayload,
} from '../electron/main/n8n-import'

const here = dirname(fileURLToPath(import.meta.url))

interface Options {
  apiKey: string
  baseUrl: string
  dir: string
  activate: boolean
  activateHighRisk: boolean
  dryRun: boolean
  json: boolean
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    apiKey: process.env.N8N_API_KEY || '',
    baseUrl: process.env.N8N_BASE_URL || 'http://127.0.0.1:5678',
    dir: join(here, '..', 'resources', 'n8n', 'workflows'),
    activate: true,
    activateHighRisk: false,
    dryRun: false,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--api-key') opts.apiKey = argv[++i] ?? ''
    else if (arg === '--base-url') opts.baseUrl = argv[++i] ?? opts.baseUrl
    else if (arg === '--dir') opts.dir = argv[++i] ?? opts.dir
    else if (arg === '--no-activate') opts.activate = false
    else if (arg === '--activate-high-risk') opts.activateHighRisk = true
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 18).join('\n'))
      process.exit(0)
    }
  }
  return opts
}

interface CatalogTemplate {
  id: string
  name: string
  risk: string
}

/** 读取模板目录：优先用 catalog.json 的顺序与 risk，缺失时退回扫描 *.json */
function loadTargets(dir: string): ImportTarget[] {
  const catalogPath = join(dir, 'catalog.json')
  const targets: ImportTarget[] = []
  if (existsSync(catalogPath)) {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { templates?: CatalogTemplate[] }
    for (const t of catalog.templates ?? []) {
      const file = join(dir, `${t.id}.json`)
      if (!existsSync(file)) {
        console.warn(`[import:n8n] 跳过 ${t.id}：缺少 ${file}`)
        continue
      }
      targets.push({
        id: t.id,
        name: t.name,
        risk: t.risk === 'high' ? 'high' : 'readonly',
        workflow: JSON.parse(readFileSync(file, 'utf8')) as WorkflowPayload,
      })
    }
    return targets
  }
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'catalog.json') continue
    const workflow = JSON.parse(readFileSync(join(dir, file), 'utf8')) as WorkflowPayload
    targets.push({
      id: file.replace(/\.json$/, ''),
      name: String(workflow.name ?? file),
      risk: 'readonly',
      workflow,
    })
  }
  return targets
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(opts.dir)) {
    console.error(`[import:n8n] 模板目录不存在：${opts.dir}`)
    process.exit(2)
  }
  const targets = loadTargets(opts.dir)
  if (targets.length === 0) {
    console.error(`[import:n8n] 没有可导入的模板（${opts.dir}）`)
    process.exit(2)
  }

  const report = await importN8nWorkflows({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    targets,
    activate: opts.activate,
    activateHighRisk: opts.activateHighRisk,
    dryRun: opts.dryRun,
  })

  if (opts.json) console.log(JSON.stringify(report, null, 2))
  else console.log(formatReport(report))

  process.exit(report.ok && report.failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`[import:n8n] 未捕获异常：${(err as Error).message}`)
  process.exit(1)
})
