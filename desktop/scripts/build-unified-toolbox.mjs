// 构建 unified-toolbox MCP server 为单个自包含 CJS 文件（捆绑 js-yaml 等依赖），
// 输出到 resources/service-registry/modules/unified-toolbox/mcp-server.js。
// 这样 dev / 打包后 Electron-as-Node 都能直接运行，无需依赖外部 node_modules。
import { build } from 'esbuild'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const entry = path.join(root, 'scripts', 'unified-toolbox', 'mcp-server.ts')
const outdir = path.join(root, 'resources', 'service-registry', 'modules', 'unified-toolbox')

fs.mkdirSync(outdir, { recursive: true })

await build({
  entryPoints: [entry],
  outfile: path.join(outdir, 'mcp-server.js'),
  bundle: true,
  // mysql2 为可选原生依赖：不打包，运行时按需 require（未安装时 capability 返回明确错误）
  external: ['mysql2', 'mysql2/promise'],
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
})

console.log(`[build-unified-toolbox] bundled mcp-server.js -> ${path.join(outdir, 'mcp-server.js')}`)