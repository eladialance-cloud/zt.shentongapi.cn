import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BriefEntity, DispatchTaskItem } from '../entities/brief.entity';
import { TeamTaskEntity } from '../../team/entities/team-task.entity';
import { TeamMemberEntity } from '../../team/entities/team-member.entity';
import { ModelEntity } from '../../model/entities/model.entity';
import { ModelProviderEntity } from '../../admin-model/entities/model-provider.entity';
import { resolveRelay } from '../../admin-model/utils/relay-resolver';
import { EncryptionService } from '../../../common/services/encryption.service';

/** 可用角色标题 → 成员 ID（confirm 从 TeamMemberRepository 查询后传入） */
export interface MemberRoleTitle {
  roleTitle: string;
  memberId: number;
}

/** AI 拆解 + 派发结果 */
export interface DispatchResult {
  ok: boolean;
  tasks?: DispatchTaskItem[];
  error?: string;
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

/**
 * 需求单任务拆解派发服务（一人公司：AI 拆解 → 派发 team_tasks）
 * - LLM 调用复用管理后台全局中转 + 默认 chat 模型（思路同 AiClassifyService.classify）
 * - 清洗：priority 白名单（非法回 medium）/ roleTitle 白名单（不在列表跳过）/
 *         taskTitle 非空 / 最多保留 20 条
 * - 派发：逐条创建 TeamTaskEntity，并写回 brief.dispatchStatus / dispatchResult
 */
@Injectable()
export class BriefDispatchService {
  private readonly logger = new Logger(BriefDispatchService.name);

  constructor(
    @InjectRepository(BriefEntity) private readonly briefRepo: Repository<BriefEntity>,
    @InjectRepository(TeamTaskEntity) private readonly teamTaskRepo: Repository<TeamTaskEntity>,
    @InjectRepository(TeamMemberEntity) private readonly memberRepo: Repository<TeamMemberEntity>,
    @InjectRepository(ModelEntity) private readonly modelRepo: Repository<ModelEntity>,
    @InjectRepository(ModelProviderEntity) private readonly providerRepo: Repository<ModelProviderEntity>,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * AI 拆解需求单并派发团队任务
   * @param brief 需求单（confirm 已置 dispatchStatus=pending 后调用）
   * @param memberRoleTitles 可用角色列表；空列表时 roleTitle 白名单为空，
   *                         所有条目被跳过 → 返回 failed（NO_VALID_TASKS）
   */
  async dispatch(
    brief: BriefEntity,
    memberRoleTitles: MemberRoleTitle[] = [],
  ): Promise<DispatchResult> {
    try {
      const model = await this.modelRepo.findOne({
        where: { isActive: true, modelType: 'chat' },
        order: { id: 'ASC' },
      });
      const relay = await resolveRelay(this.providerRepo);
      // 无默认模型或全局中转 → 直接返回失败（不抛异常）
      if (!model || !relay?.baseUrl || !relay.apiKey) {
        return { ok: false, error: 'NO_MODEL_OR_RELAY' };
      }
      const apiKey = this.encryption.decryptAes(relay.apiKey);
      const url = this.normalizeBaseUrl(relay.baseUrl) + '/v1/chat/completions';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: model.upstreamModelId || model.modelId,
          messages: [{ role: 'user', content: this.buildPrompt(brief, memberRoleTitles) }],
          max_tokens: 1200,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) return { ok: false, error: 'LLM_REQUEST_FAILED' };
      const data = (await resp.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
      const parsed = this.parseJsonArray(text);
      if (!parsed) return { ok: false, error: 'PARSE_JSON_FAILED' };
      const cleaned = this.cleanTasks(parsed, memberRoleTitles);
      if (cleaned.length === 0) return { ok: false, error: 'NO_VALID_TASKS' };
      const persisted = await this.persistTasks(brief, cleaned, memberRoleTitles);
      if (!persisted) return { ok: false, error: 'NO_TEAM_FOR_DISPATCH' };
      brief.dispatchStatus = 'done';
      brief.dispatchResult = cleaned;
      await this.briefRepo.save(brief);
      return { ok: true, tasks: cleaned };
    } catch (e) {
      // fetch 抛错 / 超时 / 解析异常等：回写 failed，避免 brief 卡在 pending
      this.logger.warn('需求单 AI 拆解失败: ' + (e as Error).message);
      if (brief.dispatchStatus === 'pending') {
        brief.dispatchStatus = 'failed';
        await this.briefRepo.save(brief);
      }
      return { ok: false, error: (e as Error).message };
    }
  }

  /** 规范化上游 baseUrl：兼容已带 /v1 与未带路径两种配置 */
  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  }

  /** 解析 LLM 输出：先整体 JSON.parse，失败再提取首段 JSON 数组（思路同 AiClassifyService.parseJson） */
  private parseJsonArray(text: string): Array<Record<string, unknown>> | null {
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
      } catch {
        // 继续尝试提取
      }
    }
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      const parsed = JSON.parse(m[0]) as unknown;
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : null;
    } catch {
      return null;
    }
  }

  /** 清洗：priority 白名单 / roleTitle 白名单 / taskTitle 非空 / 最多 20 条 */
  private cleanTasks(
    items: Array<Record<string, unknown>>,
    memberRoleTitles: MemberRoleTitle[],
  ): DispatchTaskItem[] {
    const roleMap = new Map(memberRoleTitles.map((r) => [r.roleTitle, r]));
    const cleaned: DispatchTaskItem[] = [];
    for (const item of items) {
      if (cleaned.length >= 20) break;
      const roleTitle = String(item.roleTitle ?? '').trim();
      const taskTitle = String(item.taskTitle ?? '').trim();
      if (!roleMap.has(roleTitle)) {
        this.logger.warn('拆解任务角色不在可用列表，跳过: ' + (roleTitle || '(空)'));
        continue;
      }
      if (!taskTitle) continue;
      const rawPriority = String(item.priority ?? '').trim();
      const priority = (PRIORITIES as readonly string[]).includes(rawPriority)
        ? (rawPriority as DispatchTaskItem['priority'])
        : 'medium';
      cleaned.push({
        roleTitle,
        taskTitle,
        description:
          item.description === undefined || item.description === null
            ? undefined
            : String(item.description),
        priority,
        dueDate: String(item.dueDate ?? '').trim() || undefined,
        dependsOn: Array.isArray(item.dependsOn)
          ? item.dependsOn.map((d) => String(d))
          : undefined,
      });
    }
    return cleaned;
  }

  /** 逐条创建 TeamTaskEntity（team_id 取首个命中角色的成员归属团队；写回由调用方负责） */
  private async persistTasks(
    brief: BriefEntity,
    items: DispatchTaskItem[],
    memberRoleTitles: MemberRoleTitle[],
  ): Promise<boolean> {
    const roleMap = new Map(memberRoleTitles.map((r) => [r.roleTitle, r]));
    let teamId: number | undefined;
    for (const item of items) {
      const entry = roleMap.get(item.roleTitle);
      if (!entry?.memberId) continue;
      const member = await this.memberRepo.findOne({ where: { id: entry.memberId } });
      if (member?.teamId) {
        teamId = member.teamId;
        break;
      }
    }
    if (!teamId) return false;
    // 批次执行引用：每次 dispatch 生成一个批次标识，回填到该批次全部任务
    const executionRef = 'brief-' + brief.id + '-' + Date.now().toString(36);
    const entities = items.map((item) => {
      const entry = roleMap.get(item.roleTitle);
      return this.teamTaskRepo.create({
        teamId,
        title: item.taskTitle,
        description: item.description ?? undefined,
        status: 'pending',
        assigneeMemberId: entry?.memberId ?? undefined,
        creatorId: brief.userId,
        priority: item.priority,
        dueDate: item.dueDate ? this.parseDueDate(item.dueDate) : undefined,
        briefId: brief.id,
        executionRef,
      });
    });
    await this.teamTaskRepo.save(entities);
    return true;
  }

  /** YYYY-MM-DD → Date；解析失败返回 undefined */
  private parseDueDate(value: string): Date | undefined {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  /** 组装拆解 prompt：brief 信息 + 可用角色列表 + JSON 数组约束 */
  private buildPrompt(brief: BriefEntity, memberRoleTitles: MemberRoleTitle[]): string {
    const roleList =
      memberRoleTitles.length > 0
        ? memberRoleTitles.map((r) => r.roleTitle).join('、')
        : '（未提供，请按常见一人公司职能拆分）';
    const deadline = brief.deadline ? this.formatDate(brief.deadline) : '';
    return [
      '你是「一人公司任务拆解助手」，负责把需求单拆解为可执行的团队任务。',
      '需求单信息：',
      `- 标题：${brief.title || ''}`,
      `- 目标：${brief.goal || ''}`,
      `- 目标受众：${brief.targetAudience || ''}`,
      `- 平台：${(brief.platforms ?? []).join('、')}`,
      `- 风格：${brief.style || ''}`,
      `- 截止时间：${deadline || '未指定'}`,
      `可用角色列表：${roleList}`,
      '要求：',
      '1. 严格输出 JSON 数组，不要输出任何其他文字、解释或代码块标记。',
      '2. 数组元素字段：roleTitle、taskTitle、description、priority、dueDate、dependsOn。',
      '3. priority 只能是 low/medium/high/urgent 之一。',
      '4. roleTitle 必须从可用角色列表中选择。',
      '5. dueDate 使用 YYYY-MM-DD 格式（依据需求单截止时间，无则留空字符串）。',
      '6. 最多输出 20 条任务。',
      '7. 只输出 JSON。',
    ].join('\n');
  }

  /** Date → YYYY-MM-DD */
  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
}
