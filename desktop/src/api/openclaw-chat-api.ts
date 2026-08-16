// OpenClaw 本地直达对话 - 渲染侧封装（IPC）
// 链路：主进程 → 本地 OpenClaw WS 网关（富事件）→ OpenClaw 内部经 llm-proxy 调用后台模型并扣费。
// 消息内容全程本地，云端只做模型调用与扣费。

import { useAuthStore } from '@/store/auth'
import type {
  OpenClawToolCall,
  OpenClawChatMessage,
  OpenClawLifecycleInfo,
} from '@shared/types'

export interface OpenClawChatHandle {
  /** 发送一条消息：本地 OpenClaw 流式对话（扣费由云端 llm-proxy 完成）。
   * 失败（离线/未登录/OpenClaw 未配置）时抛错或返回 ok=false，
   * 流式文本经 onMessage、错误经 onError 推送。 */
  send: (
    text: string,
    history?: OpenClawChatMessage[],
    knowledgeBaseId?: number,
    sessionId?: number,
    modelId?: string,
  ) => Promise<{ ok: boolean; aborted?: boolean }>
  /** 同步用户首选对话模型到 OpenClaw 配置（新会话默认模型） */
  setModel: (modelId: string) => void
  /** 中断当前对话（本地 abort，云端退款） */
  abort: () => void
  /** 流式文本块；返回取消监听函数 */
  onMessage: (cb: (content: string) => void) => () => void
  /** 终审/来源标注后的最终文本；返回取消监听函数 */
  onFinalize: (cb: (content: string) => void) => () => void
  /** 工具调用（含状态 start/done/error 与输出）；返回取消监听函数 */
  onToolCall: (cb: (toolCall: OpenClawToolCall) => void) => () => void
  /** Agent 生命周期（start → finishing → end/error）；返回取消监听函数 */
  onLifecycle: (cb: (info: OpenClawLifecycleInfo) => void) => () => void
  /** 对话完成；返回取消监听函数 */
  onDone: (cb: () => void) => () => void
  /** 错误（离线/余额不足/未配置模型等）；返回取消监听函数 */
  onError: (cb: (err: Error) => void) => () => void
}

/** 创建 OpenClaw 对话句柄（组件挂载时创建一次，卸载时取消监听） */
export function createOpenClawChat(): OpenClawChatHandle {
  const api = window.electronAPI?.openclawChat
  if (!api) throw new Error('electronAPI.openclawChat 不可用（请升级桌面端版本）')
  return {
    send: async (text, history, knowledgeBaseId, sessionId, modelId) => {
      const { accessToken } = useAuthStore.getState()
      if (!accessToken) throw new Error('未登录')
      return api.send(text, accessToken, history, knowledgeBaseId, sessionId, modelId)
    },
    setModel: (modelId: string) => api.setModel(modelId),
    abort: () => api.abort(),
    onMessage: (cb) => api.onMessage((d) => cb(d.content)),
    onFinalize: (cb) => api.onFinalize((d) => cb(d.content)),
    onToolCall: (cb) => api.onToolCall((d) => cb(d)),
    onLifecycle: (cb) => api.onLifecycle((d) => cb(d.lifecycle)),
    onDone: (cb) => api.onDone(() => cb()),
    onError: (cb) => api.onError((d) => cb(new Error(d.message))),
  }
}

export default { createOpenClawChat }
