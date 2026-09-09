jest.mock('electron', () => {
  const path = require('node:path')
  return {
    app: {
      isPackaged: false,
      getPath: () => path.join(process.cwd(), 'test-userdata-svc'),
      getAppPath: () => process.cwd(),
    },
  }
})

import { assembleRows } from '../../electron/main/service-registry/assembler'
import { parseDependencySpec, versionSatisfies, compareVersions } from '../../electron/main/service-registry/types'
import { loadAllRows, listModuleMcpNames } from '../../electron/main/service-registry/patch-loader'
import type { PatchFile, ServiceRow } from '../../electron/main/service-registry/types'

const base: PatchFile = {
  insert: [
    { id: 'n8n', displayName: 'N8N', tier: 'base', port: 5678 },
    { id: 'hermes', displayName: 'Hermes Agent', tier: 'base', port: 8642, launch: 'hermes' },
  ],
}

const moduleVc: PatchFile = {
  insert: [
    {
      id: 'video-claw',
      displayName: 'ST-Claw',
      tier: 'module',
      port: 8000,
      readyPorts: [3000],
      launch: 'video-claw',
      restartOn: ['proxyKey', 'modelDefaults'],
    },
  ],
}

function ids(rows: ServiceRow[]): string[] {
  return rows.map((r) => r.id)
}

describe('service-registry assembleRows', () => {
  test('module insert：base+1 模块 → 5 行，模块排最后且 tier=module', () => {
    const rows = assembleRows(base, [moduleVc])
    expect(ids(rows)).toEqual(['n8n', 'hermes', 'video-claw'])
    const vc = rows[2]
    expect(vc.tier).toBe('module')
    expect(vc.runtimeKey).toBe('video-claw')
    expect(vc.port).toBe(8000)
    expect(vc.readyPorts).toEqual([3000])
    expect(vc.launch).toBe('video-claw')
    expect(vc.readyTimeoutMs).toBe(30000)
  })

  test('module override base：整块替换 config（端口/名称都换）', () => {
    const rows = assembleRows(base, [
      { override: [{ id: 'n8n', displayName: 'N8N-X', tier: 'module', port: 5679, envKey: 'n8n' }] },
    ])
    const n8n = rows.find((r) => r.id === 'n8n')!
    expect(n8n.port).toBe(5679)
    expect(n8n.displayName).toBe('N8N-X')
    expect(rows).toHaveLength(2)
  })

  test('override 目标不存在抛错（id 打错不会静默新增）', () => {
    expect(() =>
      assembleRows(base, [{ override: [{ id: 'n9n', displayName: 'N9N', tier: 'module', port: 5679 }] }]),
    ).toThrow(/override 目标不存在/)
  })

  test('insert 重复 id 抛错（应改用 override）', () => {
    expect(() =>
      assembleRows(base, [{ insert: [{ id: 'n8n', displayName: 'N8N-DUP', tier: 'module', port: 5679 }] }]),
    ).toThrow(/insert 重复服务行 id/)
  })

  test('override disabled 剔除目标行', () => {
    const rows = assembleRows(base, [
      { override: [{ id: 'n8n', displayName: 'N8N', tier: 'base', port: 5678, disabled: true }] },
    ])
    expect(rows.find((r) => r.id === 'n8n')).toBeUndefined()
    expect(rows).toHaveLength(1)
  })

  test('insert disabled 跳过', () => {
    const rows = assembleRows(base, [
      { insert: [{ id: 'video-claw', displayName: 'ST-Claw', tier: 'module', port: 8000, disabled: true }] },
    ])
    expect(rows.find((r) => r.id === 'video-claw')).toBeUndefined()
  })

  test('禁止 module→module 覆盖', () => {
    expect(() =>
      assembleRows(base, [
        { insert: [{ id: 'x', displayName: 'X', tier: 'module', port: 10001 }] },
        { override: [{ id: 'x', displayName: 'X2', tier: 'module', port: 10002 }] },
      ]),
    ).toThrow(/module→module/)
  })

  test('base insert 重复 id 抛错', () => {
    const bad: PatchFile = {
      insert: [
        { id: 'dup', displayName: 'Dup', tier: 'base', port: 8080 },
        { id: 'dup', displayName: 'Dup2', tier: 'base', port: 8081 },
      ],
    }
    expect(() => assembleRows(bad, [])).toThrow(/insert 重复服务行 id/)
  })

  test('依赖不存在抛错', () => {
    expect(() =>
      assembleRows({ insert: [{ id: 'a', displayName: 'A', tier: 'base', port: 10001, dependsOn: ['ghost'] }] }, []),
    ).toThrow(/依赖不存在/)
  })

  test('循环依赖抛错', () => {
    const cyc: PatchFile = {
      insert: [
        { id: 'a', displayName: 'A', tier: 'base', port: 10001, dependsOn: ['b'] },
        { id: 'b', displayName: 'B', tier: 'base', port: 10002, dependsOn: ['a'] },
      ],
    }
    expect(() => assembleRows(cyc, [])).toThrow(/循环依赖/)
  })

  test('稳定拓扑排序：dependsOn 前置，无依赖保持插入序', () => {
    const outOfOrder: PatchFile = {
      insert: [
        { id: 'b', displayName: 'B', tier: 'base', port: 10002, dependsOn: ['a'] },
        { id: 'a', displayName: 'A', tier: 'base', port: 10001 },
        { id: 'c', displayName: 'C', tier: 'base', port: 10003 },
      ],
    }
    expect(ids(assembleRows(outOfOrder, []))).toEqual(['a', 'b', 'c'])
  })

  test('normalizeCapabilities：mcpServer 缺名回退到服务行 id（供模块停用口精确移除）', () => {
    const rows = assembleRows(base, [
      {
        insert: [
          {
            id: 'mod-x',
            displayName: 'X',
            tier: 'module',
            port: 10001,
            capabilities: { mcpServer: { command: 'node', args: ['x'] } },
          },
        ],
      },
    ])
    expect(rows.find((r) => r.id === 'mod-x')!.capabilities.mcpServer?.name).toBe('mod-x')
  })

  test('permissions/writableDirs 透传归一化；非法 permissions 抛错', () => {
    const rows = assembleRows(base, [
      {
        insert: [
          {
            id: 'mod-safe',
            displayName: 'Safe',
            tier: 'module',
            port: 10001,
            permissions: 'workspace-write',
            writableDirs: ['C:/work'],
          },
        ],
      },
    ])
    const mod = rows.find((r) => r.id === 'mod-safe')!
    expect(mod.permissions).toBe('workspace-write')
    expect(mod.writableDirs).toEqual(['C:/work'])

    expect(() =>
      assembleRows(base, [
        { insert: [{ id: 'mod-bad', displayName: 'Bad', tier: 'module', port: 10002, permissions: 'root' as never }] },
      ]),
    ).toThrow(/permissions/)
  })
})

describe('service-registry dependsOn 版本范围（A2）', () => {
  test('parseDependencySpec：裸 id / id@range / 非法@ 抛错', () => {
    expect(parseDependencySpec('hermes')).toEqual({ id: 'hermes', range: '' })
    expect(parseDependencySpec('hermes@>=2.0.0')).toEqual({ id: 'hermes', range: '>=2.0.0' })
    expect(parseDependencySpec('  hermes @ ^1.2.0 ')).toEqual({ id: 'hermes', range: '^1.2.0' })
    expect(() => parseDependencySpec('@1.2.3')).toThrow(/缺少 id/)
    expect(() => parseDependencySpec('hermes@')).toThrow(/缺少版本范围/)
  })

  test('versionSatisfies：常见运算符（>= < ^ ~ x/* ||）', () => {
    expect(versionSatisfies('1.2.3', '>=1.0.0')).toBe(true)
    expect(versionSatisfies('1.0.0', '>=1.2.0')).toBe(false)
    expect(versionSatisfies('2.0.0', '<2.0.0')).toBe(false)
    expect(versionSatisfies('1.9.9', '1.x')).toBe(true)
    expect(versionSatisfies('2.5.0', '1.x')).toBe(false)
    expect(versionSatisfies('1.2.9', '1.2.x')).toBe(true)
    expect(versionSatisfies('1.3.0', '1.2.x')).toBe(false)
    expect(versionSatisfies('1.2.3', '^1.2.0')).toBe(true)
    expect(versionSatisfies('2.0.0', '^1.2.0')).toBe(false)
    expect(versionSatisfies('1.2.3', '~1.2.0')).toBe(true)
    expect(versionSatisfies('1.3.0', '~1.2.0')).toBe(false)
    expect(versionSatisfies('1.5.0', '>=1.2.0 <2.0.0')).toBe(true)
    expect(versionSatisfies('2.5.0', '>=1.2.0 <2.0.0')).toBe(false)
    expect(versionSatisfies('3.2.1', '1.x || >=3.0.0')).toBe(true)
    expect(versionSatisfies('2.0.0', '*')).toBe(true)
  })

  test('compareVersions：基本比较与非法返回 null', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('not-a-ver', '1.0.0')).toBe(null)
  })

  test('dependsOn 带 range：目标 version 命中则装配通过并保持排序', () => {
    const patch: PatchFile = {
      insert: [
        { id: 'a', displayName: 'A', tier: 'base', port: 10001, version: '2.0.0' },
        { id: 'b', displayName: 'B', tier: 'base', port: 10002, dependsOn: ['a@^2.0.0'] },
      ],
    }
    expect(ids(assembleRows(patch, []))).toEqual(['a', 'b'])
  })

  test('dependsOn 带 range：目标 version 不满足抛错', () => {
    const patch: PatchFile = {
      insert: [
        { id: 'a', displayName: 'A', tier: 'base', port: 10001, version: '1.0.0' },
        { id: 'b', displayName: 'B', tier: 'base', port: 10002, dependsOn: ['a@^2.0.0'] },
      ],
    }
    expect(() => assembleRows(patch, [])).toThrow(/目标版本 1.0.0 不满足/)
  })

  test('dependsOn 带 range：目标行未声明 version 抛错（不能无依据放行）', () => {
    const patch: PatchFile = {
      insert: [
        { id: 'a', displayName: 'A', tier: 'base', port: 10001 },
        { id: 'b', displayName: 'B', tier: 'base', port: 10002, dependsOn: ['a@^2.0.0'] },
      ],
    }
    expect(() => assembleRows(patch, [])).toThrow(/目标行未声明 version/)
  })

  test('dependsOn 带 range：依赖不存在抛错', () => {
    expect(() =>
      assembleRows(
        { insert: [{ id: 'b', displayName: 'B', tier: 'base', port: 10002, dependsOn: ['ghost@>=1.0.0'] }] },
        [],
      ),
    ).toThrow(/依赖不存在/)
  })
})


describe('service-registry patch-loader（dev 路径真实文件）', () => {
  test('loadAllRows：base 3 行（无 openclaw）+ video-claw 模块行，顺序与旧 startAll 一致', () => {
    const rows = loadAllRows()
    expect(ids(rows)).toEqual(['n8n', 'hermes', 'video-claw'])
    expect(rows[2].tier).toBe('module')
    expect(rows[2].capabilities.webUi?.url).toBe('http://127.0.0.1:3000')
  })

  test('listModuleMcpNames：当前 video-claw 未声明 mcpServer → 空（能力口为空操作）', () => {
    expect(listModuleMcpNames()).toEqual({ enabled: [], removed: [] })
  })
})
