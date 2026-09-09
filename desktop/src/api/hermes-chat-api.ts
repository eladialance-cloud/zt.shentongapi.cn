// Hermes 本地直达对话 - 渲染侧封装（IPC）
// 链路：主进程 → 本地 Hermes Agent（:8642 OpenAI 兼容流式）→ llm-proxy 计费。
// 消息内容全程本地，云端只做模型调用与扣费；鉴权沿用 Hermes Dashboard 会话 token。

import { useAuthStore } from '@/store/auth'
import type {
  HermesChatToolCall,
  HermesChatMessage,
  HermesChatLifecycleInfo,
  HermesChatDonePayload,
} from '@shared/types'

export interface HermesChatHandle {
  /** 发送一条消息：本地 Hermes 流式对话（扣费由云端 llm-proxy 完成）。
   * 失败（离线/未登录/Hermes 未就绪）时抛错或返回 ok=false，
   * 流式文本经 onMessage、错误经 onError 推送。 */
  send: (
    text: string,
    history?: HermesChatMessage[],
    knowledgeBaseId?: number,
    sessionId?: number,
    modelId?: string,
    profileId?: string,
    soul?: string,
    reasoningEffort?: string,
  ) => Promise<{ ok: boolean; aborted?: boolean }>
  /** 同步用户首选对话模型（send 未显式指定模型时缺省取用） */
  setModel: (modelId: string) => void
  /** 中断当前对话（本地 abort，云端退款） */
  abort: () => void
  /** 流式文本块；返回取消监听函数 */
  onMessage: (cb: (content: string) => void) => () => void
  /** 终审/来源标注后的最终文本；返回取消监听函数 */
  onFinalize: (cb: (content: string) => void) => () => void
  /** 工具调用（含状态 running/done/error 与输出）；返回取消监听函数 */
  onToolCall: (cb: (toolCall: HermesChatToolCall) => void) => () => void
  /** Agent 生命周期（start → end/error）；返回取消监听函数 */
  onLifecycle: (cb: (info: HermesChatLifecycleInfo) => void) => () => void
  /** 对话完成；返回取消监听函数 */
  onDone: (cb: (done?: HermesChatDonePayload) => void) => () => void
  /** 错误（离线/余额不足/未配置模型等）；返回取消监听函数 */
  onError: (cb: (err: Error) => void) => () => void
}

/** 创建 Hermes 对话句柄（组件挂载时创建一次，卸载时取消监听） */
export function createHermesChat(): HermesChatHandle {
  const api = window.electronAPI?.hermesChat
  if (!api) throw new Error('electronAPI.hermesChat 不可用（请升级桌面端版本）')
  return {
    send: async (text, history, knowledgeBaseId, sessionId, modelId, profileId, soul, reasoningEffort) => {
      const { accessToken } = useAuthStore.getState()
      if (!accessToken) throw new Error('未登录')
      return api.send({ text, token: accessToken, history, knowledgeBaseId, sessionId, modelId, profileId, soul, reasoningEffort })
    },
    setModel: (modelId: string) => api.setModel(modelId),
    abort: () => api.abort(),
    onMessage: (cb) => api.onMessage((d) => cb(d.content)),
    onFinalize: (cb) => api.onFinalize((d) => cb(d.content)),
    onToolCall: (cb) => api.onToolCall((d) => cb(d)),
    onLifecycle: (cb) => api.onLifecycle((d) => cb(d)),
    onDone: (cb) => api.onDone((d) => cb(d)),
    onError: (cb) => api.onError((d) => cb(new Error(d.message))),
  }
}

export default { createHermesChat }
