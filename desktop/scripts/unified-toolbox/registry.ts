import { load } from "js-yaml";

/** 单个工具定义 */
export interface ToolDef {
  name: string;
  capability: string;
  params: string[];
  description?: string;
}

/** 工具注册表 */
export interface ToolRegistry {
  tools: ToolDef[];
}

/**
 * 解析 YAML 文本为工具注册表。
 * 健壮处理缺字段：YAML 非法、非对象、tools 非数组等场景返回空注册表；
 * 单条工具缺少 name/capability/params 时以空值兜底，交由 validateRegistry 报错。
 */
export function loadToolRegistry(yamlText: string): ToolRegistry {
  let parsed: unknown;
  try {
    parsed = load(yamlText);
  } catch {
    return { tools: [] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { tools: [] };
  }

  const rawTools = (parsed as Record<string, unknown>).tools;
  if (!Array.isArray(rawTools)) {
    return { tools: [] };
  }

  const tools: ToolDef[] = [];
  for (const item of rawTools) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    const capability = typeof rec.capability === "string" ? rec.capability : "";
    const params = Array.isArray(rec.params)
      ? rec.params.filter((p): p is string => typeof p === "string")
      : [];
    const description = typeof rec.description === "string" ? rec.description : undefined;
    tools.push({ name, capability, params, description });
  }

  return { tools };
}

/** 校验工具注册表：工具缺 name 或缺失 capability 报错，params 非数组同样报错。 */
export function validateRegistry(r: ToolRegistry): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const tools = Array.isArray(r.tools) ? r.tools : [];

  tools.forEach((tool, index) => {
    if (!tool.name) {
      errors.push(`tools[${index}].name 缺失`);
    }
    if (!tool.capability) {
      errors.push(`tools[${index}].capability 缺失`);
    }
    if (!Array.isArray(tool.params)) {
      errors.push(`tools[${index}].params 缺失`);
    }
  });

  return { ok: errors.length === 0, errors };
}
