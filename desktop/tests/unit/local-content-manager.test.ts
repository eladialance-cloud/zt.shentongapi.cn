import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const OS_TMP = require('node:os').tmpdir()
const TEST_ROOT = require('node:path').join(OS_TMP, 'st-market-test-' + Date.now())

jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? TEST_ROOT : OS_TMP),
  },
  dialog: {
    showSaveDialog: async () => ({ canceled: true }),
    showOpenDialog: async () => ({ canceled: true }),
  },
}))

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  installMarketItem,
  uninstallMarketItem,
  listInstalled,
  getOpenClawHome,
  getHermesHome,
  buildGithubArchiveUrls,
} from '../../electron/main/local-market/local-content-manager'

const skillPkg = {
  type: 'skill',
  id: 1,
  version: '1.0.0',
  payload: {
    skill: {
      id: 1,
      name: '数据分析',
      description: '做数据分析',
      version: '1.0.0',
      execConfig: { type: 'script', language: 'javascript', code: 'return 1' },
      pricePerMinute: 5,
      category: 'analysis',
      tags: ['x'],
      author: '官方',
    },
  },
}

describe('local-content-manager', () => {
  beforeEach(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
    fs.mkdirSync(TEST_ROOT, { recursive: true })
  })

  it('安装技能包写入 openclaw-home/skills 并更新清单', async () => {
    const r = await installMarketItem('skill', 1, '数据分析', '1.0.0', skillPkg as any)
    expect(r.ok).toBe(true)
    const skillDir = path.join(getOpenClawHome(), 'skills', '1')
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(skillDir, 'manifest.json'))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, 'manifest.json'), 'utf-8'))
    expect(manifest.name).toBe('数据分析')
    expect(manifest.execConfig.code).toBe('return 1')
    const records = listInstalled()
    expect(records.length).toBe(1)
    expect(records[0].type).toBe('skill')
    expect(records[0].id).toBe(1)
  })

  it('重复安装幂等：清单只有一条', async () => {
    await installMarketItem('skill', 1, '数据分析', '1.0.0', skillPkg as any)
    await installMarketItem('skill', 1, '数据分析', '1.0.0', skillPkg as any)
    expect(listInstalled().length).toBe(1)
  })

  it('安装 Agent 写入 hermes-home/agents', async () => {
    const agentPkg = {
      type: 'agent',
      id: 2,
      version: '1',
      payload: {
        agent: {
          id: 2,
          name: '客服助手',
          systemPrompt: '你是客服',
          modelId: 'gpt-4o-mini',
          allowedPluginIds: [1, 2],
          runtimeType: 'hermes',
        },
      },
    }
    const r = await installMarketItem('agent', 2, '客服助手', '1', agentPkg as any)
    expect(r.ok).toBe(true)
    const agentDir = path.join(getHermesHome(), 'agents', '2')
    const cfg = JSON.parse(fs.readFileSync(path.join(agentDir, 'agent.json'), 'utf-8'))
    expect(cfg.systemPrompt).toBe('你是客服')
    expect(cfg.allowedPluginIds).toEqual([1, 2])
  })

  it('卸载删除目录并移除清单', async () => {
    await installMarketItem('skill', 1, '数据分析', '1.0.0', skillPkg as any)
    const r = await uninstallMarketItem('skill', 1)
    expect(r.ok).toBe(true)
    expect(fs.existsSync(path.join(getOpenClawHome(), 'skills', '1'))).toBe(false)
    expect(listInstalled().length).toBe(0)
  })

  it('buildGithubArchiveUrls：无分支探测时按 main/master/HEAD 生成并去重', () => {
    const urls = buildGithubArchiveUrls([
      { owner: 'openai', repo: 'skills' },
      { owner: 'openai', repo: 'skills' },
    ]);
    expect(urls).toEqual([
      'https://codeload.github.com/openai/skills/tar.gz/main',
      'https://codeload.github.com/openai/skills/tar.gz/master',
      'https://github.com/openai/skills/archive/refs/heads/main.tar.gz',
      'https://github.com/openai/skills/archive/refs/heads/master.tar.gz',
      'https://github.com/openai/skills/archive/HEAD.tar.gz',
    ]);
  })

  it('buildGithubArchiveUrls：探测到默认分支时优先使用该分支', () => {
    const urls = buildGithubArchiveUrls(
      [{ owner: 'browseract-cli', repo: 'browseract' }],
      { 'browseract-cli/browseract': 'develop' },
    );
    expect(urls[0]).toBe('https://codeload.github.com/browseract-cli/browseract/tar.gz/develop');
    expect(urls[1]).toBe('https://codeload.github.com/browseract-cli/browseract/tar.gz/main');
  })

  it('buildGithubArchiveUrls：跳过非法候选', () => {
    expect(buildGithubArchiveUrls([null as any, { owner: '', repo: 'x' }])).toEqual([]);
  })

  it('损坏的 installed.json 回退空清单', async () => {
    fs.mkdirSync(path.join(TEST_ROOT, 'market'), { recursive: true })
    fs.writeFileSync(path.join(TEST_ROOT, 'market', 'installed.json'), '{bad json', 'utf-8')
    expect(listInstalled()).toEqual([])
  })
})
