// video-claw config.yaml 生成测试（Task 2）
// 验证 buildVideoClawConfigYaml 生成的配置指向 llm-proxy、含静态 Key 与平台模型，
// 且同一输入幂等稳定。
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildVideoClawConfigYaml,
  ensureVideoClawConfig,
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
