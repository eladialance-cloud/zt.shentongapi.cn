// 高风险 IPC 通道标记回归测试（安全审计 S-26）
// 目的：把「哪些通道需要额外评审」变成可测的常量，避免审计结论只停留在文档里。
import { IPC_CHANNELS } from '../../electron/shared/ipc-channels'
import {
  HIGH_RISK_CHANNELS,
  IPC_RISK_CATEGORIES,
  allHighRiskChannels,
  isHighRiskChannel,
  riskCategoryOf,
} from '../../electron/shared/ipc-risk'

const declared = new Set<string>(IPC_CHANNELS as readonly string[])

describe('高风险通道名单自身一致性', () => {
  it('每个类别都非空', () => {
    for (const category of IPC_RISK_CATEGORIES) {
      expect(HIGH_RISK_CHANNELS[category].length).toBeGreaterThan(0)
    }
  })

  it('全局无重复', () => {
    const all = allHighRiskChannels()
    expect(new Set(all).size).toBe(all.length)
  })

  it('全部通道都已在 IPC_CHANNELS 登记（防拼写错误）', () => {
    const missing = allHighRiskChannels().filter((c) => !declared.has(c))
    expect(missing).toEqual([])
  })
})

describe('分类覆盖', () => {
  it('文件类覆盖 fs 读写与打开', () => {
    expect(riskCategoryOf('fs:read-file')).toBe('file')
    expect(riskCategoryOf('fs:open-file-in-editor')).toBe('file')
    expect(riskCategoryOf('fs:open-terminal')).toBe('file')
    expect(riskCategoryOf('video-parser:read-file')).toBe('file')
  })

  it('命令类覆盖业务流/工作流/服务安装', () => {
    expect(riskCategoryOf('flow:run')).toBe('command')
    expect(riskCategoryOf('n8n:run-workflow')).toBe('command')
    expect(riskCategoryOf('service:install')).toBe('command')
  })

  it('网络类覆盖出站抓取与自定义地址', () => {
    expect(riskCategoryOf('media:fetch-buffer')).toBe('network')
    expect(riskCategoryOf('llm-integrations:test')).toBe('network')
  })

  it('凭据类覆盖登录与令牌注入', () => {
    expect(riskCategoryOf('platform-account:setup-login')).toBe('credential')
    expect(riskCategoryOf('hermes-chat:sync-auth')).toBe('credential')
  })

  it('安装类覆盖远端技能 / 市场 / 模块', () => {
    expect(riskCategoryOf('edict:add-remote-skill')).toBe('install')
    expect(riskCategoryOf('market:install')).toBe('install')
    expect(riskCategoryOf('hermes-skills:install')).toBe('install')
    expect(riskCategoryOf('modules:installFromSource')).toBe('install')
  })
})

describe('查询接口', () => {
  it('普通通道不算高风险', () => {
    expect(isHighRiskChannel('db:initialize')).toBe(false)
    expect(riskCategoryOf('app:getVersion')).toBe(null)
  })
  it('高风险通道可判定', () => {
    expect(isHighRiskChannel('fs:read-file')).toBe(true)
    expect(isHighRiskChannel('nope:nope')).toBe(false)
  })
})
