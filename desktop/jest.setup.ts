// Jest 全局设置 (H-12)
//
// 在每个测试文件执行前自动加载：
// 1. 引入 @testing-library/jest-dom 扩展 expect 匹配器 (toBeInTheDocument 等)
// 2. Mock window.electronAPI，避免 renderer 测试中调用真实 IPC 抛错

import "@testing-library/jest-dom"

// ===== Web API Polyfills (H-12) =====
// jsdom 不提供 TextEncoder/TextDecoder，但 src/utils/hmac.ts 使用它们。
// 从 Node.js util 模块导入。
import { TextEncoder, TextDecoder } from 'util'

;(global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder
;(global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder

// crypto.subtle 在 jsdom 中未提供（jsdom 只暴露 getRandomValues）。
// src/utils/hmac.ts 使用 crypto.subtle.digest/importKey/sign，需要从 Node.js webcrypto 注入。
// 注意：必须整体替换 crypto 对象，仅复制 subtle 属性会导致
// "Value of this must be of type Crypto" 错误（webcrypto 内部 this 绑定校验）。
// jsdom 通过 getter 定义 window.crypto，普通赋值无效，需用 Object.defineProperty 强制覆盖。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { webcrypto } = require('crypto')
const wc = webcrypto as typeof globalThis.crypto

// 覆盖 globalThis.crypto
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  writable: true,
  value: wc,
})

// 覆盖 window.crypto（renderer 代码通过 window.crypto 访问）
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    writable: true,
    value: wc,
  })
}


// ===== Mock electronAPI =====
// renderer 测试中通过 window.electronAPI 访问主进程 IPC，测试环境需 mock。
// 仅注册测试中可能用到的命名空间，未覆盖的方法在调用时会抛 undefined 错误，
// 便于发现遗漏的 mock 点。

const mockElectronAPI = {
  credential: {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
  device: {
    getFingerprint: jest.fn(),
  },
  db: {
    initialize: jest.fn(),
    isDegraded: jest.fn(() => false),
    close: jest.fn(),
  },
  service: {
    getStatus: jest.fn(),
    status: jest.fn(),
    list: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    restart: jest.fn(),
    checkEnv: jest.fn(),
    install: jest.fn(),
    onStatusChanged: jest.fn(() => jest.fn()),
    onError: jest.fn(() => jest.fn()),
  },
  app: {
    getVersion: jest.fn(),
    checkUpdate: jest.fn(),
    quitAndInstall: jest.fn(),
  },
  updater: {
    check: jest.fn(),
    download: jest.fn(),
    install: jest.fn(),
    onStatus: jest.fn(() => jest.fn()),
  },
  window: {
    minimize: jest.fn(),
    maximize: jest.fn(),
    close: jest.fn(),
  },
  syncQueue: {
    enqueue: jest.fn(),
    getPending: jest.fn(),
    updateStatus: jest.fn(),
    exists: jest.fn(),
  },
  market: {
    install: jest.fn(),
    uninstall: jest.fn(),
    list: jest.fn(),
    export: jest.fn(),
    import: jest.fn(),
  },
}

;(global as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI
;(global.window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI
