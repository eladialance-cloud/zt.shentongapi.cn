// Hermes 对话页本地斜杠命令（上游 target:"desktop" 的子集）
// agent 网关命令（/web /browse /compact 等）需 gateway，后续接入；
// /image /video 本地映射到已有文生图/文生视频弹窗。

export interface ParsedSlashCommand {
  raw: string
  name: string
  args: string
}

/** 解析 /cmd args；非斜杠返回 null */
export function parseSlashCommand(raw: string): ParsedSlashCommand | null {
  const trimmed = (raw || '').trim()
  if (!trimmed.startsWith('/')) return null
  const withoutSlash = trimmed.slice(1)
  if (!withoutSlash.trim()) return null
  const match = withoutSlash.match(/^(\S+)(?:\s+(.*))?$/s)
  if (!match) return null
  return { raw: trimmed, name: match[1].toLowerCase(), args: match[2] ?? '' }
}

/** 本地可处理（无需 gateway）的命令名 */
export const LOCAL_COMMAND_NAMES = new Set([
  'new', 'clear', 'model', 'help', 'commands', 'usage', 'version', 'persona',
  'skills', 'memory', 'settings', 'office', 'agents', 'discover', 'providers',
  'tools',
  'schedules', 'gateway', 'kanban', 'fast', 'image', 'video', 'reset', 'reload-skills', 'curator', 'clear',
  'status', 'debug', 'undo', 'retry', 'compact', 'compress',
  'learn', 'remember', 'recall', 'resume',
])

/** 需要 gateway 的 Agent 命令（规划中） */
export const AGENT_ONLY_COMMAND_NAMES = new Set([
  'web', 'browse', 'code', 'shell', 'btw', 'approve', 'deny', 'goal', 'steer', 'queue', 'update', 'file',
])

export const SLASH_HELP = [
  '可用斜杠命令：',
  '- `/help` / `/commands`：查看本帮助',
  '- `/new`：新建对话',
  '- `/clear`：清空当前对话',
  '- `/model`：打开模型/知识库设置',
  '- `/image`：打开文生图',
  '- `/video`：打开文生视频',
  '- `/usage`：查看本次会话 token 用量',
  '- `/version`：查看深瞳机器人版本',
  '- `/persona`：查看当前人格设置',
  '- `/skills`：技能市场',
  '- `/tools`：查看工具 / 能力（工具集开关 / MCP / 技能）',
  '- `/memory`：本地深瞳机器人记忆（USER.md / MEMORY.md）',
  '- `/settings`：设置',
  '- `/status`：深瞳机器人运行状态',
  '- `/debug`：调试信息（模型/人格/会话/token）',
  '- `/undo`：撤回上一条回复',
  '- `/retry`：重发上一条消息',
  '- `/compact`：压缩当前上下文',
  '- `/reset`：重置上下文',
  '- `/reload-skills`：刷新技能目录',
  '- `/curator`：查看技能使用排序状态',
  '- `/learn` / `/remember` / `/recall`：记忆面板',
  '- `/office` / `/agents` / `/schedules` / `/gateway` / `/kanban`：跳转对应页面',
  '',
  'Agent 网关命令（`/web` `/browse` `/code` `/shell` `/btw` `/approve` `/deny` `/goal` `/steer` `/queue` `/update` `/file`）经深瞳机器人网关执行；可先 /help /status 了解当前状态。'
].join('\n')
