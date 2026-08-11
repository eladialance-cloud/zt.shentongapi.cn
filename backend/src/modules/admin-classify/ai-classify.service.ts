import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { resolveRelay } from '../admin-model/utils/relay-resolver';
import { EncryptionService } from '../../common/services/encryption.service';
import { normalizeTags } from '../../common/utils/asset-common';
import { AgentEntity } from '../agent/entities/agent.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { McpCatalogEntity } from '../admin-mcp/entities/mcp-catalog.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

/** AI 分类结果：category 命中对应资产类型枚举，tags 最多 5 个 */
export interface ClassifyResult {
  category: string;
  tags: string[];
}

@Injectable()
export class AiClassifyService {
  private readonly logger = new Logger(AiClassifyService.name);

  constructor(
    @InjectRepository(ModelEntity) private modelRepo: Repository<ModelEntity>,
    @InjectRepository(ModelProviderEntity) private providerRepo: Repository<ModelProviderEntity>,
    private encryption: EncryptionService,
    @Optional() @InjectRepository(AgentEntity) private agentRepo?: Repository<AgentEntity>,
    @Optional() @InjectRepository(WorkflowEntity) private workflowRepo?: Repository<WorkflowEntity>,
    @Optional() @InjectRepository(McpCatalogEntity) private mcpRepo?: Repository<McpCatalogEntity>,
    @Optional() @InjectRepository(SkillPackageEntity) private skillRepo?: Repository<SkillPackageEntity>,
    @Optional() @InjectRepository(PluginEntity) private pluginRepo?: Repository<PluginEntity>,
  ) {}

  /** 各资产类型 → 分类枚举（prompt 内约束 JSON 输出；plugin 复用 MCP 9 枚举） */
  private enumFor(assetType: string): string {
    switch (assetType) {
      case 'workflow':
        return 'automation, integration, data_processing, ai_collaboration, independent, other';
      case 'mcp':
      case 'n8n_mcp':
      case 'plugin':
        return 'database, search, browser, git, files, messaging, ai, devops, other';
      default:
        return 'office, programming, copywriting, data_analysis, other';
    }
  }

  /** 统一回退：保留当前分类（非 other）或 other，标签为空 */
  private fallback(current?: string): ClassifyResult {
    return { category: current && current !== 'other' ? current : 'other', tags: [] };
  }

  /** 规范化上游 baseUrl：兼容已带 /v1 与未带路径两种配置 */
  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  }

  /**
   * AI 自动分类：查默认文本模型 + 全局中转，调用 chat/completions 解析 JSON；
   * 无模型/无中转/解析失败/超时/非法枚举一律回退（保留 current 或 other + 空标签）
   */
  async classify(content: string, assetType: string, current?: string): Promise<ClassifyResult> {
    const fb = this.fallback(current);
    try {
      const model = await this.modelRepo.findOne({ where: { isActive: true, modelType: 'chat' }, order: { id: 'ASC' } });
      const relay = await resolveRelay(this.providerRepo);
      if (!model || !relay?.baseUrl || !relay.apiKey) return fb;
      const apiKey = this.encryption.decryptAes(relay.apiKey);
      const url = this.normalizeBaseUrl(relay.baseUrl) + '/v1/chat/completions';
      const prompt = [
        '你是资产分类助手。请根据资产内容判断分类，并生成最多 5 个标签。',
        '分类只能从以下枚举中选一个：' + this.enumFor(assetType) + '。',
        '只输出 JSON：{"category":"<枚举值>","tags":["<标签>"]}',
        '资产内容：' + content.slice(0, 2000),
      ].join('\n');
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: model.upstreamModelId || model.modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return fb;
      const data = (await resp.json()) as { choices?: { message?: { content?: unknown } }[] };
      const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
      const parsed = this.parseJson(text);
      if (!parsed) return fb;
      const category = String(parsed.category ?? '').trim();
      // agents.category 等是 DB enum，非枚举值写回会 500，非法即回退
      if (!this.enumFor(assetType).split(', ').includes(category)) return fb;
      return { category, tags: normalizeTags(parsed.tags).slice(0, 5) };
    } catch (e) {
      this.logger.warn('AI 分类失败，回退默认: ' + (e as Error).message);
      return fb;
    }
  }

  /** 解析 LLM 输出：先整体 JSON.parse，失败再提取首段 JSON 对象（避免贪婪正则误吞尾部 }） */
  private parseJson(text: string): { category?: unknown; tags?: unknown } | null {
    if (text.startsWith('{')) {
      try {
        return JSON.parse(text) as { category?: unknown; tags?: unknown };
      } catch {
        // 继续尝试提取
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as { category?: unknown; tags?: unknown };
    } catch {
      return null;
    }
  }

  /** 分类并写回（reclassify 与 classifyAndUpdate 共用）；AI 回退 other 时不写回，避免覆盖已有分类 */
  private async classifyAndPersist(assetType: string, id: number): Promise<ClassifyResult> {
    const summary = await this.summaryOf(assetType, id);
    const result = await this.classify(summary, assetType);
    if (result.category === 'other') return result;
    await this.writeBack(assetType, id, result);
    return result;
  }

  /** 手动重新分类：读资产摘要 → 分类 → 写回 category/tags；回退 other 时不写回 */
  async reclassify(assetType: string, id: number): Promise<ClassifyResult> {
    return this.classifyAndPersist(assetType, id);
  }

  /** fire-and-forget 自动分类：创建/更新保存后按 id 回填；失败或回退 other 静默（返回 Promise 便于单测） */
  async classifyAndUpdate(assetType: string, id: number): Promise<void> {
    try {
      await this.classifyAndPersist(assetType, id);
    } catch {
      // 静默：自动分类失败不影响主流程
    }
  }

  /** 读取对应表记录摘要（无记录抛 NOT_FOUND） */
  private async summaryOf(assetType: string, id: number): Promise<string> {
    switch (assetType) {
      case 'agent': {
        const r = await this.agentRepo!.findOne({ where: { id } });
        if (!r) BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 资产不存在');
        return String(r.systemPrompt || r.name || '').slice(0, 2000);
      }
      case 'workflow': {
        const r = await this.workflowRepo!.findOne({ where: { id } });
        if (!r) BusinessException.throw(ErrorCode.NOT_FOUND, '工作流不存在');
        return (String(r.description || '') + ' ' + String(r.workflowJson || '')).slice(0, 2000);
      }
      case 'mcp':
      case 'n8n_mcp': {
        const r = await this.mcpRepo!.findOne({ where: { id } });
        if (!r) BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP 资产不存在');
        return String(r.description || r.name || '').slice(0, 2000);
      }
      case 'skill':
      case 'skill_pack': {
        const r = await this.skillRepo!.findOne({ where: { id } });
        if (!r) BusinessException.throw(ErrorCode.NOT_FOUND, '技能包不存在');
        return String(r.description || r.displayName || '').slice(0, 2000);
      }
      case 'plugin': {
        const r = await this.pluginRepo!.findOne({ where: { id } });
        if (!r) BusinessException.throw(ErrorCode.NOT_FOUND, '插件不存在');
        return String(r.description || r.name || '').slice(0, 2000);
      }
      default:
        return BusinessException.throw(ErrorCode.VALIDATION_FAILED, '不支持的资产类型: ' + assetType);
    }
  }

  /** 分类成功后写回 category/tags（skill_packages/plugins 无 tags 列，仅写 category） */
  private async writeBack(assetType: string, id: number, result: ClassifyResult): Promise<void> {
    switch (assetType) {
      case 'agent':
        await this.agentRepo!.update({ id }, { category: result.category as AgentEntity['category'], tags: result.tags });
        break;
      case 'workflow':
        await this.workflowRepo!.update({ id }, { category: result.category as WorkflowEntity['category'], tags: result.tags });
        break;
      case 'mcp':
      case 'n8n_mcp':
        await this.mcpRepo!.update({ id }, { category: result.category, tags: result.tags });
        break;
      case 'skill':
      case 'skill_pack':
        await this.skillRepo!.update({ id }, { category: result.category });
        break;
      case 'plugin':
        await this.pluginRepo!.update({ id }, { category: result.category });
        break;
      default:
        break;
    }
  }
}