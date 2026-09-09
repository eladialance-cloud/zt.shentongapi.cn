/**
 * 进程沙箱出口（Phase 7 底座沙箱化）。
 *
 * 定位（抄 dsh）：模块进程 spawn 的唯一通道是 `spawnSandboxed()`，`permissions`
 * 只负责选择 preset，不替代强制。当前后端 = 随包分发的原生受限令牌 launcher
 * （`resources/sandbox/shentong-sandbox-runner.exe`，C# 版 `SandboxRunner.cs`，
 * 语义对齐 @deepseek-ai/dsh-sandbox-windows-acl）：
 * - `permissions` 缺省 / `danger-full-access`：走原生 child_process.spawn（现状全权限）；
 * - `read-only` / `workspace-write`：只有当 `SHENTONG_SANDBOX_BACKEND=1` 且 launcher
 *   二进制存在时，才用 launcher 启动受限进程；否则 **FAIL-CLOSED** 抛错，拒绝以未沙箱
 *   方式启动，避免“声明了收紧却实际全权限”的假安全。
 *
 * 为什么默认 fail-closed：受限令牌对 node 等复杂运行时仍存在初始化兼容性问题（在本机
 * 验证过 node.exe 在 WRITE_RESTRICTED 下会挂起/STATUS_DLL_NOT_FOUND），因此后端作为
 * 实验性能力，由 env 显式开启；出厂模块一律不声明 permissions（= 全权限），产品可用性
 * 不受影响。待 Windows 实机验证通过后，再放开默认。
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SandboxPermission } from './types'

export interface SandboxSpawnOptions extends SpawnOptions {
  command: string
  args: string[]
  /** 沙箱档位；缺省 / danger-full-access = 全权限，read-only / workspace-write = 强制沙箱 */
  permissions?: SandboxPermission
  /** workspace-write 档允许写入的目录（缺省用 workspaceDir） */
  writableDirs?: string[]
  /** 模块工作目录，作为受限令牌的 workspace（写允许根 + 子进程 cwd） */
  workspaceDir?: string
  /** 受限令牌可用的私有 temp（避免 node/pwsh 因 %TEMP% 不可写而挂死/初始化失败） */
  tempDir?: string
}

const RUNNER_NAME = 'shentong-sandbox-runner.exe'

/** 测试可注入的资源根；缺省按 Electron 打包/开发两种形态解析。 */
let resourcesBaseOverride: string | undefined
export function setSandboxResourcesBase(base: string): void {
  resourcesBaseOverride = base
}

export function sandboxRunnerPath(): string {
  let base: string
  if (resourcesBaseOverride) {
    base = resourcesBaseOverride
  } else if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    base = process.resourcesPath
  } else {
    base = join(process.cwd(), 'resources')
  }
  return join(base, 'sandbox', RUNNER_NAME)
}

/** 后端是否实验性启用（生产默认关闭 → 受限档 fail-closed）。 */
export function sandboxBackendEnabled(): boolean {
  return process.env.SHENTONG_SANDBOX_BACKEND === '1'
}

export function sandboxRunnerExists(): boolean {
  try {
    return existsSync(sandboxRunnerPath())
  } catch {
    return false
  }
}

/** 纯函数：构造 launcher argv（不含 runner 路径），便于单元测试。 */
export function buildSandboxRunnerArgs(o: {
  mode: Exclude<SandboxPermission, 'danger-full-access'>
  workspace: string
  writableDirs?: string[]
  tempDir?: string
  command: string
  args: string[]
}): string[] {
  const out = ['--mode', o.mode, '--workspace', o.workspace]
  for (const d of o.writableDirs ?? []) out.push('--writable', d)
  if (o.tempDir) out.push('--temp', o.tempDir)
  out.push('--')
  out.push(o.command, ...o.args)
  return out
}

export function spawnSandboxed(options: SandboxSpawnOptions): ChildProcess {
  const { command, args, permissions, writableDirs, workspaceDir, tempDir, ...spawnOpts } = options

  // 缺省 / danger-full-access：不收紧，保持现有行为（base 服务与未声明权限的模块）。
  if (!permissions || permissions === 'danger-full-access') {
    return spawn(command, args, {
      ...spawnOpts,
      shell: spawnOpts.shell ?? false,
      stdio: spawnOpts.stdio ?? ['ignore', 'pipe', 'pipe'],
      windowsHide: spawnOpts.windowsHide ?? true,
    })
  }

  // read-only / workspace-write：强制沙箱；后端未激活或 launcher 缺失时 fail-closed。
  const allow = writableDirs && writableDirs.length > 0 ? writableDirs.join(', ') : workspaceDir ?? '<cwd>'
  if (!sandboxBackendEnabled() || !sandboxRunnerExists()) {
    throw new Error(
      `沙箱后端未激活/不可用：模块进程 ${command} 声明 permissions=${permissions}（允许写入: ${allow}）。` +
        `请设置环境变量 SHENTONG_SANDBOX_BACKEND=1 并确认 shentong-sandbox-runner.exe 已随包分发，` +
        `或将模块改回 danger-full-access。拒绝以未沙箱方式启动。`,
    )
  }

  const workspace = workspaceDir ?? (writableDirs && writableDirs[0]) ?? process.cwd()
  const runnerArgs = buildSandboxRunnerArgs({
    mode: permissions,
    workspace,
    writableDirs,
    tempDir,
    command,
    args,
  })

  return spawn(sandboxRunnerPath(), runnerArgs, {
    ...spawnOpts,
    shell: false,
    stdio: spawnOpts.stdio ?? ['ignore', 'pipe', 'pipe'],
    windowsHide: spawnOpts.windowsHide ?? true,
  })
}