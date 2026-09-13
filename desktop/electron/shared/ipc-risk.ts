/**
 * 高风险 IPC 通道标记（安全审计 S-26）。
 *
 * 为什么需要：通道清单只能证明「通道登记过」，不能证明「参数校验过」。
 * 把文件 / 命令 / 网络 / 凭据 / 安装这五类通道显式标出来之后：
 *   - ipc-registry 在注册时会对高风险通道打 warn 级日志（便于运行期审计）；
 *   - tests/unit/ipc-risk.test.ts 保证名单不会与 shared/ipc-channels.ts 脱节；
 *   - 新增通道时「这张表里没有」本身就是一次需要解释的评审动作。
 *
 * 注意：本表是「需要额外评审」的名单，不是「已安全」的名单；
 * 真正的校验仍然必须在 handler 里落到 policy/* 纯函数（见批次 1 的 path-policy / url-policy）。
 */
import { IPC_CHANNELS } from "./ipc-channels"

export const IPC_RISK_CATEGORIES = ['file', 'command', 'network', 'credential', 'install'] as const
export type IpcRiskCategory = (typeof IPC_RISK_CATEGORIES)[number]

export const HIGH_RISK_CHANNELS: Readonly<Record<IpcRiskCategory, readonly string[]>> = {
  // 本机文件读写 / 打开 / 终端
  file: [
    'fs:open-file-in-editor',
    'fs:open-terminal',
    'fs:read-file',
    'fs:read-image-file',
    'fs:read-directory',
    'fs:list-recent-context-folders',
    'fs:set-session-context-folder',
    'video-parser:read-file',
  ],
  // 拉起子进程 / 安装 / 执行
  command: [
    'flow:run',
    'n8n:run-workflow',
    'edict:run',
    'service:install',
    'service:installEnvComponent',
    'service:set-runtime-dir',
  ],
  // 出站网络请求（SSRF / 凭据外带面）
  network: [
    'media:fetch-buffer',
    'llm-integrations:save',
    'llm-integrations:test',
    'video-parser:parse',
    'video-parser:extract-url',
  ],
  // 凭据写入与令牌注入
  credential: [
    'hermes-chat:sync-auth',
    'hermes-chat:set-proxy-key',
    'platform-account:setup-login',
    'platform-account:save-session',
    'platform-account:open-publish',
    'platform-account:test-login',
  ],
  // 远端内容 → 本地可执行目录（供应链）
  install: [
    'edict:add-remote-skill',
    'edict:update-remote-skill',
    'edict:remove-remote-skill',
    'edict:copy-skill',
    'hermes-skills:install',
    'hermes-skills:install-local',
    'hermes-skills:uninstall',
    'hermes-skills:update',
    'market:install',
    'market:installGithubSkill',
    'market:import',
    'market:importDir',
    'market:uninstall',
    'market:update',
    'modules:installFromSource',
  ],
}

export function allHighRiskChannels(): readonly string[] {
  return IPC_RISK_CATEGORIES.flatMap((category) => HIGH_RISK_CHANNELS[category])
}

export function riskCategoryOf(channel: string): IpcRiskCategory | null {
  if (typeof channel !== "string" || !channel) return null
  for (const category of IPC_RISK_CATEGORIES) {
    if (HIGH_RISK_CHANNELS[category].includes(channel)) return category
  }
  return null
}

export function isHighRiskChannel(channel: string): boolean {
  return riskCategoryOf(channel) !== null
}

/** 名单里但未在 IPC_CHANNELS 登记的通道（应为空；供测试与启动自检使用） */
export function riskyChannelsNotDeclared(
  declared: readonly string[] = IPC_CHANNELS,
): readonly string[] {
  const set = new Set(declared)
  return allHighRiskChannels().filter((c) => !set.has(c))
}
