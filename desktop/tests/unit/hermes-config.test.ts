import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildHermesConfigYaml,
  ensureHermesConfig,
  syncHermesConfig,
  patchHermesConfig,
  syncHermesProfileConfigs,
  readAgentModels,
  writeAgentModel,
  removeAgentModel,
  applyAgentModels,
  HERMES_PROVIDER_NAME,
  HERMES_PROVIDER_KEY,
  type HermesConfigOptions,
} from '../../electron/main/hermes-config'

const OPTS: HermesConfigOptions = {
  llmProxyBaseUrl: 'https://zt.shentongapi.cn/api/llm-proxy/v1',
  apiKey: 'sk-shentong-test',
  llmModel: 'qwen3.8-max',
}

describe('buildHermesConfigYaml', () => {
  it('生成指向 llm-proxy 网关的 model + custom_providers', () => {
    const yaml = buildHermesConfigYaml(OPTS)
    expect(yaml).toContain('provider: custom:shentong')
    expect(yaml).toContain('default: qwen3.8-max')
    expect(yaml).toContain('name: shentong')
    expect(yaml).toContain('base_url: https://zt.shentongapi.cn/api/llm-proxy/v1')
    expect(yaml).toContain('api_key: sk-shentong-test')
    expect(yaml).toContain('platform_toolsets:')
    expect(yaml).toContain('cli: [no_mcp]')
  })

  it('provider 键必须是 custom:<name> 形态（裸 custom 运行时无兜底）', () => {
    expect(HERMES_PROVIDER_KEY).toBe('custom:' + HERMES_PROVIDER_NAME)
    const yaml = buildHermesConfigYaml(OPTS)
    expect(yaml).not.toMatch(/\n  provider: custom\s*\n/)
  })

  it('同一输入生成结果稳定（幂等）', () => {
    expect(buildHermesConfigYaml(OPTS)).toBe(buildHermesConfigYaml(OPTS))
  })
})

describe('ensureHermesConfig', () => {
  it('在 hermesHome 下写出 config.yaml，重复调用不覆盖', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-cfg-'))
    try {
      const written = ensureHermesConfig(dir, OPTS)
      expect(written).toBe(join(dir, 'config.yaml'))
      expect(existsSync(written)).toBe(true)
      const first = readFileSync(written, 'utf-8')
      writeFileSync(written, '# 用户已改', 'utf-8')
      ensureHermesConfig(dir, OPTS)
      expect(readFileSync(written, 'utf-8')).toBe('# 用户已改')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('patchHermesConfig / syncHermesConfig', () => {
  const NEW_OPTS: HermesConfigOptions = {
    ...OPTS,
    apiKey: 'sk-shentong-new',
    llmModel: 'qwen3.9-max',
  }

  it('空文件等价于全新生成', () => {
    const normalized = (v: string) => v.replace(/\n\s*\n/g, '\n').trim()
    expect(normalized(patchHermesConfig('', OPTS))).toBe(normalized(buildHermesConfigYaml(OPTS)))
  })

  it('已存在旧 Key 时整体替换 model 段与匹配条目，保留其它配置', () => {
    const existing = [
      'server:',
      '  port: 8642',
      'model:',
      '  provider: custom:shentong',
      '  default: qwen3.8-max',
      'custom_providers:',
      '  - name: shentong',
      '    base_url: https://zt.shentongapi.cn/api/llm-proxy/v1',
      '    api_key: sk-shentong-old',
      '    model: qwen3.8-max',
      'auxiliary:',
      '  enabled: true',
      '',
    ].join('\n')
    const patched = patchHermesConfig(existing, NEW_OPTS)
    expect(patched).toContain('api_key: sk-shentong-new')
    expect(patched).toContain('default: qwen3.9-max')
    expect(patched).toContain('  model: qwen3.9-max')
    // 其它配置保留
    expect(patched).toContain('server:')
    expect(patched).toContain('  port: 8642')
    expect(patched).toContain('auxiliary:')
    expect(patched).toContain('  enabled: true')
    // 平台条目只有一个
    expect((patched.match(/name: shentong/g) || []).length).toBe(1)
  })

  it('base_url 尾斜杠差异仍能匹配替换', () => {
    const existing = [
      'custom_providers:',
      '  - name: shentong',
      "    base_url: 'https://zt.shentongapi.cn/api/llm-proxy/v1/'",
      '    api_key: sk-shentong-old',
      '    model: qwen3.8-max',
      '',
    ].join('\n')
    const patched = patchHermesConfig(existing, NEW_OPTS)
    expect(patched).toContain('api_key: sk-shentong-new')
    expect((patched.match(/base_url:/g) || []).length).toBe(1)
  })

  it('无匹配条目时追加新条目并保留旧条目', () => {
    const existing = [
      'custom_providers:',
      '  - name: my-gateway',
      '    base_url: https://other.example.com/v1',
      '    api_key: sk-other',
      '    model: my-model',
      '',
    ].join('\n')
    const patched = patchHermesConfig(existing, OPTS)
    expect(patched).toContain('name: my-gateway')
    expect(patched).toContain('name: shentong')
    expect(patched).toContain('base_url: https://zt.shentongapi.cn/api/llm-proxy/v1')
  })

  it('无 custom_providers 段时追加到文件末尾', () => {
    const existing = 'server:\n  port: 8642\nmodel:\n  provider: custom\n  default: old\n'
    const patched = patchHermesConfig(existing, OPTS)
    expect(patched).toContain('server:')
    expect(patched).toContain('custom_providers:')
    expect(patched).toContain('name: shentong')
    // model 段也被替换为 custom:shentong
    expect(patched).toContain('provider: custom:shentong')
  })

  it('syncHermesConfig 幂等：连续同步不重写文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-sync-'))
    try {
      syncHermesConfig(dir, OPTS)
      const content = readFileSync(join(dir, 'config.yaml'), 'utf-8')
      const mtime = statSync(join(dir, 'config.yaml')).mtimeMs
      syncHermesConfig(dir, OPTS)
      expect(readFileSync(join(dir, 'config.yaml'), 'utf-8')).toBe(content)
      expect(statSync(join(dir, 'config.yaml')).mtimeMs).toBe(mtime)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})


describe('官署模型持久化（军机处模型配置，重启不被全局同步覆盖）', () => {
  let home = ''
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'hermes-amm-'))
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('writeAgentModel / readAgentModels / removeAgentModel 读写与删除', () => {
    expect(readAgentModels(home)).toEqual({})
    writeAgentModel(home, 'bingbu', 'model-x')
    expect(readAgentModels(home)).toEqual({ bingbu: 'model-x' })
    writeAgentModel(home, 'hubu', 'model-y')
    expect(readAgentModels(home)).toEqual({ bingbu: 'model-x', hubu: 'model-y' })
    removeAgentModel(home, 'bingbu')
    expect(readAgentModels(home)).toEqual({ hubu: 'model-y' })
  })

  it('启动流程后 applyAgentModels 把持久化模型回灌到官署 profile（模拟重启）', () => {
    // 模拟：全局 config 生成 → 同步到官署 profile（全局默认模型）
    syncHermesConfig(home, OPTS)
    syncHermesProfileConfigs(home, ['bingbu', 'hubu'])
    // 用户在军机处设置兵部模型（独立持久化）
    writeAgentModel(home, 'bingbu', 'deepseek-v4-flash')
    // 模拟重启：全局同步再次覆盖 profile（model 回到全局默认）→ 回灌恢复用户选择
    syncHermesProfileConfigs(home, ['bingbu', 'hubu'])
    const written = applyAgentModels(home, ['bingbu', 'hubu'])
    expect(written).toContain('bingbu')
    const cfg = readFileSync(join(home, 'profiles', 'bingbu', 'config.yaml'), 'utf-8')
    expect(cfg).toContain('default: deepseek-v4-flash')
    // 未设置的官署保持全局默认
    const hubu = readFileSync(join(home, 'profiles', 'hubu', 'config.yaml'), 'utf-8')
    expect(hubu).toContain('default: ' + OPTS.llmModel)
    // 幂等：再次回灌不重复写
    const written2 = applyAgentModels(home, ['bingbu', 'hubu'])
    expect(written2).not.toContain('bingbu')
  })
})
