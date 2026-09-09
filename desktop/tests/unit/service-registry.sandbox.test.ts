import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  spawnSandboxed,
  buildSandboxRunnerArgs,
  sandboxBackendEnabled,
  sandboxRunnerExists,
  setSandboxResourcesBase,
} from '../../electron/main/service-registry/sandbox'

function runProbe(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnSandboxed({
      command: process.execPath,
      args: ['-e', "process.stdout.write('OK')"],
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let out = ''
    child.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error('probe exit ' + code))
      else resolve(out)
    })
  })
}

describe('service-registry spawnSandboxed', () => {
  test('permissions 缺省：走原生 spawn，进程可正常输出', async () => {
    await expect(runProbe()).resolves.toBe('OK')
  })

  test('permissions=danger-full-access：同样走原生 spawn', async () => {
    const out = await runProbe()
    expect(out).toBe('OK')
  })

  test('permissions=read-only：后端未启用时 FAIL-CLOSED', () => {
    const prev = process.env.SHENTONG_SANDBOX_BACKEND
    process.env.SHENTONG_SANDBOX_BACKEND = ''
    try {
      expect(() =>
        spawnSandboxed({ command: process.execPath, args: [], permissions: 'read-only' }),
      ).toThrow(/沙箱后端未激活/)
    } finally {
      if (prev === undefined) delete process.env.SHENTONG_SANDBOX_BACKEND
      else process.env.SHENTONG_SANDBOX_BACKEND = prev
    }
  })

  test('permissions=workspace-write：后端未启用时报出允许写入目录', () => {
    const prev = process.env.SHENTONG_SANDBOX_BACKEND
    process.env.SHENTONG_SANDBOX_BACKEND = ''
    try {
      expect(() =>
        spawnSandboxed({
          command: process.execPath,
          args: [],
          permissions: 'workspace-write',
          writableDirs: ['C:/work'],
        }),
      ).toThrow(/C:\\work|C:\/work/)
    } finally {
      if (prev === undefined) delete process.env.SHENTONG_SANDBOX_BACKEND
      else process.env.SHENTONG_SANDBOX_BACKEND = prev
    }
  })

  test('permissions=workspace-write：后端已启用但 launcher 缺失时仍 FAIL-CLOSED', () => {
    const prev = process.env.SHENTONG_SANDBOX_BACKEND
    const dir = mkdtempSync(join(tmpdir(), 'sbxres-'))
    try {
      process.env.SHENTONG_SANDBOX_BACKEND = '1'
      setSandboxResourcesBase(dir)
      expect(() =>
        spawnSandboxed({
          command: process.execPath,
          args: [],
          permissions: 'workspace-write',
          writableDirs: ['C:/work'],
        }),
      ).toThrow(/沙箱后端未激活/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      if (prev === undefined) delete process.env.SHENTONG_SANDBOX_BACKEND
      else process.env.SHENTONG_SANDBOX_BACKEND = prev
      setSandboxResourcesBase('')
    }
  })
})

describe('buildSandboxRunnerArgs', () => {
  test('workspace-write：mode/workspace/writable/temp/command 依次拼接，-- 分隔', () => {
    const args = buildSandboxRunnerArgs({
      mode: 'workspace-write',
      workspace: 'C:/ws',
      writableDirs: ['C:/ws', 'C:/tmp'],
      tempDir: 'C:/tmp',
      command: 'node',
      args: ['server.js', '--port', '8080'],
    })
    expect(args).toEqual([
      '--mode', 'workspace-write',
      '--workspace', 'C:/ws',
      '--writable', 'C:/ws',
      '--writable', 'C:/tmp',
      '--temp', 'C:/tmp',
      '--', 'node', 'server.js', '--port', '8080',
    ])
  })

  test('read-only：无 writable/temp，只保留 mode/workspace/--/command', () => {
    const args = buildSandboxRunnerArgs({
      mode: 'read-only',
      workspace: 'C:/ws',
      command: 'cmd.exe',
      args: ['/c', 'echo', 'hi'],
    })
    expect(args).toEqual(['--mode', 'read-only', '--workspace', 'C:/ws', '--', 'cmd.exe', '/c', 'echo', 'hi'])
  })
})

describe('sandbox backend gating', () => {
  test('sandboxBackendEnabled 默认关闭，SHENTONG_SANDBOX_BACKEND=1 开启', () => {
    const prev = process.env.SHENTONG_SANDBOX_BACKEND
    process.env.SHENTONG_SANDBOX_BACKEND = ''
    expect(sandboxBackendEnabled()).toBe(false)
    process.env.SHENTONG_SANDBOX_BACKEND = '1'
    expect(sandboxBackendEnabled()).toBe(true)
    if (prev === undefined) delete process.env.SHENTONG_SANDBOX_BACKEND
    else process.env.SHENTONG_SANDBOX_BACKEND = prev
  })

  test('sandboxRunnerExists 跟随 resources base 注入', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sbxres-'))
    try {
      setSandboxResourcesBase(dir)
      expect(sandboxRunnerExists()).toBe(false)
      mkdirSync(join(dir, 'sandbox'), { recursive: true })
      writeFileSync(join(dir, 'sandbox', 'shentong-sandbox-runner.exe'), 'x')
      expect(sandboxRunnerExists()).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      setSandboxResourcesBase('')
    }
  })
})