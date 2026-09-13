// Hermes 工具/命令目录（本地兜底数据；网关已连接时优先用 commands.catalog 补全）
export type ToolCategory = "chat" | "agent" | "tools" | "info"

export interface ToolCatalogEntry {
  category: ToolCategory
  name: string
  description: string
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  { category: "chat", name: "/new", description: "新建对话" },
  { category: "chat", name: "/clear", description: "清空当前对话" },
  { category: "chat", name: "/compact", description: "压缩并小结上下文" },
  { category: "chat", name: "/undo", description: "撤回上一条助手回复" },
  { category: "chat", name: "/retry", description: "重发上一条消息" },
  { category: "agent", name: "/status", description: "显示深瞳机器人运行状态" },
  { category: "agent", name: "/debug", description: "显示模型/人格/会话/token 调试信息" },
  { category: "agent", name: "/usage", description: "显示 token 用量与估算成本" },
  { category: "agent", name: "/version", description: "显示深瞳机器人版本" },
  { category: "tools", name: "/web", description: "联网搜索（经 gateway）" },
  { category: "tools", name: "/browse", description: "浏览网页（经 gateway）" },
  { category: "tools", name: "/code", description: "写/执行代码（经 gateway）" },
  { category: "tools", name: "/shell", description: "执行 shell 命令（经 gateway）" },
  { category: "tools", name: "/image", description: "生成图片" },
  { category: "tools", name: "/video", description: "生成视频" },
  { category: "tools", name: "/memory", description: "本地深瞳机器人记忆（USER.md / MEMORY.md）" },
  { category: "tools", name: "/persona", description: "官署人格/SOUL 设置" },
  { category: "info", name: "/help", description: "查看全部斜杠命令" },
  { category: "info", name: "/tools", description: "打开本工具目录" },
  { category: "info", name: "/skills", description: "跳转技能市场" },
  { category: "info", name: "/discover", description: "跳转发现页" },
  { category: "info", name: "/providers", description: "跳转设置" },
  { category: "info", name: "/schedules", description: "跳转自动化" },
  { category: "info", name: "/gateway", description: "跳转服务/网关" },
  { category: "info", name: "/kanban", description: "跳转任务中心" },
  { category: "info", name: "/agents", description: "跳转 Agent 市场" },
  { category: "info", name: "/office", description: "跳转 Office 3D" },
]

export function groupToolsByCategory(entries: ToolCatalogEntry[]): Array<{ category: ToolCategory; label: string; items: ToolCatalogEntry[] }> {
  const labels: Record<ToolCategory, string> = { chat: "对话控制", agent: "Agent 指令", tools: "工具/能力", info: "页面导航" }
  const order: ToolCategory[] = ["chat", "agent", "tools", "info"]
  return order.map((category) => ({
    category,
    label: labels[category],
    items: entries.filter((e) => e.category === category),
  })).filter((g) => g.items.length > 0)
}
