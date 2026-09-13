// 环境组件设置页渲染测试
//
// 背景（2026-09-13 用户反馈「环境组件显示未安装，点击也没反应」）：
// 旧页面只在 item.installable 为 true 时渲染按钮，而 python 项恒为 installable=false、
// flowsDeps/playwright 的 installable 又依赖 pythonReady，于是整页一个按钮都没有 → 点击无反馈。
// 本用例锁定：未就绪项必须总能点到一个按钮（「安装」或「如何处理」）。
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { message } from 'antd'
import EnvComponents from '../../src/pages/Settings/EnvComponents'
import type { EnvComponentStatus } from '../../electron/shared/types'

// React 18 的 act 环境标记（缺省会在 unmount 时刷 act 警告）
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom 缺 matchMedia（antd 组件依赖）
if (typeof window !== 'undefined' && !window.matchMedia) {
  ;(window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
}

interface ServiceMock {
  checkEnvComponents: (() => Promise<EnvComponentStatus[]>) | jest.Mock
  installEnvComponent: jest.Mock
}

/** 取/建 window.electronAPI.service（jest.setup.ts 未在 setupFilesAfterEnv 中，需自建） */
function service(): ServiceMock {
  const w = window as unknown as { electronAPI?: { service?: ServiceMock } }
  if (!w.electronAPI) w.electronAPI = {}
  if (!w.electronAPI.service) w.electronAPI.service = {} as ServiceMock
  return w.electronAPI.service
}

function row(id: EnvComponentStatus['id'], over: Partial<EnvComponentStatus> = {}): EnvComponentStatus {
  return { id, title: id, ready: false, detail: 'x', installable: false, ...over }
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('button'))
}

function buttonLabels(): string[] {
  return buttons().map((b) => (b.textContent || '').replace(/\s+/g, '').trim())
}

describe('EnvComponents 页面', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    service().checkEnvComponents = jest.fn(async () => [
      row('python', { title: '内置 Python 运行时', detail: '未找到内置 Python' }),
      row('flowsDeps', { title: '业务流引擎依赖' }),
      row('playwright', { title: '浏览器自动化内核' }),
      row('vosk', { title: '中文语音识别模型' })
    ])
    service().installEnvComponent = jest.fn(async () => ({ ok: true }))
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  it('全部未就绪且不可自动安装时，每项都有可点击的「如何处理」按钮', async () => {
    await act(async () => {
      root.render(createElement(EnvComponents))
    })
    const labels = buttonLabels()
    expect(labels.filter((l) => l === '如何处理')).toHaveLength(4)
    expect(labels).not.toContain('安装')
  })

  it('「如何处理」点击后给出人工处理说明（不再毫无反应）', async () => {
    const info = jest.spyOn(message, 'info').mockReturnValue({} as never)
    await act(async () => {
      root.render(createElement(EnvComponents))
    })
    const target = buttons().find((b) => (b.textContent || '').replace(/\s+/g, '') === '如何处理')
    expect(target).toBeTruthy()
    await act(async () => {
      target!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(info).toHaveBeenCalledTimes(1)
    expect(String(info.mock.calls[0][0])).toContain('本地服务管理')
    info.mockRestore()
  })

  it('可一键安装的未就绪项仍然渲染「安装」按钮', async () => {
    service().checkEnvComponents = jest.fn(async () => [
      row('python', { title: '内置 Python 运行时', ready: true, detail: 'C:/x/python.exe' }),
      row('flowsDeps', { title: '业务流引擎依赖', installable: true })
    ])
    await act(async () => {
      root.render(createElement(EnvComponents))
    })
    expect(buttonLabels()).toContain('安装')
    expect(buttonLabels()).not.toContain('如何处理')
  })
})