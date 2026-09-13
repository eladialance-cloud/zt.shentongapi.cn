// 内置 Python 解析（listBundledPythons / resolveBundledPython / pythonSearchRoots）
//
// 背景（2026-09-13 用户反馈「环境组件显示未安装且点击没反应」）：
// 旧实现只扫 <resources>/runtime 与 <cwd>/runtime 下的 <svc>/python/python.exe，导致
//   (a) 用户在「本地服务管理」自定义的运行时下载目录被完全忽略；
//   (b) Hermes 0.20.5 的 venv / cpython-* 嵌套布局识别不了。
// 后果不止显示：业务流引擎/微信域桥/抖音服务会回退宿主机 python 命令而启动失败。
// 本用例锁定各布局可被识别，并锁定同一服务目录内的优先级顺序。
jest.mock('electron', () => {
  const path = require('node:path')
  return {
    app: {
      isPackaged: false,
      getPath: () => path.join(process.cwd(), 'test-userdata-bundled-python'),
      getAppPath: () => process.cwd()
    }
  }
})
import {
  listBundledPythons,
  pythonSearchRoots,
  resolveBundledPython
} from '../../electron/main/service-registry/whitelist'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const WIN = process.platform === 'win32'
const EXE = WIN ? 'python.exe' : 'python'
/** 0.19 旧布局 / 随包嵌入式 Python */
const LEGACY_REL = WIN ? ['python', 'python.exe'] : ['python', 'bin', 'python3']
/** 0.20.5 Hermes 自带 venv */
const VENV_REL = WIN
  ? ['node_modules', 'hermes-agent', 'runtime', 'hermes-agent', 'venv', 'Scripts', EXE]
  : ['node_modules', 'hermes-agent', 'runtime', 'hermes-agent', 'venv', 'bin', EXE]

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'st-bundled-python-'))
}

function touch(file: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '')
  return file
}

describe('listBundledPythons 布局识别', () => {
  it('识别 0.19 旧布局：<svc>/python/python.exe', () => {
    const root = tempRoot()
    const expected = touch(path.join(root, 'hermes', ...LEGACY_REL))
    expect(listBundledPythons([root])).toContain(expected)
  })

  it('识别 0.20.5 Hermes venv 布局', () => {
    const root = tempRoot()
    const expected = touch(path.join(root, 'hermes', ...VENV_REL))
    expect(listBundledPythons([root])).toContain(expected)
  })

  it('识别 0.20.5 内嵌 cpython-* 布局', () => {
    const root = tempRoot()
    const expected = touch(
      path.join(
        root,
        'video-claw',
        'node_modules',
        'hermes-agent',
        'runtime',
        'python',
        'cpython-3.11.15-x86_64-none',
        EXE
      )
    )
    expect(listBundledPythons([root])).toContain(expected)
  })

  it('识别直接放在服务目录下的兜底布局：<svc>/python.exe', () => {
    const root = tempRoot()
    const expected = touch(path.join(root, 'hermes', EXE))
    expect(listBundledPythons([root])).toContain(expected)
  })

  it('同一服务目录内优先级：python/ > cpython-* > venv（venv 是 uv 跳板，必须排最后）', () => {
    const root = tempRoot()
    const svcDir = path.join(root, 'hermes')
    const legacy = touch(path.join(svcDir, ...LEGACY_REL))
    const venv = touch(path.join(svcDir, ...VENV_REL))
    const cpython = touch(
      path.join(
        svcDir,
        'node_modules',
        'hermes-agent',
        'runtime',
        'python',
        'cpython-3.11.15-x86_64-none',
        EXE
      )
    )
    const inSvcDir = listBundledPythons([root]).filter((p) => p.startsWith(svcDir))
    expect(inSvcDir).toEqual([legacy, cpython, venv])
  })

  it('文件不存在的候选不会出现在结果里', () => {
    const root = tempRoot()
    touch(path.join(root, 'hermes', ...LEGACY_REL))
    const inSvcDir = listBundledPythons([root]).filter((p) => p.startsWith(path.join(root, 'hermes')))
    expect(inSvcDir).toEqual([path.join(root, 'hermes', ...LEGACY_REL)])
  })
})

describe('pythonSearchRoots / resolveBundledPython', () => {
  it('搜索根包含随包目录与运行时下载目录（自定义位置不再被忽略）', () => {
    const roots = pythonSearchRoots().map((r) => path.resolve(r))
    expect(roots).toContain(path.resolve(process.cwd(), 'runtime'))
    // runtime-config 在测试里 mock 的 userData = <cwd>/test-userdata-bundled-python
    expect(roots.some((r) => r.indexOf('test-userdata-bundled-python') >= 0)).toBe(true)
  })

  it('extraRoots 追加到搜索根末尾', () => {
    const extra = path.join(tempRoot(), 'runtime')
    const roots = pythonSearchRoots([extra]).map((r) => path.resolve(r))
    expect(roots[roots.length - 1]).toBe(path.resolve(extra))
  })

  it('resolveBundledPython 返回优先级最高的可用解释器', () => {
    const all = listBundledPythons()
    expect(resolveBundledPython()).toBe(all[0] ?? null)
  })
})