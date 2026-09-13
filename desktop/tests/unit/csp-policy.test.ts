/**
 * CSP 静态契约测试（安全审计 S-16）。
 *
 * 背景：src/index.html 的 CSP 里 connect-src 用裸 \`https:\` 通配 —— 等于允许渲染层向
 * **任意公网主机**发起请求，把「渲染层被注入」的后果从「页面被改」放大到「数据可外发」。
 * img-src / media-src 的 \`https:\` 暂留（见下方说明），但 connect-src 必须显式列白名单。
 *
 * 本测试只做静态断言（渲染层行为无法在本环境冒烟），并锁住两条容易回退的要点：
 *   1) connect-src 不得再出现裸 \`https:\` 通配，也不得出现 \`*\` 源；
 *   2) 必需来源必须还在（本地服务端口 / 平台域名 / ws 变体 / 'self'），否则收紧会直接打断功能。
 *
 * 关于 img-src / media-src 保留 \`https:\`（有意为之，非遗漏）：
 * 渲染层大量使用 <img src={resolveMediaUrl(...)}>，而 src/utils/media.ts 对绝对 URL 原样透传，
 * 图片来源可能是任意第三方图床；且 VITE_API_BASE_URL 可被部署方改成自有域名，
 * 静态写死 *.shentongapi.cn 会让自建部署的图片全挂。收紧这两项需要先拿到
 * 生产环境的图片域名分布（人工确认项，已记入计划与审计报告）。
 */
import { describe, it, expect } from '@jest/globals'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')
const HTML = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf-8')

function directives(): Map<string, string[]> {
  const m = HTML.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
  if (!m) throw new Error('index.html 缺少 CSP meta')
  const map = new Map<string, string[]>()
  for (const part of m[1].split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    map.set(tokens[0], tokens.slice(1))
  }
  return map
}

const CSP = directives()
const get = (name: string): string[] => CSP.get(name) ?? []

describe('CSP 基本形态（S-16）', () => {
  it('声明 default-src/script-src/object-src/base-uri 且脚本只允许 self', () => {
    expect(get('default-src')).toEqual(["'self'"])
    expect(get('script-src')).toEqual(["'self'"])
    expect(get('object-src')).toEqual(["'none'"])
    expect(get('base-uri')).toEqual(["'self'"])
  })

  it('不出现 unsafe-eval / unsafe-inline 脚本放行 / 裸 * 源', () => {
    const all = [...CSP.values()].flat()
    expect(all).not.toContain("'unsafe-eval'")
    expect(all).not.toContain('*')
    expect(get('script-src')).not.toContain("'unsafe-inline'")
  })

  it('style-src 仍允许 unsafe-inline（antd/内联样式依赖，暂不能去）', () => {
    expect(get('style-src')).toContain("'unsafe-inline'")
  })
})

describe('connect-src 收敛（S-16 核心）', () => {
  it('不再出现裸 https: 通配', () => {
    expect(get('connect-src')).not.toContain('https:')
  })

  it('不再出现裸 http: / ws: / wss: 通配', () => {
    const c = get('connect-src')
    for (const bare of ['http:', 'ws:', 'wss:']) expect(c).not.toContain(bare)
  })

  it('保留本地服务与自身来源（本地端口逐一列出，避免用通配换功能）', () => {
    const c = get('connect-src')
    expect(c).toContain("'self'")
    expect(c).toContain('http://localhost:3000')
    expect(c).toContain('http://localhost:3001')
    expect(c).toContain('http://127.0.0.1:*')
    expect(c).toContain('ws://localhost:*')
    expect(c).toContain('ws://127.0.0.1:*')
  })

  it('平台域名与 wss 变体在列（生产 API / socket.io 升级）', () => {
    const c = get('connect-src')
    expect(c).toContain('https://zt.shentongapi.cn')
    expect(c).toContain('https://*.shentongapi.cn')
    expect(c).toContain('wss://zt.shentongapi.cn')
    expect(c).toContain('wss://*.shentongapi.cn')
  })

  it('自建部署可通过 %VITE_CSP_CONNECT_EXTRA% 追加来源，且需求写在纳入版本控制的 env 里', () => {
    // 变量未定义时 Vite 不替换，构建产物会残留字面量 —— 因此必须显式定义（可为空）。
    // 注意：.env / .env.production 未纳入版本控制，所以断言落在 tracked 的
    // .env.development（开发构建）与 .env.production.example（部署模板）上。
    expect(get('connect-src')).toContain('%VITE_CSP_CONNECT_EXTRA%')
    for (const f of ['.env.development', '.env.production.example']) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf-8')
      expect(new RegExp('^VITE_CSP_CONNECT_EXTRA=', 'm').test(text)).toBe(true)
    }
  })
})

describe('其余指令保持可用（收紧不得打断功能）', () => {
  it('img-src / media-src 保留 data: 与 blob:（主进程媒体代理 / canvas 预览依赖）', () => {
    for (const d of ['img-src', 'media-src']) {
      expect(get(d)).toContain('data:')
      expect(get(d)).toContain('blob:')
      expect(get(d)).toContain("'self'")
    }
  })

  it('frame-src 保留本地 n8n（127.0.0.1 / localhost 任意端口）', () => {
    const f = get('frame-src')
    expect(f).toContain("'self'")
    expect(f).toContain('http://127.0.0.1:*')
    expect(f).toContain('http://localhost:*')
  })

  it('worker-src 保留 blob:（PixiJS / worker 打包依赖）', () => {
    expect(get('worker-src')).toContain('blob:')
  })
})
