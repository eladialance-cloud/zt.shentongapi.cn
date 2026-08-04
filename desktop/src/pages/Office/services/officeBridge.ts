/**
 * OfficeBridge — Chat页面 ↔ 办公室可视化 事件桥接 (v2.0 桩模块)
 * 
 * 旧2.5D系统通过此桥接触发办公室角色动画。
 * 集成视图暂不需要，保留接口兼容性（no-op实现）。
 */

export function isRetrieveTool(toolName: string): boolean {
  // 判断是否为检索类工具调用
  const retrievePatterns = ['search', 'retrieve', 'query', 'find', 'lookup', 'rag', 'knowledge']
  return retrievePatterns.some(p => toolName.toLowerCase().includes(p))
}

class OfficeBridge {
  /** 用户发送消息 */
  onChatMessageSent() {}

  /** AI开始生成回复 */
  onReplyGenerated() {}

  /** 工具调用 */
  onToolCall(_toolName: string) {}

  /** 检索类工具调用 */
  onAgentRetrieve() {}

  /** 积分扣减 */
  onCreditsDeducted(_amount: number) {}

  /** 进入审核阶段 */
  onReview() {}

  /** 任务完成 */
  onTaskComplete() {}

  /** 系统错误 */
  onSystemError(_message: string) {}
}

export const officeBridge = new OfficeBridge()
