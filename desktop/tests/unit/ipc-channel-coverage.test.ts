// IPC 通道清单漂移回归测试（安全审计 S-26）
// 规则（shared/ipc-channels.ts 头部注释的机器化版本）：
//   1. 主进程 ipcMain.handle/on 注册的通道必须在 IPC_CHANNELS；
//   2. 渲染端 ipcRenderer.invoke/send 的通道必须在 IPC_CHANNELS；
//   3. 渲染端 ipcRenderer.on 监听的通道必须同时在 IPC_CHANNELS 与 IPC_BROADCAST_CHANNELS；
//   4. 主进程 webContents.send 广播的通道必须在 IPC_BROADCAST_CHANNELS；
//   5. 两个数组内部无重复，且 IPC_BROADCAST_CHANNELS ⊆ IPC_CHANNELS。
// 本测试为静态扫描，不 import electron，可在 jest 直跑。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { IPC_BROADCAST_CHANNELS, IPC_CHANNELS } from '../../electron/shared/ipc-channels'

const ELECTRON_DIR = join(__dirname, '..', '..', 'electron')

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) listTsFiles(full, out)
    else if (name.endsWith('.ts')) out.push(full)
  }
  return out
}

interface Scan {
  mainRegistered: Map<string, string>
  rendererInvoke: Map<string, string>
  rendererListen: Map<string, string>
  broadcasts: Map<string, string>
}

function scan(): Scan {
  const s: Scan = {
    mainRegistered: new Map(),
    rendererInvoke: new Map(),
    rendererListen: new Map(),
    broadcasts: new Map(),
  }
  for (const file of listTsFiles(ELECTRON_DIR)) {
    const src = readFileSync(file, 'utf8')
    const rel = relative(ELECTRON_DIR, file).replace(/\\/g, '/')
    for (const m of src.matchAll(/ipcMain\.(handle|on)\(\s*'([^']+)'/g)) s.mainRegistered.set(m[2], rel)
    for (const m of src.matchAll(/ipcRenderer\.(invoke|send)\(\s*'([^']+)'/g)) s.rendererInvoke.set(m[2], rel)
    for (const m of src.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)) s.rendererListen.set(m[1], rel)
    for (const m of src.matchAll(/webContents\.send\(\s*'([^']+)'/g)) s.broadcasts.set(m[1], rel)
  }
  return s
}

const channels = new Set<string>(IPC_CHANNELS as readonly string[])
const broadcast = new Set<string>(IPC_BROADCAST_CHANNELS as readonly string[])

describe('IPC 通道清单自身一致性', () => {
  it('IPC_CHANNELS 无重复', () => {
    expect(new Set(channels).size).toBe(IPC_CHANNELS.length)
  })
  it('IPC_BROADCAST_CHANNELS 无重复', () => {
    expect(new Set(broadcast).size).toBe(IPC_BROADCAST_CHANNELS.length)
  })
  it('IPC_BROADCAST_CHANNELS 必须是 IPC_CHANNELS 的子集（广播事件也要在总表里）', () => {
    const missing = [...broadcast].filter((c) => !channels.has(c))
    expect(missing).toEqual([])
  })
})

describe('源码实际使用的通道必须已登记', () => {
  const s = scan()
  it('主进程 ipcMain.handle/on 的通道都在 IPC_CHANNELS', () => {
    const missing = [...s.mainRegistered].filter(([c]) => !channels.has(c)).map(([c, f]) => c + ' @' + f)
    expect(missing).toEqual([])
  })
  it('渲染端 ipcRenderer.invoke/send 的通道都在 IPC_CHANNELS', () => {
    const missing = [...s.rendererInvoke].filter(([c]) => !channels.has(c)).map(([c, f]) => c + ' @' + f)
    expect(missing).toEqual([])
  })
  it('渲染端 ipcRenderer.on 监听的通道都在广播表', () => {
    const missing = [...s.rendererListen].filter(([c]) => !broadcast.has(c)).map(([c, f]) => c + ' @' + f)
    expect(missing).toEqual([])
  })
  it('主进程 webContents.send 广播的通道都在广播表', () => {
    const missing = [...s.broadcasts].filter(([c]) => !broadcast.has(c)).map(([c, f]) => c + ' @' + f)
    expect(missing).toEqual([])
  })
})
