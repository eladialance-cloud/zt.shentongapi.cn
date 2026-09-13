/**
 * allowed-roots —— 文件访问允许根目录注册表（安全审计 S-03 / S-04 / S-21 / S-22）
 *
 * 为什么单独成模块：允许根现在有两类消费者——
 *  1. Hermes 对话的文件/终端 IPC（hermes-fs-ipc.ts，本地渲染层触发，用户在场）；
 *  2. 云端远程控制通道的 file_read / file_open（remote-control.ts，**服务端触发，用户不在场**）。
 * 两者的信任级别不同，但「哪些目录被授权」必须是同一份事实，否则会出现绕过：
 * 用户在 A 处授权、B 处却被更宽的口径放行。
 *
 * 授权来源只有三类，**全部是用户显式动作或用户此前显式选择的目录**：
 *  1. 原生目录选择对话框（fs:select-folder）；
 *  2. 切换会话上下文目录（fs:set-session-context-folder）；
 *  3. 历史「最近上下文文件夹」清单（由上面两个动作写入）。
 *
 * 不变量：不含 userData、不含盘符根、不含用户主目录（避免一次误选把整机放开）。
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 「最近上下文文件夹」清单文件；非 Electron 环境（单测）返回空串 */
export function contextFolderFile(): string {
  try {
    return join(app.getPath('userData'), 'hermes-context-folders.json')
  } catch {
    return ''
  }
}

/** 历史上下文文件夹（用户过去显式选择过的目录） */
export function readContextFolders(): string[] {
  try {
    const file = contextFolderFile()
    if (!file || !existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as unknown[]).filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writeContextFolders(list: string[]): void {
  try {
    const file = contextFolderFile()
    if (!file) return
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(list.slice(0, 50), null, 2), { encoding: 'utf-8', mode: 0o600 })
  } catch {
    /* ignore */
  }
}

export function pushRecentContextFolder(path: string): void {
  if (!path) return
  const list = readContextFolders().filter((x) => x !== path)
  list.unshift(path)
  writeContextFolders(list)
}

/** 会话内已授权的根目录（内存态，不落盘，避免允许根被静默放大） */
const sessionGrantedRoots = new Set<string>()

/** 记录一个用户显式授权的根目录 */
export function grantRoot(dir: unknown): void {
  if (typeof dir !== 'string') return
  const trimmed = dir.trim()
  if (!trimmed) return
  sessionGrantedRoots.add(trimmed)
}

/** 撤销一个会话内授权的根目录（用户取消选择时） */
export function revokeRoot(dir: unknown): void {
  if (typeof dir !== 'string') return
  sessionGrantedRoots.delete(dir.trim())
}

/** 清空会话内授权（测试/登出用） */
export function clearSessionRoots(): void {
  sessionGrantedRoots.clear()
}

/** 当前所有允许访问的根目录（会话授权 ∪ 历史上下文文件夹） */
export function allowedRoots(): string[] {
  const merged = [...sessionGrantedRoots, ...readContextFolders()]
  return Array.from(new Set(merged.filter((r) => typeof r === 'string' && r.trim().length > 0)))
}
