/**
 * VideoClaw local runtime supervisor.
 *
 * Spawns two children and keeps running:
 *   - backend  : python api_server.py  -> FastAPI  http://127.0.0.1:8000  (service health port)
 *   - frontend : node next start       -> Next.js http://127.0.0.1:3000  (desktop iframe)
 *
 * The parent desktop app kills this process tree (taskkill /T /F on Windows),
 * which tears down both children. If any child exits unexpectedly, the whole
 * service exits so the desktop app can restart / surface the error.
 */
'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = __dirname
const isWin = process.platform === 'win32'
const PYTHON = path.join(ROOT, 'python', isWin ? 'python.exe' : 'python')
const NODE = path.join(ROOT, 'node', isWin ? 'node.exe' : 'node')
const APP = path.join(ROOT, 'video-claw', 'video-claw')
const BACKEND_DIR = path.join(APP, 'backend')
const FRONTEND_DIR = path.join(APP, 'frontend')
const NEXT_BIN = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next')

const children = new Set()
let stopping = false

function log(msg) {
  console.log('[video-claw] ' + msg)
}

function spawnChild(name, cmd, args, cwd) {
  log('starting ' + name + ': ' + path.basename(cmd) + ' ' + args.join(' '))
  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  children.add(child)
  child.stdout.on('data', (d) => process.stdout.write('[' + name + '] ' + d))
  child.stderr.on('data', (d) => process.stderr.write('[' + name + '] ' + d))
  child.on('error', (err) => {
    console.error('[video-claw] ' + name + ' spawn error: ' + err.message)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    children.delete(child)
    console.error('[video-claw] ' + name + ' exited code=' + code + ' signal=' + signal)
    shutdown(code == null ? 1 : code)
  })
  return child
}

function shutdown(code) {
  if (stopping) return
  stopping = true
  if (isWin) {
    // taskkill /T /F kills the whole process tree (python/next grandchildren included)
    for (const c of children) {
      if (c.pid) {
        try {
          spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        } catch (_) { /* ignore */ }
      }
    }
  }
  for (const c of children) {
    try { c.kill('SIGKILL') } catch (_) { /* ignore */ }
  }
  setTimeout(() => process.exit(code), 400)
}

const yamlQ = (v) => JSON.stringify(String(v))

function buildFallbackYaml() {
  const base = process.env.VIDEO_CLAW_LLM_PROXY_BASE || 'https://zt.shentongapi.cn/api/llm-proxy/v1'
  const key = process.env.VIDEO_CLAW_PROXY_KEY || ''
  const llm = process.env.VIDEO_CLAW_LLM_MODEL || 'qwen3.8-max'
  const image = 'qwen-image-3.0'
  const video = 'wan2.7-i2v'
  const ref = 'wan2.7-r2v'
  return [
    'project_name: Video-Claw',
    'server:',
    '  host: 127.0.0.1',
    '  port: 8000',
    '  log_level: INFO',
    '  access_log: false',
    'api_providers:',
    '  common:',
    '    print_model_input: false',
    "    proxy: ''",
    '  openai:',
    '    api_key: ' + yamlQ(key),
    '    base_url: ' + yamlQ(base),
    '    enable_proxy: false',
    '  deepseek:',
    '    api_key: ' + yamlQ(key),
    '    base_url: ' + yamlQ(base),
    '    enable_proxy: false',
    '  dashscope:',
    "    api_key: ''",
    '    base_url: https://dashscope.aliyuncs.com/api/v1',
    '    enable_proxy: false',
    '  llmproxy:',
    '    api_key: ' + yamlQ(key),
    '    base_url: ' + yamlQ(base),
    '    enable_proxy: false',
    '    models:',
    '      - ' + yamlQ(llm),
    '      - ' + yamlQ(llm),
    '      - ' + yamlQ(image),
    '      - ' + yamlQ(image),
    '      - ' + yamlQ(video),
    '      - ' + yamlQ(video),
    '      - ' + yamlQ(ref),
    'models:',
    '  llm: ' + yamlQ(llm),
    '  vlm: ' + yamlQ(llm),
    '  image_it2i: ' + yamlQ(image),
    '  image_t2i: ' + yamlQ(image),
    '  video: ' + yamlQ(video),
    '  video_first_frame: ' + yamlQ(video),
    '  video_start_end: ' + yamlQ(video),
    '  video_reference: ' + yamlQ(ref),
    'generation:',
    '  style: realistic',
    '  video_ratio: "16:9"',
    '  video_resolution: 720P',
    '  video_generation_mode: first_frame',
    '',
  ].join('\n')
}

/** 兜底 config.yaml：仅当缺失时按环境变量生成（桌面端登录后也会由主进程生成） */
function ensureFallbackConfig() {
  const cfgPath = path.join(BACKEND_DIR, 'config.yaml')
  if (fs.existsSync(cfgPath)) return
  try {
    fs.writeFileSync(cfgPath, buildFallbackYaml(), 'utf-8')
    log('fallback config.yaml written')
  } catch (err) {
    console.error('[video-claw] write fallback config failed: ' + err.message)
  }
}

function main() {
  if (!fs.existsSync(PYTHON)) {
    console.error('[video-claw] bundled python not found: ' + PYTHON)
    process.exit(1)
  }
  if (!fs.existsSync(path.join(BACKEND_DIR, 'api_server.py'))) {
    console.error('[video-claw] backend not found: ' + BACKEND_DIR)
    process.exit(1)
  }
  ensureFallbackConfig()
  spawnChild('backend', PYTHON, [path.join(BACKEND_DIR, 'api_server.py')], BACKEND_DIR)
  if (fs.existsSync(NEXT_BIN) && fs.existsSync(path.join(FRONTEND_DIR, '.next'))) {
    spawnChild('frontend', NODE, [NEXT_BIN, 'start', FRONTEND_DIR, '-H', '127.0.0.1', '-p', '3000'], FRONTEND_DIR)
  } else {
    console.error('[video-claw] frontend build missing (.next) - API-only mode, UI unavailable')
  }
}

process.on('SIGTERM', () => shutdown(0))
process.on('SIGINT', () => shutdown(0))

main()
