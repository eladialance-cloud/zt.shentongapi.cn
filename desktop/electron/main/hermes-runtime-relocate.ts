// Hermes 便携运行时重定位（根治 uv trampoline / pyvenv.cfg 内嵌构建机绝对路径问题）
//
// 背景：hermes-win-x64.tar.gz 由 desktop/scripts/package-hermes-portable.ps1 在构建机
// 临时目录（%TEMP%\hermes-portable-build-<ver>）生成，venv 内嵌了构建机的绝对路径：
//   - venv/pyvenv.cfg 的 home 指向构建机临时 Python 目录（已被删除）
//   - venv/Scripts/python.exe、hermes.exe 等是 uv trampoline，内嵌构建机绝对路径
//   - site-packages 的 editable finder / direct_url.json 内嵌构建机源码绝对路径
// 因此包解压到任意用户机器后全部失效，启动报：
//   "uv trampoline failed to canonicalize script path"
// 本模块在每次启动 Hermes 前执行幂等修复（不改动 .runtime-sha256 指纹，不会触发重装）：
//   1. 重写 pyvenv.cfg home，指向包内管理的 Python 目录
//   2. 用包内真实 python.exe/pythonw.exe 替换 venv Scripts 中的 uv trampoline
//   3. 重写 editable finder / direct_url.json 中的源码绝对路径
//   4. 给 lib/python-launcher.js 打补丁：改为 "python -m hermes_cli.main" 启动，
//      彻底绕开所有内嵌构建机路径的 .exe 启动器（hermes/内部工具均可运行）
import * as fs from 'node:fs'
import * as path from 'node:path'

/** python-launcher.js 补丁标记，用于幂等判断 */
const LAUNCHER_PATCH_MARKER = 'HERMES_PORTABLE_RELOCATED'

export interface HermesRelocateResult {
  /** 本次是否实际修改了文件 */
  relocated: boolean
  /** 重定位后的 venv python 可执行文件路径 */
  venvPython: string
  /** 跳过修复时的原因（非错误） */
  reason?: string
}

/**
 * 对已解压的 hermes 运行时执行幂等重定位。
 * @param hermesRoot 运行时根目录（hermes.exe.cmd 所在目录）
 */
export function relocateHermesRuntime(hermesRoot: string): HermesRelocateResult {
  const agentDir = path.join(hermesRoot, 'node_modules', 'hermes-agent')
  const srcDir = path.join(agentDir, 'runtime', 'hermes-agent')
  const venvDir = path.join(srcDir, 'venv')
  const venvScripts = path.join(venvDir, 'Scripts')
  const pyvenvCfg = path.join(venvDir, 'pyvenv.cfg')
  const venvPython = path.join(venvScripts, 'python.exe')

  if (!fs.existsSync(pyvenvCfg)) {
    return { relocated: false, venvPython, reason: 'no venv (pyvenv.cfg missing)' }
  }

  const managedPython = resolveManagedPython(agentDir, pyvenvCfg)
  if (!managedPython) {
    return { relocated: false, venvPython, reason: 'managed python not found under runtime/python' }
  }

  let changed = false
  const oldHome = readPyvenvHome(pyvenvCfg)

  // 1. pyvenv.cfg home -> 包内管理的 Python
  if (oldHome && !samePath(oldHome, managedPython)) {
    rewritePyvenvHome(pyvenvCfg, managedPython)
    changed = true
  }

  // 2. 用真实 python 替换 venv Scripts 里的 uv trampoline
  for (const name of ['python.exe', 'pythonw.exe'] as const) {
    const src = path.join(managedPython, name)
    const dst = path.join(venvScripts, name)
    if (fs.existsSync(src)) {
      try {
        const srcSize = fs.statSync(src).size
        const dstSize = fs.existsSync(dst) ? fs.statSync(dst).size : 0
        if (dstSize !== srcSize) {
          fs.copyFileSync(src, dst)
          changed = true
        }
      } catch {
        // 文件被占用等：忽略，下次启动再试
      }
    }
  }
  // 2b. 复制运行时 DLL（python311.dll / vcruntime140.dll / python3.dll 等）——
  //     只复制 python.exe 会报 0xC0000135 缺少 DLL，venv 启动直接失败
  try {
    for (const dll of fs.readdirSync(managedPython)) {
      if (!/\.dll$/i.test(dll)) continue
      const src = path.join(managedPython, dll)
      const dst = path.join(venvScripts, dll)
      const srcSize = fs.statSync(src).size
      const dstSize = fs.existsSync(dst) ? fs.statSync(dst).size : 0
      if (dstSize !== srcSize) {
        fs.copyFileSync(src, dst)
        changed = true
      }
    }
  } catch {
    // ignore（目录不可读等场景）
  }

  // 3. 重写 site-packages 中内嵌旧源码路径的 editable 文件
  if (oldHome && !samePath(oldHome, managedPython)) {
    const oldSrc = oldHome.replace(/\\runtime\\python\\[^\\]+$/, '\\runtime\\hermes-agent')
    if (oldSrc !== srcDir) {
      changed = rewriteSitePackagesPaths(venvDir, oldSrc, srcDir) || changed
    }
  }

  // 4. python-launcher.js 补丁（幂等）
  changed = patchPythonLauncher(agentDir) || changed

  return { relocated: changed, venvPython }
}

/** 读取 pyvenv.cfg 的 home 值 */
function readPyvenvHome(cfgPath: string): string | null {
  try {
    const content = fs.readFileSync(cfgPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const m = /^home\s*=\s*(.+?)\s*$/.exec(line)
      if (m) return m[1].trim()
    }
  } catch {
    // ignore
  }
  return null
}

/** 重写 pyvenv.cfg 的 home 行 */
function rewritePyvenvHome(cfgPath: string, home: string): void {
  try {
    const content = fs.readFileSync(cfgPath, 'utf8')
    const next = content.replace(/^home\s*=.*$/m, `home = ${home}`)
    if (next !== content) fs.writeFileSync(cfgPath, next)
  } catch {
    // ignore（只读目录等场景：启动失败时由主流程报错）
  }
}

/** 解析包内管理的 Python 目录（runtime/python/* 中含 python.exe 的目录） */
function resolveManagedPython(agentDir: string, pyvenvCfg: string): string | null {
  const pythonRoot = path.join(agentDir, 'runtime', 'python')
  if (!fs.existsSync(pythonRoot)) return null
  const candidates = fs
    .readdirSync(pythonRoot)
    .map((d) => path.join(pythonRoot, d))
    .filter((p) => fs.existsSync(path.join(p, 'python.exe')))
  if (candidates.length === 0) return null

  // 优先与 pyvenv.cfg 引用的目录同名（如 cpython-3.11-windows-x86_64-none）
  const home = readPyvenvHome(pyvenvCfg)
  if (home) {
    const exact = candidates.find((p) => samePath(p, home))
    if (exact) return exact
  }
  // 其次按名称排序取第一个（cpython-3.11-* 会在 cpython-3.11.15-* 之前）
  return [...candidates].sort()[0] ?? null
}

/** 大小写不敏感的绝对路径比较 */
function samePath(a: string, b: string): boolean {
  try {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  } catch {
    return a === b
  }
}

/** 重写 site-packages 中 editable finder 与 direct_url.json 的旧源码路径 */
function rewriteSitePackagesPaths(venvDir: string, oldSrc: string, newSrc: string): boolean {
  const site = path.join(venvDir, 'Lib', 'site-packages')
  if (!fs.existsSync(site)) return false
  let changed = false

  // editable finder（运行时实际生效，路径以 \\ 转义形式内嵌）
  try {
    for (const f of fs.readdirSync(site)) {
      if (!f.startsWith('__editable__') || !f.endsWith('.py')) continue
      const fp = path.join(site, f)
      const content = fs.readFileSync(fp, 'utf8')
      const escapedOld = oldSrc.replace(/\\/g, '\\\\')
      const escapedNew = newSrc.replace(/\\/g, '\\\\')
      let next = content.split(escapedOld).join(escapedNew)
      if (next === content) next = content.split(oldSrc).join(newSrc)
      if (next !== content) {
        fs.writeFileSync(fp, next)
        changed = true
      }
    }
  } catch {
    // ignore
  }

  // direct_url.json（元数据，非运行时依赖，尽力而为）
  try {
    for (const d of fs.readdirSync(site)) {
      if (!/^hermes_agent-.*\.dist-info$/.test(d)) continue
      const du = path.join(site, d, 'direct_url.json')
      if (!fs.existsSync(du)) continue
      const content = fs.readFileSync(du, 'utf8')
      const oldUrl = oldSrc.replace(/\\/g, '/')
      const newUrl = newSrc.replace(/\\/g, '/')
      const next = content.split(oldUrl).join(newUrl)
      if (next !== content) {
        fs.writeFileSync(du, next)
        changed = true
      }
    }
  } catch {
    // ignore
  }

  return changed
}

/**
 * 给 node_modules/hermes-agent/lib/python-launcher.js 打补丁：
 * 将 buildConsoleInvocation 改为直接调用 venv python -m hermes_cli.main，
 * 绕开内嵌构建机绝对路径的 uv trampoline（hermes.exe / hermes-agent.exe）。
 */
function patchPythonLauncher(agentDir: string): boolean {
  const lp = path.join(agentDir, 'lib', 'python-launcher.js')
  if (!fs.existsSync(lp)) return false
  try {
    const content = fs.readFileSync(lp, 'utf8')
    const normalized = content.replace(/\r\n/g, '\n')
    if (normalized.includes(LAUNCHER_PATCH_MARKER)) return false

    const oldFn = [
      'function buildConsoleInvocation(binName, userArgs, platform = process.platform) {',
      '  return {',
      '    command: getConsoleExecutable(binName, platform),',
      '    args: [...userArgs]',
      '  };',
      '}',
    ].join('\n')
    const newFn = [
      'function buildConsoleInvocation(binName, userArgs, platform = process.platform) {',
      `  // ${LAUNCHER_PATCH_MARKER}: desktop-bundled runtime, uv trampolines embed`,
      '  // build-machine absolute paths; launch via the relocated venv python instead.',
      '  return {',
      '    command: path.join(getVenvDirectory(), "Scripts", "python.exe"),',
      '    args: ["-m", "hermes_cli.main", ...userArgs]',
      '  };',
      '}',
    ].join('\n')

    if (!normalized.includes(oldFn)) return false
    fs.writeFileSync(lp, normalized.split(oldFn).join(newFn))
    return true
  } catch {
    return false
  }
}
