import type { ToolRegistry } from "./registry";

/** 能力函数签名：接收工具入参并返回统一执行结果。 */
export type CapabilityFn = (
  input: Record<string, unknown>,
) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

/** 分派上下文。 */
export interface DispatchContext {
  capabilities: Record<string, CapabilityFn>;
  registry?: ToolRegistry;
}

/**
 * 按工具名分派到对应 capability。
 * - registry 提供时，按 name 精确匹配工具并取其 capability 字段；
 * - 未提供 registry（或 name 未命中）时，回退取 name 的首段（如 "mysql.query" → "mysql"）。
 */
export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const capability = resolveCapability(name, ctx.registry);
  const fn = ctx.capabilities[capability];

  if (!fn) {
    return { ok: false, error: `未找到 capability: ${capability}` };
  }

  return fn(input);
}

function resolveCapability(name: string, registry?: ToolRegistry): string {
  if (registry && Array.isArray(registry.tools)) {
    const matched = registry.tools.find((tool) => tool?.name === name);
    if (matched && matched.capability) {
      return matched.capability;
    }
  }
  return name.split(".")[0] || name;
}
