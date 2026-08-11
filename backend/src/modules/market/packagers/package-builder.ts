import { HermesSkillEntity } from '../../hermes/entities/hermes-skill.entity';
import { PluginEntity } from '../../plugin/entities/plugin.entity';
import { WorkflowEntity } from '../../admin-workflow/entities/workflow.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { McpCatalogEntity } from '../../admin-mcp/entities/mcp-catalog.entity';
import { MarketItemType } from '../entities/purchased-item.entity';

/** 市场安装包（单一 JSON 文件，含 meta + payload，payload 由桌面端安装器消费） */
export interface MarketPackage<T = unknown> {
  type: MarketItemType;
  id: number;
  version: string;
  name: string;
  payload: T;
}

/** 递归排序键，得到确定性 JSON（用于 sha256 完整性校验） */
export function sortKeysRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysRecursively);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysRecursively((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** 规范化 JSON 字符串（两端一致的 sha256 校验依据） */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysRecursively(value));
}

export function buildSkillPackage(skill: HermesSkillEntity): MarketPackage {
  return {
    type: 'skill',
    id: Number(skill.id),
    version: skill.version || '1.0.0',
    name: skill.name,
    payload: {
      skill: {
        id: Number(skill.id),
        name: skill.name,
        description: skill.description || '',
        author: skill.author || '',
        pricePerMinute: skill.pricePerMinute || 0,
        version: skill.version || '1.0.0',
        category: skill.category || null,
        tags: skill.tags || [],
        execConfig: skill.execConfig || null,
        icon: skill.icon || null,
      },
    },
  };
}

export function buildPluginPackage(plugin: PluginEntity): MarketPackage {
  return {
    type: 'plugin',
    id: Number(plugin.id),
    version: plugin.version || '1.0.0',
    name: plugin.name,
    payload: {
      plugin: {
        id: Number(plugin.id),
        name: plugin.name,
        description: plugin.description || '',
        version: plugin.version || '1.0.0',
        mcpServerUrl: plugin.mcpServerUrl || null,
        config: plugin.config || {},
      },
    },
  };
}

export function buildWorkflowPackage(workflow: WorkflowEntity): MarketPackage {
  let parsed: unknown = null;
  if (workflow.workflowJson) {
    try {
      parsed = JSON.parse(workflow.workflowJson);
    } catch {
      parsed = workflow.workflowJson;
    }
  }
  return {
    type: 'workflow',
    id: Number(workflow.id),
    version: workflow.version || '1.0.0',
    name: workflow.name,
    payload: {
      workflow: {
        id: Number(workflow.id),
        name: workflow.name,
        description: workflow.description || '',
        engineType: workflow.engineType || 'n8n',
        category: workflow.category || 'other',
        version: workflow.version || '1.0.0',
        workflowJson: parsed,
        inputSchema: workflow.inputSchema || null,
        outputSchema: workflow.outputSchema || null,
        tags: workflow.tags || [],
        icon: workflow.icon || null,
      },
    },
  };
}

export function buildAgentPackage(agent: AgentEntity): MarketPackage {
  return {
    type: 'agent',
    id: Number(agent.id),
    version: String(agent.version ?? 1),
    name: agent.displayName || agent.name,
    payload: {
      agent: {
        id: Number(agent.id),
        name: agent.name,
        displayName: agent.displayName || agent.name,
        description: agent.description || '',
        avatar: agent.avatar || null,
        systemPrompt: agent.systemPrompt,
        usageExample: agent.usageExample || '',
        modelId: agent.modelId,
        pricePerCall: agent.pricePerCall || 0,
        category: agent.category || 'other',
        tags: agent.tags || [],
        allowedPluginIds: agent.allowedPluginIds || [],
        allowedWorkflowIds: agent.allowedWorkflowIds || [],
        allowedKnowledgeBaseIds: agent.allowedKnowledgeBaseIds || [],
        runtimeType: agent.runtimeType || 'openclaw',
        pricingStrategy: agent.pricingStrategy || 'model',
        modelConfig: agent.modelConfig || null,
        outputRule: agent.outputRule || '',
      },
    },
  };
}
export function buildMcpPackage(c: McpCatalogEntity): MarketPackage {
  return {
    type: 'mcp',
    id: Number(c.id),
    version: c.version || '1.0.0',
    name: c.name,
    payload: {
      mcp: {
        id: Number(c.id),
        name: c.name,
        description: c.description || '',
        category: c.category || null,
        tags: c.tags || [],
        icon: c.icon || null,
        homepage: c.homepage || '',
        sourceUrl: c.sourceUrl || '',
        license: c.license || '',
        runtime: c.runtime,
        securityLevel: c.securityLevel,
        transportType: c.transportType,
        command: c.command || '',
        args: c.args || [],
        envTemplate: c.envTemplate || [],
        url: c.url || '',
        headers: c.headers || null,
        version: c.version || '1.0.0',
      },
    },
  };
}
