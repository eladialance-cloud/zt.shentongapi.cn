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

/** 解析/清洗失败重试时附加的严格提示 */
const RETRY_HINT =
  '\n\n注意：上一次输出未能解析为合法 JSON 数组。请只输出 JSON 数组本身，不要任何解释、前缀、后缀或 Markdown 代码块标记。';

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
    teamIdOverride?: number,
    executeMode: 'team' | 'auto' | 'agent' = 'team',
    agentId?: number,
  ): Promise<DispatchResult> {
    const isTeamMode = executeMode === 'team';
    try {
      const model = await this.modelRepo.findOne({
        where: { isActive: true, modelType: 'chat' },
        order: { id: 'ASC' },
      });
      const relay = await resolveRelay(this.providerRepo);
      // 无默认模型或全局中转 → 直接返回失败（不抛异常）
      if (!model || !relay?.baseUrl || !relay.apiKey) {
        return this.fail(brief, 'NO_MODEL_OR_RELAY');
      }
      const apiKey = this.encryption.decryptAes(relay.apiKey);
      const url = this.normalizeBaseUrl(relay.baseUrl) + '/v1/chat/completions';
      const modelName = model.upstreamModelId || model.modelId;
      const basePrompt = this.buildPrompt(brief, isTeamMode ? memberRoleTitles : []);
      // 解析/清洗失败自动重试一次（AI 输出格式偶发不稳定，重试用更严格的提示词）
      let lastError = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const content = attempt === 0 ? basePrompt : basePrompt + RETRY_HINT;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content }],
            max_tokens: 4000,
            temperature: 0,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) {
          lastError = 'LLM_REQUEST_FAILED';
          continue;
        }
        const data = (await resp.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
        const parsed = this.parseJsonArray(text);
        if (!parsed) {
          lastError = 'PARSE_JSON_FAILED';
          continue;
        }
        const cleaned = this.cleanTasks(parsed, isTeamMode ? memberRoleTitles : [], !isTeamMode);
        if (cleaned.length === 0) {
          lastError = 'NO_VALID_TASKS';
          continue;
        }
        const persisted = await this.persistTasks(brief, cleaned, isTeamMode ? memberRoleTitles : [], teamIdOverride, executeMode, agentId);
        if (!persisted) return this.fail(brief, 'NO_TEAM_FOR_DISPATCH');
        brief.dispatchStatus = 'done';
        brief.dispatchResult = cleaned;
        brief.dispatchError = null;
        await this.briefRepo.save(brief);
        return { ok: true, tasks: cleaned };
      }
      return this.fail(brief, lastError || 'PARSE_JSON_FAILED');
    } catch (e) {
      // fetch 抛错 / 超时 / 解析异常等：回写 failed，避免 brief 卡在 pending
      const message = (e as Error).message;
      this.logger.warn('需求单 AI 拆解失败: ' + message);
      if (brief.dispatchStatus === 'pending') {
        brief.dispatchStatus = 'failed';
        brief.dispatchError = message;
        await this.briefRepo.save(brief);
      }
      return { ok: false, error: message };
    }
  }

  /** 记录失败原因并返回错误结果（由 confirm 异步回写，避免与成功写回竞争） */
  private fail(brief: BriefEntity, code: string): DispatchResult {
    brief.dispatchStatus = 'failed';
    brief.dispatchError = code;
    brief.dispatchResult = null;
    this.logger.warn('需求单 AI 拆解失败: ' + code);
    return { ok: false, error: code };
  }

  /** 规范化上游 baseUrl：兼容已带 /v1 与未带路径两种配置 */
  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  }

  /** 解析 LLM 输出：剥代码块 → 整体解析 → 平衡括号提取首个数组 → 兜底贪婪匹配（思路同 AiClassifyService.parseJson） */
  private parseJsonArray(text: string): Array<Record<string, unknown>> | null {
    let t = text.trim();
    // 去掉 ```json ... ``` 代码块标记（保留内部内容）
    t = t.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
    // 1) 整体解析
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
      } catch {
        // 继续尝试提取
      }
    }
    // 2) 平衡括号提取第一个数组块（跳过字符串字面量，兼容截断/尾随文字）
    const start = t.indexOf('[');
    if (start >= 0) {
      const block = this.extractBalanced(t, start, '[', ']');
      if (block != null) {
        try {
          const parsed = JSON.parse(block) as unknown;
          if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
        } catch {
          // 继续尝试兜底
        }
      }
    }
    // 3) 兜底：整段贪婪匹配首个 [ 到最后一个 ]
    const m = t.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      const parsed = JSON.parse(m[0]) as unknown;
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : null;
    } catch {
      return null;
    }
  }

  /** 从 start 处提取配对括号块（跳过字符串字面量；找不齐返回 null） */
  private extractBalanced(text: string, start: number, open: string, close: string): string | null {
    let depth = 0;
    let inStr = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }
  /** 清洗：priority 白名单 / roleTitle 白名单 / taskTitle 非空 / 最多 20 条 */
  private cleanTasks(
    items: Array<Record<string, unknown>>,
    memberRoleTitles: MemberRoleTitle[],
    skipRoleFilter = false,
  ): DispatchTaskItem[] {
    const roleMap = new Map(memberRoleTitles.map((r) => [r.roleTitle, r]));
    const cleaned: DispatchTaskItem[] = [];
    for (const item of items) {
      if (cleaned.length >= 20) break;
      const roleTitle = String(item.roleTitle ?? '').trim();
      const taskTitle = String(item.taskTitle ?? '').trim();
      if (!skipRoleFilter && !roleMap.has(roleTitle)) {
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

  /** 逐条创建 TeamTaskEntity；team 模式取首个命中角色成员的归属团队，auto/agent 模式 team_id 为空 */
  private async persistTasks(
    brief: BriefEntity,
    items: DispatchTaskItem[],
    memberRoleTitles: MemberRoleTitle[],
    teamIdOverride?: number,
    executeMode: 'team' | 'auto' | 'agent' = 'team',
    agentId?: number,
  ): Promise<boolean> {
    const isTeamMode = executeMode === 'team';
    const roleMap = new Map(memberRoleTitles.map((r) => [r.roleTitle, r]));
    let teamId: number | undefined = teamIdOverride;
    if (isTeamMode) {
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
    }
    // 批次执行引用：每次 dispatch 生成一个批次标识，回填到该批次全部任务
    const executionRef = 'brief-' + brief.id + '-' + Date.now().toString(36);
    const entities = items.map((item) => {
      const entry = roleMap.get(item.roleTitle);
      return this.teamTaskRepo.create({
        teamId: isTeamMode ? teamId : undefined,
        title: item.taskTitle,
        description: item.description ?? undefined,
        status: 'pending',
        assigneeMemberId: isTeamMode ? (entry?.memberId ?? undefined) : undefined,
        creatorId: brief.userId,
        priority: item.priority,
        dueDate: item.dueDate ? this.parseDueDate(item.dueDate) : undefined,
        briefId: brief.id,
        executionRef,
        executeMode,
        ...(executeMode === 'agent' ? { agentId } : {}),
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