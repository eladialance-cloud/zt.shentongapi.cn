// OpenClaw openclaw.json 一键修复（Node 版）
// 用法: node fix-openclaw-json.mjs [可选: 配置文件路径，默认读 %APPDATA% 下的 openclaw.json]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const cfgPath = process.argv[2] || path.join(os.homedir(), 'AppData', 'Roaming', 'shentong-ai-desktop', 'openclaw-home', '.openclaw', 'openclaw.json')
const goodDir = 'E:\\中台\\新建文件夹\\shentong-ai-desktop\\resources\\openclaw\\skills'

if (!fs.existsSync(cfgPath)) {
  console.error('FAIL: not found: ' + cfgPath)
  process.exit(1)
}

// 1) 备份
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '')
fs.copyFileSync(cfgPath, cfgPath + '.bak.' + stamp)
console.log('backup -> ' + path.basename(cfgPath) + '.bak.' + stamp)

// 2) 读取 + 修复损坏转义（Windows 路径里的单反斜杠 -> 合法 \ 转义）
const raw = fs.readFileSync(cfgPath, 'utf8')
const valid = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])
let repaired = ''
let i = 0
while (i < raw.length) {
  const c = raw[i]
  if (c === '\\' && i + 1 < raw.length) {
    const n = raw[i + 1]
    if (valid.has(n)) { repaired += c + n } else { repaired += '\\\\' + n }
    i += 2
  } else { repaired += c; i += 1 }
}

let cfg = null
try { cfg = JSON.parse(repaired) } catch (e) {
  console.warn('WARN: parse failed after escape repair (' + e.message + ') -> regenerate from template')
  cfg = null
}

if (cfg === null) {
  cfg = {
    gateway: {
      http: { endpoints: { chatCompletions: { enabled: true } } },
      auth: { token: '2bb301167bcfcfee7111b28a59d7a2fb64273b57d8810bf6' }
    },
    agents: { defaults: { memorySearch: { provider: 'none' } } },
    skills: { load: { extraDirs: [goodDir] } },
    models: { providers: { openai: { baseUrl: 'https://zt.shentongapi.cn/api/llm-proxy/v1', api: 'openai-completions', apiKey: 'sk-shentong-cb4cc9d7b0cc5bc75a71d1c969d4f156' } } },
    plugins: { entries: { 'openclaw-weixin': { enabled: true } } },
    mcp: { servers: {} }
  }
  console.log('regenerated config from template')
} else {
  // 3) extraDirs 指回真实技能目录
  if (!cfg.skills || typeof cfg.skills !== 'object') cfg.skills = {}
  if (!cfg.skills.load || typeof cfg.skills.load !== 'object') cfg.skills.load = {}
  cfg.skills.load.extraDirs = [goodDir]
  // 4) 迁移 mcpServers -> mcp.servers
  if (Object.prototype.hasOwnProperty.call(cfg, 'mcpServers')) {
    const legacy = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {}
    if (!cfg.mcp || typeof cfg.mcp !== 'object') cfg.mcp = {}
    const servers = cfg.mcp.servers && typeof cfg.mcp.servers === 'object' ? cfg.mcp.servers : {}
    cfg.mcp.servers = Object.assign({}, servers, legacy)
    delete cfg.mcpServers
    console.log('migrated mcpServers -> mcp.servers')
  }
}

// 5) 写回（UTF-8 无 BOM）
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8')
console.log('written: ' + cfgPath)

// 6) 自检
try {
  const chk = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  console.log('VERIFY_OK - valid JSON; extraDirs=' + JSON.stringify(chk.skills.load.extraDirs))
} catch (e) {
  console.error('FAIL: final config unreadable: ' + e.message)
  process.exit(1)
}

// 7) 用真实 OpenClaw schema 校验（尽力而为）
try {
  const mod = await import('file:///E:/中台/4工具/openclaw/node_modules/openclaw/dist/zod-schema-O9ml_nmo.js')
  const res = mod.t.safeParse(cfg)
  console.log(res.success ? 'SCHEMA_OK' : 'SCHEMA_FAIL: ' + JSON.stringify(res.error.issues))
} catch (e) {
  console.log('SCHEMA_SKIP (runtime schema import failed)')
}
