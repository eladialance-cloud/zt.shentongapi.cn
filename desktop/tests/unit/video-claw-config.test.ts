// video-claw config.yaml 生成测试（Task 2）
// 验证 buildVideoClawConfigYaml 生成的配置指向 llm-proxy、含静态 Key 与平台模型，
// 且同一输入幂等稳定。
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildVideoClawConfigYaml,
  ensureVideoClawConfig,
  syncVideoClawConfig,
  insertMissingVideoClawSections,
  patchYamlWhitelist,
  extractYamlWhitelist,
  DEFAULT_VIDEO_CLAW_MODELS,
  type VideoClawConfigOptions,
} from '../../electron/main/video-claw-config'

const OPTS: VideoClawConfigOptions = {
  llmProxyBaseUrl: 'https://zt.shentongapi.cn/api/llm-proxy/v1',
  apiKey: 'sk-shentong-test',
  ...DEFAULT_VIDEO_CLAW_MODELS,
}

describe('buildVideoClawConfigYaml', () => {
  it('生成含 llm-proxy base_url 与静态 Key 的 YAML', () => {
    const yaml = buildVideoClawConfigYaml(OPTS)
    expect(yaml).toContain('base_url: https://zt.shentongapi.cn/api/llm-proxy/v1')
    expect(yaml).toContain('api_key: sk-shentong-test')
    expect(yaml).toContain('llm: qwen3.8-max')
    expect(yaml).toContain('video_first_frame: wan2.7-i2v')
    expect(yaml).toContain('llmproxy')
  })

  it('同一输入生成结果稳定（幂等）', () => {
    expect(buildVideoClawConfigYaml(OPTS)).toBe(buildVideoClawConfigYaml(OPTS))
  })

  it('不泄露 Key 到日志输出之外（输出仅 YAML 文本）', () => {
    const yaml = buildVideoClawConfigYaml(OPTS)
    expect(yaml.startsWith('project_name:')).toBe(true)
  })
})

describe('ensureVideoClawConfig', () => {
  it('在 backendDir 下写出 config.yaml，重复调用不覆盖', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-config-'))
    try {
      const written = ensureVideoClawConfig(dir, OPTS)
      expect(written).toBe(join(dir, 'config.yaml'))
      expect(existsSync(written)).toBe(true)
      const first = readFileSync(written, 'utf-8')
      // 再次调用返回同一路径且内容不变（幂等）
      const second = readFileSync(ensureVideoClawConfig(dir, OPTS), 'utf-8')
      expect(second).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('syncVideoClawConfig', () => {
  const NEW_OPTS: VideoClawConfigOptions = {
    ...OPTS,
    platformModels: [
      { id: 'qwen3.8-max', type: 'chat' },
      { id: 'qwen-vl-new', type: 'vision' },
      { id: 'new-image-model', type: 'image' },
      { id: 'new-video-model', type: 'video' },
    ],
  }

  it('白名单变化时自动重写 config.yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-sync-'))
    try {
      // 先用旧白名单生成
      ensureVideoClawConfig(dir, OPTS)
      const first = readFileSync(join(dir, 'config.yaml'), 'utf-8')
      expect(first).not.toContain('new-image-model')

      // 平台新增模型后同步：白名单应更新
      const p = syncVideoClawConfig(dir, NEW_OPTS)
      expect(p).toBe(join(dir, 'config.yaml'))
      const second = readFileSync(p, 'utf-8')
      expect(second).toContain('new-image-model')
      expect(second).toContain('new-video-model')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('白名单未变化时不改写文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-sync2-'))
    try {
      ensureVideoClawConfig(dir, NEW_OPTS)
      const first = readFileSync(join(dir, 'config.yaml'), 'utf-8')
      syncVideoClawConfig(dir, NEW_OPTS)
      const second = readFileSync(join(dir, 'config.yaml'), 'utf-8')
      expect(second).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('白名单变化时仅修补白名单，保留用户其它配置（如改过的端口）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-sync3-'))
    try {
      ensureVideoClawConfig(dir, OPTS)
      const cfg = join(dir, 'config.yaml')
      // 模拟用户修改端口
      const userEdited = readFileSync(cfg, 'utf-8').replace('  port: 8000', '  port: 9000')
      writeFileSync(cfg, userEdited, 'utf-8')
      syncVideoClawConfig(dir, NEW_OPTS)
      const after = readFileSync(cfg, 'utf-8')
      expect(after).toContain('  port: 9000')
      expect(after).toContain('llm: qwen3.8-max')
      expect(extractYamlWhitelist(after)).toEqual([
        'qwen3.8-max',
        'qwen-vl-new',
        'new-image-model',
        'new-video-model',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('存量配置 llmproxy.api_key 为空/过期时同步补齐，且保留用户改过的端口', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-sync4-'))
    try {
      ensureVideoClawConfig(dir, OPTS)
      const cfg = join(dir, 'config.yaml')
      // 模拟旧配置：Key 为空、base_url 指向旧地址、用户改过端口
      const stale = readFileSync(cfg, 'utf-8')
        .replace('api_key: sk-shentong-test', "api_key: ''")
        .replace('base_url: https://zt.shentongapi.cn/api/llm-proxy/v1', 'base_url: https://old.example/api/llm-proxy/v1')
        .replace('  port: 8000', '  port: 9000')
      writeFileSync(cfg, stale, 'utf-8')
      syncVideoClawConfig(dir, OPTS)
      const after = readFileSync(cfg, 'utf-8')
      expect(after).toContain('api_key: sk-shentong-test')
      expect(after).toContain('base_url: https://zt.shentongapi.cn/api/llm-proxy/v1')
      expect(after).toContain('  port: 9000')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('顶层 models 默认值变化时同步（旧默认模型已失效）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-sync5-'))
    try {
      ensureVideoClawConfig(dir, OPTS)
      const cfg = join(dir, 'config.yaml')
      const stale = readFileSync(cfg, 'utf-8').replace('llm: qwen3.8-max', 'llm: qwen3.8-old')
      writeFileSync(cfg, stale, 'utf-8')
      syncVideoClawConfig(dir, OPTS)
      const after = readFileSync(cfg, 'utf-8')
      expect(after).toContain('llm: qwen3.8-max')
      expect(after).not.toContain('llm: qwen3.8-old')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Key/默认模型/白名单均一致时不重写文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-sync6-'))
    try {
      ensureVideoClawConfig(dir, NEW_OPTS)
      const cfg = join(dir, 'config.yaml')
      const first = readFileSync(cfg, 'utf-8')
      syncVideoClawConfig(dir, NEW_OPTS)
      const second = readFileSync(cfg, 'utf-8')
      expect(second).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('extractYamlWhitelist 能解析 llmproxy.models', () => {
    const yaml = buildVideoClawConfigYaml(NEW_OPTS)
    const ids = extractYamlWhitelist(yaml)
    expect(ids).toContain('qwen3.8-max')
    expect(ids).toContain('new-video-model')
    expect(ids.length).toBeGreaterThan(0)
  })
})
describe('patchYamlWhitelist', () => {
  it('仅替换 llmproxy.models 列表，保留其它配置', () => {
    const userEdited = buildVideoClawConfigYaml(OPTS).replace('  port: 8000', '  port: 9000')
    const patched = patchYamlWhitelist(userEdited, ['model-a', 'model-b'])
    expect(patched).toContain('  port: 9000')
    expect(patched).toContain('llm: qwen3.8-max')
    expect(extractYamlWhitelist(patched)).toEqual(['model-a', 'model-b'])
    expect(patched).not.toContain('      - qwen3.8-max')
    expect(patched).not.toContain('      - wan2.7-i2v')
  })

  it('llmproxy 段缺失时返回原文本（不整体重建）', () => {
    const noLlmp = 'project_name: x\nserver:\n  port: 8000\nmodels:\n  llm: y\n'
    expect(patchYamlWhitelist(noLlmp, ['a'])).toBe(noLlmp)
  })
})

describe('insertMissingVideoClawSections / syncVideoClawConfig 补齐缺失段', () => {
  // 存量配置（旧版桌面端或 ST-Claw 自身保存）没有 api_providers.llmproxy 段：
  // sync 必须插入整段（Key/base_url/models 白名单），否则 ST-Claw 模型下拉读不到后台模型
  it('存量配置缺 llmproxy 段时插入整段并保留用户改过的端口', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-legacy-'))
    try {
      const cfg = join(dir, 'config.yaml')
      const legacy = [
        'project_name: ST-Claw',
        'server:',
        '  host: 127.0.0.1',
        '  port: 9000',
        'api_providers:',
        '  common:',
        '    print_model_input: false',
        '  dashscope:',
        '    api_key: sk-dashscope-user',
        '    base_url: https://dashscope.aliyuncs.com/api/v1',
        'models:',
        '  llm: qwen3.5-plus',
        'generation:',
        '  style: realistic',
        '',
      ].join('\n')
      writeFileSync(cfg, legacy, 'utf-8')
      syncVideoClawConfig(dir, OPTS)
      const after = readFileSync(cfg, 'utf-8')
      expect(after).toContain('  port: 9000') // 用户配置保留
      expect(after).toContain('    api_key: sk-dashscope-user') // 第三方 Key 保留
      expect(after).toContain('  llmproxy:')
      expect(after).toContain('api_key: sk-shentong-test')
      expect(after).toContain('base_url: https://zt.shentongapi.cn/api/llm-proxy/v1')
      expect(extractYamlWhitelist(after)).toContain('qwen3.8-max')
      expect(extractYamlWhitelist(after)).toContain('wan2.7-i2v')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('存量配置缺顶层 models 段时插入默认模型', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vc-nomodels-'))
    try {
      const cfg = join(dir, 'config.yaml')
      const legacy = [
        'project_name: ST-Claw',
        'server:',
        '  port: 8000',
        'api_providers:',
        '  common:',
        '    print_model_input: false',
        '  llmproxy:',
        '    api_key: sk-old',
        '    base_url: https://zt.shentongapi.cn/api/llm-proxy/v1',
        '    models:',
        '      - qwen3.8-max',
        'generation:',
        '  style: realistic',
        '',
      ].join('\n')
      writeFileSync(cfg, legacy, 'utf-8')
      syncVideoClawConfig(dir, OPTS)
      const after = readFileSync(cfg, 'utf-8')
      expect(after).toContain('models:')
      expect(after).toContain('llm: qwen3.8-max')
      expect(after).toContain('video_first_frame: wan2.7-i2v')
      expect(after).toContain('  port: 8000')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('insertMissingVideoClawSections 无缺失时保持原文本（幂等）', () => {
    const yaml = buildVideoClawConfigYaml(OPTS)
    expect(insertMissingVideoClawSections(yaml, OPTS)).toBe(yaml)
  })
})
